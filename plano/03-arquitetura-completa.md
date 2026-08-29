# Arquitetura — SaaS de Controle de Gastos via Telegram

> Documento vivo. Versão visual publicada como artifact: "Blueprint do Agente de Gastos".
> Decisões tomadas em 28/08/2026 com o Vini.

## Decisões estruturantes

0. **O bot vive num grupo fechado do Telegram** com o Vini e a esposa, e só eles dois. Precisa receber e gravar mensagem dos dois.
1. **Escopo:** uso do casal primeiro, schema já multi-tenant (`household_id` em toda tabela + RLS). SaaS de verdade só na Fase 5.
2. **Fonte de verdade:** Postgres/Supabase. Google Sheets vira **espelho** gerado a partir do banco (`bot → banco → planilha`, nunca o contrário).
3. **Orquestração:** n8n (self-hosted) + LLM via API.
4. **Front:** Next.js lendo Supabase direto.
5. **Dinheiro é determinístico.** O LLM só (a) transforma texto em JSON estruturado e (b) narra números já calculados em SQL. Ele nunca soma.
6. **Todo lançamento nasce revisável:** guarda `raw_message`, `parse_confidence` e `status`.
7. **O tenant é a casa, não a pessoa.** `household_id` isola; `member_id` na transação registra quem lançou. Os dois enxergam tudo.

## O grupo — especificidades que só aparecem em grupo

- **BLOQUEADOR — privacy mode.** Bot em grupo, por padrão, só recebe comandos, replies a si mesmo e menções. Mensagem solta ("85 no mercado") NÃO chega ao webhook. Desligar no BotFather: `/setprivacy` → bot → **Disable**, depois **remover e readicionar o bot ao grupo**. Falha silenciosa: nada chega, nenhum erro.
- **Autorização em duas camadas:** `chat.id` == grupo da household E `from.id` ∈ `household_members`. Fora disso, descarta sem responder.
- **Triagem antes do LLM:** num grupo de casal passa conversa comum. Regex barata decide (tem número que parece dinheiro? é menção/reply ao bot?). Se não, descarta em silêncio — sem resposta, sem custo.
- **Resposta discreta:** gravou limpo → o bot só **reage com emoji** (`setMessageReaction`). Mensagem só quando há decisão ou alerta, sempre como *reply*. Confirmar tudo por mensagem transforma o grupo em log.
- **`callback_query` dos botões também é validado** por membro. Qualquer um dos dois pode corrigir o lançamento do outro.
- **Supergrupo:** se o grupo for promovido, o `chat_id` muda e vem um update com `migrate_to_chat_id`. Tratar atualizando `households.telegram_chat_id`, senão o bot emudece.
- **Saída de emergência (opcional):** lançamento mandado na DM do bot entra com `visibility='privado'` — soma no total, some da lista detalhada. Para presente de aniversário.
- **Tom:** o agente fala da casa ("gastamos", "sobrou"), não atribui gasto a pessoa a não ser que perguntem.

## Componentes

| Componente | Papel |
|---|---|
| Grupo do Telegram | Entrada única: bot + 2 membros. Texto, voz, foto de qualquer um dos dois. Botões inline para confirmar/corrigir. |
| n8n | 4 workflows separados: `ingest`, `ask`, `insights-cron`, `sheets-sync`. |
| LLM API | Structured output na ingestão; tool calling nas perguntas. Nunca vê a base inteira. |
| Postgres (Supabase) | Fonte de verdade + views de métricas + RLS. |
| Google Sheets | Espelho por mês (append + rebuild noturno a partir de uma view). |
| Next.js (Vercel) | Dashboard. |

## Fluxos

### ingest (mensagem → lançamento), alvo < 5s
1. Webhook com `secret_token` validado no header.
2. **Autorização**: `chat.id` do grupo + `from.id` em `household_members`. Outra combinação = descarte silencioso.
3. **Triagem**: sem número que pareça dinheiro e sem menção ao bot, descarta. Sem LLM aqui.
4. **Idempotência**: `update_id` do Telegram em `ingest_log` com PK única (evita duplicação por retentativa — bug nº1 desse tipo de bot).
5. Normalização: áudio → transcrição; foto → OCR/visão; texto direto.
6. Parse com structured output, recebendo categorias da household + regras aprendidas.
7. Regras determinísticas antes do insert (valor > 0, data válida, categoria existe, direção coerente).
8. Insert com `household_id`, `member_id` do remetente e `status = confirmed | pending`.
9. Retorno: reação de emoji quando gravou limpo; *reply* com total do mês e disponível quando há alerta ou dúvida.
10. Enfileira sync com Sheets (assíncrono, em lote — a API do Sheets tem cota por minuto).

Ramo de confirmação dispara quando: confiança baixa, valor fora do padrão da categoria, ou conta ausente.

### ask (pergunta)
Em grupo o bot só responde quando chamado: menção `@bot`, reply a ele, ou comando.
Agente com 7 ferramentas → n8n executa SQL parametrizado → modelo narra. Sem SQL livre.

### insights-cron
- Diário 21h: entradas/saídas do dia, disponível por dia até o fim do mês.
- Semanal (domingo): variação por categoria vs média móvel de 3 meses.
- Mensal (dia 1º): taxa de poupança, dívidas, objetivos.

### sheets-sync
Append a cada lançamento confirmado + rebuild noturno da aba do mês corrente (o rebuild corrige qualquer divergência).

## Modelo de dados

Regras: valores em **centavos como `bigint`** (nunca float), `timestamptz` em tudo, `household_id` em toda tabela.

Tabelas: `households`, `household_members`, `accounts`, `categories`, `transactions`, `ingest_log`, `recurring_rules`, `budgets`, `debts`, `debt_payments`, `goals`, `agent_facts`.

`households`: `id, nome, telegram_chat_id (unique, negativo para grupos), timezone`.
`household_members`: `id, household_id, telegram_user_id (from.id), nome, auth_user_id, papel(dono|membro), ativo` — unique `(household_id, telegram_user_id)`.

`transactions` (núcleo): `id, household_id, member_id, occurred_at, amount_cents, direction(in|out), category_id, account_id, merchant, descricao, installment_no/total, source, raw_message, parse_confidence, status(pending|confirmed|rejected), visibility(casa|privado), created_at`. Índices em `(household_id, occurred_at desc)`, `(household_id, category_id, occurred_at desc)` e `(household_id, member_id, occurred_at desc)`.

`ingest_log`: `update_id (PK), household_id, member_id, transaction_id, outcome(gravado|triado|ignorado|erro), received_at`.

Views: `v_mes_atual`, `v_categoria_mes`, `v_run_rate`, `v_comprometimento`, `v_objetivo_progresso`.

O SQL completo está no artifact (seção 04).

## O agente

**Não é fine-tuning.** "Treinar" aqui = montar contexto em 4 camadas:
- **Perfil** (renda somada da casa, fixos, dívidas, objetivos, nomes dos dois membros) — query a cada chamada.
- **Regras aprendidas** — tabela `agent_facts`, alimentada pelas correções do usuário.
- **Ferramentas** — SQL parametrizado em nós do n8n.
- **Números** — views prontas entram no prompt.

Ferramentas: `registrar_lancamento`, `corrigir_lancamento`, `consultar_periodo`, `consultar_categoria`, `status_dividas`, `progresso_objetivo`, `projecao_mes`.

Contrato do parser (JSON): `direction, amount_cents, occurred_at, category, account, merchant, descricao, installment, confidence, ambiguidade`.

Guardrails: nunca inventar campo (null + confiança baixa); categoria só da lista; datas relativas no fuso America/Sao_Paulo; "recebi/caiu/entrou" = `in`; parcelamento gera um lançamento por parcela; ao narrar, sempre citar período e base de comparação; nunca dar conselho de investimento. Tom: alertar só quando um limite foi cruzado — silêncio é informação.

## Catálogo de insights (tudo em SQL)

Taxa de poupança · Disponível por dia · Projeção de fechamento · Variação por categoria vs média 3m · Gasto atípico (>p90 da categoria) · Assinaturas detectadas · Comprometimento de renda (parcelas/renda) · Data de quitação (avalanche vs bola de neve) · Ritmo do objetivo · Quebra por membro (sob demanda).

## Custo (consultado em ago/2026)

- Telegram: grátis
- n8n self-hosted em VPS: ~US$5–12/mês (n8n Cloud Starter = €20/mês, 2.500 execuções)
- Supabase: Free (500MB, pausa após 1 semana inativo) → Pro US$25 (8GB, sem pausa)
- LLM: Gemini Flash-Lite $0,30/$2,50 por M tokens; Claude Haiku $1/$5 → < US$2/mês nesse volume
- Vercel Hobby: grátis

**MVP pessoal: US$5–15/mês**, dominado pelo VPS.

## Roadmap

| Fase | Prazo | Entrega | Pronto quando |
|---|---|---|---|
| 0 | 1 fim de semana | Bot no grupo com privacy mode OFF, membros cadastrados, triagem, parse, insert | Qualquer um dos dois manda "85 mercado" no grupo e vira registro com autor certo em < 5s |
| 1 | Semana 2 | Categorias, correção inline, idempotência, datas relativas, parcelamento, sync Sheets | 1 semana sem consertar nada na planilha |
| 2 | Semanas 3–4 | Views + dashboard Next.js | Responde "quanto gastei em lazer em julho" pela tela |
| 3 | Mês 2 | Dívidas, objetivos, crons de insight | O bot avisa do estouro antes de você perceber |
| 4 | Mês 3 | Agente conversacional + memória | Perguntas livres com números que batem com o SQL |
| 5 | Após 60–90 dias de uso | Auth, RLS validada com 2 households, onboarding (criar casa + adicionar bot ao grupo + vincular membros por código), cobrança, LGPD | Outro casal cria a household e registra o 1º gasto sozinho |

## Riscos

- **Privacy mode ligado** → bot não recebe nada no grupo, sem erro visível. Primeiro item a checar.
- **Grupo virando supergrupo** → `chat_id` muda; tratar `migrate_to_chat_id`.
- Duplicação por retentativa do Telegram → `ingest_log` com chave única.
- Webhook aberto → validar `secret_token` + `chat.id` + `from.id`.
- Segredos no n8n → usar credentials, workflow no Git sem elas.
- Deriva do parser → suite de 30 mensagens reais, rodada a cada mudança de prompt.
- Backup → `pg_dump` semanal para bucket.
- LGPD na Fase 5 → base legal, política, criptografia em repouso, exclusão de conta.

## Fora do escopo inicial (deliberado)

Open Finance/agregadores (custo + regulatório; o Telegram captura a *intenção*, que o extrato não tem) · App mobile nativo (o Telegram já é) · Importação OFX (conciliação, não entrada primária) · Fine-tuning.
