import { z } from 'zod'

/** Testo bilingue: l'interfaccia è italiana, ma ogni testo esportato esiste in IT e EN. */
export const L10nSchema = z.object({ it: z.string(), en: z.string() })
export type L10n = z.infer<typeof L10nSchema>
export type Lang = keyof L10n

export const FLUID_IDS = ['oxidizer', 'fuel', 'pressurant', 'vent', 'pneumatic', 'signal'] as const
export const FluidIdSchema = z.enum(FLUID_IDS)
export type FluidId = z.infer<typeof FluidIdSchema>

export const RotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])

export const PointSchema = z.object({ x: z.number(), y: z.number() })

export const PortRefSchema = z.object({ componentId: z.string(), portId: z.string() })
export type PortRef = z.infer<typeof PortRefSchema>

export const ComponentSchema = z.object({
  id: z.string(),
  /** id del simbolo in libreria */
  symbol: z.string(),
  /** tag di impianto, es. SV-101 (indipendente dalla lingua) */
  tag: z.string(),
  /** posizione del CENTRO del simbolo, in mm sul foglio */
  x: z.number(),
  y: z.number(),
  rotation: RotationSchema.default(0),
  mirror: z.boolean().default(false),
  description: L10nSchema.optional(),
  /** stato delle valvole per fase di missione (id fase → aperta/chiusa) */
  states: z.record(z.string(), z.enum(['open', 'closed'])).optional(),
  /** proprietà tecniche libere: MAWP, Cv, diametro, NA/NC, ... */
  props: z.record(z.string(), z.string()).default({}),
})
export type Component = z.infer<typeof ComponentSchema>

export const LineSchema = z.object({
  id: z.string(),
  fluid: FluidIdSchema,
  from: PortRefSchema,
  to: PortRefSchema,
  /** diametro/attacco mostrato sulla linea, es. 1/4" */
  size: z.string().optional(),
  /** pressione di esercizio in bar (per i controlli di compatibilità) */
  pressure: z.string().optional(),
  /** percorso manuale; se assente viene calcolato automaticamente */
  route: z.array(PointSchema).optional(),
})
export type Line = z.infer<typeof LineSchema>

export const SheetFormatSchema = z.enum(['A4', 'A3', 'A2'])
export type SheetFormat = z.infer<typeof SheetFormatSchema>

export const TONES = ['neutral', 'blue', 'amber', 'green', 'red'] as const
export type Tone = (typeof TONES)[number]

/** Testi liberi e riquadri di zona (es. «lato volo», «GSE»): documentano lo schema senza far parte dell'impianto. */
export const AnnotationSchema = z.object({
  id: z.string(),
  kind: z.enum(['text', 'box']),
  /** angolo in alto a sinistra, mm */
  x: z.number(),
  y: z.number(),
  w: z.number().default(60),
  h: z.number().default(40),
  /** testo (per il riquadro: l'etichetta nell'angolo) */
  text: L10nSchema,
  size: z.number().default(3.5),
  bold: z.boolean().default(false),
  tone: z.enum(TONES).default('neutral'),
  /** testo con cornice / riquadro con tinta di fondo */
  framed: z.boolean().default(false),
})
export type Annotation = z.infer<typeof AnnotationSchema>

/** Il disegno vive su un canvas infinito: l'impaginazione esiste solo in esportazione. */
export const DrawingSchema = z.object({
  components: z.array(ComponentSchema).default([]),
  lines: z.array(LineSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
})
export type Drawing = z.infer<typeof DrawingSchema>

export const ExportModeSchema = z.enum(['auto', 'fit', 'split'])
export type ExportMode = z.infer<typeof ExportModeSchema>

export const ExportSettingsSchema = z.object({
  format: SheetFormatSchema.default('A3'),
  /** auto: 1:1 se ci sta, poi riduce fino a un limite leggibile, altrimenti divide in più fogli */
  mode: ExportModeSchema.default('auto'),
  lang: z.enum(['it', 'en']).default('it'),
  color: z.boolean().default(true),
  legend: z.boolean().default(true),
  bom: z.boolean().default(true),
  /** tabella degli stati delle valvole per fase (se ci sono fasi) */
  states: z.boolean().default(true),
})
export type ExportSettings = z.infer<typeof ExportSettingsSchema>

export const RevisionSchema = z.object({
  rev: z.string(),
  date: z.string(),
  description: L10nSchema,
  author: z.string().default(''),
})

export const MetaSchema = z.object({
  title: L10nSchema,
  subtitle: L10nSchema.optional(),
  company: z.string().default(''),
  drawingNo: z.string().default(''),
  revision: z.string().default('A'),
  date: z.string().default(''),
  drawnBy: z.string().default(''),
  checkedBy: z.string().default(''),
})

export const PhaseSchema = z.object({ id: z.string(), name: L10nSchema })
export type Phase = z.infer<typeof PhaseSchema>
export type ValveState = 'open' | 'closed'

export const DocumentSchema = z.object({
  version: z.literal(2),
  meta: MetaSchema,
  revisions: z.array(RevisionSchema).default([]),
  drawing: DrawingSchema,
  phases: z.array(PhaseSchema).default([]),
  export: ExportSettingsSchema.prefault({}),
})
export type FluidDocument = z.infer<typeof DocumentSchema>
