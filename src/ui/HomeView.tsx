import { FilePlus2, FileText, FolderOpen, History, Sparkles, Trash2, X } from 'lucide-react'
import { SAMPLE_DOCUMENT, readDocument } from '../core'
import { APP_NAME } from '../appInfo'
import { t, tp, uiLanguage } from '../i18n'
import { isNativeApp } from '../platform/openFiles'
import { isPristineTab } from '../state/session'
import { isDirty, tabName, useStore } from '../state/store'

const dateLabel = (ms: number): string => {
  const d = new Date(ms)
  const today = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(today) - day(d)) / 86_400_000)
  if (diff === 0) return t('today')
  if (diff === 1) return t('yesterday')
  return d.toLocaleDateString(uiLanguage() === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** Short form of the file's folder: the last two folders of the path. */
const folderOf = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.slice(-3, -1).join(' › ') || parts[0] || ''
}

/**
 * Home page: new diagram, open, example, recent files, tabs still open and unsaved work from last time.
 * The tabs of the last session do not reopen by themselves: whoever wants to resume a file finds it in the recents.
 */
export function HomeView({ onOpen, onOpenRecent }: { onOpen: () => void; onOpenRecent: (path: string) => void }) {
  const st = useStore()
  const open = st.tabs.filter((t) => !isPristineTab(t))
  const native = isNativeApp()

  return (
    <div className="home">
      <header className="home-top">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="muted">{t('Fluid system (P&ID) diagrams for model rocketry')}</p>
        </div>
      </header>

      <div className="home-grid">
        <section className="home-start" aria-label={t('Start')}>
          <h2>{t('Start')}</h2>
          <button className="home-card primary" onClick={() => st.newProject()}>
            <FilePlus2 size={22} /><span><b>{t('New diagram')}</b><small>{t('Start from a blank sheet')}</small></span>
          </button>
          <button className="home-card" onClick={onOpen}>
            <FolderOpen size={22} /><span><b>{t('Open a file…')}</b><small>{t('A .fluidigram project')}</small></span>
          </button>
          <button className="home-card" onClick={() => st.openDocument(readDocument(JSON.parse(JSON.stringify(SAMPLE_DOCUMENT))))}>
            <Sparkles size={22} /><span><b>{t('Try an example')}</b><small>{t('Tank pressurization')}</small></span>
          </button>
        </section>

        <div className="home-lists">
          {st.recoverable.length > 0 && (
            <section className="home-block warn" aria-label={t('Unsaved work')}>
              <header>
                <h2><History size={15} />{t('Unsaved work')}</h2>
                <button className="link" onClick={() => st.discardRecoverable()}>{t('Discard all')}</button>
              </header>
              <p className="muted small">{t('Last time the app closed with these unsaved projects.')}</p>
              <ul>
                {st.recoverable.map((r) => (
                  <li key={r.id}>
                    <FileText size={16} />
                    <span className="grow"><b>{r.doc.meta.title.it || r.doc.meta.title.en || t('Untitled')}</b><small>{tp(r.doc.drawing.components.length, '{n} component', '{n} components')}{r.filePath ? ` · ${folderOf(r.filePath)}` : ''}</small></span>
                    <button className="mini primary" onClick={() => st.recover(r.id)}>{t('Recover')}</button>
                    <button className="icon-btn" aria-label={t('Discard')} title={t('Discard')} onClick={() => st.discardRecoverable(r.id)}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {open.length > 0 && (
            <section className="home-block" aria-label={t('Open tabs')}>
              <header><h2>{t('Open now')}</h2></header>
              <ul>
                {open.map((tb) => (
                  <li key={tb.id}>
                    <FileText size={16} />
                    <button className="row-link grow" onClick={() => { st.setActive(tb.id); st.setHome(false) }}>
                      <b>{tabName(tb)}</b>{isDirty(tb) && <i className="dirty" aria-label={t('Unsaved changes')} />}
                      <small>{tb.filePath ? folderOf(tb.filePath) : t('not saved yet')}</small>
                    </button>
                    <button className="icon-btn" aria-label={t('Close {name}', { name: tabName(tb) })} title={t('Close the tab')} onClick={() => st.closeTab(tb.id)}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="home-block" aria-label={t('Recent files')}>
            <header>
              <h2>{t('Recent')}</h2>
              {st.recents.length > 0 && <button className="link" onClick={() => st.clearRecents()}>{t('Clear the list')}</button>}
            </header>
            {st.recents.length === 0 ? (
              <p className="muted small">{native ? t('Files you open or save will appear here.') : t('The browser has no recent files list: use “Open a file…”.')}</p>
            ) : (
              <ul>
                {st.recents.map((r) => (
                  <li key={r.path}>
                    <FileText size={16} />
                    <button className="row-link grow" onClick={() => onOpenRecent(r.path)} title={r.path}>
                      <b>{r.name}</b><small>{folderOf(r.path)} · {dateLabel(r.openedAt)}</small>
                    </button>
                    <button className="icon-btn" aria-label={t('Remove {name} from the list', { name: r.name })} title={t('Remove from the list')} onClick={() => st.removeRecent(r.path)}><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

    </div>
  )
}
