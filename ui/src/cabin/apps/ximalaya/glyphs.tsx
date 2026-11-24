import type { ReactNode } from 'react'

interface GlyphProps {
  size?: number
  on?: boolean
}

function Line({ size = 24, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function DiscoverGlyph({ size = 24, on }: GlyphProps) {
  return (
    <Line size={size}>
      <circle cx="12" cy="12" r="9" fill={on ? 'currentColor' : 'none'} fillOpacity={on ? 0.18 : 0} />
      <polygon
        points="15.8 8.2 13.6 13.6 8.2 15.8 10.4 10.4 15.8 8.2"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.8}
      />
    </Line>
  )
}

export function CategoryGlyph({ size = 24, on }: GlyphProps) {
  return (
    <Line size={size}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" fill={on ? 'currentColor' : 'none'} />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" fill={on ? 'currentColor' : 'none'} />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" fill={on ? 'currentColor' : 'none'} />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" fill={on ? 'currentColor' : 'none'} />
    </Line>
  )
}

export function ChartGlyph({ size = 24, on }: GlyphProps) {
  return (
    <Line size={size}>
      <rect x="3.5" y="11" width="4.5" height="9.5" rx="1.4" fill={on ? 'currentColor' : 'none'} />
      <rect x="9.75" y="4.5" width="4.5" height="16" rx="1.4" fill={on ? 'currentColor' : 'none'} />
      <rect x="16" y="8" width="4.5" height="12.5" rx="1.4" fill={on ? 'currentColor' : 'none'} />
    </Line>
  )
}

export function AudioBookGlyph({ size = 36 }: GlyphProps) {
  return (
    <Line size={size}>
      <path d="M4.5 14v-1a7.5 7.5 0 0 1 15 0v1" />
      <rect x="3.5" y="13.5" width="3.8" height="6.5" rx="1.8" />
      <rect x="16.7" y="13.5" width="3.8" height="6.5" rx="1.8" />
      <path d="M10 13.5v4M14 11.5v6" />
    </Line>
  )
}

export function Rewind15Glyph({ size = 32 }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.5 8.5A9 9 0 1 1 5.2 16" />
      <polyline points="7.5 4.2 7.5 8.8 12.1 8.8" />
      <text
        x="14"
        y="17.8"
        textAnchor="middle"
        fontSize="8.8"
        fontWeight="750"
        fill="currentColor"
        stroke="none"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        15
      </text>
    </svg>
  )
}

export function Forward30Glyph({ size = 32 }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 8.5A9 9 0 1 0 22.8 16" />
      <polyline points="20.5 4.2 20.5 8.8 15.9 8.8" />
      <text
        x="14"
        y="17.8"
        textAnchor="middle"
        fontSize="8.8"
        fontWeight="750"
        fill="currentColor"
        stroke="none"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        30
      </text>
    </svg>
  )
}

export function SpeedGlyph({ size = 22 }: GlyphProps) {
  return (
    <Line size={size}>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l4-5" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </Line>
  )
}

export function TimerGlyph({ size = 22 }: GlyphProps) {
  return (
    <Line size={size}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.2V13l2.6 1.8" />
      <path d="M9.5 3h5" />
    </Line>
  )
}

export function SortGlyph({ size = 20 }: GlyphProps) {
  return (
    <Line size={size}>
      <path d="M7 5v14M7 19l-3-3M7 19l3-3" />
      <path d="M17 19V5M17 5l-3 3M17 5l3 3" />
    </Line>
  )
}

export function FlameGlyph({ size = 16 }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12.7 2.4c.2 3.3-2 5.4-3.7 7.1-1.3 1.3-2.5 2.7-2.5 4.9A5.5 5.5 0 0 0 12 20a5.5 5.5 0 0 0 5.5-5.6c0-2.6-1.4-4.7-2.9-6.6-.4-.5-1.1-.1-1 .6.2 1.2-.2 2.4-1.1 3.1.4-2.2 1.8-5.1.2-9.1z" />
    </svg>
  )
}

export function HeadphonesGlyph({ size = 16 }: GlyphProps) {
  return (
    <Line size={size}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="14" width="3.6" height="6" rx="1.6" />
      <rect x="17.4" y="14" width="3.6" height="6" rx="1.6" />
    </Line>
  )
}

export function CrownGlyph({ size = 16 }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M3.5 18.5h17l1-10.5-5.3 4-4.2-6.5L7.8 12l-5.3-4 1 10.5z" />
    </svg>
  )
}

export function QrCodeGlyph({ size = 24 }: GlyphProps) {
  return (
    <Line size={size}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5H14zM18 14h2.5M14 18.5h2.5M18 18v2.5h2.5" />
    </Line>
  )
}

export function SignOutGlyph({ size = 20 }: GlyphProps) {
  return (
    <Line size={size}>
      <path d="M10 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4" />
      <path d="M15 8l4 4-4 4M19 12H9.5" />
    </Line>
  )
}

export function TrashGlyph({ size = 18 }: GlyphProps) {
  return (
    <Line size={size}>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M7 7l1 12.5h8L17 7" />
    </Line>
  )
}
