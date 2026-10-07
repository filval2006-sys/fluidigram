import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FilePlus2, House, FolderOpen, Monitor, Moon, Plus, Redo2, Save, Settings, Sun, Undo2, X } from 'lucide-react'
import { flushFocusedField } from './flush'
import { openProject, saveActive, type Notify } from './projectActions'
import { isPristineTab } from '../state/session'
import { isDirty, tabName, useActiveTab, useStore } from '../state/store'

export function TabBar({ onClose }: { onClose: (id: string) => void }) {
  const tabs = useStore((s) => s.tabs)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const newProject = useStore((s) => s.newProject)
  const edit = useStore((s) => s.edit)
  const home = useStore((s) => s.home)
  const setHome = useStore((s) => s.setHome)
  const [renaming, setRenaming] = useState<string | null>(null)
  // dalla pagina iniziale la scheda bianca di partenza non si mostra: non è ancora un progetto
  const shown = home ? tabs.filter((t) => !isPristineTab(t)) : tabs

  return (
    <div className="tabbar" role="tablist">
      <div role="tab" aria-selected={home} className={'tab home-tab' + (home ? ' on' : '')} onClick={() => { flushFocusedField(); setHome(true) }} title="Pagina iniziale (⇧⌘H)">
        <House size={14} /><span className="tab-name">Home</span>
      </div>
      {shown.map((t) => (
        <div key={t.id} role="tab" aria-selected={!home && t.id === activeId} className={'tab' + (!home && t.id === activeId ? ' on' : '')}
          onClick={() => { flushFocusedField(); setActive(t.id) }} onDoubleClick={() => { setActive(t.id); setRenaming(t.id) }} title="Doppio clic per rinominare">
          {renaming === t.id ? (
            <input autoFocus defaultValue={t.doc.meta.title.it} onFocus={(e) => e.target.select()} onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { const v = e.target.value.trim(); if (v) edit((d) => { d.meta.title.it = v }); setRenaming(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }} />
          ) : (
            <span className="tab-name">{tabName(t)}</span>
          )}
          {isDirty(t) && <i className="dirty" aria-label="Modifiche non salvate" />}
          <button className="icon-btn" aria-label={`Chiudi ${tabName(t)}`} onClick={(e) => { e.stopPropagation(); onClose(t.id) }}><X size={13} /></button>
        </div>
      ))}
      <button className="icon-btn add" aria-label="Nuovo progetto" title="Nuovo progetto (⌘T)" onClick={newProject}><Plus size={16} /></button>
    </div>
  )
}

const THEMES = [
  { id: 'system', label: 'Tema: automatico', Icon: Monitor },
  { id: 'light', label: 'Tema: chiaro', Icon: Sun },
  { id: 'dark', label: 'Tema: scuro', Icon: Moon },
] as const

/** Pulsante aggiunto da un modulo opzionale attivo. */
export interface ExtraTool { id: string; label: string; title: string; Icon: LucideIcon; onClick: () => void }

export function Toolbar({ notify, onSettings, tools, homeMode = false }: { notify: Notify; onSettings: () => void; tools: ExtraTool[]; homeMode?: boolean }) {
  const tab = useActiveTab()
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const next = THEMES[(THEMES.findIndex((t) => t.id === theme) + 1) % THEMES.length]
  const Cur = THEMES.find((t) => t.id === theme)!.Icon

  const themeBtn = (
    <button className="icon-btn theme-btn" aria-label={THEMES.find((t) => t.id === theme)!.label} title={`${THEMES.find((t) => t.id === theme)!.label} (clic per cambiare)`} onClick={() => setTheme(next.id)}><Cur size={17} /></button>
  )
  const settingsBtn = <button className="icon-btn theme-btn" aria-label="Impostazioni" title="Impostazioni" onClick={onSettings}><Settings size={17} /></button>

  // nella pagina iniziale la barra resta, con il necessario: stessa altezza, niente salto quando si passa al disegno
  if (homeMode) {
    return (
      <div className="toolbar">
        <div className="group">
          <button onClick={() => useStore.getState().newProject()}><FilePlus2 size={15} />Nuovo</button>
          <button onClick={() => openProject(notify)}><FolderOpen size={15} />Apri</button>
        </div>
        <div className="spacer" />
        {themeBtn}
        {settingsBtn}
      </div>
    )
  }

  return (
    <div className="toolbar">
      <div className="group">
        <button onClick={() => useStore.getState().newProject()}><FilePlus2 size={15} />Nuovo</button>
        <button onClick={() => openProject(notify)}><FolderOpen size={15} />Apri</button>
        <button onClick={() => saveActive(notify)} title="Salva (⌘S)"><Save size={15} />Salva</button>
      </div>
      <div className="group">
        <button className="icon-btn" aria-label="Annulla" title="Annulla (⌘Z)" disabled={!tab.past.length} onClick={undo}><Undo2 size={16} /></button>
        <button className="icon-btn" aria-label="Ripeti" title="Ripeti (⇧⌘Z)" disabled={!tab.future.length} onClick={redo}><Redo2 size={16} /></button>
      </div>
      <div className="spacer" />
      {tools.map(({ id, label, title, Icon, onClick }) => <button key={id} onClick={onClick} title={title}><Icon size={15} />{label}</button>)}
      {themeBtn}
      {settingsBtn}
    </div>
  )
}
