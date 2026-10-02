import { beforeEach, describe, expect, it } from 'vitest'
import { addComponent, connectPorts } from '../core'
import { isDirty, useStore } from './store'

const active = () => { const s = useStore.getState(); return s.tabs.find((t) => t.id === s.activeId)! }

describe('store: schede e cronologia', () => {
  beforeEach(() => {
    useStore.setState({ tabs: [], activeId: '' })
    useStore.getState().newProject()
  })

  it('più progetti in contemporanea, ognuno con la sua cronologia', () => {
    const st = useStore.getState()
    const first = active().id
    st.edit((d) => { addComponent(d, 'valve.ball', 50, 50) })
    st.newProject()
    expect(useStore.getState().tabs).toHaveLength(2)
    expect(active().doc.drawing.components).toHaveLength(0)
    st.undo() // niente da annullare nel secondo progetto
    st.setActive(first)
    expect(active().doc.drawing.components).toHaveLength(1)
  })

  it('annulla e ripeti; dirty torna falso tornando allo stato salvato', () => {
    const st = useStore.getState()
    expect(isDirty(active())).toBe(false)
    st.edit((d) => { addComponent(d, 'vessel.tank', 50, 50) })
    expect(isDirty(active())).toBe(true)
    st.undo()
    expect(active().doc.drawing.components).toHaveLength(0)
    expect(isDirty(active())).toBe(false)
    st.redo()
    expect(active().doc.drawing.components).toHaveLength(1)
  })

  it('un trascinamento è un solo passo di annullamento', () => {
    const st = useStore.getState()
    st.edit((d) => { addComponent(d, 'valve.ball', 50, 50) })
    st.checkpoint()
    for (let x = 55; x <= 80; x += 5) st.editTransient((d) => { d.drawing.components[0].x = x })
    expect(active().doc.drawing.components[0].x).toBe(80)
    st.undo()
    expect(active().doc.drawing.components[0].x).toBe(50)
  })

  it('le modifiche ai dati del progetto sono annullabili', () => {
    const st = useStore.getState()
    st.edit((d) => { d.meta.title.it = 'Banco prova' })
    expect(active().doc.meta.title.it).toBe('Banco prova')
    st.undo()
    expect(active().doc.meta.title.it).toBe('Nuovo progetto')
  })

  it('collegare due porte crea una linea con fluido e diametro scelti', () => {
    const st = useStore.getState()
    let a = '', b = ''
    st.edit((d) => { a = addComponent(d, 'valve.ball', 50, 50).id; b = addComponent(d, 'valve.check', 100, 50).id })
    st.edit((d) => { connectPorts(d.drawing, { componentId: a, portId: 'b' }, { componentId: b, portId: 'in' }, 'fuel', 'AN-6') })
    expect(active().doc.drawing.lines[0]).toMatchObject({ fluid: 'fuel', size: 'AN-6' })
  })

  it('chiudere l\'ultima scheda ne apre una nuova vuota', () => {
    const st = useStore.getState()
    st.closeTab(active().id)
    expect(useStore.getState().tabs).toHaveLength(1)
  })
})
