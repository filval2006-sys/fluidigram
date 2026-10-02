/** Fluidi liquidi di uso comune (valori a temperatura ambiente, salvo dove indicato). */
export interface Liquid { id: string; name: { it: string; en: string }; rho: number; mu: number }

export const LIQUIDS: readonly Liquid[] = [
  { id: 'water', name: { it: 'Acqua (20 °C)', en: 'Water (20 °C)' }, rho: 998, mu: 1.0e-3 },
  { id: 'ethanol', name: { it: 'Etanolo (20 °C)', en: 'Ethanol (20 °C)' }, rho: 789, mu: 1.2e-3 },
  { id: 'ipa', name: { it: 'Alcol isopropilico (20 °C)', en: 'Isopropyl alcohol (20 °C)' }, rho: 786, mu: 2.4e-3 },
  { id: 'kerosene', name: { it: 'Cherosene / RP-1 (20 °C)', en: 'Kerosene / RP-1 (20 °C)' }, rho: 810, mu: 2.0e-3 },
  { id: 'lox', name: { it: 'Ossigeno liquido (90 K)', en: 'Liquid oxygen (90 K)' }, rho: 1141, mu: 1.9e-4 },
]


export interface PipeResult {
  /** m/s */
  velocity: number
  reynolds: number
  frictionFactor: number
  regime: 'laminare' | 'transizione' | 'turbolento'
  /** perdite distribuite e concentrate, Pa */
  dpFriction: number
  dpMinor: number
  dpTotal: number
}

/** Fattore di attrito di Darcy: 64/Re in laminare, Swamee–Jain in turbolento, interpolazione lineare nella transizione. */
export function frictionFactor(Re: number, relRoughness: number): number {
  const turb = (re: number) => 0.25 / Math.pow(Math.log10(relRoughness / 3.7 + 5.74 / Math.pow(re, 0.9)), 2)
  if (Re <= 2300) return 64 / Math.max(Re, 1e-9)
  if (Re >= 4000) return turb(Re)
  const t = (Re - 2300) / 1700
  return (1 - t) * (64 / 2300) + t * turb(4000)
}

/**
 * Perdita di carico in un tubo (Darcy–Weisbach), liquido incomprimibile.
 * mdot kg/s, D m (diametro interno), L m, rho kg/m³, mu Pa·s, roughness m (assoluta), Ktot somma dei coefficienti di perdita concentrata.
 */
export function pipeDrop(mdot: number, D: number, L: number, rho: number, mu: number, roughness: number, Ktot: number): PipeResult {
  const A = (Math.PI * D * D) / 4
  const v = mdot / (rho * A)
  const Re = (rho * v * D) / mu
  const f = Re > 0 ? frictionFactor(Re, roughness / D) : 0
  const q = 0.5 * rho * v * v
  const dpFriction = f * (L / D) * q
  const dpMinor = Ktot * q
  return {
    velocity: v, reynolds: Re, frictionFactor: f,
    regime: Re < 2300 ? 'laminare' : Re < 4000 ? 'transizione' : 'turbolento',
    dpFriction, dpMinor, dpTotal: dpFriction + dpMinor,
  }
}

/** Kv (m³/h per √bar) = 0.865·Cv (Cv in US gpm per √psi). */
export const KV_PER_CV = 0.865

/** Portata massica (kg/s) di un liquido attraverso una valvola con coefficiente Cv. */
export function liquidFlowFromCv(Cv: number, dpPa: number, rho: number): number {
  const sg = rho / 1000
  const qM3h = KV_PER_CV * Cv * Math.sqrt(Math.max(0, dpPa / 1e5) / sg)
  return (qM3h / 3600) * rho
}

/** Caduta di pressione (Pa) per una portata massica data. */
export function dropFromCv(Cv: number, mdot: number, rho: number): number {
  const sg = rho / 1000
  const qM3h = (mdot / rho) * 3600
  return 1e5 * sg * Math.pow(qM3h / (KV_PER_CV * Cv), 2)
}

/** Cv equivalente di un orifizio (area m², coefficiente di scarico Cd) per l'acqua. */
export function cvOfOrifice(area: number, Cd: number): number {
  const q = Cd * area * Math.sqrt((2 * 1e5) / 1000) // m³/s a 1 bar con acqua
  return (q * 3600) / KV_PER_CV
}
