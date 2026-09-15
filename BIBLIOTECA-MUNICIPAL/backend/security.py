from datetime import date, datetime, timezone
import json

from fastapi import Request
from starlette.responses import JSONResponse

import main

LOGIN_WINDOW=15*60
LOGIN_LIMIT=5
LOGIN_FAILURES={}


def client_key(request:Request):
    forwarded=request.headers.get('x-forwarded-for','').split(',')[0].strip()
    return forwarded or (request.client.host if request.client else 'unknown')


@main.app.middleware('http')
async def security_middleware(request:Request,call_next):
    path=request.url.path
    if path=='/api/auth/login' and request.method=='POST':
        key=client_key(request); now=datetime.now(timezone.utc).timestamp(); failures=[x for x in LOGIN_FAILURES.get(key,[]) if now-x<LOGIN_WINDOW]; LOGIN_FAILURES[key]=failures
        if len(failures)>=LOGIN_LIMIT:
            return JSONResponse({'detail':'Muitas tentativas. Tente novamente em alguns minutos.'},status_code=429)
        response=await call_next(request)
        if response.status_code in (401,403,429): LOGIN_FAILURES.setdefault(key,[]).append(now)
        else: LOGIN_FAILURES.pop(key,None)
        return response
    if path=='/api/emprestimos' and request.method=='POST':
        body=await request.body()
        async def receive(): return {'type':'http.request','body':body,'more_body':False}
        request._receive=receive
        try:
            payload=json.loads(body.decode('utf-8')); value=payload.get('prevista_devolucao'); parsed=date.fromisoformat(value)
            if parsed<date.today(): return JSONResponse({'detail':'A data de devolução prevista não pode ser anterior a hoje.'},status_code=422)
        except (ValueError,TypeError,AttributeError,json.JSONDecodeError):
            return JSONResponse({'detail':'A data de devolução prevista deve ser válida no formato AAAA-MM-DD.'},status_code=422)
        return await call_next(request)
    return await call_next(request)
