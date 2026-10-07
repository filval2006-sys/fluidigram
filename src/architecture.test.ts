/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * Layer separation:
 *   core  ← state ← ui ← App
 *   modules (calculators, etc.) depend on core/state/ui, but nothing depends on them except App.tsx.
 * The fluid diagram (core + state + ui) works the same without the `modules` folder.
 */
const SRC = resolve(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

/** import specifiers (static, dynamic and export-from) of a file */
function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) out.push(m[1])
  return out
}

/** top-level folder (under src) a relative import points to, null for npm packages */
function layerOf(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const target = relative(SRC, resolve(dirname(file), spec))
  return target.split(/[\\/]/)[0]
}

const files = walk(SRC)
const inLayer = (layer: string) => files.filter((f) => relative(SRC, f).split(/[\\/]/)[0] === layer)

describe('layered architecture', () => {
  it('core is pure: it does not import from state, ui, modules or React', () => {
    for (const f of inLayer('core')) {
      for (const spec of importsOf(f)) {
        expect(['state', 'ui', 'modules'], `${relative(SRC, f)} importa ${spec}`).not.toContain(layerOf(f, spec))
        expect(spec, `${relative(SRC, f)} non deve dipendere da React`).not.toMatch(/^react/)
      }
    }
  })
  it('state does not import from ui or modules', () => {
    for (const f of inLayer('state')) for (const spec of importsOf(f)) expect(['ui', 'modules'], `${relative(SRC, f)} importa ${spec}`).not.toContain(layerOf(f, spec))
  })
  it('ui does not import from modules: the diagram does not know the optional modules', () => {
    for (const f of inLayer('ui')) for (const spec of importsOf(f)) expect(layerOf(f, spec), `${relative(SRC, f)} importa ${spec}`).not.toBe('modules')
  })
  it('only App.tsx imports the modules folder', () => {
    for (const f of files) {
      const rel = relative(SRC, f)
      if (rel.startsWith('modules') || rel === 'App.tsx') continue
      for (const spec of importsOf(f)) expect(layerOf(f, spec), `${rel} importa ${spec}`).not.toBe('modules')
    }
    expect(importsOf(join(SRC, 'App.tsx')).some((s) => s.includes('modules'))).toBe(true)
  })
  it('calculation engines are pure: no dependency on React, ui, state or the diagram', () => {
    for (const f of walk(join(SRC, 'modules', 'calc', 'engine'))) {
      for (const spec of importsOf(f)) {
        expect(spec.startsWith('.'), `${relative(SRC, f)} importa ${spec}`).toBe(true)
        expect(layerOf(f, spec), `${relative(SRC, f)} importa ${spec}`).toBe('modules')
      }
    }
  })
  it('diagram data contains no calculation fields', () => {
    const types = readFileSync(join(SRC, 'core', 'types.ts'), 'utf8')
    expect(types).not.toMatch(/n2o|dyer|blowdown/i)
  })
})
