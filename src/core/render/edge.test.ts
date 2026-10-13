import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createEmptyDocument, readDocument } from '../documents'
import { addComponent } from '../edit'
import { planExport, renderAllPages } from './export'
import { renderPhasePages } from './phases'
import { SAMPLE_DOCUMENT } from '../sample'

const sizes = ['small', 'medium', 'large'] as const
const formats = ['A4', 'A3', 'A2'] as const
const clean = (pages: string[]) => { for (const p of pages) { expect(p).not.toMatch(/NaN|undefined|Infinity|\[object/); expect(p.startsWith('<svg')).toBe(true); expect(p.endsWith('</svg>')).toBe(true) } }

describe('edge cases before release', () => {
  it('old files with the removed export settings still open', () => {
    const old = JSON.parse(JSON.stringify(SAMPLE_DOCUMENT))
    old.export = { format: 'A4', mode: 'fit', lang: 'en', color: false, legend: true, bom: true, states: true, scale: 0.5, textScale: 1.4, tableScale: 1.2 }
    const doc = readDocument(old)
    expect(doc.export.size).toBe('medium')
    expect(doc.export.format).toBe('A4')
    clean(renderAllPages(doc, planExport(doc)))
  })
  it('a file with no export section gets the defaults', () => {
    const old = JSON.parse(JSON.stringify(SAMPLE_DOCUMENT)); delete old.export
    expect(readDocument(old).export.size).toBe('medium')
  })
  for (const format of formats) for (const size of sizes) {
    it(`empty project, ${format} ${size}`, () => {
      const base = createEmptyDocument()
      const doc = { ...base, export: { ...base.export, format, size } }
      const plan = planExport(doc)
      expect(plan.tiles).toHaveLength(1)
      clean(renderAllPages(doc, plan))
    })
    it(`single part, no lines, ${format} ${size}; legend off; bom off`, () => {
      const doc0 = produce(createEmptyDocument(), (d) => { addComponent(d, 'valve.ball', 100, 100) })
      for (const legend of [true, false]) for (const bom of [true, false]) {
        const doc = { ...doc0, export: { ...doc0.export, format, size, legend, bom } }
        clean(renderAllPages(doc, planExport(doc)))
      }
    })
    it(`sample with two phases and valve states, ${format} ${size}: design pages and phase pages`, () => {
      const doc = produce(SAMPLE_DOCUMENT, (dd) => {
        dd.phases = [{ id: 'p1', name: { it: 'Riempimento', en: 'Fill' } }, { id: 'p2', name: { it: 'Pressurizzazione', en: 'Pressurization' } }]
        for (const c of dd.drawing.components) if (c.symbol.startsWith('valve.')) c.states = { p1: 'open', p2: 'closed' }
      })
      const d = { ...doc, export: { ...doc.export, format, size } }
      clean(renderAllPages(d, planExport(d)))
      clean(renderPhasePages(d))
    })
  }
})
