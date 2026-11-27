import { type RefObject, useEffect, useRef, useState } from 'react'
import { hvtMapMessage } from '../maps/blockedMap'
import { visualCenterPadding, visualShiftXOf } from '../maps/camera'
import { GuidanceCard } from '../maps/GuidanceCard'
import { guidanceFor } from '../maps/guidanceDistance'
import { recentreLiveMap, setLiveMapVisualInsets, useMapBrowsing } from '../maps/liveMap'
import { MapCacheNotice } from '../maps/MapCacheNotice'
import { DashboardMapControls, MapControls } from '../maps/MapControls'
import { useMapData } from '../maps/mapData'
import { MapSearch } from '../maps/MapSearch'
import { RoadMap } from '../maps/RoadMap'
import { SpeedCameraPillView } from '../maps/SpeedCameraPill'
import { SpeedDisplay } from '../maps/SpeedDisplay'
import { TrafficLightPillView } from '../maps/TrafficLightPill'
import { TripBar } from '../maps/TripBar'
import { useLaneHint } from '../maps/useLaneHint'
import { useUpcomingSpeedCamera } from '../maps/useSpeedCamera'
import { useUpcomingTrafficLight } from '../maps/useTrafficLight'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import './map.css'

/** How long a top-center map action confirmation pill stays visible, ms. */
const NOTICE_MS = 2600

/**
 * The map tile (Dashboard and the Maps app): the live map following the truck (with the game's GPS route),
 * the interactive Liquid Glass Trip Bar (arrival, time/distance left, one-tap along-route pit stops, quick
 * route actions), regional speed limit + digital speedometer, and unified turn-by-turn / free-drive alerts.
 */
export function MapView({ interactive = false }: { interactive?: boolean }) {
  const overview = useMapBrowsing((state) => state.routeOverview) && interactive
  const data = useMapData()
  const hvtMap = useLive((state) => state.hvtMap)
  const chosen = useLive((state) => state.chosenLanguage)
  const hasRoute = useLive((state) => state.route !== null && (state.telemetry?.navigationDistance ?? 0) > 0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [tripExpanded, setTripExpanded] = useState(false)
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null)
  const tileRef = useRef<HTMLDivElement>(null)

  if ((!interactive || !data) && searchOpen) setSearchOpen(false)
  if ((!interactive || searchOpen || overview) && tripExpanded) setTripExpanded(false)

  useVisualCenterSync(tileRef, { interactive, overview, searchOpen, tripExpanded, hasRoute })

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const notify = (message: string) => setNotice({ text: message, id: Date.now() })

  if (hvtMap) {
    return (
      <div className="map-tile map-blocked">
        <svg className="map-blocked-glyph" viewBox="0 0 24 24" aria-hidden>
          <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5Z" />
          <path d="M9 4v13.5M15 6.5V20M3 3l18 18" />
        </svg>
        <p>{hvtMapMessage(chosen ?? hvtMap.language)}</p>
      </div>
    )
  }

  const toggleSearch = () => {
    if (!searchOpen && useMapBrowsing.getState().routeOverview) recentreLiveMap()
    setTripExpanded(false)
    setSearchOpen((open) => !open)
  }

  // Layered so the Dashboard's map grows and shrinks by transforms alone (dashboard.css): the tile and its clip
  // stand still, the window (the map's right edge, its zoom pair) slides, the content (the map, centred in what
  // shows of it) slides against it, and the speed capsule moves with the window’s right edge; its shadow in two
  // parts, the left one still, the rest sliding. In the Maps app, all of them simply the tile.
  return (
    <div ref={tileRef} className={`map-tile${interactive ? ' map-navigation' : ''}${overview ? ' route-overview' : ''}`}>
      <div className="map-shadow map-shadow-left" aria-hidden />
      <div className="map-shadow-clip" aria-hidden>
        <div className="map-shadow map-shadow-moving" />
      </div>
      <div className="map-clip">
        <div className="map-window">
          <div className="map-content">
            {data ? (
              <RoadMap data={data} interactive={interactive} />
            ) : (
              data === null && (
                <>
                  <div className="map-plane map-dark" />
                  <div className="map-plane map-light" />
                  <div className="puck" aria-hidden>
                    <svg viewBox="0 0 24 24" width="22" height="22">
                      <path d="M12 3 19 20l-7-4-7 4Z" fill="#fff" />
                    </svg>
                  </div>
                </>
              )
            )}
            <div className="map-shade" />
            <TripBar
              interactive={interactive}
              concealed={overview || searchOpen}
              hasMapData={Boolean(data)}
              expanded={tripExpanded}
              onExpandedChange={setTripExpanded}
              onOpenSearch={toggleSearch}
              onNotify={notify}
            />
          </div>
          <div className="map-speed-layer" aria-hidden={overview}>
            <SpeedDisplay />
          </div>
          {interactive && (
            <div className="map-guidance-layer" aria-hidden={overview}>
              <NavigationOverlay />
            </div>
          )}
          {data && interactive && <MapControls searchOpen={searchOpen} onToggleSearch={toggleSearch} />}
          {data && !interactive && <DashboardMapControls />}
          {data && interactive && (
            <MapSearch open={searchOpen} onClose={() => setSearchOpen(false)} onNotify={notify} />
          )}
          {notice && (
            <div key={notice.id} className="map-confirmation glass" role="status">
              {notice.text}
            </div>
          )}
          <MapCacheNotice />
        </div>
      </div>
    </div>
  )
}

/**
 * Coordinates the top-left Maps HUD without duplicate corridor/telemetry subscriptions:
 * renders the full turn-by-turn GuidanceCard when a route or lane hint is active, and only mounts
 * FreeDriveAlerts when cruising without active guidance.
 */
function NavigationOverlay() {
  const hasGuidance = useLive((state) => guidanceFor(state) !== null)
  const lane = useLaneHint()
  const showFreeDrive = !hasGuidance && lane.hint === null
  return (
    <>
      <GuidanceCard variant="banner" />
      {showFreeDrive && <FreeDriveAlerts />}
    </>
  )
}

function FreeDriveAlerts() {
  const text = useText()
  const signal = useUpcomingTrafficLight()
  const camera = useUpcomingSpeedCamera()
  if (!signal && !camera) return null
  return (
    <div className="free-drive-alerts">
      {signal && (
        <div className="free-drive-signal glass">
          <TrafficLightPillView signal={signal} />
        </div>
      )}
      {camera && (
        <div className="free-drive-signal free-drive-camera glass">
          <SpeedCameraPillView camera={camera} label={text.speedCamera} standalone />
        </div>
      )}
    </div>
  )
}

/** Weight applied to right-side corner widgets (speed capsule / dock) beyond the base edge inset. */
const RIGHT_CORNER_WEIGHT = 0.45
const BASE_RIGHT_EDGE = 24
const SIDEBAR_GAP = 16

/**
 * Event-driven visual-center measurement for full-screen Maps (`interactive = true`):
 * measures left sidebar + active left navigation cards and right corner widgets on resize / DOM mutations
 * (zero per-frame reads), pushing the resulting insets to both MapLibre (`liveMap.ts`) and the CSS fallback
 * `--nav-visual-shift-x` variable.
 */
function useVisualCenterSync(
  tileRef: RefObject<HTMLDivElement | null>,
  deps: { interactive: boolean; overview: boolean; searchOpen: boolean; tripExpanded: boolean; hasRoute: boolean },
) {
  const { interactive, overview, searchOpen, tripExpanded, hasRoute } = deps
  useEffect(() => {
    const tile = tileRef.current
    if (!tile) return
    if (!interactive) {
      tile.style.setProperty('--nav-visual-shift-x', '0px')
      setLiveMapVisualInsets(0, 0)
      return
    }

    let frame = 0
    const measure = () => {
      const box = tile.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return
      const scaleX = tile.clientWidth > 0 ? tile.clientWidth / box.width : 1
      let leftOcc = 0
      const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect()
      if (sidebar && sidebar.width > 0) {
        leftOcc = Math.max(leftOcc, (sidebar.right - box.left) * scaleX + SIDEBAR_GAP)
      }
      if (!overview) {
        const leftSelectors = searchOpen
          ? ['.map-search:not(.closing)']
          : ['.guidance-banner:not(.closing)', '.nav-trip-cluster .eta-pill', '.nav-trip-cluster .trip-drawer']
        for (const selector of leftSelectors) {
          const rect = tile.querySelector(selector)?.getBoundingClientRect()
          if (rect && rect.width > 0 && rect.height > 0) {
            leftOcc = Math.max(leftOcc, (rect.right - box.left) * scaleX)
          }
        }
      }

      let rightOcc = BASE_RIGHT_EDGE
      if (!overview) {
        let rightReach = BASE_RIGHT_EDGE
        for (const selector of ['.speed-stack', '.map-controls.map-dock']) {
          const rect = tile.querySelector(selector)?.getBoundingClientRect()
          if (rect && rect.width > 0 && rect.height > 0) {
            rightReach = Math.max(rightReach, (box.right - rect.left) * scaleX)
          }
        }
        rightOcc = BASE_RIGHT_EDGE + Math.max(0, rightReach - BASE_RIGHT_EDGE) * RIGHT_CORNER_WEIGHT
      }

      const padding = visualCenterPadding({
        width: tile.clientWidth || box.width,
        height: tile.clientHeight || box.height,
        leftOcc,
        rightOcc,
        northUp: false,
      })
      const shiftX = visualShiftXOf(padding)
      tile.style.setProperty('--nav-visual-shift-x', `${shiftX.toFixed(1)}px`)
      setLiveMapVisualInsets(leftOcc, rightOcc)
    }

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }

    measure()
    schedule()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(tile)
    const guidanceLayer = tile.querySelector('.map-guidance-layer')
    const tripCluster = tile.querySelector('.nav-trip-cluster')
    if (guidanceLayer) ro?.observe(guidanceLayer)
    if (tripCluster) ro?.observe(tripCluster)

    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null
    if (guidanceLayer) mo?.observe(guidanceLayer, { childList: true, subtree: true })
    if (tripCluster) mo?.observe(tripCluster, { childList: true, subtree: true })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [tileRef, interactive, overview, searchOpen, tripExpanded, hasRoute])
}
