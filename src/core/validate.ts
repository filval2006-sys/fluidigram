import { readDocument } from './documents'
import { SYMBOL_LIBRARY } from './symbols/library'
import type { FluidDocument } from './types'

export interface Issue { message: string }

/** Controlli di integrità strutturale. I controlli ingegneristici (fase 3) si aggiungeranno qui. */
export function checkIntegrity(doc: FluidDocument): Issue[] {
  const issues: Issue[] = []
  const add = (message: string) => issues.push({ message })
  const ids = new Set<string>()
  const tags = new Set<string>()
  for (const c of doc.drawing.components) {
    if (ids.has(c.id)) add(`id componente duplicato: ${c.id}`)
    ids.add(c.id)
    if (!SYMBOL_LIBRARY.has(c.symbol)) add(`${c.tag}: simbolo sconosciuto "${c.symbol}"`)
    if (tags.has(c.tag)) add(`tag duplicato: ${c.tag}`)
    tags.add(c.tag)
  }
  for (const a of doc.drawing.annotations) {
    if (ids.has(a.id)) add(`id annotazione duplicato: ${a.id}`)
    ids.add(a.id)
  }
  for (const l of doc.drawing.lines) {
    for (const ref of [l.from, l.to]) {
      const comp = doc.drawing.components.find((c) => c.id === ref.componentId)
      const def = comp && SYMBOL_LIBRARY.get(comp.symbol)
      if (!comp) add(`linea ${l.id}: componente inesistente ${ref.componentId}`)
      else if (def && !def.ports.some((p) => p.id === ref.portId)) add(`linea ${l.id}: porta inesistente ${comp.tag}.${ref.portId}`)
    }
  }
  return issues
}

/** Legge un JSON (anche di versioni precedenti), lo valida e controlla l'integrità. Lancia in caso di errore. */
export function parseDocument(json: unknown): FluidDocument {
  const doc = readDocument(json)
  const issues = checkIntegrity(doc)
  if (issues.length) throw new Error(issues.map((i) => i.message).join('\n'))
  return doc
}
