import { t } from '../i18n'
import { ACTUATORS, CATEGORY_NAMES, getSymbol, optionSuffix, resolveSymbol } from '../symbols/library'
import type { BomConfig, Component, Drawing, FluidDocument, Lang, Phase, ValveState } from '../types'
import type { PageLayout } from './layout'
import { textEl, textWidth } from './svg'
import { GRID_PAD, fitText, renderGrid, wrapToWidth } from './table'

export interface BomRow {
  /** c:<component id> or x:<added row id>: identifies the row even if tags change */
  key: string
  tag: string
  description: string
  type: string
  size: string
  pmax: string
  note: string
}

const ROW_H = 8.5
const HEAD_H = 9
/** Distance of the table top from the top of the drawing area (the title sits above it). */
const TABLE_TOP = 16
const BOTTOM_GAP = 3

function typeLabel(c: Drawing['components'][number], lang: Lang): string {
  const def = getSymbol(c.symbol)
  const act = resolveSymbol(def, c.props).actuator
  const a = act && act !== 'none' ? ACTUATORS.find((x) => x.id === act) : undefined
  const state = c.props.normal ? ` ${c.props.normal}` : ''
  const opt = optionSuffix(def, c.props, lang)
  if (opt) return `${def.name[lang]} – ${opt}`
  return a && act !== def.actuatable?.defaultActuator ? `${def.name[lang]} – ${a.name[lang].toLowerCase()}${state}` : `${def.name[lang]}${state}`
}

const other = (l: Lang): Lang => (l === 'it' ? 'en' : 'it')

/** Row generated from the drawing for a component, without manual edits. */
export function autoBomRow(c: Component, lang: Lang): BomRow {
  return {
    key: `c:${c.id}`,
    tag: c.tag,
    description: c.description?.[lang] || c.description?.[other(lang)] || '',
    type: typeLabel(c, lang),
    size: c.props.size || (c.props.holes && c.props.holeDia ? `${c.props.holes} × Ø${c.props.holeDia} mm` : ''),
    pmax: c.props.mawp ? `${c.props.mawp} bar` : '',
    note: c.props.note ?? '',
  }
}

const EMPTY_BOM: BomConfig = { overrides: {}, hidden: [], extra: [], grouped: true, groups: [], renames: {}, order: [] }
const bySymbolTag = (a: { tag: string }, b: { tag: string }) => a.tag.localeCompare(b.tag, undefined, { numeric: true })

/** Row with the manual edits applied: an edited field (even if emptied) wins over the generated one. */
export function applyOverride(row: BomRow, bom: BomConfig, id: string, lang: Lang): BomRow {
  const o = bom.overrides[id]
  if (!o) return row
  return {
    ...row,
    description: o.description?.[lang] ?? row.description,
    type: o.type?.[lang] ?? row.type,
    note: o.note?.[lang] ?? row.note,
    size: o.size ?? row.size,
    pmax: o.pmax ?? row.pmax,
  }
}

function extraBomRow(x: BomConfig['extra'][number], lang: Lang): BomRow {
  return {
    key: `x:${x.id}`, tag: x.tag,
    description: x.description[lang] || x.description[other(lang)], type: x.type[lang] || x.type[other(lang)],
    size: x.size, pmax: x.pmax, note: x.note[lang] || x.note[other(lang)],
  }
}

// ---- gruppi ----

export const MISC_GROUP = 'misc'
/** Default group order by component type. */
const DEFAULT_ORDER = ['cat:vessels', 'cat:valves', 'cat:instruments', 'cat:fittings', 'cat:engine', MISC_GROUP]

export interface BomGroupInfo { id: string; name: string; custom: boolean }

const MISC_NAME = { it: 'Altro', en: 'Other' }

/** All available groups (default and custom) in the chosen order, with the name in the requested language. */
export function bomGroups(bom: BomConfig, lang: Lang): BomGroupInfo[] {
  const base = (id: string): { it: string; en: string } =>
    id === MISC_GROUP ? MISC_NAME : CATEGORY_NAMES[id.slice(4) as keyof typeof CATEGORY_NAMES]
  const all: BomGroupInfo[] = [
    ...DEFAULT_ORDER.map((id) => {
      const r = bom.renames[id]
      return { id, name: r?.[lang] ?? base(id)[lang], custom: false }
    }),
    ...bom.groups.map((g) => ({ id: g.id, name: g.name[lang] || g.name[other(lang)], custom: true })),
  ]
  const rank = new Map(bom.order.map((id, i) => [id, i]))
  const pos = new Map(all.map((g, i) => [g.id, i]))
  // those listed in `order` come first, in the chosen order; the others follow as they are
  return [...all].sort((x, y) => {
    const rx = rank.get(x.id), ry = rank.get(y.id)
    if (rx !== undefined && ry !== undefined) return rx - ry
    if (rx !== undefined) return -1
    if (ry !== undefined) return 1
    return pos.get(x.id)! - pos.get(y.id)!
  })
}

/** Group of a component: the one chosen by hand (if it still exists) or that of its type. */
function componentGroup(c: Component, bom: BomConfig): string {
  const chosen = bom.overrides[c.id]?.group
  if (chosen && (chosen === MISC_GROUP || chosen.startsWith('cat:') || bom.groups.some((g) => g.id === chosen))) return chosen
  return `cat:${getSymbol(c.symbol).category}`
}

const extraGroup = (x: BomConfig['extra'][number], bom: BomConfig): string =>
  x.group === MISC_GROUP || x.group.startsWith('cat:') || bom.groups.some((g) => g.id === x.group) ? x.group : MISC_GROUP

export interface BomEditorRow { row: BomRow; auto?: BomRow; hidden: boolean; extra: boolean; id: string; edited: boolean; group: string }
export interface BomSection { group: BomGroupInfo; rows: BomEditorRow[] }

/** All rows (including hidden ones) with generated values and edits, for the editor. */
export function bomEditorRows(d: Drawing, lang: Lang, bom: BomConfig = EMPTY_BOM): BomEditorRow[] {
  const hidden = new Set(bom.hidden)
  const autos = d.components.filter((c) => getSymbol(c.symbol).legend).map((c) => ({ c, auto: autoBomRow(c, lang) })).sort((a, b) => bySymbolTag(a.auto, b.auto))
  return [
    ...autos.map(({ c, auto }) => {
      const ov = bom.overrides[c.id]
      return {
        id: c.id, auto, row: applyOverride(auto, bom, c.id, lang), hidden: hidden.has(c.id), extra: false, group: componentGroup(c, bom),
        edited: !!ov && Object.keys(ov).filter((k) => k !== 'group').length > 0,
      }
    }),
    ...bom.extra.map((x) => ({ id: x.id, row: extraBomRow(x, lang), hidden: false, extra: true, edited: false, group: extraGroup(x, bom) })),
  ]
}

/**
 * Editor rows split by group, in group order. Custom groups also appear empty (so rows can be added to them),
 * default ones only if they have rows. With an ungrouped bill of materials there is a single section.
 */
export function bomEditorSections(d: Drawing, lang: Lang, bom: BomConfig = EMPTY_BOM): BomSection[] {
  const rows = bomEditorRows(d, lang, bom)
  if (!bom.grouped) return [{ group: { id: '', name: '', custom: false }, rows }]
  return bomGroups(bom, lang)
    .map((group) => ({ group, rows: rows.filter((r) => r.group === group.id) }))
    .filter((sec) => sec.rows.length > 0 || sec.group.custom)
}

/** Bill of materials entries as they end up in the PDF: group headers and rows. */
export type BomItem = { kind: 'group'; name: string; count: number } | { kind: 'row'; row: BomRow }

export function bomItems(d: Drawing, lang: Lang, bom: BomConfig = EMPTY_BOM): BomItem[] {
  const shown = bomEditorSections(d, lang, bom).map((sec) => ({ ...sec, rows: sec.rows.filter((r) => !r.hidden) }))
  const items: BomItem[] = []
  for (const sec of shown) {
    if (!sec.rows.length) continue
    if (bom.grouped) items.push({ kind: 'group', name: sec.group.name, count: sec.rows.length })
    for (const r of sec.rows) items.push({ kind: 'row', row: r.row })
  }
  return items
}

/** Bill of materials rows in the order they appear (group by group if grouped; within groups by tag, then hand-added rows). */
export function bomRows(d: Drawing, lang: Lang, bom: BomConfig = EMPTY_BOM): BomRow[] {
  return bomItems(d, lang, bom).flatMap((i) => (i.kind === 'row' ? [i.row] : []))
}

/** Splits entries into pages of `perPage` table rows, without leaving a lone group header at the bottom of a page. */
export function paginateBom(items: BomItem[], perPage: number): BomItem[][] {
  const pages: BomItem[][] = []
  let cur: BomItem[] = []
  items.forEach((it, i) => {
    const next = items[i + 1]
    // a header needs at least one row below it on the same page
    const need = it.kind === 'group' && next ? 2 : 1
    if (cur.length + need > perPage) { pages.push(cur); cur = [] }
    cur.push(it)
  })
  if (cur.length) pages.push(cur)
  return pages
}

export function bomRowsPerPage(layout: PageLayout): number {
  return Math.max(1, Math.floor((layout.drawing.h - TABLE_TOP - HEAD_H - BOTTOM_GAP) / ROW_H))
}

/** A page of the bill of materials (rows already cut for the page). */
export function renderBomPage(items: BomItem[], doc: FluidDocument, layout: PageLayout, lang: Lang): string {
  const area = { ...layout.drawing, w: layout.frame.w }
  // optional columns appear only if some row uses them: the others would be empty boxes
  const all = bomItems(doc.drawing, lang, doc.bom).flatMap((it) => (it.kind === 'row' ? [it.row] : []))
  const cols = ([
    { key: 'tag', label: t('tag', lang), weight: 1.1, always: true },
    { key: 'type', label: t('item', lang), weight: 3.2, always: true },
    { key: 'description', label: t('description', lang), weight: 3 },
    { key: 'size', label: t('size', lang), weight: 1.5 },
    { key: 'pmax', label: t('pmax', lang), weight: 1.2 },
    { key: 'note', label: t('notes', lang), weight: 2.4 },
  ] as const).filter((c) => ('always' in c && c.always) || all.some((r) => r[c.key]))
  const x0 = area.x + 4
  const tableW = area.w - 8
  // the tag column has a fixed width; the others share the rest by weight
  const TAG_W = 28
  const rest = cols.filter((c) => c.key !== 'tag')
  const total = rest.reduce((a, c) => a + c.weight, 0)
  const widths = cols.map((c) => (c.key === 'tag' ? TAG_W : Math.round(((tableW - TAG_W) * c.weight) / total * 10) / 10))
  widths[widths.length - 1] = Math.round((tableW - widths.slice(0, -1).reduce((a, b) => a + b, 0)) * 10) / 10
  let s = textEl(x0, area.y + 6, t('bom', lang).toUpperCase(), { size: 4.5, anchor: 'start', bold: true })
  const grid = renderGrid({ x: x0, top: area.y + TABLE_TOP, widths, headH: HEAD_H, rowH: ROW_H, rows: items.length ? items.map((it) => ({ span: it.kind === 'group' })) : [{}] })
  s += grid.svg
  const top = area.y + TABLE_TOP
  cols.forEach((c, j) => { s += textEl(grid.colX[j] + GRID_PAD, top + HEAD_H / 2, fitText(c.label, widths[j] - 2 * GRID_PAD, 2.8, true), { size: 2.8, anchor: 'start', bold: true, color: '#333' }) })
  items.forEach((it, i) => {
    const y = grid.rowY(i) + ROW_H / 2
    if (it.kind === 'group') {
      s += textEl(x0 + GRID_PAD, y, it.name.toUpperCase(), { size: 3.2, anchor: 'start', bold: true })
      s += textEl(x0 + tableW - GRID_PAD, y, String(it.count), { size: 3, anchor: 'end', color: '#444' })
      return
    }
    cols.forEach((c, j) => {
      const bold = c.key === 'tag'
      // up to two lines per cell: a long hand-written text is not lost
      const maxW = widths[j] - 2 * GRID_PAD
      const one = wrapToWidth(it.row[c.key], maxW, 3.2, 1, bold)
      const parts = textWidth(it.row[c.key], 3.2, bold) > maxW ? wrapToWidth(it.row[c.key], maxW, 2.8, 2, bold) : one
      const size = parts.length > 1 ? 2.8 : 3.2
      parts.forEach((line, k) => {
        s += textEl(grid.colX[j] + GRID_PAD, parts.length > 1 ? y + (k - 0.5) * 3.7 : y, line, { size, anchor: 'start', bold })
      })
    })
  })
  return s
}

export interface StateRow { tag: string; description: string; type: string; states: (ValveState | undefined)[] }

/** Valves with at least one assigned state, one column per phase. */
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
  const showDesc = rows.some((r) => r.description)
  const fixed = showDesc ? [0.1, 0.22, 0.2] : [0.1, 0.3]
  const phaseW = (1 - fixed.reduce((a, b) => a + b, 0)) / Math.max(1, phases.length)
  const widths = [...fixed, ...phases.map(() => phaseW)].map((w) => Math.round(w * tableW * 10) / 10)
  widths[widths.length - 1] = Math.round((tableW - widths.slice(0, -1).reduce((a, b) => a + b, 0)) * 10) / 10
  let s = textEl(x0, area.y + 6, t('stateTable', lang).toUpperCase(), { size: 4.5, anchor: 'start', bold: true })
  s += textEl(x0, area.y + 11.5, `●  ${t('closedLbl', lang)}      ○  ${t('openLbl', lang)}      –  ${t('unsetLbl', lang)}`, { size: 3.2, anchor: 'start', color: '#333' })
  const top = area.y + TABLE_TOP
  const grid = renderGrid({ x: x0, top, widths, headH: HEAD_H, rowH: ROW_H, rows: rows.length ? rows.map(() => ({})) : [{}] })
  s += grid.svg
  const heads = [t('tag', lang), ...(showDesc ? [t('description', lang)] : []), t('item', lang), ...phases.map((p) => p.name[lang] || p.name.it)]
  const nFixed = fixed.length
  heads.forEach((h, i) => {
    const maxW = widths[i] - 2 * GRID_PAD
    const lines = wrapToWidth(h, maxW, 2.7, 2, true)
    lines.forEach((ln, k) => {
      const cy = top + HEAD_H / 2 + (k - (lines.length - 1) / 2) * 3.4
      s += i < nFixed
        ? textEl(grid.colX[i] + GRID_PAD, cy, ln, { size: 2.7, anchor: 'start', bold: true, color: '#333' })
        : textEl(grid.colX[i] + widths[i] / 2, cy, ln, { size: 2.7, bold: true, color: '#333' })
    })
  })
  rows.forEach((r, i) => {
    const y = grid.rowY(i) + ROW_H / 2
    const vals = showDesc ? [r.tag, r.description, r.type] : [r.tag, r.type]
    vals.forEach((v, j) => {
      s += textEl(grid.colX[j] + GRID_PAD, y, fitText(v, widths[j] - 2 * GRID_PAD, 3.2, j === 0), { size: 3.2, anchor: 'start', bold: j === 0 })
    })
    r.states.forEach((st, j) => {
      s += textEl(grid.colX[nFixed + j] + widths[nFixed + j] / 2, y, st === 'closed' ? '●' : st === 'open' ? '○' : '–', { size: 4, color: st ? '#111' : '#999' })
    })
  })
  return s
}
