import { useShallow } from 'zustand/react/shallow'
import { type ClockStyle, formatGameTime, formatTripDistance, formatTripTime } from '../../shared/format'
import { cabClock, type JobInfo, type SemaphoreInfo, type Telemetry } from '../../shared/host'
import { calculateTripProgress } from '../dashboard/tripProgress'
import { useClockStyle } from '../state/hooks'
import { type LiveState, useLive } from '../state/store'
import { type Strings, useText } from '../state/text'
import { computeUpcomingCorridor, type CorridorRoute, type UpcomingCorridor } from './corridor'
import { nextStop } from './nextStop'
import { nearestSpeedCameraAhead, type NearestSpeedCamera, type SpeedCamera } from './speedCameras'
import { nearestTrafficLightAhead, type NearestTrafficLight } from './trafficLights'

interface UpcomingCache {
  telemetry: Telemetry | null
  route: CorridorRoute | null
  routeNext: number
  value: UpcomingCorridor | null
}

let upcomingCache: UpcomingCache | null = null

/** Computes and memoizes the upcoming corridor polyline once per `(telemetry, route, routeNext)` tuple. */
export function upcomingCorridorFor(
  telemetry: Telemetry | null,
  route: CorridorRoute | null,
  routeNext: number,
): UpcomingCorridor | null {
  if (
    upcomingCache &&
    upcomingCache.telemetry === telemetry &&
    upcomingCache.route === route &&
    upcomingCache.routeNext === routeNext
  ) {
    return upcomingCache.value
  }
  const value = computeUpcomingCorridor(telemetry, route, routeNext)
  upcomingCache = { telemetry, route, routeNext, value }
  return value
}

interface LightCache {
  semaphores: readonly SemaphoreInfo[]
  telemetry: Telemetry | null
  route: CorridorRoute | null
  routeNext: number
  value: NearestTrafficLight | null
}

let lightCache: LightCache | null = null

/** Reference-memoized nearest traffic light ahead, sharing the upcoming route polyline with speed cameras. */
export function nearestLightFor(
  semaphores: readonly SemaphoreInfo[],
  telemetry: Telemetry | null,
  route: CorridorRoute | null = null,
  routeNext = 0,
): NearestTrafficLight | null {
  if (
    lightCache &&
    lightCache.semaphores === semaphores &&
    lightCache.telemetry === telemetry &&
    lightCache.route === route &&
    lightCache.routeNext === routeNext
  ) {
    return lightCache.value
  }
  const upcoming = route ? upcomingCorridorFor(telemetry, route, routeNext) : undefined
  const value = nearestTrafficLightAhead(semaphores, telemetry, route, routeNext, upcoming)
  lightCache = { semaphores, telemetry, route, routeNext, value }
  return value
}

interface CameraCache {
  cameras: readonly SpeedCamera[]
  telemetry: Telemetry | null
  route: CorridorRoute | null
  routeNext: number
  value: NearestSpeedCamera | null
}

let cameraCache: CameraCache | null = null

/** Reference-memoized nearest fixed speed camera ahead, sharing the upcoming route polyline with traffic lights. */
export function nearestCameraFor(
  cameras: readonly SpeedCamera[],
  telemetry: Telemetry | null,
  route: CorridorRoute | null = null,
  routeNext = 0,
): NearestSpeedCamera | null {
  if (
    cameraCache &&
    cameraCache.cameras === cameras &&
    cameraCache.telemetry === telemetry &&
    cameraCache.route === route &&
    cameraCache.routeNext === routeNext
  ) {
    return cameraCache.value
  }
  const upcoming = route ? upcomingCorridorFor(telemetry, route, routeNext) : undefined
  const value = nearestSpeedCameraAhead(cameras, telemetry, route, routeNext, upcoming)
  cameraCache = { cameras, telemetry, route, routeNext, value }
  return value
}

/** Shared O(1)-cached corridor snapshot for both 70 FPS `liveMap.ts` rendering and 20 Hz React HUDs. */
export function corridorMatchesFor(
  state: Pick<LiveState, 'semaphores' | 'telemetry' | 'route' | 'routeNext'>,
  cameras: readonly SpeedCamera[],
): { light: NearestTrafficLight | null; camera: NearestSpeedCamera | null } {
  return {
    light: nearestLightFor(state.semaphores, state.telemetry, state.route, state.routeNext),
    camera: cameras.length > 0 ? nearestCameraFor(cameras, state.telemetry, state.route, state.routeNext) : null,
  }
}

/** Resets module caches (for deterministic unit tests). */
export function resetNavigationSnapshotCache(): void {
  upcomingCache = null
  lightCache = null
  cameraCache = null
  tripBaseline = { routeId: null, baseline: 0 }
}

export interface QuantizedTripSnapshot {
  arrival: string
  time: string
  stopTime: string | null
  totalTime: string
  distance: string
  progressPercent: number
  stopCount: number
  onJob: boolean
}

let tripBaseline: { routeId: number | null; baseline: number } = { routeId: null, baseline: 0 }

function updateTripBaseline(
  routeId: number | null,
  routeDistances: readonly number[] | null | undefined,
  job: JobInfo | null,
  navigationDistance: number,
): number {
  const initial = Math.max(
    routeDistances?.[0] ?? 0,
    job?.plannedDistanceKm ? job.plannedDistanceKm * 1000 : 0,
    navigationDistance,
  )
  if (tripBaseline.routeId !== routeId) {
    tripBaseline = { routeId, baseline: initial }
  } else if (navigationDistance > tripBaseline.baseline) {
    tripBaseline = { routeId, baseline: navigationDistance }
  }
  return tripBaseline.baseline
}

/** Computes a quantized trip snapshot with only primitive display fields so subscribers don't re-render at 20 Hz. */
export function quantizedTripOf(
  state: Pick<LiveState, 'telemetry' | 'route' | 'routeStops' | 'routeNext' | 'clockShift' | 'mph' | 'job'>,
  text: Strings,
  clock: ClockStyle,
): QuantizedTripSnapshot | null {
  const telemetry = state.telemetry
  if (!telemetry || !Number.isFinite(telemetry.navigationDistance) || telemetry.navigationDistance <= 0) return null
  const minutes = telemetry.navigationTime / 60
  const stop = state.route
    ? nextStop(
        state.routeStops,
        state.route.distances,
        state.routeNext,
        telemetry.navigationDistance,
        telemetry.navigationTime,
      )
    : null
  const totalTime = formatTripTime(minutes, text)
  const stopTime = stop ? formatTripTime(stop.minutes, text) : null
  const baseline = updateTripBaseline(
    state.route?.id ?? null,
    state.route?.distances,
    state.job,
    telemetry.navigationDistance,
  )
  const progressPercent = calculateTripProgress(telemetry.navigationDistance, state.route, state.job, baseline)
  return {
    arrival: formatGameTime(Math.round(cabClock(telemetry, state.clockShift) + minutes), clock),
    time: stopTime ? `${stopTime} | ${totalTime}` : totalTime,
    stopTime,
    totalTime,
    distance: formatTripDistance(telemetry.navigationDistance, text.decimal, state.mph),
    progressPercent,
    stopCount: state.routeStops.length,
    onJob: state.job !== null,
  }
}

/** Quantized trip hook: only triggers React re-renders when formatted arrival/time/distance or integer % changes. */
export function useQuantizedTrip(): QuantizedTripSnapshot | null {
  const text = useText()
  const clock = useClockStyle()
  return useLive(useShallow((state) => quantizedTripOf(state, text, clock)))
}
