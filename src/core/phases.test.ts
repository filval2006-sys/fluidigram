import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { checkReport, cycleValveState, phaseValves, runChecks, setPhaseForAll, setValveState } from '.'
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
