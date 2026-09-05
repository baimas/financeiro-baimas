// Monta o prompt e o schema da ferramenta a partir do que a PLANILHA diz.
// Cartões e gastos fixos vêm das abas Cartoes e GastosFixos: adicionar um cartão
// novo ou um fixo novo é editar a planilha, nunca este workflow.

// O que foi gasto. Alinhado com a planilha da casa.
const CATEGORIAS = [
  'Mercado', 'Hortifrutti', 'Alimentação', 'Lanches', 'Confraternizações',
  'Farmácia', 'Saúde', 'Academia', 'Assinaturas', 'Combustível', 'Passagem',
  'Transporte', 'Carro', 'Barbeiro', 'Vestuário', 'Educação', 'Moradia',
  'Pets', 'Presentes', 'Lazer', 'Ofertas', 'Dívidas', 'Investimento',
  'Salário', 'Horas Extras', 'Auxílios', 'PLR', 'Outros',
];

// Como foi pago. Os cartões saem da aba Cartoes; o resto é fixo.
const SEM_CARTAO = ['Débito', 'Pix', 'Dinheiro', 'VA', 'Boleto', 'Não informado'];

const src = $('Triagem').first().json;

const cartoes = $('Ler cartões').all()
  .map((i) => String(i.json.nome || '').trim())
  .filter(Boolean);

const fixos = $('Ler gastos fixos').all()
  .map((i) => i.json)
  .filter((f) => String(f.ativo || 'sim').toLowerCase() !== 'nao'
               && String(f.ativo || 'sim').toLowerCase() !== 'não')
  .map((f) => String(f.nome || '').trim())
  .filter(Boolean);

const FORMAS = [...cartoes, ...SEM_CARTAO];

const prompt = [
  'Voce extrai lancamentos financeiros de mensagens em portugues do Brasil.',
  'Hoje e ' + src.hoje + ' (fuso America/Sao_Paulo).',
  '',
  'Devolva um lancamento para CADA gasto ou recebimento citado na mensagem.',
  '"padaria 12 e farmacia 30" sao DOIS lancamentos, nunca um de 42.',
  'Se a mensagem nao registra dinheiro, devolva a lista vazia.',
  'Registre apenas o que JA aconteceu. Lembrete e intencao futura nao sao',
  'lancamento: "lembra de pagar", "preciso pagar", "vou pagar", "vence sexta"',
  '-> lista vazia.',
  'Compra parcelada, porem, JA aconteceu: registre UMA parcela, com o valor',
  'da parcela, e escreva as parcelas na descricao (ex.: "Fone 1/12").',
  '',
  'Categorias permitidas: ' + CATEGORIAS.join(', ') + '.',
  'Formas de pagamento permitidas: ' + FORMAS.join(', ') + '.',
  fixos.length ? 'Gastos fixos da casa: ' + fixos.join(', ') + '.' : '',
  '',
  'Regras:',
  '- tipo = entrada SOMENTE com verbo explicito de dinheiro que entrou: recebi,',
  '  caiu, entrou, ganhei, vendi, salario, pix recebido, reembolso, estorno.',
  '- tipo = investimento para aporte: apliquei, investi, guardei, reserva.',
  '- todo o resto e saida, inclusive comprar presente para alguem. Na duvida, saida.',
  '- valor sempre positivo, em reais, com ponto como separador decimal.',
  '- forma: use o cartao citado ("no nubank" -> o cartao do Nubank de quem enviou).',
  '  Sem forma citada, use "Não informado". Nunca invente cartao.',
  '- uma forma citada uma vez vale para TODOS os gastos da mensagem:',
  '  "mercado 85 e uber 23 no pix" sao dois lancamentos, ambos no Pix.',
  '- resolva datas relativas ("ontem", "sexta") contra a data de hoje.',
  '  Sem data explicita, use hoje.',
  '- categoria obrigatoriamente uma da lista. Se nada encaixar, use Outros.',
  '- fixo: se o lancamento paga um dos gastos fixos da casa, escreva o nome dele',
  '  exatamente como esta na lista. Caso contrario, string vazia.',
  '- descricao curta, ate 40 caracteres, com o estabelecimento quando houver.',
  '- confianca de 0 a 1: quao seguro voce esta do valor, da categoria e da forma.',
  '- nunca invente valor.',
  '',
  'Quem enviou: ' + src.pessoa,
  'Mensagem: ' + src.texto,
].filter(Boolean).join('\n');

// Claude não tem responseSchema: a extração estruturada sai forçando o
// modelo a chamar esta ferramenta, com tool_choice fixo nela. O input que ele
// devolve já chega como objeto — nada de JSON.parse em cima de texto.
const payload = {
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 4096,
  temperature: 0,
  messages: [{ role: 'user', content: prompt }],
  tools: [{
    name: 'registrar_lancamentos',
    description: 'Registra os lançamentos financeiros extraídos da mensagem.',
    input_schema: {
      type: 'object',
      properties: {
        lancamentos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tipo:      { type: 'string', enum: ['saida', 'entrada', 'investimento'] },
              valor:     { type: 'number' },
              data:      { type: 'string' },
              categoria: { type: 'string', enum: CATEGORIAS },
              forma:     { type: 'string', enum: FORMAS },
              descricao: { type: 'string' },
              fixo:      { type: 'string' },
              confianca: { type: 'number' },
            },
            required: ['tipo', 'valor', 'data', 'categoria', 'forma', 'descricao', 'fixo', 'confianca'],
          },
        },
      },
      required: ['lancamentos'],
    },
  }],
  tool_choice: { type: 'tool', name: 'registrar_lancamentos' },
};

return [{ json: {
  ...src,
  categorias: CATEGORIAS,
  formas: FORMAS,
  cartoes: $('Ler cartões').all().map((i) => i.json),
  fixos: $('Ler gastos fixos').all().map((i) => i.json),
  payload,
}}];
