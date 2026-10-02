import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Droplets, Flame, Gauge, Wind, X } from 'lucide-react'
import { GASES, gasById, gasOrificeFlow, gasRequiredArea } from './engine/gas'
import { LIQUIDS, cvOfOrifice, dropFromCv, liquidFlowFromCv, pipeDrop } from './engine/hydraulics'
import {
  N2O_T_MAX, N2O_T_MIN, holeArea, holeDiameter, n2oFlux, n2oMassFlow, n2oRequiredArea, satAtT, upstreamState,
} from './engine/n2o'
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

/** Curve portata–pressione di camera per i tre modelli. */
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Portata in funzione della pressione di camera">
        {yt.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="gl" /><text x={L - 6} y={y(v) + 3} textAnchor="end" className="tk">{fmt(v, 2)}</text></g>)}
        {xt.map((v) => <text key={v} x={x(v)} y={H - 10} textAnchor="middle" className="tk">{Math.round(v)}</text>)}
        <path d={path('spi')} className="c-spi" /><path d={path('hem')} className="c-hem" /><path d={path('dyer')} className="c-dyer" />
        <line x1={x(pc)} x2={x(pc)} y1={T} y2={H - B} className="marker" />
        <text x={W / 2} y={H - 0} textAnchor="middle" className="tk">pressione di camera (bar)</text>
        <text x={L - 6} y={12} textAnchor="end" className="tk">g/s</text>
      </svg>
      <figcaption><i className="k-spi" />SPI <i className="k-hem" />HEM <i className="k-dyer" />Dyer <i className="k-mark" />pressione scelta</figcaption>
    </figure>
  )
}

function N2OTab({ st, set, selected }: { st: Calc['n2o']; set: (p: Partial<Calc['n2o']>) => void; selected: ReturnType<typeof useSelectedInjector> }) {
  const out = useMemo(() => {
    try {
      const T = st.tC + 273.15
      if (T < N2O_T_MIN || T > N2O_T_MAX - 0.5) throw new RangeError(`Temperatura fuori campo: ${N2O_T_MIN - 273.15 | 0}…${(N2O_T_MAX - 273.15) | 0} °C (qui limitata a ${(N2O_T_MAX - 273.15 - 0.5).toFixed(1)} °C, vicino al punto critico)`)
      const sat = satAtT(T)
      const Pu = st.pressurized ? Math.max(st.pTank, sat.P / BAR) * BAR : undefined
      const Pd = st.pc * BAR
      const upP = Pu ?? sat.P
      if (Pd >= upP) throw new RangeError('La pressione di camera deve essere inferiore a quella del serbatoio.')
      if (Pd < 1e5 * 0.5) throw new RangeError('Pressione di camera troppo bassa (min 0,5 bar).')
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
        <h3>Serbatoio</h3>
        <Num label="Temperatura del liquido" unit="°C" value={st.tC} onChange={(v) => set({ tC: v })} />
        <label className="check-line"><input type="checkbox" checked={st.pressurized} onChange={(e) => set({ pressurized: e.target.checked })} />Pressurizzato con gas (liquido sottoraffreddato)</label>
        {st.pressurized && <Num label="Pressione nel serbatoio" unit="bar" value={st.pTank} onChange={(v) => set({ pTank: v })} hint="Se inferiore alla pressione di vapore si usa quest'ultima." />}
        <h3>Iniettore</h3>
        <Num label="Pressione in camera" unit="bar" value={st.pc} onChange={(v) => set({ pc: v })} />
        <Num label="Coefficiente di scarico Cd" value={st.cd} onChange={(v) => set({ cd: v })} hint="Tipico 0,6–0,85 per fori netti." />
        <div className="seg wide" role="group" aria-label="Modo di calcolo">
          <button className={st.mode === 'flow' ? 'on' : ''} onClick={() => set({ mode: 'flow' })}>Calcola la portata</button>
          <button className={st.mode === 'size' ? 'on' : ''} onClick={() => set({ mode: 'size' })}>Dimensiona i fori</button>
        </div>
        {st.mode === 'flow' ? (
          <div className="two"><Num label="Numero di fori" value={st.n} onChange={(v) => set({ n: Math.max(1, Math.round(v)) })} /><Num label="Diametro foro" unit="mm" value={st.dMm} onChange={(v) => set({ dMm: v })} /></div>
        ) : (
          <>
            <Num label="Portata richiesta" unit="g/s" value={st.mdotG} onChange={(v) => set({ mdotG: v })} />
            <Num label="Numero di fori" value={st.n} onChange={(v) => set({ n: Math.max(1, Math.round(v)) })} />
          </>
        )}
        <label className="check-line"><input type="checkbox" checked={st.choked} onChange={(e) => set({ choked: e.target.checked })} />HEM con portata critica (consigliato)</label>
        {selected && (
          <div className="btn-row">
            <button onClick={() => { const p = selected.props; set({ n: Number(p.holes) || 1, dMm: Number(p.holeDia) || st.dMm, cd: Number(p.cd) || st.cd, mode: 'flow' }) }}>Leggi da {selected.tag}</button>
            {out.ok && <button onClick={() => selected.apply(st.n, holeDiameter(out.area, st.n) * 1000, st.cd)}>Scrivi su {selected.tag}</button>}
          </div>
        )}
      </div>
      <div className="calc-results">
        {!out.ok ? <Note warn>{out.error}</Note> : (
          <>
            <div className="stat-grid">
              <Stat tone="main" label="Portata (modello di Dyer)" value={fmt(out.r.mdotDyer * 1000)} unit="g/s" />
              <Stat label="Solo SPI (liquido)" value={fmt(out.r.mdotSPI * 1000)} unit="g/s" />
              <Stat label="Solo HEM (equilibrio)" value={fmt(out.r.mdotHEM * 1000)} unit="g/s" />
              <Stat label="κ (non-equilibrio)" value={Number.isFinite(out.r.kappa) ? fmt(out.r.kappa) : '∞'} />
              {st.mode === 'size' && <Stat tone="main" label={`Diametro di ciascuno dei ${st.n} fori`} value={fmt(holeDiameter(out.area, st.n) * 1000)} unit="mm" />}
              <Stat label="Area totale" value={fmt(out.area * 1e6)} unit="mm²" />
              <Stat label="Flusso specifico" value={fmt(out.r.dyer)} unit="kg/s·m²" />
              <Stat label="ΔP iniettore" value={fmt((out.upP - out.Pd) / BAR)} unit="bar" />
            </div>
            {(out.upP - out.Pd) / out.Pd < 0.2 && <Note warn>La caduta di pressione sull'iniettore è {fmt(((out.upP - out.Pd) / out.Pd) * 100, 2)}% della pressione di camera: sotto il 20% circa aumenta il rischio di instabilità di combustione (accoppiamento con il feed system).</Note>}
            <Note>{out.r.regime === 'liquid' ? 'Flusso interamente liquido: la pressione di camera è sopra la pressione di vapore, quindi SPI e Dyer coincidono.' : 'Flusso bifase (flashing): Dyer combina SPI e HEM in base a κ.'}</Note>
            <div className="stat-grid small">
              <Stat label="Pressione di vapore" value={fmt(out.sat.P / BAR)} unit="bar" />
              <Stat label="Densità liquido" value={fmt(out.sat.rhoL)} unit="kg/m³" />
              <Stat label="Densità vapore" value={fmt(out.sat.rhoV)} unit="kg/m³" />
            </div>
            <FlowChart tC={st.tC} pTank={st.pTank} pressurized={st.pressurized} area={out.area} cd={st.cd} choked={st.choked} pc={st.pc} />
            <Note>Proprietà dal NIST (equazione di stato di Span–Wagner). Liquido compresso trattato come incomprimibile. Il modello di Dyer è un'approssimazione ingegneristica: verifica i risultati con prove a freddo.</Note>
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
    if (Pd >= P0) return { ok: false, error: 'La pressione a valle deve essere inferiore a quella a monte.' } as const
    const area = st.mode === 'flow' ? Math.PI * (st.dMm / 1000) ** 2 / 4 : gasRequiredArea(gas, P0, T0, Pd, st.mdotG / 1000, st.cd)
    const r = gasOrificeFlow(gas, P0, T0, Pd, area, st.cd)
    return { ok: true as const, r, area }
  }, [st, gas])
  return (
    <div className="calc-grid">
      <div className="calc-inputs">
        <h3>Gas</h3>
        <label className="field"><span>Gas</span><select value={st.gas} onChange={(e) => set({ gas: e.target.value })}>{GASES.map((g) => <option key={g.id} value={g.id}>{g.name.it}</option>)}</select></label>
        <Num label="Pressione a monte" unit="bar" value={st.p0} onChange={(v) => set({ p0: v })} />
        <Num label="Temperatura a monte" unit="°C" value={st.tC} onChange={(v) => set({ tC: v })} />
        <Num label="Pressione a valle" unit="bar" value={st.pd} onChange={(v) => set({ pd: v })} />
        <h3>Orifizio</h3>
        <Num label="Coefficiente di scarico Cd" value={st.cd} onChange={(v) => set({ cd: v })} />
        <div className="seg wide" role="group">
          <button className={st.mode === 'flow' ? 'on' : ''} onClick={() => set({ mode: 'flow' })}>Calcola la portata</button>
          <button className={st.mode === 'size' ? 'on' : ''} onClick={() => set({ mode: 'size' })}>Dimensiona il foro</button>
        </div>
        {st.mode === 'flow' ? <Num label="Diametro del foro" unit="mm" value={st.dMm} onChange={(v) => set({ dMm: v })} /> : <Num label="Portata richiesta" unit="g/s" value={st.mdotG} onChange={(v) => set({ mdotG: v })} />}
      </div>
      <div className="calc-results">
        {!out.ok ? <Note warn>{out.error}</Note> : (
          <>
            <div className="stat-grid">
              <Stat tone="main" label="Portata massica" value={fmt(out.r.mdot * 1000)} unit="g/s" />
              {st.mode === 'size' && <Stat tone="main" label="Diametro del foro" value={fmt(Math.sqrt((4 * out.area) / Math.PI) * 1000)} unit="mm" />}
              <Stat label="Regime" value={out.r.choked ? 'critico (bloccato)' : 'subsonico'} />
              <Stat label="Rapporto critico Pd/P0" value={fmt(out.r.criticalRatio)} />
              <Stat label="Area" value={fmt(out.area * 1e6)} unit="mm²" />
            </div>
            {st.p0 > 100 && <Note warn>Oltre circa 100 bar il gas reale si discosta dal gas ideale (fattore Z): il risultato è indicativo.</Note>}
            <Note>Gas ideale, espansione isentropica monodimensionale. Con flusso bloccato la portata dipende solo dalle condizioni a monte.</Note>
          </>
        )}
      </div>
    </div>
  )
}

function liquidProps(id: string, tC: number): { rho: number; mu: number; label: string } {
  if (id === 'n2o') {
    const s = satAtT(Math.min(N2O_T_MAX - 1, Math.max(N2O_T_MIN, tC + 273.15)))
    return { rho: s.rhoL, mu: s.muL, label: 'N₂O liquido saturo' }
  }
  const l = LIQUIDS.find((x) => x.id === id) ?? LIQUIDS[0]
  return { rho: l.rho, mu: l.mu, label: l.name.it }
}

function LiquidSelect({ value, onChange, tC, onT }: { value: string; onChange: (v: string) => void; tC: number; onT: (v: number) => void }) {
  return (
    <>
      <label className="field"><span>Fluido</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="n2o">Protossido d'azoto liquido (saturo)</option>
          {LIQUIDS.map((l) => <option key={l.id} value={l.id}>{l.name.it}</option>)}
        </select>
      </label>
      {value === 'n2o' && <Num label="Temperatura N₂O" unit="°C" value={tC} onChange={onT} />}
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
        <h3>Fluido e portata</h3>
        <LiquidSelect value={st.liquid} onChange={(v) => set({ liquid: v })} tC={st.tC} onT={(v) => set({ tC: v })} />
        <Num label="Portata massica" unit="g/s" value={st.mdotG} onChange={(v) => set({ mdotG: v })} />
        <h3>Tubo</h3>
        <Num label="Diametro interno" unit="mm" value={st.dMm} onChange={(v) => set({ dMm: v })} hint="Diametro esterno meno due volte la parete." />
        <Num label="Lunghezza" unit="m" value={st.L} onChange={(v) => set({ L: v })} />
        <Num label="Rugosità assoluta" unit="µm" value={st.rough} onChange={(v) => set({ rough: v })} hint="Tubo trafilato ≈ 1,5 µm; acciaio commerciale ≈ 45 µm." />
        <Num label="Perdite concentrate ΣK" value={st.K} onChange={(v) => set({ K: v })} hint="Gomito 90° ≈ 0,3–0,9; valvola a sfera aperta ≈ 0,05–0,2; ingresso ≈ 0,5." />
      </div>
      <div className="calc-results">
        {!out.ok ? <Note warn>{out.error}</Note> : (
          <>
            <div className="stat-grid">
              <Stat tone="main" label="Perdita di carico totale" value={fmt(out.r.dpTotal / BAR)} unit="bar" />
              <Stat label="Distribuita (attrito)" value={fmt(out.r.dpFriction / BAR)} unit="bar" />
              <Stat label="Concentrata" value={fmt(out.r.dpMinor / BAR)} unit="bar" />
              <Stat label="Velocità" value={fmt(out.r.velocity)} unit="m/s" />
              <Stat label="Reynolds" value={fmt(out.r.reynolds, 4)} />
              <Stat label="Regime" value={out.r.regime} />
              <Stat label="Fattore di attrito f" value={fmt(out.r.frictionFactor)} />
              <Stat label="Densità · viscosità" value={`${fmt(out.f.rho)} · ${fmt(out.f.mu * 1000)}`} unit="kg/m³ · mPa·s" />
            </div>
            {out.r.velocity > 8 && <Note warn>Velocità elevata ({fmt(out.r.velocity)} m/s): rischio di colpo d'ariete e di cavitazione. Per liquidi si resta spesso sotto 5–8 m/s.</Note>}
            {st.liquid === 'n2o' && <Note warn>Con N₂O saturo, una caduta di pressione nella linea può provocare vaporizzazione (flashing): se il liquido è saturo conviene sottoraffreddarlo con un gas pressurizzante.</Note>}
            <Note>Darcy–Weisbach, liquido incomprimibile. Attrito: 64/Re in laminare, Swamee–Jain in turbolento.</Note>
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
        <h3>Fluido</h3>
        <LiquidSelect value={st.liquid} onChange={(v) => set({ liquid: v })} tC={st.tC} onT={(v) => set({ tC: v })} />
        <h3>Condizioni</h3>
        <Num label="Portata massica" unit="g/s" value={st.mdotG} onChange={(v) => set({ mdotG: v })} />
        <Num label="Caduta di pressione ammessa" unit="bar" value={st.dp} onChange={(v) => set({ dp: v })} />
        <h3>Valvola</h3>
        <Num label="Cv della valvola" value={st.cv} onChange={(v) => set({ cv: v })} hint="Cv in gpm USA per √psi, come sulle schede tecniche." />
        <Num label="Cd per l'orifizio equivalente" value={st.cdOrifice} onChange={(v) => set({ cdOrifice: v })} />
      </div>
      <div className="calc-results">
        {!out.ok ? <Note warn>{out.error}</Note> : (
          <>
            <div className="stat-grid">
              <Stat tone="main" label="Cv necessario" value={fmt(out.cvReq)} />
              <Stat label={`Portata con Cv ${st.cv} e ΔP ${st.dp} bar`} value={fmt(out.flow * 1000)} unit="g/s" />
              <Stat label={`ΔP con Cv ${st.cv} alla portata data`} value={fmt(out.drop / BAR)} unit="bar" />
              <Stat label="Foro equivalente a quel Cv" value={fmt(out.eqD * 1000)} unit="mm" />
              <Stat label="Kv equivalente" value={fmt(st.cv * 0.865)} unit="m³/h·√bar⁻¹" />
            </div>
            <Note>Formula per liquidi non vaporizzanti: Q = Kv·√(ΔP/SG). Per N₂O vicino alla saturazione il flusso può vaporizzare e il Cv non basta: usa il calcolo dell'iniettore.</Note>
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
  { id: 'n2o', label: 'Iniettore N₂O', Icon: Flame },
  { id: 'gas', label: 'Orifizio gas', Icon: Wind },
  { id: 'pipe', label: 'Perdite di carico', Icon: Droplets },
  { id: 'cv', label: 'Valvole (Cv)', Icon: Gauge },
]

export default function CalcDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('n2o')
  const [calc, setCalc] = useState<Calc>(loadCalc)
  const selected = useSelectedInjector()
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(calc)) } catch { /* storage non disponibile */ }
  }, [calc])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const upd = <K extends keyof Calc>(k: K) => (p: Partial<Calc[K]>) => setCalc((c) => ({ ...c, [k]: { ...c[k], ...p } }))

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="export calc" role="dialog" aria-modal aria-label="Calcoli" onMouseDown={(e) => e.stopPropagation()}>
        <header className="export-head">
          <h2>Calcoli</h2>
          <div className="calc-tabs" role="tablist">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon size={15} />{label}</button>
            ))}
          </div>
          <div className="spacer" />
          <button className="icon-btn" aria-label="Chiudi" onClick={onClose}><X size={18} /></button>
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
