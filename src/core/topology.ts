import { getSymbol } from './symbols/library'
import type { Component, Drawing } from './types'

export class UnionFind {
  private p = new Map<string, string>()
  find(a: string): string {
    if (!this.p.has(a)) this.p.set(a, a)
    let r = a
    while (this.p.get(r) !== r) r = this.p.get(r)!
    this.p.set(a, r)
    return r
  }
  union(a: string, b: string): void { this.p.set(this.find(a), this.find(b)) }
}

export const portKey = (c: string, p: string): string => `${c}:${p}`

/** Components whose ports are all the same fluid point (the fluid passes freely). */
export const JOIN_ALL = new Set([
  'fitting.junction', 'fitting.filter', 'fitting.orifice', 'fitting.reducer', 'fitting.flange', 'fitting.hose', 'fitting.qd', 'engine.injector',
])

/** Valves for which it makes sense to state the per-phase state (check and relief valves work on their own). */
function isPhaseValve(c: Component): boolean {
  const def = getSymbol(c.symbol)
  return def.category === 'valves' && !def.id.startsWith('valve.check') && def.id !== 'valve.relief'
}

export const phaseValves = (d: Drawing): Component[] => d.components.filter(isPhaseValve)
