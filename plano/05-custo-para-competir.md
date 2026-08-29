# Custo para montar um concorrente da Financinha (28/08/2026)

> Versão visual publicada como artifact: "Quanto Custa Competir". Câmbio de referência: R$ 5,19/US$.

## Resposta curta

- **Construir:** ~200 h (ou ~R$ 32 mil contratando pleno a R$ 160/h) + **R$ 515–720/mês** fixo sem Open Finance.
- **Empatar:** **31 assinantes** a R$ 29,90.
- **Open Finance é o muro:** Pluggy a partir de R$ 2.500/mês leva o break-even de 31 para **103**.
- **WhatsApp é quase de graça:** desde nov/2024 toda mensagem dentro da janela de 24 h aberta pelo cliente é **grátis e ilimitada**. Cobrança por mensagem desde 1º/jul/2025.
- **A barreira não é técnica nem financeira — é conseguir os 31 primeiros assinantes estranhos.**

## Esforço de construção (~200 h)

| Bloco | Horas |
|---|---|
| Produto pessoal (Fases 0–4 do blueprint) | ~50 |
| Multi-tenant de verdade (auth, RLS, onboarding, pareamento) | ~35 |
| Cobrança (gateway, planos, trial, inadimplência) | ~25 |
| Operação (painel admin, logs, métricas, fila/reprocessamento) | ~40 |
| Fachada e suporte (landing, FAQ, termos, LGPD) | ~30 |
| Qualidade (suite de mensagens reais, regressão, observabilidade) | ~20 |

A 10 h/semana ≈ 5 meses. Manutenção contínua depois: 8–15 h/mês.
Mercado freelance BR: júnior R$ 85/h, **pleno R$ 160/h (mediana)**, sênior R$ 280/h.

## Canal WhatsApp (Meta Cloud API)

| Categoria | Preço Brasil | Uso no produto |
|---|---|---|
| Service (janela 24 h) | **grátis, ilimitado** | Todo registro e toda resposta |
| Utility (fora da janela) | US$ 0,0068 ≈ R$ 0,035 | Resumos/alertas proativos → ~R$ 0,70/user/mês |
| Marketing | US$ 0,0625 ≈ R$ 0,32 | Evitar |
| Plataforma Cloud API | R$ 0 | BSP cobra markup US$ 0,003–0,010/msg — dá para ir direto |

Brasil ainda faturado em USD; BRL previsto para o 2º semestre de 2026.
**APIs não oficiais** (Z-API R$ 99,99/mês, Zapster a partir de R$ 47, Evolution self-host ~US$ 7/mês) = risco de ban da Meta. Não usar em produto pago.

## Open Finance (o muro)

| Provedor | Custo |
|---|---|
| Pluggy — Dados | **a partir de R$ 2.500/mês** (14 dias de trial em produção) |
| Tecnospeed | R$ 1.500 adesão + R$ 540/mês (relato de mercado) |
| Belvo | ~R$ 6.000/mês (relato de mercado) |
| Sem Open Finance | R$ 0 — entrada manual, OFX/CSV, foto de comprovante |

Consenso da comunidade (fundador BR travado nesse ponto): **começar sem Open Finance** e só assinar quando a base pagar. É o que a Financinha faz — R$ 29,49 manual vs R$ 39,90 conectado.

## Custo mensal

**Fixo:** Cloud API R$ 0 · Supabase Pro R$ 130 · VPS R$ 55–160 · front/domínio/e-mail/monitoramento R$ 80 · contabilidade R$ 250–350 → **R$ 515–720**. Com agregador: +R$ 540 a 2.500.

**Variável por assinante:** LLM R$ 2–4 · áudio/comprovante R$ 0,50–1,50 · WhatsApp utility R$ 0,70 · infra marginal R$ 0,30 · gateway Asaas (2,99% + R$ 0,49) R$ 1,38 · Simples 6% R$ 1,79 → **R$ 6,70–9,70**. Margem de contribuição ≈ **R$ 21,70** num ticket de R$ 29,90.

## Break-even

| Estrutura | Fixo/mês | Ticket | Assinantes |
|---|---|---|---|
| Sem Open Finance | R$ 675 | R$ 29,90 | **31** |
| Conectado (Tecnospeed) | R$ 1.215 (+R$ 1.500 adesão) | R$ 39,90 | **39** |
| Conectado (Pluggy) | R$ 3.175 | R$ 39,90 | **103** |

## Escala (sem Open Finance)

| Assinantes | Receita | Custo | Sobra | Realidade |
|---|---|---|---|---|
| 31 | R$ 927 | R$ 927 | R$ 0 | Hobby que se paga |
| 100 | R$ 2.990 | R$ 1.495 | R$ 1.495 | Suporte já é tarefa diária |
| 500 | R$ 14.950 | R$ 4.775 | R$ 10.175 | n8n em VPS único não aguenta; vira serviço |
| 900 | R$ 26.910 | R$ 8.055 | R$ 18.855 | Substitui um salário; não dá para tocar sozinho |

Ignora marketing e o próprio tempo. Com CAC R$ 100 e churn 8%/mês, manter 900 ativos exige repor ~72/mês = R$ 7.200 de anúncio.

## CAC — a variável não pesquisável

Não há benchmark público confiável para assistente financeiro por assinatura no BR (os estudos de fintech medem instalação de app e primeiro depósito). Matemática: com MC de R$ 21,70, CAC R$ 50 → payback 2,3 meses; R$ 100 → 4,6; R$ 200 → 9,2. Acima de R$ 150 só fecha com boa retenção. **Descobrir custa ~R$ 500 de anúncio e 2 semanas.**

## Riscos fora da planilha

- Suporte via WhatsApp cria expectativa de resposta imediata (a partir de ~150 contas, tarefa diária).
- Churn alto — controle de gastos é a academia dos apps.
- Risco de plataforma: Meta muda preço/política sozinha (migração para BRL prevista para o 2º sem/2026). Telegram não tem esse risco, mas tem menos gente.
- LGPD com dado financeiro: base legal, criptografia em repouso, exclusão de conta, plano de incidente.
- **MEI não serve:** teto R$ 81 mil/ano (~R$ 6.750/mês) — 226 assinantes a R$ 29,90 já estouram. Nascer ME no Simples.
- Concorrentes já têm base, Open Finance e SEO.

## Recomendação registrada

1. **Não competir de frente** no "bot que registra gasto" — commodity, e o pedágio do Open Finance já foi pago por quem chegou antes.
2. **Entrar pelas brechas** mapeadas em `concorrentes.md`: casal/família num grupo, e dívida com amortização e data de quitação.
3. **Validar antes de construir:** landing + R$ 500 de anúncio + 2 semanas medindo quantos deixam e-mail para "controle de gastos do casal no WhatsApp". Responde o que 200 h de código não respondem.
