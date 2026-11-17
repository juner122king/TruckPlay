export function SparkleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2.5 14.3 8.7 20.5 11l-6.2 2.3L12 19.5l-2.3-6.2L3.5 11l6.2-2.3L12 2.5Z" />
    </svg>
  )
}

export function SignalGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 11.5a8.5 8.5 0 0 1 8.5 8.5" />
      <path d="M4.5 5a15 15 0 0 1 15 15" />
      <circle cx="5.5" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function FireGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12.3 22c-4.3 0-7.8-3.4-7.8-7.7 0-4.4 3.8-8.9 5.9-11 .4-.4 1.2-.2 1.4.4.5 1.6 1.5 3.7 2.9 4.2 1.8.6 2.8 2.3 2.8 4.2 0 .9-.3 1.8-.7 2.5 1.3-.4 2.5-1.4 3-2.4.2-.5.9-.4 1 .1.8 3.3-.8 9.7-8.5 9.7Z" />
    </svg>
  )
}

export function LiveGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M16.2 7.8a6 6 0 0 1 0 8.4m-8.4-8.4a6 6 0 0 0 0 8.4" />
      <path d="M19.1 4.9a10 10 0 0 1 0 14.2m-14.2-14.2a10 10 0 0 0 0 14.2" />
    </svg>
  )
}

export function FilmGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="3.5" />
      <path d="M7.5 3v18M16.5 3v18M3 12h18M3 7.5h4.5M3 16.5h4.5M16.5 7.5H21M16.5 16.5H21" />
    </svg>
  )
}

export function CompassGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9.5" />
      <polygon points="16 8 14 14 8 16 10 10 16 8" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SortGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
    >
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  )
}

export function RefreshGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5 9.2 9.2 0 0 0-6.3 2.5L3.5 8" />
      <path d="M3.5 3.5V8H8" />
      <path d="M3.5 12a8.5 8.5 0 0 0 8.5 8.5 9.2 9.2 0 0 0 6.3-2.5l2.2-2" />
      <path d="M16 16h4.5v4.5" />
    </svg>
  )
}

export function TrashGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h16m-2 0v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6m3 0V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v2" />
    </svg>
  )
}

export function DanmakuGlyph({ on }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor">
      <rect x="3" y="4.5" width="18" height="14" rx="3" strokeWidth="2" fill={on ? 'currentColor' : 'none'} />
      <path
        d="M7 9h5M7 13h10M14.5 9h2.5"
        stroke={on ? '#14151a' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function TvGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6.5" width="18" height="13" rx="3" />
      <path d="m8 3.5 4 3 4-3" />
    </svg>
  )
}

export function CarGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
    </svg>
  )
}

export function GamepadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="7" width="19" height="10.5" rx="5" />
      <path d="M7 12.2h3.5M8.75 10.5V14" />
      <circle cx="15.5" cy="11.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="13.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PhoneGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18h3" />
    </svg>
  )
}

export function MicGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
    </svg>
  )
}

export function StarGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="m12 3.2 2.6 5.4 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.3-4.2 6-.9L12 3.2Z" />
    </svg>
  )
}

export function ClockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  )
}

export function DocGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18" />
    </svg>
  )
}

export function SmileGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <circle cx="9.2" cy="9.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="9.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function RankGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5V11h4v8.5M10 19.5V4.5h4v15M16 19.5V8.5h4v11" />
    </svg>
  )
}
