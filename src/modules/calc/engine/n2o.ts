import {
  N2O_T_MAX, N2O_T_MIN, N2O_P, N2O_rhoL, N2O_rhoV, N2O_hL, N2O_hV, N2O_sL, N2O_sV, N2O_muL, N2O_cpL,
} from './n2oTable'

/** Properties of saturated nitrous oxide (NIST data, Span–Wagner EOS), interpolated on the 1 K step table. */
export interface N2OSat {
  T: number; P: number
  rhoL: number; rhoV: number
  hL: number; hV: number
  sL: number; sV: number
  muL: number; cpL: number
}

export { N2O_T_MIN, N2O_T_MAX }

/** Catmull–Rom cubic interpolation on nodes spaced 1 K apart. */
function interp(arr: readonly number[], T: number): number {
  const x = T - N2O_T_MIN
  const i = Math.min(arr.length - 2, Math.max(0, Math.floor(x)))
  const t = x - i
  const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(arr.length - 1, i + 2)]
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
}

const LN_P = N2O_P.map(Math.log)

export function satAtT(T: number): N2OSat {
  if (!(T >= N2O_T_MIN && T <= N2O_T_MAX)) throw new RangeError(`Temperatura fuori campo (${N2O_T_MIN}–${N2O_T_MAX} K): ${T}`)
  return {
    T,
    P: Math.exp(interp(LN_P, T)),
    rhoL: interp(N2O_rhoL, T), rhoV: interp(N2O_rhoV, T),
    hL: interp(N2O_hL, T), hV: interp(N2O_hV, T),
    sL: interp(N2O_sL, T), sV: interp(N2O_sV, T),
    muL: interp(N2O_muL, T), cpL: interp(N2O_cpL, T),
  }
}

const N2O_P_MIN = N2O_P[0]
const N2O_P_MAX = N2O_P[N2O_P.length - 1]

/** Saturation temperature at the given pressure (bisection on the vapor pressure). */
export function satTempAtP(P: number): number {
  if (!(P >= N2O_P_MIN && P <= N2O_P_MAX)) throw new RangeError(`Pressione fuori campo di saturazione (${(N2O_P_MIN / 1e5).toFixed(2)}–${(N2O_P_MAX / 1e5).toFixed(1)} bar): ${(P / 1e5).toFixed(2)} bar`)
  let lo = N2O_T_MIN, hi = N2O_T_MAX
  const lp = Math.log(P)
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    if (interp(LN_P, mid) < lp) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export const satAtP = (P: number): N2OSat => satAtT(satTempAtP(P))

export interface N2OUpstream {
  sat: N2OSat
  /** upstream pressure (≥ vapor pressure) */
  P: number
  rho: number
  h: number
  s: number
}

/**
 * State of the liquid in the tank: saturated at temperature T, possibly compressed by the pressurant gas to P ≥ Psat.
 * Compressed liquid is treated as incompressible (density error < 1% below about 30 bar of overpressure).
 */
export function upstreamState(T: number, P?: number): N2OUpstream {
  const sat = satAtT(T)
  const Pu = Math.max(sat.P, P ?? sat.P)
  return { sat, P: Pu, rho: sat.rhoL, h: sat.hL + (Pu - sat.P) / sat.rhoL, s: sat.sL }
}

/** Specific mass flux (kg/s/m²) of the isentropic expansion at equilibrium down to pressure P. */
function equilibriumFlux(up: N2OUpstream, P: number): number {
  if (P >= up.sat.P) return Math.sqrt(2 * up.rho * Math.max(0, up.P - P)) // still liquid: same as SPI
  const d = satAtP(P)
  const x = Math.min(1, Math.max(0, (up.s - d.sL) / (d.sV - d.sL)))
  const h = d.hL + x * (d.hV - d.hL)
  const rho = 1 / (x / d.rhoV + (1 - x) / d.rhoL)
  const dh = up.h - h
  return dh > 0 ? rho * Math.sqrt(2 * dh) : 0
}

export const spiFlux = (up: N2OUpstream, Pd: number): number => Math.sqrt(2 * up.rho * Math.max(0, up.P - Pd))

/**
 * HEM: flow at downstream pressure Pd. With `choked` (default) it is the maximum between Pd and the upstream pressure,
 * i.e. the critical flow: below the choking pressure the flow no longer grows when lowering Pd.
 */
export function hemFlux(up: N2OUpstream, Pd: number, choked = true): number {
  if (!choked) return equilibriumFlux(up, Pd)
  const N = 120
  const at = (i: number) => Pd + ((up.P - Pd) * i) / N
  let bi = 0
  let best = 0
  for (let i = 0; i <= N; i++) {
    const g = equilibriumFlux(up, at(i))
    if (g > best) { best = g; bi = i }
  }
  // refines the maximum with a golden-section search between the neighboring nodes
  let a = at(Math.max(0, bi - 1)), b = at(Math.min(N, bi + 1))
  const phi = (Math.sqrt(5) - 1) / 2
  let c = b - phi * (b - a), d = a + phi * (b - a)
  let fc = equilibriumFlux(up, c), fd = equilibriumFlux(up, d)
  for (let k = 0; k < 40; k++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = equilibriumFlux(up, c) }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = equilibriumFlux(up, d) }
  }
  return Math.max(best, fc, fd)
}

export interface N2OFlux {
  /** specific fluxes in kg/s/m² */
  spi: number
  hem: number
  dyer: number
  /** Dyer non-equilibrium parameter, = Infinity if there is no vaporization (Pd ≥ Pv) */
  kappa: number
  /** regime: liquid (no vaporization) or two-phase (flashing) */
  regime: 'liquid' | 'two-phase'
}

/**
 * Dyer et al. (2007) model: weighted average of SPI and HEM with κ = √((P₁−P₂)/(Pv−P₂)).
 * ṁ/A = κ/(κ+1)·G_SPI + 1/(κ+1)·G_HEM. If the downstream is above the vapor pressure the flow is liquid (SPI).
 */
export function n2oFlux(up: N2OUpstream, Pd: number, choked = true): N2OFlux {
  const spi = spiFlux(up, Pd)
  const Pv = up.sat.P
  if (Pd >= Pv || up.P <= Pd) return { spi, hem: spi, dyer: spi, kappa: Infinity, regime: 'liquid' }
  const hem = hemFlux(up, Pd, choked)
  const kappa = Math.sqrt((up.P - Pd) / (Pv - Pd))
  return { spi, hem, dyer: (kappa / (kappa + 1)) * spi + (1 / (kappa + 1)) * hem, kappa, regime: 'two-phase' }
}

export interface N2OInjectorResult extends N2OFlux {
  /** portate in kg/s */
  mdotSPI: number; mdotHEM: number; mdotDyer: number
  area: number
  up: N2OUpstream
}

/** Flow rate through an area (m²) with discharge coefficient Cd. */
export function n2oMassFlow(T: number, Pu: number | undefined, Pd: number, area: number, Cd: number, choked = true): N2OInjectorResult {
  const up = upstreamState(T, Pu)
  const f = n2oFlux(up, Pd, choked)
  return { ...f, mdotSPI: Cd * area * f.spi, mdotHEM: Cd * area * f.hem, mdotDyer: Cd * area * f.dyer, area, up }
}

/** Area (m²) needed to obtain the flow `mdot` (kg/s) according to Dyer. */
export function n2oRequiredArea(T: number, Pu: number | undefined, Pd: number, mdot: number, Cd: number, choked = true): number {
  const f = n2oFlux(upstreamState(T, Pu), Pd, choked)
  return f.dyer > 0 ? mdot / (Cd * f.dyer) : Infinity
}

export const holeArea = (dMeters: number, n: number): number => (n * Math.PI * dMeters * dMeters) / 4
export const holeDiameter = (area: number, n: number): number => Math.sqrt((4 * area) / (n * Math.PI))
