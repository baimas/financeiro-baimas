// A resposta no grupo. Diz o que saiu da planilha, com valor e categoria: quem
// pediu precisa reconhecer o que sumiu, senão fica a dúvida de ter apagado
// outra coisa.
//
// Os dados vêm de "Escolher para apagar", não da entrada deste nó: no caminho
// em que algo foi apagado, quem alimenta aqui é o nó do Google Sheets, que
// devolve o resultado DELE e descarta valor, categoria e alvo. Ler a entrada
// direto rendia "apaguei undefined: − R$ NaN".

const src = $('Triagem').first().json;
const escolhidas = $('Escolher para apagar').all().map((i) => i.json);
const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

const primeiro = escolhidas[0] || {};
const apagados = escolhidas.filter((i) => !i.nada);

if (!apagados.length) {
  return [{ json: {
    chat_id: src.chat_id,
    message_id: src.message_id,
    texto_resposta: primeiro.recado || 'não achei o que apagar.',
  } }];
}

const descrever = (i) => {
  const l = i.linha || {};
  return `− ${brl(l.valor)} · ${l.categoria || 'sem categoria'}`
       + (l.forma && l.forma !== 'Não informado' ? ` · ${l.forma}` : '');
};

const texto = apagados.length === 1
  ? `apaguei ${primeiro.alvo}:\n${descrever(apagados[0])}`
  : `apaguei ${apagados.length} lançamentos de ${primeiro.alvo}:\n`
    + apagados.map(descrever).join('\n');

return [{ json: {
  chat_id: src.chat_id,
  message_id: src.message_id,
  texto_resposta: texto,
} }];
