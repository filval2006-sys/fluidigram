import { useCallback, useMemo, useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Copy, FlipHorizontal2, Info, Plus, RotateCw, Trash2 } from 'lucide-react'
import {
  ACTUATORS, ALL_SYMBOLS, CATEGORY_NAMES, END_KINDS, FLUIDS, FLUID_IDS, componentPorts, deleteItems, freePorts, portEnds, renumberTags, replaceComponents, setPortEnd, manualRouteValid, filterPipeSizes, getSymbol, mirrorComponents, newId, rotateComponents, runChecks,
  TONES, type Annotation, type CheckIssue, type Component, type Dir, type SymbolCategory, type Drawing, type EndKind, type FluidId, type Line, type ValveState,
} from '../core'
import { useActiveTab, useShownPhase, useStore, type InspectorTab } from '../state/store'
import { Combobox } from './Combobox'
import { Field, Num, Section, TextField } from './Fields'

const useSizeGroups = () => {
  return useCallback((q: string) => filterPipeSizes(q).map((g) => ({ id: g.id, label: g.label.it, options: g.options })), [])
}

export function Inspector() {
  const tab = useActiveTab()
  const inspectorTab = useStore((s) => s.inspectorTab)
  const setInspectorTab = useStore((s) => s.setInspectorTab)
  const issues = useMemo(() => runChecks(tab.doc), [tab.doc])
  const problems = issues.filter((i) => i.severity !== 'info').length
  const sheet = tab.doc.drawing
  const sel = tab.selection
  const comps = sheet.components.filter((c) => sel.includes(c.id))
  const lines = sheet.lines.filter((l) => sel.includes(l.id))
  const anns = sheet.annotations.filter((a) => sel.includes(a.id))

  const tabs: { id: InspectorTab; label: string; badge?: number }[] = [
    { id: 'props', label: 'Proprietà' },
    { id: 'checks', label: 'Controlli', badge: problems },
    { id: 'phases', label: 'Fasi' },
  ]

  return (
    <aside className="inspector">
      <div className="itabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={inspectorTab === t.id} className={inspectorTab === t.id ? 'on' : ''} onClick={() => setInspectorTab(t.id)}>
            {t.label}{!!t.badge && <i className="badge">{t.badge}</i>}
          </button>
        ))}
      </div>
      {inspectorTab === 'checks' && <ChecksPanel issues={issues} />}
      {inspectorTab === 'phases' && <PhasesPanel />}
      {inspectorTab === 'props' && (
        <>
          {sel.length === 0 && <ProjectSummary />}
          {sel.length === 1 && comps.length === 1 && <ComponentPanel c={comps[0]} />}
          {sel.length === 1 && lines.length === 1 && <LinePanel l={lines[0]} sheet={sheet} />}
          {sel.length === 1 && anns.length === 1 && <AnnotationPanel a={anns[0]} />}
          {sel.length > 1 && <MultiPanel ids={sel} count={comps.length + lines.length + anns.length} />}
        </>
      )}
    </aside>
  )
}

const SEV = {
  error: { Icon: AlertOctagon, label: 'Errori' },
  warning: { Icon: AlertTriangle, label: 'Avvisi' },
  info: { Icon: Info, label: 'Suggerimenti' },
} as const

function ChecksPanel({ issues }: { issues: CheckIssue[] }) {
  const setSelection = useStore((s) => s.setSelection)
  const focusOn = useStore((s) => s.focusOn)
  const show = (i: CheckIssue) => { setSelection(i.targets); focusOn(i.targets) }
  if (!issues.length) {
    return (
      <Section title="Controlli">
        <p className="allgood"><CheckCircle2 size={18} /> Nessun problema rilevato.</p>
        <p className="muted small">Si controllano porte aperte, fluidi collegati tra loro, volumi chiudibili senza protezione, pressioni e dati mancanti.</p>
      </Section>
    )
  }
  return (
    <>
      {(['error', 'warning', 'info'] as const).map((sev) => {
        const list = issues.filter((i) => i.severity === sev)
        if (!list.length) return null
        const { Icon, label } = SEV[sev]
        return (
          <Section key={sev} title={`${label} (${list.length})`}>
            <ul className="issues">
              {list.map((i) => (
                <li key={i.id}>
                  <button className={'issue ' + sev} onClick={() => show(i)}><Icon size={16} /><span>{i.message}</span></button>
                </li>
              ))}
            </ul>
          </Section>
        )
      })}
      <p className="hint plain">I controlli sono un aiuto: non sostituiscono la verifica ingegneristica dell'impianto.</p>
    </>
  )
}

const DEFAULT_PHASES = [
  { it: 'Stoccaggio (safe)', en: 'Storage (safe)' },
  { it: 'Riempimento', en: 'Filling' },
  { it: 'Pressurizzazione', en: 'Pressurization' },
  { it: 'Accensione', en: 'Ignition' },
  { it: 'Combustione', en: 'Burn' },
  { it: 'Sfiato / spegnimento', en: 'Vent / shutdown' },
]
const NEXT_STATE: Record<string, ValveState | undefined> = { '': 'closed', closed: 'open', open: undefined }

function PhasesPanel() {
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const activePhase = useShownPhase()
  const setActivePhase = useStore((s) => s.setActivePhase)
  const setSelection = useStore((s) => s.setSelection)
  const focusOn = useStore((s) => s.focusOn)
  const phases = tab.doc.phases
  const valves = tab.doc.drawing.components.filter((c) => {
    const def = getSymbol(c.symbol)
    return def.category === 'valves' && !def.id.startsWith('valve.check') && def.id !== 'valve.relief'
  })

  const cycle = (compId: string, phaseId: string) => edit((d) => {
    const c = d.drawing.components.find((x) => x.id === compId)
    if (!c) return
    const next = NEXT_STATE[c.states?.[phaseId] ?? '']
    if (next) { c.states = { ...c.states, [phaseId]: next } }
    else if (c.states) { delete c.states[phaseId]; if (!Object.keys(c.states).length) c.states = undefined }
  })

  return (
    <>
      <Section title="Fasi di missione" action={
        <button className="icon-btn" aria-label="Aggiungi fase" onClick={() => edit((d) => { d.phases.push({ id: newId('p'), name: { it: `Fase ${d.phases.length + 1}`, en: `Phase ${d.phases.length + 1}` } }) })}><Plus size={14} /></button>
      }>
        {!phases.length && (
          <>
            <p className="muted small">Definisci le fasi (riempimento, pressurizzazione, accensione…) e indica per ogni valvola se è aperta o chiusa. Lo schema le mostra in nero quando sono chiuse e la tabella finisce nell'esportazione.</p>
            <button className="wide-btn" onClick={() => edit((d) => { d.phases = DEFAULT_PHASES.map((n) => ({ id: newId('p'), name: n })) })}>Usa le fasi tipiche di un razzo ibrido</button>
          </>
        )}
        {phases.map((p, idx) => (
          <div className="phase-row" key={p.id}>
            <label className="phase-active" title="Mostra questa fase sul disegno">
              <input type="radio" name="activePhase" checked={activePhase === p.id} onChange={() => setActivePhase(p.id)} />
            </label>
            <TextField value={p.name.it} ariaLabel={`Fase ${idx + 1} italiano`} onCommit={(v) => edit((d) => { d.phases[idx].name.it = v })} />
            <TextField value={p.name.en} ariaLabel={`Phase ${idx + 1} English`} onCommit={(v) => edit((d) => { d.phases[idx].name.en = v })} />
            <button className="icon-btn" aria-label="Elimina fase" onClick={() => {
              edit((d) => { d.phases.splice(idx, 1); for (const c of d.drawing.components) if (c.states) { delete c.states[p.id]; if (!Object.keys(c.states).length) c.states = undefined } })
              if (activePhase === p.id) setActivePhase(null)
            }}><Trash2 size={13} /></button>
          </div>
        ))}
        {!!phases.length && (
          <button className="wide-btn ghost" disabled={!activePhase} onClick={() => setActivePhase(null)}>Nascondi la fase dal disegno</button>
        )}
      </Section>

      {!!phases.length && (
        <Section title="Stato delle valvole">
          {!valves.length ? <p className="muted small">Aggiungi delle valvole al disegno per assegnare gli stati.</p> : (
            <>
              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr><th>Tag</th>{phases.map((p) => <th key={p.id} title={p.name.it} className={activePhase === p.id ? 'on' : ''}>{p.name.it.slice(0, 5)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {valves.map((c) => (
                      <tr key={c.id}>
                        <th><button className="link" onClick={() => { setSelection([c.id]); focusOn([c.id]) }}>{c.tag}</button></th>
                        {phases.map((p) => {
                          const st = c.states?.[p.id]
                          return (
                            <td key={p.id} className={activePhase === p.id ? 'on' : ''}>
                              <button className={'cell ' + (st ?? 'unset')} aria-label={`${c.tag} ${p.name.it}: ${st === 'closed' ? 'chiusa' : st === 'open' ? 'aperta' : 'non specificato'}`} onClick={() => cycle(c.id, p.id)}>
                                {st === 'closed' ? '●' : st === 'open' ? '○' : '–'}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">Clic sulla cella per alternare: ● chiusa · ○ aperta · – non specificato.</p>
            </>
          )}
        </Section>
      )}
    </>
  )
}

const TONE_NAMES: Record<(typeof TONES)[number], string> = { neutral: 'Neutro (nero)', blue: 'Blu', amber: 'Ambra', green: 'Verde', red: 'Rosso' }

function AnnotationPanel({ a }: { a: Annotation }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const patch = (fn: (x: Annotation) => void) => edit((d) => { const t = d.drawing.annotations.find((x) => x.id === a.id); if (t) fn(t) })
  const isBox = a.kind === 'box'
  return (
    <Section title={isBox ? 'Riquadro di zona' : 'Testo libero'}>
      <Field label={isBox ? 'Etichetta (IT)' : 'Testo (IT)'}><TextField multiline={!isBox} value={a.text.it} ariaLabel="Testo italiano" onCommit={(v) => patch((t) => { t.text.it = v })} /></Field>
      <Field label={isBox ? 'Label (EN)' : 'Text (EN)'}><TextField multiline={!isBox} value={a.text.en} ariaLabel="Testo inglese" onCommit={(v) => patch((t) => { t.text.en = v })} /></Field>
      <div className="two">
        <Num label="Dimensione testo" unit="mm" value={a.size} onChange={(v) => patch((t) => { t.size = Math.min(20, Math.max(1.5, v)) })} />
        <Field label="Colore">
          <select value={a.tone} onChange={(e) => patch((t) => { t.tone = e.target.value as Annotation['tone'] })}>
            {TONES.map((t) => <option key={t} value={t}>{TONE_NAMES[t]}</option>)}
          </select>
        </Field>
      </div>
      {isBox && (
        <div className="two">
          <Num label="Larghezza" unit="mm" value={a.w} onChange={(v) => patch((t) => { t.w = Math.max(10, v) })} />
          <Num label="Altezza" unit="mm" value={a.h} onChange={(v) => patch((t) => { t.h = Math.max(10, v) })} />
        </div>
      )}
      <div className="checks">
        {!isBox && <label><input type="checkbox" checked={a.bold} onChange={(e) => patch((t) => { t.bold = e.target.checked })} />Grassetto</label>}
        <label><input type="checkbox" checked={a.framed} onChange={(e) => patch((t) => { t.framed = e.target.checked })} />{isBox ? 'Sfondo colorato' : 'Cornice'}</label>
      </div>
      <div className="btn-row">
        <button onClick={() => useStore.getState().duplicateSelection()} title="Duplica (⌘D)"><Copy size={14} />Duplica</button>
        <button className="danger" onClick={() => { edit((d) => deleteItems(d.drawing, new Set([a.id]))); setSelection([]) }}><Trash2 size={14} />Elimina</button>
      </div>
      {isBox && <p className="muted small">Trascina il quadratino in basso a destra per ridimensionare. Il riquadro si sposta afferrando il bordo o l'etichetta.</p>}
    </Section>
  )
}

function MultiPanel({ ids, count }: { ids: string[]; count: number }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const set = new Set(ids)
  return (
    <>
    <Section title={`${count} elementi selezionati`}>
      <div className="btn-row">
        <button onClick={() => edit((d) => rotateComponents(d.drawing, set))}><RotateCw size={14} />Ruota</button>
        <button onClick={() => edit((d) => mirrorComponents(d.drawing, set))}><FlipHorizontal2 size={14} />Specchia</button>
        <button onClick={() => useStore.getState().duplicateSelection()} title="Duplica (⌘D)"><Copy size={14} />Duplica</button>
        <button className="danger" onClick={() => { edit((d) => deleteItems(d.drawing, set)); setSelection([]) }}><Trash2 size={14} />Elimina</button>
      </div>
    </Section>
    <ReplaceBox ids={ids} />
    </>
  )
}

/** Sostituzione rapida: un simbolo al posto di un altro mantenendo posizione e collegamenti, per uno o più pezzi. */
function ReplaceBox({ ids }: { ids: string[] }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const doc = useActiveTab().doc
  const [msg, setMsg] = useState('')
  const picked = doc.drawing.components.filter((c) => ids.includes(c.id))
  const symbols = [...new Set(picked.map((c) => c.symbol))]
  const home = getSymbol(symbols[0] ?? 'valve.ball').category
  const cats = (Object.keys(CATEGORY_NAMES) as SymbolCategory[]).sort((a, b) => (a === home ? -1 : b === home ? 1 : 0))
  if (!picked.length) return null

  const apply = (symbolId: string) => {
    let res = { replaced: [] as string[], skipped: [] as { tag: string; reason: string }[] }
    edit((d) => { res = replaceComponents(d, new Set(ids), symbolId) })
    const name = getSymbol(symbolId).name.it
    const ok = res.replaced.length ? `${res.replaced.length} ${res.replaced.length === 1 ? 'sostituito' : 'sostituiti'} con ${name}.` : ''
    const no = res.skipped.length ? ` Non sostituiti: ${res.skipped.map((x) => `${x.tag} (${x.reason})`).join('; ')}.` : ''
    setMsg((ok + no).trim() || 'Niente da sostituire: sono già di questo tipo.')
  }

  return (
    <Section title="Sostituisci">
      <Field label={picked.length > 1 ? `Sostituisci ${picked.length} componenti con…` : 'Sostituisci con…'}>
        <select aria-label="Sostituisci con" value="" onChange={(e) => { if (e.target.value) apply(e.target.value) }}>
          <option value="">Scegli il nuovo simbolo…</option>
          {cats.map((cat) => (
            <optgroup key={cat} label={CATEGORY_NAMES[cat].it}>
              {ALL_SYMBOLS.filter((x) => x.category === cat && !(symbols.length === 1 && x.id === symbols[0])).map((x) => <option key={x.id} value={x.id}>{x.name.it}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="btn-row">
        <button onClick={() => setSelection(doc.drawing.components.filter((c) => symbols.includes(c.symbol)).map((c) => c.id))} title="Seleziona nel disegno tutti i componenti dello stesso tipo, per sostituirli insieme">
          Seleziona tutti dello stesso tipo
        </button>
      </div>
      <p className="muted small">Posizione, rotazione e collegamenti restano; diametro, pressione e note si conservano. Si può annullare con ⌘Z.</p>
      {msg && <p className="muted small">{msg}</p>}
    </Section>
  )
}

function ComponentPanel({ c }: { c: Component }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const doc = useActiveTab().doc
  const lang = 'it' as const
  const def = getSymbol(c.symbol)
  const groups = useSizeGroups()
  const [tagError, setTagError] = useState('')
  const set = new Set([c.id])
  const patch = (fn: (c: Component) => void) =>
    edit((d) => { const t = d.drawing.components.find((x) => x.id === c.id); if (t) fn(t) })
  const setProp = (k: string, v: string) => patch((t) => { if (v) t.props[k] = v; else delete t.props[k] })
  const setDesc = (l: 'it' | 'en', v: string) =>
    patch((t) => {
      const next = { it: t.description?.it ?? '', en: t.description?.en ?? '', [l]: v }
      t.description = next.it || next.en ? next : undefined
    })

  return (
    <>
      <Section title={def.name[lang]}>
        <Field label="Tag">
          <TextField value={c.tag} ariaLabel="Tag" onCommit={(v) => {
            const clean = v.trim()
            if (!clean) return setTagError('Il tag non può essere vuoto.')
            if (doc.drawing.components.some((x) => x.id !== c.id && x.tag === clean)) return setTagError(`Il tag ${clean} esiste già.`)
            setTagError('')
            patch((t) => { t.tag = clean })
          }} />
        </Field>
        {tagError && <p className="error">{tagError}</p>}
        <Field label="Descrizione (IT)"><TextField value={c.description?.it ?? ''} onCommit={(v) => setDesc('it', v)} placeholder="es. Intercettazione ossidante" /></Field>
        <Field label="Description (EN)"><TextField value={c.description?.en ?? ''} onCommit={(v) => setDesc('en', v)} placeholder="e.g. Oxidizer shutoff" /></Field>
        <div className="btn-row">
          <button onClick={() => edit((d) => rotateComponents(d.drawing, set))} title="Ruota (R)"><RotateCw size={14} />Ruota</button>
          <button onClick={() => edit((d) => mirrorComponents(d.drawing, set))} title="Specchia (M)"><FlipHorizontal2 size={14} />Specchia</button>
          <button onClick={() => useStore.getState().duplicateSelection()} title="Duplica (⌘D)"><Copy size={14} />Duplica</button>
          <button className="danger" onClick={() => { edit((d) => deleteItems(d.drawing, set)); setSelection([]) }} title="Elimina (Canc)"><Trash2 size={14} />Elimina</button>
        </div>
      </Section>
      <Section title="Dati tecnici">
        <Field label="Diametro / attacco">
          <Combobox ariaLabel="Diametro componente" value={c.props.size ?? ''} getGroups={groups} placeholder="Scegli o scrivi…" onCommit={(v) => setProp('size', v)} />
        </Field>
        {def.options?.map((o) => (
          <Field key={o.key} label={o.label.it}>
            <select value={c.props[o.key] ?? o.default} onChange={(e) => setProp(o.key, e.target.value === o.default ? '' : e.target.value)}>
              {o.choices.map((ch) => <option key={ch.id} value={ch.id}>{ch.label.it}</option>)}
            </select>
          </Field>
        ))}
        {def.actuatable && (
          <Field label="Azionamento">
            <select value={c.props.actuator ?? def.actuatable.defaultActuator} onChange={(e) => setProp('actuator', e.target.value === def.actuatable!.defaultActuator ? '' : e.target.value)}>
              {ACTUATORS.map((a) => <option key={a.id} value={a.id}>{a.name.it}</option>)}
            </select>
          </Field>
        )}
        {(def.id === 'engine.injector' || def.id === 'fitting.orifice') && (
          <>
            <div className="two">
              <Field label="N. fori"><TextField value={c.props.holes ?? ''} placeholder="es. 12" onCommit={(v) => setProp('holes', v)} /></Field>
              <Field label="Ø foro (mm)"><TextField value={c.props.holeDia ?? ''} placeholder="es. 1,5" onCommit={(v) => setProp('holeDia', v)} /></Field>
            </div>
          </>
        )}
        <Field label="Pressione max (bar)"><TextField value={c.props.mawp ?? ''} onCommit={(v) => setProp('mawp', v)} placeholder="es. 100" /></Field>
        {(def.category === 'valves') && (
          <Field label="Stato a riposo">
            <select value={c.props.normal ?? ''} onChange={(e) => setProp('normal', e.target.value)}>
              <option value="">—</option>
              <option value="NC">Normalmente chiusa (NC)</option>
              <option value="NA">Normalmente aperta (NA)</option>
            </select>
          </Field>
        )}
        <Field label="Note"><TextField multiline value={c.props.note ?? ''} onCommit={(v) => setProp('note', v)} /></Field>
      </Section>
      <ReplaceBox ids={[c.id]} />
      <EndsSection c={c} />
    </>
  )
}

const SIDE_NAME: Record<Dir, string> = { N: 'alto', E: 'destra', S: 'basso', W: 'sinistra' }

/** Porte lasciate libere di proposito: sfiato in atmosfera, oppure collegamento che arriva da / va a un altro impianto. */
function EndsSection({ c }: { c: Component }) {
  const edit = useStore((s) => s.edit)
  const doc = useActiveTab().doc
  const ends = portEnds(c)
  const free = freePorts(doc.drawing, c).filter((p) => !ends.some((e) => e.portId === p.id))
  const nameOf = (id: string) => { const p = componentPorts(c).find((x) => x.id === id); return p ? `${id} (${SIDE_NAME[p.dir]})` : id }
  const patch = (fn: (t: Component) => void) => edit((d) => { const t = d.drawing.components.find((x) => x.id === c.id); if (t) fn(t) })
  if (!ends.length && !free.length) return null
  return (
    <Section title="Estremità libere">
      <p className="muted small">Se una porta resta senza tubo di proposito, indica dove va: il controllo non la segnala più e nel disegno compare il simbolo.</p>
      {ends.map((e) => (
        <div className="end-row" key={e.portId}>
          <div className="two">
            <span className="muted small">Porta {nameOf(e.portId)}</span>
            <button className="icon-btn" aria-label={`Togli estremità ${e.portId}`} onClick={() => patch((t) => setPortEnd(t, e.portId, ''))}><Trash2 size={13} /></button>
          </div>
          <select aria-label={`Estremità ${e.portId}`} value={e.kind} onChange={(ev) => patch((t) => setPortEnd(t, e.portId, ev.target.value as EndKind, e.label))}>
            {END_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <TextField value={e.label} ariaLabel={`Testo estremità ${e.portId}`} placeholder={e.kind === 'vent' ? 'ATM' : 'es. N₂O da GSE'} onCommit={(v) => patch((t) => setPortEnd(t, e.portId, e.kind, v))} />
        </div>
      ))}
      {!!free.length && (
        <Field label="Dichiara una porta libera">
          <select aria-label="Dichiara una porta libera" value="" onChange={(ev) => { const id = ev.target.value; if (id) patch((t) => setPortEnd(t, id, 'vent')) }}>
            <option value="">Scegli la porta…</option>
            {free.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}
          </select>
        </Field>
      )}
    </Section>
  )
}

function LinePanel({ l, sheet }: { l: Line; sheet: Drawing }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const lang = 'it' as const
  const groups = useSizeGroups()
  const tagOf = (id: string) => sheet.components.find((c) => c.id === id)?.tag ?? '?'
  const patch = (fn: (l: Line) => void) => edit((d) => { const t = d.drawing.lines.find((x) => x.id === l.id); if (t) fn(t) })

  return (
    <Section title="Linea">
      <p className="muted">{tagOf(l.from.componentId)} → {tagOf(l.to.componentId)}</p>
      <Field label="Fluido">
        <div className="chips wrap">
          {FLUID_IDS.map((id: FluidId) => (
            <button key={id} className={'chip' + (l.fluid === id ? ' on' : '')} onClick={() => patch((t) => { t.fluid = id })} title={FLUIDS[id].name[lang]}>
              <i style={{ background: FLUIDS[id].color }} />{FLUIDS[id].name[lang]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Diametro tubo">
        <Combobox ariaLabel="Diametro tubo" value={l.size ?? ''} getGroups={groups} placeholder="Scegli o scrivi…" onCommit={(v) => patch((t) => { t.size = v })} />
      </Field>
      <Field label="Pressione di esercizio (bar)">
        <TextField value={l.pressure ?? ''} placeholder="es. 60" ariaLabel="Pressione di esercizio" onCommit={(v) => patch((t) => { t.pressure = v || undefined })} />
      </Field>
      {manualRouteValid(sheet, l) ? (
        <p className="muted small">Percorso modificato a mano. <button className="link" onClick={() => patch((t) => { delete t.route })}>Ripristina il percorso automatico</button></p>
      ) : (
        <p className="muted small">Percorso automatico. Trascina le maniglie quadrate per spostare i tratti, il pallino azzurro agli estremi per ricollegare la linea.</p>
      )}
      <div className="btn-row">
        <button className="danger" onClick={() => { edit((d) => deleteItems(d.drawing, new Set([l.id]))); setSelection([]) }}><Trash2 size={14} />Elimina linea</button>
      </div>
    </Section>
  )
}

function ProjectSummary() {
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const d = tab.doc.drawing
  const m = tab.doc.meta
  const fluids = [...new Set(d.lines.map((l) => l.fluid))]
  const setTitle = (l: 'it' | 'en', v: string) => edit((x) => { x.meta.title[l] = v })
  const [renumbered, setRenumbered] = useState<number | null>(null)

  return (
    <>
      <Section title="Progetto">
        <Field label="Nome (IT)"><TextField value={m.title.it} onCommit={(v) => setTitle('it', v)} /></Field>
        <Field label="Name (EN)"><TextField value={m.title.en} onCommit={(v) => setTitle('en', v)} /></Field>
        <div className="stats">
          <div><b>{d.components.length}</b><span>componenti</span></div>
          <div><b>{d.lines.length}</b><span>linee</span></div>
          <div><b>{fluids.length}</b><span>fluidi</span></div>
        </div>
        <p className="muted small">Cartiglio, legenda, formato e impaginazione si impostano in <b>Esporta</b>: qui disegni senza pensare al foglio.</p>
      </Section>
      <Section title="Numerazione">
        <p className="muted small">I tag nuovi partono da 1 (BV-1, BV-2…). Nei progetti vecchi puoi rinumerare quelli automatici da 1, senza buchi, tenendo il loro ordine; i tag scritti da te non cambiano.</p>
        <button className="wide-btn" onClick={() => { let n = 0; edit((x) => { n = renumberTags(x) }); setRenumbered(n) }}>Rinumera i tag da 1</button>
        {renumbered !== null && <p className="muted small">{renumbered ? `${renumbered} ${renumbered === 1 ? 'tag cambiato' : 'tag cambiati'}. Si può annullare con ⌘Z.` : 'I tag sono già in ordine da 1.'}</p>}
      </Section>
      <Section title="Scorciatoie">
        <ul className="keys">
          <li><kbd>R</kbd> ruota · <kbd>M</kbd> specchia · <kbd>Canc</kbd> elimina</li>
          <li><kbd>Maiusc</kbd> + clic per selezione multipla</li>
          <li><kbd>Spazio</kbd> + trascina per spostare la vista</li>
          <li><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + rotella per lo zoom</li>
          <li><kbd>0</kbd> inquadra tutto · <kbd>Esc</kbd> annulla</li>
          <li><kbd>⌘Z</kbd> annulla · <kbd>⇧⌘Z</kbd> ripeti</li>
          <li><kbd>⌘C</kbd> <kbd>⌘V</kbd> copia/incolla · <kbd>⌘D</kbd> duplica</li>
        </ul>
      </Section>
    </>
  )
}
