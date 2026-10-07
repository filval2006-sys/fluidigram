import { ChevronRight, Download, PencilRuler, SlidersHorizontal, Table2, Workflow } from 'lucide-react'
import { useStore } from '../state/store'
import { flushFocusedField } from './flush'

/**
 * Barra dei passi del lavoro, come le schede di un programma di montaggio:
 * 1 Disegno (schema e distinta) → 2 Funzionamento (fasi e stato delle valvole). Ogni passo ha il suo «Esporta».
 */
export function StepBar({ onExport }: { onExport: () => void }) {
  const step = useStore((s) => s.step)
  const setStep = useStore((s) => s.setStep)
  const stageView = useStore((s) => s.stageView)
  const setStageView = useStore((s) => s.setStageView)
  const phases = useStore((s) => (s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0]).doc.phases.length)
  const go = (next: 'design' | 'operation') => { flushFocusedField(); useStore.getState().setPlacing(null); setStep(next) }

  return (
    <nav className="stepbar" aria-label="Passi del lavoro">
      <div className="steps" role="tablist">
        <button role="tab" aria-selected={step === 'design'} className={'step' + (step === 'design' ? ' on' : '')} onClick={() => go('design')} title="Disegno (⌘1)">
          <i>1</i><PencilRuler size={15} />Disegno
        </button>
        <ChevronRight size={16} className="step-sep" aria-hidden />
        <button role="tab" aria-selected={step === 'operation'} className={'step' + (step === 'operation' ? ' on' : '')} onClick={() => go('operation')} title="Funzionamento (⌘3)">
          <i>2</i><SlidersHorizontal size={15} />Funzionamento{phases > 0 && <b className="step-count">{phases} {phases === 1 ? 'fase' : 'fasi'}</b>}
        </button>
      </div>
      <div className="stepbar-tools">
        {step === 'design' && (
          <div className="seg" role="tablist" aria-label="Vista del disegno">
            <button role="tab" aria-selected={stageView === 'schema'} className={stageView === 'schema' ? 'on' : ''} onClick={() => { flushFocusedField(); setStageView('schema') }} title="Schema (⌘1)"><Workflow size={14} />Schema</button>
            <button role="tab" aria-selected={stageView === 'bom'} className={stageView === 'bom' ? 'on' : ''} onClick={() => { flushFocusedField(); setStageView('bom') }} title="Distinta componenti (⌘2)"><Table2 size={14} />Distinta</button>
          </div>
        )}
        <button className="primary" onClick={onExport} title={step === 'design' ? 'Esporta il disegno (⇧⌘E)' : 'Esporta le fasi in PDF (⇧⌘E)'}><Download size={15} />{step === 'design' ? 'Esporta disegno…' : 'Esporta fasi…'}</button>
      </div>
    </nav>
  )
}
