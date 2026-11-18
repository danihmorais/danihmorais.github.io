import { getApiBaseUrl } from "../utils/apiBase";

const MAX_TENTATIVAS = 3;
// Evita que a interface fique pendurada se o backend não responder (o backend já limita a 180 s).
const TIMEOUT_REQUISICAO_MS = 240_000;

const API_URL = getApiBaseUrl();
const IA_ITEM_URL = `${API_URL}/licita/api/ia/item`;

const CHAVE_LOGS_ERRO = "licita_ai:logs_erro";
const MAX_LOGS_GUARDADOS = 20;

async function salvarLogErro(prefixo: string, erro: any) {
  try {
    const entrada = {
      prefixo,
      data: new Date().toISOString(),
      mensagem: erro instanceof Error ? erro.message : String(erro),
      
      
    };
    console.error(`[${prefixo}]`, entrada);
    const brutos = localStorage.getItem(CHAVE_LOGS_ERRO);
    const logs = brutos ? JSON.parse(brutos) : [];
    logs.push(entrada);
    while (logs.length > MAX_LOGS_GUARDADOS) logs.shift();
    localStorage.setItem(CHAVE_LOGS_ERRO, JSON.stringify(logs));
  } catch {}
}

// Corrige strings JSON com barras sem escape válido (ex.: C:\Licita\edital.docx) e com
// quebras/controles crus, preservando os escapes válidos. A barra inválida é mantida
// (duplicada), nunca descartada.
export function extrairEConverterJSON(rawText: string): any {
  try {
    return JSON.parse(String(rawText ?? "").trim());
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    throw new Error(`FATAL:O backend não retornou JSON válido conforme o schema estrito. ${detalhe}`);
  }
}


async function chamarBackend(payload: Record<string, any>): Promise<any> {
  if (!API_URL) throw new Error("API do Licita.AI não configurada.");
  const signal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(TIMEOUT_REQUISICAO_MS) : undefined;
  const response = await fetch(IA_ITEM_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    let detalhe = `HTTP ${response.status}`;
    try { const parsed = raw ? JSON.parse(raw) : null; if (parsed?.detail) detalhe = String(parsed.detail); } catch {}
    const temporario = [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
    throw new Error(`${temporario ? "TEMP:" : "FATAL:"}${response.status}:${detalhe}`);
  }
  let data: any;
  try { data = raw ? JSON.parse(raw) : null; } catch { throw new Error("A API do backend retornou uma resposta inválida."); }
  if (!data?.content) throw new Error("A API do backend retornou uma resposta vazia.");
  return { json: extrairEConverterJSON(String(data.content)), model: typeof data.model === "string" ? data.model : "unsloth-auto" };
}

export type TarefaIAItem = "auditoria_marcas" | "melhorar_descricao";

export async function gerarTextoIA(tarefa: TarefaIAItem, dados: Record<string, any>): Promise<any> {
  let tentativaAtual = 0;
  let ultimoErro = "";
  while (tentativaAtual < MAX_TENTATIVAS) {
    try {
      const resultado = await chamarBackend({ tarefa, ...dados });
      return resultado.json;
    } catch (erro: any) {
      ultimoErro = erro.message || String(erro);
      tentativaAtual++;
      if (ultimoErro.startsWith("FATAL:")) {
        await salvarLogErro("llm-erro-fatal", erro);
        throw new Error(ultimoErro.replace(/^FATAL:/, "").replace(/^\d+:/, "").trim());
      }
      if (tentativaAtual >= MAX_TENTATIVAS) {
        await salvarLogErro("llm-falha-limite", erro);
        throw new Error(`O sistema tentou ${MAX_TENTATIVAS} vezes, mas a inteligência artificial não conseguiu concluir a tarefa.\nÚltimo erro: ${ultimoErro}`);
      }
      await new Promise((resolve) => setTimeout(resolve, tentativaAtual * 2000));
    }
  }
  throw new Error(ultimoErro || "Falha na IA.");
}
