import { useCallback, useMemo, useState } from 'react'
import { Copy, FlipHorizontal2, RotateCw, Trash2 } from 'lucide-react'
import {
  ACTUATORS, ALL_SYMBOLS, CATEGORY_NAMES, END_KINDS, FLUIDS, FLUID_IDS, componentPorts, deleteItems, freePorts, portEnds, renumberTags, replaceComponents, setPortEnd, manualRouteValid, filterPipeSizes, getSymbol, mirrorComponents, rotateComponents, checkReport,
  TONES, type Annotation, type Component, type Dir, type SymbolCategory, type Drawing, type EndKind, type FluidId, type Line,
} from '../core'
import { N_, t, tp, uiLanguage } from '../i18n'
import { useActiveTab, useStore, type InspectorTab } from '../state/store'
import { Combobox } from './Combobox'
import { ChecksPanel } from './ChecksPanel'
import { Field, Num, Section, TextField } from './Fields'

const useSizeGroups = () => {
  return useCallback((q: string) => filterPipeSizes(q).map((g) => ({ id: g.id, label: g.label[uiLanguage()], options: g.options })), [])
}

export function Inspector() {
  const tab = useActiveTab()
  const inspectorTab = useStore((s) => s.inspectorTab)
  const setInspectorTab = useStore((s) => s.setInspectorTab)
  const report = useMemo(() => checkReport(tab.doc, { scope: 'design' }), [tab.doc])
  const issues = report.issues
  const problems = issues.filter((i) => i.severity !== 'info').length
  const sheet = tab.doc.drawing
  const sel = tab.selection
  const comps = sheet.components.filter((c) => sel.includes(c.id))
  const lines = sheet.lines.filter((l) => sel.includes(l.id))
  const anns = sheet.annotations.filter((a) => sel.includes(a.id))

  const tabs: { id: InspectorTab; label: string; badge?: number }[] = [
    { id: 'props', label: t('Properties') },
    { id: 'checks', label: t('Checks'), badge: problems },
  ]

  return (
    <aside className="inspector">
      <div className="itabs" role="tablist">
        {tabs.map((tb) => (
          <button key={tb.id} role="tab" aria-selected={inspectorTab === tb.id} className={inspectorTab === tb.id ? 'on' : ''} onClick={() => setInspectorTab(tb.id)}>
            {tb.label}{!!tb.badge && <i className="badge">{tb.badge}</i>}
          </button>
        ))}
      </div>
      {inspectorTab === 'checks' && <ChecksPanel report={report} hints={tab.doc.checks.hints} />}
      {inspectorTab === 'props' && (
        <>
          {sel.length === 0 && <ProjectSummary />}
          {sel.length === 1 && comps.length === 1 && <ComponentPanel c={comps[0]} />}
          {sel.length === 1 && lines.length === 1 && <LinePanel l={lines[0]} sheet={sheet} />}
          {sel.length === 1 && anns.length === 1 && <AnnotationPanel a={anns[0]} />}
          {sel.length > 1 && <MultiPanel ids={sel} count={comps.length + lines.length + anns.length} />}
        </>
      )}
    </aside>
  )
}

const TONE_NAMES: Record<(typeof TONES)[number], string> = { neutral: N_('Neutral (black)'), blue: N_('Blue'), amber: N_('Amber'), green: N_('Green'), red: N_('Red') }

function AnnotationPanel({ a }: { a: Annotation }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const patch = (fn: (x: Annotation) => void) => edit((d) => { const t = d.drawing.annotations.find((x) => x.id === a.id); if (t) fn(t) })
  const isBox = a.kind === 'box'
  return (
    <Section title={isBox ? t('Zone box') : t('Free text')}>
      <Field label={isBox ? t('Label (IT)') : t('Text (IT)')}><TextField multiline={!isBox} value={a.text.it} ariaLabel={t('Italian text')} onCommit={(v) => patch((t) => { t.text.it = v })} /></Field>
      <Field label={isBox ? t('Label (EN)') : t('Text (EN)')}><TextField multiline={!isBox} value={a.text.en} ariaLabel={t('English text')} onCommit={(v) => patch((t) => { t.text.en = v })} /></Field>
      <div className="two">
        <Num label={t('Text size')} unit="mm" value={a.size} onChange={(v) => patch((t) => { t.size = Math.min(20, Math.max(1.5, v)) })} />
        <Field label={t('Color')}>
          <select value={a.tone} onChange={(e) => patch((t) => { t.tone = e.target.value as Annotation['tone'] })}>
            {TONES.map((tone) => <option key={tone} value={tone}>{t(TONE_NAMES[tone])}</option>)}
          </select>
        </Field>
      </div>
      {isBox && (
        <div className="two">
          <Num label={t('Width')} unit="mm" value={a.w} onChange={(v) => patch((t) => { t.w = Math.max(10, v) })} />
          <Num label={t('Height')} unit="mm" value={a.h} onChange={(v) => patch((t) => { t.h = Math.max(10, v) })} />
        </div>
      )}
      <div className="checks">
        {!isBox && <label><input type="checkbox" checked={a.bold} onChange={(e) => patch((t) => { t.bold = e.target.checked })} />{t('Bold')}</label>}
        <label><input type="checkbox" checked={a.framed} onChange={(e) => patch((t) => { t.framed = e.target.checked })} />{isBox ? t('Colored background') : t('Frame')}</label>
      </div>
      <div className="btn-row">
        <button onClick={() => useStore.getState().duplicateSelection()} title={t('Duplicate (⌘D)')}><Copy size={14} />{t('Duplicate')}</button>
        <button className="danger" onClick={() => { edit((d) => deleteItems(d.drawing, new Set([a.id]))); setSelection([]) }}><Trash2 size={14} />{t('Delete')}</button>
      </div>
      {isBox && <p className="muted small">{t('Drag the small square at the bottom right to resize. The box moves by grabbing its border or label.')}</p>}
    </Section>
  )
}

function MultiPanel({ ids, count }: { ids: string[]; count: number }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const set = new Set(ids)
  return (
    <>
    <Section title={t('{n} items selected', { n: count })}>
      <div className="btn-row">
        <button onClick={() => edit((d) => rotateComponents(d.drawing, set))}><RotateCw size={14} />{t('Rotate')}</button>
        <button onClick={() => edit((d) => mirrorComponents(d.drawing, set))}><FlipHorizontal2 size={14} />{t('Mirror')}</button>
        <button onClick={() => useStore.getState().duplicateSelection()} title={t('Duplicate (⌘D)')}><Copy size={14} />{t('Duplicate')}</button>
        <button className="danger" onClick={() => { edit((d) => deleteItems(d.drawing, set)); setSelection([]) }}><Trash2 size={14} />{t('Delete')}</button>
      </div>
    </Section>
    <ReplaceBox ids={ids} />
    </>
  )
}

/** Quick replace: one symbol in place of another keeping position and connections, for one or more parts. */
function ReplaceBox({ ids }: { ids: string[] }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const doc = useActiveTab().doc
  const [msg, setMsg] = useState('')
  const picked = doc.drawing.components.filter((c) => ids.includes(c.id))
  const symbols = [...new Set(picked.map((c) => c.symbol))]
  const home = getSymbol(symbols[0] ?? 'valve.ball').category
  const cats = (Object.keys(CATEGORY_NAMES) as SymbolCategory[]).sort((a, b) => (a === home ? -1 : b === home ? 1 : 0))
  if (!picked.length) return null

  const apply = (symbolId: string) => {
    let res = { replaced: [] as string[], skipped: [] as { tag: string; reason: { it: string; en: string } }[] }
    edit((d) => { res = replaceComponents(d, new Set(ids), symbolId) })
    const name = getSymbol(symbolId).name[uiLanguage()]
    const ok = res.replaced.length ? tp(res.replaced.length, '{n} part replaced with {name}.', '{n} parts replaced with {name}.', { name }) : ''
    const no = res.skipped.length ? ' ' + t('Not replaced: {list}.', { list: res.skipped.map((x) => `${x.tag} (${x.reason[uiLanguage()]})`).join('; ') }) : ''
    setMsg((ok + no).trim() || t('Nothing to replace: they are already of this type.'))
  }

  return (
    <Section title={t('Replace')}>
      <Field label={picked.length > 1 ? t('Replace {n} components with…', { n: picked.length }) : t('Replace with…')}>
        <select aria-label={t('Replace with')} value="" onChange={(e) => { if (e.target.value) apply(e.target.value) }}>
          <option value="">{t('Choose the new symbol…')}</option>
          {cats.map((cat) => (
            <optgroup key={cat} label={CATEGORY_NAMES[cat][uiLanguage()]}>
              {ALL_SYMBOLS.filter((x) => x.category === cat && !(symbols.length === 1 && x.id === symbols[0])).map((x) => <option key={x.id} value={x.id}>{x.name[uiLanguage()]}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="btn-row">
        <button onClick={() => setSelection(doc.drawing.components.filter((c) => symbols.includes(c.symbol)).map((c) => c.id))} title={t('Selects in the drawing all components of the same type, to replace them together')}>
          {t('Select all of the same type')}
        </button>
      </div>
      <p className="muted small">{t('Position, rotation and connections stay; size, pressure and notes are kept. You can undo with ⌘Z.')}</p>
      {msg && <p className="muted small">{msg}</p>}
    </Section>
  )
}

function ComponentPanel({ c }: { c: Component }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const doc = useActiveTab().doc
  const lang = uiLanguage()
  const def = getSymbol(c.symbol)
  const groups = useSizeGroups()
  const [tagError, setTagError] = useState('')
  const set = new Set([c.id])
  const patch = (fn: (c: Component) => void) =>
    edit((d) => { const t = d.drawing.components.find((x) => x.id === c.id); if (t) fn(t) })
  const setProp = (k: string, v: string) => patch((t) => { if (v) t.props[k] = v; else delete t.props[k] })
  const setDesc = (l: 'it' | 'en', v: string) =>
    patch((t) => {
      const next = { it: t.description?.it ?? '', en: t.description?.en ?? '', [l]: v }
      t.description = next.it || next.en ? next : undefined
    })

  return (
    <>
      <Section title={def.name[lang]}>
        <Field label="Tag">
          <TextField value={c.tag} ariaLabel="Tag" onCommit={(v) => {
            const clean = v.trim()
            if (!clean) return setTagError(t('The tag cannot be empty.'))
            if (doc.drawing.components.some((x) => x.id !== c.id && x.tag === clean)) return setTagError(t('The tag {tag} already exists.', { tag: clean }))
            setTagError('')
            patch((t) => { t.tag = clean })
          }} />
        </Field>
        {tagError && <p className="error">{tagError}</p>}
        <Field label={t('Description (IT)')}><TextField value={c.description?.it ?? ''} onCommit={(v) => setDesc('it', v)} placeholder="es. Intercettazione ossidante" /></Field>
        <Field label={t('Description (EN)')}><TextField value={c.description?.en ?? ''} onCommit={(v) => setDesc('en', v)} placeholder="e.g. Oxidizer shutoff" /></Field>
        <div className="btn-row">
          <button onClick={() => edit((d) => rotateComponents(d.drawing, set))} title={t('Rotate (R)')}><RotateCw size={14} />{t('Rotate')}</button>
          <button onClick={() => edit((d) => mirrorComponents(d.drawing, set))} title={t('Mirror (M)')}><FlipHorizontal2 size={14} />{t('Mirror')}</button>
          <button onClick={() => useStore.getState().duplicateSelection()} title={t('Duplicate (⌘D)')}><Copy size={14} />{t('Duplicate')}</button>
          <button className="danger" onClick={() => { edit((d) => deleteItems(d.drawing, set)); setSelection([]) }} title={t('Delete (Del)')}><Trash2 size={14} />{t('Delete')}</button>
        </div>
      </Section>
      <Section title={t('Technical data')}>
        <Field label={t('Size / connection')}>
          <Combobox ariaLabel={t('Component size')} value={c.props.size ?? ''} getGroups={groups} placeholder={t('Choose or type…')} onCommit={(v) => setProp('size', v)} />
        </Field>
        {def.options?.map((o) => (
          <Field key={o.key} label={o.label[lang]}>
            <select value={c.props[o.key] ?? o.default} onChange={(e) => setProp(o.key, e.target.value === o.default ? '' : e.target.value)}>
              {o.choices.map((ch) => <option key={ch.id} value={ch.id}>{ch.label[lang]}</option>)}
            </select>
          </Field>
        ))}
        {def.actuatable && (
          <Field label={t('Actuator')}>
            <select value={c.props.actuator ?? def.actuatable.defaultActuator} onChange={(e) => setProp('actuator', e.target.value === def.actuatable!.defaultActuator ? '' : e.target.value)}>
              {ACTUATORS.map((a) => <option key={a.id} value={a.id}>{a.name[lang]}</option>)}
            </select>
          </Field>
        )}
        {(def.id === 'engine.injector' || def.id === 'fitting.orifice') && (
          <>
            <div className="two">
              <Field label={t('No. of holes')}><TextField value={c.props.holes ?? ''} placeholder={t('e.g. 12')} onCommit={(v) => setProp('holes', v)} /></Field>
              <Field label={t('Hole Ø (mm)')}><TextField value={c.props.holeDia ?? ''} placeholder={t('e.g. 1.5')} onCommit={(v) => setProp('holeDia', v)} /></Field>
            </div>
          </>
        )}
        <Field label={t('Max pressure (bar)')}><TextField value={c.props.mawp ?? ''} onCommit={(v) => setProp('mawp', v)} placeholder={t('e.g. 100')} /></Field>
        {(def.category === 'valves') && (
          <Field label={t('Rest state')}>
            <select value={c.props.normal ?? ''} onChange={(e) => setProp('normal', e.target.value)}>
              <option value="">—</option>
              <option value="NC">{t('Normally closed (NC)')}</option>
              <option value="NA">{t('Normally open (NO)')}</option>
            </select>
          </Field>
        )}
        <Field label={t('Notes')}><TextField multiline value={c.props.note ?? ''} onCommit={(v) => setProp('note', v)} /></Field>
      </Section>
      <ReplaceBox ids={[c.id]} />
      <EndsSection c={c} />
    </>
  )
}

const SIDE_NAME: Record<Dir, string> = { N: N_('top'), E: N_('right'), S: N_('bottom'), W: N_('left') }

/** Ports left free on purpose: vent to atmosphere, or a connection coming from / going to another system. */
function EndsSection({ c }: { c: Component }) {
  const edit = useStore((s) => s.edit)
  const doc = useActiveTab().doc
  const ends = portEnds(c)
  const free = freePorts(doc.drawing, c).filter((p) => !ends.some((e) => e.portId === p.id))
  const nameOf = (id: string) => { const p = componentPorts(c).find((x) => x.id === id); return p ? `${id} (${t(SIDE_NAME[p.dir])})` : id }
  const patch = (fn: (t: Component) => void) => edit((d) => { const t = d.drawing.components.find((x) => x.id === c.id); if (t) fn(t) })
  if (!ends.length && !free.length) return null
  return (
    <Section title={t('Free ends')}>
      <p className="muted small">{t('If a port is left without a pipe on purpose, say where it goes: the check no longer reports it and the symbol appears in the drawing.')}</p>
      {ends.map((e) => (
        <div className="end-row" key={e.portId}>
          <div className="two">
            <span className="muted small">{t('Port {name}', { name: nameOf(e.portId) })}</span>
            <button className="icon-btn" aria-label={t('Remove end {port}', { port: e.portId })} onClick={() => patch((t) => setPortEnd(t, e.portId, ''))}><Trash2 size={13} /></button>
          </div>
          <select aria-label={t('End {port}', { port: e.portId })} value={e.kind} onChange={(ev) => patch((t) => setPortEnd(t, e.portId, ev.target.value as EndKind, e.label))}>
            {END_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label[uiLanguage()]}</option>)}
          </select>
          <TextField value={e.label} ariaLabel={t('End text {port}', { port: e.portId })} placeholder={e.kind === 'vent' ? 'ATM' : t('e.g. N₂O from GSE')} onCommit={(v) => patch((t) => setPortEnd(t, e.portId, e.kind, v))} />
        </div>
      ))}
      {!!free.length && (
        <Field label={t('Declare a free port')}>
          <select aria-label={t('Declare a free port')} value="" onChange={(ev) => { const id = ev.target.value; if (id) patch((t) => setPortEnd(t, id, 'vent')) }}>
            <option value="">{t('Choose the port…')}</option>
            {free.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}
          </select>
        </Field>
      )}
    </Section>
  )
}

function LinePanel({ l, sheet }: { l: Line; sheet: Drawing }) {
  const edit = useStore((s) => s.edit)
  const setSelection = useStore((s) => s.setSelection)
  const lang = uiLanguage()
  const groups = useSizeGroups()
  const tagOf = (id: string) => sheet.components.find((c) => c.id === id)?.tag ?? '?'
  const patch = (fn: (l: Line) => void) => edit((d) => { const t = d.drawing.lines.find((x) => x.id === l.id); if (t) fn(t) })

  return (
    <Section title={t('Line')}>
      <p className="muted">{tagOf(l.from.componentId)} → {tagOf(l.to.componentId)}</p>
      <Field label={t('Fluid')}>
        <div className="chips wrap">
          {FLUID_IDS.map((id: FluidId) => (
            <button key={id} className={'chip' + (l.fluid === id ? ' on' : '')} onClick={() => patch((t) => { t.fluid = id })} title={FLUIDS[id].name[lang]}>
              <i style={{ background: FLUIDS[id].color }} />{FLUIDS[id].name[lang]}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t('Pipe size')}>
        <Combobox ariaLabel={t('Pipe size')} value={l.size ?? ''} getGroups={groups} placeholder={t('Choose or type…')} onCommit={(v) => patch((t) => { t.size = v })} />
      </Field>
      <Field label={t('Operating pressure (bar)')}>
        <TextField value={l.pressure ?? ''} placeholder={t('e.g. 60')} ariaLabel={t('Operating pressure')} onCommit={(v) => patch((t) => { t.pressure = v || undefined })} />
      </Field>
      {manualRouteValid(sheet, l) ? (
        <p className="muted small">{t('Path edited by hand.')} <button className="link" onClick={() => patch((x) => { delete x.route })}>{t('Restore the automatic path')}</button></p>
      ) : (
        <p className="muted small">{t('Automatic path. Drag the square handles to move the segments, the blue dot at the ends to reconnect the line.')}</p>
      )}
      <div className="btn-row">
        <button className="danger" onClick={() => { edit((d) => deleteItems(d.drawing, new Set([l.id]))); setSelection([]) }}><Trash2 size={14} />{t('Delete line')}</button>
      </div>
    </Section>
  )
}

function ProjectSummary() {
  const tab = useActiveTab()
  const edit = useStore((s) => s.edit)
  const d = tab.doc.drawing
  const m = tab.doc.meta
  const fluids = [...new Set(d.lines.map((l) => l.fluid))]
  const setTitle = (l: 'it' | 'en', v: string) => edit((x) => { x.meta.title[l] = v })
  const [renumbered, setRenumbered] = useState<number | null>(null)

  return (
    <>
      <Section title={t('Project')}>
        <Field label={t('Name (IT)')}><TextField value={m.title.it} onCommit={(v) => setTitle('it', v)} /></Field>
        <Field label={t('Name (EN)')}><TextField value={m.title.en} onCommit={(v) => setTitle('en', v)} /></Field>
        <div className="stats">
          <div><b>{d.components.length}</b><span>{t('components')}</span></div>
          <div><b>{d.lines.length}</b><span>{t('lines')}</span></div>
          <div><b>{fluids.length}</b><span>{t('fluids')}</span></div>
        </div>
        <p className="muted small">{t('Title block, legend, format and layout are set in Export: here you draw without thinking about the sheet.')}</p>
      </Section>
      <Section title={t('Numbering')}>
        <p className="muted small">{t('New tags start at 1 (BV-1, BV-2…). In old projects you can renumber the automatic ones from 1, without gaps, keeping their order; tags you wrote yourself do not change.')}</p>
        <button className="wide-btn" onClick={() => { let n = 0; edit((x) => { n = renumberTags(x) }); setRenumbered(n) }}>{t('Renumber the tags from 1')}</button>
        {renumbered !== null && <p className="muted small">{renumbered ? tp(renumbered, '{n} tag changed. You can undo with ⌘Z.', '{n} tags changed. You can undo with ⌘Z.') : t('The tags are already in order from 1.')}</p>}
      </Section>
      <Section title={t('Shortcuts')}>
        <ul className="keys">
          <li><kbd>R</kbd> {t('rotate')} · <kbd>M</kbd> {t('mirror')} · <kbd>{t('Del')}</kbd> {t('delete')}</li>
          <li><kbd>{t('Shift')}</kbd> {t('+ click for multiple selection')}</li>
          <li><kbd>{t('Space')}</kbd> {t('+ drag to pan the view')}</li>
          <li><kbd>⌘</kbd>/<kbd>Ctrl</kbd> {t('+ wheel to zoom')}</li>
          <li><kbd>0</kbd> {t('fit all')} · <kbd>Esc</kbd> {t('cancel')}</li>
          <li><kbd>⌘Z</kbd> {t('undo')} · <kbd>⇧⌘Z</kbd> {t('redo')}</li>
          <li><kbd>⌘C</kbd> <kbd>⌘V</kbd> {t('copy/paste')} · <kbd>⌘D</kbd> {t('duplicate')}</li>
        </ul>
      </Section>
    </>
  )
}
