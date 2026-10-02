import { describe, expect, it } from 'vitest'
import {
  ALL_SYMBOLS, FLUID_IDS, mountInstrument, portEnds, setPortEnd, planLabels, renderLine, addComponent, bomRows, checkIntegrity, componentPorts, connectPorts, copyItems, createEmptyDocument,
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
