const MAX_TENTATIVAS = 3;

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const IA_CHAT_URL = `${API_URL}/licita/api/ia/chat`;

const CHAVE_LOGS_ERRO = "licita_ai:logs_erro";
const MAX_LOGS_GUARDADOS = 20;

async function salvarLogErro(prefixo: string, erro: any, dadosCrus: any = null) {
  try {
    const entrada = {
      prefixo,
      data: new Date().toISOString(),
      mensagem: erro instanceof Error ? erro.message : String(erro),
      stack: erro instanceof Error ? erro.stack : undefined,
      dadosCrus: dadosCrus ? (typeof dadosCrus === "string" ? dadosCrus : JSON.stringify(dadosCrus, null, 2)) : undefined,
    };
    console.error(`[${prefixo}]`, entrada);
    const brutos = localStorage.getItem(CHAVE_LOGS_ERRO);
    const logs = brutos ? JSON.parse(brutos) : [];
    logs.push(entrada);
    while (logs.length > MAX_LOGS_GUARDADOS) logs.shift();
    localStorage.setItem(CHAVE_LOGS_ERRO, JSON.stringify(logs));
  } catch {}
}

function sanitizarJSON(texto: string): string {
  let inString = false;
  let isEscaped = false;
  let result = "";
  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    if (!inString) { if (char === '"') inString = true; result += char; continue; }
    if (isEscaped) {
      const validEscapes = ['"', "\\", "/", "b", "f", "n", "r", "t", "u"];
      if (validEscapes.includes(char)) result += char;
      else { result = result.slice(0, -1); if (char === "\n") result += "\\n"; else if (char === "\t") result += "\\t"; else if (char.charCodeAt(0) >= 32) result += char; }
      isEscaped = false;
    } else if (char === "\\") { isEscaped = true; result += "\\"; }
    else if (char === '"') { inString = false; result += '"'; }
    else if (char === "\n") result += "\\n";
    else if (char === "\r") {}
    else if (char === "\t") result += "\\t";
    else if (char.charCodeAt(0) >= 32) result += char;
  }
  return result;
}

function extrairEConverterJSON(rawText: string): any {
  let texto = rawText.trim();
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio !== -1 && fim !== -1) texto = texto.substring(inicio, fim + 1);
  try { return JSON.parse(texto); }
  catch {
    try { return JSON.parse(texto.replace(/,\s*([\}\]])/g, "$1")); }
    catch {
      try { return JSON.parse(sanitizarJSON(texto).replace(/,\s*([\}\]])/g, "$1")); }
      catch (e) { throw new Error(`O texto gerado pela IA está corrompido.\nErro técnico: ${e instanceof Error ? e.message : e}`); }
    }
  }
}

async function chamarBackend(payload: Record<string, any>): Promise<any> {
  if (!API_URL) throw new Error("API do Licita.AI não configurada.");
  const response = await fetch(IA_CHAT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
  return { json: extrairEConverterJSON(String(data.content)), model: typeof data.model === "string" ? data.model : payload.model, provider: "unsloth" };
}

export async function gerarTextoIA(prompt: string, _legacyApiKey: string, model: string, onModelResolved?: (modelUsed: string) => void): Promise<any> {
  let tentativaAtual = 0;
  let ultimoErro = "";
  while (tentativaAtual < MAX_TENTATIVAS) {
    try {
      const modeloDaRequisicao = !model ? "unsloth-auto" : model;
      const resultado = await chamarBackend({ model: modeloDaRequisicao, prompt, temperature: 0.3, response_format: { type: "json_object" } });
      onModelResolved?.(resultado.model);
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
        throw new Error(`O sistema tentou ${MAX_TENTATIVAS} vezes, mas a inteligência artificial não conseguiu concluir o texto corretamente.\nÚltimo erro: ${ultimoErro}`);
      }
      await new Promise((resolve) => setTimeout(resolve, tentativaAtual * 2000));
    }
  }
  throw new Error(ultimoErro || "Falha na IA.");
}
