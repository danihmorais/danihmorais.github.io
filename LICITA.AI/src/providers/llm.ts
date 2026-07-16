const MAX_TENTATIVAS = 3;

// Antes gravava um arquivo .txt em disco via plugin-fs do Tauri
// (exists/mkdir/writeTextFile + BaseDirectory.AppData). No navegador não há
// acesso a sistema de arquivos, então registramos no console e mantemos um
// histórico curto no localStorage para inspeção posterior (ex.: F12 > Application > Local Storage).
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

export async function obterMelhorModelo(provedor: string, apiKey: string): Promise<string> {
  if (provedor === "gemini") {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-pro:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "teste" }] }],
          generationConfig: { maxOutputTokens: 1 }
        })
      });
      if (response.ok) {
        return "gemini-3.5-pro";
      }
    } catch (e) {}
    return "gemini-3.5-flash";
  } else {
    try {
      const url = "https://openrouter.ai/api/v1/chat/completions";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "anthropic/claude-3.5-sonnet",
          max_tokens: 1,
          messages: [{ role: "user", content: "teste" }]
        })
      });
      if (response.ok) {
        return "anthropic/claude-3.5-sonnet";
      }
    } catch (e) {}
    return "openrouter/free";
  }
}

export async function validarChaveGemini(apiKey: string): Promise<boolean> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "teste" }] }],
        generationConfig: { maxOutputTokens: 1 }
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      await salvarLogErro("validacao-gemini", `HTTP ${response.status}`, errText);
    }
    return response.ok;
  } catch (error) {
    await salvarLogErro("excecao-validacao-gemini", error);
    return false;
  }
}

export async function validarChaveOpenRouter(apiKey: string): Promise<boolean> {
  try {
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openrouter/free",
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

export async function gerarTextoGemini(prompt: string, apiKey: string, model: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  let tentativaAtual = 0;
  let ultimoErro = "";

  while (tentativaAtual < MAX_TENTATIVAS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.text().catch(() => "Sem detalhes");
        if (response.status === 503 || response.status === 429 || response.status === 500 || response.status === 502) {
          throw new Error(`Erro temporário no servidor (HTTP ${response.status})`);
        }
        throw new Error(`FATAL: Erro na API do Gemini (HTTP ${response.status}): ${errorData}`);
      }

      const data = await response.json();
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error("A API retornou uma resposta vazia ou bloqueada pelos filtros de segurança.");
      }
      
      const rawText = data.candidates[0].content.parts[0].text;
      
      return extrairEConverterJSON(rawText);

    } catch (erro: any) {
      ultimoErro = erro.message || String(erro);
      tentativaAtual++;
      
      // Se for um erro fatal de senha incorreta (401, 400), não precisa ficar tentando de novo
      if (ultimoErro.startsWith("FATAL:")) {
        await salvarLogErro("gemini-erro-fatal", erro);
        throw new Error(ultimoErro.replace("FATAL: ", ""));
      }

      if (tentativaAtual >= MAX_TENTATIVAS) {
        await salvarLogErro("gemini-falha-limite", erro);
        throw new Error(`O sistema tentou ${MAX_TENTATIVAS} vezes, mas a inteligência artificial não conseguiu concluir o texto corretamente. Por favor, tente novamente.\nÚltimo erro: ${ultimoErro}`);
      }

      // Espera de 2 ou 4 segundos antes de realizar uma nova tentativa com a IA
      await new Promise(r => setTimeout(r, tentativaAtual * 2000));
    }
  }
}

export async function gerarTextoOpenRouter(prompt: string, apiKey: string, model: string): Promise<any> {
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
          max_tokens: 8000,
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