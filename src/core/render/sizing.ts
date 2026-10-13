import type { ExportSettings, ExportSize, SheetFormat } from '../types'

/**
 * What each export size means. The program picks the scale, the number of sheets and the text sizes from it:
 * - small: compact, as few sheets as possible, smaller (still legible) texts;
 * - medium: balanced;
 * - large: big and comfortable, more sheets when needed.
 */
interface SizeProfile {
  /** multiplier of the texts on the diagram */
  text: number
  /** multiplier of the legend and the tables */
  table: number
  /** the diagram is never shrunk below this scale (it is split over more sheets instead), per sheet format */
  floor: Record<SheetFormat, number>
  /** scale the diagram should have if it costs nothing; below it a smaller scale is accepted only if it saves sheets */
  target: number
}

export const SIZE_PROFILES: Record<ExportSize, SizeProfile> = {
  small: { text: 0.85, table: 0.9, floor: { A4: 0.25, A3: 0.3, A2: 0.4 }, target: 0.35 },
  medium: { text: 1, table: 1, floor: { A4: 0.35, A3: 0.45, A2: 0.55 }, target: 0.5 },
  large: { text: 1.25, table: 1.15, floor: { A4: 0.6, A3: 0.7, A2: 0.8 }, target: 0.85 },
}

export const exportFactors = (s: Pick<ExportSettings, 'size'>): { text: number; table: number } => SIZE_PROFILES[s.size]

/** Cost of a sheet in "scale units": shrinking the diagram by 0.1 below the target is worth a tenth of this per sheet saved. */
const SHRINK_COST = 6

const floorTo = (v: number, step: number): number => Math.floor(v / step + 1e-9) * step

/** Scale of the diagram on the sheet: the cheapest between few sheets and a large diagram, within the profile's limits. */
export function chooseScale(b: { w: number; h: number }, area: { w: number; h: number }, size: ExportSize, format: SheetFormat): number {
  const profile = SIZE_PROFILES[size]
  const lo = profile.floor[format]
  const fit = Math.min(area.w / b.w, area.h / b.h)
  const sheets = (s: number) => Math.max(1, Math.ceil((b.w * s) / area.w - 1e-9)) * Math.max(1, Math.ceil((b.h * s) / area.h - 1e-9))
  let best = { s: 1, cost: Infinity }
  const consider = (s: number) => {
    const cost = sheets(s) + SHRINK_COST * Math.max(0, profile.target - s)
    if (cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && s > best.s)) best = { s, cost }
  }
  // everything on one sheet, as large as it goes
  if (fit >= lo) consider(Math.min(1, floorTo(fit, 0.05)))
  for (let s = 1; s >= lo - 1e-9; s -= 0.05) consider(Math.round(s * 100) / 100)
  return Math.max(0.05, best.s)
}
