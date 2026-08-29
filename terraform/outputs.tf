locals {
  ip_efetivo = var.ip_reservado ? try(oci_core_public_ip.fixo[0].ip_address, null) : try(oci_core_instance.n8n[0].public_ip, null)
}

output "ip_publico" {
  description = "Aponte o seu domínio para este IP"
  value       = local.ip_efetivo
}

output "url_n8n" {
  description = "Onde o n8n atende depois que o certificado sair"
  value       = "https://${var.dominio}"
}

output "ssh" {
  description = "Comando para entrar na máquina"
  value       = local.ip_efetivo == null ? "sem instância — rode make up" : "ssh ubuntu@${local.ip_efetivo}"
}

output "estado" {
  description = "Estado atual da instância"
  value       = try(oci_core_instance.n8n[0].state, "AUSENTE")
}

output "volume_dados" {
  description = "Volume que guarda o n8n e os certificados — sobrevive a make down"
  value       = oci_core_volume.dados.id
}
