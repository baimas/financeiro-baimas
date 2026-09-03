#!/usr/bin/env node
// Gera os dois workflows do n8n a partir dos code nodes em n8n/nos/*.js:
// a ingestão pelo Telegram e a exclusão pedida pelo dashboard.
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
const SAIDA_APAGAR = join(RAIZ, "n8n", "apagar-lancamentos.n8n.json");

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
        // O flash-lite oscila muito: a mesma chamada de duas palavras respondeu
        // em 1,4 s, 7,7 s e 29 s no mesmo minuto, e devolve 503 quando está
        // sobrecarregado. Com 20 s a mensagem do grupo se perdia à toa.
        options: { timeout: 120000 },
      },
      id: "a1000000-0000-4000-8000-000000000006",
      name: "Gemini",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [880, 300],
      // 503 e timeout do Gemini são transitórios: tentar de novo custa menos
      // que perder o lançamento e ter que redigitar a mensagem no grupo.
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 3000,
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

// a cadeia da ingestão é linear: cada nó alimenta o seguinte
const ordem = wf.nodes.map((n) => n.name);
for (let i = 0; i < ordem.length - 1; i++) {
  wf.connections[ordem[i]] = { main: [[{ node: ordem[i + 1], type: "main", index: 0 }]] };
}

// ── workflow 2: apagar lançamentos, pedido pelo dashboard ───────────────────
// Não é linear: dois desvios (pedido não autorizado, nada a apagar) desembocam
// direto na resposta, para que o dashboard nunca fique esperando.
const liga = (de, para, saida = 0) => ({ de, para, saida });

const wfApagar = {
  name: "Gastos — apagar lançamentos",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "apagar-lancamentos",
        responseMode: "responseNode",
        // O token no cabeçalho é quem protege; a origem, sozinha, não protege
        // nada — qualquer cliente pode forjá-la.
        options: { allowedOrigins: "*" },
      },
      id: "b1000000-0000-4000-8000-000000000001",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: [-320, 300],
      webhookId: "c0ffee00-0000-4000-8000-000000000001",
    },
    code("Conferir pedido", "apagar-pedido.js", -80, 300),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [{
            id: "autorizado",
            leftValue: "={{ $json.autorizado }}",
            rightValue: "",
            operator: { type: "boolean", operation: "true", singleValue: true },
          }],
          combinator: "and",
        },
        options: {},
      },
      id: "b1000000-0000-4000-8000-000000000003",
      name: "Autorizado?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.3,
      position: [160, 300],
    },
    lerAba("Ler lançamentos", "Lancamentos", 400, 200),
    code("Casar linhas", "apagar-casar.js", 640, 200),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [{
            id: "tem-linha",
            leftValue: "={{ $json.nada }}",
            rightValue: "",
            operator: { type: "boolean", operation: "false", singleValue: true },
          }],
          combinator: "and",
        },
        options: {},
      },
      id: "b1000000-0000-4000-8000-000000000006",
      name: "Tem linha?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.3,
      position: [880, 200],
    },
    {
      parameters: {
        operation: "delete",
        documentId: PLANILHA,
        sheetName: aba("Lancamentos"),
        toDelete: "rows",
        startIndex: "={{ $json.row_number }}",
        numberToDelete: 1,
        authentication: "serviceAccount",
      },
      id: "b1000000-0000-4000-8000-000000000007",
      name: "Apagar linha",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [1120, 200],
      credentials: CRED_SHEETS,
      // uma execução por item, do maior número de linha para o menor
      alwaysOutputData: true,
    },
    code("Montar resposta", "apagar-resposta.js", 1360, 300),
    {
      parameters: {
        respondWith: "json",
        responseBody: "={{ JSON.stringify($json) }}",
        options: { responseCode: "={{ $json.status }}" },
      },
      id: "b1000000-0000-4000-8000-000000000009",
      name: "Responder",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.5,
      position: [1600, 300],
    },
  ],
  connections: {},
  settings: { executionOrder: "v1" },
  pinData: {},
  active: false,
};

for (const { de, para, saida } of [
  liga("Webhook", "Conferir pedido"),
  liga("Conferir pedido", "Autorizado?"),
  liga("Autorizado?", "Ler lançamentos", 0),      // autorizado
  liga("Autorizado?", "Montar resposta", 1),      // negado, responde e acabou
  liga("Ler lançamentos", "Casar linhas"),
  liga("Casar linhas", "Tem linha?"),
  liga("Tem linha?", "Apagar linha", 0),
  liga("Tem linha?", "Montar resposta", 1),       // nada casou
  liga("Apagar linha", "Montar resposta"),
  liga("Montar resposta", "Responder"),
]) {
  const c = (wfApagar.connections[de] ||= { main: [] });
  while (c.main.length <= saida) c.main.push([]);
  c.main[saida].push({ node: para, type: "main", index: 0 });
}

const artefatos = [
  { caminho: SAIDA, nome: "n8n/gastos-ingestao.n8n.json", wf },
  { caminho: SAIDA_APAGAR, nome: "n8n/apagar-lancamentos.n8n.json", wf: wfApagar },
];

let desatualizado = false;
for (const a of artefatos) {
  const json = JSON.stringify(a.wf, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(a.caminho, "utf8") !== json) {
      console.error(`${a.nome} está desatualizado — rode scripts/montar-workflow.mjs`);
      desatualizado = true;
    }
  } else {
    writeFileSync(a.caminho, json);
    console.log(`${a.wf.nodes.length} nós → ${a.nome}`);
  }
}
if (desatualizado) process.exit(1);
if (process.argv.includes("--check")) console.log("workflows em dia com n8n/nos/*.js");
else console.log(ordem.join(" → "));
