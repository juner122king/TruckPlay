import type { ReactNode } from 'react'

interface GlyphProps {
  size?: number
}

function StrokeGlyph({ size = 24, strokeWidth = 2, children }: GlyphProps & { strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function DouyinLogoGlyph({ size = 24 }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.8A4.4 4.4 0 0 1 15.4 3h-3.1v12.1a2.6 2.6 0 1 1-1.8-2.5V9.4a5.8 5.8 0 1 0 4.9 5.7V8.9a7.4 7.4 0 0 0 4.3 1.4V7.2a4.4 4.4 0 0 1-3.1-1.4Z" />
    </svg>
  )
}

export function FlameGlyph({ size = 22, on = false }: GlyphProps & { on?: boolean }) {
  return on ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12.9 2.4c.4 2.7-1 4.4-2.2 5.7-.9 1-1.7 1.8-1.7 3.1a2.6 2.6 0 0 0 4.4 1.9c.7-.7 1.1-1.7 1.1-2.8 2.4 1.6 3.7 4 3.7 6.5a6.2 6.2 0 1 1-12.4 0c0-3.2 1.8-5.9 4.1-8.2 1.4-1.4 2.7-3.1 3-6.2Z" />
    </svg>
  ) : (
    <StrokeGlyph size={size}>
      <path d="M12.7 3c.3 2.5-.9 4.2-2.1 5.5-.9 1-1.6 1.8-1.6 3a2.5 2.5 0 0 0 4.3 1.7c.7-.7 1.1-1.6 1.1-2.6 2.2 1.5 3.6 3.8 3.6 6.2a6 6 0 1 1-12 0c0-3.1 1.7-5.7 3.9-7.9 1.3-1.3 2.5-3 2.8-5.9Z" />
    </StrokeGlyph>
  )
}

export function SparkleGlyph({ size = 22, on = false }: GlyphProps & { on?: boolean }) {
  return on ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="m12 2.5 2.3 6.2 6.2 2.3-6.2 2.3L12 19.5l-2.3-6.2L3.5 11l6.2-2.3L12 2.5Z" />
      <path d="m19 3.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" opacity="0.7" />
    </svg>
  ) : (
    <StrokeGlyph size={size}>
      <path d="m12 3 2.1 5.9L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-2.1L12 3Z" />
    </StrokeGlyph>
  )
}

export function FollowGlyph({ size = 22, on = false }: GlyphProps & { on?: boolean }) {
  return on ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <circle cx="9.5" cy="8" r="3.6" />
      <path d="M3.2 19a6.4 6.4 0 0 1 12.6 0H3.2Z" />
      <path d="M18 9v6M15 12h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ) : (
    <StrokeGlyph size={size}>
      <circle cx="9.5" cy="8" r="3.4" />
      <path d="M3.5 19a6 6 0 0 1 12 0" />
      <path d="M18 9.5v5M15.5 12h5" />
    </StrokeGlyph>
  )
}

export function GridGlyph({ size = 22, on = false }: GlyphProps & { on?: boolean }) {
  return on ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="2" />
      <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="2" />
      <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="2" />
      <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="2" />
    </svg>
  ) : (
    <StrokeGlyph size={size}>
      <rect x="3.8" y="3.8" width="6.6" height="6.6" rx="1.8" />
      <rect x="13.6" y="3.8" width="6.6" height="6.6" rx="1.8" />
      <rect x="3.8" y="13.6" width="6.6" height="6.6" rx="1.8" />
      <rect x="13.6" y="13.6" width="6.6" height="6.6" rx="1.8" />
    </StrokeGlyph>
  )
}

export function LibraryGlyph({ size = 22, on = false }: GlyphProps & { on?: boolean }) {
  return on ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12 20.3c-.4 0-.8-.1-1.1-.4-4.7-3.8-7.4-6.7-7.4-10.2A4.7 4.7 0 0 1 8.2 5c1.5 0 2.9.8 3.8 2a4.7 4.7 0 0 1 3.8-2 4.7 4.7 0 0 1 4.7 4.7c0 3.5-2.7 6.4-7.4 10.2-.3.3-.7.4-1.1.4Z" />
    </svg>
  ) : (
    <StrokeGlyph size={size}>
      <path d="M12 19.6c-4.5-3.6-7.2-6.4-7.2-9.8A4.4 4.4 0 0 1 9.2 5.4c1.2 0 2.3.6 2.8 1.6.5-1 1.6-1.6 2.8-1.6a4.4 4.4 0 0 1 4.4 4.4c0 3.4-2.7 6.2-7.2 9.8Z" />
    </StrokeGlyph>
  )
}

export function HeartGlyph({ size = 24, filled = false }: GlyphProps & { filled?: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12 20.6c-.4 0-.8-.1-1.1-.4C6 16.3 3.2 13.3 3.2 9.6A4.9 4.9 0 0 1 8.1 4.7c1.6 0 3 .8 3.9 2.1a4.9 4.9 0 0 1 3.9-2.1 4.9 4.9 0 0 1 4.9 4.9c0 3.7-2.8 6.7-7.7 10.6-.3.3-.7.4-1.1.4Z" />
    </svg>
  ) : (
    <StrokeGlyph size={size} strokeWidth={2.1}>
      <path d="M12 19.8c-4.7-3.7-7.4-6.5-7.4-10A4.6 4.6 0 0 1 9.2 5.2c1.3 0 2.4.7 2.8 1.8.4-1.1 1.5-1.8 2.8-1.8a4.6 4.6 0 0 1 4.6 4.6c0 3.5-2.7 6.3-7.4 10Z" />
    </StrokeGlyph>
  )
}

export function BookmarkGlyph({ size = 22, filled = false }: GlyphProps & { filled?: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M6.5 3.8h11a1.5 1.5 0 0 1 1.5 1.5v15.4a.8.8 0 0 1-1.3.6L12 17l-5.7 4.3a.8.8 0 0 1-1.3-.6V5.3a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  ) : (
    <StrokeGlyph size={size}>
      <path d="M6.5 4.2h11a1.3 1.3 0 0 1 1.3 1.3v14.8L12 15.8l-6.8 4.5V5.5a1.3 1.3 0 0 1 1.3-1.3Z" />
    </StrokeGlyph>
  )
}

export function ArrowUpGlyph({ size = 22 }: GlyphProps) {
  return (
    <StrokeGlyph size={size} strokeWidth={2.4}>
      <path d="m6 14 6-6 6 6" />
    </StrokeGlyph>
  )
}

export function ArrowDownGlyph({ size = 22 }: GlyphProps) {
  return (
    <StrokeGlyph size={size} strokeWidth={2.4}>
      <path d="m6 10 6 6 6-6" />
    </StrokeGlyph>
  )
}

export function RefreshGlyph({ size = 20 }: GlyphProps) {
  return (
    <StrokeGlyph size={size} strokeWidth={2.1}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
    </StrokeGlyph>
  )
}

export function MusicNoteGlyph({ size = 16 }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M9 17.5a2.6 2.6 0 1 1-1.6-2.4V6.2l11-2.2v11.1a2.6 2.6 0 1 1-1.6-2.4V7.3l-7.8 1.6v8.6Z" />
    </svg>
  )
}

export function AutoScrollGlyph({ size = 20, on = true }: GlyphProps & { on?: boolean }) {
  return on ? (
    <StrokeGlyph size={size} strokeWidth={2}>
      <path d="M12 4v14" />
      <path d="m7.5 13.5 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </StrokeGlyph>
  ) : (
    <StrokeGlyph size={size} strokeWidth={2}>
      <path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4" />
      <path d="m17 3 3 3-3 3M7 15l-3 3 3 3" />
    </StrokeGlyph>
  )
}

export function FitFillGlyph({ size = 20, crop = false }: GlyphProps & { crop?: boolean }) {
  return crop ? (
    <StrokeGlyph size={size} strokeWidth={2}>
      <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1.2" fill="currentColor" stroke="none" />
    </StrokeGlyph>
  ) : (
    <StrokeGlyph size={size} strokeWidth={2}>
      <rect x="4" y="6" width="16" height="12" rx="2.5" />
      <path d="M9.5 6v12M14.5 6v12" opacity="0.55" />
    </StrokeGlyph>
  )
}

export function SignOutGlyph({ size = 20 }: GlyphProps) {
  return (
    <StrokeGlyph size={size} strokeWidth={2}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </StrokeGlyph>
  )
}

export function TrashGlyph({ size = 18 }: GlyphProps) {
  return (
    <StrokeGlyph size={size} strokeWidth={2}>
      <path d="M4 7h16M9 7V4.8a.8.8 0 0 1 .8-.8h4.4a.8.8 0 0 1 .8.8V7" />
      <path d="M6.5 7 7.5 19.2a1.5 1.5 0 0 0 1.5 1.3h6a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
    </StrokeGlyph>
  )
}

export function SpeedGlyph({ size = 20 }: GlyphProps) {
  return (
    <StrokeGlyph size={size} strokeWidth={2}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.5l3 2" />
    </StrokeGlyph>
  )
}

/** Animated 3-bar equalizer indicator for the currently playing item in lists. */
export function DyBars({ playing }: { playing: boolean }) {
  return (
    <span className={`dy-bars${playing ? ' playing' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
