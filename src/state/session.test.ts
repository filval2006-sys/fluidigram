import { beforeEach, describe, expect, it } from 'vitest'
import { addComponent, createEmptyDocument } from '../core'
import { MAX_RECENTS, fileLabel, isPristineTab, mergeRecoverable, pushRecent, worthRecovering, type RecentFile, type Recoverable } from './session'
import { isDirty, useStore } from './store'

const withParts = () => { const d = createEmptyDocument(); addComponent(d, 'valve.ball', 0, 0); return d }

describe('recenti', () => {
  it('il nome è quello del file senza estensione, anche con percorsi Windows', () => {
    expect(fileLabel('/Users/me/Progetti/Razzo N2O.fluidigram')).toBe('Razzo N2O')
    expect(fileLabel('C:\\Users\\me\\Documenti\\banco.fluidigram')).toBe('banco')
  })

  it('in cima l\'ultimo aperto, senza doppioni e al massimo 12', () => {
    let list: RecentFile[] = []
    for (let i = 0; i < 20; i++) list = pushRecent(list, `/p/f${i}.fluidigram`, i)
    expect(list).toHaveLength(MAX_RECENTS)
    expect(list[0].path).toBe('/p/f19.fluidigram')
    list = pushRecent(list, '/p/f15.fluidigram', 99)
    expect(list[0].path).toBe('/p/f15.fluidigram')
    expect(list.filter((r) => r.path === '/p/f15.fluidigram')).toHaveLength(1)
  })
})

describe('lavoro da recuperare', () => {
  it('si recupera quello con modifiche non salvate o i progetti nuovi con contenuto, non le schede vuote né quelle pulite su file', () => {
    expect(worthRecovering({ dirty: true, filePath: '/a.fluidigram' }, createEmptyDocument())).toBe(true)
    expect(worthRecovering({}, withParts())).toBe(true)
    expect(worthRecovering({}, createEmptyDocument())).toBe(false)
    expect(worthRecovering({ filePath: '/a.fluidigram' }, withParts())).toBe(false)
  })

  it('l\'unione tiene la voce più recente, senza doppioni e con un tetto', () => {
    const mk = (id: string, savedAt: number): Recoverable => ({ id, doc: createEmptyDocument(), savedAt })
    const out = mergeRecoverable([mk('a', 1), mk('b', 2)], [mk('a', 5), mk('c', 3)])
    expect(out.map((r) => r.id)).toEqual(['a', 'c', 'b'])
    expect(mergeRecoverable([], Array.from({ length: 30 }, (_, i) => mk(`x${i}`, i)))).toHaveLength(10)
  })
})

describe('pagina iniziale e schede', () => {
  const blank = () => {
    useStore.setState({ tabs: [], activeId: '', home: false, recents: [], recoverable: [] })
    useStore.getState().newProject() // una scheda bianca come all'avvio
  }
  beforeEach(blank)

  it('dalla pagina iniziale «Nuovo» sostituisce la sola scheda bianca; altrimenti ne aggiunge una', () => {
    useStore.getState().setHome(true)
    const before = useStore.getState().tabs[0].id
    useStore.getState().newProject()
    let s = useStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].id).not.toBe(before)
    expect(s.home).toBe(false)
    useStore.getState().newProject() // fuori dalla pagina iniziale: una scheda in più
    s = useStore.getState()
    expect(s.tabs).toHaveLength(2)
  })

  it('con del lavoro nella scheda, dalla pagina iniziale si aggiunge senza perdere niente', () => {
    useStore.getState().edit((d) => { addComponent(d, 'vessel.tank', 0, 0) })
    useStore.getState().setHome(true)
    useStore.getState().newProject()
    expect(useStore.getState().tabs).toHaveLength(2)
    expect(isPristineTab(useStore.getState().tabs[0])).toBe(false)
  })

  it('aprire un file lo mette nei recenti, nasconde la pagina iniziale e non apre due volte lo stesso file', () => {
    useStore.getState().setHome(true)
    const doc = withParts()
    useStore.getState().openDocument(doc, '/p/banco.fluidigram')
    let s = useStore.getState()
    expect(s.home).toBe(false)
    expect(s.tabs).toHaveLength(1)
    expect(s.recents[0].name).toBe('banco')
    useStore.getState().setHome(true)
    useStore.getState().openDocument(doc, '/p/banco.fluidigram')
    s = useStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.recents).toHaveLength(1)
  })

  it('aprire un file sostituisce la scheda bianca inutilizzata, ma non una con del lavoro', () => {
    useStore.getState().openDocument(withParts(), '/p/uno.fluidigram')
    expect(useStore.getState().tabs).toHaveLength(1)
    useStore.getState().openDocument(withParts(), '/p/due.fluidigram') // la scheda attiva ha un file: se ne aggiunge una
    expect(useStore.getState().tabs).toHaveLength(2)
  })

  it('chiudere l\'ultima scheda riporta alla pagina iniziale; si può togliere un recente', () => {
    useStore.getState().openDocument(withParts(), '/p/a.fluidigram')
    useStore.getState().closeTab(useStore.getState().activeId)
    expect(useStore.getState().home).toBe(true)
    expect(useStore.getState().tabs).toHaveLength(1)
    useStore.getState().removeRecent('/p/a.fluidigram')
    expect(useStore.getState().recents).toEqual([])
  })

  it('recuperare un lavoro non salvato lo riapre come modificato; scartarlo lo toglie', () => {
    const doc = withParts()
    useStore.setState({ home: true, recoverable: [{ id: 'r1', doc, savedAt: 1 }, { id: 'r2', doc: withParts(), savedAt: 0 }] })
    useStore.getState().recover('r1')
    const s = useStore.getState()
    expect(s.home).toBe(false)
    const t = s.tabs.find((x) => x.id === s.activeId)!
    expect(t.doc.drawing.components).toHaveLength(1)
    expect(isDirty(t)).toBe(true)
    expect(s.recoverable.map((r) => r.id)).toEqual(['r2'])
    useStore.getState().discardRecoverable()
    expect(useStore.getState().recoverable).toEqual([])
  })
})
