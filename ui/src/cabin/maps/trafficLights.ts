import maplibregl from 'maplibre-gl'
import type { SemaphoreInfo, Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import {
  CORRIDOR_MIN_ZOOM,
  type CorridorRoute,
  isPointInsideViewport,
  nearestAheadOnCorridor,
  removeUnusedMarkers,
  type UpcomingCorridor,
} from './corridor'
import { toLngLat } from './projection'

const MAX_MARKERS = 1

interface TrafficLightRenderState {
  connected: boolean
  stateClass: string
  urgent: boolean
  noTimer: boolean
  seconds: number
  hasProgress: boolean
  ratioText: string
  lng: number
  lat: number
}

const poolRenderState = new WeakMap<TrafficLightPool, TrafficLightRenderState>()

export type TrafficLightRoute = CorridorRoute

export interface TrafficLightElements {
  badge: HTMLDivElement
  pin?: HTMLDivElement
  timerBox: HTMLDivElement
  timer: HTMLSpanElement
  housing: HTMLDivElement
  progress?: HTMLSpanElement
}

export interface TrafficLightPool {
  markers: maplibregl.Marker[]
  elements: TrafficLightElements[]
}

/**
 * Creates a reusable pool of MapLibre DOM markers for traffic lights and countdown timers.
 */
export function createTrafficLightPool(): TrafficLightPool {
  const markers: maplibregl.Marker[] = []
  const elements: TrafficLightElements[] = []

  for (let i = 0; i < MAX_MARKERS; i++) {
    const badge = document.createElement('div')
    badge.className = 'traffic-light-badge'

    // Inner visual pin wrapper: MapLibre owns transform on the outer `badge` root element.
    const pin = document.createElement('div')
    pin.className = 'traffic-light-pin'

    // Left: slim 3-lamp vertical traffic light core (red, yellow, green)
    const housing = document.createElement('div')
    housing.className = 'traffic-light-housing'

    const lampRed = document.createElement('span')
    lampRed.className = 'traffic-lamp lamp-red'

    const lampYellow = document.createElement('span')
    lampYellow.className = 'traffic-lamp lamp-yellow'

    const lampGreen = document.createElement('span')
    lampGreen.className = 'traffic-lamp lamp-green'

    housing.appendChild(lampRed)
    housing.appendChild(lampYellow)
    housing.appendChild(lampGreen)

    // Right: integrated countdown readout
    const timerBox = document.createElement('div')
    timerBox.className = 'traffic-light-timer-box'

    const timer = document.createElement('span')
    timer.className = 'traffic-light-timer'
    timerBox.appendChild(timer)

    // Bottom: thin phase progress indicator
    const progress = document.createElement('span')
    progress.className = 'traffic-light-progress'

    pin.appendChild(housing)
    pin.appendChild(timerBox)
    pin.appendChild(progress)
    badge.appendChild(pin)

    const marker = new maplibregl.Marker({
      element: badge,
      anchor: 'bottom',
      offset: [0, -8],
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })

    markers.push(marker)
    elements.push({ badge, pin, timerBox, timer, housing, progress })
  }

  return { markers, elements }
}

const BADGE_DYNAMIC_CLASSES = [
  'traffic-green',
  'traffic-yellow',
  'traffic-red',
  'traffic-red-amber',
  'traffic-off',
  'urgent',
  'no-timer',
] as const

function updateBadgeClasses(badge: HTMLElement, stateClass: string, urgent: boolean, noTimer: boolean) {
  // Preserve MapLibre's marker classes (`maplibregl-marker`, `maplibregl-marker-anchor-*`) so positioning and z-index stay intact.
  if (badge.classList) {
    badge.classList.remove(...BADGE_DYNAMIC_CLASSES)
    badge.classList.add('traffic-light-badge', stateClass)
    if (urgent) badge.classList.add('urgent')
    if (noTimer) badge.classList.add('no-timer')
    return
  }
  badge.className = `traffic-light-badge ${stateClass}${urgent ? ' urgent' : ''}${noTimer ? ' no-timer' : ''}`
}

/**
 * Maps SCS Prism3D traffic semaphore actor state to UI CSS class:
 * In SCS Prism3D:
 * - 0: Yellow / Amber
 * - 1: Red
 * - 2: Red + Amber
 * - 3: Green
 * - 4+: Off / Inactive
 */
export function trafficLightStateClass(state: number): string {
  switch (state) {
    case 3:
      return 'traffic-green'
    case 0:
      return 'traffic-yellow'
    case 1:
      return 'traffic-red'
    case 2:
      return 'traffic-red-amber'
    default:
      return 'traffic-off'
  }
}

/**
 * Synchronizes traffic light markers on the map with the latest telemetry and game semaphores.
 * Strictly adheres to in-cabin navigation standards: displays only the single nearest traffic light
 * ahead in the vehicle's travel corridor at any given time.
 */
export function syncTrafficLights(
  map: maplibregl.Map,
  pool: TrafficLightPool,
  hidden = false,
  precomputed?: NearestTrafficLight | null,
) {
  const { semaphores, telemetry, route, routeNext } = useLive.getState()
  const zoom = map.getZoom()

  const clearPool = () => {
    const prev = poolRenderState.get(pool)
    if (prev && !prev.connected && pool.markers.length <= 1) return
    removeUnusedMarkers(pool.markers, 0)
    if (prev) prev.connected = false
  }

  if (hidden || zoom < CORRIDOR_MIN_ZOOM || semaphores.length === 0 || !telemetry) {
    clearPool()
    return
  }

  // Find the single upcoming traffic light ahead on the active route (or current driving corridor when free-driving)
  const nearest =
    precomputed !== undefined ? precomputed : nearestTrafficLightAhead(semaphores, telemetry, route, routeNext)
  if (!nearest) {
    clearPool()
    return
  }

  const s = nearest.semaphore
  if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) {
    clearPool()
    return
  }

  const lngLat = toLngLat(s.x, s.z)
  if (!isPointInsideViewport(map, lngLat)) {
    clearPool()
    return
  }

  const { badge, timerBox, timer, progress } = pool.elements[0]
  const marker = pool.markers[0]

  const stateClass = trafficLightStateClass(s.state)
  const seconds = Math.max(0, Math.ceil(s.countdown))
  const urgent = seconds > 0 && seconds <= 3
  const noTimer = seconds <= 0
  const hasProgress = seconds > 0 && Number.isFinite(s.duration) && s.duration > 0
  const ratioText = hasProgress ? Math.max(0, Math.min(1, s.countdown / s.duration)).toFixed(3) : '0.000'

  let prev = poolRenderState.get(pool)
  const connectedNow = marker.getElement().isConnected
  if (
    prev &&
    connectedNow &&
    prev.connected &&
    prev.stateClass === stateClass &&
    prev.urgent === urgent &&
    prev.noTimer === noTimer &&
    prev.seconds === seconds &&
    prev.hasProgress === hasProgress &&
    prev.ratioText === ratioText &&
    Math.abs(prev.lng - lngLat[0]) < 1e-7 &&
    Math.abs(prev.lat - lngLat[1]) < 1e-7
  ) {
    if (pool.markers.length > 1) removeUnusedMarkers(pool.markers, 1)
    return
  }

  if (!prev || prev.stateClass !== stateClass || prev.urgent !== urgent || prev.noTimer !== noTimer) {
    updateBadgeClasses(badge, stateClass, urgent, noTimer)
  }
  if (!prev || prev.seconds !== seconds || prev.noTimer !== noTimer) {
    if (seconds > 0) {
      timerBox.style.display = 'flex'
      timer.textContent = `${seconds}`
    } else {
      timerBox.style.display = 'none'
      timer.textContent = ''
    }
  }

  if (!prev || prev.hasProgress !== hasProgress || prev.ratioText !== ratioText) {
    badge.style?.setProperty?.('--signal-progress', ratioText)
    if (progress) {
      progress.style.display = hasProgress ? 'block' : 'none'
      progress.style.transform = `scaleX(${ratioText})`
    }
  }

  if (!prev || !connectedNow || Math.abs(prev.lng - lngLat[0]) >= 1e-7 || Math.abs(prev.lat - lngLat[1]) >= 1e-7) {
    marker.setLngLat(lngLat)
  }
  if (!connectedNow) {
    marker.addTo(map)
  }

  if (!prev) {
    prev = {
      connected: true,
      stateClass,
      urgent,
      noTimer,
      seconds,
      hasProgress,
      ratioText,
      lng: lngLat[0],
      lat: lngLat[1],
    }
    poolRenderState.set(pool, prev)
  } else {
    prev.connected = true
    prev.stateClass = stateClass
    prev.urgent = urgent
    prev.noTimer = noTimer
    prev.seconds = seconds
    prev.hasProgress = hasProgress
    prev.ratioText = ratioText
    prev.lng = lngLat[0]
    prev.lat = lngLat[1]
  }

  if (pool.markers.length > 1) {
    removeUnusedMarkers(pool.markers, 1)
  }
}

export interface NearestTrafficLight {
  semaphore: SemaphoreInfo
  distance: number
}

/**
 * Finds the nearest traffic light ahead using the shared driving-corridor geometry.
 */
export function nearestTrafficLightAhead(
  semaphores: readonly SemaphoreInfo[],
  telemetry: Telemetry | null,
  route: TrafficLightRoute | null = null,
  routeNext = 0,
  precomputedUpcoming?: UpcomingCorridor | null,
): NearestTrafficLight | null {
  const found = nearestAheadOnCorridor(
    semaphores,
    telemetry,
    route,
    routeNext,
    (s) => s.state <= 3,
    precomputedUpcoming,
  )
  return found ? { semaphore: found.item, distance: found.distance } : null
}
