export function limparNumeracao(texto: string): string {
  if (!texto) return "";

  return texto
    .split(/\r?\n/)
    .map((linha) =>
      linha.replace(
        /^\s*(?:(?:\(?\d+(?:\.\d+)*\)?|[IVXLCDM]+|[A-Za-z])(?:[.)\-:º°]+)?|[•◦▪‣])\s+/i,
        ""
      )
    )
    .join("\n");
}