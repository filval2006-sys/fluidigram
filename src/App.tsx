import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { parseDocument } from './core'
import { listenForSystemFiles } from './platform/openFiles'
import { isDirty, tabName, useStore } from './state/store'
import { Canvas } from './ui/Canvas'
import { Inspector } from './ui/Inspector'
import { Library } from './ui/Library'
import { MODULES } from './modules'
import { SettingsDialog } from './ui/SettingsDialog'
import { ExportDialog } from './ui/ExportDialog'
import { TabBar, Toolbar, openProject, saveActive, type ExtraTool } from './ui/TopBar'

interface Toast { id: number; msg: string; kind: 'ok' | 'err' }

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openModule, setOpenModule] = useState<string | null>(null)
  const enabledModules = useStore((s) => s.modules)
  const theme = useStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])
  const closeTab = useStore((s) => s.closeTab)

  const tools: ExtraTool[] = useMemo(
    () => MODULES.filter((m) => enabledModules[m.id]).map((m) => ({ id: m.id, label: m.toolLabel, title: m.name, Icon: m.Icon, onClick: () => setOpenModule(m.id) })),
    [enabledModules],
  )

  const notify = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 6000 : 2200)
  }, [])

  const requestClose = useCallback((id: string) => {
    const t = useStore.getState().tabs.find((x) => x.id === id)
    if (t && isDirty(t)) setConfirmClose(id)
    else closeTab(id)
  }, [closeTab])

  // file .fluidigram aperti dal sistema (doppio clic, "Apri con")
  useEffect(() => {
    let off = () => {}
    let cancelled = false
    void listenForSystemFiles((f) => {
      if ('error' in f) return notify(`Impossibile aprire il file: ${f.error}`, 'err')
      try { useStore.getState().openDocument(parseDocument(JSON.parse(f.text)), f.path) }
      catch (e) { notify(`File non valido: ${e instanceof Error ? e.message : String(e)}`, 'err') }
    }).then((fn) => { if (cancelled) fn(); else off = fn })
    return () => { cancelled = true; off() }
  }, [notify])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); saveActive(notify, e.shiftKey) }
      else if (k === 'o') { e.preventDefault(); openProject(notify) }
      else if (k === 't') { e.preventDefault(); useStore.getState().newProject() }
      else if (k === 'e' && e.shiftKey) { e.preventDefault(); setExporting(true) }
      else if (k === 'w') { e.preventDefault(); requestClose(useStore.getState().activeId) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [notify, requestClose])

  const closing = useStore((s) => s.tabs.find((t) => t.id === confirmClose))

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">Fluidigram</div>
        <TabBar onClose={requestClose} />
      </header>
      <Toolbar notify={notify} onExport={() => setExporting(true)} onSettings={() => setSettingsOpen(true)} tools={tools} />
      <div className="body">
        <Library />
        <main className="stage">
          <Canvas />
        </main>
        <Inspector />
      </div>

      {settingsOpen && <SettingsDialog modules={MODULES.map(({ id, name, description }) => ({ id, name, description }))} onClose={() => setSettingsOpen(false)} />}
      {MODULES.map(({ id, Dialog }) => openModule === id && enabledModules[id] && (
        <Suspense key={id} fallback={null}><Dialog onClose={() => setOpenModule(null)} /></Suspense>
      ))}
      {exporting && <ExportDialog onClose={() => setExporting(false)} notify={notify} />}

      {closing && (
        <div className="modal-bg" onMouseDown={() => setConfirmClose(null)}>
          <div className="modal" role="dialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
            <h3>Chiudere «{tabName(closing)}»?</h3>
            <p>Ci sono modifiche non salvate.</p>
            <div className="btn-row end">
              <button onClick={() => setConfirmClose(null)}>Annulla</button>
              <button className="danger" onClick={() => { closeTab(closing.id); setConfirmClose(null) }}>Chiudi senza salvare</button>
              <button className="primary" onClick={async () => {
                useStore.getState().setActive(closing.id)
                // se il salvataggio è annullato o fallisce la scheda resta aperta: niente perdita di lavoro
                if (await saveActive(notify)) closeTab(closing.id)
                setConfirmClose(null)
              }}>Salva e chiudi</button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts">{toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>
    </div>
  )
}
