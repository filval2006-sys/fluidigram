import type { Dir } from './geometry'
import { GRID } from './geometry'
import { componentPorts, lineRoute } from './scene'
import { nearestOnRoute } from './routeEdit'
import { setPortEnd } from './endpoints'
import { getSymbol } from './symbols/library'
import type { Annotation, Component, Drawing, FluidDocument, FluidId, L10n, PortRef } from './types'

export const snap = (v: number): number => Math.round(v / GRID) * GRID

export const newId = (prefix: string): string => `${prefix}${Math.random().toString(36).slice(2, 9)}`

/** Next free tag for a prefix (BV-1, BV-2...), unique across the whole document. */
export function nextTag(doc: FluidDocument, prefix: string): string {
  let max = 0
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  for (const c of doc.drawing.components) {
    const m = re.exec(c.tag)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${max + 1}`
}

/** Adds a component (the functions of this module mutate: use them inside immer.produce). */
export function addComponent(doc: FluidDocument, symbolId: string, x: number, y: number): Component {
  const def = getSymbol(symbolId)
  const c: Component = {
    id: newId('c'), symbol: symbolId, tag: nextTag(doc, def.tagPrefix),
    x: snap(x), y: snap(y), rotation: 0, mirror: false, props: {},
  }
  doc.drawing.components.push(c)
  return c
}

function isPortFree(sheet: Drawing, ref: PortRef): boolean {
  return !sheet.lines.some((l) =>
    (l.from.componentId === ref.componentId && l.from.portId === ref.portId) ||
    (l.to.componentId === ref.componentId && l.to.portId === ref.portId))
}

/** A connected port no longer has a declared end (vent, external inlet...). */
function clearEnds(sheet: Drawing, ...refs: PortRef[]): void {
  for (const r of refs) {
    const c = sheet.components.find((x) => x.id === r.componentId)
    if (c) setPortEnd(c, r.portId, '')
  }
}

/** Creates a line between two free, distinct ports; returns the id, or undefined if not valid. */
export function connectPorts(sheet: Drawing, from: PortRef, to: PortRef, fluid: FluidId, size?: string): string | undefined {
  if (from.componentId === to.componentId && from.portId === to.portId) return undefined
  if (!isPortFree(sheet, from) || !isPortFree(sheet, to)) return undefined
  const id = newId('l')
  sheet.lines.push({ id, fluid, from, to, ...(size ? { size } : {}) })
  clearEnds(sheet, from, to)
  return id
}

/** Deletes components and lines by id; lines connected to deleted components go with them. */
export function deleteItems(sheet: Drawing, ids: ReadonlySet<string>): void {
  sheet.components = sheet.components.filter((c) => !ids.has(c.id))
  sheet.annotations = sheet.annotations.filter((a) => !ids.has(a.id))
  const alive = new Set(sheet.components.map((c) => c.id))
  sheet.lines = sheet.lines.filter((l) => !ids.has(l.id) && alive.has(l.from.componentId) && alive.has(l.to.componentId))
}

export function rotateComponents(sheet: Drawing, ids: ReadonlySet<string>): void {
  for (const c of sheet.components) if (ids.has(c.id)) c.rotation = ((c.rotation + 90) % 360) as Component['rotation']
}

export function mirrorComponents(sheet: Drawing, ids: ReadonlySet<string>): void {
  for (const c of sheet.components) if (ids.has(c.id)) c.mirror = !c.mirror
}

const DIR_DOT: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

/**
 * Among free ports that coincide at the same point (junctions) picks the one
 * facing `toward` the most.
 */
export function pickPortToward<T extends { p: { x: number; y: number }; dir: Dir }>(cands: T[], toward: { x: number; y: number }): T | undefined {
  let best: T | undefined
  let bestScore = -Infinity
  for (const c of cands) {
    const [dx, dy] = DIR_DOT[c.dir]
    const score = dx * (toward.x - c.p.x) + dy * (toward.y - c.p.y)
    if (score > bestScore) { bestScore = score; best = c }
  }
  return best
}

export function freePorts(sheet: Drawing, c: Component) {
  return componentPorts(c).filter((p) => isPortFree(sheet, { componentId: c.id, portId: p.id }))
}

/** Deep copy that also works on immer drafts. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export interface Clip { components: Component[]; lines: Drawing['lines']; annotations: Annotation[] }

/** Copies the selected components and the lines connecting them (plus selected lines with both ends copied). */
export function copyItems(d: Drawing, ids: ReadonlySet<string>): Clip {
  const components = d.components.filter((c) => ids.has(c.id)).map((c) => clone(c))
  const inside = new Set(components.map((c) => c.id))
  const lines = d.lines
    .filter((l) => inside.has(l.from.componentId) && inside.has(l.to.componentId))
    .map((l) => clone(l))
  const annotations = d.annotations.filter((a) => ids.has(a.id)).map((a) => clone(a))
  return { components, lines, annotations }
}

/** Pastes a copy with new ids and tags, shifted by (dx, dy). Returns the ids of the new items. Mutates the document. */
export function pasteItems(doc: FluidDocument, clip: Clip, dx: number, dy: number): string[] {
  const idMap = new Map<string, string>()
  const created: string[] = []
  for (const src of clip.components) {
    const def = getSymbol(src.symbol)
    const c: Component = { ...clone(src), id: newId('c'), tag: nextTag(doc, def.tagPrefix), x: snap(src.x + dx), y: snap(src.y + dy) }
    idMap.set(src.id, c.id)
    doc.drawing.components.push(c)
    created.push(c.id)
  }
  for (const src of clip.lines) {
    const l = {
      ...clone(src),
      id: newId('l'),
      from: { ...src.from, componentId: idMap.get(src.from.componentId)! },
      to: { ...src.to, componentId: idMap.get(src.to.componentId)! },
      ...(src.route ? { route: src.route.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}),
    }
    doc.drawing.lines.push(l)
    created.push(l.id)
  }
  for (const src of clip.annotations) {
    const a: Annotation = { ...clone(src), id: newId('a'), x: snap(src.x + dx), y: snap(src.y + dy) }
    doc.drawing.annotations.push(a)
    created.push(a.id)
  }
  return created
}

/** Moves one end of a line to another free port. The manual route is dropped. */
export function reconnectLine(d: Drawing, lineId: string, end: 'from' | 'to', to: PortRef): boolean {
  const l = d.lines.find((x) => x.id === lineId)
  if (!l) return false
  const other = end === 'from' ? l.to : l.from
  if (other.componentId === to.componentId && other.portId === to.portId) return false
  const same = l[end].componentId === to.componentId && l[end].portId === to.portId
  if (!same && !isPortFree(d, to)) return false
  l[end] = { componentId: to.componentId, portId: to.portId }
  delete l.route
  clearEnds(d, to)
  return true
}

/**
 * Branches a line from the point nearest to `at` on an existing line: inserts a junction, splits the line in two
 * (same fluid, size and pressure) and connects `branch` to the junction. Returns the junction id.
 */
export function branchFromLine(doc: FluidDocument, lineId: string, at: { x: number; y: number }, branch: PortRef, size?: string): string | undefined {
  const d = doc.drawing
  const line = d.lines.find((l) => l.id === lineId)
  if (!line || !isPortFree(d, branch)) return undefined
  const route = lineRoute(d, line)
  const hit = nearestOnRoute(route, at)
  if (!hit) return undefined
  const { point: j, segment } = hit
  const a = route[segment], b = route[segment + 1]
  const horizontal = a.y === b.y
  const forward = horizontal ? b.x > a.x : b.y > a.y
  const before = horizontal ? (forward ? 'w' : 'e') : (forward ? 'n' : 's')
  const after = horizontal ? (forward ? 'e' : 'w') : (forward ? 's' : 'n')
  const bp = componentPorts(d.components.find((c) => c.id === branch.componentId)!).find((p) => p.id === branch.portId)!
  const branchPort = horizontal ? (bp.p.y < j.y ? 'n' : 's') : (bp.p.x < j.x ? 'w' : 'e')

  const jc = addComponent(doc, 'fitting.junction', j.x, j.y)
  const tail = { ...clone(line), id: newId('l'), from: { componentId: jc.id, portId: after }, to: line.to }
  delete tail.route
  line.to = { componentId: jc.id, portId: before }
  delete line.route
  d.lines.push(tail)
  connectPorts(d, branch, { componentId: jc.id, portId: branchPort }, line.fluid, size ?? line.size)
  return jc.id
}

export type AnnotationKind = Annotation['kind']

/** Adds a text or a box with default values. */
export function addAnnotation(doc: FluidDocument, kind: AnnotationKind, x: number, y: number): Annotation {
  const a: Annotation = kind === 'box'
    ? { id: newId('a'), kind, x: snap(x), y: snap(y), w: 60, h: 40, text: { it: 'Zona', en: 'Zone' }, size: 3.5, bold: true, tone: 'blue', framed: true }
    : { id: newId('a'), kind, x: snap(x), y: snap(y), w: 60, h: 40, text: { it: 'Nota', en: 'Note' }, size: 3.5, bold: false, tone: 'neutral', framed: false }
  doc.drawing.annotations.push(a)
  return a
}


/** Maximum distance (mm) at which a sensor snaps to a free connection of another component. */
const MOUNT_SNAP = 7.5

/**
 * Direct mounting: a sensor near a free connection (of a vessel, a fitting...) with its port facing
 * it moves into contact and connects without a pipe. Returns true if it snapped to something. Mutates the drawing.
 */
export function mountInstrument(sheet: Drawing, c: Component, fluid: FluidId): boolean {
  if (getSymbol(c.symbol).category !== 'instruments') return false
  const OPPOSITE: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' }
  let best: { d: number; mine: string; theirs: PortRef; dx: number; dy: number } | undefined
  for (const mine of freePorts(sheet, c)) {
    for (const o of sheet.components) {
      if (o.id === c.id) continue
      for (const q of freePorts(sheet, o)) {
        if (q.dir !== OPPOSITE[mine.dir]) continue
        const dx = q.p.x - mine.p.x, dy = q.p.y - mine.p.y
        const d = Math.hypot(dx, dy)
        if (d <= MOUNT_SNAP && (!best || d < best.d)) best = { d, mine: mine.id, theirs: { componentId: o.id, portId: q.id }, dx, dy }
      }
    }
  }
  if (!best) return false
  c.x += best.dx
  c.y += best.dy
  return !!connectPorts(sheet, { componentId: c.id, portId: best.mine }, best.theirs, fluid)
}

// ---- component replacement ----------------------------------------------------------------

export interface ReplaceResult {
  replaced: string[]
  /** components left as they were, with the reason */
  skipped: { id: string; tag: string; reason: L10n }[]
}

/** Maximum distance (mm) between a port of the old part and the one of the new part to which the connection moves. */
const REPLACE_REACH = 15

/**
 * Replaces the symbol of the given components keeping position, rotation, mirror and connections.
 * Each connected port moves to the new symbol's port with the same name (if it faces the same side and is close),
 * otherwise to the nearest one facing the same side. If a connected port finds no place the component stays as it was.
 * Generic properties (size, pressure, notes, description, per-phase states) are kept; those of the old symbol are not.
 * The tag is renumbered only if it was automatic and the prefix changes. Mutates the document.
 */
export function replaceComponents(doc: FluidDocument, ids: ReadonlySet<string>, symbolId: string): ReplaceResult {
  const d = doc.drawing
  const def = getSymbol(symbolId)
  const result: ReplaceResult = { replaced: [], skipped: [] }
  for (const c of d.components) {
    if (!ids.has(c.id) || c.symbol === symbolId) continue
    const old = getSymbol(c.symbol)
    const probe: Component = { ...c, symbol: symbolId }
    const oldPorts = componentPorts(c)
    const newPorts = componentPorts(probe)

    const attached = new Set<string>()
    for (const l of d.lines) for (const r of [l.from, l.to]) if (r.componentId === c.id) attached.add(r.portId)
    const withEnd = oldPorts.filter((p) => c.props[`end.${p.id}`]).map((p) => p.id)

    // old port → new port assignment, once per new port
    const map = new Map<string, string>()
    const taken = new Set<string>()
    let failed: string | undefined
    for (const id of [...attached, ...withEnd.filter((x) => !attached.has(x))]) {
      const from = oldPorts.find((p) => p.id === id)
      if (!from) continue
      const fits = newPorts
        .filter((q) => !taken.has(q.id) && q.dir === from.dir)
        .map((q) => ({ q, dist: Math.hypot(q.p.x - from.p.x, q.p.y - from.p.y) + (q.id === id ? -0.5 : 0) }))
        .filter((x) => x.dist <= REPLACE_REACH)
        .sort((a, b) => a.dist - b.dist)
      if (!fits.length) { if (attached.has(id)) { failed = id; break } else continue }
      map.set(id, fits[0].q.id)
      taken.add(fits[0].q.id)
    }
    if (failed) {
      result.skipped.push({ id: c.id, tag: c.tag, reason: { it: `il collegamento sulla porta «${failed}» non ha un punto corrispondente in ${def.name.it}`, en: `the connection on port “${failed}” has no matching point in ${def.name.en}` } })
      continue
    }

    // properties: those of the old symbol dropped, declared ends remapped
    const props: Record<string, string> = {}
    const own = new Set(['actuator', 'normal', ...(old.options ?? []).map((o) => o.key)])
    for (const [k, v] of Object.entries(c.props)) {
      if (k.startsWith('end.') || k.startsWith('endLabel.')) continue
      if (own.has(k) && !(def.options ?? []).some((o) => o.key === k)) {
        if (k === 'actuator' && def.actuatable) props[k] = v
        else if (k === 'normal' && def.category === 'valves') props[k] = v
        continue
      }
      props[k] = v
    }
    for (const [from, to] of map) {
      if (c.props[`end.${from}`]) props[`end.${to}`] = c.props[`end.${from}`]
      if (c.props[`endLabel.${from}`]) props[`endLabel.${to}`] = c.props[`endLabel.${from}`]
    }

    // tag: renumbered only if automatic and the prefix changes
    const auto = new RegExp(`^${old.tagPrefix}-\\d+$`).test(c.tag)
    if (auto && old.tagPrefix !== def.tagPrefix) c.tag = nextTag(doc, def.tagPrefix)

    for (const l of d.lines) {
      for (const r of [l.from, l.to]) if (r.componentId === c.id && map.has(r.portId)) r.portId = map.get(r.portId)!
    }
    c.symbol = symbolId
    c.props = props
    if (c.states && !(def.category === 'valves' && !def.id.startsWith('valve.check') && def.id !== 'valve.relief')) delete c.states
    // the type written by hand in the bill of materials referred to the old symbol
    const ov = doc.bom.overrides[c.id]
    if (ov?.type) { delete ov.type; if (!Object.keys(ov).length) delete doc.bom.overrides[c.id] }
    result.replaced.push(c.id)
  }
  return result
}

/** Prefixes used in the past by symbols that later changed code: tags like these count as automatic. */
const LEGACY_PREFIXES: Record<string, string[]> = {
  'valve.solenoid2': ['SV'],
  'valve.solenoid3': ['SV'],
  'instr.tt': ['TT'],
  'instr.wt': ['WT'],
}

/**
 * Renumbers automatic tags (PREFIX-number) from 1 without gaps, keeping their order; tags chosen by hand are not touched.
 * Needed for projects created when numbering started at 101. Returns how many tags changed. Mutates the document.
 */
export function renumberTags(doc: FluidDocument): number {
  const byPrefix = new Map<string, { c: Component; n: number }[]>()
  for (const c of doc.drawing.components) {
    const prefix = getSymbol(c.symbol).tagPrefix
    const all = [prefix, ...(LEGACY_PREFIXES[c.symbol] ?? [])].join('|')
    const m = new RegExp(`^(?:${all})-(\\d+)$`).exec(c.tag)
    if (m) byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), { c, n: Number(m[1]) }])
  }
  // to avoid collisions with hand-written tags equal to a free number, the occupied one is skipped
  const taken = new Set(doc.drawing.components.map((c) => c.tag))
  let changed = 0
  const plan: { c: Component; tag: string }[] = []
  for (const [prefix, items] of byPrefix) {
    items.sort((a, b) => a.n - b.n)
    for (const { c } of items) taken.delete(c.tag)
    let k = 0
    for (const { c } of items) {
      let tag: string
      do { k += 1; tag = `${prefix}-${k}` } while (taken.has(tag))
      taken.add(tag)
      plan.push({ c, tag })
    }
  }
  for (const { c, tag } of plan) if (c.tag !== tag) { c.tag = tag; changed++ }
  return changed
}
