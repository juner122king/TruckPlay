/**
 * Specialized SVG glyphs for Ximalaya Automotive Infotainment.
 * Designed with truck dashboard ergonomics (high contrast, clean lines).
 */

export function Rewind15Glyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4.5A8 8 0 1 0 19.5 12" />
      <polyline points="11 1 11 5 15 5" />
      <text
        x="11.5"
        y="15.2"
        fontSize="7.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        15
      </text>
    </svg>
  )
}

export function Forward30Glyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 4.5A8 8 0 1 1 4.5 12" />
      <polyline points="13 1 13 5 9 5" />
      <text
        x="12.5"
        y="15.2"
        fontSize="7.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        30
      </text>
    </svg>
  )
}

export function SpeedGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4a9 9 0 0 0-9 9c0 2.8 1.3 5.3 3.3 6.9" />
      <path d="M21 13a9 9 0 0 0-3.3-6.9" />
      <line x1="12" y1="13" x2="16" y2="9" />
      <circle cx="12" cy="13" r="2" fill="currentColor" />
    </svg>
  )
}

export function TimerGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 15" />
      <line x1="10" y1="2" x2="14" y2="2" />
    </svg>
  )
}

export function PlaylistGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="11" y2="18" />
      <polygon points="17 12 21 14.5 17 17 17 12" fill="currentColor" />
    </svg>
  )
}

export function StarGlyph({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export function VolumeGlyph({ muted = false }: { muted?: boolean }) {
  if (muted) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

export function HeadphoneGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a9 9 0 0 1 18 0v9a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

export function FireGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M12 23c4.97 0 9-4.03 9-9 0-4.08-2.73-7.53-6.5-8.62-.23-.07-.46.12-.42.36.4 2.21-.49 4.38-2.25 5.61C10.59 12.22 9.5 13.78 9.5 15.5c0 .28.22.5.5.5s.5-.22.5-.5c0-1.12.63-2.14 1.63-2.65.25-.13.56.03.58.31.25 3.19-2.09 5.84-5.21 5.84-1.28 0-2.47-.45-3.41-1.2-.23-.18-.57-.02-.57.27C3.52 19.92 7.37 23 12 23z" />
    </svg>
  )
}
