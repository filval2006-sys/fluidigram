import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { parseDocument } from './core'
import { listenMenu } from './platform/menu'
import { isNativeApp, listenForSystemFiles, readProjectText } from './platform/openFiles'
import { isDirty, tabName, useStore } from './state/store'
import { APP_CREDIT, APP_NAME, APP_VERSION } from './appInfo'
import { AboutDialog } from './ui/AboutDialog'
import { BomView } from './ui/BomView'
import { HomeView } from './ui/HomeView'
import { Canvas } from './ui/Canvas'
import { justRan, runEditCommand } from './ui/commands'
import { flushFocusedField } from './ui/flush'
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
  const [aboutOpen, setAboutOpen] = useState(false)
  const [openModule, setOpenModule] = useState<string | null>(null)
  const enabledModules = useStore((s) => s.modules)
  const stageView = useStore((s) => s.stageView)
  const theme = useStore((s) => s.theme)
  const home = useStore((s) => s.home)
  // nell'app nativa si aspetta di sapere se l'app è stata aperta con un file, per non mostrare la pagina iniziale per un attimo
  const [ready, setReady] = useState(!isNativeApp())

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
    }).then((fn) => { if (cancelled) fn(); else off = fn }).finally(() => setReady(true))
    const safety = setTimeout(() => setReady(true), 2000)
    return () => { cancelled = true; off(); clearTimeout(safety) }
  }, [notify])

  // riapre un file dall'elenco dei recenti
  const openRecent = useCallback(async (path: string) => {
    try {
      const doc = parseDocument(JSON.parse(await readProjectText(path)))
      useStore.getState().openDocument(doc, path)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // file spostato o cancellato: si toglie dall'elenco
      if (/No such file|non esiste|not found|os error 2|cannot find/i.test(msg)) { useStore.getState().removeRecent(path); notify('Il file non c\'è più: l\'ho tolto dai recenti', 'err') }
      else notify(`Impossibile aprire il file: ${msg}`, 'err')
    }
  }, [notify])

  // comandi dell'app (File, Impostazioni…): li esegue chi li riceve per primo, menu o scorciatoia
  const runCommand = useCallback((id: string): boolean => {
    const app = ['new', 'open', 'save', 'save-as', 'export', 'close-tab', 'settings', 'shortcuts', 'view-schema', 'view-bom', 'about', 'home']
    if (!app.includes(id)) return runEditCommand(id)
    flushFocusedField() // il testo che si sta scrivendo entra nel progetto prima di salvare, esportare o cambiare schermata
    if (justRan(id, 250)) return true
    const st = useStore.getState()
    // nella pagina iniziale non c'è niente da salvare, esportare o chiudere
    if (st.home && ['save', 'save-as', 'export', 'close-tab', 'view-schema', 'view-bom'].includes(id)) return true
    switch (id) {
      case 'home': st.setHome(true); break
      case 'new': st.newProject(); break
      case 'open': void openProject(notify); break
      case 'save': void saveActive(notify); break
      case 'save-as': void saveActive(notify, true); break
      case 'export': setExporting(true); break
      case 'close-tab': requestClose(st.activeId); break
      case 'settings': setSettingsOpen(true); break
      case 'about': setAboutOpen(true); break
      case 'view-schema': st.setStageView('schema'); break
      case 'view-bom': st.setStageView('bom'); break
      case 'shortcuts': st.setSelection([]); st.setInspectorTab('props'); notify('Le scorciatoie sono elencate nel pannello a destra'); break
    }
    return true
  }, [notify, requestClose])

  // voci del menu nativo
  useEffect(() => {
    let off = () => {}
    let cancelled = false
    void listenMenu((id) => runCommand(id)).then((fn) => { if (cancelled) fn(); else off = fn })
    return () => { cancelled = true; off() }
  }, [runCommand])

  // scorciatoie da tastiera (nel browser, o dove il menu non le intercetta)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const id = k === 's' ? (e.shiftKey ? 'save-as' : 'save') : k === 'o' ? 'open' : k === 't' || (k === 'n' && !e.shiftKey) ? 'new'
        : k === 'e' && e.shiftKey ? 'export' : k === 'w' ? 'close-tab' : k === ',' ? 'settings' : k === 'h' && e.shiftKey ? 'home' : k === '1' ? 'view-schema' : k === '2' ? 'view-bom' : ''
      if (!id) return
      e.preventDefault()
      runCommand(id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [runCommand])

  const closing = useStore((s) => s.tabs.find((t) => t.id === confirmClose))

  if (!ready) return <div className="app" />

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">Fluidigram</div>
        {!home && <TabBar onClose={requestClose} />}
      </header>
      {home ? (
        <HomeView onOpen={() => void openProject(notify)} onOpenRecent={(p) => void openRecent(p)} onSettings={() => setSettingsOpen(true)} />
      ) : (
        <>
          <Toolbar notify={notify} onExport={() => { flushFocusedField(); setExporting(true) }} onSettings={() => setSettingsOpen(true)} tools={tools} />
          <div className={'body' + (stageView === 'bom' ? ' no-lib' : '')}>
            {stageView !== 'bom' && <Library />}
            <main className="stage">
              {stageView === 'bom' ? <BomView /> : <Canvas />}
            </main>
            <Inspector />
          </div>
        </>
      )}

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
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

      {!home && <footer className="statusbar">
        <button className="link" onClick={() => setAboutOpen(true)} title="About">{APP_NAME} v{APP_VERSION}</button>
        <span>{APP_CREDIT}</span>
      </footer>}

      <div className="toasts">{toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>
    </div>
  )
}
