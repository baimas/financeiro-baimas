# MVP simples — arquitetura decidida em 29/08/2026

> **Esta é a arquitetura ativa.** Substitui o desenho com Postgres de `arquitetura.md`, que fica como referência para uma eventual Fase 2.
> Guia visual publicado como artifact: "MVP em Um Fim de Semana". Arquivos entregues no chat.

## Stack

`Grupo do Telegram → n8n → Claude → Google Sheets → dashboard estático`

Sem banco, sem multi-tenant, sem dívidas/objetivos. **Custo quase zero.**

| Peça | Escolha | Custo |
|---|---|---|
| Entrada | Grupo do Telegram com o casal + bot | R$ 0 |
| Orquestração | n8n em Docker na **Oracle Cloud Always Free** (ARM A1.Flex; fallback E2.1.Micro com 2 GB de swap) | R$ 0 |
| HTTPS | Caddy + DuckDNS + Let's Encrypt | R$ 0 |
| LLM | Claude Haiku 4.5, via HTTP Request forçando uma ferramenta (`tool_choice`) para extração estruturada | poucos centavos de dólar/mês, nesse volume |
| Banco | Uma aba `Lancamentos` no Google Sheets | R$ 0 |
| Dashboard | HTML estático no GitHub Pages lendo o CSV publicado | R$ 0 |

## Planilha — cinco abas

`Lancamentos` (o bot escreve) + `Cartoes`, `GastosFixos`, `Dividas` e `PLR` (mantidas à mão). Detalhes e cabeçalhos em `planilha/README.md`.

`Lancamentos`: `update_id, data, competencia, competencia_fatura, criado_em, tipo, valor, categoria, forma, descricao, pessoa, fixo, mensagem, confianca`

- **Duas competências, duas perguntas.** `competencia` = mês do gasto, responde "quanto consumimos em agosto". `competencia_fatura` = mês em que a fatura vence, responde "quanto sai da conta em setembro". A planilha da casa sempre pensou nas duas.
- `forma` = um cartão da aba `Cartoes`, ou Débito/Pix/Dinheiro/VA/Boleto. **Os cartões saem da planilha, não do código**: adicionar um cartão é adicionar uma linha.
- `tipo` = `saida|entrada|investimento`. Aporte não é gasto e não entra em "para onde foi o dinheiro".
- `fixo` = nome do gasto fixo que a linha quitou. A categoria vem da aba `GastosFixos`, não do modelo — sem isso a mesma conta cairia em Assinaturas num mês e Moradia no outro.
- `valor` sempre positivo, ponto decimal.
- Publicar cada aba em **Arquivo → Compartilhar → Publicar na web → CSV** e colar as URLs no objeto `CSV` do dashboard.

## Workflow n8n — 10 nós

`Telegram Trigger → Triagem → Ler cartões → Ler gastos fixos → Montar prompt → Claude → Validar → Gravar na planilha → Resumo da resposta → Confirmar no grupo`

Os code nodes vivem em `n8n/nos/*.js` e `scripts/montar-workflow.mjs` gera o JSON. JavaScript dentro de string JSON não se mantém: sem destaque de sintaxe, sem `node --check`, e um `\n` errado quebra tudo em silêncio.

- **Triagem** (Code): valida `chat.id` + `from.id`, idempotência via `$getWorkflowStaticData` (últimos 300 `update_id`), descarta mensagem sem número — antes de gastar LLM **e antes de ler a planilha**, resolve hoje em `America/Sao_Paulo` com `toLocaleDateString('sv-SE')`.
- **Ler cartões / Ler gastos fixos** (Sheets, `executeOnce`): as duas abas de configuração. Sem `executeOnce` o nó rodaria uma vez por item de entrada e leria a aba N vezes.
- **Montar prompt** (Code): monta o prompt e o `input_schema` da ferramenta com os enums vindos da planilha.
- **O schema é uma lista.** "padaria 12 e farmacia 30" são dois lançamentos. Com um lançamento só, o modelo ou somava os dois numa categoria errada (42 em Alimentação) ou desistia — e o gasto sumia sem aviso.
- **Resumo da resposta** (Code): uma mensagem só no grupo, mesmo com vários gastos. Confirmar cada lançamento separado transformaria o grupo num log.
- **Claude** (HTTP Request): chave via `{{ $env.ANTHROPIC_API_KEY }}` — nunca dentro do workflow, dá para versionar o JSON. Extração estruturada por `tool_choice` forçado numa ferramenta só, não por prompt pedindo JSON — o modelo não tem como devolver texto solto em vez do formato esperado.
- **Validar** (Code): rejeita valor ≤ 0, força categoria e forma às listas (aceitando o que o modelo mandar sem acento), casa o gasto fixo e calcula as duas competências.
- **Gravar na planilha**: append com `autoMapInputData` (as chaves do JSON batem com os cabeçalhos). Credencial por **service account**, não OAuth: app OAuth em modo de teste expira o refresh token em 7 dias e o bot pararia de gravar sozinho no dia 8. Basta compartilhar a planilha com o e-mail da conta de serviço.
- Escolha deliberada: **HTTP Request em vez dos nós LangChain** — menos peças, independente de versão, schema da ferramenta visível e editável.

### Duas constantes a ajustar em `n8n/nos/triagem.js`
`CHAT_ID` (id negativo do grupo) e `MEMBROS` (`from.id` → nome). Cartões, formas de pagamento e gastos fixos **não** são constantes: saem da planilha.
Descobrir os ids sem subir nada: `scripts/checar-bot.sh <token>`.

## Testes

`scripts/testar-nos.mjs` — 31 testes offline (sem rede, sem chave, ~1s): autorização, idempotência, descarte sem dígito, valor ≤ 0, categoria e forma fora da lista, gasto fixo, ciclo de fatura nos quatro cartões, resumo no grupo, e se as chaves da linha ainda batem com as colunas da planilha.

`scripts/testar-parser.mjs` — as 43 mensagens de `testes/mensagens.jsonl` contra o Claude de verdade, incluindo os falsos positivos ("te amo 3000", "vou pagar o aluguel amanha").

Três regras do prompt nasceram de falha real da suíte: forma citada uma vez vale para todos os gastos da mensagem; intenção futura não é lançamento; compra parcelada é.

Nenhum dos dois reimplementa o prompt: eles leem o workflow e executam os próprios code nodes num sandbox. Rodar sempre que mexer no prompt ou nas categorias.

## Bloqueadores conhecidos

1. **Privacy mode do BotFather** — `/setprivacy` → Disable, e **remover/readicionar o bot ao grupo**. Falha silenciosa: nada chega, nenhum erro.
2. **iptables da Oracle** — abrir 80/443 na Security List não basta; as imagens Ubuntu descartam tudo. `iptables -I INPUT 6 ... ACCEPT` + `netfilter-persistent save`. Sem isso o Let's Encrypt não emite cert.
3. **Dashboard precisa de http(s)** — abrir por `file://` bloqueia a leitura do CSV do Google. GitHub Pages resolve.
4. **Duplicata** — se o container reiniciar, a memória do workflow zera. Achar pelo `update_id` repetido e apagar a linha.

## Privacidade

"Publicar na web" gera URL pública sem senha. Aceitável para uso pessoal; se incomodar, trocar por Apps Script Web App restrita à conta.

## Backlog (só depois de 2 semanas seguidas lançando sem falhar)

1. Áudio e foto de comprovante (nó que baixa o arquivo do Telegram antes do Claude).
2. Resumo diário às 21h (segundo workflow com Schedule Trigger).
3. Correção de categoria por botão inline.
4. Perguntas em linguagem natural — é aqui que o Sheets aperta e o Postgres do blueprint original passa a valer.

**Critério de parada:** se o hábito de lançar não pegar em duas semanas, nenhuma funcionalidade extra salva o projeto.
