import { useId } from 'react'

/**
 * Precision automotive cockpit linear glyphs & horological gauges for the Freight app.
 * Uses `currentColor` and semantic CSS custom properties so every glyph adapts seamlessly
 * to Dark Obsidian, Light Brushed Aluminum, Lite, and Forced-Colors modes.
 */

export function WaybillGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <polyline points="14.5 2.5 14.5 7 19 7" />
      <line x1="8.75" y1="11.75" x2="15.25" y2="11.75" />
      <line x1="8.75" y1="15.75" x2="13.25" y2="15.75" />
    </svg>
  )
}

export function InspectionGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21.5s7.5-3.8 7.5-9.5V5.2L12 2.5 4.5 5.2V12c0 5.7 7.5 9.5 7.5 9.5z" />
      <polyline points="8.8 12.1 11.1 14.4 15.6 9.8" />
    </svg>
  )
}

export function HosGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  )
}

export function RouteArrowGlyph({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="12" x2="19.5" y2="12" />
      <polyline points="14 6.5 19.5 12 14 17.5" />
    </svg>
  )
}

export function CargoBoxGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 15.8V8.2a2 2 0 0 0-1-1.73l-6.5-3.75a2 2 0 0 0-2 0L4.5 6.47a2 2 0 0 0-1 1.73v7.6a2 2 0 0 0 1 1.73l6.5 3.75a2 2 0 0 0 2 0l6.5-3.75a2 2 0 0 0 1-1.73z" />
      <polyline points="3.75 7.1 12 11.9 20.25 7.1" />
      <line x1="12" y1="21.5" x2="12" y2="11.9" />
    </svg>
  )
}

export function CoffeeCupGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 8.5h1.2a3.25 3.25 0 0 1 0 6.5H17" />
      <path d="M3.5 8.5H17v7.2a4.3 4.3 0 0 1-4.3 4.3H7.8a4.3 4.3 0 0 1-4.3-4.3V8.5z" />
      <line x1="7.2" y1="3" x2="7.2" y2="5.4" />
      <line x1="10.4" y1="3" x2="10.4" y2="5.4" />
      <line x1="13.6" y1="3" x2="13.6" y2="5.4" />
    </svg>
  )
}

export function BedRestGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 5.5v13" />
      <path d="M2.5 14h19v4.5" />
      <path d="M2.5 10.2h15.2a3.8 3.8 0 0 1 3.8 3.8" />
      <circle cx="6.8" cy="7.8" r="1.4" />
    </svg>
  )
}

export function TruckLineGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.2" y="6.2" width="11.6" height="9.8" rx="1.4" />
      <path d="M13.8 9.2h4.2l2.8 3.1V16h-7V9.2z" />
      <circle cx="6.6" cy="17.5" r="1.9" />
      <circle cx="17.4" cy="17.5" r="1.9" />
    </svg>
  )
}

export function FuelGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.2 20V5.2a2 2 0 0 1 2-2h6.8a2 2 0 0 1 2 2V20" />
      <path d="M3 20h13.2" />
      <path d="M7.2 7.2h4.8v3.8H7.2z" />
      <path d="M15 9.2h1.8a2 2 0 0 1 2 2v5.2a1.4 1.4 0 0 0 2.8 0V9.6l-2.4-2.4" />
    </svg>
  )
}

export function BrakeGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7.2" />
      <path d="M4 6.6a9.8 9.8 0 0 0 0 10.8" />
      <path d="M20 6.6a9.8 9.8 0 0 1 0 10.8" />
      <circle cx="12" cy="12" r="1.9" />
    </svg>
  )
}

export function CheckCircleGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" />
      <polyline points="8.6 12.2 11 14.6 15.8 9.6" />
    </svg>
  )
}

export function AlertTriangleGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13.5" />
      <circle cx="12" cy="17" r="0.65" fill="currentColor" />
    </svg>
  )
}

export function ClockGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" />
      <polyline points="12 7.2 12 12 15.4 13.8" />
    </svg>
  )
}

/* --- Precision 240° Automotive Health Arc Gauge -------------------------------------------------------- */

const HEALTH_START_DEG = 150
const HEALTH_SWEEP_DEG = 240
const HEALTH_TICKS = Array.from({ length: 25 }, (_, i) => ({
  index: i,
  deg: HEALTH_START_DEG + (i / 24) * HEALTH_SWEEP_DEG,
  major: i % 6 === 0,
}))

function polarPoint(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarPoint(cx, cy, r, startDeg)
  const end = polarPoint(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

const HEALTH_TRACK_PATH = describeArc(62, 62, 46, HEALTH_START_DEG, HEALTH_START_DEG + HEALTH_SWEEP_DEG)

export function HealthArcGauge({
  score,
  tone,
  label,
  valueText,
}: {
  score: number
  tone: 'good' | 'warn' | 'bad'
  label: string
  valueText: string
}) {
  const gradId = useId()
  const clamped = Math.max(0, Math.min(100, score))
  const r = 46
  const arcLength = (HEALTH_SWEEP_DEG / 360) * 2 * Math.PI * r
  const filledLength = (clamped / 100) * arcLength
  const tipDeg = HEALTH_START_DEG + (clamped / 100) * HEALTH_SWEEP_DEG
  const tip = polarPoint(62, 62, r, tipDeg)

  return (
    <div
      className={`fr-health-gauge tone-${tone}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
    >
      <svg viewBox="0 0 124 124" className="fr-health-svg" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--gauge-start)" />
            <stop offset="100%" stopColor="var(--gauge-end)" />
          </linearGradient>
        </defs>

        <circle cx="62" cy="62" r="57" className="fr-gauge-bezel" />

        {HEALTH_TICKS.map((tick) => {
          const outer = polarPoint(62, 62, 54.5, tick.deg)
          const inner = polarPoint(62, 62, tick.major ? 49.5 : 51.8, tick.deg)
          return (
            <line
              key={tick.index}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className={tick.major ? 'fr-gauge-tick major' : 'fr-gauge-tick'}
            />
          )
        })}

        <path d={HEALTH_TRACK_PATH} className="fr-gauge-track" />
        <path
          d={HEALTH_TRACK_PATH}
          stroke={`url(#${gradId})`}
          className="fr-gauge-arc"
          strokeDasharray={`${filledLength} ${arcLength}`}
        />
        {clamped > 2 && <circle cx={tip.x} cy={tip.y} r="3.6" className="fr-gauge-tip" />}
      </svg>

      <div className="fr-health-center" aria-hidden="true">
        <span className="fr-health-score">{clamped}</span>
        <span className="fr-health-max">/ 100</span>
      </div>
    </div>
  )
}

/* --- Horological 11-Hour Commercial Digital Tachograph Dial -------------------------------------------- */

const TACHO_TOTAL_TICKS = 66 // 11 hours * 6 sub-divisions (10-minute increments)
const TACHO_TICKS = Array.from({ length: TACHO_TOTAL_TICKS }, (_, i) => ({
  index: i,
  deg: (i / TACHO_TOTAL_TICKS) * 360,
  major: i % 6 === 0,
}))

export function TachographRing({
  fatiguePercent,
  level,
  restDueText,
  fatigueLabel,
}: {
  fatiguePercent: number
  level: 'fresh' | 'normal' | 'tired'
  restDueText: string
  fatigueLabel: string
}) {
  const filterId = useId()
  const gradId = useId()
  const dialGradId = useId()
  const r = 74
  const circumference = 2 * Math.PI * r
  const remainingPercent = Math.max(0, Math.min(100, 100 - fatiguePercent))
  const dashOffset = circumference - (remainingPercent / 100) * circumference
  const angle = (remainingPercent / 100) * 2 * Math.PI - Math.PI / 2
  const tipX = 100 + r * Math.cos(angle)
  const tipY = 100 + r * Math.sin(angle)

  return (
    <div className={`fr-tacho-ring level-${level}`}>
      <svg viewBox="0 0 200 200" className="fr-tacho-svg" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-18%" y="-18%" width="136%" height="136%">
            <feGaussianBlur stdDeviation="2.6" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--tacho-start)" />
            <stop offset="100%" stopColor="var(--tacho-end)" />
          </linearGradient>
          <radialGradient id={dialGradId} cx="50%" cy="32%" r="68%">
            <stop offset="0%" stopColor="var(--fr-dial-highlight)" />
            <stop offset="100%" stopColor="var(--fr-dial-core)" />
          </radialGradient>
        </defs>

        {/* Outer machined bezel ring */}
        <circle cx="100" cy="100" r="96" className="fr-tacho-bezel" />

        {/* 66 calibrated ticks (11 major hour indices + 55 sub-ticks) */}
        {TACHO_TICKS.map((tick) => (
          <line
            key={tick.index}
            x1="100"
            y1={tick.major ? '7.5' : '10.5'}
            x2="100"
            y2={tick.major ? '16' : '14.5'}
            className={tick.major ? 'fr-tacho-tick major' : 'fr-tacho-tick'}
            transform={`rotate(${tick.deg} 100 100)`}
          />
        ))}

        {/* Recessed inner dial plate & reference hairline */}
        <circle cx="100" cy="100" r="64" fill={`url(#${dialGradId})`} className="fr-tacho-dial" />
        <circle cx="100" cy="100" r="64" className="fr-tacho-dial-rim" />

        {/* Sweeping remaining-hours track and active arc */}
        <circle cx="100" cy="100" r={r} fill="none" className="fr-tacho-track" strokeWidth="9.5" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          className="fr-tacho-arc"
          strokeWidth="9.5"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
          filter={`url(#${filterId})`}
        />

        {/* Machined luminous tip */}
        {remainingPercent > 2 && <circle cx={tipX} cy={tipY} r="5.2" className="fr-tacho-tip" />}
      </svg>

      <div className="fr-tacho-center">
        <span className="fr-tacho-scale-tag">11H MAX</span>
        <span className="fr-tacho-time">{restDueText}</span>
        <span className="fr-tacho-divider" aria-hidden="true" />
        <span className={`fr-status-pill compact ${level === 'fresh' ? 'good' : level === 'normal' ? 'info' : 'bad'}`}>
          {fatigueLabel}
        </span>
      </div>
    </div>
  )
}
