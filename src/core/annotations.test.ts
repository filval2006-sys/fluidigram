import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { addAnnotation, copyItems, deleteItems, pasteItems } from './edit'
import { createEmptyDocument, readDocument } from './documents'
import { annotationBounds, annotationText, renderAnnotation } from './render/annotations'
import { drawingBounds, planExport, renderPageSvg } from './render/export'
import { checkIntegrity } from './validate'
import { SAMPLE_DOCUMENT } from './sample'

describe('annotations', () => {
  it('text and box with default values, snapped to the grid', () => {
    const doc = produce(createEmptyDocument(), (d) => { addAnnotation(d, 'text', 12, 13); addAnnotation(d, 'box', 40, 40) })
    const [t, b] = doc.drawing.annotations
    expect([t.x, t.y]).toEqual([10, 15])
    expect(t.kind).toBe('text')
    expect(b.kind).toBe('box')
    expect(b.w).toBeGreaterThan(0)
    expect(checkIntegrity(doc)).toEqual([])
  })
  it('they can be deleted, copied and pasted with new ids', () => {
    const doc = produce(createEmptyDocument(), (d) => { addAnnotation(d, 'text', 10, 10); addAnnotation(d, 'box', 50, 50) })
    const ids = new Set(doc.drawing.annotations.map((a) => a.id))
    const out = produce(doc, (d) => {
      const clip = copyItems(d.drawing, ids)
      expect(clip.annotations).toHaveLength(2)
      const created = pasteItems(d, clip, 10, 10)
      expect(created).toHaveLength(2)
    })
    expect(out.drawing.annotations).toHaveLength(4)
    expect(new Set(out.drawing.annotations.map((a) => a.id)).size).toBe(4)
    expect(checkIntegrity(out)).toEqual([])
    const gone = produce(out, (d) => { deleteItems(d.drawing, ids) })
    expect(gone.drawing.annotations).toHaveLength(2)
  })
  it('a file without annotations (earlier versions) reads with an empty list', () => {
    const raw = JSON.parse(JSON.stringify(SAMPLE_DOCUMENT))
    delete raw.drawing.annotations
    expect(readDocument(raw).drawing.annotations).toEqual([])
  })
  it('multiline text: extent and drawing; language fallback', () => {
    const doc = produce(createEmptyDocument(), (d) => {
      const a = addAnnotation(d, 'text', 0, 0)
      a.text = { it: 'Prima riga\nSeconda riga più lunga', en: '' }
      a.size = 4
    })
    const a = doc.drawing.annotations[0]
    const b = annotationBounds(a)
    expect(b.maxY - b.minY).toBeCloseTo(2 * 4 * 1.28, 5)
    expect(b.maxX - b.minX).toBeGreaterThan('Seconda riga più lunga'.length * 4 * 0.5)
    expect(annotationText(a, 'en')).toBe(a.text.it) // without a translation the other language is used
    expect(renderAnnotation(a, 'it').match(/<text/g)).toHaveLength(2)
  })
  it('special characters are escaped in the SVG', () => {
    const doc = produce(createEmptyDocument(), (d) => { const a = addAnnotation(d, 'text', 0, 0); a.text = { it: '<b>&"x"', en: '' } })
    const svg = renderAnnotation(doc.drawing.annotations[0], 'it')
    expect(svg).not.toContain('<b>')
    expect(svg).toContain('&lt;b&gt;&amp;&quot;x&quot;')
  })
  it('they fit within the drawing bounds and in the export, in the chosen language', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => {
      const box = addAnnotation(d, 'box', 20, 20)
      box.w = 200; box.h = 160; box.text = { it: 'Lato volo', en: 'Flight side' }
      const note = addAnnotation(d, 'text', 30, 190)
      note.text = { it: 'Nota importante', en: 'Important note' }
    })
    const b0 = drawingBounds(SAMPLE_DOCUMENT.drawing)!
    const b1 = drawingBounds(doc.drawing)!
    expect(b1.h).toBeGreaterThan(b0.h)
    const it = renderPageSvg(doc, planExport(doc, { ...doc.export, lang: 'it' }), 1)
    const en = renderPageSvg(doc, planExport(doc, { ...doc.export, lang: 'en' }), 1)
    expect(it).toContain('Lato volo')
    expect(it).toContain('Nota importante')
    expect(en).toContain('Flight side')
    expect(en).toContain('Important note')
    expect(en).not.toContain('Lato volo')
  })
  it('a project with only annotations is not considered empty', () => {
    const doc = produce(createEmptyDocument(), (d) => { addAnnotation(d, 'text', 20, 20) })
    const plan = planExport(doc)
    expect(renderPageSvg(doc, plan, 1)).not.toContain('Nessun componente')
  })
})
