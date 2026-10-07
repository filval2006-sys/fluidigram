/** Native app menu (File, Edit, View…): each custom entry arrives here with its id. Native app only. */

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Registers `onCommand` for menu entries; returns the function that unregisters it. */
export async function listenMenu(onCommand: (id: string) => void): Promise<() => void> {
  if (!inTauri()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<string>('menu', (e) => onCommand(e.payload))
}

/** Tells the native menu which language to use ("it" or "en"). Native app only. */
export async function setMenuLanguage(lang: string): Promise<void> {
  if (!inTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('set_menu_language', { lang })
}
