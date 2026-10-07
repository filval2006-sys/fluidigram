import { useCallback } from 'react'
import { FLUIDS, FLUID_IDS, filterPipeSizes } from '../core'
import { useStore } from '../state/store'
import { Combobox } from './Combobox'

/** Fluido e diametro che avranno le prossime linee disegnate. */
export function DrawBar() {
  const draw = useStore((s) => s.draw)
  const setDraw = useStore((s) => s.setDraw)
  const getGroups = useCallback((q: string) => filterPipeSizes(q).map((g) => ({ id: g.id, label: g.label.it, options: g.options })), [])
  return (
    <div className="drawbar">
      <span className="drawbar-label">Nuove linee</span>
      <div className="chips">
        {FLUID_IDS.map((id) => (
          <button key={id} className={'chip' + (draw.fluid === id ? ' on' : '')} onClick={() => setDraw({ fluid: id })} title={FLUIDS[id].name.it}>
            <i style={{ background: FLUIDS[id].color }} />{FLUIDS[id].code}
          </button>
        ))}
      </div>
      <div className="drawbar-size"><Combobox ariaLabel="Diametro nuove linee" value={draw.size} onCommit={(v) => setDraw({ size: v })} getGroups={getGroups} placeholder="Diametro" /></div>
    </div>
  )
}
