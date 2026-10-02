import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { Calculator, type LucideIcon } from 'lucide-react'

/**
 * Moduli opzionali dell'app. NON fanno parte dello schema fluidico: sono spenti di default,
 * si attivano da Impostazioni e vengono caricati solo quando servono.
 * Regola di dipendenza (verificata da un test): `core`, `state` e `ui` non importano mai da qui; solo `App.tsx` lo fa.
 */
export interface ModuleDef {
  id: string
  name: string
  description: string
  /** etichetta del pulsante nella barra degli strumenti */
  toolLabel: string
  Icon: LucideIcon
  Dialog: LazyExoticComponent<ComponentType<{ onClose: () => void }>>
}

export const MODULES: readonly ModuleDef[] = [
  {
    id: 'calc',
    name: 'Strumenti di calcolo',
    description: 'Dimensionamento di iniettori N₂O (SPI, HEM, Dyer), orifizi per gas, perdite di carico e Cv. Sono calcolatori a parte: non cambiano lo schema.',
    toolLabel: 'Calcoli',
    Icon: Calculator,
    Dialog: lazy(() => import('./calc/CalcDialog')),
  },
]
