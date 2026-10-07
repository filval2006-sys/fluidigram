import type { L10n } from '../types'
import type { ActuatorId, OptionDef, PortDef, Prim, SymbolCategory, SymbolDef } from './types'

export const CATEGORY_NAMES: Record<SymbolCategory, { it: string; en: string }> = {
  valves: { it: 'Valvole', en: 'Valves' },
  vessels: { it: 'Serbatoi', en: 'Vessels' },
  instruments: { it: 'Strumenti', en: 'Instruments' },
  fittings: { it: 'Raccordi e protezioni', en: 'Fittings & protection' },
  engine: { it: 'Motore', en: 'Engine' },
}

const bowtie: Prim = { k: 'path', d: 'M1,2 L1,8 L5,5 Z M9,2 L9,8 L5,5 Z', fill: 'paper' }
const through: Prim = { k: 'path', d: 'M0,5 H10' }
const W = { id: 'a', x: 0, y: 5, dir: 'W' as const }
const E = { id: 'b', x: 10, y: 5, dir: 'E' as const }

/** Simbolo a due porte (W/E) su box 10×10. */
function inline(
  id: string, it: string, en: string, tagPrefix: string, prims: Prim[],
  extra: Partial<SymbolDef> = {}, category: SymbolCategory = 'valves',
): SymbolDef {
  return { id, name: { it, en }, category, w: 10, h: 10, tagPrefix, legend: true, ports: [W, E], prims, ...extra }
}

/** Pittogramma interno degli strumenti (box 10×10, cerchio di raggio 5 al centro). */
const dial = (letter: string): Prim[] => [
  { k: 'path', d: 'M2,7.4 A3.8,3.8 0 1 1 8,7.4' },
  { k: 'path', d: 'M5,5.4 L6.9,3.1' },
  { k: 'circle', cx: 5, cy: 5.4, r: 0.55, fill: 'ink' },
  { k: 'text', x: 5, y: 7.9, s: letter, size: 1.9 },
]
/** Sigla dello strumento scritta nel simbolo (resta uguale in libreria, legenda e disegno). */
const code = (letters: string, size = 3.4): Prim[] => [{ k: 'text', x: 5, y: 5, s: letters, size }]

const GLYPHS: Record<string, Prim[]> = {
  // solo gli strumenti analogici hanno il disegno: quadrante con lancetta
  'instr.pi': dial('P'),
  'instr.ti': dial('T'),
  // gli altri portano la sigla
  'instr.pt': code('PT'),
  'instr.pdt': [...code('PDT', 2.8), { k: 'text', x: 2.2, y: 8, s: '+', size: 2 }, { k: 'text', x: 7.8, y: 8, s: '–', size: 2 }],
  'instr.tt': code('TC'),
  'instr.ft': code('FT'),
  'instr.ps': code('PS'),
  'instr.wt': code('LC'),
  'instr.lt': code('LT'),
}

const PORTS_ALL: PortDef[] = [
  { id: 'process', x: 5, y: 10, dir: 'S' }, { id: 'top', x: 5, y: 0, dir: 'N' },
  { id: 'left', x: 0, y: 5, dir: 'W' }, { id: 'right', x: 10, y: 5, dir: 'E' },
]

const choice = (id: string, it: string, en = it) => ({ id, label: { it, en } })
/** Segnale di uscita e fondo scala: servono nella distinta per ordinare il sensore giusto. */
const SIGNAL_OPTIONS: OptionDef[] = [
  { key: 'signal', label: { it: 'Segnale di uscita', en: 'Output signal' }, default: 'na', choices: [
    choice('na', 'Non specificato', 'Not specified'), choice('0-5V', '0–5 V'), choice('0.5-4.5V', '0,5–4,5 V (ratiometrico)', '0.5–4.5 V (ratiometric)'),
    choice('0-10V', '0–10 V'), choice('4-20mA', '4–20 mA'), choice('digital', 'Digitale', 'Digital'),
  ] },
  { key: 'range', label: { it: 'Fondo scala', en: 'Full scale' }, default: 'na', choices: [
    choice('na', 'Non specificato', 'Not specified'),
    ...[10, 25, 50, 70, 100, 150, 200, 250, 350, 500, 700].map((b) => choice(`${b}bar`, `${b} bar`)),
  ] },
]

/** Strumento: cerchio con un pittogramma che lo rende riconoscibile; il tag sta fuori. Collegabile da ogni lato. */
function bubble(id: string, it: string, en: string, tagPrefix: string, keywords: string[] = [], extra: Partial<SymbolDef> = {}): SymbolDef {
  return {
    id, name: { it, en }, category: 'instruments', w: 10, h: 10, tagPrefix, legend: true, keywords,
    // 'process' (sotto) mantiene il nome dei file esistenti
    ports: PORTS_ALL,
    prims: [{ k: 'circle', cx: 5, cy: 5, r: 5, fill: 'paper' }, ...(GLYPHS[id] ?? [])],
    // il disegno è simmetrico: ruotandolo il pittogramma non deve girare, e le scritte restano dritte
    fixedBody: true,
    ...extra,
  }
}

/** Servoazionamento: cerchio sopra il corpo valvola (l'elettrovalvola pura ha invece il riquadro). */
const actuatorCircle = (label: string): Prim[] => [
  { k: 'path', d: 'M5,5 V-0.6' },
  { k: 'circle', cx: 5, cy: -3.2, r: 2.6, fill: 'paper' },
  { k: 'text', x: 5, y: -3.2, s: label, size: 2.2 },
]

const actuatorBox = (label: string): Prim[] => [
  { k: 'path', d: 'M5,5 V-1' },
  { k: 'rect', x: 2, y: -5, w: 6, h: 4, fill: 'paper' },
  { k: 'text', x: 5, y: -3, s: label, size: label.length > 1 ? 2.4 : 2.8 },
]

export interface ActuatorDef { id: ActuatorId; name: L10n; prims: Prim[]; top: number }

/** Azionamenti disegnati sopra il corpo valvola (la valvola è 10×10, il corpo arriva fino a y=2). */
export const ACTUATORS: readonly ActuatorDef[] = [
  { id: 'none', name: { it: 'Nessuno', en: 'None' }, prims: [], top: 0 },
  { id: 'manual', name: { it: 'Manuale (maniglia)', en: 'Manual (handle)' }, prims: [{ k: 'path', d: 'M5,5 V0.5 M2.5,0.5 H7.5' }], top: 0 },
  { id: 'solenoid', name: { it: 'Elettrico (solenoide)', en: 'Solenoid' }, prims: actuatorBox('EV'), top: -5 },
  { id: 'servo', name: { it: 'Servo (cerchio)', en: 'Servo (circle)' }, prims: actuatorCircle('SV'), top: -6 },
  { id: 'pneumatic', name: { it: 'Pneumatico (membrana)', en: 'Pneumatic (diaphragm)' }, prims: [{ k: 'path', d: 'M5,5 V0' }, { k: 'path', d: 'M1.5,0 A3.5,3.5 0 0 1 8.5,0 Z', fill: 'paper' }], top: -4 },
  { id: 'motor', name: { it: 'Motorizzato', en: 'Motorized' }, prims: [{ k: 'path', d: 'M5,5 V-1' }, { k: 'circle', cx: 5, cy: -4, r: 3, fill: 'paper' }, { k: 'text', x: 5, y: -4, s: 'M', size: 2.8 }], top: -7 },
]
const ACT = new Map(ACTUATORS.map((a) => [a.id, a]))

export interface ResolvedSymbol {
  prims: Prim[]
  extent: { x: number; y: number; w: number; h: number }
  avoidSides: SymbolDef['avoidSides']
  actuator: ActuatorId | null
}

const isActuatorId = (v: string | undefined): v is ActuatorId => !!v && ACT.has(v as ActuatorId)

/** Simbolo + opzioni del componente (azionamento, stato a riposo) → disegno effettivo. */
export function resolveSymbol(def: SymbolDef, props: Record<string, string> = {}): ResolvedSymbol {
  const base = def.extent ?? { x: 0, y: 0, w: def.w, h: def.h }
  if (def.variantPrims) return { prims: [...def.prims, ...def.variantPrims(props)], extent: base, avoidSides: def.avoidSides, actuator: null }
  if (!def.actuatable) return { prims: def.prims, extent: base, avoidSides: def.avoidSides, actuator: null }
  const chosen = props.actuator
  const actuator: ActuatorId = isActuatorId(chosen) ? chosen : def.actuatable.defaultActuator
  const a = ACT.get(actuator)!
  const prims = [...def.prims, ...a.prims]
  if (props.normal && actuator !== 'none') prims.push({ k: 'text', x: 9, y: a.top + 1.4, s: props.normal, size: 2, anchor: 'start' })
  const top = Math.min(base.y, a.top)
  return {
    prims,
    extent: { x: base.x, y: top, w: base.w + (props.normal ? 3 : 0), h: base.y + base.h - top },
    avoidSides: actuator === 'none' ? def.avoidSides : [...(def.avoidSides ?? []), 'N'],
    actuator,
  }
}

/** Quick disconnect: metà femmina a sinistra, maschio a destra; con valvole di ritegno autosigillanti opzionali. */
function qdPrims(p: Record<string, string>): Prim[] {
  const g = p.state === 'disconnected' ? 1.5 : 0
  const seal = p.seal ?? 'both'
  const f = (x: number) => x - g
  const m = (x: number) => x + g
  const out: Prim[] = [
    { k: 'path', d: `M0,5 H${f(2)} M${f(4.6)},2 H${f(2)} V8 H${f(4.6)}` },
    { k: 'path', d: `M${m(8)},5 H10 M${m(5.4)},3.2 H${m(8)} V6.8 H${m(5.4)}` },
  ]
  if (seal !== 'none') out.push({ k: 'path', d: `M${f(2.7)},3.7 V6.3 L${f(4.1)},5 Z`, fill: 'paper' })
  if (seal === 'both') out.push({ k: 'path', d: `M${m(7.3)},3.9 V6.1 L${m(5.9)},5 Z`, fill: 'paper' })
  return out
}

/** Etichette delle opzioni diverse dal valore predefinito, es. "scollegato, senza valvole". */
export function optionSuffix(def: SymbolDef, props: Record<string, string>, lang: 'it' | 'en'): string {
  const parts: string[] = []
  for (const o of def.options ?? []) {
    const v = props[o.key]
    if (!v || v === o.default) continue
    const c = o.choices.find((x) => x.id === v)
    if (c) parts.push(c.label[lang].replace(/\s*\(.*\)$/, '').toLowerCase())
  }
  return parts.join(', ')
}

/** Contorni dei recipienti: angoli r=5 con tratti piatti, così gli attacchi (griglia 5 mm) cadono esattamente sul bordo. */
const ROUND_V = 'M0,5 A5,5 0 0 1 5,0 H15 A5,5 0 0 1 20,5 V35 A5,5 0 0 1 15,40 H5 A5,5 0 0 1 0,35 Z'
const ROUND_H = 'M0,5 A5,5 0 0 1 5,0 H35 A5,5 0 0 1 40,5 V15 A5,5 0 0 1 35,20 H5 A5,5 0 0 1 0,15 Z'

const SYMBOLS: SymbolDef[] = [
  inline('valve.ball', 'Valvola a sfera', 'Ball valve', 'BV',
    [through, bowtie, { k: 'circle', cx: 5, cy: 5, r: 1.2, fill: 'ink' }], { actuatable: { defaultActuator: 'none' }, keywords: ['intercettazione', 'shutoff', 'manuale'] }),
  inline('valve.ball3', 'Valvola a sfera 3 vie', '3-way ball valve', 'BV',
    [through, { k: 'path', d: 'M5,5 V10' }, { k: 'path', d: 'M1,2 L1,8 L5,5 Z M9,2 L9,8 L5,5 Z M3.5,9.5 L6.5,9.5 L5,5 Z', fill: 'paper' }, { k: 'circle', cx: 5, cy: 5, r: 1.2, fill: 'ink' }],
    { ports: [W, E, { id: 'c', x: 5, y: 10, dir: 'S' }], actuatable: { defaultActuator: 'none' }, keywords: ['tre vie', 'deviatrice', 'three-way', 'diverter'] }),
  inline('valve.globe', 'Valvola a globo', 'Globe valve', 'GV',
    [through, bowtie, { k: 'circle', cx: 5, cy: 5, r: 2.4, fill: 'paper' }], { actuatable: { defaultActuator: 'manual' }, keywords: ['otturatore', 'regolazione'] }),
  inline('valve.gate', 'Valvola a saracinesca', 'Gate valve', 'GT',
    [through, bowtie], { actuatable: { defaultActuator: 'manual' }, keywords: ['saracinesca', 'gate'] }),
  inline('valve.butterfly', 'Valvola a farfalla', 'Butterfly valve', 'BF',
    [through, { k: 'circle', cx: 5, cy: 5, r: 3.5, fill: 'paper' }, { k: 'path', d: 'M5,1.5 V8.5' }], { actuatable: { defaultActuator: 'manual' }, keywords: ['farfalla', 'butterfly'] }),
  inline('valve.proportional', 'Valvola proporzionale', 'Proportional valve', 'PV',
    [through, bowtie, { k: 'path', d: 'M1.5,9.5 L8.5,0.8 M6.6,1 L8.5,0.8 L8.7,2.9' }], { actuatable: { defaultActuator: 'solenoid' }, keywords: ['regolabile', 'modulante', 'servo'] }),
  inline('valve.pyro', 'Valvola pirotecnica', 'Pyro valve', 'PYV',
    [through, bowtie, { k: 'path', d: 'M5,5 V-0.5' }, { k: 'circle', cx: 5, cy: -3, r: 2.6, fill: 'ink' }, { k: 'path', d: 'M5,-6.2 V-7.2 M1.6,-3 H0.6 M8.4,-3 H9.4 M2.6,-5.4 L1.9,-6.1 M7.4,-5.4 L8.1,-6.1' }],
    { extent: { x: 0, y: -8, w: 10, h: 18 }, avoidSides: ['N'], keywords: ['esplosiva', 'squib', 'one-shot', 'monouso'] }),
  inline('valve.needle', 'Valvola a spillo', 'Needle valve', 'NV',
    [through, bowtie], { actuatable: { defaultActuator: 'manual' }, keywords: ['regolazione', 'throttle'] }),
  inline('valve.check', 'Valvola di non ritorno', 'Check valve', 'CV',
    [through, { k: 'path', d: 'M2.5,1.5 V8.5 L7.5,5 Z', fill: 'paper' }, { k: 'path', d: 'M7.5,1.5 V8.5' }],
    { ports: [{ id: 'in', x: 0, y: 5, dir: 'W' }, { id: 'out', x: 10, y: 5, dir: 'E' }], keywords: ['unidirezionale', 'one-way'] }),
  inline('valve.check.spring', 'Valvola di non ritorno a molla', 'Spring check valve', 'CV',
    [through, { k: 'path', d: 'M2.5,1.5 V8.5 L6.5,5 Z', fill: 'paper' }, { k: 'path', d: 'M6.5,5 L7.2,3.4 L8.2,6.6 L9.2,3.4 L10,5' }],
    { ports: [{ id: 'in', x: 0, y: 5, dir: 'W' }, { id: 'out', x: 10, y: 5, dir: 'E' }], keywords: ['molla', 'cracking pressure', 'unidirezionale'] }),
  inline('valve.solenoid2', 'Elettrovalvola 2/2 (EV)', '2/2 solenoid valve (EV)', 'EV',
    [through, bowtie, ...actuatorBox('EV')], { extent: { x: 0, y: -5, w: 10, h: 15 }, avoidSides: ['N'], keywords: ['solenoide', 'on/off', 'elettrovalvola', 'ev'] }),
  {
    id: 'valve.solenoid3', name: { it: 'Elettrovalvola 3/2 (EV)', en: '3/2 solenoid valve (EV)' }, category: 'valves', w: 10, h: 10, tagPrefix: 'EV', legend: true,
    extent: { x: 0, y: -5, w: 10, h: 15 }, avoidSides: ['N'], keywords: ['solenoide', 'tre vie', 'three-way', 'elettrovalvola', 'ev'],
    ports: [W, E, { id: 'c', x: 5, y: 10, dir: 'S' }],
    prims: [through, { k: 'path', d: 'M5,5 V10' }, { k: 'path', d: 'M1,2 L1,8 L5,5 Z M9,2 L9,8 L5,5 Z M3.5,9.5 L6.5,9.5 L5,5 Z', fill: 'paper' }, ...actuatorBox('EV')],
  },
  inline('valve.servo2', 'Servovalvola 2/2 (SV)', '2/2 servo valve (SV)', 'SV',
    [through, bowtie, ...actuatorCircle('SV')], { extent: { x: 0, y: -6, w: 10, h: 16 }, avoidSides: ['N'], keywords: ['servo', 'servovalvola', 'sv', 'modulante', 'proporzionale'] }),
  {
    id: 'valve.servo3', name: { it: 'Servovalvola 3/2 (SV)', en: '3/2 servo valve (SV)' }, category: 'valves', w: 10, h: 10, tagPrefix: 'SV', legend: true,
    extent: { x: 0, y: -6, w: 10, h: 16 }, avoidSides: ['N'], keywords: ['servo', 'servovalvola', 'sv', 'tre vie', 'three-way'],
    ports: [W, E, { id: 'c', x: 5, y: 10, dir: 'S' }],
    prims: [through, { k: 'path', d: 'M5,5 V10' }, { k: 'path', d: 'M1,2 L1,8 L5,5 Z M9,2 L9,8 L5,5 Z M3.5,9.5 L6.5,9.5 L5,5 Z', fill: 'paper' }, ...actuatorCircle('SV')],
  },
  inline('valve.regulator', 'Regolatore di pressione', 'Pressure regulator', 'PRV',
    [through, bowtie, { k: 'path', d: 'M5,5 V0' }, { k: 'path', d: 'M1.5,0 A3.5,3.5 0 0 1 8.5,0 Z', fill: 'paper' }],
    { extent: { x: 0, y: -4, w: 10, h: 14 }, avoidSides: ['N'], keywords: ['riduttore', 'riduzione', 'regulator'] }),
  {
    id: 'valve.relief', name: { it: 'Valvola di sicurezza (PSV)', en: 'Relief valve (PSV)' }, category: 'valves', w: 10, h: 10, tagPrefix: 'PSV', legend: true,
    extent: { x: 0, y: -4, w: 10, h: 14 }, avoidSides: ['N'], keywords: ['sfogo', 'sovrapressione', 'safety', 'relief'],
    ports: [{ id: 'in', x: 5, y: 10, dir: 'S' }, { id: 'out', x: 10, y: 5, dir: 'E' }],
    prims: [
      { k: 'path', d: 'M5,10 V8 M5.5,5 H10' },
      { k: 'path', d: 'M3,8 L7,8 L5,4 Z', fill: 'paper' },
      { k: 'path', d: 'M5,4 V3 L3.5,2.2 L6.5,0.8 L3.5,-0.6 L6.5,-2 L5,-2.8 V-3.5' },
    ],
  },
  {
    id: 'vessel.tank', name: { it: 'Serbatoio / bombola', en: 'Tank / cylinder' }, category: 'vessels', w: 20, h: 40, tagPrefix: 'TK', legend: true,
    keywords: ['ossidante', 'bombola', 'vessel', 'bottle'],
    // tre attacchi per lato, sopra e sotto: più sensori o tubi sullo stesso serbatoio
    ports: [
      { id: 'top', x: 10, y: 0, dir: 'N' }, { id: 'bottom', x: 10, y: 40, dir: 'S' },
      { id: 'left', x: 0, y: 20, dir: 'W' }, { id: 'right', x: 20, y: 20, dir: 'E' },
      { id: 'left-up', x: 0, y: 10, dir: 'W' }, { id: 'left-down', x: 0, y: 30, dir: 'W' },
      { id: 'right-up', x: 20, y: 10, dir: 'E' }, { id: 'right-down', x: 20, y: 30, dir: 'E' },
      { id: 'top-left', x: 5, y: 0, dir: 'N' }, { id: 'top-right', x: 15, y: 0, dir: 'N' },
      { id: 'bottom-left', x: 5, y: 40, dir: 'S' }, { id: 'bottom-right', x: 15, y: 40, dir: 'S' },
    ],
    prims: [{ k: 'path', d: ROUND_V, fill: 'paper' }],
    labelInside: { x: 10, y: 20, size: 2.5 },
  },
  {
    id: 'vessel.copv', name: { it: 'Bombola composita (COPV)', en: 'Composite bottle (COPV)' }, category: 'vessels', w: 20, h: 40, tagPrefix: 'CB', legend: true,
    keywords: ['copv', 'carbonio', 'composite', 'pressurizzante'],
    ports: [
      { id: 'top', x: 10, y: 0, dir: 'N' }, { id: 'bottom', x: 10, y: 40, dir: 'S' },
      { id: 'left', x: 0, y: 20, dir: 'W' }, { id: 'right', x: 20, y: 20, dir: 'E' },
      { id: 'left-up', x: 0, y: 10, dir: 'W' }, { id: 'left-down', x: 0, y: 30, dir: 'W' },
      { id: 'right-up', x: 20, y: 10, dir: 'E' }, { id: 'right-down', x: 20, y: 30, dir: 'E' },
      { id: 'top-left', x: 5, y: 0, dir: 'N' }, { id: 'top-right', x: 15, y: 0, dir: 'N' },
      { id: 'bottom-left', x: 5, y: 40, dir: 'S' }, { id: 'bottom-right', x: 15, y: 40, dir: 'S' },
    ],
    prims: [
      { k: 'path', d: ROUND_V, fill: 'paper' },
      { k: 'path', d: 'M2.2,5.2 A3,3 0 0 1 5.2,2.2 H14.8 A3,3 0 0 1 17.8,5.2 V34.8 A3,3 0 0 1 14.8,37.8 H5.2 A3,3 0 0 1 2.2,34.8 Z' },
    ],
    labelInside: { x: 10, y: 20, size: 2.5 },
  },
  {
    id: 'vessel.horizontal', name: { it: 'Serbatoio orizzontale', en: 'Horizontal tank' }, category: 'vessels', w: 40, h: 20, tagPrefix: 'TK', legend: true,
    keywords: ['cilindrico', 'orizzontale', 'horizontal'],
    ports: [
      { id: 'left', x: 0, y: 10, dir: 'W' }, { id: 'right', x: 40, y: 10, dir: 'E' },
      { id: 'top', x: 20, y: 0, dir: 'N' }, { id: 'bottom', x: 20, y: 20, dir: 'S' },
      { id: 'top-left', x: 10, y: 0, dir: 'N' }, { id: 'top-right', x: 30, y: 0, dir: 'N' },
      { id: 'bottom-left', x: 10, y: 20, dir: 'S' }, { id: 'bottom-right', x: 30, y: 20, dir: 'S' },
      { id: 'left-up', x: 0, y: 5, dir: 'W' }, { id: 'left-down', x: 0, y: 15, dir: 'W' },
      { id: 'right-up', x: 40, y: 5, dir: 'E' }, { id: 'right-down', x: 40, y: 15, dir: 'E' },
    ],
    prims: [{ k: 'path', d: ROUND_H, fill: 'paper' }],
    labelInside: { x: 20, y: 10, size: 2.5 },
  },
  bubble('instr.pt', 'Trasduttore di pressione', 'Pressure transducer', 'PT', ['sensore', 'pressione', 'sensor', 'trasduttore', 'analogico', '4-20', '0-5', 'ratiometrico'], { options: SIGNAL_OPTIONS }),
  bubble('instr.pdt', 'Trasduttore di pressione differenziale', 'Differential pressure transducer', 'PDT', ['differenziale', 'delta', 'dp', 'caduta', 'differential'], {
    ports: [{ id: 'high', x: 0, y: 5, dir: 'W' }, { id: 'low', x: 10, y: 5, dir: 'E' }], options: SIGNAL_OPTIONS,
  }),
  bubble('instr.pi', 'Manometro a quadrante', 'Dial pressure gauge', 'PI', ['indicatore', 'gauge', 'manometro', 'analogico', 'lancetta']),
  bubble('instr.ti', 'Termometro a quadrante', 'Dial thermometer', 'TI', ['temperatura', 'termometro', 'analogico', 'lancetta']),
  bubble('instr.tt', 'Termocoppia (TC)', 'Thermocouple (TC)', 'TC', ['temperatura', 'termocoppia', 'thermocouple', 'tc', 'sensore temperatura', 'rtd', 'pt100'], { options: [SIGNAL_OPTIONS[0]] }),
  bubble('instr.ft', 'Flussimetro', 'Flow meter', 'FT', ['portata', 'flow'], { options: [SIGNAL_OPTIONS[0]] }),
  bubble('instr.ps', 'Pressostato', 'Pressure switch', 'PS', ['soglia', 'switch']),
  bubble('instr.wt', 'Cella di carico (LC)', 'Load cell (LC)', 'LC', ['peso', 'spinta', 'thrust', 'bilancia', 'lc', 'wt', 'load cell'], { options: [SIGNAL_OPTIONS[0]] }),
  bubble('instr.lt', 'Sensore di livello', 'Level sensor', 'LT', ['livello', 'level'], { options: [SIGNAL_OPTIONS[0]] }),
  inline('fitting.filter', 'Filtro', 'Filter', 'FL',
    [through, { k: 'rect', x: 2, y: 2, w: 6, h: 6, fill: 'paper' }, { k: 'path', d: 'M2,8 L8,2' }], {}, 'fittings'),
  inline('fitting.orifice', 'Orifizio calibrato', 'Calibrated orifice', 'RO',
    [{ k: 'path', d: 'M0,5 H10 M5,1 V4 M5,6 V9' }], { keywords: ['restrizione', 'restriction'] }, 'fittings'),
  inline('fitting.reducer', 'Riduzione', 'Reducer', 'RD',
    [{ k: 'path', d: 'M0,5 H2 M8,5 H10' }, { k: 'path', d: 'M2,1.5 L8,3.5 V6.5 L2,8.5 Z', fill: 'paper' }], { keywords: ['riduttore diametro', 'adattatore'] }, 'fittings'),
  inline('fitting.flange', 'Flangia / giunto', 'Flange / union', 'FG',
    [{ k: 'path', d: 'M0,5 H3.5 M6.5,5 H10 M3.5,2 V8 M6.5,2 V8' }], { keywords: ['unione', 'union', 'connessione'] }, 'fittings'),
  inline('fitting.hose', 'Tubo flessibile', 'Flexible hose', 'HS',
    [{ k: 'path', d: 'M0,5 H2 L3,2 L5,8 L7,2 L8,5 H10' }], { keywords: ['flex', 'treccia', 'hose'] }, 'fittings'),
  inline('fitting.burst', 'Disco di rottura', 'Burst disc', 'BD',
    [{ k: 'path', d: 'M0,5 H3.5 M6.5,5 H10 M3.5,1.5 V8.5 M6.5,1.5 V8.5' }, { k: 'path', d: 'M4.2,2.5 Q7.4,5 4.2,7.5' }], { keywords: ['rupture', 'sicurezza', 'sovrapressione'] }, 'fittings'),
  inline('fitting.qd', 'Attacco rapido (quick disconnect)', 'Quick disconnect', 'QD',
    [], {
      keywords: ['sgancio rapido', 'coupling', 'fill', 'riempimento', 'giunto', 'disconnect', 'quick', 'maschio', 'femmina', 'autosigillante'],
      options: [
        { key: 'seal', label: { it: 'Tenuta', en: 'Sealing' }, default: 'both', choices: [
          { id: 'both', label: { it: 'Autosigillante (valvola su entrambe le metà)', en: 'Self-sealing (valve on both halves)' } },
          { id: 'one', label: { it: 'Valvola su una sola metà', en: 'Valve on one half only' } },
          { id: 'none', label: { it: 'Senza valvole (aperto)', en: 'No valves (open)' } },
        ] },
        { key: 'state', label: { it: 'Stato', en: 'State' }, default: 'connected', choices: [
          { id: 'connected', label: { it: 'Collegato', en: 'Connected' } },
          { id: 'disconnected', label: { it: 'Scollegato', en: 'Disconnected' } },
        ] },
      ],
      variantPrims: qdPrims,
    }, 'fittings'),
  {
    id: 'fitting.cap', name: { it: 'Tappo', en: 'Cap / plug' }, category: 'fittings', w: 10, h: 10, tagPrefix: 'CP', legend: true,
    ports: [{ id: 'a', x: 0, y: 5, dir: 'W' }], prims: [{ k: 'path', d: 'M0,5 H6 M6,2 V8' }],
  },
  {
    id: 'fitting.vent', name: { it: 'Sfiato in atmosfera', en: 'Vent to atmosphere' }, category: 'fittings', w: 10, h: 10, tagPrefix: 'VT', legend: true,
    keywords: ['scarico', 'atmosfera', 'drain'],
    ports: [{ id: 'a', x: 0, y: 5, dir: 'W' }], prims: [{ k: 'path', d: 'M0,5 H5 M5,5 L9,2 M5,5 L9,8' }],
  },
  {
    id: 'fitting.junction', name: { it: 'Giunzione a T / croce', en: 'T / cross junction' }, category: 'fittings', w: 10, h: 10, tagPrefix: 'J', legend: false,
    keywords: ['raccordo', 'tee', 'cross'],
    // tutte le porte coincidono col centro: le linee si incontrano lì
    ports: [
      { id: 'n', x: 5, y: 5, dir: 'N' }, { id: 'e', x: 5, y: 5, dir: 'E' },
      { id: 's', x: 5, y: 5, dir: 'S' }, { id: 'w', x: 5, y: 5, dir: 'W' },
    ],
    prims: [{ k: 'circle', cx: 5, cy: 5, r: 0.9, fill: 'ink' }],
  },
  {
    id: 'engine.igniter', name: { it: 'Ignitore / candela', en: 'Igniter / spark plug' }, category: 'engine', w: 10, h: 10, tagPrefix: 'IG', legend: true,
    keywords: ['accensione', 'candela', 'squib', 'igniter'],
    ports: [{ id: 'a', x: 0, y: 5, dir: 'W' }],
    prims: [{ k: 'path', d: 'M0,5 H3' }, { k: 'circle', cx: 6, cy: 5, r: 3, fill: 'paper' }, { k: 'path', d: 'M6.6,2.8 L5,5.2 H7 L5.4,7.4' }],
  },
  {
    id: 'engine.injector', name: { it: 'Iniettore', en: 'Injector' }, category: 'engine', w: 20, h: 10, tagPrefix: 'INJ', legend: true,
    ports: [{ id: 'in', x: 0, y: 5, dir: 'W' }, { id: 'out', x: 20, y: 5, dir: 'E' }],
    prims: [
      { k: 'path', d: 'M0,5 H6 M9,2 H20 M9,5 H20 M9,8 H20' },
      { k: 'rect', x: 6, y: 0, w: 3, h: 10, fill: 'paper' },
    ],
  },
  {
    id: 'engine.chamber', name: { it: 'Camera di combustione e ugello', en: 'Combustion chamber & nozzle' }, category: 'engine', w: 40, h: 20, tagPrefix: 'CC', legend: true,
    keywords: ['motore', 'ugello', 'nozzle', 'chamber'],
    // prese per i sensori (pressione, temperatura…) sulla parte cilindrica e sul fondello; l'iniettore va su 'in'
    ports: [
      { id: 'in', x: 0, y: 10, dir: 'W' },
      { id: 'top-left', x: 5, y: 0, dir: 'N' }, { id: 'top', x: 10, y: 0, dir: 'N' }, { id: 'top-right', x: 15, y: 0, dir: 'N' },
      { id: 'bottom-left', x: 5, y: 20, dir: 'S' }, { id: 'bottom', x: 10, y: 20, dir: 'S' }, { id: 'bottom-right', x: 15, y: 20, dir: 'S' },
      { id: 'head-up', x: 0, y: 5, dir: 'W' }, { id: 'head-down', x: 0, y: 15, dir: 'W' },
    ],
    prims: [{ k: 'path', d: 'M0,0 H20 L28,7 H34 L40,2 M0,20 H20 L28,13 H34 L40,18 M0,0 V20', fill: 'none' }],
    labelInside: { x: 10, y: 10, size: 2.5 },
  },
]

export const ALL_SYMBOLS: readonly SymbolDef[] = SYMBOLS
export const SYMBOL_LIBRARY: ReadonlyMap<string, SymbolDef> = new Map(SYMBOLS.map((s) => [s.id, s]))

export function getSymbol(id: string): SymbolDef {
  const s = SYMBOL_LIBRARY.get(id)
  if (!s) throw new Error(`Simbolo sconosciuto: ${id}`)
  return s
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Ricerca per nome (IT/EN), sigla del tag, categoria e sinonimi; ogni parola cercata deve comparire. */
export function searchSymbols(query: string): SymbolDef[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return [...SYMBOLS]
  return SYMBOLS.filter((s) => {
    const hay = norm([s.name.it, s.name.en, s.tagPrefix, CATEGORY_NAMES[s.category].it, CATEGORY_NAMES[s.category].en, ...(s.keywords ?? [])].join(' '))
    return words.every((w) => hay.includes(w))
  })
}
