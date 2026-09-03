// Roda o pipeline do workflow fora do n8n.
//
// Lê n8n/gastos-ingestao.n8n.json e executa os code nodes de verdade num
// sandbox, com as abas Cartoes e GastosFixos vindas dos CSVs modelo. O que os
// testes exercitam é o mesmo código que o n8n vai executar.
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const wf = JSON.parse(readFileSync(join(RAIZ, "n8n", "gastos-ingestao.n8n.json"), "utf8"));
const wfApagar = JSON.parse(readFileSync(join(RAIZ, "n8n", "apagar-lancamentos.n8n.json"), "utf8"));
export const nodeDo = (nome) => wf.nodes.find((x) => x.name === nome);
const jsDo = (nome) => nodeDo(nome).parameters.jsCode;
const jsApagar = (nome) => wfApagar.nodes.find((x) => x.name === nome).parameters.jsCode;

export const URL_GEMINI = nodeDo("Gemini").parameters.url;
export const MODELO = (URL_GEMINI.match(/models\/([^:]+):/) || [, "?"])[1];

const TRIAGEM = jsDo("Triagem");
export const CHAT_ID = Number(TRIAGEM.match(/const CHAT_ID\s*=\s*(-?\d+)/)[1]);
export const FROM_ID = Number(TRIAGEM.match(/MEMBROS\s*=\s*\{\s*(\d+)/)[1]);

// ── as abas de configuração, lidas dos CSVs modelo ──────────────────────────
function lerCsv(arquivo) {
  const linhas = readFileSync(join(RAIZ, "planilha", arquivo), "utf8").trim().split("\n");
  const cab = linhas[0].split(",");
  return linhas.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [cab[i], v])));
}
export const CARTOES = lerCsv("cartoes-modelo.csv");
export const FIXOS = lerCsv("gastos-fixos-modelo.csv");

// ── executor de code node ───────────────────────────────────────────────────
export function fabricarRunner() {
  const estatico = {};
  return function rodar(nome, entrada, anteriores = {}) {
    const lista = Array.isArray(entrada) ? entrada : [entrada];
    const itens = (v) => ({
      first: () => ({ json: Array.isArray(v) ? v[0] : v }),
      all: () => (Array.isArray(v) ? v : [v]).map((j) => ({ json: j })),
    });
    const ctx = createContext({
      $input: itens(lista),
      $getWorkflowStaticData: () => estatico,
      $: (n) => itens(anteriores[n]),
      console,
    });
    const s = runInContext(`(function(){\n${jsDo(nome)}\n})()`, ctx, { timeout: 5000 });
    return Array.isArray(s) ? s.map((i) => i.json) : [];
  };
}

export const update = (texto, over = {}) => ({
  update_id: over.update_id ?? Math.floor(Math.random() * 1e6),
  message: {
    message_id: over.message_id ?? 1,
    chat: { id: over.chat_id ?? CHAT_ID, type: "supergroup", title: "Casa" },
    from: { id: over.from_id ?? FROM_ID, first_name: "Vini" },
    text: texto,
  },
});

// ── runner do workflow de exclusão ─────────────────────────────────────────
// Mesma ideia do de cima, com duas diferenças: os code nodes leem $env, e a
// entrada do primeiro nó é uma requisição HTTP, não um update do Telegram.
export function fabricarRunnerApagar(env = {}) {
  return function rodar(nome, entrada, anteriores = {}) {
    const itens = (v) => ({
      first: () => ({ json: Array.isArray(v) ? v[0] : v }),
      all: () => (Array.isArray(v) ? v : [v]).map((j) => ({ json: j })),
    });
    const ctx = createContext({
      $input: itens(Array.isArray(entrada) ? entrada : [entrada]),
      $: (n) => {
        if (!(n in anteriores)) throw new Error(`nó "${n}" não executou`);
        return itens(anteriores[n]);
      },
      $env: env,
      console,
    });
    const s = runInContext(`(function(){\n${jsApagar(nome)}\n})()`, ctx, { timeout: 5000 });
    return Array.isArray(s) ? s.map((i) => i.json) : [];
  };
}

// requisição como o nó Webhook entrega: cabeçalhos em minúsculas e corpo já lido
export const pedidoHttp = (chaves, token) => ({
  headers: token === undefined ? {} : { "x-dashboard-token": token },
  body: { chaves },
});

export const respostaGemini = (lancamentos) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ lancamentos }) }] } }],
});

// ── o pipeline inteiro, de update do Telegram a linhas da planilha ──────────
// chamarGemini(payload) -> resposta bruta da API. Injetado para que os testes
// offline usem uma resposta fabricada e a suíte use o modelo de verdade.
export async function processar(texto, chamarGemini, over = {}) {
  const rodar = fabricarRunner();
  const triado = rodar("Triagem", update(texto, over))[0];
  if (!triado) return { descartadoNaTriagem: true, linhas: [] };

  const anteriores = { Triagem: triado, "Ler cartões": CARTOES, "Ler gastos fixos": FIXOS };
  const ctx = rodar("Montar prompt", triado, anteriores)[0];

  const resp = await chamarGemini(ctx.payload);
  let cru = null;
  try { cru = JSON.parse(resp.candidates[0].content.parts[0].text); } catch { /* Validar trata */ }

  const linhas = rodar("Validar", resp, { "Montar prompt": ctx });
  const resumo = linhas.length ? rodar("Resumo da resposta", linhas, { "Montar prompt": ctx })[0] : null;
  return { ctx, cru, linhas, resumo, hoje: triado.hoje };
}
