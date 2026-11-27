import { useEffect, useRef, useState } from 'react'
import { SearchGlyph } from '../keyboard/glyphs'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import {
  followBearing,
  northUpLiveMap,
  overviewLiveRoute,
  recentreLiveMap,
  useMapBrowsing,
  zoomLiveMap,
} from './liveMap'

/**
 * The Maps app's bottom-right corner dock: two stacked vertical 2-button capsules on the right edge
 * ([Recentre | Compass] above [+ | -]), paired with a horizontal action capsule ([Search | Route Overview])
 * whenever a route is active or the search drawer is open.
 */
export function MapControls({
  searchOpen = false,
  onToggleSearch,
}: {
  searchOpen?: boolean
  onToggleSearch?: () => void
}) {
  const browsing = useMapBrowsing((state) => state.browsing)
  const text = useText()
  const overview = useMapBrowsing((state) => state.routeOverview)
  const overviewLocked = useMapBrowsing((state) => state.routeOverviewLocked)
  const northUp = useMapBrowsing((state) => state.northUp)
  const hasRoute = useLive((state) => state.route !== null && (state.telemetry?.navigationDistance ?? 0) > 0)
  return (
    <MapControlsView
      browsing={browsing}
      overview={overview}
      overviewLocked={overviewLocked}
      northUp={northUp}
      hasRoute={hasRoute}
      searchOpen={searchOpen}
      labels={text}
      onRecentre={recentreLiveMap}
      onToggleSearch={onToggleSearch}
      onOverview={overviewLiveRoute}
      onNorthUp={northUpLiveMap}
      onZoom={zoomLiveMap}
    />
  )
}

export function MapControlsView({
  browsing,
  overview,
  overviewLocked = false,
  northUp = false,
  hasRoute,
  searchOpen,
  labels,
  onRecentre,
  onToggleSearch,
  onOverview,
  onNorthUp,
  onZoom,
}: {
  browsing: boolean
  overview: boolean
  overviewLocked?: boolean
  northUp?: boolean
  hasRoute: boolean
  searchOpen: boolean
  labels: {
    recentre: string
    returnToNavigation: string
    search: string
    routeOverview: string
    northUp: string
    zoomIn: string
    zoomOut: string
  }
  onRecentre?: () => void
  onToggleSearch?: () => void
  onOverview?: () => void
  onNorthUp?: () => void
  onZoom?: (direction: 1 | -1) => void
}) {
  const recentreLabel = overview ? labels.returnToNavigation : labels.recentre
  const centred = !browsing && !overview
  const lockedOverview = overview && overviewLocked
  const overviewMode = !overview ? 'off' : lockedOverview ? 'locked' : 'timed'
  const showActionBar = hasRoute || searchOpen
  return (
    <div className="map-controls map-dock">
      <div className="map-view-rail map-orient-rail glass">
        <button
          type="button"
          className={`map-control map-recentre-btn${centred ? ' centred' : ' off-center'}`}
          aria-label={recentreLabel}
          aria-pressed={centred}
          onClick={onRecentre}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="6.5" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
            <circle className="map-recentre-core" cx="12" cy="12" r="2.5" />
          </svg>
        </button>
        <span className="map-zoom-divider" aria-hidden />
        <MapCompass
          label={labels.northUp}
          embedded
          northUp={!overview && northUp}
          disabled={overview}
          onClick={onNorthUp}
        />
      </div>
      <div className="map-dock-row">
        {showActionBar && (
          <div className="map-action-bar glass">
            <button
              type="button"
              className={`map-control map-dock-search${searchOpen ? ' selected' : ''}`}
              aria-label={labels.search}
              aria-expanded={searchOpen}
              onClick={onToggleSearch}
            >
              <SearchGlyph />
            </button>
            {hasRoute && (
              <>
                <span className="map-dock-divider-v" aria-hidden />
                <button
                  type="button"
                  className={`map-control map-overview${overview ? ' selected' : ''}${lockedOverview ? ' locked' : ''}`}
                  data-overview-mode={overviewMode}
                  aria-label={labels.routeOverview}
                  aria-pressed={overview}
                  onClick={onOverview}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="5" cy="18" r="2" />
                    <circle cx="19" cy="6" r="2" />
                    <path d="M5 16v-4a3 3 0 0 1 3-3h8a3 3 0 0 0 3-3" />
                  </svg>
                  {lockedOverview && (
                    <span className="map-overview-lock" aria-hidden="true">
                      <svg viewBox="0 0 16 16">
                        <rect x="3.5" y="7.5" width="9" height="6.5" rx="1.6" />
                        <path d="M5.5 7.5V5.3a2.5 2.5 0 0 1 5 0v2.2" />
                      </svg>
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        )}
        <div className="map-view-rail map-zoom-rail glass">
          <MapZoomButtons zoomInLabel={labels.zoomIn} zoomOutLabel={labels.zoomOut} onZoom={onZoom} />
        </div>
      </div>
    </div>
  )
}

/** How long the Dashboard's zoom buttons stay after the player last used the map, ms (owner 2026-10-21). */
const DASHBOARD_IDLE_MS = 15_000

/**
 * The Dashboard map's zoom buttons (owner 2026-10-21), the Maps app's pair in the same place: the map there
 * only follows the truck, closer or further. They fade out after 15 s without the player using the map, and
 * come back as the pointer moves over it or presses it.
 */
export function DashboardMapControls() {
  const controls = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(true)
  useEffect(() => {
    // The map tile around them: using any of it brings them back.
    const tile = controls.current?.parentElement
    if (!tile) return
    let timer = setTimeout(() => setShown(false), DASHBOARD_IDLE_MS)
    const used = () => {
      clearTimeout(timer)
      setShown(true)
      timer = setTimeout(() => setShown(false), DASHBOARD_IDLE_MS)
    }
    const events = ['pointermove', 'pointerdown', 'wheel'] as const
    for (const event of events) tile.addEventListener(event, used, { passive: true })
    return () => {
      clearTimeout(timer)
      for (const event of events) tile.removeEventListener(event, used)
    }
  }, [])
  return (
    <div ref={controls} className={shown ? 'map-controls dashboard-zoom' : 'map-controls dashboard-zoom faded'}>
      <MapZoom />
    </div>
  )
}

/** Zoom in and out a step, shared by the navigation rail and the Dashboard's standalone glass pair. */
function MapZoomButtons({
  zoomInLabel,
  zoomOutLabel,
  onZoom = zoomLiveMap,
}: {
  zoomInLabel: string
  zoomOutLabel: string
  onZoom?: (direction: 1 | -1) => void
}) {
  return (
    <>
      <button
        type="button"
        className="map-control"
        data-control="zoom-in"
        aria-label={zoomInLabel}
        onClick={() => onZoom(1)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <span className="map-zoom-divider" aria-hidden />
      <button
        type="button"
        className="map-control"
        data-control="zoom-out"
        aria-label={zoomOutLabel}
        onClick={() => onZoom(-1)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
    </>
  )
}

/** Zoom in and out a step, a pair of buttons in one glass. */
function MapZoom() {
  const text = useText()
  return (
    <div className="map-zoom glass">
      <MapZoomButtons zoomInLabel={text.zoomIn} zoomOutLabel={text.zoomOut} />
    </div>
  )
}

/**
 * The map's north, as Apple Maps shows it: a compass whose red mark and "N" point north, turned against the
 * map as it turns with the truck (owner 2026-10-21: the north was nowhere to be seen). Turned in place, not
 * re-rendered, every time the map turns. Tapped, the map turns north up, seen from above.
 */
function MapCompass({
  label,
  embedded = false,
  northUp = false,
  disabled = false,
  onClick = northUpLiveMap,
}: {
  label: string
  embedded?: boolean
  northUp?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const dial = useRef<HTMLDivElement>(null)
  useEffect(
    () =>
      followBearing((bearing) => {
        if (dial.current) dial.current.style.transform = `rotate(${-bearing}deg)`
      }),
    [],
  )
  return (
    <button
      type="button"
      className={`${embedded ? 'map-compass' : 'map-compass glass'}${northUp ? ' north-up' : ''}`}
      aria-label={label}
      aria-pressed={northUp}
      disabled={disabled}
      onClick={onClick}
    >
      <div ref={dial} className="map-compass-dial">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle className="map-compass-ring" cx="22" cy="22" r="18" />
          <path className="map-compass-north" d="M22 4 25.4 10.8h-6.8Z" />
          <text x="22" y="28" textAnchor="middle">
            N
          </text>
        </svg>
      </div>
    </button>
  )
}
