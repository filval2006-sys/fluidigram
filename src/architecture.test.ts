/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * Separazione dei livelli:
 *   core  ← state ← ui ← App
 *   modules (calcoli, ecc.) dipendono da core/state/ui, ma nessuno dipende da loro tranne App.tsx.
 * Lo schema fluidico (core + state + ui) funziona identico senza la cartella `modules`.
 */
const SRC = resolve(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

/** specificatori di import (statici, dinamici ed export-from) di un file */
function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) out.push(m[1])
  return out
}

/** cartella di primo livello (sotto src) a cui punta un import relativo, null per i pacchetti npm */
function layerOf(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const target = relative(SRC, resolve(dirname(file), spec))
  return target.split(/[\\/]/)[0]
}

const files = walk(SRC)
const inLayer = (layer: string) => files.filter((f) => relative(SRC, f).split(/[\\/]/)[0] === layer)

describe('architettura a livelli', () => {
  it('core è puro: non importa da state, ui, modules né da React', () => {
    for (const f of inLayer('core')) {
      for (const spec of importsOf(f)) {
        expect(['state', 'ui', 'modules'], `${relative(SRC, f)} importa ${spec}`).not.toContain(layerOf(f, spec))
        expect(spec, `${relative(SRC, f)} non deve dipendere da React`).not.toMatch(/^react/)
      }
    }
  })
  it('state non importa da ui né da modules', () => {
    for (const f of inLayer('state')) for (const spec of importsOf(f)) expect(['ui', 'modules'], `${relative(SRC, f)} importa ${spec}`).not.toContain(layerOf(f, spec))
  })
  it('ui non importa da modules: lo schema non conosce i moduli opzionali', () => {
    for (const f of inLayer('ui')) for (const spec of importsOf(f)) expect(layerOf(f, spec), `${relative(SRC, f)} importa ${spec}`).not.toBe('modules')
  })
  it('solo App.tsx importa la cartella modules', () => {
    for (const f of files) {
      const rel = relative(SRC, f)
      if (rel.startsWith('modules') || rel === 'App.tsx') continue
      for (const spec of importsOf(f)) expect(layerOf(f, spec), `${rel} importa ${spec}`).not.toBe('modules')
    }
    expect(importsOf(join(SRC, 'App.tsx')).some((s) => s.includes('modules'))).toBe(true)
  })
  it('i motori di calcolo sono puri: nessuna dipendenza da React, ui, state o dallo schema', () => {
    for (const f of walk(join(SRC, 'modules', 'calc', 'engine'))) {
      for (const spec of importsOf(f)) {
        expect(spec.startsWith('.'), `${relative(SRC, f)} importa ${spec}`).toBe(true)
        expect(layerOf(f, spec), `${relative(SRC, f)} importa ${spec}`).toBe('modules')
      }
    }
  })
  it('i dati dello schema non contengono campi dei calcoli', () => {
    const types = readFileSync(join(SRC, 'core', 'types.ts'), 'utf8')
    expect(types).not.toMatch(/n2o|dyer|blowdown/i)
  })
})
