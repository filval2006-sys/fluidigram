import { describe, expect, it } from 'vitest'
import { lineWidth, pipeDiameterMm } from './fluids'

describe('pipe sizes → line width', () => {
  it('parses the sizes offered in the size picker', () => {
    expect(pipeDiameterMm('Ø6 mm')).toBe(6)
    expect(pipeDiameterMm('1/4" OD')).toBeCloseTo(6.35)
    expect(pipeDiameterMm('1-1/2" NPT')).toBeCloseTo(38.1)
    expect(pipeDiameterMm('AN-4')).toBeCloseTo(6.35)
    expect(pipeDiameterMm('DN10')).toBe(10)
    expect(pipeDiameterMm('boh')).toBeNull()
    expect(pipeDiameterMm(undefined)).toBeNull()
  })

  it('makes bigger pipes thicker, within limits', () => {
    expect(lineWidth('oxidizer', 'Ø12 mm')).toBeGreaterThan(lineWidth('oxidizer', 'Ø6 mm'))
    expect(lineWidth('oxidizer', 'Ø6 mm')).toBeGreaterThan(lineWidth('oxidizer', 'Ø2 mm'))
    expect(lineWidth('oxidizer', 'Ø50 mm')).toBeLessThanOrEqual(2.4)
    expect(lineWidth('oxidizer')).toBeGreaterThanOrEqual(0.8)
    expect(lineWidth('signal', 'Ø12 mm')).toBe(lineWidth('signal'))
  })
})
