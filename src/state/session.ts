import type { FluidDocument } from '../core'

/** File aperto o salvato di recente (solo nell'app nativa: nel browser non c'è un percorso da riaprire). */
export interface RecentFile { path: string; name: string; openedAt: number }

/** Lavoro rimasto non salvato alla chiusura dell'app, da offrire nella pagina iniziale. */
export interface Recoverable { id: string; filePath?: string; doc: FluidDocument; savedAt: number }

export const MAX_RECENTS = 12
const MAX_RECOVERABLE = 10

/** Nome mostrato per un percorso: il nome del file senza estensione. */
export function fileLabel(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return base.replace(/\.[^.]+$/, '') || base
}

/** Aggiunge un file in cima ai recenti (senza doppioni, al massimo MAX_RECENTS). */
export function pushRecent(list: RecentFile[], path: string, now = Date.now()): RecentFile[] {
  const entry: RecentFile = { path, name: fileLabel(path), openedAt: now }
  return [entry, ...list.filter((r) => r.path !== path)].slice(0, MAX_RECENTS)
}

const hasContent = (d: FluidDocument): boolean => d.drawing.components.length + d.drawing.annotations.length + d.bom.extra.length > 0

/**
 * Una scheda è «vuota» se non ha file, né disegno, né modifiche: si può sostituire senza perdere nulla
 * (la scheda bianca con cui l'app parte, o quella lasciata da «Nuovo» e mai usata).
 */
export function isPristineTab(t: { filePath?: string; doc: FluidDocument; past: unknown[] }): boolean {
  return !t.filePath && t.past.length === 0 && !hasContent(t.doc)
}

/** Quali schede della sessione precedente vale la pena offrire di recuperare: quelle con modifiche non salvate o mai salvate con del contenuto. */
export function worthRecovering(t: { filePath?: string; dirty?: boolean }, doc: FluidDocument): boolean {
  return !!t.dirty || (!t.filePath && hasContent(doc))
}

/** Unisce il lavoro da recuperare di sessioni diverse: niente doppioni, il più recente per primo, al massimo MAX_RECOVERABLE. */
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
