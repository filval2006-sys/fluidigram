import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { N_, t, uiLanguage } from '../i18n'
import { checkReport, getSymbol, newId, phaseValves, setPhaseForAll, setValveState, cycleValveState, type ValveState } from '../core'
import { useActiveTab, useShownPhase, useStore } from '../state/store'
import { Field, Section, TextField } from './Fields'
import { ChecksPanel } from './ChecksPanel'
import { Canvas } from './Canvas'

/** Typical phases of a hybrid rocket: bilingual document data (not interface text). */
const DEFAULT_PHASES = [
  { it: 'Stoccaggio (safe)', en: 'Storage (safe)' },
  { it: 'Riempimento', en: 'Filling' },
  { it: 'Pressurizzazione', en: 'Pressurization' },
  { it: 'Accensione', en: 'Ignition' },
  { it: 'Combustione', en: 'Burn' },
  { it: 'Sfiato / spegnimento', en: 'Vent / shutdown' },
]

const STATE_LABEL: Record<string, string> = { open: N_('Open'), closed: N_('Closed'), '': N_('Unspecified') }
const nameOf = (v: { name: { it: string; en: string } }): string => v.name[uiLanguage()] || v.name.it || v.name.en

/** Operation step: the diagram (view only) with the phase strip above it. The panel on the right is <OperationPanel/>. */
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
      <div className="phase-strip" role="tablist" aria-label={t('Operating phases')}>
        {phases.map((p, i) => (
          <button key={p.id} role="tab" aria-selected={active === p.id} className={'phase-chip' + (active === p.id ? ' on' : '')} onClick={() => setActivePhase(p.id)} title={p.name[uiLanguage() === 'it' ? 'en' : 'it']}>
            <i>{i + 1}</i><span>{nameOf(p) || t('Phase {n}', { n: i + 1 })}</span>
          </button>
        ))}
        <button className="phase-chip add" onClick={addPhase}><Plus size={14} />{t('Phase')}</button>
      </div>
      {!phases.length ? (
        <div className="phase-empty">
          <h2>{t('How does the system work?')}</h2>
          <p>{t('Define the phases (filling, pressurization, ignition…) and say for each valve whether it is open or closed. The diagram shows the state of every phase and you can export everything as PDF.')}</p>
          <div className="btn-row">
            <button className="primary" onClick={() => edit((d) => { d.phases = DEFAULT_PHASES.map((n) => ({ id: newId('p'), name: n })) })}>{t('Use the typical phases of a hybrid rocket')}</button>
            <button onClick={addPhase}>{t('Create the first phase')}</button>
          </div>
          {!hasValves && <p className="muted small">{t('There are no valves in the diagram yet: go back to the Design step to add them.')}</p>}
        </div>
      ) : (
        <Canvas />
      )}
    </>
  )
}

/** Operation step panel: active phase, state of each valve, table of all phases, checks on the phases. */
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
        <Section title={t('Phase {n} of {total}', { n: idx + 1, total: phases.length })} action={
          <>
            <button className="icon-btn" aria-label={t('Move the phase earlier')} title={t('Move earlier')} disabled={idx <= 0} onClick={() => edit((d) => { const [p] = d.phases.splice(idx, 1); d.phases.splice(idx - 1, 0, p) })}><ArrowLeft size={14} /></button>
            <button className="icon-btn" aria-label={t('Move the phase later')} title={t('Move later')} disabled={idx >= phases.length - 1} onClick={() => edit((d) => { const [p] = d.phases.splice(idx, 1); d.phases.splice(idx + 1, 0, p) })}><ArrowRight size={14} /></button>
            <button className="icon-btn" aria-label={t('Delete phase')} title={t('Delete the phase')} onClick={() => {
              edit((d) => { d.phases.splice(idx, 1); for (const c of d.drawing.components) if (c.states) { delete c.states[phase.id]; if (!Object.keys(c.states).length) c.states = undefined } })
              setActivePhase(phases[idx + 1]?.id ?? phases[idx - 1]?.id ?? null)
            }}><Trash2 size={14} /></button>
          </>
        }>
          <Field label={t('Name (IT)')}><TextField value={phase.name.it} ariaLabel={t('Phase name in Italian')} onCommit={(v) => edit((d) => { d.phases[idx].name.it = v })} /></Field>
          <Field label={t('Name (EN)')}><TextField value={phase.name.en} ariaLabel={t('Phase name in English')} onCommit={(v) => edit((d) => { d.phases[idx].name.en = v })} /></Field>
        </Section>
      )}

      {phase && (
        <Section title={t('Valve states')}>
          {!valves.length ? <p className="muted small">{t('There are no valves in the diagram to give a state to. Add them in the Design step.')}</p> : (
            <>
              <div className="btn-row tight">
                <button onClick={() => edit((d) => setPhaseForAll(d, ids, phase.id, 'closed'))}>{t('All closed')}</button>
                <button onClick={() => edit((d) => setPhaseForAll(d, ids, phase.id, 'open'))}>{t('All open')}</button>
                <button onClick={() => edit((d) => setPhaseForAll(d, ids, phase.id, undefined))}>{t('Clear')}</button>
              </div>
              <ul className="valve-list">
                {valves.map((v) => {
                  const st: ValveState | undefined = v.states?.[phase.id]
                  const set = (s: ValveState | undefined) => edit((d) => setValveState(d, v.id, phase.id, s))
                  return (
                    <li key={v.id} className={'valve-row ' + (st ?? 'unset')}>
                      <button className="link tag" onClick={() => { setSelection([v.id]); focusOn([v.id]) }} title={nameOf(getSymbol(v.symbol))}>{v.tag}</button>
                      <small className="grow">{nameOf(getSymbol(v.symbol))}</small>
                      <div className="seg3" role="group" aria-label={t('State of {tag}: {state}', { tag: v.tag, state: t(STATE_LABEL[st ?? '']) })}>
                        <button className={st === 'open' ? 'on open' : ''} aria-pressed={st === 'open'} onClick={() => set(st === 'open' ? undefined : 'open')}>{t('Open')}</button>
                        <button className={st === 'closed' ? 'on closed' : ''} aria-pressed={st === 'closed'} onClick={() => set(st === 'closed' ? undefined : 'closed')}>{t('Closed')}</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="muted small">{t('You can also click a valve in the diagram: it cycles closed, open, unspecified.')}</p>
            </>
          )}
        </Section>
      )}

      {phases.length > 0 && valves.length > 0 && (
        <Section title={t('All phases')} action={<button className="link" onClick={() => setMatrix(!matrix)}>{matrix ? t('Hide') : t('Show')}</button>}>
          {matrix && (
            <div className="matrix-wrap">
              <table className="matrix">
                <thead><tr><th>{t('Tag')}</th>{phases.map((p, i) => <th key={p.id} title={nameOf(p)} className={active === p.id ? 'on' : ''}>{i + 1}</th>)}</tr></thead>
                <tbody>
                  {valves.map((c) => (
                    <tr key={c.id}>
                      <th><button className="link" onClick={() => { setSelection([c.id]); focusOn([c.id]) }}>{c.tag}</button></th>
                      {phases.map((p) => {
                        const st = c.states?.[p.id]
                        return (
                          <td key={p.id} className={active === p.id ? 'on' : ''}>
                            <button className={'cell ' + (st ?? 'unset')} aria-label={`${c.tag} ${nameOf(p)}: ${t(STATE_LABEL[st ?? '']).toLowerCase()}`} onClick={() => edit((d) => cycleValveState(d, c.id, p.id))}>
                              {st === 'closed' ? '●' : st === 'open' ? '○' : '–'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">{t('● closed · ○ open · – unspecified. The columns are the phases, in the order of the strip.')}</p>
            </div>
          )}
        </Section>
      )}

      {phases.length > 0 && <ChecksPanel report={report} hints={false} withHints={false} />}
    </aside>
  )
}
