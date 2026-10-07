/** Gas ideali comuni per la pressurizzazione. R specifica = R/M. */
export interface Gas { id: string; name: { it: string; en: string }; gamma: number; M: number }

const R_UNIVERSAL = 8.314462618

export const GASES: readonly Gas[] = [
  { id: 'n2', name: { it: 'Azoto (N₂)', en: 'Nitrogen (N₂)' }, gamma: 1.4, M: 0.0280134 },
  { id: 'he', name: { it: 'Elio (He)', en: 'Helium (He)' }, gamma: 1.667, M: 0.0040026 },
  { id: 'air', name: { it: 'Aria', en: 'Air' }, gamma: 1.4, M: 0.02897 },
  { id: 'co2', name: { it: 'Anidride carbonica (CO₂)', en: 'Carbon dioxide (CO₂)' }, gamma: 1.289, M: 0.04401 },
  { id: 'ar', name: { it: 'Argon (Ar)', en: 'Argon (Ar)' }, gamma: 1.667, M: 0.039948 },
  { id: 'o2', name: { it: 'Ossigeno (O₂)', en: 'Oxygen (O₂)' }, gamma: 1.395, M: 0.031998 },
]

export const gasById = (id: string): Gas => GASES.find((g) => g.id === id) ?? GASES[0]

export interface GasOrificeResult {
  /** kg/s */
  mdot: number
  choked: boolean
  /** rapporto critico Pd/P0 sotto il quale la portata è bloccata */
  criticalRatio: number
}

/**
 * Portata di gas ideale attraverso un orifizio (isentropica monodimensionale).
 * P0, T0: ristagno a monte (Pa, K); Pd: pressione a valle; area in m². Non include il fattore di comprimibilità Z:
 * oltre ~100 bar è un'approssimazione.
 */
export function gasOrificeFlow(gas: Gas, P0: number, T0: number, Pd: number, area: number, Cd: number): GasOrificeResult {
  const g = gas.gamma
  const R = R_UNIVERSAL / gas.M
  const critical = Math.pow(2 / (g + 1), g / (g - 1))
  if (Pd >= P0) return { mdot: 0, choked: false, criticalRatio: critical }
  const ratio = Pd / P0
  if (ratio <= critical) {
    const mdot = Cd * area * P0 * Math.sqrt(g / (R * T0)) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1)))
    return { mdot, choked: true, criticalRatio: critical }
  }
  const term = Math.pow(ratio, 2 / g) - Math.pow(ratio, (g + 1) / g)
  const mdot = Cd * area * P0 * Math.sqrt(((2 * g) / ((g - 1) * R * T0)) * term)
  return { mdot, choked: false, criticalRatio: critical }
}

/** Area (m²) per ottenere `mdot` (kg/s) con gas ideale. */
export function gasRequiredArea(gas: Gas, P0: number, T0: number, Pd: number, mdot: number, Cd: number): number {
  const unit = gasOrificeFlow(gas, P0, T0, Pd, 1, Cd).mdot
  return unit > 0 ? mdot / unit : Infinity
}
