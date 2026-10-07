import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FilePlus2, House, FolderOpen, Monitor, Moon, Plus, Redo2, Save, Settings, Sun, Undo2, X } from 'lucide-react'
import { N_, t } from '../i18n'
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
  // from the home page the starting blank tab is not shown: it is not a project yet
  const shown = home ? tabs.filter((t) => !isPristineTab(t)) : tabs

  return (
    <div className="tabbar" role="tablist">
      <div role="tab" aria-selected={home} className={'tab home-tab' + (home ? ' on' : '')} onClick={() => { flushFocusedField(); setHome(true) }} title={t('Home page (⇧⌘H)')}>
        <House size={14} /><span className="tab-name">{t('Home')}</span>
      </div>
      {shown.map((tb) => (
        <div key={tb.id} role="tab" aria-selected={!home && tb.id === activeId} className={'tab' + (!home && tb.id === activeId ? ' on' : '')}
          onClick={() => { flushFocusedField(); setActive(tb.id) }} onDoubleClick={() => { setActive(tb.id); setRenaming(tb.id) }} title={t('Double-click to rename')}>
          {renaming === tb.id ? (
            <input autoFocus defaultValue={tb.doc.meta.title.it} onFocus={(e) => e.target.select()} onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { const v = e.target.value.trim(); if (v) edit((d) => { d.meta.title.it = v }); setRenaming(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }} />
          ) : (
            <span className="tab-name">{tabName(tb)}</span>
          )}
          {isDirty(tb) && <i className="dirty" aria-label={t('Unsaved changes')} />}
          <button className="icon-btn" aria-label={t('Close {name}', { name: tabName(tb) })} onClick={(e) => { e.stopPropagation(); onClose(tb.id) }}><X size={13} /></button>
        </div>
      ))}
      <button className="icon-btn add" aria-label={t('New project')} title={t('New project (⌘T)')} onClick={newProject}><Plus size={16} /></button>
    </div>
  )
}

const THEMES = [
  { id: 'system', label: N_('Theme: automatic'), Icon: Monitor },
  { id: 'light', label: N_('Theme: light'), Icon: Sun },
  { id: 'dark', label: N_('Theme: dark'), Icon: Moon },
] as const

/** Button added by an active optional module. */
export interface ExtraTool { id: string; label: string; title: string; Icon: LucideIcon; onClick: () => void }

export function Toolbar({ notify, onSettings, tools, homeMode = false }: { notify: Notify; onSettings: () => void; tools: ExtraTool[]; homeMode?: boolean }) {
  const tab = useActiveTab()
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const next = THEMES[(THEMES.findIndex((th) => th.id === theme) + 1) % THEMES.length]
  const Cur = THEMES.find((th) => th.id === theme)!.Icon
  const themeLabel = t(THEMES.find((th) => th.id === theme)!.label)

  const themeBtn = (
    <button className="icon-btn theme-btn" aria-label={themeLabel} title={t('{label} (click to change)', { label: themeLabel })} onClick={() => setTheme(next.id)}><Cur size={17} /></button>
  )
  const settingsBtn = <button className="icon-btn theme-btn" aria-label={t('Settings')} title={t('Settings')} onClick={onSettings}><Settings size={17} /></button>

  // on the home page the bar stays, with what is needed: same height, no jump when switching to the drawing
  if (homeMode) {
    return (
      <div className="toolbar">
        <div className="group">
          <button onClick={() => useStore.getState().newProject()}><FilePlus2 size={15} />{t('New')}</button>
          <button onClick={() => openProject(notify)}><FolderOpen size={15} />{t('Open')}</button>
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
        <button onClick={() => useStore.getState().newProject()}><FilePlus2 size={15} />{t('New')}</button>
        <button onClick={() => openProject(notify)}><FolderOpen size={15} />{t('Open')}</button>
        <button onClick={() => saveActive(notify)} title={t('Save (⌘S)')}><Save size={15} />{t('Save')}</button>
      </div>
      <div className="group">
        <button className="icon-btn" aria-label={t('Undo')} title={t('Undo (⌘Z)')} disabled={!tab.past.length} onClick={undo}><Undo2 size={16} /></button>
        <button className="icon-btn" aria-label={t('Redo')} title={t('Redo (⇧⌘Z)')} disabled={!tab.future.length} onClick={redo}><Redo2 size={16} /></button>
      </div>
      <div className="spacer" />
      {tools.map(({ id, label, title, Icon, onClick }) => <button key={id} onClick={onClick} title={title}><Icon size={15} />{label}</button>)}
      {themeBtn}
      {settingsBtn}
    </div>
  )
}
