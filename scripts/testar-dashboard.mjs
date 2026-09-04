#!/usr/bin/env node
// Testes do dashboard sem navegador: o HTML é executado num DOM de mentira e a
// página é conferida pelo que ela escreve na tela.
//
// Existe porque o dashboard mostrava "R$ 703" onde a planilha dizia R$ 702,75, e
// mostrava 12 lançamentos sem dizer que outros 11 eram de outra competência —
// dois enganos que nenhum teste dos code nodes pegaria.
//
//   scripts/testar-dashboard.mjs
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(RAIZ, "dashboard", "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

let falhas = 0;
const teste = (nome, fn) => {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${e.message}`); }
};
const contem = (texto, trecho, onde) => {
  if (!String(texto).includes(trecho)) throw new Error(`${onde}: não achei "${trecho}"`);
};

// ── um DOM só com o que a página usa ────────────────────────────────────────
function elemento(id = "") {
  return {
    id, innerHTML: "", textContent: "", value: "", hidden: false, dataset: {}, checked: false,
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {}, setAttribute() {}, removeAttribute() {},
    querySelectorAll: () => [], querySelector: () => elemento(), closest: () => elemento(),
    style: {},
  };
}

function rodar(lancamentosCsv, cartoesCsv, competencia) {
  const els = {};
  const pega = (id) => (els[id] ||= elemento(id));
  const ctx = createContext({
    document: {
      getElementById: pega,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async (url) => ({
      ok: true,
      text: async () => (String(url).includes("gid=0") ? lancamentosCsv : cartoesCsv),
    }),
    console: { log() {}, error() {} },
    setTimeout, clearTimeout, Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  });
  runInContext(js, ctx);
  return new Promise((resolve) => setTimeout(() => {
    if (competencia) { pega("mes").value = competencia; ctx.render(); }
    resolve({ kpis: pega("kpis").innerHTML, secoes: pega("secoes").innerHTML,
              rodape: pega("rodape").textContent, status: pega("status").innerHTML });
  }, 30));
}

// ── os dados: os mesmos formatos que o Google Sheets publica ────────────────
const CAB = "update_id,data,competencia,competencia_fatura,criado_em,tipo,valor,"
          + "categoria,forma,descricao,pessoa,fixo,mensagem,confianca";
// o Google põe entre aspas todo campo que tem vírgula — inclusive o valor de
// uma planilha em pt-BR, que sai como "32,42"
const campo = (v) => (String(v).includes(",") ? `"${v}"` : String(v));
const linha = (data, comp, fatura, valor, cat, desc) =>
  [1, data, comp, fatura, `${data}T12:00:00Z`, "saida", campo(valor), cat,
   "Nubank Vini", desc, "Vini", "", "msg", 1].join(",");

// valor com vírgula é como o Sheets publica número em planilha pt-BR; com ponto
// é como ele publica quando a célula é texto. Os dois aparecem na mesma planilha.
const CSV = [CAB,
  linha("2026-09-03", "2026-09", "2026-10", "180",     "Outros",      "Armarinho"),
  linha("2026-09-03", "2026-09", "2026-10", "32,42",   "Alimentação", "Padaria"),
  linha("2026-09-02", "2026-09", "2026-10", "31.93",   "Farmácia",    "Drogaria"),
  linha("2026-08-29", "2026-08", "2026-10", "222,15",  "Combustível", "Posto"),
  linha("2026-08-27", "2026-08", "2026-10", "1.234,56","Outros",      "Casas Bahia"),
].join("\n");
const CARTOES = "nome,dia_fechamento,dia_vencimento,dono\nNubank Vini,26,3,Vini";

console.log("Dashboard");
const set = await rodar(CSV, CARTOES, "2026-09");
const ago = await rodar(CSV, CARTOES, "2026-08");

teste("as saídas do mês saem com centavos, não arredondadas", () => {
  contem(set.kpis, "244,35", "KPI de saídas");        // 180 + 32,42 + 31,93
  if (/R\$&nbsp;244<|R\$ 244</.test(set.kpis)) throw new Error("arredondou o KPI");
});
teste("valor com ponto e valor com vírgula somam igual", () => {
  contem(ago.kpis, "1.456,71", "KPI de saídas");      // 222,15 + 1.234,56
});
teste("a tabela conta só o mês escolhido", () => {
  contem(set.secoes, "3 lançamento(s)", "tabela");
});
teste("e avisa quantos ficaram em outra competência", () => {
  contem(set.secoes, "2 em ago/26", "tabela");
  contem(ago.secoes, "3 em set/26", "tabela");
});
teste("mês sem sobra não ganha aviso nenhum", () => {
  const so = [CAB, linha("2026-09-03", "2026-09", "2026-10", "10", "Outros", "X")].join("\n");
  return rodar(so, CARTOES, "2026-09").then(({ secoes }) => {
    if (/em (set|ago|out)\/\d\d/.test(secoes.split("Lançamentos do mês")[1] || ""))
      throw new Error("avisou sobra que não existe");
  });
});
teste("fatura vazia aponta o dinheiro que está na fatura seguinte", () => {
  contem(set.secoes, "já lançado para out/26", "cartões");
  contem(set.secoes, "1.701,06", "cartões");          // tudo cai em out/26
});
teste("o rodapé conta a planilha inteira", () => {
  contem(set.rodape, "5 lançamentos", "rodapé");
});

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo passou");
process.exit(falhas ? 1 : 0);
