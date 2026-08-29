# Volume que guarda o banco do n8n e os certificados do Caddy.
# Vive fora da instância: sobrevive a `make down` e a trocar de shape.

resource "oci_core_volume" "dados" {
  compartment_id      = var.compartment_ocid
  availability_domain = local.ad
  display_name        = "${var.prefixo}-dados"
  size_in_gbs         = var.volume_dados_gb

  # Trava contra apagar os dados sem querer. Para destruir de verdade,
  # comente este bloco e rode `terraform destroy`.
  lifecycle {
    prevent_destroy = true
  }
}

resource "oci_core_volume_attachment" "dados" {
  count = var.criar_instancia ? 1 : 0

  attachment_type = "paravirtualized"
  instance_id     = oci_core_instance.n8n[0].id
  volume_id       = oci_core_volume.dados.id
  display_name    = "${var.prefixo}-dados-attach"
}
