import { describe, expect, it } from 'vitest'
import {
  holeArea, holeDiameter, hemFlux, n2oFlux, n2oMassFlow, n2oRequiredArea, satAtP, satAtT, satTempAtP, spiFlux, upstreamState,
} from './n2o'
import { gasById, gasOrificeFlow, gasRequiredArea } from './gas'
import { cvOfOrifice, dropFromCv, frictionFactor, liquidFlowFromCv, pipeDrop } from './hydraulics'

const close = (a: number, b: number, rel: number) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel)

describe('N₂O properties (interpolation on NIST data)', () => {
  // points NOT in the table, taken directly from the NIST WebBook
  const nist = [
    { T: 200.5, P: 0.239547e6, rl: 1182.83, rv: 6.64597, hl: 27.3727e3, hv: 383.147e3 },
    { T: 238.0, P: 1.11058e6, rl: 1057.1, rv: 28.7383, hl: 94.7975e3, hv: 398.086e3 },
    { T: 268.0, P: 2.7292e6, rl: 932.417, rv: 73.1172, hl: 154.393e3, hv: 399.583e3 },
    { T: 275.5, P: 3.31443e6, rl: 894.918, rv: 91.3215, hl: 170.805e3, hv: 397.414e3 },
    { T: 306.5, P: 6.7834e6, rl: 633.59, rv: 280.157, hl: 262.192e3, hv: 351.938e3 },
    { T: 308.5, P: 7.08453e6, rl: 575.753, rv: 333.611, hl: 276.787e3, hv: 336.848e3 },
  ]
  for (const p of nist) {
    it(`${p.T} K`, () => {
      const s = satAtT(p.T)
      const near = p.T > 305 ? 0.02 : 0.003
      close(s.P, p.P, near)
      close(s.rhoL, p.rl, near)
      close(s.rhoV, p.rv, near * 2)
      expect(Math.abs(s.hL - p.hl)).toBeLessThan(p.T > 305 ? 4e3 : 0.6e3)
      expect(Math.abs(s.hV - p.hv)).toBeLessThan(p.T > 305 ? 4e3 : 0.6e3)
    })
  }
  it('vapor pressure at 20 °C ≈ 50.4 bar and at 0 °C ≈ 31.3 bar', () => {
    close(satAtT(293.15).P, 5.0e6, 0.02)
    close(satAtT(273.15).P, 3.127e6, 0.01)
  })
  it('satTempAtP inverts the vapor pressure', () => {
    for (const T of [200, 250, 273.15, 290, 300]) expect(Math.abs(satTempAtP(satAtT(T).P) - T)).toBeLessThan(1e-4)
    expect(satAtP(5e6).T).toBeCloseTo(292.9, 0)
  })
  it('out of range throws a clear error', () => {
    expect(() => satAtT(150)).toThrow(RangeError)
    expect(() => satTempAtP(1e3)).toThrow(RangeError)
  })
})

describe('N₂O flow: SPI, HEM and the Dyer model', () => {
  const T = 293.15
  const up = upstreamState(T) // saturo, ~50 bar
  const Pc = 25e5

  it('SPI = √(2ρΔP)', () => {
    close(spiFlux(up, Pc), Math.sqrt(2 * up.rho * (up.P - Pc)), 1e-12)
  })
  it('with a saturated tank κ = 1 and Dyer is the average of SPI and HEM', () => {
    const f = n2oFlux(up, Pc)
    close(f.kappa, 1, 1e-9)
    close(f.dyer, 0.5 * f.spi + 0.5 * f.hem, 1e-9)
    expect(f.regime).toBe('two-phase')
  })
  it('Dyer lies between HEM and SPI', () => {
    for (const pd of [10e5, 25e5, 40e5, 48e5]) {
      const f = n2oFlux(up, pd)
      expect(f.dyer).toBeGreaterThanOrEqual(Math.min(f.spi, f.hem) - 1e-9)
      expect(f.dyer).toBeLessThanOrEqual(Math.max(f.spi, f.hem) + 1e-9)
    }
  })
  it('realistic orders of magnitude: ~ 4–6 ·10⁴ kg/s/m² (about 45 g/s per mm²) for ΔP of 25 bar', () => {
    const f = n2oFlux(up, Pc)
    expect(f.dyer).toBeGreaterThan(35000)
    expect(f.dyer).toBeLessThan(65000)
  })
  it('above the vapor pressure the flow is liquid (SPI)', () => {
    const pressurized = upstreamState(T, 80e5)
    const f = n2oFlux(pressurized, 60e5)
    expect(f.regime).toBe('liquid')
    expect(f.dyer).toBe(f.spi)
    expect(f.kappa).toBe(Infinity)
  })
  it('a subcooled (pressurized) tank raises κ and brings Dyer closer to SPI', () => {
    const sat = n2oFlux(upstreamState(T), Pc)
    const sub = n2oFlux(upstreamState(T, 80e5), Pc)
    expect(sub.kappa).toBeGreaterThan(sat.kappa)
    expect(Math.abs(sub.dyer - sub.spi) / sub.spi).toBeLessThan(Math.abs(sat.dyer - sat.spi) / sat.spi)
  })
  it('flow grows with ΔP and is zero at ΔP = 0', () => {
    const lo = n2oFlux(up, 45e5).dyer, hi = n2oFlux(up, 15e5).dyer
    expect(hi).toBeGreaterThan(lo)
    expect(n2oFlux(up, up.P).dyer).toBe(0)
  })
  it('choked HEM does not decrease when lowering the downstream pressure', () => {
    const a = hemFlux(up, 20e5), b = hemFlux(up, 5e5), c = hemFlux(up, 1e5)
    expect(b).toBeGreaterThanOrEqual(a * (1 - 1e-6))
    expect(c).toBeGreaterThanOrEqual(b * (1 - 1e-6))
  })
  it('flow and sizing are the inverse of each other', () => {
    const area = holeArea(1.5e-3, 12)
    const r = n2oMassFlow(T, undefined, Pc, area, 0.8)
    const back = n2oRequiredArea(T, undefined, Pc, r.mdotDyer, 0.8)
    close(back, area, 1e-9)
    close(holeDiameter(back, 12), 1.5e-3, 1e-9)
    expect(r.mdotDyer).toBeGreaterThan(0.6) // 12 fori Ø1.5 mm, Cd 0.8, ΔP 25 bar: circa 0.75 kg/s
    expect(r.mdotDyer).toBeLessThan(0.95)
  })
})

describe('gas', () => {
  const n2 = gasById('n2')
  it('critical flow of nitrogen: ṁ = 0.0404·P0·A/√T0 (Cd=1, SI)', () => {
    const r = gasOrificeFlow(n2, 50e5, 293.15, 1e5, 1e-6, 1)
    expect(r.choked).toBe(true)
    close(r.mdot, 0.0404 * 50e5 * 1e-6 / Math.sqrt(293.15), 0.03) // constant 0.0404 is valid for air: nitrogen has an R that is 1.7% higher
    close(r.criticalRatio, 0.5283, 0.001)
  })
  it('below the critical ratio the flow does not depend on the downstream pressure; above it does', () => {
    const a = gasOrificeFlow(n2, 50e5, 293.15, 10e5, 1e-6, 1).mdot
    const b = gasOrificeFlow(n2, 50e5, 293.15, 20e5, 1e-6, 1).mdot
    close(a, b, 1e-9)
    const c = gasOrificeFlow(n2, 50e5, 293.15, 40e5, 1e-6, 1)
    expect(c.choked).toBe(false)
    expect(c.mdot).toBeLessThan(a)
  })
  it('it is continuous at the critical ratio', () => {
    const crit = gasOrificeFlow(n2, 1e6, 300, 1, 1e-6, 1).criticalRatio
    close(gasOrificeFlow(n2, 1e6, 300, 1e6 * (crit + 1e-6), 1e-6, 1).mdot, gasOrificeFlow(n2, 1e6, 300, 1e6 * (crit - 1e-6), 1e-6, 1).mdot, 1e-4)
  })
  it('helium, lighter, at equal conditions passes more volumetric but less mass flow? (ṁ ∝ √(γ/R))', () => {
    const he = gasOrificeFlow(gasById('he'), 50e5, 293.15, 1e5, 1e-6, 1).mdot
    const n = gasOrificeFlow(n2, 50e5, 293.15, 1e5, 1e-6, 1).mdot
    expect(he).toBeLessThan(n)
  })
  it('inverse sizing', () => {
    const area = gasRequiredArea(n2, 50e5, 293.15, 1e5, 0.05, 0.9)
    close(gasOrificeFlow(n2, 50e5, 293.15, 1e5, area, 0.9).mdot, 0.05, 1e-9)
  })
})

describe('hydraulics', () => {
  it('water in a 10 mm pipe at 0.1 kg/s: Re≈12700, v≈1.3 m/s', () => {
    const r = pipeDrop(0.1, 0.01, 1, 998, 1e-3, 1.5e-6, 0)
    close(r.velocity, 1.276, 0.01)
    close(r.reynolds, 12_700, 0.02)
    expect(r.regime).toBe('turbolento')
    // Darcy con f≈0.029: ΔP ≈ 0.029·(1/0.01)·0.5·998·1.276² ≈ 2.4 kPa
    close(r.dpFriction, 2400, 0.1)
  })
  it('laminar: f = 64/Re', () => {
    close(frictionFactor(1000, 0.001), 0.064, 1e-12)
  })
  it('the friction factor is continuous in the transition', () => {
    close(frictionFactor(2300, 1e-4), frictionFactor(2300.0001, 1e-4), 1e-3)
    close(frictionFactor(3999.99, 1e-4), frictionFactor(4000.01, 1e-4), 1e-3)
  })
  it('minor losses: K·ρv²/2', () => {
    const r = pipeDrop(0.1, 0.01, 0, 998, 1e-3, 0, 2)
    close(r.dpMinor, 2 * 0.5 * 998 * r.velocity ** 2, 1e-9)
  })
  it('Cv: 1 Cv with water and 1 psi → about 0.063 L/s; round trip consistent', () => {
    const m = liquidFlowFromCv(1, 6894.76, 1000)
    close(m, 0.0631, 0.01)
    close(dropFromCv(1, m, 1000), 6894.76, 1e-9)
  })
  it('equivalent Cv of a small orifice', () => {
    // Ø2 mm, Cd 0.8 → ~0.1 Cv
    const cv = cvOfOrifice(Math.PI * 1e-6, 0.8)
    expect(cv).toBeGreaterThan(0.13)
    expect(cv).toBeLessThan(0.17)
  })
})
