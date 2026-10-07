/**
 * Conferma subito il campo in cui si sta scrivendo (togliendogli il focus): serve prima di azioni che non passano da un clic,
 * come salvare con una scorciatoia o cambiare schermata, altrimenti il testo non ancora confermato non finirebbe nel progetto.
 */
export function flushFocusedField(): void {
  const el = document.activeElement as HTMLElement | null
  if (el && el !== document.body && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) el.blur()
}
