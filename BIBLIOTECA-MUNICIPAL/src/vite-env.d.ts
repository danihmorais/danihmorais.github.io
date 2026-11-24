/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BIBLIOTECA_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '@zxing/browser' {
  interface BrowserMultiFormatReader {
    reset(): void
  }
}
