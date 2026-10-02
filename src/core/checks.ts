import { FLUIDS } from './fluids'
import { portEnds } from './endpoints'
import { traceFlow } from './flow'
import { JOIN_ALL, UnionFind, phaseValves, portKey } from './topology'
import { componentPorts } from './scene'
import { getSymbol, resolveSymbol } from './symbols/library'
import type { Component, Drawing, FluidDocument, FluidId } from './types'

export type Severity = 'error' | 'warning' | 'info'

export interface CheckIssue {
  /** stabile tra un'esecuzione e l'altra (serve a React) */
  id: string
  severity: Severity
  code: string
  message: string
  /** id di componenti e/o linee coinvolti */
  targets: string[]
}

/** Componenti che chiudono il volume (valvole, serbatoi, tappi): una linea delimitata da due di essi può intrappolare il fluido. */
const isBlocker = (c: Component): boolean => {
  const def = getSymbol(c.symbol)
  if (def.id === 'valve.relief' || def.id === 'valve.pyro') return def.id === 'valve.pyro'
  return def.category === 'valves' || def.category === 'vessels' || def.id === 'fitting.cap'
}
const PROTECTIVE_INLINE = new Set(['fitting.burst'])
const SINKS = new Set(['fitting.vent', 'engine.chamber'])
/** Componenti che possono legittimamente collegare fluidi diversi. */
const MIXES_FLUIDS = new Set(['valve.ball3', 'valve.solenoid3', 'valve.relief', 'valve.pyro'])
/** Componenti che cambiano diametro per costruzione. */
const CHANGES_SIZE = new Set(['fitting.reducer', 'fitting.orifice', 'valve.regulator', 'valve.relief', 'fitting.burst', 'fitting.qd', 'fitting.hose', 'fitting.flange'])

const num = (s: string | undefined): number | null => {
  if (!s) return null
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

const fluidCode = (f: FluidId) => FLUIDS[f].code

export function runChecks(doc: FluidDocument): CheckIssue[] {
  const d: Drawing = doc.drawing
  const issues: CheckIssue[] = []
  const add = (severity: Severity, code: string, message: string, targets: string[], idSuffix = '') =>
    issues.push({ id: `${code}:${targets.join(',')}${idSuffix}`, severity, code, message, targets })

  const connected = new Set<string>()
  for (const l of d.lines) {
    connected.add(portKey(l.from.componentId, l.from.portId))
    connected.add(portKey(l.to.componentId, l.to.portId))
  }
  const linesOf = (id: string) => d.lines.filter((l) => l.from.componentId === id || l.to.componentId === id)

  // --- 1. collegamenti mancanti -------------------------------------------------
  for (const c of d.components) {
    const def = getSymbol(c.symbol)
    const ports = componentPorts(c)
    const ends = new Set(portEnds(c).map((e) => e.portId))
    const used = ports.filter((p) => connected.has(portKey(c.id, p.id)))
    // un'estremità dichiarata (sfiato, ingresso da altro impianto) conta come collegamento
    if (used.length === 0 && ends.size === 0) {
      add('warning', 'isolated', `${c.tag}: componente non collegato a nulla.`, [c.id])
      continue
    }
    if (def.id === 'fitting.junction') {
      const n = linesOf(c.id).length + ends.size
      if (n < 2) add('warning', 'junction', `${c.tag}: la giunzione ha meno di 2 collegamenti.`, [c.id])
      continue
    }
    // serbatoi, motore e strumenti hanno più attacchi ma ne basta uno collegato
    if (def.category === 'vessels' || def.category === 'engine' || def.category === 'instruments') continue
    for (const p of ports) {
      if (connected.has(portKey(c.id, p.id)) || ends.has(p.id)) continue
      // scarichi e uscite di sfogo restano volutamente aperti
      if ((def.id === 'valve.relief' && p.id === 'out') || (def.id === 'valve.solenoid3' && p.id === 'c')) continue
      add('warning', 'open-port', `${c.tag}: la porta «${p.id}» non è collegata.`, [c.id], `:${p.id}`)
    }
  }

  // --- 2. fluidi e diametri ai nodi --------------------------------------------
  for (const c of d.components) {
    const def = getSymbol(c.symbol)
    if (def.category === 'vessels' || def.category === 'engine' || def.category === 'instruments') continue
    const ls = linesOf(c.id)
    if (!MIXES_FLUIDS.has(def.id)) {
      const fl = [...new Set(ls.map((l) => l.fluid).filter((f) => f !== 'signal'))]
      if (fl.length > 1) add('error', 'fluid-mix', `${c.tag}: collega fluidi diversi (${fl.map(fluidCode).join(', ')}).`, [c.id, ...ls.map((l) => l.id)])
    }
    if (!CHANGES_SIZE.has(def.id) && def.id !== 'fitting.junction') {
      const sizes = [...new Set(ls.map((l) => l.size).filter((s): s is string => !!s))]
      if (sizes.length > 1) add('info', 'size-mismatch', `${c.tag}: diametri diversi sulle linee collegate (${sizes.join(' / ')}). Manca una riduzione?`, [c.id, ...ls.map((l) => l.id)])
    }
  }

  // --- 3. volumi intrappolati senza protezione ---------------------------------
  const uf = new UnionFind()
  const protectedPorts = new Set<string>()
  const openPorts = new Set<string>()
  for (const l of d.lines) uf.union(portKey(l.from.componentId, l.from.portId), portKey(l.to.componentId, l.to.portId))
  for (const c of d.components) {
    const def = getSymbol(c.symbol)
    const keys = def.ports.map((p) => portKey(c.id, p.id))
    keys.forEach((k) => uf.find(k))
    if (JOIN_ALL.has(def.id)) {
      for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i])
      // una porta libera su un raccordo passante lascia il volume aperto verso l'esterno
      // una porta libera lascia il volume aperto, salvo che sia dichiarata collegata a un altro impianto
      const external = new Set(portEnds(c).filter((e) => e.kind !== 'vent').map((e) => portKey(c.id, e.portId)))
      for (const k of keys) if (!connected.has(k) && !external.has(k)) openPorts.add(k)
    }
    // sfiato dichiarato: il volume collegato a quella porta è aperto verso l'atmosfera
    for (const e of portEnds(c)) if (e.kind === 'vent') openPorts.add(portKey(c.id, e.portId))
    if (def.id === 'valve.relief') protectedPorts.add(portKey(c.id, 'in'))
    if (PROTECTIVE_INLINE.has(def.id) || SINKS.has(def.id)) keys.forEach((k) => protectedPorts.add(k))
    if (def.category === 'engine' && def.id !== 'engine.injector') keys.forEach((k) => protectedPorts.add(k))
  }
  type Group = { blockers: Set<string>; protectedFlag: boolean; open: boolean; fluids: Set<FluidId>; lineIds: Set<string> }
  const groups = new Map<string, Group>()
  const g = (k: string): Group => {
    const r = uf.find(k)
    if (!groups.has(r)) groups.set(r, { blockers: new Set(), protectedFlag: false, open: false, fluids: new Set(), lineIds: new Set() })
    return groups.get(r)!
  }
  for (const c of d.components) {
    const blocker = isBlocker(c)
    for (const p of getSymbol(c.symbol).ports) {
      const k = portKey(c.id, p.id)
      const gr = g(k)
      if (blocker && connected.has(k)) gr.blockers.add(c.id)
      if (protectedPorts.has(k)) gr.protectedFlag = true
      if (openPorts.has(k)) gr.open = true
    }
  }
  for (const l of d.lines) {
    const gr = g(portKey(l.from.componentId, l.from.portId))
    gr.fluids.add(l.fluid)
    gr.lineIds.add(l.id)
  }
  const tagOf = (id: string) => d.components.find((c) => c.id === id)?.tag ?? id
  for (const gr of groups.values()) {
    const hazardous = [...gr.fluids].filter((f) => f === 'oxidizer' || f === 'fuel')
    if (hazardous.length && gr.blockers.size >= 2 && !gr.protectedFlag && !gr.open) {
      const tags = [...gr.blockers].map(tagOf)
      add('warning', 'trapped', `Volume di ${hazardous.map((f) => FLUIDS[f].name.it.split(' (')[0].toLowerCase()).join('/')} chiudibile tra ${tags.join(' e ')} senza valvola di sicurezza, disco di rottura o sfiato.`, [...gr.blockers, ...gr.lineIds])
    }
  }

  // --- 4. pressioni di esercizio vs. limiti dei componenti ----------------------
  for (const l of d.lines) {
    const pLine = num(l.pressure)
    if (pLine === null) continue
    for (const ref of [l.from, l.to]) {
      const c = d.components.find((x) => x.id === ref.componentId)
      const max = c && num(c.props.mawp)
      if (c && max !== null && max !== undefined && max < pLine) {
        add('error', 'rating', `${c.tag}: pressione massima ${max} bar inferiore alla pressione di linea (${pLine} bar).`, [c.id, l.id], `:${l.id}`)
      }
    }
  }

  // --- 4b. ossidante e combustibile in comunicazione, fase per fase -------------
  for (const ph of doc.phases) {
    const valves = phaseValves(d)
    if (!valves.length || !valves.every((v) => v.states?.[ph.id])) continue // fase incompleta: non si può dire
    for (const grp of traceFlow(doc, ph.id).groups) {
      if (grp.fluids.has('oxidizer') && grp.fluids.has('fuel')) {
        add('error', 'phase-contamination', `Fase «${ph.name.it}»: ossidante e combustibile risultano in comunicazione attraverso valvole aperte.`, [...grp.lineIds, ...grp.componentIds], `:${ph.id}`)
      }
    }
  }

  // --- 5. completezza dei dati --------------------------------------------------
  const noSize = d.lines.filter((l) => !l.size)
  if (noSize.length) add('info', 'no-size', `${noSize.length} ${noSize.length === 1 ? 'linea senza diametro' : 'linee senza diametro'}.`, noSize.map((l) => l.id))
  for (const c of d.components) {
    const def = getSymbol(c.symbol)
    const act = resolveSymbol(def, c.props).actuator
    const electric = def.id.startsWith('valve.solenoid') || act === 'solenoid' || act === 'pneumatic'
    if (electric && !c.props.normal) add('warning', 'no-normal-state', `${c.tag}: manca lo stato a riposo (NC/NA), importante per la sicurezza in caso di mancanza di alimentazione.`, [c.id])
  }

  const rank = { error: 0, warning: 1, info: 2 } as const
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity])
}
