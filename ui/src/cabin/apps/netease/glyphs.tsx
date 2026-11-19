import type { ReactNode } from 'react'

interface GlyphProps {
  size: number
}

function LineGlyph({ size, children }: GlyphProps & { children: ReactNode }) {
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

function SolidGlyph({ size, children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  )
}

/** NetEase Cloud Music brand disc emblem. */
export function NeteaseMarkGlyph({ size }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#e60026" />
      <path
        d="M15.1 7.6c-.8-.7-1.9-1.1-3-1.1-2.6 0-4.7 2.1-4.7 4.7 0 1.8.9 3.3 2.4 4.1.6.3 1.4 0 1.6-.7.2-.5 0-1.1-.5-1.4-.6-.4-1-1.1-1-2 0-1.3 1-2.3 2.2-2.3.7 0 1.3.3 1.8.8.4.4 1.1.4 1.4 0 .4-.4.3-1.6-.2-2.1Z"
        fill="#fff"
      />
      <circle cx="12.2" cy="11.6" r="1.4" fill="#fff" />
      <path
        d="M13.6 11.6v4.6a2.3 2.3 0 1 1-1.6-2.2"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Heart / Like icon, solid when liked. */
export function HeartGlyph({ size, on = false }: GlyphProps & { on?: boolean }) {
  const path =
    'M12 20.6s-7.4-4.5-9.2-9C1.7 8.8 3.4 5.5 6.8 5.2c1.9-.2 3.7.8 5.2 2.4 1.5-1.6 3.3-2.6 5.2-2.4 3.4.3 5.1 3.6 4 6.4-1.8 4.5-9.2 9-9.2 9Z'
  return on ? (
    <SolidGlyph size={size}>
      <path d={path} />
    </SolidGlyph>
  ) : (
    <LineGlyph size={size}>
      <path d={path} />
    </LineGlyph>
  )
}

/** Discover / Charts compass icon. */
export function DiscoverGlyph({ size, on = false }: GlyphProps & { on?: boolean }) {
  return on ? (
    <SolidGlyph size={size}>
      <path d="M12 2.5a9.5 9.5 0 1 0 9.5 9.5A9.5 9.5 0 0 0 12 2.5Zm3.8 5.7-2.2 5.4-5.4 2.2 2.2-5.4 5.4-2.2Z" />
      <circle cx="12" cy="12" r="1.1" fill="var(--app-background, #0b0b0d)" />
    </SolidGlyph>
  ) : (
    <LineGlyph size={size}>
      <circle cx="12" cy="12" r="8.8" />
      <polygon points="15.3 8.7 13.4 13.4 8.7 15.3 10.6 10.6 15.3 8.7" strokeWidth={1.8} />
    </LineGlyph>
  )
}

/** Private Roaming infinity waves icon. */
export function RoamingGlyph({ size }: GlyphProps) {
  return (
    <LineGlyph size={size}>
      <path d="M18.18 8a4 4 0 0 1 0 8c-2.6 0-4.4-2.5-6.18-4-1.78-1.5-3.58-4-6.18-4a4 4 0 0 0 0 8c2.6 0 4.4-2.5 6.18-4 1.78-1.5 3.58-4 6.18-4Z" />
    </LineGlyph>
  )
}

/** Calendar icon showing the current day of the month. */
export function CalendarDayGlyph({ size, day }: GlyphProps & { day: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3.2" strokeWidth="2" />
      <path d="M8 2.8v3M16 2.8v3M3.8 9.2h16.4" strokeWidth="2" strokeLinecap="round" />
      <text
        x="12"
        y="17.2"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="8.5"
        fontWeight="800"
        fontFamily="inherit"
      >
        {day}
      </text>
    </svg>
  )
}

/** Heartbeat / ECG icon for Heartbeat mode. */
export function HeartbeatGlyph({ size }: GlyphProps) {
  return (
    <LineGlyph size={size}>
      <path d="M3 12h3.4l2.1-5.2 3.2 10.4 2.5-6.6 1.7 3.4H21" />
    </LineGlyph>
  )
}

/** Flame / Rising trend icon for Soaring Chart. */
export function FlameGlyph({ size }: GlyphProps) {
  return (
    <LineGlyph size={size}>
      <path d="M12.3 3.2c.6 2.9-.8 4.7-2.2 6.1-1.3 1.3-2.6 2.8-2.6 5a5.2 5.2 0 0 0 10.4 0c0-3.2-2-5.4-4-7.4-.5-.5-1.1-1.9-1.6-3.7Z" />
      <path d="M10.2 15.6c0 1.1.8 2 1.8 2s1.8-.9 1.8-2c0-1-.7-1.7-1.4-2.4-.7.7-2.2 1.4-2.2 2.4Z" strokeWidth={1.6} />
    </LineGlyph>
  )
}

/** Black Vinyl VIP Crown emblem. */
export function CrownGlyph({ size }: GlyphProps) {
  return (
    <SolidGlyph size={size}>
      <path d="M3.5 17.5h17v1.8a.9.9 0 0 1-.9.9H4.4a.9.9 0 0 1-.9-.9v-1.8Zm0-2L2.3 7.9a.7.7 0 0 1 1.1-.7l4.4 3.4L11.2 5a.9.9 0 0 1 1.6 0l3.4 5.6 4.4-3.4a.7.7 0 0 1 1.1.7l-1.2 7.6h-17Z" />
    </SolidGlyph>
  )
}

/** Trash bin icon for clearing queue. */
export function TrashGlyph({ size }: GlyphProps) {
  return (
    <LineGlyph size={size}>
      <path d="M4.5 6.5h15M9.5 4h5M7 6.5l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h5.4a1.5 1.5 0 0 0 1.5-1.3L17 6.5" />
      <path d="M10.2 10.5v5.5M13.8 10.5v5.5" strokeWidth={1.8} />
    </LineGlyph>
  )
}

/** Sign-out door icon. */
export function SignOutGlyph({ size }: GlyphProps) {
  return (
    <LineGlyph size={size}>
      <path d="M10 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4M15 8l4 4-4 4M9.5 12H19" />
    </LineGlyph>
  )
}

/** QR code icon for desktop scan login. */
export function QrCodeGlyph({ size }: GlyphProps) {
  return (
    <LineGlyph size={size}>
      <rect x="3.8" y="3.8" width="6.4" height="6.4" rx="1.2" />
      <rect x="13.8" y="3.8" width="6.4" height="6.4" rx="1.2" />
      <rect x="3.8" y="13.8" width="6.4" height="6.4" rx="1.2" />
      <path d="M14 14h2.2v2.2H14Zm3.8 0h2.2v2.2h-2.2Zm-3.8 3.8h2.2V20H14Zm3.8 0h2.2V20h-2.2Z" fill="currentColor" stroke="none" />
    </LineGlyph>
  )
}

/** Warning exclamation triangle icon. */
export function WarningGlyph({ size }: GlyphProps) {
  return (
    <LineGlyph size={size}>
      <path d="M10.4 4.4 2.8 17.5a1.8 1.8 0 0 0 1.6 2.7h15.2a1.8 1.8 0 0 0 1.6-2.7L13.6 4.4a1.8 1.8 0 0 0-3.2 0Z" />
      <path d="M12 9.5v4.3" />
      <circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none" />
    </LineGlyph>
  )
}

/** Headphones play count badge icon. */
export function HeadphonesGlyph({ size }: GlyphProps) {
  return (
    <LineGlyph size={size}>
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <rect x="3.2" y="13.5" width="3.3" height="5.5" rx="1.4" fill="currentColor" stroke="none" />
      <rect x="17.5" y="13.5" width="3.3" height="5.5" rx="1.4" fill="currentColor" stroke="none" />
    </LineGlyph>
  )
}
