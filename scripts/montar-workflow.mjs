#!/usr/bin/env node
// Gera n8n/gastos-ingestao.n8n.json a partir dos code nodes em n8n/nos/*.js.
//
// Existe porque JavaScript dentro de string JSON não se mantém: sem destaque de
// sintaxe, sem `node --check`, e um \n errado quebra tudo em silêncio. Aqui o
// código vive em arquivos de verdade e o JSON é artefato — versionado, porque é
// ele que se importa no n8n.
//
//   scripts/montar-workflow.mjs        regera o JSON
//   scripts/montar-workflow.mjs --check   falha se o JSON estiver desatualizado
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const js = (nome) => readFileSync(join(RAIZ, "n8n", "nos", nome), "utf8");
const SAIDA = join(RAIZ, "n8n", "gastos-ingestao.n8n.json");

const CRED_TELEGRAM = { telegramApi: { id: "SUBSTITUA", name: "Telegram — bot de gastos" } };
const CRED_SHEETS = { googleApi: { id: "SUBSTITUA", name: "Google Service Account — gastos" } };
// A planilha da casa. Os ids de credencial seguem "SUBSTITUA": o n8n gera o
// seu próprio id ao criar a credencial, então esses dois se ligam na interface.
const PLANILHA = { __rl: true, value: "1w60kGXBH1vVOGQZSHpWybrtXl9KiSgOabvp2QQS7aRI", mode: "id" };
const aba = (nome) => ({ __rl: true, value: nome, mode: "name" });

const code = (nome, arquivo, x, y) => ({
  parameters: { jsCode: js(arquivo) },
  id: `a1000000-0000-4000-8000-${String(x).padStart(12, "0")}`,
  name: nome,
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [x, y],
});

const lerAba = (nome, nomeAba, x, y) => ({
  parameters: {
    documentId: PLANILHA,
    sheetName: aba(nomeAba),
    options: {},
    authentication: "serviceAccount",
  },
  id: `a1000000-0000-4000-8000-${String(x).padStart(12, "0")}`,
  name: nome,
  type: "n8n-nodes-base.googleSheets",
  typeVersion: 4.5,
  position: [x, y],
  credentials: CRED_SHEETS,
  // sem isto o nó rodaria uma vez por item de entrada e leria a aba N vezes
  executeOnce: true,
});

const wf = {
  name: "Gastos — ingestão Telegram",
  nodes: [
    {
      parameters: { updates: ["message"], additionalFields: {} },
      id: "a1000000-0000-4000-8000-000000000001",
      name: "Telegram Trigger",
      type: "n8n-nodes-base.telegramTrigger",
      typeVersion: 1.1,
      position: [-320, 300],
      credentials: CRED_TELEGRAM,
    },
    code("Triagem", "triagem.js", -80, 300),
    lerAba("Ler cartões", "Cartoes", 160, 300),
    lerAba("Ler gastos fixos", "GastosFixos", 400, 300),
    code("Montar prompt", "montar-prompt.js", 640, 300),
    {
      parameters: {
        method: "POST",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "x-goog-api-key", value: "={{ $env.GEMINI_API_KEY }}" },
            { name: "Content-Type", value: "application/json" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.payload) }}",
        options: { timeout: 20000 },
      },
      id: "a1000000-0000-4000-8000-000000000006",
      name: "Gemini",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [880, 300],
    },
    code("Validar", "validar.js", 1120, 300),
    {
      parameters: {
        operation: "append",
        documentId: PLANILHA,
        sheetName: aba("Lancamentos"),
        columns: { mappingMode: "autoMapInputData", matchingColumns: [], schema: [] },
        options: {},
        authentication: "serviceAccount",
      },
      id: "a1000000-0000-4000-8000-000000000008",
      name: "Gravar na planilha",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [1360, 300],
      credentials: CRED_SHEETS,
    },
    code("Resumo da resposta", "resumo.js", 1600, 300),
    {
      parameters: {
        chatId: "={{ $json.chat_id }}",
        text: "={{ $json.texto_resposta }}",
        additionalFields: {
          reply_to_message_id: "={{ $json.message_id }}",
          appendAttribution: false,
        },
      },
      id: "a1000000-0000-4000-8000-000000000010",
      name: "Confirmar no grupo",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [1840, 300],
      credentials: CRED_TELEGRAM,
    },
  ],
  connections: {},
  settings: { executionOrder: "v1" },
  pinData: {},
  active: false,
};

// a cadeia é linear: cada nó alimenta o seguinte
const ordem = wf.nodes.map((n) => n.name);
for (let i = 0; i < ordem.length - 1; i++) {
  wf.connections[ordem[i]] = { main: [[{ node: ordem[i + 1], type: "main", index: 0 }]] };
}

const json = JSON.stringify(wf, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const atual = readFileSync(SAIDA, "utf8");
  if (atual !== json) {
    console.error("n8n/gastos-ingestao.n8n.json está desatualizado — rode scripts/montar-workflow.mjs");
    process.exit(1);
  }
  console.log("workflow em dia com n8n/nos/*.js");
} else {
  writeFileSync(SAIDA, json);
  console.log(`${wf.nodes.length} nós → n8n/gastos-ingestao.n8n.json`);
  console.log(ordem.join(" → "));
}
