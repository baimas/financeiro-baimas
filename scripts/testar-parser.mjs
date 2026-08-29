#!/usr/bin/env node
// Roda a suíte de mensagens reais contra o parser — sem n8n, sem Telegram, sem VM.
//
// O truque: em vez de reescrever o prompt aqui (que sairia de sincronia na
// primeira mudança), o script LÊ o workflow e EXECUTA os code nodes "Triagem e
// prompt" e "Validar" de verdade, num sandbox. O que este teste aprova é o que
// vai rodar em produção.
//
//   export GEMINI_API_KEY=AIza...
//   scripts/testar-parser.mjs                 roda testes/mensagens.jsonl
//   scripts/testar-parser.mjs --um "85 no mercado"
//   scripts/testar-parser.mjs --verbose       mostra o JSON cru do modelo
//
// Custo: ~32 chamadas curtas no free tier do Gemini. Na prática, zero.
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = join(RAIZ, "n8n", "gastos-ingestao.n8n.json");
const SUITE = join(RAIZ, "testes", "mensagens.jsonl");

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const iUm = args.indexOf("--um");
const umTexto = iUm >= 0 ? args[iUm + 1] : null;

const CHAVE = process.env.GEMINI_API_KEY;
if (!CHAVE) {
  console.error("falta GEMINI_API_KEY. Pegue em https://aistudio.google.com/apikey e:");
  console.error("  export GEMINI_API_KEY=AIza...");
  process.exit(1);
}

// ── o workflow como fonte da verdade ────────────────────────────────────────
const wf = JSON.parse(readFileSync(WORKFLOW, "utf8"));
const no = (nome) => {
  const n = wf.nodes.find((x) => x.name === nome);
  if (!n) throw new Error(`nó "${nome}" não existe no workflow`);
  return n;
};
const codigoTriagem = no("Triagem e prompt").parameters.jsCode;
const codigoValidar = no("Validar").parameters.jsCode;
const urlGemini = no("Gemini").parameters.url;
const modelo = (urlGemini.match(/models\/([^:]+):/) || [, "?"])[1];

// os ids autorizados vivem dentro do code node; o update falso precisa bater com eles
const CHAT_ID = Number((codigoTriagem.match(/const CHAT_ID\s*=\s*(-?\d+)/) || [])[1]);
const FROM_ID = Number((codigoTriagem.match(/MEMBROS\s*=\s*\{\s*(\d+)/) || [])[1]);
if (!CHAT_ID || !FROM_ID) {
  console.error("não consegui ler CHAT_ID/MEMBROS do nó Triagem — o formato mudou?");
  process.exit(1);
}

// ── executa um code node do n8n fora do n8n ─────────────────────────────────
const estatico = {};
function rodarNode(codigo, entrada, nodesAnteriores = {}) {
  const itens = (v) => ({ first: () => ({ json: v }), all: () => [{ json: v }] });
  const ctx = createContext({
    $input: itens(entrada),
    $getWorkflowStaticData: () => estatico,
    $: (nome) => itens(nodesAnteriores[nome]),
    console,
  });
  const saida = runInContext(`(function(){\n${codigo}\n})()`, ctx, { timeout: 5000 });
  return Array.isArray(saida) && saida.length ? saida[0].json : null;
}

// ── Gemini ──────────────────────────────────────────────────────────────────
async function chamarGemini(payload, tentativa = 1) {
  const r = await fetch(urlGemini, {
    method: "POST",
    headers: { "x-goog-api-key": CHAVE, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (r.status === 429 && tentativa <= 4) {
    await new Promise((s) => setTimeout(s, 4000 * tentativa));
    return chamarGemini(payload, tentativa + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ── uma mensagem, do update falso até a linha da planilha ───────────────────
let seqUpdate = 700000;
async function processar(texto) {
  const update = {
    update_id: seqUpdate++,
    message: {
      message_id: 1,
      chat: { id: CHAT_ID, type: "supergroup", title: "Casa" },
      from: { id: FROM_ID, first_name: "Teste" },
      text: texto,
    },
  };
  const triado = rodarNode(codigoTriagem, update);
  if (!triado) return { descartadoNaTriagem: true };

  const resp = await chamarGemini(triado.payload);
  let cru = null;
  try {
    cru = JSON.parse(resp.candidates[0].content.parts[0].text);
  } catch { /* o nó Validar trata isso devolvendo [] */ }

  const linha = rodarNode(codigoValidar, resp, { "Triagem e prompt": triado });
  return { cru, linha, hoje: triado.hoje };
}

// ── datas relativas ─────────────────────────────────────────────────────────
function resolverData(marcador, hoje) {
  const d = new Date(hoje + "T12:00:00Z");
  if (marcador === "HOJE") return hoje;
  if (marcador === "ONTEM") { d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
  if (marcador === "SEXTA_PASSADA") {
    do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() !== 5);
    return d.toISOString().slice(0, 10);
  }
  return marcador;
}

function conferir(esperado, r) {
  const falhas = [];
  const houve = !!r.linha;
  if (esperado.eh_lancamento === false) {
    if (houve) falhas.push(`devia ser descartada, virou ${r.linha.tipo} de ${r.linha.valor}`);
    return falhas;
  }
  if (!houve) {
    falhas.push(r.descartadoNaTriagem ? "descartada na triagem (sem dígito?)" : "modelo disse que não é lançamento");
    return falhas;
  }
  if (esperado.tipo && r.linha.tipo !== esperado.tipo) falhas.push(`tipo ${r.linha.tipo} ≠ ${esperado.tipo}`);
  if (esperado.valor != null && Math.abs(r.linha.valor - esperado.valor) > 0.005) falhas.push(`valor ${r.linha.valor} ≠ ${esperado.valor}`);
  if (esperado.categoria && r.linha.categoria !== esperado.categoria) falhas.push(`categoria ${r.linha.categoria} ≠ ${esperado.categoria}`);
  if (esperado.data) {
    const alvo = resolverData(esperado.data, r.hoje);
    if (r.linha.data !== alvo) falhas.push(`data ${r.linha.data} ≠ ${alvo}`);
  }
  if (r.linha.competencia !== r.linha.data.slice(0, 7)) falhas.push("competência não bate com a data");
  return falhas;
}

// ── execução ────────────────────────────────────────────────────────────────
const casos = umTexto
  ? [{ texto: umTexto, esperado: {} }]
  : readFileSync(SUITE, "utf8").trim().split("\n").map((l) => JSON.parse(l));

console.log(`modelo ${modelo} · ${casos.length} mensagem(ns)\n`);

const LIMITE = 3; // free tier tem RPM curto
const resultados = new Array(casos.length);
let cursor = 0;
async function trabalhador() {
  while (cursor < casos.length) {
    const i = cursor++;
    const c = casos[i];
    try {
      const r = await processar(c.texto);
      resultados[i] = { c, r, falhas: umTexto ? [] : conferir(c.esperado, r) };
    } catch (e) {
      resultados[i] = { c, r: null, falhas: [`erro: ${e.message}`] };
    }
  }
}
await Promise.all(Array.from({ length: LIMITE }, trabalhador));

let ok = 0;
for (const { c, r, falhas } of resultados) {
  const passou = falhas.length === 0;
  if (passou) ok++;
  const marca = passou ? "  ok " : "FALHA";
  const saida = r?.linha
    ? `${r.linha.tipo} ${String(r.linha.valor).padStart(8)} ${r.linha.categoria} · ${r.linha.data} · conf ${r.linha.confianca}`
    : r?.descartadoNaTriagem ? "(descartada na triagem)" : "(não é lançamento)";
  console.log(`${marca}  ${c.texto.padEnd(38)} → ${saida}`);
  if (!passou) falhas.forEach((f) => console.log(`        ↳ ${f}`));
  if (c.nota && !passou) console.log(`        nota: ${c.nota}`);
  if (verbose && r?.cru) console.log(`        cru: ${JSON.stringify(r.cru)}`);
}

if (!umTexto) {
  const pct = ((ok / casos.length) * 100).toFixed(0);
  console.log(`\n${ok}/${casos.length} (${pct}%)`);
  process.exit(ok === casos.length ? 0 : 1);
}
