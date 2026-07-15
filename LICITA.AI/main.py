import sys
import json
import os
from datetime import datetime
import traceback
import config
from MONTAEDITAL.montador_variaveis import montar_variaveis_fixas, filtrar_chaves_docx
from MONTAEDITAL.processador_docx import modificar_documento

def _valor_vazio(valor):
    if valor is None:
        return True
    texto_lower = str(valor).strip().lower()
    return not texto_lower or texto_lower in [
        "não informado", "nã£o informado", "n?o informado",
        "nao informado", "[não informado]", "[nao informado]", "[n?o informado]"
    ]

def _garantir_caminho_seguro(base, caminho):
    abs_base = os.path.abspath(base)
    abs_caminho = os.path.abspath(os.path.join(base, caminho))
    if not abs_caminho.startswith(abs_base):
        raise ValueError("Acesso não autorizado a diretório externo.")
    return abs_caminho

def processar():
    try:
        if hasattr(sys.stdin, 'reconfigure'):
            sys.stdin.reconfigure(encoding='utf-8')
        input_data = sys.stdin.read().strip()
        if not input_data:
            return

        payload = json.loads(input_data)
        
        app_data_dir = payload.get("app_data_dir")
        if app_data_dir:
            config.carregar_settings(app_data_dir)

        acao = payload.get("acao")

        if acao == "salvar_documentos":
            dados_ia = payload.get("dados_ia") or {}
            dados_usuario = payload.get("dados_usuario") or {}
            preenchimentos_manuais = payload.get("preenchimentos_manuais") or {}
            pasta_saida_raw = payload.get("pasta_saida", "Documentos_Gerados")
            pasta_modelos_raw = payload.get("pasta_modelos", "modelos")
            arquivos_base = payload.get("arquivos_base", [])

            pasta_modelos = _garantir_caminho_seguro(config.BASE_DIR, pasta_modelos_raw)
            pasta_saida = _garantir_caminho_seguro(config.EXECUTABLE_DIR, pasta_saida_raw)

            modificacoes = filtrar_chaves_docx(montar_variaveis_fixas(dados_usuario))
            
            for chave, valor in dados_ia.items():
                chave_docx = chave if chave.startswith("{{") and chave.endswith("}}") else f"{{{{{chave}}}}}"
                modificacoes[chave_docx] = valor

            for chave1, chave2 in config.ALIASES:
                val1, val2 = modificacoes.get(chave1), modificacoes.get(chave2)
                vazio1, vazio2 = _valor_vazio(val1), _valor_vazio(val2)
                if not vazio1 and vazio2:
                    modificacoes[chave2] = val1
                elif not vazio2 and vazio1:
                    modificacoes[chave1] = val2

            if _valor_vazio(modificacoes.get("{{MES_INICIO}}")):
                modificacoes["{{MES_INICIO}}"] = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][datetime.now().month - 1]

            modificacoes.update(preenchimentos_manuais)

            for _ in range(3):
                mudou = False
                for k, v in modificacoes.items():
                    if isinstance(v, str) and "{{" in v:
                        novo_v = v
                        for sub_k, sub_v in modificacoes.items():
                            if sub_k != k and sub_k in novo_v and isinstance(sub_v, str):
                                novo_v = novo_v.replace(sub_k, sub_v)
                        if novo_v != v:
                            modificacoes[k] = novo_v
                            mudou = True
                if not mudou:
                    break

            itens_json = modificacoes.get("{{ITENS}}")
            if not _valor_vazio(itens_json):
                itens_str = str(itens_json)
                if itens_str.startswith("__TABLE__"):
                    itens_str = itens_str.replace("__TABLE__", "")
                    
                try:
                    itens = json.loads(itens_str) if isinstance(itens_str, str) else itens_json
                    
                    itens_formatados = []
                    itens_sem_valor = []
                    
                    for item in itens:
                        try:
                            valor_unit = float(item.get("valor", 0))
                        except (ValueError, TypeError):
                            valor_unit = 0.0
                            
                        try:
                            qtd = float(item.get("qtd", 0))
                        except (ValueError, TypeError):
                            qtd = 0.0
                            
                        total = valor_unit * qtd
                        
                        def formata_moeda(v):
                            s = f"{v:,.2f}"
                            s = s.replace(",", "X").replace(".", ",").replace("X", ".")
                            return f"R$ {s}"
                        
                        item_formatado = {
                            "Item": item.get("numero", ""),
                            "Descrição": item.get("descricao", ""),
                            "UN": item.get("un", ""),
                            "Qtd": item.get("qtd", ""),
                            "Vlr Unit.": formata_moeda(valor_unit),
                            "Total": formata_moeda(total)
                        }
                        itens_formatados.append(item_formatado)
                        
                        item_sv = {
                            "Item": item.get("numero", ""),
                            "Descrição": item.get("descricao", ""),
                            "UN": item.get("un", ""),
                            "Qtd": item.get("qtd", "")
                        }
                        itens_sem_valor.append(item_sv)
                    
                    modificacoes["{{ITENS}}"] = f"__TABLE__{json.dumps(itens_formatados, ensure_ascii=False)}"
                    modificacoes["{{ITENS_SEMVALOR}}"] = f"__TABLE__{json.dumps(itens_sem_valor, ensure_ascii=False)}"
                except Exception:
                    # Em caso de erro ao converter (ex: já estar formatado ou estrutura errada)
                    if not str(itens_json).startswith("__TABLE__"):
                        modificacoes["{{ITENS}}"] = f"__TABLE__{str(itens_json)}"

            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            pasta_lote = os.path.join(pasta_saida, timestamp)
            os.makedirs(pasta_lote, exist_ok=True)
            arquivos_gerados = []

            for arq in arquivos_base:
                cam_origem = os.path.join(pasta_modelos, arq)
                cam_destino = os.path.join(pasta_lote, f"Pronto_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}_{arq}")
                if os.path.exists(cam_origem):
                    modificar_documento(cam_origem, cam_destino, modificacoes)
                    arquivos_gerados.append(cam_destino)

            print(json.dumps({"sucesso": True, "arquivos": arquivos_gerados}))

    except Exception as e:
        print(json.dumps({"sucesso": False, "erro": str(e), "traceback": traceback.format_exc()}))

if __name__ == "__main__":
    processar()