import { useState } from 'react'
import { formatTripDistance } from '../../shared/format'
import { SearchGlyph } from '../keyboard/glyphs'
import { useLive } from '../state/store'
import { type Strings, useText } from '../state/text'
import { overviewLiveRoute } from './liveMap'
import { useMapScale } from './mapData'
import { type QuantizedTripSnapshot, useQuantizedTrip } from './navigationSnapshot'
import { nameOf, usePlaces } from './places'
import { addNearestStop, type QuickStopCategory } from './quickStop'
import { changeRoute } from './routeChange'

const QUICK_CATEGORIES: readonly QuickStopCategory[] = ['fuel', 'rest', 'service']

export interface TripBarViewProps {
  trip: QuantizedTripSnapshot | null
  interactive: boolean
  concealed: boolean
  hasMapData: boolean
  expanded: boolean
  busyStop: QuickStopCategory | null
  endingRoute: boolean
  text: Strings
  onToggleExpand?: () => void
  onQuickStop?: (category: QuickStopCategory) => void
  onOverview?: () => void
  onEndRoute?: () => void
  onOpenSearch?: () => void
}

/**
 * Pure presentation for the bottom-left Liquid Glass Trip Bar (Dashboard compact pill vs Maps interactive
 * trip controller + one-tap along-route pit-stop strip).
 */
export function TripBarView({
  trip,
  interactive,
  concealed,
  hasMapData,
  expanded,
  busyStop,
  endingRoute,
  text,
  onToggleExpand,
  onQuickStop,
  onOverview,
  onEndRoute,
  onOpenSearch,
}: TripBarViewProps) {
  // Dashboard: compact non-interactive ETA pill (unchanged structural contract).
  if (!interactive) {
    if (!trip) return null
    return (
      <div className="eta-pill glass" aria-hidden={concealed}>
        <div className="eta-arrival">
          <b>{trip.arrival}</b> <span>{text.arrival}</span>
        </div>
        <div className="eta-remaining">
          <span>{trip.time}</span>
          <span className="dot">·</span>
          <span>{trip.distance}</span>
        </div>
        <div
          className="eta-progress-track"
          role="progressbar"
          aria-valuenow={trip.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={text.arrival}
        >
          <div className="eta-progress-fill" style={{ width: `${trip.progressPercent}%` }} />
        </div>
      </div>
    )
  }

  // Maps app — Free-driving (no active route): sleek Liquid Glass quick search + nearest pit-stop bar.
  if (!trip) {
    if (!hasMapData) return null
    return (
      <div className="nav-trip-cluster free-drive-cluster" aria-hidden={concealed}>
        <div className="free-drive-bar glass" role="toolbar" aria-label={text.destinations.quickStops.nearbyTitle}>
          <button type="button" className="free-drive-search-btn" onClick={onOpenSearch}>
            <SearchGlyph />
            <span>{text.search}</span>
          </button>
          <span className="free-drive-divider" aria-hidden />
          <div className="free-drive-stops">
            {QUICK_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`pitstop-chip pitstop-${category}${busyStop === category ? ' busy' : ''}`}
                disabled={busyStop !== null}
                onClick={() => onQuickStop?.(category)}
              >
                <PitStopGlyph category={category} />
                <span>{text.destinations.quickStops[category]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Maps app — Active route: tappable Liquid Glass Trip Bar with expandable pit-stop & route action sheet.
  return (
    <div className={`nav-trip-cluster${expanded ? ' expanded' : ''}`} aria-hidden={concealed}>
      {expanded && !concealed && (
        <div className="trip-drawer glass" role="region" aria-label={text.destinations.tripActions}>
          <div className="trip-drawer-head">
            <span className="trip-drawer-title">{text.destinations.quickStops.alongTitle}</span>
            {trip.stopCount > 0 && (
              <span className="trip-stops-badge">{text.destinations.stopsCount(trip.stopCount)}</span>
            )}
          </div>
          <div className="trip-pitstops">
            {QUICK_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`trip-pitstop-btn pitstop-${category}${busyStop === category ? ' busy' : ''}`}
                disabled={busyStop !== null || endingRoute}
                onClick={() => onQuickStop?.(category)}
              >
                <span className="trip-pitstop-icon" aria-hidden="true">
                  <PitStopGlyph category={category} />
                </span>
                <span className="trip-pitstop-label">
                  {busyStop === category ? text.destinations.quickStops.searching : text.destinations.quickStops[category]}
                </span>
              </button>
            ))}
          </div>
          <div className="trip-route-actions">
            <button
              type="button"
              className="trip-action-btn overview"
              disabled={endingRoute}
              onClick={onOverview}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="5" cy="18" r="2" />
                <circle cx="19" cy="6" r="2" />
                <path d="M5 16v-4a3 3 0 0 1 3-3h8a3 3 0 0 0 3-3" />
              </svg>
              <span>{text.routeOverview}</span>
            </button>
            {trip.onJob ? (
              <div className="trip-job-lock" role="note">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="10" rx="2.4" />
                  <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
                </svg>
                <span>{text.destinations.jobLocked}</span>
              </div>
            ) : (
              <button
                type="button"
                className="trip-action-btn danger"
                disabled={endingRoute || busyStop !== null}
                onClick={onEndRoute}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
                <span>{text.destinations.endRoute}</span>
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`eta-pill eta-pill-interactive glass${expanded ? ' open' : ''}`}
        aria-expanded={expanded}
        aria-label={text.destinations.tripActions}
        onClick={onToggleExpand}
      >
        <div className="eta-header-row">
          <div className="eta-arrival">
            <b>{trip.arrival}</b> <span>{text.arrival}</span>
          </div>
          <span className="eta-chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <path d="m5.5 12 4.5-4.5 4.5 4.5" />
            </svg>
          </span>
        </div>
        <div className="eta-remaining">
          <span>{trip.time}</span>
          <span className="dot">·</span>
          <span>{trip.distance}</span>
          {trip.stopCount > 0 && <span className="eta-stop-dot">+{trip.stopCount}</span>}
        </div>
        <div
          className="eta-progress-track"
          role="progressbar"
          aria-valuenow={trip.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={text.arrival}
        >
          <div className="eta-progress-fill" style={{ width: `${trip.progressPercent}%` }} />
        </div>
      </button>
    </div>
  )
}

function PitStopGlyph({ category }: { category: QuickStopCategory }) {
  switch (category) {
    case 'fuel':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 20V6.5A2.5 2.5 0 0 1 7.5 4h5A2.5 2.5 0 0 1 15 6.5V20M3.5 20h13" />
          <path d="M7.5 8h5v4h-5z" />
          <path d="M15 9.5h1.5a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0v-5l-2.5-2.5" />
        </svg>
      )
    case 'rest':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18V7.5M4 14h16v4M4 12.5h5.5a2.5 2.5 0 0 1 2.5 2.5v-1h8v-1.5a3 3 0 0 0-3-3h-5.5" />
          <circle cx="8" cy="9.5" r="1.6" />
        </svg>
      )
    case 'service':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.7 6.3a4.5 4.5 0 0 0-5.8 5.8l-4.6 4.6a1.6 1.6 0 0 0 2.3 2.3l4.6-4.6a4.5 4.5 0 0 0 5.8-5.8l-2.3 2.3-2.3-2.3 2.3-2.3Z" />
        </svg>
      )
  }
}

export function TripBar({
  interactive,
  concealed,
  hasMapData,
  expanded,
  onExpandedChange,
  onOpenSearch,
  onNotify,
}: {
  interactive: boolean
  concealed: boolean
  hasMapData: boolean
  expanded: boolean
  onExpandedChange: (next: boolean) => void
  onOpenSearch?: () => void
  onNotify?: (message: string) => void
}) {
  const text = useText()
  const trip = useQuantizedTrip()
  const places = usePlaces()
  const scale = useMapScale()
  const [busyStop, setBusyStop] = useState<QuickStopCategory | null>(null)
  const [endingRoute, setEndingRoute] = useState(false)

  const handleQuickStop = async (category: QuickStopCategory) => {
    if (busyStop || endingRoute) return
    setBusyStop(category)
    try {
      const live = useLive.getState()
      const result = await addNearestStop(places, category, {
        telemetry: live.telemetry,
        route: live.route,
        routeNext: live.routeNext,
        job: live.job,
      })
      if (result.status === 'added' && result.place) {
        const label = nameOf(result.place, text.destinations.kinds[result.place.kind])
        const dist =
          result.distanceMeters !== undefined && result.distanceMeters > 0
            ? formatTripDistance(result.distanceMeters * scale, text.decimal, live.mph)
            : ''
        onExpandedChange(false)
        onNotify?.(
          dist
            ? text.destinations.quickStops.addedDistance(label, dist)
            : text.destinations.quickStops.added(label),
        )
      } else if (result.status === 'noPlaces') {
        onNotify?.(text.destinations.quickStops.noNearby)
      } else {
        onNotify?.(text.destinations.failed)
      }
    } finally {
      setBusyStop(null)
    }
  }

  const handleEndRoute = async () => {
    if (endingRoute) return
    setEndingRoute(true)
    try {
      const answer = await changeRoute('end')
      if (answer === 'done') {
        onExpandedChange(false)
        onNotify?.(text.destinations.done.end)
      } else {
        onNotify?.(text.destinations.failed)
      }
    } finally {
      setEndingRoute(false)
    }
  }

  return (
    <TripBarView
      trip={trip}
      interactive={interactive}
      concealed={concealed}
      hasMapData={hasMapData}
      expanded={expanded}
      busyStop={busyStop}
      endingRoute={endingRoute}
      text={text}
      onToggleExpand={() => onExpandedChange(!expanded)}
      onQuickStop={handleQuickStop}
      onOverview={() => {
        onExpandedChange(false)
        overviewLiveRoute()
      }}
      onEndRoute={handleEndRoute}
      onOpenSearch={() => {
        onExpandedChange(false)
        onOpenSearch?.()
      }}
    />
  )
}
