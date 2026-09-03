// ── AJUSTE ESTES DOIS VALORES ────────────────────────────────
const CHAT_ID = -5403036702;                                  // id do grupo (negativo)
const MEMBROS = { 822395388: 'Vini', 1060520015: 'Lidia' };  // from.id -> nome
// Descubra os dois rodando: scripts/checar-bot.sh <token>
// ─────────────────────────────────────────────────────────────

const upd = $input.first().json;
const msg = upd.message || upd.edited_message;
if (!msg) return [];

// 1. autorizacao: precisa ser o grupo certo e um membro conhecido
if (String(msg.chat.id) !== String(CHAT_ID)) return [];
const pessoa = MEMBROS[msg.from.id];
if (!pessoa) return [];

// 2. idempotencia: guarda os ultimos update_id na memoria do workflow
const st = $getWorkflowStaticData('global');
st.vistos = st.vistos || [];
if (st.vistos.includes(upd.update_id)) return [];
st.vistos.push(upd.update_id);
if (st.vistos.length > 300) st.vistos = st.vistos.slice(-300);

const texto = (msg.text || msg.caption || '').trim();
if (!texto) return [];

// 3. pedido de exclusao: sai por outro ramo, sem Gemini e sem prompt.
// Vem antes do teste do numero porque "apagar" nao tem digito nenhum.
const APAGAR = /^\s*(apagar?|apaga|deletar?|excluir?|remover?)\b/i;
const comum = {
  update_id: upd.update_id,
  message_id: msg.message_id,
  chat_id: msg.chat.id,
  pessoa,
  texto,
};
if (APAGAR.test(texto)) {
  return [{ json: {
    ...comum,
    tipo: 'apagar',
    // reply na propria mensagem ou na confirmacao do bot: os dois ids levam ao
    // mesmo lancamento, porque o fluxo guarda ambos ao confirmar
    responde_a: (msg.reply_to_message && msg.reply_to_message.message_id) || 0,
  }}];
}

// 4. triagem: sem numero que pareca dinheiro, nao gasta LLM nem le a planilha
if (!/\d/.test(texto)) return [];

// 5. data de hoje no fuso de Sao Paulo, formato YYYY-MM-DD
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

return [{ json: { ...comum, tipo: 'lancamento', hoje }}];
