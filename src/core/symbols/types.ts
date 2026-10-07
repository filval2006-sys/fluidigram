import type { Dir } from '../geometry'
import type { L10n } from '../types'

export type ActuatorId = 'none' | 'manual' | 'solenoid' | 'servo' | 'pneumatic' | 'motor'

export type Fill = 'none' | 'ink' | 'paper'

/** Primitive di disegno in coordinate locali (mm, origine in alto a sinistra del box). */
export type Prim =
  | { k: 'path'; d: string; fill?: Fill }
  | { k: 'circle'; cx: number; cy: number; r: number; fill?: Fill }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: Fill }
  | { k: 'text'; x: number; y: number; s: string; size: number; anchor?: 'start' | 'middle' | 'end' }

export interface PortDef { id: string; x: number; y: number; dir: Dir }

export interface OptionDef {
  key: string
  label: L10n
  default: string
  choices: { id: string; label: L10n }[]
}

export type SymbolCategory = 'valves' | 'vessels' | 'instruments' | 'fittings' | 'engine'

export interface SymbolDef {
  id: string
  name: L10n
  category: SymbolCategory
  /** box di posizionamento (multipli di 10 mm, così il centro sta sulla griglia da 5 mm) */
  w: number
  h: number
  /** ingombro reale del disegno, se eccede il box (es. attuatore) */
  extent?: { x: number; y: number; w: number; h: number }
  ports: PortDef[]
  prims: Prim[]
  /** prefisso del tag di impianto (SV, BV, TK...) */
  tagPrefix: string
  /** lati (locali) occupati da parti del disegno, dove non va messa l'etichetta */
  avoidSides?: Dir[]
  /** se presente, il tag è scritto dentro il simbolo (strumenti, serbatoi) */
  labelInside?: { x: number; y: number; split?: boolean; size?: number }
  /** se presente, il simbolo accetta un azionamento (manuale, elettrico, pneumatico...) disegnato sopra il corpo */
  actuatable?: { defaultActuator: ActuatorId }
  /** opzioni scelte dall'utente (salvate in props) che cambiano il disegno tramite `variantPrims` */
  options?: OptionDef[]
  variantPrims?: (props: Record<string, string>) => Prim[]
  /** parole alternative per la ricerca (sinonimi, sigle) */
  keywords?: string[]
  /** il corpo non ruota né si specchia (solo le porte): per simboli simmetrici con scritte interne */
  fixedBody?: boolean
  /** mostrato nella legenda? (false per raccordi come le giunzioni) */
  legend: boolean
}
