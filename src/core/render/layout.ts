import type { SheetFormat } from '../types'

export interface Rect { x: number; y: number; w: number; h: number }

export const PAGE: Record<SheetFormat, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
}

const MARGIN = 10
const TITLEBLOCK = { w: 170, h: 36 }
const LEGEND_W = 70

export interface PageLayout {
  page: { w: number; h: number }
  frame: Rect
  /** area utile per il disegno */
  drawing: Rect
  /** colonna della legenda (assente se la legenda è disattivata) */
  legend: Rect | null
  titleBlock: Rect
  revisions: Rect
}

/** Impaginazione di un foglio orizzontale. */
export function layoutFor(format: SheetFormat, withLegend: boolean): PageLayout {
  const page = PAGE[format]
  const frame = { x: MARGIN, y: MARGIN, w: page.w - 2 * MARGIN, h: page.h - 2 * MARGIN }
  const titleBlock = { x: frame.x + frame.w - TITLEBLOCK.w, y: frame.y + frame.h - TITLEBLOCK.h, ...TITLEBLOCK }
  const bodyH = frame.h - TITLEBLOCK.h
  const legendW = withLegend ? LEGEND_W : 0
  return {
    page,
    frame,
    drawing: { x: frame.x, y: frame.y, w: frame.w - legendW, h: bodyH },
    legend: withLegend ? { x: frame.x + frame.w - LEGEND_W, y: frame.y, w: LEGEND_W, h: bodyH } : null,
    titleBlock,
    revisions: { x: frame.x, y: titleBlock.y, w: titleBlock.x - frame.x, h: TITLEBLOCK.h },
  }
}
