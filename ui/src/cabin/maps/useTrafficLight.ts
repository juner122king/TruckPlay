import { useShallow } from 'zustand/react/shallow'
import { formatTripDistance } from '../../shared/format'
import type { SemaphoreInfo, Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import { nearestTrafficLightAhead, type TrafficLightRoute, trafficLightStateClass } from './trafficLights'

export interface TrafficLightSnapshot {
  stateClass: string
  countdown: number
  distanceText: string
  progressPct: number | null
  urgent: boolean
}

/** Quantizes upcoming signal telemetry into primitive fields so HUD renders only when displayed values change. */
export function trafficLightSnapshotOf(
  semaphores: readonly SemaphoreInfo[],
  telemetry: Telemetry | null,
  route: TrafficLightRoute | null,
  routeNext: number,
  decimal: string,
  mph: boolean,
): TrafficLightSnapshot | null {
  const nearest = nearestTrafficLightAhead(semaphores, telemetry, route, routeNext)
  if (!nearest) return null

  const s = nearest.semaphore
  const stateClass = trafficLightStateClass(s.state)
  if (stateClass === 'traffic-off') return null

  const countdown = Math.max(0, Math.ceil(s.countdown))
  const distanceText = nearest.distance >= 15 ? formatTripDistance(nearest.distance, decimal, mph) : ''
  const progressPct =
    Number.isFinite(s.duration) && s.duration > 0 && countdown > 0
      ? Math.round(Math.max(0, Math.min(1, s.countdown / s.duration)) * 20) * 5
      : null

  return {
    stateClass,
    countdown,
    distanceText,
    progressPct,
    urgent: countdown > 0 && countdown <= 3,
  }
}

export function useUpcomingTrafficLight(): TrafficLightSnapshot | null {
  const { decimal } = useText()
  return useLive(
    useShallow((state) =>
      trafficLightSnapshotOf(state.semaphores, state.telemetry, state.route, state.routeNext, decimal, state.mph),
    ),
  )
}
