// Imposta la stessa versione in package.json, src-tauri/tauri.conf.json e src-tauri/Cargo.toml.
// Uso: npm run version:set 0.2.0
import { readFileSync, writeFileSync } from 'node:fs'

const v = process.argv[2]
if (!v || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v)) {
  console.error('Uso: npm run version:set <maggiore.minore.patch>   (es. 0.2.0)')
  process.exit(1)
}

const edit = (path, fn) => {
  const url = new URL('../' + path, import.meta.url)
  writeFileSync(url, fn(readFileSync(url, 'utf8')))
  console.log('aggiornato', path)
}
edit('package.json', (s) => s.replace(/("version":\s*")[^"]+"/, `$1${v}"`))
edit('src-tauri/tauri.conf.json', (s) => s.replace(/("version":\s*")[^"]+"/, `$1${v}"`))
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = ".*"$/m, `version = "${v}"`))
console.log(`Versione impostata a ${v}. Poi: git commit -am "Versione ${v}" && git tag v${v} && git push --follow-tags`)
