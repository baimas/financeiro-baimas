#!/usr/bin/env bash
# Abre o dashboard no navegador com lançamentos de exemplo, sem planilha nenhuma.
#
# Serve para ver a página funcionando (e mexer no CSS) antes de existir Google
# Sheets. O dashboard precisa de http(s): por file:// o navegador bloqueia a
# leitura do CSV, e é por isso que este script sobe um servidor.
#
#   scripts/dashboard-local.sh          → http://localhost:8899
#   Ctrl-C encerra.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST=$(mktemp -d)
trap 'rm -rf "$DEST"' EXIT

# a página é a de verdade; só a origem do CSV muda
sed 's|const CSV_URL = "COLE_AQUI_A_URL_CSV_PUBLICADA";|const CSV_URL = "./exemplo.csv";|' \
  dashboard/index.html > "$DEST/index.html"

python3 - "$DEST/exemplo.csv" <<'PY'
import random, sys, datetime
random.seed(7)
cats = {"Mercado":(60,400),"Alimentacao":(18,90),"Transporte":(12,220),"Moradia":(90,2300),
        "Saude":(40,300),"Lazer":(25,180),"Assinaturas":(19,60),"Pets":(50,200),
        "Vestuario":(60,300),"Educacao":(120,400),"Presentes":(40,250),"Outros":(10,120)}
hoje = datetime.date.today()
linhas = ["update_id,data,competencia,criado_em,tipo,valor,categoria,descricao,pessoa,mensagem,confianca"]
uid = 1
for atras in range(5, -1, -1):                      # seis meses até o atual
    m = hoje.month - atras; a = hoje.year
    while m <= 0: m += 12; a -= 1
    comp = f"{a}-{m:02d}"
    ultimo = (datetime.date(a + m // 12, m % 12 + 1, 1) - datetime.timedelta(days=1)).day
    limite = hoje.day if atras == 0 else ultimo
    for pessoa, sal in (("Vini", 6200), ("Lidia", 4800)):
        if limite >= 5:
            linhas.append(f"{uid},{comp}-05,{comp},{comp}-05T09:00:00Z,entrada,{sal},Salario,Salario,{pessoa},caiu o salario,0.99"); uid += 1
    for _ in range(random.randint(22, 34)):
        c = random.choice(list(cats)); lo, hi = cats[c]
        v = round(random.uniform(lo, hi), 2); d = random.randint(1, max(1, limite))
        p = random.choice(["Vini", "Lidia"])
        linhas.append(f'{uid},{comp}-{d:02d},{comp},{comp}-{d:02d}T12:00:00Z,saida,{v},{c},"gasto de {c.lower()}",{p},"{c.lower()} {v}",0.9'); uid += 1
open(sys.argv[1], "w").write("\n".join(linhas) + "\n")
print(f"{len(linhas)-1} lançamentos de exemplo, seis meses até hoje")
PY

echo "dashboard em http://localhost:8899  (Ctrl-C encerra)"
cd "$DEST" && python3 -m http.server 8899
