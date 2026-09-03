#!/usr/bin/env node
// Testes offline do workflow: sem rede, sem chave, sem n8n. ~1s.
// Cobrem tudo que não depende do modelo — autorização, idempotência, validação,
// ciclo de fatura e o encaixe com as colunas da planilha.
//
//   scripts/testar-nos.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RAIZ, CARTOES, FIXOS, fabricarRunner, fabricarRunnerApagar, pedidoHttp,
  update, respostaGemini, processar,
} from "./lib/pipeline.mjs";

let falhas = 0;
// precisa ser await: metade dos testes e async, e sem isso uma falha dentro de
// um deles viraria promise rejeitada e o teste apareceria como "ok"
const teste = async (nome, fn) => {
  try { await fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${e.message}`); }
};
const igual = (a, b, msg) => {
  if (a !== b) throw new Error(`${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
};

const GASTO = {
  tipo: "saida", valor: 85.5, data: "2026-08-27", categoria: "Mercado",
  forma: "Nubank Vini", descricao: "Assai", fixo: "", confianca: 0.94,
};
// atalho: roda o pipeline com uma resposta fabricada do modelo
const comResposta = (lancamentos, texto = "gastei 85,50 no assai") =>
  processar(texto, async () => respostaGemini(lancamentos));

console.log("Triagem");
await teste("aceita mensagem do grupo e do membro certos", () => {
  const r = fabricarRunner()("Triagem", update("85 no mercado"))[0];
  if (!r) throw new Error("descartou o que devia passar");
  igual(r.pessoa, "Vini", "pessoa");
});
await teste("descarta chat que não é o da casa", () => {
  igual(fabricarRunner()("Triagem", update("85", { chat_id: -1009999999999 })).length, 0, "itens");
});
await teste("descarta quem não é membro", () => {
  igual(fabricarRunner()("Triagem", update("85", { from_id: 999 })).length, 0, "itens");
});
await teste("descarta o mesmo update_id duas vezes", () => {
  const r = fabricarRunner();
  if (!r("Triagem", update("85 no mercado", { update_id: 7 })).length) throw new Error("a primeira devia passar");
  igual(r("Triagem", update("85 no mercado", { update_id: 7 })).length, 0, "a segunda");
});
await teste("descarta mensagem sem dígito antes de gastar LLM e antes de ler a planilha", () => {
  igual(fabricarRunner()("Triagem", update("bom dia amor")).length, 0, "itens");
});

console.log("\nMontar prompt");
const ctx = await comResposta([]).then((r) => r.ctx);
await teste("as formas de pagamento saem da aba Cartoes, não do código", () => {
  for (const c of CARTOES) if (!ctx.formas.includes(c.nome)) throw new Error(`faltou ${c.nome}`);
  for (const f of ["Débito", "Pix", "Dinheiro", "VA"]) if (!ctx.formas.includes(f)) throw new Error(`faltou ${f}`);
});
await teste("o enum do schema é a mesma lista de formas", () => {
  const enumForma = ctx.payload.generationConfig.responseSchema
    .properties.lancamentos.items.properties.forma.enum;
  igual(enumForma.join("|"), ctx.formas.join("|"), "enum");
});
await teste("os gastos fixos da planilha entram no prompt", () => {
  const texto = ctx.payload.contents[0].parts[0].text;
  for (const f of FIXOS) if (!texto.includes(f.nome)) throw new Error(`faltou ${f.nome}`);
});
await teste("o schema pede uma lista, não um lançamento só", () => {
  igual(ctx.payload.generationConfig.responseSchema.properties.lancamentos.type, "array", "tipo");
});

console.log("\nValidar");
await teste("monta a linha da planilha", async () => {
  const { linhas } = await comResposta([GASTO]);
  igual(linhas.length, 1, "quantidade");
  igual(linhas[0].valor, 85.5, "valor");
  igual(linhas[0].competencia, "2026-08", "competencia");
  igual(linhas[0].pessoa, "Vini", "pessoa");
});
await teste("emite uma linha por lançamento", async () => {
  const { linhas } = await comResposta([
    { ...GASTO, valor: 12, categoria: "Alimentação", forma: "Pix", descricao: "Padaria" },
    { ...GASTO, valor: 30, categoria: "Farmácia", forma: "Pix", descricao: "Farmácia" },
  ], "padaria 12 e farmacia 30");
  igual(linhas.length, 2, "quantidade");
  igual(linhas.map((l) => l.valor).join("+"), "12+30", "valores");
});
await teste("lista vazia não vira lançamento nenhum", async () => {
  igual((await comResposta([])).linhas.length, 0, "quantidade");
});
await teste("rejeita valor zero ou negativo, mas mantém os válidos da mesma mensagem", async () => {
  const { linhas } = await comResposta([{ ...GASTO, valor: 0 }, { ...GASTO, valor: 30 }]);
  igual(linhas.length, 1, "quantidade");
  igual(linhas[0].valor, 30, "valor");
});
await teste("força categoria fora da lista para Outros", async () => {
  igual((await comResposta([{ ...GASTO, categoria: "Criptomoedas" }])).linhas[0].categoria, "Outros", "categoria");
});
await teste("aceita categoria sem acento vinda do modelo", async () => {
  igual((await comResposta([{ ...GASTO, categoria: "alimentacao" }])).linhas[0].categoria, "Alimentação", "categoria");
});
await teste("forma desconhecida vira Não informado", async () => {
  igual((await comResposta([{ ...GASTO, forma: "Cartão do Itaú" }])).linhas[0].forma, "Não informado", "forma");
});
await teste("casa o gasto fixo pelo nome da aba", async () => {
  igual((await comResposta([{ ...GASTO, fixo: "internet" }])).linhas[0].fixo, "Internet", "fixo");
});
await teste("categoria do gasto fixo vem da planilha, não do modelo", async () => {
  // o modelo ja chamou "internet" de Assinaturas; a aba GastosFixos diz Moradia
  const { linhas } = await comResposta([{ ...GASTO, fixo: "Internet", categoria: "Assinaturas" }]);
  igual(linhas[0].categoria, "Moradia", "categoria");
});
await teste("fixo inventado pelo modelo é descartado", async () => {
  igual((await comResposta([{ ...GASTO, fixo: "Cinema" }])).linhas[0].fixo, "", "fixo");
});
await teste("cai para hoje quando a data vem malformada", async () => {
  const { linhas, hoje } = await comResposta([{ ...GASTO, data: "ontem" }]);
  igual(linhas[0].data, hoje, "data");
});
await teste("sobrevive a JSON ilegível do modelo", async () => {
  const r = await processar("85 no mercado", async () => ({
    candidates: [{ content: { parts: [{ text: "isto não é json" }] } }],
  }));
  igual(r.linhas.length, 0, "quantidade");
});

console.log("\nCiclo de fatura");
// Nubank Vini fecha 26, vence 3 → vencimento antes do fechamento, cai no mês seguinte
await teste("compra antes do fechamento vence no mês seguinte", async () => {
  const { linhas } = await comResposta([{ ...GASTO, data: "2026-08-20", forma: "Nubank Vini" }]);
  igual(linhas[0].competencia_fatura, "2026-09", "fatura");
});
await teste("compra depois do fechamento pula uma fatura", async () => {
  const { linhas } = await comResposta([{ ...GASTO, data: "2026-08-29", forma: "Nubank Vini" }]);
  igual(linhas[0].competencia_fatura, "2026-10", "fatura");
});
await teste("vira o ano corretamente", async () => {
  const { linhas } = await comResposta([{ ...GASTO, data: "2026-12-29", forma: "Nubank Vini" }]);
  igual(linhas[0].competencia_fatura, "2027-02", "fatura");
});
// Nenhum cartão real da casa vence depois de fechar; o ramo continua existindo
// no código, então testamos com um cartão fabricado só para este teste.
await teste("cartão que vence depois de fechar cobra no mesmo mês", () => {
  const rodar = fabricarRunner();
  const triado = rodar("Triagem", update("gastei 50 no cartao teste"))[0];
  const cartaoTeste = [{ nome: "Cartão Teste", dia_fechamento: "15", dia_vencimento: "25" }];
  const ctx = rodar("Montar prompt", triado, { Triagem: triado, "Ler cartões": cartaoTeste, "Ler gastos fixos": FIXOS })[0];
  const resp = respostaGemini([{ ...GASTO, forma: "Cartão Teste", data: "2026-08-10" }]);
  const linhas = rodar("Validar", resp, { "Montar prompt": ctx });
  igual(linhas[0].competencia_fatura, "2026-08", "fatura");
});
await teste("Pix e débito não têm fatura", async () => {
  for (const forma of ["Pix", "Débito", "Dinheiro", "VA"]) {
    const { linhas } = await comResposta([{ ...GASTO, forma }]);
    igual(linhas[0].competencia_fatura, "", `fatura de ${forma}`);
  }
});

console.log("\nResumo no grupo");
await teste("um lançamento vira uma linha curta", async () => {
  const { resumo } = await comResposta([GASTO]);
  if (!resumo.texto_resposta.includes("85,50")) throw new Error(resumo.texto_resposta);
  if (resumo.texto_resposta.includes("\n")) throw new Error("devia caber numa linha");
});
await teste("vários lançamentos viram uma mensagem só", async () => {
  const { resumo } = await comResposta([
    { ...GASTO, valor: 12 }, { ...GASTO, valor: 30 }, { ...GASTO, valor: 23 },
  ]);
  if (!resumo.texto_resposta.startsWith("3 lançamentos")) throw new Error(resumo.texto_resposta);
});
await teste("confiança baixa pede conferência", async () => {
  const { resumo } = await comResposta([{ ...GASTO, confianca: 0.4 }]);
  if (!resumo.texto_resposta.includes("confira")) throw new Error(resumo.texto_resposta);
});

console.log("\nApagar lançamentos");
const SEGREDO = "0123456789abcdef0123456789abcdef";
const CHAVE = { update_id: "610246548", criado_em: "2026-09-03T21:54:19.889Z",
                valor: 20, descricao: "Mercado" };
// como a aba Lancamentos volta do nó do Sheets, com o número da linha junto
const NA_PLANILHA = [
  { row_number: 2, update_id: "610246547", criado_em: "2026-09-03T20:00:00.000Z",
    valor: "35.50", descricao: "Padaria" },
  { row_number: 3, update_id: "610246548", criado_em: "2026-09-03T21:54:19.889Z",
    valor: "20", descricao: "Mercado" },
  { row_number: 4, update_id: "610246549", criado_em: "2026-09-03T22:10:00.000Z",
    valor: "1.234,56", descricao: "Geladeira" },
];
const apagar = (env = { DASHBOARD_TOKEN: SEGREDO }) => fabricarRunnerApagar(env);
const conferir = (chaves, token, env) =>
  apagar(env)("Conferir pedido", pedidoHttp(chaves, token))[0];
const casar = (pedido) =>
  apagar()("Casar linhas", NA_PLANILHA, { "Conferir pedido": pedido });

await teste("token certo autoriza", () => {
  igual(conferir([CHAVE], SEGREDO).autorizado, true, "autorizado");
});
await teste("token errado não autoriza", () => {
  igual(conferir([CHAVE], "chute").autorizado, false, "autorizado");
});
await teste("sem cabeçalho nenhum não autoriza", () => {
  igual(conferir([CHAVE], undefined).autorizado, false, "autorizado");
});
await teste("servidor sem DASHBOARD_TOKEN recusa até o token certo", () => {
  igual(conferir([CHAVE], SEGREDO, {}).autorizado, false, "autorizado");
});
await teste("pedido é limitado a 50 chaves", () => {
  const muitas = Array.from({ length: 80 }, (_, i) => ({ ...CHAVE, update_id: String(i) }));
  igual(conferir(muitas, SEGREDO).chaves.length, 50, "chaves");
});
await teste("acha a linha certa pela chave", () => {
  const r = casar(conferir([CHAVE], SEGREDO));
  igual(r.length, 1, "itens");
  igual(r[0].row_number, 3, "linha");
});
await teste("valor com separador brasileiro casa com o número", () => {
  const chave = { update_id: "610246549", criado_em: "2026-09-03T22:10:00.000Z",
                  valor: 1234.56, descricao: "Geladeira" };
  igual(casar(conferir([chave], SEGREDO))[0].row_number, 4, "linha");
});
await teste("valor diferente não apaga: a linha mudou desde que a tela leu", () => {
  const r = casar(conferir([{ ...CHAVE, valor: 21 }], SEGREDO));
  igual(r[0].nada, true, "nada");
  igual(r[0].perdidas.length, 1, "perdidas");
});
await teste("chave que não existe mais não apaga nada", () => {
  const r = casar(conferir([{ ...CHAVE, update_id: "999" }], SEGREDO));
  igual(r[0].nada, true, "nada");
});
await teste("apaga de baixo para cima, senão os números escorregam", () => {
  const chaves = [
    { update_id: "610246547", criado_em: "2026-09-03T20:00:00.000Z", valor: 35.5, descricao: "Padaria" },
    { update_id: "610246549", criado_em: "2026-09-03T22:10:00.000Z", valor: 1234.56, descricao: "Geladeira" },
  ];
  const linhas = casar(conferir(chaves, SEGREDO)).map((i) => i.row_number);
  igual(JSON.stringify(linhas), JSON.stringify([4, 2]), "ordem");
});
await teste("resposta de pedido negado devolve 401 e não vaza motivo interno", () => {
  const pedido = conferir([CHAVE], "chute");
  const r = apagar()("Montar resposta", pedido, { "Conferir pedido": pedido })[0];
  igual(r.status, 401, "status");
  igual(r.apagados, 0, "apagados");
});
await teste("resposta conta o que apagou e o que não achou", () => {
  const pedido = conferir([CHAVE, { ...CHAVE, update_id: "999" }], SEGREDO);
  const casadas = casar(pedido);
  const r = apagar()("Montar resposta", casadas,
    { "Conferir pedido": pedido, "Casar linhas": casadas })[0];
  igual(r.status, 200, "status");
  igual(r.apagados, 1, "apagados");
  igual(r.nao_encontrados.length, 1, "não encontrados");
  igual(r.apagadas[0].update_id, "610246548", "chave devolvida");
});

console.log("\nEncaixe com a planilha");
await teste("as chaves da linha são exatamente as colunas de lancamentos-modelo.csv", async () => {
  const cabecalho = readFileSync(join(RAIZ, "planilha", "lancamentos-modelo.csv"), "utf8")
    .split("\n")[0].trim().split(",");
  const chaves = Object.keys((await comResposta([GASTO])).linhas[0]);
  const faltando = cabecalho.filter((c) => !chaves.includes(c));
  const sobrando = chaves.filter((c) => !cabecalho.includes(c));
  if (faltando.length || sobrando.length)
    throw new Error(`o autoMapInputData vai errar — faltando: [${faltando}] sobrando: [${sobrando}]`);
});
await teste("as categorias dos gastos fixos existem na lista do prompt", () => {
  const fora = FIXOS.map((f) => f.categoria).filter((c) => !ctx.categorias.includes(c));
  if (fora.length) throw new Error(`categorias de gastos fixos que o prompt não permite: ${fora}`);
});

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo passou");
process.exit(falhas ? 1 : 0);
