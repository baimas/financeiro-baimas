# IA Controle de Gastos

Bot no Telegram que registra os gastos da casa numa planilha, com um dashboard
web por cima. Uso pessoal, custo zero.

**Arquitetura ativa:** `Grupo do Telegram → n8n → Gemini → Google Sheets → dashboard estático`

Comece por `plano/01-mvp-simples.md` e siga o roteiro em
`docs-visuais/guia-mvp.html` (abra no navegador).

## O que tem aqui

```
plano/           as decisões e a pesquisa, em markdown
docs-visuais/    os mesmos documentos em HTML, com diagramas e tabelas
terraform/       a infra na Oracle Cloud Always Free — make up / stop / down
n8n/             o workflow de ingestão; os code nodes ficam em n8n/nos/*.js
dashboard/       a página que lê a planilha publicada em CSV
planilha/        as cinco abas, com modelo e instruções
stack-manual/    docker-compose e Caddyfile, para subir sem Terraform
local/           n8n de ensaio no seu computador, sem HTTPS e sem VM
scripts/         checar o bot, testar o parser e abrir o dashboard sem planilha
testes/          32 mensagens reais com o resultado esperado
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
node scripts/testar-nos.mjs        # 15 testes offline dos code nodes, ~1s
cd terraform && make init && terraform validate
cd local && cp env.example .env && docker compose up -d   # n8n em localhost:5678
```

**2. Chave do Gemini** — [AI Studio](https://aistudio.google.com/apikey), grátis,
2 minutos. Com ela, a suíte de mensagens roda:

```bash
export GEMINI_API_KEY=AIza...
scripts/testar-parser.mjs          # 32 mensagens reais contra o parser de verdade
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
`dashboard/index.html` e publicar no GitHub Pages. Para ver a página funcionando
antes de existir planilha, com lançamentos de exemplo:

```bash
scripts/dashboard-local.sh         # http://localhost:8899
```

## As duas armadilhas

- **Privacy mode do BotFather.** Se ficar ligado, a mensagem nunca chega ao
  webhook e nenhum erro aparece em lugar nenhum. `scripts/checar-bot.sh` existe
  exatamente para isso.
- **iptables da Oracle.** Abrir 80/443 na security list não basta; as imagens
  Ubuntu descartam tudo. O cloud-init do Terraform já resolve.

## Nunca perca

`N8N_ENCRYPTION_KEY` — é ela que cifra as credenciais do Telegram e do Google
dentro do n8n. Se mudar, você refaz todas.

## Mexendo no workflow

Os code nodes vivem em `n8n/nos/*.js`, não dentro do JSON. Depois de editar:

```bash
node scripts/montar-workflow.mjs      # regera n8n/gastos-ingestao.n8n.json
node scripts/testar-nos.mjs           # 31 testes offline, ~1s
scripts/testar-parser.mjs             # 43 mensagens contra o Gemini
```

Os dois scripts de teste leem o workflow e executam os **próprios code nodes**
num sandbox — o que eles aprovam é o que roda em produção. Mudou o prompt, as
categorias ou a regra de fatura? Rode os dois antes de ativar.

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
