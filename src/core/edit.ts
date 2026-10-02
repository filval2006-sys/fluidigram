import type { Dir } from './geometry'
import { GRID } from './geometry'
import { componentPorts, lineRoute } from './scene'
import { nearestOnRoute } from './routeEdit'
import { setPortEnd } from './endpoints'
import { getSymbol } from './symbols/library'
import type { Annotation, Component, Drawing, FluidDocument, FluidId, PortRef } from './types'

export const snap = (v: number): number => Math.round(v / GRID) * GRID

export const newId = (prefix: string): string => `${prefix}${Math.random().toString(36).slice(2, 9)}`

/** Prossimo tag libero per un prefisso (BV-101, BV-102...), univoco in tutto il documento. */
export function nextTag(doc: FluidDocument, prefix: string): string {
  let max = 100
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
