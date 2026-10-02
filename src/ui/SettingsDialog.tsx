import { useEffect } from 'react'
import { Monitor, Moon, Sun, X, type LucideIcon } from 'lucide-react'
import { useStore, type Theme } from '../state/store'

/** Descrizione di un modulo opzionale (la lista la fornisce l'App: questa finestra non conosce i moduli). */
export interface ModuleInfo { id: string; name: string; description: string }

const THEMES: { id: Theme; label: string; Icon: LucideIcon }[] = [
  { id: 'system', label: 'Automatico', Icon: Monitor },
  { id: 'light', label: 'Chiaro', Icon: Sun },
  { id: 'dark', label: 'Scuro', Icon: Moon },
]

export function SettingsDialog({ modules, onClose }: { modules: ModuleInfo[]; onClose: () => void }) {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const enabled = useStore((s) => s.modules)
  const setModule = useStore((s) => s.setModule)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal settings" role="dialog" aria-modal aria-label="Impostazioni" onMouseDown={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <h3>Impostazioni</h3>
          <button className="icon-btn" aria-label="Chiudi" onClick={onClose}><X size={18} /></button>
        </header>

        <section>
          <h4>Aspetto</h4>
          <div className="seg wide" role="group" aria-label="Tema">
            {THEMES.map(({ id, label, Icon }) => (
              <button key={id} className={theme === id ? 'on' : ''} onClick={() => setTheme(id)}><Icon size={14} />{label}</button>
            ))}
          </div>
        </section>

        <section>
          <h4>Moduli opzionali</h4>
          <p className="muted small">Fluidigram è un'app per disegnare schemi fluidici. I moduli qui sotto sono extra indipendenti: restano spenti finché non li accendi e non cambiano né lo schema né i file.</p>
          {modules.map((m) => (
            <label key={m.id} className="module-row">
              <input type="checkbox" checked={!!enabled[m.id]} onChange={(e) => setModule(m.id, e.target.checked)} />
              <span><b>{m.name}</b><small>{m.description}</small></span>
            </label>
          ))}
        </section>
      </div>
    </div>
  )
}
