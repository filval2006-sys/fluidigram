import { describe, expect, it } from 'vitest'
import { GRID, dirToWorld, localToWorld } from './geometry'
import { routeLine } from './routing'
import { componentPorts, lineRoute } from './scene'
import { SAMPLE_DOCUMENT } from './sample'
import { SYMBOL_LIBRARY } from './symbols/library'
import { checkIntegrity, parseDocument } from './validate'
import { describePlan, planExport, renderAllPages, renderPageSvg, chooseCuts, scaleText } from './render/export'
import { readDocument } from './documents'
import { addComponent, connectPorts } from './edit'
import { produce } from 'immer'

describe('symbol library', () => {
  for (const def of SYMBOL_LIBRARY.values()) {
    it(`${def.id}: box and ports are on the grid`, () => {
      expect(def.w % 10).toBe(0)
      expect(def.h % 10).toBe(0)
      for (const p of def.ports) {
        expect(p.x % GRID).toBe(0)
        expect(p.y % GRID).toBe(0)
      }
    })
  }
})

describe('geometry', () => {
  const size = { w: 10, h: 10 }
  it('an E port rotated by 90° faces S and falls below the center', () => {
    const pl = { x: 100, y: 100, rotation: 90 as const, mirror: false }
    expect(localToWorld(size, pl, { x: 10, y: 5 })).toEqual({ x: 100, y: 105 })
    expect(dirToWorld('E', pl)).toBe('S')
  })
  it('the mirror swaps E/W', () => {
    const pl = { x: 100, y: 100, rotation: 0 as const, mirror: true }
    expect(localToWorld(size, pl, { x: 10, y: 5 })).toEqual({ x: 95, y: 100 })
    expect(dirToWorld('E', pl)).toBe('W')
  })
})

describe('orthogonal routing', () => {
  it('aligned ports → direct segment', () => {
    expect(routeLine({ p: { x: 0, y: 0 }, dir: 'E' }, { p: { x: 20, y: 0 }, dir: 'W' })).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }])
  })
  it('E → N produces an L elbow', () => {
    const r = routeLine({ p: { x: 0, y: 0 }, dir: 'E' }, { p: { x: 30, y: 30 }, dir: 'N' })
    expect(r).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }])
  })
  it('all segments are orthogonal', () => {
    const r = routeLine({ p: { x: 0, y: 0 }, dir: 'E' }, { p: { x: 40, y: 25 }, dir: 'W' })
    for (let i = 1; i < r.length; i++) expect(r[i].x === r[i - 1].x || r[i].y === r[i - 1].y).toBe(true)
  })
})

const D = SAMPLE_DOCUMENT.drawing

describe('sample document', () => {
  it('is valid and intact', () => {
    expect(checkIntegrity(SAMPLE_DOCUMENT)).toEqual([])
    expect(() => parseDocument(JSON.parse(JSON.stringify(SAMPLE_DOCUMENT)))).not.toThrow()
  })
  it('all lines have an orthogonal path', () => {
    for (const l of D.lines) {
      const r = lineRoute(D, l)
      expect(r.length).toBeGreaterThanOrEqual(2)
      for (let i = 1; i < r.length; i++) expect(r[i].x === r[i - 1].x || r[i].y === r[i - 1].y).toBe(true)
    }
  })
  it('connected ports coincide with the path ends', () => {
    const port = (c: string, p: string) => componentPorts(D.components.find((x) => x.id === c)!).find((x) => x.id === p)!.p
    const l7 = lineRoute(D, D.lines.find((l) => l.id === 'l7')!)
    expect(l7[0]).toEqual(port('c7', 'bottom'))
    expect(l7[l7.length - 1]).toEqual(port('c8', 'a'))
  })
  it('detects broken references', () => {
    const bad = structuredClone(SAMPLE_DOCUMENT)
    bad.drawing.lines[0].to = { componentId: 'zzz', portId: 'a' }
    expect(checkIntegrity(bad).length).toBe(1)
  })
})

describe('migration from v1 files', () => {
  it('merges the sheets into a single drawing by stacking them', () => {
    const v1 = {
      version: 1, meta: SAMPLE_DOCUMENT.meta, revisions: [],
      sheets: [
        { id: 'a', format: 'A4', components: [{ id: 'c1', symbol: 'valve.ball', tag: 'BV-101', x: 50, y: 50, rotation: 0, mirror: false, props: {} }], lines: [] },
        { id: 'b', format: 'A3', components: [{ id: 'c2', symbol: 'valve.ball', tag: 'BV-102', x: 50, y: 60, rotation: 0, mirror: false, props: {} }], lines: [] },
      ],
    }
    const doc = readDocument(v1)
    expect(doc.version).toBe(2)
    expect(doc.export.format).toBe('A4')
    expect(doc.drawing.components).toHaveLength(2)
    expect(doc.drawing.components[1].y).toBeGreaterThan(doc.drawing.components[0].y + 40)
    expect(checkIntegrity(doc)).toEqual([])
  })
})

describe('layout on export', () => {
  it('the sample drawing fits an A3 sheet at 1:1, plus the bill of materials', () => {
    const plan = planExport(SAMPLE_DOCUMENT)
    expect(plan.tiles).toHaveLength(1)
    expect(plan.scale).toBe(1)
    expect(plan.bomPages).toBe(1)
    expect(plan.totalPages).toBe(2)
    expect(describePlan(plan, 'it')).toBe('1 foglio A3 · scala 1:1 · + distinta')
  })
  it('a slightly larger drawing is shrunk (auto mode)', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => { addComponent(d, 'valve.ball', 450, 120) }) // ~ 460 mm wide
    const plan = planExport(doc)
    expect(plan.tiles).toHaveLength(1)
    expect(plan.scale).toBeLessThan(1)
    expect(plan.scale).toBeGreaterThanOrEqual(0.6)
  })
  it('a very large drawing is split over several sheets without cutting symbols', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => {
      let prev: string | undefined
      for (let i = 0; i < 5; i++) {
        const c = addComponent(d, 'valve.ball', 400 + i * 100, 100 + (i % 2) * 40)
        if (prev) connectPorts(d.drawing, { componentId: prev, portId: 'b' }, { componentId: c.id, portId: 'a' }, 'oxidizer', 'Ø6 mm')
        prev = c.id
      }
    })
    const plan = planExport(doc)
    expect(plan.tiles.length).toBeGreaterThan(1)
    expect(plan.scale).toBe(1)
    const tag = (c: { x: number }) => plan.xCuts.some((cut) => Math.abs(cut - c.x) < 5.1)
    expect(doc.drawing.components.some(tag)).toBe(false) // no cut passes through a symbol
    const svgs = renderAllPages(doc, plan)
    expect(svgs).toHaveLength(plan.totalPages)
    expect(svgs.some((s) => s.includes('Foglio 2'))).toBe(true) // continuation arrows
    for (const s of svgs) { expect(s).not.toContain('NaN'); expect(s).not.toContain('undefined') }
  })
  it('"one sheet" mode always shrinks; "more sheets" never shrinks', () => {
    const big = produce(SAMPLE_DOCUMENT, (d) => { addComponent(d, 'valve.ball', 1000, 100) })
    expect(planExport(big, { ...big.export, mode: 'fit' }).tiles).toHaveLength(1)
    expect(planExport(big, { ...big.export, mode: 'fit' }).scale).toBeLessThan(0.6)
    const split = planExport(big, { ...big.export, mode: 'split' })
    expect(split.scale).toBe(1)
    expect(split.tiles.length).toBeGreaterThan(1)
  })
  it('chooseCuts respects capacity and prefers free areas', () => {
    const cuts = chooseCuts(0, 100, 40, (c) => c > 35 && c < 45, () => 0)
    for (let i = 1; i < cuts.length; i++) expect(cuts[i] - cuts[i - 1]).toBeLessThanOrEqual(40)
    expect(cuts.every((c) => !(c > 35 && c < 45))).toBe(true)
    expect(cuts[0]).toBe(0)
    expect(cuts.at(-1)).toBe(100)
  })
  it('scale text', () => { expect(scaleText(1)).toBe('1:1'); expect(scaleText(0.5)).toBe('1:2'); expect(scaleText(0.8)).toBe('1:1.25') })
  it('an empty project still produces a valid sheet', () => {
    const empty = { ...SAMPLE_DOCUMENT, drawing: { components: [], lines: [], annotations: [] } }
    const plan = planExport(empty)
    expect(plan.totalPages).toBe(1)
    expect(renderPageSvg(empty, plan, 1)).toContain('Nessun componente')
  })
})

describe('bilingual export', () => {
  const doc = SAMPLE_DOCUMENT
  const it_ = renderPageSvg(doc, planExport(doc, { ...doc.export, lang: 'it' }), 1)
  const en = renderPageSvg(doc, planExport(doc, { ...doc.export, lang: 'en' }), 1)
  it('title block and legend in the chosen language', () => {
    expect(it_).toContain('LEGENDA')
    expect(it_).toContain('Valvola a sfera')
    expect(it_).toContain('Impianto di alimentazione ossidante')
    expect(en).toContain('LEGEND')
    expect(en).toContain('Ball valve')
    expect(en).toContain('Oxidizer feed system')
    expect(en).not.toContain('LEGENDA')
  })
  it('the legend contains only what is used', () => {
    expect(it_).not.toContain('Combustibile')
    expect(it_).toContain('Ossidante')
    expect(it_).not.toContain('Giunzione')
  })
  it('the bill of materials uses the descriptions in the chosen language', () => {
    const withDesc = produce(doc, (d) => { d.drawing.components[1].description = { it: 'Intercettazione pressurizzante', en: 'Pressurant shutoff' } })
    const bomEn = renderPageSvg(withDesc, planExport(withDesc, { ...withDesc.export, lang: 'en' }), 2)
    const bomIt = renderPageSvg(withDesc, planExport(withDesc, { ...withDesc.export, lang: 'it' }), 2)
    expect(bomEn).toContain('BILL OF MATERIALS')
    expect(bomEn).toContain('Pressurant shutoff')
    expect(bomIt).toContain('DISTINTA COMPONENTI')
    expect(bomIt).toContain('Intercettazione pressurizzante')
  })
  it('well-formed SVG, without legend if turned off', () => {
    expect(it_.startsWith('<svg')).toBe(true)
    expect(it_.endsWith('</svg>')).toBe(true)
    expect(it_).not.toContain('NaN')
    const noLegend = renderPageSvg(doc, planExport(doc, { ...doc.export, legend: false }), 1)
    expect(noLegend).not.toContain('LEGENDA')
  })
})

describe('valve states per phase', () => {
  const withStates = produce(SAMPLE_DOCUMENT, (d) => {
    d.phases = [
      { id: 'p1', name: { it: 'Riempimento', en: 'Filling' } },
      { id: 'p2', name: { it: 'Accensione', en: 'Ignition' } },
    ]
    d.drawing.components[1].states = { p1: 'open', p2: 'closed' }
    d.drawing.components[4].states = { p2: 'open' }
  })
  it('adds a sheet with the states table', () => {
    const plan = planExport(withStates)
    expect(plan.statesPages).toBe(1)
    expect(plan.totalPages).toBe(plan.tiles.length + plan.bomPages + 1)
    expect(describePlan(plan, 'en')).toContain('valve states')
    const svg = renderPageSvg(withStates, plan, plan.totalPages)
    expect(svg).toContain('STATI DELLE VALVOLE PER FASE')
    expect(svg).toContain('Riempimento')
    expect(svg).toContain('●')
    expect(svg).toContain('○')
    expect(svg).toContain('BV-1')
  })
  it('without phases or with the table off there is no sheet', () => {
    expect(planExport(SAMPLE_DOCUMENT).statesPages).toBe(0)
    expect(planExport(withStates, { ...withStates.export, states: false }).statesPages).toBe(0)
  })
  it('a closed valve is drawn with a filled body', async () => {
    const { renderComponent } = await import('./render/sheet')
    const c = SAMPLE_DOCUMENT.drawing.components[1]
    expect(renderComponent(c)).toContain('fill="#fff"')
    expect(renderComponent(c, { state: 'closed' }).split('fill="#111"').length).toBeGreaterThan(renderComponent(c).split('fill="#111"').length)
  })
})
