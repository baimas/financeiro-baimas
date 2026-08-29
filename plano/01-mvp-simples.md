# MVP simples — arquitetura decidida em 29/08/2026

> **Esta é a arquitetura ativa.** Substitui o desenho com Postgres de `arquitetura.md`, que fica como referência para uma eventual Fase 2.
> Guia visual publicado como artifact: "MVP em Um Fim de Semana". Arquivos entregues no chat.

## Stack

`Grupo do Telegram → n8n → Gemini → Google Sheets → dashboard estático`

Sem banco, sem multi-tenant, sem dívidas/objetivos. **Custo R$ 0/mês.**

| Peça | Escolha | Custo |
|---|---|---|
| Entrada | Grupo do Telegram com o casal + bot | R$ 0 |
| Orquestração | n8n em Docker na **Oracle Cloud Always Free** (ARM A1.Flex; fallback E2.1.Micro com 2 GB de swap) | R$ 0 |
| HTTPS | Caddy + DuckDNS + Let's Encrypt | R$ 0 |
| LLM | Gemini `gemini-3.5-flash-lite`, free tier, via HTTP Request com `responseSchema` | R$ 0 |
| Banco | Uma aba `Lancamentos` no Google Sheets | R$ 0 |
| Dashboard | HTML estático no GitHub Pages lendo o CSV publicado | R$ 0 |

## Planilha — aba `Lancamentos`

`update_id, data, competencia, criado_em, tipo, valor, categoria, descricao, pessoa, mensagem, confianca`

- `competencia` = `YYYY-MM`, escrita pelo n8n. É por ela que o dashboard agrupa — evita fórmula de data no Sheets.
- `valor` sempre positivo, ponto decimal. `tipo` = `saida|entrada`.
- Publicar a aba em **Arquivo → Compartilhar → Publicar na web → CSV** e guardar a URL (é o que o dashboard lê).

## Workflow n8n — 6 nós

`Telegram Trigger → Triagem e prompt → Gemini → Validar → Gravar na planilha → Confirmar no grupo`

- **Triagem e prompt** (Code): valida `chat.id` + `from.id`, idempotência via `$getWorkflowStaticData` (últimos 300 `update_id`), descarta mensagem sem número (sem gastar LLM), resolve hoje em `America/Sao_Paulo` com `toLocaleDateString('sv-SE')`, monta o prompt + `responseSchema`.
- **Gemini** (HTTP Request): chave via `{{ $env.GEMINI_API_KEY }}` — nunca dentro do workflow, dá para versionar o JSON.
- **Validar** (Code): rejeita valor ≤ 0, força categoria da lista, calcula `competencia`.
- **Gravar na planilha**: append com `autoMapInputData` (as chaves do JSON batem com os cabeçalhos).
- Escolha deliberada: **HTTP Request em vez dos nós LangChain** — menos peças, independente de versão, `responseSchema` visível e editável.

### Três constantes a ajustar no nó Triagem
`CHAT_ID` (id negativo do grupo), `MEMBROS` (`from.id` → nome), `CATEGORIAS`.
Descobrir os ids: rodar o Telegram Trigger em *Listen for test event* e ler `message.chat.id` e `message.from.id`.

## Bloqueadores conhecidos

1. **Privacy mode do BotFather** — `/setprivacy` → Disable, e **remover/readicionar o bot ao grupo**. Falha silenciosa: nada chega, nenhum erro.
2. **iptables da Oracle** — abrir 80/443 na Security List não basta; as imagens Ubuntu descartam tudo. `iptables -I INPUT 6 ... ACCEPT` + `netfilter-persistent save`. Sem isso o Let's Encrypt não emite cert.
3. **Dashboard precisa de http(s)** — abrir por `file://` bloqueia a leitura do CSV do Google. GitHub Pages resolve.
4. **Duplicata** — se o container reiniciar, a memória do workflow zera. Achar pelo `update_id` repetido e apagar a linha.

## Privacidade

"Publicar na web" gera URL pública sem senha. Aceitável para uso pessoal; se incomodar, trocar por Apps Script Web App restrita à conta.

## Backlog (só depois de 2 semanas seguidas lançando sem falhar)

1. Áudio e foto de comprovante (nó que baixa o arquivo do Telegram antes do Gemini).
2. Resumo diário às 21h (segundo workflow com Schedule Trigger).
3. Correção de categoria por botão inline.
4. Perguntas em linguagem natural — é aqui que o Sheets aperta e o Postgres do blueprint original passa a valer.

**Critério de parada:** se o hábito de lançar não pegar em duas semanas, nenhuma funcionalidade extra salva o projeto.
