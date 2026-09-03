// Guarda a ponte entre a conversa e a planilha: qual mensagem gerou quais
// linhas.
//
// Sem isso, responder "apagar" a uma confirmação não teria como saber o que
// apagar: o Telegram entrega a mensagem respondida sem o reply dela, então não
// há como seguir a cadeia de volta até o lançamento. Ficam guardados os dois
// ids — o da mensagem de quem gastou e o da confirmação do bot — porque na
// prática as pessoas respondem tanto a uma quanto à outra.

const enviada = $input.first().json;
const src = $('Montar prompt').first().json;
const linhas = $('Validar').all().map((i) => i.json);

const st = $getWorkflowStaticData('global');
st.confirmacoes = st.confirmacoes || {};

const chaves = linhas.map((l) => ({
  update_id: String(l.update_id),
  criado_em: l.criado_em,
  valor: l.valor,
  descricao: l.descricao,
}));

const idDaConfirmacao = (enviada && enviada.result && enviada.result.message_id) || enviada.message_id;
for (const id of [src.message_id, idDaConfirmacao]) {
  if (id) st.confirmacoes[String(id)] = chaves;
}

// O mapa não pode crescer para sempre. 400 mensagens são meses de uso da casa,
// e o que cai fora ainda pode ser apagado pelo dashboard.
const ids = Object.keys(st.confirmacoes);
if (ids.length > 400) {
  for (const id of ids.slice(0, ids.length - 400)) delete st.confirmacoes[id];
}

return [];
