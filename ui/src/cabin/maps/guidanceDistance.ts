import type { Telemetry } from '../../shared/host'
import { bearingOf } from './camera'
import { type Guidance, guidanceOf, type Maneuver } from './guidance'
import { approachLine, type Point, progressOf, type RouteNode, routeSpans, SNAP_NONE, type Spans } from './route'

/**
 * Dual-metric guidance distances:
 * - Displayed turn/lane/arrival countdowns use game-scaled metres (`gameGuidanceDistancesOf` / `guidanceFor`),
 *   matching the trip pill, destination widget and game GPS 1:1 across city (1:3) and highway (1:15-1:20) scales.
 * - Spatial triggers (lane-hint enter/exit hysteresis, dynamic junction camera zoom and consecutive-turn "then"
 *   proximity) use 3D physical metres along the drawn route (`guidanceDistancesOf` / `physicalGuidanceFor`).
 */
interface GuidanceRoute {
  nodes: readonly RouteNode[]
  distances: readonly number[]
  paths: ReadonlyMap<number, Point[]>
  shifts: ReadonlyMap<number, number>
  maneuvers: readonly Maneuver[]
}

export interface GuidanceState {
  route: GuidanceRoute | null
  routeNext: number
  telemetry: Pick<Telemetry, 'x' | 'z' | 'heading' | 'navigationDistance' | 'localScale'> | null
}

export interface GuidanceDistances {
  /** Metres remaining from each node to the end of the route (in the selector's distance frame). */
  distances: readonly number[]
  /** Metres remaining from the truck, in the same frame as `distances`. */
  distanceLeft: number
}

interface Geometry {
  spans: Spans
  distances: number[]
  /** Metres from each polyline point to the end of its span. */
  remaining: number[][]
}

type GeometryLocation =
  | { kind: 'approach'; approachLength: number; distanceLeft: number }
  | { kind: 'span'; span: number; spanRemaining: number; distanceLeft: number }

interface CachedRoute {
  geometry: Geometry | null
  validGameDistances: boolean
  /** Last node index where `route.distances[i] > route.distances[i - 1] + 1`, or `-1` if monotonic. */
  lastRise: number
  normalized?: { scale: number; distances: number[] }
  scaled?: { scale: number; distances: number[] }
  scaledGame?: { scale: number; distances: number[] }
  physicalSample?: { telemetry: GuidanceState['telemetry']; next: number; value: GuidanceDistances | null }
  gameSample?: { telemetry: GuidanceState['telemetry']; next: number; value: GuidanceDistances | null }
}

// Route objects are replaced on rerouting and when junction paths/road shifts arrive. Never cache by ID:
// geometry can change while the game's route ID stays the same. Weak keys let disposed routes go away.
const routes = new WeakMap<GuidanceRoute, CachedRoute>()

function geometryOf(route: GuidanceRoute): Geometry | null {
  if (
    route.nodes.length < 2 ||
    !route.nodes.every((node) => [...node.position, ...node.forward].every(Number.isFinite))
  )
    return null
  const spans = routeSpans(route.nodes, route.paths, route.shifts)
  if (!spans.every((line) => line.length >= 2 && line.every((point) => point.every(Number.isFinite)))) return null
  const remaining = spans.map((line) => {
    const lengths = new Array<number>(line.length).fill(0)
    for (let i = line.length - 2; i >= 0; i--)
      lengths[i] = lengths[i + 1] + Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1])
    return lengths
  })
  const distances = new Array<number>(route.nodes.length).fill(0)
  for (let i = spans.length - 1; i >= 0; i--) distances[i] = distances[i + 1] + remaining[i][0]
  return Number.isFinite(distances[0]) && distances[0] > 0 ? { spans, distances, remaining } : null
}

function cachedOf(route: GuidanceRoute): CachedRoute {
  let cached = routes.get(route)
  if (!cached) {
    const validGameDistances =
      route.distances.length > 0 &&
      route.distances.length === route.nodes.length &&
      route.distances.every((distance) => Number.isFinite(distance) && distance >= 0)
    let lastRise = -1
    if (validGameDistances) {
      for (let i = 1; i < route.distances.length; i++) {
        if (route.distances[i] > route.distances[i - 1] + 1) lastRise = i
      }
    }
    cached = { geometry: geometryOf(route), validGameDistances, lastRise }
    routes.set(route, cached)
  }
  return cached
}

function locateOnGeometry(
  geometry: Geometry,
  next: number,
  telemetry: NonNullable<GuidanceState['telemetry']>,
): GeometryLocation | null {
  if (![telemetry.x, telemetry.z, telemetry.heading].every(Number.isFinite)) return null
  const truck: Point = [telemetry.x, telemetry.z]
  const bearing = (bearingOf(telemetry.heading) * Math.PI) / 180
  const facing: Point = [Math.sin(bearing), -Math.cos(bearing)]
  const progress = progressOf(geometry.spans, next, truck, facing)
  if (!progress) return null
  const approach = approachLine(geometry.spans, progress, truck, facing)
  if (approach) {
    let approachLength = 0
    for (let i = 1; i < approach.length; i++)
      approachLength += Math.hypot(approach[i][0] - approach[i - 1][0], approach[i][1] - approach[i - 1][1])
    return { kind: 'approach', approachLength, distanceLeft: geometry.distances[0] + approachLength }
  }
  // Match the map's existing snap limit; an unrelated road must not become a nearby turn at "now".
  if (progress.distance > SNAP_NONE) return null
  const { span, index, at } = progress
  const end = geometry.spans[span][index + 1]
  const spanRemaining = geometry.remaining[span][index + 1] + Math.hypot(end[0] - at[0], end[1] - at[1])
  return { kind: 'span', span, spanRemaining, distanceLeft: geometry.distances[span + 1] + spanRemaining }
}

function onGeometry(geometry: Geometry, next: number, telemetry: NonNullable<GuidanceState['telemetry']>) {
  const located = locateOnGeometry(geometry, next, telemetry)
  if (!located) return null
  // The SDK still reports active navigation at the final node. Keep "arrive now" until it ends,
  // rather than treating an exact geometric zero as the no-navigation sentinel used by guidanceOf.
  return { distances: geometry.distances, distanceLeft: Math.max(Number.EPSILON, located.distanceLeft) }
}

function isValidState(state: GuidanceState): state is {
  route: GuidanceRoute
  routeNext: number
  telemetry: NonNullable<GuidanceState['telemetry']>
} {
  return Boolean(
    state.route &&
      state.telemetry &&
      Number.isFinite(state.telemetry.navigationDistance) &&
      state.telemetry.navigationDistance > 0 &&
      Number.isInteger(state.routeNext) &&
      state.routeNext >= 0,
  )
}

function normalizedGameDistancesOf(route: GuidanceRoute, cached: CachedRoute, scale: number): number[] {
  if (cached.normalized?.scale === scale) return cached.normalized.distances
  const count = route.distances.length
  const normalized = new Array<number>(count).fill(0)
  for (let i = count - 2; i >= 0; i--) {
    const delta = route.distances[i] - route.distances[i + 1]
    let spanGame: number
    if (delta >= 0) {
      spanGame = delta
    } else {
      const spanPhys = cached.geometry?.remaining[i]?.[0] ?? 0
      spanGame = scale > 0 && Number.isFinite(spanPhys) ? spanPhys * scale : 0
    }
    normalized[i] = normalized[i + 1] + spanGame
  }
  cached.normalized = { scale, distances: normalized }
  return normalized
}

/**
 * Physical metres along the drawn route. Shared by lane-hint hysteresis, dynamic junction camera zoom
 * and consecutive-turn ("then") proximity, independent of a mounted map.
 */
export function guidanceDistancesOf(state: GuidanceState): GuidanceDistances | null {
  if (!isValidState(state)) return null
  const { route, routeNext, telemetry } = state
  const cached = cachedOf(route)
  if (cached.physicalSample?.telemetry === telemetry && cached.physicalSample.next === routeNext)
    return cached.physicalSample.value
  let value = cached.geometry && onGeometry(cached.geometry, routeNext, telemetry)
  if (!value) {
    // An approximation only while geometry cannot be used. Never change the trip's game distances.
    const scale = telemetry.localScale
    if (Number.isFinite(scale) && scale > 0 && cached.validGameDistances) {
      if (cached.scaled?.scale !== scale)
        cached.scaled = { scale, distances: route.distances.map((distance) => distance / scale) }
      const distanceLeft = telemetry.navigationDistance / scale
      if (Number.isFinite(distanceLeft) && cached.scaled.distances.every(Number.isFinite))
        value = { distances: cached.scaled.distances, distanceLeft }
    }
  }
  cached.physicalSample = { telemetry, next: routeNext, value }
  return value
}

/**
 * Game-scaled metres along the route (matching the trip pill, destination widget and game GPS).
 * Uses the game's own node distances on monotonic routes, reconstructs monotonic per-span game distances
 * across multi-leg/ferry rises, and falls back to `physical * localScale` if node distances are invalid.
 */
export function gameGuidanceDistancesOf(state: GuidanceState): GuidanceDistances | null {
  if (!isValidState(state)) return null
  const { route, routeNext, telemetry } = state
  const cached = cachedOf(route)
  if (cached.gameSample?.telemetry === telemetry && cached.gameSample.next === routeNext) return cached.gameSample.value
  let value: GuidanceDistances | null = null
  if (cached.validGameDistances) {
    if (cached.lastRise < 0 || Math.max(0, routeNext - 1) >= cached.lastRise) {
      value = { distances: route.distances, distanceLeft: telemetry.navigationDistance }
    } else if (cached.geometry) {
      const located = locateOnGeometry(cached.geometry, routeNext, telemetry)
      if (located) {
        const scale = Number.isFinite(telemetry.localScale) && telemetry.localScale > 0 ? telemetry.localScale : 0
        const distances = normalizedGameDistancesOf(route, cached, scale)
        let distanceLeft: number
        if (located.kind === 'approach') {
          distanceLeft = distances[0] + (scale > 0 ? located.approachLength * scale : 0)
        } else {
          const spanPhys = cached.geometry.remaining[located.span][0]
          const fraction = spanPhys > 0 ? Math.min(1, Math.max(0, located.spanRemaining / spanPhys)) : 0
          const spanGame = distances[located.span] - distances[located.span + 1]
          distanceLeft = distances[located.span + 1] + spanGame * fraction
        }
        if (Number.isFinite(distanceLeft))
          value = { distances, distanceLeft: Math.max(Number.EPSILON, distanceLeft) }
      }
    }
  } else {
    const scale = telemetry.localScale
    const physical = guidanceDistancesOf(state)
    if (physical && Number.isFinite(scale) && scale > 0) {
      if (cached.scaledGame?.scale !== scale)
        cached.scaledGame = { scale, distances: physical.distances.map((distance) => distance * scale) }
      const distanceLeft = physical.distanceLeft * scale
      if (Number.isFinite(distanceLeft) && cached.scaledGame.distances.every(Number.isFinite))
        value = { distances: cached.scaledGame.distances, distanceLeft: Math.max(Number.EPSILON, distanceLeft) }
    }
  }
  cached.gameSample = { telemetry, next: routeNext, value }
  return value
}

/**
 * Navigation card guidance: displays game-scaled distances (matching total trip distance 1:1), while
 * using physical metres along route geometry for consecutive-turn ("then") proximity when available.
 * The same eligibility check is used by both card variants and their surrounding layout.
 */
export function guidanceFor(state: GuidanceState): Guidance | null {
  const game = gameGuidanceDistancesOf(state)
  if (!state.route || !game) return null
  const physical = guidanceDistancesOf(state)
  const guidance = physical
    ? guidanceOf(
        game.distances,
        state.route.maneuvers,
        state.routeNext,
        game.distanceLeft,
        physical.distances,
        physical.distanceLeft,
      )
    : guidanceOf(game.distances, state.route.maneuvers, state.routeNext, game.distanceLeft)
  if (
    guidance?.step.kind === 'arrive' &&
    state.telemetry &&
    Number.isFinite(state.telemetry.navigationDistance) &&
    state.telemetry.navigationDistance > 0
  ) {
    return { ...guidance, distance: state.telemetry.navigationDistance }
  }
  return guidance
}

/** Physical-metre guidance for spatial consumers such as dynamic junction camera zoom. */
export function physicalGuidanceFor(state: GuidanceState): Guidance | null {
  const distances = guidanceDistancesOf(state)
  return state.route && distances
    ? guidanceOf(distances.distances, state.route.maneuvers, state.routeNext, distances.distanceLeft)
    : null
}
