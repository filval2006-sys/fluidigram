/** Apertura di file `.fluidigram` richiesta dal sistema (doppio clic, "Apri con", trascinamento sull'icona). Solo nell'app nativa. */

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface SystemFile { path: string; text: string }

/**
 * Registra `onFile` per i file aperti dal sistema, compresi quelli arrivati prima che l'interfaccia fosse pronta.
 * Restituisce la funzione per annullare la registrazione.
 */
export async function listenForSystemFiles(onFile: (f: SystemFile | { path: string; error: string }) => void): Promise<() => void> {
  if (!inTauri()) return () => {}
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')
  const handle = async (paths: string[]) => {
    for (const path of paths) {
      try {
        onFile({ path, text: await invoke<string>('read_project_file', { path }) })
      } catch (e) {
        onFile({ path, error: String(e) })
      }
    }
  }
  const unlisten = await listen<string[]>('open-files', (e) => void handle(e.payload))
  // i file con cui l'app è stata aperta si leggono prima di restituire il controllo: così la pagina iniziale non compare per un attimo
  await handle(await invoke<string[]>('take_pending_files'))
  return unlisten
}

/** Legge il testo di un progetto a un percorso già noto (per i file recenti). Solo nell'app nativa. */
export async function readProjectText(path: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('read_project_file', { path })
}

export const isNativeApp = (): boolean => inTauri()
