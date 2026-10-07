import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Pausa di scrittura dopo la quale il testo viene salvato da solo. */
const AUTOSAVE_MS = 600

/**
 * Campo di testo: la modifica si applica da sola dopo una breve pausa, quando si esce dal campo, a invio e se il campo
 * sparisce dallo schermo (cambio di schermata o di selezione). Esc annulla e torna al valore salvato.
 */
export function TextField({ value, onCommit, placeholder, multiline, ariaLabel }: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  multiline?: boolean
  ariaLabel?: string
}) {
  const [text, setText] = useState(value)
  const cancelled = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ text, value, onCommit })
  latest.current = { text, value, onCommit }
  useEffect(() => setText(value), [value])

  const commit = () => {
    clearTimeout(timer.current)
    const { text: t, value: v, onCommit: fn } = latest.current
    if (t !== v) fn(t)
  }
  const done = () => {
    if (cancelled.current) { cancelled.current = false; clearTimeout(timer.current); return }
    commit()
  }
  // se il campo sparisce con del testo non ancora confermato, lo si conferma (non scatta onBlur quando un elemento viene rimosso)
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (!cancelled.current && latest.current.text !== latest.current.value) latest.current.onCommit(latest.current.text)
  }, [])

  const common = {
    value: text,
    placeholder,
    'aria-label': ariaLabel,
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value)
      latest.current = { ...latest.current, text: e.target.value }
      clearTimeout(timer.current)
      timer.current = setTimeout(commit, AUTOSAVE_MS)
    },
    onBlur: done,
  }
  return multiline
    ? <textarea rows={2} {...common} />
    : <input {...common} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancelled.current = true; clearTimeout(timer.current); setText(value); e.currentTarget.blur() } }} />
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="section">
      <header><h3>{title}</h3>{action}</header>
      {children}
    </section>
  )
}

/** Numero con unità: accetta la virgola decimale e tiene il testo mentre si scrive. */
export function Num({ label, unit, value, onChange, hint, ariaLabel }: {
  label: string
  unit?: string
  value: number
  onChange: (v: number) => void
  hint?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText((t) => (parseFloat(t.replace(',', '.')) === value ? t : String(value)))
  }, [value])
  return (
    <label className="field num">
      <span>{label}{unit && <em>{unit}</em>}</span>
      <input
        inputMode="decimal"
        aria-label={ariaLabel ?? label}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseFloat(e.target.value.replace(',', '.'))
          if (Number.isFinite(v)) onChange(v)
        }}
        onBlur={() => setText(String(value))}
      />
      {hint && <small className="hint-inline">{hint}</small>}
    </label>
  )
}
