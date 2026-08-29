// ── AJUSTE ESTES DOIS VALORES ────────────────────────────────
const CHAT_ID = -1001234567890;                              // id do grupo (negativo)
const MEMBROS = { 111111111: 'Vini', 222222222: 'Lidia' };   // from.id -> nome
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

// 3. triagem: sem numero que pareca dinheiro, nao gasta LLM nem le a planilha
const texto = (msg.text || msg.caption || '').trim();
if (!texto) return [];
if (!/\d/.test(texto)) return [];

// 4. data de hoje no fuso de Sao Paulo, formato YYYY-MM-DD
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

return [{ json: {
  update_id: upd.update_id,
  message_id: msg.message_id,
  chat_id: msg.chat.id,
  pessoa,
  texto,
  hoje,
}}];
