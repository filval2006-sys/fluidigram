import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import {
  FLUIDS, FLUID_IDS, addAnnotation, addComponent, annotationBounds, autoRoute, renderAnnotation, branchFromLine, runChecks, traceFlow, componentPorts, connectPorts, deleteItems,
  filterPipeSizes, freePorts, drawingBounds, lineRoute, mirrorComponents, moveSegment, nearestOnRoute, obstaclesOf, pickPortToward,
  mountInstrument, planLabels, reconnectLine, renderComponent, renderLine, resolvePort, rotateComponents, routeLine, snap, worldExtent,
  type Component, type Dir, type Point, type PortRef,
} from '../core'
import { useActiveTab, useShownPhase, useStore, type View } from '../state/store'
import { isTyping, runEditCommand } from './commands'
import { Combobox } from './Combobox'
import { SYMBOL_DRAG_TYPE } from './Library'

const isAnn = (id: string) => id.startsWith('ann.')
/** Crea un componente o un'annotazione a seconda dell'id dell'elemento in libreria. Restituisce l'id creato. */
function placeItem(itemId: string, x: number, y: number): string {
  let id = ''
  useStore.getState().edit((d) => {
    if (isAnn(itemId)) { id = addAnnotation(d, itemId === 'ann.box' ? 'box' : 'text', x, y).id; return }
    const c = addComponent(d, itemId, x, y)
    id = c.id
    mountInstrument(d.drawing, c, useStore.getState().draw.fluid) // un sensore posato accanto a un attacco libero si monta direttamente
  })
  return id
}

const MIN_K = 0.5
const MAX_K = 30
const PORT_HIT = 3 // mm

interface Cand { comp: Component; id: string; p: Point; dir: Dir }

type Drag =
  | { t: 'pan'; sx: number; sy: number; view: View }
  | { t: 'move'; start: Point; origins: Map<string, Point>; moved: boolean }
  | { t: 'annresize'; id: string; start: Point; w: number; h: number; moved: boolean }
  | { t: 'marquee'; start: Point; cur: Point; add: boolean }
  | { t: 'connect'; cands: Cand[]; cur: Point; from?: Cand; hover?: Cand; lineHover?: { lineId: string; point: Point } }
  | { t: 'seg'; lineId: string; i: number; horizontal: boolean; base: Point[]; start: Point; aDir: Dir; bDir: Dir; moved: boolean; last: string }
  | { t: 'reconnect'; lineId: string; end: 'from' | 'to'; fixed: { p: Point; dir: Dir }; cur: Point; hover?: Cand }

const Html = memo(function Html({ html, ...rest }: { html: string; 'data-kind': string; 'data-id': string; className?: string }) {
  return <g {...rest} dangerouslySetInnerHTML={{ __html: html }} />
})

/** Inquadra tutto il disegno (o l'origine se è vuoto). */
function fitView(w: number, h: number, bounds: { x: number; y: number; w: number; h: number } | null): View {
  const b = bounds ?? { x: -20, y: -15, w: 200, h: 130 }
  const k = Math.max(MIN_K, Math.min(MAX_K, Math.min((w - 120) / b.w, (h - 160) / b.h), 6))
  return { k, x: (w - b.w * k) / 2 - b.x * k, y: (h - b.h * k) / 2 - b.y * k + 20 }
}

const rectsIntersect = (a: { minX: number; minY: number; maxX: number; maxY: number }, b: typeof a) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

export function Canvas() {
  const tab = useActiveTab()
  const { draw, placing, inspectorTab, focusRequest } = useStore()
  const activePhase = useShownPhase()
  const store = useStore
  const sheet = tab.doc.drawing
  const selection = useMemo(() => new Set(tab.selection), [tab.selection])

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [space, setSpace] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const view = tab.view ?? (size.w ? fitView(size.w, size.h, drawingBounds(sheet)) : { x: 0, y: 0, k: 2 })
  useEffect(() => { if (!tab.view && size.w) store.getState().setView(fitView(size.w, size.h, drawingBounds(sheet))) }, [tab.view, tab.id, size, sheet, store])

  const viewRef = useRef(view)
  viewRef.current = view

  const toWorld = useCallback((cx: number, cy: number): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k }
  }, [])

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    const v = viewRef.current
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
    const f = k / v.k
    store.getState().setView({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f })
  }, [store])

  // inquadra gli elementi richiesti (clic su un controllo o su una valvola della tabella fasi)
  useEffect(() => {
    if (!focusRequest || !size.w) return
    const d = store.getState().tabs.find((t) => t.id === store.getState().activeId)?.doc.drawing
    if (!d) return
    const pts: Point[] = []
    for (const id of focusRequest.ids) {
      const c = d.components.find((x) => x.id === id)
      if (c) { const e = worldExtent(c); pts.push({ x: e.minX, y: e.minY }, { x: e.maxX, y: e.maxY }) }
      const l = d.lines.find((x) => x.id === id)
      if (l) pts.push(...lineRoute(d, l))
    }
    if (!pts.length) return
    const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x))
    const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y))
    const v = viewRef.current
    const fitK = Math.min((size.w - 160) / Math.max(1, x1 - x0), (size.h - 220) / Math.max(1, y1 - y0))
    const k = Math.max(MIN_K, Math.min(v.k, fitK))
    store.getState().setView({ k, x: size.w / 2 - ((x0 + x1) / 2) * k, y: size.h / 2 - ((y0 + y1) / 2) * k })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest])

  // rotella: pan; ctrl/cmd + rotella o pizzico: zoom sul puntatore
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      else {
        const v = viewRef.current
        store.getState().setView({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, store])

  // ---- tastiera ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector('.modal-bg')) return
      const st = store.getState()
      const mod = e.metaKey || e.ctrlKey
      const sel = new Set(st.tabs.find((t) => t.id === st.activeId)?.selection ?? [])
      if (e.code === 'Space') { setSpace(true); e.preventDefault(); return }
      // stessi comandi del menu (se arrivano due volte, il secondo viene ignorato)
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); runEditCommand(e.shiftKey ? 'redo' : 'undo'); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); runEditCommand('redo'); return }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); runEditCommand('select-all'); return }
      if (e.key === 'Escape') { st.setPlacing(null); st.setSelection([]); return }
      if (e.key === '0' && !mod) { if (wrapRef.current) { const t = st.tabs.find((x) => x.id === st.activeId)!; st.setView(fitView(wrapRef.current.clientWidth, wrapRef.current.clientHeight, drawingBounds(t.doc.drawing))) } return }
      if ((e.key === '+' || e.key === '=') && !mod) { zoomAt(1.25, size.w / 2, size.h / 2); return }
      if (e.key === '-' && !mod) { zoomAt(0.8, size.w / 2, size.h / 2); return }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); runEditCommand('paste'); return }
      if (!sel.size) return
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); runEditCommand('copy'); return }
      if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); runEditCommand('cut'); return }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); runEditCommand('duplicate'); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.edit((d) => deleteItems(d.drawing, sel)); st.setSelection([]) }
      else if (e.key.toLowerCase() === 'r' && !mod) st.edit((d) => rotateComponents(d.drawing, sel))
      else if (e.key.toLowerCase() === 'm' && !mod) st.edit((d) => mirrorComponents(d.drawing, sel))
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const dx = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0
        const dy = e.key === 'ArrowUp' ? -5 : e.key === 'ArrowDown' ? 5 : 0
        st.edit((d) => {
          for (const c of d.drawing.components) if (sel.has(c.id)) { c.x += dx; c.y += dy }
          for (const a of d.drawing.annotations) if (sel.has(a.id)) { a.x += dx; a.y += dy }
        })
      }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [store, zoomAt, size])

  // copia/taglia/incolla del sistema (voci di menu, o tastiera quando il menu le intercetta): agiscono sul disegno se non si sta scrivendo
  useEffect(() => {
    const handler = (id: 'copy' | 'cut' | 'paste') => (e: ClipboardEvent) => {
      if (isTyping(e.target) || document.querySelector('.modal-bg')) return
      e.preventDefault()
      runEditCommand(id)
    }
    const copy = handler('copy'), cut = handler('cut'), paste = handler('paste')
    document.addEventListener('copy', copy); document.addEventListener('cut', cut); document.addEventListener('paste', paste)
    return () => { document.removeEventListener('copy', copy); document.removeEventListener('cut', cut); document.removeEventListener('paste', paste) }
  }, [])

  // zoom richiesto dal menu Visualizza
  const viewRequest = useStore((s) => s.viewRequest)
  useEffect(() => {
    if (!viewRequest || !size.w) return
    if (viewRequest.kind === 'fit') store.getState().setView(fitView(size.w, size.h, drawingBounds(store.getState().tabs.find((t) => t.id === store.getState().activeId)!.doc.drawing)))
    else zoomAt(viewRequest.kind === 'in' ? 1.25 : 0.8, size.w / 2, size.h / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest])

  // ---- contenuti statici e per elemento ----
  // posizione di tag ed etichette: dipende da tutto il disegno (linee, vicini, note)
  const labels = useMemo(() => planLabels(sheet), [sheet])
  const compHtml = useMemo(
    () => sheet.components.map((c) => [c, renderComponent(c, { state: activePhase ? c.states?.[activePhase] : undefined, label: labels.tags.get(c.id) }), worldExtent(c)] as const),
    [sheet.components, activePhase, labels],
  )
  const annHtml = useMemo(() => sheet.annotations.map((a) => [a, renderAnnotation(a, 'it'), annotationBounds(a, 'it')] as const), [sheet.annotations])
  const liveLines = useMemo(() => (activePhase ? traceFlow(tab.doc, activePhase).live : null), [tab.doc, activePhase])
  const issueMap = useMemo(() => {
    const m = new Map<string, 'error' | 'warning' | 'info'>()
    if (inspectorTab !== 'checks') return m
    const rank = { error: 0, warning: 1, info: 2 } as const
    for (const i of runChecks(tab.doc)) for (const id of i.targets) if (!m.has(id) || rank[i.severity] < rank[m.get(id)!]) m.set(id, i.severity)
    return m
  }, [tab.doc, inspectorTab])
  const lineHtml = useMemo(
    () => sheet.lines.map((l) => [l, renderLine(sheet, l, true, labels.lines.get(l.id) ?? null), lineRoute(sheet, l)] as const),
    [sheet, labels],
  )

  const findPortAt = (w: Point, exclude?: Cand, allow?: PortRef): Cand | undefined => {
    let best: { d: number; cands: Cand[] } | undefined
    for (const c of sheet.components) {
      const free = componentPorts(c).filter((p) => (allow && allow.componentId === c.id && allow.portId === p.id) || freePorts(sheet, c).some((f) => f.id === p.id))
      for (const p of free) {
        if (exclude && exclude.comp.id === c.id && exclude.id === p.id) continue
        const d = Math.hypot(p.p.x - w.x, p.p.y - w.y)
        if (d > PORT_HIT) continue
        const cand: Cand = { comp: c, id: p.id, p: p.p, dir: p.dir }
        if (!best || d < best.d - 0.01) best = { d, cands: [cand] }
        else if (Math.abs(d - best.d) <= 0.01) best.cands.push(cand)
      }
    }
    if (!best) return undefined
    return exclude ? pickPortToward(best.cands, exclude.p) : best.cands[0]
  }

  /** Linea sotto il cursore (entro ~2,5 mm) con il punto di derivazione agganciato alla griglia. */
  const lineAt = (w: Point): { lineId: string; point: Point } | undefined => {
    let best: { lineId: string; point: Point; dist: number } | undefined
    for (const [l, , pts] of lineHtml) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        const cx = Math.min(Math.max(w.x, Math.min(a.x, b.x)), Math.max(a.x, b.x))
        const cy = Math.min(Math.max(w.y, Math.min(a.y, b.y)), Math.max(a.y, b.y))
        const d = Math.hypot(cx - w.x, cy - w.y)
        if (d <= 2.5 && (!best || d < best.dist)) {
          const hit = nearestOnRoute(pts, w)
          if (hit && hit.dist <= 6) best = { lineId: l.id, point: hit.point, dist: d }
        }
      }
    }
    return best && { lineId: best.lineId, point: best.point }
  }

  // maniglie della linea selezionata
  const selectedLine = tab.selection.length === 1 ? sheet.lines.find((l) => l.id === tab.selection[0]) : undefined
  const lineHandles = useMemo(() => {
    if (!selectedLine) return null
    const a = resolvePort(sheet, selectedLine.from), b = resolvePort(sheet, selectedLine.to)
    if (!a || !b) return null
    const pts = lineRoute(sheet, selectedLine)
    const segs = pts.slice(1).map((q, i) => ({ i, p: pts[i], q })).filter(({ i }) => !!(moveSegment(pts, i, 5, a.dir, b.dir) || moveSegment(pts, i, -5, a.dir, b.dir)))
    return { pts, a, b, segs }
  }, [selectedLine, sheet])

  // ---- puntatore ----
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const st = store.getState()
    const w = toWorld(e.clientX, e.clientY)
    svgRef.current!.setPointerCapture(e.pointerId)

    if (e.button === 1 || space) { setDrag({ t: 'pan', sx: e.clientX, sy: e.clientY, view }); return }
    if (e.button !== 0) return

    if (st.placing) {
      st.setSelection([placeItem(st.placing, w.x, w.y)])
      if (!e.shiftKey) st.setPlacing(null)
      return
    }

    const el = (e.target as Element).closest('[data-kind]') as HTMLElement | null
    const kind = el?.dataset.kind
    const id = el?.dataset.id

    if (kind === 'seg' && el && lineHandles && selectedLine) {
      const i = Number(el.dataset.i)
      const horizontal = lineHandles.pts[i].y === lineHandles.pts[i + 1].y
      setDrag({ t: 'seg', lineId: selectedLine.id, i, horizontal, base: lineHandles.pts, start: w, aDir: lineHandles.a.dir, bDir: lineHandles.b.dir, moved: false, last: '' })
      return
    }
    if (kind === 'lineend' && el && lineHandles && selectedLine) {
      const end = el.dataset.end as 'from' | 'to'
      const fixed = end === 'from' ? lineHandles.b : lineHandles.a
      setDrag({ t: 'reconnect', lineId: selectedLine.id, end, fixed: { p: fixed.p, dir: fixed.dir }, cur: w })
      return
    }

    if (kind === 'port' && el) {
      const comp = sheet.components.find((c) => c.id === el.dataset.comp)!
      const [px, py] = el.dataset.pos!.split(',').map(Number)
      const cands = freePorts(sheet, comp).filter((p) => p.p.x === px && p.p.y === py).map((p) => ({ comp, id: p.id, p: p.p, dir: p.dir }))
      if (cands.length) { setDrag({ t: 'connect', cands, cur: w }); return }
    }

    if (kind === 'annresize' && id) {
      const a = sheet.annotations.find((x) => x.id === id)
      if (a) { setDrag({ t: 'annresize', id, start: w, w: a.w, h: a.h, moved: false }); return }
    }

    if ((kind === 'comp' || kind === 'line' || kind === 'ann') && id) {
      let sel = tab.selection
      if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]
      else if (!sel.includes(id)) sel = [id]
      st.setSelection(sel)
      if ((kind === 'comp' || kind === 'ann') && sel.includes(id)) {
        const origins = new Map<string, Point>()
        for (const c of sheet.components) if (sel.includes(c.id)) origins.set(c.id, { x: c.x, y: c.y })
        for (const a of sheet.annotations) if (sel.includes(a.id)) origins.set(a.id, { x: a.x, y: a.y })
        setDrag({ t: 'move', start: w, origins, moved: false })
      }
      return
    }

    if (!e.shiftKey) st.setSelection([])
    setDrag({ t: 'marquee', start: w, cur: w, add: e.shiftKey })
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const w = toWorld(e.clientX, e.clientY)
    setCursor(w)
    if (!drag) return
    const st = store.getState()
    if (drag.t === 'pan') {
      st.setView({ ...drag.view, x: drag.view.x + (e.clientX - drag.sx), y: drag.view.y + (e.clientY - drag.sy) })
    } else if (drag.t === 'move') {
      const dx = snap(w.x - drag.start.x)
      const dy = snap(w.y - drag.start.y)
      if (!drag.moved && (dx !== 0 || dy !== 0)) { st.checkpoint(); setDrag({ ...drag, moved: true }) }
      if (dx !== 0 || dy !== 0 || drag.moved) {
        st.editTransient((d) => {
          for (const c of d.drawing.components) {
            const o = drag.origins.get(c.id)
            if (o) { c.x = o.x + dx; c.y = o.y + dy }
          }
          for (const a of d.drawing.annotations) {
            const o = drag.origins.get(a.id)
            if (o) { a.x = o.x + dx; a.y = o.y + dy }
          }
        })
      }
    } else if (drag.t === 'annresize') {
      const nw = Math.max(10, snap(drag.w + (w.x - drag.start.x))), nh = Math.max(10, snap(drag.h + (w.y - drag.start.y)))
      if (!drag.moved && (nw !== drag.w || nh !== drag.h)) { st.checkpoint(); setDrag({ ...drag, moved: true }) }
      st.editTransient((d) => { const a = d.drawing.annotations.find((x) => x.id === drag.id); if (a) { a.w = nw; a.h = nh } })
    } else if (drag.t === 'marquee') {
      setDrag({ ...drag, cur: w })
    } else if (drag.t === 'connect') {
      let from = drag.from
      if (!from && Math.hypot(w.x - drag.cands[0].p.x, w.y - drag.cands[0].p.y) > 2) from = pickPortToward(drag.cands, w)
      const hover = from ? findPortAt(w, from) : undefined
      setDrag({ ...drag, cur: w, from, hover, lineHover: from && !hover ? lineAt(w) : undefined })
    } else if (drag.t === 'seg') {
      const off = snap(drag.horizontal ? w.y - drag.start.y : w.x - drag.start.x)
      const next = off === 0 ? drag.base : moveSegment(drag.base, drag.i, off, drag.aDir, drag.bDir)
      if (next) {
        const sig = JSON.stringify(next)
        if (sig !== drag.last) {
          if (!drag.moved && off !== 0) { st.checkpoint(); setDrag({ ...drag, moved: true, last: sig }) } else setDrag({ ...drag, last: sig })
          st.editTransient((d) => { const l = d.drawing.lines.find((x) => x.id === drag.lineId); if (l) l.route = next.map((p) => ({ ...p })) })
        }
      }
    } else if (drag.t === 'reconnect') {
      const l = sheet.lines.find((x) => x.id === drag.lineId)
      const hover = l ? findPortAt(w, undefined, l[drag.end]) : undefined
      setDrag({ ...drag, cur: w, hover })
    }
  }

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag
    setDrag(null)
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    if (!d) return
    const st = store.getState()
    if (d.t === 'marquee') {
      const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x)
      const y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y)
      if (x1 - x0 < 1 && y1 - y0 < 1) return
      const box = { minX: x0, minY: y0, maxX: x1, maxY: y1 }
      const hit = sheet.components.filter((c) => rectsIntersect(worldExtent(c), box)).map((c) => c.id)
      const lines = sheet.lines.filter((l) => {
        const r = lineRoute(sheet, l)
        return r.length > 0 && r.every((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
      }).map((l) => l.id)
      const anns = sheet.annotations.filter((a) => rectsIntersect(annotationBounds(a, 'any'), box)).map((a) => a.id)
      st.setSelection([...new Set([...(d.add ? tab.selection : []), ...hit, ...lines, ...anns])])
    } else if (d.t === 'connect' && d.from && d.hover) {
      const a: PortRef = { componentId: d.from.comp.id, portId: d.from.id }
      const b: PortRef = { componentId: d.hover.comp.id, portId: d.hover.id }
      let newId: string | undefined
      st.edit((doc) => { newId = connectPorts(doc.drawing, a, b, draw.fluid, draw.size) })
      if (newId) st.setSelection([newId])
    } else if (d.t === 'connect' && d.from && d.lineHover) {
      const a: PortRef = { componentId: d.from.comp.id, portId: d.from.id }
      let jid: string | undefined
      st.edit((doc) => { jid = branchFromLine(doc, d.lineHover!.lineId, d.lineHover!.point, a, draw.size) })
      if (jid) st.setSelection([jid])
    } else if (d.t === 'reconnect' && d.hover) {
      const ref: PortRef = { componentId: d.hover.comp.id, portId: d.hover.id }
      st.edit((doc) => { reconnectLine(doc.drawing, d.lineId, d.end, ref) })
    } else if (d.t === 'move' && d.moved) {
      // sensori trascinati contro un attacco libero: si montano direttamente (stesso passo di annullamento dello spostamento)
      st.editTransient((doc) => {
        for (const c of doc.drawing.components) if (d.origins.has(c.id)) mountInstrument(doc.drawing, c, draw.fluid)
      })
    }
  }

  const onDragOver = (e: DragEvent) => { if (e.dataTransfer.types.includes(SYMBOL_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }
  const onDrop = (e: DragEvent) => {
    const symbolId = e.dataTransfer.getData(SYMBOL_DRAG_TYPE)
    if (!symbolId) return
    e.preventDefault()
    const w = toWorld(e.clientX, e.clientY)
    const st = store.getState()
    st.setSelection([placeItem(symbolId, w.x, w.y)])
  }

  // ---- sovrapposizioni ----
  const portHandles = useMemo(() => {
    const out: { key: string; comp: string; pos: Point; used: boolean }[] = []
    for (const c of sheet.components) {
      const seen = new Map<string, { used: boolean }>()
      for (const p of componentPorts(c)) {
        const key = `${p.p.x},${p.p.y}`
        const used = !freePorts(sheet, c).some((f) => f.id === p.id)
        const prev = seen.get(key)
        seen.set(key, { used: prev ? prev.used && used : used })
        if (!prev) out.push({ key: `${c.id}:${key}`, comp: c.id, pos: p.p, used })
        else out.find((o) => o.key === `${c.id}:${key}`)!.used = prev.used && used
      }
    }
    return out
  }, [sheet])

  const ghost = placing && cursor && !drag
    ? (isAnn(placing)
      ? renderAnnotation({ id: 'ghost', kind: placing === 'ann.box' ? 'box' : 'text', x: snap(cursor.x), y: snap(cursor.y), w: 60, h: 40, text: { it: placing === 'ann.box' ? 'Zona' : 'Nota', en: '' }, size: 3.5, bold: placing === 'ann.box', tone: placing === 'ann.box' ? 'blue' : 'neutral', framed: placing === 'ann.box' }, 'it')
      : renderComponent({ id: 'ghost', symbol: placing, tag: '', x: snap(cursor.x), y: snap(cursor.y), rotation: 0, mirror: false, props: {} }))
    : null

  const preview = (() => {
    const fixed = drag?.t === 'connect' ? drag.from : drag?.t === 'reconnect' ? drag.fixed : undefined
    if (!drag || (drag.t !== 'connect' && drag.t !== 'reconnect') || !fixed) return null
    const target = drag.t === 'connect' ? drag.hover ?? (drag.lineHover && { p: drag.lineHover.point, dir: undefined }) : drag.hover
    const end = target ? target.p : { x: snap(drag.cur.x), y: snap(drag.cur.y) }
    const dx = end.x - fixed.p.x, dy = end.y - fixed.p.y
    const guess: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'W' : 'E') : (dy > 0 ? 'N' : 'S')
    const dir = (target && 'dir' in target && target.dir) || guess
    const a = { p: fixed.p, dir: fixed.dir }, b = { p: end, dir }
    const pts = autoRoute(a, b, obstaclesOf(sheet)) ?? routeLine(a, b)
    return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
  })()

  const connecting = (drag?.t === 'connect' && !!drag.from) || drag?.t === 'reconnect'
  // zona sensibile delle porte: piccola a zoom alto (per poter afferrare il pezzo), più larga ad ingrandimento ridotto
  const portR = Math.min(2.4, Math.max(1.1, 6 / view.k))
  const fluid = FLUIDS[draw.fluid]
  const cls = ['canvas-svg', placing ? 'placing' : '', drag?.t === 'pan' || space ? 'panning' : ''].join(' ')

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef} className={cls} width={size.w} height={size.h} style={{ ['--k' as string]: view.k }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)} onDragOver={onDragOver} onDrop={onDrop}
      >
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.2" className="grid-dot" /></pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {view.k > 1.6 && (
            <rect x={-view.x / view.k} y={-view.y / view.k} width={size.w / view.k} height={size.h / view.k} fill="url(#grid)" pointerEvents="none" />
          )}

          {annHtml.filter(([a]) => a.kind === 'box').map(([a, html, b]) => (
            <g key={a.id} className="ann" data-kind="ann" data-id={a.id}>
              <Html html={html} data-kind="ann" data-id={a.id} />
              <rect className="ann-border-hit" x={a.x} y={a.y} width={a.w} height={a.h} />
              <rect className="ann-label-hit" x={b.minX} y={b.minY} width={Math.min(a.w, Math.max(12, (a.text.it.length + 1) * a.size * 0.6 + 4))} height={a.size * 1.9} />
            </g>
          ))}

          {lineHtml.map(([l, html, pts]) => (
            <g key={l.id} className={liveLines && !liveLines.has(l.id) ? 'line-dim' : ''}>
              {selection.has(l.id) && <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} className="sel-line" />}
              <Html html={html} data-kind="line" data-id={l.id} />
              <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} className="hit-line" data-kind="line" data-id={l.id} />
            </g>
          ))}

          {compHtml.map(([c, html, e]) => (
            <g key={c.id} className="comp" data-kind="comp" data-id={c.id}>
              <rect className="comp-hit" x={e.minX - 1.5} y={e.minY - 1.5} width={e.maxX - e.minX + 3} height={e.maxY - e.minY + 3} rx={1.5} />
              <Html html={html} data-kind="comp" data-id={c.id} />
            </g>
          ))}

          {annHtml.filter(([a]) => a.kind === 'text').map(([a, html, b]) => (
            <g key={a.id} className="ann" data-kind="ann" data-id={a.id}>
              <rect className="ann-text-hit" x={b.minX - 1} y={b.minY - 1} width={b.maxX - b.minX + 2} height={b.maxY - b.minY + 2} />
              <Html html={html} data-kind="ann" data-id={a.id} />
            </g>
          ))}

          {annHtml.filter(([a]) => selection.has(a.id)).map(([a, , b]) => (
            <g key={'s' + a.id}>
              <rect className="sel-box" x={b.minX - 1.5} y={b.minY - 1.5} width={b.maxX - b.minX + 3} height={b.maxY - b.minY + 3} rx={1.5} />
              {a.kind === 'box' && tab.selection.length === 1 && (
                <rect className="seg-handle ann-resize" data-kind="annresize" data-id={a.id} x={b.maxX - 1.8} y={b.maxY - 1.8} width={3.6} height={3.6} rx={0.5} />
              )}
            </g>
          ))}

          {sheet.components.filter((c) => selection.has(c.id)).map((c) => {
            const e = worldExtent(c)
            return <rect key={c.id} className="sel-box" x={e.minX - 1.5} y={e.minY - 1.5} width={e.maxX - e.minX + 3} height={e.maxY - e.minY + 3} rx={1.5} />
          })}

          {sheet.components.filter((c) => issueMap.has(c.id)).map((c) => {
            const e = worldExtent(c)
            return <rect key={'i' + c.id} className={'issue-ring ' + issueMap.get(c.id)} x={e.minX - 2.5} y={e.minY - 2.5} width={e.maxX - e.minX + 5} height={e.maxY - e.minY + 5} rx={2.5} />
          })}

          {portHandles.map((h) => (
            !h.used && (
              <g key={h.key} className={'port' + (connecting ? ' live' : '')} data-kind="port" data-comp={h.comp} data-pos={`${h.pos.x},${h.pos.y}`}>
                <circle cx={h.pos.x} cy={h.pos.y} r={portR} className="port-hit" />
                <circle cx={h.pos.x} cy={h.pos.y} r={Math.min(1.1, portR * 0.5)} className="port-dot" />
              </g>
            )
          ))}

          {lineHandles && drag?.t !== 'seg' && drag?.t !== 'reconnect' && (
            <>
              {lineHandles.segs.map(({ i, p, q }) => {
                const horizontal = p.y === q.y
                const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2
                const half = Math.min(1.6, Math.max(0.9, 5 / view.k))
                return <rect key={i} className={'seg-handle ' + (horizontal ? 'h' : 'v')} data-kind="seg" data-i={i} x={mx - half} y={my - half} width={half * 2} height={half * 2} rx={0.4} />
              })}
            </>
          )}
          {lineHandles && drag?.t !== 'reconnect' && (['from', 'to'] as const).map((end) => {
            const pt = end === 'from' ? lineHandles.pts[0] : lineHandles.pts[lineHandles.pts.length - 1]
            return <circle key={end} className="end-handle" data-kind="lineend" data-end={end} cx={pt.x} cy={pt.y} r={Math.min(2, Math.max(1.1, 5.5 / view.k))} />
          })}
          {(drag?.t === 'connect' || drag?.t === 'reconnect') && drag.hover && <circle cx={drag.hover.p.x} cy={drag.hover.p.y} r={2.2} className="port-target" />}
          {drag?.t === 'connect' && drag.lineHover && <circle cx={drag.lineHover.point.x} cy={drag.lineHover.point.y} r={2.4} className="branch-target" />}
          {preview && <path d={preview} fill="none" stroke={fluid.color} strokeWidth={fluid.width + 0.15} strokeDasharray="2 1.2" pointerEvents="none" />}
          {drag?.t === 'marquee' && (
            <rect className="marquee" x={Math.min(drag.start.x, drag.cur.x)} y={Math.min(drag.start.y, drag.cur.y)}
              width={Math.abs(drag.cur.x - drag.start.x)} height={Math.abs(drag.cur.y - drag.start.y)} />
          )}
          {ghost && <g opacity={0.55} pointerEvents="none" dangerouslySetInnerHTML={{ __html: ghost }} />}
        </g>
      </svg>

      <DrawBar />

      {activePhase && (
        <div className="phase-badge">
          <span>Fase mostrata: <b>{tab.doc.phases.find((p) => p.id === activePhase)?.name.it ?? '—'}</b></span>
          <small>valvole chiuse piene · linee senza alimentazione attenuate</small>
        </div>
      )}

      <div className="zoom">
        <button className="icon-btn" aria-label="Riduci" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)}><Minus size={15} /></button>
        <span>{Math.round((view.k / 3.78) * 100)}%</span>
        <button className="icon-btn" aria-label="Ingrandisci" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}><Plus size={15} /></button>
        <button className="icon-btn" aria-label="Inquadra tutto" title="Inquadra tutto (0)" onClick={() => store.getState().setView(fitView(size.w, size.h, drawingBounds(sheet)))}><Maximize size={15} /></button>
      </div>
    </div>
  )
}

/** Fluido e diametro usati per le nuove linee. */
function DrawBar() {
  const draw = useStore((s) => s.draw)
  const setDraw = useStore((s) => s.setDraw)
  const getGroups = useCallback((q: string) => filterPipeSizes(q).map((g) => ({ id: g.id, label: g.label.it, options: g.options })), [])
  return (
    <div className="drawbar">
      <span className="drawbar-label">Nuove linee</span>
      <div className="chips">
        {FLUID_IDS.map((id) => (
          <button key={id} className={'chip' + (draw.fluid === id ? ' on' : '')} onClick={() => setDraw({ fluid: id })} title={FLUIDS[id].name.it}>
            <i style={{ background: FLUIDS[id].color }} />{FLUIDS[id].code}
          </button>
        ))}
      </div>
      <div className="drawbar-size"><Combobox ariaLabel="Diametro nuove linee" value={draw.size} onCommit={(v) => setDraw({ size: v })} getGroups={getGroups} placeholder="Diametro" /></div>
    </div>
  )
}
