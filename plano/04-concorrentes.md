# Concorrentes e alternativas — pesquisa de mercado (28/08/2026)

> Versão visual publicada como artifact: "Quem Já Faz Isso".

## Resumo

A categoria existe e está cheia, mas é **WhatsApp-first, individual e fechada**. Os concorrentes mais próximos cobram ~R$ 30/mês para um casal — mesmo custo mensal do projeto próprio num VPS. **Economia não é argumento para construir.**

Ninguém cobre: bot dentro de um **grupo** do Telegram com os dois lançando, agente que aprende com as correções, e SQL na própria base.

## Bots conversacionais BR

| Ferramenta | Canal | Preço | Casal | Nota |
|---|---|---|---|---|
| **ZapGastos** | WhatsApp (Telegram citado no site, não nos planos) | R$ 9,90/mês anual (1 user); **Plus R$ 29,90/mês anual, até 5 users**; R$ 59,90 avulso | sim (Plus+) | Open Finance 114 bancos, painel web, projeção de fim de mês |
| **Financinha** | WhatsApp | **Manual R$ 29,49/mês** (R$ 353,90/ano); Open Finance R$ 39,90/mês | sim, ilimitado | Texto, áudio, imagem, PDF de extrato. Mais direto para casal |
| **FinanBot** | WhatsApp | grátis (alpha) | não documentado | Financiamento com parcelas, amortização, múltiplas metas — a parte de dívidas mais parecida com a nossa |
| **FinancaAssistenteBot** | **Telegram** (voz/texto) | grátis + pagos não divulgados | não | Único nativo de Telegram encontrado. Projeto individual, muito inicial (pitch no TabNews) |

**Verificar antes de assinar:** nenhum deixa claro se funciona dentro de um *grupo* ou só em conversa individual. É a pergunta que decide se serve.

## Apps BR clássicos (sem bot)

| Ferramenta | Preço | Nota |
|---|---|---|
| Mobills | R$ 99,90/ano (~R$ 8,40/mês) | Mais barato. Sincroniza Nubank/Santander. Sem conta compartilhada documentada |
| Organizze | Manual R$ 199,90/ano (ou R$ 35/mês); Conectado R$ 399,90/ano; Plus R$ 599,90/ano | Sem assistente próprio, mas expõe conexão para consultar os dados via ChatGPT/Claude |

## Internacionais (sem bancos BR — inúteis aqui)

YNAB US$ 109/ano (até 6 pessoas) · Monarch US$ 99,99/ano (household) · Copilot US$ 95/ano (iOS, single-user).

## Open source / self-host

| Ferramenta | Custo | Nota |
|---|---|---|
| Firefly III | grátis + VPS | Back-end maduro com API completa. Bot Telegram da comunidade é alpha e está parado |
| Actual Budget | grátis + VPS | Alternativa ao YNAB, local-first. Sem entrada por mensagem |
| Templates n8n | grátis | Vários "Telegram + IA + Google Sheets", e um "Gemini + Telegram + Firefly III". Single-user, sem dívidas/objetivos — mas encurtam a Fase 0 |
| TeleExpense e afins | grátis | Só captura para Sheets, sem agente |

## Custo lado a lado (câmbio ~R$ 5,19/USD)

| Opção | Por mês | 24 meses | Além do dinheiro |
|---|---|---|---|
| Mobills | R$ 8,40 | R$ 200 | Sem bot — não resolve |
| Financinha manual | R$ 29,49 | R$ 708 | Funciona amanhã; dados na casa deles |
| ZapGastos Plus | R$ 29,90 | R$ 718 | Funciona amanhã, com Open Finance |
| Projeto próprio (VPS novo) | R$ 26–78 | R$ 620–1.870 | ~40–60h até a Fase 3 + manutenção |
| Projeto próprio (VPS já existente) | ≈ R$ 2 | ≈ R$ 50 | Só o LLM; as mesmas horas |

## Leitura estratégica

- **A parte fácil virou commodity.** "Bot que registra gasto com IA" tem template gratuito de n8n. Se o objetivo fosse só registrar, assinar era o certo.
- **O vago no mercado:** ninguém posicionou produto em *grupo do Telegram para casal*; dívida com amortização e data de quitação aparece bem só num produto em alpha e grátis. É aí que estaria o diferencial na Fase 5.
- **Risco de mercado:** os três BR mais próximos são novos e um está em alpha grátis — preço instável e possibilidade de sumiço. Argumento a favor de ter os dados na própria base mesmo assinando algo por enquanto.

## Recomendação registrada

Assinar Financinha por 1 mês (R$ 29,49, colaborativos ilimitados) e usar com a esposa por 2 semanas, testando a única incerteza real: **os dois realmente lançam?** Se não, o projeto estava resolvendo o problema errado e economizou ~50h. Se sim, a lista do que o produto pronto não faz vira o escopo da Fase 0.
