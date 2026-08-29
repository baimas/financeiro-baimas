TF ?= terraform
LIGADA  = -var 'criar_instancia=true'  -var 'instancia_ligada=true'
PARADA  = -var 'criar_instancia=true'  -var 'instancia_ligada=false'
AUSENTE = -var 'criar_instancia=false' -var 'instancia_ligada=false'

.PHONY: help init plan up start stop down recreate nuke ip ssh logs boot-log estado

help:
	@echo ""
	@echo "  make up        cria a infra e liga a VM"
	@echo "  make stop      para a VM (dados, IP e rede intactos, volta em ~1 min)"
	@echo "  make start     religa a VM parada"
	@echo "  make down      destrói a VM, preserva rede, IP reservado e volume de dados"
	@echo "  make recreate  recria a VM do zero rodando o cloud-init de novo"
	@echo "  make nuke      apaga tudo, inclusive os dados (pede confirmação)"
	@echo ""
	@echo "  make estado    RUNNING / STOPPED / AUSENTE"
	@echo "  make ip        IP público atual"
	@echo "  make ssh       entra na máquina"
	@echo "  make logs      logs do n8n e do Caddy"
	@echo "  make boot-log  acompanha o cloud-init do primeiro boot"
	@echo ""

init:
	$(TF) init

plan:
	$(TF) plan $(LIGADA)

up:
	$(TF) apply -auto-approve $(LIGADA)
	@echo ""
	@echo "IP: $$($(TF) output -raw ip_publico)"
	@echo "Aponte o domínio para esse IP. O certificado sai em 1-2 min."

start: up

stop:
	$(TF) apply -auto-approve $(PARADA)

down:
	$(TF) apply -auto-approve $(AUSENTE)
	@echo "VM destruída. Rede, IP reservado e volume de dados preservados."

recreate:
	$(TF) apply -auto-approve $(LIGADA) -replace='oci_core_instance.n8n[0]'

nuke:
	@echo "Isto apaga TAMBÉM o volume com o banco do n8n e as credenciais."
	@echo "Antes: remova o bloco lifecycle { prevent_destroy } de storage.tf."
	@read -p "Digite APAGAR para confirmar: " c; [ "$$c" = "APAGAR" ] || exit 1
	$(TF) destroy

estado:
	@$(TF) output -raw estado; echo

ip:
	@$(TF) output -raw ip_publico; echo

ssh:
	@ssh ubuntu@$$($(TF) output -raw ip_publico)

logs:
	@ssh ubuntu@$$($(TF) output -raw ip_publico) \
	  'sudo docker compose -f /opt/n8n/docker-compose.yml logs -f --tail=100'

boot-log:
	@ssh ubuntu@$$($(TF) output -raw ip_publico) 'sudo tail -f /var/log/cloud-init-output.log'
