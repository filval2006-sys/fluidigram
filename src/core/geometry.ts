export interface Point { x: number; y: number }
export type Dir = 'N' | 'E' | 'S' | 'W'
type Rotation = 0 | 90 | 180 | 270

/** Passo della griglia in mm: tutte le porte e i centri stanno su questa griglia. */
export const GRID = 5

export const DIR_VEC: Record<Dir, Point> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
}

const CLOCKWISE: Dir[] = ['N', 'E', 'S', 'W']

function rotateDir(d: Dir, rot: Rotation): Dir {
  return CLOCKWISE[(CLOCKWISE.indexOf(d) + rot / 90) % 4]
}

function mirrorDir(d: Dir): Dir {
  return d === 'E' ? 'W' : d === 'W' ? 'E' : d
}

export interface Placement { x: number; y: number; rotation: Rotation; mirror: boolean }

/** Rotazione oraria (asse y verso il basso), esatta sugli interi. */
function rotate(p: Point, rot: Rotation): Point {
  switch (rot) {
    case 0: return { x: p.x, y: p.y }
    case 90: return { x: -p.y, y: p.x }
    case 180: return { x: -p.x, y: -p.y }
    case 270: return { x: p.y, y: -p.x }
  }
}

/**
 * Coordinate locali del simbolo (origine in alto a sinistra del box w×h) → foglio.
 * Ordine: centra → specchia → ruota → trasla. Equivale al transform SVG
 * `translate(x y) rotate(r) scale(±1 1) translate(-w/2 -h/2)`.
 */
export function localToWorld(size: { w: number; h: number }, pl: Placement, p: Point): Point {
  const cx = p.x - size.w / 2
  const cy = p.y - size.h / 2
  const r = rotate({ x: pl.mirror ? -cx : cx, y: cy }, pl.rotation)
  return { x: r.x + pl.x, y: r.y + pl.y }
}

export function dirToWorld(d: Dir, pl: Placement): Dir {
  return rotateDir(pl.mirror ? mirrorDir(d) : d, pl.rotation)
}

export function add(a: Point, b: Point): Point { return { x: a.x + b.x, y: a.y + b.y } }
export function scale(a: Point, k: number): Point { return { x: a.x * k, y: a.y * k } }
export function samePoint(a: Point, b: Point): boolean { return a.x === b.x && a.y === b.y }
