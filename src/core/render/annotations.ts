import type { Annotation, Lang, Tone } from '../types'
import { INK, esc, FONT, n } from './svg'

/** Colori fissi per i toni (leggibili su fondo chiaro e scuro, stampabili). */
export const TONE_COLOR: Record<Tone, string> = { neutral: INK, blue: '#2f6fed', amber: '#b87500', green: '#2b8a3e', red: '#d6342c' }

export const annotationText = (a: Annotation, lang: Lang): string => a.text[lang] || a.text[lang === 'it' ? 'en' : 'it'] || ''

const LINE_H = 1.28

/** Ingombro stimato (font a spaziatura media): serve per selezione ed esportazione. */
export function annotationBounds(a: Annotation, lang: Lang | 'any' = 'it'): { minX: number; minY: number; maxX: number; maxY: number } {
  if (a.kind === 'box') return { minX: a.x, minY: a.y, maxX: a.x + a.w, maxY: a.y + a.h }
  if (lang === 'any') {
    const i = annotationBounds(a, 'it'), e = annotationBounds(a, 'en')
    return { minX: i.minX, minY: i.minY, maxX: Math.max(i.maxX, e.maxX), maxY: Math.max(i.maxY, e.maxY) }
  }
  const lines = annotationText(a, lang).split('\n')
  const w = Math.max(...lines.map((l) => l.length), 1) * a.size * 0.56 + (a.framed ? 3 : 0)
  const h = lines.length * a.size * LINE_H + (a.framed ? 2 : 0)
  return { minX: a.x, minY: a.y, maxX: a.x + w, maxY: a.y + h }
}

/** Riquadro di zona (da disegnare sotto linee e componenti). */
export function renderAnnotationBox(a: Annotation, lang: Lang): string {
  const c = TONE_COLOR[a.tone]
  const label = annotationText(a, lang)
  let s = `<rect x="${n(a.x)}" y="${n(a.y)}" width="${n(a.w)}" height="${n(a.h)}" rx="1.5" fill="${a.framed ? c : 'none'}" fill-opacity="${a.framed ? 0.07 : 0}" stroke="${c}" stroke-width="0.35" stroke-dasharray="3 1.6"/>`
  if (label) s += `<text x="${n(a.x + 2)}" y="${n(a.y + a.size * 0.9)}" font-family="${FONT}" font-size="${n(a.size)}" font-weight="700" dominant-baseline="central" fill="${c}">${esc(label)}</text>`
  return s
}

/** Testo libero, anche su più righe, con cornice opzionale. */
export function renderAnnotationText(a: Annotation, lang: Lang): string {
  const c = TONE_COLOR[a.tone]
  const lines = annotationText(a, lang).split('\n')
  const b = annotationBounds(a, lang)
  const pad = a.framed ? 1.5 : 0
  let s = ''
  if (a.framed) s += `<rect x="${n(b.minX)}" y="${n(b.minY)}" width="${n(b.maxX - b.minX)}" height="${n(b.maxY - b.minY)}" rx="1" fill="#fff" fill-opacity="0.85" stroke="${c}" stroke-width="0.3"/>`
  lines.forEach((l, i) => {
    s += `<text x="${n(a.x + pad)}" y="${n(a.y + pad * 0.7 + a.size * (0.6 + i * LINE_H))}" font-family="${FONT}" font-size="${n(a.size)}" ${a.bold ? 'font-weight="700" ' : ''}dominant-baseline="central" fill="${c}">${esc(l)}</text>`
  })
  return s
}

export const renderAnnotation = (a: Annotation, lang: Lang): string => (a.kind === 'box' ? renderAnnotationBox(a, lang) : renderAnnotationText(a, lang))
