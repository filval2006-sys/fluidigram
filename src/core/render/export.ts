import { t } from '../i18n'
import { lineRoute, worldExtent } from '../scene'
import type { Drawing, ExportSettings, FluidDocument, Lang } from '../types'
import type { Point } from '../geometry'
import { bomItems, bomRowsPerPage, paginateBom, renderBomPage, renderStatesPage, stateRows } from './bom'
import { layoutFor, type PageLayout, type Rect } from './layout'
import { renderLegend, usedIn } from './legend'
import { chooseScale, exportFactors } from './sizing'
import { annotationBounds, renderAnnotationBox, renderAnnotationText } from './annotations'
import { endMarkers } from './endpoints'
import { planLabels, textFactor, type LabelPlan } from './labels'
import { renderComponent, renderLine } from './sheet'
import { n, rectEl, textEl, textWidth } from './svg'
import { renderRevisionTable, renderTitleBlock } from './titleblock'

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

export function drawingBounds(d: Drawing, extraPad = 0): Rect | null {
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
  const pad = CONTENT_PAD + extraPad
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }
}

/** Cut positions along an axis: avoids cutting symbols and crossing too many lines. */
export function chooseCuts(min: number, max: number, cap: number, straddles: (c: number) => boolean, crossings: (c: number) => number, crowded: (c: number) => number = () => 0): number[] {
  const cuts = [min]
  let pos = min
  for (let guard = 0; max - pos > cap + 1e-6 && guard < 500; guard++) {
    const hi = Math.floor((pos + cap) / GRID) * GRID
    const lo = pos + cap * 0.5
    let best: number | null = null
    let bestScore = Infinity
    for (let c = hi; c >= lo; c -= GRID) {
      if (straddles(c)) continue
      const score = crossings(c) * 30 + crowded(c) * 80 + (hi - c)
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

export function planExport(doc: FluidDocument, settings: ExportSettings = doc.export): ExportPlan {
  const layout = layoutFor(settings.format, settings.legend)
  const area = layout.drawing
  const d = doc.drawing
  const { text: textMul, table: tableMul } = exportFactors(settings)
  const fallback = { x: 0, y: 0, w: 100, h: 60 }
  // texts grow when the drawing is shrunk: the margin grows with them so tags at the edge are not cut
  const boundsFor = (s: number) => drawingBounds(d, Math.max(0, 8 * (textFactor(s) * textMul - 1))) ?? fallback
  let b = boundsFor(1)
  let scale = chooseScale(b, area, settings.size, settings.format)
  b = boundsFor(scale)
  scale = chooseScale(b, area, settings.size, settings.format)
  const fit = Math.min(area.w / b.w, area.h / b.h)
  const split = fit < scale

  let xCuts: number[], yCuts: number[]
  if (!split) {
    const w = area.w / scale, h = area.h / scale
    const x = b.x + b.w / 2 - w / 2, y = b.y + b.h / 2 - h / 2
    xCuts = [x, x + w]; yCuts = [y, y + h]
  } else {
    const ext = d.components.map((c) => worldExtent(c))
    const routes = routesOf(d)
    // a cut keeps clear of the parts by the room the "Sheet N" text needs next to its arrow (it grows with the text size)
    const kk = textFactor(scale) * textMul
    const padX = 3 + 9 * kk, padY = 3 + 4.6 * kk
    const crossX = (c: number) => routes.reduce((s, r) => s + r.points.slice(1).filter((p, i) => r.points[i].y === p.y && Math.min(r.points[i].x, p.x) < c && Math.max(r.points[i].x, p.x) > c).length, 0)
    const crossY = (c: number) => routes.reduce((s, r) => s + r.points.slice(1).filter((p, i) => r.points[i].x === p.x && Math.min(r.points[i].y, p.y) < c && Math.max(r.points[i].y, p.y) > c).length, 0)
    // a sheet shows area / scale of the drawing
    xCuts = chooseCuts(b.x, b.x + b.w, area.w / scale, (c) => ext.some((e) => e.minX - 3 < c && e.maxX + 3 > c), crossX, (c) => ext.filter((e) => e.minX - padX < c && e.maxX + padX > c).length + routes.reduce((n_, r) => n_ + new Set(r.points.slice(1).filter((p, i) => r.points[i].x === p.x && Math.abs(p.x - c) < padX).map((p) => p.x)).size, 0))
    yCuts = chooseCuts(b.y, b.y + b.h, area.h / scale, (c) => ext.some((e) => e.minY - 3 < c && e.maxY + 3 > c), crossY, (c) => ext.filter((e) => e.minY - padY < c && e.maxY + padY > c).length + routes.reduce((n_, r) => n_ + new Set(r.points.slice(1).filter((p, i) => r.points[i].y === p.y && Math.abs(p.y - c) < padY).map((p) => p.y)).size, 0))
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

  const bomPages = settings.bom ? paginateBom(bomItems(d, settings.lang, doc.bom), bomRowsPerPage(layout, tableMul)).length : 0
  const stRows = settings.states && doc.phases.length ? stateRows(d, doc.phases, settings.lang).length : 0
  const statesPages = stRows > 0 ? Math.ceil(stRows / bomRowsPerPage(layout, tableMul)) : 0
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

/** The part as drawn: a junction is a dot of about 2 mm inside a 10 mm symbol box. */
export function visibleBox(c: Drawing['components'][number]): { minX: number; minY: number; maxX: number; maxY: number } {
  const e = worldExtent(c)
  if (c.symbol !== 'fitting.junction') return e
  const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2
  return { minX: cx - 1.2, maxX: cx + 1.2, minY: cy - 1.2, maxY: cy + 1.2 }
}

/** Arrow + "Sheet N" text where a line leaves a sheet; boxes are in drawing coordinates (obstacles for the other labels). */
interface ContinuationMarker {
  tile: number
  triangle: string
  text: { x: number; y: number; anchor: 'start' | 'end'; size: number; label: string }
  boxes: { minX: number; minY: number; maxX: number; maxY: number }[]
}

type Box = { minX: number; minY: number; maxX: number; maxY: number }
const overlaps = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY

/**
 * Continuation arrows for every sheet. The text always stays glued to its arrow, flush with the sheet edge, on the side
 * (above/below or left/right of the line) where it touches the least; the other labels are then planned around it.
 */
function planMarkers(plan: ExportPlan, d: Drawing, lang: Lang, k: number): ContinuationMarker[] {
  const out: ContinuationMarker[] = []
  if (plan.tiles.length < 2) return out
  const parts: Box[] = [
    ...d.components.flatMap((c) => [visibleBox(c), ...endMarkers(c).map((m) => m.box)]),
    ...routesOf(d).flatMap((rt) => rt.points.slice(1).map((p, i) => {
      const q = rt.points[i]
      return { minX: Math.min(p.x, q.x) - 0.6, maxX: Math.max(p.x, q.x) + 0.6, minY: Math.min(p.y, q.y) - 0.6, maxY: Math.max(p.y, q.y) + 0.6 }
    })),
  ]
  for (const tile of plan.tiles) {
    const r = tile.region
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
        const tk = 1.6 * k
        const tri = horizontal
          ? [[cp.x, cp.y], [cp.x - dirSign * 2 * tk, cp.y - tk], [cp.x - dirSign * 2 * tk, cp.y + tk]]
          : [[cp.x, cp.y], [cp.x - tk, cp.y - dirSign * 2 * tk], [cp.x + tk, cp.y - dirSign * 2 * tk]]
        const triangle = `<polygon points="${tri.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="#111"/>`
        const arrowBox: Box = { minX: Math.min(...tri.map((q) => q[0])), maxX: Math.max(...tri.map((q) => q[0])), minY: Math.min(...tri.map((q) => q[1])), maxY: Math.max(...tri.map((q) => q[1])) }
        // full text first; where there is no room next to the arrow: slightly smaller, then abbreviated, then just the number (never tiny)
        const full = `${t('toSheet', lang)} ${target}`
        const tries: { label: string; f: number }[] = [
          { label: full, f: 1 }, { label: full, f: 0.85 },
          { label: `${t('toSheetShort', lang)} ${target}`, f: 1 }, { label: String(target), f: 1 },
        ]
        const gap = 0.4 * k
        let best: { text: ContinuationMarker['text']; box: Box; clashes: number } | undefined
        for (const tr of tries) {
          const size = 3 * k * tr.f, w = textWidth(tr.label, size, true), h = size * 1.2
          for (const side of [1, -1]) {
            const text = horizontal
              ? { x: cp.x - dirSign * 0.3 * k, y: cp.y + side * (tk + gap + h / 2), anchor: (dirSign > 0 ? 'end' : 'start') as 'start' | 'end', size, label: tr.label }
              : { x: cp.x + side * (tk + gap), y: cp.y - dirSign * (h / 2 + 0.4 * k), anchor: (side > 0 ? 'start' : 'end') as 'start' | 'end', size, label: tr.label }
            const minX = text.anchor === 'start' ? text.x : text.x - w
            const box: Box = { minX, maxX: minX + w, minY: text.y - h / 2, maxY: text.y + h / 2 }
            // a text that would be cut by the sheet edge is worse than touching something
            const outside = box.minX < r.x || box.maxX > r.x + r.w || box.minY < r.y || box.maxY > r.y + r.h ? 10 : 0
            const clashes = outside + [...parts, ...out.flatMap((m) => m.boxes)].filter((o) => overlaps(box, o)).length
            if (!best || clashes < best.clashes) best = { text, box, clashes }
          }
          if (best && best.clashes === 0) break
        }
        if (!best) continue
        out.push({ tile: tile.number, triangle, text: best.text, boxes: [arrowBox, best.box] })
      }
    }
  }
  return out
}

/** What the other labels must keep clear of: the continuation texts and the lines where the drawing is cut between sheets. */
function labelObstacles(plan: ExportPlan, markers: ContinuationMarker[]): Box[] {
  const big = 1e5
  const cuts: Box[] = [
    ...plan.xCuts.slice(1, -1).map((x) => ({ minX: x - 0.3, maxX: x + 0.3, minY: -big, maxY: big })),
    ...plan.yCuts.slice(1, -1).map((y) => ({ minX: -big, maxX: big, minY: y - 0.3, maxY: y + 0.3 })),
  ]
  return [...markers.flatMap((m) => m.boxes), ...cuts]
}

function pageShell(plan: ExportPlan, inner: string): string {
  const { page } = plan.layout
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.w} ${page.h}" width="${page.w}mm" height="${page.h}mm"><rect width="${page.w}" height="${page.h}" fill="#fff"/>${inner}</svg>`
}

/** Draws sheet `pageNumber` (from 1): first the sheets with the drawing, then those of the bill of materials. */
/** Labels and continuation markers of the whole drawing: decided together once, so they do not change from one sheet to another. */
export interface PagePlans { labels: LabelPlan; markers: ContinuationMarker[] }

export function planPageContent(doc: FluidDocument, plan: ExportPlan): PagePlans {
  const text = exportFactors(plan.settings).text
  const k = textFactor(plan.scale) * text
  const markers = planMarkers(plan, doc.drawing, plan.settings.lang, k)
  return { markers, labels: planLabels(doc.drawing, plan.scale, text, labelObstacles(plan, markers)) }
}

export function renderPageSvg(doc: FluidDocument, plan: ExportPlan, pageNumber: number, plans?: PagePlans): string {
  const { settings, layout } = plan
  const lang = settings.lang
  const frame = rectEl(layout.frame.x, layout.frame.y, layout.frame.w, layout.frame.h, 0.7)

  if (pageNumber > plan.tiles.length + plan.bomPages) {
    const all = stateRows(doc.drawing, doc.phases, lang)
    const per = bomRowsPerPage(layout, exportFactors(settings).table)
    const idx = pageNumber - plan.tiles.length - plan.bomPages - 1
    return pageShell(plan,
      frame + renderStatesPage(all.slice(idx * per, (idx + 1) * per), doc.phases, layout, lang, exportFactors(settings).table) +
      renderRevisionTable(doc, layout, lang) +
      renderTitleBlock(doc, layout, lang, { index: pageNumber, total: plan.totalPages, scaleText: '—', subtitle: t('stateTable', lang) }))
  }
  if (pageNumber > plan.tiles.length) {
    const pages = paginateBom(bomItems(doc.drawing, lang, doc.bom), bomRowsPerPage(layout, exportFactors(settings).table))
    const idx = pageNumber - plan.tiles.length - 1
    return pageShell(plan,
      frame + renderBomPage(pages[idx] ?? [], doc, layout, lang, exportFactors(settings).table) +
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
  const { labels: lp, markers } = plans ?? planPageContent(doc, plan)
  const clipId = `clip-${pageNumber}`
  const anns = annsIntersect(d, region)
  let body =
    anns.filter((a) => a.kind === 'box').map((a) => renderAnnotationBox(a, lang)).join('') +
    lines.map((l) => renderLine(d, l, settings.color, lp.lines.get(l.id) ?? null)).join('') + comps.map((c) => renderComponent(c, { label: lp.tags.get(c.id), textScale: lp.factor })).join('') +
    anns.filter((a) => a.kind === 'text').map((a) => renderAnnotationText(a, lang)).join('')
  for (const m of markers) {
    if (m.tile === tile.number) body += m.triangle + textEl(m.text.x, m.text.y, m.text.label, { size: m.text.size, anchor: m.text.anchor, bold: true })
  }
  if (!d.components.length && !d.annotations.length) body = textEl(region.x + region.w / 2, region.y + region.h / 2, t('empty', lang), { size: 5, color: '#999' })

  const content =
    `<clipPath id="${clipId}"><rect x="${n(area.x)}" y="${n(area.y)}" width="${n(area.w)}" height="${n(area.h)}"/></clipPath>` +
    `<g clip-path="url(#${clipId})"><g transform="translate(${n(ox)} ${n(oy)}) scale(${n(s)}) ">${body}</g></g>`

  return pageShell(plan,
    content +
    (settings.legend ? renderLegend(usedIn(comps, lines), layout, lang, settings.color, exportFactors(settings).table) : '') + frame +
    renderRevisionTable(doc, layout, lang) +
    renderTitleBlock(doc, layout, lang, { index: pageNumber, total: plan.totalPages, scaleText: scaleText(s) }))
}

export function renderAllPages(doc: FluidDocument, plan: ExportPlan): string[] {
  const plans = planPageContent(doc, plan)
  return Array.from({ length: plan.totalPages }, (_, i) => renderPageSvg(doc, plan, i + 1, plans))
}
