import { DIR_VEC, add, scale, type Point } from './geometry'
import { simplify, type Endpoint } from './routing'

/** Bounding rectangle (same format as worldExtent). */
export interface Box { minX: number; minY: number; maxX: number; maxY: number }

const G = 5 // search grid step (mm): the ports all lie on this grid
const PAD = 1.5 // clearance distance from components
const MARGIN = 45 // how much the search area exceeds the rectangle between the two ports
const TURN = 2.5 // penalty for each turn (prefers paths with fewer bends)
const NEAR = 0.35 // small penalty for nodes adjacent to an obstacle
const MAX_EXPANSIONS = 60_000

const DI = { N: 0, E: 1, S: 2, W: 3 } as const
const OPP = [2, 3, 0, 1]
const STEP = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]

class MinHeap {
  private a: { k: number; v: number }[] = []
  get size() { return this.a.length }
  push(k: number, v: number) {
    const a = this.a
    a.push({ k, v })
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].k <= a[i].k) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): { k: number; v: number } {
    const a = this.a
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < a.length && a[l].k < a[m].k) m = l
        if (r < a.length && a[r].k < a[m].k) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

const cache = new Map<string, Point[] | null>()

const sizeBox = (b: Box) => `${b.minX},${b.minY},${b.maxX},${b.maxY}`

/** True if the straight segment a→b crosses no obstacle (at the ends the component's border is ignored). */
function straightClear(a: Point, b: Point, boxes: Box[]): boolean {
  const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
  const n = Math.round(len / G)
  const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y)
  for (let i = 1; i < n; i++) {
    const x = a.x + ux * i * G, y = a.y + uy * i * G
    if (boxes.some((o) => x > o.minX - PAD && x < o.maxX + PAD && y > o.minY - PAD && y < o.maxY + PAD)) return false
  }
  return true
}

/**
 * Orthogonal routing that avoids components (A* on a 5 mm grid with turn penalties).
 * The path leaves the port by 5 mm in its direction and reaches the destination port the same way.
 * Returns null if no path exists (the caller falls back to simple routing).
 */
export function autoRoute(a: Endpoint, b: Endpoint, obstacles: Box[]): Point[] | null {
  const a1 = add(a.p, scale(DIR_VEC[a.dir], G))
  const b1 = add(b.p, scale(DIR_VEC[b.dir], G))

  const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y
  if ((dx === 0 || dy === 0) && DIR_VEC[a.dir].x * dx + DIR_VEC[a.dir].y * dy >= 0 && DIR_VEC[b.dir].x * -dx + DIR_VEC[b.dir].y * -dy >= 0) {
    if (straightClear(a.p, b.p, obstacles)) return simplify([a.p, b.p])
  }

  const x0 = Math.floor((Math.min(a1.x, b1.x, a.p.x, b.p.x) - MARGIN) / G) * G
  const y0 = Math.floor((Math.min(a1.y, b1.y, a.p.y, b.p.y) - MARGIN) / G) * G
  const x1 = Math.ceil((Math.max(a1.x, b1.x, a.p.x, b.p.x) + MARGIN) / G) * G
  const y1 = Math.ceil((Math.max(a1.y, b1.y, a.p.y, b.p.y) + MARGIN) / G) * G
  const near = obstacles.filter((o) => o.maxX + PAD > x0 && o.minX - PAD < x1 && o.maxY + PAD > y0 && o.minY - PAD < y1)

  const key = `${a.p.x},${a.p.y},${a.dir}|${b.p.x},${b.p.y},${b.dir}|${near.map(sizeBox).sort().join(';')}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit ? hit.map((p) => ({ ...p })) : null

  const W = (x1 - x0) / G + 1, H = (y1 - y0) / G + 1
  const blocked = new Uint8Array(W * H)
  for (const o of near) {
    const ixa = Math.max(0, Math.floor((o.minX - PAD - x0) / G) + 1)
    const ixb = Math.min(W - 1, Math.ceil((o.maxX + PAD - x0) / G) - 1)
    const iya = Math.max(0, Math.floor((o.minY - PAD - y0) / G) + 1)
    const iyb = Math.min(H - 1, Math.ceil((o.maxY + PAD - y0) / G) - 1)
    for (let iy = iya; iy <= iyb; iy++) for (let ix = ixa; ix <= ixb; ix++) blocked[iy * W + ix] = 1
  }
  const idx = (p: Point) => ((p.y - y0) / G) * W + (p.x - x0) / G
  // the ports themselves are never crossed
  for (const q of [a.p, b.p]) { const ix = (q.x - x0) / G, iy = (q.y - y0) / G; if (ix >= 0 && iy >= 0 && ix < W && iy < H) blocked[iy * W + ix] = 1 }
  const sI = idx(a1), gI = idx(b1)
  blocked[sI] = 0
  blocked[gI] = 0

  const N = W * H
  const gScore = new Float64Array(N * 5).fill(Infinity)
  const parent = new Int32Array(N * 5).fill(-1)
  const heap = new MinHeap()
  const goalDir = OPP[DI[b.dir]]
  const gx = (b1.x - x0) / G, gy = (b1.y - y0) / G
  const h = (i: number) => Math.abs((i % W) - gx) + Math.abs(Math.floor(i / W) - gy)

  const s0 = sI * 5 + DI[a.dir]
  gScore[s0] = 0
  heap.push(h(sI), s0)
  let found = -1
  for (let it = 0; heap.size && it < MAX_EXPANSIONS; it++) {
    const { v: s } = heap.pop()
    const node = Math.floor(s / 5), d = s % 5
    if (d === 4) { found = s; break } // terminal state: already includes the final turn
    const g = gScore[s]
    const nx = node % W, ny = Math.floor(node / W)
    for (let nd = 0; nd < 4; nd++) {
      if (nd === OPP[d] && d !== 4) continue // niente inversioni
      const mx = nx + STEP[nd].x, my = ny + STEP[nd].y
      if (mx < 0 || my < 0 || mx >= W || my >= H) continue
      const mi = my * W + mx
      if (blocked[mi]) continue
      let cost = g + 1 + (nd === d ? 0 : TURN)
      if (!blocked[mi] && ((mx > 0 && blocked[mi - 1]) || (mx < W - 1 && blocked[mi + 1]) || (my > 0 && blocked[mi - W]) || (my < H - 1 && blocked[mi + W]))) cost += NEAR
      if (mi === gI) {
        const term = mi * 5 + 4
        const total = cost + (nd === goalDir ? 0 : TURN)
        if (total < gScore[term]) { gScore[term] = total; parent[term] = s; heap.push(total, term) }
      }
      const ns = mi * 5 + nd
      if (cost < gScore[ns]) { gScore[ns] = cost; parent[ns] = s; heap.push(cost + h(mi), ns) }
    }
  }

  let result: Point[] | null = null
  if (found >= 0) {
    const nodes: Point[] = []
    for (let s = found; s !== -1; s = parent[s]) {
      const node = Math.floor(s / 5)
      const p = { x: x0 + (node % W) * G, y: y0 + Math.floor(node / W) * G }
      const last = nodes[nodes.length - 1]
      if (!last || last.x !== p.x || last.y !== p.y) nodes.push(p)
    }
    nodes.reverse()
    result = simplify([a.p, ...nodes, b.p])
  } else if (sI === gI) {
    result = simplify([a.p, a1, b.p])
  }
  if (cache.size > 3000) cache.clear()
  cache.set(key, result)
  return result ? result.map((p) => ({ ...p })) : null
}

