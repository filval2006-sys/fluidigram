import { useMemo, useState } from 'react'
import { Search, SquareDashed, Type, X } from 'lucide-react'
import { CATEGORY_NAMES, searchSymbols, symbolThumbnail, type SymbolCategory, type SymbolDef } from '../core'
import { N_, uiLanguage, t } from '../i18n'
import { useStore } from '../state/store'

export const SYMBOL_DRAG_TYPE = 'application/x-fluidigram-symbol'

/** Annotation items (they are not part of the plant). */
const ANNOTATION_ITEMS = [
  { id: 'ann.text', label: N_('Free text'), hint: N_('note, caption'), Icon: Type, words: 'testo nota didascalia commento annotazione text note caption comment' },
  { id: 'ann.box', label: N_('Zone box'), hint: N_('e.g. flight side, GSE'), Icon: SquareDashed, words: 'riquadro zona area confine gruppo box lato volo gse zone boundary group' },
] as const

function Thumb({ def }: { def: SymbolDef }) {
  const { svg } = symbolThumbnail(def, 22, 17, 40, 30, 3)
  return <svg viewBox="0 0 44 34" width="44" height="34" dangerouslySetInnerHTML={{ __html: svg }} />
}

export function Library() {
  const [query, setQuery] = useState('')
  const placing = useStore((s) => s.placing)
  const setPlacing = useStore((s) => s.setPlacing)
  const lang = uiLanguage()

  const annItems = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return ANNOTATION_ITEMS.filter((a) => words.every((w) => (t(a.label) + ' ' + a.words).toLowerCase().includes(w)))
  }, [query])

  const grouped = useMemo(() => {
    const out = new Map<SymbolCategory, SymbolDef[]>()
    for (const s of searchSymbols(query)) out.set(s.category, [...(out.get(s.category) ?? []), s])
    return [...out.entries()]
  }, [query])

  return (
    <aside className="library">
      <div className="search">
        <Search size={14} aria-hidden />
        <input placeholder={t('Search symbol…')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('Search symbol')} />
        {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label={t('Clear search')}><X size={14} /></button>}
      </div>
      <div className="library-scroll">
        {grouped.map(([cat, list]) => (
          <div key={cat}>
            <div className="lib-cat">{CATEGORY_NAMES[cat][lang]}</div>
            <div className="lib-grid">
              {list.map((def) => (
                <button
                  key={def.id}
                  className={'lib-item' + (placing === def.id ? ' on' : '')}
                  draggable
                  title={`${def.name[lang]} · ${def.tagPrefix}`}
                  onDragStart={(e) => { e.dataTransfer.setData(SYMBOL_DRAG_TYPE, def.id); e.dataTransfer.effectAllowed = 'copy'; setPlacing(null) }}
                  onClick={() => setPlacing(placing === def.id ? null : def.id)}
                >
                  <Thumb def={def} />
                  <span>{def.name[lang]}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {annItems.length > 0 && (
          <div>
            <div className="lib-cat">{t('Annotations')}</div>
            <div className="lib-grid">
              {annItems.map(({ id, label, hint, Icon }) => (
                <button
                  key={id}
                  className={'lib-item' + (placing === id ? ' on' : '')}
                  draggable
                  title={`${t(label)} (${t(hint)})`}
                  onDragStart={(e) => { e.dataTransfer.setData(SYMBOL_DRAG_TYPE, id); e.dataTransfer.effectAllowed = 'copy'; setPlacing(null) }}
                  onClick={() => setPlacing(placing === id ? null : id)}
                >
                  <Icon size={26} strokeWidth={1.5} />
                  <span>{t(label)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!grouped.length && !annItems.length && <p className="empty">{t('No symbol found for “{query}”.', { query })}</p>}
      </div>
      <p className="hint">{t('Drag onto the sheet, or click and then click where to place it.')}</p>
    </aside>
  )
}
