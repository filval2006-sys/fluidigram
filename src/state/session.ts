import type { FluidDocument } from '../core'

/** Recently opened or saved file (native app only: the browser has no path to reopen). */
export interface RecentFile { path: string; name: string; openedAt: number }

/** Work left unsaved when the app closed, offered on the home page. */
export interface Recoverable { id: string; filePath?: string; doc: FluidDocument; savedAt: number }

export const MAX_RECENTS = 12
const MAX_RECOVERABLE = 10

/** Name shown for a path: the file name without extension. */
export function fileLabel(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return base.replace(/\.[^.]+$/, '') || base
}

/** Adds a file at the top of the recents (no duplicates, at most MAX_RECENTS). */
export function pushRecent(list: RecentFile[], path: string, now = Date.now()): RecentFile[] {
  const entry: RecentFile = { path, name: fileLabel(path), openedAt: now }
  return [entry, ...list.filter((r) => r.path !== path)].slice(0, MAX_RECENTS)
}

const hasContent = (d: FluidDocument): boolean => d.drawing.components.length + d.drawing.annotations.length + d.bom.extra.length > 0

/**
 * A tab is "pristine" if it has no file, drawing or edits: it can be replaced without losing anything
 * (the blank tab the app starts with, or one left by "New" and never used).
 */
export function isPristineTab(t: { filePath?: string; doc: FluidDocument; past: unknown[] }): boolean {
  return !t.filePath && t.past.length === 0 && !hasContent(t.doc)
}

/** Which tabs of the previous session are worth offering for recovery: those with unsaved changes, or never saved but with content. */
export function worthRecovering(t: { filePath?: string; dirty?: boolean }, doc: FluidDocument): boolean {
  return !!t.dirty || (!t.filePath && hasContent(doc))
}

/** Merges recoverable work from different sessions: no duplicates, most recent first, at most MAX_RECOVERABLE. */
export function mergeRecoverable(older: Recoverable[], newer: Recoverable[]): Recoverable[] {
  const seen = new Set<string>()
  const out: Recoverable[] = []
  for (const r of [...newer, ...older]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out.sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_RECOVERABLE)
}
