import { FLUIDS } from '../fluids'
import { t } from '../i18n'
import { ACTUATORS, getSymbol, optionSuffix, resolveSymbol } from '../symbols/library'
import type { SymbolDef } from '../symbols/types'
import type { Component, FluidId, Lang, Line } from '../types'
import type { PageLayout } from './layout'
import { INK, lineEl, n, symbolThumbnail, textEl } from './svg'
import { wrapToWidth } from './table'

interface LegendSymbol { def: SymbolDef; props: Record<string, string>; name: { it: string; en: string } }
export interface LegendItems { symbols: LegendSymbol[]; fluids: FluidId[] }

/** Symbols (with legend on, one per actuator variant) and fluids actually used, in stable order. */
export function usedIn(components: Component[], lines: Line[]): LegendItems {
  const byKey = new Map<string, LegendSymbol>()
  for (const c of components) {
    const def = getSymbol(c.symbol)
    if (!def.legend) continue
    const act = resolveSymbol(def, c.props).actuator
    const opt = (def.options ?? []).map((o) => c.props[o.key] ?? o.default).join('/')
    const key = `${def.id}|${act ?? ''}|${opt}`
    if (byKey.has(key)) continue
    const a = act && act !== def.actuatable?.defaultActuator ? ACTUATORS.find((x) => x.id === act) : undefined
    const name = a
      ? { it: `${def.name.it} – ${a.name.it.toLowerCase()}`, en: `${def.name.en} – ${a.name.en.toLowerCase()}` }
      : def.name
    const sfxIt = optionSuffix(def, c.props, 'it'), sfxEn = optionSuffix(def, c.props, 'en')
    const props: Record<string, string> = act ? { actuator: act } : {}
    for (const o of def.options ?? []) if (c.props[o.key]) props[o.key] = c.props[o.key]
    byKey.set(key, { def, props, name: sfxIt ? { it: `${name.it} – ${sfxIt}`, en: `${name.en} – ${sfxEn}` } : name })
  }
  const symbols = [...byKey.entries()].sort(([ka, a], [kb, b]) => a.def.category.localeCompare(b.def.category) || ka.localeCompare(kb)).map(([, v]) => v)
  const order = Object.keys(FLUIDS)
  const fluids = [...new Set(lines.map((l) => l.fluid))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return { symbols, fluids }
}

const HEAD = 8
const SECTION_H0 = 7
const PAD = 2
const THUMB_W = 16
const NAME_SIZE0 = 3
const TAG_SIZE_L0 = 2.4
const LINE_H0 = 3.6
const FLUID_ROW_MIN0 = 10.5

interface SymRow { sym: LegendSymbol; lines: string[]; h: number }

function symbolRows(items: LegendItems, lang: Lang, textW: number, withTag: boolean, k: number): SymRow[] {
  const NAME_SIZE = NAME_SIZE0 * k, LINE_H = LINE_H0 * k
  return items.symbols.map((sym) => {
    const lines = wrapToWidth(sym.name[lang], textW, NAME_SIZE, 3)
    const h = Math.max((withTag ? 11 : 9) * k, lines.length * LINE_H + (withTag ? 3.4 * k : 0) + 4)
    return { sym, lines, h }
  })
}

/** `k`: size multiplier of the legend text and rows (export setting). */
export function renderLegend(items: LegendItems, layout: PageLayout, lang: Lang, color: boolean, k = 1): string {
  if (!layout.legend) return ''
  const NAME_SIZE = NAME_SIZE0 * k, TAG_SIZE_L = TAG_SIZE_L0 * k, LINE_H = LINE_H0 * k, FLUID_ROW_MIN = FLUID_ROW_MIN0 * k, SECTION_H = SECTION_H0 * k
  const { x, y, w, h } = layout.legend
  const textX = x + PAD + THUMB_W + 2.5
  const textW = x + w - PAD - textX
  const bottom = y + h
  const fluidRows = items.fluids.map((id) => ({ id, lines: wrapToWidth(FLUIDS[id].name[lang], textW, NAME_SIZE, 2) }))
  const fluidH = (r: { lines: string[] }) => Math.max(FLUID_ROW_MIN, 4.5 * k + 3.6 * k + r.lines.length * LINE_H)

  // black title bar; the sheet frame is drawn on top and the legend only adds its left border
  let s = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${HEAD}" fill="${INK}"/>`
  s += textEl(x + w / 2, y + HEAD / 2, t('legend', lang), { size: 3.8, bold: true, color: '#fff' })
  s += lineEl(x, y, x, bottom, 0.5)

  // fluids are reserved first: they matter more than the last symbols
  const fluidsNeed = items.fluids.length ? 1 + SECTION_H + fluidRows.reduce((a, r) => a + fluidH(r), 0) : 0
  const moreLine = 5 * k
  const symbolRoom = h - HEAD - fluidsNeed - SECTION_H - 2
  // the tag line under each name only if everything fits with it; otherwise the compact rows
  let withTag = true
  let rows = symbolRows(items, lang, textW, true, k)
  if (rows.reduce((a, r) => a + r.h, 0) > symbolRoom) { withTag = false; rows = symbolRows(items, lang, textW, false, k) }
  let room = symbolRoom
  let hidden = 0
  const shown: SymRow[] = []
  for (const r of rows) {
    if (room - r.h >= (shown.length + 1 < rows.length ? moreLine : 0)) { shown.push(r); room -= r.h } else hidden++
  }

  const section = (cy: number, label: string): number => {
    s += textEl(x + PAD, cy + SECTION_H / 2 + 0.4, label, { size: 2.7 * k, anchor: 'start', bold: true, color: '#444' })
    s += lineEl(x + PAD, cy + SECTION_H - 0.4, x + w - PAD, cy + SECTION_H - 0.4, 0.3, '#777')
    return cy + SECTION_H
  }

  let cy = y + HEAD
  if (shown.length) {
    cy = section(cy, t('symbols', lang))
    shown.forEach((r, i) => {
      if (i > 0) s += lineEl(x + PAD, cy, x + w - PAD, cy, 0.15, '#bbb')
      const mid = cy + r.h / 2
      s += symbolThumbnail(r.sym.def, x + PAD + THUMB_W / 2, mid, THUMB_W - 1, r.h - 2.6, 1.2, r.sym.props).svg
      const block = r.lines.length * LINE_H + (withTag ? 3.4 * k : 0)
      const top = mid - block / 2
      r.lines.forEach((ln, j) => { s += textEl(textX, top + LINE_H * (j + 0.5), ln, { size: NAME_SIZE, anchor: 'start' }) })
      if (withTag) s += textEl(textX, top + r.lines.length * LINE_H + 1.9 * k, `${t('tagPrefix', lang)}: ${r.sym.def.tagPrefix}-nnn`, { size: TAG_SIZE_L, anchor: 'start', color: '#666' })
      cy += r.h
    })
    if (hidden) {
      s += textEl(x + PAD, cy + moreLine / 2, `+${hidden} ${t('moreItems', lang)}`, { size: 2.6 * k, anchor: 'start', color: '#666' })
      cy += moreLine
    }
  }

  if (items.fluids.length) {
    // the fluids section sits right below the symbols
    cy = section(cy + 1, t('fluids', lang))
    fluidRows.forEach((r, i) => {
      if (i > 0) s += lineEl(x + PAD, cy, x + w - PAD, cy, 0.15, '#bbb')
      const rh = fluidH(r)
      const f = FLUIDS[r.id]
      const stroke = color ? f.color : INK
      const dash = f.dash ? ` stroke-dasharray="${f.dash}"` : ''
      s += `<line x1="${n(x + PAD)}" y1="${n(cy + rh / 2)}" x2="${n(x + PAD + THUMB_W)}" y2="${n(cy + rh / 2)}" stroke="${stroke}" stroke-width="${Math.max(f.width, 0.9)}"${dash}/>`
      const block = LINE_H + 0.6 * k + r.lines.length * LINE_H
      const top = cy + rh / 2 - block / 2
      s += textEl(textX, top + LINE_H / 2, f.code, { size: 3.2 * k, anchor: 'start', bold: true })
      r.lines.forEach((ln, j) => { s += textEl(textX, top + LINE_H + 0.6 * k + LINE_H * (j + 0.5), ln, { size: NAME_SIZE, anchor: 'start' }) })
      cy += rh
    })
  }
  return s
}
