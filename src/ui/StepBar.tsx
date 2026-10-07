import { ChevronRight, Download, PencilRuler, SlidersHorizontal, Table2, Workflow } from 'lucide-react'
import { t, tp } from '../i18n'
import { useStore } from '../state/store'
import { flushFocusedField } from './flush'

/**
 * Work steps bar, like the workspace tabs of a video editor:
 * 1 Design (diagram and bill of materials) → 2 Operation (phases and valve states). Each step has its own Export.
 */
export function StepBar({ onExport }: { onExport: () => void }) {
  const step = useStore((s) => s.step)
  const setStep = useStore((s) => s.setStep)
  const stageView = useStore((s) => s.stageView)
  const setStageView = useStore((s) => s.setStageView)
  const phases = useStore((s) => (s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0]).doc.phases.length)
  const go = (next: 'design' | 'operation') => { flushFocusedField(); useStore.getState().setPlacing(null); setStep(next) }

  return (
    <nav className="stepbar" aria-label={t('Work steps')}>
      <div className="steps" role="tablist">
        <button role="tab" aria-selected={step === 'design'} className={'step' + (step === 'design' ? ' on' : '')} onClick={() => go('design')} title={t('Design (⌘1)')}>
          <i>1</i><PencilRuler size={15} />{t('Design')}
        </button>
        <ChevronRight size={16} className="step-sep" aria-hidden />
        <button role="tab" aria-selected={step === 'operation'} className={'step' + (step === 'operation' ? ' on' : '')} onClick={() => go('operation')} title={t('Operation (⌘3)')}>
          <i>2</i><SlidersHorizontal size={15} />{t('Operation')}{phases > 0 && <b className="step-count">{tp(phases, '{n} phase', '{n} phases')}</b>}
        </button>
      </div>
      <div className="stepbar-tools">
        {step === 'design' && (
          <div className="seg" role="tablist" aria-label={t('Design view')}>
            <button role="tab" aria-selected={stageView === 'schema'} className={stageView === 'schema' ? 'on' : ''} onClick={() => { flushFocusedField(); setStageView('schema') }} title={t('Diagram (⌘1)')}><Workflow size={14} />{t('Diagram')}</button>
            <button role="tab" aria-selected={stageView === 'bom'} className={stageView === 'bom' ? 'on' : ''} onClick={() => { flushFocusedField(); setStageView('bom') }} title={t('Bill of materials (⌘2)')}><Table2 size={14} />{t('BOM')}</button>
          </div>
        )}
        <button className="primary" onClick={onExport} title={step === 'design' ? t('Export the drawing (⇧⌘E)') : t('Export the phases as PDF (⇧⌘E)')}><Download size={15} />{step === 'design' ? t('Export drawing…') : t('Export phases…')}</button>
      </div>
    </nav>
  )
}
