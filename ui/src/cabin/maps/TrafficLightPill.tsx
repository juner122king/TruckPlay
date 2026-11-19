import { useLive } from '../state/store'
import { guidanceFor } from './guidanceDistance'
import { useLaneHint } from './useLaneHint'
import { type TrafficLightSnapshot, useUpcomingTrafficLight } from './useTrafficLight'

export function TrafficLightPillView({ signal, compact = false }: { signal: TrafficLightSnapshot; compact?: boolean }) {
  return (
    <div className={`traffic-pill ${signal.stateClass}${signal.urgent ? ' urgent' : ''}${compact ? ' compact' : ''}`}>
      <span className="traffic-pill-lamps" aria-hidden="true">
        <span className="traffic-pill-lamp lamp-red" />
        <span className="traffic-pill-lamp lamp-yellow" />
        <span className="traffic-pill-lamp lamp-green" />
      </span>
      {signal.countdown > 0 && <span className="traffic-pill-timer">{signal.countdown}s</span>}
      {!compact && signal.distanceText && <span className="traffic-pill-distance">{signal.distanceText}</span>}
      {!compact && signal.progressPct !== null && (
        <span className="traffic-pill-track" aria-hidden="true">
          <span className="traffic-pill-fill" style={{ width: `${signal.progressPct}%` }} />
        </span>
      )}
    </div>
  )
}

/** Standalone lightweight top-left traffic signal HUD while free-driving without active route guidance. */
export function FreeDriveTrafficLight() {
  const hasGuidance = useLive((state) => guidanceFor(state) !== null)
  const lane = useLaneHint()
  const signal = useUpcomingTrafficLight()
  if (hasGuidance || lane.hint !== null || !signal) return null
  return (
    <div className="free-drive-signal glass">
      <TrafficLightPillView signal={signal} />
    </div>
  )
}
