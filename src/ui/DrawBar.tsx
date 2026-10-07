import { useCallback } from 'react'
import { FLUIDS, FLUID_IDS, filterPipeSizes } from '../core'
import { t, uiLanguage } from '../i18n'
import { useStore } from '../state/store'
import { Combobox } from './Combobox'

/** Fluid and size that the next lines drawn will have. */
export function DrawBar() {
  const draw = useStore((s) => s.draw)
  const setDraw = useStore((s) => s.setDraw)
  const getGroups = useCallback((q: string) => filterPipeSizes(q).map((g) => ({ id: g.id, label: g.label[uiLanguage()], options: g.options })), [])
  return (
    <div className="drawbar">
      <span className="drawbar-label">{t('New lines')}</span>
      <div className="chips">
        {FLUID_IDS.map((id) => (
          <button key={id} className={'chip' + (draw.fluid === id ? ' on' : '')} onClick={() => setDraw({ fluid: id })} title={FLUIDS[id].name[uiLanguage()]}>
            <i style={{ background: FLUIDS[id].color }} />{FLUIDS[id].code}
          </button>
        ))}
      </div>
      <div className="drawbar-size"><Combobox ariaLabel={t('New lines size')} value={draw.size} onCommit={(v) => setDraw({ size: v })} getGroups={getGroups} placeholder={t('Size')} /></div>
    </div>
  )
}
