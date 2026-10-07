import { newId } from './edit'
import { MISC_GROUP, bomEditorSections, bomGroups } from './render/bom'
import { getSymbol } from './symbols/library'
import { autoBomRow } from './render/bom'
import type { BomOverride, FluidDocument, Lang } from './types'

export type BomField = 'description' | 'type' | 'note' | 'size' | 'pmax' | 'tag'
const TEXT_FIELDS = new Set<BomField>(['description', 'type', 'note'])

/** Edits a bill of materials cell (mutating functions: use inside store.edit). */
export function setBomCell(doc: FluidDocument, id: string, extra: boolean, field: BomField, lang: Lang, value: string): void {
  const bom = doc.bom
  if (extra) {
    const x = bom.extra.find((e) => e.id === id)
    if (!x) return
    if (field === 'tag' || field === 'size' || field === 'pmax') x[field] = value
    else x[field][lang] = value
    return
  }
  const c = doc.drawing.components.find((k) => k.id === id)
  if (!c || field === 'tag') return
  const auto = autoBomRow(c, lang)
  const o: BomOverride = bom.overrides[id] ?? {}
  if (TEXT_FIELDS.has(field)) {
    const key = field as 'description' | 'type' | 'note'
    const same = value === auto[key]
    const cur = { ...(o[key] ?? {}) }
    // the same value as the generated one is not an edit: it is removed, and the row follows the drawing again
    if (same) delete cur[lang]
    else cur[lang] = value
    if (Object.keys(cur).length) o[key] = cur
    else delete o[key]
  } else {
    if (value === auto[field]) delete o[field]
    else o[field] = value
  }
  if (Object.keys(o).length) bom.overrides[id] = o
  else delete bom.overrides[id]
}

/** Removes all manual edits of a row: it returns to the drawing's values. */
export function resetBomRow(doc: FluidDocument, id: string): void {
  delete doc.bom.overrides[id]
}

export function setBomHidden(doc: FluidDocument, id: string, hidden: boolean): void {
  const set = new Set(doc.bom.hidden)
  if (hidden) set.add(id)
  else set.delete(id)
  doc.bom.hidden = [...set]
}

export function addBomExtra(doc: FluidDocument, group = 'misc'): string {
  const id = newId('x')
  doc.bom.extra.push({ id, tag: '', description: { it: '', en: '' }, type: { it: '', en: '' }, size: '', pmax: '', note: { it: '', en: '' }, group })
  return id
}

export function removeBomExtra(doc: FluidDocument, id: string): void {
  doc.bom.extra = doc.bom.extra.filter((x) => x.id !== id)
}

/** Restores the automatic bill of materials: removes edits, hidden and added rows. */
export function resetBom(doc: FluidDocument): void {
  doc.bom = { overrides: {}, hidden: [], extra: [], grouped: true, groups: [], renames: {}, order: [] }
}

/** Forgets the edits of components that no longer exist. */
export function pruneBom(doc: FluidDocument): void {
  const alive = new Set(doc.drawing.components.map((c) => c.id))
  for (const id of Object.keys(doc.bom.overrides)) if (!alive.has(id)) delete doc.bom.overrides[id]
  if (doc.bom.hidden.some((id) => !alive.has(id))) doc.bom.hidden = doc.bom.hidden.filter((id) => alive.has(id))
}

// ---- gruppi ----

export function setBomGrouped(doc: FluidDocument, grouped: boolean): void {
  doc.bom.grouped = grouped
}

/** Renames a group (default or custom) in the given language; an empty name returns to the default one. */
export function renameBomGroup(doc: FluidDocument, id: string, lang: Lang, name: string): void {
  const custom = doc.bom.groups.find((g) => g.id === id)
  if (custom) { custom.name[lang] = name; return }
  const cur = { ...(doc.bom.renames[id] ?? {}) }
  if (name.trim()) cur[lang] = name
  else delete cur[lang]
  if (Object.keys(cur).length) doc.bom.renames[id] = cur
  else delete doc.bom.renames[id]
}

export function addBomGroup(doc: FluidDocument): string {
  const id = newId('g')
  const n = doc.bom.groups.length + 1
  doc.bom.groups.push({ id, name: { it: `Nuovo gruppo ${n}`, en: `New group ${n}` } })
  return id
}

/** Deletes a custom group: its rows return to their type's group (or "Other" if added by hand). */
export function removeBomGroup(doc: FluidDocument, id: string): void {
  if (!doc.bom.groups.some((g) => g.id === id)) return
  doc.bom.groups = doc.bom.groups.filter((g) => g.id !== id)
  doc.bom.order = doc.bom.order.filter((x) => x !== id)
  for (const [cid, o] of Object.entries(doc.bom.overrides)) {
    if (o.group === id) {
      delete o.group
      if (!Object.keys(o).length) delete doc.bom.overrides[cid]
    }
  }
  for (const x of doc.bom.extra) if (x.group === id) x.group = MISC_GROUP
}

/**
 * Moves a group up (-1) or down (+1) among the visible groups (empty ones do not count), and saves the order.
 */
export function moveBomGroup(doc: FluidDocument, id: string, delta: -1 | 1): void {
  const visible = bomEditorSections(doc.drawing, 'it', doc.bom).map((s) => s.group.id).filter(Boolean)
  const i = visible.indexOf(id)
  const target = visible[i + delta]
  if (i < 0 || target === undefined) return
  const ids = bomGroups(doc.bom, 'it').map((g) => g.id).filter((x) => x !== id)
  const at = ids.indexOf(target)
  ids.splice(delta < 0 ? at : at + 1, 0, id)
  doc.bom.order = ids
}

/** Puts a row in a group; the group of the component type does not require saving anything. */
export function setBomRowGroup(doc: FluidDocument, id: string, extra: boolean, group: string): void {
  if (extra) {
    const x = doc.bom.extra.find((e) => e.id === id)
    if (x) x.group = group
    return
  }
  const c = doc.drawing.components.find((k) => k.id === id)
  if (!c) return
  const o: BomOverride = doc.bom.overrides[id] ?? {}
  if (group === `cat:${getSymbol(c.symbol).category}`) delete o.group
  else o.group = group
  if (Object.keys(o).length) doc.bom.overrides[id] = o
  else delete doc.bom.overrides[id]
}
