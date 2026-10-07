import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { Calculator, type LucideIcon } from 'lucide-react'
import { N_ } from '../i18n'

/**
 * Optional app modules. They are NOT part of the fluid diagram: they are off by default,
 * are switched on in Settings and are loaded only when needed.
 * Dependency rule (checked by a test): `core`, `state` and `ui` never import from here; only `App.tsx` does.
 */
/** `name`, `description` and `toolLabel` are English source strings: translate them with `t()` when showing them. */
export interface ModuleDef {
  id: string
  name: string
  description: string
  /** label of the toolbar button */
  toolLabel: string
  Icon: LucideIcon
  Dialog: LazyExoticComponent<ComponentType<{ onClose: () => void }>>
}

export const MODULES: readonly ModuleDef[] = [
  {
    id: 'calc',
    name: N_('Calculation tools'),
    description: N_('Sizing of N₂O injectors (SPI, HEM, Dyer), gas orifices, pressure drops and Cv. They are separate calculators: they do not change the diagram.'),
    toolLabel: N_('Calculations'),
    Icon: Calculator,
    Dialog: lazy(() => import('./calc/CalcDialog')),
  },
]
