// Sets the same version in package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml and src-tauri/Cargo.lock.
// Usage: npm run version:set 0.2.0
import { readFileSync, writeFileSync } from 'node:fs'

const v = process.argv[2]
if (!v || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v)) {
  console.error('Usage: npm run version:set <major.minor.patch>   (e.g. 0.2.0)')
  process.exit(1)
}

const edit = (path, fn) => {
  const url = new URL('../' + path, import.meta.url)
  writeFileSync(url, fn(readFileSync(url, 'utf8')))
  console.log('updated', path)
}
edit('package.json', (s) => s.replace(/("version":\s*")[^"]+"/, `$1${v}"`))
edit('src-tauri/tauri.conf.json', (s) => s.replace(/("version":\s*")[^"]+"/, `$1${v}"`))
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = ".*"$/m, `version = "${v}"`))
edit('src-tauri/Cargo.lock', (s) => s.replace(/(name = "app"\nversion = ")[^"]+"/, `$1${v}"`))
console.log(`Version set to ${v}. Then: git commit -am "Release ${v}" && git tag v${v} && git push --follow-tags`)
