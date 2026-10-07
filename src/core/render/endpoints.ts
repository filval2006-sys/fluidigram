import { DIR_VEC, type Dir } from '../geometry'
import { endLabelText, portEnds, type EndKind } from '../endpoints'
import { componentPorts } from '../scene'
import type { Component } from '../types'
import { INK, SYMBOL_STROKE, n, textEl, textWidth } from './svg'

const TEXT_SIZE = 2
const STUB = 4
const REACH = 8

export interface EndMarker { svg: string; box: { minX: number; minY: number; maxX: number; maxY: number } }

const polyline = (pts: [number, number][], close = false, fill = 'none') =>
  `<path d="M${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')}${close ? ' Z' : ''}" fill="${fill}" stroke="${INK}" stroke-width="${SYMBOL_STROKE}" stroke-linejoin="round" stroke-linecap="round"/>`

function marker(kind: EndKind, p: { x: number; y: number }, dir: Dir, label: string): EndMarker {
  const u = DIR_VEC[dir]
  const v = { x: -u.y, y: u.x }
  const at = (a: number, b = 0): [number, number] => [p.x + u.x * a + v.x * b, p.y + u.y * a + v.y * b]
  let svg = ''
  if (kind === 'vent') {
    // stroke and arrowhead open towards the outside
    svg += polyline([at(0), at(6)])
    svg += polyline([at(4, 1.6), at(6.2), at(4, -1.6)])
  } else if (kind === 'in') {
    // the fluid arrives: triangle pointing towards the component
    svg += polyline([at(0), at(STUB)])
    svg += polyline([at(STUB + 0.2), at(REACH - 1, 1.6), at(REACH - 1, -1.6)], true, INK)
  } else {
    // the fluid leaves: triangle pointing outwards
    svg += polyline([at(0), at(STUB - 1)])
    svg += polyline([at(REACH - 1), at(STUB - 0.8, 1.6), at(STUB - 0.8, -1.6)], true, INK)
  }
  const w = textWidth(label, TEXT_SIZE), h = TEXT_SIZE * 1.2
  const tip = kind === 'vent' ? 7 : REACH
  const [bx, by] = at(tip, 0)
  let box = { minX: Math.min(p.x, bx) - 1.8, maxX: Math.max(p.x, bx) + 1.8, minY: Math.min(p.y, by) - 1.8, maxY: Math.max(p.y, by) + 1.8 }
  if (label) {
    const horizontal = dir === 'E' || dir === 'W'
    const tx = horizontal ? p.x + u.x * (tip + 1) : p.x
    const ty = horizontal ? p.y : p.y + u.y * (tip + 1 + h / 2)
    svg += textEl(tx, ty, label, { size: TEXT_SIZE, anchor: horizontal ? (dir === 'E' ? 'start' : 'end') : 'middle' })
    const minX = horizontal ? (dir === 'E' ? tx : tx - w) : tx - w / 2
    const minY = ty - h / 2
    box = {
      minX: Math.min(box.minX, minX), maxX: Math.max(box.maxX, minX + w),
      minY: Math.min(box.minY, minY), maxY: Math.max(box.maxY, minY + h),
    }
  }
  return { svg, box }
}

/** Symbols for a component's declared ends (in sheet coordinates). */
export function endMarkers(c: Component): EndMarker[] {
  const ports = componentPorts(c)
  return portEnds(c).flatMap((e) => {
    const port = ports.find((p) => p.id === e.portId)
    return port ? [marker(e.kind, port.p, port.dir, endLabelText(e.kind, e.label))] : []
  })
}
