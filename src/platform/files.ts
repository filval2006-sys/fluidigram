/** Apertura/salvataggio file: dialoghi nativi in Tauri, download/upload del browser altrimenti. */

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface OpenedFile { name: string; path?: string; text: string }

export async function openTextFile(extensions: string[]): Promise<OpenedFile | null> {
  if (inTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    // "Tutti i file": una copia a cui il sistema ha cambiato o tolto l'estensione si apre lo stesso
    const path = await open({ multiple: false, filters: [{ name: 'Fluidigram', extensions }, { name: 'Tutti i file', extensions: ['*'] }] })
    if (!path || Array.isArray(path)) return null
    return { name: path.split(/[\\/]/).pop() ?? path, path, text: await readTextFile(path) }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f ? { name: f.name, text: await f.text() } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export interface OutFile { name: string; data: string | Uint8Array; mime: string }

function download(f: OutFile): void {
  const part = typeof f.data === 'string' ? f.data : (f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer)
  const url = URL.createObjectURL(new Blob([part], { type: f.mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = f.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const toHex = (s: string): string => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')

const splitPath = (p: string) => {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return { dir: p.slice(0, i + 1), name: p.slice(i + 1) }
}

/**
 * Salva uno o più file. Con `path` scrive direttamente il primo file (solo Tauri); altrimenti chiede dove salvare.
 * Con più file chiede una volta sola: gli altri finiscono nella stessa cartella. Restituisce il primo percorso (o nome), null se annullato.
 */
export async function saveFiles(files: OutFile[], extension: string, filterName: string, path?: string): Promise<string | null> {
  if (!files.length) return null
  if (inTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const chosen = path ?? (await save({ defaultPath: files[0].name, filters: [{ name: filterName, extensions: [extension] }] }))
    if (!chosen) return null
    // il nome scelto deve finire con l'estensione giusta, altrimenti il file diventa "sconosciuto"
    const target = chosen.toLowerCase().endsWith('.' + extension) ? chosen : `${chosen}.${extension}`
    const { dir } = splitPath(target)
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const dest = i === 0 ? target : dir + f.name
      const bytes = typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data
      await invoke('write_output_file', bytes, { headers: { 'x-path': toHex(dest) } })
    }
    return target
  }
  files.forEach((f, i) => setTimeout(() => download(f), i * 250))
  return files[0].name
}

export async function saveTextFile(text: string, suggestedName: string, extension: string, filterName: string, path?: string): Promise<string | null> {
  return saveFiles([{ name: suggestedName, data: text, mime: 'application/octet-stream' }], extension, filterName, path)
}
