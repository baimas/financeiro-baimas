#!/usr/bin/env bash
# Tudo o que dá para conferir sem rede, sem chave e sem tocar em produção.
# É o primeiro comando a rodar ao pegar o projeto, e o último antes de commitar.
#
#   scripts/verificar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

falhou=0
etapa() {
  printf '\n\033[1m%s\033[0m\n' "$1"; shift
  if "$@"; then :; else falhou=1; echo "  ↑ falhou"; fi
}

etapa "Sintaxe dos code nodes" bash -c '
  for f in n8n/nos/*.js; do node --check "$f" || exit 1; done
  echo "  ok    $(ls n8n/nos/*.js | wc -l | tr -d " ") arquivos"'

etapa "O JSON dos workflows está em dia com n8n/nos/*.js" \
  node scripts/montar-workflow.mjs --check

etapa "Code nodes" node scripts/testar-nos.mjs
etapa "Dashboard" node scripts/testar-dashboard.mjs

if [ "$falhou" = 0 ]; then
  printf '\n\033[32mtudo certo\033[0m — o que depende de rede fica de fora:\n'
  echo "  scripts/testar-parser.mjs   43 mensagens contra o Claude (precisa de ANTHROPIC_API_KEY)"
  echo "  scripts/checar-bot.sh       prova que o bot enxerga o grupo (precisa do token)"
else
  printf '\n\033[31malguma etapa falhou\033[0m\n'
  exit 1
fi
