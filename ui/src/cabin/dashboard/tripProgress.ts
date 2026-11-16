import { useState } from 'react'
import type { JobInfo } from '../../shared/host'

export interface RouteDistanceSource {
  id?: number | null
  distances?: readonly number[] | null
}

/**
 * Calculates current trip progress ratio (0 to 1) and percentage (0 to 100).
 *
 * @param navigationDistance Remaining distance in metres (from telemetry)
 * @param route Current route object (with distances array)
 * @param job Current active freight job (with plannedDistanceKm)
 * @param baselineDistance Optional baseline distance recorded when this route started
 */
export function calculateTripProgress(
  navigationDistance: number,
  route?: RouteDistanceSource | null,
  job?: JobInfo | null,
  baselineDistance?: number,
): number {
  if (!Number.isFinite(navigationDistance) || navigationDistance <= 0) return 0

  const plannedFromJob = job?.plannedDistanceKm ? Math.max(0, job.plannedDistanceKm * 1000) : 0
  const plannedFromRoute = route?.distances && route.distances.length > 0 ? Math.max(0, route.distances[0]) : 0
  const baseline = Math.max(0, baselineDistance ?? 0)

  const totalDistance = Math.max(plannedFromJob, plannedFromRoute, baseline, navigationDistance)
  if (totalDistance <= 0) return 0

  const coveredDistance = Math.max(0, totalDistance - navigationDistance)
  const ratio = coveredDistance / totalDistance
  return Math.min(100, Math.max(0, Math.round(ratio * 100)))
}

/**
 * React hook that tracks the initial distance baseline for the current route session
 * so progress increases monotonically as the player drives.
 */
export function useTripProgress(
  navigationDistance: number,
  routeId: number | null | undefined,
  routeDistances: readonly number[] | null | undefined,
  job: JobInfo | null | undefined,
): number {
  const [session, setSession] = useState<{ routeId: number | null; baseline: number }>({
    routeId: null,
    baseline: 0,
  })

  let baseline = session.baseline
  const currentRouteId = routeId ?? null

  if (currentRouteId !== session.routeId) {
    const initial = Math.max(
      routeDistances?.[0] ?? 0,
      job?.plannedDistanceKm ? job.plannedDistanceKm * 1000 : 0,
      navigationDistance,
    )
    baseline = initial
    setSession({ routeId: currentRouteId, baseline: initial })
  } else if (navigationDistance > session.baseline) {
    // Detour or route expansion: smoothly expand baseline so progress doesn't underflow
    baseline = navigationDistance
    setSession({ routeId: currentRouteId, baseline: navigationDistance })
  }

  return calculateTripProgress(navigationDistance, { id: routeId, distances: routeDistances }, job, baseline)
}
