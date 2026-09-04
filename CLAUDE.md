# Bot de gastos da casa — o que saber antes de mexer

Bot no Telegram que registra os gastos da casa numa planilha do Google, com um
dashboard estático por cima. Roda em produção desde 03/09/2026, para duas
pessoas de verdade (Vini e Lidia). Não é protótipo: erro aqui some com
lançamento de dinheiro real.

`Grupo do Telegram → n8n (Oracle Always Free) → Gemini → Google Sheets → dashboard`

## As duas regras de negócio que mais confundem

**`competencia` é o mês em que o gasto CONTA. `competencia_fatura` é o mês em
que ele é PAGO.** São perguntas diferentes e ambas são gravadas em cada linha.

No cartão, "conta" segue o **ciclo da fatura**, não o dia da compra: com
fechamento no dia 26, uma compra de 27/08 e outra de 10/09 são a mesma fatura —
a que fecha em 26/09 — e as duas ficam em `competencia = 2026-09`. Essa mesma
compra de 27/08 só é paga na fatura que vence em 03/10, então
`competencia_fatura = 2026-10`.

Fora do cartão (Pix, dinheiro, débito) o dinheiro sai na hora: vale o mês da
data, sem ciclo. Um Pix em 27/08 conta em `2026-08`.

A conta vive em `competenciaCiclo()` e `competenciaFatura()`, em
[n8n/nos/validar.js](n8n/nos/validar.js). Os dias de fechamento e vencimento vêm
da aba `Cartoes` — adicionar cartão é editar a planilha, nunca o workflow.

**Dinheiro é determinístico.** O modelo propõe, o nó `Validar` decide: categoria
fora da lista vira `Outros`, forma não reconhecida vira `Não informado`, valor
não-positivo é descartado. Nunca mover decisão de dinheiro para o prompt.

## Como o código é organizado

Os code nodes vivem em `n8n/nos/*.js`, não dentro do JSON — JavaScript em string
JSON não sobrevive a revisão. O JSON é artefato gerado:

```bash
node scripts/montar-workflow.mjs          # regera os dois JSON de n8n/
node scripts/montar-workflow.mjs --check  # falha se estiverem desatualizados
node scripts/testar-nos.mjs               # 65 testes offline, ~1s, sem rede
node scripts/testar-dashboard.mjs         # 7 testes do dashboard, sem navegador
scripts/testar-parser.mjs                 # 43 mensagens contra o Gemini de verdade
```

Editou um code node? Regere o JSON e rode os dois primeiros. Mexeu em prompt,
categorias ou regra de fatura? Rode também o terceiro.

**Teste de code node precisa receber o que o nó anterior realmente entrega.**
Um bug chegou ao grupo (`apaguei undefined: − R$ NaN`) porque o teste alimentava
um nó pulando o Google Sheets que fica no meio — o Sheets devolve o resultado
dele e descarta o resto. Quando o dado precisa atravessar um nó que não o
preserva, o code node deve buscá-lo com `$('Nome do nó')`, não com `$input`.

## Deploy: só por CLI, e nesta ordem

A API REST do n8n exige uma key que só se cria na interface. O caminho é
`docker exec` na VM (`ssh ubuntu@137.131.174.32`):

```bash
n8n export:workflow --all --pretty --output=/home/node/.n8n/wf.json   # backup antes
n8n import:workflow --input=/home/node/.n8n/wf.json
n8n publish:workflow --id=<id>
docker restart n8n-n8n-1
```

Antes de importar, o JSON precisa de três coisas que o gerado pelo repo não tem:
o `id` do workflow (sem ele: `NOT NULL constraint failed`), os ids reais das
credenciais no lugar de `SUBSTITUA`, e — no workflow de ingestão — o
`webhookId` do Telegram Trigger, que o gerador já fixa.

Ids em produção: ingestão `ZqQV84ZudhX0QJvc`, exclusão `iaqjh23jv1jRrvOP`;
credenciais `RLZBJcW0B2v8wBSe` (Telegram) e `jQ75dsLoMCZRnGab` (Google).

**Depois do restart, espere a linha `Activated workflow` no log.** O `/healthz`
volta a 200 até dois minutos antes disso, e testar nessa janela dá 404 e parece
que deu errado.

## Armadilhas que já custaram uma tarde

- **`webhookId` do Telegram Trigger.** É ele que define a URL registrada no bot.
  Sem o campo, cada import cria outra rota, o Telegram segue batendo na antiga e
  o grupo fica mudo — com o workflow aparecendo *Published* e ativo. Só os logs
  dizem `unknown webhook`. Por isso é fixo no gerador.
- **Publicado e teste não coexistem** no Telegram Trigger. Com o workflow
  publicado, "Executar workflow" só rende erro no log; a mensagem do grupo roda
  em produção e aparece na aba Executions, nunca no canvas.
- **Abrir um nó do Google Sheets na interface estraga a configuração dele**, em
  silêncio: o campo da aba volta para "From list" e fica vazio, e o mapeamento
  pula de "Map Automatically" para manual sem colunas. Confira os dois antes de
  publicar.
- **Nunca apagar linha por posição.** O CSV que o dashboard lê tem minutos de
  atraso e a planilha também é editada à mão. Casar por `update_id` +
  `criado_em`, conferir valor e descrição, e excluir de baixo para cima.
- **O volume de dados pode não montar.** Antes de destruir qualquer VM, conferir
  `findmnt /opt/n8n-data` — houve um dia inteiro gravando no disco de boot.

## Infra

VM Oracle Always Free em `sa-saopaulo-1`, IP reservado `137.131.174.32`,
`https://n8n-financeiro-baimas.duckdns.org` atrás de um Caddy. Terraform em
`terraform/` (`make up`, `stop`, `down`, `recreate`). Shape atual
`VM.Standard.E2.1.Micro` — 1 GB de RAM, apertado; o A1.Flex não tem capacidade
na região (tentativa em 03/09 deu `Out of host capacity`).

Segredos em `terraform/terraform.tfvars`, fora do git. A `N8N_ENCRYPTION_KEY` é
insubstituível: sem ela, as credenciais guardadas no n8n viram lixo cifrado.
`scripts/guardar-segredos.sh` empacota tudo cifrado para guardar fora do Mac.

## Idioma

Tudo em português do Brasil, com acentos: código, comentários, mensagens de
commit, nomes de nós do n8n e o que o bot responde no grupo. Termos técnicos
sem tradução ficam no original (`commit`, `webhook`, `token`).
