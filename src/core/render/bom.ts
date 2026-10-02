import { t } from '../i18n'
import { ACTUATORS, getSymbol, optionSuffix, resolveSymbol } from '../symbols/library'
import type { Drawing, FluidDocument, Lang, Phase, ValveState } from '../types'
import type { PageLayout } from './layout'
import { lineEl, rectEl, textEl } from './svg'

export interface BomRow { tag: string; description: string; type: string; size: string; pmax: string; note: string }

const ROW_H = 7
const HEAD_H = 9

function typeLabel(c: Drawing['components'][number], lang: Lang): string {
  const def = getSymbol(c.symbol)
  const act = resolveSymbol(def, c.props).actuator
  const a = act && act !== 'none' ? ACTUATORS.find((x) => x.id === act) : undefined
  const state = c.props.normal ? ` ${c.props.normal}` : ''
  const opt = optionSuffix(def, c.props, lang)
  if (opt) return `${def.name[lang]} – ${opt}`
  return a && act !== def.actuatable?.defaultActuator ? `${def.name[lang]} – ${a.name[lang].toLowerCase()}${state}` : `${def.name[lang]}${state}`
}

/** Righe della distinta, ordinate per tag in modo "naturale" (BV-2 prima di BV-10). */
export function bomRows(d: Drawing, lang: Lang): BomRow[] {
  return d.components
    .filter((c) => getSymbol(c.symbol).legend)
    .map((c) => ({
      tag: c.tag,
      description: c.description?.[lang] || c.description?.[lang === 'it' ? 'en' : 'it'] || '',
      type: typeLabel(c, lang),
      size: c.props.size || (c.props.holes && c.props.holeDia ? `${c.props.holes} × Ø${c.props.holeDia} mm` : ''),
      pmax: c.props.mawp ? `${c.props.mawp} bar` : '',
      note: c.props.note ?? '',
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
}

export function bomRowsPerPage(layout: PageLayout): number {
  return Math.max(1, Math.floor((layout.drawing.h - HEAD_H - 4) / ROW_H))
}

/** Una pagina della distinta (righe già tagliate per la pagina). */
export function renderBomPage(rows: BomRow[], doc: FluidDocument, layout: PageLayout, lang: Lang): string {
  const area = { ...layout.drawing, w: layout.frame.w }
  const cols = [
    { key: 'tag', label: t('tag', lang), w: 0.11 },
    { key: 'description', label: t('description', lang), w: 0.3 },
    { key: 'type', label: t('item', lang), w: 0.23 },
    { key: 'size', label: t('size', lang), w: 0.1 },
    { key: 'pmax', label: t('pmax', lang), w: 0.09 },
    { key: 'note', label: t('notes', lang), w: 0.17 },
  ] as const
  const x0 = area.x + 4
  const tableW = area.w - 8
  let s = textEl(x0, area.y + 6, t('bom', lang).toUpperCase(), { size: 4, anchor: 'start', bold: true })
  const top = area.y + 12
  s += rectEl(x0, top, tableW, HEAD_H, 0.4, '#eee')
  let cx = x0
  const xs: number[] = []
  for (const c of cols) {
    xs.push(cx)
    s += textEl(cx + 1.5, top + HEAD_H / 2, c.label, { size: 2.2, anchor: 'start', bold: true, color: '#333' })
    cx += c.w * tableW
  }
  rows.forEach((r, i) => {
    const y = top + HEAD_H + i * ROW_H
    s += lineEl(x0, y + ROW_H, x0 + tableW, y + ROW_H, 0.15, '#bbb')
    cols.forEach((c, j) => {
      const maxChars = Math.floor((c.w * tableW - 3) / 1.6)
      const v = r[c.key]
      s += textEl(xs[j] + 1.5, y + ROW_H / 2, v.length > maxChars ? v.slice(0, maxChars - 1) + '…' : v, { size: 2.6, anchor: 'start', bold: c.key === 'tag' })
    })
  })
  const bottom = top + HEAD_H + Math.max(rows.length, 1) * ROW_H
  s += rectEl(x0, top, tableW, bottom - top, 0.4)
  void doc
  return s
}

export interface StateRow { tag: string; description: string; type: string; states: (ValveState | undefined)[] }

/** Valvole con almeno uno stato assegnato, una colonna per fase. */
export function stateRows(d: Drawing, phases: Phase[], lang: Lang): StateRow[] {
  return d.components
    .filter((c) => c.states && phases.some((p) => c.states![p.id]))
    .map((c) => ({
      tag: c.tag,
      description: c.description?.[lang] || c.description?.[lang === 'it' ? 'en' : 'it'] || '',
      type: typeLabel(c, lang),
      states: phases.map((p) => c.states![p.id]),
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
}

export function renderStatesPage(rows: StateRow[], phases: Phase[], layout: PageLayout, lang: Lang): string {
  const area = { ...layout.drawing, w: layout.frame.w }
  const x0 = area.x + 4
  const tableW = area.w - 8
  const fixed = [0.1, 0.22, 0.2]
  const phaseW = (1 - fixed.reduce((a, b) => a + b, 0)) / Math.max(1, phases.length)
  let s = textEl(x0, area.y + 6, t('stateTable', lang).toUpperCase(), { size: 4, anchor: 'start', bold: true })
  s += textEl(x0, area.y + 11.5, `●  ${t('closedLbl', lang)}      ○  ${t('openLbl', lang)}      –  ${t('unsetLbl', lang)}`, { size: 2.8, anchor: 'start', color: '#333' })
  const top = area.y + 16
  s += rectEl(x0, top, tableW, HEAD_H, 0.4, '#eee')
  const xs: number[] = []
  let cx = x0
  const heads = [t('tag', lang), t('description', lang), t('item', lang), ...phases.map((p) => p.name[lang] || p.name.it)]
  const widths = [...fixed, ...phases.map(() => phaseW)].map((w) => w * tableW)
  heads.forEach((h, i) => {
    xs.push(cx)
    const maxChars = Math.max(3, Math.floor((widths[i] - 3) / 1.6))
    s += textEl(cx + 1.5, top + HEAD_H / 2, h.length > maxChars ? h.slice(0, maxChars - 1) + '…' : h, { size: 2.2, anchor: 'start', bold: true, color: '#333' })
    cx += widths[i]
  })
  rows.forEach((r, i) => {
    const y = top + HEAD_H + i * ROW_H
    s += lineEl(x0, y + ROW_H, x0 + tableW, y + ROW_H, 0.15, '#bbb')
    ;[r.tag, r.description, r.type].forEach((v, j) => {
      const maxChars = Math.floor((widths[j] - 3) / 1.6)
      s += textEl(xs[j] + 1.5, y + ROW_H / 2, v.length > maxChars ? v.slice(0, maxChars - 1) + '…' : v, { size: 2.6, anchor: 'start', bold: j === 0 })
    })
    r.states.forEach((st, j) => {
      const cxm = xs[3 + j] + widths[3 + j] / 2
      s += textEl(cxm, y + ROW_H / 2, st === 'closed' ? '●' : st === 'open' ? '○' : '–', { size: 3.4, color: st ? '#111' : '#999' })
    })
  })
  const bottom = top + HEAD_H + Math.max(rows.length, 1) * ROW_H
  s += rectEl(x0, top, tableW, bottom - top, 0.4)
  return s
}
