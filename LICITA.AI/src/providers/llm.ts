import { getApiBaseUrl } from "../utils/apiBase";

const MAX_TENTATIVAS = 3;
// Evita que a interface fique pendurada se o backend não responder (o backend já limita a 180 s).
const TIMEOUT_REQUISICAO_MS = 240_000;

const API_URL = getApiBaseUrl();
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

// Corrige strings JSON com barras sem escape válido (ex.: C:\Licita\edital.docx) e com
// quebras/controles crus, preservando os escapes válidos. A barra inválida é mantida
// (duplicada), nunca descartada.
function sanitizarJSON(texto: string): string {
  const hexadecimal = /^[0-9a-fA-F]{4}$/;
  let emString = false;
  let saida = "";
  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    if (!emString) {
      saida += char;
      if (char === '"') emString = true;
      continue;
    }
    if (char === '"') { saida += char; emString = false; continue; }
    if (char === "\\") {
      const proximo = texto[i + 1] ?? "";
      if (proximo && '"\\/bfnrt'.includes(proximo)) { saida += char + proximo; i++; continue; }
      if (proximo === "u" && hexadecimal.test(texto.slice(i + 2, i + 6))) { saida += texto.slice(i, i + 6); i += 5; continue; }
      saida += "\\\\";
      continue;
    }
    if (char === "\n") saida += "\\n";
    else if (char === "\r") saida += "\\r";
    else if (char === "\t") saida += "\\t";
    else if (char.charCodeAt(0) < 32) saida += "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0");
    else saida += char;
  }
  return saida;
}

// Remove vírgulas antes de } ou ] sem tocar no conteúdo das strings.
function removerVirgulasFinais(texto: string): string {
  let saida = "";
  let emString = false;
  let escapado = false;
  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    if (emString) {
      saida += char;
      if (escapado) escapado = false;
      else if (char === "\\") escapado = true;
      else if (char === '"') emString = false;
      continue;
    }
    if (char === '"') emString = true;
    else if (char === ",") {
      let j = i + 1;
      while (j < texto.length && /\s/.test(texto[j])) j++;
      if (texto[j] === "}" || texto[j] === "]") continue;
    }
    saida += char;
  }
  return saida;
}

function objetoBalanceado(texto: string, inicio: number): string | null {
  let profundidade = 0;
  let emString = false;
  let escapado = false;
  for (let i = inicio; i < texto.length; i++) {
    const char = texto[i];
    if (emString) {
      if (escapado) escapado = false;
      else if (char === "\\") escapado = true;
      else if (char === '"') emString = false;
      continue;
    }
    if (char === '"') emString = true;
    else if (char === "{") profundidade++;
    else if (char === "}" && --profundidade === 0) return texto.slice(inicio, i + 1);
  }
  return null;
}

// Procura objetos estritamente válidos em qualquer posição: tolera preâmbulos com chaves
// ({{OBJETO}}, {x}) que quebrariam o recorte entre a primeira "{" e a última "}".
function melhorObjetoValido(texto: string): any | undefined {
  let melhor: { tamanho: number; valor: any } | undefined;
  let tentativas = 0;
  for (let inicio = texto.indexOf("{"); inicio !== -1 && tentativas < 50; inicio = texto.indexOf("{", inicio + 1)) {
    tentativas++;
    const candidato = objetoBalanceado(texto, inicio);
    if (!candidato) continue;
    try {
      const valor = JSON.parse(candidato);
      if (valor && typeof valor === "object" && !Array.isArray(valor) && (!melhor || candidato.length > melhor.tamanho)) {
        melhor = { tamanho: candidato.length, valor };
      }
    } catch {}
  }
  return melhor?.valor;
}

export function extrairEConverterJSON(rawText: string): any {
  let texto = String(rawText ?? "").trim();
  // Modelos com raciocínio podem devolver o "pensamento" no conteúdo.
  texto = texto.replace(/<think>[\s\S]*?<\/think>|^[\s\S]*?<\/think>/i, "").trim();
  const cerca = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto);
  if (cerca && cerca[1].includes("{")) texto = cerca[1].trim();

  const valido = melhorObjetoValido(texto);
  if (valido !== undefined) return valido;

  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  const recorte = inicio !== -1 && fim > inicio ? texto.substring(inicio, fim + 1) : texto;
  let ultimoErro: unknown;
  for (const preparar of [() => removerVirgulasFinais(recorte), () => removerVirgulasFinais(sanitizarJSON(recorte))]) {
    try { return JSON.parse(preparar()); } catch (e) { ultimoErro = e; }
  }
  throw new Error(`O texto gerado pela IA está corrompido.\nErro técnico: ${ultimoErro instanceof Error ? ultimoErro.message : ultimoErro}`);
}

async function chamarBackend(payload: Record<string, any>): Promise<any> {
  if (!API_URL) throw new Error("API do Licita.AI não configurada.");
  const signal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(TIMEOUT_REQUISICAO_MS) : undefined;
  const response = await fetch(IA_CHAT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
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
      const resultado = await chamarBackend({ model: modeloDaRequisicao, prompt, temperature: 0.7, response_format: { type: "json_object" } });
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
