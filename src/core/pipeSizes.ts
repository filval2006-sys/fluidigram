import type { L10n } from './types'

export interface PipeSizeGroup {
  id: string
  label: L10n
  options: string[]
}

const inch = ['1/16', '1/8', '3/16', '1/4', '5/16', '3/8', '1/2', '5/8', '3/4', '7/8', '1', '1-1/4', '1-1/2', '2']
const metric = [2, 3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 50]

export const PIPE_SIZE_GROUPS: PipeSizeGroup[] = [
  { id: 'tube-mm', label: { it: 'Tubo metrico (Ø esterno)', en: 'Metric tube (OD)' }, options: metric.map((d) => `Ø${d} mm`) },
  { id: 'tube-in', label: { it: 'Tubo in pollici (Ø esterno)', en: 'Inch tube (OD)' }, options: inch.map((d) => `${d}" OD`) },
  { id: 'npt', label: { it: 'Filettatura NPT', en: 'NPT thread' }, options: ['1/16', '1/8', '1/4', '3/8', '1/2', '3/4', '1', '1-1/4', '1-1/2', '2'].map((d) => `${d}" NPT`) },
  { id: 'an', label: { it: 'Raccordi AN / JIC', en: 'AN / JIC fittings' }, options: [3, 4, 5, 6, 8, 10, 12, 16].map((d) => `AN-${d}`) },
  { id: 'dn', label: { it: 'Diametro nominale DN', en: 'Nominal diameter DN' }, options: [6, 8, 10, 15, 20, 25, 32, 40, 50].map((d) => `DN${d}`) },
]

/** Normalizza per la ricerca: ignora maiuscole, spazi, virgolette, trattini e il simbolo Ø. */
export const normalizeSize = (s: string): string => s.toLowerCase().replace(/[\s"'″”Ø\-]/gi, '').replace(/ø/g, '')

/** Gruppi filtrati dalla stringa cercata (vuota → tutto). */
export function filterPipeSizes(query: string): PipeSizeGroup[] {
  const q = normalizeSize(query)
  if (!q) return PIPE_SIZE_GROUPS
  return PIPE_SIZE_GROUPS
    .map((g) => ({ ...g, options: g.options.filter((o) => normalizeSize(o).includes(q)) }))
    .filter((g) => g.options.length > 0)
}

export const DEFAULT_PIPE_SIZE = '1/4" OD'
