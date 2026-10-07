import type { Dir } from '../geometry'
import type { L10n } from '../types'

export type ActuatorId = 'none' | 'manual' | 'solenoid' | 'servo' | 'pneumatic' | 'motor'

export type Fill = 'none' | 'ink' | 'paper'

/** Drawing primitives in local coordinates (mm, origin at the top left of the box). */
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
  /** placement box (multiples of 10 mm, so the center sits on the 5 mm grid) */
  w: number
  h: number
  /** actual extent of the drawing, if it exceeds the box (e.g. actuator) */
  extent?: { x: number; y: number; w: number; h: number }
  ports: PortDef[]
  prims: Prim[]
  /** plant tag prefix (SV, BV, TK...) */
  tagPrefix: string
  /** (local) sides occupied by parts of the drawing, where the label must not go */
  avoidSides?: Dir[]
  /** if present, the tag is written inside the symbol (instruments, vessels) */
  labelInside?: { x: number; y: number; split?: boolean; size?: number }
  /** if present, the symbol accepts an actuator (manual, electric, pneumatic...) drawn above the body */
  actuatable?: { defaultActuator: ActuatorId }
  /** options chosen by the user (saved in props) that change the drawing through `variantPrims` */
  options?: OptionDef[]
  variantPrims?: (props: Record<string, string>) => Prim[]
  /** alternative search words (synonyms, codes) */
  keywords?: string[]
  /** the body neither rotates nor mirrors (only the ports): for symmetric symbols with inner text */
  fixedBody?: boolean
  /** shown in the legend? (false for fittings such as junctions) */
  legend: boolean
}
