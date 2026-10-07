import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { checkReport, dismissIssue, restoreAllIssues, restoreIssue, runChecks, setCheckHints } from './checks'
import { addComponent, connectPorts } from './edit'
import { createEmptyDocument } from './documents'
import { parseDocument } from './validate'
import { SAMPLE_DOCUMENT } from './sample'
import type { FluidDocument, FluidId } from './types'

/** Costruisce un impianto da una lista di (simbolo, tag) collegati in catena porta E/uscita → porta W/ingresso. */
function chain(items: { sym: string; props?: Record<string, string> }[], fluid: FluidId = 'oxidizer', ports?: { out: string; in: string }[]) {
  return produce(createEmptyDocument(), (d) => {
    let prev: { id: string } | undefined
    items.forEach((it, i) => {
      const c = addComponent(d, it.sym, 40 + i * 40, 60)
      Object.assign(c.props, it.props ?? {})
      if (prev) {
        const o = ports?.[i - 1]?.out ?? 'b'
        const inn = ports?.[i - 1]?.in ?? 'a'
        connectPorts(d.drawing, { componentId: prev.id, portId: o }, { componentId: c.id, portId: inn }, fluid, 'Ø6 mm')
      }
      prev = c
    })
  })
}
const codes = (d: FluidDocument) => runChecks(d, { hints: true }).map((i) => i.code)

describe('controlli ingegneristici', () => {
  it('il disegno di esempio non ha errori', () => {
    expect(runChecks(SAMPLE_DOCUMENT).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('segnala un volume di ossidante chiudibile tra due valvole senza protezione', () => {
    const doc = chain([{ sym: 'valve.ball' }, { sym: 'valve.ball' }])
    const t = runChecks(doc, { hints: true }).find((i) => i.code === 'trapped')
    expect(t).toBeDefined()
    expect(t!.message).toContain('ossidante')
    expect(t!.targets.length).toBeGreaterThanOrEqual(2)
  })

  it('una valvola di sicurezza sullo stesso volume elimina l\'avviso', () => {
    const doc = produce(chain([{ sym: 'valve.ball' }, { sym: 'fitting.junction' }, { sym: 'valve.ball' }], 'oxidizer', [
      { out: 'b', in: 'w' }, { out: 'e', in: 'a' },
    ]), (d) => {
      const j = d.drawing.components[1]
      const psv = addComponent(d, 'valve.relief', 80, 20)
      connectPorts(d.drawing, { componentId: j.id, portId: 'n' }, { componentId: psv.id, portId: 'in' }, 'oxidizer', 'Ø6 mm')
    })
    expect(codes(doc)).not.toContain('trapped')
  })

  it('un disco di rottura o uno sfiato proteggono il volume', () => {
    expect(codes(chain([{ sym: 'valve.ball' }, { sym: 'fitting.burst' }, { sym: 'valve.ball' }]))).not.toContain('trapped')
  })

  it('un gas pressurizzante tra due valvole non è segnalato come volume intrappolato', () => {
    expect(codes(chain([{ sym: 'valve.ball' }, { sym: 'valve.ball' }], 'pressurant'))).not.toContain('trapped')
  })

  it('segnala fluidi diversi collegati dalla stessa valvola', () => {
    const doc = produce(chain([{ sym: 'valve.ball' }, { sym: 'valve.ball' }], 'oxidizer'), (d) => {
      d.drawing.lines[0].fluid = 'oxidizer'
      const extra = addComponent(d, 'vessel.tank', 40, 140)
      connectPorts(d.drawing, { componentId: d.drawing.components[0].id, portId: 'a' }, { componentId: extra.id, portId: 'top' }, 'fuel', 'Ø6 mm')
    })
    const i = runChecks(doc).find((x) => x.code === 'fluid-mix')
    expect(i?.severity).toBe('error')
    expect(i?.message).toMatch(/OX, FU|FU, OX/)
  })

  it('porte non collegate e componenti isolati', () => {
    const doc = produce(chain([{ sym: 'valve.ball' }, { sym: 'valve.ball' }]), (d) => { addComponent(d, 'valve.check', 200, 60) })
    const r = runChecks(doc)
    expect(r.filter((i) => i.code === 'open-port').length).toBe(2) // un lato libero per ciascuna valvola
    expect(r.some((i) => i.code === 'isolated')).toBe(true)
  })

  it('l\'uscita della valvola di sicurezza può restare aperta', () => {
    const doc = produce(createEmptyDocument(), (d) => {
      const t = addComponent(d, 'vessel.tank', 60, 80)
      const p = addComponent(d, 'valve.relief', 120, 40)
      connectPorts(d.drawing, { componentId: t.id, portId: 'top' }, { componentId: p.id, portId: 'in' }, 'oxidizer', 'Ø6 mm')
    })
    expect(codes(doc)).not.toContain('open-port')
  })

  it('pressione di linea oltre il limite del componente', () => {
    const doc = produce(chain([{ sym: 'valve.ball', props: { mawp: '50' } }, { sym: 'valve.ball', props: { mawp: '200' } }], 'pressurant'), (d) => {
      d.drawing.lines[0].pressure = '120'
    })
    const r = runChecks(doc).filter((i) => i.code === 'rating')
    expect(r).toHaveLength(1)
    expect(r[0].severity).toBe('error')
  })

  it('stato a riposo mancante su elettrovalvole e valvole pneumatiche', () => {
    const doc = chain([{ sym: 'valve.solenoid2' }, { sym: 'valve.ball', props: { actuator: 'pneumatic' } }, { sym: 'valve.ball', props: { actuator: 'pneumatic', normal: 'NC' } }], 'pressurant')
    expect(runChecks(doc).filter((i) => i.code === 'no-normal-state')).toHaveLength(2)
  })

  it('diametri diversi senza riduzione e linee senza diametro', () => {
    const doc = produce(chain([{ sym: 'valve.ball' }, { sym: 'valve.ball' }, { sym: 'valve.ball' }], 'pressurant'), (d) => {
      d.drawing.lines[1].size = 'AN-6'
      d.drawing.lines.push({ id: 'lx', fluid: 'pressurant', from: { componentId: d.drawing.components[2].id, portId: 'b' }, to: { componentId: addComponent(d, 'valve.check', 300, 60).id, portId: 'in' } })
    })
    const r = runChecks(doc, { hints: true })
    expect(r.some((i) => i.code === 'size-mismatch')).toBe(true)
    expect(r.some((i) => i.code === 'no-size')).toBe(true)
  })

  it('ordina errori, avvisi, informazioni', () => {
    const sev = runChecks(chain([{ sym: 'valve.ball' }, { sym: 'valve.ball' }])).map((i) => i.severity)
    const rank = { error: 0, warning: 1, info: 2 }
    expect([...sev].sort((a, b) => rank[a] - rank[b])).toEqual(sev)
  })

  it('i suggerimenti sono spenti finché non li accendi', () => {
    const doc = chain([{ sym: 'valve.ball' }, { sym: 'valve.ball' }])
    expect(runChecks(doc).map((i) => i.code)).not.toContain('trapped')
    expect(checkReport(doc).hiddenHints).toBeGreaterThan(0)
    const on = produce(doc, (d) => setCheckHints(d, true))
    expect(runChecks(on).map((i) => i.code)).toContain('trapped')
    expect(checkReport(on).hiddenHints).toBe(0)
  })

  it('un avviso ignorato sparisce e si può rimettere', () => {
    const doc = produce(chain([{ sym: 'valve.ball' }]), (d) => { addComponent(d, 'valve.check', 400, 400) })
    const before = runChecks(doc)
    expect(before.length).toBeGreaterThan(0)
    const id = before[0].id
    const hidden = produce(doc, (d) => dismissIssue(d, id))
    expect(runChecks(hidden).map((i) => i.id)).not.toContain(id)
    expect(checkReport(hidden).dismissed.map((i) => i.id)).toContain(id)
    expect(runChecks(produce(hidden, (d) => restoreIssue(d, id))).map((i) => i.id)).toContain(id)
    expect(checkReport(produce(hidden, (d) => restoreAllIssues(d))).dismissed).toEqual([])
  })

  it('i file senza la sezione «checks» si aprono con i valori predefiniti', () => {
    const raw = JSON.parse(JSON.stringify(SAMPLE_DOCUMENT))
    delete raw.checks
    expect(parseDocument(raw).checks).toEqual({ hints: false, dismissed: [] })
  })
})
