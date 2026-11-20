import { useShallow } from 'zustand/react/shallow'
import { formatTripDistance, roadSpeed } from '../../shared/format'
import type { Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import type { CorridorRoute } from './corridor'
import { nearestSpeedCameraAhead, type SpeedCamera, useSpeedCameras } from './speedCameras'

export interface SpeedCameraSnapshot {
  distanceText: string
  limit: number
  overspeed: boolean
  urgent: boolean
}

/** Quantizes upcoming speed camera telemetry into primitive fields so HUD renders only when displayed values change. */
export function speedCameraSnapshotOf(
  cameras: readonly SpeedCamera[],
  telemetry: Telemetry | null,
  route: CorridorRoute | null,
  routeNext: number,
  decimal: string,
  mph: boolean,
): SpeedCameraSnapshot | null {
  const nearest = nearestSpeedCameraAhead(cameras, telemetry, route, routeNext)
  if (!nearest || !telemetry) return null

  const distanceText = nearest.distance >= 15 ? formatTripDistance(nearest.distance, decimal, mph) : ''
  const limit = roadSpeed(telemetry.navigationSpeedLimit, mph)
  const speed = roadSpeed(telemetry.speed, mph)
  const overspeed = limit > 0 && speed > limit

  return {
    distanceText,
    limit,
    overspeed,
    urgent: overspeed || nearest.distance <= 80,
  }
}

export function useUpcomingSpeedCamera(): SpeedCameraSnapshot | null {
  const { decimal } = useText()
  const cameras = useSpeedCameras()
  return useLive(
    useShallow((state) =>
      cameras && cameras.length > 0
        ? speedCameraSnapshotOf(cameras, state.telemetry, state.route, state.routeNext, decimal, state.mph)
        : null,
    ),
  )
}
