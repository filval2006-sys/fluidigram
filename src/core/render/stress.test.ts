import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { addComponent, connectPorts } from '../edit'
import { FLUIDS } from '../fluids'
import { EXPORT_LIMITS } from '../types'
import { SAMPLE_DOCUMENT } from '../sample'
import { componentPorts } from '../scene'
import { ALL_SYMBOLS } from '../symbols/library'
import type { FluidDocument, FluidId } from '../types'
import { bomItems, bomRowsPerPage, paginateBom, renderBomPage } from './bom'
import { planExport, renderAllPages } from './export'
import { layoutFor } from './layout'
import { renderLegend, usedIn } from './legend'
import { textWidth } from './svg'

const FLUID_IDS = Object.keys(FLUIDS) as FluidId[]

/** A document with `n` components cycling through every symbol, connected in a chain with every fluid. */
function bigDoc(n: number): FluidDocument {
  return produce(SAMPLE_DOCUMENT, (d) => {
    d.drawing.components = []
    d.drawing.lines = []
    d.drawing.annotations = []
    let prev: { id: string; port: string } | undefined
    for (let i = 0; i < n; i++) {
      const def = ALL_SYMBOLS[i % ALL_SYMBOLS.length]
      const c = addComponent(d, def.id, 40 + (i % 12) * 60, 40 + Math.floor(i / 12) * 60)
      const ports = componentPorts(c).map((p) => p.id)
      if (prev && ports.length) connectPorts(d.drawing, { componentId: prev.id, portId: prev.port }, { componentId: c.id, portId: ports[0] }, FLUID_IDS[i % FLUID_IDS.length], i % 3 ? 'Ø6 mm' : undefined)
      if (ports.length) prev = { id: c.id, port: ports[ports.length - 1] }
    }
  })
}

const nums = (s: string, attr: string): number[] => [...s.matchAll(new RegExp(`\\b${attr}="(-?[\\d.]+)"`, 'g'))].map((m) => Number(m[1]))

describe('export size sliders', () => {
  const extremes = [
    { scale: EXPORT_LIMITS.scale.min, textScale: EXPORT_LIMITS.textScale.max, tableScale: EXPORT_LIMITS.tableScale.max },
    { scale: 1, textScale: EXPORT_LIMITS.textScale.min, tableScale: EXPORT_LIMITS.tableScale.min },
    { scale: 0, textScale: EXPORT_LIMITS.textScale.max, tableScale: EXPORT_LIMITS.tableScale.max },
  ]
  for (const count of [3, 40, 150]) {
    for (const [i, sizes] of extremes.entries()) {
      it(`${count} parts, slider extremes #${i + 1}: nothing leaves the sheet and every table page ends above the title block`, () => {
        const base = bigDoc(count)
        const doc = { ...base, export: { ...base.export, format: 'A4' as const, ...sizes } }
        const plan = planExport(doc)
        if (sizes.scale > 0) expect(plan.scale).toBe(sizes.scale)
        for (const p of renderAllPages(doc, plan)) expect(p).not.toMatch(/NaN|undefined|Infinity/)
        const layout = layoutFor('A4', true)
        const legend = renderLegend(usedIn(doc.drawing.components, doc.drawing.lines), layout, 'it', true, sizes.tableScale)
        const flat = legend.replace(/<g transform="translate[\s\S]*?<\/g>/g, '')
        const L = layout.legend!
        for (const y of [...nums(flat, 'y'), ...nums(flat, 'y1'), ...nums(flat, 'y2')]) expect(y).toBeLessThanOrEqual(L.y + L.h + 0.01)
        for (const page of paginateBom(bomItems(doc.drawing, 'it', doc.bom), bomRowsPerPage(layout, sizes.tableScale))) {
          const table = renderBomPage(page, doc, layout, 'it', sizes.tableScale)
          for (const y of [...nums(table, 'y'), ...nums(table, 'y1'), ...nums(table, 'y2')]) expect(y).toBeLessThanOrEqual(layout.titleBlock.y)
        }
      })
    }
  }

  it('a fixed scale larger than the fit splits the diagram, a smaller one keeps one sheet', () => {
    const base = bigDoc(40)
    const at = (scale: number) => planExport({ ...base, export: { ...base.export, format: 'A4' as const, scale } })
    expect(at(1).tiles.length).toBeGreaterThan(1)
    expect(at(EXPORT_LIMITS.scale.min).tiles.length).toBe(1)
  })
})

describe('export with any number of parts', () => {
  for (const count of [0, 1, 3, 12, 40, 150]) {
    for (const format of ['A4', 'A3', 'A2'] as const) {
      it(`${count} parts on ${format}: legend stays inside its column, tables above the title block, no broken numbers`, () => {
        const base = bigDoc(count)
        const doc = { ...base, export: { ...base.export, format } }
        const plan = planExport(doc)
        const pages = renderAllPages(doc, plan)
        expect(pages.length).toBe(plan.totalPages)
        for (const p of pages) expect(p).not.toMatch(/NaN|undefined|Infinity/)

        const layout = layoutFor(format, true)
        const legend = renderLegend(usedIn(doc.drawing.components, doc.drawing.lines), layout, 'it', true)
        const L = layout.legend!
        // symbol thumbnails use their own local coordinates: only where they are placed counts
        const thumbs = [...legend.matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\) scale/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
        for (const t of thumbs) { expect(t.y).toBeGreaterThan(L.y); expect(t.y).toBeLessThan(L.y + L.h); expect(t.x).toBeLessThan(L.x + L.w) }
        const flat = legend.replace(/<g transform="translate[\s\S]*?<\/g>/g, '')
        for (const y of [...nums(flat, 'y'), ...nums(flat, 'y1'), ...nums(flat, 'y2')]) {
          expect(y).toBeGreaterThanOrEqual(L.y - 0.01)
          expect(y).toBeLessThanOrEqual(L.y + L.h + 0.01)
        }
        // texts that start at the left must end before the right edge of the column
        for (const m of flat.matchAll(/<text x="([\d.]+)"[^>]*font-size="([\d.]+)" text-anchor="start"[^>]*>([^<]*)</g)) {
          expect(Number(m[1]) + textWidth(m[3], Number(m[2]))).toBeLessThanOrEqual(L.x + L.w + 0.5)
        }

        const items = bomItems(doc.drawing, 'it', doc.bom)
        const per = bomRowsPerPage(layout)
        for (const page of paginateBom(items, per)) {
          const table = renderBomPage(page, doc, layout, 'it')
          for (const y of [...nums(table, 'y'), ...nums(table, 'y1'), ...nums(table, 'y2')]) expect(y).toBeLessThanOrEqual(layout.titleBlock.y)
          for (const x of [...nums(table, 'x'), ...nums(table, 'x1'), ...nums(table, 'x2')]) expect(x).toBeLessThanOrEqual(layout.frame.x + layout.frame.w)
        }
      })
    }
  }
})
