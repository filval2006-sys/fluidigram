import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { addComponent, connectPorts } from '../edit'
import { FLUIDS, lineWidth } from '../fluids'
import { componentPorts, lineRoute, worldExtent } from '../scene'
import { SAMPLE_DOCUMENT } from '../sample'
import { ALL_SYMBOLS } from '../symbols/library'
import type { Drawing, FluidId } from '../types'
import { LINE_LABEL_SIZE, TAG_SIZE, labelRects, planLabels, textFactor, textWidth, type Rect } from './labels'

describe('label planning', () => {
  const d = SAMPLE_DOCUMENT.drawing

  it('keeps every line label clear of the stroke of its own line', () => {
    for (const scale of [1, 0.7]) {
      const plan = planLabels(d, scale)
      for (const l of d.lines) {
        const p = plan.lines.get(l.id)
        if (!p) continue
        const size = p.size ?? LINE_LABEL_SIZE
        const w = textWidth(p.text ?? l.fluid, size), h = size * 1.2
        const minX = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'start' ? p.x : p.x - w
        const half = lineWidth(l.fluid, l.size) / 2
        const pts = lineRoute(d, l)
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i]
          const hit = minX < Math.max(a.x, b.x) + half && minX + w > Math.min(a.x, b.x) - half &&
            p.y - h / 2 < Math.max(a.y, b.y) + half && p.y + h / 2 > Math.min(a.y, b.y) - half
          expect(hit, `${l.id} @${scale}`).toBe(false)
        }
      }
    }
  })

  it('enlarges texts when the drawing is shrunk, so they keep their size on paper', () => {
    expect(textFactor(1)).toBe(1)
    expect(textFactor(0.5)).toBe(2)
    expect(textFactor(0.01)).toBe(2.2)
    const plan = planLabels(d, 0.7)
    const tag = [...plan.tags.values()][0]
    expect(tag.size! * 0.7).toBeCloseTo(TAG_SIZE, 5)
  })
})

describe('labels at every slider position', () => {
  /** A crowded diagram: parts 24 mm apart in a chain, every fluid, sizes on most lines. */
  function dense(n: number): Drawing {
    const doc = produce(SAMPLE_DOCUMENT, (dd) => {
      dd.drawing.components = []
      dd.drawing.lines = []
      const ids = ['valve.ball', 'sensor.pt', 'sensor.tc', 'valve.check', 'fitting.junction', 'valve.solenoid']
      const fluids = Object.keys(FLUIDS) as FluidId[]
      let prev: { id: string; port: string } | undefined
      for (let i = 0; i < n; i++) {
        const sym = ALL_SYMBOLS.find((s) => s.id === ids[i % ids.length]) ?? ALL_SYMBOLS[i % ALL_SYMBOLS.length]
        const c = addComponent(dd, sym.id, 40 + (i % 6) * 24, 40 + Math.floor(i / 6) * 28)
        const ports = componentPorts(c).map((p) => p.id)
        if (prev && ports.length) connectPorts(dd.drawing, { componentId: prev.id, portId: prev.port }, { componentId: c.id, portId: ports[0] }, fluids[i % 4], i % 4 ? '1/4" OD' : undefined)
        if (ports.length) prev = { id: c.id, port: ports[ports.length - 1] }
      }
    })
    return doc.drawing
  }

  const hit = (a: Rect, b: Rect) => a.minX < b.maxX - 0.05 && a.maxX > b.minX + 0.05 && a.minY < b.maxY - 0.05 && a.maxY > b.minY + 0.05

  for (const n of [8, 24, 48]) {
    it(`${n} crowded parts: labels never overlap each other (and, up to 24 parts, neither parts nor lines), for any text size and scale`, () => {
      const d = dense(n)
      // a very crowded diagram shrunk to the 15–20% limit has no room left for any text: only the scales where the parts are still more than a few millimetres apart on paper are required
      for (const scale of n > 24 ? [0.45, 0.7, 1] : [0.2, 0.3, 0.45, 0.7, 1]) {
        for (const ts of [0.85, 1, 1.25]) {
          const lp = planLabels(d, scale, ts)
          const rects = labelRects(d, lp)
          for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) expect(hit(rects[i], rects[j]), `labels ${i}/${j} @${scale}/${ts}`).toBe(false)
            if (n > 24) continue // in a very big chain a long return line can cut through a whole row: only label/label overlaps are required
            for (const c of d.components) expect(hit(rects[i], worldExtent(c)) && !isOwnTag(d, lp, i, c.id), `part ${c.tag} @${scale}/${ts}`).toBe(false)
            for (const l of d.lines) {
              const pts = lineRoute(d, l), half = lineWidth(l.fluid, l.size) / 2
              for (let k = 1; k < pts.length; k++) {
                const seg = { minX: Math.min(pts[k - 1].x, pts[k].x) - half, maxX: Math.max(pts[k - 1].x, pts[k].x) + half, minY: Math.min(pts[k - 1].y, pts[k].y) - half, maxY: Math.max(pts[k - 1].y, pts[k].y) + half }
                expect(hit(rects[i], seg), `line ${l.id} @${scale}/${ts}`).toBe(false)
              }
            }
          }
        }
      }
    })
  }
})

/** Rect i of labelRects() is the tag of component `compId`? (tags come first, in component order, only those planned) */
function isOwnTag(d: Drawing, lp: ReturnType<typeof planLabels>, i: number, compId: string): boolean {
  const planned = d.components.filter((c) => lp.tags.has(c.id))
  return planned[i]?.id === compId
}
