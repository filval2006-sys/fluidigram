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

/** Controllo minimale di buona formazione XML (tag bilanciati, nessun carattere di controllo). */
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
  // '&' non seguita da un'entità valida
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

describe('audit: documenti casuali', () => {
  for (const [seed, n, spread] of [[1, 6, 200], [2, 25, 400], [3, 60, 900], [4, 40, 3000], [5, 12, 20], [6, 80, 1500]] as const) {
    it(`seed ${seed} (${n} pezzi)`, () => {
      const doc = randomDoc(seed, n, spread)
      expect(checkIntegrity(doc)).toEqual([])
      // round-trip del file
      const back = parseDocument(JSON.parse(JSON.stringify(doc)))
      expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(doc)))
      // controlli e flusso non devono mai lanciare
      const issues = runChecks(doc)
      expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length)
      for (const p of doc.phases) traceFlow(doc, p.id)
      // instradamento: tutti i punti finiti
      for (const l of doc.drawing.lines) {
        const pts = lineRoute(doc.drawing, l)
        expect(pts.length).toBeGreaterThanOrEqual(1)
        for (const p of pts) { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true) }
      }
      // esportazione in tutte le combinazioni
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

describe('audit: modifiche', () => {
  it('rotazione/specchio su tutti i simboli mantengono le porte sulla griglia da 5 mm', () => {
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

  it('copia/incolla: nessun id duplicato, tag unici, linee ricollegate', () => {
    const doc = randomDoc(7, 30, 500)
    const ids = new Set(doc.drawing.components.map((c) => c.id))
    const clip = copyItems(doc.drawing, ids)
    pasteItems(doc, clip, 20, 20)
    pasteItems(doc, clip, 40, 40)
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('elimina tutto e poi esporta un disegno vuoto', () => {
    const doc = randomDoc(8, 15, 300)
    deleteItems(doc.drawing, new Set([...doc.drawing.components.map((c) => c.id), ...doc.drawing.lines.map((l) => l.id)]))
    expect(doc.drawing.lines).toEqual([])
    const plan = planExport(doc)
    const pages = renderAllPages(doc, plan)
    pages.forEach((p) => expect(wellFormed(p)).toBeNull())
    expect(runChecks(doc)).toEqual([])
  })

  it('ruota e specchia ripetutamente senza corrompere il file', () => {
    const doc = randomDoc(9, 20, 300)
    const all = new Set(doc.drawing.components.map((c) => c.id))
    for (let i = 0; i < 5; i++) { rotateComponents(doc.drawing, all); mirrorComponents(doc.drawing, all) }
    expect(() => readDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow()
  })
})

describe('audit: file danneggiati', () => {
  it('rifiuta con un errore, senza crash, input non validi', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { version: 3 }, { version: 2 }, { version: 1 }, { version: 1, sheets: 'x' }]) {
      expect(() => parseDocument(bad)).toThrow()
    }
  })
  it('un file con linee verso componenti inesistenti viene respinto', () => {
    const doc = randomDoc(10, 10, 200)
    const bad = JSON.parse(JSON.stringify(doc))
    bad.drawing.lines.push({ id: 'lx', fluid: 'fuel', from: { componentId: 'nope', portId: 'a' }, to: { componentId: 'nope2', portId: 'a' } })
    expect(() => parseDocument(bad)).toThrow()
  })
  it('un file con simbolo sconosciuto viene respinto invece di rompere la tela', () => {
    const doc = randomDoc(11, 4, 100)
    const bad = JSON.parse(JSON.stringify(doc))
    bad.drawing.components[0].symbol = 'valve.inventata'
    expect(() => parseDocument(bad)).toThrow()
  })
})

describe('sensori', () => {
  it('si collegano da tutti i lati e ruotando non ruota la riga che taglierebbe la scritta', () => {
    const doc = createEmptyDocument()
    const c = addComponent(doc, 'instr.pt', 0, 0)
    expect(componentPorts(c).map((p) => p.dir).sort()).toEqual(['E', 'N', 'S', 'W'])
    for (const rot of [0, 90, 180, 270] as const) {
      c.rotation = rot
      const svg = renderComponent(c)
      expect(svg).toContain('rotate(0)')
      // il vecchio file con la porta "process" resta valido
      expect(componentPorts(c).some((p) => p.id === 'process')).toBe(true)
    }
    // un solo collegamento basta: nessun avviso di porta aperta
    const t = addComponent(doc, 'vessel.tank', 40, 0)
    connectPorts(doc.drawing, { componentId: t.id, portId: 'left' }, { componentId: c.id, portId: 'right' }, 'pressurant')
    expect(runChecks(doc).filter((i) => i.code === 'open-port')).toEqual([])
  })
})

describe('etichette', () => {
  it('i tag non toccano linee e pezzi nei disegni radi, e restano a distanza ragionevole nei fitti', () => {
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

describe('sensore montato sul serbatoio', () => {
  it('si aggancia alla parete senza tubo, e un serbatoio ha più attacchi per lato', () => {
    const doc = createEmptyDocument()
    const tank = addComponent(doc, 'vessel.tank', 0, 0) // parete destra a x=10
    const sensors = ['right-up', 'right', 'right-down'].map((id) => componentPorts(tank).find((p) => p.id === id)!)
    expect(sensors.map((p) => p.p.y)).toEqual([-10, 0, 10])
    // sensore posato a una cella (5 mm) dal contatto (porta sinistra del sensore su x=10)
    const s = addComponent(doc, 'instr.pt', 20, -10)
    expect(mountInstrument(doc.drawing, s, 'pressurant')).toBe(true)
    const left = componentPorts(s).find((p) => p.id === 'left')!
    expect(left.p).toEqual({ x: 10, y: -10 })
    expect(doc.drawing.lines).toHaveLength(1)
    expect(lineRoute(doc.drawing, doc.drawing.lines[0])).toHaveLength(1)
    expect(renderLine(doc.drawing, doc.drawing.lines[0], true)).toContain('<circle')
    // un secondo sensore sullo stesso lato, altro attacco
    const s2 = addComponent(doc, 'instr.tt', 20, 12)
    expect(mountInstrument(doc.drawing, s2, 'pressurant')).toBe(true)
    expect(doc.drawing.lines).toHaveLength(2)
    // lontano: nessun aggancio
    const far = addComponent(doc, 'instr.pi', 80, 80)
    expect(mountInstrument(doc.drawing, far, 'pressurant')).toBe(false)
    // i due montati non risultano isolati né con porte aperte; quello lontano sì
    const warn = runChecks(doc).filter((i) => i.code === 'open-port' || i.code === 'isolated')
    expect(warn.map((i) => i.targets[0])).toEqual([far.id])
  })
})

describe('sensori sopra e sotto', () => {
  it('si montano su tutti gli attacchi di testa e di fondo, anche nel serbatoio orizzontale', () => {
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
    // tutte le porte dei recipienti stanno su una cella da 5 mm
    for (const c of doc.drawing.components) for (const p of componentPorts(c)) { expect(Math.abs(p.p.x % 5)).toBe(0); expect(Math.abs(p.p.y % 5)).toBe(0) }
  })
})

describe('estremità dichiarate', () => {
  it('uno sfiato o un ingresso esterno dichiarati non generano avvisi e si cancellano collegando la porta', () => {
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
    // l'ingresso esterno alimenta la linea
    doc.phases = [{ id: 'p', name: { it: 'x', en: 'x' } }]
    expect(traceFlow(doc, 'p').live.size).toBe(2)
    // collegare la porta toglie la dichiarazione
    const extra = addComponent(doc, 'valve.ball', -30, 0)
    connectPorts(doc.drawing, { componentId: qd.id, portId: free }, { componentId: extra.id, portId: 'b' }, 'oxidizer')
    expect(portEnds(doc.drawing.components.find((c) => c.id === qd.id)!)).toHaveLength(0)
  })
})

describe('strumenti riconoscibili', () => {
  it('ogni strumento ha un disegno diverso: quadrante per gli analogici, sigla fissa per gli altri', () => {
    const instr = ALL_SYMBOLS.filter((s) => s.category === 'instruments')
    expect(new Set(instr.map((s) => JSON.stringify(s.prims))).size).toBe(instr.length)
    const texts = (id: string) => instr.find((s) => s.id === id)!.prims.flatMap((p) => (p.k === 'text' ? [p.s] : []))
    expect(texts('instr.pt')).toContain('PT')
    expect(texts('instr.tt')).toContain('TC')
    expect(instr.find((s) => s.id === 'instr.tt')!.tagPrefix).toBe('TC')
    for (const id of ['instr.pi', 'instr.ti']) expect(instr.find((s) => s.id === id)!.prims.some((p) => p.k === 'path' && p.d.includes('L6.9,3.1'))).toBe(true) // lancetta
    // il tag sta fuori dal simbolo
    expect(instr.every((s) => !s.labelInside)).toBe(true)
    expect(instr.find((s) => s.id === 'instr.pt')!.options!.map((o) => o.key)).toEqual(['signal', 'range'])
  })
})

describe('compatibilità dei file', () => {
  it('un trasduttore analogico di una versione precedente si legge come PT', () => {
    const doc = randomDoc(31, 6, 200)
    const raw = JSON.parse(JSON.stringify(doc))
    raw.drawing.components[0].symbol = 'instr.pta'
    raw.drawing.lines = []
    const back = parseDocument(raw)
    expect(back.drawing.components[0].symbol).toBe('instr.pt')
  })
})

describe('camera di combustione', () => {
  it('ha prese per i sensori e i sensori vi si montano direttamente', () => {
    const doc = createEmptyDocument()
    const cc = addComponent(doc, 'engine.chamber', 0, 0) // box 40×20 centrato: parete alta a y=-10
    const ports = componentPorts(cc)
    expect(ports.filter((p) => p.dir === 'N')).toHaveLength(3)
    expect(ports.filter((p) => p.dir === 'S')).toHaveLength(3)
    expect(ports.some((p) => p.id === 'in')).toBe(true)
    const up = addComponent(doc, 'instr.pt', -15, -20) // porta bassa del sensore a y=-15, presa a y=-10: una cella
    const down = addComponent(doc, 'instr.tt', -5, 20)
    expect(mountInstrument(doc.drawing, up, 'pressurant')).toBe(true)
    expect(mountInstrument(doc.drawing, down, 'pressurant')).toBe(true)
    expect(doc.drawing.lines).toHaveLength(2)
    expect(runChecks(doc).filter((i) => i.code === 'open-port' || i.code === 'isolated')).toEqual([])
  })
})

describe('sostituzione di componenti', () => {
  const chain = () => {
    const doc = createEmptyDocument()
    const a = addComponent(doc, 'valve.ball', 0, 0)
    const b = addComponent(doc, 'valve.ball', 30, 0)
    const c = addComponent(doc, 'valve.ball', 60, 0)
    connectPorts(doc.drawing, { componentId: a.id, portId: 'b' }, { componentId: b.id, portId: 'a' }, 'oxidizer', '1/4" OD')
    connectPorts(doc.drawing, { componentId: b.id, portId: 'b' }, { componentId: c.id, portId: 'a' }, 'oxidizer', '1/4" OD')
    return { doc, a, b, c }
  }

  it('sostituisce una valvola tenendo posizione, rotazione e collegamenti, e rinumera il tag', () => {
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
    expect(nb.props.actuator).toBeUndefined() // la valvola di ritegno non ha azionamento
    expect(nb.tag).not.toMatch(/^BV-/)
    expect(doc.drawing.lines).toHaveLength(2)
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('in gruppo: tutte le valvole selezionate, azionamento mantenuto se il nuovo simbolo lo ammette', () => {
    const { doc, a, b, c } = chain()
    a.props.actuator = 'solenoid'; b.props.actuator = 'manual'
    const r = replaceComponents(doc, new Set([a.id, b.id, c.id]), 'valve.globe')
    expect(r.replaced).toHaveLength(3)
    expect(doc.drawing.components.every((x) => x.symbol === 'valve.globe')).toBe(true)
    expect(doc.drawing.components.find((x) => x.id === a.id)!.props.actuator).toBe('solenoid')
    expect(new Set(doc.drawing.components.map((x) => x.tag)).size).toBe(3)
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('un tag scelto a mano non cambia; un pezzo incompatibile resta com\'era e viene segnalato', () => {
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

  it('sostituzioni casuali tra valvole non rompono mai il disegno', () => {
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

describe('distinta modificabile', () => {
  const setup = () => {
    const doc = createEmptyDocument()
    const a = addComponent(doc, 'valve.ball', 0, 0)
    const b = addComponent(doc, 'valve.ball', 30, 0)
    a.description = { it: 'Intercettazione', en: 'Shutoff' }
    return { doc, a, b }
  }

  it('una modifica a mano vince sul disegno, per lingua, e tornare al valore del disegno la toglie', () => {
    const { doc, a } = setup()
    setBomCell(doc, a.id, false, 'description', 'it', 'Mia descrizione')
    setBomCell(doc, a.id, false, 'size', 'it', '6 mm')
    expect(bomRows(doc.drawing, 'it', doc.bom).find((r) => r.tag === a.tag)!.description).toBe('Mia descrizione')
    expect(bomRows(doc.drawing, 'en', doc.bom).find((r) => r.tag === a.tag)!.description).toBe('Shutoff') // l'inglese non cambia
    expect(bomRows(doc.drawing, 'en', doc.bom).find((r) => r.tag === a.tag)!.size).toBe('6 mm')
    // si può anche svuotare un campo
    setBomCell(doc, a.id, false, 'description', 'it', '')
    expect(bomRows(doc.drawing, 'it', doc.bom).find((r) => r.tag === a.tag)!.description).toBe('')
    // riscrivere il valore generato = nessuna modifica
    setBomCell(doc, a.id, false, 'description', 'it', 'Intercettazione')
    setBomCell(doc, a.id, false, 'size', 'it', '')
    expect(doc.bom.overrides[a.id]).toBeUndefined()
  })

  it('righe nascoste e righe aggiunte, nel PDF e nel conteggio dei fogli', () => {
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
    expect(bomPage).not.toContain(`>${b.tag}<`) // nascosta dalla distinta, ma resta nel disegno
    expect(pages[0]).toContain(`>${b.tag}<`)
    expect(bomEditorRows(doc.drawing, 'it', doc.bom).find((r) => r.id === b.id)!.hidden).toBe(true)
    removeBomExtra(doc, x)
    resetBom(doc)
    expect(bomRows(doc.drawing, 'it', doc.bom)).toHaveLength(2)
  })

  it('un testo lungo va a capo nel PDF e il file si rilegge identico', () => {
    const { doc, a } = setup()
    setBomCell(doc, a.id, false, 'note', 'it', 'Verificare la tenuta a 150 bar prima di ogni campagna di prove a freddo')
    const svg = renderAllPages(doc, planExport(doc)).join('')
    expect(svg).toContain('Verificare')
    expect(JSON.parse(JSON.stringify(parseDocument(JSON.parse(JSON.stringify(doc)))))).toEqual(JSON.parse(JSON.stringify(doc)))
  })

  it('eliminare un componente toglie le sue modifiche dalla distinta', () => {
    const { doc, a } = setup()
    setBomCell(doc, a.id, false, 'note', 'it', 'x')
    setBomHidden(doc, a.id, true)
    deleteItems(doc.drawing, new Set([a.id]))
    pruneBom(doc)
    expect(doc.bom.overrides).toEqual({})
    expect(doc.bom.hidden).toEqual([])
  })

  it('i file vecchi senza distinta modificabile si aprono', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyDocument()))
    delete raw.bom
    expect(parseDocument(raw).bom).toEqual({ overrides: {}, hidden: [], extra: [], grouped: true, groups: [], renames: {}, order: [] })
  })
})

describe('distinta a gruppi', () => {
  const setup = () => {
    const doc = createEmptyDocument()
    const tank = addComponent(doc, 'vessel.tank', 0, 0)
    const v1 = addComponent(doc, 'valve.ball', 40, 0)
    const v2 = addComponent(doc, 'valve.ball', 80, 0)
    const pt = addComponent(doc, 'instr.pt', 120, 0)
    return { doc, tank, v1, v2, pt }
  }
  const names = (doc: ReturnType<typeof createEmptyDocument>, lang: 'it' | 'en' = 'it') => bomItems(doc.drawing, lang, doc.bom).map((i) => (i.kind === 'group' ? `# ${i.name}` : i.row.tag))

  it('di base le righe sono divise per tipo di componente, nell\'ordine serbatoi, valvole, strumenti', () => {
    const { doc, tank, v1, v2, pt } = setup()
    expect(names(doc)).toEqual(['# Serbatoi', tank.tag, '# Valvole', v1.tag, v2.tag, '# Strumenti', pt.tag])
    expect(names(doc, 'en')[0]).toBe('# Vessels')
    setBomGrouped(doc, false)
    // senza gruppi: un elenco solo, per tag in ordine naturale
    expect(names(doc)).toEqual([tank.tag, v1.tag, v2.tag, pt.tag].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
  })

  it('si possono rinominare, creare, riordinare i gruppi e spostare le righe', () => {
    const { doc, v1, v2, pt } = setup()
    renameBomGroup(doc, 'cat:valves', 'it', 'Intercettazione')
    expect(names(doc)).toContain('# Intercettazione')
    expect(names(doc, 'en')).toContain('# Valves') // l\'inglese non cambia
    const g = addBomGroup(doc)
    renameBomGroup(doc, g, 'it', 'Linea ossidante')
    setBomRowGroup(doc, v2.id, false, g)
    setBomRowGroup(doc, pt.id, false, g)
    const n = names(doc)
    expect(n.slice(n.indexOf('# Linea ossidante'))).toEqual(['# Linea ossidante', v2.tag, pt.tag])
    expect(n).toContain(v1.tag)
    // sposta in alto il gruppo proprio
    moveBomGroup(doc, g, -1); moveBomGroup(doc, g, -1); moveBomGroup(doc, g, -1)
    expect(names(doc)[0]).toBe('# Linea ossidante')
    // riportare una riga nel gruppo del suo tipo non lascia tracce
    setBomRowGroup(doc, v2.id, false, 'cat:valves')
    expect(doc.bom.overrides[v2.id]).toBeUndefined()
    // eliminare il gruppo riporta le righe al loro tipo
    removeBomGroup(doc, g)
    expect(names(doc)).toEqual(expect.not.arrayContaining(['# Linea ossidante']))
    expect(doc.bom.overrides[pt.id]).toBeUndefined()
    expect(names(doc)).toContain('# Strumenti')
  })

  it('il PDF mostra i gruppi, mai un\'intestazione sola in fondo alla pagina, e conta le pagine giuste', () => {
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

  it('righe aggiunte a mano finiscono nel gruppo scelto, di base «Altro»', () => {
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

describe('numerazione e sigle', () => {
  it('i tag nuovi partono da 1 e la cella di carico è LC', () => {
    const doc = createEmptyDocument()
    expect(addComponent(doc, 'valve.ball', 0, 0).tag).toBe('BV-1')
    expect(addComponent(doc, 'valve.ball', 30, 0).tag).toBe('BV-2')
    const lc = addComponent(doc, 'instr.wt', 60, 0)
    expect(lc.tag).toBe('LC-1')
    expect(getSymbol('instr.wt').prims.some((p) => p.k === 'text' && p.s === 'LC')).toBe(true)
  })

  it('rinumera da 1 i tag automatici (anche con vecchie sigle), senza toccare quelli a mano', () => {
    const doc = createEmptyDocument()
    const mk = (symbol: string, tag: string) => { const c = addComponent(doc, symbol, 0, 0); c.tag = tag; return c }
    const a = mk('valve.ball', 'BV-101'), b = mk('valve.ball', 'BV-105'), hand = mk('valve.ball', 'MAIN')
    const sv = mk('valve.solenoid2', 'SV-101'), wt = mk('instr.wt', 'WT-102'), tt = mk('instr.tt', 'TT-101')
    expect(renumberTags(doc)).toBe(5)
    expect([a.tag, b.tag, hand.tag, sv.tag, wt.tag, tt.tag]).toEqual(['BV-1', 'BV-2', 'MAIN', 'EV-1', 'LC-1', 'TC-1'])
    expect(renumberTags(doc)).toBe(0) // già a posto
    expect(checkIntegrity(doc)).toEqual([])
  })

  it('un tag a mano già uguale a un numero libero non crea doppioni', () => {
    const doc = createEmptyDocument()
    const a = addComponent(doc, 'valve.ball', 0, 0); a.tag = 'BV-5'
    const b = addComponent(doc, 'valve.ball', 30, 0); b.tag = 'BV-9'
    renumberTags(doc)
    expect(new Set(doc.drawing.components.map((c) => c.tag)).size).toBe(2)
    expect(doc.drawing.components.map((c) => c.tag)).toEqual(['BV-1', 'BV-2'])
  })
})
