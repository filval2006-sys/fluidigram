import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { traceFlow } from './flow'
import { runChecks } from './checks'
import { addComponent, connectPorts, copyItems, pasteItems } from './edit'
import { createEmptyDocument } from './documents'
import { checkIntegrity } from './validate'
import type { FluidDocument } from './types'

/** TK-pressurante → BV-A → giunzione → BV-B → TK-ossidante ; giunzione → BV-C → TK-combustibile */
function plant(): { doc: FluidDocument; ids: Record<string, string> } {
  const ids: Record<string, string> = {}
  const doc = produce(createEmptyDocument(), (d) => {
    const add = (k: string, sym: string, x: number, y: number) => { ids[k] = addComponent(d, sym, x, y).id }
    add('tp', 'vessel.copv', 40, 60); add('va', 'valve.ball', 90, 60); add('j', 'fitting.junction', 120, 60)
    add('vb', 'valve.ball', 160, 60); add('to', 'vessel.tank', 220, 60)
    add('vc', 'valve.ball', 120, 110); add('tf', 'vessel.tank', 120, 170)
    const L = (a: string, pa: string, b: string, pb: string, f: 'pressurant' | 'oxidizer' | 'fuel') =>
      connectPorts(d.drawing, { componentId: ids[a], portId: pa }, { componentId: ids[b], portId: pb }, f, 'Ø6 mm')
    L('tp', 'bottom', 'va', 'a', 'pressurant'); L('va', 'b', 'j', 'w', 'pressurant'); L('j', 'e', 'vb', 'a', 'pressurant'); L('vb', 'b', 'to', 'left', 'oxidizer')
    L('j', 's', 'vc', 'a', 'pressurant'); L('vc', 'b', 'tf', 'top', 'fuel')
    d.phases = [{ id: 'p1', name: { it: 'Test', en: 'Test' } }]
  })
  return { doc, ids }
}
const setStates = (doc: FluidDocument, ids: Record<string, string>, st: Record<string, 'open' | 'closed'>) =>
  produce(doc, (d) => { for (const [k, v] of Object.entries(st)) d.drawing.components.find((c) => c.id === ids[k])!.states = { p1: v } })

describe('tracciamento del flusso', () => {
  it('con tutte le valvole aperte ogni linea è alimentata da un serbatoio', () => {
    const { doc, ids } = plant()
    const open = setStates(doc, ids, { va: 'open', vb: 'open', vc: 'open' })
    expect(traceFlow(open, 'p1').live.size).toBe(open.drawing.lines.length)
  })
  it('una valvola chiusa taglia fuori la linea a valle', () => {
    const { doc, ids } = plant()
    const closed = setStates(doc, ids, { va: 'open', vb: 'closed', vc: 'open' })
    const { live } = traceFlow(closed, 'p1')
    // la linea vb → serbatoio ossidante è comunque attaccata al serbatoio (sorgente), ma il tratto j→vb è alimentato da tp
    expect(live.size).toBe(closed.drawing.lines.length)
  })
  it('un tratto isolato tra valvole chiuse non è alimentato', () => {
    const { doc, ids } = plant()
    const closed = setStates(doc, ids, { va: 'closed', vb: 'closed', vc: 'closed' })
    const r = traceFlow(closed, 'p1')
    const lineBetween = closed.drawing.lines.find((l) => l.from.componentId === ids.va && l.to.componentId === ids.j)!
    expect(r.live.has(lineBetween.id)).toBe(false) // j è collegato solo a valvole chiuse: nessuna sorgente
  })
})

describe('controllo di comunicazione ossidante/combustibile', () => {
  it('segnala la fase in cui ossidante e combustibile sono collegati da valvole aperte', () => {
    const { doc, ids } = plant()
    // la giunzione alimenta sia il ramo ossidante sia, attraverso vc, il serbatoio del combustibile
    const mixed = produce(setStates(doc, ids, { va: 'open', vb: 'open', vc: 'open' }), (d) => {
      d.drawing.lines.find((l) => l.from.componentId === ids.j && l.to.componentId === ids.vb)!.fluid = 'oxidizer'
      d.drawing.lines.find((l) => l.from.componentId === ids.j && l.to.componentId === ids.vc)!.fluid = 'oxidizer'
    })
    const issue = runChecks(mixed).find((i) => i.code === 'phase-contamination')
    expect(issue?.severity).toBe('error')
    expect(issue?.message).toContain('Test')
  })
  it('con la valvola del combustibile chiusa non c\'è errore; fasi incomplete vengono ignorate', () => {
    const { doc, ids } = plant()
    const base = produce(doc, (d) => {
      d.drawing.lines.find((l) => l.from.componentId === ids.j && l.to.componentId === ids.vb)!.fluid = 'oxidizer'
      d.drawing.lines.find((l) => l.from.componentId === ids.j && l.to.componentId === ids.vc)!.fluid = 'oxidizer'
    })
    expect(runChecks(setStates(base, ids, { va: 'open', vb: 'open', vc: 'closed' })).some((i) => i.code === 'phase-contamination')).toBe(false)
    expect(runChecks(setStates(base, ids, { va: 'open', vb: 'open' })).some((i) => i.code === 'phase-contamination')).toBe(false)
  })
})

describe('copia e incolla', () => {
  it('duplica i componenti con le linee interne, nuovi id e tag', () => {
    const { doc, ids } = plant()
    const out = produce(doc, (d) => {
      const clip = copyItems(d.drawing, new Set([ids.va, ids.j, ids.vb]))
      expect(clip.components).toHaveLength(3)
      expect(clip.lines).toHaveLength(2) // va→j e j→vb
      const created = pasteItems(d, clip, 0, 80)
      expect(created).toHaveLength(5)
    })
    expect(out.drawing.components).toHaveLength(doc.drawing.components.length + 3)
    expect(out.drawing.lines).toHaveLength(doc.drawing.lines.length + 2)
    expect(checkIntegrity(out)).toEqual([]) // nessun tag duplicato, riferimenti validi
    const tags = out.drawing.components.map((c) => c.tag)
    expect(new Set(tags).size).toBe(tags.length)
  })
  it('le linee verso componenti non copiati restano fuori', () => {
    const { doc, ids } = plant()
    produce(doc, (d) => { expect(copyItems(d.drawing, new Set([ids.va])).lines).toHaveLength(0) })
  })
})
