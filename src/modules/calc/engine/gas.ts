/** Common ideal gases for pressurization. Specific R = R/M. */
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
  /** critical ratio Pd/P0 below which the flow is choked */
  criticalRatio: number
}

/**
 * Flow rate of an ideal gas through an orifice (one-dimensional isentropic).
 * P0, T0: upstream stagnation (Pa, K); Pd: downstream pressure; area in m². It does not include the compressibility factor Z:
 * above ~100 bar it is an approximation.
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

/** Area (m²) to obtain `mdot` (kg/s) with an ideal gas. */
export function gasRequiredArea(gas: Gas, P0: number, T0: number, Pd: number, mdot: number, Cd: number): number {
  const unit = gasOrificeFlow(gas, P0, T0, Pd, 1, Cd).mdot
  return unit > 0 ? mdot / unit : Infinity
}
