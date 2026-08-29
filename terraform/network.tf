# Camada de rede — nunca é destruída pelos alvos "stop" e "down" do Makefile.

resource "oci_core_vcn" "principal" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.prefixo}-vcn"
  cidr_blocks    = ["10.0.0.0/16"]
  dns_label      = "gastosvcn"
}

resource "oci_core_internet_gateway" "igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.principal.id
  display_name   = "${var.prefixo}-igw"
  enabled        = true
}

resource "oci_core_route_table" "publica" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.principal.id
  display_name   = "${var.prefixo}-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.igw.id
  }
}

resource "oci_core_security_list" "publica" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.principal.id
  display_name   = "${var.prefixo}-sl"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # HTTP — o Let's Encrypt precisa dele para o desafio HTTP-01
  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = var.meu_ip_ssh
    tcp_options {
      min = 22
      max = 22
    }
  }

  # ICMP para o path MTU discovery funcionar
  ingress_security_rules {
    protocol = "1"
    source   = "0.0.0.0/0"
    icmp_options {
      type = 3
      code = 4
    }
  }
}

resource "oci_core_subnet" "publica" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.principal.id
  display_name               = "${var.prefixo}-subnet"
  cidr_block                 = "10.0.1.0/24"
  route_table_id             = oci_core_route_table.publica.id
  security_list_ids          = [oci_core_security_list.publica.id]
  prohibit_public_ip_on_vnic = false
  dns_label                  = "gastossub"
}
