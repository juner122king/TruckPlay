import maplibregl from 'maplibre-gl'
import type { SemaphoreInfo, Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import { toLngLat } from './projection'
import {
  approachLine,
  headLine,
  type Point,
  progressOf,
  type RouteNode,
  routeSpans,
  SNAP_NONE,
  type Spans,
} from './route'

const MIN_ZOOM = 13.5
const MAX_MARKERS = 32

/** Maximum lookahead distance along an active navigation route (metres). */
const ROUTE_MAX_FORWARD = 350
/** Maximum perpendicular distance from the navigation route polyline to a semaphore (metres). */
const ROUTE_MAX_LATERAL = 15
/** Maximum longitudinal overshoot past a route segment vertex before rejecting an unvisited branch (metres). */
const ROUTE_VERTEX_OVERSHOOT = 6

/** Maximum lookahead distance when free-driving without a navigation route (metres). */
const FREE_MAX_FORWARD = 220
/** Minimum lateral corridor half-width near the stop line when free-driving (metres). */
const FREE_MIN_LATERAL = 8
/** Maximum lateral corridor half-width further ahead when free-driving (metres). */
const FREE_MAX_LATERAL = 18
/** Lateral cone expansion ratio per metre of forward distance when free-driving. */
const FREE_CONE_SLOPE = 0.22

/** Allow traffic lights up to 5m behind the front bumper while stopped at a stop line or overhead gantry. */
const STOP_LINE_BEHIND = 5
/** Maximum vertical elevation difference to avoid matching signals on overpasses/underpasses (metres). */
const MAX_ELEVATION_DIFF = 12

export interface TrafficLightRoute {
  nodes: readonly RouteNode[]
  paths?: ReadonlyMap<number, Point[]>
  shifts?: ReadonlyMap<number, number>
}

const routeSpansCache = new WeakMap<TrafficLightRoute, Spans>()

function spansOf(route: TrafficLightRoute): Spans {
  let spans = routeSpansCache.get(route)
  if (!spans) {
    spans = routeSpans(route.nodes, route.paths, route.shifts)
    routeSpansCache.set(route, spans)
  }
  return spans
}

export interface TrafficLightElements {
  badge: HTMLDivElement
  timerBox: HTMLDivElement
  timer: HTMLSpanElement
  housing: HTMLDivElement
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

    // Left: timer box (rounded pill with colored border matching current signal)
    const timerBox = document.createElement('div')
    timerBox.className = 'traffic-light-timer-box'

    const timer = document.createElement('span')
    timer.className = 'traffic-light-timer'
    timerBox.appendChild(timer)

    // Right: 3-hole vertical traffic light housing (red, yellow, green)
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

    badge.appendChild(timerBox)
    badge.appendChild(housing)

    const marker = new maplibregl.Marker({
      element: badge,
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })

    markers.push(marker)
    elements.push({ badge, timerBox, timer, housing })
  }

  return { markers, elements }
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
export function syncTrafficLights(map: maplibregl.Map, pool: TrafficLightPool) {
  const { semaphores, telemetry, route, routeNext } = useLive.getState()
  const zoom = map.getZoom()

  if (zoom < MIN_ZOOM || semaphores.length === 0 || !telemetry) {
    removeUnused(pool, 0)
    return
  }

  // Find the single upcoming traffic light ahead on the active route (or current driving corridor when free-driving)
  const nearest = nearestTrafficLightAhead(semaphores, telemetry, route, routeNext)
  if (!nearest) {
    removeUnused(pool, 0)
    return
  }

  const s = nearest.semaphore
  if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) {
    removeUnused(pool, 0)
    return
  }

  const lngLat = toLngLat(s.x, s.z)
  const pos = map.project(lngLat)
  const container = map.getContainer()
  const width = container.clientWidth
  const height = container.clientHeight

  // Cull if completely outside the viewport margin
  if (pos.x < -50 || pos.x > width + 50 || pos.y < -50 || pos.y > height + 50) {
    removeUnused(pool, 0)
    return
  }

  const { badge, timerBox, timer } = pool.elements[0]
  const marker = pool.markers[0]

  const stateClass = trafficLightStateClass(s.state)
  badge.className = `traffic-light-badge ${stateClass}`
  const seconds = Math.max(0, Math.ceil(s.countdown))
  if (seconds > 0) {
    timerBox.style.display = 'flex'
    timer.textContent = `${seconds}`
  } else {
    timerBox.style.display = 'none'
    timer.textContent = ''
  }

  marker.setLngLat(lngLat)
  if (!marker.getElement().isConnected) {
    marker.addTo(map)
  }

  // Ensure all other markers (1..MAX_MARKERS-1) are completely hidden/removed
  removeUnused(pool, 1)
}

function removeUnused(pool: TrafficLightPool, startIndex: number) {
  for (let i = startIndex; i < pool.markers.length; i++) {
    const marker = pool.markers[i]
    if (marker.getElement().isConnected) {
      marker.remove()
    }
  }
}

export interface NearestTrafficLight {
  semaphore: SemaphoreInfo
  distance: number
}

/**
 * Extracts the upcoming route polyline from the truck's current position up to `maxMetres` ahead,
 * together with cumulative distances along the polyline.
 */
function upcomingRouteLine(
  route: TrafficLightRoute,
  routeNext: number,
  truck: Point,
  facing: Point,
  maxMetres: number,
): { line: Point[]; along: number[] } | null {
  if (route.nodes.length < 2) return null
  const spans = spansOf(route)
  if (spans.length === 0) return null

  const progress = progressOf(spans, routeNext, truck, facing)
  if (!progress) return null
  const approach = approachLine(spans, progress, truck, facing)
  if (!approach && progress.distance > SNAP_NONE) return null

  const firstSpan = approach ? [...approach, ...spans[0].slice(1)] : headLine(spans, progress)
  if (firstSpan.length === 0) return null

  const line: Point[] = [firstSpan[0]]
  const along: number[] = [0]
  let total = 0

  const append = (p: Point) => {
    const prev = line[line.length - 1]
    const seg = Math.hypot(p[0] - prev[0], p[1] - prev[1])
    if (seg <= 1e-6) return
    if (total + seg <= maxMetres) {
      line.push(p)
      total += seg
      along.push(total)
    } else {
      const t = (maxMetres - total) / seg
      line.push([prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t])
      total = maxMetres
      along.push(total)
    }
  }

  for (let i = 1; i < firstSpan.length && total < maxMetres; i++) {
    append(firstSpan[i])
  }
  const startSpan = approach ? 1 : progress.span + 1
  for (let s = startSpan; s < spans.length && total < maxMetres; s++) {
    const pts = spans[s]
    for (let i = 1; i < pts.length && total < maxMetres; i++) {
      append(pts[i])
    }
  }

  return line.length >= 2 ? { line, along } : null
}

/**
 * Finds the nearest traffic light ahead:
 * - When an active navigation route is present (`route` with `navigationDistance > 0`), strictly matches
 *   only traffic lights lying along the upcoming navigation route polyline (up to 350m ahead, <= 15m lateral).
 * - When free-driving without a navigation route, matches traffic lights in a tightened tapered forward
 *   corridor (up to 220m ahead, 8m..18m tapered lateral cone).
 */
export function nearestTrafficLightAhead(
  semaphores: readonly SemaphoreInfo[],
  telemetry: Telemetry | null,
  route: TrafficLightRoute | null = null,
  routeNext = 0,
): NearestTrafficLight | null {
  if (!telemetry || semaphores.length === 0) return null
  const { x: tx, z: tz, heading } = telemetry
  if (!Number.isFinite(tx) || !Number.isFinite(tz) || !Number.isFinite(heading)) return null

  // heading is in turns (0..1, 0 is north: -z)
  const rad = heading * 2 * Math.PI
  const fx = -Math.sin(rad)
  const fz = -Math.cos(rad)

  const hasActiveRoute =
    route !== null &&
    route.nodes.length >= 2 &&
    Number.isFinite(telemetry.navigationDistance) &&
    telemetry.navigationDistance > 0

  if (hasActiveRoute && route) {
    const upcoming = upcomingRouteLine(route, routeNext, [tx, tz], [fx, fz], ROUTE_MAX_FORWARD)
    if (!upcoming) return null
    const { line, along } = upcoming

    let closest: NearestTrafficLight | null = null

    for (const s of semaphores) {
      if (s.state > 3) continue
      if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) continue
      if (Number.isFinite(telemetry.y) && Number.isFinite(s.y) && Math.abs(s.y - telemetry.y) > MAX_ELEVATION_DIFF) {
        continue
      }

      const dx = s.x - tx
      const dz = s.z - tz
      const forward = dx * fx + dz * fz

      let bestSegDist = Infinity
      let bestRouteDist: number | null = null

      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]
        const b = line[i]
        const segLen = along[i] - along[i - 1]
        if (segLen <= 1e-6) continue

        const ux = (b[0] - a[0]) / segLen
        const uz = (b[1] - a[1]) / segLen
        const proj = (s.x - a[0]) * ux + (s.z - a[1]) * uz
        const minProj = i === 1 ? -STOP_LINE_BEHIND : 0

        const overshoot = proj < minProj ? minProj - proj : proj > segLen ? proj - segLen : 0
        if (overshoot > ROUTE_VERTEX_OVERSHOOT) continue

        const clamped = Math.max(minProj, Math.min(segLen, proj))
        const cx = a[0] + ux * clamped
        const cz = a[1] + uz * clamped
        const dist = Math.hypot(s.x - cx, s.z - cz)
        if (dist > ROUTE_MAX_LATERAL) continue

        const routeDist = along[i - 1] + clamped
        if (routeDist < -STOP_LINE_BEHIND || routeDist > ROUTE_MAX_FORWARD) continue
        if (routeDist < 25 && forward < -STOP_LINE_BEHIND) continue

        if (dist < bestSegDist) {
          bestSegDist = dist
          bestRouteDist = routeDist
        }
      }

      if (bestRouteDist !== null && (!closest || bestRouteDist < closest.distance)) {
        closest = { semaphore: s, distance: bestRouteDist }
      }
    }

    return closest
  }

  let closest: NearestTrafficLight | null = null

  for (const s of semaphores) {
    if (s.state > 3) continue
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) continue
    if (Number.isFinite(telemetry.y) && Number.isFinite(s.y) && Math.abs(s.y - telemetry.y) > MAX_ELEVATION_DIFF) {
      continue
    }

    const dx = s.x - tx
    const dz = s.z - tz
    const forward = dx * fx + dz * fz

    // In front: -5m (at stop line/overhead gantry) to 220m in free-driving mode
    if (forward < -STOP_LINE_BEHIND || forward > FREE_MAX_FORWARD) continue
    const lateral = Math.abs(dx * -fz + dz * fx)
    // Tapered lateral cone: 8m near the stop line expanding up to 18m ahead
    const maxLateral = Math.min(FREE_MAX_LATERAL, Math.max(FREE_MIN_LATERAL, Math.max(0, forward) * FREE_CONE_SLOPE))
    if (lateral > maxLateral) continue

    if (!closest || forward < closest.distance) {
      closest = { semaphore: s, distance: forward }
    }
  }

  return closest
}
