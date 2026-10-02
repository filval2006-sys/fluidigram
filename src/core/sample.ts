import type { FluidDocument } from './types'

/** Impianto di esempio: pressurizzazione N₂ di un serbatoio ossidante con linea di scarico. */
export const SAMPLE_DOCUMENT: FluidDocument = {
  version: 2,
  meta: {
    title: { it: 'Impianto di alimentazione ossidante', en: 'Oxidizer feed system' },
    subtitle: { it: 'Banco prova motore ibrido', en: 'Hybrid motor test stand' },
    company: 'Fluidigram Demo',
    drawingNo: 'FG-0001',
    revision: 'A',
    date: '2026-10-01',
    drawnBy: 'F.V.',
    checkedBy: '',
  },
  revisions: [{ rev: 'A', date: '2026-10-01', description: { it: 'Prima emissione', en: 'First issue' }, author: 'F.V.' }],
  phases: [],
  export: { format: 'A3', mode: 'auto', lang: 'it', color: true, legend: true, bom: true, states: true },
  drawing: {
    annotations: [],
    components: [
      { id: 'c1', symbol: 'vessel.tank', tag: 'TK-102', x: 50, y: 50, rotation: 0, mirror: false, props: {} },
      { id: 'c2', symbol: 'valve.ball', tag: 'BV-101', x: 80, y: 50, rotation: 0, mirror: false, props: {} },
      { id: 'c3', symbol: 'fitting.junction', tag: 'J-101', x: 100, y: 50, rotation: 0, mirror: false, props: {} },
      { id: 'c4', symbol: 'instr.pt', tag: 'PT-101', x: 100, y: 30, rotation: 0, mirror: false, props: {} },
      { id: 'c5', symbol: 'valve.solenoid2', tag: 'SV-101', x: 120, y: 50, rotation: 0, mirror: false, props: {} },
      { id: 'c6', symbol: 'valve.check', tag: 'CV-101', x: 140, y: 50, rotation: 0, mirror: false, props: {} },
      { id: 'c7', symbol: 'vessel.tank', tag: 'TK-101', x: 170, y: 100, rotation: 0, mirror: false, props: {} },
      { id: 'c8', symbol: 'valve.ball', tag: 'BV-102', x: 170, y: 140, rotation: 90, mirror: false, props: {} },
      { id: 'c9', symbol: 'valve.solenoid2', tag: 'SV-102', x: 170, y: 165, rotation: 90, mirror: false, props: {} },
    ],
    lines: [
      { id: 'l1', fluid: 'pressurant', size: '1/4"', from: { componentId: 'c1', portId: 'right' }, to: { componentId: 'c2', portId: 'a' } },
      { id: 'l2', fluid: 'pressurant', from: { componentId: 'c2', portId: 'b' }, to: { componentId: 'c3', portId: 'w' } },
      { id: 'l3', fluid: 'pressurant', from: { componentId: 'c3', portId: 'n' }, to: { componentId: 'c4', portId: 'process' } },
      { id: 'l4', fluid: 'pressurant', from: { componentId: 'c3', portId: 'e' }, to: { componentId: 'c5', portId: 'a' } },
      { id: 'l5', fluid: 'pressurant', from: { componentId: 'c5', portId: 'b' }, to: { componentId: 'c6', portId: 'in' } },
      { id: 'l6', fluid: 'pressurant', size: '1/4"', from: { componentId: 'c6', portId: 'out' }, to: { componentId: 'c7', portId: 'top' } },
      { id: 'l7', fluid: 'oxidizer', size: '3/8"', from: { componentId: 'c7', portId: 'bottom' }, to: { componentId: 'c8', portId: 'a' } },
      { id: 'l8', fluid: 'oxidizer', from: { componentId: 'c8', portId: 'b' }, to: { componentId: 'c9', portId: 'a' } },
    ],
  },
}
