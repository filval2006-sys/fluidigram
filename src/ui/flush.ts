/**
 * Immediately confirms the field being typed in (by taking away its focus): needed before actions that do not go through a click,
 * such as saving with a shortcut or changing screen, otherwise unconfirmed text would not end up in the project.
 */
export function flushFocusedField(): void {
  const el = document.activeElement as HTMLElement | null
  if (el && el !== document.body && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) el.blur()
}
