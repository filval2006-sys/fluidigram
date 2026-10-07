import { t } from '../i18n'
import { traceFlow } from '../flow'
import { phaseValves } from '../topology'
import { worldExtent } from '../scene'
import type { Component, FluidDocument, Lang, ValveState } from '../types'
import { renderAnnotationBox, renderAnnotationText } from './annotations'
import { applyOverride, autoBomRow, bomRowsPerPage, renderStatesPage, stateRows } from './bom'
import { drawingBounds, scaleText } from './export'
import { layoutFor, type PageLayout, type Rect } from './layout'
import { planLabels } from './labels'
import { renderComponent, renderLine } from './sheet'
import { INK, lineEl, n, rectEl, textEl } from './svg'
import { renderRevisionTable, renderTitleBlock } from './titleblock'

const ROW_H = 6.2
const HEAD_H = 33
const MAX_SCALE = 1.6
const scaleLabel = (sc: number): string => (sc > 1 ? `${+sc.toFixed(1)}:1` : scaleText(sc))
const OPEN_COLOR = '#2b8a3e'
const CLOSED_COLOR = '#d6342c'

interface ValveRow { c: Component; tag: string; description: string; type: string; state: ValveState | undefined }

const badgeLetter = (st: ValveState | undefined, lang: Lang): string => (st === 'open' ? (lang === 'it' ? 'A' : 'O') : st === 'closed' ? 'C' : '?')

/** Pallino con la lettera dello stato (A/O aperta, C chiusa, ? non specificato). Se il disegno è in bianco e nero niente colori. */
function badge(x: number, y: number, st: ValveState | undefined, lang: Lang, color: boolean, r = 2.1): string {
  const fill = !color ? (st === 'closed' ? INK : '#fff') : st === 'open' ? OPEN_COLOR : st === 'closed' ? CLOSED_COLOR : '#fff'
  const ink = fill === '#fff' ? INK : '#fff'
  const dash = st ? '' : ' stroke-dasharray="0.8 0.6"'
  return `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${fill}" stroke="${st && color ? fill : INK}" stroke-width="0.3"${dash}/>` +
    textEl(x, y, badgeLetter(st, lang), { size: r * 1.25, bold: true, color: ink })
}

const truncate = (s: string, width: number, size: number): string => {
  const max = Math.max(3, Math.floor(width / (size * 0.6)))
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function valveRows(doc: FluidDocument, phaseId: string, lang: Lang): ValveRow[] {
  return phaseValves(doc.drawing)
    .map((c) => {
      const row = applyOverride(autoBomRow(c, lang), doc.bom, `c:${c.id}`, lang)
      return { c, tag: c.tag, description: row.description, type: row.type, state: c.states?.[phaseId] }
    })
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
}

/** Tabella di una fase: pallino, tag, descrizione, stato scritto. */
function renderPhaseTable(rows: ValveRow[], rect: Rect, lang: Lang, color: boolean, head: string): string {
  let s = head
  const top = rect.y + (head ? HEAD_H : 0)
  const cols = { badge: rect.x + 3.6, tag: rect.x + 8, desc: rect.x + 8 + 15, state: rect.x + rect.w - 2 }
  rows.forEach((r, i) => {
    const y = top + i * ROW_H
    s += lineEl(rect.x, y + ROW_H, rect.x + rect.w, y + ROW_H, 0.12, '#ccc')
    s += badge(cols.badge, y + ROW_H / 2, r.state, lang, color, 1.8)
    s += textEl(cols.tag, y + ROW_H / 2, r.tag, { size: 3.1, anchor: 'start', bold: true })
    const label = r.description || r.type
    s += textEl(cols.desc, y + ROW_H / 2, truncate(label, cols.state - cols.desc - 24, 2.8), { size: 2.8, anchor: 'start', color: '#333' })
    const word = r.state === 'open' ? t('openWord', lang) : r.state === 'closed' ? t('closedWord', lang) : t('unsetWord', lang)
    s += textEl(cols.state, y + ROW_H / 2, word, { size: 2.8, anchor: 'end', bold: !!r.state, color: r.state ? INK : '#888' })
  })
  return s
}

type PagePlan = { kind: 'phase'; phaseIdx: number; chunk: number; chunks: number } | { kind: 'states'; chunk: number }

/** Colonna della tabella accanto al disegno. */
const tableWidth = (layout: PageLayout): number => Math.min(130, Math.max(80, layout.page.w * 0.27))

function planPages(doc: FluidDocument, layout: PageLayout): PagePlan[] {
  const out: PagePlan[] = []
  const bodyH = layout.frame.h - layout.titleBlock.h
  const first = Math.max(1, Math.floor((bodyH - HEAD_H - 3) / ROW_H))
  const full = Math.max(1, Math.floor((bodyH - 8) / ROW_H))
  const valves = phaseValves(doc.drawing).length
  doc.phases.forEach((_, phaseIdx) => {
    const extra = Math.max(0, Math.ceil((valves - first) / full))
    for (let chunk = 0; chunk <= extra; chunk++) out.push({ kind: 'phase', phaseIdx, chunk, chunks: extra + 1 })
  })
  const pages = Math.ceil(stateRows(doc.drawing, doc.phases, 'it').length / bomRowsPerPage(layout))
  for (let chunk = 0; chunk < Math.max(pages, doc.phases.length && valves ? 1 : 0); chunk++) out.push({ kind: 'states', chunk })
  return out
}

/** Numero di fogli del documento delle fasi. */
export function phasePageCount(doc: FluidDocument): number {
  return doc.phases.length ? planPages(doc, layoutFor(doc.export.format, false)).length : 1
}

const shell = (layout: PageLayout, inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.page.w} ${layout.page.h}" width="${layout.page.w}mm" height="${layout.page.h}mm"><rect width="${layout.page.w}" height="${layout.page.h}" fill="#fff"/>${inner}</svg>`

/**
 * Documento delle fasi di funzionamento: per ogni fase uno schema con lo stato di ogni valvola (pallino colorato e lettera)
 * e, accanto, la tabella scritta; in fondo la tabella riassuntiva di tutte le fasi.
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
  const bodyH = layout.frame.h - layout.titleBlock.h
  const area: Rect = { x: layout.frame.x, y: layout.frame.y, w: layout.frame.w - tw, h: bodyH }
  const table: Rect = { x: layout.frame.x + layout.frame.w - tw, y: layout.frame.y, w: tw, h: bodyH }
  // in questo documento lo schema può anche ingrandirsi un po' (fino a 1,6:1) per riempire il foglio
  const scale = bounds ? Math.min(MAX_SCALE, area.w / bounds.w, area.h / bounds.h) : 1
  const first = Math.max(1, Math.floor((bodyH - HEAD_H - 3) / ROW_H))
  const full = Math.max(1, Math.floor((bodyH - 8) / ROW_H))
  const chrome = (index: number, subtitle: string, sc: string) =>
    renderRevisionTable(doc, layout, lang) + renderTitleBlock(doc, layout, lang, { index, total, scaleText: sc, subtitle })

  return pages.map((pg, i) => {
    const index = i + 1
    if (pg.kind === 'states') {
      const per = bomRowsPerPage(layout)
      const rows = stateRows(d, doc.phases, lang).slice(pg.chunk * per, (pg.chunk + 1) * per)
      return shell(layout, frame + renderStatesPage(rows, doc.phases, layout, lang) + chrome(index, t('stateTable', lang), '—'))
    }

    const phase = doc.phases[pg.phaseIdx]
    const name = phase.name[lang] || phase.name.it
    const subtitle = `${lang === 'it' ? 'Fase' : 'Phase'} ${pg.phaseIdx + 1}/${doc.phases.length}: ${name}`
    const rows = valveRows(doc, phase.id, lang)
    const slice = pg.chunk === 0 ? rows.slice(0, first) : rows.slice(first + (pg.chunk - 1) * full, first + pg.chunk * full)
    const counts = {
      open: rows.filter((r) => r.state === 'open').length,
      closed: rows.filter((r) => r.state === 'closed').length,
      unset: rows.filter((r) => !r.state).length,
    }

    if (pg.chunk > 0) {
      const head = textEl(layout.frame.x + 4, layout.frame.y + 5, `${t('phase', lang)} ${pg.phaseIdx + 1} · ${name} ${t('continued', lang)}`, { size: 3.4, anchor: 'start', bold: true })
      const rect: Rect = { x: layout.frame.x + 4, y: layout.frame.y + 10, w: layout.frame.w - 8, h: bodyH - 10 }
      return shell(layout, frame + head + renderPhaseTable(slice, { ...rect, y: rect.y - HEAD_H }, lang, color, '') + chrome(index, subtitle, '—'))
    }

    // disegno della fase
    const live = traceFlow(doc, phase.id).live
    const lines = d.lines.map((l) => {
      const svg = renderLine(d, l, color, labels.lines.get(l.id) ?? null)
      return live.has(l.id) ? svg : `<g opacity="0.3">${svg}</g>`
    }).join('')
    const comps = d.components.map((c) => renderComponent(c, { label: labels.tags.get(c.id), state: c.states?.[phase.id] })).join('')
    const marks = phaseValves(d).map((c) => {
      const e = worldExtent(c)
      return badge(e.maxX + 0.6, e.minY - 0.6, c.states?.[phase.id], lang, color)
    }).join('')
    const anns = d.annotations
    const body = anns.filter((a) => a.kind === 'box').map((a) => renderAnnotationBox(a, lang)).join('') + lines + comps +
      anns.filter((a) => a.kind === 'text').map((a) => renderAnnotationText(a, lang)).join('') + marks
    let drawn = bounds ? '' : textEl(area.x + area.w / 2, area.y + area.h / 2, t('empty', lang), { size: 5, color: '#999' })
    if (bounds) {
      const ox = area.x + (area.w - bounds.w * scale) / 2 - bounds.x * scale
      const oy = area.y + (area.h - bounds.h * scale) / 2 - bounds.y * scale
      drawn = `<clipPath id="clip-ph${index}"><rect x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}"/></clipPath>` +
        `<g clip-path="url(#clip-ph${index})"><g transform="translate(${n(ox)} ${n(oy)}) scale(${n(scale)})">${body}</g></g>`
    }

    const head =
      textEl(table.x + 3, table.y + 5, `${t('phase', lang)} ${pg.phaseIdx + 1} / ${doc.phases.length}`, { size: 2.6, anchor: 'start', color: '#555' }) +
      textEl(table.x + 3, table.y + 12, truncate(name, tw - 6, 4.6), { size: 4.6, anchor: 'start', bold: true }) +
      textEl(table.x + 3, table.y + 18.5, `${counts.open} ${t('openCount', lang)} · ${counts.closed} ${t('closedCount', lang)}${counts.unset ? ` · ${counts.unset} ${t('unsetCount', lang)}` : ''}`, { size: 2.9, anchor: 'start', color: '#333' }) +
      textEl(table.x + 3, table.y + 23.5, t('badgeKey', lang), { size: 2.4, anchor: 'start', color: '#555' }) +
      textEl(table.x + 3, table.y + 27.5, t('liveKey', lang), { size: 2.4, anchor: 'start', color: '#555' }) +
      lineEl(table.x, table.y + HEAD_H - 2, table.x + table.w, table.y + HEAD_H - 2, 0.3)

    return shell(layout,
      drawn + frame + lineEl(table.x, table.y, table.x, table.y + table.h, 0.4) +
      renderPhaseTable(slice, table, lang, color, head) +
      chrome(index, subtitle, scaleLabel(scale)))
  })
}

