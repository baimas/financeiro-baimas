// O modelo falhou. Sem este nó o workflow morre aqui e o grupo não recebe nada:
// quem mandou o gasto acha que foi registrado, e a linha nunca aparece na
// planilha. Um lançamento perdido em silêncio é pior que um erro visível.
//
// O chat_id e o message_id vêm de $('Montar prompt'), não de $input: a saída de
// erro entrega o erro do nó, não a mensagem que entrou nele.

const src = $('Montar prompt').first().json;

// o formato varia com o tipo de falha (HTTP, timeout, rede), então lê defensivo
const err = $input.first().json.error || {};
const cru = JSON.stringify(err);
const codigo = err.httpCode || (cru.match(/\b(4\d\d|5\d\d)\b/) || [])[1] || '';

// 429/500/502/503/504/529 e timeout passam sozinhos: pedir de novo resolve.
// Qualquer outra coisa (chave inválida, sem saldo, payload recusado) não passa
// sozinha, e dizer "tenta de novo" só faria a pessoa repetir à toa.
const passageiro = ['429', '500', '502', '503', '504', '529'].includes(String(codigo))
  || /timeout|ETIMEDOUT|ECONNRESET|socket hang up/i.test(cru);

const texto = passageiro
  ? '⚠️ o modelo está sobrecarregado agora. Nada foi lançado — manda a mensagem de novo daqui a pouco.'
  : `⚠️ não consegui registrar${codigo ? ` (erro ${codigo})` : ''}. Nada foi lançado, e desta vez repetir não resolve: precisa de uma olhada no n8n.`;

return [{ json: {
  chat_id: src.chat_id,
  message_id: src.message_id,
  texto_resposta: texto,
}}];
