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

// Em que fatura esse gasto cai. Devolve a competencia do VENCIMENTO — que é o
// mes em que o dinheiro sai da conta, e é assim que a planilha da casa pensa.
function competenciaFatura(data, cartao) {
  if (!cartao || !cartao.fechamento) return '';
  const [ano, mes, dia] = data.split('-').map(Number);
  // gasto depois do fechamento entra na fatura que fecha no mes seguinte
  let mesFecha = dia <= cartao.fechamento ? mes : mes + 1;
  // vencimento antes do fechamento significa que a fatura vence no mes seguinte
  let mesVence = cartao.vencimento > cartao.fechamento ? mesFecha : mesFecha + 1;
  let anoVence = ano;
  while (mesVence > 12) { mesVence -= 12; anoVence += 1; }
  return `${anoVence}-${String(mesVence).padStart(2, '0')}`;
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
    competencia: data.slice(0, 7),      // o mes do gasto, para o orcamento
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
