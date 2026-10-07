// Genera l'icona dei file .fluidigram: macOS (src-tauri/icons/fluidigram-file.icns, serve iconutil) e Windows (fluidigram-file.ico). Il risultato è nel repository.
// Uso: npm run file-icon
import { Resvg } from '@resvg/resvg-js'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const NAVY = '#10305f'
const BLUE = '#5aa2ff'

// foglio con l'angolo piegato, logo (tubo e valvola a sfera) al centro, fascia col nome in basso
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef3fb"/></linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0a1f3f" flood-opacity="0.28"/></filter>
  </defs>
  <path d="M200 96 H668 L848 276 V880 a48 48 0 0 1 -48 48 H200 a48 48 0 0 1 -48 -48 V144 a48 48 0 0 1 48 -48 Z" fill="url(#page)" stroke="#c6d4ea" stroke-width="6" filter="url(#sh)"/>
  <path d="M668 96 V228 a48 48 0 0 0 48 48 H848 Z" fill="#d6e3f6" stroke="#c6d4ea" stroke-width="6" stroke-linejoin="round"/>
  <g transform="translate(212 250) scale(6)">
    <path d="M8 55 H92" stroke="${BLUE}" stroke-width="6" stroke-linecap="round"/>
    <path d="M50 55 V29 M38 29 H62" stroke="${NAVY}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M30 40 V70 L50 55 Z M70 40 V70 L50 55 Z" fill="${NAVY}" stroke="${NAVY}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="50" cy="55" r="4.6" fill="#ffffff" stroke="${BLUE}" stroke-width="2.2"/>
  </g>
  <path d="M152 740 H872 V880 a48 48 0 0 1 -48 48 H200 a48 48 0 0 1 -48 -48 Z" fill="${NAVY}"/>
  <text x="512" y="858" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="92" font-weight="700" letter-spacing="6" fill="#ffffff">FLUIDIGRAM</text>
</svg>`

const dir = mkdtempSync(join(tmpdir(), 'fgicon-')) + '/fluidigram-file.iconset'
mkdirSync(dir)
for (const [name, px] of [
  ['icon_16x16', 16], ['icon_16x16@2x', 32], ['icon_32x32', 32], ['icon_32x32@2x', 64], ['icon_128x128', 128], ['icon_128x128@2x', 256],
  ['icon_256x256', 256], ['icon_256x256@2x', 512], ['icon_512x512', 512], ['icon_512x512@2x', 1024],
]) {
  writeFileSync(join(dir, name + '.png'), new Resvg(svg, { fitTo: { mode: 'width', value: px }, font: { loadSystemFonts: true } }).render().asPng())
}
const out = new URL('../src-tauri/icons/fluidigram-file.icns', import.meta.url).pathname
execFileSync('iconutil', ['-c', 'icns', dir, '-o', out])

// Windows: .ico con PNG incorporati (16–256 px)
const ico = [16, 24, 32, 48, 64, 128, 256].map((px) => ({ px, png: new Resvg(svg, { fitTo: { mode: 'width', value: px }, font: { loadSystemFonts: true } }).render().asPng() }))
const head = Buffer.alloc(6 + 16 * ico.length)
head.writeUInt16LE(1, 2); head.writeUInt16LE(ico.length, 4)
let offset = head.length
ico.forEach(({ px, png }, i) => {
  const e = 6 + 16 * i
  head[e] = px === 256 ? 0 : px; head[e + 1] = px === 256 ? 0 : px
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
  head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12)
  offset += png.length
})
const outIco = new URL('../src-tauri/icons/fluidigram-file.ico', import.meta.url).pathname
writeFileSync(outIco, Buffer.concat([head, ...ico.map((i) => i.png)]))
console.log('scritto', outIco)
rmSync(dir.replace('/fluidigram-file.iconset', ''), { recursive: true })
console.log('scritto', out)
