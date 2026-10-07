import { componentPorts } from './scene'
import type { Component, L10n } from './types'

/**
 * Declared end of a free port: the pipe is not drawn, but it says where it goes to or comes from.
 * Saved in `props` (end.<port> and endLabel.<port>), so files stay compatible.
 */
export type EndKind = 'vent' | 'in' | 'out'

export const END_KINDS: readonly { id: EndKind; label: L10n }[] = [
  { id: 'vent', label: { it: 'Sfiato in atmosfera', en: 'Vent to atmosphere' } },
  { id: 'in', label: { it: 'Arriva da un altro impianto', en: 'Comes from another system' } },
  { id: 'out', label: { it: 'Va a un altro impianto', en: 'Goes to another system' } },
]

export interface PortEnd { portId: string; kind: EndKind; label: string }

const KIND = 'end.'
const LABEL = 'endLabel.'

const isKind = (v: string | undefined): v is EndKind => v === 'vent' || v === 'in' || v === 'out'

/** Text shown next to the symbol: the one typed by the user, otherwise "ATM" for vents. */
export const endLabelText = (kind: EndKind, label: string): string => label.trim() || (kind === 'vent' ? 'ATM' : '')

export function portEnds(c: Component): PortEnd[] {
  const out: PortEnd[] = []
  for (const p of componentPorts(c)) {
    const k = c.props[KIND + p.id]
    if (isKind(k)) out.push({ portId: p.id, kind: k, label: c.props[LABEL + p.id] ?? '' })
  }
  return out
}


/** Sets (or removes, with empty kind) the end of a port. Mutates the component. */
export function setPortEnd(c: Component, portId: string, kind: EndKind | '', label = ''): void {
  if (!kind) { delete c.props[KIND + portId]; delete c.props[LABEL + portId]; return }
  c.props[KIND + portId] = kind
  if (label.trim()) c.props[LABEL + portId] = label.trim()
  else delete c.props[LABEL + portId]
}
