import { t } from '../i18n'
import type { FluidDocument, Lang } from '../types'
import type { PageLayout } from './layout'
import { lineEl, rectEl, textEl } from './svg'
import { fitText } from './table'

function cell(x: number, y: number, w: number, h: number, label: string, value: string, valueSize = 3.6, bold = false): string {
  return (
    rectEl(x, y, w, h, 0.25) +
    textEl(x + 1.2, y + 2, label, { size: 2.3, anchor: 'start', color: '#555' }) +
    (value ? textEl(x + 1.2, y + h - 4.2, value, { size: valueSize, anchor: 'start', bold }) : '')
  )
}

export interface TitleBlockInfo {
  /** sheet number (from 1) and total */
  index: number
  total: number
  scaleText: string
  /** replaces the subtitle (e.g. "Bill of materials") */
  subtitle?: string
}

export function renderTitleBlock(doc: FluidDocument, layout: PageLayout, lang: Lang, info: TitleBlockInfo): string {
  const { x, y, w, h } = layout.titleBlock
  const m = doc.meta
  const half = h / 2
  const title = m.title[lang]
  const subtitle = info.subtitle ?? m.subtitle?.[lang] ?? ''

  let s = rectEl(x, y, w, h, 0.7, '#fff')
  // riga 1: titolo + numero disegno
  s += rectEl(x, y, 110, half, 0.25)
  s += textEl(x + 1.2, y + 2, t('title', lang), { size: 2.3, anchor: 'start', color: '#555' })
  const titleSize = Math.max(3.4, Math.min(5, 107 / Math.max(1, title.length * 0.62)))
  s += textEl(x + 1.2, y + 8, fitText(title, 107, titleSize, true), { size: Math.round(titleSize * 100) / 100, anchor: 'start', bold: true })
  if (subtitle) s += textEl(x + 1.2, y + 14.2, subtitle, { size: 3.6, anchor: 'start', color: '#333' })
  s += cell(x + 110, y, 60, half, t('drawingNo', lang), m.drawingNo, 4.6, true)

  // row 2: service cells
  const widths = [50, 15, 25, 25, 25, 15, 15]
  const cells: [string, string, boolean][] = [
    [t('company', lang), m.company, true],
    [t('revision', lang), m.revision, true],
    [t('date', lang), m.date, false],
    [t('drawnBy', lang), m.drawnBy, false],
    [t('checkedBy', lang), m.checkedBy, false],
    [t('scale', lang), info.scaleText, false],
    [t('sheet', lang), `${info.index}/${info.total}`, false],
  ]
  let cx = x
  cells.forEach(([label, value, bold], i) => {
    s += cell(cx, y + half, widths[i], half, label, value, 3.4, bold)
    cx += widths[i]
  })
  return s
}

/** Revisions table to the left of the title block (last 4, the most recent at the bottom). */
export function renderRevisionTable(doc: FluidDocument, layout: PageLayout, lang: Lang): string {
  const { x, y, w, h } = layout.revisions
  const rowH = h / 5
  const cols = [12, 22, w - 12 - 22 - 28, 28]
  const heads = [t('revision', lang), t('date', lang), t('description', lang), t('author', lang)]
  // same 0.7 mm outline as the title block next to it, so the shared edge has no step
  let s = rectEl(x, y, w, h, 0.7)
  for (let r = 1; r < 5; r++) s += lineEl(x, y + rowH * r, x + w, y + rowH * r, 0.25)
  let cx = x
  cols.forEach((cw, i) => {
    if (i > 0) s += lineEl(cx, y, cx, y + h, 0.25)
    s += textEl(cx + 1.2, y + rowH / 2, heads[i], { size: 2.3, anchor: 'start', color: '#555' })
    cx += cw
  })
  doc.revisions.slice(-4).forEach((r, row) => {
    const ty = y + rowH * (row + 1.5)
    const vals = [r.rev, r.date, r.description[lang], r.author]
    let vx = x
    vals.forEach((v, i) => {
      s += textEl(vx + 1.2, ty, fitText(v, cols[i] - 2.4, 3), { size: 3, anchor: 'start' })
      vx += cols[i]
    })
  })
  return s
}
