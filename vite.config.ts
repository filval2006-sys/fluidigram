import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // la versione mostrata nell'app è sempre quella di package.json (la imposta `npm run version:set`)
  define: { __APP_VERSION__: JSON.stringify(version) },
})
