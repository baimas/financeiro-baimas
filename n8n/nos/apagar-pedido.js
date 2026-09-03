// Porta de entrada da exclusão pedida pelo dashboard.
//
// O repositório é público e a URL deste webhook está no dashboard/index.html,
// à vista de qualquer um. Quem autoriza é o token: ele existe no ambiente do
// n8n e no navegador de quem usa, nunca em arquivo versionado.

const req = $input.first().json;
const cabecalhos = req.headers || {};
const corpo = req.body || {};

const enviado = String(cabecalhos['x-dashboard-token'] || '').trim();
const esperado = String($env.DASHBOARD_TOKEN || '').trim();

// Servidor sem token configurado não apaga nada. O contrário — aceitar tudo
// enquanto falta configuração — transformaria um esquecimento em porta aberta.
//
// O mínimo é 8 porque o segredo é digitado no celular, e um que ninguém
// consegue digitar acaba não sendo usado. Ele não é a única barreira: mesmo com
// o token, só some a linha cujo update_id e criado_em o pedido acertar por
// inteiro — não dá para varrer a planilha às cegas.
const autorizado = esperado.length >= 8 && enviado === esperado;

// Teto de 50 por pedido: engano na tela não vira estrago em massa.
const chaves = (Array.isArray(corpo.chaves) ? corpo.chaves : [])
  .slice(0, 50)
  .map((c) => ({
    update_id: String(c.update_id ?? '').trim(),
    criado_em: String(c.criado_em ?? '').trim(),
    valor: String(c.valor ?? '').trim(),
    descricao: String(c.descricao ?? '').trim(),
  }))
  .filter((c) => c.update_id && c.criado_em);

const motivo = autorizado
  ? ''
  : (esperado ? 'token invalido' : 'DASHBOARD_TOKEN nao configurado no n8n');

return [{ json: { autorizado, motivo, chaves, pedidas: chaves.length } }];
