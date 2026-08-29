# A planilha — cinco abas

Uma planilha do Google, cinco abas. Os cabeçalhos são contrato: o bot grava por
nome de coluna (`autoMapInputData`), então **não renomeie nem reordene** as
colunas de `Lancamentos`. `scripts/testar-nos.mjs` falha se elas saírem de sincronia.

| Aba | Quem escreve | Para que serve |
|---|---|---|
| `Lancamentos` | **o bot** | o fluxo: cada gasto, entrada e aporte |
| `Cartoes` | você | dia de fechamento e vencimento — decide em que fatura cada compra cai |
| `GastosFixos` | você | as contas do mês; o dashboard mostra quais já foram pagas |
| `Dividas` | você | saldo devedor, atualizado quando mudar |
| `PLR` | você | recebido e usado, fora do orçamento mensal |

Só `Lancamentos` é obrigatória. Sem as outras, as seções correspondentes
simplesmente não aparecem no dashboard.

## Como montar

1. Crie a planilha e as cinco abas com **exatamente** esses nomes.
2. Cole em cada uma a primeira linha do `*-modelo.csv` correspondente. As linhas
   seguintes dos modelos são exemplo — apague depois de conferir, menos nas abas
   que você mesmo mantém.
3. **Compartilhe a planilha com o e-mail da service account** (algo como
   `gastos-bot@seu-projeto.iam.gserviceaccount.com`), com permissão de editor.
   É assim que o n8n grava, sem OAuth e sem token que expira.
4. Publique como CSV as abas que o dashboard lê: Arquivo → Compartilhar →
   Publicar na web → escolha a aba → CSV. Cole cada URL no objeto `CSV` do
   `dashboard/index.html`.

## Cartoes — a aba que decide a fatura

`nome, dia_fechamento, dia_vencimento, dono`

O `nome` é o que você vai falar no grupo ("no nubank", "no bradesco") e o que
aparece na coluna `forma`. Os dois dias determinam a `competencia_fatura`:

> Nubank fecha dia 28 e vence dia 5. Compra de **27/08** entra na fatura que
> fecha em 28/08 e vence em **05/09** → competência `2026-09`. Compra de
> **29/08** já é da fatura seguinte → `2026-10`.

Adicionar um cartão é adicionar uma linha aqui — o workflow não muda, porque ele
lê esta aba a cada mensagem.

## GastosFixos

`nome, categoria, valor, dia_vencimento, ativo`

Quando você manda "paguei a internet 150", o bot casa com a linha `Internet` e
grava o nome dela na coluna `fixo`. **A categoria vem daqui, não do modelo** —
sem isso a mesma conta cairia em Assinaturas num mês e em Moradia no outro.

`ativo` = `nao` aposenta um fixo sem apagar o histórico.

## Lancamentos — as colunas

| Coluna | O que é |
|---|---|
| `update_id` | id da mensagem no Telegram; serve para achar duplicata |
| `data` | quando o gasto aconteceu |
| `competencia` | `YYYY-MM` da data — é por ela que o orçamento agrupa |
| `competencia_fatura` | `YYYY-MM` em que a fatura vence; vazio fora do cartão |
| `criado_em` | quando o bot gravou |
| `tipo` | `saida`, `entrada` ou `investimento` |
| `valor` | sempre positivo, ponto decimal |
| `categoria` | uma da lista do prompt |
| `forma` | um cartão da aba `Cartoes`, ou Débito/Pix/Dinheiro/VA/Boleto |
| `descricao` | curta, com o estabelecimento quando houver |
| `pessoa` | quem mandou a mensagem |
| `fixo` | nome do gasto fixo que este lançamento quitou, se algum |
| `mensagem` | o texto original — é o que permite auditar o parser |
| `confianca` | 0 a 1; abaixo de 0,7 o bot pede conferência no grupo |

Duas competências porque são duas perguntas diferentes: `competencia` responde
"quanto consumimos em agosto", `competencia_fatura` responde "quanto sai da
conta em setembro". A planilha da casa sempre pensou nas duas.
