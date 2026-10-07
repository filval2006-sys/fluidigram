import { deleteItems, mirrorComponents, rotateComponents } from '../core'
import { useStore } from '../state/store'

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

const lastRun = new Map<string, number>()

/**
 * Un comando può arrivare due volte (voce di menu e scorciatoia, oppure tastiera ed evento di copia del sistema):
 * se è già stato eseguito un attimo fa si ignora. 25 ms sono meno del ritardo tra due ripetizioni automatiche di un tasto.
 */
export function justRan(id: string, ms = 25): boolean {
  const now = performance.now()
  const prev = lastRun.get(id)
  lastRun.set(id, now)
  return prev !== undefined && now - prev < ms
}

/** Comandi di modifica e visualizzazione, uguali da menu e da tastiera. Restituisce true se l'id è un suo comando. */
export function runEditCommand(id: string): boolean {
  const st = useStore.getState()
  const typing = isTyping(document.activeElement)
  const ids = ['undo', 'redo', 'copy', 'cut', 'paste', 'duplicate', 'select-all', 'delete', 'rotate', 'mirror', 'zoom-in', 'zoom-out', 'zoom-fit', 'theme-system', 'theme-light', 'theme-dark']
  if (!ids.includes(id)) return false

  if (id.startsWith('theme-')) { st.setTheme(id.slice(6) as 'system' | 'light' | 'dark'); return true }
  if (document.querySelector('.modal-bg') && !typing) return true // con una finestra aperta la tela non si tocca
  // nella schermata della distinta i comandi sul disegno non si applicano (Annulla/Ripeti sì: valgono anche per la distinta)
  if (st.home && !typing && !['undo', 'redo'].includes(id)) return true
  if ((st.stageView === 'bom' || st.step === 'operation') && !typing && !['undo', 'redo'].includes(id)) return true

  // dentro un campo di testo undo/redo/seleziona tutto riguardano il testo, il resto non si applica
  if (typing) {
    const el = document.activeElement as HTMLInputElement
    if (id === 'undo' || id === 'redo') document.execCommand(id)
    else if (id === 'select-all') el.select?.()
    return true
  }
  if (justRan(id)) return true

  const tab = st.tabs.find((t) => t.id === st.activeId)
  const sel = new Set(tab?.selection ?? [])
  switch (id) {
    case 'undo': st.undo(); break
    case 'redo': st.redo(); break
    case 'copy': if (sel.size) st.copySelection(); break
    case 'cut': if (sel.size) st.cutSelection(); break
    case 'paste': st.paste(); break
    case 'duplicate': if (sel.size) st.duplicateSelection(); break
    case 'select-all': {
      const d = tab?.doc.drawing
      if (d) st.setSelection([...d.components.map((c) => c.id), ...d.lines.map((l) => l.id), ...d.annotations.map((a) => a.id)])
      break
    }
    case 'delete': if (sel.size) { st.edit((d) => deleteItems(d.drawing, sel)); st.setSelection([]) } break
    case 'rotate': if (sel.size) st.edit((d) => rotateComponents(d.drawing, sel)); break
    case 'mirror': if (sel.size) st.edit((d) => mirrorComponents(d.drawing, sel)); break
    case 'zoom-in': st.requestView('in'); break
    case 'zoom-out': st.requestView('out'); break
    case 'zoom-fit': st.requestView('fit'); break
  }
  return true
}
