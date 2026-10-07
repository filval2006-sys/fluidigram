import { FLUIDS } from './fluids'
import { portEnds } from './endpoints'
import { traceFlow } from './flow'
import { JOIN_ALL, UnionFind, phaseValves, portKey } from './topology'
import { componentPorts } from './scene'
import { getSymbol, resolveSymbol } from './symbols/library'
import type { Component, Drawing, FluidDocument, FluidId, L10n, Lang } from './types'

type Severity = 'error' | 'warning' | 'info'

export interface CheckIssue {
  /** stable between runs (used by React) */
  id: string
  severity: Severity
  code: string
  /** shown in the interface language */
  message: L10n
  /** ids of the components and/or lines involved */
  targets: string[]
  /** work step it belongs to: design or operation (phases) */
  scope: CheckScope
}

type CheckScope = 'design' | 'operation'
/** Findings about the operating phases. */
const OPERATION_CODES = new Set(['phase-contamination', 'phase-incomplete'])

/** Components that close off a volume (valves, vessels, caps): a line bounded by two of them can trap the fluid. */
const isBlocker = (c: Component): boolean => {
  const def = getSymbol(c.symbol)
  if (def.id === 'valve.relief' || def.id === 'valve.pyro') return def.id === 'valve.pyro'
  return def.category === 'valves' || def.category === 'vessels' || def.id === 'fitting.cap'
}
const PROTECTIVE_INLINE = new Set(['fitting.burst'])
const SINKS = new Set(['fitting.vent', 'engine.chamber'])
/** Components that may legitimately connect different fluids. */
const MIXES_FLUIDS = new Set(['valve.ball3', 'valve.solenoid3', 'valve.servo3', 'valve.relief', 'valve.pyro'])
/** Components that change diameter by design. */
const CHANGES_SIZE = new Set(['fitting.reducer', 'fitting.orifice', 'valve.regulator', 'valve.relief', 'fitting.burst', 'fitting.qd', 'fitting.hose', 'fitting.flange'])

const num = (s: string | undefined): number | null => {
  if (!s) return null
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

const fluidCode = (f: FluidId) => FLUIDS[f].code
/** Builds a message in both languages. */
const both = (f: (l: Lang) => string): L10n => ({ it: f('it'), en: f('en') })
/** Fluid name without the code in brackets, lowercase ("oxidizer"). */
const fluidWord = (f: FluidId, l: Lang): string => FLUIDS[f].name[l].split(' (')[0].toLowerCase()

/** Optional findings: sometimes useful, but not missing items. Shown only if you turn them on. */
const HINT_CODES = new Set(['trapped', 'size-mismatch', 'no-size'])

export interface CheckReport {
  /** what is shown: without switched-off suggestions and without ignored warnings */
  issues: CheckIssue[]
  /** warnings you chose to ignore */
  dismissed: CheckIssue[]
  /** how many suggestions there would be if you turned them on */
  hiddenHints: number
}

export interface CheckOptions {
  /** forces suggestions on/off (otherwise the choice saved in the file applies) */
  hints?: boolean
  /** only the findings of one step (otherwise all) */
  scope?: CheckScope
}

export function checkReport(doc: FluidDocument, opts: CheckOptions = {}): CheckReport {
  const showHints = opts.hints ?? doc.checks.hints
  const skip = new Set(doc.checks.dismissed)
  const all = collectIssues(doc).filter((i) => !opts.scope || i.scope === opts.scope)
  const hintsOff = all.filter((i) => HINT_CODES.has(i.code) && !showHints)
  const shown = all.filter((i) => showHints || !HINT_CODES.has(i.code))
  return { issues: shown.filter((i) => !skip.has(i.id)), dismissed: shown.filter((i) => skip.has(i.id)), hiddenHints: hintsOff.filter((i) => !skip.has(i.id)).length }
}

export const runChecks = (doc: FluidDocument, opts: CheckOptions = {}): CheckIssue[] => checkReport(doc, opts).issues

function collectIssues(doc: FluidDocument): CheckIssue[] {
  const d: Drawing = doc.drawing
  const issues: CheckIssue[] = []
  const add = (severity: Severity, code: string, message: L10n, targets: string[], idSuffix = '') =>
    issues.push({ id: `${code}:${targets.join(',')}${idSuffix}`, severity, code, message, targets, scope: OPERATION_CODES.has(code) ? 'operation' : 'design' })

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
    // a declared end (vent, inlet from another system) counts as a connection
    if (used.length === 0 && ends.size === 0) {
      add('warning', 'isolated', { it: `${c.tag}: componente non collegato a nulla.`, en: `${c.tag}: component not connected to anything.` }, [c.id])
      continue
    }
    if (def.id === 'fitting.junction') {
      const n = linesOf(c.id).length + ends.size
      if (n < 2) add('warning', 'junction', { it: `${c.tag}: la giunzione ha meno di 2 collegamenti.`, en: `${c.tag}: the junction has fewer than 2 connections.` }, [c.id])
      continue
    }
    // vessels, engine and instruments have several connections but one connected is enough
    if (def.category === 'vessels' || def.category === 'engine' || def.category === 'instruments') continue
    for (const p of ports) {
      if (connected.has(portKey(c.id, p.id)) || ends.has(p.id)) continue
      // drains and relief outlets are deliberately left open
      if ((def.id === 'valve.relief' && p.id === 'out') || ((def.id === 'valve.solenoid3' || def.id === 'valve.servo3') && p.id === 'c')) continue
      add('warning', 'open-port', { it: `${c.tag}: la porta «${p.id}» non è collegata.`, en: `${c.tag}: port “${p.id}” is not connected.` }, [c.id], `:${p.id}`)
    }
  }

  // --- 2. fluidi e diametri ai nodi --------------------------------------------
  for (const c of d.components) {
    const def = getSymbol(c.symbol)
    if (def.category === 'vessels' || def.category === 'engine' || def.category === 'instruments') continue
    const ls = linesOf(c.id)
    if (!MIXES_FLUIDS.has(def.id)) {
      const fl = [...new Set(ls.map((l) => l.fluid).filter((f) => f !== 'signal'))]
      if (fl.length > 1) add('error', 'fluid-mix', both((l) => `${c.tag}: ${l === 'it' ? 'collega fluidi diversi' : 'connects different fluids'} (${fl.map(fluidCode).join(', ')}).`), [c.id, ...ls.map((l) => l.id)])
    }
    if (!CHANGES_SIZE.has(def.id) && def.id !== 'fitting.junction') {
      const sizes = [...new Set(ls.map((l) => l.size).filter((s): s is string => !!s))]
      if (sizes.length > 1) add('info', 'size-mismatch', both((l) => l === 'it' ? `${c.tag}: diametri diversi sulle linee collegate (${sizes.join(' / ')}). Manca una riduzione?` : `${c.tag}: different sizes on the connected lines (${sizes.join(' / ')}). Is a reducer missing?`), [c.id, ...ls.map((l) => l.id)])
    }
  }

  // --- 3. trapped volumes without protection ---------------------------------
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
      // a free port on a pass-through fitting leaves the volume open to the outside
      // a free port leaves the volume open, unless it is declared connected to another system
      const external = new Set(portEnds(c).filter((e) => e.kind !== 'vent').map((e) => portKey(c.id, e.portId)))
      for (const k of keys) if (!connected.has(k) && !external.has(k)) openPorts.add(k)
    }
    // declared vent: the volume connected to that port is open to the atmosphere
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
      add('info', 'trapped', both((l) => l === 'it'
        ? `Volume di ${hazardous.map((f) => fluidWord(f, l)).join('/')} chiudibile tra ${tags.join(' e ')} senza valvola di sicurezza, disco di rottura o sfiato.`
        : `${hazardous.map((f) => fluidWord(f, l)).join('/')} volume can be closed off between ${tags.join(' and ')} without a relief valve, burst disc or vent.`), [...gr.blockers, ...gr.lineIds])
    }
  }

  // --- 4. operating pressures vs. component limits ----------------------
  for (const l of d.lines) {
    const pLine = num(l.pressure)
    if (pLine === null) continue
    for (const ref of [l.from, l.to]) {
      const c = d.components.find((x) => x.id === ref.componentId)
      const max = c && num(c.props.mawp)
      if (c && max !== null && max !== undefined && max < pLine) {
        add('error', 'rating', both((l) => l === 'it' ? `${c.tag}: pressione massima ${max} bar inferiore alla pressione di linea (${pLine} bar).` : `${c.tag}: maximum pressure ${max} bar is below the line pressure (${pLine} bar).`), [c.id, l.id], `:${l.id}`)
      }
    }
  }

  // --- 4b. oxidizer and fuel in communication, phase by phase -------------
  for (const ph of doc.phases) {
    const valves = phaseValves(d)
    if (!valves.length || !valves.every((v) => v.states?.[ph.id])) continue // incomplete phase: cannot tell
    for (const grp of traceFlow(doc, ph.id).groups) {
      if (grp.fluids.has('oxidizer') && grp.fluids.has('fuel')) {
        add('error', 'phase-contamination', both((l) => l === 'it' ? `Fase «${ph.name.it}»: ossidante e combustibile risultano in comunicazione attraverso valvole aperte.` : `Phase “${ph.name.en || ph.name.it}”: oxidizer and fuel are in communication through open valves.`), [...grp.lineIds, ...grp.componentIds], `:${ph.id}`)
      }
    }
  }

  // --- 4c. valves without a state in a phase ---------------------------------------
  const pv = phaseValves(d)
  for (const ph of doc.phases) {
    const missing = pv.filter((v) => !v.states?.[ph.id])
    if (!missing.length) continue
    const tags = missing.map((v) => v.tag)
    const shownTags = tags.length > 4 ? `${tags.slice(0, 4).join(', ')}…` : tags.join(', ')
    add('warning', 'phase-incomplete', both((l) => l === 'it'
      ? `Fase «${ph.name.it}»: ${missing.length === 1 ? 'una valvola senza stato' : `${missing.length} valvole senza stato`} (${shownTags}).`
      : `Phase “${ph.name.en || ph.name.it}”: ${missing.length === 1 ? 'one valve without a state' : `${missing.length} valves without a state`} (${shownTags}).`), missing.map((v) => v.id), `:${ph.id}`)
  }

  // --- 5. data completeness --------------------------------------------------
  const noSize = d.lines.filter((l) => !l.size)
  if (noSize.length) add('info', 'no-size', both((l) => l === 'it' ? `${noSize.length} ${noSize.length === 1 ? 'linea senza diametro' : 'linee senza diametro'}.` : `${noSize.length} ${noSize.length === 1 ? 'line without a size' : 'lines without a size'}.`), noSize.map((l) => l.id))
  for (const c of d.components) {
    const def = getSymbol(c.symbol)
    const act = resolveSymbol(def, c.props).actuator
    const electric = def.id.startsWith('valve.solenoid') || def.id.startsWith('valve.servo') || act === 'solenoid' || act === 'servo' || act === 'pneumatic'
    if (electric && !c.props.normal) add('warning', 'no-normal-state', both((l) => l === 'it' ? `${c.tag}: manca lo stato a riposo (NC/NA), importante per la sicurezza in caso di mancanza di alimentazione.` : `${c.tag}: missing rest state (NC/NO), important for safety if power is lost.`), [c.id])
  }

  const rank = { error: 0, warning: 1, info: 2 } as const
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity])
}

// --- user choices about the checks (applied to an immer draft of the document) ---------------
export const setCheckHints = (doc: FluidDocument, on: boolean): void => { doc.checks.hints = on }
export const dismissIssue = (doc: FluidDocument, id: string): void => {
  if (!doc.checks.dismissed.includes(id)) doc.checks.dismissed.push(id)
}
export const restoreIssue = (doc: FluidDocument, id: string): void => {
  doc.checks.dismissed = doc.checks.dismissed.filter((x) => x !== id)
}
export const restoreAllIssues = (doc: FluidDocument): void => { doc.checks.dismissed = [] }
