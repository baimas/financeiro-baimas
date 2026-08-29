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
n8n/             o workflow de ingestão, pronto para importar
dashboard/       a página que lê a planilha publicada em CSV
planilha/        o cabeçalho da aba Lancamentos
stack-manual/    docker-compose e Caddyfile, para subir sem Terraform
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

1. **Bot** — BotFather, `/setprivacy` → **Disable**, criar o grupo, adicionar o bot.
   Se o bot já estava no grupo, remova e adicione de novo.
2. **Planilha** — aba `Lancamentos` com o cabeçalho de `planilha/`, publicar como CSV.
3. **Chave do Gemini** — Google AI Studio.
4. **Infra** — `cd terraform && cp terraform.tfvars.example terraform.tfvars`, preencher, `make init && make plan && make up`.
5. **Workflow** — importar `n8n/gastos-ingestao.n8n.json`, ligar as credenciais,
   ajustar `CHAT_ID` e `MEMBROS` no nó *Triagem e prompt*, ativar.
6. **Dashboard** — colar a URL do CSV em `CSV_URL` dentro de `dashboard/index.html`
   e publicar no GitHub Pages.

## As duas armadilhas

- **Privacy mode do BotFather.** Se ficar ligado, a mensagem nunca chega ao
  webhook e nenhum erro aparece em lugar nenhum.
- **iptables da Oracle.** Abrir 80/443 na security list não basta; as imagens
  Ubuntu descartam tudo. O cloud-init do Terraform já resolve.

## Nunca perca

`N8N_ENCRYPTION_KEY` — é ela que cifra as credenciais do Telegram e do Google
dentro do n8n. Se mudar, você refaz todas.

## Critério de parada

Se vocês dois não conseguirem lançar por duas semanas seguidas, o problema não
é de funcionalidade e nenhuma feature nova resolve. Descobrir isso custa um fim
de semana — é o objetivo do MVP.
