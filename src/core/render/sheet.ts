import { FLUIDS } from '../fluids'
import { componentPorts, lineRoute, placementOf, worldExtent } from '../scene'
import { getSymbol, resolveSymbol } from '../symbols/library'
import type { Component, Drawing, Line, ValveState } from '../types'
import type { Dir } from '../geometry'
import { dirToWorld } from '../geometry'
import { endMarkers } from './endpoints'
import { LINE_LABEL_SIZE, TAG_SIZE, lineLabelText, textWidth, type LabelPlace } from './labels'
import { INK, n, primsToSvg, textEl } from './svg'


export interface ComponentRenderOptions {
  /** state in the shown phase: closed = filled valve body */
  state?: ValveState
  /** where to write the tag (from planLabels); without it, picks a free side of the component alone */
  label?: LabelPlace
}

export function renderComponent(c: Component, opts: ComponentRenderOptions = {}): string {
  const def = getSymbol(c.symbol)
  const rs = resolveSymbol(def, c.props)
  const rot = def.fixedBody ? 0 : c.rotation
  const sx = c.mirror && !def.fixedBody ? -1 : 1
  const tr = `translate(${n(c.x)} ${n(c.y)}) rotate(${rot}) scale(${sx} 1) translate(${n(-def.w / 2)} ${n(-def.h / 2)})`
  // the text counter-rotates to stay readable
  const upright = (x: number, y: number) => `translate(${n(x)} ${n(y)}) scale(${sx} 1) rotate(${-rot})`
  let body = primsToSvg(rs.prims, upright)
  // closed valve: the first white fill is the body (triangles)
  if (opts.state === 'closed') body = body.replace('fill="#fff"', `fill="${INK}"`)
  let s = `<g data-tag="${c.tag}" transform="${tr}">${body}</g>`

  if (def.labelInside) {
    const li = def.labelInside
    const size = li.size ?? 2.2
    // position of the inner point in sheet coordinates
    const ext = worldExtent(c)
    const cx = (ext.minX + ext.maxX) / 2
    const cy = (ext.minY + ext.maxY) / 2
    // for symbols with an inner label the center of the extent coincides with the center of the box
    const m = /^([A-Za-z]+)-?(.*)$/.exec(c.tag)
    if (li.split && m) {
      s += textEl(cx, cy - size * 0.55, m[1], { size, bold: true })
      s += textEl(cx, cy + size * 0.65, m[2], { size })
    } else {
      s += textEl(cx, cy, c.tag, { size, bold: true })
    }
  } else {
    let pos = opts.label
    if (!pos) {
      const blocked = new Set<Dir>([
        ...componentPorts(c).map((p) => p.dir),
        ...(rs.avoidSides ?? []).map((d) => dirToWorld(d, placementOf(c))),
      ])
      const e = worldExtent(c)
      const cx = (e.minX + e.maxX) / 2
      const cy = (e.minY + e.maxY) / 2
      const side = (['S', 'N', 'E', 'W'] as Dir[]).find((d) => !blocked.has(d)) ?? 'S'
      pos = {
        S: { x: cx, y: e.maxY + 3, anchor: 'middle' as const },
        N: { x: cx, y: e.minY - 3, anchor: 'middle' as const },
        E: { x: e.maxX + 2, y: cy, anchor: 'start' as const },
        W: { x: e.minX - 2, y: cy, anchor: 'end' as const },
      }[side]
    }
    s += textEl(pos.x, pos.y, c.tag, { size: TAG_SIZE, anchor: pos.anchor, bold: true })
  }
  for (const m of endMarkers(c)) s += m.svg
  return s
}

/** `label`: position chosen by planLabels; if omitted uses the center of the longest segment. */
export function renderLine(sheet: Drawing, line: Line, color: boolean, label?: LabelPlace | null): string {
  const pts = lineRoute(sheet, line)
  const f = FLUIDS[line.fluid]
  // direct connection (ports in contact, e.g. sensor mounted on the vessel): no pipe, just a stub
  if (pts.length === 1) return `<circle cx="${n(pts[0].x)}" cy="${n(pts[0].y)}" r="0.9" fill="${color ? f.color : INK}"/>`
  if (pts.length < 2) return ''
  const dash = f.dash ? ` stroke-dasharray="${f.dash}"` : ''
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)},${n(p.y)}`).join(' ')
  let s = `<path data-line="${line.id}" d="${d}" fill="none" stroke="${color ? f.color : INK}" stroke-width="${f.width}"${dash} stroke-linejoin="round"/>`

  let pos = label
  if (pos === undefined) {
    // label (fluid code + size) on the longest segment
    const segLen = (i: number) => Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y)
    let best = 0
    for (let i = 1; i < pts.length - 1; i++) if (segLen(i) > segLen(best)) best = i
    const a = pts[best], b = pts[best + 1]
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    const text = lineLabelText(line.fluid, line.size)
    pos = segLen(best) >= textWidth(text, LINE_LABEL_SIZE) + 3
      ? (a.y === b.y ? { x: mx, y: my - 1.5, anchor: 'middle' } : { x: mx + 1.5, y: my, anchor: 'start' })
      : null
  }
  if (pos) s += textEl(pos.x, pos.y, lineLabelText(line.fluid, line.size), { size: LINE_LABEL_SIZE, color: '#333', anchor: pos.anchor })
  return s
}
