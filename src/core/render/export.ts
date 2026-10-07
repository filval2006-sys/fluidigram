import { t } from '../i18n'
import { lineRoute, worldExtent } from '../scene'
import type { Drawing, ExportSettings, FluidDocument, Lang } from '../types'
import type { Point } from '../geometry'
import { bomItems, bomRowsPerPage, paginateBom, renderBomPage, renderStatesPage, stateRows } from './bom'
import { layoutFor, type PageLayout, type Rect } from './layout'
import { renderLegend, usedIn } from './legend'
import { annotationBounds, renderAnnotationBox, renderAnnotationText } from './annotations'
import { endMarkers } from './endpoints'
import { planLabels, type LabelPlan } from './labels'
import { renderComponent, renderLine } from './sheet'
import { n, rectEl, textEl } from './svg'
import { renderRevisionTable, renderTitleBlock } from './titleblock'

/** Below this scale the drawing becomes hard to read: in automatic mode it is split over several sheets. */
const MIN_FIT_SCALE = 0.6
const GRID = 5
const CONTENT_PAD = 10

interface PageTile { col: number; row: number; region: Rect; number: number }

export interface ExportPlan {
  settings: ExportSettings
  layout: PageLayout
  scale: number
  bounds: Rect
  xCuts: number[]
  yCuts: number[]
  /** sheets with drawing (only non-empty tiles) */
  tiles: PageTile[]
  bomPages: number
  statesPages: number
  totalPages: number
}

type Routes = { points: Point[] }[]

function routesOf(d: Drawing): Routes {
  return d.lines.map((l) => ({ points: lineRoute(d, l) })).filter((r) => r.points.length > 1)
}

export function drawingBounds(d: Drawing): Rect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of d.components) {
    const e = worldExtent(c)
    minX = Math.min(minX, e.minX); minY = Math.min(minY, e.minY)
    maxX = Math.max(maxX, e.maxX); maxY = Math.max(maxY, e.maxY)
    for (const m of endMarkers(c)) {
      minX = Math.min(minX, m.box.minX); minY = Math.min(minY, m.box.minY)
      maxX = Math.max(maxX, m.box.maxX); maxY = Math.max(maxY, m.box.maxY)
    }
  }
  for (const r of routesOf(d)) for (const p of r.points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  for (const a of d.annotations) {
    const e = annotationBounds(a, 'any')
    minX = Math.min(minX, e.minX); minY = Math.min(minY, e.minY)
    maxX = Math.max(maxX, e.maxX); maxY = Math.max(maxY, e.maxY)
  }
  if (!isFinite(minX)) return null
  return { x: minX - CONTENT_PAD, y: minY - CONTENT_PAD, w: maxX - minX + 2 * CONTENT_PAD, h: maxY - minY + 2 * CONTENT_PAD }
}

/** Cut positions along an axis: avoids cutting symbols and crossing too many lines. */
export function chooseCuts(min: number, max: number, cap: number, straddles: (c: number) => boolean, crossings: (c: number) => number): number[] {
  const cuts = [min]
  let pos = min
  for (let guard = 0; max - pos > cap + 1e-6 && guard < 500; guard++) {
    const hi = Math.floor((pos + cap) / GRID) * GRID
    const lo = pos + cap * 0.5
    let best: number | null = null
    let bestScore = Infinity
    for (let c = hi; c >= lo; c -= GRID) {
      if (straddles(c)) continue
      const score = crossings(c) * 30 + (hi - c)
      if (score < bestScore) { best = c; bestScore = score }
    }
    pos = best ?? hi
    cuts.push(pos)
  }
  cuts.push(max)
  return cuts
}

const inRect = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

function segmentTouches(a: Point, b: Point, r: Rect): boolean {
  return Math.max(a.x, b.x) >= r.x && Math.min(a.x, b.x) <= r.x + r.w && Math.max(a.y, b.y) >= r.y && Math.min(a.y, b.y) <= r.y + r.h
}

function compIntersects(d: Drawing, region: Rect): Drawing['components'] {
  return d.components.filter((c) => {
    const e = worldExtent(c)
    return e.maxX > region.x && e.minX < region.x + region.w && e.maxY > region.y && e.minY < region.y + region.h
  })
}

function annsIntersect(d: Drawing, region: Rect): Drawing['annotations'] {
  return d.annotations.filter((a) => {
    const e = annotationBounds(a, 'any')
    return e.maxX > region.x && e.minX < region.x + region.w && e.maxY > region.y && e.minY < region.y + region.h
  })
}

function floorTo(v: number, step: number): number { return Math.floor(v / step + 1e-9) * step }

export function planExport(doc: FluidDocument, settings: ExportSettings = doc.export): ExportPlan {
  const layout = layoutFor(settings.format, settings.legend)
  const area = layout.drawing
  const d = doc.drawing
  const b = drawingBounds(d) ?? { x: 0, y: 0, w: 100, h: 60 }
  const fit = Math.min(area.w / b.w, area.h / b.h)

  let scale = 1
  let split = false
  if (settings.mode === 'fit') scale = Math.min(1, floorTo(fit, 0.05))
  else if (settings.mode === 'split') split = fit < 1
  else if (fit >= 1) scale = 1
  else if (fit >= MIN_FIT_SCALE) scale = floorTo(fit, 0.05)
  else split = true
  scale = Math.max(0.05, scale)

  let xCuts: number[], yCuts: number[]
  if (!split) {
    const w = area.w / scale, h = area.h / scale
    const x = b.x + b.w / 2 - w / 2, y = b.y + b.h / 2 - h / 2
    xCuts = [x, x + w]; yCuts = [y, y + h]
  } else {
    const ext = d.components.map((c) => worldExtent(c))
    const routes = routesOf(d)
    const pad = 3
    const crossX = (c: number) => routes.reduce((s, r) => s + r.points.slice(1).filter((p, i) => r.points[i].y === p.y && Math.min(r.points[i].x, p.x) < c && Math.max(r.points[i].x, p.x) > c).length, 0)
    const crossY = (c: number) => routes.reduce((s, r) => s + r.points.slice(1).filter((p, i) => r.points[i].x === p.x && Math.min(r.points[i].y, p.y) < c && Math.max(r.points[i].y, p.y) > c).length, 0)
    xCuts = chooseCuts(b.x, b.x + b.w, area.w, (c) => ext.some((e) => e.minX - pad < c && e.maxX + pad > c), crossX)
    yCuts = chooseCuts(b.y, b.y + b.h, area.h, (c) => ext.some((e) => e.minY - pad < c && e.maxY + pad > c), crossY)
  }

  const routes = routesOf(d)
  const tiles: PageTile[] = []
  for (let row = 0; row < yCuts.length - 1; row++) {
    for (let col = 0; col < xCuts.length - 1; col++) {
      const region = { x: xCuts[col], y: yCuts[row], w: xCuts[col + 1] - xCuts[col], h: yCuts[row + 1] - yCuts[row] }
      const hasContent = compIntersects(d, region).length > 0 || annsIntersect(d, region).length > 0 ||
        routes.some((r) => r.points.slice(1).some((p, i) => segmentTouches(r.points[i], p, region)))
      if (hasContent || (row === 0 && col === 0 && !d.components.length && !d.annotations.length)) tiles.push({ col, row, region, number: tiles.length + 1 })
    }
  }
  if (!tiles.length) tiles.push({ col: 0, row: 0, region: { x: xCuts[0], y: yCuts[0], w: xCuts[1] - xCuts[0], h: yCuts[1] - yCuts[0] }, number: 1 })

  const bomPages = settings.bom ? paginateBom(bomItems(d, settings.lang, doc.bom), bomRowsPerPage(layout)).length : 0
  const stRows = settings.states && doc.phases.length ? stateRows(d, doc.phases, settings.lang).length : 0
  const statesPages = stRows > 0 ? Math.ceil(stRows / bomRowsPerPage(layout)) : 0
  return { settings, layout, scale, bounds: b, xCuts, yCuts, tiles, bomPages, statesPages, totalPages: tiles.length + bomPages + statesPages }
}

export const scaleText = (scale: number): string => (scale === 1 ? '1:1' : `1:${+(1 / scale).toFixed(2)}`)

/** Short description of the chosen layout, e.g. "2 A3 sheets · scale 1:1 · + 1 bill of materials". */
export function describePlan(plan: ExportPlan, lang: Lang): string {
  const n = plan.tiles.length
  const fmt = plan.settings.format
  const sheets = lang === 'it' ? `${n} ${n === 1 ? 'foglio' : 'fogli'} ${fmt}` : `${n} ${fmt} ${n === 1 ? 'sheet' : 'sheets'}`
  const scale = lang === 'it' ? `scala ${scaleText(plan.scale)}` : `scale ${scaleText(plan.scale)}`
  const extras = [
    plan.bomPages ? (lang === 'it' ? 'distinta' : 'BOM') : '',
    plan.statesPages ? (lang === 'it' ? 'stati valvole' : 'valve states') : '',
  ].filter(Boolean)
  return `${sheets} · ${scale}${extras.length ? ` · + ${extras.join(', ')}` : ''}`
}

function tileNumberAt(plan: ExportPlan, p: Point): number | undefined {
  const col = plan.xCuts.findIndex((x, i) => i < plan.xCuts.length - 1 && p.x >= x && p.x < plan.xCuts[i + 1])
  const row = plan.yCuts.findIndex((y, i) => i < plan.yCuts.length - 1 && p.y >= y && p.y < plan.yCuts[i + 1])
  return plan.tiles.find((t) => t.col === col && t.row === row)?.number
}

/** Continuation arrows where a line leaves the sheet ("→ Sheet 2"). */
function continuationMarkers(plan: ExportPlan, tile: PageTile, d: Drawing, lang: Lang): string {
  const r = tile.region
  let s = ''
  for (const route of routesOf(d)) {
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i]
      if (inRect(a, r) === inRect(b, r)) continue
      const [pin, pout] = inRect(a, r) ? [a, b] : [b, a]
      const horizontal = a.y === b.y
      const dirSign = horizontal ? Math.sign(pout.x - pin.x) : Math.sign(pout.y - pin.y)
      const cp: Point = horizontal
        ? { x: dirSign > 0 ? r.x + r.w : r.x, y: pin.y }
        : { x: pin.x, y: dirSign > 0 ? r.y + r.h : r.y }
      const probe: Point = horizontal ? { x: cp.x + dirSign, y: cp.y } : { x: cp.x, y: cp.y + dirSign }
      const target = tileNumberAt(plan, probe)
      if (!target || target === tile.number) continue
      const k = 1.6
      const tri = horizontal
        ? `${n(cp.x)},${n(cp.y)} ${n(cp.x - dirSign * 2 * k)},${n(cp.y - k)} ${n(cp.x - dirSign * 2 * k)},${n(cp.y + k)}`
        : `${n(cp.x)},${n(cp.y)} ${n(cp.x - k)},${n(cp.y - dirSign * 2 * k)} ${n(cp.x + k)},${n(cp.y - dirSign * 2 * k)}`
      s += `<polygon points="${tri}" fill="#111"/>`
      const label = `${t('toSheet', lang)} ${target}`
      s += horizontal
        ? textEl(cp.x - dirSign * 4, cp.y - 2.6, label, { size: 2.4, anchor: dirSign > 0 ? 'end' : 'start', bold: true })
        : textEl(cp.x + 3, cp.y - dirSign * 4, label, { size: 2.4, anchor: 'start', bold: true })
    }
  }
  return s
}

function pageShell(plan: ExportPlan, inner: string): string {
  const { page } = plan.layout
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.w} ${page.h}" width="${page.w}mm" height="${page.h}mm"><rect width="${page.w}" height="${page.h}" fill="#fff"/>${inner}</svg>`
}

/** Draws sheet `pageNumber` (from 1): first the sheets with the drawing, then those of the bill of materials. */
export function renderPageSvg(doc: FluidDocument, plan: ExportPlan, pageNumber: number, labels?: LabelPlan): string {
  const { settings, layout } = plan
  const lang = settings.lang
  const frame = rectEl(layout.frame.x, layout.frame.y, layout.frame.w, layout.frame.h, 0.7)

  if (pageNumber > plan.tiles.length + plan.bomPages) {
    const all = stateRows(doc.drawing, doc.phases, lang)
    const per = bomRowsPerPage(layout)
    const idx = pageNumber - plan.tiles.length - plan.bomPages - 1
    return pageShell(plan,
      frame + renderStatesPage(all.slice(idx * per, (idx + 1) * per), doc.phases, layout, lang) +
      renderRevisionTable(doc, layout, lang) +
      renderTitleBlock(doc, layout, lang, { index: pageNumber, total: plan.totalPages, scaleText: '—', subtitle: t('stateTable', lang) }))
  }
  if (pageNumber > plan.tiles.length) {
    const pages = paginateBom(bomItems(doc.drawing, lang, doc.bom), bomRowsPerPage(layout))
    const idx = pageNumber - plan.tiles.length - 1
    return pageShell(plan,
      frame + renderBomPage(pages[idx] ?? [], doc, layout, lang) +
      renderRevisionTable(doc, layout, lang) +
      renderTitleBlock(doc, layout, lang, { index: pageNumber, total: plan.totalPages, scaleText: '—', subtitle: t('bom', lang) }))
  }

  const tile = plan.tiles[pageNumber - 1]
  const { region } = tile
  const s = plan.scale
  const area = layout.drawing
  const ox = area.x + (area.w - region.w * s) / 2 - region.x * s
  const oy = area.y + (area.h - region.h * s) / 2 - region.y * s

  const d = doc.drawing
  const comps = compIntersects(d, region)
  const lines = d.lines.filter((l) => {
    const r = lineRoute(d, l)
    return r.slice(1).some((p, i) => segmentTouches(r[i], p, region))
  })
  // labels are decided on the whole drawing, so they do not change from one sheet to another
  const lp = labels ?? planLabels(d)
  const clipId = `clip-${pageNumber}`
  const anns = annsIntersect(d, region)
  let body =
    anns.filter((a) => a.kind === 'box').map((a) => renderAnnotationBox(a, lang)).join('') +
    lines.map((l) => renderLine(d, l, settings.color, lp.lines.get(l.id) ?? null)).join('') + comps.map((c) => renderComponent(c, { label: lp.tags.get(c.id) })).join('') +
    anns.filter((a) => a.kind === 'text').map((a) => renderAnnotationText(a, lang)).join('')
  if (plan.tiles.length > 1) body += continuationMarkers(plan, tile, d, lang)
  if (!d.components.length && !d.annotations.length) body = textEl(region.x + region.w / 2, region.y + region.h / 2, t('empty', lang), { size: 5, color: '#999' })

  const content =
    `<clipPath id="${clipId}"><rect x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}"/></clipPath>` +
    `<g clip-path="url(#${clipId})"><g transform="translate(${n(ox)} ${n(oy)}) scale(${n(s)}) ">${body}</g></g>`

  return pageShell(plan,
    content + frame +
    (settings.legend ? renderLegend(usedIn(comps, lines), layout, lang, settings.color) : '') +
    renderRevisionTable(doc, layout, lang) +
    renderTitleBlock(doc, layout, lang, { index: pageNumber, total: plan.totalPages, scaleText: scaleText(s) }))
}

export function renderAllPages(doc: FluidDocument, plan: ExportPlan): string[] {
  const labels = planLabels(doc.drawing)
  return Array.from({ length: plan.totalPages }, (_, i) => renderPageSvg(doc, plan, i + 1, labels))
}
