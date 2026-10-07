import { useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, EyeOff, Info, RotateCcw } from 'lucide-react'
import { dismissIssue, restoreAllIssues, restoreIssue, setCheckHints, type CheckIssue, type CheckReport } from '../core'
import { N_, t, tp, uiLanguage } from '../i18n'
import { useStore } from '../state/store'
import { Section } from './Fields'

const SEV = {
  error: { Icon: AlertOctagon, label: N_('Errors') },
  warning: { Icon: AlertTriangle, label: N_('Warnings') },
  info: { Icon: Info, label: N_('Suggestions') },
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
        <Section title={t('Checks')}>
          <p className="allgood"><CheckCircle2 size={18} /> {t('No problems found.')}</p>
          <p className="muted small">{withHints ? t('Missing connections, free ports, fluids connected together, pressures over the limit and missing data are checked.') : t('It is checked that every valve has a state in every phase and that oxidizer and fuel do not meet.')}</p>
        </Section>
      )}
      {(['error', 'warning', 'info'] as const).map((sev) => {
        const list = issues.filter((i) => i.severity === sev)
        if (!list.length) return null
        const { Icon, label } = SEV[sev]
        return (
          <Section key={sev} title={`${t(label)} (${list.length})`}>
            <ul className="issues">
              {list.map((i) => (
                <li key={i.id} className="issue-row">
                  <button className={'issue ' + sev} onClick={() => show(i)}><Icon size={16} /><span>{i.message[uiLanguage()]}</span></button>
                  <button className="icon-btn" aria-label={t('Ignore this warning')} title={t('Ignore: do not show it again for this item')} onClick={() => edit((d) => dismissIssue(d, i.id))}><EyeOff size={14} /></button>
                </li>
              ))}
            </ul>
          </Section>
        )
      })}
      {withHints && <Section title={t('Optional suggestions')}>
        <label className="check-row">
          <input type="checkbox" checked={hints} onChange={(e) => edit((d) => setCheckHints(d, e.target.checked))} />
          <span>{t('Also show closable volumes without a vent, different sizes and lines without a size')}</span>
        </label>
        {!hints && hiddenHints > 0 && <p className="muted small">{tp(hiddenHints, '{n} suggestion hidden.', '{n} suggestions hidden.')}</p>}
      </Section>}
      {dismissed.length > 0 && (
        <Section title={t('Ignored ({n})', { n: dismissed.length })}>
          <button className="link" onClick={() => setShowIgnored(!showIgnored)}>{showIgnored ? t('Hide the list') : t('Show the list')}</button>
          {showIgnored && (
            <ul className="issues">
              {dismissed.map((i) => (
                <li key={i.id} className="issue-row">
                  <button className="issue info" onClick={() => show(i)}><Info size={16} /><span>{i.message[uiLanguage()]}</span></button>
                  <button className="icon-btn" aria-label={t('Restore this warning')} title={t('Show it again')} onClick={() => edit((d) => restoreIssue(d, i.id))}><RotateCcw size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {showIgnored && <button className="link" onClick={() => edit((d) => restoreAllIssues(d))}>{t('Restore all')}</button>}
        </Section>
      )}
      <p className="hint plain">{t('Checks are an aid: they do not replace an engineering review of the system.')}</p>
    </>
  )
}
