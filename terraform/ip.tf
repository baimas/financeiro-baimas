# IP público reservado: o DNS aponta para ele uma vez e nunca mais muda,
# mesmo que a VM seja destruída e recriada.

data "oci_core_private_ips" "vnic" {
  count      = var.criar_instancia && var.ip_reservado ? 1 : 0
  subnet_id  = oci_core_subnet.publica.id
  ip_address = oci_core_instance.n8n[0].private_ip
}

resource "oci_core_public_ip" "fixo" {
  count = var.ip_reservado ? 1 : 0

  compartment_id = var.compartment_ocid
  display_name   = "${var.prefixo}-ip"
  lifetime       = "RESERVED"

  # Sem instância, o IP fica reservado e desanexado, esperando a próxima.
  private_ip_id = var.criar_instancia ? data.oci_core_private_ips.vnic[0].private_ips[0].id : null
}
