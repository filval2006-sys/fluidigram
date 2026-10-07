import type { FluidDocument, ValveState } from './types'

/** Stato successivo al clic: non specificato → chiusa → aperta → non specificato. */
const NEXT: Record<string, ValveState | undefined> = { '': 'closed', closed: 'open', open: undefined }

/** Imposta lo stato di una valvola in una fase (undefined = non specificato). Si applica a una bozza immer. */
export function setValveState(doc: FluidDocument, compId: string, phaseId: string, state: ValveState | undefined): void {
  const c = doc.drawing.components.find((x) => x.id === compId)
  if (!c) return
  if (state) { c.states = { ...c.states, [phaseId]: state }; return }
  if (c.states) {
    delete c.states[phaseId]
    if (!Object.keys(c.states).length) c.states = undefined
  }
}

export function cycleValveState(doc: FluidDocument, compId: string, phaseId: string): void {
  const c = doc.drawing.components.find((x) => x.id === compId)
  if (!c) return
  setValveState(doc, compId, phaseId, NEXT[c.states?.[phaseId] ?? ''])
}

/** Imposta lo stesso stato a tutte le valvole indicate in una fase. */
export function setPhaseForAll(doc: FluidDocument, ids: string[], phaseId: string, state: ValveState | undefined): void {
  for (const id of ids) setValveState(doc, id, phaseId, state)
}
