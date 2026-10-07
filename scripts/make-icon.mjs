// Generates scripts/icon.png (1024×1024) from scripts/icon.svg; then `npx tauri icon scripts/icon.png` creates all the icons.
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8')
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng()
writeFileSync(new URL('./icon.png', import.meta.url), png)
console.log('icon.png scritto,', png.length, 'byte')
