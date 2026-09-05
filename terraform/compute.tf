data "oci_identity_availability_domains" "todos" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = var.ubuntu_versao
  shape                    = var.shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

locals {
  ad = data.oci_identity_availability_domains.todos.availability_domains[var.ad_index].name

  # Shapes "Flex" exigem shape_config; os fixos (E2.1.Micro) não aceitam.
  eh_flex = length(regexall("Flex", var.shape)) > 0

  cloud_init = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    dominio            = var.dominio
    anthropic_api_key  = var.anthropic_api_key
    n8n_encryption_key = var.n8n_encryption_key
    dashboard_token    = var.dashboard_token
    duckdns_token      = var.duckdns_token
    duckdns_dominio    = replace(var.dominio, ".duckdns.org", "")
    timezone           = var.timezone
  }))
}

resource "oci_core_instance" "n8n" {
  count = var.criar_instancia ? 1 : 0

  compartment_id      = var.compartment_ocid
  availability_domain = local.ad
  display_name        = "${var.prefixo}-n8n"
  shape               = var.shape

  # É esta linha que liga e desliga a máquina sem destruir nada.
  state = var.instancia_ligada ? "RUNNING" : "STOPPED"

  dynamic "shape_config" {
    for_each = local.eh_flex ? [1] : []
    content {
      ocpus         = var.ocpus
      memory_in_gbs = var.memoria_gb
    }
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu.images[0].id
  }

  create_vnic_details {
    subnet_id = oci_core_subnet.publica.id
    # Com IP reservado, a VNIC nasce sem IP efêmero e o reservado é anexado depois.
    assign_public_ip = var.ip_reservado ? false : true
    hostname_label   = "n8n"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = local.cloud_init
  }

  # Trocar o cloud-init não deve recriar a VM por acidente: mude de propósito
  # rodando `make recreate`, que passa por -replace.
  lifecycle {
    ignore_changes = [metadata["user_data"]]
  }
}
