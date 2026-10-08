import { create } from 'zustand'
import { produce } from 'immer'
import { APP_VERSION } from '../appInfo'
import { compareVersions, fetchLatestRelease, type LatestRelease } from '../platform/updates'
import { resolveLanguage, setUiLanguage, t, uiLanguage, type LanguagePref } from '../i18n'
import { MAX_RECENTS, isPristineTab, mergeRecoverable, pushRecent, worthRecovering, type RecentFile, type Recoverable } from './session'
import {
  DEFAULT_PIPE_SIZE, checkIntegrity, copyItems, pruneBom, createEmptyDocument, deleteItems, newId, pasteItems, readDocument,
  type Clip, type FluidDocument, type FluidId,
} from '../core'

export interface View { x: number; y: number; k: number }

export interface Tab {
  id: string
  doc: FluidDocument
  savedDoc: FluidDocument
  past: FluidDocument[]
  future: FluidDocument[]
  /** null → to be fitted to the sheet on first render */
  view: View | null
  selection: string[]
  filePath?: string
}

export const isDirty = (t: Tab): boolean => t.doc !== t.savedDoc

export type InspectorTab = 'props' | 'checks'

/** Work steps: first the diagram is drawn, then how it works is described (phases and valve states). */
type Step = 'design' | 'operation'

interface Store {
  tabs: Tab[]
  activeId: string
  theme: Theme
  /** interface language preference: follow the system or force Italian/English */
  language: LanguagePref
  setLanguage: (l: LanguagePref) => void
  /** update check: automatic once a day (can be turned off), result and the version whose notification dot was seen */
  updateAuto: boolean
  setUpdateAuto: (on: boolean) => void
  update: UpdateState
  updateSeen: string
  /** `silent`: a failed check is not reported (used by the automatic one) */
  checkForUpdates: (silent?: boolean) => Promise<void>
  /** runs the check if it is enabled and a day has passed since the last one */
  autoCheckForUpdates: () => void
  markUpdateSeen: () => void
  /** moduli opzionali attivi (id → true) */
  modules: Record<string, boolean>
  /** values used for new lines */
  draw: { fluid: FluidId; size: string }
  /** simbolo in posa (click libreria → click canvas) */
  placing: string | null
  inspectorTab: InspectorTab
  /** phase shown on the drawing (closed valves filled) */
  activePhase: string | null
  /** request to frame some elements (handled by the canvas) */
  focusRequest: { ids: string[]; n: number } | null
  /** zoom requested by the menu: the canvas performs it (it knows its own size) */
  viewRequest: { kind: 'in' | 'out' | 'fit'; n: number } | null
  /** main screen: the diagram or the bill of materials (same project tab) */
  stageView: 'schema' | 'bom'
  setStageView: (v: 'schema' | 'bom') => void
  /** work step in progress */
  step: Step
  setStep: (s: Step) => void
  requestView: (kind: 'in' | 'out' | 'fit') => void
  clipboard: Clip | null
  pasteCount: number
  /** home page visible (at startup, or from the Home button) */
  home: boolean
  setHome: (h: boolean) => void
  recents: RecentFile[]
  removeRecent: (path: string) => void
  clearRecents: () => void
  /** work left unsaved from the last session */
  recoverable: Recoverable[]
  recover: (id: string) => void
  discardRecoverable: (id?: string) => void

  setTheme: (t: Theme) => void
  setModule: (id: string, on: boolean) => void
  setDraw: (d: Partial<Store['draw']>) => void
  setPlacing: (id: string | null) => void
  setInspectorTab: (t: InspectorTab) => void
  setActivePhase: (id: string | null) => void
  focusOn: (ids: string[]) => void
  copySelection: () => boolean
  cutSelection: () => void
  paste: () => void
  duplicateSelection: () => void

  newProject: () => void
  openDocument: (doc: FluidDocument, filePath?: string) => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
  markSaved: (filePath?: string) => void

  /** Edits the active document with undo/redo (immer). */
  edit: (fn: (doc: FluidDocument) => void) => void
  /** Like edit, but without a new undo point (for drags: call checkpoint first). */
  editTransient: (fn: (doc: FluidDocument) => void) => void
  checkpoint: () => void
  undo: () => void
  redo: () => void

  setSelection: (ids: string[]) => void
  setView: (v: View) => void
}

const HISTORY_LIMIT = 200

function makeTab(doc: FluidDocument, filePath?: string): Tab {
  return { id: newId('t'), doc, savedDoc: doc, past: [], future: [], view: null, selection: [], filePath }
}

const first = makeTab(createEmptyDocument())

function patchActive(s: Store, fn: (t: Tab) => Tab): Pick<Store, 'tabs'> {
  return { tabs: s.tabs.map((t) => (t.id === s.activeId ? fn(t) : t)) }
}

export const STORAGE_KEY = 'fluidigram.workspace.v1'
const REJECTED_KEY = 'fluidigram.workspace.rejected'
const THEME_KEY = 'fluidigram.theme'
const MODULES_KEY = 'fluidigram.modules'
const LANGUAGE_KEY = 'fluidigram.language'
const UPDATE_AUTO_KEY = 'fluidigram.updates.auto'
const UPDATE_SEEN_KEY = 'fluidigram.updates.seen'
const UPDATE_LAST_KEY = 'fluidigram.updates.last'
/** The automatic check runs at most once a day. */
const UPDATE_EVERY_MS = 24 * 3600 * 1000

export interface UpdateState {
  phase: 'idle' | 'checking' | 'current' | 'available' | 'error'
  latest?: LatestRelease
  error?: string
}

const readKey = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const writeKey = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

export type Theme = 'system' | 'light' | 'dark'

function loadModules(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(MODULES_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(v).filter(([, on]) => on === true).map(([id]) => [id, true] as const))
  } catch { return {} }
}

function loadLanguage(): LanguagePref {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY)
    return v === 'it' || v === 'en' ? v : 'auto'
  } catch { return 'auto' }
}

function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

const RECENTS_KEY = 'fluidigram.recents'
const RECOVERY_KEY = 'fluidigram.recovery'

function loadRecents(): RecentFile[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as RecentFile[]
    return v.filter((r) => typeof r?.path === 'string' && typeof r?.name === 'string').slice(0, MAX_RECENTS)
  } catch { return [] }
}
const saveRecents = (list: RecentFile[]) => { try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)) } catch { /* storage unavailable */ } }

/** Reads and checks a saved document; throws if it is unreadable or refers to symbols/connections that no longer exist. */
function parseSaved(raw: unknown): FluidDocument {
  const doc = readDocument(raw)
  const broken = checkIntegrity(doc).filter((i) => !i.message.startsWith('tag duplicato'))
  if (broken.length) throw new Error(broken.map((i) => i.message).join('; '))
  return doc
}

function loadRecoverable(): Recoverable[] {
  try {
    const out: Recoverable[] = []
    for (const r of JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? '[]') as Recoverable[]) {
      try { out.push({ ...r, doc: parseSaved(r.doc) }) } catch { /* unreadable entry: skipped */ }
    }
    return out
  } catch { return [] }
}
const saveRecoverable = (list: Recoverable[]) => { try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(list)) } catch { /* storage unavailable */ } }

/**
 * The tabs of the last session no longer reopen by themselves. Those with unsaved work (edits, or new projects with
 * content) are set aside and offered on the home page; the rest is in files or in the recents.
 */
function takePreviousSession(): Recoverable[] {
  let fresh: Recoverable[] = []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as { tabs: { id: string; doc: unknown; filePath?: string; dirty?: boolean }[] }
      const now = Date.now()
      for (const t of data.tabs ?? []) {
        try {
          const doc = parseSaved(t.doc)
          if (worthRecovering(t, doc)) fresh.push({ id: t.id, filePath: t.filePath, doc, savedAt: now })
        } catch {
          // unreadable tab (e.g. after an update): set aside, not thrown away
          try {
            const kept = JSON.parse(localStorage.getItem(REJECTED_KEY) ?? '[]') as unknown[]
            localStorage.setItem(REJECTED_KEY, JSON.stringify([...kept, t.doc].slice(-5)))
          } catch { /* storage unavailable */ }
        }
      }
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch { fresh = [] }
  const merged = mergeRecoverable(loadRecoverable(), fresh)
  saveRecoverable(merged)
  return merged
}

const previousSession = takePreviousSession()

/**
 * Adds a tab. Opening a file (or recovering work) replaces the active tab if it is pristine and never used;
 * "New" does so only from the home page with just the starting blank tab, otherwise it adds one.
 */
function withNewTab(s: Store, t: Tab, opening: boolean): Pick<Store, 'tabs' | 'activeId'> {
  const active = s.tabs.find((x) => x.id === s.activeId)
  const replaceActive = opening
    ? !!active && isPristineTab(active)
    : s.home && s.tabs.length === 1 && isPristineTab(s.tabs[0])
  if (replaceActive && active) return { tabs: s.tabs.map((x) => (x.id === active.id ? t : x)), activeId: t.id }
  return { tabs: [...s.tabs, t], activeId: t.id }
}

const initialLanguage = loadLanguage()
setUiLanguage(resolveLanguage(initialLanguage))

export const useStore = create<Store>((set, get) => ({
  tabs: [first],
  activeId: first.id,
  home: true,
  recents: loadRecents(),
  recoverable: previousSession,
  theme: loadTheme(),
  language: initialLanguage,
  updateAuto: readKey(UPDATE_AUTO_KEY) !== 'off',
  update: { phase: 'idle' },
  updateSeen: readKey(UPDATE_SEEN_KEY) ?? '',
  modules: loadModules(),
  draw: { fluid: 'oxidizer', size: DEFAULT_PIPE_SIZE },
  placing: null,
  inspectorTab: 'props',
  activePhase: null,
  focusRequest: null,
  viewRequest: null,
  stageView: 'schema',
  setStageView: (stageView) => set({ stageView, step: 'design' }),
  step: 'design',
  setStep: (step) => set({ step }),
  requestView: (kind) => set((s) => ({ viewRequest: { kind, n: (s.viewRequest?.n ?? 0) + 1 } })),
  clipboard: null,
  pasteCount: 0,

  setModule: (id, on) =>
    set((s) => {
      const modules = { ...s.modules }
      if (on) modules[id] = true
      else delete modules[id]
      try { localStorage.setItem(MODULES_KEY, JSON.stringify(modules)) } catch { /* storage unavailable */ }
      return { modules }
    }),
  setUpdateAuto: (on) => {
    writeKey(UPDATE_AUTO_KEY, on ? 'on' : 'off')
    set({ updateAuto: on })
  },
  checkForUpdates: async (silent = false) => {
    if (get().update.phase === 'checking') return
    const before = get().update
    set({ update: { ...before, phase: 'checking' } })
    try {
      const latest = await fetchLatestRelease()
      writeKey(UPDATE_LAST_KEY, String(Date.now()))
      set({ update: compareVersions(latest.version, APP_VERSION) > 0 ? { phase: 'available', latest } : { phase: 'current', latest } })
    } catch (e) {
      set({ update: silent ? (before.phase === 'checking' ? { phase: 'idle' } : before) : { phase: 'error', error: e instanceof Error ? e.message : String(e) } })
    }
  },
  autoCheckForUpdates: () => {
    if (!get().updateAuto) return
    const last = Number(readKey(UPDATE_LAST_KEY) ?? 0)
    if (Date.now() - last >= UPDATE_EVERY_MS) void get().checkForUpdates(true)
  },
  markUpdateSeen: () => {
    const v = get().update.latest?.version
    if (!v || get().updateSeen === v) return
    writeKey(UPDATE_SEEN_KEY, v)
    set({ updateSeen: v })
  },
  setLanguage: (language) => {
    try { localStorage.setItem(LANGUAGE_KEY, language) } catch { /* storage unavailable */ }
    setUiLanguage(resolveLanguage(language))
    set({ language })
  },
  setTheme: (theme) => {
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* storage unavailable */ }
    set({ theme })
  },
  setDraw: (d) => set((s) => ({ draw: { ...s.draw, ...d } })),
  setPlacing: (placing) => set({ placing }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setActivePhase: (activePhase) => set({ activePhase }),
  copySelection: () => {
    const t = get().tabs.find((x) => x.id === get().activeId)
    if (!t || !t.selection.length) return false
    const clip = copyItems(t.doc.drawing, new Set(t.selection))
    if (!clip.components.length && !clip.annotations.length) return false
    set({ clipboard: clip, pasteCount: 0 })
    return true
  },
  cutSelection: () => {
    const st = get()
    if (!st.copySelection()) return
    const sel = new Set(st.tabs.find((x) => x.id === st.activeId)!.selection)
    st.edit((d) => deleteItems(d.drawing, sel))
    st.setSelection([])
  },
  paste: () => {
    const st = get()
    if (!st.clipboard) return
    const n = st.pasteCount + 1
    let created: string[] = []
    st.edit((d) => { created = pasteItems(d, st.clipboard!, 10 * n, 10 * n) })
    set({ pasteCount: n })
    st.setSelection(created)
  },
  duplicateSelection: () => {
    if (get().copySelection()) get().paste()
  },
  focusOn: (ids) => set((s) => ({ focusRequest: { ids, n: (s.focusRequest?.n ?? 0) + 1 } })),

  setHome: (home) => set({ home }),
  removeRecent: (path) => set((s) => { const recents = s.recents.filter((r) => r.path !== path); saveRecents(recents); return { recents } }),
  clearRecents: () => { saveRecents([]); set({ recents: [] }) },
  recover: (id) =>
    set((s) => {
      const r = s.recoverable.find((x) => x.id === id)
      if (!r) return s
      const t = makeTab(r.doc, r.filePath)
      // marked as modified: closing it, the app warns that there is work to save
      t.savedDoc = readDocument(JSON.parse(JSON.stringify(r.doc)))
      const recoverable = s.recoverable.filter((x) => x.id !== id)
      saveRecoverable(recoverable)
      return { ...withNewTab(s, t, true), recoverable, home: false, placing: null }
    }),
  discardRecoverable: (id) =>
    set((s) => {
      const recoverable = id ? s.recoverable.filter((x) => x.id !== id) : []
      saveRecoverable(recoverable)
      return { recoverable }
    }),

  newProject: () => {
    const t = makeTab(createEmptyDocument())
    set((s) => ({ ...withNewTab(s, t, false), home: false, placing: null }))
  },
  openDocument: (doc, filePath) => {
    const existing = filePath ? get().tabs.find((t) => t.filePath === filePath) : undefined
    const recents = filePath ? pushRecent(get().recents, filePath) : get().recents
    if (filePath) saveRecents(recents)
    if (existing) return set({ activeId: existing.id, home: false, recents })
    const t = makeTab(doc, filePath)
    set((s) => ({ ...withNewTab(s, t, true), home: false, placing: null, recents }))
  },
  closeTab: (id) =>
    set((s) => {
      const rest = s.tabs.filter((t) => t.id !== id)
      if (!rest.length) {
        // after the last tab is closed we return to the home page
        const t = makeTab(createEmptyDocument())
        return { tabs: [t], activeId: t.id, home: true }
      }
      const idx = s.tabs.findIndex((t) => t.id === id)
      return { tabs: rest, activeId: s.activeId === id ? rest[Math.max(0, idx - 1)].id : s.activeId }
    }),
  setActive: (activeId) => set({ activeId, home: false, placing: null }),
  markSaved: (filePath) =>
    set((s) => {
      const recents = filePath ? pushRecent(s.recents, filePath) : s.recents
      if (filePath) saveRecents(recents)
      return { ...patchActive(s, (t) => ({ ...t, savedDoc: t.doc, filePath: filePath ?? t.filePath })), recents }
    }),

  edit: (fn) =>
    set((s) =>
      patchActive(s, (t) => {
        const doc = produce(t.doc, (d) => { fn(d); pruneBom(d) })
        if (doc === t.doc) return t
        return { ...t, doc, past: [...t.past, t.doc].slice(-HISTORY_LIMIT), future: [] }
      })),
  editTransient: (fn) =>
    set((s) => patchActive(s, (t) => ({ ...t, doc: produce(t.doc, (d) => fn(d)) }))),
  checkpoint: () =>
    set((s) => patchActive(s, (t) => ({ ...t, past: [...t.past, t.doc].slice(-HISTORY_LIMIT), future: [] }))),
  undo: () =>
    set((s) =>
      patchActive(s, (t) => {
        const prev = t.past.at(-1)
        if (!prev) return t
        return { ...t, doc: prev, past: t.past.slice(0, -1), future: [t.doc, ...t.future], selection: [] }
      })),
  redo: () =>
    set((s) =>
      patchActive(s, (t) => {
        const next = t.future[0]
        if (!next) return t
        return { ...t, doc: next, past: [...t.past, t.doc], future: t.future.slice(1), selection: [] }
      })),

  setSelection: (selection) => set((s) => patchActive(s, (t) => ({ ...t, selection }))),
  setView: (view) => set((s) => patchActive(s, (t) => ({ ...t, view }))),
}))

export const useActiveTab = (): Tab => useStore((s) => s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0])

/** Phase shown on the drawing: valid only if it exists in the active tab (switching tab or undoing can make it vanish). */
export const useShownPhase = (): string | null =>
  useStore((s) => {
    const t = s.tabs.find((x) => x.id === s.activeId) ?? s.tabs[0]
    // the drawing shows phases only in the Operation step; there, if none is chosen, the first one is used
    if (s.step !== 'operation') return null
    return t.doc.phases.find((p) => p.id === s.activePhase)?.id ?? t.doc.phases[0]?.id ?? null
  })

/** Name shown in the tab. */
export const tabName = (tab: Tab): string => {
  const title = tab.doc.meta.title
  const own = uiLanguage()
  return title[own] || title[own === 'it' ? 'en' : 'it'] || t('Untitled')
}

// automatic saving of the workspace (tabs are found again when reopening)
function persistWorkspace(s: Store) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeId: s.activeId, tabs: s.tabs.map((t) => ({ id: t.id, doc: t.doc, filePath: t.filePath, dirty: isDirty(t) })) }),
    )
  } catch { /* quota exceeded or storage unavailable: ignored */ }
}
let timer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s) => {
  clearTimeout(timer)
  timer = setTimeout(() => persistWorkspace(s), 400)
})
// closing (or hiding) the window saves immediately, without waiting for the pause: the last edit is not lost
if (typeof window !== 'undefined') {
  const flush = () => { clearTimeout(timer); persistWorkspace(useStore.getState()) }
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
}
