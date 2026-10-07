import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { addComponent, connectPorts, deleteItems, nextTag, pickPortToward, rotateComponents, snap } from './edit'
import { SAMPLE_DOCUMENT } from './sample'
import { checkIntegrity } from './validate'
import { searchSymbols } from './symbols/library'
import { filterPipeSizes } from './pipeSizes'

describe('editing operations', () => {
  it('nextTag continues the numbering', () => {
    expect(nextTag(SAMPLE_DOCUMENT, 'BV')).toBe('BV-3')
    expect(nextTag(SAMPLE_DOCUMENT, 'XX')).toBe('XX-1')
  })
  it('addComponent snaps to the grid and gives a new tag', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => { addComponent(d, 'valve.ball', 92, 118) })
    const c = doc.drawing.components.at(-1)!
    expect([c.x, c.y]).toEqual([90, 120])
    expect(c.tag).toBe('BV-3')
    expect(checkIntegrity(doc)).toEqual([])
  })
  it('connectPorts rejects occupied or identical ports', () => {
    produce(SAMPLE_DOCUMENT, (d) => {
      const sh = d.drawing
      expect(connectPorts(sh, { componentId: 'c2', portId: 'a' }, { componentId: 'c7', portId: 'left' }, 'oxidizer')).toBeUndefined()
      expect(connectPorts(sh, { componentId: 'c7', portId: 'left' }, { componentId: 'c7', portId: 'left' }, 'oxidizer')).toBeUndefined()
      expect(connectPorts(sh, { componentId: 'c7', portId: 'left' }, { componentId: 'c7', portId: 'right' }, 'oxidizer', '6 mm')).toBeDefined()
    })
  })
  it('deleteItems also deletes the connected lines', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => { deleteItems(d.drawing, new Set(['c3'])) })
    expect(doc.drawing.components.some((c) => c.id === 'c3')).toBe(false)
    expect(doc.drawing.lines.every((l) => l.from.componentId !== 'c3' && l.to.componentId !== 'c3')).toBe(true)
    expect(checkIntegrity(doc)).toEqual([])
  })
  it('rotateComponents turns by 90°', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => { rotateComponents(d.drawing, new Set(['c2'])) })
    expect(doc.drawing.components[1].rotation).toBe(90)
  })
  it('snap', () => { expect(snap(7.4)).toBe(5); expect(snap(7.6)).toBe(10) })
  it('pickPortToward picks the port facing the target', () => {
    const cands = [{ p: { x: 0, y: 0 }, dir: 'N' as const }, { p: { x: 0, y: 0 }, dir: 'E' as const }]
    expect(pickPortToward(cands, { x: 20, y: 2 })?.dir).toBe('E')
    expect(pickPortToward(cands, { x: 1, y: -20 })?.dir).toBe('N')
  })
})

describe('search', () => {
  it('symbols by Italian name, English name, code and synonym', () => {
    expect(searchSymbols('sfera').map((s) => s.id)).toContain('valve.ball')
    expect(searchSymbols('relief').map((s) => s.id)).toContain('valve.relief')
    expect(searchSymbols('PSV').map((s) => s.id)).toContain('valve.relief')
    expect(searchSymbols('sfogo').map((s) => s.id)).toContain('valve.relief')
    expect(searchSymbols('valvola sol').map((s) => s.id)).toEqual(expect.arrayContaining(['valve.solenoid2', 'valve.solenoid3']))
    expect(searchSymbols('zzzz')).toEqual([])
  })
  it('sizes: filters ignoring quotes, spaces, dashes', () => {
    const flat = (q: string) => filterPipeSizes(q).flatMap((g) => g.options)
    expect(flat('an4')).toEqual(['AN-4'])
    expect(flat('1/4')).toEqual(expect.arrayContaining(['1/4" OD', '1/4" NPT']))
    expect(flat('ø6')).toContain('Ø6 mm')
    expect(flat('').length).toBeGreaterThan(50)
    expect(flat('qqq')).toEqual([])
  })
})

import { resolveSymbol, getSymbol, ACTUATORS } from './index'
import { usedIn } from './render/legend'
import { bomRows } from './render/bom'
import { worldExtent } from './scene'

describe('valve actuators', () => {
  it('the ball valve starts without an actuator, the needle valve with the handle', () => {
    expect(resolveSymbol(getSymbol('valve.ball')).actuator).toBe('none')
    expect(resolveSymbol(getSymbol('valve.needle')).actuator).toBe('manual')
  })
  it('the electric actuator extends the extent upwards and frees the side for the label', () => {
    const r = resolveSymbol(getSymbol('valve.ball'), { actuator: 'solenoid' })
    expect(r.extent.y).toBe(-5)
    expect(r.avoidSides).toContain('N')
    expect(r.prims.some((p) => p.k === 'text' && p.s === 'EV')).toBe(true)
    // the servo actuator is a circle with SV, not the solenoid valve's box
    const sv = resolveSymbol(getSymbol('valve.ball'), { actuator: 'servo' })
    expect(sv.prims.some((p) => p.k === 'text' && p.s === 'SV')).toBe(true)
    expect(sv.prims.some((p) => p.k === 'circle')).toBe(true)
    expect(sv.prims.some((p) => p.k === 'rect')).toBe(false)
  })
  it('the rest state appears as text', () => {
    const r = resolveSymbol(getSymbol('valve.ball'), { actuator: 'pneumatic', normal: 'NC' })
    expect(r.prims.some((p) => p.k === 'text' && p.s === 'NC')).toBe(true)
  })
  it('an unknown option falls back to the default', () => {
    expect(resolveSymbol(getSymbol('valve.ball'), { actuator: 'boh' }).actuator).toBe('none')
  })
  it('every actuator produces a finite extent', () => {
    for (const a of ACTUATORS) {
      const r = resolveSymbol(getSymbol('valve.globe'), { actuator: a.id })
      expect(Number.isFinite(r.extent.y) && r.extent.h > 0).toBe(true)
    }
  })
  it('the extent on the sheet accounts for the actuator', () => {
    const base = { id: 'a', symbol: 'valve.ball', tag: 'BV-1', x: 100, y: 100, rotation: 0 as const, mirror: false }
    expect(worldExtent({ ...base, props: {} }).minY).toBe(95)
    expect(worldExtent({ ...base, props: { actuator: 'solenoid' } }).minY).toBe(90)
  })
  it('the legend tells the variants apart and the bill of materials names them', () => {
    const c = (id: string, actuator?: string) => ({ id, symbol: 'valve.ball', tag: id, x: 0, y: 0, rotation: 0 as const, mirror: false, props: (actuator ? { actuator } : {}) as Record<string, string> })
    const comps = [c('a'), c('b', 'solenoid'), c('c', 'solenoid')]
    const items = usedIn(comps, [])
    expect(items.symbols).toHaveLength(2)
    expect(items.symbols.map((s) => s.name.it).sort()).toEqual(['Valvola a sfera', 'Valvola a sfera – elettrico (solenoide)'])
    const rows = bomRows({ components: comps, lines: [], annotations: [] }, 'en')
    expect(rows.find((r) => r.tag === 'b')?.type).toBe('Ball valve – solenoid')
  })
})

describe('quick disconnect', () => {
  const qd = getSymbol('fitting.qd')
  const paths = (props: Record<string, string>) => resolveSymbol(qd, props).prims.filter((p) => p.k === 'path' && p.fill === 'paper').length
  it('found when searching in Italian and in English', () => {
    for (const q of ['quick disconnect', 'quick', 'attacco rapido', 'sgancio rapido', 'QD', 'autosigillante']) {
      expect(searchSymbols(q).map((s) => s.id)).toContain('fitting.qd')
    }
  })
  it('check valves depend on the sealing option', () => {
    expect(paths({})).toBe(2)
    expect(paths({ seal: 'one' })).toBe(1)
    expect(paths({ seal: 'none' })).toBe(0)
  })
  it('disconnected moves the two halves apart', () => {
    const d = (props: Record<string, string>) => (resolveSymbol(qd, props).prims[0] as { d: string }).d
    expect(d({})).not.toBe(d({ state: 'disconnected' }))
  })
  it('ports unchanged (the connection stays valid) and no NaN', () => {
    expect(qd.ports.map((p) => p.id)).toEqual(['a', 'b'])
    for (const props of [{}, { state: 'disconnected', seal: 'none' }] as Record<string, string>[]) {
      expect(JSON.stringify(resolveSymbol(qd, props).prims)).not.toContain('NaN')
    }
  })
  it('legend and bill of materials tell the variants apart', () => {
    const c = (id: string, props: Record<string, string>) => ({ id, symbol: 'fitting.qd', tag: id, x: 0, y: 0, rotation: 0 as const, mirror: false, props })
    const comps = [c('a', {}), c('b', { state: 'disconnected' }), c('c', { seal: 'none' })]
    expect(usedIn(comps, []).symbols).toHaveLength(3)
    const names = usedIn(comps, []).symbols.map((s) => s.name.it)
    expect(names.some((n) => n.includes('scollegato'))).toBe(true)
    expect(bomRows({ components: comps, lines: [], annotations: [] }, 'en').find((r) => r.tag === 'c')?.type).toContain('no valves')
  })
})
