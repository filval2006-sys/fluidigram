import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { addComponent, connectPorts, deleteItems, nextTag, pickPortToward, rotateComponents, snap } from './edit'
import { SAMPLE_DOCUMENT } from './sample'
import { checkIntegrity } from './validate'
import { searchSymbols } from './symbols/library'
import { filterPipeSizes } from './pipeSizes'

describe('operazioni di modifica', () => {
  it('nextTag continua la numerazione', () => {
    expect(nextTag(SAMPLE_DOCUMENT, 'BV')).toBe('BV-3')
    expect(nextTag(SAMPLE_DOCUMENT, 'XX')).toBe('XX-1')
  })
  it('addComponent aggancia alla griglia e dà un tag nuovo', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => { addComponent(d, 'valve.ball', 92, 118) })
    const c = doc.drawing.components.at(-1)!
    expect([c.x, c.y]).toEqual([90, 120])
    expect(c.tag).toBe('BV-3')
    expect(checkIntegrity(doc)).toEqual([])
  })
  it('connectPorts rifiuta porte occupate o uguali', () => {
    produce(SAMPLE_DOCUMENT, (d) => {
      const sh = d.drawing
      expect(connectPorts(sh, { componentId: 'c2', portId: 'a' }, { componentId: 'c7', portId: 'left' }, 'oxidizer')).toBeUndefined()
      expect(connectPorts(sh, { componentId: 'c7', portId: 'left' }, { componentId: 'c7', portId: 'left' }, 'oxidizer')).toBeUndefined()
      expect(connectPorts(sh, { componentId: 'c7', portId: 'left' }, { componentId: 'c7', portId: 'right' }, 'oxidizer', '6 mm')).toBeDefined()
    })
  })
  it('deleteItems elimina anche le linee collegate', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => { deleteItems(d.drawing, new Set(['c3'])) })
    expect(doc.drawing.components.some((c) => c.id === 'c3')).toBe(false)
    expect(doc.drawing.lines.every((l) => l.from.componentId !== 'c3' && l.to.componentId !== 'c3')).toBe(true)
    expect(checkIntegrity(doc)).toEqual([])
  })
  it('rotateComponents gira di 90°', () => {
    const doc = produce(SAMPLE_DOCUMENT, (d) => { rotateComponents(d.drawing, new Set(['c2'])) })
    expect(doc.drawing.components[1].rotation).toBe(90)
  })
  it('snap', () => { expect(snap(7.4)).toBe(5); expect(snap(7.6)).toBe(10) })
  it('pickPortToward sceglie la porta rivolta verso il bersaglio', () => {
    const cands = [{ p: { x: 0, y: 0 }, dir: 'N' as const }, { p: { x: 0, y: 0 }, dir: 'E' as const }]
    expect(pickPortToward(cands, { x: 20, y: 2 })?.dir).toBe('E')
    expect(pickPortToward(cands, { x: 1, y: -20 })?.dir).toBe('N')
  })
})

describe('ricerca', () => {
  it('simboli per nome italiano, inglese, sigla e sinonimo', () => {
    expect(searchSymbols('sfera').map((s) => s.id)).toContain('valve.ball')
    expect(searchSymbols('relief').map((s) => s.id)).toContain('valve.relief')
    expect(searchSymbols('PSV').map((s) => s.id)).toContain('valve.relief')
    expect(searchSymbols('sfogo').map((s) => s.id)).toContain('valve.relief')
    expect(searchSymbols('valvola sol').map((s) => s.id)).toEqual(expect.arrayContaining(['valve.solenoid2', 'valve.solenoid3']))
    expect(searchSymbols('zzzz')).toEqual([])
  })
  it('diametri: filtra ignorando virgolette, spazi, trattini', () => {
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

describe('azionamenti delle valvole', () => {
  it('la sfera parte senza azionamento, lo spillo con la maniglia', () => {
    expect(resolveSymbol(getSymbol('valve.ball')).actuator).toBe('none')
    expect(resolveSymbol(getSymbol('valve.needle')).actuator).toBe('manual')
  })
  it('l\'azionamento elettrico estende l\'ingombro verso l\'alto e libera il lato per l\'etichetta', () => {
    const r = resolveSymbol(getSymbol('valve.ball'), { actuator: 'solenoid' })
    expect(r.extent.y).toBe(-5)
    expect(r.avoidSides).toContain('N')
    expect(r.prims.some((p) => p.k === 'text' && p.s === 'EV')).toBe(true)
    // il servoazionamento è un cerchio con SV, non il riquadro dell'elettrovalvola
    const sv = resolveSymbol(getSymbol('valve.ball'), { actuator: 'servo' })
    expect(sv.prims.some((p) => p.k === 'text' && p.s === 'SV')).toBe(true)
    expect(sv.prims.some((p) => p.k === 'circle')).toBe(true)
    expect(sv.prims.some((p) => p.k === 'rect')).toBe(false)
  })
  it('lo stato a riposo compare come testo', () => {
    const r = resolveSymbol(getSymbol('valve.ball'), { actuator: 'pneumatic', normal: 'NC' })
    expect(r.prims.some((p) => p.k === 'text' && p.s === 'NC')).toBe(true)
  })
  it('un\'opzione sconosciuta ricade sul default', () => {
    expect(resolveSymbol(getSymbol('valve.ball'), { actuator: 'boh' }).actuator).toBe('none')
  })
  it('ogni azionamento produce un ingombro finito', () => {
    for (const a of ACTUATORS) {
      const r = resolveSymbol(getSymbol('valve.globe'), { actuator: a.id })
      expect(Number.isFinite(r.extent.y) && r.extent.h > 0).toBe(true)
    }
  })
  it('l\'ingombro nel foglio tiene conto dell\'azionamento', () => {
    const base = { id: 'a', symbol: 'valve.ball', tag: 'BV-1', x: 100, y: 100, rotation: 0 as const, mirror: false }
    expect(worldExtent({ ...base, props: {} }).minY).toBe(95)
    expect(worldExtent({ ...base, props: { actuator: 'solenoid' } }).minY).toBe(90)
  })
  it('la legenda distingue le varianti e la distinta le nomina', () => {
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
  it('si trova cercando in italiano e in inglese', () => {
    for (const q of ['quick disconnect', 'quick', 'attacco rapido', 'sgancio rapido', 'QD', 'autosigillante']) {
      expect(searchSymbols(q).map((s) => s.id)).toContain('fitting.qd')
    }
  })
  it('le valvole di ritegno dipendono dall\'opzione di tenuta', () => {
    expect(paths({})).toBe(2)
    expect(paths({ seal: 'one' })).toBe(1)
    expect(paths({ seal: 'none' })).toBe(0)
  })
  it('scollegato allontana le due metà', () => {
    const d = (props: Record<string, string>) => (resolveSymbol(qd, props).prims[0] as { d: string }).d
    expect(d({})).not.toBe(d({ state: 'disconnected' }))
  })
  it('porte invariate (il collegamento resta valido) e nessun NaN', () => {
    expect(qd.ports.map((p) => p.id)).toEqual(['a', 'b'])
    for (const props of [{}, { state: 'disconnected', seal: 'none' }] as Record<string, string>[]) {
      expect(JSON.stringify(resolveSymbol(qd, props).prims)).not.toContain('NaN')
    }
  })
  it('legenda e distinta distinguono le varianti', () => {
    const c = (id: string, props: Record<string, string>) => ({ id, symbol: 'fitting.qd', tag: id, x: 0, y: 0, rotation: 0 as const, mirror: false, props })
    const comps = [c('a', {}), c('b', { state: 'disconnected' }), c('c', { seal: 'none' })]
    expect(usedIn(comps, []).symbols).toHaveLength(3)
    const names = usedIn(comps, []).symbols.map((s) => s.name.it)
    expect(names.some((n) => n.includes('scollegato'))).toBe(true)
    expect(bomRows({ components: comps, lines: [], annotations: [] }, 'en').find((r) => r.tag === 'c')?.type).toContain('no valves')
  })
})
