#!/usr/bin/env bash
# Abre o dashboard no navegador com lançamentos de exemplo, sem planilha nenhuma.
#
# As abas de configuração são os próprios CSVs de planilha/ — os mesmos que você
# vai preencher no Google Sheets. Só os lançamentos são sintéticos.
#
# O dashboard precisa de http(s): por file:// o navegador bloqueia a leitura do
# CSV, e é por isso que este script sobe um servidor.
#
#   scripts/dashboard-local.sh          → http://localhost:8899
#   Ctrl-C encerra.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST=$(mktemp -d)
trap 'rm -rf "$DEST"' EXIT

cp planilha/cartoes-modelo.csv     "$DEST/cartoes.csv"
cp planilha/gastos-fixos-modelo.csv "$DEST/fixos.csv"
cp planilha/dividas-modelo.csv     "$DEST/dividas.csv"
cp planilha/plr-modelo.csv         "$DEST/plr.csv"

# a página é a de verdade; só a origem dos CSVs muda
python3 - dashboard/index.html "$DEST/index.html" <<'PY'
import io, re, sys
s = io.open(sys.argv[1], encoding="utf-8").read()
novo = '''const CSV = {
  lancamentos: "./lancamentos.csv",
  cartoes:     "./cartoes.csv",
  fixos:       "./fixos.csv",
  dividas:     "./dividas.csv",
  plr:         "./plr.csv",
};'''
s = re.sub(r"const CSV = \{.*?\};", novo, s, count=1, flags=re.S)
io.open(sys.argv[2], "w", encoding="utf-8").write(s)
PY

python3 - "$DEST" <<'PY'
import csv, random, sys, datetime, io, os
random.seed(7)
dest = sys.argv[1]

cartoes = list(csv.DictReader(io.open(os.path.join(dest, "cartoes.csv"), encoding="utf-8")))
fixos   = list(csv.DictReader(io.open(os.path.join(dest, "fixos.csv"), encoding="utf-8")))

# as mesmas duas regras do nó Validar. No cartão, o gasto conta no ciclo em que
# a fatura fecha; fora dele, no mês da data.
def competencia_ciclo(ano, mes, dia, cartao):
    if not cartao:
        return f"{ano}-{mes:02d}"
    m = mes if dia <= int(cartao["dia_fechamento"]) else mes + 1
    a = ano
    while m > 12:
        m -= 12; a += 1
    return f"{a}-{m:02d}"

# a competência da fatura é a do VENCIMENTO
def competencia_fatura(ano, mes, dia, cartao):
    fech, venc = int(cartao["dia_fechamento"]), int(cartao["dia_vencimento"])
    m = mes if dia <= fech else mes + 1
    m = m if venc > fech else m + 1
    a = ano
    while m > 12:
        m -= 12; a += 1
    return f"{a}-{m:02d}"

catalogo = {
    "Mercado": (60, 400), "Hortifrutti": (40, 120), "Alimentação": (18, 90),
    "Lanches": (10, 60), "Confraternizações": (29, 200), "Farmácia": (10, 300),
    "Saúde": (40, 300), "Academia": (130, 130), "Assinaturas": (5.9, 60),
    "Combustível": (100, 500), "Passagem": (12, 180), "Transporte": (12, 60),
    "Barbeiro": (60, 120), "Vestuário": (60, 300), "Pets": (50, 200),
    "Presentes": (40, 250), "Lazer": (25, 180), "Outros": (10, 120),
}
formas = [c["nome"] for c in cartoes] + ["Débito", "Pix", "Dinheiro", "VA"]
pessoas = ["Vini", "Lidia"]
hoje = datetime.date.today()

linhas = []
uid = 1
for atras in range(5, -1, -1):
    m, a = hoje.month - atras, hoje.year
    while m <= 0:
        m += 12; a -= 1
    ultimo = (datetime.date(a + m // 12, m % 12 + 1, 1) - datetime.timedelta(days=1)).day
    limite = hoje.day if atras == 0 else ultimo
    comp = f"{a}-{m:02d}"

    def add(dia, tipo, valor, categoria, forma, descricao, pessoa, fixo=""):
        global uid
        cart = next((c for c in cartoes if c["nome"] == forma), None)
        fatura = competencia_fatura(a, m, dia, cart) if cart else ""
        linhas.append({
            "update_id": uid, "data": f"{comp}-{dia:02d}",
            "competencia": competencia_ciclo(a, m, dia, cart),
            "competencia_fatura": fatura, "criado_em": f"{comp}-{dia:02d}T12:00:00Z",
            "tipo": tipo, "valor": f"{valor:.2f}", "categoria": categoria, "forma": forma,
            "descricao": descricao, "pessoa": pessoa, "fixo": fixo,
            "mensagem": f"{descricao.lower()} {valor:.2f}", "confianca": "0.95",
        })
        uid += 1

    for pessoa, sal in (("Vini", 7000), ("Lidia", 4800)):
        if limite >= 5:
            add(5, "entrada", sal, "Salário", "", "Salário", pessoa)
    for f in fixos:                                   # os fixos do mês, quase todos pagos
        dia = min(int(f["dia_vencimento"]), limite)
        if dia >= 1 and random.random() > 0.15:
            add(dia, "saida", float(f["valor"]), f["categoria"], "Débito", f["nome"], "Vini", f["nome"])
    if limite >= 12:
        add(12, "investimento", 400, "Investimento", "Pix", "Reserva de emergência", "Vini")
    for _ in range(random.randint(20, 30)):
        cat = random.choice(list(catalogo)); lo, hi = catalogo[cat]
        add(random.randint(1, max(1, limite)), "saida", round(random.uniform(lo, hi), 2),
            cat, random.choice(formas), cat, random.choice(pessoas))

cab = list(linhas[0].keys())
with io.open(os.path.join(dest, "lancamentos.csv"), "w", encoding="utf-8", newline="") as fp:
    w = csv.DictWriter(fp, fieldnames=cab)
    w.writeheader(); w.writerows(linhas)
print(f"{len(linhas)} lançamentos de exemplo, seis meses até hoje")
PY

echo "dashboard em http://localhost:8899  (Ctrl-C encerra)"
cd "$DEST" && python3 -m http.server 8899
