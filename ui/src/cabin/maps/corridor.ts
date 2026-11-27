import type maplibregl from 'maplibre-gl'
import type { Telemetry } from '../../shared/host'
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

export const CORRIDOR_MIN_ZOOM = 13.5

/** Maximum lookahead distance along an active navigation route (metres). */
export const ROUTE_MAX_FORWARD = 350
/** Maximum perpendicular distance from the navigation route polyline to an item (metres). */
export const ROUTE_MAX_LATERAL = 15
/** Maximum longitudinal overshoot past a route segment vertex before rejecting an unvisited branch (metres). */
export const ROUTE_VERTEX_OVERSHOOT = 6

/** Maximum lookahead distance when free-driving without a navigation route (metres). */
export const FREE_MAX_FORWARD = 220
/** Minimum lateral corridor half-width near the stop line when free-driving (metres). */
export const FREE_MIN_LATERAL = 8
/** Maximum lateral corridor half-width further ahead when free-driving (metres). */
export const FREE_MAX_LATERAL = 18
/** Lateral cone expansion ratio per metre of forward distance when free-driving. */
export const FREE_CONE_SLOPE = 0.22

/** Allow items up to 5m behind the front bumper while stopped at a stop line or overhead gantry. */
export const STOP_LINE_BEHIND = 5
/** Maximum vertical elevation difference to avoid matching items on overpasses/underpasses (metres). */
export const MAX_ELEVATION_DIFF = 12

export interface CorridorRoute {
  nodes: readonly RouteNode[]
  paths?: ReadonlyMap<number, Point[]>
  shifts?: ReadonlyMap<number, number>
}

export interface CorridorPoint {
  x: number
  y: number
  z: number
}

export interface NearestCorridorMatch<T> {
  item: T
  distance: number
}

export interface UpcomingCorridor {
  line: Point[]
  along: number[]
}

export function hasActiveCorridorRoute(telemetry: Telemetry | null, route: CorridorRoute | null): route is CorridorRoute {
  return (
    telemetry !== null &&
    route !== null &&
    route.nodes.length >= 2 &&
    Number.isFinite(telemetry.navigationDistance) &&
    telemetry.navigationDistance > 0
  )
}

export function computeUpcomingCorridor(
  telemetry: Telemetry | null,
  route: CorridorRoute | null,
  routeNext = 0,
): UpcomingCorridor | null {
  if (!telemetry || !hasActiveCorridorRoute(telemetry, route)) return null
  const { x: tx, z: tz, heading } = telemetry
  if (!Number.isFinite(tx) || !Number.isFinite(tz) || !Number.isFinite(heading)) return null
  const rad = heading * 2 * Math.PI
  const fx = -Math.sin(rad)
  const fz = -Math.cos(rad)
  return upcomingRouteLine(route, routeNext, [tx, tz], [fx, fz], ROUTE_MAX_FORWARD)
}

const routeSpansCache = new WeakMap<CorridorRoute, Spans>()

function spansOf(route: CorridorRoute): Spans {
  let spans = routeSpansCache.get(route)
  if (!spans) {
    spans = routeSpans(route.nodes, route.paths, route.shifts)
    routeSpansCache.set(route, spans)
  }
  return spans
}

/**
 * Extracts the upcoming route polyline from the truck's current position up to `maxMetres` ahead,
 * together with cumulative distances along the polyline.
 */
export function upcomingRouteLine(
  route: CorridorRoute,
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
 * Finds the nearest item ahead in the vehicle's driving corridor:
 * - When an active navigation route is present (`route` with `navigationDistance > 0`), strictly matches
 *   only items lying along the upcoming navigation route polyline (up to 350m ahead, <= 15m lateral).
 * - When free-driving without a navigation route, matches items in a tightened tapered forward
 *   corridor (up to 220m ahead, 8m..18m tapered lateral cone).
 */
export function nearestAheadOnCorridor<T extends CorridorPoint>(
  items: readonly T[],
  telemetry: Telemetry | null,
  route: CorridorRoute | null = null,
  routeNext = 0,
  accept: (item: T) => boolean = () => true,
  precomputedUpcoming?: UpcomingCorridor | null,
): NearestCorridorMatch<T> | null {
  if (!telemetry || items.length === 0) return null
  const { x: tx, z: tz, heading } = telemetry
  if (!Number.isFinite(tx) || !Number.isFinite(tz) || !Number.isFinite(heading)) return null

  // heading is in turns (0..1, 0 is north: -z)
  const rad = heading * 2 * Math.PI
  const fx = -Math.sin(rad)
  const fz = -Math.cos(rad)

  if (hasActiveCorridorRoute(telemetry, route)) {
    const upcoming =
      precomputedUpcoming !== undefined
        ? precomputedUpcoming
        : upcomingRouteLine(route, routeNext, [tx, tz], [fx, fz], ROUTE_MAX_FORWARD)
    if (!upcoming) return null
    const { line, along } = upcoming

    let closest: NearestCorridorMatch<T> | null = null

    for (const item of items) {
      if (!accept(item)) continue
      if (!Number.isFinite(item.x) || !Number.isFinite(item.z)) continue
      if (Number.isFinite(telemetry.y) && Number.isFinite(item.y) && Math.abs(item.y - telemetry.y) > MAX_ELEVATION_DIFF) {
        continue
      }

      const dx = item.x - tx
      const dz = item.z - tz
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
        const proj = (item.x - a[0]) * ux + (item.z - a[1]) * uz
        const minProj = i === 1 ? -STOP_LINE_BEHIND : 0

        const overshoot = proj < minProj ? minProj - proj : proj > segLen ? proj - segLen : 0
        if (overshoot > ROUTE_VERTEX_OVERSHOOT) continue

        const clamped = Math.max(minProj, Math.min(segLen, proj))
        const cx = a[0] + ux * clamped
        const cz = a[1] + uz * clamped
        const dist = Math.hypot(item.x - cx, item.z - cz)
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
        closest = { item, distance: bestRouteDist }
      }
    }

    return closest
  }

  let closest: NearestCorridorMatch<T> | null = null

  for (const item of items) {
    if (!accept(item)) continue
    if (!Number.isFinite(item.x) || !Number.isFinite(item.z)) continue
    if (Number.isFinite(telemetry.y) && Number.isFinite(item.y) && Math.abs(item.y - telemetry.y) > MAX_ELEVATION_DIFF) {
      continue
    }

    const dx = item.x - tx
    const dz = item.z - tz
    const forward = dx * fx + dz * fz

    // In front: -5m (at stop line/overhead gantry) to 220m in free-driving mode
    if (forward < -STOP_LINE_BEHIND || forward > FREE_MAX_FORWARD) continue
    const lateral = Math.abs(dx * -fz + dz * fx)
    // Tapered lateral cone: 8m near the stop line expanding up to 18m ahead
    const maxLateral = Math.min(FREE_MAX_LATERAL, Math.max(FREE_MIN_LATERAL, Math.max(0, forward) * FREE_CONE_SLOPE))
    if (lateral > maxLateral) continue

    if (!closest || forward < closest.distance) {
      closest = { item, distance: forward }
    }
  }

  return closest
}

export function removeUnusedMarkers(markers: readonly maplibregl.Marker[], startIndex: number) {
  for (let i = startIndex; i < markers.length; i++) {
    const marker = markers[i]
    if (marker.getElement().isConnected) {
      marker.remove()
    }
  }
}

export function isPointInsideViewport(map: maplibregl.Map, lngLat: [number, number], margin = 50): boolean {
  const pos = map.project(lngLat)
  const container = map.getContainer()
  const width = container.clientWidth
  const height = container.clientHeight
  return pos.x >= -margin && pos.x <= width + margin && pos.y >= -margin && pos.y <= height + margin
}
