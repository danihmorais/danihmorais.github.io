"""Smoke test do backend agregador (main.py da raiz).

Sobe o app FastAPI completo com todos os sub-apps montados e confere as mesmas
rotas que o workflow de deploy valida em produção. Usa diretórios temporários,
então não toca no banco da biblioteca nem nos documentos reais.

Uso (a partir da raiz do repositório):
    python scripts/smoke_aggregator.py
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://danihmorais.github.io"

# O main.py carrega os sub-apps por caminho relativo ao diretório atual.
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

_tmp = tempfile.TemporaryDirectory(prefix="smoke-aggregator-")
_docs = Path(_tmp.name) / "docs"
(_docs / ".oculto").mkdir(parents=True)
(_docs / "exemplo.pdf").write_bytes(b"%PDF-1.4\n")
(_docs / ".oculto" / "exemplo.txt").write_text("x", encoding="utf-8")
(Path(_tmp.name) / "biblioteca").mkdir()

# Atribuição direta (não setdefault): o smoke nunca deve usar dados reais.
os.environ["BIBLIOTECA_DATA_DIR"] = str(Path(_tmp.name) / "biblioteca")
os.environ["DOCUMENTOS_LICITACAO_DIR"] = str(_docs)

import main  # noqa: E402  (precisa vir depois do chdir/variáveis de ambiente)
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(main.app)
failures: list[str] = []


def check(name: str, condition: bool, detail: object = "") -> None:
    print(f"{'OK  ' if condition else 'FAIL'} {name}", "" if condition else detail)
    if not condition:
        failures.append(name)


response = client.get("/health", headers={"Origin": ORIGIN})
check("/health", response.status_code == 200 and response.json().get("status") == "ok", response.text)

for endpoint in (
    "/licita/openapi.json",
    "/monta/openapi.json",
    "/email/openapi.json",
    "/geradorextrato/openapi.json",
    "/biblioteca-api/openapi.json",
):
    response = client.get(endpoint)
    check(endpoint, response.status_code == 200, response.status_code)

response = client.options(
    "/geradorextrato/api/analyze",
    headers={
        "Origin": ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    },
)
check(
    "CORS (POST /geradorextrato/api/analyze)",
    response.headers.get("access-control-allow-origin") == ORIGIN
    and "POST" in response.headers.get("access-control-allow-methods", ""),
    dict(response.headers),
)

response = client.get("/files", headers={"Origin": ORIGIN})
check(
    "/files",
    response.status_code == 200
    and isinstance(response.json().get("files"), list)
    and response.headers.get("access-control-allow-origin") == ORIGIN,
    response.text,
)

response = client.get("/files2", headers={"Origin": ORIGIN})
payload = response.json() if response.status_code == 200 else {}
check(
    "/files2",
    response.status_code == 200
    and payload.get("hidden_only") is True
    and response.headers.get("access-control-allow-origin") == ORIGIN,
    response.text,
)

print("RESULTADO:", "tudo certo" if not failures else f"falhou: {', '.join(failures)}")
sys.stdout.flush()
# os._exit evita que threads de background (workers dos sub-apps) segurem o processo.
os._exit(1 if failures else 0)
