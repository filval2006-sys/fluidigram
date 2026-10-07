import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { traceFlow } from './flow'
import { runChecks } from './checks'
import { addComponent, connectPorts, copyItems, pasteItems } from './edit'
import { createEmptyDocument } from './documents'
import { checkIntegrity } from './validate'
import type { FluidDocument } from './types'

/** pressurant tank → BV-A → junction → BV-B → oxidizer tank ; junction → BV-C → fuel tank */
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

describe('flow tracing', () => {
  it('with all valves open every line is fed by a vessel', () => {
    const { doc, ids } = plant()
    const open = setStates(doc, ids, { va: 'open', vb: 'open', vc: 'open' })
    expect(traceFlow(open, 'p1').live.size).toBe(open.drawing.lines.length)
  })
  it('a closed valve cuts off the line downstream', () => {
    const { doc, ids } = plant()
    const closed = setStates(doc, ids, { va: 'open', vb: 'closed', vc: 'open' })
    const { live } = traceFlow(closed, 'p1')
    // the vb → oxidizer tank line is attached to the tank anyway (source), but the j→vb segment is fed by tp
    expect(live.size).toBe(closed.drawing.lines.length)
  })
  it('an isolated stretch between closed valves is not fed', () => {
    const { doc, ids } = plant()
    const closed = setStates(doc, ids, { va: 'closed', vb: 'closed', vc: 'closed' })
    const r = traceFlow(closed, 'p1')
    const lineBetween = closed.drawing.lines.find((l) => l.from.componentId === ids.va && l.to.componentId === ids.j)!
    expect(r.live.has(lineBetween.id)).toBe(false) // j is connected only to closed valves: no source
  })
})

describe('oxidizer/fuel communication check', () => {
  it('reports the phase in which oxidizer and fuel are connected by open valves', () => {
    const { doc, ids } = plant()
    // the junction feeds both the oxidizer branch and, through vc, the fuel tank
    const mixed = produce(setStates(doc, ids, { va: 'open', vb: 'open', vc: 'open' }), (d) => {
      d.drawing.lines.find((l) => l.from.componentId === ids.j && l.to.componentId === ids.vb)!.fluid = 'oxidizer'
      d.drawing.lines.find((l) => l.from.componentId === ids.j && l.to.componentId === ids.vc)!.fluid = 'oxidizer'
    })
    const issue = runChecks(mixed).find((i) => i.code === 'phase-contamination')
    expect(issue?.severity).toBe('error')
    expect(issue?.message.it).toContain('Test')
  })
  it('with the fuel valve closed there is no error; incomplete phases are ignored', () => {
    const { doc, ids } = plant()
    const base = produce(doc, (d) => {
      d.drawing.lines.find((l) => l.from.componentId === ids.j && l.to.componentId === ids.vb)!.fluid = 'oxidizer'
      d.drawing.lines.find((l) => l.from.componentId === ids.j && l.to.componentId === ids.vc)!.fluid = 'oxidizer'
    })
    expect(runChecks(setStates(base, ids, { va: 'open', vb: 'open', vc: 'closed' })).some((i) => i.code === 'phase-contamination')).toBe(false)
    expect(runChecks(setStates(base, ids, { va: 'open', vb: 'open' })).some((i) => i.code === 'phase-contamination')).toBe(false)
  })
})

describe('copy and paste', () => {
  it('duplicates the components with their internal lines, new ids and tags', () => {
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
    expect(checkIntegrity(out)).toEqual([]) // no duplicate tags, valid references
    const tags = out.drawing.components.map((c) => c.tag)
    expect(new Set(tags).size).toBe(tags.length)
  })
  it('lines to components that were not copied stay out', () => {
    const { doc, ids } = plant()
    produce(doc, (d) => { expect(copyItems(d.drawing, new Set([ids.va])).lines).toHaveLength(0) })
  })
})
