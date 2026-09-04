#!/usr/bin/env bash
# Empacota e cifra o que não pode sumir com o Mac.
#
# São três coisas, e só a primeira é insubstituível:
#   1. N8N_ENCRYPTION_KEY (em terraform.tfvars) — sem ela as credenciais do
#      Telegram e do Google guardadas no n8n viram lixo cifrado
#   2. a chave SSH privada da VM e a chave da API da OCI — dá para recriar as
#      duas no painel, mas custa uma tarde
#   3. o resto do tfvars e o tfstate — recriáveis, entram por conveniência
#
# A senha é digitada aqui e não sai daqui: nada de senha em argumento de
# comando, em variável exportada ou em arquivo. O pacote é verificado antes de
# o script terminar — backup que não abre não é backup.
#
#   scripts/guardar-segredos.sh [pasta-de-destino]     (padrão: ~/Desktop)
#
# Para restaurar, em qualquer Mac ou Linux com openssl:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <arquivo>.enc | tar xzv
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="${1:-$HOME/Desktop}"
SAIDA="$DESTINO/segredos-financeiro-baimas-$(date +%Y-%m-%d).tar.gz.enc"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PACOTE="$TMP/segredos"
mkdir -p "$PACOTE"

# ── o que entra ─────────────────────────────────────────────────────────────
copiar() {
  [ -f "$1" ] || { echo "  · ausente, pulando: $1"; return; }
  cp "$1" "$PACOTE/$2"
  echo "  · $2"
}

echo "Juntando:"
copiar "$RAIZ/terraform/terraform.tfvars" "terraform.tfvars"
copiar "$RAIZ/terraform/terraform.tfstate" "terraform.tfstate"
copiar "$HOME/.oci/oci_api_key.pem" "oci_api_key.pem"

# a chave SSH privada é a que corresponde à pública registrada no tfvars —
# achar por comparação evita guardar a chave errada e descobrir isso tarde
PUB=$(grep '^ssh_public_key' "$RAIZ/terraform/terraform.tfvars" \
      | sed -E 's/^[^"]*"([^"]*)".*/\1/' | awk '{print $1, $2}')
achou_ssh=""
for k in "$HOME"/.ssh/id_*; do
  case "$k" in *.pub) continue;; esac
  [ -f "$k" ] || continue
  if [ "$(ssh-keygen -y -f "$k" 2>/dev/null | awk '{print $1, $2}')" = "$PUB" ]; then
    cp "$k" "$PACOTE/ssh_vm_n8n"; echo "  · ssh_vm_n8n  (de $k)"; achou_ssh="sim"; break
  fi
done
[ -n "$achou_ssh" ] || echo "  !! nenhuma chave em ~/.ssh corresponde à do tfvars — confira à mão"

cat > "$PACOTE/LEIA-ME.txt" <<TXT
Segredos do bot de gastos da casa — $(date '+%d/%m/%Y')
Repositório: https://github.com/baimas/financeiro-baimas

terraform.tfvars   todos os segredos da infra. O que importa de verdade é
                   n8n_encryption_key: é ela que cifra, dentro do n8n, as
                   credenciais do Telegram e da conta de serviço do Google.
                   Perdida a chave, as credenciais têm de ser recriadas na
                   interface do n8n — o workflow volta, o acesso não.
terraform.tfstate  o que o Terraform sabe da infra na Oracle.
oci_api_key.pem    chave da API da Oracle. Vai em ~/.oci/ com permissão 600.
ssh_vm_n8n         chave privada de acesso à VM. Vai em ~/.ssh/ com 600.

Para voltar tudo ao lugar:
  chmod 600 terraform.tfvars oci_api_key.pem ssh_vm_n8n
  cp terraform.tfvars terraform.tfstate  <repo>/terraform/
  cp oci_api_key.pem                     ~/.oci/
  cp ssh_vm_n8n                          ~/.ssh/     e use -i ~/.ssh/ssh_vm_n8n

Os dados em si — lançamentos, cartões, gastos fixos — não estão aqui: vivem na
planilha do Google, que tem o próprio histórico de versões.
TXT
echo "  · LEIA-ME.txt"

# ── senha, lida aqui e usada aqui ───────────────────────────────────────────
echo
printf 'Senha para cifrar o pacote: '; read -rs SENHA; echo
printf 'De novo, para conferir:     '; read -rs SENHA2; echo
[ "$SENHA" = "$SENHA2" ] || { echo "As senhas não batem. Nada foi gravado." >&2; exit 1; }
[ ${#SENHA} -ge 10 ] || { echo "Senha curta demais (mínimo 10). Nada foi gravado." >&2; exit 1; }

tar -czf "$TMP/pacote.tar.gz" -C "$TMP" segredos
printf '%s' "$SENHA" | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
  -in "$TMP/pacote.tar.gz" -out "$SAIDA" -pass stdin
chmod 600 "$SAIDA"

# ── conferir antes de dizer que deu certo ───────────────────────────────────
if ! printf '%s' "$SENHA" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
     -in "$SAIDA" -pass stdin 2>/dev/null | tar tzf - > /dev/null 2>&1; then
  rm -f "$SAIDA"
  echo "O pacote não abriu com a própria senha. Nada foi gravado." >&2
  exit 1
fi

echo
echo "Pronto e conferido: $SAIDA"
echo "$(du -h "$SAIDA" | cut -f1) — leve o arquivo para fora deste Mac (Drive, pendrive, e-mail para você mesmo)."
echo
echo "Para abrir, em qualquer máquina com openssl:"
echo "  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in \"$(basename "$SAIDA")\" | tar xzv"
echo
echo "A senha não está guardada em lugar nenhum. Se ela se perder, o pacote vira ruído."
