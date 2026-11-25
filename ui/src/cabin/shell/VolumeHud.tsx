import { NextGlyph, PreviousGlyph } from '../apps/music/glyphs'
import { SunGlyph } from '../apps/settings/glyphs'
import { useText } from '../state/text'
import { useVolumeHud } from './volumeShown'
import './volumeHud.css'

/** The volume: a speaker, its waves as many as it's loud (none, a cross, muted). */
export function VolumeGlyph({ volume }: { volume: number }) {
  const waves = volume === 0 ? 0 : volume < 0.34 ? 1 : volume < 0.67 ? 2 : 3
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9.2h3.6L11.5 5v14l-4.9-4.2H3z" fill="currentColor" strokeLinejoin="round" />
      {waves === 0 && <path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      {waves >= 1 && (
        <path
          d="M14.5 9.6a3.4 3.4 0 0 1 0 4.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {waves >= 2 && (
        <path
          d="M16.9 7.3a6.6 6.6 0 0 1 0 9.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {waves >= 3 && (
        <path d="M19.3 5a9.8 9.8 0 0 1 0 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  )
}

/**
 * Top glass HUD shown briefly when a keybind changes volume, screen brightness, or skips to the previous/next track
 * (apps/keybinds.ts, volumeShown.ts).
 */
export function VolumeHud() {
  const { kind, level, label, shown } = useVolumeHud()
  const text = useText()
  const isTrack = kind === 'previousTrack' || kind === 'nextTrack'
  const trackText = label || (kind === 'nextTrack' ? text.next : text.previous)
  return (
    <div className={shown ? 'volume-hud shown' : 'volume-hud'} aria-hidden={!shown}>
      <div className={isTrack ? 'volume-hud-pill track' : 'volume-hud-pill'}>
        {kind === 'brightness' ? (
          <SunGlyph large />
        ) : kind === 'previousTrack' ? (
          <PreviousGlyph size={28} />
        ) : kind === 'nextTrack' ? (
          <NextGlyph size={28} />
        ) : (
          <VolumeGlyph volume={level} />
        )}
        {isTrack ? (
          <span className="volume-hud-label">{trackText}</span>
        ) : (
          <div className="volume-hud-bar">
            <i style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
