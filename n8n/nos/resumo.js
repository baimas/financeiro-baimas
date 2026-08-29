// Uma mensagem só no grupo, mesmo quando a mensagem original tinha vários gastos.
// Confirmar cada lançamento separado transformaria o grupo num log.

const linhas = $input.all().map((i) => i.json);
if (!linhas.length) return [];

const src = $('Montar prompt').first().json;
const brl = (v) => 'R$ ' + v.toFixed(2).replace('.', ',');
const sinal = { saida: '−', entrada: '+', investimento: '↗' };

const total = linhas.reduce((a, l) => a + (l.tipo === 'entrada' ? l.valor : -l.valor), 0);
const duvidoso = linhas.some((l) => l.confianca < 0.7);

let texto;
if (linhas.length === 1) {
  const l = linhas[0];
  texto = `${sinal[l.tipo]} ${brl(l.valor)} · ${l.categoria}`
        + (l.forma !== 'Não informado' ? ` · ${l.forma}` : '')
        + (l.fixo ? ` · fixo: ${l.fixo}` : '');
} else {
  texto = `${linhas.length} lançamentos\n`
        + linhas.map((l) => `${sinal[l.tipo]} ${brl(l.valor)} · ${l.categoria}`
            + (l.forma !== 'Não informado' ? ` · ${l.forma}` : '')).join('\n')
        + `\nsaldo da mensagem: ${brl(Math.abs(total))}`;
}
if (duvidoso) texto += '\n⚠️ confira: não tive certeza de algum campo';

return [{ json: {
  chat_id: src.chat_id,
  message_id: src.message_id,
  texto_resposta: texto,
}}];
