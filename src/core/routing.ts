import { DIR_VEC, add, samePoint, scale, type Dir, type Point } from './geometry'

export interface Endpoint { p: Point; dir: Dir }

const isHorizontal = (d: Dir) => d === 'E' || d === 'W'

/** Rimuove punti duplicati e intermedi collineari. */
export function simplify(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    if (out.length && samePoint(out[out.length - 1], p)) continue
    out.push(p)
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1]
    // si elimina il punto intermedio solo se è davvero sul percorso (non un'inversione di marcia)
    const straightX = a.x === b.x && b.x === c.x && (b.y - a.y) * (c.y - b.y) > 0
    const straightY = a.y === b.y && b.y === c.y && (b.x - a.x) * (c.x - b.x) > 0
    if (straightX || straightY) out.splice(i, 1)
  }
  return out
}

/**
 * Instradamento ortogonale (euristico, fase 0).
 * - porte allineate e rivolte l'una verso l'altra → segmento diretto;
 * - altrimenti uscita di `stub` mm dalla porta, poi L o Z.
 * Non evita ancora gli ostacoli: lo farà l'instradatore avanzato (fase 1).
 */
export function routeLine(a: Endpoint, b: Endpoint, stub = 5): Point[] {
  const dx = b.p.x - a.p.x
  const dy = b.p.y - a.p.y
  const aligned = dx === 0 || dy === 0
  if (aligned) {
    const v = DIR_VEC[a.dir]
    const facing = v.x * dx + v.y * dy >= 0
    if (facing) return simplify([a.p, b.p])
  }

  const a1 = add(a.p, scale(DIR_VEC[a.dir], stub))
  const b1 = add(b.p, scale(DIR_VEC[b.dir], stub))
  let mid: Point[]
  if (isHorizontal(a.dir) === isHorizontal(b.dir)) {
    // Z: due tratti paralleli collegati da uno perpendicolare a metà strada
    mid = isHorizontal(a.dir)
      ? [{ x: (a1.x + b1.x) / 2, y: a1.y }, { x: (a1.x + b1.x) / 2, y: b1.y }]
      : [{ x: a1.x, y: (a1.y + b1.y) / 2 }, { x: b1.x, y: (a1.y + b1.y) / 2 }]
  } else {
    // L: un solo gomito
    mid = isHorizontal(a.dir) ? [{ x: b1.x, y: a1.y }] : [{ x: a1.x, y: b1.y }]
  }
  return simplify([a.p, a1, ...mid, b1, b.p])
}
