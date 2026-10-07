import { z } from 'zod'

/** Bilingual text: the interface follows the system language, but every exported text exists in IT and EN. */
const L10nSchema = z.object({ it: z.string(), en: z.string() })
export type L10n = z.infer<typeof L10nSchema>
export type Lang = keyof L10n

export const FLUID_IDS = ['oxidizer', 'fuel', 'pressurant', 'vent', 'pneumatic', 'signal'] as const
const FluidIdSchema = z.enum(FLUID_IDS)
export type FluidId = z.infer<typeof FluidIdSchema>

const RotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])

const PointSchema = z.object({ x: z.number(), y: z.number() })

const PortRefSchema = z.object({ componentId: z.string(), portId: z.string() })
export type PortRef = z.infer<typeof PortRefSchema>

const ComponentSchema = z.object({
  id: z.string(),
  /** symbol id in the library */
  symbol: z.string(),
  /** plant tag, e.g. SV-101 (language independent) */
  tag: z.string(),
  /** position of the symbol's CENTER, in mm on the sheet */
  x: z.number(),
  y: z.number(),
  rotation: RotationSchema.default(0),
  mirror: z.boolean().default(false),
  description: L10nSchema.optional(),
  /** valve states per operating phase (phase id → open/closed) */
  states: z.record(z.string(), z.enum(['open', 'closed'])).optional(),
  /** free technical properties: MAWP, Cv, size, NO/NC, ... */
  props: z.record(z.string(), z.string()).default({}),
})
export type Component = z.infer<typeof ComponentSchema>

const LineSchema = z.object({
  id: z.string(),
  fluid: FluidIdSchema,
  from: PortRefSchema,
  to: PortRefSchema,
  /** size/connection shown on the line, e.g. 1/4" */
  size: z.string().optional(),
  /** operating pressure in bar (for compatibility checks) */
  pressure: z.string().optional(),
  /** manual route; if absent it is computed automatically */
  route: z.array(PointSchema).optional(),
})
export type Line = z.infer<typeof LineSchema>

const SheetFormatSchema = z.enum(['A4', 'A3', 'A2'])
export type SheetFormat = z.infer<typeof SheetFormatSchema>

export const TONES = ['neutral', 'blue', 'amber', 'green', 'red'] as const
export type Tone = (typeof TONES)[number]

/** Free texts and zone boxes (e.g. "flight side", "GSE"): they document the diagram without being part of the plant. */
const AnnotationSchema = z.object({
  id: z.string(),
  kind: z.enum(['text', 'box']),
  /** angolo in alto a sinistra, mm */
  x: z.number(),
  y: z.number(),
  w: z.number().default(60),
  h: z.number().default(40),
  /** text (for the box: the label in the corner) */
  text: L10nSchema,
  size: z.number().default(3.5),
  bold: z.boolean().default(false),
  tone: z.enum(TONES).default('neutral'),
  /** text with frame / box with background tint */
  framed: z.boolean().default(false),
})
export type Annotation = z.infer<typeof AnnotationSchema>

/** The drawing lives on an infinite canvas: layout exists only at export. */
const DrawingSchema = z.object({
  components: z.array(ComponentSchema).default([]),
  lines: z.array(LineSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
})
export type Drawing = z.infer<typeof DrawingSchema>

const ExportModeSchema = z.enum(['auto', 'fit', 'split'])
export type ExportMode = z.infer<typeof ExportModeSchema>

const ExportSettingsSchema = z.object({
  format: SheetFormatSchema.default('A3'),
  /** auto: 1:1 if it fits, then shrinks down to a readable limit, otherwise splits over several sheets */
  mode: ExportModeSchema.default('auto'),
  lang: z.enum(['it', 'en']).default('it'),
  color: z.boolean().default(true),
  legend: z.boolean().default(true),
  bom: z.boolean().default(true),
  /** valve states table per phase (if there are phases) */
  states: z.boolean().default(true),
})
export type ExportSettings = z.infer<typeof ExportSettingsSchema>

const RevisionSchema = z.object({
  rev: z.string(),
  date: z.string(),
  description: L10nSchema,
  author: z.string().default(''),
})

const MetaSchema = z.object({
  title: L10nSchema,
  subtitle: L10nSchema.optional(),
  company: z.string().default(''),
  drawingNo: z.string().default(''),
  revision: z.string().default('A'),
  date: z.string().default(''),
  drawnBy: z.string().default(''),
  checkedBy: z.string().default(''),
})

const PhaseSchema = z.object({ id: z.string(), name: L10nSchema })
export type Phase = z.infer<typeof PhaseSchema>
export type ValveState = 'open' | 'closed'

/** Manual edits to the bill of materials: the fields present replace those generated from the drawing. */
const BomOverrideSchema = z.object({
  description: L10nSchema.partial().optional(),
  type: L10nSchema.partial().optional(),
  note: L10nSchema.partial().optional(),
  size: z.string().optional(),
  pmax: z.string().optional(),
  /** group chosen by hand (id); without it, the component type's group applies */
  group: z.string().optional(),
})
export type BomOverride = z.infer<typeof BomOverrideSchema>

/** Hand-added row (material that is not a drawing component: pipes, fittings, screws…). */
const BomExtraSchema = z.object({
  id: z.string(),
  tag: z.string().default(''),
  description: L10nSchema.default({ it: '', en: '' }),
  type: L10nSchema.default({ it: '', en: '' }),
  size: z.string().default(''),
  pmax: z.string().default(''),
  note: L10nSchema.default({ it: '', en: '' }),
  /** group id; "Other" by default */
  group: z.string().default('misc'),
})

const BomSchema = z.object({
  /** by component id */
  overrides: z.record(z.string(), BomOverrideSchema).default({}),
  /** components excluded from the bill of materials */
  hidden: z.array(z.string()).default([]),
  extra: z.array(BomExtraSchema).default([]),
  /** bill of materials split into groups with a header (on screen and in the PDF) */
  grouped: z.boolean().default(true),
  /** hand-made groups; those by component type (cat:valves, …) and "misc" already exist */
  groups: z.array(z.object({ id: z.string(), name: L10nSchema })).default([]),
  /** nomi cambiati ai gruppi predefiniti */
  renames: z.record(z.string(), L10nSchema.partial()).default({}),
  /** group order (ids); those not listed follow the default order */
  order: z.array(z.string()).default([]),
})
export type BomConfig = z.infer<typeof BomSchema>

/** Diagram checks: suggestions (trappable volumes, sizes) are off until you turn them on; warnings you ignore stay ignored. */
const ChecksSchema = z.object({
  hints: z.boolean().default(false),
  dismissed: z.array(z.string()).default([]),
})

export const DocumentSchema = z.object({
  version: z.literal(2),
  meta: MetaSchema,
  revisions: z.array(RevisionSchema).default([]),
  drawing: DrawingSchema,
  phases: z.array(PhaseSchema).default([]),
  export: ExportSettingsSchema.prefault({}),
  bom: BomSchema.prefault({}),
  checks: ChecksSchema.prefault({}),
})
export type FluidDocument = z.infer<typeof DocumentSchema>
