#!/usr/bin/env node
// Testes offline dos code nodes do workflow: sem rede, sem chave, sem n8n.
// Rodam em um segundo e cobrem o que não depende do modelo — autorização,
// idempotência, validação e o encaixe com as colunas da planilha.
//
//   scripts/testar-nos.mjs
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const wf = JSON.parse(readFileSync(join(RAIZ, "n8n", "gastos-ingestao.n8n.json"), "utf8"));
const jsCode = (nome) => wf.nodes.find((x) => x.name === nome).parameters.jsCode;
const TRIAGEM = jsCode("Triagem e prompt");
const VALIDAR = jsCode("Validar");

const CHAT_ID = Number(TRIAGEM.match(/const CHAT_ID\s*=\s*(-?\d+)/)[1]);
const FROM_ID = Number(TRIAGEM.match(/MEMBROS\s*=\s*\{\s*(\d+)/)[1]);

// cada teste começa com memória limpa, senão a idempotência contamina o seguinte
function fabricarRunner() {
  const estatico = {};
  return (codigo, entrada, anteriores = {}) => {
    const itens = (v) => ({ first: () => ({ json: v }), all: () => [{ json: v }] });
    const ctx = createContext({ $input: itens(entrada), $getWorkflowStaticData: () => estatico, $: (n) => itens(anteriores[n]), console });
    const s = runInContext(`(function(){\n${codigo}\n})()`, ctx, { timeout: 5000 });
    return Array.isArray(s) && s.length ? s[0].json : null;
  };
}
const update = (texto, over = {}) => ({
  update_id: over.update_id ?? 1,
  message: {
    message_id: 1,
    chat: { id: over.chat_id ?? CHAT_ID, type: "supergroup", title: "Casa" },
    from: { id: over.from_id ?? FROM_ID, first_name: "Vini" },
    text: texto,
  },
});
const LANCAMENTO = { eh_lancamento: true, tipo: "saida", valor: 85.5, data: "2026-08-28", categoria: "Mercado", descricao: "Assai", confianca: 0.94 };

let falhas = 0;
function teste(nome, fn) {
  try {
    fn();
    console.log(`  ok    ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHA ${nome}\n        ${e.message}`);
  }
}
const igual = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

console.log("Triagem e prompt");
teste("aceita mensagem do grupo e do membro certos", () => {
  const r = fabricarRunner()(TRIAGEM, update("85 no mercado"));
  if (!r) throw new Error("descartou o que devia passar");
  igual(r.pessoa, "Vini", "pessoa");
  if (!r.payload.generationConfig.responseSchema) throw new Error("payload sem responseSchema");
});
teste("descarta chat que não é o da casa", () => {
  igual(fabricarRunner()(TRIAGEM, update("85 no mercado", { chat_id: -1009999999999 })), null, "resultado");
});
teste("descarta quem não é membro", () => {
  igual(fabricarRunner()(TRIAGEM, update("85 no mercado", { from_id: 999 })), null, "resultado");
});
teste("descarta o mesmo update_id duas vezes", () => {
  const r = fabricarRunner();
  if (!r(TRIAGEM, update("85 no mercado"))) throw new Error("a primeira devia passar");
  igual(r(TRIAGEM, update("85 no mercado")), null, "a segunda");
});
teste("descarta mensagem sem dígito antes de gastar LLM", () => {
  igual(fabricarRunner()(TRIAGEM, update("bom dia amor")), null, "resultado");
});
teste("resolve hoje no fuso de São Paulo", () => {
  const r = fabricarRunner()(TRIAGEM, update("85 no mercado"));
  const esperado = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  igual(r.hoje, esperado, "hoje");
});

console.log("\nValidar");
const ctxTriagem = fabricarRunner()(TRIAGEM, update("gastei 85,50 no assai ontem"));
const validar = (obj) => fabricarRunner()(VALIDAR, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }, { "Triagem e prompt": ctxTriagem });

teste("monta a linha da planilha", () => {
  const l = validar(LANCAMENTO);
  igual(l.valor, 85.5, "valor");
  igual(l.competencia, "2026-08", "competencia");
  igual(l.pessoa, "Vini", "pessoa");
});
teste("descarta o que não é lançamento", () => {
  igual(validar({ ...LANCAMENTO, eh_lancamento: false }), null, "resultado");
});
teste("rejeita valor zero ou negativo", () => {
  igual(validar({ ...LANCAMENTO, valor: 0 }), null, "zero");
  igual(validar({ ...LANCAMENTO, valor: -10 }), null, "negativo");
});
teste("força categoria fora da lista para Outros", () => {
  igual(validar({ ...LANCAMENTO, categoria: "Criptomoedas" }).categoria, "Outros", "categoria");
});
teste("cai para hoje quando a data vem malformada", () => {
  igual(validar({ ...LANCAMENTO, data: "ontem" }).data, ctxTriagem.hoje, "data");
});
teste("competência sempre acompanha a data", () => {
  const l = validar({ ...LANCAMENTO, data: "2026-01-15" });
  igual(l.competencia, "2026-01", "competencia");
});
teste("sobrevive a JSON ilegível do modelo", () => {
  const r = fabricarRunner()(VALIDAR, { candidates: [{ content: { parts: [{ text: "isto não é json" }] } }] }, { "Triagem e prompt": ctxTriagem });
  igual(r, null, "resultado");
});

console.log("\nEncaixe com a planilha");
teste("as chaves da linha são exatamente as colunas de planilha/lancamentos-modelo.csv", () => {
  const cabecalho = readFileSync(join(RAIZ, "planilha", "lancamentos-modelo.csv"), "utf8").split("\n")[0].trim().split(",");
  const chaves = Object.keys(validar(LANCAMENTO));
  const faltando = cabecalho.filter((c) => !chaves.includes(c));
  const sobrando = chaves.filter((c) => !cabecalho.includes(c));
  if (faltando.length || sobrando.length)
    throw new Error(`o autoMapInputData vai errar — faltando: [${faltando}] sobrando: [${sobrando}]`);
});
teste("as categorias do prompt cobrem as do exemplo da planilha", () => {
  const cats = JSON.parse("[" + TRIAGEM.match(/CATEGORIAS = \[([\s\S]*?)\]/)[1].replace(/'/g, '"') + "]");
  const linhas = readFileSync(join(RAIZ, "planilha", "lancamentos-modelo.csv"), "utf8").trim().split("\n").slice(1);
  const usadas = [...new Set(linhas.map((l) => l.split(",")[6]))];
  const fora = usadas.filter((c) => !cats.includes(c));
  if (fora.length) throw new Error(`categorias no CSV que o prompt não permite: ${fora}`);
});

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo passou");
process.exit(falhas ? 1 : 0);
