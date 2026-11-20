import { useLive } from '../state/store'
import { useText } from '../state/text'
import { guidanceFor } from './guidanceDistance'
import { useLaneHint } from './useLaneHint'
import { type SpeedCameraSnapshot, useUpcomingSpeedCamera } from './useSpeedCamera'

export function SpeedCameraPillView({
  camera,
  label,
  compact = false,
  standalone = false,
}: {
  camera: SpeedCameraSnapshot
  label: string
  compact?: boolean
  standalone?: boolean
}) {
  return (
    <div
      className={`speed-camera-pill${camera.overspeed ? ' overspeed' : ''}${camera.urgent ? ' urgent' : ''}${compact ? ' compact' : ''}`}
      aria-label={camera.distanceText ? `${label} ${camera.distanceText}` : label}
    >
      <span className="speed-camera-pill-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path
            d="M4.5 9.5A2 2 0 0 1 6.5 7.5h7a2 2 0 0 1 2 2v1.2l3.3-2a.8.8 0 0 1 1.2.7v5.2a.8.8 0 0 1-1.2.7l-3.3-2v1.2a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-5Z"
            fill="currentColor"
          />
          <circle cx="10" cy="12" r="2" fill="var(--camera-lens-cut, #181b20)" />
          <path d="M10 17.5v3M7 20.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      {(!compact || standalone) && <span className="speed-camera-pill-label">{label}</span>}
      {camera.limit > 0 && <span className="speed-camera-pill-limit">{camera.limit}</span>}
      {camera.distanceText && <span className="speed-camera-pill-distance">{camera.distanceText}</span>}
    </div>
  )
}

/** Standalone lightweight top-left speed camera HUD while free-driving without active route guidance. */
export function FreeDriveSpeedCamera() {
  const text = useText()
  const hasGuidance = useLive((state) => guidanceFor(state) !== null)
  const lane = useLaneHint()
  const camera = useUpcomingSpeedCamera()
  if (hasGuidance || lane.hint !== null || !camera) return null
  return (
    <div className="free-drive-signal free-drive-camera glass">
      <SpeedCameraPillView camera={camera} label={text.speedCamera} standalone />
    </div>
  )
}
