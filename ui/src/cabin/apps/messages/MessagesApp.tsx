import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { cabClock, IS_DEMO, isInHost } from '../../../shared/host'
import { useMapData } from '../../maps/mapData'
import { addNearestStop, type QuickStopCategory } from '../../maps/quickStop'
import { nameOf, usePlaces } from '../../maps/places'
import { useClockStyle } from '../../state/hooks'
import {
  createPreviewSimulation,
  formatDistance,
  type QuickReplyId,
  type SimMessage,
  type ThreadId,
  useSimulation,
} from '../../state/simulation'
import { go, useLive } from '../../state/store'
import { useText } from '../../state/text'
import { createPreviewData, isPreviewMode } from '../freight/freight'
import {
  AlertTriangleGlyph,
  BackGlyph,
  BellGlyph,
  BellSlashGlyph,
  CheckCircleGlyph,
  ChevronDownGlyph,
  InfoCircleGlyph,
  MapArrowGlyph,
  MessageBubbleGlyph,
  QuickReplyGlyph,
  StopCategoryGlyph,
  ThreadAvatarGlyph,
  TrashGlyph,
} from './glyphs'
import {
  buildThreadLiveStatus,
  buildThreadSummaries,
  formatMessageTime,
  groupThreadMessages,
  type MessageAlertTone,
  quickReplyLabel,
  quickReplyStopCategory,
  stopActionLabel,
  THREAD_QUICK_REPLIES,
} from './messages'
import './messages.css'

interface StopFeedback {
  status: 'loading' | 'ok' | 'error'
  text: string
}

function alertBadgeLabel(tone: MessageAlertTone, alerts: ReturnType<typeof useText>['messages']['alerts']): string {
  switch (tone) {
    case 'critical':
      return alerts.critical
    case 'warning':
      return alerts.warning
    case 'success':
      return alerts.completed
    case 'info':
      return alerts.notice
  }
}

function AlertBadgeIcon({ tone }: { tone: MessageAlertTone }) {
  switch (tone) {
    case 'critical':
    case 'warning':
      return <AlertTriangleGlyph size={14} />
    case 'success':
      return <CheckCircleGlyph size={14} />
    case 'info':
      return <InfoCircleGlyph size={14} />
  }
}

/**
 * CarPlay Messages App (iOS 26 Liquid Glass):
 * - Left pane: interactive DND toggle, two-step clear confirmation, and keyboard-navigable threads.
 * - Right pane: floating Liquid Glass header with live status pill, grouped bubbles with time dividers,
 *   semantic alert tags, structured stop action cards with Maps handoff, smart auto-scroll, and
 *   a single-row horizontal swipeable CarPlay quick-reply strip.
 */
export function MessagesApp() {
  const idPrefix = useId()
  const text = useText()
  const isZh = text.locale.toLowerCase().startsWith('zh')
  const clockStyle = useClockStyle()
  const places = usePlaces()
  const labels = useMapData()?.labels

  const rawTelemetry = useLive((state) => state.telemetry)
  const clockShift = useLive((state) => state.clockShift)
  const mph = useLive((state) => state.mph)
  const route = useLive((state) => state.route)
  const routeNext = useLive((state) => state.routeNext)
  const rawJob = useLive((state) => state.job)
  const truckersmp = useLive((state) => state.truckersmp)
  const nearby = useLive((state) => state.nearby)

  const storeMessages = useSimulation((state) => state.messages)
  const activeThread = useSimulation((state) => state.activeThread)
  const dnd = useSimulation((state) => state.dnd)
  const setDnd = useSimulation((state) => state.setDnd)
  const setActiveThread = useSimulation((state) => state.setActiveThread)
  const markThreadRead = useSimulation((state) => state.markThreadRead)
  const dismissBanner = useSimulation((state) => state.dismissBanner)
  const clearMessages = useSimulation((state) => state.clearMessages)
  const sendQuickReply = useSimulation((state) => state.sendQuickReply)
  const banner = useSimulation((state) => state.banner)

  const preview = isPreviewMode(isInHost(), IS_DEMO, typeof location !== 'undefined' ? location.search : '')
  const previewSeed = useMemo(() => (preview ? createPreviewSimulation(text, mph) : null), [preview, text, mph])
  const previewFreight = useMemo(() => (preview ? createPreviewData(isZh) : null), [preview, isZh])
  const [previewExtra, setPreviewExtra] = useState<SimMessage[]>([])
  const [previewCleared, setPreviewCleared] = useState(false)
  const [previewRead, setPreviewRead] = useState<Set<ThreadId>>(() => new Set([activeThread]))

  const usingPreview = preview && storeMessages.length === 0 && previewSeed !== null
  const telemetry = rawTelemetry ?? (usingPreview ? (previewFreight?.telemetry ?? null) : null)
  const job = rawJob?.active ? rawJob : usingPreview ? (previewFreight?.job ?? null) : null

  const messages = useMemo(() => {
    if (!usingPreview || !previewSeed) return storeMessages
    if (previewCleared) return previewExtra
    return [...previewSeed.messages, ...previewExtra].map((m) =>
      previewRead.has(m.thread) && !m.read ? { ...m, read: true } : m,
    )
  }, [usingPreview, previewSeed, previewCleared, previewExtra, previewRead, storeMessages])

  // On narrow screens, switch smoothly between list and detail views.
  const [narrowDetailOpen, setNarrowDetailOpen] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)
  const [stopFeedback, setStopFeedback] = useState<Record<string, StopFeedback>>({})
  const [scrolledState, setScrolledState] = useState<{ thread: ThreadId; seenCount: number } | null>(null)

  const streamRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const tabRefs = useRef<Partial<Record<ThreadId, HTMLButtonElement | null>>>({})

  const currentGameTime = rawTelemetry ? cabClock(rawTelemetry, clockShift) : usingPreview ? 3780 : null

  const summaries = useMemo(() => buildThreadSummaries(messages, truckersmp, text), [messages, truckersmp, text])

  // Ensure activeThread is always one of the visible threads.
  const resolvedThread: ThreadId = summaries.some((s) => s.id === activeThread)
    ? activeThread
    : (summaries[0]?.id ?? 'dispatch')

  const threadMessages = useMemo(() => messages.filter((m) => m.thread === resolvedThread), [messages, resolvedThread])

  const streamEntries = useMemo(
    () => groupThreadMessages(threadMessages, currentGameTime, text.days, clockStyle, text.messages.today),
    [threadMessages, currentGameTime, text.days, clockStyle, text.messages.today],
  )

  const liveStatus = useMemo(
    () =>
      buildThreadLiveStatus(
        resolvedThread,
        {
          job,
          telemetry,
          mph,
          truckersmp,
          nearbyCount: nearby?.players.length ?? 0,
          threadMessageCount: threadMessages.length,
          isZh,
          labels,
        },
        text,
      ),
    [resolvedThread, job, telemetry, mph, truckersmp, nearby, threadMessages.length, isZh, labels, text],
  )

  const prevThreadRef = useRef<ThreadId>(resolvedThread)
  const lastSender = threadMessages[threadMessages.length - 1]?.sender

  useEffect(() => {
    if (usingPreview) return
    markThreadRead(resolvedThread)
    if (banner?.thread === resolvedThread) {
      dismissBanner()
    }
  }, [resolvedThread, threadMessages.length, usingPreview, markThreadRead, dismissBanner, banner?.thread])

  useEffect(() => {
    const el = streamRef.current
    const threadChanged = prevThreadRef.current !== resolvedThread
    prevThreadRef.current = resolvedThread
    if (!el) return
    if (threadChanged) {
      nearBottomRef.current = true
      el.scrollTop = el.scrollHeight
      return
    }
    if (nearBottomRef.current || lastSender === 'me') {
      const prefersReduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (typeof el.scrollTo === 'function' && !prefersReduced) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [resolvedThread, threadMessages.length, lastSender])

  useEffect(() => {
    if (!confirmClear) return
    const timer = setTimeout(() => {
      setConfirmClear(false)
    }, 4500)
    return () => clearTimeout(timer)
  }, [confirmClear])

  const selectThread = (thread: ThreadId) => {
    nearBottomRef.current = true
    setScrolledState(null)
    setActiveThread(thread)
    setNarrowDetailOpen(true)
    if (usingPreview) {
      setPreviewRead((prev) => new Set(prev).add(thread))
    }
  }

  const handleTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (summaries.length === 0) return
    const currentIndex = summaries.findIndex((item) => item.id === resolvedThread)
    const fallbackIndex = currentIndex >= 0 ? currentIndex : 0
    let targetIndex: number | null = null

    if (event.key === 'ArrowDown') {
      targetIndex = (fallbackIndex + 1) % summaries.length
    } else if (event.key === 'ArrowUp') {
      targetIndex = (fallbackIndex - 1 + summaries.length) % summaries.length
    } else if (event.key === 'Home') {
      targetIndex = 0
    } else if (event.key === 'End') {
      targetIndex = summaries.length - 1
    }

    if (targetIndex === null) return
    event.preventDefault()
    const next = summaries[targetIndex]
    if (!next) return
    selectThread(next.id)
    tabRefs.current[next.id]?.focus()
  }

  const handleStreamScroll = () => {
    const el = streamRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom <= 48) {
      nearBottomRef.current = true
      if (scrolledState !== null) {
        setScrolledState(null)
      }
    } else if (distFromBottom > 96) {
      nearBottomRef.current = false
      if (!scrolledState || scrolledState.thread !== resolvedThread) {
        setScrolledState({ thread: resolvedThread, seenCount: threadMessages.length })
      }
    }
  }

  const jumpToLatest = () => {
    nearBottomRef.current = true
    setScrolledState(null)
    const el = streamRef.current
    if (!el) return
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (typeof el.scrollTo === 'function' && !prefersReduced) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }

  const handleConfirmClear = () => {
    if (usingPreview) {
      setPreviewCleared(true)
      setPreviewExtra([])
    } else {
      clearMessages()
    }
    setConfirmClear(false)
    setScrolledState(null)
  }

  const handleAddStop = async (feedbackKey: string, stopType: QuickStopCategory) => {
    setStopFeedback((prev) => ({
      ...prev,
      [feedbackKey]: { status: 'loading', text: text.messages.actions.addingStop },
    }))
    if (usingPreview && !rawTelemetry) {
      setStopFeedback((prev) => ({
        ...prev,
        [feedbackKey]: {
          status: 'ok',
          text: text.messages.actions.addedStopDistance(
            stopType === 'fuel' ? 'Shell A12' : stopType === 'rest' ? 'Autohof Venlo' : 'DAF Service',
            mph ? '18 mi' : '29 km',
          ),
        },
      }))
      return
    }
    const result = await addNearestStop(places, stopType, {
      telemetry: rawTelemetry,
      route,
      routeNext,
      job: rawJob,
    })
    if (result.status === 'added' && result.place) {
      const generic = text.destinations.kinds[result.place.kind]
      const placeName = nameOf(result.place, generic)
      const feedbackText =
        typeof result.distanceMeters === 'number'
          ? text.messages.actions.addedStopDistance(placeName, formatDistance(result.distanceMeters / 1000, mph))
          : text.messages.actions.addedStop(placeName)
      setStopFeedback((prev) => ({
        ...prev,
        [feedbackKey]: { status: 'ok', text: feedbackText },
      }))
      return
    }
    setStopFeedback((prev) => ({
      ...prev,
      [feedbackKey]: {
        status: 'error',
        text: result.status === 'noPlaces' ? text.messages.actions.stopNoPlaces : text.messages.actions.stopFailed,
      },
    }))
  }

  const handleQuickReply = (replyId: QuickReplyId) => {
    nearBottomRef.current = true
    setScrolledState(null)
    const stamp = currentGameTime ?? 0
    if (usingPreview) {
      setPreviewExtra((prev) => [
        ...prev,
        {
          id: `preview-me-${Date.now()}`,
          thread: resolvedThread,
          sender: 'me',
          body: quickReplyLabel(replyId, text),
          gameTime: stamp,
          createdAt: Date.now(),
          read: true,
          priority: 'normal',
        },
      ])
    } else {
      sendQuickReply(resolvedThread, replyId, stamp, text)
    }
    const stopCat = quickReplyStopCategory(replyId)
    if (stopCat) {
      void handleAddStop(`reply-${resolvedThread}-${replyId}`, stopCat)
    }
  }

  const activeMeta = text.messages.threads[resolvedThread]
  const quickReplies = THREAD_QUICK_REPLIES[resolvedThread]
  const quickReplyFeedback = quickReplies
    .map((id) => stopFeedback[`reply-${resolvedThread}-${id}`])
    .find((item) => item !== undefined)

  const canClear = storeMessages.length > 0 || (usingPreview && messages.length > 0)
  const isScrolledUp = scrolledState?.thread === resolvedThread && threadMessages.length > 0
  const unseenBelow = isScrolledUp ? Math.max(0, threadMessages.length - scrolledState.seenCount) : 0

  return (
    <section
      className={`app-panel messages-app${narrowDetailOpen ? ' show-detail' : ''}`}
      data-thread={resolvedThread}
      aria-label={text.apps.messages}
    >
      <div className="msg-layout">
        {/* Left Column: Conversation List */}
        <aside className="msg-sidebar" aria-label={text.messages.title}>
          <header className="msg-side-head">
            <div className="msg-side-bar">
              <h1 className="msg-side-title">{text.messages.title}</h1>
              <div className="msg-side-controls">
                <button
                  type="button"
                  className={`msg-dnd-btn${dnd ? ' active' : ''}`}
                  aria-pressed={dnd}
                  aria-label={dnd ? text.messages.dndToggleOff : text.messages.dndToggleOn}
                  onClick={() => setDnd(!dnd)}
                >
                  {dnd ? <BellSlashGlyph size={15} /> : <BellGlyph size={16} />}
                  {dnd && <span>{text.messages.dndBadge}</span>}
                </button>

                {canClear && !confirmClear && (
                  <button
                    type="button"
                    className="msg-clear-btn"
                    aria-label={text.messages.clearAll}
                    onClick={() => setConfirmClear(true)}
                  >
                    <TrashGlyph size={16} />
                  </button>
                )}
              </div>
            </div>

            {(usingPreview || confirmClear) && (
              <div className="msg-side-subrow">
                {usingPreview && <span className="msg-preview-pill">{text.messages.previewBadge}</span>}
                {confirmClear && (
                  <div className="msg-clear-confirm">
                    <button type="button" className="msg-confirm-clear-btn" onClick={handleConfirmClear}>
                      {text.messages.confirmClear}
                    </button>
                    <button type="button" className="msg-cancel-clear-btn" onClick={() => setConfirmClear(false)}>
                      {text.messages.cancel}
                    </button>
                  </div>
                )}
              </div>
            )}
          </header>

          <div
            className="msg-thread-list"
            role="tablist"
            aria-orientation="vertical"
            aria-label={text.messages.title}
            onKeyDown={handleTabListKeyDown}
          >
            {summaries.map((item) => {
              const selected = item.id === resolvedThread
              const hasUnread = item.unreadCount > 0
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    tabRefs.current[item.id] = el
                  }}
                  id={`${idPrefix}-tab-${item.id}`}
                  type="button"
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  aria-selected={selected}
                  aria-controls={`${idPrefix}-panel`}
                  className={`msg-thread-row${selected ? ' selected' : ''}${hasUnread ? ' unread' : ''}`}
                  onClick={() => selectThread(item.id)}
                >
                  <span className={`msg-unread-dot${hasUnread ? ' active' : ''}`} aria-hidden="true" />
                  <span className={`msg-avatar tone-${item.id}`} aria-hidden="true">
                    <ThreadAvatarGlyph thread={item.id} size={22} />
                  </span>
                  <div className="msg-thread-body">
                    <div className="msg-thread-top">
                      <span className="msg-thread-name">{item.name}</span>
                      {item.lastMessage && (
                        <span className="msg-thread-time">
                          {formatMessageTime(item.lastMessage.gameTime, currentGameTime, text.days, clockStyle)}
                        </span>
                      )}
                    </div>
                    <div className="msg-thread-bottom">
                      <span className="msg-thread-snippet">{item.lastMessage?.body ?? item.role}</span>
                      {hasUnread && (
                        <span className="msg-unread-count" aria-label={text.messages.unreadBadge(item.unreadCount)}>
                          {item.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Right Column: Active Conversation */}
        <div
          id={`${idPrefix}-panel`}
          className="msg-detail"
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-${resolvedThread}`}
        >
          <header className="msg-detail-head glass">
            <button
              type="button"
              className="msg-back-btn"
              aria-label={text.messages.back}
              onClick={() => setNarrowDetailOpen(false)}
            >
              <BackGlyph size={20} />
            </button>
            <span className={`msg-avatar small tone-${resolvedThread}`} aria-hidden="true">
              <ThreadAvatarGlyph thread={resolvedThread} size={18} />
            </span>
            <div className="msg-detail-meta">
              <h2 className="msg-detail-name">{activeMeta.name}</h2>
              <div className="msg-detail-role">{activeMeta.role}</div>
            </div>
            {liveStatus && (
              <div className={`msg-live-pill tone-${liveStatus.tone}`}>
                <span className="msg-live-dot" aria-hidden="true" />
                <span className="msg-live-label">{liveStatus.label}</span>
              </div>
            )}
          </header>

          <div ref={streamRef} className="msg-stream" onScroll={handleStreamScroll}>
            {messages.length === 0 ? (
              <div className="msg-empty">
                <div className="msg-empty-icon">
                  <MessageBubbleGlyph size={38} />
                </div>
                <h3 className="msg-empty-title">{text.messages.emptyTitle}</h3>
                <p className="msg-empty-desc">{text.messages.emptyDesc}</p>
              </div>
            ) : threadMessages.length === 0 ? (
              <div className="msg-empty">
                <span className={`msg-avatar large tone-${resolvedThread}`} aria-hidden="true">
                  <ThreadAvatarGlyph thread={resolvedThread} size={30} />
                </span>
                <h3 className="msg-empty-title">{activeMeta.name}</h3>
                <p className="msg-empty-desc">{text.messages.emptyByThread[resolvedThread]}</p>
              </div>
            ) : (
              <div className="msg-bubbles">
                {streamEntries.map((entry) => {
                  if (entry.kind === 'divider') {
                    return (
                      <div key={entry.id} className="msg-time-divider">
                        <span>{entry.label}</span>
                      </div>
                    )
                  }

                  const { message: msg, groupPos, showStamp, alertTone } = entry
                  const fb = stopFeedback[msg.id]
                  const stopType = msg.action?.kind === 'addStop' ? msg.action.stopType : null
                  const stopAdded = fb?.status === 'ok'

                  return (
                    <div key={msg.id} className={`msg-row ${msg.sender} pos-${groupPos}`}>
                      <article className={`msg-bubble ${msg.sender}${alertTone ? ` alert-${alertTone}` : ''}`}>
                        {alertTone && (
                          <div className={`msg-alert-tag tone-${alertTone}`}>
                            <AlertBadgeIcon tone={alertTone} />
                            <span>{alertBadgeLabel(alertTone, text.messages.alerts)}</span>
                          </div>
                        )}
                        <p className="msg-text">{msg.body}</p>

                        {stopType && (
                          <div className={`msg-stop-card category-${stopType}${stopAdded ? ' done' : ''}`}>
                            <div className="msg-stop-main">
                              <span className={`msg-stop-tile category-${stopType}`} aria-hidden="true">
                                <StopCategoryGlyph category={stopType} size={18} />
                              </span>
                              <div className="msg-stop-actions">
                                <button
                                  type="button"
                                  className={`msg-action-btn${stopAdded ? ' done' : ''}`}
                                  disabled={fb?.status === 'loading' || stopAdded}
                                  onClick={() => void handleAddStop(msg.id, stopType)}
                                >
                                  {stopAdded && <CheckCircleGlyph size={16} />}
                                  <span>
                                    {stopAdded ? text.messages.actions.stopAddedLabel : stopActionLabel(stopType, text)}
                                  </span>
                                </button>
                                {stopAdded && (
                                  <button
                                    type="button"
                                    className="msg-map-jump-btn"
                                    onClick={() => go({ type: 'openApp', app: 'maps' })}
                                  >
                                    <MapArrowGlyph size={14} />
                                    <span>{text.messages.actions.viewOnMap}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            {fb && (
                              <div
                                className={`msg-stop-status ${fb.status}`}
                                aria-live={fb.status === 'loading' ? 'off' : 'polite'}
                              >
                                {fb.text}
                              </div>
                            )}
                          </div>
                        )}

                        {showStamp && (
                          <div className="msg-stamp">
                            {formatMessageTime(msg.gameTime, currentGameTime, text.days, clockStyle)}
                          </div>
                        )}
                      </article>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {isScrolledUp && (
            <div className="msg-jump-wrap">
              <button type="button" className="msg-jump-btn glass" onClick={jumpToLatest}>
                <ChevronDownGlyph size={15} />
                <span>{unseenBelow > 0 ? text.messages.newMessages(unseenBelow) : text.messages.jumpToLatest}</span>
              </button>
            </div>
          )}

          <footer className="msg-reply-bar" aria-label={text.messages.quickReplyHeading}>
            {quickReplyFeedback && (
              <div
                className={`msg-reply-feedback ${quickReplyFeedback.status}`}
                aria-live={quickReplyFeedback.status === 'loading' ? 'off' : 'polite'}
              >
                <span>{quickReplyFeedback.text}</span>
                {quickReplyFeedback.status === 'ok' && (
                  <button
                    type="button"
                    className="msg-map-jump-btn inline"
                    onClick={() => go({ type: 'openApp', app: 'maps' })}
                  >
                    <MapArrowGlyph size={14} />
                    <span>{text.messages.actions.viewOnMap}</span>
                  </button>
                )}
              </div>
            )}
            <div className="msg-reply-pills">
              {quickReplies.map((replyId) => (
                <button
                  key={replyId}
                  type="button"
                  className="msg-reply-pill"
                  onClick={() => handleQuickReply(replyId)}
                >
                  <QuickReplyGlyph replyId={replyId} size={15} />
                  <span>{quickReplyLabel(replyId, text)}</span>
                </button>
              ))}
            </div>
          </footer>
        </div>
      </div>
    </section>
  )
}
