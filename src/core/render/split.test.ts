import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { addComponent, connectPorts } from '../edit'
import { FLUIDS } from '../fluids'
import { SAMPLE_DOCUMENT } from '../sample'
import { componentPorts } from '../scene'
import { ALL_SYMBOLS } from '../symbols/library'
import type { FluidDocument, FluidId } from '../types'
import { planExport, planPageContent, renderAllPages, visibleBox } from './export'
import { labelRects, type Rect } from './labels'

const FLUID_IDS = Object.keys(FLUIDS) as FluidId[]
const SYMS = ['valve.ball', 'sensor.pt', 'sensor.tc', 'valve.check', 'fitting.junction', 'valve.solenoid']

/** A chain of parts laid out on a grid `pitch` mm apart, wrapping every `perRow`. */
function grid(n: number, pitch: number, perRow: number): FluidDocument {
  return produce(SAMPLE_DOCUMENT, (d) => {
    d.drawing.components = []
    d.drawing.lines = []
    d.drawing.annotations = []
    let prev: { id: string; port: string } | undefined
    for (let i = 0; i < n; i++) {
      const sym = ALL_SYMBOLS.find((s) => s.id === SYMS[i % SYMS.length]) ?? ALL_SYMBOLS[0]
      const c = addComponent(d, sym.id, 40 + (i % perRow) * pitch, 40 + Math.floor(i / perRow) * pitch)
      const ports = componentPorts(c).map((p) => p.id)
      if (prev && ports.length && (i % perRow)) connectPorts(d.drawing, { componentId: prev.id, portId: prev.port }, { componentId: c.id, portId: ports[0] }, FLUID_IDS[i % 4], i % 3 ? 'Ø6 mm' : undefined)
      if (ports.length) prev = { id: c.id, port: ports[ports.length - 1] }
    }
  })
}

const hit = (a: Rect, b: Rect) => a.minX < b.maxX - 0.01 && a.maxX > b.minX + 0.01 && a.minY < b.maxY - 0.01 && a.maxY > b.minY + 0.01

describe('diagram split over several sheets', () => {
  // big enough that even the smallest allowed scale needs several sheets
  const docs = [grid(16, 300, 4), grid(30, 190, 6), grid(60, 140, 10)]
  for (const [di, base] of docs.entries()) {
    for (const format of ['A4', 'A3'] as const) {
      it(`doc #${di + 1} on ${format}: continuation texts stay glued to their arrow, inside the sheet, and nothing else touches them or the cuts`, () => {
        let splitSeen = false
        let sawMarkers = false
        for (const size of ['small', 'medium', 'large'] as const) {
          {
            const doc = { ...base, export: { ...base.export, format, size } }
            const plan = planExport(doc)
            if (plan.tiles.length < 2) continue
            splitSeen = true
            const { labels, markers } = planPageContent(doc, plan)
            const tag = `@${size}`
            if (markers.length) sawMarkers = true
            const label = labelRects(doc.drawing, labels)
            for (const m of markers) {
              const [arrow, text] = m.boxes
              const tile = plan.tiles.find((t) => t.number === m.tile)!.region
              // glued: the text box touches the arrow box (gap of a fraction of a millimetre at most)
              const gapX = Math.max(0, Math.max(arrow.minX, text.minX) - Math.min(arrow.maxX, text.maxX))
              const gapY = Math.max(0, Math.max(arrow.minY, text.minY) - Math.min(arrow.maxY, text.maxY))
              expect(Math.hypot(gapX, gapY), 'text glued to arrow ' + tag).toBeLessThan(1.5)
              // inside its sheet, so it is never clipped
              expect(text.minX, 'text inside sheet ' + tag).toBeGreaterThanOrEqual(tile.x - 0.01)
              expect(text.maxX, 'text inside sheet ' + tag).toBeLessThanOrEqual(tile.x + tile.w + 0.01)
              expect(text.minY, 'text inside sheet ' + tag).toBeGreaterThanOrEqual(tile.y - 0.01)
              expect(text.maxY, 'text inside sheet ' + tag).toBeLessThanOrEqual(tile.y + tile.h + 0.01)
              for (const l of label) for (const b of m.boxes) expect(hit(l, b), 'label over continuation marker ' + tag).toBe(false)
            }
            for (let i = 0; i < markers.length; i++) {
              for (let j = i + 1; j < markers.length; j++) {
                if (markers[i].tile !== markers[j].tile) continue
                for (const a of markers[i].boxes) for (const b of markers[j].boxes) expect(hit(a, b), 'two markers overlap ' + tag).toBe(false)
              }
            }
            for (const l of label) {
              for (const x of plan.xCuts.slice(1, -1)) expect(l.minX < x && l.maxX > x, `label straddles a vertical cut ${tag}`).toBe(false)
              for (const y of plan.yCuts.slice(1, -1)) expect(l.minY < y && l.maxY > y, `label straddles a horizontal cut ${tag}`).toBe(false)
            }
            // markers must not sit on parts
            for (const m of markers) for (const c of doc.drawing.components) expect(hit(m.boxes[1], visibleBox(c)), 'marker over a part ' + tag).toBe(false)
            for (const page of renderAllPages(doc, plan)) expect(page).not.toMatch(/NaN|undefined|Infinity/)
          }
        }
        expect(splitSeen, 'the scenario must actually split').toBe(true)
        if (di > 0 && format === 'A4') expect(sawMarkers, 'lines crossing the cuts get continuation markers').toBe(true)
      })
    }
  }
})
