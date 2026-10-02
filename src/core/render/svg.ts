import { resolveSymbol } from '../symbols/library'
import type { Fill, Prim, SymbolDef } from '../symbols/types'

export const INK = '#111'
export const SYMBOL_STROKE = 0.35
export const FONT = 'Arial, Helvetica, sans-serif'

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Arrotonda a 3 decimali e toglie gli zeri inutili. */
export const n = (v: number): string => String(Math.round(v * 1000) / 1000)

const fillOf = (f: Fill | undefined): string => (f === 'ink' ? INK : f === 'paper' ? '#fff' : 'none')

export interface TextOpts {
  size: number
  anchor?: 'start' | 'middle' | 'end'
  bold?: boolean
  color?: string
  /** trasformazione aggiuntiva (es. contro-rotazione) */
  transform?: string
}

/** Larghezza stimata del testo (Arial/DejaVu, grassetto un po' più largo). */
export const textWidth = (s: string, size: number, bold = false): number => s.length * size * (bold ? 0.62 : 0.56)

export function textEl(x: number, y: number, s: string, o: TextOpts): string {
  const tr = o.transform ? ` transform="${o.transform}"` : ''
  return `<text x="${n(x)}" y="${n(y)}"${tr} font-family="${FONT}" font-size="${n(o.size)}" text-anchor="${o.anchor ?? 'middle'}" dominant-baseline="central"${o.bold ? ' font-weight="700"' : ''} fill="${o.color ?? INK}">${esc(s)}</text>`
}

export function lineEl(x1: number, y1: number, x2: number, y2: number, w = 0.25, color = INK): string {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width="${w}"/>`
}

export function rectEl(x: number, y: number, w: number, h: number, sw = 0.25, fill = 'none'): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`
}

/** Spezza un testo in righe di al massimo `maxChars` caratteri. */
export function wrapText(s: string, maxChars: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of s.split(/\s+/)) {
    if (cur && (cur + ' ' + word).length > maxChars) { lines.push(cur); cur = word }
    else cur = cur ? cur + ' ' + word : word
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * Primitive del simbolo in coordinate locali.
 * `textTransform` serve a tenere il testo dritto quando il gruppo è ruotato/specchiato.
 */
export function primsToSvg(prims: Prim[], textTransform = (x: number, y: number) => `translate(${n(x)} ${n(y)})`): string {
  const stroke = `stroke="${INK}" stroke-width="${SYMBOL_STROKE}" stroke-linejoin="round" stroke-linecap="round"`
  return prims
    .map((p) => {
      switch (p.k) {
        case 'path': return `<path d="${p.d}" fill="${fillOf(p.fill)}" ${stroke}/>`
        case 'circle': return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${fillOf(p.fill)}" ${stroke}/>`
        case 'rect': return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" fill="${fillOf(p.fill)}" ${stroke}/>`
        case 'text': return textEl(0, 0, p.s, { size: p.size, anchor: p.anchor, transform: textTransform(p.x, p.y) })
      }
    })
    .join('')
}

/** Simbolo disegnato in orientamento neutro, scalato per entrare in un riquadro (legenda, libreria). */
export function symbolThumbnail(
  def: SymbolDef, cx: number, cy: number, maxW: number, maxH: number, maxScale = 1, props: Record<string, string> = {},
): { svg: string; height: number } {
  const r = resolveSymbol(def, props)
  const e = r.extent
  const k = Math.min(maxScale, maxW / e.w, maxH / e.h)
  const ex = e.x + e.w / 2
  const ey = e.y + e.h / 2
  const svg = `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(k)}) translate(${n(-ex)} ${n(-ey)})">${primsToSvg(r.prims)}</g>`
  return { svg, height: e.h * k }
}
