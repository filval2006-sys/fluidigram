import type { FluidId, L10n } from './types'

export interface FluidDef {
  id: FluidId
  name: L10n
  /** codice breve stampato sulla linea e in legenda */
  code: string
  color: string
  /** stroke-dasharray: distingue i fluidi anche nelle stampe in bianco e nero */
  dash: string | null
  width: number
}

export const FLUIDS: Record<FluidId, FluidDef> = {
  oxidizer: { id: 'oxidizer', name: { it: 'Ossidante (N₂O / LOX)', en: 'Oxidizer (N₂O / LOX)' }, code: 'OX', color: '#1f6fd1', dash: null, width: 0.5 },
  fuel: { id: 'fuel', name: { it: 'Combustibile', en: 'Fuel' }, code: 'FU', color: '#d9480f', dash: '4 1.2 0.8 1.2', width: 0.5 },
  pressurant: { id: 'pressurant', name: { it: 'Pressurizzante (N₂ / He)', en: 'Pressurant (N₂ / He)' }, code: 'PR', color: '#2b8a3e', dash: '2.2 1.2', width: 0.5 },
  vent: { id: 'vent', name: { it: 'Sfiato / scarico', en: 'Vent / drain' }, code: 'VT', color: '#6c757d', dash: '6 1.5', width: 0.5 },
  pneumatic: { id: 'pneumatic', name: { it: 'Aria di comando', en: 'Control air' }, code: 'PN', color: '#0b7285', dash: '1.2 1.2', width: 0.35 },
  signal: { id: 'signal', name: { it: 'Segnale elettrico', en: 'Electrical signal' }, code: 'EL', color: '#7048e8', dash: '0.6 1.4', width: 0.3 },
}
