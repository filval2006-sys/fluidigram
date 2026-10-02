import { componentPorts } from './scene'
import type { Component } from './types'

/**
 * Estremità dichiarata di una porta libera: il tubo non è disegnato, ma si dice dove va o da dove arriva.
 * Salvata in `props` (end.<porta> e endLabel.<porta>), quindi i file restano compatibili.
 */
export type EndKind = 'vent' | 'in' | 'out'

export const END_KINDS: readonly { id: EndKind; label: string }[] = [
  { id: 'vent', label: 'Sfiato in atmosfera' },
  { id: 'in', label: 'Arriva da un altro impianto' },
  { id: 'out', label: 'Va a un altro impianto' },
]

export interface PortEnd { portId: string; kind: EndKind; label: string }

const KIND = 'end.'
const LABEL = 'endLabel.'

const isKind = (v: string | undefined): v is EndKind => v === 'vent' || v === 'in' || v === 'out'

/** Testo mostrato accanto al simbolo: quello scritto dall'utente, altrimenti «ATM» per gli sfiati. */
export const endLabelText = (kind: EndKind, label: string): string => label.trim() || (kind === 'vent' ? 'ATM' : '')

export function portEnds(c: Component): PortEnd[] {
  const out: PortEnd[] = []
  for (const p of componentPorts(c)) {
    const k = c.props[KIND + p.id]
    if (isKind(k)) out.push({ portId: p.id, kind: k, label: c.props[LABEL + p.id] ?? '' })
  }
  return out
}

export const endOf = (c: Component, portId: string): PortEnd | undefined => portEnds(c).find((e) => e.portId === portId)

/** Imposta (o toglie, con kind vuoto) l'estremità di una porta. Muta il componente. */
export function setPortEnd(c: Component, portId: string, kind: EndKind | '', label = ''): void {
  if (!kind) { delete c.props[KIND + portId]; delete c.props[LABEL + portId]; return }
  c.props[KIND + portId] = kind
  if (label.trim()) c.props[LABEL + portId] = label.trim()
  else delete c.props[LABEL + portId]
}
