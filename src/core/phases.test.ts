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

describe('stato delle valvole per fase', () => {
  it('il clic alterna: non specificato → chiusa → aperta → non specificato', () => {
    const doc = withValves()
    const id = doc.drawing.components[0].id
    const states = (d: typeof doc) => d.drawing.components[0].states?.p1
    const a = produce(doc, (d) => cycleValveState(d, id, 'p1'))
    const b = produce(a, (d) => cycleValveState(d, id, 'p1'))
    const c = produce(b, (d) => cycleValveState(d, id, 'p1'))
    expect([states(a), states(b), states(c)]).toEqual(['closed', 'open', undefined])
    expect(c.drawing.components[0].states).toBeUndefined()
  })

  it('imposta uno stato a tutte le valvole e lo toglie', () => {
    const doc = withValves()
    const ids = phaseValves(doc.drawing).map((v) => v.id)
    const all = produce(doc, (d) => setPhaseForAll(d, ids, 'p2', 'closed'))
    expect(all.drawing.components.every((c) => c.states?.p2 === 'closed')).toBe(true)
    const none = produce(all, (d) => setPhaseForAll(d, ids, 'p2', undefined))
    expect(none.drawing.components.every((c) => !c.states)).toBe(true)
    // una valvola inesistente non fa danni
    expect(() => produce(doc, (d) => setValveState(d, 'nope', 'p1', 'open'))).not.toThrow()
  })

  it('le valvole senza stato in una fase sono un avviso del passo «Funzionamento», non del disegno', () => {
    const doc = withValves()
    const op = checkReport(doc, { scope: 'operation' }).issues.filter((i) => i.code === 'phase-incomplete')
    expect(op).toHaveLength(2)
    expect(op[0].message).toContain('2 valvole senza stato')
    expect(checkReport(doc, { scope: 'design' }).issues.some((i) => i.code === 'phase-incomplete')).toBe(false)
    const filled = produce(doc, (d) => { for (const c of d.drawing.components) c.states = { p1: 'closed', p2: 'open' } })
    expect(runChecks(filled).some((i) => i.code === 'phase-incomplete')).toBe(false)
  })
})

describe('documento delle fasi (PDF)', () => {
  const build = (nValves: number, lang: 'it' | 'en' = 'it') => produce(createEmptyDocument(), (d) => {
    for (let i = 0; i < nValves; i++) addComponent(d, 'valve.ball', 40 + (i % 10) * 30, 40 + Math.floor(i / 10) * 30)
    d.phases = [{ id: 'p1', name: { it: 'Riempimento', en: 'Filling' } }, { id: 'p2', name: { it: 'Combustione', en: 'Burn' } }]
    d.drawing.components.forEach((c, i) => { c.states = { p1: i % 2 ? 'open' : 'closed' } })
    d.export.lang = lang
  })

  it('una pagina per fase più la tabella riassuntiva, con lo stato scritto', () => {
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

  it('in inglese testi e pallini cambiano lingua', () => {
    const pages = renderPhasePages(build(2, 'en'))
    expect(pages[0]).toContain('OPEN')
    expect(pages[0]).toContain('Phase 1/2: Filling')
    expect(pages[0]).not.toContain('APERTA')
  })

  it('tante valvole: la tabella continua su altri fogli, senza perderne', () => {
    const doc = build(60)
    const pages = renderPhasePages(doc)
    expect(pages.length).toBeGreaterThan(3)
    for (const tag of doc.drawing.components.map((c) => c.tag)) expect(pages.some((p) => p.includes(`>${tag}<`))).toBe(true)
    expect(pages.some((p) => p.includes('(segue)'))).toBe(true)
  })

  it('senza fasi esce un solo foglio con un avviso', () => {
    const doc = produce(build(2), (d) => { d.phases = [] })
    const pages = renderPhasePages(doc)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toContain('Nessuna fase definita')
  })

  it('schema vuoto o con fasi senza valvole non fa errori', () => {
    expect(() => renderPhasePages(produce(createEmptyDocument(), (d) => { d.phases = [{ id: 'x', name: { it: 'A', en: 'A' } }] }))).not.toThrow()
  })
})
