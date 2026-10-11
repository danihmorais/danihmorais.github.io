const CONFIGURED_API_URL = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".internal")
  ) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((part) => part < 0 || part > 255)) return true;
    const [a, b] = octets;
    return a === 10 ||
      a === 127 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254) ||
      a === 0;
  }

  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

export function getApiBaseUrl(): string {
  if (!CONFIGURED_API_URL) return "";
  if (typeof window === "undefined") return CONFIGURED_API_URL;

  try {
    const apiUrl = new URL(CONFIGURED_API_URL, window.location.origin);
    const crossOrigin = apiUrl.origin !== window.location.origin;
    const production = Boolean(import.meta.env?.PROD);
    const mixedContent = window.location.protocol === "https:" && apiUrl.protocol === "http:";

    if (production && crossOrigin && (isPrivateOrLocalHost(apiUrl.hostname) || mixedContent)) {
      console.error(
        "[LICITA.AI] VITE_API_URL aponta para uma rede local ou endereço HTTP inseguro. " +
        "Configure uma URL pública HTTPS para a API; usando o caminho relativo da própria origem."
      );
      return "";
    }

    return CONFIGURED_API_URL;
  } catch {
    console.error("[LICITA.AI] VITE_API_URL inválida; usando o caminho relativo da própria origem.");
    return "";
  }
}
