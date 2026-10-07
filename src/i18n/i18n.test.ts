/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { IT } from './it'
import { setUiLanguage, t, tp } from '.'

const SRC = resolve(process.cwd(), 'src')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })

/** Source strings passed to t() and tp() in the code. */
function usedKeys(): Map<string, string> {
  const out = new Map<string, string>()
  const str = String.raw`(['"\`])((?:\\.|(?!\1)[^\\])*)\1`
  const unescape = (s: string) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n')
  // the core has its own translation table for exported drawings (core/i18n.ts): it is not scanned here
  for (const f of walk(SRC).filter((x) => !x.includes('/core/') && !x.includes('/i18n/'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.])(?:t|N_)\(\s*${str}`, 'g'))) out.set(unescape(m[2]), f)
    for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.])tp\(\s*[^,]+,\s*${str}\s*,\s*${str}`, 'g'))) { out.set(unescape(m[2]), f); out.set(unescape(m[4]), f) }
  }
  return out
}

describe('interface translations', () => {
  it('every string passed to t() has an Italian translation', () => {
    const missing = [...usedKeys()].filter(([k]) => !(k in IT)).map(([k, f]) => `${f.replace(SRC, 'src')}: ${k}`)
    expect(missing).toEqual([])
  })
  it('the Italian dictionary has no unused entries', () => {
    const used = usedKeys()
    expect(Object.keys(IT).filter((k) => !used.has(k))).toEqual([])
  })
  it('placeholders match between English and Italian', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
    for (const [en, it] of Object.entries(IT)) expect(ph(it), en).toBe(ph(en))
  })
  it('t() translates, falls back to English and fills placeholders', () => {
    setUiLanguage('en')
    expect(t('Hello {name}', { name: 'x' })).toBe('Hello x')
    expect(tp(1, '{n} line', '{n} lines')).toBe('1 line')
    expect(tp(3, '{n} line', '{n} lines')).toBe('3 lines')
    setUiLanguage('en')
  })
})
