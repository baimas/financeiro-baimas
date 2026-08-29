# Infra como código — Terraform na Oracle Cloud (29/08/2026)

> Entregue como `terraform-oci-gastos.tar.gz` no chat. Substitui os passos manuais da seção 04 do guia "MVP em Um Fim de Semana".

## O que o código cria

VCN 10.0.0.0/16 → subnet pública 10.0.1.0/24 (IGW + route table + security list: 80/443 abertos, 22 restrito) → VM Ubuntu (A1.Flex ARM ou E2.1.Micro) + volume de dados 50 GB + IP público reservado.

Arquivos: `versions.tf`, `variables.tf`, `network.tf`, `compute.tf`, `storage.tf`, `ip.tf`, `outputs.tf`, `cloud-init.yaml.tftpl`, `Makefile`, `terraform.tfvars.example`, `.gitignore`, `README.md`.

## Ligar e desligar — três níveis

| Comando | Mecanismo | Volta em | Perde |
|---|---|---|---|
| `make stop` | `oci_core_instance.state = "STOPPED"` | ~1 min | nada |
| `make start` / `make up` | `state = "RUNNING"` | ~1 min | nada |
| `make down` | `var.criar_instancia = false` → `count = 0` na VM | ~5 min | nada (volume + IP preservados) |
| `make recreate` | `-replace` na instância, roda o cloud-init de novo | ~5 min | nada |
| `make nuke` | `terraform destroy` | — | **tudo, inclusive dados** |

Duas variáveis controlam tudo: `criar_instancia` (existe ou não) e `instancia_ligada` (RUNNING ou STOPPED). O Makefile sempre passa as duas explicitamente para o estado não oscilar entre comandos.

## Decisões de projeto

- **Volume de dados separado da VM** (`/opt/n8n-data`, paravirtualized): guarda o banco do n8n e **os certificados do Caddy**. Os certificados no volume evitam bater no rate limit semanal do Let's Encrypt ao recriar a VM.
- **`prevent_destroy = true` no volume**: `terraform destroy` distraído não apaga as credenciais do n8n. Para destruir de verdade, comentar o bloco.
- **IP reservado por padrão**: o DNS não muda ao recriar a VM. Flag `ip_reservado = false` cai para efêmero (algumas contas cobram IPv4 reservado ocioso — conferir no tenancy).
- **`user_data` em `ignore_changes`**: editar o cloud-init não recria a VM por acidente; usar `make recreate`.
- **Drop-in `RequiresMountsFor=/opt/n8n-data` no docker.service**: o Docker não sobe antes do volume montar, senão o n8n cria um banco vazio em cima do ponto de montagem.
- **DuckDNS opcional** via systemd timer a cada 15 min, roda antes do Caddy no boot.

## O cloud-init resolve, na ordem

1. **iptables** — `iptables -I INPUT 1 -p tcp --dport 80/443 -m conntrack --ctstate NEW -j ACCEPT` + `netfilter-persistent save`. As imagens Ubuntu da OCI têm um REJECT no fim da chain INPUT; abrir a porta na security list não basta e o sintoma é o Caddy em loop no desafio HTTP-01 sem dizer o motivo.
2. **Swap 2 GB** se `MemTotal < 3 GB` (indispensável na E2.1.Micro).
3. **Volume**: espera até 5 min pelo device `/dev/oracleoci/oraclevdb`, formata ext4 se for a primeira vez, adiciona ao fstab com `nofail`.
4. **Docker** via get.docker.com.
5. **DuckDNS** antes do Caddy.
6. **`docker compose up -d`** com n8n + Caddy.

## Segredos

`GEMINI_API_KEY` e `N8N_ENCRYPTION_KEY` entram por variável sensitive do Terraform → `/opt/n8n/.env` (0600). **A encryption key não pode mudar** — é ela que cifra as credenciais do Telegram e do Google no n8n.

## Ressalva

Código revisado estaticamente (balanceamento, referências entre recursos, variáveis, template renderizando YAML válido, blocos shell passando em `bash -n`), mas **não foi rodado `terraform validate` nem `plan`** — o ambiente de escrita não tinha rede para baixar o provider. Rodar `make init && make plan` e ler o plano antes do primeiro apply.

## Pegadinhas conhecidas

- "Out of host capacity" na A1.Flex é comum: tentar `ad_index = 1` e `2`, ou cair para `VM.Standard.E2.1.Micro`.
- Perder a `N8N_ENCRYPTION_KEY` = refazer todas as credenciais do n8n.
