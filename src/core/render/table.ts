import { INK, lineEl, n, rectEl, textWidth } from './svg'

/** Table drawing shared by the bill of materials, the valve states and the legend: every line lands exactly on the cell borders. */
export const GRID_PAD = 1.8
const GRID_LINE = 0.2
const GRID_COLOR = '#8c8c8c'
const HEAD_FILL = '#e9ecef'
const GROUP_FILL = '#dfe3e8'

export interface GridSpec {
  x: number
  top: number
  /** column widths (mm) */
  widths: number[]
  headH: number
  rowH: number
  /** one entry per body row; `span` = full-width row (group header), no column lines */
  rows: { span?: boolean }[]
}

export interface Grid {
  svg: string
  /** left edge of each column */
  colX: number[]
  /** top of body row i */
  rowY: (i: number) => number
  bottom: number
  width: number
}

export function renderGrid(g: GridSpec): Grid {
  const colX: number[] = []
  let cx = g.x
  for (const w of g.widths) { colX.push(cx); cx += w }
  const width = cx - g.x
  const rowY = (i: number) => g.top + g.headH + i * g.rowH
  const bottom = rowY(g.rows.length)
  let s = `<rect x="${n(g.x)}" y="${n(g.top)}" width="${n(width)}" height="${n(g.headH)}" fill="${HEAD_FILL}"/>`
  g.rows.forEach((r, i) => {
    if (r.span) s += `<rect x="${n(g.x)}" y="${n(rowY(i))}" width="${n(width)}" height="${n(g.rowH)}" fill="${GROUP_FILL}"/>`
  })
  // horizontal lines between rows (the one under the header is stronger)
  s += lineEl(g.x, g.top + g.headH, g.x + width, g.top + g.headH, 0.4, INK)
  for (let i = 1; i < g.rows.length; i++) s += lineEl(g.x, rowY(i), g.x + width, rowY(i), GRID_LINE, GRID_COLOR)
  // column lines, row by row so that they stop at the span rows; consecutive segments join without gaps
  for (let c = 1; c < g.widths.length; c++) {
    s += lineEl(colX[c], g.top, colX[c], g.top + g.headH, GRID_LINE, GRID_COLOR)
    g.rows.forEach((r, i) => { if (!r.span) s += lineEl(colX[c], rowY(i), colX[c], rowY(i) + g.rowH, GRID_LINE, GRID_COLOR) })
  }
  s += rectEl(g.x, g.top, width, bottom - g.top, 0.5)
  return { svg: s, colX, rowY, bottom, width }
}

/** Truncates with an ellipsis so the text fits `maxW` mm. */
export function fitText(s: string, maxW: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxW) return s
  let out = s
  while (out.length > 1 && textWidth(out + '…', size, bold) > maxW) out = out.slice(0, -1)
  return out.trimEnd() + '…'
}

/** Wraps on spaces into at most `maxLines` lines no wider than `maxW` mm; the last line is truncated if needed. */
export function wrapToWidth(s: string, maxW: number, size: number, maxLines: number, bold = false): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word
    if (cur && textWidth(next, size, bold) > maxW) { lines.push(cur); cur = word } else cur = next
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = fitText(lines.slice(maxLines - 1).join(' '), maxW, size, bold)
    return kept.map((l) => fitText(l, maxW, size, bold))
  }
  return lines.map((l) => fitText(l, maxW, size, bold))
}
