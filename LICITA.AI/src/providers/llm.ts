const MAX_TENTATIVAS = 3;

export interface OpcaoModelo { value: string; label: string; }

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_UNSLOTH_KEY = import.meta.env.VITE_API_UNSLOTH_KEY || "";
const API_OPENROUTER_KEY = import.meta.env.VITE_API_OPENROUTER_KEY || "";
const UNSLOTH_URL = `${API_URL}/unsloth/v1`;
const OPENROUTER_URL = "https://openrouter.ai/api/v1";

export const MODELOS_DISPONIVEIS: Record<string, OpcaoModelo[]> = {
  unsloth: [{ value: "unsloth-auto", label: "Modelo local Unsloth (automático)" }],
  openrouter: [
    { value: "openrouter/free", label: "OpenRouter Free (modelo automático gratuito)" },
    { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (Anthropic)" },
    { value: "openai/gpt-5", label: "GPT-5 (OpenAI)" },
    { value: "google/gemini-3.1-pro", label: "Gemini 3.1 Pro (via OpenRouter)" },
    { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct (Meta)" },
    { value: "deepseek/deepseek-r1", label: "DeepSeek R1" },
  ],
};

export const MODELO_PADRAO_POR_PROVEDOR: Record<string, string> = { unsloth: "unsloth-auto", openrouter: "openrouter/free" };
const CHAVE_LOGS_ERRO = "licita_ai:logs_erro";
const MAX_LOGS_GUARDADOS = 20;
let modeloLivreFixado: string | null = null;
let modeloUnsloth: string | null = null;

async function salvarLogErro(prefixo: string, erro: any, dadosCrus: any = null) {
  try {
    const entrada = { prefixo, data: new Date().toISOString(), mensagem: erro instanceof Error ? erro.message : String(erro), stack: erro instanceof Error ? erro.stack : undefined, dadosCrus: dadosCrus ? (typeof dadosCrus === "string" ? dadosCrus : JSON.stringify(dadosCrus, null, 2)) : undefined };
    console.error(`[${prefixo}]`, entrada);
    const brutos = localStorage.getItem(CHAVE_LOGS_ERRO);
    const logs = brutos ? JSON.parse(brutos) : [];
    logs.push(entrada);
    while (logs.length > MAX_LOGS_GUARDADOS) logs.shift();
    localStorage.setItem(CHAVE_LOGS_ERRO, JSON.stringify(logs));
  } catch {}
}

function sanitizarJSON(texto: string): string {
  let inString = false, isEscaped = false, result = "";
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
    else if (char === "\t") result += "\\t";
    else if (char.charCodeAt(0) >= 32) result += char;
  }
  return result;
}

function extrairEConverterJSON(rawText: string): any {
  let texto = rawText.trim();
  const inicio = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  if (inicio !== -1 && fim !== -1) texto = texto.substring(inicio, fim + 1);
  try { return JSON.parse(texto); }
  catch { try { return JSON.parse(texto.replace(/,\s*([\}\]])/g, "$1")); }
  catch { try { return JSON.parse(sanitizarJSON(texto).replace(/,\s*([\}\]])/g, "$1")); }
  catch (e) { throw new Error(`O texto gerado pela IA foi interrompido abruptamente ou está corrompido.\nErro técnico: ${e instanceof Error ? e.message : e}`); } }
}

async function obterModeloUnsloth(): Promise<string> {
  if (modeloUnsloth) return modeloUnsloth;
  const response = await fetch(`${UNSLOTH_URL}/models`, { headers: { Authorization: `Bearer ${API_UNSLOTH_KEY}` } });
  if (!response.ok) throw new Error(`Unsloth indisponível (HTTP ${response.status})`);
  const data = await response.json();
  const modelo = data?.data?.[0]?.id;
  if (!modelo) throw new Error("A API Unsloth não informou nenhum modelo disponível.");
  modeloUnsloth = modelo;
  return modelo;
}

export async function validarChaveUnsloth(): Promise<boolean> {
  if (!API_UNSLOTH_KEY || !API_URL) return false;
  try {
    const response = await fetch(`${UNSLOTH_URL}/models`, { headers: { Authorization: `Bearer ${API_UNSLOTH_KEY}` } });
    if (!response.ok) await salvarLogErro("validacao-unsloth", `HTTP ${response.status}`, await response.text());
    return response.ok;
  } catch (error) { await salvarLogErro("excecao-validacao-unsloth", error); return false; }
}

export async function validarChaveOpenRouter(apiKey: string = API_OPENROUTER_KEY, model: string = MODELO_PADRAO_POR_PROVEDOR.openrouter): Promise<boolean> {
  if (!apiKey) return false;
  try {
    const response = await fetch(`${OPENROUTER_URL}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "teste" }] }) });
    if (!response.ok) await salvarLogErro("validacao-openrouter", `HTTP ${response.status}`, await response.text());
    return response.ok;
  } catch (error) { await salvarLogErro("excecao-validacao-openrouter", error); return false; }
}

async function gerarNaAPI(baseUrl: string, apiKey: string, model: string, prompt: string): Promise<any> {
  const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, temperature: 0.3, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }) });
  if (!response.ok) { const errorData = await response.text().catch(() => "Sem detalhes"); const temporario = [429, 500, 502, 503, 504].includes(response.status); throw new Error(`${temporario ? "TEMP:" : "FATAL:"}${response.status}:${errorData}`); }
  const data = await response.json();
  if (!data.choices?.[0]?.message) throw new Error("A API retornou uma resposta vazia.");
  return { json: extrairEConverterJSON(data.choices[0].message.content), model: typeof data.model === "string" ? data.model : model };
}

export async function gerarTextoOpenRouter(prompt: string, _apiKey: string, model: string, onModelResolved?: (modelUsed: string) => void): Promise<any> {
  if (model === "openrouter/free" && prompt.includes("ETAPA: DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA.")) modeloLivreFixado = null;
  let tentativaAtual = 0, ultimoErro = "";
  while (tentativaAtual < MAX_TENTATIVAS) {
    try {
      // Unsloth é o provedor principal; OpenRouter é fallback automático.
      if (API_UNSLOTH_KEY && API_URL) {
        try {
          const modelo = model === "unsloth-auto" || !model || model.startsWith("openrouter/") ? await obterModeloUnsloth() : model;
          const resultado = await gerarNaAPI(UNSLOTH_URL, API_UNSLOTH_KEY, modelo, prompt);
          onModelResolved?.(resultado.model);
          return resultado.json;
        } catch (error) {
          await salvarLogErro("unsloth-fallback", error);
          if (!API_OPENROUTER_KEY) throw error;
        }
      }
      if (!API_OPENROUTER_KEY) throw new Error("FATAL: Nenhuma API de IA está configurada.");
      const modeloDaRequisicao = model === "unsloth-auto" || !model ? "openrouter/free" : (model === "openrouter/free" && modeloLivreFixado ? modeloLivreFixado : model);
      const resultado = await gerarNaAPI(OPENROUTER_URL, API_OPENROUTER_KEY, modeloDaRequisicao, prompt);
      if (modeloDaRequisicao === "openrouter/free" && !modeloLivreFixado) modeloLivreFixado = resultado.model;
      onModelResolved?.(resultado.model);
      return resultado.json;
    } catch (erro: any) {
      ultimoErro = erro.message || String(erro); tentativaAtual++;
      if (ultimoErro.startsWith("FATAL:")) { await salvarLogErro("llm-erro-fatal", erro); throw new Error(ultimoErro.replace(/^FATAL:/, "").replace(/^\d+:/, "").trim()); }
      if (tentativaAtual >= MAX_TENTATIVAS) { await salvarLogErro("llm-falha-limite", erro); throw new Error(`O sistema tentou ${MAX_TENTATIVAS} vezes, mas a inteligência artificial não conseguiu concluir o texto corretamente.\nÚltimo erro: ${ultimoErro}`); }
      await new Promise(r => setTimeout(r, tentativaAtual * 2000));
    }
  }
  throw new Error(ultimoErro || "Falha na IA.");
}
