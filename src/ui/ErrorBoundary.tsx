import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n'
import { saveFiles, type OutFile } from '../platform/files'
import { STORAGE_KEY } from '../state/store'

interface State { error: Error | null; note: string }

/** Last safety net: an unexpected error does not leave a blank window and lets the user save their work. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, note: '' }

  static getDerivedStateFromError(error: Error): Partial<State> { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack) }

  /** The open projects, each in its own .fluidigram file (or the raw content if unreadable). */
  private backupFiles(): OutFile[] {
    let raw: string | null = null
    try { raw = localStorage.getItem(STORAGE_KEY) } catch { /* storage unavailable */ }
    if (!raw) return []
    try {
      const data = JSON.parse(raw) as { tabs?: { doc?: { meta?: { title?: { it?: string } } } }[] }
      const files = (data.tabs ?? []).filter((tab) => tab.doc).map((tab, i) => {
        const title = (tab.doc?.meta?.title?.it ?? '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || t('project')
        return { name: `${title}_${i + 1}.fluidigram`, data: JSON.stringify(tab.doc, null, 2), mime: 'application/octet-stream' }
      })
      if (files.length) return files
    } catch { /* the raw text is saved instead */ }
    return [{ name: 'workspace.json', data: raw, mime: 'application/octet-stream' }]
  }

  private backup = async () => {
    try {
      const files = this.backupFiles()
      if (!files.length) return this.setState({ note: t('There are no projects to save.') })
      const where = await saveFiles(files, files[0].name.endsWith('.json') ? 'json' : 'fluidigram', t('Fluidigram project'))
      this.setState({ note: where ? t('Backup saved.') : '' })
    } catch (e) { this.setState({ note: t('Saving failed: {error}', { error: String(e) }) }) }
  }

  private reset = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* storage unavailable */ }
    location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="modal-bg" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="modal" role="alertdialog" aria-modal style={{ width: 480 }}>
          <h3>{t('An unexpected error occurred')}</h3>
          <p>{t('Your projects are still saved on this computer. You can try again, or make a backup first and then start from an empty workspace.')}</p>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, wordBreak: 'break-word' }}>{this.state.error.message}</p>
          {this.state.note && <p>{this.state.note}</p>}
          <div className="btn-row end">
            <button onClick={this.backup}>{t('Save a backup of the projects')}</button>
            <button className="danger" onClick={this.reset}>{t('Reset the workspace')}</button>
            <button className="primary" onClick={() => location.reload()}>{t('Try again')}</button>
          </div>
        </div>
      </div>
    )
  }
}
