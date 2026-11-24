import type { JobInfo, RouteAction, RouteAnswer, Telemetry } from '../../shared/host'
import { placesAhead } from './alongRoute'
import type { Destination, DestinationKind } from './places'
import { metresBetween, toLngLat } from './projection'
import { type Point, progressOf, type RouteNode, routeSpans } from './route'
import { changeRoute } from './routeChange'

export type QuickStopCategory = 'fuel' | 'rest' | 'service'

export const STOP_KINDS: Record<QuickStopCategory, readonly DestinationKind[]> = {
  fuel: ['fuel'],
  rest: ['parking', 'hotel'],
  service: ['service'],
}

export interface RouteGeometryLike {
  nodes: readonly RouteNode[]
  paths: ReadonlyMap<number, Point[]>
  shifts: ReadonlyMap<number, number>
}

export interface FoundQuickStop {
  place: Destination
  distanceMeters: number
  alongRoute: boolean
}

export interface QuickStopResult {
  status: 'added' | 'noPlaces' | 'noTelemetry' | 'failed'
  answer?: RouteAnswer
  action?: RouteAction
  place?: Destination
  distanceMeters?: number
  alongRoute?: boolean
}

/**
 * Finds the nearest stop matching `kinds` along the active GPS route ahead of the truck,
 * or falls back to the nearest matching place by straight-line map distance when no route is active.
 */
export function findNearestStop(
  places: readonly Destination[] | null | undefined,
  kinds: readonly DestinationKind[],
  telemetry: Pick<Telemetry, 'x' | 'z'> | null,
  route: RouteGeometryLike | null,
  routeNext: number,
): FoundQuickStop | null {
  if (!places || places.length === 0 || !telemetry) return null

  if (route && route.nodes.length >= 2) {
    const spans = routeSpans(route.nodes, route.paths, route.shifts)
    const progress = progressOf(spans, routeNext, [telemetry.x, telemetry.z])
    if (progress) {
      const ahead = placesAhead(places, spans, progress).filter((entry) => kinds.includes(entry.place.kind))
      if (ahead.length > 0) {
        return {
          place: ahead[0].place,
          distanceMeters: ahead[0].along,
          alongRoute: true,
        }
      }
    }
  }

  const from = toLngLat(telemetry.x, telemetry.z)
  let bestPlace: Destination | null = null
  let bestDistance = Infinity
  for (const place of places) {
    if (!kinds.includes(place.kind)) continue
    const dist = metresBetween(from, place.at)
    if (dist < bestDistance) {
      bestDistance = dist
      bestPlace = place
    }
  }
  return bestPlace ? { place: bestPlace, distanceMeters: bestDistance, alongRoute: false } : null
}

/**
 * Adds the nearest stop for `category` to the game's GPS route (`addStop` when a route/job exists, or `go`).
 */
export async function addNearestStop(
  places: readonly Destination[] | null | undefined,
  category: QuickStopCategory,
  live: {
    telemetry: Pick<Telemetry, 'x' | 'z'> | null
    route: RouteGeometryLike | null
    routeNext: number
    job: Pick<JobInfo, 'active'> | null
  },
  applyRoute: (action: RouteAction, node?: string) => Promise<RouteAnswer> = changeRoute,
): Promise<QuickStopResult> {
  if (!live.telemetry) return { status: 'noTelemetry' }
  const found = findNearestStop(places, STOP_KINDS[category], live.telemetry, live.route, live.routeNext)
  if (!found) return { status: 'noPlaces' }
  const action: RouteAction = live.route || live.job?.active ? 'addStop' : 'go'
  const answer = await applyRoute(action, found.place.node)
  if (answer === 'done' || answer === 'alreadyThere') {
    return {
      status: 'added',
      answer,
      action,
      place: found.place,
      distanceMeters: found.distanceMeters,
      alongRoute: found.alongRoute,
    }
  }
  return {
    status: 'failed',
    answer,
    action,
    place: found.place,
    distanceMeters: found.distanceMeters,
    alongRoute: found.alongRoute,
  }
}
