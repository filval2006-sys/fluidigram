import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Droplets, Flame, Gauge, Wind, X } from 'lucide-react'
import { GASES, gasById, gasOrificeFlow, gasRequiredArea } from './engine/gas'
import { LIQUIDS, cvOfOrifice, dropFromCv, liquidFlowFromCv, pipeDrop } from './engine/hydraulics'
import {
  N2O_T_MAX, N2O_T_MIN, holeArea, holeDiameter, n2oFlux, n2oMassFlow, n2oRequiredArea, satAtT, upstreamState,
} from './engine/n2o'
import { N_, t, uiLanguage } from '../../i18n'
import { useActiveTab, useStore } from '../../state/store'
import { Num } from '../../ui/Fields'

type TabId = 'n2o' | 'gas' | 'pipe' | 'cv'

const STORAGE = 'fluidigram.calc.v1'
const DEFAULTS = {
  n2o: { tC: 20, pressurized: false, pTank: 60, pc: 25, cd: 0.8, n: 12, dMm: 1.5, mode: 'flow' as 'flow' | 'size', mdotG: 500, choked: true },
  gas: { gas: 'n2', p0: 100, tC: 20, pd: 40, cd: 0.8, dMm: 1, mode: 'flow' as 'flow' | 'size', mdotG: 20 },
  pipe: { liquid: 'n2o', tC: 20, mdotG: 500, dMm: 8, L: 2, rough: 1.5, K: 3 },
  cv: { liquid: 'water', tC: 20, cv: 0.5, dp: 5, mdotG: 300, cdOrifice: 0.8 },
}
type Calc = typeof DEFAULTS

function loadCalc(): Calc {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<Calc>
    return { n2o: { ...DEFAULTS.n2o, ...raw.n2o }, gas: { ...DEFAULTS.gas, ...raw.gas }, pipe: { ...DEFAULTS.pipe, ...raw.pipe }, cv: { ...DEFAULTS.cv, ...raw.cv } }
  } catch { return DEFAULTS }
}

const BAR = 1e5
const fmt = (v: number, digits = 3): string => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? v.toFixed(0) : Number(v.toPrecision(digits)).toString()) : '—')

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'main' | 'warn' }) {
  return <div className={'stat' + (tone ? ' ' + tone : '')}><span>{label}</span><b>{value}{unit && <small> {unit}</small>}</b></div>
}

function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <p className={'calc-note' + (warn ? ' warn' : '')}>{warn && <AlertTriangle size={15} />}<span>{children}</span></p>
}

/** Flow rate vs. chamber pressure curves for the three models. */
function FlowChart({ tC, pTank, pressurized, area, cd, choked, pc }: { tC: number; pTank: number; pressurized: boolean; area: number; cd: number; choked: boolean; pc: number }) {
  const data = useMemo(() => {
    const up = upstreamState(tC + 273.15, pressurized ? pTank * BAR : undefined)
    const pts: { p: number; spi: number; hem: number; dyer: number }[] = []
    const N = 48
    for (let i = 0; i <= N; i++) {
      const pd = Math.max(1e5, (up.P * 0.98 * (N - i)) / N)
      const f = n2oFlux(up, pd, choked)
      pts.push({ p: pd / BAR, spi: f.spi * cd * area * 1000, hem: f.hem * cd * area * 1000, dyer: f.dyer * cd * area * 1000 })
    }
    return { pts: pts.sort((a, b) => a.p - b.p), pmax: up.P / BAR }
  }, [tC, pTank, pressurized, area, cd, choked])
  const W = 520, H = 224, L = 46, B = 30, T = 22, R = 12
  const ymax = Math.max(...data.pts.map((p) => Math.max(p.spi, p.hem, p.dyer))) * 1.08 || 1
  const x = (p: number) => L + ((p - 0) / data.pmax) * (W - L - R)
  const y = (v: number) => H - B - (v / ymax) * (H - B - T)
  const path = (k: 'spi' | 'hem' | 'dyer') => data.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.p).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')
  const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * data.pmax)
  const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax)
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Flow rate versus chamber pressure')}>
        {yt.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="gl" /><text x={L - 6} y={y(v) + 3} textAnchor="end" className="tk">{fmt(v, 2)}</text></g>)}
        {xt.map((v) => <text key={v} x={x(v)} y={H - 10} textAnchor="middle" className="tk">{Math.round(v)}</text>)}
        <path d={path('spi')} className="c-spi" /><path d={path('hem')} className="c-hem" /><path d={path('dyer')} className="c-dyer" />
        <line x1={x(pc)} x2={x(pc)} y1={T} y2={H - B} className="marker" />
        <text x={W / 2} y={H - 0} textAnchor="middle" className="tk">{t('chamber pressure (bar)')}</text>
        <text x={L - 6} y={12} textAnchor="end" className="tk">g/s</text>
      </svg>
      <figcaption><i className="k-spi" />SPI <i className="k-hem" />HEM <i className="k-dyer" />Dyer <i className="k-mark" />{t('chosen pressure')}</figcaption>
    </figure>
  )
}

function N2OTab({ st, set, selected }: { st: Calc['n2o']; set: (p: Partial<Calc['n2o']>) => void; selected: ReturnType<typeof useSelectedInjector> }) {
  const out = useMemo(() => {
    try {
      const T = st.tC + 273.15
      if (T < N2O_T_MIN || T > N2O_T_MAX - 0.5) throw new RangeError(t('Temperature out of range: {min}…{max} °C (limited here to {lim} °C, near the critical point)', { min: N2O_T_MIN - 273.15 | 0, max: (N2O_T_MAX - 273.15) | 0, lim: (N2O_T_MAX - 273.15 - 0.5).toFixed(1) }))
      const sat = satAtT(T)
      const Pu = st.pressurized ? Math.max(st.pTank, sat.P / BAR) * BAR : undefined
      const Pd = st.pc * BAR
      const upP = Pu ?? sat.P
      if (Pd >= upP) throw new RangeError(t('The chamber pressure must be lower than the tank pressure.'))
      if (Pd < 1e5 * 0.5) throw new RangeError(t('Chamber pressure too low (min 0.5 bar).'))
      const area = st.mode === 'flow' ? holeArea(st.dMm / 1000, st.n) : n2oRequiredArea(T, Pu, Pd, st.mdotG / 1000, st.cd, st.choked)
      const r = n2oMassFlow(T, Pu, Pd, area, st.cd, st.choked)
      return { sat, r, area, upP, Pd, ok: true as const }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) } as const
    }
  }, [st])

  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <h3>{t('Tank')}</h3>
        <Num label={t('Liquid temperature')} unit="°C" value={st.tC} onChange={(v) => set({ tC: v })} />
        <label className="check-line"><input type="checkbox" checked={st.pressurized} onChange={(e) => set({ pressurized: e.target.checked })} />{t('Pressurized with gas (subcooled liquid)')}</label>
        {st.pressurized && <Num label={t('Tank pressure')} unit="bar" value={st.pTank} onChange={(v) => set({ pTank: v })} hint={t('If lower than the vapor pressure, the latter is used.')} />}
        <h3>{t('Injector')}</h3>
        <Num label={t('Chamber pressure')} unit="bar" value={st.pc} onChange={(v) => set({ pc: v })} />
        <Num label={t('Discharge coefficient Cd')} value={st.cd} onChange={(v) => set({ cd: v })} hint={t('Typically 0.6–0.85 for sharp-edged holes.')} />
        <div className="seg wide" role="group" aria-label={t('Calculation mode')}>
          <button className={st.mode === 'flow' ? 'on' : ''} onClick={() => set({ mode: 'flow' })}>{t('Calculate the flow rate')}</button>
          <button className={st.mode === 'size' ? 'on' : ''} onClick={() => set({ mode: 'size' })}>{t('Size the holes')}</button>
        </div>
        {st.mode === 'flow' ? (
          <div className="two"><Num label={t('Number of holes')} value={st.n} onChange={(v) => set({ n: Math.max(1, Math.round(v)) })} /><Num label={t('Hole diameter')} unit="mm" value={st.dMm} onChange={(v) => set({ dMm: v })} /></div>
        ) : (
          <>
            <Num label={t('Required flow rate')} unit="g/s" value={st.mdotG} onChange={(v) => set({ mdotG: v })} />
            <Num label={t('Number of holes')} value={st.n} onChange={(v) => set({ n: Math.max(1, Math.round(v)) })} />
          </>
        )}
        <label className="check-line"><input type="checkbox" checked={st.choked} onChange={(e) => set({ choked: e.target.checked })} />{t('HEM with critical flow (recommended)')}</label>
        {selected && (
          <div className="btn-row">
            <button onClick={() => { const p = selected.props; set({ n: Number(p.holes) || 1, dMm: Number(p.holeDia) || st.dMm, cd: Number(p.cd) || st.cd, mode: 'flow' }) }}>{t('Read from {tag}', { tag: selected.tag })}</button>
            {out.ok && <button onClick={() => selected.apply(st.n, holeDiameter(out.area, st.n) * 1000, st.cd)}>{t('Write to {tag}', { tag: selected.tag })}</button>}
          </div>
        )}
      </div>
      <div className="calc-results">
        {!out.ok ? <Note warn>{out.error}</Note> : (
          <>
            <div className="stat-grid">
              <Stat tone="main" label={t('Flow rate (Dyer model)')} value={fmt(out.r.mdotDyer * 1000)} unit="g/s" />
              <Stat label={t('SPI only (liquid)')} value={fmt(out.r.mdotSPI * 1000)} unit="g/s" />
              <Stat label={t('HEM only (equilibrium)')} value={fmt(out.r.mdotHEM * 1000)} unit="g/s" />
              <Stat label={t('κ (non-equilibrium)')} value={Number.isFinite(out.r.kappa) ? fmt(out.r.kappa) : '∞'} />
              {st.mode === 'size' && <Stat tone="main" label={t('Diameter of each of the {n} holes', { n: st.n })} value={fmt(holeDiameter(out.area, st.n) * 1000)} unit="mm" />}
              <Stat label={t('Total area')} value={fmt(out.area * 1e6)} unit="mm²" />
              <Stat label={t('Specific flux')} value={fmt(out.r.dyer)} unit="kg/s·m²" />
              <Stat label={t('Injector ΔP')} value={fmt((out.upP - out.Pd) / BAR)} unit="bar" />
            </div>
            {(out.upP - out.Pd) / out.Pd < 0.2 && <Note warn>{t('The pressure drop across the injector is {pct}% of the chamber pressure: below about 20% the risk of combustion instability (coupling with the feed system) increases.', { pct: fmt(((out.upP - out.Pd) / out.Pd) * 100, 2) })}</Note>}
            <Note>{out.r.regime === 'liquid' ? t('Fully liquid flow: the chamber pressure is above the vapor pressure, so SPI and Dyer coincide.') : t('Two-phase (flashing) flow: Dyer combines SPI and HEM according to κ.')}</Note>
            <div className="stat-grid small">
              <Stat label={t('Vapor pressure')} value={fmt(out.sat.P / BAR)} unit="bar" />
              <Stat label={t('Liquid density')} value={fmt(out.sat.rhoL)} unit="kg/m³" />
              <Stat label={t('Vapor density')} value={fmt(out.sat.rhoV)} unit="kg/m³" />
            </div>
            <FlowChart tC={st.tC} pTank={st.pTank} pressurized={st.pressurized} area={out.area} cd={st.cd} choked={st.choked} pc={st.pc} />
            <Note>{t('Properties from NIST (Span–Wagner equation of state). Compressed liquid treated as incompressible. The Dyer model is an engineering approximation: verify the results with cold-flow tests.')}</Note>
          </>
        )}
      </div>
    </div>
  )
}

function GasTab({ st, set }: { st: Calc['gas']; set: (p: Partial<Calc['gas']>) => void }) {
  const gas = gasById(st.gas)
  const out = useMemo(() => {
    const P0 = st.p0 * BAR, Pd = st.pd * BAR, T0 = st.tC + 273.15
    if (Pd >= P0) return { ok: false, error: t('The downstream pressure must be lower than the upstream one.') } as const
    const area = st.mode === 'flow' ? Math.PI * (st.dMm / 1000) ** 2 / 4 : gasRequiredArea(gas, P0, T0, Pd, st.mdotG / 1000, st.cd)
    const r = gasOrificeFlow(gas, P0, T0, Pd, area, st.cd)
    return { ok: true as const, r, area }
  }, [st, gas])
  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <h3>{t('Gas')}</h3>
        <label className="field"><span>{t('Gas')}</span><select value={st.gas} onChange={(e) => set({ gas: e.target.value })}>{GASES.map((g) => <option key={g.id} value={g.id}>{g.name[uiLanguage()]}</option>)}</select></label>
        <Num label={t('Upstream pressure')} unit="bar" value={st.p0} onChange={(v) => set({ p0: v })} />
        <Num label={t('Upstream temperature')} unit="°C" value={st.tC} onChange={(v) => set({ tC: v })} />
        <Num label={t('Downstream pressure')} unit="bar" value={st.pd} onChange={(v) => set({ pd: v })} />
        <h3>{t('Orifice')}</h3>
        <Num label={t('Discharge coefficient Cd')} value={st.cd} onChange={(v) => set({ cd: v })} />
        <div className="seg wide" role="group">
          <button className={st.mode === 'flow' ? 'on' : ''} onClick={() => set({ mode: 'flow' })}>{t('Calculate the flow rate')}</button>
          <button className={st.mode === 'size' ? 'on' : ''} onClick={() => set({ mode: 'size' })}>{t('Size the hole')}</button>
        </div>
        {st.mode === 'flow' ? <Num label={t('Hole diameter')} unit="mm" value={st.dMm} onChange={(v) => set({ dMm: v })} /> : <Num label={t('Required flow rate')} unit="g/s" value={st.mdotG} onChange={(v) => set({ mdotG: v })} />}
      </div>
      <div className="calc-results">
        {!out.ok ? <Note warn>{out.error}</Note> : (
          <>
            <div className="stat-grid">
              <Stat tone="main" label={t('Mass flow rate')} value={fmt(out.r.mdot * 1000)} unit="g/s" />
              {st.mode === 'size' && <Stat tone="main" label={t('Hole diameter')} value={fmt(Math.sqrt((4 * out.area) / Math.PI) * 1000)} unit="mm" />}
              <Stat label={t('Regime')} value={out.r.choked ? t('critical (choked)') : t('subsonic')} />
              <Stat label={t('Critical ratio Pd/P0')} value={fmt(out.r.criticalRatio)} />
              <Stat label={t('Area')} value={fmt(out.area * 1e6)} unit="mm²" />
            </div>
            {st.p0 > 100 && <Note warn>{t('Above about 100 bar the real gas departs from the ideal gas (factor Z): the result is indicative.')}</Note>}
            <Note>{t('Ideal gas, one-dimensional isentropic expansion. With choked flow the flow rate depends only on the upstream conditions.')}</Note>
          </>
        )}
      </div>
    </div>
  )
}

function liquidProps(id: string, tC: number): { rho: number; mu: number; label: string } {
  if (id === 'n2o') {
    const s = satAtT(Math.min(N2O_T_MAX - 1, Math.max(N2O_T_MIN, tC + 273.15)))
    return { rho: s.rhoL, mu: s.muL, label: t('Saturated liquid N₂O') }
  }
  const l = LIQUIDS.find((x) => x.id === id) ?? LIQUIDS[0]
  return { rho: l.rho, mu: l.mu, label: l.name[uiLanguage()] }
}

function LiquidSelect({ value, onChange, tC, onT }: { value: string; onChange: (v: string) => void; tC: number; onT: (v: number) => void }) {
  return (
    <>
      <label className="field"><span>{t('Fluid')}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="n2o">{t('Liquid nitrous oxide (saturated)')}</option>
          {LIQUIDS.map((l) => <option key={l.id} value={l.id}>{l.name[uiLanguage()]}</option>)}
        </select>
      </label>
      {value === 'n2o' && <Num label={t('N₂O temperature')} unit="°C" value={tC} onChange={onT} />}
    </>
  )
}

function PipeTab({ st, set }: { st: Calc['pipe']; set: (p: Partial<Calc['pipe']>) => void }) {
  const out = useMemo(() => {
    try {
      const f = liquidProps(st.liquid, st.tC)
      const r = pipeDrop(st.mdotG / 1000, st.dMm / 1000, st.L, f.rho, f.mu, st.rough * 1e-6, st.K)
      return { ok: true as const, r, f }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } as const }
  }, [st])
  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <h3>{t('Fluid and flow rate')}</h3>
        <LiquidSelect value={st.liquid} onChange={(v) => set({ liquid: v })} tC={st.tC} onT={(v) => set({ tC: v })} />
        <Num label={t('Mass flow rate')} unit="g/s" value={st.mdotG} onChange={(v) => set({ mdotG: v })} />
        <h3>{t('Pipe')}</h3>
        <Num label={t('Inner diameter')} unit="mm" value={st.dMm} onChange={(v) => set({ dMm: v })} hint={t('Outer diameter minus twice the wall.')} />
        <Num label={t('Length')} unit="m" value={st.L} onChange={(v) => set({ L: v })} />
        <Num label={t('Absolute roughness')} unit="µm" value={st.rough} onChange={(v) => set({ rough: v })} hint={t('Drawn tube ≈ 1.5 µm; commercial steel ≈ 45 µm.')} />
        <Num label={t('Minor losses ΣK')} value={st.K} onChange={(v) => set({ K: v })} hint={t('90° elbow ≈ 0.3–0.9; open ball valve ≈ 0.05–0.2; entrance ≈ 0.5.')} />
      </div>
      <div className="calc-results">
        {!out.ok ? <Note warn>{out.error}</Note> : (
          <>
            <div className="stat-grid">
              <Stat tone="main" label={t('Total pressure drop')} value={fmt(out.r.dpTotal / BAR)} unit="bar" />
              <Stat label={t('Distributed (friction)')} value={fmt(out.r.dpFriction / BAR)} unit="bar" />
              <Stat label={t('Minor')} value={fmt(out.r.dpMinor / BAR)} unit="bar" />
              <Stat label={t('Velocity')} value={fmt(out.r.velocity)} unit="m/s" />
              <Stat label="Reynolds" value={fmt(out.r.reynolds, 4)} />
              <Stat label={t('Regime')} value={out.r.regime} />
              <Stat label={t('Friction factor f')} value={fmt(out.r.frictionFactor)} />
              <Stat label={t('Density · viscosity')} value={`${fmt(out.f.rho)} · ${fmt(out.f.mu * 1000)}`} unit="kg/m³ · mPa·s" />
            </div>
            {out.r.velocity > 8 && <Note warn>{t('High velocity ({v} m/s): risk of water hammer and cavitation. For liquids it is often kept below 5–8 m/s.', { v: fmt(out.r.velocity) })}</Note>}
            {st.liquid === 'n2o' && <Note warn>{t('With saturated N₂O, a pressure drop in the line can cause vaporization (flashing): if the liquid is saturated it is advisable to subcool it with a pressurizing gas.')}</Note>}
            <Note>{t('Darcy–Weisbach, incompressible liquid. Friction: 64/Re in laminar flow, Swamee–Jain in turbulent flow.')}</Note>
          </>
        )}
      </div>
    </div>
  )
}

function CvTab({ st, set }: { st: Calc['cv']; set: (p: Partial<Calc['cv']>) => void }) {
  const out = useMemo(() => {
    try {
      const f = liquidProps(st.liquid, st.tC)
      const mdot = st.mdotG / 1000
      const dp = st.dp * BAR
      const cvReq = (() => { const unit = liquidFlowFromCv(1, dp, f.rho); return unit > 0 ? mdot / unit : Infinity })()
      const flow = liquidFlowFromCv(st.cv, dp, f.rho)
      const drop = dropFromCv(st.cv, mdot, f.rho)
      const unitCv = cvOfOrifice(1, st.cdOrifice)
      const eqD = Math.sqrt((4 * (st.cv / unitCv)) / Math.PI)
      return { ok: true as const, f, cvReq, flow, drop, eqD }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } as const }
  }, [st])
  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <h3>{t('Fluid')}</h3>
        <LiquidSelect value={st.liquid} onChange={(v) => set({ liquid: v })} tC={st.tC} onT={(v) => set({ tC: v })} />
        <h3>{t('Conditions')}</h3>
        <Num label={t('Mass flow rate')} unit="g/s" value={st.mdotG} onChange={(v) => set({ mdotG: v })} />
        <Num label={t('Allowed pressure drop')} unit="bar" value={st.dp} onChange={(v) => set({ dp: v })} />
        <h3>{t('Valve')}</h3>
        <Num label={t('Valve Cv')} value={st.cv} onChange={(v) => set({ cv: v })} hint={t('Cv in US gpm per √psi, as on data sheets.')} />
        <Num label={t('Cd for the equivalent orifice')} value={st.cdOrifice} onChange={(v) => set({ cdOrifice: v })} />
      </div>
      <div className="calc-results">
        {!out.ok ? <Note warn>{out.error}</Note> : (
          <>
            <div className="stat-grid">
              <Stat tone="main" label={t('Required Cv')} value={fmt(out.cvReq)} />
              <Stat label={t('Flow rate with Cv {cv} and ΔP {dp} bar', { cv: st.cv, dp: st.dp })} value={fmt(out.flow * 1000)} unit="g/s" />
              <Stat label={t('ΔP with Cv {cv} at the given flow rate', { cv: st.cv })} value={fmt(out.drop / BAR)} unit="bar" />
              <Stat label={t('Hole equivalent to that Cv')} value={fmt(out.eqD * 1000)} unit="mm" />
              <Stat label={t('Equivalent Kv')} value={fmt(st.cv * 0.865)} unit="m³/h·√bar⁻¹" />
            </div>
            <Note>{t('Formula for non-vaporizing liquids: Q = Kv·√(ΔP/SG). For N₂O near saturation the flow can vaporize and Cv is not enough: use the injector calculation.')}</Note>
          </>
        )}
      </div>
    </div>
  )
}

function useSelectedInjector() {
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const sel = tab.selection.length === 1 ? tab.doc.drawing.components.find((c) => c.id === tab.selection[0]) : undefined
  if (!sel || (sel.symbol !== 'engine.injector' && sel.symbol !== 'fitting.orifice')) return null
  return {
    tag: sel.tag,
    props: sel.props,
    apply: (n: number, dMm: number, cd: number) =>
      edit((d) => {
        const c = d.drawing.components.find((x) => x.id === sel.id)
        if (!c) return
        c.props.holes = String(n)
        c.props.holeDia = String(Number(dMm.toFixed(3)))
        c.props.cd = String(cd)
      }),
  }
}

const TABS: { id: TabId; label: string; Icon: typeof Flame }[] = [
  { id: 'n2o', label: N_('N₂O injector'), Icon: Flame },
  { id: 'gas', label: N_('Gas orifice'), Icon: Wind },
  { id: 'pipe', label: N_('Pressure drop'), Icon: Droplets },
  { id: 'cv', label: N_('Valves (Cv)'), Icon: Gauge },
]

export default function CalcDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('n2o')
  const [calc, setCalc] = useState<Calc>(loadCalc)
  const selected = useSelectedInjector()
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(calc)) } catch { /* storage unavailable */ }
  }, [calc])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const upd = <K extends keyof Calc>(k: K) => (p: Partial<Calc[K]>) => setCalc((c) => ({ ...c, [k]: { ...c[k], ...p } }))

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="export calc" role="dialog" aria-modal aria-label={t('Calculations')} onMouseDown={(e) => e.stopPropagation()}>
        <header className="export-head">
          <h2>{t('Calculations')}</h2>
          <div className="calc-tabs" role="tablist">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon size={15} />{t(label)}</button>
            ))}
          </div>
          <div className="spacer" />
          <button className="icon-btn" aria-label={t('Close')} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="calc-body">
          {tab === 'n2o' && <N2OTab st={calc.n2o} set={upd('n2o')} selected={selected} />}
          {tab === 'gas' && <GasTab st={calc.gas} set={upd('gas')} />}
          {tab === 'pipe' && <PipeTab st={calc.pipe} set={upd('pipe')} />}
          {tab === 'cv' && <CvTab st={calc.cv} set={upd('cv')} />}
        </div>
      </div>
    </div>
  )
}
