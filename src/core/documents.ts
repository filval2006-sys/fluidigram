import { DocumentSchema, type FluidDocument } from './types'

export function createEmptyDocument(): FluidDocument {
  const today = new Date().toISOString().slice(0, 10)
  return {
    version: 2,
    meta: {
      title: { it: 'Nuovo progetto', en: 'New project' },
      subtitle: { it: '', en: '' },
      company: '', drawingNo: '', revision: 'A', date: today, drawnBy: '', checkedBy: '',
    },
    revisions: [{ rev: 'A', date: today, description: { it: 'Prima emissione', en: 'First issue' }, author: '' }],
    drawing: { components: [], lines: [], annotations: [] },
    phases: [],
    export: { format: 'A3', mode: 'auto', lang: 'it', color: true, legend: true, bom: true, states: true },
    bom: { overrides: {}, hidden: [], extra: [], grouped: true, groups: [], renames: {}, order: [] },
    checks: { hints: false, dismissed: [] },
  }
}

interface V1Sheet { format?: string; components?: { y: number }[]; lines?: { route?: { y: number }[] }[] }

/** Renamed or merged symbols: the old id reads as the new one, so files already saved keep opening. */
const LEGACY_SYMBOLS: Record<string, string> = {
  'instr.pta': 'instr.pt', // analog transducer: now it is the PT with the output signal choice
}

function renameLegacySymbols(raw: unknown): unknown {
  const doc = raw as { drawing?: { components?: { symbol?: unknown }[] } } | null
  const comps = doc?.drawing?.components
  if (!Array.isArray(comps)) return raw
  return { ...doc, drawing: { ...doc!.drawing, components: comps.map((c) => (typeof c?.symbol === 'string' && LEGACY_SYMBOLS[c.symbol] ? { ...c, symbol: LEGACY_SYMBOLS[c.symbol] } : c)) } }
}

/** Brings files of previous versions to the current format (v1: several sheets → a single drawing). */
function migrateDocument(raw: unknown): unknown {
  const r = raw as { version?: number; sheets?: V1Sheet[]; meta?: unknown; revisions?: unknown } | null
  if (!r || r.version !== 1 || !Array.isArray(r.sheets)) return renameLegacySymbols(raw)
  const components: unknown[] = []
  const lines: unknown[] = []
  let offsetY = 0
  for (const sh of r.sheets) {
    const ys = (sh.components ?? []).map((c) => c.y)
    const minY = ys.length ? Math.min(...ys) : 0
    const maxY = ys.length ? Math.max(...ys) : 0
    // following sheets are stacked below the previous one
    const shift = offsetY - minY
    for (const c of sh.components ?? []) components.push({ ...c, y: c.y + shift })
    for (const l of sh.lines ?? []) lines.push(l.route ? { ...l, route: l.route.map((p) => ({ ...p, y: p.y + shift })) } : l)
    offsetY += maxY - minY + 80
  }
  const fmt = r.sheets[0]?.format
  return { version: 2, meta: r.meta, revisions: r.revisions, drawing: { components, lines, annotations: [] }, export: { format: fmt === 'A4' ? 'A4' : 'A3' } }
}

/** Reads a JSON of any version and validates it. */
export function readDocument(raw: unknown): FluidDocument {
  return DocumentSchema.parse(migrateDocument(raw))
}
