export function sanitizarDocumentoAdicional(valor: unknown): string {
  let texto = String(valor ?? "").replace(/^\\s+/, "");

  // Remove identificador inicial entre parênteses, desde que tenha até 14 caracteres.
  if (texto.startsWith("(")) {
    const fechamento = texto.indexOf(")");
    if (fechamento >= 1 && fechamento + 1 <= 14) {
      texto = texto.slice(fechamento + 1).replace(/^\\s+/, "");
    }
  }

  return texto;
}
