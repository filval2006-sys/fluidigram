/** Menu nativo dell'app (File, Modifica, Visualizza…): ogni voce personalizzata arriva qui con il suo id. Solo nell'app nativa. */

const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Registra `onCommand` per le voci di menu; restituisce la funzione per annullare la registrazione. */
export async function listenMenu(onCommand: (id: string) => void): Promise<() => void> {
  if (!inTauri()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<string>('menu', (e) => onCommand(e.payload))
}
