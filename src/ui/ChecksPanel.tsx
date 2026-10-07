import { useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, EyeOff, Info, RotateCcw } from 'lucide-react'
import { dismissIssue, restoreAllIssues, restoreIssue, setCheckHints, type CheckIssue, type CheckReport } from '../core'
import { useStore } from '../state/store'
import { Section } from './Fields'

const SEV = {
  error: { Icon: AlertOctagon, label: 'Errori' },
  warning: { Icon: AlertTriangle, label: 'Avvisi' },
  info: { Icon: Info, label: 'Suggerimenti' },
} as const

export function ChecksPanel({ report, hints, withHints = true }: { report: CheckReport; hints: boolean; withHints?: boolean }) {
  const setSelection = useStore((s) => s.setSelection)
  const focusOn = useStore((s) => s.focusOn)
  const edit = useStore((s) => s.edit)
  const [showIgnored, setShowIgnored] = useState(false)
  const { issues, dismissed, hiddenHints } = report
  const show = (i: CheckIssue) => { setSelection(i.targets); focusOn(i.targets) }
  return (
    <>
      {!issues.length && (
        <Section title="Controlli">
          <p className="allgood"><CheckCircle2 size={18} /> Nessun problema rilevato.</p>
          <p className="muted small">{withHints ? 'Si controllano collegamenti mancanti, porte lasciate libere, fluidi collegati tra loro, pressioni oltre il limite e dati mancanti.' : 'Si controlla che ogni valvola abbia uno stato in ogni fase e che ossidante e combustibile non si incontrino.'}</p>
        </Section>
      )}
      {(['error', 'warning', 'info'] as const).map((sev) => {
        const list = issues.filter((i) => i.severity === sev)
        if (!list.length) return null
        const { Icon, label } = SEV[sev]
        return (
          <Section key={sev} title={`${label} (${list.length})`}>
            <ul className="issues">
              {list.map((i) => (
                <li key={i.id} className="issue-row">
                  <button className={'issue ' + sev} onClick={() => show(i)}><Icon size={16} /><span>{i.message}</span></button>
                  <button className="icon-btn" aria-label="Ignora questo avviso" title="Ignora: non lo mostrare più per questo punto" onClick={() => edit((d) => dismissIssue(d, i.id))}><EyeOff size={14} /></button>
                </li>
              ))}
            </ul>
          </Section>
        )
      })}
      {withHints && <Section title="Suggerimenti facoltativi">
        <label className="check-row">
          <input type="checkbox" checked={hints} onChange={(e) => edit((d) => setCheckHints(d, e.target.checked))} />
          <span>Mostra anche volumi chiudibili senza sfiato, diametri diversi e linee senza diametro</span>
        </label>
        {!hints && hiddenHints > 0 && <p className="muted small">{hiddenHints} {hiddenHints === 1 ? 'suggerimento nascosto' : 'suggerimenti nascosti'}.</p>}
      </Section>}
      {dismissed.length > 0 && (
        <Section title={`Ignorati (${dismissed.length})`}>
          <button className="link" onClick={() => setShowIgnored(!showIgnored)}>{showIgnored ? 'Nascondi l\'elenco' : 'Mostra l\'elenco'}</button>
          {showIgnored && (
            <ul className="issues">
              {dismissed.map((i) => (
                <li key={i.id} className="issue-row">
                  <button className="issue info" onClick={() => show(i)}><Info size={16} /><span>{i.message}</span></button>
                  <button className="icon-btn" aria-label="Rimetti questo avviso" title="Torna a mostrarlo" onClick={() => edit((d) => restoreIssue(d, i.id))}><RotateCcw size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {showIgnored && <button className="link" onClick={() => edit((d) => restoreAllIssues(d))}>Rimetti tutti</button>}
        </Section>
      )}
      <p className="hint plain">I controlli sono un aiuto: non sostituiscono la verifica ingegneristica dell'impianto.</p>
    </>
  )
}
