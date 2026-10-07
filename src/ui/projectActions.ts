import { openTextFile, saveTextFile } from '../platform/files'
import { parseDocument } from '../core'
import { t } from '../i18n'
import { useStore } from '../state/store'
import { flushFocusedField } from './flush'

export type Notify = (msg: string, kind?: 'ok' | 'err') => void

const slug = (s: string) => s.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || t('project')

/** Saves the active tab. Returns true only if the file was written (false if cancelled or on error). */
export async function saveActive(notify: Notify, forceDialog = false): Promise<boolean> {
  flushFocusedField()
  const st = useStore.getState()
  const tab = st.tabs.find((t) => t.id === st.activeId)!
  const name = `${slug(tab.doc.meta.drawingNo || tab.doc.meta.title.it)}.fluidigram`
  try {
    const path = await saveTextFile(JSON.stringify(tab.doc, null, 2), name, 'fluidigram', t('Fluidigram project'), forceDialog ? undefined : tab.filePath)
    if (!path) return false
    st.markSaved(path)
    notify(t('Project saved'))
    return true
  } catch (e) {
    notify(t('Saving failed: {error}', { error: String(e) }), 'err')
    return false
  }
}

export async function openProject(notify: Notify): Promise<void> {
  try {
    const f = await openTextFile(['fluidigram', 'json'])
    if (!f) return
    useStore.getState().openDocument(parseDocument(JSON.parse(f.text)), f.path)
  } catch (e) { notify(t('Invalid file: {error}', { error: e instanceof Error ? e.message : String(e) }), 'err') }
}
