import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { parseDocument } from './core'
import { resolveLanguage, t } from './i18n'
import { listenMenu, setMenuLanguage } from './platform/menu'
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
import { OperationPanel, OperationStage } from './ui/OperationView'
import { StepBar } from './ui/StepBar'
import { MODULES } from './modules'
import { SettingsDialog } from './ui/SettingsDialog'
import { ExportDialog } from './ui/ExportDialog'
import { openProject, saveActive } from './ui/projectActions'
import { TabBar, Toolbar, type ExtraTool } from './ui/TopBar'

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
  const step = useStore((s) => s.step)
  const theme = useStore((s) => s.theme)
  const language = useStore((s) => s.language)
  const uiLang = resolveLanguage(language)
  const home = useStore((s) => s.home)
  // in the native app we wait to know whether the app was opened with a file, so the home page does not flash up first
  const [ready, setReady] = useState(!isNativeApp())

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])
  // once the app is ready, look for a new version (at most once a day, if enabled in Settings)
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => useStore.getState().autoCheckForUpdates(), 4000)
    return () => clearTimeout(id)
  }, [ready])
  // the native menu follows the interface language
  useEffect(() => { void setMenuLanguage(uiLang) }, [uiLang])
  const closeTab = useStore((s) => s.closeTab)

  const tools: ExtraTool[] = useMemo(
    () => MODULES.filter((m) => enabledModules[m.id]).map((m) => ({ id: m.id, label: t(m.toolLabel), title: t(m.name), Icon: m.Icon, onClick: () => setOpenModule(m.id) })),
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

  // .fluidigram files opened by the system (double click, "Open with")
  useEffect(() => {
    let off = () => {}
    let cancelled = false
    void listenForSystemFiles((f) => {
      if ('error' in f) return notify(t('Could not open the file: {error}', { error: f.error }), 'err')
      try { useStore.getState().openDocument(parseDocument(JSON.parse(f.text)), f.path) }
      catch (e) { notify(t('Invalid file: {error}', { error: e instanceof Error ? e.message : String(e) }), 'err') }
    }).then((fn) => { if (cancelled) fn(); else off = fn }).finally(() => setReady(true))
    const safety = setTimeout(() => setReady(true), 2000)
    return () => { cancelled = true; off(); clearTimeout(safety) }
  }, [notify])

  // reopens a file from the recents list
  const openRecent = useCallback(async (path: string) => {
    try {
      const doc = parseDocument(JSON.parse(await readProjectText(path)))
      useStore.getState().openDocument(doc, path)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // file moved or deleted: it is removed from the list
      if (/No such file|does not exist|non esiste|not found|os error 2|cannot find/i.test(msg)) { useStore.getState().removeRecent(path); notify(t('The file no longer exists: it was removed from the recents'), 'err') }
      else notify(t('Could not open the file: {error}', { error: msg }), 'err')
    }
  }, [notify])

  // app commands (File, Settings…): run by whoever receives them first, menu or shortcut
  const runCommand = useCallback((id: string): boolean => {
    const app = ['new', 'open', 'save', 'save-as', 'export', 'close-tab', 'settings', 'shortcuts', 'view-schema', 'view-bom', 'view-ops', 'about', 'home']
    if (!app.includes(id)) return runEditCommand(id)
    flushFocusedField() // the text being typed enters the project before saving, exporting or changing screen
    if (justRan(id, 250)) return true
    const st = useStore.getState()
    // on the home page there is nothing to save, export or close
    if (st.home && ['save', 'save-as', 'export', 'close-tab', 'view-schema', 'view-bom', 'view-ops'].includes(id)) return true
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
      case 'view-ops': st.setStep('operation'); break
      case 'shortcuts': st.setSelection([]); st.setInspectorTab('props'); notify(t('The shortcuts are listed in the panel on the right')); break
    }
    return true
  }, [notify, requestClose])

  // native menu entries
  useEffect(() => {
    let off = () => {}
    let cancelled = false
    void listenMenu((id) => runCommand(id)).then((fn) => { if (cancelled) fn(); else off = fn })
    return () => { cancelled = true; off() }
  }, [runCommand])

  // keyboard shortcuts (in the browser, or where the menu does not intercept them)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const id = k === 's' ? (e.shiftKey ? 'save-as' : 'save') : k === 'o' ? 'open' : k === 't' || (k === 'n' && !e.shiftKey) ? 'new'
        : k === 'e' && e.shiftKey ? 'export' : k === 'w' ? 'close-tab' : k === ',' ? 'settings' : k === 'h' && e.shiftKey ? 'home' : k === '1' ? 'view-schema' : k === '2' ? 'view-bom' : k === '3' ? 'view-ops' : ''
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
    <div className="app" key={uiLang}>
      <header className="titlebar">
        <div className="brand">Fluidigram</div>
        <TabBar onClose={requestClose} />
      </header>
      <Toolbar notify={notify} onSettings={() => setSettingsOpen(true)} tools={tools} homeMode={home} />
      {!home && <StepBar onExport={() => { flushFocusedField(); setExporting(true) }} />}
      {home ? (
        <HomeView onOpen={() => void openProject(notify)} onOpenRecent={(p) => void openRecent(p)} />
      ) : (
        <>
          {step === 'operation' ? (
            <div className="body no-lib" key="operation">
              <main className="stage"><OperationStage /></main>
              <OperationPanel />
            </div>
          ) : (
            <div className={'body' + (stageView === 'bom' ? ' no-lib' : '')} key="design">
              {stageView !== 'bom' && <Library />}
              <main className="stage">
                {stageView === 'bom' ? <BomView /> : <Canvas />}
              </main>
              <Inspector />
            </div>
          )}
        </>
      )}

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {settingsOpen && <SettingsDialog modules={MODULES.map(({ id, name, description }) => ({ id, name: t(name), description: t(description) }))} onClose={() => setSettingsOpen(false)} />}
      {MODULES.map(({ id, Dialog }) => openModule === id && enabledModules[id] && (
        <Suspense key={id} fallback={null}><Dialog onClose={() => setOpenModule(null)} /></Suspense>
      ))}
      {exporting && <ExportDialog kind={step === 'operation' ? 'phases' : 'design'} onClose={() => setExporting(false)} notify={notify} />}

      {closing && (
        <div className="modal-bg" onMouseDown={() => setConfirmClose(null)}>
          <div className="modal" role="dialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
            <h3>{t('Close “{name}”?', { name: tabName(closing) })}</h3>
            <p>{t('There are unsaved changes.')}</p>
            <div className="btn-row end">
              <button onClick={() => setConfirmClose(null)}>{t('Cancel')}</button>
              <button className="danger" onClick={() => { closeTab(closing.id); setConfirmClose(null) }}>{t('Close without saving')}</button>
              <button className="primary" onClick={async () => {
                useStore.getState().setActive(closing.id)
                // if saving is cancelled or fails the tab stays open: no work is lost
                if (await saveActive(notify)) closeTab(closing.id)
                setConfirmClose(null)
              }}>{t('Save and close')}</button>
            </div>
          </div>
        </div>
      )}

      <footer className="statusbar">
        <button className="link" onClick={() => setAboutOpen(true)} title={t('About')}>{APP_NAME} v{APP_VERSION}</button>
        <span>{APP_CREDIT}</span>
      </footer>

      <div className="toasts">{toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>
    </div>
  )
}
