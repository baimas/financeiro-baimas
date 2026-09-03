// A resposta no grupo. Diz o que saiu da planilha, com valor e categoria: quem
// pediu precisa reconhecer o que sumiu, senão fica a dúvida de ter apagado
// outra coisa.

const itens = $input.all().map((i) => i.json);
const src = $('Triagem').first().json;
const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

const primeiro = itens[0] || {};
if (!itens.length || primeiro.nada) {
  return [{ json: {
    chat_id: src.chat_id,
    message_id: src.message_id,
    texto_resposta: primeiro.recado || 'não achei o que apagar.',
  } }];
}

const apagados = itens.filter((i) => !i.nada);
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
