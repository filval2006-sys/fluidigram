/** Opening of `.fluidigram` files requested by the system (double click, "Open with", drop on the icon). Native app only. */

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface SystemFile { path: string; text: string }

/**
 * Registers `onFile` for files opened by the system, including those that arrived before the interface was ready.
 * Returns the function that unregisters it.
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
  // the files the app was launched with are read before returning, so the home page does not flash up first
  await handle(await invoke<string[]>('take_pending_files'))
  return unlisten
}

/** Reads the text of a project at a known path (for recent files). Native app only. */
export async function readProjectText(path: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('read_project_file', { path })
}

export const isNativeApp = (): boolean => inTauri()
