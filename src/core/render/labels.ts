import { FLUIDS } from '../fluids'
import { componentPorts, lineRoute, worldExtent } from '../scene'
import { getSymbol } from '../symbols/library'
import type { Dir, Point } from '../geometry'
import type { Drawing, FluidId } from '../types'
import { annotationBounds } from './annotations'
import { endMarkers } from './endpoints'
import { textWidth } from './svg'

/** Text size of the labels on the drawing (mm). */
export const TAG_SIZE = 2.4
export const LINE_LABEL_SIZE = 1.7

export interface LabelPlace { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
export interface LabelPlan {
  /** position of the tag of components without an inner label */
  tags: Map<string, LabelPlace>
  /** position of the fluid/size label; absent if no segment is long enough */
  lines: Map<string, LabelPlace>
}

interface Rect { minX: number; minY: number; maxX: number; maxY: number }

export { textWidth }

const inflate = (r: Rect, k: number): Rect => ({ minX: r.minX - k, minY: r.minY - k, maxX: r.maxX + k, maxY: r.maxY + k })
const hit = (a: Rect, b: Rect): boolean => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY

function rectOf(p: LabelPlace, w: number, h: number): Rect {
  const minX = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'start' ? p.x : p.x - w
  return { minX, maxX: minX + w, minY: p.y - h / 2, maxY: p.y + h / 2 }
}

/**
 * Chooses where to write tags and line data so they do not touch lines, components, notes or other labels.
 * Component tags first (near the part), then line labels (on the segment, to the side).
 */
export function planLabels(d: Drawing): LabelPlan {
  const tags = new Map<string, LabelPlace>()
  const lines = new Map<string, LabelPlace>()

  const comps = d.components.map((c) => ({ c, e: worldExtent(c) }))
  const segs: Rect[] = []
  const routes = d.lines.map((l) => ({ l, pts: lineRoute(d, l) }))
  for (const { pts } of routes) {
    for (let i = 1; i < pts.length; i++) {
      segs.push(inflate({ minX: Math.min(pts[i - 1].x, pts[i].x), maxX: Math.max(pts[i - 1].x, pts[i].x), minY: Math.min(pts[i - 1].y, pts[i].y), maxY: Math.max(pts[i - 1].y, pts[i].y) }, 0.4))
    }
  }
  const notes = d.annotations.filter((a) => a.kind === 'text').map((a) => inflate(annotationBounds(a, 'any'), 0.5))
  // vent / external inlet symbols: the text must not end up on them
  const placed: Rect[] = d.components.flatMap((c) => endMarkers(c).map((m) => m.box))

  const count = (r: Rect, ownIdx = -1): number => {
    let n = 0
    comps.forEach(({ e }, i) => { if (i !== ownIdx && hit(r, inflate(e, 0.4))) n++ })
    for (const s of segs) if (hit(r, s)) n++
    for (const s of notes) if (hit(r, s)) n++
    for (const s of placed) if (hit(r, s)) n++
    return n
  }

  // --- component tags ---
  comps.forEach(({ c, e }, idx) => {
    const def = getSymbol(c.symbol)
    if (def.labelInside) return
    const w = textWidth(c.tag, TAG_SIZE, true), h = TAG_SIZE * 1.2
    const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2
    const portSides = new Set<Dir>(componentPorts(c).map((p) => p.dir))
    const cands: { p: LabelPlace; side: Dir }[] = []
    for (const gap of [1.2, 3.5]) {
      const g = gap
      cands.push(
        { side: 'S', p: { x: cx, y: e.maxY + g + h / 2, anchor: 'middle' } },
        { side: 'N', p: { x: cx, y: e.minY - g - h / 2, anchor: 'middle' } },
        { side: 'E', p: { x: e.maxX + g, y: cy, anchor: 'start' } },
        { side: 'W', p: { x: e.minX - g, y: cy, anchor: 'end' } },
        { side: 'S', p: { x: e.maxX + g, y: e.maxY + g + h / 2, anchor: 'start' } },
        { side: 'S', p: { x: e.minX - g, y: e.maxY + g + h / 2, anchor: 'end' } },
        { side: 'N', p: { x: e.maxX + g, y: e.minY - g - h / 2, anchor: 'start' } },
        { side: 'N', p: { x: e.minX - g, y: e.minY - g - h / 2, anchor: 'end' } },
        { side: 'S', p: { x: e.minX, y: e.maxY + g + h / 2, anchor: 'start' } },
        { side: 'S', p: { x: e.maxX, y: e.maxY + g + h / 2, anchor: 'end' } },
        { side: 'N', p: { x: e.minX, y: e.minY - g - h / 2, anchor: 'start' } },
        { side: 'N', p: { x: e.maxX, y: e.minY - g - h / 2, anchor: 'end' } },
      )
    }
    let best = cands[0], bestScore = Infinity
    cands.forEach((cd, i) => {
      const r = rectOf(cd.p, w, h)
      // a side with a port is less suitable: a pipe will arrive (or might arrive) there
      const score = count(r, idx) * 10 + (portSides.has(cd.side) ? 3 : 0) + i * 0.01
      if (score < bestScore) { bestScore = score; best = cd }
    })
    tags.set(c.id, best.p)
    placed.push(rectOf(best.p, w, h))
  })

  // --- line labels: longest segments first ---
  const order = [...routes].sort((a, b) => pathLen(b.pts) - pathLen(a.pts))
  for (const { l, pts } of order) {
    if (pts.length < 2) continue
    const label = lineLabelText(l.fluid, l.size)
    const w = textWidth(label, LINE_LABEL_SIZE), h = LINE_LABEL_SIZE * 1.2
    const runs = pts.slice(1).map((q, i) => ({ a: pts[i], b: q, len: Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y) }))
      .filter((s) => s.len >= w + 3).sort((x, y) => y.len - x.len).slice(0, 5)
    let best: LabelPlace | null = null, bestScore = Infinity, k = 0
    for (const s of runs) {
      const horizontal = s.a.y === s.b.y
      for (const f of [0.5, 0.3, 0.7]) {
        const mx = s.a.x + (s.b.x - s.a.x) * f, my = s.a.y + (s.b.y - s.a.y) * f
        const sides: LabelPlace[] = horizontal
          ? [{ x: mx, y: my - 1.5, anchor: 'middle' }, { x: mx, y: my + 1.5, anchor: 'middle' }]
          : [{ x: mx + 1.5, y: my, anchor: 'start' }, { x: mx - 1.5, y: my, anchor: 'end' }]
        for (const p of sides) {
          const score = count(rectOf(p, w, h)) * 10 + k++ * 0.01
          if (score < bestScore) { bestScore = score; best = p }
        }
      }
    }
    if (best) {
      lines.set(l.id, best)
      placed.push(rectOf(best, w, h))
    }
  }
  return { tags, lines }
}

/** Text of a line's label (fluid code + size). */
export const lineLabelText = (fluid: FluidId, size?: string): string => (size ? `${FLUIDS[fluid].code} ${size}` : FLUIDS[fluid].code)

function pathLen(pts: Point[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
  return s
}
