export function limparNumeracao(texto: string): string {
  if (!texto) return "";

  return texto
    .split(/\r?\n/)
    .map((linha) =>
      linha.replace(
        /^\s*(?:(?:\(?\d+(?:\.\d+)*\)?(?:[.)\-:º°]+)?|[IVXLCDM]+[.)\-:]+|[A-Za-z][.)\-:]+)|[•◦▪‣])\s+/,
        ""
      )
    )
    .join("\n");
}