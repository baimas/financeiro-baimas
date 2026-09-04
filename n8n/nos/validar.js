// Dinheiro é determinístico: o modelo propõe, aqui a casa decide.
// Emite uma linha por lançamento — o nó do Sheets grava todas de uma vez.

const src = $('Montar prompt').first().json;
const resp = $input.first().json;

// tira acento e caixa para comparar o que o modelo devolveu com as listas
const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const acharNaLista = (valor, lista) => {
  const alvo = norm(valor);
  return lista.find((x) => norm(x) === alvo) || null;
};

let p;
try {
  p = JSON.parse(resp.candidates[0].content.parts[0].text);
} catch (e) {
  return [];                          // modelo devolveu algo ilegivel: ignora
}
const itens = Array.isArray(p.lancamentos) ? p.lancamentos : [];
if (!itens.length) return [];         // nao era lancamento: silencio

// dia de fechamento e de vencimento por cartao, vindos da aba Cartoes
const cartoes = {};
for (const c of src.cartoes || []) {
  const nome = String(c.nome || '').trim();
  if (!nome) continue;
  cartoes[norm(nome)] = {
    nome,
    fechamento: Number(c.dia_fechamento) || 0,
    vencimento: Number(c.dia_vencimento) || 0,
  };
}

const fixosPorNome = {};
for (const f of src.fixos || []) {
  const nome = String(f.nome || '').trim();
  if (nome) fixosPorNome[norm(nome)] = { nome, categoria: String(f.categoria || '').trim() };
}
const nomesFixos = Object.values(fixosPorNome).map((f) => f.nome);

const mesAno = (ano, mes) => {
  while (mes > 12) { mes -= 12; ano += 1; }
  return `${ano}-${String(mes).padStart(2, '0')}`;
};

// Em que mes o gasto CONTA. No cartao, o que manda nao e o dia da compra e sim
// o ciclo: comprar em 27/08 com fatura fechando dia 26 e comprar em 10/09 e a
// mesma fatura, a que fecha em 26/09 — e e junto que esses gastos precisam
// aparecer, senao a fatura em formacao nunca e vista inteira.
// Fora do cartao (Pix, dinheiro, debito) o dinheiro sai na hora: vale o mes da
// data, sem ciclo nenhum.
function competenciaCiclo(data, cartao) {
  const [ano, mes, dia] = data.split('-').map(Number);
  if (!cartao || !cartao.fechamento) return data.slice(0, 7);
  return mesAno(ano, dia <= cartao.fechamento ? mes : mes + 1);
}

// Em que fatura esse gasto cai. Devolve a competencia do VENCIMENTO — o mes em
// que o dinheiro sai da conta de verdade, que e outra pergunta: o gasto de
// 27/08 conta no ciclo de setembro e so e pago na fatura de outubro.
function competenciaFatura(data, cartao) {
  if (!cartao || !cartao.fechamento) return '';
  const [ano, mes, dia] = data.split('-').map(Number);
  // gasto depois do fechamento entra na fatura que fecha no mes seguinte
  const mesFecha = dia <= cartao.fechamento ? mes : mes + 1;
  // vencimento antes do fechamento significa que a fatura vence no mes seguinte
  return mesAno(ano, cartao.vencimento > cartao.fechamento ? mesFecha : mesFecha + 1);
}

const saida = [];
for (const item of itens) {
  const valor = Math.round(Number(item.valor) * 100) / 100;
  if (!isFinite(valor) || valor <= 0) continue;

  const data = /^\d{4}-\d{2}-\d{2}$/.test(item.data) ? item.data : src.hoje;
  const forma = acharNaLista(item.forma, src.formas) || 'Não informado';
  const fixo = acharNaLista(item.fixo, nomesFixos) || '';

  // gasto fixo tem categoria cadastrada na planilha: ela vale mais que o palpite
  // do modelo, que ja chamou "internet" de Assinaturas e de Moradia
  const catDoFixo = fixo ? fixosPorNome[norm(fixo)].categoria : '';
  const categoria = acharNaLista(catDoFixo, src.categorias)
                 || acharNaLista(item.categoria, src.categorias)
                 || 'Outros';
  const tipo = ['entrada', 'investimento'].includes(item.tipo) ? item.tipo : 'saida';

  saida.push({ json: {
    update_id: src.update_id,
    data,
    competencia: competenciaCiclo(data, cartoes[norm(forma)]),
    competencia_fatura: competenciaFatura(data, cartoes[norm(forma)]),
    criado_em: new Date().toISOString(),
    tipo,
    valor,
    categoria,
    forma,
    descricao: String(item.descricao || '').slice(0, 60),
    pessoa: src.pessoa,
    fixo,
    mensagem: src.texto,
    confianca: Math.round(Number(item.confianca || 0) * 100) / 100,
  }});
}

return saida;
