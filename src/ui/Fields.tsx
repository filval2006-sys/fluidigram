import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Campo di testo che applica la modifica a invio o quando perde il focus (un solo passo di annullamento). */
export function TextField({ value, onCommit, placeholder, multiline, ariaLabel }: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  multiline?: boolean
  ariaLabel?: string
}) {
  const [text, setText] = useState(value)
  const cancelled = useRef(false)
  useEffect(() => setText(value), [value])
  const done = () => {
    if (cancelled.current) { cancelled.current = false; return }
    if (text !== value) onCommit(text)
  }
  const common = {
    value: text,
    placeholder,
    'aria-label': ariaLabel,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: done,
  }
  return multiline
    ? <textarea rows={2} {...common} />
    : <input {...common} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancelled.current = true; setText(value); e.currentTarget.blur() } }} />
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
