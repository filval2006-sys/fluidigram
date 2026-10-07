import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { checkReport, cycleValveState, phasePageCount, phaseValves, renderPhasePages, runChecks, setPhaseForAll, setValveState } from '.'
import { addComponent } from './edit'
import { createEmptyDocument } from './documents'

const withValves = () => produce(createEmptyDocument(), (d) => {
  addComponent(d, 'valve.ball', 40, 40)
  addComponent(d, 'valve.ball', 120, 40)
  d.phases = [{ id: 'p1', name: { it: 'Riempimento', en: 'Filling' } }, { id: 'p2', name: { it: 'Burn', en: 'Burn' } }]
})

describe('valve states per phase', () => {
  it('a click cycles: unspecified → closed → open → unspecified', () => {
    const doc = withValves()
    const id = doc.drawing.components[0].id
    const states = (d: typeof doc) => d.drawing.components[0].states?.p1
    const a = produce(doc, (d) => cycleValveState(d, id, 'p1'))
    const b = produce(a, (d) => cycleValveState(d, id, 'p1'))
    const c = produce(b, (d) => cycleValveState(d, id, 'p1'))
    expect([states(a), states(b), states(c)]).toEqual(['closed', 'open', undefined])
    expect(c.drawing.components[0].states).toBeUndefined()
  })

  it('sets a state on all valves and removes it', () => {
    const doc = withValves()
    const ids = phaseValves(doc.drawing).map((v) => v.id)
    const all = produce(doc, (d) => setPhaseForAll(d, ids, 'p2', 'closed'))
    expect(all.drawing.components.every((c) => c.states?.p2 === 'closed')).toBe(true)
    const none = produce(all, (d) => setPhaseForAll(d, ids, 'p2', undefined))
    expect(none.drawing.components.every((c) => !c.states)).toBe(true)
    // a nonexistent valve does no harm
    expect(() => produce(doc, (d) => setValveState(d, 'nope', 'p1', 'open'))).not.toThrow()
  })

  it('valves without a state in a phase are a warning of the Operation step, not of the drawing', () => {
    const doc = withValves()
    const op = checkReport(doc, { scope: 'operation' }).issues.filter((i) => i.code === 'phase-incomplete')
    expect(op).toHaveLength(2)
    expect(op[0].message.it).toContain('2 valvole senza stato')
    expect(op[0].message.en).toContain('2 valves without a state')
    expect(checkReport(doc, { scope: 'design' }).issues.some((i) => i.code === 'phase-incomplete')).toBe(false)
    const filled = produce(doc, (d) => { for (const c of d.drawing.components) c.states = { p1: 'closed', p2: 'open' } })
    expect(runChecks(filled).some((i) => i.code === 'phase-incomplete')).toBe(false)
  })
})

describe('phases document (PDF)', () => {
  const build = (nValves: number, lang: 'it' | 'en' = 'it') => produce(createEmptyDocument(), (d) => {
    for (let i = 0; i < nValves; i++) addComponent(d, 'valve.ball', 40 + (i % 10) * 30, 40 + Math.floor(i / 10) * 30)
    d.phases = [{ id: 'p1', name: { it: 'Riempimento', en: 'Filling' } }, { id: 'p2', name: { it: 'Combustione', en: 'Burn' } }]
    d.drawing.components.forEach((c, i) => { c.states = { p1: i % 2 ? 'open' : 'closed' } })
    d.export.lang = lang
  })

  it('one page per phase plus the summary table, with the state written out', () => {
    const doc = build(4)
    const pages = renderPhasePages(doc)
    expect(pages).toHaveLength(phasePageCount(doc))
    expect(pages).toHaveLength(3)
    expect(pages[0]).toContain('Riempimento')
    expect(pages[0]).toContain('APERTA')
    expect(pages[0]).toContain('CHIUSA')
    expect(pages[1]).toContain('NON SPECIF.')
    expect(pages[1]).toContain('non specificate')
    expect(pages[1]).toContain('>4<')
    expect(pages[2]).toContain('Stati delle valvole per fase'.toUpperCase())
  })

  it('in English, texts and badges change language', () => {
    const pages = renderPhasePages(build(2, 'en'))
    expect(pages[0]).toContain('OPEN')
    expect(pages[0]).toContain('Phase 1/2: Filling')
    expect(pages[0]).not.toContain('APERTA')
  })

  it('many valves: the table continues on other sheets, without losing any', () => {
    const doc = build(60)
    const pages = renderPhasePages(doc)
    expect(pages.length).toBeGreaterThan(3)
    for (const tag of doc.drawing.components.map((c) => c.tag)) expect(pages.some((p) => p.includes(`>${tag}<`))).toBe(true)
    expect(pages.some((p) => p.includes('(segue)'))).toBe(true)
  })

  it('without phases a single sheet with a notice comes out', () => {
    const doc = produce(build(2), (d) => { d.phases = [] })
    const pages = renderPhasePages(doc)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toContain('Nessuna fase definita')
  })

  it('an empty diagram or phases without valves raise no errors', () => {
    expect(() => renderPhasePages(produce(createEmptyDocument(), (d) => { d.phases = [{ id: 'x', name: { it: 'A', en: 'A' } }] }))).not.toThrow()
  })
})
