from __future__ import annotations

import json
import shutil
import threading
import time
from datetime import datetime, timedelta, timezone

from fila import MAX_ATTEMPTS, POLL_INTERVAL_SECONDS, QUEUE_DIR, RETRY_BASE_SECONDS, RETRY_MAX_SECONDS, _artifact_path, _claim_next_job, _enviar_email, _job_path, _write_json, gerar_zip
from fila_pipeline import _aplicar_auditoria_marcas, _chamar_ia, _substituir_contextos, _validar_json_geracao


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _delay(attempts: int) -> int:
    return min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * (2 ** max(0, attempts - 1)))


def _process_pipeline(job: dict) -> None:
    container = job.get("dados_ia") if isinstance(job.get("dados_ia"), dict) else {}
    pipeline = container.get("__LICITA_PIPELINE__")
    if not isinstance(pipeline, dict):
        raise RuntimeError("Solicitação sem pipeline de IA assíncrona; recrie a solicitação.")

    etapas = pipeline.get("etapas")
    if not isinstance(etapas, list) or not etapas:
        raise RuntimeError("A solicitação não possui etapas de IA válidas.")

    dados_usuario = dict(job.get("pipeline_dados_usuario") or job.get("dados_usuario") or {})
    resultados = dict(job.get("pipeline_results") or {})
    completed = {str(item).upper() for item in job.get("completed_stages", [])}
    modelo = str(job.get("resolved_model") or pipeline.get("model") or "openrouter/free")
    temperatura = float(pipeline.get("temperature", 0.3))

    for etapa in etapas:
        etapa_id = str(etapa.get("id", "")).strip().upper()
        etapa_tipo = str(etapa.get("tipo", "geracao_json"))
        prompt = str(etapa.get("prompt", ""))
        if not etapa_id or not prompt:
            raise RuntimeError("Há uma etapa de IA incompleta na fila.")
        if etapa_id in completed and etapa_id in resultados:
            continue

        job["current_stage"] = etapa_id
        job["current_stage_started_at"] = _utc_now()
        job["status"] = "processing"
        _write_json(_job_path(job["job_id"], ".processing"), job)

        prompt_processado = _substituir_contextos(prompt, dados_usuario, resultados)
        if etapa_tipo in {"geracao_unificada", "geracao_contratacao_direta"}:
            prompt_processado += "\n\nDADOS ATUALIZADOS APÓS ETAPAS ANTERIORES:\n" + json.dumps(dados_usuario, ensure_ascii=False, indent=2)
            if resultados:
                prompt_processado += "\n\nRESULTADOS JÁ PRODUZIDOS NESTA SOLICITAÇÃO:\n" + json.dumps(resultados, ensure_ascii=False, indent=2)

        resultado, modelo_resolvido = _chamar_ia(prompt_processado, modelo, temperatura)
        if pipeline.get("model") == "openrouter/free" and modelo_resolvido:
            modelo = modelo_resolvido
            job["resolved_model"] = modelo_resolvido

        if etapa_tipo == "auditoria_marcas":
            dados_usuario, resultado_final = _aplicar_auditoria_marcas(dados_usuario, resultado)
            resultados[etapa_id] = resultado_final
        elif etapa_tipo == "geracao_unificada":
            resultado_final = _validar_json_geracao(resultado)
            for bloco in ("DFD", "ETP", "TR"):
                if not isinstance(resultado_final.get(bloco), dict):
                    raise RuntimeError(f"A IA não retornou o bloco {bloco} no JSON unificado.")
                if not resultado_final[bloco]:
                    raise RuntimeError(f"O bloco {bloco} retornado pela IA está vazio.")
                vazios = [chave for chave, valor in resultado_final[bloco].items() if isinstance(valor, str) and not valor.strip()]
                if vazios:
                    raise RuntimeError(f"O bloco {bloco} possui campos vazios: {', '.join(vazios)}")
            resultados[etapa_id] = resultado_final
        else:
            resultados[etapa_id] = _validar_json_geracao(resultado)

        completed.add(etapa_id)
        job["pipeline_results"] = resultados
        job["pipeline_dados_usuario"] = dados_usuario
        job["completed_stages"] = sorted(completed)
        _write_json(_job_path(job["job_id"], ".processing"), job)

    dados_ia_final: dict = {}
    for etapa_id, resultado in resultados.items():
        if etapa_id == "AUDITORIA_MARCAS" or not isinstance(resultado, dict):
            continue
        if etapa_id == "FASE_PREPARATORIA" and all(isinstance(resultado.get(bloco), dict) for bloco in ("DFD", "ETP", "TR")):
            for bloco in ("DFD", "ETP", "TR"):
                dados_ia_final.update(resultado[bloco])
        else:
            dados_ia_final.update(resultado)

    generated_path, zip_filename = gerar_zip(dados_usuario, dados_ia_final, job["job_id"])
    temp_root = generated_path.parent
    artifact_path = _artifact_path(job["job_id"])
    try:
        artifact_path.unlink(missing_ok=True)
        shutil.move(str(generated_path), str(artifact_path))
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)

    job["dados_usuario_processados"] = dados_usuario
    job["dados_ia"] = dados_ia_final
    job["current_stage"] = "ENVIO_EMAIL"
    job["email_started_at"] = _utc_now()
    _write_json(_job_path(job["job_id"], ".processing"), job)

    _enviar_email(job["email"], artifact_path, zip_filename, job["job_id"])

    job.update({"status": "sent", "completed_at": _utc_now(), "current_stage": "CONCLUIDO", "result": {"filename": zip_filename, "recipient": job["email"]}})
    _write_json(_job_path(job["job_id"], ".done"), job)
    artifact_path.unlink(missing_ok=True)
    _job_path(job["job_id"], ".processing").unlink(missing_ok=True)


def _process_one_job() -> None:
    claimed = _claim_next_job()
    if claimed is None:
        return
    processing_path, job = claimed
    try:
        _process_pipeline(job)
    except Exception as exc:
        attempts = int(job.get("attempts", 1))
        job["last_error"] = str(exc)
        job["last_error_at"] = _utc_now()
        job["current_stage"] = job.get("current_stage") or "PROCESSAMENTO"
        if attempts < MAX_ATTEMPTS:
            job["status"] = "queued"
            job["retry_at"] = (datetime.now(timezone.utc) + timedelta(seconds=_delay(attempts))).isoformat()
            _write_json(_job_path(job["job_id"]), job)
            processing_path.unlink(missing_ok=True)
        else:
            job["status"] = "failed"
            job.pop("retry_at", None)
            _write_json(_job_path(job["job_id"], ".failed"), job)
            processing_path.unlink(missing_ok=True)
            _artifact_path(job["job_id"]).unlink(missing_ok=True)


def _worker_loop() -> None:
    while True:
        try:
            _process_one_job()
        except Exception:
            pass
        time.sleep(POLL_INTERVAL_SECONDS)


_worker_thread: threading.Thread | None = None


def iniciar_worker() -> None:
    global _worker_thread
    if _worker_thread is not None and _worker_thread.is_alive():
        return
    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    _worker_thread = threading.Thread(target=_worker_loop, name="licita-ai-pipeline-unificado", daemon=True)
    _worker_thread.start()
