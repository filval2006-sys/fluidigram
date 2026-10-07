import type { Dir } from './geometry'
import { GRID } from './geometry'
import { componentPorts, lineRoute } from './scene'
import { nearestOnRoute } from './routeEdit'
import { setPortEnd } from './endpoints'
import { getSymbol } from './symbols/library'
import type { Annotation, Component, Drawing, FluidDocument, FluidId, PortRef } from './types'

export const snap = (v: number): number => Math.round(v / GRID) * GRID

export const newId = (prefix: string): string => `${prefix}${Math.random().toString(36).slice(2, 9)}`

/** Prossimo tag libero per un prefisso (BV-1, BV-2...), univoco in tutto il documento. */
export function nextTag(doc: FluidDocument, prefix: string): string {
  let max = 0
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  for (const c of doc.drawing.components) {
    const m = re.exec(c.tag)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${max + 1}`
}

/** Aggiunge un componente (le funzioni di questo modulo mutano: usarle dentro immer.produce). */
export function addComponent(doc: FluidDocument, symbolId: string, x: number, y: number): Component {
  const def = getSymbol(symbolId)
  const c: Component = {
    id: newId('c'), symbol: symbolId, tag: nextTag(doc, def.tagPrefix),
    x: snap(x), y: snap(y), rotation: 0, mirror: false, props: {},
  }
  doc.drawing.components.push(c)
  return c
}

export function isPortFree(sheet: Drawing, ref: PortRef): boolean {
  return !sheet.lines.some((l) =>
    (l.from.componentId === ref.componentId && l.from.portId === ref.portId) ||
    (l.to.componentId === ref.componentId && l.to.portId === ref.portId))
}

/** Una porta collegata non ha più un'estremità dichiarata (sfiato, ingresso esterno...). */
function clearEnds(sheet: Drawing, ...refs: PortRef[]): void {
  for (const r of refs) {
    const c = sheet.components.find((x) => x.id === r.componentId)
    if (c) setPortEnd(c, r.portId, '')
  }
}

/** Crea una linea tra due porte libere e distinte; restituisce l'id, o undefined se non valida. */
export function connectPorts(sheet: Drawing, from: PortRef, to: PortRef, fluid: FluidId, size?: string): string | undefined {
  if (from.componentId === to.componentId && from.portId === to.portId) return undefined
  if (!isPortFree(sheet, from) || !isPortFree(sheet, to)) return undefined
  const id = newId('l')
  sheet.lines.push({ id, fluid, from, to, ...(size ? { size } : {}) })
  clearEnds(sheet, from, to)
  return id
}

/** Elimina componenti e linee per id; le linee collegate ai componenti eliminati cadono con loro. */
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
 * Tra porte libere che coincidono nello stesso punto (giunzioni) sceglie quella
 * rivolta di più verso `toward`.
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

/** Copia profonda che funziona anche sui draft di immer. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export interface Clip { components: Component[]; lines: Drawing['lines']; annotations: Annotation[] }

/** Copia i componenti selezionati e le linee che li collegano tra loro (più le linee selezionate con entrambi gli estremi copiati). */
export function copyItems(d: Drawing, ids: ReadonlySet<string>): Clip {
  const components = d.components.filter((c) => ids.has(c.id)).map((c) => clone(c))
  const inside = new Set(components.map((c) => c.id))
  const lines = d.lines
    .filter((l) => inside.has(l.from.componentId) && inside.has(l.to.componentId))
    .map((l) => clone(l))
  const annotations = d.annotations.filter((a) => ids.has(a.id)).map((a) => clone(a))
  return { components, lines, annotations }
}

/** Incolla una copia con nuovi id e tag, spostata di (dx, dy). Restituisce gli id dei nuovi elementi. Muta il documento. */
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

/** Sposta un estremo di una linea su un'altra porta libera. Il percorso manuale decade. */
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
 * Deriva una linea dal punto più vicino a `at` su una linea esistente: inserisce una giunzione, divide la linea in due
 * (stesso fluido, diametro e pressione) e collega `branch` alla giunzione. Restituisce l'id della giunzione.
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

/** Aggiunge un testo o un riquadro con valori predefiniti. */
export function addAnnotation(doc: FluidDocument, kind: AnnotationKind, x: number, y: number): Annotation {
  const a: Annotation = kind === 'box'
    ? { id: newId('a'), kind, x: snap(x), y: snap(y), w: 60, h: 40, text: { it: 'Zona', en: 'Zone' }, size: 3.5, bold: true, tone: 'blue', framed: true }
    : { id: newId('a'), kind, x: snap(x), y: snap(y), w: 60, h: 40, text: { it: 'Nota', en: 'Note' }, size: 3.5, bold: false, tone: 'neutral', framed: false }
  doc.drawing.annotations.push(a)
  return a
}


/** Distanza massima (mm) a cui un sensore si aggancia a un attacco libero di un altro componente. */
export const MOUNT_SNAP = 7.5

/**
 * Montaggio diretto: un sensore vicino a un attacco libero (di un serbatoio, di un raccordo...) con la porta rivolta
 * verso di esso si porta a contatto e si collega senza tubo. Restituisce true se ha agganciato qualcosa. Muta il disegno.
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

// ---- sostituzione di componenti ----------------------------------------------------------------

export interface ReplaceResult {
  replaced: string[]
  /** componenti lasciati com'erano, con il motivo */
  skipped: { id: string; tag: string; reason: string }[]
}

/** Distanza massima (mm) tra una porta del pezzo vecchio e quella del nuovo a cui passa il collegamento. */
const REPLACE_REACH = 15

/**
 * Sostituisce il simbolo dei componenti indicati mantenendo posizione, rotazione, specchio e collegamenti.
 * Ogni porta collegata passa alla porta del nuovo simbolo con lo stesso nome (se è rivolta allo stesso lato e vicina),
 * altrimenti alla più vicina rivolta allo stesso lato. Se una porta collegata non trova posto il componente resta com'era.
 * Proprietà generiche (diametro, pressione, note, descrizione, stati per fase) si conservano; quelle del vecchio simbolo no.
 * Il tag si rinumera solo se era automatico e il prefisso cambia. Muta il documento.
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

    // assegnazione porta vecchia → porta nuova, una sola volta per porta nuova
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
      result.skipped.push({ id: c.id, tag: c.tag, reason: `il collegamento sulla porta «${failed}» non ha un punto corrispondente in ${def.name.it}` })
      continue
    }

    // proprietà: via quelle del vecchio simbolo, rimappate le estremità dichiarate
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

    // tag: rinumerato solo se automatico e se il prefisso cambia
    const auto = new RegExp(`^${old.tagPrefix}-\\d+$`).test(c.tag)
    if (auto && old.tagPrefix !== def.tagPrefix) c.tag = nextTag(doc, def.tagPrefix)

    for (const l of d.lines) {
      for (const r of [l.from, l.to]) if (r.componentId === c.id && map.has(r.portId)) r.portId = map.get(r.portId)!
    }
    c.symbol = symbolId
    c.props = props
    if (c.states && !(def.category === 'valves' && !def.id.startsWith('valve.check') && def.id !== 'valve.relief')) delete c.states
    // il tipo scritto a mano nella distinta riguardava il vecchio simbolo
    const ov = doc.bom.overrides[c.id]
    if (ov?.type) { delete ov.type; if (!Object.keys(ov).length) delete doc.bom.overrides[c.id] }
    result.replaced.push(c.id)
  }
  return result
}

/** Prefissi usati in passato da simboli che poi hanno cambiato sigla: i tag così fatti contano come automatici. */
const LEGACY_PREFIXES: Record<string, string[]> = {
  'valve.solenoid2': ['SV'],
  'valve.solenoid3': ['SV'],
  'instr.tt': ['TT'],
  'instr.wt': ['WT'],
}

/**
 * Rinumera da 1 i tag automatici (PREFISSO-numero) senza buchi, tenendo l'ordine che avevano; i tag scelti a mano non si toccano.
 * Serve per i progetti nati quando la numerazione partiva da 101. Restituisce quanti tag sono cambiati. Muta il documento.
 */
export function renumberTags(doc: FluidDocument): number {
  const byPrefix = new Map<string, { c: Component; n: number }[]>()
  for (const c of doc.drawing.components) {
    const prefix = getSymbol(c.symbol).tagPrefix
    const all = [prefix, ...(LEGACY_PREFIXES[c.symbol] ?? [])].join('|')
    const m = new RegExp(`^(?:${all})-(\\d+)$`).exec(c.tag)
    if (m) byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), { c, n: Number(m[1]) }])
  }
  // per evitare collisioni con tag a mano uguali a un numero libero, si salta quello già occupato
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
