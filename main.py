import sys
import os
import importlib.util
from fastapi import FastAPI


def load_app_from_path(module_name, file_path, dir_name):
    original_cwd = os.getcwd()
    original_sys_path = sys.path.copy()

    abs_dir = os.path.abspath(dir_name)
    os.chdir(abs_dir)
    sys.path.insert(0, abs_dir)
    sys.path.insert(0, original_cwd)

    try:
        abs_file_path = os.path.join(original_cwd, file_path)
        spec = importlib.util.spec_from_file_location(module_name, abs_file_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Não foi possível carregar {file_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module.app
    finally:
        os.chdir(original_cwd)
        sys.path = original_sys_path


app_licita = load_app_from_path("licita_main", "LICITA.AI/main.py", "LICITA.AI")
app_monta = load_app_from_path("monta_main", "MONTAEDITAL/main.py", "MONTAEDITAL")
app_email = load_app_from_path("email_main", "EMAIL-ATAS-CONTRATOS/main.py", "EMAIL-ATAS-CONTRATOS")
app_extrato = load_app_from_path("extrato_main", "GERADOREXTRATO/main.py", "GERADOREXTRATO")

# O repositório PROJETO-TJSP fica como projeto irmão no servidor Ubuntu.
# PROJETO_TJSP_ROOT pode sobrescrever esse caminho no ambiente de produção.
site_root = os.path.dirname(os.path.abspath(__file__))
tjsp_root = os.environ.get(
    "PROJETO_TJSP_ROOT",
    os.path.abspath(os.path.join(site_root, "..", "PROJETO-TJSP")),
)
tjsp_main = os.path.join(tjsp_root, "tjsp_main.py")

if os.path.isfile(tjsp_main):
    app_tjsp = load_app_from_path("tjsp_main", tjsp_main, tjsp_root)
else:
    app_tjsp = None

app = FastAPI(title="Universo da Licitação API")

app.mount("/licita", app_licita)
app.mount("/monta", app_monta)
app.mount("/email", app_email)
app.mount("/geradorextrato", app_extrato)

# Namespace sem o nome do projeto: o frontend usa API_URL/estudos.
if app_tjsp is not None:
    app.mount("/estudos", app_tjsp)
