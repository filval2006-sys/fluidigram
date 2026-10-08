import { useEffect } from 'react'
import { Monitor, Moon, Sun, X, type LucideIcon } from 'lucide-react'
import { N_, t, type LanguagePref } from '../i18n'
import { isNativeApp } from '../platform/openFiles'
import { openExternal } from '../platform/updates'
import { APP_VERSION } from '../appInfo'
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
  const update = useStore((s) => s.update)
  const updateAuto = useStore((s) => s.updateAuto)
  const setUpdateAuto = useStore((s) => s.setUpdateAuto)
  const checkForUpdates = useStore((s) => s.checkForUpdates)
  const markUpdateSeen = useStore((s) => s.markUpdateSeen)
  const install = useStore((s) => s.install)
  const installNow = useStore((s) => s.installNow)
  const busy = install.phase === 'downloading' || install.phase === 'installing'
  const enabled = useStore((s) => s.modules)
  const setModule = useStore((s) => s.setModule)

  // opening the settings counts as having seen the notification dot
  useEffect(() => { markUpdateSeen() }, [markUpdateSeen, update.latest?.version])

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
          <h4>{t('Updates')}</h4>
          <p className="muted small">{t('Version {version}', { version: APP_VERSION })}</p>
          <div className="btn-row">
            <button onClick={() => void checkForUpdates()} disabled={update.phase === 'checking'}>{update.phase === 'checking' ? t('Checking…') : t('Check for updates')}</button>
            {update.phase === 'available' && update.latest && (
              <>
                {isNativeApp() && install.phase !== 'error' && (
                  <button className="primary" disabled={busy} onClick={() => void installNow()}>{busy ? t('Updating…') : t('Update now')}</button>
                )}
                {(!isNativeApp() || install.phase === 'error') && (
                  <button className="primary" onClick={() => void openExternal(update.latest!.downloadUrl ?? update.latest!.url)}>{t('Download {version}', { version: update.latest.version })}</button>
                )}
                <button onClick={() => void openExternal(update.latest!.url)} disabled={busy}>{t('What’s new')}</button>
              </>
            )}
          </div>
          {update.phase === 'available' && update.latest && <p className="update-note">{t('Version {version} is available.', { version: update.latest.version })} {isNativeApp() ? t('Your projects are not touched; the app restarts when the update is installed.') : t('Download it and install it over the current one: your projects are not touched.')}</p>}
          {install.phase === 'downloading' && <p className="muted small">{install.percent === null ? t('Downloading…') : t('Downloading… {percent}%', { percent: install.percent })}</p>}
          {install.phase === 'installing' && <p className="muted small">{t('Installing… the app will restart.')}</p>}
          {install.phase === 'error' && <p className="error">{t('The update could not be installed automatically ({error}). Download the installer instead and install it over the current version.', { error: install.error ?? '' })}</p>}
          {update.phase === 'current' && <p className="muted small">{t('You have the latest version.')}</p>}
          {update.phase === 'error' && <p className="error">{t('Could not check for updates: {error}', { error: update.error ?? '' })}</p>}
          <label className="check-row">
            <input type="checkbox" checked={updateAuto} onChange={(e) => setUpdateAuto(e.target.checked)} />
            <span>{t('Check automatically once a day')}</span>
          </label>
          <p className="muted small">{t('Checking contacts github.com and sends only a standard web request (your IP address and the app name). Nothing else leaves your computer. Turn the automatic check off if you prefer.')}</p>
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
