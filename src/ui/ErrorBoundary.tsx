import { Component, type ErrorInfo, type ReactNode } from 'react'
import { saveFiles, type OutFile } from '../platform/files'
import { STORAGE_KEY } from '../state/store'

interface State { error: Error | null; note: string }

/** Ultima rete di sicurezza: un errore imprevisto non lascia la finestra bianca e permette di salvare il lavoro. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, note: '' }

  static getDerivedStateFromError(error: Error): Partial<State> { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack) }

  /** I progetti aperti, ognuno in un proprio file .fluidigram (o il contenuto grezzo se illeggibile). */
  private backupFiles(): OutFile[] {
    let raw: string | null = null
    try { raw = localStorage.getItem(STORAGE_KEY) } catch { /* storage non disponibile */ }
    if (!raw) return []
    try {
      const data = JSON.parse(raw) as { tabs?: { doc?: { meta?: { title?: { it?: string } } } }[] }
      const files = (data.tabs ?? []).filter((t) => t.doc).map((t, i) => {
        const title = (t.doc?.meta?.title?.it ?? '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'progetto'
        return { name: `${title}_${i + 1}.fluidigram`, data: JSON.stringify(t.doc, null, 2), mime: 'application/octet-stream' }
      })
      if (files.length) return files
    } catch { /* si salva il testo grezzo */ }
    return [{ name: 'area-di-lavoro.json', data: raw, mime: 'application/octet-stream' }]
  }

  private backup = async () => {
    try {
      const files = this.backupFiles()
      if (!files.length) return this.setState({ note: 'Non ci sono progetti da salvare.' })
      const where = await saveFiles(files, files[0].name.endsWith('.json') ? 'json' : 'fluidigram', 'Progetto Fluidigram')
      this.setState({ note: where ? 'Copia di sicurezza salvata.' : '' })
    } catch (e) { this.setState({ note: `Salvataggio non riuscito: ${String(e)}` }) }
  }

  private reset = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* storage non disponibile */ }
    location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="modal-bg" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="modal" role="alertdialog" aria-modal style={{ width: 480 }}>
          <h3>Si è verificato un errore imprevisto</h3>
          <p>I tuoi progetti sono ancora salvati sul computer. Puoi riprovare, oppure fare prima una copia di sicurezza e poi ripartire da un'area di lavoro vuota.</p>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, wordBreak: 'break-word' }}>{this.state.error.message}</p>
          {this.state.note && <p>{this.state.note}</p>}
          <div className="btn-row end">
            <button onClick={this.backup}>Salva copia dei progetti</button>
            <button className="danger" onClick={this.reset}>Azzera area di lavoro</button>
            <button className="primary" onClick={() => location.reload()}>Riprova</button>
          </div>
        </div>
      </div>
    )
  }
}
