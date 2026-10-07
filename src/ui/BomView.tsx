import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Crosshair, Eye, EyeOff, FolderPlus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  addBomExtra, addBomGroup, bomEditorSections, bomGroups, moveBomGroup, removeBomExtra, removeBomGroup, renameBomGroup, resetBom, resetBomRow,
  setBomCell, setBomGrouped, setBomHidden, setBomRowGroup,
  type BomEditorRow, type BomField, type BomRow, type Lang,
} from '../core'
import { N_, t, tp, uiLanguage } from '../i18n'
import { useActiveTab, useStore } from '../state/store'
import { TextField } from './Fields'

const TEXT_COLS: { field: Exclude<BomField, 'tag'>; label: string; wide?: boolean }[] = [
  { field: 'description', label: N_('Description'), wide: true },
  { field: 'type', label: N_('Type'), wide: true },
  { field: 'size', label: N_('Size') },
  { field: 'pmax', label: N_('Max P') },
  { field: 'note', label: N_('Notes'), wide: true },
]

/**
 * Bill of materials: a screen parallel to the diagram, always editable.
 * Rows come from the drawing and update by themselves; every cell you edit by hand stays yours (highlighted)
 * until you restore it. Added rows are for what the drawing does not have (pipes, fittings, screws…).
 */
export function BomView() {
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const setStageView = useStore((s) => s.setStageView)
  const setSelection = useStore((s) => s.setSelection)
  const focusOn = useStore((s) => s.focusOn)
  const doc = tab.doc
  const [lang, setLang] = useState<Lang>(uiLanguage())
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
          <h2>{t('Bill of materials')}</h2>
          <p className="muted small">
            {tp(shown, '{n} row', '{n} rows')}{hiddenCount ? ` · ${tp(hiddenCount, '{n} hidden row', '{n} hidden rows')}` : ''}
            . {t('It follows the drawing: new components appear by themselves, your edits stay.')}
          </p>
        </div>
        <div className="bom-tools">
          <div className="seg" role="tablist" aria-label={t('Text language')}>
            <button role="tab" aria-selected={lang === 'it'} className={lang === 'it' ? 'on' : ''} onClick={() => setLang('it')}>Italiano</button>
            <button role="tab" aria-selected={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          </div>
          <button className={grouped ? 'on' : ''} aria-pressed={grouped} onClick={() => edit((d) => setBomGrouped(d, !grouped))} title={t('Splits the bill of materials into groups with a header, also in the PDF')}>{grouped ? t('Grouped') : t('Group')}</button>
          {grouped && <button onClick={() => edit((d) => { addBomGroup(d) })}><FolderPlus size={14} />{t('New group')}</button>}
          <button onClick={() => edit((d) => { addBomExtra(d) })}><Plus size={14} />{t('Add row')}</button>
          {confirmReset ? (
            <>
              <button className="danger" onClick={() => { edit((d) => resetBom(d)); setConfirmReset(false) }}>{t('Confirm: restore everything')}</button>
              <button onClick={() => setConfirmReset(false)}>{t('Cancel')}</button>
            </>
          ) : (
            <button disabled={!touched} onClick={() => setConfirmReset(true)} title={t('Removes edits, hidden rows and added rows')}><RotateCcw size={14} />{t('Automatic bill of materials')}</button>
          )}
        </div>
      </header>

      {!doc.export.bom && (
        <p className="bom-warn">
          {t('The bill of materials is turned off in the export.')}{' '}
          <button className="link" onClick={() => edit((d) => { d.export.bom = true })}>{t('Include it in the PDF')}</button>
        </p>
      )}

      <div className="bom-scroll">
        <table className="bom-table">
          <thead>
            <tr>
              <th className="c-tag">{t('Tag')}</th>
              {TEXT_COLS.map((c) => <th key={c.field} className={c.wide ? 'c-wide' : 'c-narrow'}>{t(c.label)}</th>)}
              {grouped && <th className="c-narrow">{t('Group')}</th>}
              <th className="c-act" aria-label={t('Actions')} />
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.group.id || 'all'}>
                {grouped && (
                  <tr className="group-row">
                    <td colSpan={colSpan}>
                      <div className="group-head">
                        <TextField value={sec.group.name} ariaLabel={t('Name of group {name}', { name: sec.group.name })} placeholder={t('Group name')} onCommit={(v) => edit((d) => renameBomGroup(d, sec.group.id, lang, v))} />
                        <span className="muted small">{sec.rows.filter((r) => !r.hidden).length}</span>
                        <button className="icon-btn" aria-label={t('Add a row to this group')} title={t('Add a row to this group')} onClick={() => edit((d) => { addBomExtra(d, sec.group.id) })}><Plus size={13} /></button>
                        <button className="icon-btn" aria-label={t('Move the group up')} title={t('Move the group up')} onClick={() => edit((d) => moveBomGroup(d, sec.group.id, -1))}><ArrowUp size={13} /></button>
                        <button className="icon-btn" aria-label={t('Move the group down')} title={t('Move the group down')} onClick={() => edit((d) => moveBomGroup(d, sec.group.id, 1))}><ArrowDown size={13} /></button>
                        {sec.group.custom && <button className="icon-btn" aria-label={t('Delete the group')} title={t('Delete the group (the rows return to their type)')} onClick={() => edit((d) => removeBomGroup(d, sec.group.id))}><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                )}
                {sec.rows.map((r) => (
                  <tr key={(r.extra ? 'x' : 'c') + r.id} className={r.hidden ? 'hidden-row' : r.extra ? 'extra-row' : ''}>
                    <td className="c-tag">
                      {r.extra
                        ? <TextField value={r.row.tag} ariaLabel={t('Tag')} placeholder={t('Tag')} onCommit={(v) => setCell(r, 'tag', v)} />
                        : <button className="tag-link" onClick={() => goTo(r.id)} title={t('Show in the diagram')}><Crosshair size={12} />{r.row.tag}</button>}
                    </td>
                    {TEXT_COLS.map((c) => (
                      <td key={c.field} className={cellClass(r, c.field)}>
                        <TextField
                          value={r.row[c.field]}
                          ariaLabel={`${t(c.label)} ${r.row.tag}`}
                          placeholder={r.auto?.[c.field] || (r.extra ? t(c.label) : '—')}
                          onCommit={(v) => setCell(r, c.field, v)}
                        />
                      </td>
                    ))}
                    {grouped && (
                      <td>
                        <select aria-label={t('Group of {name}', { name: r.row.tag || t('row') })} value={r.group} onChange={(e) => edit((d) => setBomRowGroup(d, r.id, r.extra, e.target.value))}>
                          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="c-act">
                      {!r.extra && r.edited && (
                        <button className="icon-btn" aria-label={t('Restore {tag}', { tag: r.row.tag })} title={t('Back to the drawing values')} onClick={() => edit((d) => resetBomRow(d, r.id))}><RotateCcw size={13} /></button>
                      )}
                      {!r.extra && (
                        <button className="icon-btn" aria-label={r.hidden ? t('Show {tag}', { tag: r.row.tag }) : t('Hide {tag}', { tag: r.row.tag })} title={r.hidden ? t('Put back in the bill of materials') : t('Remove from the bill of materials (stays in the drawing)')} onClick={() => edit((d) => setBomHidden(d, r.id, !r.hidden))}>
                          {r.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                      {r.extra && (
                        <button className="icon-btn" aria-label={t('Delete row')} title={t('Delete the row')} onClick={() => edit((d) => removeBomExtra(d, r.id))}><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {!rows.length && (
              <tr><td colSpan={colSpan} className="bom-empty">{t('No components in the drawing. Add parts to the diagram, or a row by hand.')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small bom-foot">
        {t('Highlighted cells are written by you. The tag and the symbol are changed in the diagram; here you choose what the PDF will read, in Italian and in English.')}
      </p>
    </div>
  )
}

function cellClass(r: BomEditorRow, field: Exclude<BomField, 'tag'>): string {
  const auto: BomRow | undefined = r.auto
  return auto && r.row[field] !== auto[field] ? 'edited' : ''
}
