import { t } from '../i18n'
import { traceFlow } from '../flow'
import { phaseValves } from '../topology'
import { worldExtent } from '../scene'
import type { Component, FluidDocument, Lang, Phase, ValveState } from '../types'
import { renderAnnotationBox, renderAnnotationText } from './annotations'
import { applyOverride, autoBomRow } from './bom'
import { drawingBounds, scaleText } from './export'
import { layoutFor, type PageLayout, type Rect } from './layout'
import { planLabels } from './labels'
import { renderComponent, renderLine } from './sheet'
import { INK, lineEl, n, rectEl, textEl } from './svg'
import { renderRevisionTable, renderTitleBlock } from './titleblock'

// ---- aspetto ----
const NAVY = '#10305f'
const OPEN = '#2b8a3e'
const CLOSED = '#d6342c'
const OPEN_BG = '#e3f3e8'
const CLOSED_BG = '#fbe4e2'
const ZEBRA = '#f4f7fc'
const GREY = '#8a94a3'

const ROW_H = 6.6
const HEAD_H = 36
const TIMELINE_H = 15
const LEGEND_H = 9
const MAX_SCALE = 1.6
const scaleLabel = (sc: number): string => (sc > 1 ? `${+sc.toFixed(1)}:1` : scaleText(sc))

interface ValveRow { tag: string; description: string; state: ValveState | undefined }

const letter = (st: ValveState | undefined, lang: Lang): string => (st === 'open' ? (lang === 'it' ? 'A' : 'O') : st === 'closed' ? 'C' : '?')

const rrect = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke = 'none', sw = 0.25, extra = ''): string =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra}/>`

/** Badge with the state letter (A/O open, C closed, ? unspecified). In black and white: filled = closed, empty = open. */
function badge(x: number, y: number, st: ValveState | undefined, lang: Lang, color: boolean, r = 2.1): string {
  const fill = !color ? (st === 'closed' ? INK : '#fff') : st === 'open' ? OPEN : st === 'closed' ? CLOSED : '#fff'
  const ink = fill === '#fff' ? INK : '#fff'
  const stroke = st && color ? fill : INK
  const dash = st ? '' : ' stroke-dasharray="0.8 0.6"'
  return `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="0.3"${dash}/>` +
    textEl(x, y, letter(st, lang), { size: r * 1.25, bold: true, color: ink })
}

/** Capsule label with the written state. */
function statePill(xRight: number, yMid: number, st: ValveState | undefined, lang: Lang, color: boolean): string {
  const word = st === 'open' ? t('openWord', lang) : st === 'closed' ? t('closedWord', lang) : t('unsetWord', lang)
  const w = 20, h = 4.4
  const fg = !color ? INK : st === 'open' ? OPEN : st === 'closed' ? CLOSED : GREY
  const bg = !color ? '#fff' : st === 'open' ? OPEN_BG : st === 'closed' ? CLOSED_BG : '#eef0f4'
  const stroke = !color ? INK : 'none'
  return rrect(xRight - w, yMid - h / 2, w, h, h / 2, bg, stroke, 0.25) + textEl(xRight - w / 2, yMid, word, { size: 2.1, bold: true, color: fg })
}

const truncate = (s: string, width: number, size: number): string => {
  const max = Math.max(3, Math.floor(width / (size * 0.58)))
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function valveRows(doc: FluidDocument, phaseId: string, lang: Lang): ValveRow[] {
  return phaseValves(doc.drawing)
    .map((c: Component) => {
      const row = applyOverride(autoBomRow(c, lang), doc.bom, `c:${c.id}`, lang)
      return { tag: c.tag, description: row.description || row.type, state: c.states?.[phaseId] }
    })
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
}

const stateOf = (c: Component, phaseId: string): ValveState | undefined => c.states?.[phaseId]

/** Rows of a phase's table, zebra-striped, with badge, tag, description and written state. */
function renderRows(rows: ValveRow[], rect: Rect, top: number, lang: Lang, color: boolean): string {
  let s = ''
  rows.forEach((r, i) => {
    const y = top + i * ROW_H
    if (i % 2 === 0) s += `<rect x="${n(rect.x + 0.4)}" y="${n(y)}" width="${n(rect.w - 0.8)}" height="${ROW_H}" fill="${ZEBRA}"/>`
    s += badge(rect.x + 5, y + ROW_H / 2, r.state, lang, color, 1.9)
    s += textEl(rect.x + 10, y + ROW_H / 2, r.tag, { size: 3.1, anchor: 'start', bold: true, color: NAVY })
    s += textEl(rect.x + 25, y + ROW_H / 2, truncate(r.description, rect.w - 25 - 27, 2.8), { size: 2.8, anchor: 'start', color: '#333' })
    s += statePill(rect.x + rect.w - 3, y + ROW_H / 2, r.state, lang, color)
  })
  return s
}

type PagePlan = { kind: 'phase'; phaseIdx: number; chunk: number } | { kind: 'matrix'; chunk: number }

const tableWidth = (layout: PageLayout): number => Math.min(135, Math.max(86, layout.page.w * 0.28))
const bodyHeight = (layout: PageLayout): number => layout.frame.h - layout.titleBlock.h
/** Rows that fit on the first page of a phase (it has the header) and on the following ones. */
const capacity = (layout: PageLayout) => ({
  first: Math.max(1, Math.floor((bodyHeight(layout) - HEAD_H - 4) / ROW_H)),
  more: Math.max(1, Math.floor((bodyHeight(layout) - 14) / ROW_H)),
  matrix: Math.max(1, Math.floor((bodyHeight(layout) - 36) / ROW_H)),
})

function planPages(doc: FluidDocument, layout: PageLayout): PagePlan[] {
  const out: PagePlan[] = []
  const cap = capacity(layout)
  const valves = phaseValves(doc.drawing).length
  const extra = Math.max(0, Math.ceil((valves - cap.first) / cap.more))
  doc.phases.forEach((_, phaseIdx) => { for (let chunk = 0; chunk <= extra; chunk++) out.push({ kind: 'phase', phaseIdx, chunk }) })
  const matrixPages = Math.ceil(valves / cap.matrix)
  for (let chunk = 0; chunk < matrixPages; chunk++) out.push({ kind: 'matrix', chunk })
  return out
}

/** Number of sheets of the phases document. */
export function phasePageCount(doc: FluidDocument): number {
  return doc.phases.length ? planPages(doc, layoutFor(doc.export.format, false)).length : 1
}

const shell = (layout: PageLayout, inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.page.w} ${layout.page.h}" width="${layout.page.w}mm" height="${layout.page.h}mm"><rect width="${layout.page.w}" height="${layout.page.h}" fill="#fff"/>${inner}</svg>`

/** Phase strip at the top of the drawing: numbered circles joined by a line, the current phase filled. */
function renderTimeline(phases: Phase[], current: number, area: Rect, lang: Lang, color: boolean): string {
  const count = phases.length
  const left = area.x + 20
  const step = count > 1 ? Math.min(46, (area.w - 40) / (count - 1)) : 0
  const y = area.y + 5.5
  const accent = color ? NAVY : INK
  let s = ''
  if (count > 1) s += lineEl(left, y, left + step * (count - 1), y, 0.5, '#c5cddb')
  phases.forEach((p, i) => {
    const x = left + i * step
    const on = i === current
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="${on ? 3.6 : 3}" fill="${on ? accent : '#fff'}" stroke="${on ? accent : '#9aa5b8'}" stroke-width="0.4"/>`
    s += textEl(x, y, String(i + 1), { size: on ? 3.3 : 2.8, bold: true, color: on ? '#fff' : '#5b6678' })
    if (on || step >= 24) {
      const name = p.name[lang] || p.name.it
      s += textEl(x, y + 6.2, truncate(name, Math.max(18, step - 3), 2.3), { size: 2.3, bold: on, color: on ? accent : '#6b7587' })
    }
  })
  return s
}

/** Legend at the bottom of the drawing. */
function renderKey(area: Rect, lang: Lang, color: boolean): string {
  const y = area.y + area.h + LEGEND_H / 2
  let x = area.x + 8
  let s = ''
  for (const st of ['open', 'closed', undefined] as const) {
    s += badge(x + 2, y, st, lang, color, 1.9)
    const word = st === 'open' ? (lang === 'it' ? 'aperta' : 'open') : st === 'closed' ? (lang === 'it' ? 'chiusa' : 'closed') : (lang === 'it' ? 'non specificato' : 'unspecified')
    s += textEl(x + 5.6, y, word, { size: 2.5, anchor: 'start', color: '#444' })
    x += 7 + word.length * 1.5 + 8
  }
  s += lineEl(x, y, x + 9, y, 0.5, '#9aa5b8').replace('/>', ' opacity="0.45"/>')
  s += textEl(x + 11.5, y, t('liveKey', lang), { size: 2.5, anchor: 'start', color: '#444' })
  return s
}

/** Summary: all valves for all phases, with badges. */
function renderMatrix(doc: FluidDocument, chunk: number, layout: PageLayout, lang: Lang, color: boolean): string {
  const { phases } = doc
  const cap = capacity(layout)
  const valves = phaseValves(doc.drawing).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true })).slice(chunk * cap.matrix, (chunk + 1) * cap.matrix)
  const x0 = layout.frame.x + 6
  const w = layout.frame.w - 12
  const top = layout.frame.y + 22
  const tagW = 22
  const descW = Math.min(70, w * 0.28)
  const colW = (w - tagW - descW) / Math.max(1, phases.length)
  let s = textEl(x0, layout.frame.y + 8, t('stateTable', lang).toUpperCase(), { size: 5, anchor: 'start', bold: true, color: NAVY })
  s += textEl(x0, layout.frame.y + 14.5, t('badgeKey', lang), { size: 2.6, anchor: 'start', color: '#555' })
  s += rrect(x0, top - 1, w, 12, 1.5, NAVY)
  s += textEl(x0 + 3, top + 5, t('tag', lang), { size: 2.6, anchor: 'start', bold: true, color: '#fff' })
  s += textEl(x0 + tagW, top + 5, t('description', lang), { size: 2.6, anchor: 'start', bold: true, color: '#fff' })
  phases.forEach((p, i) => {
    const cx = x0 + tagW + descW + colW * i + colW / 2
    s += textEl(cx, top + 2.4, String(i + 1), { size: 2.8, bold: true, color: '#fff' })
    s += textEl(cx, top + 7.2, truncate(p.name[lang] || p.name.it, colW - 2, 2.1), { size: 2.1, color: '#cfe0ff' })
  })
  const rowsTop = top + 12
  valves.forEach((c, i) => {
    const y = rowsTop + i * ROW_H
    if (i % 2 === 0) s += `<rect x="${n(x0)}" y="${n(y)}" width="${n(w)}" height="${ROW_H}" fill="${ZEBRA}"/>`
    const row = applyOverride(autoBomRow(c, lang), doc.bom, `c:${c.id}`, lang)
    s += textEl(x0 + 3, y + ROW_H / 2, c.tag, { size: 3, anchor: 'start', bold: true, color: NAVY })
    s += textEl(x0 + tagW, y + ROW_H / 2, truncate(row.description || row.type, descW - 4, 2.7), { size: 2.7, anchor: 'start', color: '#333' })
    phases.forEach((p, j) => { s += badge(x0 + tagW + descW + colW * j + colW / 2, y + ROW_H / 2, stateOf(c, p.id), lang, color, 1.9) })
  })
  s += rrect(x0, top - 1, w, 12 + Math.max(valves.length, 1) * ROW_H + 1, 1.5, 'none', '#b9c3d6', 0.3)
  return s
}

/**
 * Operating phases document: for each phase the diagram with the state of each valve (colored badge with a letter)
 * and, beside it, the written table; at the end the summary of all phases.
 */
export function renderPhasePages(doc: FluidDocument): string[] {
  const { color, lang, format } = doc.export
  const layout = layoutFor(format, false)
  const frame = rectEl(layout.frame.x, layout.frame.y, layout.frame.w, layout.frame.h, 0.7)
  const d = doc.drawing

  if (!doc.phases.length) {
    return [shell(layout, frame + textEl(layout.page.w / 2, layout.page.h / 2, t('noPhases', lang), { size: 5, color: '#999' }) +
      renderRevisionTable(doc, layout, lang) + renderTitleBlock(doc, layout, lang, { index: 1, total: 1, scaleText: '—', subtitle: t('phasesDoc', lang) }))]
  }

  const pages = planPages(doc, layout)
  const total = pages.length
  const labels = planLabels(d)
  const bounds = drawingBounds(d)
  const tw = tableWidth(layout)
  const bodyH = bodyHeight(layout)
  const cap = capacity(layout)
  const table: Rect = { x: layout.frame.x + layout.frame.w - tw, y: layout.frame.y, w: tw, h: bodyH }
  const area: Rect = { x: layout.frame.x, y: layout.frame.y + TIMELINE_H, w: layout.frame.w - tw, h: bodyH - TIMELINE_H - LEGEND_H }
  const scale = bounds ? Math.min(MAX_SCALE, area.w / bounds.w, area.h / bounds.h) : 1
  const accent = color ? NAVY : INK
  const chrome = (index: number, subtitle: string, sc: string) =>
    renderRevisionTable(doc, layout, lang) + renderTitleBlock(doc, layout, lang, { index, total, scaleText: sc, subtitle })

  return pages.map((pg, i) => {
    const index = i + 1
    if (pg.kind === 'matrix') return shell(layout, frame + renderMatrix(doc, pg.chunk, layout, lang, color) + chrome(index, t('stateTable', lang), '—'))

    const phase = doc.phases[pg.phaseIdx]
    const name = phase.name[lang] || phase.name.it
    const subtitle = `${lang === 'it' ? 'Fase' : 'Phase'} ${pg.phaseIdx + 1}/${doc.phases.length}: ${name}`
    const rows = valveRows(doc, phase.id, lang)

    // continuation pages: only the table
    if (pg.chunk > 0) {
      const slice = rows.slice(cap.first + (pg.chunk - 1) * cap.more, cap.first + pg.chunk * cap.more)
      const rect: Rect = { x: layout.frame.x + 6, y: layout.frame.y, w: layout.frame.w - 12, h: bodyH }
      const head = textEl(rect.x, layout.frame.y + 8, `${t('phase', lang)} ${pg.phaseIdx + 1} · ${name} ${t('continued', lang)}`, { size: 4, anchor: 'start', bold: true, color: accent })
      return shell(layout, frame + head + renderRows(slice, rect, layout.frame.y + 13, lang, color) + chrome(index, subtitle, '—'))
    }

    const live = traceFlow(doc, phase.id).live
    const lines = d.lines.map((l) => {
      const svg = renderLine(d, l, color, labels.lines.get(l.id) ?? null)
      return live.has(l.id) ? svg : `<g opacity="0.3">${svg}</g>`
    }).join('')
    const comps = d.components.map((c) => renderComponent(c, { label: labels.tags.get(c.id), state: stateOf(c, phase.id) })).join('')
    const marks = phaseValves(d).map((c) => { const e = worldExtent(c); return badge(e.maxX + 0.6, e.minY - 0.6, stateOf(c, phase.id), lang, color) }).join('')
    const body = d.annotations.filter((a) => a.kind === 'box').map((a) => renderAnnotationBox(a, lang)).join('') + lines + comps +
      d.annotations.filter((a) => a.kind === 'text').map((a) => renderAnnotationText(a, lang)).join('') + marks
    let drawn = bounds ? '' : textEl(area.x + area.w / 2, area.y + area.h / 2, t('empty', lang), { size: 5, color: '#999' })
    if (bounds) {
      const ox = area.x + (area.w - bounds.w * scale) / 2 - bounds.x * scale
      const oy = area.y + (area.h - bounds.h * scale) / 2 - bounds.y * scale
      drawn = `<clipPath id="clip-ph${index}"><rect x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}"/></clipPath>` +
        `<g clip-path="url(#clip-ph${index})"><g transform="translate(${n(ox)} ${n(oy)}) scale(${n(scale)})">${body}</g></g>`
    }

    const counts = { open: rows.filter((r) => r.state === 'open').length, closed: rows.filter((r) => r.state === 'closed').length, unset: rows.filter((r) => !r.state).length }
    const chips: [string, number, string, string][] = [
      [t('openCount', lang), counts.open, color ? OPEN : INK, color ? OPEN_BG : '#fff'],
      [t('closedCount', lang), counts.closed, color ? CLOSED : INK, color ? CLOSED_BG : '#fff'],
      [t('unsetCount', lang), counts.unset, color ? GREY : INK, color ? '#eef0f4' : '#fff'],
    ]
    const chipW = (tw - 6 - 4) / 3
    const head =
      rrect(table.x, table.y, tw, HEAD_H - 11, 0, accent) +
      textEl(table.x + 4, table.y + 5.5, `${t('phase', lang)} ${pg.phaseIdx + 1} / ${doc.phases.length}`, { size: 2.7, anchor: 'start', color: color ? '#a9c4f2' : '#ddd' }) +
      textEl(table.x + 4, table.y + 13, truncate(name, tw - 8, 5.2), { size: 5.2, anchor: 'start', bold: true, color: '#fff' }) +
      chips.map(([label, v, fg, bg], k) => {
        const x = table.x + 3 + k * (chipW + 2)
        return rrect(x, table.y + HEAD_H - 9, chipW, 7, 1.6, bg, color ? 'none' : INK, 0.25) +
          textEl(x + 2.4, table.y + HEAD_H - 5.5, String(v), { size: 3.6, anchor: 'start', bold: true, color: fg }) +
          textEl(x + 8, table.y + HEAD_H - 5.5, truncate(label, chipW - 9, 2.5), { size: 2.5, anchor: 'start', color: fg })
      }).join('')

    return shell(layout,
      drawn + renderTimeline(doc.phases, pg.phaseIdx, { ...area, y: layout.frame.y }, lang, color) +
      renderKey(area, lang, color) +
      frame + lineEl(table.x, table.y, table.x, table.y + table.h, 0.4) +
      head + renderRows(rows.slice(0, cap.first), table, table.y + HEAD_H, lang, color) +
      chrome(index, subtitle, scaleLabel(scale)))
  })
}

