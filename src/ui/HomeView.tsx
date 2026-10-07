import { FilePlus2, FileText, FolderOpen, History, Sparkles, Trash2, X } from 'lucide-react'
import { SAMPLE_DOCUMENT, readDocument } from '../core'
import { APP_NAME } from '../appInfo'
import { isNativeApp } from '../platform/openFiles'
import { isPristineTab } from '../state/session'
import { isDirty, tabName, useStore } from '../state/store'

const dateLabel = (ms: number): string => {
  const d = new Date(ms)
  const today = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(today) - day(d)) / 86_400_000)
  if (diff === 0) return 'oggi'
  if (diff === 1) return 'ieri'
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** Cartella del file in forma breve: le ultime due cartelle del percorso. */
const folderOf = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.slice(-3, -1).join(' › ') || parts[0] || ''
}

/**
 * Pagina iniziale: nuovo diagramma, apri, esempio, file recenti, schede ancora aperte e lavoro non salvato dell'ultima volta.
 * Le schede dell'ultima sessione non si riaprono da sole: chi vuole riprendere un file lo trova nei recenti.
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
          <p className="muted">Schemi fluidici (P&amp;ID) per il razzomodellismo</p>
        </div>
      </header>

      <div className="home-grid">
        <section className="home-start" aria-label="Inizia">
          <h2>Inizia</h2>
          <button className="home-card primary" onClick={() => st.newProject()}>
            <FilePlus2 size={22} /><span><b>Nuovo diagramma</b><small>Parti da un foglio bianco</small></span>
          </button>
          <button className="home-card" onClick={onOpen}>
            <FolderOpen size={22} /><span><b>Apri un file…</b><small>Un progetto .fluidigram</small></span>
          </button>
          <button className="home-card" onClick={() => st.openDocument(readDocument(JSON.parse(JSON.stringify(SAMPLE_DOCUMENT))))}>
            <Sparkles size={22} /><span><b>Prova con un esempio</b><small>Pressurizzazione di un serbatoio</small></span>
          </button>
        </section>

        <div className="home-lists">
          {st.recoverable.length > 0 && (
            <section className="home-block warn" aria-label="Lavoro non salvato">
              <header>
                <h2><History size={15} />Lavoro non salvato</h2>
                <button className="link" onClick={() => st.discardRecoverable()}>Scarta tutto</button>
              </header>
              <p className="muted small">L'ultima volta l'app si è chiusa con questi progetti non salvati.</p>
              <ul>
                {st.recoverable.map((r) => (
                  <li key={r.id}>
                    <FileText size={16} />
                    <span className="grow"><b>{r.doc.meta.title.it || r.doc.meta.title.en || 'Senza nome'}</b><small>{r.doc.drawing.components.length} componenti{r.filePath ? ` · ${folderOf(r.filePath)}` : ''}</small></span>
                    <button className="mini primary" onClick={() => st.recover(r.id)}>Recupera</button>
                    <button className="icon-btn" aria-label="Scarta" title="Scarta" onClick={() => st.discardRecoverable(r.id)}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {open.length > 0 && (
            <section className="home-block" aria-label="Schede aperte">
              <header><h2>Aperti ora</h2></header>
              <ul>
                {open.map((t) => (
                  <li key={t.id}>
                    <FileText size={16} />
                    <button className="row-link grow" onClick={() => { st.setActive(t.id); st.setHome(false) }}>
                      <b>{tabName(t)}</b>{isDirty(t) && <i className="dirty" aria-label="Modifiche non salvate" />}
                      <small>{t.filePath ? folderOf(t.filePath) : 'non ancora salvato'}</small>
                    </button>
                    <button className="icon-btn" aria-label={`Chiudi ${tabName(t)}`} title="Chiudi la scheda" onClick={() => st.closeTab(t.id)}><X size={14} /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="home-block" aria-label="File recenti">
            <header>
              <h2>Recenti</h2>
              {st.recents.length > 0 && <button className="link" onClick={() => st.clearRecents()}>Svuota l'elenco</button>}
            </header>
            {st.recents.length === 0 ? (
              <p className="muted small">{native ? 'I file che apri o salvi compariranno qui.' : 'Nel browser non c\'è un elenco dei file recenti: usa «Apri un file…».'}</p>
            ) : (
              <ul>
                {st.recents.map((r) => (
                  <li key={r.path}>
                    <FileText size={16} />
                    <button className="row-link grow" onClick={() => onOpenRecent(r.path)} title={r.path}>
                      <b>{r.name}</b><small>{folderOf(r.path)} · {dateLabel(r.openedAt)}</small>
                    </button>
                    <button className="icon-btn" aria-label={`Togli ${r.name} dall'elenco`} title="Togli dall'elenco" onClick={() => st.removeRecent(r.path)}><Trash2 size={13} /></button>
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
