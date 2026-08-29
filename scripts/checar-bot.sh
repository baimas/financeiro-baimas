#!/usr/bin/env bash
# Prova, em um curl, que o bot enxerga as mensagens soltas do grupo — e entrega
# os ids que precisam entrar em CHAT_ID e MEMBROS no nó "Triagem e prompt".
#
# O privacy mode do BotFather é o bloqueador nº 1 deste projeto: com ele ligado,
# "85 no mercado" nunca chega ao bot e nenhum erro aparece em lugar nenhum.
# Sem este script, isso só apareceria depois da VM, do DNS e do certificado.
#
#   1. no BotFather:  /setprivacy → o seu bot → Disable
#   2. crie o grupo, adicione o bot (se ele já estava lá, remova e readicione)
#   3. mande no grupo, sem responder ninguém e sem citar o bot:  teste 85 mercado
#   4. scripts/checar-bot.sh <token>
#
# Só funciona enquanto o workflow do n8n NÃO estiver ativo: webhook e getUpdates
# são mutuamente exclusivos no Telegram. Se der 409, o webhook está registrado.
set -euo pipefail

TOKEN="${1:-${TELEGRAM_BOT_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "uso: $0 <token-do-bot>   (ou exporte TELEGRAM_BOT_TOKEN)" >&2
  exit 1
fi

api() { curl -fsS "https://api.telegram.org/bot${TOKEN}/$1" 2>/dev/null || true; }

echo "── o bot ─────────────────────────────────────────────────────────────────"
eu=$(api getMe)
if [ -z "$eu" ] || [ "$(jq -r '.ok' <<<"$eu")" != "true" ]; then
  echo "token inválido ou sem rede. Resposta: ${eu:-vazia}" >&2
  exit 1
fi
jq -r '.result | "  @\(.username)  (id \(.id))\n  pode ler tudo no grupo: \(if .can_read_all_group_messages then "SIM — privacy mode desligado" else "NÃO — privacy mode LIGADO, resolva isso antes de seguir" end)"' <<<"$eu"

echo
echo "── webhook ───────────────────────────────────────────────────────────────"
wh=$(api getWebhookInfo)
url=$(jq -r '.result.url // ""' <<<"$wh")
if [ -n "$url" ]; then
  echo "  há um webhook registrado: $url"
  echo "  enquanto ele existir, getUpdates volta vazio (409). Desative o workflow"
  echo "  no n8n, ou apague o webhook com:"
  echo "    curl -s 'https://api.telegram.org/bot<token>/deleteWebhook'"
else
  echo "  nenhum — getUpdates funciona"
fi

echo
echo "── mensagens que chegaram ────────────────────────────────────────────────"
upd=$(api getUpdates)
n=$(jq '.result | length' <<<"$upd")
if [ "$n" = "0" ]; then
  cat <<'AJUDA'
  nada. As causas, em ordem de probabilidade:
    1. privacy mode ainda ligado (veja a linha "pode ler tudo no grupo" acima)
    2. o bot foi adicionado ao grupo ANTES do Disable — remova e readicione
    3. você ainda não mandou mensagem no grupo depois de adicionar o bot
    4. um webhook está consumindo os updates (veja a seção acima)
AJUDA
  exit 0
fi

jq -r '.result[] | . as $u | ($u.message // $u.edited_message) | select(. != null) |
  "  update_id  \($u.update_id)\n  chat.id    \(.chat.id)   \(.chat.type)  \(.chat.title // "-")\n  from.id    \(.from.id)   \(.from.first_name)\n  texto      \(.text // .caption // "(sem texto)")\n"' <<<"$upd"

echo "── para copiar para o nó Triagem e prompt ────────────────────────────────"
jq -r '[.result[] | (.message // .edited_message) | select(. != null)] as $m |
  "const CHAT_ID  = \($m | map(.chat.id) | unique | .[0] // "SEU_CHAT_ID");",
  "const MEMBROS  = { " + ([$m[] | "\(.from.id): \u0027\(.from.first_name)\u0027"] | unique | join(", ")) + " };"' <<<"$upd"
