import {
  N2O_T_MAX, N2O_T_MIN, N2O_P, N2O_rhoL, N2O_rhoV, N2O_hL, N2O_hV, N2O_sL, N2O_sV, N2O_muL, N2O_cpL,
} from './n2oTable'

/** Proprietà del protossido d'azoto saturo (dati NIST, EOS di Span–Wagner), interpolate sulla tabella a passo 1 K. */
export interface N2OSat {
  T: number; P: number
  rhoL: number; rhoV: number
  hL: number; hV: number
  sL: number; sV: number
  muL: number; cpL: number
}

export { N2O_T_MIN, N2O_T_MAX }
export const N2O_T_CRIT = 309.52
export const N2O_P_CRIT = 7.245e6

/** Interpolazione cubica di Catmull–Rom su nodi equidistanti di 1 K. */
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

export const N2O_P_MIN = N2O_P[0]
export const N2O_P_MAX = N2O_P[N2O_P.length - 1]

/** Temperatura di saturazione alla pressione data (bisezione sulla pressione di vapore). */
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
  /** pressione a monte (≥ pressione di vapore) */
  P: number
  rho: number
  h: number
  s: number
}

/**
 * Stato del liquido nel serbatoio: saturo a temperatura T, eventualmente compresso dal gas pressurizzante a P ≥ Psat.
 * Il liquido compresso è trattato come incomprimibile (errore sulla densità < 1% sotto circa 30 bar di sovrapressione).
 */
export function upstreamState(T: number, P?: number): N2OUpstream {
  const sat = satAtT(T)
  const Pu = Math.max(sat.P, P ?? sat.P)
  return { sat, P: Pu, rho: sat.rhoL, h: sat.hL + (Pu - sat.P) / sat.rhoL, s: sat.sL }
}

/** Flusso massico specifico (kg/s/m²) dell'espansione isentropica all'equilibrio fino alla pressione P. */
function equilibriumFlux(up: N2OUpstream, P: number): number {
  if (P >= up.sat.P) return Math.sqrt(2 * up.rho * Math.max(0, up.P - P)) // ancora liquido: coincide con SPI
  const d = satAtP(P)
  const x = Math.min(1, Math.max(0, (up.s - d.sL) / (d.sV - d.sL)))
  const h = d.hL + x * (d.hV - d.hL)
  const rho = 1 / (x / d.rhoV + (1 - x) / d.rhoL)
  const dh = up.h - h
  return dh > 0 ? rho * Math.sqrt(2 * dh) : 0
}

export const spiFlux = (up: N2OUpstream, Pd: number): number => Math.sqrt(2 * up.rho * Math.max(0, up.P - Pd))

/**
 * HEM: flusso a pressione di valle Pd. Con `choked` (predefinito) è il massimo tra Pd e la pressione a monte,
 * cioè la portata critica: sotto la pressione di blocco la portata non cresce più abbassando Pd.
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
  // raffina il massimo con una ricerca a sezione aurea tra i nodi vicini
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
  /** flussi specifici in kg/s/m² */
  spi: number
  hem: number
  dyer: number
  /** parametro di non-equilibrio di Dyer, = Infinity se non c'è vaporizzazione (Pd ≥ Pv) */
  kappa: number
  /** regime: liquido (nessuna vaporizzazione) o bifase (flashing) */
  regime: 'liquid' | 'two-phase'
}

/**
 * Modello di Dyer et al. (2007): media pesata di SPI e HEM con κ = √((P₁−P₂)/(Pv−P₂)).
 * ṁ/A = κ/(κ+1)·G_SPI + 1/(κ+1)·G_HEM. Se la valle è sopra la pressione di vapore il flusso è liquido (SPI).
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

/** Portata attraverso un'area (m²) con coefficiente di scarico Cd. */
export function n2oMassFlow(T: number, Pu: number | undefined, Pd: number, area: number, Cd: number, choked = true): N2OInjectorResult {
  const up = upstreamState(T, Pu)
  const f = n2oFlux(up, Pd, choked)
  return { ...f, mdotSPI: Cd * area * f.spi, mdotHEM: Cd * area * f.hem, mdotDyer: Cd * area * f.dyer, area, up }
}

/** Area (m²) necessaria per ottenere la portata `mdot` (kg/s) secondo Dyer. */
export function n2oRequiredArea(T: number, Pu: number | undefined, Pd: number, mdot: number, Cd: number, choked = true): number {
  const f = n2oFlux(upstreamState(T, Pu), Pd, choked)
  return f.dyer > 0 ? mdot / (Cd * f.dyer) : Infinity
}

export const holeArea = (dMeters: number, n: number): number => (n * Math.PI * dMeters * dMeters) / 4
export const holeDiameter = (area: number, n: number): number => Math.sqrt((4 * area) / (n * Math.PI))
