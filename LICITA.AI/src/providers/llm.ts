const MAX_TENTATIVAS = 3;

export interface OpcaoModelo {
  value: string;
  label: string;
}

// Catálogo de modelos disponíveis para seleção manual, por provedor.
// Usado pela UI (ConfigIA) para montar o dropdown de escolha de modelo.
export const MODELOS_DISPONIVEIS: Record<string, OpcaoModelo[]> = {
  openrouter: [
    { value: "openrouter/free", label: "OpenRouter Free (modelo automático gratuito)" },
    { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 (Anthropic)" },
    { value: "openai/gpt-5", label: "GPT-5 (OpenAI)" },
    { value: "google/gemini-3.1-pro", label: "Gemini 3.1 Pro (via OpenRouter)" },
    { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct (Meta)" },
    { value: "deepseek/deepseek-r1", label: "DeepSeek R1" },
  ],
};

export const MODELO_PADRAO_POR_PROVEDOR: Record<string, string> = {
  openrouter: "openrouter/free",
};

const CHAVE_LOGS_ERRO = "licita_ai:logs_erro";
const MAX_LOGS_GUARDADOS = 20;

async function salvarLogErro(prefixo: string, erro: any, dadosCrus: any = null) {
  try {
    const entrada = {
      prefixo,
      data: new Date().toISOString(),
      mensagem: erro instanceof Error ? erro.message : String(erro),
      stack: erro instanceof Error ? erro.stack : undefined,
      dadosCrus: dadosCrus
        ? (typeof dadosCrus === "string" ? dadosCrus : JSON.stringify(dadosCrus, null, 2))
        : undefined,
    };

    console.error(`[${prefixo}]`, entrada);

    const brutos = localStorage.getItem(CHAVE_LOGS_ERRO);
    const logs = brutos ? JSON.parse(brutos) : [];
    logs.push(entrada);
    while (logs.length > MAX_LOGS_GUARDADOS) logs.shift();
    localStorage.setItem(CHAVE_LOGS_ERRO, JSON.stringify(logs));
  } catch (e) {}
}

function sanitizarJSON(texto: string): string {
  let inString = false;
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];

    if (!inString) {
      if (char === '"') {
        inString = true;
      }
      result += char;
      continue;
    }

    if (isEscaped) {
      const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'];
      if (validEscapes.includes(char)) {
        result += char;
      } else {
        result = result.slice(0, -1);
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
        } else if (char === '\t') {
          result += '\\t';
        } else if (char.charCodeAt(0) >= 32) {
          result += char;
        }
      }
      isEscaped = false;
    } else {
      if (char === '\\') {
        isEscaped = true;
        result += '\\';
      } else if (char === '"') {
        inString = false;
        result += '"';
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
      } else if (char === '\t') {
        result += '\\t';
      } else if (char.charCodeAt(0) >= 32) {
        result += char;
      }
    }
  }
  return result;
}

function extrairEConverterJSON(rawText: string): any {
  let texto = rawText.trim();
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  
  if (inicio !== -1 && fim !== -1) {
    texto = texto.substring(inicio, fim + 1);
  }
  
  try {
    return JSON.parse(texto);
  } catch (e1) {
    try {
      let corrigido = texto.replace(/,\s*([\}\]])/g, '$1');
      return JSON.parse(corrigido);
    } catch (e2) {
      try {
        let sanitizado = sanitizarJSON(texto);
        sanitizado = sanitizado.replace(/,\s*([\}\]])/g, '$1');
        return JSON.parse(sanitizado);
      } catch (e3) {
        throw new Error(`O texto gerado pela IA foi interrompido abruptamente ou está corrompido.\nErro técnico: ${e3 instanceof Error ? e3.message : e3}`);
      }
    }
  }
}

export async function validarChaveOpenRouter(apiKey: string, model: string = MODELO_PADRAO_POR_PROVEDOR.openrouter): Promise<boolean> {
  try {
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1,
        messages: [{ role: "user", content: "teste" }]
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      await salvarLogErro("validacao-openrouter", `HTTP ${response.status}`, errText);
    }
    return response.ok;
  } catch (error) {
    await salvarLogErro("excecao-validacao-openrouter", error);
    return false;
  }
}

export async function gerarTextoOpenRouter(
  prompt: string,
  apiKey: string,
  model: string,
  onModelResolved?: (modelUsed: string) => void
): Promise<any> {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  let tentativaAtual = 0;
  let ultimoErro = "";

  while (tentativaAtual < MAX_TENTATIVAS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        const errorData = await response.text().catch(() => "Sem detalhes");
        if (response.status === 503 || response.status === 429 || response.status === 500 || response.status === 502) {
          throw new Error(`Erro temporário no servidor (HTTP ${response.status})`);
        }
        throw new Error(`FATAL: Erro na API do OpenRouter (HTTP ${response.status}): ${errorData}`);
      }

      const data = await response.json();
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("A API retornou uma resposta vazia ou bloqueada pelos filtros de segurança.");
      }

      // O OpenRouter informa no campo `model` qual modelo efetivamente respondeu.
      // Isso é essencial para `openrouter/free`, que escolhe um modelo diferente
      // potencialmente a cada requisição. A orquestração do Wizard usa esse valor
      // para fixar o mesmo modelo nas etapas seguintes.
      const modeloEfetivamenteUtilizado = typeof data.model === "string" ? data.model : model;
      onModelResolved?.(modeloEfetivamenteUtilizado);

      const rawText = data.choices[0].message.content;
      
      // Mesma proteção para a OpenRouter. Se o texto foi interrompido (Unterminated String), 
      // ele força uma re-execução.
      return extrairEConverterJSON(rawText);

    } catch (erro: any) {
      ultimoErro = erro.message || String(erro);
      tentativaAtual++;
      
      if (ultimoErro.startsWith("FATAL:")) {
        await salvarLogErro("openrouter-erro-fatal", erro);
        throw new Error(ultimoErro.replace("FATAL: ", ""));
      }

      if (tentativaAtual >= MAX_TENTATIVAS) {
        await salvarLogErro("openrouter-falha-limite", erro);
        throw new Error(`O sistema tentou ${MAX_TENTATIVAS} vezes, mas a inteligência artificial não conseguiu concluir o texto corretamente. Por favor, tente novamente.\nÚltimo erro: ${ultimoErro}`);
      }

      await new Promise(r => setTimeout(r, tentativaAtual * 2000));
    }
  }
}
