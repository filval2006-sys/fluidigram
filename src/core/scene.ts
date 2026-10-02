import { dirToWorld, localToWorld, type Dir, type Placement, type Point } from './geometry'
import { autoRoute, type Box } from './autoroute'
import { routeLine } from './routing'
import { getSymbol, resolveSymbol } from './symbols/library'
import type { Component, Drawing, Line, PortRef } from './types'

export const placementOf = (c: Component): Placement => ({ x: c.x, y: c.y, rotation: c.rotation, mirror: c.mirror })

export interface WorldPort { id: string; p: Point; dir: Dir }

export function componentPorts(c: Component): WorldPort[] {
  const def = getSymbol(c.symbol)
  const pl = placementOf(c)
  return def.ports.map((port) => ({
    id: port.id,
    p: localToWorld(def, pl, port),
    dir: dirToWorld(port.dir, pl),
  }))
}

export function resolvePort(sheet: Drawing, ref: PortRef): WorldPort | undefined {
  const c = sheet.components.find((x) => x.id === ref.componentId)
  return c && componentPorts(c).find((p) => p.id === ref.portId)
}

/** Ingombri da evitare: tutti i componenti tranne le giunzioni (un puntino). */
export function obstaclesOf(sheet: Drawing): Box[] {
  return sheet.components.filter((c) => c.symbol !== 'fitting.junction').map(worldExtent)
}

const samePt = (a: Point, b: Point) => a.x === b.x && a.y === b.y

/** Il percorso manuale vale solo finché le porte sono dove erano quando è stato tracciato. */
export function manualRouteValid(sheet: Drawing, line: Line): boolean {
  const a = resolvePort(sheet, line.from)
  const b = resolvePort(sheet, line.to)
  return !!(a && b && line.route && line.route.length >= 2 && samePt(line.route[0], a.p) && samePt(line.route[line.route.length - 1], b.p))
}

/** Percorso della linea: quello manuale se valido, altrimenti l'instradamento automatico che evita i componenti. */
export function lineRoute(sheet: Drawing, line: Line): Point[] {
  const a = resolvePort(sheet, line.from)
  const b = resolvePort(sheet, line.to)
  if (!a || !b) return []
  if (manualRouteValid(sheet, line)) return line.route!
  return autoRoute(a, b, obstaclesOf(sheet)) ?? routeLine(a, b)
}

/** Rettangolo d'ingombro del disegno in coordinate foglio. */
export function worldExtent(c: Component): { minX: number; minY: number; maxX: number; maxY: number } {
  const def = getSymbol(c.symbol)
  const e = resolveSymbol(def, c.props).extent
  const pl = placementOf(c)
  const pts = [
    { x: e.x, y: e.y }, { x: e.x + e.w, y: e.y },
    { x: e.x, y: e.y + e.h }, { x: e.x + e.w, y: e.y + e.h },
  ].map((p) => localToWorld(def, pl, p))
  return {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
  }
}
