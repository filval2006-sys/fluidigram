import { create } from 'zustand'
import { produce } from 'immer'
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
  /** null → da adattare al foglio al primo rendering */
  view: View | null
  selection: string[]
  filePath?: string
}

export const isDirty = (t: Tab): boolean => t.doc !== t.savedDoc

export type InspectorTab = 'props' | 'checks'

/** Passi del lavoro: prima si disegna lo schema, poi si descrive come funziona (fasi e stato delle valvole). */
export type Step = 'design' | 'operation'

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
  /** zoom richiesto dal menu: la tela lo esegue (conosce le sue dimensioni) */
  viewRequest: { kind: 'in' | 'out' | 'fit'; n: number } | null
  /** schermata principale: lo schema o la distinta (stessa scheda di progetto) */
  stageView: 'schema' | 'bom'
  setStageView: (v: 'schema' | 'bom') => void
  /** passo del lavoro in corso */
  step: Step
  setStep: (s: Step) => void
  requestView: (kind: 'in' | 'out' | 'fit') => void
  clipboard: Clip | null
  pasteCount: number
  /** pagina iniziale visibile (all'avvio, o dal pulsante «Home») */
  home: boolean
  setHome: (h: boolean) => void
  recents: RecentFile[]
  removeRecent: (path: string) => void
  clearRecents: () => void
  /** lavoro rimasto non salvato dall'ultima sessione */
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
const REJECTED_KEY = 'fluidigram.workspace.rejected'
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

const RECENTS_KEY = 'fluidigram.recents'
const RECOVERY_KEY = 'fluidigram.recovery'

function loadRecents(): RecentFile[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as RecentFile[]
    return v.filter((r) => typeof r?.path === 'string' && typeof r?.name === 'string').slice(0, MAX_RECENTS)
  } catch { return [] }
}
const saveRecents = (list: RecentFile[]) => { try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)) } catch { /* storage non disponibile */ } }

/** Legge e controlla un documento salvato; lancia se è illeggibile o fa riferimento a simboli/collegamenti che non esistono più. */
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
      try { out.push({ ...r, doc: parseSaved(r.doc) }) } catch { /* voce illeggibile: si salta */ }
    }
    return out
  } catch { return [] }
}
const saveRecoverable = (list: Recoverable[]) => { try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(list)) } catch { /* storage non disponibile */ } }

/**
 * Le schede dell'ultima sessione non si riaprono più da sole. Quelle con lavoro non salvato (modifiche, o progetti nuovi con del
 * contenuto) vengono messe da parte e offerte nella pagina iniziale; il resto è nei file o nei recenti.
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
          // scheda illeggibile (es. dopo un aggiornamento): messa da parte, non buttata
          try {
            const kept = JSON.parse(localStorage.getItem(REJECTED_KEY) ?? '[]') as unknown[]
            localStorage.setItem(REJECTED_KEY, JSON.stringify([...kept, t.doc].slice(-5)))
          } catch { /* storage non disponibile */ }
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
 * Aggiunge una scheda. Aprire un file (o recuperare un lavoro) sostituisce la scheda attiva se è vuota e mai usata;
 * «Nuovo» lo fa solo partendo dalla pagina iniziale con la sola scheda bianca di partenza, altrimenti ne aggiunge una.
 */
function withNewTab(s: Store, t: Tab, opening: boolean): Pick<Store, 'tabs' | 'activeId'> {
  const active = s.tabs.find((x) => x.id === s.activeId)
  const replaceActive = opening
    ? !!active && isPristineTab(active)
    : s.home && s.tabs.length === 1 && isPristineTab(s.tabs[0])
  if (replaceActive && active) return { tabs: s.tabs.map((x) => (x.id === active.id ? t : x)), activeId: t.id }
  return { tabs: [...s.tabs, t], activeId: t.id }
}

export const useStore = create<Store>((set, get) => ({
  tabs: [first],
  activeId: first.id,
  home: true,
  recents: loadRecents(),
  recoverable: previousSession,
  theme: loadTheme(),
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

  setHome: (home) => set({ home }),
  removeRecent: (path) => set((s) => { const recents = s.recents.filter((r) => r.path !== path); saveRecents(recents); return { recents } }),
  clearRecents: () => { saveRecents([]); set({ recents: [] }) },
  recover: (id) =>
    set((s) => {
      const r = s.recoverable.find((x) => x.id === id)
      if (!r) return s
      const t = makeTab(r.doc, r.filePath)
      // segnata come modificata: chiudendola l'app avvisa che c'è lavoro da salvare
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
        // chiusa l'ultima scheda si torna alla pagina iniziale
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

/** Fase mostrata sul disegno: vale solo se esiste nella scheda attiva (cambiando scheda o annullando può sparire). */
export const useShownPhase = (): string | null =>
  useStore((s) => {
    const t = s.tabs.find((x) => x.id === s.activeId) ?? s.tabs[0]
    // il disegno mostra le fasi solo nel passo «Funzionamento»; lì, se non ne hai scelta una, si parte dalla prima
    if (s.step !== 'operation') return null
    return t.doc.phases.find((p) => p.id === s.activePhase)?.id ?? t.doc.phases[0]?.id ?? null
  })

/** Nome mostrato nella scheda. */
export const tabName = (t: Tab): string => t.doc.meta.title.it || t.doc.meta.title.en || 'Senza nome'

// salvataggio automatico dell'area di lavoro (le schede si ritrovano alla riapertura)
function persistWorkspace(s: Store) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeId: s.activeId, tabs: s.tabs.map((t) => ({ id: t.id, doc: t.doc, filePath: t.filePath, dirty: isDirty(t) })) }),
    )
  } catch { /* quota o storage non disponibile: si ignora */ }
}
let timer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s) => {
  clearTimeout(timer)
  timer = setTimeout(() => persistWorkspace(s), 400)
})
// chiudendo la finestra (o nascondendola) si salva subito, senza aspettare la pausa: l'ultima modifica non va persa
if (typeof window !== 'undefined') {
  const flush = () => { clearTimeout(timer); persistWorkspace(useStore.getState()) }
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
}
