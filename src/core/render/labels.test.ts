import { describe, expect, it } from 'vitest'
import { lineWidth } from '../fluids'
import { lineRoute } from '../scene'
import { SAMPLE_DOCUMENT } from '../sample'
import { LINE_LABEL_SIZE, TAG_SIZE, planLabels, textFactor, textWidth } from './labels'

describe('label planning', () => {
  const d = SAMPLE_DOCUMENT.drawing

  it('keeps every line label clear of the stroke of its own line', () => {
    for (const scale of [1, 0.7]) {
      const plan = planLabels(d, scale)
      for (const l of d.lines) {
        const p = plan.lines.get(l.id)
        if (!p) continue
        const size = p.size ?? LINE_LABEL_SIZE
        const w = textWidth(p.text ?? l.fluid, size), h = size * 1.2
        const minX = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'start' ? p.x : p.x - w
        const half = lineWidth(l.fluid, l.size) / 2
        const pts = lineRoute(d, l)
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i]
          const hit = minX < Math.max(a.x, b.x) + half && minX + w > Math.min(a.x, b.x) - half &&
            p.y - h / 2 < Math.max(a.y, b.y) + half && p.y + h / 2 > Math.min(a.y, b.y) - half
          expect(hit, `${l.id} @${scale}`).toBe(false)
        }
      }
    }
  })

  it('enlarges texts when the drawing is shrunk, so they keep their size on paper', () => {
    expect(textFactor(1)).toBe(1)
    expect(textFactor(0.5)).toBe(2)
    expect(textFactor(0.01)).toBe(3.5)
    const plan = planLabels(d, 0.7)
    const tag = [...plan.tags.values()][0]
    expect(tag.size! * 0.7).toBeCloseTo(TAG_SIZE, 5)
  })
})
