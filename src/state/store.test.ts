import { beforeEach, describe, expect, it } from 'vitest'
import { addComponent, connectPorts } from '../core'
import { isDirty, useStore } from './store'

const active = () => { const s = useStore.getState(); return s.tabs.find((t) => t.id === s.activeId)! }

describe('store: tabs and history', () => {
  beforeEach(() => {
    useStore.setState({ tabs: [], activeId: '' })
    useStore.getState().newProject()
  })

  it('several projects at once, each with its own history', () => {
    const st = useStore.getState()
    const first = active().id
    st.edit((d) => { addComponent(d, 'valve.ball', 50, 50) })
    st.newProject()
    expect(useStore.getState().tabs).toHaveLength(2)
    expect(active().doc.drawing.components).toHaveLength(0)
    st.undo() // nothing to undo in the second project
    st.setActive(first)
    expect(active().doc.drawing.components).toHaveLength(1)
  })

  it('undo and redo; dirty goes back to false when returning to the saved state', () => {
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

  it('a drag is a single undo step', () => {
    const st = useStore.getState()
    st.edit((d) => { addComponent(d, 'valve.ball', 50, 50) })
    st.checkpoint()
    for (let x = 55; x <= 80; x += 5) st.editTransient((d) => { d.drawing.components[0].x = x })
    expect(active().doc.drawing.components[0].x).toBe(80)
    st.undo()
    expect(active().doc.drawing.components[0].x).toBe(50)
  })

  it('edits to project data can be undone', () => {
    const st = useStore.getState()
    st.edit((d) => { d.meta.title.it = 'Banco prova' })
    expect(active().doc.meta.title.it).toBe('Banco prova')
    st.undo()
    expect(active().doc.meta.title.it).toBe('Nuovo progetto')
  })

  it('connecting two ports creates a line with the chosen fluid and size', () => {
    const st = useStore.getState()
    let a = '', b = ''
    st.edit((d) => { a = addComponent(d, 'valve.ball', 50, 50).id; b = addComponent(d, 'valve.check', 100, 50).id })
    st.edit((d) => { connectPorts(d.drawing, { componentId: a, portId: 'b' }, { componentId: b, portId: 'in' }, 'fuel', 'AN-6') })
    expect(active().doc.drawing.lines[0]).toMatchObject({ fluid: 'fuel', size: 'AN-6' })
  })

  it('closing the last tab opens a new empty one', () => {
    const st = useStore.getState()
    st.closeTab(active().id)
    expect(useStore.getState().tabs).toHaveLength(1)
  })
})
