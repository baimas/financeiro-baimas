// Decide o que "apagar" quer dizer, e acha as linhas na planilha lida agora.
//
// Dois jeitos de pedir, e a diferença importa: respondendo a uma mensagem, o
// alvo é aquele lançamento, de qualquer dia; sem responder nada, o alvo é o
// último que a própria pessoa registrou. Ninguém apaga o lançamento do outro
// sem apontar para ele.

const src = $('Triagem').first().json;
const linhas = $input.all().map((i) => i.json);
const mapa = $getWorkflowStaticData('global').confirmacoes || {};

const norm = (v) => String(v ?? '').trim().toLowerCase();
const centavos = (v) => {
  const bruto = String(v ?? '').replace(/[R$\s]/g, '');
  const limpo = bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto;
  const n = Number(limpo);
  return isFinite(n) ? Math.round(n * 100) : NaN;
};
const chaveDe = (l) => ({
  update_id: String(l.update_id), criado_em: String(l.criado_em),
  valor: l.valor, descricao: l.descricao,
});

let chaves = [];
let alvo = '';

if (src.responde_a) {
  chaves = mapa[String(src.responde_a)] || [];
  alvo = 'o lançamento dessa mensagem';
  if (!chaves.length) {
    return [{ json: { nada: true, ...src,
      recado: 'não sei a que lançamento essa mensagem se refere. '
            + 'Responda à confirmação de um gasto recente, ou apague pelo dashboard.' } }];
  }
} else {
  const suas = linhas.filter((l) => norm(l.pessoa) === norm(src.pessoa));
  if (!suas.length) {
    return [{ json: { nada: true, ...src, recado: 'não achei nenhum lançamento seu para apagar.' } }];
  }
  // a última mensagem sua, com todos os gastos que ela gerou
  const ultima = suas.reduce((a, b) => (String(a.criado_em) > String(b.criado_em) ? a : b));
  chaves = suas.filter((l) => String(l.update_id) === String(ultima.update_id)).map(chaveDe);
  alvo = 'seu último lançamento';
}

// Mesmo com a chave em mãos, confere valor e descrição: a planilha é editada à
// mão também, e apagar a linha errada é pior que não apagar nada.
const achadas = [];
for (const chave of chaves) {
  const casadas = linhas.filter(
    (l) => String(l.update_id) === String(chave.update_id)
        && String(l.criado_em) === String(chave.criado_em)
        && centavos(l.valor) === centavos(chave.valor)
        && norm(l.descricao) === norm(chave.descricao),
  );
  if (casadas.length === 1 && Number(casadas[0].row_number) >= 2) {
    achadas.push({ ...chave, row_number: Number(casadas[0].row_number), linha: casadas[0] });
  }
}

if (!achadas.length) {
  return [{ json: { nada: true, ...src,
    recado: 'esse lançamento não está mais na planilha — alguém já apagou.' } }];
}

// de baixo para cima, senão o primeiro delete faz os números seguintes escorregarem
achadas.sort((a, b) => b.row_number - a.row_number);
return achadas.map((a) => ({ json: { ...a, nada: false, alvo, ...src } }));
