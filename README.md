# IA Controle de Gastos

Bot no Telegram que registra os gastos da casa numa planilha, com um dashboard
web por cima. Uso pessoal, custo zero.

**Arquitetura ativa:** `Grupo do Telegram → n8n → Gemini → Google Sheets → dashboard estático`

**No ar desde 03/09/2026.** O primeiro lançamento de verdade — "Mercado 20,00
Nubank Vini" no grupo — virou linha na aba `Lancamentos` com a competência e a
fatura certas, e o bot respondeu citando a mensagem. O n8n roda numa VM
Always Free da Oracle atrás de um Caddy com HTTPS.

Comece por `plano/01-mvp-simples.md` e siga o roteiro em
`docs-visuais/guia-mvp.html` (abra no navegador).

## O que tem aqui

```
plano/           as decisões e a pesquisa, em markdown
docs-visuais/    os mesmos documentos em HTML, com diagramas e tabelas
terraform/       a infra na Oracle Cloud Always Free — make up / stop / down
n8n/             os dois workflows; os code nodes ficam em n8n/nos/*.js
dashboard/       a página que lê a planilha publicada em CSV
planilha/        as cinco abas, com modelo e instruções
stack-manual/    docker-compose e Caddyfile, para subir sem Terraform
local/           n8n de ensaio no seu computador, sem HTTPS e sem VM
scripts/         checar o bot, testar o parser e abrir o dashboard sem planilha
testes/          43 mensagens reais com o resultado esperado
```

### plano/

| Arquivo | O que responde |
|---|---|
| `01-mvp-simples.md` | **A arquitetura que vale hoje.** Stack, planilha, workflow, bloqueadores |
| `02-infra-terraform.md` | Como o Terraform está organizado e por quê |
| `03-arquitetura-completa.md` | O desenho com Postgres e multi-tenant — referência para uma Fase 2, não é o que está sendo construído |
| `04-concorrentes.md` | O que já existe no mercado e quanto custa |
| `05-custo-para-competir.md` | Quanto custaria virar produto e por que a barreira não é técnica |

## Ordem de execução

A ideia é simples: **cada erro deve aparecer no lugar mais barato possível**.
Erro de código aparece na sua máquina, não em cima de uma VM com o DNS já
apontado.

**1. Ensaio, sem conta nenhuma** — já feito e versionado:

```bash
node scripts/testar-nos.mjs        # 43 testes offline dos code nodes, ~1s
cd terraform && make init && terraform validate
cd local && cp env.example .env && docker compose up -d   # n8n em localhost:5678
```

**2. Chave do Gemini** — [AI Studio](https://aistudio.google.com/apikey), grátis,
2 minutos. Com ela, a suíte de mensagens roda:

```bash
export GEMINI_API_KEY=AIza...
scripts/testar-parser.mjs          # 43 mensagens reais contra o parser de verdade
```

**3. Bot e grupo** — BotFather, `/setprivacy` → **Disable**, criar o grupo,
adicionar o bot. Se o bot já estava no grupo, remova e adicione de novo.
Mande `teste 85 mercado` no grupo e prove que chegou:

```bash
scripts/checar-bot.sh <token-do-bot>
```

Ele imprime `CHAT_ID` e `MEMBROS` prontos para colar no nó *Triagem e prompt*.
**Não pule este passo**: é o bloqueador nº 1 do projeto e custa um curl.

**4. Planilha** — cinco abas: `Lancamentos` (o bot escreve), `Cartoes`,
`GastosFixos`, `Dividas` e `PLR` (você mantém). O passo a passo está em
`planilha/README.md`. Criar a service account no Google Cloud, habilitar a API
do Sheets e **compartilhar a planilha com o e-mail dela**.

**5. Infra** — `cd terraform && cp terraform.tfvars.example terraform.tfvars`,
preencher, `make plan` (ler o plano) e `make up`. Assim que o certificado sair,
**abra o domínio e crie a conta de dono do n8n imediatamente**.

**6. Workflow** — importar `n8n/gastos-ingestao.n8n.json`, ligar as credenciais,
colar `CHAT_ID` e `MEMBROS` no nó *Triagem e prompt*, ativar.

**7. Dashboard** — colar as URLs dos CSVs publicados no objeto `CSV` dentro de
`dashboard/index.html` e publicar no GitHub Pages. Para apagar lançamentos pela
página, importe também `n8n/apagar-lancamentos.n8n.json`, ligue a credencial do
Google e preencha `dashboard_token` no `terraform.tfvars` — sem esse segredo o
webhook recusa tudo e as caixinhas não aparecem. Para ver a página funcionando
antes de existir planilha, com lançamentos de exemplo:

```bash
scripts/dashboard-local.sh         # http://localhost:8899
```

## As armadilhas

Todas custaram tempo de verdade. As duas primeiras aparecem antes de existir
VM; as outras três só depois que tudo já está no ar.

- **Privacy mode do BotFather.** Se ficar ligado, a mensagem nunca chega ao
  webhook e nenhum erro aparece em lugar nenhum. `scripts/checar-bot.sh` existe
  exatamente para isso.
- **iptables da Oracle.** Abrir 80/443 na security list não basta; as imagens
  Ubuntu descartam tudo. O cloud-init do Terraform já resolve.
- **Publicado e teste não coexistem** no Telegram Trigger. Com o workflow
  publicado, "Executar workflow" só rende `n8n can't listen for test executions
  at the same time as listening for production ones` nos logs. A mensagem do
  grupo roda em produção e aparece na aba **Executions**, nunca no canvas. E
  depois de testar em unpublish, **republique**.
- **Abrir um nó do Google Sheets na interface estraga a configuração dele**, em
  silêncio: o campo da aba volta para "From list" e fica vazio
  (`Sheet with name  not found`), e o mapeamento pula de "Map Automatically"
  para manual sem nenhuma coluna (`At least one value has to be added under
  'Values to Send'`). Depois de mexer num nó do Sheets, confira os dois campos
  antes de publicar.
- **O volume de dados pode não montar.** `/dev/oracleoci/oraclevdb` não existe
  em toda imagem; quando falta, o n8n sobe gravando no disco de boot, que morre
  com a instância. O cloud-init agora procura pelo LABEL `n8ndados` e falha alto
  se não montar — mas antes de destruir qualquer VM, confira
  `findmnt /opt/n8n-data`.

## Nunca perca

`N8N_ENCRYPTION_KEY` — é ela que cifra as credenciais do Telegram e do Google
dentro do n8n. Se mudar, você refaz todas.

## Mexendo no workflow

Os code nodes vivem em `n8n/nos/*.js`, não dentro do JSON. Depois de editar:

```bash
node scripts/montar-workflow.mjs      # regera os dois JSON de n8n/
node scripts/testar-nos.mjs           # 43 testes offline, ~1s
scripts/testar-parser.mjs             # 43 mensagens contra o Gemini
```

Os dois scripts de teste leem o workflow e executam os **próprios code nodes**
num sandbox — o que eles aprovam é o que roda em produção. Mudou o prompt, as
categorias ou a regra de fatura? Rode os dois antes de ativar.

## Apagar um lançamento

Pelo dashboard: marque as caixinhas na tabela do mês e clique em *Apagar
selecionados*. O navegador pede o segredo uma vez e o guarda; quem apaga é o
webhook `POST /webhook/apagar-lancamentos` no n8n, porque uma página estática
não tem — nem deve ter — credencial de escrita na planilha.

A página **nunca diz em que linha** o lançamento está: o CSV publicado tem
minutos de atraso e o bot pode ter gravado outras linhas nesse intervalo. Ela
manda `update_id` + `criado_em`, e o n8n procura na planilha lida naquele
instante, conferindo valor e descrição antes de excluir. Divergiu, não apaga.

Sem `DASHBOARD_TOKEN` no ambiente do n8n, o webhook recusa tudo — esquecer de
configurar não vira porta aberta. O segredo não está no repositório, que é
público: ele vive no `terraform.tfvars` e no navegador de quem usa.

Pela planilha, sempre dá: exclua a linha inteira na aba `Lancamentos`. O
`update_id` é o mesmo para todos os lançamentos de uma mesma mensagem.

## Operação, com a VM no ar

```bash
cd terraform && make ssh          # entra na máquina
cd terraform && make logs         # logs do n8n e do Caddy
cd terraform && make stop/start   # desliga e religa sem destruir nada
```

Os logs do n8n são o melhor lugar para ver o que aconteceu com uma mensagem:
`sudo docker logs --timestamps --since 10m n8n-n8n-1`. A VM está em UTC e o
grupo em São Paulo — três horas de diferença. O Caddy só registra erros, então
um webhook que deu certo não aparece nos logs dele.

Dá para consertar o workflow **sem abrir a interface** (a API REST não serve: a
key dela só se cria na UI):

```bash
sudo docker exec n8n-n8n-1 n8n export:workflow --all --pretty --output=/home/node/.n8n/wf.json
# edite o JSON
sudo docker exec n8n-n8n-1 n8n import:workflow --input=/home/node/.n8n/wf.json
sudo docker exec n8n-n8n-1 n8n publish:workflow --id=<id>
```

As credenciais sobrevivem ao import — o workflow guarda só o id delas. O import
derruba a publicação, por isso o `publish:workflow` no fim.

O nó do Gemini tem timeout de 120 s e três tentativas de propósito: o
`flash-lite` respondeu à mesma chamada de duas palavras em 1,4 s, 7,7 s e 29 s
no mesmo minuto, e devolve 503 quando está sobrecarregado. Não baixe esse
timeout.

## O que o bot entende

| Você manda | Vira |
|---|---|
| `85 no mercado` | uma saída, categoria Mercado |
| `padaria 12 e farmacia 30` | **dois** lançamentos, não um de 42 |
| `mercado 85 e uber 23 no pix` | dois lançamentos, ambos no Pix |
| `gasolina 200 no nubank` | saída no cartão, na fatura certa |
| `paguei a internet 150 no debito` | quita o fixo `Internet`, categoria vinda da planilha |
| `apliquei 400 na reserva` | investimento, que não conta como gasto |
| `caiu o salário 7000` | entrada |
| `vou pagar o aluguel amanha` | nada — intenção futura não é lançamento |
| `te amo 3000` | nada |

## Critério de parada

Se vocês dois não conseguirem lançar por duas semanas seguidas, o problema não
é de funcionalidade e nenhuma feature nova resolve. Descobrir isso custa um fim
de semana — é o objetivo do MVP.
