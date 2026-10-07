import { describe, expect, it } from 'vitest'
import {
  ALL_SYMBOLS, FLUID_IDS, getSymbol, renumberTags, addBomGroup, bomItems, moveBomGroup, paginateBom, removeBomGroup, renameBomGroup, setBomGrouped, setBomRowGroup, addBomExtra, bomEditorRows, pruneBom, removeBomExtra, resetBom, setBomCell, setBomHidden, replaceComponents, mountInstrument, portEnds, setPortEnd, planLabels, renderLine, addComponent, bomRows, checkIntegrity, componentPorts, connectPorts, copyItems, createEmptyDocument,
  deleteItems, freePorts, lineRoute, mirrorComponents, parseDocument, pasteItems, planExport, readDocument, renderAllPages,
  renderComponent, rotateComponents, runChecks, traceFlow, type FluidDocument,
} from './core'

/** Generatore pseudo-casuale riproducibile. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

/** Minimal XML well-formedness check (balanced tags, no control characters). */
function wellFormed(svg: string): string | null {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(svg)) return 'carattere di controllo'
  const stack: string[] = []
  const re = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(svg))) {
    const [, close, name, , self] = m
    if (self) continue
    if (close) { if (stack.pop() !== name) return `tag non bilanciato </${name}>` } else stack.push(name)
  }
  // '&' not followed by a valid entity
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(svg)) return 'ampersand non escapata'
  return stack.length ? `tag aperto: ${stack.at(-1)}` : null
}

function randomDoc(seed: number, n: number, spread: number): FluidDocument {
  const r = rng(seed)
  const doc = createEmptyDocument()
  for (let i = 0; i < n; i++) {
    const def = ALL_SYMBOLS[Math.floor(r() * ALL_SYMBOLS.length)]
    const c = addComponent(doc, def.id, (r() - 0.5) * spread, (r() - 0.5) * spread)
    c.rotation = ([0, 90, 180, 270] as const)[Math.floor(r() * 4)]
    c.mirror = r() < 0.3
    for (const o of def.options ?? []) if (r() < 0.5) c.props[o.key] = o.choices[Math.floor(r() * o.choices.length)].id
    if (def.actuatable && r() < 0.5) c.props.actuator = ['manual', 'solenoid', 'pneumatic', 'motor'][Math.floor(r() * 4)]
    if (r() < 0.3) c.props.normal = r() < 0.5 ? 'NC' : 'NO'
    if (r() < 0.4) c.description = { it: `Desc <&> "${i}"`, en: `Desc 'x' & ${i}` }
  }
  doc.phases = [{ id: 'p1', name: { it: 'Riempimento <1>', en: 'Fill & go' } }, { id: 'p2', name: { it: 'Fuoco', en: 'Burn' } }]
  for (const c of doc.drawing.components) if (r() < 0.4) c.states = { p1: r() < 0.5 ? 'open' : 'closed', p2: 'open' }
  const comps = doc.drawing.components
  for (let k = 0; k < n * 1.5; k++) {
    const a = comps[Math.floor(r() * comps.length)], b = comps[Math.floor(r() * comps.length)]
    if (a === b) continue
    const pa = freePorts(doc.drawing, a), pb = freePorts(doc.drawing, b)
    if (!pa.length || !pb.length) continue
    const id = connectPorts(
      doc.drawing, { componentId: a.id, portId: pa[Math.floor(r() * pa.length)].id }, { componentId: b.id, portId: pb[Math.floor(r() * pb.length)].id },
      FLUID_IDS[Math.floor(r() * FLUID_IDS.length)], r() < 0.5 ? '1/4" OD' : undefined,
    )
    if (id && r() < 0.3) doc.drawing.lines.find((l) => l.id === id)!.pressure = String(Math.floor(r() * 300))
  }
  return doc
}

describe('audit: random documents', () => {
  for (const [seed, n, spread] of [[1, 6, 200], [2, 25, 400], [3, 60, 900], [4, 40, 3000], [5, 12, 20], [6, 80, 1500]] as const) {
    it(`seed ${seed} (${n} parts)`, () => {
      const doc = randomDoc(seed, n, spread)
      expect(checkIntegrity(doc)).toEqual([])
      // file round-trip
      const back = parseDocument(JSON.parse(JSON.stringify(doc)))
      expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(doc)))
      // checks and flow must never throw
      const issues = runChecks(doc)
      expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length)
      for (const p of doc.phases) traceFlow(doc, p.id)
      // routing: all points are finite
      for (const l of doc.drawing.lines) {
        const pts = lineRoute(doc.drawing, l)
        expect(pts.length).toBeGreaterThanOrEqual(1)
        for (const p of pts) { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true) }
      }
      // export in all combinations
      for (const format of ['A4', 'A3', 'A2'] as const) for (const mode of ['auto', 'fit', 'split'] as const) for (const lang of ['it', 'en'] as const) {
        const settings = { ...doc.export, format, mode, lang }
        const plan = planExport(doc, settings)
        expect(plan.totalPages).toBeGreaterThanOrEqual(1)
        expect(plan.totalPages).toBeLessThan(400)
        expect(plan.scale).toBeGreaterThan(0)
        const pages = renderAllPages({ ...doc, export: settings }, plan)
        expect(pages.length).toBe(plan.totalPages)
        pages.forEach((p, i) => expect(wellFormed(p), `${format}/${mode}/${lang} pagina ${i + 1}`).toBeNull())
      }
      expect(bomRows(doc.drawing, 'it').length).toBe(doc.drawing.components.filter((c) => !c.symbol.startsWith('fitting.junction')).length)
    })
  }
})

describe('audit: edits', () => {
  it('rotation/mirror on all symbols keep the ports on the 5 mm grid', () => {
    const doc = createEmptyDocument()
    for (const def of ALL_SYMBOLS) {
      const c = addComponent(doc, def.id, 0, 0)
      for (const rot of [0, 90, 180, 270] as const) for (const mir of [false, true]) {
        c.rotation = rot; c.mirror = mir
        for (const p of componentPorts(c)) {
          expect(Math.abs(p.p.x % 5), `${def.id} ${rot}${mir}`).toBe(0)
          expect(Math.abs(p.p.y % 5), `${def.id} ${rot}${mir}`).toBe(0)
        }
      }
    }
  })

  it('copy/paste: no duplicate ids, unique tags, lines reconnected', () => {
    const doc = randomDoc(7, 30, 500)
    const ids = new Set(doc.drawing.components.map((c) => c.id))
    const clip = copyItems(doc.drawing, ids)
    pasteItems(doc, clip, 20, 20)
    pasteItems(doc, clip, 40, 40)
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('delete everything and then export an empty drawing', () => {
    const doc = randomDoc(8, 15, 300)
    deleteItems(doc.drawing, new Set([...doc.drawing.components.map((c) => c.id), ...doc.drawing.lines.map((l) => l.id)]))
    expect(doc.drawing.lines).toEqual([])
    const plan = planExport(doc)
    const pages = renderAllPages(doc, plan)
    pages.forEach((p) => expect(wellFormed(p)).toBeNull())
    expect(runChecks(doc)).toEqual([])
  })

  it('rotate and mirror repeatedly without corrupting the file', () => {
    const doc = randomDoc(9, 20, 300)
    const all = new Set(doc.drawing.components.map((c) => c.id))
    for (let i = 0; i < 5; i++) { rotateComponents(doc.drawing, all); mirrorComponents(doc.drawing, all) }
    expect(() => readDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow()
  })
})

describe('audit: damaged files', () => {
  it('rejects invalid input with an error, without crashing', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { version: 3 }, { version: 2 }, { version: 1 }, { version: 1, sheets: 'x' }]) {
      expect(() => parseDocument(bad)).toThrow()
    }
  })
  it('a file with lines to nonexistent components is rejected', () => {
    const doc = randomDoc(10, 10, 200)
    const bad = JSON.parse(JSON.stringify(doc))
    bad.drawing.lines.push({ id: 'lx', fluid: 'fuel', from: { componentId: 'nope', portId: 'a' }, to: { componentId: 'nope2', portId: 'a' } })
    expect(() => parseDocument(bad)).toThrow()
  })
  it('a file with an unknown symbol is rejected instead of breaking the canvas', () => {
    const doc = randomDoc(11, 4, 100)
    const bad = JSON.parse(JSON.stringify(doc))
    bad.drawing.components[0].symbol = 'valve.inventata'
    expect(() => parseDocument(bad)).toThrow()
  })
})

describe('sensors', () => {
  it('connect from all sides, and rotating does not turn the line that would cut through the text', () => {
    const doc = createEmptyDocument()
    const c = addComponent(doc, 'instr.pt', 0, 0)
    expect(componentPorts(c).map((p) => p.dir).sort()).toEqual(['E', 'N', 'S', 'W'])
    for (const rot of [0, 90, 180, 270] as const) {
      c.rotation = rot
      const svg = renderComponent(c)
      expect(svg).toContain('rotate(0)')
      // the old file with the "process" port stays valid
      expect(componentPorts(c).some((p) => p.id === 'process')).toBe(true)
    }
    // a single connection is enough: no open-port warning
    const t = addComponent(doc, 'vessel.tank', 40, 0)
    connectPorts(doc.drawing, { componentId: t.id, portId: 'left' }, { componentId: c.id, portId: 'right' }, 'pressurant')
    expect(runChecks(doc).filter((i) => i.code === 'open-port')).toEqual([])
  })
})

describe('labels', () => {
  it('tags do not touch lines and parts in sparse drawings, and stay at a reasonable distance in dense ones', () => {
    let touching = 0, total = 0
    for (const seed of [21, 22, 23, 24]) {
      const doc = randomDoc(seed, 14, 260)
      const lp = planLabels(doc.drawing)
      const segs: { minX: number; maxX: number; minY: number; maxY: number }[] = []
      for (const l of doc.drawing.lines) {
        const pts = lineRoute(doc.drawing, l)
        for (let i = 1; i < pts.length; i++) segs.push({ minX: Math.min(pts[i - 1].x, pts[i].x), maxX: Math.max(pts[i - 1].x, pts[i].x), minY: Math.min(pts[i - 1].y, pts[i].y), maxY: Math.max(pts[i - 1].y, pts[i].y) })
      }
      for (const c of doc.drawing.components) {
        const p = lp.tags.get(c.id)
        if (!p) continue
        const w = c.tag.length * 2.4 * 0.62, h = 2.4
        const minX = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'start' ? p.x : p.x - w
        total++
        if (segs.some((s) => minX < s.maxX && minX + w > s.minX && p.y - h / 2 < s.maxY && p.y + h / 2 > s.minY)) touching++
      }
    }
    expect(total).toBeGreaterThan(10)
    expect(touching / total).toBeLessThan(0.15)
  })
})

describe('sensor mounted on the vessel', () => {
  it('snaps to the wall without a pipe, and a vessel has several connections per side', () => {
    const doc = createEmptyDocument()
    const tank = addComponent(doc, 'vessel.tank', 0, 0) // parete destra a x=10
    const sensors = ['right-up', 'right', 'right-down'].map((id) => componentPorts(tank).find((p) => p.id === id)!)
    expect(sensors.map((p) => p.p.y)).toEqual([-10, 0, 10])
    // sensor placed one cell (5 mm) from contact (sensor's left port at x=10)
    const s = addComponent(doc, 'instr.pt', 20, -10)
    expect(mountInstrument(doc.drawing, s, 'pressurant')).toBe(true)
    const left = componentPorts(s).find((p) => p.id === 'left')!
    expect(left.p).toEqual({ x: 10, y: -10 })
    expect(doc.drawing.lines).toHaveLength(1)
    expect(lineRoute(doc.drawing, doc.drawing.lines[0])).toHaveLength(1)
    expect(renderLine(doc.drawing, doc.drawing.lines[0], true)).toContain('<circle')
    // a second sensor on the same side, other connection
    const s2 = addComponent(doc, 'instr.tt', 20, 12)
    expect(mountInstrument(doc.drawing, s2, 'pressurant')).toBe(true)
    expect(doc.drawing.lines).toHaveLength(2)
    // far away: no snapping
    const far = addComponent(doc, 'instr.pi', 80, 80)
    expect(mountInstrument(doc.drawing, far, 'pressurant')).toBe(false)
    // the two mounted ones are neither isolated nor have open ports; the far one is
    const warn = runChecks(doc).filter((i) => i.code === 'open-port' || i.code === 'isolated')
    expect(warn.map((i) => i.targets[0])).toEqual([far.id])
  })
})

describe('sensors on top and bottom', () => {
  it('mount on all top and bottom connections, also in the horizontal vessel', () => {
    const doc = createEmptyDocument()
    const tank = addComponent(doc, 'vessel.tank', 0, 0) // testa a y=-20, fondo a y=20
    const tops = componentPorts(tank).filter((p) => p.p.y === -20).map((p) => p.p.x).sort((a, b) => a - b)
    expect(tops).toEqual([-5, 0, 5])
    const up = addComponent(doc, 'instr.pt', -5, -30)
    const down = addComponent(doc, 'instr.tt', 5, 30)
    expect(mountInstrument(doc.drawing, up, 'pressurant')).toBe(true)
    expect(mountInstrument(doc.drawing, down, 'pressurant')).toBe(true)
    expect(componentPorts(up).find((p) => p.id === 'process')!.p).toEqual({ x: -5, y: -20 })
    expect(componentPorts(down).find((p) => p.id === 'top')!.p).toEqual({ x: 5, y: 20 })

    const h = addComponent(doc, 'vessel.horizontal', 60, 0)
    const ends = componentPorts(h).filter((p) => p.p.x === 40).map((p) => p.p.y).sort((a, b) => a - b)
    expect(ends).toEqual([-5, 0, 5])
    // all vessel ports sit on a 5 mm cell
    for (const c of doc.drawing.components) for (const p of componentPorts(c)) { expect(Math.abs(p.p.x % 5)).toBe(0); expect(Math.abs(p.p.y % 5)).toBe(0) }
  })
})

describe('declared ends', () => {
  it('a declared vent or external inlet raises no warnings and is cleared by connecting the port', () => {
    const doc = createEmptyDocument()
    const qd = addComponent(doc, 'fitting.qd', 0, 0)
    const v = addComponent(doc, 'valve.ball', 30, 0)
    const vent = addComponent(doc, 'valve.ball', 60, 0)
    connectPorts(doc.drawing, { componentId: qd.id, portId: componentPorts(qd)[1].id }, { componentId: v.id, portId: 'a' }, 'oxidizer')
    connectPorts(doc.drawing, { componentId: v.id, portId: 'b' }, { componentId: vent.id, portId: 'a' }, 'oxidizer')
    const open = () => runChecks(doc).filter((i) => i.code === 'open-port').map((i) => i.targets[0])
    expect(open()).toContain(qd.id)
    expect(open()).toContain(vent.id)

    const free = componentPorts(qd)[0].id
    setPortEnd(qd, free, 'in', 'N2O da GSE')
    setPortEnd(vent, 'b', 'vent')
    expect(open()).toEqual([])
    expect(renderComponent(qd)).toContain('N2O da GSE')
    expect(renderComponent(vent)).toContain('ATM')
    expect(portEnds(qd)).toHaveLength(1)
    // salvataggio e rilettura
    expect(portEnds(parseDocument(JSON.parse(JSON.stringify(doc))).drawing.components[0])).toHaveLength(1)
    // the external inlet feeds the line
    doc.phases = [{ id: 'p', name: { it: 'x', en: 'x' } }]
    expect(traceFlow(doc, 'p').live.size).toBe(2)
    // connecting the port removes the declaration
    const extra = addComponent(doc, 'valve.ball', -30, 0)
    connectPorts(doc.drawing, { componentId: qd.id, portId: free }, { componentId: extra.id, portId: 'b' }, 'oxidizer')
    expect(portEnds(doc.drawing.components.find((c) => c.id === qd.id)!)).toHaveLength(0)
  })
})

describe('recognizable instruments', () => {
  it('each instrument has a different drawing: dial for the analog ones, fixed code for the others', () => {
    const instr = ALL_SYMBOLS.filter((s) => s.category === 'instruments')
    expect(new Set(instr.map((s) => JSON.stringify(s.prims))).size).toBe(instr.length)
    const texts = (id: string) => instr.find((s) => s.id === id)!.prims.flatMap((p) => (p.k === 'text' ? [p.s] : []))
    expect(texts('instr.pt')).toContain('PT')
    expect(texts('instr.tt')).toContain('TC')
    expect(instr.find((s) => s.id === 'instr.tt')!.tagPrefix).toBe('TC')
    for (const id of ['instr.pi', 'instr.ti']) expect(instr.find((s) => s.id === id)!.prims.some((p) => p.k === 'path' && p.d.includes('L6.9,3.1'))).toBe(true) // lancetta
    // the tag sits outside the symbol
    expect(instr.every((s) => !s.labelInside)).toBe(true)
    expect(instr.find((s) => s.id === 'instr.pt')!.options!.map((o) => o.key)).toEqual(['signal', 'range'])
  })
})

describe('file compatibility', () => {
  it('an analog transducer from an earlier version reads as PT', () => {
    const doc = randomDoc(31, 6, 200)
    const raw = JSON.parse(JSON.stringify(doc))
    raw.drawing.components[0].symbol = 'instr.pta'
    raw.drawing.lines = []
    const back = parseDocument(raw)
    expect(back.drawing.components[0].symbol).toBe('instr.pt')
  })
})

describe('combustion chamber', () => {
  it('has taps for sensors and sensors mount on it directly', () => {
    const doc = createEmptyDocument()
    const cc = addComponent(doc, 'engine.chamber', 0, 0) // box 40×20 centrato: parete alta a y=-10
    const ports = componentPorts(cc)
    expect(ports.filter((p) => p.dir === 'N')).toHaveLength(3)
    expect(ports.filter((p) => p.dir === 'S')).toHaveLength(3)
    expect(ports.some((p) => p.id === 'in')).toBe(true)
    const up = addComponent(doc, 'instr.pt', -15, -20) // the sensor's low port at y=-15, tap at y=-10: one cell
    const down = addComponent(doc, 'instr.tt', -5, 20)
    expect(mountInstrument(doc.drawing, up, 'pressurant')).toBe(true)
    expect(mountInstrument(doc.drawing, down, 'pressurant')).toBe(true)
    expect(doc.drawing.lines).toHaveLength(2)
    expect(runChecks(doc).filter((i) => i.code === 'open-port' || i.code === 'isolated')).toEqual([])
  })
})

describe('component replacement', () => {
  const chain = () => {
    const doc = createEmptyDocument()
    const a = addComponent(doc, 'valve.ball', 0, 0)
    const b = addComponent(doc, 'valve.ball', 30, 0)
    const c = addComponent(doc, 'valve.ball', 60, 0)
    connectPorts(doc.drawing, { componentId: a.id, portId: 'b' }, { componentId: b.id, portId: 'a' }, 'oxidizer', '1/4" OD')
    connectPorts(doc.drawing, { componentId: b.id, portId: 'b' }, { componentId: c.id, portId: 'a' }, 'oxidizer', '1/4" OD')
    return { doc, a, b, c }
  }

  it('replaces a valve keeping position, rotation and connections, and renumbers the tag', () => {
    const { doc, b } = chain()
    b.rotation = 0
    b.props.size = '1/4" OD'
    b.props.actuator = 'manual'
    const r = replaceComponents(doc, new Set([b.id]), 'valve.check')
    expect(r.replaced).toEqual([b.id])
    const nb = doc.drawing.components.find((x) => x.id === b.id)!
    expect(nb.symbol).toBe('valve.check')
    expect(nb.x).toBe(30)
    expect(nb.props.size).toBe('1/4" OD')
    expect(nb.props.actuator).toBeUndefined() // the check valve has no actuator
    expect(nb.tag).not.toMatch(/^BV-/)
    expect(doc.drawing.lines).toHaveLength(2)
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('in a group: all selected valves, actuator kept if the new symbol allows it', () => {
    const { doc, a, b, c } = chain()
    a.props.actuator = 'solenoid'; b.props.actuator = 'manual'
    const r = replaceComponents(doc, new Set([a.id, b.id, c.id]), 'valve.globe')
    expect(r.replaced).toHaveLength(3)
    expect(doc.drawing.components.every((x) => x.symbol === 'valve.globe')).toBe(true)
    expect(doc.drawing.components.find((x) => x.id === a.id)!.props.actuator).toBe('solenoid')
    expect(new Set(doc.drawing.components.map((x) => x.tag)).size).toBe(3)
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('a hand-chosen tag does not change; an incompatible part stays as it was and is reported', () => {
    const { doc, b } = chain()
    b.tag = 'MAIN'
    replaceComponents(doc, new Set([b.id]), 'valve.solenoid2')
    expect(doc.drawing.components.find((x) => x.id === b.id)!.tag).toBe('MAIN')

    const tank = addComponent(doc, 'vessel.tank', 100, 0)
    const sensor = addComponent(doc, 'instr.pt', 130, 0)
    connectPorts(doc.drawing, { componentId: tank.id, portId: 'top' }, { componentId: sensor.id, portId: 'left' }, 'pressurant')
    const r = replaceComponents(doc, new Set([tank.id]), 'valve.ball')
    expect(r.replaced).toEqual([])
    expect(r.skipped[0].id).toBe(tank.id)
    expect(doc.drawing.components.find((x) => x.id === tank.id)!.symbol).toBe('vessel.tank')
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('random replacements between valves never break the drawing', () => {
    const valves = ALL_SYMBOLS.filter((s) => s.category === 'valves').map((s) => s.id)
    for (const seed of [41, 42, 43]) {
      const doc = randomDoc(seed, 25, 300)
      const r = rng(seed)
      for (let i = 0; i < 40; i++) {
        const comp = doc.drawing.components[Math.floor(r() * doc.drawing.components.length)]
        replaceComponents(doc, new Set([comp.id]), valves[Math.floor(r() * valves.length)])
        expect(checkIntegrity(doc), `seed ${seed} giro ${i}`).toEqual([])
      }
      expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow()
      renderAllPages(doc, planExport(doc))
    }
  })
})

describe('editable bill of materials', () => {
  const setup = () => {
    const doc = createEmptyDocument()
    const a = addComponent(doc, 'valve.ball', 0, 0)
    const b = addComponent(doc, 'valve.ball', 30, 0)
    a.description = { it: 'Intercettazione', en: 'Shutoff' }
    return { doc, a, b }
  }

  it('a hand edit wins over the drawing, per language, and going back to the drawing value removes it', () => {
    const { doc, a } = setup()
    setBomCell(doc, a.id, false, 'description', 'it', 'Mia descrizione')
    setBomCell(doc, a.id, false, 'size', 'it', '6 mm')
    expect(bomRows(doc.drawing, 'it', doc.bom).find((r) => r.tag === a.tag)!.description).toBe('Mia descrizione')
    expect(bomRows(doc.drawing, 'en', doc.bom).find((r) => r.tag === a.tag)!.description).toBe('Shutoff') // English does not change
    expect(bomRows(doc.drawing, 'en', doc.bom).find((r) => r.tag === a.tag)!.size).toBe('6 mm')
    // a field can also be emptied
    setBomCell(doc, a.id, false, 'description', 'it', '')
    expect(bomRows(doc.drawing, 'it', doc.bom).find((r) => r.tag === a.tag)!.description).toBe('')
    // rewriting the generated value = no change
    setBomCell(doc, a.id, false, 'description', 'it', 'Intercettazione')
    setBomCell(doc, a.id, false, 'size', 'it', '')
    expect(doc.bom.overrides[a.id]).toBeUndefined()
  })

  it('hidden rows and added rows, in the PDF and in the sheet count', () => {
    const { doc, a, b } = setup()
    setBomHidden(doc, b.id, true)
    const x = addBomExtra(doc)
    setBomCell(doc, x, true, 'tag', 'it', 'TB-1')
    setBomCell(doc, x, true, 'description', 'it', 'Tubo inox 1/4"')
    setBomCell(doc, x, true, 'description', 'en', 'SS tube 1/4"')
    const it = bomRows(doc.drawing, 'it', doc.bom)
    expect(it.map((r) => r.tag)).toEqual([a.tag, 'TB-1'])
    expect(bomRows(doc.drawing, 'en', doc.bom)[1].description).toBe('SS tube 1/4"')
    const pages = renderAllPages(doc, planExport(doc))
    const bomPage = pages.at(-1)!
    expect(bomPage).toContain('TB-1')
    expect(bomPage).toContain(`>${a.tag}<`)
    expect(bomPage).not.toContain(`>${b.tag}<`) // hidden from the bill of materials, but it stays in the drawing
    expect(pages[0]).toContain(`>${b.tag}<`)
    expect(bomEditorRows(doc.drawing, 'it', doc.bom).find((r) => r.id === b.id)!.hidden).toBe(true)
    removeBomExtra(doc, x)
    resetBom(doc)
    expect(bomRows(doc.drawing, 'it', doc.bom)).toHaveLength(2)
  })

  it('a long text wraps in the PDF and the file reads back identical', () => {
    const { doc, a } = setup()
    setBomCell(doc, a.id, false, 'note', 'it', 'Verificare la tenuta a 150 bar prima di ogni campagna di prove a freddo')
    const svg = renderAllPages(doc, planExport(doc)).join('')
    expect(svg).toContain('Verificare')
    expect(JSON.parse(JSON.stringify(parseDocument(JSON.parse(JSON.stringify(doc)))))).toEqual(JSON.parse(JSON.stringify(doc)))
  })

  it('deleting a component removes its edits from the bill of materials', () => {
    const { doc, a } = setup()
    setBomCell(doc, a.id, false, 'note', 'it', 'x')
    setBomHidden(doc, a.id, true)
    deleteItems(doc.drawing, new Set([a.id]))
    pruneBom(doc)
    expect(doc.bom.overrides).toEqual({})
    expect(doc.bom.hidden).toEqual([])
  })

  it('old files without the editable bill of materials open', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyDocument()))
    delete raw.bom
    expect(parseDocument(raw).bom).toEqual({ overrides: {}, hidden: [], extra: [], grouped: true, groups: [], renames: {}, order: [] })
  })
})

describe('grouped bill of materials', () => {
  const setup = () => {
    const doc = createEmptyDocument()
    const tank = addComponent(doc, 'vessel.tank', 0, 0)
    const v1 = addComponent(doc, 'valve.ball', 40, 0)
    const v2 = addComponent(doc, 'valve.ball', 80, 0)
    const pt = addComponent(doc, 'instr.pt', 120, 0)
    return { doc, tank, v1, v2, pt }
  }
  const names = (doc: ReturnType<typeof createEmptyDocument>, lang: 'it' | 'en' = 'it') => bomItems(doc.drawing, lang, doc.bom).map((i) => (i.kind === 'group' ? `# ${i.name}` : i.row.tag))

  it('by default rows are split by component type, in the order vessels, valves, instruments', () => {
    const { doc, tank, v1, v2, pt } = setup()
    expect(names(doc)).toEqual(['# Serbatoi', tank.tag, '# Valvole', v1.tag, v2.tag, '# Strumenti', pt.tag])
    expect(names(doc, 'en')[0]).toBe('# Vessels')
    setBomGrouped(doc, false)
    // without groups: a single list, by tag in natural order
    expect(names(doc)).toEqual([tank.tag, v1.tag, v2.tag, pt.tag].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
  })

  it('groups can be renamed, created, reordered and rows moved', () => {
    const { doc, v1, v2, pt } = setup()
    renameBomGroup(doc, 'cat:valves', 'it', 'Intercettazione')
    expect(names(doc)).toContain('# Intercettazione')
    expect(names(doc, 'en')).toContain('# Valves') // English does not change
    const g = addBomGroup(doc)
    renameBomGroup(doc, g, 'it', 'Linea ossidante')
    setBomRowGroup(doc, v2.id, false, g)
    setBomRowGroup(doc, pt.id, false, g)
    const n = names(doc)
    expect(n.slice(n.indexOf('# Linea ossidante'))).toEqual(['# Linea ossidante', v2.tag, pt.tag])
    expect(n).toContain(v1.tag)
    // moves the group itself up
    moveBomGroup(doc, g, -1); moveBomGroup(doc, g, -1); moveBomGroup(doc, g, -1)
    expect(names(doc)[0]).toBe('# Linea ossidante')
    // putting a row back in its type's group leaves no trace
    setBomRowGroup(doc, v2.id, false, 'cat:valves')
    expect(doc.bom.overrides[v2.id]).toBeUndefined()
    // deleting the group returns the rows to their type
    removeBomGroup(doc, g)
    expect(names(doc)).toEqual(expect.not.arrayContaining(['# Linea ossidante']))
    expect(doc.bom.overrides[pt.id]).toBeUndefined()
    expect(names(doc)).toContain('# Strumenti')
  })

  it('the PDF shows the groups, never a lone header at the bottom of the page, and counts the pages correctly', () => {
    const items = Array.from({ length: 7 }, (_, i) => (i % 3 === 0 && i < 6 ? { kind: 'group' as const, name: `G${i}`, count: 2 } : { kind: 'row' as const, row: { key: `k${i}`, tag: `T${i}`, description: '', type: '', size: '', pmax: '', note: '' } }))
    for (const per of [2, 3, 4, 5]) {
      const pages = paginateBom(items, per)
      expect(pages.flat()).toHaveLength(items.length)
      for (const pg of pages) { expect(pg.length).toBeLessThanOrEqual(per); expect(pg.at(-1)!.kind).toBe('row') }
    }
    const { doc } = setup()
    const svg = renderAllPages(doc, planExport(doc)).at(-1)!
    expect(svg).toContain('SERBATOI')
    expect(svg).toContain('VALVOLE')
    expect(svg).toContain('STRUMENTI')
    setBomGrouped(doc, false)
    expect(renderAllPages(doc, planExport(doc)).at(-1)!).not.toContain('VALVOLE')
  })

  it('hand-added rows go in the chosen group, "Other" by default', () => {
    const { doc } = setup()
    const a = addBomExtra(doc)
    const g = addBomGroup(doc)
    const b = addBomExtra(doc, g)
    setBomCell(doc, a, true, 'tag', 'it', 'TB-1')
    setBomCell(doc, b, true, 'tag', 'it', 'FT-9')
    const n = names(doc)
    expect(n.slice(-4)).toEqual(['# Altro', 'TB-1', '# Nuovo gruppo 1', 'FT-9'])
    setBomRowGroup(doc, a, true, g)
    expect(names(doc)).not.toContain('# Altro')
  })
})

describe('numbering and codes', () => {
  it('new tags start at 1 and the load cell is LC', () => {
    const doc = createEmptyDocument()
    expect(addComponent(doc, 'valve.ball', 0, 0).tag).toBe('BV-1')
    expect(addComponent(doc, 'valve.ball', 30, 0).tag).toBe('BV-2')
    const lc = addComponent(doc, 'instr.wt', 60, 0)
    expect(lc.tag).toBe('LC-1')
    expect(getSymbol('instr.wt').prims.some((p) => p.k === 'text' && p.s === 'LC')).toBe(true)
  })

  it('renumbers automatic tags from 1 (also with old codes), without touching the hand-made ones', () => {
    const doc = createEmptyDocument()
    const mk = (symbol: string, tag: string) => { const c = addComponent(doc, symbol, 0, 0); c.tag = tag; return c }
    const a = mk('valve.ball', 'BV-101'), b = mk('valve.ball', 'BV-105'), hand = mk('valve.ball', 'MAIN')
    const sv = mk('valve.solenoid2', 'SV-101'), wt = mk('instr.wt', 'WT-102'), tt = mk('instr.tt', 'TT-101')
    expect(renumberTags(doc)).toBe(5)
    expect([a.tag, b.tag, hand.tag, sv.tag, wt.tag, tt.tag]).toEqual(['BV-1', 'BV-2', 'MAIN', 'EV-1', 'LC-1', 'TC-1'])
    expect(renumberTags(doc)).toBe(0) // already in place
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('a hand-made tag already equal to a free number creates no duplicates', () => {
    const doc = createEmptyDocument()
    const a = addComponent(doc, 'valve.ball', 0, 0); a.tag = 'BV-5'
    const b = addComponent(doc, 'valve.ball', 30, 0); b.tag = 'BV-9'
    renumberTags(doc)
    expect(new Set(doc.drawing.components.map((c) => c.tag)).size).toBe(2)
    expect(doc.drawing.components.map((c) => c.tag)).toEqual(['BV-1', 'BV-2'])
  })
})
