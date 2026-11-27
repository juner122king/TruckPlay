import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { RouteAnswer } from '../../shared/host'
import { type Strings, useText } from '../state/text'
import { holdLiveOverview, reframeLiveOverview, touchLiveOverview } from './liveMap'
import { setRouteStops } from './routeChange'
import {
  deleteOverviewStop,
  type OverviewStopItem,
  type OverviewStopsSnapshot,
  reorderOverviewStops,
  useOverviewStops,
} from './routeTargets'

/** Auto-scroll speed cap (px/s) while pointer-dragging near the list's top or bottom edge. */
const MAX_AUTO_SCROLL_PX_PER_SEC = 420
/** Fallback timeout (ms) to release optimistic state if the game answers 'done' without changing routeId. */
const OPTIMISTIC_FALLBACK_MS = 4000

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

export interface DropMarkerGeometry {
  /** Vertical offset (px) inside `.overview-stops-list`'s scroll coordinate space. */
  y: number
}

export interface OverviewStopsCardViewProps {
  snapshot: OverviewStopsSnapshot
  text: Strings
  busy: boolean
  draggingIndex: number | null
  dragOffsetY: number
  dropMarker: DropMarkerGeometry | null
  keyboardGrabbedIndex: number | null
  statusAnnouncement: string
  cardRef?: RefObject<HTMLElement | null>
  listRef?: RefObject<HTMLOListElement | null>
  setItemRef?: (index: number, element: HTMLLIElement | null) => void
  setHandleRef?: (index: number, element: HTMLButtonElement | null) => void
  onAddStop?: () => void
  onDelete?: (index: number) => void
  onHandlePointerDown?: (index: number, event: ReactPointerEvent<HTMLButtonElement>) => void
  onHandleKeyDown?: (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => void
  onHandleBlur?: (index: number) => void
  onInteract?: () => void
}

/**
 * Pure presentation of the Route Overview waypoint list card:
 * - Shows intermediate stops (purple numbered pins) + trailing destination (red flag).
 * - On an active freight job (`snapshot.onJob`), the destination is locked at the bottom with no drag handle
 *   and no delete button; intermediate stops can be drag-reordered among themselves and deleted.
 * - Off a job (`!snapshot.onJob`), every item including the final destination has a drag handle and delete
 *   button; moving any item to the end promotes it to the new destination.
 */
export function OverviewStopsCardView({
  snapshot,
  text,
  busy,
  draggingIndex,
  dragOffsetY,
  dropMarker,
  keyboardGrabbedIndex,
  statusAnnouncement,
  cardRef,
  listRef,
  setItemRef,
  setHandleRef,
  onAddStop,
  onDelete,
  onHandlePointerDown,
  onHandleKeyDown,
  onHandleBlur,
  onInteract,
}: OverviewStopsCardViewProps) {
  const { items, onJob, movableCount, intermediateCount } = snapshot
  const words = text.destinations.overviewStops
  const canReorderAny = movableCount >= 2

  const listStyle: CSSProperties | undefined = dropMarker
    ? ({
        '--drop-y': `${dropMarker.y}px`,
      } as CSSProperties)
    : undefined

  return (
    <aside
      ref={cardRef}
      className={`overview-stops-card glass${busy ? ' is-busy' : ''}${draggingIndex !== null ? ' is-dragging' : ''}`}
      aria-label={words.title}
      onPointerDown={onInteract}
      onWheel={onInteract}
      onClick={onInteract}
    >
      <header className="overview-stops-head">
        <div className="overview-stops-title-group">
          <h2 className="overview-stops-title">{words.title}</h2>
          {intermediateCount > 0 && (
            <span className="overview-stops-count">{text.destinations.stopsCount(intermediateCount)}</span>
          )}
        </div>
        {onAddStop && (
          <button type="button" className="overview-stops-add" disabled={busy} onClick={onAddStop}>
            <PlusGlyph />
            <span>{words.add}</span>
          </button>
        )}
      </header>

      <ol ref={listRef} className="overview-stops-list" data-drop={dropMarker ? 'true' : undefined} style={listStyle}>
        {items.map((item, index) => {
          const isDragged = draggingIndex === index
          const isKeyboardGrabbed = keyboardGrabbedIndex === index
          const handleDisabled = busy || !item.editable || !canReorderAny
          const deleteDisabled = busy || !item.editable
          const rowStyle: CSSProperties | undefined = isDragged ? { translate: `0 ${dragOffsetY}px` } : undefined
          const meta = [item.subtitle, item.distance].filter(Boolean).join(' · ')

          return (
            <li
              key={item.key}
              ref={(el) => setItemRef?.(index, el)}
              className={`overview-stop-row${item.isDestination ? ' is-destination' : ''}${item.locked ? ' is-locked' : ''}${isDragged ? ' is-lifted' : ''}${isKeyboardGrabbed ? ' is-grabbed' : ''}`}
              style={rowStyle}
            >
              {item.locked ? (
                <span className="overview-stop-handle-spacer" aria-hidden="true" />
              ) : (
                <button
                  ref={(el) => setHandleRef?.(index, el)}
                  type="button"
                  className="overview-stop-handle"
                  data-own-drag=""
                  disabled={handleDisabled}
                  aria-label={words.reorderHandle(item.title)}
                  aria-pressed={isKeyboardGrabbed}
                  onPointerDown={(event) => onHandlePointerDown?.(index, event)}
                  onKeyDown={(event) => onHandleKeyDown?.(index, event)}
                  onBlur={() => onHandleBlur?.(index)}
                >
                  <GripGlyph />
                </button>
              )}

              <span
                className={`overview-stop-marker${item.isDestination ? ' destination' : ' waypoint'}`}
                aria-hidden="true"
              >
                {item.isDestination ? <FlagGlyph /> : item.stopNumber}
              </span>

              <div className="overview-stop-body">
                <div className="overview-stop-name">{item.title}</div>
                {meta && <div className="overview-stop-meta">{meta}</div>}
              </div>

              {item.locked ? (
                <span
                  className="overview-stop-lock"
                  role="img"
                  aria-label={words.jobLockedBadge}
                  title={words.jobLockedBadge}
                >
                  <LockGlyph />
                </span>
              ) : (
                <button
                  type="button"
                  className="overview-stop-delete"
                  disabled={deleteDisabled}
                  aria-label={words.removeStop(item.title)}
                  onClick={() => onDelete?.(index)}
                >
                  <RemoveGlyph />
                </button>
              )}
            </li>
          )
        })}
      </ol>

      {intermediateCount === 0 && (
        <p className="overview-stops-hint">{onJob ? words.jobLockedBadge : words.emptyStops}</p>
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {statusAnnouncement}
      </p>
    </aside>
  )
}

interface ActiveDrag {
  pointerId: number
  handle: HTMLButtonElement
  fromIndex: number
  itemTitle: string
  movableCount: number
  startClientY: number
  startScrollTop: number
  lastClientY: number
  dropBefore: number
  rafId: number
  lastFrameTime: number
}

interface KeyboardGrab {
  startItems: readonly OverviewStopItem[]
  currentIndex: number
  itemKey: string
  itemTitle: string
}

/**
 * Interactive Route Overview waypoint list card: connects to `useOverviewStops`, handles pointer drag-and-drop
 * reordering on dedicated `[data-own-drag]` handles, keyboard grab-move-drop fallback, single-stop deletion,
 * optimistic state reconciliation, and live overview timer/framing coordination.
 */
export function OverviewStopsCard({
  onAddStop,
  onNotify,
}: {
  onAddStop: () => void
  onNotify?: (message: string) => void
}) {
  const text = useText()
  const [optimistic, setOptimistic] = useState<{ routeId: number; uids: readonly string[] } | null>(null)
  const snapshot = useOverviewStops(optimistic)
  const [busy, setBusy] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [dropMarker, setDropMarker] = useState<DropMarkerGeometry | null>(null)
  const [keyboardGrab, setKeyboardGrab] = useState<KeyboardGrab | null>(null)
  const [statusAnnouncement, setStatusAnnouncement] = useState('')

  const cardRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([])
  const activeDragRef = useRef<ActiveDrag | null>(null)
  const ignoringBlurRef = useRef(false)
  const snapshotRef = useRef(snapshot)
  const textRef = useRef(text)

  useLayoutEffect(() => {
    snapshotRef.current = snapshot
    textRef.current = text
  })

  // Clear optimistic override once the game's replanned route arrives.
  if (optimistic && snapshot.routeId !== optimistic.routeId) {
    setOptimistic(null)
  }

  useEffect(() => {
    if (!optimistic) return
    const timer = setTimeout(() => setOptimistic(null), OPTIMISTIC_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [optimistic])

  // Reframe the overview map to clear the card's rendered width on mount and resize.
  useLayoutEffect(() => {
    reframeLiveOverview()
    const card = cardRef.current
    if (!card || typeof ResizeObserver === 'undefined') return
    let lastWidth = Math.round(card.getBoundingClientRect().width)
    const ro = new ResizeObserver(() => {
      const nextWidth = Math.round(card.getBoundingClientRect().width)
      if (Math.abs(nextWidth - lastWidth) >= 2) {
        lastWidth = nextWidth
        reframeLiveOverview()
      }
    })
    ro.observe(card)
    return () => ro.disconnect()
  }, [])

  const announce = useCallback((message: string) => {
    setStatusAnnouncement('')
    requestAnimationFrame(() => setStatusAnnouncement(message))
  }, [])

  const applyWithTransition = useCallback((update: () => void) => {
    if (prefersReducedMotion()) {
      update()
      return
    }
    const list = listRef.current as (HTMLOListElement & { startViewTransition?: (cb: () => void) => void }) | null
    if (list?.startViewTransition) {
      list.startViewTransition(update)
    } else if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(update)
    } else {
      update()
    }
  }, [])

  const commitUids = useCallback(
    async (routeId: number | null, submitUids: readonly string[], successNotice: string, statusMessage?: string) => {
      if (routeId === null) return
      setBusy(true)
      applyWithTransition(() => {
        setOptimistic({ routeId, uids: submitUids })
      })
      if (statusMessage) announce(statusMessage)
      try {
        const answer = await setRouteStops(submitUids)
        if (answer === 'done') {
          onNotify?.(successNotice)
        } else {
          setOptimistic(null)
          onNotify?.(answerText(answer, textRef.current))
        }
      } finally {
        setBusy(false)
      }
    },
    [announce, applyWithTransition, onNotify],
  )

  const computeDropSpot = useCallback((clientY: number, fromIndex: number, movableCount: number) => {
    const list = listRef.current
    if (!list) return { dropBefore: fromIndex, marker: null as DropMarkerGeometry | null }
    const listRect = list.getBoundingClientRect()
    const clampedY = Math.max(listRect.top, Math.min(listRect.bottom, clientY))
    const pointerInList = clampedY - listRect.top + list.scrollTop - list.clientTop

    let dropBefore = movableCount
    for (let i = 0; i < movableCount; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      const midpoint = el.offsetTop + el.offsetHeight / 2
      if (pointerInList < midpoint) {
        dropBefore = i
        break
      }
    }

    // No-op drops (the item's own slot) show no drop marker.
    if (dropBefore === fromIndex || dropBefore === fromIndex + 1) {
      return { dropBefore, marker: null }
    }

    let markerY: number
    if (dropBefore === 0) {
      const first = itemRefs.current[0]
      markerY = first ? Math.max(2, first.offsetTop - 3) : 2
    } else if (dropBefore >= movableCount) {
      const prev = itemRefs.current[movableCount - 1]
      const next = itemRefs.current[movableCount]
      markerY =
        prev && next
          ? (prev.offsetTop + prev.offsetHeight + next.offsetTop) / 2
          : prev
            ? prev.offsetTop + prev.offsetHeight + 3
            : list.scrollHeight - 4
    } else {
      const prev = itemRefs.current[dropBefore - 1]
      const next = itemRefs.current[dropBefore]
      markerY = prev && next ? (prev.offsetTop + prev.offsetHeight + next.offsetTop) / 2 : next ? next.offsetTop : 2
    }

    return {
      dropBefore,
      marker: { y: markerY },
    }
  }, [])

  const finishPointerDrag = useCallback(
    (commit: boolean) => {
      const drag = activeDragRef.current
      if (!drag) return
      activeDragRef.current = null
      cancelAnimationFrame(drag.rafId)
      if (drag.handle.hasPointerCapture?.(drag.pointerId)) {
        try {
          drag.handle.releasePointerCapture(drag.pointerId)
        } catch {
          // Pointer capture may already have been released.
        }
      }
      document.documentElement.classList.remove('overview-stops-dragging')
      holdLiveOverview(false)
      setDraggingIndex(null)
      setDragOffsetY(0)
      setDropMarker(null)

      if (!commit) {
        announce(textRef.current.destinations.overviewStops.cancelled(drag.itemTitle))
        return
      }

      const toIndex = drag.dropBefore > drag.fromIndex ? drag.dropBefore - 1 : drag.dropBefore
      const current = snapshotRef.current
      const result = reorderOverviewStops(current.items, current.onJob, drag.fromIndex, toIndex)
      if (!result) return
      const statusMsg = textRef.current.destinations.overviewStops.dropped(
        drag.itemTitle,
        toIndex + 1,
        current.movableCount,
      )
      void commitUids(
        current.routeId,
        result.submitUids,
        textRef.current.destinations.overviewStops.reordered,
        statusMsg,
      )
    },
    [announce, commitUids],
  )

  // Global pointer & Escape listeners while a pointer drag is active.
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = activeDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      const list = listRef.current
      drag.lastClientY = event.clientY
      const scrollDelta = list ? list.scrollTop - drag.startScrollTop : 0
      setDragOffsetY(event.clientY - drag.startClientY + scrollDelta)
      const { dropBefore, marker } = computeDropSpot(event.clientY, drag.fromIndex, drag.movableCount)
      drag.dropBefore = dropBefore
      setDropMarker(marker)
    }

    const onPointerUp = (event: PointerEvent) => {
      const drag = activeDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      finishPointerDrag(true)
    }

    const onPointerCancel = (event: PointerEvent) => {
      const drag = activeDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      finishPointerDrag(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeDragRef.current) {
        event.preventDefault()
        finishPointerDrag(false)
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
      if (activeDragRef.current) {
        cancelAnimationFrame(activeDragRef.current.rafId)
        activeDragRef.current = null
        document.documentElement.classList.remove('overview-stops-dragging')
        holdLiveOverview(false)
      }
    }
  }, [computeDropSpot, finishPointerDrag])

  const handlePointerDown = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || busy || activeDragRef.current) return
    const current = snapshotRef.current
    const item = current.items[index]
    if (!item || item.locked || !item.editable || current.movableCount < 2 || index >= current.movableCount) return
    event.preventDefault()
    event.stopPropagation()

    const handle = event.currentTarget
    const list = listRef.current
    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic events in tests may not support pointer capture.
    }
    holdLiveOverview(true)
    document.documentElement.classList.add('overview-stops-dragging')

    const drag: ActiveDrag = {
      pointerId: event.pointerId,
      handle,
      fromIndex: index,
      itemTitle: item.title,
      movableCount: current.movableCount,
      startClientY: event.clientY,
      startScrollTop: list?.scrollTop ?? 0,
      lastClientY: event.clientY,
      dropBefore: index,
      rafId: 0,
      lastFrameTime: performance.now(),
    }

    const tickAutoScroll = (now: number) => {
      const active = activeDragRef.current
      if (!active || active !== drag) return
      const dt = Math.min((now - active.lastFrameTime) / 1000, 0.05)
      active.lastFrameTime = now
      const scroller = listRef.current
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
        const rect = scroller.getBoundingClientRect()
        const itemHeight = itemRefs.current[active.fromIndex]?.offsetHeight ?? 56
        const edgeZone = Math.min(itemHeight, rect.height / 3)
        let speed = 0
        if (active.lastClientY < rect.top + edgeZone) {
          const depth = Math.min(1.5, (rect.top + edgeZone - active.lastClientY) / Math.max(1, edgeZone))
          speed = -depth * MAX_AUTO_SCROLL_PX_PER_SEC
        } else if (active.lastClientY > rect.bottom - edgeZone) {
          const depth = Math.min(1.5, (active.lastClientY - (rect.bottom - edgeZone)) / Math.max(1, edgeZone))
          speed = depth * MAX_AUTO_SCROLL_PX_PER_SEC
        }
        if (speed !== 0) {
          const prevTop = scroller.scrollTop
          scroller.scrollTop = prevTop + speed * dt
          if (scroller.scrollTop !== prevTop) {
            setDragOffsetY(active.lastClientY - active.startClientY + (scroller.scrollTop - active.startScrollTop))
            const { dropBefore, marker } = computeDropSpot(active.lastClientY, active.fromIndex, active.movableCount)
            active.dropBefore = dropBefore
            setDropMarker(marker)
          }
        }
      }
      active.rafId = requestAnimationFrame(tickAutoScroll)
    }

    activeDragRef.current = drag
    setDraggingIndex(index)
    setDragOffsetY(0)
    setDropMarker(null)
    drag.rafId = requestAnimationFrame(tickAutoScroll)
  }

  // Keyboard grab-move-drop on the drag handle (no extra inline buttons required).
  const handleKeyDown = (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (busy) return
    const current = snapshotRef.current
    const item = current.items[index]
    if (!item || item.locked || !item.editable || current.movableCount < 2 || index >= current.movableCount) return
    touchLiveOverview()

    const words = textRef.current.destinations.overviewStops
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (!keyboardGrab) {
        holdLiveOverview(true)
        setKeyboardGrab({
          startItems: current.items,
          currentIndex: index,
          itemKey: item.key,
          itemTitle: item.title,
        })
        announce(words.grabbed(item.title, index + 1, current.movableCount))
      } else {
        const grab = keyboardGrab
        setKeyboardGrab(null)
        holdLiveOverview(false)
        const startIdx = grab.startItems.findIndex((entry) => entry.key === grab.itemKey)
        if (startIdx >= 0 && startIdx !== grab.currentIndex) {
          const editableSlice = current.onJob ? current.items.slice(0, current.movableCount) : current.items
          const submitUids = editableSlice.map((entry) => entry.uid)
          void commitUids(
            current.routeId,
            submitUids,
            words.reordered,
            words.dropped(grab.itemTitle, grab.currentIndex + 1, current.movableCount),
          )
        } else {
          announce(words.dropped(grab.itemTitle, grab.currentIndex + 1, current.movableCount))
        }
      }
      return
    }

    if (!keyboardGrab) return

    if (event.key === 'Escape') {
      event.preventDefault()
      const grab = keyboardGrab
      setKeyboardGrab(null)
      holdLiveOverview(false)
      setOptimistic(null)
      announce(words.cancelled(grab.itemTitle))
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const delta = event.key === 'ArrowUp' ? -1 : 1
      const targetIndex = Math.max(0, Math.min(current.movableCount - 1, keyboardGrab.currentIndex + delta))
      if (targetIndex === keyboardGrab.currentIndex) return
      const reordered = reorderOverviewStops(current.items, current.onJob, keyboardGrab.currentIndex, targetIndex)
      if (!reordered || current.routeId === null) return
      ignoringBlurRef.current = true
      setOptimistic({ routeId: current.routeId, uids: reordered.submitUids })
      setKeyboardGrab({ ...keyboardGrab, currentIndex: targetIndex })
      announce(words.movedTo(keyboardGrab.itemTitle, targetIndex + 1, current.movableCount))
      requestAnimationFrame(() => {
        itemRefs.current[targetIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        handleRefs.current[targetIndex]?.focus({ preventScroll: true })
        ignoringBlurRef.current = false
      })
    }
  }

  const handleBlur = (index: number) => {
    if (ignoringBlurRef.current || !keyboardGrab || keyboardGrab.currentIndex !== index) return
    const grab = keyboardGrab
    setKeyboardGrab(null)
    holdLiveOverview(false)
    const current = snapshotRef.current
    const startIdx = grab.startItems.findIndex((entry) => entry.key === grab.itemKey)
    if (startIdx >= 0 && startIdx !== grab.currentIndex) {
      const editableSlice = current.onJob ? current.items.slice(0, current.movableCount) : current.items
      void commitUids(
        current.routeId,
        editableSlice.map((entry) => entry.uid),
        textRef.current.destinations.overviewStops.reordered,
      )
    }
  }

  const handleDelete = (index: number) => {
    if (busy || activeDragRef.current) return
    touchLiveOverview()
    const current = snapshotRef.current
    const target = current.items[index]
    const result = deleteOverviewStop(current.items, current.onJob, index)
    if (!result || !target) return
    const notice = result.endsRoute
      ? textRef.current.destinations.done.end
      : textRef.current.destinations.overviewStops.removed(target.title)
    void commitUids(current.routeId, result.submitUids, notice, notice)
  }

  if (snapshot.items.length === 0) return null

  return (
    <OverviewStopsCardView
      snapshot={snapshot}
      text={text}
      busy={busy}
      draggingIndex={draggingIndex}
      dragOffsetY={dragOffsetY}
      dropMarker={dropMarker}
      keyboardGrabbedIndex={keyboardGrab?.currentIndex ?? null}
      statusAnnouncement={statusAnnouncement}
      cardRef={cardRef}
      listRef={listRef}
      setItemRef={(index, el) => {
        itemRefs.current[index] = el
      }}
      setHandleRef={(index, el) => {
        handleRefs.current[index] = el
      }}
      onAddStop={() => {
        touchLiveOverview()
        onAddStop()
      }}
      onDelete={handleDelete}
      onHandlePointerDown={handlePointerDown}
      onHandleKeyDown={handleKeyDown}
      onHandleBlur={handleBlur}
      onInteract={touchLiveOverview}
    />
  )
}

function answerText(answer: RouteAnswer, text: Strings): string {
  switch (answer) {
    case 'alreadyThere':
      return text.destinations.alreadyThere
    case 'full':
      return text.destinations.full
    case 'onJob':
      return text.destinations.onJob
    case 'unsupported':
      return text.destinations.unsupported
    case 'noAnswer':
      return text.destinations.noAnswer
    case 'elevated':
      return text.destinations.elevated
    case 'noSuchNode':
    case 'unexpected':
    case 'done':
      return text.destinations.failed
  }
}

function GripGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.5 6.5h11M4.5 10h11M4.5 13.5h11" />
    </svg>
  )
}

function FlagGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 21V4.2c3.6-1.9 6.6 1.6 11 0v8.6c-4.4 1.6-7.4-1.9-11 0" />
    </svg>
  )
}

function RemoveGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m6 6 8 8M14 6l-8 8" />
    </svg>
  )
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  )
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  )
}
