import { openTextFile, saveTextFile } from '../platform/files'
import { parseDocument } from '../core'
import { useStore } from '../state/store'
import { flushFocusedField } from './flush'

export type Notify = (msg: string, kind?: 'ok' | 'err') => void

const slug = (s: string) => s.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'progetto'

/** Salva la scheda attiva. Restituisce true solo se il file è stato scritto (false se annullato o in errore). */
export async function saveActive(notify: Notify, forceDialog = false): Promise<boolean> {
  flushFocusedField()
  const st = useStore.getState()
  const tab = st.tabs.find((t) => t.id === st.activeId)!
  const name = `${slug(tab.doc.meta.drawingNo || tab.doc.meta.title.it)}.fluidigram`
  try {
    const path = await saveTextFile(JSON.stringify(tab.doc, null, 2), name, 'fluidigram', 'Progetto Fluidigram', forceDialog ? undefined : tab.filePath)
    if (!path) return false
    st.markSaved(path)
    notify('Progetto salvato')
    return true
  } catch (e) {
    notify(`Salvataggio non riuscito: ${String(e)}`, 'err')
    return false
  }
}

export async function openProject(notify: Notify): Promise<void> {
  try {
    const f = await openTextFile(['fluidigram', 'json'])
    if (!f) return
    useStore.getState().openDocument(parseDocument(JSON.parse(f.text)), f.path)
  } catch (e) { notify(`File non valido: ${e instanceof Error ? e.message : String(e)}`, 'err') }
}
