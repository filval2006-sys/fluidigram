import { t } from '../i18n'
import type { FluidDocument, Lang } from '../types'
import type { PageLayout } from './layout'
import { lineEl, rectEl, textEl } from './svg'

function cell(x: number, y: number, w: number, h: number, label: string, value: string, valueSize = 3.2, bold = false): string {
  return (
    rectEl(x, y, w, h, 0.25) +
    textEl(x + 1.2, y + 2, label, { size: 1.9, anchor: 'start', color: '#555' }) +
    (value ? textEl(x + 1.2, y + h - 4.2, value, { size: valueSize, anchor: 'start', bold }) : '')
  )
}

export interface TitleBlockInfo {
  /** numero del foglio (da 1) e totale */
  index: number
  total: number
  scaleText: string
  /** sostituisce il sottotitolo (es. "Distinta componenti") */
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
  s += textEl(x + 1.2, y + 2, t('title', lang), { size: 1.9, anchor: 'start', color: '#555' })
  s += textEl(x + 1.2, y + 8, title, { size: 5, anchor: 'start', bold: true })
  if (subtitle) s += textEl(x + 1.2, y + 14.2, subtitle, { size: 3, anchor: 'start', color: '#333' })
  s += cell(x + 110, y, 60, half, t('drawingNo', lang), m.drawingNo, 4.2, true)

  // riga 2: celle di servizio
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
    s += cell(cx, y + half, widths[i], half, label, value, 3, bold)
    cx += widths[i]
  })
  return s
}

/** Tabella delle revisioni a sinistra del cartiglio (ultime 4, la più recente in basso). */
export function renderRevisionTable(doc: FluidDocument, layout: PageLayout, lang: Lang): string {
  const { x, y, w, h } = layout.revisions
  const rowH = h / 5
  const cols = [12, 22, w - 12 - 22 - 28, 28]
  const heads = [t('revision', lang), t('date', lang), t('description', lang), t('author', lang)]
  let s = rectEl(x, y, w, h, 0.5)
  s += lineEl(x, y + rowH, x + w, y + rowH, 0.25)
  let cx = x
  cols.forEach((cw, i) => {
    if (i > 0) s += lineEl(cx, y, cx, y + h, 0.25)
    s += textEl(cx + 1.2, y + rowH / 2, heads[i], { size: 1.9, anchor: 'start', color: '#555' })
    cx += cw
  })
  doc.revisions.slice(-4).forEach((r, row) => {
    const ty = y + rowH * (row + 1.5)
    const vals = [r.rev, r.date, r.description[lang], r.author]
    let vx = x
    vals.forEach((v, i) => {
      s += textEl(vx + 1.2, ty, v, { size: 2.6, anchor: 'start' })
      vx += cols[i]
    })
    if (row > 0) s += lineEl(x, y + rowH * (row + 1), x + w, y + rowH * (row + 1), 0.15, '#999')
  })
  return s
}
