import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the version shown in the app is always that of package.json (set by `npm run version:set`)
  define: { __APP_VERSION__: JSON.stringify(version) },
  // some tests build large documents and export them in all formats: on GitHub's slow machines they need more than the default 5 s
  test: { testTimeout: 60_000 },
})
