import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { checkReport, getSymbol, newId, phaseValves, setPhaseForAll, setValveState, cycleValveState, type ValveState } from '../core'
import { useActiveTab, useShownPhase, useStore } from '../state/store'
import { Field, Section, TextField } from './Fields'
import { ChecksPanel } from './ChecksPanel'
import { Canvas } from './Canvas'

const DEFAULT_PHASES = [
  { it: 'Stoccaggio (safe)', en: 'Storage (safe)' },
  { it: 'Riempimento', en: 'Filling' },
  { it: 'Pressurizzazione', en: 'Pressurization' },
  { it: 'Accensione', en: 'Ignition' },
  { it: 'Combustione', en: 'Burn' },
  { it: 'Sfiato / spegnimento', en: 'Vent / shutdown' },
]

const STATE_LABEL: Record<string, string> = { open: 'Aperta', closed: 'Chiusa', '': 'Non specificato' }

/** Passo «Funzionamento»: lo schema (solo da guardare) con la striscia delle fasi sopra. Il pannello a destra è <OperationPanel/>. */
export function OperationStage() {
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const setActivePhase = useStore((s) => s.setActivePhase)
  const active = useShownPhase()
  const phases = tab.doc.phases
  const hasValves = phaseValves(tab.doc.drawing).length > 0

  const addPhase = () => edit((d) => {
    const n = d.phases.length + 1
    const p = { id: newId('p'), name: { it: `Fase ${n}`, en: `Phase ${n}` } }
    d.phases.push(p)
    setActivePhase(p.id)
  })

  return (
    <>
      <div className="phase-strip" role="tablist" aria-label="Fasi di funzionamento">
        {phases.map((p, i) => (
          <button key={p.id} role="tab" aria-selected={active === p.id} className={'phase-chip' + (active === p.id ? ' on' : '')} onClick={() => setActivePhase(p.id)} title={p.name.en}>
            <i>{i + 1}</i><span>{p.name.it || `Fase ${i + 1}`}</span>
          </button>
        ))}
        <button className="phase-chip add" onClick={addPhase}><Plus size={14} />Fase</button>
      </div>
      {!phases.length ? (
        <div className="phase-empty">
          <h2>Come funziona l'impianto?</h2>
          <p>Definisci le fasi (riempimento, pressurizzazione, accensione…) e indica per ogni valvola se è aperta o chiusa. Lo schema mostra lo stato di ogni fase e potrai esportare tutto in PDF.</p>
          <div className="btn-row">
            <button className="primary" onClick={() => edit((d) => { d.phases = DEFAULT_PHASES.map((n) => ({ id: newId('p'), name: n })) })}>Usa le fasi tipiche di un razzo ibrido</button>
            <button onClick={addPhase}>Crea la prima fase</button>
          </div>
          {!hasValves && <p className="muted small">Nello schema non ci sono ancora valvole: tornando al passo «Disegno» puoi aggiungerle.</p>}
        </div>
      ) : (
        <Canvas />
      )}
    </>
  )
}

/** Pannello del passo «Funzionamento»: fase attiva, stato di ogni valvola, tabella di tutte le fasi, controlli sulle fasi. */
export function OperationPanel() {
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const active = useShownPhase()
  const setActivePhase = useStore((s) => s.setActivePhase)
  const setSelection = useStore((s) => s.setSelection)
  const focusOn = useStore((s) => s.focusOn)
  const [matrix, setMatrix] = useState(false)
  const doc = tab.doc
  const phases = doc.phases
  const phase = phases.find((p) => p.id === active)
  const idx = phases.findIndex((p) => p.id === active)
  const valves = useMemo(() => phaseValves(doc.drawing), [doc.drawing])
  const report = useMemo(() => checkReport(doc, { scope: 'operation' }), [doc])
  const ids = valves.map((v) => v.id)

  return (
    <aside className="inspector">
      {phase && (
        <Section title={`Fase ${idx + 1} di ${phases.length}`} action={
          <>
            <button className="icon-btn" aria-label="Sposta la fase prima" title="Sposta prima" disabled={idx <= 0} onClick={() => edit((d) => { const [p] = d.phases.splice(idx, 1); d.phases.splice(idx - 1, 0, p) })}><ArrowLeft size={14} /></button>
            <button className="icon-btn" aria-label="Sposta la fase dopo" title="Sposta dopo" disabled={idx >= phases.length - 1} onClick={() => edit((d) => { const [p] = d.phases.splice(idx, 1); d.phases.splice(idx + 1, 0, p) })}><ArrowRight size={14} /></button>
            <button className="icon-btn" aria-label="Elimina fase" title="Elimina la fase" onClick={() => {
              edit((d) => { d.phases.splice(idx, 1); for (const c of d.drawing.components) if (c.states) { delete c.states[phase.id]; if (!Object.keys(c.states).length) c.states = undefined } })
              setActivePhase(phases[idx + 1]?.id ?? phases[idx - 1]?.id ?? null)
            }}><Trash2 size={14} /></button>
          </>
        }>
          <Field label="Nome (IT)"><TextField value={phase.name.it} ariaLabel="Nome della fase in italiano" onCommit={(v) => edit((d) => { d.phases[idx].name.it = v })} /></Field>
          <Field label="Name (EN)"><TextField value={phase.name.en} ariaLabel="Phase name in English" onCommit={(v) => edit((d) => { d.phases[idx].name.en = v })} /></Field>
        </Section>
      )}

      {phase && (
        <Section title="Stato delle valvole">
          {!valves.length ? <p className="muted small">Nello schema non ci sono valvole a cui dare uno stato. Aggiungile dal passo «Disegno».</p> : (
            <>
              <div className="btn-row tight">
                <button onClick={() => edit((d) => setPhaseForAll(d, ids, phase.id, 'closed'))}>Tutte chiuse</button>
                <button onClick={() => edit((d) => setPhaseForAll(d, ids, phase.id, 'open'))}>Tutte aperte</button>
                <button onClick={() => edit((d) => setPhaseForAll(d, ids, phase.id, undefined))}>Azzera</button>
              </div>
              <ul className="valve-list">
                {valves.map((v) => {
                  const st: ValveState | undefined = v.states?.[phase.id]
                  const set = (s: ValveState | undefined) => edit((d) => setValveState(d, v.id, phase.id, s))
                  return (
                    <li key={v.id} className={'valve-row ' + (st ?? 'unset')}>
                      <button className="link tag" onClick={() => { setSelection([v.id]); focusOn([v.id]) }} title={getSymbol(v.symbol).name.it}>{v.tag}</button>
                      <small className="grow">{getSymbol(v.symbol).name.it}</small>
                      <div className="seg3" role="group" aria-label={`Stato di ${v.tag}: ${STATE_LABEL[st ?? '']}`}>
                        <button className={st === 'open' ? 'on open' : ''} aria-pressed={st === 'open'} onClick={() => set(st === 'open' ? undefined : 'open')}>Aperta</button>
                        <button className={st === 'closed' ? 'on closed' : ''} aria-pressed={st === 'closed'} onClick={() => set(st === 'closed' ? undefined : 'closed')}>Chiusa</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="muted small">Puoi anche cliccare una valvola nello schema: alterna chiusa, aperta, non specificata.</p>
            </>
          )}
        </Section>
      )}

      {phases.length > 0 && valves.length > 0 && (
        <Section title="Tutte le fasi" action={<button className="link" onClick={() => setMatrix(!matrix)}>{matrix ? 'Nascondi' : 'Mostra'}</button>}>
          {matrix && (
            <div className="matrix-wrap">
              <table className="matrix">
                <thead><tr><th>Tag</th>{phases.map((p, i) => <th key={p.id} title={p.name.it} className={active === p.id ? 'on' : ''}>{i + 1}</th>)}</tr></thead>
                <tbody>
                  {valves.map((c) => (
                    <tr key={c.id}>
                      <th><button className="link" onClick={() => { setSelection([c.id]); focusOn([c.id]) }}>{c.tag}</button></th>
                      {phases.map((p) => {
                        const st = c.states?.[p.id]
                        return (
                          <td key={p.id} className={active === p.id ? 'on' : ''}>
                            <button className={'cell ' + (st ?? 'unset')} aria-label={`${c.tag} ${p.name.it}: ${STATE_LABEL[st ?? ''].toLowerCase()}`} onClick={() => edit((d) => cycleValveState(d, c.id, p.id))}>
                              {st === 'closed' ? '●' : st === 'open' ? '○' : '–'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">● chiusa · ○ aperta · – non specificato. Le colonne sono le fasi, nell'ordine della striscia.</p>
            </div>
          )}
        </Section>
      )}

      {phases.length > 0 && <ChecksPanel report={report} hints={false} withHints={false} />}
    </aside>
  )
}
