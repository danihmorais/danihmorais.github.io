from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from fila import EMAIL_RE, enqueue_job, get_job, iniciar_worker

app = FastAPI(title="Licita.AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://danihmorais.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FasePreparatoriaRequest(BaseModel):
    email: str
    instrucoes: str = ""
    dados_ia: dict = Field(default_factory=dict)
    dados_usuario: dict = Field(default_factory=dict)


@app.post("/api/gerar-fase-preparatoria")
async def agendar_fase_preparatoria(req: FasePreparatoriaRequest):
    email = req.email.strip()
    if not EMAIL_RE.fullmatch(email):
        raise HTTPException(status_code=400, detail="Informe um e-mail válido para receber os documentos.")

    try:
        return enqueue_job(
            email=email,
            dados_usuario=req.dados_usuario,
            dados_ia=req.dados_ia,
            instrucoes=req.instrucoes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Não foi possível agendar a solicitação: {exc}") from exc


@app.get("/api/fila/{job_id}")
async def consultar_fila(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")

    return {
        "job_id": job.get("job_id", job_id),
        "status": job.get("status", "unknown"),
        "created_at": job.get("created_at"),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "attempts": job.get("attempts", 0),
        "email": job.get("email"),
        "last_error": job.get("last_error"),
        "result": job.get("result"),
    }


iniciar_worker()
