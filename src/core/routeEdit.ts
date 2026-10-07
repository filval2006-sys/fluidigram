import { DIR_VEC, type Dir, type Point } from './geometry'
import { simplify } from './routing'

const STUB = 5

const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0)
const isHoriz = (a: Point, b: Point) => a.y === b.y

/** The first and last leg must leave/enter in the direction of the ports. */
export function endsAreValid(pts: Point[], aDir: Dir, bDir: Dir): boolean {
  if (pts.length < 2) return false
  const dirOf = (p: Point, q: Point) => ({ x: sign(q.x - p.x), y: sign(q.y - p.y) })
  const f = dirOf(pts[0], pts[1])
  const l = dirOf(pts[pts.length - 1], pts[pts.length - 2])
  const A = DIR_VEC[aDir], B = DIR_VEC[bDir]
  const ortho = pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y)
  return ortho && f.x === A.x && f.y === A.y && l.x === B.x && l.y === B.y
}

/**
 * Moves leg `i` by `d` mm in the perpendicular direction.
 * - inner leg: moves together with its two vertices;
 * - leg touching a port: a 5 mm stub stays attached to the port and the rest moves (with a step);
 * - straight line: a detour is created between the two exit legs.
 * Returns null if the edit is not possible.
 */
export function moveSegment(pts: Point[], i: number, d: number, aDir: Dir, bDir: Dir): Point[] | null {
  const n = pts.length
  if (i < 0 || i >= n - 1 || d === 0) return null
  const P = pts[i], Q = pts[i + 1]
  const horizontal = isHoriz(P, Q)
  if (!horizontal && P.x !== Q.x) return null
  const shift = (p: Point): Point => (horizontal ? { x: p.x, y: p.y + d } : { x: p.x + d, y: p.y })
  const u = horizontal ? { x: sign(Q.x - P.x), y: 0 } : { x: 0, y: sign(Q.y - P.y) }
  const len = Math.abs(Q.x - P.x) + Math.abs(Q.y - P.y)
  const at = (p: Point, k: number): Point => ({ x: p.x + u.x * k, y: p.y + u.y * k })

  let out: Point[]
  if (n === 2) {
    if (len < 4 * STUB) return null
    const s1 = at(P, STUB), s2 = at(Q, -STUB)
    out = [P, s1, shift(s1), shift(s2), s2, Q]
  } else if (i === 0) {
    if (len < 2 * STUB) return null
    const s = at(P, STUB)
    out = [P, s, shift(s), shift(Q), ...pts.slice(2)]
  } else if (i === n - 2) {
    if (len < 2 * STUB) return null
    const s = at(Q, -STUB)
    out = [...pts.slice(0, n - 2), shift(P), shift(s), s, Q]
  } else {
    out = pts.map((p, k) => (k === i || k === i + 1 ? shift(p) : { ...p }))
  }
  out = simplify(out)
  return endsAreValid(out, aDir, bDir) ? out : null
}

/** Point of the line nearest to `p`, snapped to the 5 mm grid and kept away from the vertices. */
export function nearestOnRoute(pts: Point[], p: Point): { point: Point; segment: number; dist: number } | null {
  let best: { point: Point; segment: number; dist: number } | null = null
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const horizontal = a.y === b.y
    const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y)
    const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y)
    // the branch point stays at least 5 mm from the vertices, on the grid
    const first = Math.ceil((lo + STUB) / STUB) * STUB
    const last = Math.floor((hi - STUB) / STUB) * STUB
    if (first > last) continue
    const t = Math.min(last, Math.max(first, Math.round((horizontal ? p.x : p.y) / STUB) * STUB))
    const point = horizontal ? { x: t, y: a.y } : { x: a.x, y: t }
    const dist = Math.hypot(point.x - p.x, point.y - p.y)
    if (!best || dist < best.dist) best = { point, segment: i, dist }
  }
  return best
}
