import type { FluidDocument, ValveState } from './types'

/** State after a click: unspecified → closed → open → unspecified. */
const NEXT: Record<string, ValveState | undefined> = { '': 'closed', closed: 'open', open: undefined }

/** Sets the state of a valve in a phase (undefined = unspecified). Applies to an immer draft. */
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

/** Sets the same state on all the given valves in a phase. */
export function setPhaseForAll(doc: FluidDocument, ids: string[], phaseId: string, state: ValveState | undefined): void {
  for (const id of ids) setValveState(doc, id, phaseId, state)
}
