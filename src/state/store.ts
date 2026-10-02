import { create } from 'zustand'
import { produce } from 'immer'
import {
  DEFAULT_PIPE_SIZE, copyItems, createEmptyDocument, deleteItems, newId, pasteItems, readDocument,
  type Clip, type FluidDocument, type FluidId,
} from '../core'

export interface View { x: number; y: number; k: number }

export interface Tab {
  id: string
  doc: FluidDocument
  savedDoc: FluidDocument
  past: FluidDocument[]
  future: FluidDocument[]
  /** null → da adattare al foglio al primo rendering */
  view: View | null
  selection: string[]
  filePath?: string
}

export const isDirty = (t: Tab): boolean => t.doc !== t.savedDoc

export type InspectorTab = 'props' | 'checks' | 'phases'

interface Store {
  tabs: Tab[]
  activeId: string
  theme: Theme
  /** moduli opzionali attivi (id → true) */
  modules: Record<string, boolean>
  /** valori usati per le nuove linee */
  draw: { fluid: FluidId; size: string }
  /** simbolo in posa (click libreria → click canvas) */
  placing: string | null
  inspectorTab: InspectorTab
  /** fase mostrata sul disegno (valvole chiuse piene) */
  activePhase: string | null
  /** richiesta di inquadrare degli elementi (la gestisce il canvas) */
  focusRequest: { ids: string[]; n: number } | null
  clipboard: Clip | null
  pasteCount: number

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

  /** Modifica il documento attivo con annulla/ripeti (immer). */
  edit: (fn: (doc: FluidDocument) => void) => void
  /** Come edit, ma senza nuovo punto di annullamento (per trascinamenti: chiamare prima checkpoint). */
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
const THEME_KEY = 'fluidigram.theme'
const MODULES_KEY = 'fluidigram.modules'

export type Theme = 'system' | 'light' | 'dark'

function loadModules(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(MODULES_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(v).filter(([, on]) => on === true).map(([id]) => [id, true] as const))
  } catch { return {} }
}

function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

function loadWorkspace(): { tabs: Tab[]; activeId: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as { tabs: { id: string; doc: unknown; filePath?: string; dirty?: boolean }[]; activeId: string }
    // una scheda illeggibile (es. dopo un aggiornamento) non deve far perdere le altre
    const tabs: Tab[] = []
    for (const t of data.tabs) {
      try {
        const tab: Tab = { ...makeTab(readDocument(t.doc), t.filePath), id: t.id }
        // modifiche non salvate al momento della chiusura: restano segnalate (savedDoc è un oggetto diverso da doc)
        if (t.dirty) tab.savedDoc = readDocument(t.doc)
        tabs.push(tab)
      } catch { /* scheda saltata */ }
    }
    if (!tabs.length) return null
    return { tabs, activeId: tabs.some((t) => t.id === data.activeId) ? data.activeId : tabs[0].id }
  } catch {
    return null
  }
}

const restored = loadWorkspace()

export const useStore = create<Store>((set, get) => ({
  tabs: restored?.tabs ?? [first],
  activeId: restored?.activeId ?? first.id,
  theme: loadTheme(),
  modules: loadModules(),
  draw: { fluid: 'oxidizer', size: DEFAULT_PIPE_SIZE },
  placing: null,
  inspectorTab: 'props',
  activePhase: null,
  focusRequest: null,
  clipboard: null,
  pasteCount: 0,

  setModule: (id, on) =>
    set((s) => {
      const modules = { ...s.modules }
      if (on) modules[id] = true
      else delete modules[id]
      try { localStorage.setItem(MODULES_KEY, JSON.stringify(modules)) } catch { /* storage non disponibile */ }
      return { modules }
    }),
  setTheme: (theme) => {
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* storage non disponibile */ }
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

  newProject: () => {
    const t = makeTab(createEmptyDocument())
    set((s) => ({ tabs: [...s.tabs, t], activeId: t.id, placing: null }))
  },
  openDocument: (doc, filePath) => {
    const existing = filePath ? get().tabs.find((t) => t.filePath === filePath) : undefined
    if (existing) return set({ activeId: existing.id })
    const t = makeTab(doc, filePath)
    set((s) => ({ tabs: [...s.tabs, t], activeId: t.id, placing: null }))
  },
  closeTab: (id) =>
    set((s) => {
      const rest = s.tabs.filter((t) => t.id !== id)
      if (!rest.length) {
        const t = makeTab(createEmptyDocument())
        return { tabs: [t], activeId: t.id }
      }
      const idx = s.tabs.findIndex((t) => t.id === id)
      return { tabs: rest, activeId: s.activeId === id ? rest[Math.max(0, idx - 1)].id : s.activeId }
    }),
  setActive: (activeId) => set({ activeId, placing: null }),
  markSaved: (filePath) => set((s) => patchActive(s, (t) => ({ ...t, savedDoc: t.doc, filePath: filePath ?? t.filePath }))),

  edit: (fn) =>
    set((s) =>
      patchActive(s, (t) => {
        const doc = produce(t.doc, (d) => fn(d))
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

/** Fase mostrata sul disegno: vale solo se esiste nella scheda attiva (cambiando scheda o annullando può sparire). */
export const useShownPhase = (): string | null =>
  useStore((s) => {
    const t = s.tabs.find((x) => x.id === s.activeId) ?? s.tabs[0]
    return s.activePhase && t.doc.phases.some((p) => p.id === s.activePhase) ? s.activePhase : null
  })

/** Nome mostrato nella scheda. */
export const tabName = (t: Tab): string => t.doc.meta.title.it || t.doc.meta.title.en || 'Senza nome'

// salvataggio automatico dell'area di lavoro (le schede si ritrovano alla riapertura)
let timer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ activeId: s.activeId, tabs: s.tabs.map((t) => ({ id: t.id, doc: t.doc, filePath: t.filePath, dirty: isDirty(t) })) }),
      )
    } catch { /* quota o storage non disponibile: si ignora */ }
  }, 400)
})
