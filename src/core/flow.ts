import { portEnds } from './endpoints'
import { getSymbol } from './symbols/library'
import { JOIN_ALL, UnionFind, portKey } from './topology'
import type { FluidDocument, FluidId } from './types'

interface FlowGroup {
  fluids: Set<FluidId>
  lineIds: Set<string>
  componentIds: Set<string>
  /** il gruppo tocca un serbatoio (una sorgente di fluido) */
  fed: boolean
}

export interface FlowResult {
  /** linee raggiunte da un serbatoio attraverso valvole non chiuse */
  live: Set<string>
  groups: FlowGroup[]
}

/**
 * Propagazione statica del fluido in una fase: le valvole chiuse (o non specificate se sono pirotecniche)
 * bloccano, quelle aperte o non specificate lasciano passare. I serbatoi separano i gruppi e fanno da sorgente.
 */
export function traceFlow(doc: FluidDocument, phaseId: string): FlowResult {
  const d = doc.drawing
  const uf = new UnionFind()
  for (const l of d.lines) uf.union(portKey(l.from.componentId, l.from.portId), portKey(l.to.componentId, l.to.portId))
  for (const c of d.components) {
    const def = getSymbol(c.symbol)
    const keys = def.ports.map((p) => portKey(c.id, p.id))
    keys.forEach((k) => uf.find(k))
    let passes = JOIN_ALL.has(def.id)
    if (def.category === 'valves' && def.id !== 'valve.relief') {
      const st = c.states?.[phaseId]
      passes = def.id === 'valve.pyro' ? st === 'open' : st !== 'closed'
    }
    if (passes) for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i])
  }

  const groups = new Map<string, FlowGroup>()
  const g = (key: string): FlowGroup => {
    const r = uf.find(key)
    if (!groups.has(r)) groups.set(r, { fluids: new Set(), lineIds: new Set(), componentIds: new Set(), fed: false })
    return groups.get(r)!
  }
  for (const c of d.components) {
    const def = getSymbol(c.symbol)
    for (const p of def.ports) {
      const gr = g(portKey(c.id, p.id))
      gr.componentIds.add(c.id)
      if (def.category === 'vessels') gr.fed = true
    }
    // ingresso da un altro impianto (es. attacco di riempimento): alimenta la linea come un serbatoio
    for (const e of portEnds(c)) if (e.kind === 'in') g(portKey(c.id, e.portId)).fed = true
  }
  for (const l of d.lines) {
    const gr = g(portKey(l.from.componentId, l.from.portId))
    gr.lineIds.add(l.id)
    gr.fluids.add(l.fluid)
  }
  const live = new Set<string>()
  for (const gr of groups.values()) if (gr.fed) gr.lineIds.forEach((id) => live.add(id))
  return { live, groups: [...groups.values()].filter((x) => x.lineIds.size > 0) }
}
