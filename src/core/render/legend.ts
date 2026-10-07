import { FLUIDS } from '../fluids'
import { t } from '../i18n'
import { ACTUATORS, getSymbol, optionSuffix, resolveSymbol } from '../symbols/library'
import type { SymbolDef } from '../symbols/types'
import type { Component, FluidId, Lang, Line } from '../types'
import type { PageLayout } from './layout'
import { INK, lineEl, n, rectEl, symbolThumbnail, textEl, wrapText } from './svg'

interface LegendSymbol { def: SymbolDef; props: Record<string, string>; name: { it: string; en: string } }
export interface LegendItems { symbols: LegendSymbol[]; fluids: FluidId[] }

/** Simboli (con legenda attiva, uno per variante di azionamento) e fluidi effettivamente usati, in ordine stabile. */
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

const SYMBOL_ROW_MIN = 9
const FLUID_ROW = 9
const HEAD = 6
const SECTION = 8

function rowHeights(items: LegendItems): number[] {
  return items.symbols.map((s) => Math.max(SYMBOL_ROW_MIN, symbolThumbnail(s.def, 0, 0, 14, 14, 1, s.props).height + 3))
}

/** Altezza che servirebbe per mostrare tutto in scala 1. */
function neededHeight(items: LegendItems): number {
  const sym = items.symbols.length ? SECTION + rowHeights(items).reduce((a, b) => a + b, 0) + 2 : 0
  const flu = items.fluids.length ? SECTION + items.fluids.length * FLUID_ROW : 0
  return HEAD + sym + flu + 2
}

export function renderLegend(items: LegendItems, layout: PageLayout, lang: Lang, color: boolean): string {
  if (!layout.legend) return ''
  const { x, y, w, h } = layout.legend
  // se non entra tutto si comprimono le righe (fino al 70%), poi si tagliano le voci in eccesso
  const k = Math.max(0.7, Math.min(1, h / neededHeight(items)))
  let s = rectEl(x, y, w, h, 0.5)
  s += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${HEAD}" fill="${INK}"/>`
  s += textEl(x + w / 2, y + HEAD / 2, t('legend', lang), { size: 3, bold: true, color: '#fff' })

  let cy = y + HEAD
  let hidden = 0
  const fits = (need: number) => cy + need <= y + h - 1
  const section = (label: string) => {
    s += textEl(x + 2, cy + 3.5 * k, label, { size: 2.2, anchor: 'start', bold: true, color: '#555' })
    s += lineEl(x + 2, cy + 6 * k, x + w - 2, cy + 6 * k, 0.2, '#999')
    cy += SECTION * k
  }

  const heights = rowHeights(items)
  if (items.symbols.length) {
    section(t('symbols', lang))
    items.symbols.forEach((sym, i) => {
      const def = sym.def
      const rowH = heights[i] * k
      if (!fits(rowH)) { hidden += 1; return }
      s += symbolThumbnail(def, x + 10, cy + rowH / 2, 14, 14 * k, 1, sym.props).svg
      const nameLines = wrapText(sym.name[lang], 24)
      nameLines.forEach((ln, j) => { s += textEl(x + 21, cy + rowH / 2 - 1.5 + j * 3.2 * k, ln, { size: 2.6, anchor: 'start' }) })
      s += textEl(x + 21, cy + rowH / 2 - 1.5 + nameLines.length * 3.2 * k, `${t('tagPrefix', lang)}: ${def.tagPrefix}-nnn`, { size: 2, anchor: 'start', color: '#666' })
      cy += rowH
    })
    cy += 2
  }

  if (items.fluids.length) {
    if (fits(SECTION * k + FLUID_ROW * k)) section(t('fluids', lang))
    for (const id of items.fluids) {
      if (!fits(FLUID_ROW * k)) { hidden += 1; continue }
      const f = FLUIDS[id]
      const stroke = color ? f.color : INK
      const dash = f.dash ? ` stroke-dasharray="${f.dash}"` : ''
      s += `<line x1="${n(x + 2)}" y1="${n(cy + 4)}" x2="${n(x + 18)}" y2="${n(cy + 4)}" stroke="${stroke}" stroke-width="${f.width}"${dash}/>`
      s += textEl(x + 20, cy + 2.2, f.code, { size: 2.6, anchor: 'start', bold: true })
      wrapText(f.name[lang], 24).forEach((ln, j) => { s += textEl(x + 20, cy + 5.4 + j * 3.2, ln, { size: 2.4, anchor: 'start' }) })
      cy += FLUID_ROW * k
    }
  }
  if (hidden) s += textEl(x + 2, y + h - 3, `+${hidden} ${t('moreItems', lang)}`, { size: 2, anchor: 'start', color: '#666' })
  return s
}
