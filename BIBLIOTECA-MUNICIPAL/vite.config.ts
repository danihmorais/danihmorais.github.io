import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const exposeApp = {
  name: 'expose-library-app',
  transform(code: string, id: string) {
    if (id.endsWith('/BIBLIOTECA-MUNICIPAL/src/main.tsx')) {
      return code.replace(/^function App\(/m, 'export function App(')
    }
    return null
  }
}

export default defineConfig({
  base: '/BIBLIOTECA-MUNICIPAL/',
  plugins: [exposeApp, react()]
})
