import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileImage, FileText, FileType, Loader2, Plus, Trash2, X } from 'lucide-react'
import { PAGE, describePlan, planExport, renderAllPages, renderPhasePages, type ExportMode, type Lang, type SheetFormat } from '../core'
import { svgPagesToPdf, svgToPng } from '../platform/exporters'
import { saveFiles, type OutFile } from '../platform/files'
import { useActiveTab, useStore } from '../state/store'
import { Field, Section, TextField } from './Fields'
import type { Notify } from './TopBar'

const slug = (s: string) => s.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'progetto'

const MODES: { id: ExportMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automatica', hint: 'Scala 1:1 se ci sta, altrimenti riduce un po\' e, se serve, divide in più fogli.' },
  { id: 'fit', label: 'Un solo foglio', hint: 'Riduce tutto per farlo stare su un foglio.' },
  { id: 'split', label: 'Più fogli 1:1', hint: 'Mantiene la scala 1:1 e divide in più fogli con frecce di continuazione.' },
]

/** `design`: il disegno (schema, distinta, tabella stati); `phases`: il documento delle fasi di funzionamento. */
export function ExportDialog({ onClose, notify, kind = 'design' }: { onClose: () => void; notify: Notify; kind?: 'design' | 'phases' }) {
  const phasesDoc = kind === 'phases'
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const doc = tab.doc
  const ex = doc.export
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)

  const plan = useMemo(() => planExport(doc), [doc])
  const pages = useMemo(() => (phasesDoc ? renderPhasePages(doc) : renderAllPages(doc, plan)), [doc, plan, phasesDoc])
  const cur = Math.min(page, pages.length)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1))
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages.length, p + 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, busy, pages.length])

  const setEx = (patch: Partial<typeof ex>) => edit((d) => { Object.assign(d.export, patch) })
  const meta = (fn: (m: typeof doc.meta) => void) => edit((d) => fn(d.meta))
  const l10n = (key: 'title' | 'subtitle', l: Lang, v: string) => meta((m) => { m[key] = { it: m[key]?.it ?? '', en: m[key]?.en ?? '', [l]: v } })
  const text = (key: 'company' | 'drawingNo' | 'revision' | 'date' | 'drawnBy' | 'checkedBy') => (v: string) => meta((m) => { m[key] = v })

  const base = `${slug(doc.meta.drawingNo || doc.meta.title[ex.lang] || doc.meta.title.it)}_${phasesDoc ? (ex.lang === 'it' ? 'fasi' : 'phases') + '_' : ''}${ex.lang}`

  const run = async (kind: 'pdf' | 'svg' | 'png') => {
    setBusy(kind.toUpperCase())
    try {
      let files: OutFile[]
      if (kind === 'pdf') {
        files = [{ name: `${base}.pdf`, data: await svgPagesToPdf(pages), mime: 'application/pdf' }]
      } else if (kind === 'svg') {
        files = pages.map((p, i) => ({ name: `${base}${pages.length > 1 ? `_f${i + 1}` : ''}.svg`, data: p, mime: 'image/svg+xml' }))
      } else {
        files = []
        for (let i = 0; i < pages.length; i++) files.push({ name: `${base}${pages.length > 1 ? `_f${i + 1}` : ''}.png`, data: await svgToPng(pages[i], 200), mime: 'image/png' })
      }
      const saved = await saveFiles(files, kind, kind.toUpperCase())
      if (saved) { notify(files.length > 1 ? `Esportati ${files.length} file ${kind.toUpperCase()}` : `Esportato in ${kind.toUpperCase()}`); onClose() }
    } catch (e) {
      notify(`Esportazione non riuscita: ${e instanceof Error ? e.message : String(e)}`, 'err')
    } finally {
      setBusy(null)
    }
  }

  const fmtDims = (f: SheetFormat) => `${PAGE[f].w} × ${PAGE[f].h} mm`

  return (
    <div className="modal-bg" onMouseDown={() => { if (!busy) onClose() }}>
      <div className="export" role="dialog" aria-modal aria-label="Esporta" onMouseDown={(e) => e.stopPropagation()}>
        <header className="export-head">
          <h2>{phasesDoc ? 'Esporta fasi di funzionamento' : 'Esporta disegno'}</h2>
          <span className="export-summary">{phasesDoc ? `${pages.length} ${pages.length === 1 ? 'foglio' : 'fogli'}: una pagina per fase e la tabella riassuntiva` : describePlan(plan, 'it')}</span>
          <div className="spacer" />
          <button className="icon-btn" aria-label="Chiudi" onClick={onClose} disabled={!!busy}><X size={18} /></button>
        </header>

        <div className="export-body">
          <div className="export-side">
            <Section title="Documento">
              <Field label="Lingua del disegno">
                <div className="seg wide" role="group">
                  <button className={ex.lang === 'it' ? 'on' : ''} onClick={() => setEx({ lang: 'it' })}>Italiano</button>
                  <button className={ex.lang === 'en' ? 'on' : ''} onClick={() => setEx({ lang: 'en' })}>English</button>
                </div>
              </Field>
              <Field label="Formato foglio">
                <select value={ex.format} onChange={(e) => setEx({ format: e.target.value as SheetFormat })}>
                  {(['A4', 'A3', 'A2'] as const).map((f) => <option key={f} value={f}>{f} ({fmtDims(f)})</option>)}
                </select>
              </Field>
              {!phasesDoc && <Field label="Impaginazione">
                <div className="radios">
                  {MODES.map((m) => (
                    <label key={m.id} className={'radio' + (ex.mode === m.id ? ' on' : '')}>
                      <input type="radio" name="mode" checked={ex.mode === m.id} onChange={() => setEx({ mode: m.id })} />
                      <span><b>{m.label}</b><small>{m.hint}</small></span>
                    </label>
                  ))}
                </div>
              </Field>}
              <div className="checks">
                <label><input type="checkbox" checked={ex.color} onChange={(e) => setEx({ color: e.target.checked })} />{phasesDoc ? 'A colori (stati verde e rosso; altrimenti bianco e nero)' : 'Linee a colori (altrimenti bianco e nero)'}</label>
                {!phasesDoc && <><label><input type="checkbox" checked={ex.legend} onChange={(e) => setEx({ legend: e.target.checked })} />Legenda</label>
                <label><input type="checkbox" checked={ex.bom} onChange={(e) => setEx({ bom: e.target.checked })} />Distinta componenti</label>
                {doc.phases.length > 0 && <label><input type="checkbox" checked={ex.states} onChange={(e) => setEx({ states: e.target.checked })} />Tabella stati delle valvole per fase</label>}</>}
              </div>
            </Section>

            <Section title="Cartiglio">
              <Field label="Titolo (IT)"><TextField value={doc.meta.title.it} onCommit={(v) => l10n('title', 'it', v)} /></Field>
              <Field label="Title (EN)"><TextField value={doc.meta.title.en} onCommit={(v) => l10n('title', 'en', v)} /></Field>
              <Field label="Sottotitolo (IT)"><TextField value={doc.meta.subtitle?.it ?? ''} onCommit={(v) => l10n('subtitle', 'it', v)} /></Field>
              <Field label="Subtitle (EN)"><TextField value={doc.meta.subtitle?.en ?? ''} onCommit={(v) => l10n('subtitle', 'en', v)} /></Field>
              <Field label="Azienda / progetto"><TextField value={doc.meta.company} onCommit={text('company')} /></Field>
              <div className="two">
                <Field label="N. disegno"><TextField value={doc.meta.drawingNo} onCommit={text('drawingNo')} /></Field>
                <Field label="Revisione"><TextField value={doc.meta.revision} onCommit={text('revision')} /></Field>
              </div>
              <div className="two">
                <Field label="Data"><TextField value={doc.meta.date} onCommit={text('date')} /></Field>
                <span />
              </div>
              <div className="two">
                <Field label="Disegnato da"><TextField value={doc.meta.drawnBy} onCommit={text('drawnBy')} /></Field>
                <Field label="Verificato da"><TextField value={doc.meta.checkedBy} onCommit={text('checkedBy')} /></Field>
              </div>
            </Section>

            <Section title="Revisioni" action={
              <button className="icon-btn" aria-label="Aggiungi revisione" onClick={() => edit((d) => {
                const next = String.fromCharCode((d.revisions.at(-1)?.rev.charCodeAt(0) ?? 64) + 1)
                d.revisions.push({ rev: next, date: new Date().toISOString().slice(0, 10), description: { it: '', en: '' }, author: d.meta.drawnBy })
                d.meta.revision = next
              })}><Plus size={14} /></button>
            }>
              {doc.revisions.map((r, idx) => (
                <div className="rev" key={idx}>
                  <TextField value={r.rev} ariaLabel="Rev" onCommit={(v) => edit((d) => { d.revisions[idx].rev = v })} />
                  <TextField value={r.date} ariaLabel="Data revisione" onCommit={(v) => edit((d) => { d.revisions[idx].date = v })} />
                  <TextField value={r.description.it} ariaLabel="Descrizione IT" placeholder="Descrizione IT" onCommit={(v) => edit((d) => { d.revisions[idx].description.it = v })} />
                  <TextField value={r.description.en} ariaLabel="Description EN" placeholder="Description EN" onCommit={(v) => edit((d) => { d.revisions[idx].description.en = v })} />
                  <button className="icon-btn" aria-label="Elimina revisione" onClick={() => edit((d) => { d.revisions.splice(idx, 1) })}><Trash2 size={13} /></button>
                </div>
              ))}
            </Section>
          </div>

          <div className="export-preview">
            <div className="preview-stage">
              <div className="preview-page" dangerouslySetInnerHTML={{ __html: pages[cur - 1] }} />
            </div>
            <div className="preview-nav">
              <button className="icon-btn" aria-label="Foglio precedente" disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft size={18} /></button>
              <span>Foglio {cur} di {pages.length}{phasesDoc ? '' : cur > plan.tiles.length + plan.bomPages ? ' · stati valvole' : cur > plan.tiles.length ? ' · distinta' : ''}</span>
              <button className="icon-btn" aria-label="Foglio successivo" disabled={cur >= pages.length} onClick={() => setPage(cur + 1)}><ChevronRight size={18} /></button>
            </div>
            {pages.length > 1 && (
              <div className="thumbs">
                {pages.map((p, i) => (
                  <button key={i} className={'thumb' + (i + 1 === cur ? ' on' : '')} onClick={() => setPage(i + 1)} aria-label={`Foglio ${i + 1}`}>
                    <span dangerouslySetInnerHTML={{ __html: p }} /><i>{i + 1}</i>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="export-foot">
          <span className="muted">{busy ? `Creo ${busy}…` : 'Il disegno originale non cambia: l\'impaginazione si calcola a ogni esportazione.'}</span>
          <div className="spacer" />
          <button onClick={onClose} disabled={!!busy}>Annulla</button>
          <button onClick={() => run('png')} disabled={!!busy}><FileImage size={15} />PNG</button>
          <button onClick={() => run('svg')} disabled={!!busy}><FileType size={15} />SVG</button>
          <button className="primary" onClick={() => run('pdf')} disabled={!!busy}>{busy === 'PDF' ? <Loader2 size={15} className="spin" /> : <FileText size={15} />}PDF</button>
        </footer>
      </div>
    </div>
  )
}
