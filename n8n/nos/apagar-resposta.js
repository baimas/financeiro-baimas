// Uma resposta só para o dashboard, valha o pedido ter sido negado, ter vindo
// vazio ou ter apagado linhas. Os três caminhos chegam neste nó, então cada
// leitura de nó anterior é protegida: no ramo negado, "Casar linhas" nem rodou.

const ler = (nome, padrao) => {
  try { return $(nome).first().json; } catch (e) { return padrao; }
};

const pedido = ler('Conferir pedido', { autorizado: false, motivo: 'pedido não chegou', pedidas: 0 });

if (!pedido.autorizado) {
  return [{ json: { ok: false, status: 401, motivo: pedido.motivo || 'não autorizado', apagados: 0 } }];
}

let casadas = [];
try {
  casadas = $('Casar linhas').all().map((i) => i.json).filter((c) => !c.nada);
} catch (e) { /* ninguém casou: segue com zero */ }

const perdidas = (ler('Casar linhas', {}).perdidas) || [];

return [{ json: {
  ok: true,
  status: 200,
  pedidos: pedido.pedidas || 0,
  apagados: casadas.length,
  // o dashboard usa esta lista para tirar as linhas da tela na hora: o CSV
  // publicado só vai refletir a exclusão alguns minutos depois
  apagadas: casadas.map((c) => ({ update_id: c.update_id, criado_em: c.criado_em })),
  nao_encontrados: perdidas,
} }];
