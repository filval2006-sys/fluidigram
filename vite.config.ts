import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // la versione mostrata nell'app è sempre quella di package.json (la imposta `npm run version:set`)
  define: { __APP_VERSION__: JSON.stringify(version) },
  // alcuni test costruiscono documenti grandi e li esportano in tutti i formati: sui computer lenti di GitHub servono più dei 5 s predefiniti
  test: { testTimeout: 60_000 },
})
