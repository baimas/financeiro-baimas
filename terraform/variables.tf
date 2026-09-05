# ─── credenciais OCI ─────────────────────────────────────────────────────────
# Todas saem do arquivo ~/.oci/config gerado pelo painel da Oracle
# (Perfil > My profile > API keys > Add API key > Download config file).

variable "tenancy_ocid" {
  description = "OCID do tenancy"
  type        = string
}

variable "user_ocid" {
  description = "OCID do usuário"
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint da chave de API"
  type        = string
}

variable "private_key_path" {
  description = "Caminho local da chave privada de API (.pem)"
  type        = string
  default     = "~/.oci/oci_api_key.pem"
}

variable "region" {
  description = "Região da OCI, ex.: sa-saopaulo-1 ou sa-vinhedo-1"
  type        = string
  default     = "sa-saopaulo-1"
}

variable "compartment_ocid" {
  description = "OCID do compartment onde tudo será criado. Deixe igual ao tenancy_ocid para usar o compartment raiz."
  type        = string
}

# ─── as duas chaves que ligam e desligam ─────────────────────────────────────

variable "criar_instancia" {
  description = "false destrói a VM mas preserva rede, IP reservado e o volume de dados. Use para 'desligar tudo' sem perder nada."
  type        = bool
  default     = true
}

variable "instancia_ligada" {
  description = "false apenas para a VM (state STOPPED). O disco e o IP continuam de pé e o boot é rápido."
  type        = bool
  default     = true
}

# ─── forma da máquina ────────────────────────────────────────────────────────

variable "prefixo" {
  description = "Prefixo dos nomes dos recursos"
  type        = string
  default     = "gastos"
}

variable "shape" {
  description = "Shape Always Free. VM.Standard.A1.Flex (ARM) é a boa; VM.Standard.E2.1.Micro é o plano B quando a ARM está sem capacidade."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  description = "OCPUs — só vale para shapes Flex. O Always Free dá até 4."
  type        = number
  default     = 2
}

variable "memoria_gb" {
  description = "Memória em GB — só vale para shapes Flex. O Always Free dá até 24."
  type        = number
  default     = 12
}

variable "ad_index" {
  description = "Índice do availability domain (0, 1 ou 2). Se a Oracle responder 'Out of host capacity', tente o próximo."
  type        = number
  default     = 0
}

variable "ubuntu_versao" {
  description = "Versão do Ubuntu"
  type        = string
  default     = "22.04"
}

variable "ssh_public_key" {
  description = "Conteúdo da sua chave pública SSH (ex.: file(\"~/.ssh/id_ed25519.pub\"))"
  type        = string
}

variable "meu_ip_ssh" {
  description = "CIDR liberado para SSH. Deixe seu IP fixo (ex.: 189.4.5.6/32). 0.0.0.0/0 abre para o mundo."
  type        = string
  default     = "0.0.0.0/0"
}

# ─── volume de dados ─────────────────────────────────────────────────────────

variable "volume_dados_gb" {
  description = "Tamanho do volume que guarda o n8n e os certificados. O mínimo da OCI é 50 GB e o Always Free dá 200 no total."
  type        = number
  default     = 50
}

# ─── rede pública ────────────────────────────────────────────────────────────

variable "ip_reservado" {
  description = "true usa um IP público reservado, que sobrevive a destruir e recriar a VM (o DNS continua válido). false usa IP efêmero, que muda a cada recriação. Confira a política de cobrança de IPv4 reservado no seu tenancy antes de deixar true."
  type        = bool
  default     = true
}

# ─── aplicação ───────────────────────────────────────────────────────────────

variable "dominio" {
  description = "Domínio que aponta para o IP, ex.: gastos-casa.duckdns.org. O Caddy emite o certificado para ele."
  type        = string
}

variable "anthropic_api_key" {
  description = "Chave da API do Claude (Anthropic Console)"
  type        = string
  sensitive   = true
}

variable "dashboard_token" {
  description = "Segredo que o dashboard manda no cabeçalho para apagar lançamentos. Vazio desliga a exclusão."
  type        = string
  sensitive   = true
  default     = ""
}

variable "n8n_encryption_key" {
  description = "Chave de criptografia das credenciais do n8n. Gere com: openssl rand -hex 24. Guarde — sem ela as credenciais salvas ficam ilegíveis."
  type        = string
  sensitive   = true
}

variable "duckdns_token" {
  description = "Token do DuckDNS. Se preenchido, a VM atualiza o subdomínio no boot e a cada 15 min. Deixe vazio para não usar."
  type        = string
  default     = ""
  sensitive   = true
}

variable "timezone" {
  description = "Fuso usado pelo n8n"
  type        = string
  default     = "America/Sao_Paulo"
}
