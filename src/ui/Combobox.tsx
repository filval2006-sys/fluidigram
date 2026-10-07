import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface ComboGroup { id: string; label: string; options: string[] }

interface Props {
  value: string
  onCommit: (v: string) => void
  /** gruppi disponibili per la stringa cercata (vuota → tutto) */
  getGroups: (query: string) => ComboGroup[]
  placeholder?: string
  /** accetta anche un valore scritto a mano che non è in elenco */
  allowCustom?: boolean
  ariaLabel?: string
}

/** Menu a tendina con scorrimento completo e ricerca digitando. */
export function Combobox({ value, onCommit, getGroups, placeholder, allowCustom = true, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value)
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const skipBlur = useRef(false)
  const pending = useRef({ typed, text, value, open, allowCustom, onCommit })
  pending.current = { typed, text, value, open, allowCustom, onCommit }
  // se il campo sparisce mentre si sta scrivendo un valore (cambio di schermata), il valore scritto si conferma come all'uscita dal campo
  useEffect(() => () => {
    const p = pending.current
    if (!skipBlur.current && p.open && p.typed && p.allowCustom && p.text.trim() && p.text.trim() !== p.value) p.onCommit(p.text.trim())
  }, [])

  useEffect(() => { if (!open) { setText(value); setTyped(false) } }, [value, open])

  // finché non si digita nulla mostra tutto l'elenco, anche se c'è già un valore
  const groups = useMemo(() => getGroups(typed ? text : ''), [getGroups, typed, text])
  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups])

  useEffect(() => {
    if (!open) return
    const i = typed ? 0 : Math.max(0, flat.indexOf(value))
    setActive(i)
  }, [open, typed, flat, value])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const commit = (v: string) => {
    skipBlur.current = true
    const clean = v.trim()
    setOpen(false)
    setTyped(false)
    if (clean && clean !== value) onCommit(clean)
    else setText(value)
  }

  const customOffered = allowCustom && typed && text.trim() !== '' && !flat.includes(text.trim())
  let idx = -1

  return (
    <div className="combo">
      <div className="combo-box">
        <input
          aria-label={ariaLabel}
          value={text}
          placeholder={placeholder}
          onFocus={(e) => { skipBlur.current = false; setOpen(true); e.currentTarget.select() }}
          onChange={(e) => { skipBlur.current = false; setText(e.target.value); setTyped(true); setOpen(true) }}
          onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return } if (open) { if (typed && allowCustom) commit(text); else { setOpen(false); setTyped(false); setText(value) } } }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(flat.length - 1, a + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); if (flat.length && (!customOffered || flat[active])) commit(flat[active] ?? text); else commit(text); e.currentTarget.blur() }
            else if (e.key === 'Escape') { skipBlur.current = true; setOpen(false); setTyped(false); setText(value); e.currentTarget.blur() }
          }}
        />
        <ChevronDown size={14} className="combo-chev" aria-hidden />
      </div>
      {open && (
        <div className="combo-list" ref={listRef} onMouseDown={(e) => e.preventDefault()}>
          {customOffered && (
            <button className="combo-opt custom" onClick={() => commit(text)}>Usa «{text.trim()}»</button>
          )}
          {groups.map((g) => (
            <div key={g.id}>
              <div className="combo-group">{g.label}</div>
              {g.options.map((o) => {
                idx += 1
                const i = idx
                return (
                  <button
                    key={o}
                    className={'combo-opt' + (o === value ? ' current' : '')}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(o)}
                  >{o}</button>
                )
              })}
            </div>
          ))}
          {!groups.length && !customOffered && <div className="combo-empty">Nessun risultato</div>}
        </div>
      )}
    </div>
  )
}
