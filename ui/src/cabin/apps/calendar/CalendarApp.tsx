import { useMemo, useState } from 'react'
import { cabClock, IS_DEMO, isInHost } from '../../../shared/host'
import { useMapData } from '../../maps/mapData'
import { nameOf, usePlaces } from '../../maps/places'
import { addNearestStop, type QuickStopCategory } from '../../maps/quickStop'
import { useCalendarDay } from '../../state/calendarIcon'
import { useClockStyle } from '../../state/hooks'
import { createPreviewSimulation, formatDistance, formatMoney, useSimulation } from '../../state/simulation'
import { useLive } from '../../state/store'
import { useText } from '../../state/text'
import { createPreviewData, isPreviewMode } from '../freight/freight'
import { buildDaySchedule, buildWeekDays, summarizePeriod } from './schedule'
import './calendar.css'

const A_MONDAY = new Date(2024, 0, 1)

interface StopFeedback {
  status: 'loading' | 'ok' | 'error'
  text: string
}

/**
 * Upgraded CarPlay Calendar App (iOS 26 Liquid Glass):
 * - Preserves Apple's signature red weekday header & live game-day icon sync.
 * - Adds 7-day Monday..Sunday week strip, chronological live schedule + HOS/maintenance planning
 *   (with one-tap along-route stop actions), and a 30-day persisted driving & earnings logbook.
 */
export function CalendarApp() {
  const text = useText()
  const isZh = text.locale.toLowerCase().startsWith('zh')
  const clockStyle = useClockStyle()
  const today = useCalendarDay()
  const places = usePlaces()
  const labels = useMapData()?.labels

  const rawTelemetry = useLive((state) => state.telemetry)
  const rawJob = useLive((state) => state.job)
  const weather = useLive((state) => state.weather)
  const clockShift = useLive((state) => state.clockShift)
  const mph = useLive((state) => state.mph)
  const route = useLive((state) => state.route)
  const routeNext = useLive((state) => state.routeNext)
  const routeStops = useLive((state) => state.routeStops)

  const storeLogbook = useSimulation((state) => state.logbook)
  const storeMessages = useSimulation((state) => state.messages)
  const clearLogbook = useSimulation((state) => state.clearLogbook)

  const preview = isPreviewMode(isInHost(), IS_DEMO, typeof location !== 'undefined' ? location.search : '')
  const previewFreight = useMemo(() => (preview ? createPreviewData(isZh) : null), [preview, isZh])
  const previewSim = useMemo(() => (preview ? createPreviewSimulation(text, mph) : null), [preview, text, mph])

  const usingPreview = preview && !rawTelemetry && storeLogbook.length === 0
  const telemetry = rawTelemetry ?? (usingPreview ? (previewFreight?.telemetry ?? null) : null)
  const job = rawJob?.active ? rawJob : usingPreview ? (previewFreight?.job ?? null) : null
  const logbook = usingPreview && previewSim ? previewSim.logbook : storeLogbook

  const todayGameDay = telemetry ? Math.floor(cabClock(telemetry, clockShift) / 1440) : null
  const anchorDay = todayGameDay ?? today.weekday

  const [pickedDay, setPickedDay] = useState<{ day: number; anchor: number } | null>(null)
  const selectedDay = pickedDay && pickedDay.anchor === anchorDay ? pickedDay.day : anchorDay
  const setSelectedDay = (day: number) => setPickedDay({ day, anchor: anchorDay })

  const [stopFeedback, setStopFeedback] = useState<Record<string, StopFeedback>>({})

  const hasOverdueHosAlert = useMemo(() => storeMessages.some((m) => m.id.startsWith('rest-overdue')), [storeMessages])

  const liveContext = useMemo(
    () => ({
      telemetry,
      job,
      weather,
      clockShift,
      mph,
      routeStopsCount: routeStops.length,
      labels,
      hasOverdueHosAlert,
    }),
    [telemetry, job, weather, clockShift, mph, routeStops.length, labels, hasOverdueHosAlert],
  )

  const weekDays = useMemo(
    () => buildWeekDays(todayGameDay, today.weekday, today.date, logbook, liveContext, text),
    [todayGameDay, today.weekday, today.date, logbook, liveContext, text],
  )

  const weekStart = weekDays[0]?.gameDay ?? 0

  const dayItems = useMemo(
    () => buildDaySchedule(selectedDay, anchorDay, liveContext, logbook, clockStyle, text),
    [selectedDay, anchorDay, liveContext, logbook, clockStyle, text],
  )

  const daySummary = useMemo(() => summarizePeriod(logbook, selectedDay, selectedDay), [logbook, selectedDay])
  const weekSummary = useMemo(() => summarizePeriod(logbook, weekStart, weekStart + 6), [logbook, weekStart])

  const selectedSlot = weekDays.find((d) => d.gameDay === selectedDay)
  const displayDate = useMemo(() => {
    const delta = selectedDay - anchorDay
    return new Date(today.date.getFullYear(), today.date.getMonth(), today.date.getDate() + delta)
  }, [selectedDay, anchorDay, today.date])

  const weekdayIndex = selectedSlot?.weekdayIndex ?? ((selectedDay % 7) + 7) % 7
  const weekdayDate = new Date(A_MONDAY.getFullYear(), A_MONDAY.getMonth(), A_MONDAY.getDate() + weekdayIndex)
  const weekdayName = new Intl.DateTimeFormat(text.locale, { weekday: 'long' }).format(weekdayDate)
  const dateLabel = new Intl.DateTimeFormat(text.locale, { day: 'numeric', month: 'long' }).format(displayDate)

  const relativeTag =
    selectedDay === anchorDay
      ? text.calendar.today
      : selectedDay === anchorDay - 1
        ? text.calendar.yesterday
        : selectedDay === anchorDay + 1
          ? text.calendar.tomorrow
          : null

  const handleStopAction = async (itemId: string, stopType: QuickStopCategory) => {
    setStopFeedback((prev) => ({
      ...prev,
      [itemId]: { status: 'loading', text: text.messages.actions.addingStop },
    }))
    if (usingPreview && !rawTelemetry) {
      setStopFeedback((prev) => ({
        ...prev,
        [itemId]: {
          status: 'ok',
          text: text.messages.actions.addedStopDistance(
            stopType === 'rest' ? 'Autohof Venlo' : 'DAF Service',
            mph ? '21 mi' : '34 km',
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
      const fbText =
        typeof result.distanceMeters === 'number'
          ? text.messages.actions.addedStopDistance(placeName, formatDistance(result.distanceMeters / 1000, mph))
          : text.messages.actions.addedStop(placeName)
      setStopFeedback((prev) => ({ ...prev, [itemId]: { status: 'ok', text: fbText } }))
      return
    }
    setStopFeedback((prev) => ({
      ...prev,
      [itemId]: {
        status: 'error',
        text: result.status === 'noPlaces' ? text.messages.actions.stopNoPlaces : text.messages.actions.stopFailed,
      },
    }))
  }

  return (
    <section className="app-panel calendar-app" aria-label={text.apps.calendar}>
      {/* Top Header + 7-Day Week Strip */}
      <header className="cal-top">
        <div className="cal-head">
          <div className="cal-weekday-row">
            <span className="cal-weekday">{weekdayName}</span>
            {relativeTag && <span className="cal-rel-pill">{relativeTag}</span>}
            {usingPreview && <span className="cal-preview-badge">{text.calendar.previewBadge}</span>}
          </div>
          <h1 className="cal-date">{dateLabel}</h1>
        </div>

        <nav className="cal-week-strip glass" aria-label={text.calendar.thisWeek}>
          {weekDays.map((slot) => {
            const selected = slot.gameDay === selectedDay
            return (
              <button
                key={slot.gameDay}
                type="button"
                className={`cal-day-pill${selected ? ' selected' : ''}${slot.isToday ? ' today' : ''}`}
                aria-pressed={selected}
                onClick={() => setSelectedDay(slot.gameDay)}
              >
                <span className="cal-day-short">{slot.shortLabel}</span>
                <span className="cal-day-num">{slot.dayOfMonth}</span>
                <span className="cal-day-dots" aria-hidden="true">
                  {slot.dots.map((dot, i) => (
                    <i key={i} className={`cal-dot ${dot}`} />
                  ))}
                </span>
              </button>
            )
          })}
        </nav>
      </header>

      {/* Main Scrollable Two-Column Content */}
      <div className="cal-scroll">
        <div className="cal-body">
          {/* Left: Chronological Schedule & Trip Log */}
          <div className="cal-timeline-col">
            <div className="cal-section-head">
              <h2 className="cal-section-title">{text.calendar.selectedDay}</h2>
              {storeLogbook.length > 0 && (
                <button type="button" className="cal-clear-btn" onClick={() => clearLogbook()}>
                  {text.calendar.clearLogbook}
                </button>
              )}
            </div>

            {dayItems.length === 0 ? (
              <p className="cal-empty">{selectedDay === anchorDay ? text.noEvents : text.calendar.noEventsDay}</p>
            ) : (
              <div className="cal-events">
                {dayItems.map((item) => {
                  const fb = stopFeedback[item.id]
                  return (
                    <article key={item.id} className={`cal-event tone-${item.tone}`}>
                      <div className="cal-event-accent" aria-hidden="true" />
                      <div className="cal-event-main">
                        <div className="cal-event-top">
                          <span className="cal-event-time">{item.timeText}</span>
                          {item.statusText && <span className={`cal-pill tone-${item.tone}`}>{item.statusText}</span>}
                          {item.amountText && (
                            <span className={`cal-event-amount ${item.amountTone ?? 'neutral'}`}>
                              {item.amountText}
                            </span>
                          )}
                        </div>
                        <h3 className="cal-event-title">{item.title}</h3>
                        {item.subtitle && <p className="cal-event-sub">{item.subtitle}</p>}
                        {item.meta && <p className="cal-event-meta">{item.meta}</p>}
                        {item.action && (
                          <div className="cal-event-action">
                            <button
                              type="button"
                              className="cal-stop-btn"
                              disabled={fb?.status === 'loading'}
                              onClick={() => void handleStopAction(item.id, item.action!.stopType)}
                            >
                              {item.action.label}
                            </button>
                            {fb && <span className={`cal-stop-fb ${fb.status}`}>{fb.text}</span>}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: Daily & Weekly Driving Summary */}
          <aside className="cal-summary-col">
            <section className="cal-summary-card">
              <h2 className="cal-card-title">{text.calendar.summaryTitle}</h2>
              <dl className="cal-kv">
                <div>
                  <dt>{text.calendar.jobsDelivered}</dt>
                  <dd>{daySummary.deliveredCount}</dd>
                </div>
                <div>
                  <dt>{text.calendar.totalDistance}</dt>
                  <dd>{formatDistance(daySummary.distanceKm, mph)}</dd>
                </div>
                <div>
                  <dt>{text.calendar.grossIncome}</dt>
                  <dd className="tone-good">{formatMoney(daySummary.grossIncome, mph)}</dd>
                </div>
                <div>
                  <dt>{text.calendar.roadExpenses}</dt>
                  <dd className={daySummary.roadExpenses > 0 ? 'tone-bad' : ''}>
                    {daySummary.roadExpenses > 0
                      ? `-${formatMoney(daySummary.roadExpenses, mph)}`
                      : formatMoney(0, mph)}
                  </dd>
                </div>
                <div className="featured">
                  <dt>{text.calendar.netProfit}</dt>
                  <dd className={daySummary.netProfit >= 0 ? 'tone-good' : 'tone-bad'}>
                    {daySummary.netProfit >= 0
                      ? formatMoney(daySummary.netProfit, mph)
                      : `-${formatMoney(Math.abs(daySummary.netProfit), mph)}`}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="cal-summary-card">
              <h2 className="cal-card-title">{text.calendar.weeklySummaryTitle}</h2>
              <dl className="cal-kv">
                <div>
                  <dt>{text.calendar.jobsDelivered}</dt>
                  <dd>{weekSummary.deliveredCount}</dd>
                </div>
                <div>
                  <dt>{text.calendar.totalDistance}</dt>
                  <dd>{formatDistance(weekSummary.distanceKm, mph)}</dd>
                </div>
                <div>
                  <dt>{text.calendar.grossIncome}</dt>
                  <dd className="tone-good">{formatMoney(weekSummary.grossIncome, mph)}</dd>
                </div>
                <div>
                  <dt>{text.calendar.roadExpenses}</dt>
                  <dd className={weekSummary.roadExpenses > 0 ? 'tone-bad' : ''}>
                    {weekSummary.roadExpenses > 0
                      ? `-${formatMoney(weekSummary.roadExpenses, mph)}`
                      : formatMoney(0, mph)}
                  </dd>
                </div>
                <div className="featured">
                  <dt>{text.calendar.netProfit}</dt>
                  <dd className={weekSummary.netProfit >= 0 ? 'tone-good' : 'tone-bad'}>
                    {weekSummary.netProfit >= 0
                      ? formatMoney(weekSummary.netProfit, mph)
                      : `-${formatMoney(Math.abs(weekSummary.netProfit), mph)}`}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </section>
  )
}
