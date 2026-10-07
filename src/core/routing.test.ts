import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { autoRoute, type Box } from './autoroute'
import { moveSegment, nearestOnRoute, endsAreValid } from './routeEdit'
import { addComponent, branchFromLine, connectPorts, reconnectLine } from './edit'
import { createEmptyDocument } from './documents'
import { lineRoute, manualRouteValid, obstaclesOf, worldExtent } from './scene'
import { checkIntegrity } from './validate'
import type { Dir, Point } from './geometry'

const ortho = (r: Point[]) => r.every((p, i) => i === 0 || p.x === r[i - 1].x || p.y === r[i - 1].y)
const insideBox = (p: Point, b: Box) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY
/** no point of the polyline (sampled every mm) falls inside an obstacle */
function crosses(r: Point[], boxes: Box[]): boolean {
  for (let i = 1; i < r.length; i++) {
    const n = Math.max(1, Math.round(Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)))
    for (let k = 0; k <= n; k++) {
      const p = { x: r[i - 1].x + ((r[i].x - r[i - 1].x) * k) / n, y: r[i - 1].y + ((r[i].y - r[i - 1].y) * k) / n }
      if (boxes.some((b) => insideBox(p, b))) return true
    }
  }
  return false
}

describe('routing that avoids obstacles', () => {
  it('free straight line: direct segment', () => {
    expect(autoRoute({ p: { x: 0, y: 0 }, dir: 'E' }, { p: { x: 40, y: 0 }, dir: 'W' }, [])).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }])
  })
  it('goes around an obstacle between two aligned ports', () => {
    const wall: Box = { minX: 15, maxX: 25, minY: -20, maxY: 20 }
    const r = autoRoute({ p: { x: 0, y: 0 }, dir: 'E' }, { p: { x: 40, y: 0 }, dir: 'W' }, [wall])!
    expect(r).not.toBeNull()
    expect(ortho(r)).toBe(true)
    expect(crosses(r, [wall])).toBe(false)
    expect(r[0]).toEqual({ x: 0, y: 0 })
    expect(r.at(-1)).toEqual({ x: 40, y: 0 })
    expect(endsAreValid(r, 'E', 'W')).toBe(true)
  })
  it('ports with different directions: respects exit and entry', () => {
    const cases: [Dir, Dir][] = [['E', 'N'], ['S', 'W'], ['N', 'N'], ['W', 'E']]
    for (const [da, db] of cases) {
      const r = autoRoute({ p: { x: 0, y: 0 }, dir: da }, { p: { x: 60, y: 45 }, dir: db }, [{ minX: 20, maxX: 40, minY: 10, maxY: 35 }])!
      expect(endsAreValid(r, da, db)).toBe(true)
    }
  })
  it('a path has few turns when space is free (L = 1 elbow)', () => {
    const r = autoRoute({ p: { x: 0, y: 0 }, dir: 'E' }, { p: { x: 30, y: 30 }, dir: 'N' }, [])!
    expect(r).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }])
  })
  it('if the destination is surrounded it returns null without hanging', () => {
    const ring: Box[] = [{ minX: 35, maxX: 45, minY: -200, maxY: 200 }, { minX: -300, maxX: 300, minY: 20, maxY: 25 }, { minX: -300, maxX: 300, minY: -25, maxY: -20 }]
    const t0 = Date.now()
    autoRoute({ p: { x: 0, y: 0 }, dir: 'E' }, { p: { x: 60, y: 0 }, dir: 'W' }, ring)
    expect(Date.now() - t0).toBeLessThan(2000)
  })
  it('lineRoute: the drawing never crosses components', () => {
    const doc = produce(createEmptyDocument(), (d) => {
      const t = addComponent(d, 'vessel.tank', 40, 60)
      const wall = addComponent(d, 'vessel.tank', 100, 60) // in mezzo
      const v = addComponent(d, 'valve.ball', 160, 60)
      void wall
      connectPorts(d.drawing, { componentId: t.id, portId: 'right' }, { componentId: v.id, portId: 'a' }, 'oxidizer', 'Ø6 mm')
    })
    const r = lineRoute(doc.drawing, doc.drawing.lines[0])
    const wallBox = worldExtent(doc.drawing.components[1])
    expect(crosses(r, [wallBox])).toBe(false)
    expect(ortho(r)).toBe(true)
  })
})

describe('segment editing', () => {
  const Z: Point[] = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 60, y: 30 }]
  it('inner leg: moves as a block', () => {
    const r = moveSegment(Z, 1, 10, 'E', 'W')!
    expect(r).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 60, y: 30 }])
  })
  it('exit leg: a 5 mm stub stays attached to the port', () => {
    const r = moveSegment(Z, 0, 10, 'E', 'W')!
    expect(r[0]).toEqual({ x: 0, y: 0 })
    expect(r[1]).toEqual({ x: 5, y: 0 })
    expect(endsAreValid(r, 'E', 'W')).toBe(true)
    expect(ortho(r)).toBe(true)
  })
  it('straight line: creates a detour', () => {
    const r = moveSegment([{ x: 0, y: 0 }, { x: 60, y: 0 }], 0, 15, 'E', 'W')!
    expect(r.length).toBe(6)
    expect(endsAreValid(r, 'E', 'W')).toBe(true)
    expect(Math.max(...r.map((p) => Math.abs(p.y)))).toBe(15)
  })
  it('rejects edits that would break the port directions', () => {
    expect(moveSegment([{ x: 0, y: 0 }, { x: 5, y: 0 }], 0, 5, 'E', 'W')).toBeNull()
    expect(moveSegment(Z, 1, 0, 'E', 'W')).toBeNull()
  })
  it('nearestOnRoute snaps to the grid and stays away from the vertices', () => {
    const hit = nearestOnRoute(Z, { x: 11, y: 2 })!
    expect(hit.point).toEqual({ x: 10, y: 0 })
    const nearCorner = nearestOnRoute(Z, { x: 19, y: 0 })!
    expect(nearCorner.point.x).toBeLessThanOrEqual(15)
  })
})

describe('reconnection and branches', () => {
  const base = () => produce(createEmptyDocument(), (d) => {
    const a = addComponent(d, 'valve.ball', 40, 60), b = addComponent(d, 'valve.ball', 140, 60)
    const t = addComponent(d, 'vessel.tank', 90, 120)
    connectPorts(d.drawing, { componentId: a.id, portId: 'b' }, { componentId: b.id, portId: 'a' }, 'oxidizer', 'Ø6 mm')
    d.drawing.lines[0].pressure = '40'
    void t
  })
  it('reconnectLine moves the end to a free port and rejects occupied ones', () => {
    const doc = base()
    const tank = doc.drawing.components[2]
    const line = doc.drawing.lines[0]
    const out = produce(doc, (d) => { expect(reconnectLine(d.drawing, line.id, 'to', { componentId: tank.id, portId: 'top' })).toBe(true) })
    expect(out.drawing.lines[0].to).toEqual({ componentId: tank.id, portId: 'top' })
    produce(doc, (d) => { expect(reconnectLine(d.drawing, line.id, 'to', { componentId: doc.drawing.components[0].id, portId: 'b' })).toBe(false) })
  })
  it('branchFromLine inserts a junction, splits the line and connects the branch', () => {
    const doc = base()
    const tank = doc.drawing.components[2]
    const line = doc.drawing.lines[0]
    const out = produce(doc, (d) => {
      const jid = branchFromLine(d, line.id, { x: 90, y: 62 }, { componentId: tank.id, portId: 'top' })
      expect(jid).toBeDefined()
    })
    expect(out.drawing.lines).toHaveLength(3)
    expect(out.drawing.components.some((c) => c.symbol === 'fitting.junction')).toBe(true)
    expect(out.drawing.lines.every((l) => l.fluid === 'oxidizer' && l.size === 'Ø6 mm')).toBe(true)
    expect(out.drawing.lines.filter((l) => l.pressure === '40')).toHaveLength(2) // the two halves inherit the pressure
    expect(checkIntegrity(out)).toEqual([])
    const j = out.drawing.components.find((c) => c.symbol === 'fitting.junction')!
    expect(j.x % 5).toBe(0)
    // the junction is connected on 3 ports
    const used = out.drawing.lines.flatMap((l) => [l.from, l.to]).filter((r) => r.componentId === j.id)
    expect(used).toHaveLength(3)
    expect(new Set(used.map((u) => u.portId)).size).toBe(3)
  })
  it('manual route: valid only if the ports have not moved', () => {
    const doc = base()
    const l = doc.drawing.lines[0]
    const manual = produce(doc, (d) => { d.drawing.lines[0].route = lineRoute(d.drawing, l).map((p) => ({ ...p })) })
    expect(manualRouteValid(manual.drawing, manual.drawing.lines[0])).toBe(true)
    const moved = produce(manual, (d) => { d.drawing.components[0].y += 10 })
    expect(manualRouteValid(moved.drawing, moved.drawing.lines[0])).toBe(false)
    expect(obstaclesOf(moved.drawing)).toHaveLength(3)
  })
})
