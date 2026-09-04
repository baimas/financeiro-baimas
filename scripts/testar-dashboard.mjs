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
// toLocaleString põe espaço não separável depois do "R$": comparar com espaço
// comum falharia por um caractere invisível
const semNbsp = (t) => String(t).replace(/\u00a0/g, " ");
const contem = (texto, trecho, onde) => {
  if (!semNbsp(texto).includes(semNbsp(trecho))) throw new Error(`${onde}: não achei "${trecho}"`);
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
const linha = (data, comp, fatura, valor, cat, desc, forma = "Nubank Vini") =>
  [1, data, comp, fatura, `${data}T12:00:00Z`, "saida", campo(valor), cat,
   forma, desc, "Vini", "", "msg", 1].join(",");

// valor com vírgula é como o Sheets publica número em planilha pt-BR; com ponto
// é como ele publica quando a célula é texto. Os dois aparecem na mesma planilha.
// O cartão fecha dia 26: compra de 27/08 e compra de 03/09 são o MESMO ciclo,
// o de setembro, e por isso têm a mesma competência. O Pix de agosto não tem
// ciclo nenhum e fica em agosto — é essa diferença que a tela precisa refletir.
const CSV = [CAB,
  linha("2026-09-03", "2026-09", "2026-10", "180",     "Outros",      "Armarinho"),
  linha("2026-09-03", "2026-09", "2026-10", "32,42",   "Alimentação", "Padaria"),
  linha("2026-09-02", "2026-09", "2026-10", "31.93",   "Farmácia",    "Drogaria"),
  linha("2026-08-29", "2026-09", "2026-10", "222,15",  "Combustível", "Posto"),
  linha("2026-08-27", "2026-09", "2026-10", "1.234,56","Outros",      "Casas Bahia"),
  linha("2026-08-15", "2026-08", "",        "50",      "Mercado",     "Feira",   "Pix"),
  linha("2026-08-10", "2026-08", "",        "25,50",   "Lanches",     "Padaria", "Dinheiro"),
].join("\n");
const CARTOES = "nome,dia_fechamento,dia_vencimento,dono\nNubank Vini,26,3,Vini";

console.log("Dashboard");
const set = await rodar(CSV, CARTOES, "2026-09");
const ago = await rodar(CSV, CARTOES, "2026-08");

teste("as saídas do mês saem com centavos, não arredondadas", () => {
  contem(set.kpis, "1.701,06", "KPI de saídas");
  if (/R\$&nbsp;1\.701<|R\$ 1\.701</.test(set.kpis)) throw new Error("arredondou o KPI");
});
teste("valor com ponto e valor com vírgula somam igual", () => {
  contem(ago.kpis, "75,50", "KPI de saídas");         // 50 + 25,50, os dois à vista
});
teste("compra de 27/08 no cartão conta no ciclo de setembro", () => {
  contem(set.secoes, "5 lançamento(s)", "tabela");    // 3 de setembro + 2 de agosto
});
teste("Pix de agosto fica em agosto: não há ciclo", () => {
  contem(ago.secoes, "2 lançamento(s)", "tabela");
});
teste("e avisa quantos ficaram em outra competência", () => {
  contem(set.secoes, "2 em ago/26", "tabela");
  contem(ago.secoes, "5 em set/26", "tabela");
});
teste("mês sem sobra não ganha aviso nenhum", () => {
  const so = [CAB, linha("2026-09-03", "2026-09", "2026-10", "10", "Outros", "X")].join("\n");
  return rodar(so, CARTOES, "2026-09").then(({ secoes }) => {
    if (/em (set|ago|out)\/\d\d/.test(secoes.split("Lançamentos do mês")[1] || ""))
      throw new Error("avisou sobra que não existe");
  });
});
teste("o cartão mostra o ciclo, não o que vence no mês", () => {
  // compras de 27/08 em diante e as de setembro são o mesmo ciclo: set/26
  contem(set.secoes, "gasto no ciclo de set/26", "cartões");
  contem(set.secoes, "1.701,06", "cartões");
});
teste("e diz em que dia esta fatura vai ser cobrada", () => {
  contem(set.secoes, "esta fatura vence em 03/10/26", "cartões");
});
teste("o que vence no mês continua visível, sem virar o assunto", () => {
  contem(set.secoes, "R$ 0,00 vence neste mês", "cartões");
});
teste("o orçamento soma o cartão do ciclo, não o do vencimento", () => {
  const orc = set.secoes.split("Orçamento do mês")[1] || "";
  contem(orc, "1.701,06", "orçamento");
});
teste("ciclo sem gasto nenhum diz isso, em vez de somar outro mês", () => {
  const so = [CAB, linha("2026-09-03", "2026-09", "2026-10", "10", "Outros", "X")].join("\n");
  return rodar(so, CARTOES, "2026-10").then(({ secoes }) => {
    contem(secoes, "nada gasto neste ciclo", "cartões");
  });
});
teste("o cartão não engole o gasto à vista", () => {
  const orc = ago.secoes.split("Orçamento do mês")[1] || "";
  contem(orc, "R$ 0,00", "linha de cartões em agosto");   // Pix e dinheiro não são cartão
});
teste("o rodapé conta a planilha inteira", () => {
  contem(set.rodape, "7 lançamentos", "rodapé");
});

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo passou");
process.exit(falhas ? 1 : 0);
