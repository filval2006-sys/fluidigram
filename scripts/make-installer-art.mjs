// Genera la grafica degli installer: barra laterale e testata del wizard di Windows (BMP a 24 bit) e sfondo della finestra del .dmg.
// Uso: npm run installer-art
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync } from 'node:fs'

const NAVY = '#10305f'
const BLUE = '#5aa2ff'

/** Logo: tubo con valvola a sfera (lo stesso dell'icona), disegnato in un quadrato di lato 100. */
const logo = (fg, accent, bg) => `
  <path d="M8 55 H92" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
  <path d="M50 55 V29 M38 29 H62" stroke="${fg}" stroke-width="4.4" stroke-linecap="round"/>
  <path d="M30 40 V70 L50 55 Z M70 40 V70 L50 55 Z" fill="${fg}" stroke="${fg}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="50" cy="55" r="4.6" fill="${bg}" stroke="${accent}" stroke-width="2.2"/>`

const render = (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: true } }).render()

/** BMP non compresso a 24 bit (quello che chiede NSIS), righe dal basso, colori su sfondo opaco. */
function bmp24({ width, height, pixels }) {
  const row = Math.ceil((width * 3) / 4) * 4
  const buf = Buffer.alloc(54 + row * height)
  buf.write('BM', 0)
  buf.writeUInt32LE(buf.length, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(row * height, 34)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = ((height - 1 - y) * width + x) * 4
      const d = 54 + y * row + x * 3
      buf[d] = pixels[s + 2]; buf[d + 1] = pixels[s + 1]; buf[d + 2] = pixels[s]
    }
  }
  return buf
}

const out = (path) => new URL('../' + path, import.meta.url)
mkdirSync(out('src-tauri/windows/'), { recursive: true })
mkdirSync(out('src-tauri/dmg/'), { recursive: true })

// --- barra laterale del wizard (164×314), pagine di benvenuto e di fine ---
const sidebar = `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b4a8f"/><stop offset="1" stop-color="${NAVY}"/></linearGradient></defs>
  <rect width="164" height="314" fill="url(#g)"/>
  <g transform="translate(32 48) scale(1.0)">${logo('#ffffff', BLUE, NAVY)}</g>
  <text x="82" y="190" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">Fluidigram</text>
  <text x="82" y="212" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="#bcd6ff">Fluid diagrams (P&amp;ID)</text>
  <text x="82" y="226" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10.5" fill="#bcd6ff">for model rocketry</text>
  <text x="82" y="296" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#8fb4ea">Created by Filippo Valentini</text>
</svg>`
let r = render(sidebar, 164)
writeFileSync(out('src-tauri/windows/sidebar.bmp'), bmp24({ width: r.width, height: r.height, pixels: r.pixels }))

// --- testata delle altre pagine (150×57) ---
const header = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <rect width="150" height="57" fill="#ffffff"/>
  <rect x="94" y="8" width="42" height="42" rx="10" fill="${NAVY}"/>
  <g transform="translate(97 11) scale(0.36)">${logo('#ffffff', BLUE, NAVY)}</g>
</svg>`
r = render(header, 150)
writeFileSync(out('src-tauri/windows/header.bmp'), bmp24({ width: r.width, height: r.height, pixels: r.pixels }))

// --- sfondo della finestra del .dmg (660×400): chiaro, perché Finder scrive le etichette in nero ---
const dmg = `<svg xmlns="http://www.w3.org/2000/svg" width="660" height="400" viewBox="0 0 660 400">
  <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7faff"/><stop offset="1" stop-color="#e3edfb"/></linearGradient></defs>
  <rect width="660" height="400" fill="url(#b)"/>
  <text x="330" y="52" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="${NAVY}">Install Fluidigram</text>
  <text x="330" y="78" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#3b5278">Drag Fluidigram into Applications · Trascina Fluidigram in Applicazioni</text>
  <!-- freccia tra le due icone (180,190) e (480,190) -->
  <path d="M262 190 H398" stroke="${BLUE}" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 14"/>
  <path d="M386 170 L412 190 L386 210" fill="none" stroke="${BLUE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="48" y="304" width="564" height="64" rx="10" fill="#ffffff" stroke="#c8d8f0"/>
  <text x="330" y="328" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12.5" font-weight="700" fill="${NAVY}">First launch · Primo avvio</text>
  <text x="330" y="347" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#3b5278">If macOS warns you: System Settings → Privacy &amp; Security → Open Anyway</text>
  <text x="330" y="361" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#3b5278">Se macOS avvisa: Impostazioni di Sistema → Privacy e sicurezza → Apri comunque</text>
</svg>`
r = render(dmg, 660)
writeFileSync(out('src-tauri/dmg/background.png'), r.asPng())

console.log('grafica degli installer scritta in src-tauri/windows e src-tauri/dmg')
