import { readDocument } from './documents'
import { SYMBOL_LIBRARY } from './symbols/library'
import type { FluidDocument } from './types'

export interface Issue { message: string }

/** Structural integrity checks. Engineering checks (phase 3) will be added here. */
export function checkIntegrity(doc: FluidDocument): Issue[] {
  const issues: Issue[] = []
  const add = (message: string) => issues.push({ message })
  const ids = new Set<string>()
  const tags = new Set<string>()
  for (const c of doc.drawing.components) {
    if (ids.has(c.id)) add(`duplicate component id: ${c.id}`)
    ids.add(c.id)
    if (!SYMBOL_LIBRARY.has(c.symbol)) add(`${c.tag}: unknown symbol "${c.symbol}"`)
    if (tags.has(c.tag)) add(`duplicate tag: ${c.tag}`)
    tags.add(c.tag)
  }
  for (const a of doc.drawing.annotations) {
    if (ids.has(a.id)) add(`duplicate annotation id: ${a.id}`)
    ids.add(a.id)
  }
  for (const l of doc.drawing.lines) {
    for (const ref of [l.from, l.to]) {
      const comp = doc.drawing.components.find((c) => c.id === ref.componentId)
      const def = comp && SYMBOL_LIBRARY.get(comp.symbol)
      if (!comp) add(`line ${l.id}: nonexistent component ${ref.componentId}`)
      else if (def && !def.ports.some((p) => p.id === ref.portId)) add(`line ${l.id}: nonexistent port ${comp.tag}.${ref.portId}`)
    }
  }
  return issues
}

/** Reads a JSON (including earlier versions), validates it and checks its integrity. Throws on error. */
export function parseDocument(json: unknown): FluidDocument {
  const doc = readDocument(json)
  const issues = checkIntegrity(doc)
  if (issues.length) throw new Error(issues.map((i) => i.message).join('\n'))
  return doc
}
