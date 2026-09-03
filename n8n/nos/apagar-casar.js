// Onde a exclusão fica segura: o dashboard diz QUAIS lançamentos, nunca em que
// linha eles estão.
//
// O CSV que a página leu tem minutos de atraso e o bot pode ter gravado mais
// linhas nesse intervalo — apagar pela posição que a tela viu apagaria outra
// coisa. Aqui cada chave é casada contra a planilha lida agora, e valor e
// descrição ainda são conferidos antes de qualquer exclusão.

const pedido = $('Conferir pedido').first().json;
const linhas = $input.all().map((i) => i.json);

const norm = (v) => String(v ?? '').trim();
const centavos = (v) => {
  const bruto = String(v ?? '').replace(/[R$\s]/g, '');
  // "1.234,56" e "1234.56" são o mesmo dinheiro
  const limpo = bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto;
  const n = Number(limpo);
  return isFinite(n) ? Math.round(n * 100) : NaN;
};

const achadas = [];
const perdidas = [];

for (const chave of pedido.chaves || []) {
  const mesmaOrigem = linhas.filter(
    (l) => norm(l.update_id) === chave.update_id && norm(l.criado_em) === chave.criado_em,
  );
  const casadas = mesmaOrigem.filter(
    (l) => centavos(l.valor) === centavos(chave.valor) && norm(l.descricao) === chave.descricao,
  );
  const linha = casadas.length === 1 ? Number(casadas[0].row_number) : 0;

  if (linha >= 2) {
    achadas.push({ ...chave, row_number: linha });
  } else {
    perdidas.push({
      ...chave,
      motivo: casadas.length > 1 ? 'mais de uma linha idêntica' : 'não encontrada na planilha',
    });
  }
}

// De baixo para cima: apagar a linha 5 antes da 9 faria a 9 virar 8.
achadas.sort((a, b) => b.row_number - a.row_number);

// Um item sempre sai daqui: sem ele o fluxo morreria antes de responder ao
// dashboard, que ficaria esperando até o timeout.
if (!achadas.length) return [{ json: { nada: true, perdidas } }];
return achadas.map((a) => ({ json: { ...a, nada: false, perdidas } }));
