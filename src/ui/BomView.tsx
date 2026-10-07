import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Crosshair, Eye, EyeOff, FolderPlus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  addBomExtra, addBomGroup, bomEditorSections, bomGroups, moveBomGroup, removeBomExtra, removeBomGroup, renameBomGroup, resetBom, resetBomRow,
  setBomCell, setBomGrouped, setBomHidden, setBomRowGroup,
  type BomEditorRow, type BomField, type BomRow, type Lang,
} from '../core'
import { useActiveTab, useStore } from '../state/store'
import { TextField } from './Fields'

const TEXT_COLS: { field: Exclude<BomField, 'tag'>; label: string; wide?: boolean }[] = [
  { field: 'description', label: 'Descrizione', wide: true },
  { field: 'type', label: 'Tipo', wide: true },
  { field: 'size', label: 'Diametro' },
  { field: 'pmax', label: 'P max' },
  { field: 'note', label: 'Note', wide: true },
]

/**
 * Distinta componenti: una schermata parallela allo schema, sempre modificabile.
 * Le righe nascono dal disegno e si aggiornano da sole; ogni cella che modifichi a mano resta tua (evidenziata)
 * finché non la ripristini. Le righe aggiunte servono per ciò che nel disegno non c'è (tubi, raccordi, viti…).
 */
export function BomView() {
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const setStageView = useStore((s) => s.setStageView)
  const setSelection = useStore((s) => s.setSelection)
  const focusOn = useStore((s) => s.focusOn)
  const doc = tab.doc
  const [lang, setLang] = useState<Lang>('it')
  const [confirmReset, setConfirmReset] = useState(false)
  const sections = useMemo(() => bomEditorSections(doc.drawing, lang, doc.bom), [doc.drawing, doc.bom, lang])
  const groups = useMemo(() => bomGroups(doc.bom, lang), [doc.bom, lang])
  const rows = sections.flatMap((sec) => sec.rows)
  const shown = rows.filter((r) => !r.hidden).length
  const hiddenCount = rows.length - shown
  const grouped = doc.bom.grouped
  const touched = Object.keys(doc.bom.overrides).length + doc.bom.hidden.length + doc.bom.extra.length + doc.bom.groups.length + Object.keys(doc.bom.renames).length + doc.bom.order.length + (grouped ? 0 : 1)
  const colSpan = TEXT_COLS.length + 2 + (grouped ? 1 : 0)

  const setCell = (r: BomEditorRow, field: BomField, value: string) =>
    edit((d) => setBomCell(d, r.id, r.extra, field, lang, value))
  const goTo = (id: string) => { setSelection([id]); focusOn([id]); setStageView('schema') }

  return (
    <div className="bom-view">
      <header className="bom-head">
        <div>
          <h2>Distinta componenti</h2>
          <p className="muted small">
            {shown} {shown === 1 ? 'riga' : 'righe'}{hiddenCount ? ` · ${hiddenCount} nascost${hiddenCount === 1 ? 'a' : 'e'}` : ''}
            . Segue il disegno: i componenti nuovi compaiono da soli, le tue modifiche restano.
          </p>
        </div>
        <div className="bom-tools">
          <div className="seg" role="tablist" aria-label="Lingua del testo">
            <button role="tab" aria-selected={lang === 'it'} className={lang === 'it' ? 'on' : ''} onClick={() => setLang('it')}>Italiano</button>
            <button role="tab" aria-selected={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          </div>
          <button className={grouped ? 'on' : ''} aria-pressed={grouped} onClick={() => edit((d) => setBomGrouped(d, !grouped))} title="Divide la distinta in gruppi con intestazione, anche nel PDF">{grouped ? 'Raggruppata' : 'Raggruppa'}</button>
          {grouped && <button onClick={() => edit((d) => { addBomGroup(d) })}><FolderPlus size={14} />Nuovo gruppo</button>}
          <button onClick={() => edit((d) => { addBomExtra(d) })}><Plus size={14} />Aggiungi riga</button>
          {confirmReset ? (
            <>
              <button className="danger" onClick={() => { edit((d) => resetBom(d)); setConfirmReset(false) }}>Conferma: ripristina tutto</button>
              <button onClick={() => setConfirmReset(false)}>Annulla</button>
            </>
          ) : (
            <button disabled={!touched} onClick={() => setConfirmReset(true)} title="Toglie modifiche, righe nascoste e righe aggiunte"><RotateCcw size={14} />Distinta automatica</button>
          )}
        </div>
      </header>

      {!doc.export.bom && (
        <p className="bom-warn">
          La distinta è disattivata nell'esportazione.{' '}
          <button className="link" onClick={() => edit((d) => { d.export.bom = true })}>Includila nel PDF</button>
        </p>
      )}

      <div className="bom-scroll">
        <table className="bom-table">
          <thead>
            <tr>
              <th className="c-tag">Tag</th>
              {TEXT_COLS.map((c) => <th key={c.field} className={c.wide ? 'c-wide' : 'c-narrow'}>{c.label}</th>)}
              {grouped && <th className="c-narrow">Gruppo</th>}
              <th className="c-act" aria-label="Azioni" />
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.group.id || 'all'}>
                {grouped && (
                  <tr className="group-row">
                    <td colSpan={colSpan}>
                      <div className="group-head">
                        <TextField value={sec.group.name} ariaLabel={`Nome del gruppo ${sec.group.name}`} placeholder="Nome del gruppo" onCommit={(v) => edit((d) => renameBomGroup(d, sec.group.id, lang, v))} />
                        <span className="muted small">{sec.rows.filter((r) => !r.hidden).length}</span>
                        <button className="icon-btn" aria-label="Aggiungi una riga a questo gruppo" title="Aggiungi una riga a questo gruppo" onClick={() => edit((d) => { addBomExtra(d, sec.group.id) })}><Plus size={13} /></button>
                        <button className="icon-btn" aria-label="Sposta il gruppo su" title="Sposta il gruppo su" onClick={() => edit((d) => moveBomGroup(d, sec.group.id, -1))}><ArrowUp size={13} /></button>
                        <button className="icon-btn" aria-label="Sposta il gruppo giù" title="Sposta il gruppo giù" onClick={() => edit((d) => moveBomGroup(d, sec.group.id, 1))}><ArrowDown size={13} /></button>
                        {sec.group.custom && <button className="icon-btn" aria-label="Elimina il gruppo" title="Elimina il gruppo (le righe tornano al loro tipo)" onClick={() => edit((d) => removeBomGroup(d, sec.group.id))}><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                )}
                {sec.rows.map((r) => (
                  <tr key={(r.extra ? 'x' : 'c') + r.id} className={r.hidden ? 'hidden-row' : r.extra ? 'extra-row' : ''}>
                    <td className="c-tag">
                      {r.extra
                        ? <TextField value={r.row.tag} ariaLabel="Tag" placeholder="Tag" onCommit={(v) => setCell(r, 'tag', v)} />
                        : <button className="tag-link" onClick={() => goTo(r.id)} title="Mostra nello schema"><Crosshair size={12} />{r.row.tag}</button>}
                    </td>
                    {TEXT_COLS.map((c) => (
                      <td key={c.field} className={cellClass(r, c.field)}>
                        <TextField
                          value={r.row[c.field]}
                          ariaLabel={`${c.label} ${r.row.tag}`}
                          placeholder={r.auto?.[c.field] || (r.extra ? c.label : '—')}
                          onCommit={(v) => setCell(r, c.field, v)}
                        />
                      </td>
                    ))}
                    {grouped && (
                      <td>
                        <select aria-label={`Gruppo di ${r.row.tag || 'riga'}`} value={r.group} onChange={(e) => edit((d) => setBomRowGroup(d, r.id, r.extra, e.target.value))}>
                          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="c-act">
                      {!r.extra && r.edited && (
                        <button className="icon-btn" aria-label={`Ripristina ${r.row.tag}`} title="Torna ai valori del disegno" onClick={() => edit((d) => resetBomRow(d, r.id))}><RotateCcw size={13} /></button>
                      )}
                      {!r.extra && (
                        <button className="icon-btn" aria-label={r.hidden ? `Mostra ${r.row.tag}` : `Nascondi ${r.row.tag}`} title={r.hidden ? 'Rimetti nella distinta' : 'Togli dalla distinta (resta nel disegno)'} onClick={() => edit((d) => setBomHidden(d, r.id, !r.hidden))}>
                          {r.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                      {r.extra && (
                        <button className="icon-btn" aria-label="Elimina riga" title="Elimina la riga" onClick={() => edit((d) => removeBomExtra(d, r.id))}><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {!rows.length && (
              <tr><td colSpan={colSpan} className="bom-empty">Nessun componente nel disegno. Aggiungi dei pezzi allo schema, oppure una riga a mano.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small bom-foot">
        Le celle evidenziate sono scritte da te. Il tag e il simbolo si cambiano nello schema; qui scegli cosa leggerà il PDF, in italiano e in inglese.
      </p>
    </div>
  )
}

function cellClass(r: BomEditorRow, field: Exclude<BomField, 'tag'>): string {
  const auto: BomRow | undefined = r.auto
  return auto && r.row[field] !== auto[field] ? 'edited' : ''
}
