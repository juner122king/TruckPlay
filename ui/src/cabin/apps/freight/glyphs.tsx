import { useId } from 'react'

/**
 * SF-Symbols-inspired SVG glyphs for the CarPlay Freight app.
 * Uses `currentColor` and semantic CSS variables so all icons adapt to Light/Dark appearance.
 */

export function WaybillGlyph({ size = 24 }: { size?: number }) {
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
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <polyline points="14 2 14 7 19 7" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  )
}

export function InspectionGlyph({ size = 24 }: { size?: number }) {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11.2 14.2 15.5 9.8" />
    </svg>
  )
}

export function HosGlyph({ size = 24 }: { size?: number }) {
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
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  )
}

export function RouteArrowGlyph({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </svg>
  )
}

export function CargoBoxGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

export function CoffeeCupGlyph({ size = 18 }: { size?: number }) {
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
      <path d="M17 8h1a3.5 3.5 0 0 1 0 7h-1" />
      <path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
      <line x1="7" y1="2.5" x2="7" y2="5" />
      <line x1="10.5" y1="2.5" x2="10.5" y2="5" />
      <line x1="14" y1="2.5" x2="14" y2="5" />
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
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 5v14" />
      <path d="M2 14h20v5" />
      <path d="M2 10h16a4 4 0 0 1 4 4" />
      <circle cx="6.5" cy="7.5" r="1.5" />
    </svg>
  )
}

export function TruckLineGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="12" height="10" rx="1.5" />
      <path d="M14 9h4.2l2.8 3.2V16h-7V9z" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
    </svg>
  )
}

export function FuelGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15" />
      <path d="M3 20h13" />
      <path d="M7 7h5v4H7z" />
      <path d="M15 9h2a2 2 0 0 1 2 2v5.5a1.5 1.5 0 0 0 3 0V9.5l-2.5-2.5" />
    </svg>
  )
}

export function BrakeGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7.5" />
      <path d="M3.8 6.5a10 10 0 0 0 0 11" />
      <path d="M20.2 6.5a10 10 0 0 1 0 11" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

export function CheckCircleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <polyline points="8.5 12.2 11 14.7 16 9.5" />
    </svg>
  )
}

export function AlertTriangleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13.5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  )
}

export function ClockGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  )
}

const TACHO_TICKS = Array.from({ length: 11 }, (_, i) => (i / 11) * 360)

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
  const r = 58
  const circumference = 2 * Math.PI * r
  const remainingPercent = Math.max(0, Math.min(100, 100 - fatiguePercent))
  const dashOffset = circumference - (remainingPercent / 100) * circumference
  const angle = (remainingPercent / 100) * 2 * Math.PI - Math.PI / 2
  const tipX = 80 + r * Math.cos(angle)
  const tipY = 80 + r * Math.sin(angle)

  return (
    <div className={`fr-tacho-ring level-${level}`}>
      <svg viewBox="0 0 160 160" className="fr-tacho-svg" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="2.5" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--tacho-start)" />
            <stop offset="100%" stopColor="var(--tacho-end)" />
          </linearGradient>
        </defs>

        {TACHO_TICKS.map((deg) => (
          <line
            key={deg}
            x1="80"
            y1="6"
            x2="80"
            y2="12"
            className="fr-tacho-tick"
            strokeWidth="1.8"
            strokeLinecap="round"
            transform={`rotate(${deg} 80 80)`}
          />
        ))}

        <circle cx="80" cy="80" r="52" className="fr-tacho-dial" />
        <circle cx="80" cy="80" r={r} fill="none" className="fr-tacho-track" strokeWidth="10" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          className="fr-tacho-arc"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
          filter={`url(#${filterId})`}
        />
        {remainingPercent > 2 && <circle cx={tipX} cy={tipY} r="5.5" className="fr-tacho-tip" />}
      </svg>

      <div className="fr-tacho-center">
        <span className="fr-tacho-time">{restDueText}</span>
        <span className={`fr-status-pill ${level === 'fresh' ? 'good' : level === 'normal' ? 'info' : 'bad'}`}>
          {fatigueLabel}
        </span>
      </div>
    </div>
  )
}
