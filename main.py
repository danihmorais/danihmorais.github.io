import sys
import importlib.util
from fastapi import FastAPI

def load_app_from_path(module_name, file_path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module.app

app_licita = load_app_from_path("licita_main", "LICITA.AI/main.py")
app_monta = load_app_from_path("monta_main", "MONTAEDITAL/main.py")

app = FastAPI()

app.mount("/licita", app_licita)
app.mount("/monta", app_monta)