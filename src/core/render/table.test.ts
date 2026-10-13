import { describe, expect, it } from 'vitest'
import { bomRowsPerPage } from './bom'
import { layoutFor } from './layout'
import { fitText, renderGrid, wrapToWidth } from './table'
import { textWidth } from './svg'

describe('export tables', () => {
  it('a full page of rows ends above the title block on every format', () => {
    for (const f of ['A4', 'A3', 'A2'] as const) {
      const layout = layoutFor(f, true)
      const rows = bomRowsPerPage(layout)
      const g = renderGrid({ x: 14, top: layout.drawing.y + 16, widths: [30, 100], headH: 9, rowH: 8.5, rows: Array.from({ length: rows }, () => ({})) })
      expect(g.bottom).toBeLessThanOrEqual(layout.titleBlock.y - 2)
    }
  })

  it('column lines stop at full-width rows and every line lands on a cell border', () => {
    const g = renderGrid({ x: 10, top: 20, widths: [20, 30], headH: 8, rowH: 8, rows: [{ span: true }, {}] })
    const verticals = [...g.svg.matchAll(/<line x1="30" y1="([\d.]+)" x2="30" y2="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(verticals).toEqual([[20, 28], [36, 44]]) // header and second row, not the span row
  })

  it('wraps and truncates texts to the cell width', () => {
    expect(textWidth(fitText('Attacco rapido (quick disconnect)', 30, 3), 3)).toBeLessThanOrEqual(30)
    const lines = wrapToWidth('Attacco rapido (quick disconnect)', 30, 3, 2)
    expect(lines.length).toBeLessThanOrEqual(2)
    for (const l of lines) expect(textWidth(l, 3)).toBeLessThanOrEqual(30)
  })
})
