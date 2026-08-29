# Infra do bot de gastos — Oracle Cloud Always Free

Terraform que cria a VM, a rede e o volume de dados, e sobe n8n + Caddy já
configurados. A VM nasce com o `iptables` da Oracle resolvido pelo cloud-init —
sem isso o Let's Encrypt nunca emite o certificado e nada disso funciona.

## O que é criado

```
VCN 10.0.0.0/16
└── subnet pública 10.0.1.0/24
    ├── internet gateway + route table
    ├── security list: 80 e 443 abertos, 22 restrito ao seu IP
    └── VM Ubuntu (A1.Flex ARM ou E2.1.Micro)
        ├── cloud-init: iptables, swap, volume, docker, n8n, caddy, duckdns
        └── volume de dados 50 GB  → /opt/n8n-data
IP público reservado (sobrevive a destruir a VM)
```

## Antes de começar

1. **Conta na Oracle Cloud** com o Always Free ativo.
2. **Chave de API**: painel → seu perfil → *API keys* → *Add API key* → baixe a
   privada para `~/.oci/oci_api_key.pem` e copie o bloco de configuração que a
   Oracle mostra: é de lá que saem `tenancy_ocid`, `user_ocid` e `fingerprint`.
3. **Terraform** ≥ 1.5 e uma **chave SSH** (`ssh-keygen -t ed25519`).
4. **Subdomínio no DuckDNS** — grátis. Guarde o token se quiser que a VM
   mantenha o DNS atualizado sozinha.
5. **Chave do Gemini** no Google AI Studio.

```bash
cp terraform.tfvars.example terraform.tfvars
openssl rand -hex 24          # vai em n8n_encryption_key
$EDITOR terraform.tfvars

make init
make plan                     # confira antes de aplicar
make up
```

O `make up` imprime o IP. Aponte o subdomínio do DuckDNS para ele (ou preencha
`duckdns_token` e a própria VM faz isso). O certificado sai em um ou dois
minutos; acompanhe com `make boot-log`.

## Ligar e desligar

Três níveis, do mais leve ao mais destrutivo:

| Comando | O que faz | Volta em | O que se perde |
|---|---|---|---|
| `make stop` | Para a VM (`state = STOPPED`) | ~1 min | nada |
| `make start` | Religa | ~1 min | nada |
| `make down` | Destrói a VM; mantém rede, IP e volume | ~5 min | nada — o volume tem o n8n inteiro |
| `make recreate` | Recria a VM e roda o cloud-init de novo | ~5 min | nada, se o volume estiver anexado |
| `make nuke` | Apaga tudo | — | **tudo, inclusive os dados** |

`make stop` é o dia a dia. `make down` é para quando você vai passar um tempo
sem mexer e quer a conta zerada de recursos ativos — o IP reservado continua
seu, então o DNS não precisa mudar quando você voltar.

O `make nuke` só funciona depois que você remover o bloco
`lifecycle { prevent_destroy = true }` de `storage.tf`. É de propósito: um
`terraform destroy` distraído não deve conseguir apagar as suas credenciais do
n8n.

## Onde mora o quê

| Coisa | Onde | Sobrevive a `make down`? |
|---|---|---|
| Banco do n8n, credenciais, workflows | `/opt/n8n-data/n8n` (volume) | sim |
| Certificados do Let's Encrypt | `/opt/n8n-data/caddy` (volume) | sim |
| Compose, Caddyfile, `.env` | `/opt/n8n` (disco de boot) | não — o cloud-init reescreve |
| IP público | recurso reservado na OCI | sim |

Os certificados no volume importam mais do que parece: o Let's Encrypt limita
emissões por domínio por semana. Recriando a VM com o volume anexado, o Caddy
reaproveita o certificado em vez de pedir outro.

## Detalhes que vão te economizar tempo

**"Out of host capacity"** na `VM.Standard.A1.Flex` é comum — a ARM gratuita é
disputada. Tente `ad_index = 1` e `2`, ou caia para
`shape = "VM.Standard.E2.1.Micro"`. Nessa, o cloud-init cria 2 GB de swap
sozinho, porque 1 GB de RAM não segura o n8n num pico.

**O `iptables` é o passo que quase todo mundo esquece.** Abrir a porta na
security list não basta: as imagens Ubuntu da OCI têm um `REJECT` no fim da
chain `INPUT`. O sintoma é cruel — a porta 443 responde, a 80 não, e o Caddy
fica em loop tentando o desafio HTTP-01 sem dizer o motivo. O cloud-init insere
as duas regras e roda `netfilter-persistent save`.

**`N8N_ENCRYPTION_KEY` é o segredo que você não pode perder.** É com ela que o
n8n cifra as credenciais do Telegram e do Google. Se ela mudar, o n8n sobe mas
as credenciais salvas ficam ilegíveis e você refaz todas.

**IP reservado x efêmero.** O padrão aqui é reservado, porque o DNS não muda
quando você recria a VM. Algumas contas cobram por IPv4 reservado ocioso —
confira a política do seu tenancy. Se preferir, `ip_reservado = false` usa o
efêmero, e aí vale preencher `duckdns_token` para o DNS se acertar sozinho a
cada recriação.

**`user_data` está em `ignore_changes`.** Editar o cloud-init não recria a VM
por acidente; para aplicar mudanças no script, rode `make recreate`.

## Operação

```bash
make estado     # RUNNING / STOPPED / AUSENTE
make ip
make ssh
make logs       # n8n e caddy
make boot-log   # cloud-init do primeiro boot
```

## Uma ressalva honesta

Este código foi escrito e revisado estaticamente — chaves balanceadas,
referências entre recursos, variáveis, o template renderizando para YAML válido
e os blocos de shell passando no `bash -n`. Mas **não rodei `terraform validate`
nem `plan` contra uma conta real**, porque o ambiente onde ele foi escrito não
tem acesso à rede para baixar o provider. Rode `make init && make plan` e leia o
plano antes do primeiro `apply`; se algum argumento tiver mudado de nome na
versão do provider, o erro aparece ali, antes de criar qualquer coisa.
