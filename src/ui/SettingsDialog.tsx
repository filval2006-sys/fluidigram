import { useEffect } from 'react'
import { Monitor, Moon, Sun, X, type LucideIcon } from 'lucide-react'
import { N_, t, type LanguagePref } from '../i18n'
import { useStore, type Theme } from '../state/store'

/** Description of an optional module (the list is provided by the App: this dialog does not know the modules). */
export interface ModuleInfo { id: string; name: string; description: string }

const THEMES: { id: Theme; label: string; Icon: LucideIcon }[] = [
  { id: 'system', label: N_('Automatic'), Icon: Monitor },
  { id: 'light', label: N_('Light'), Icon: Sun },
  { id: 'dark', label: N_('Dark'), Icon: Moon },
]

/** Language names are shown in their own language, so they stay readable whatever the current one is. */
const LANGUAGES: { id: LanguagePref; label: string }[] = [
  { id: 'auto', label: N_('Automatic') },
  { id: 'it', label: 'Italiano' },
  { id: 'en', label: 'English' },
]

export function SettingsDialog({ modules, onClose }: { modules: ModuleInfo[]; onClose: () => void }) {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const language = useStore((s) => s.language)
  const setLanguage = useStore((s) => s.setLanguage)
  const enabled = useStore((s) => s.modules)
  const setModule = useStore((s) => s.setModule)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal settings" role="dialog" aria-modal aria-label={t('Settings')} onMouseDown={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <h3>{t('Settings')}</h3>
          <button className="icon-btn" aria-label={t('Close')} onClick={onClose}><X size={18} /></button>
        </header>

        <section>
          <h4>{t('Appearance')}</h4>
          <div className="seg wide" role="group" aria-label={t('Theme')}>
            {THEMES.map(({ id, label, Icon }) => (
              <button key={id} className={theme === id ? 'on' : ''} onClick={() => setTheme(id)}><Icon size={14} />{t(label)}</button>
            ))}
          </div>
        </section>

        <section>
          <h4>{t('Language')}</h4>
          <div className="seg wide" role="group" aria-label={t('Interface language')}>
            {LANGUAGES.map(({ id, label }) => (
              <button key={id} className={language === id ? 'on' : ''} onClick={() => setLanguage(id)}>{id === 'auto' ? t(label) : label}</button>
            ))}
          </div>
        </section>

        <section>
          <h4>{t('Optional modules')}</h4>
          <p className="muted small">{t('Fluidigram is an app for drawing fluid diagrams. The modules below are independent extras: they stay off until you turn them on and change neither the diagram nor the files.')}</p>
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
