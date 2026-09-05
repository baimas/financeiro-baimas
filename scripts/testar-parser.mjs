#!/usr/bin/env node
// Roda a suíte de mensagens reais contra o Gemini — sem n8n, sem Telegram, sem VM.
//
// Executa os code nodes do workflow de verdade (via scripts/lib/pipeline.mjs),
// com as abas Cartoes e GastosFixos vindas dos CSVs modelo. O que este teste
// aprova é o que vai rodar em produção.
//
//   export GEMINI_API_KEY=AIza...
//   scripts/testar-parser.mjs                 roda testes/mensagens.jsonl
//   scripts/testar-parser.mjs --um "85 no mercado no nubank"
//   scripts/testar-parser.mjs --verbose       mostra o JSON cru do modelo
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ, URL_GEMINI, MODELO, processar } from "./lib/pipeline.mjs";

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

async function chamarGemini(payload, tentativa = 1) {
  const r = await fetch(URL_GEMINI, {
    method: "POST",
    headers: { "x-goog-api-key": CHAVE, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // 429 e a familia 5xx sao do lado do Google, nao do parser: tentar de novo
  if ([429, 500, 502, 503, 504].includes(r.status) && tentativa <= 5) {
    await new Promise((s) => setTimeout(s, 3000 * tentativa));
    return chamarGemini(payload, tentativa + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// datas relativas viram data absoluta na hora de comparar
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

function conferir(esperados, r) {
  const falhas = [];
  const obtidos = r.linhas;
  if (obtidos.length !== esperados.length) {
    falhas.push(`${obtidos.length} lançamento(s), esperava ${esperados.length}`);
    return falhas;
  }
  // ordena por valor dos dois lados: a ordem dentro da mensagem não importa
  const ord = (a, b) => a.valor - b.valor;
  const A = [...esperados].sort(ord);
  const B = [...obtidos].sort(ord);
  A.forEach((e, i) => {
    const o = B[i];
    const onde = esperados.length > 1 ? `[${i + 1}] ` : "";
    if (e.valor != null && Math.abs(o.valor - e.valor) > 0.005) falhas.push(`${onde}valor ${o.valor} ≠ ${e.valor}`);
    if (e.tipo && o.tipo !== e.tipo) falhas.push(`${onde}tipo ${o.tipo} ≠ ${e.tipo}`);
    if (e.categoria && o.categoria !== e.categoria) falhas.push(`${onde}categoria ${o.categoria} ≠ ${e.categoria}`);
    if (e.forma && o.forma !== e.forma) falhas.push(`${onde}forma ${o.forma} ≠ ${e.forma}`);
    if (e.fixo && o.fixo !== e.fixo) falhas.push(`${onde}fixo "${o.fixo}" ≠ "${e.fixo}"`);
    if (e.data) {
      const alvo = resolverData(e.data, r.hoje);
      if (o.data !== alvo) falhas.push(`${onde}data ${o.data} ≠ ${alvo}`);
    }
    if (o.competencia !== o.data.slice(0, 7)) falhas.push(`${onde}competência não bate com a data`);
  });
  return falhas;
}

const casos = umTexto
  ? [{ texto: umTexto, esperado: null }]
  : readFileSync(join(RAIZ, "testes", "mensagens.jsonl"), "utf8")
      .trim().split("\n").map((l) => JSON.parse(l));

console.log(`modelo ${MODELO} · ${casos.length} mensagem(ns)\n`);

const LIMITE = 3; // o free tier tem RPM curto
const resultados = new Array(casos.length);
let cursor = 0;
async function trabalhador() {
  while (cursor < casos.length) {
    const i = cursor++;
    const c = casos[i];
    try {
      const r = await processar(c.texto, chamarGemini);
      resultados[i] = { c, r, falhas: c.esperado ? conferir(c.esperado, r) : [] };
    } catch (e) {
      resultados[i] = { c, r: null, falhas: [`erro: ${e.message}`] };
    }
  }
}
await Promise.all(Array.from({ length: LIMITE }, trabalhador));

const desc = (l) => `${l.tipo} ${String(l.valor).padStart(7)} ${l.categoria}`
  + (l.forma !== "Não informado" ? ` · ${l.forma}` : "")
  + (l.fixo ? ` · fixo:${l.fixo}` : "")
  + (l.competencia_fatura ? ` · fatura ${l.competencia_fatura}` : "");

let ok = 0;
for (const { c, r, falhas } of resultados) {
  const passou = falhas.length === 0;
  if (passou) ok++;
  const marca = passou ? "  ok " : "FALHA";
  const linhas = r?.linhas ?? [];
  const resumo = linhas.length === 0
    ? (r?.descartadoNaTriagem ? "(descartada na triagem)" : "(não é lançamento)")
    : desc(linhas[0]);
  console.log(`${marca}  ${c.texto.slice(0, 42).padEnd(42)} → ${resumo}`);
  linhas.slice(1).forEach((l) => console.log(`${" ".repeat(51)}${desc(l)}`));
  if (!passou) falhas.forEach((f) => console.log(`        ↳ ${f}`));
  if (c.nota && !passou) console.log(`        nota: ${c.nota}`);
  if (verbose && r?.cru) console.log(`        cru: ${JSON.stringify(r.cru)}`);
}

if (!umTexto) {
  const pct = ((ok / casos.length) * 100).toFixed(0);
  console.log(`\n${ok}/${casos.length} (${pct}%)`);
  process.exit(ok === casos.length ? 0 : 1);
}
