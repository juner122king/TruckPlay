import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useCabin } from '../../state/store'
import { useText } from '../../state/text'
import {
  BackGlyph,
  CheckGlyph,
  FillGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  ReplayGlyph,
  SettingsGlyph,
  VolumeGlyph,
} from '../youtube/glyphs'
import { followArea } from '../youtube/youtube'
import {
  closeVideoPlayer,
  coverOf,
  cycleRepeat,
  leaveVideoPlayer,
  nameOf,
  playOrPause,
  positionOf,
  replay,
  seek,
  seekBy,
  sendCommand,
  setCrop,
  setRate,
  setShuffle,
  setVolume,
  skip,
  useCurrentSong,
  usePlayer,
} from './player'

const CONTROLS_MS = 3200
const DOUBLE_TAP_MS = 300
const SKIP_MS = 800
const SKIP_SECONDS = 10
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2]

type Side = 'back' | 'forward'

/**
 * Full-screen in-car video theater overlay for local videos in Player (`videos` folder).
 * Leaves `.carplay.watching` transparent so the underlying Player WebView2 shows directly through,
 * with automotive touch controls, double-tap seek, speed picker, and aspect crop toggle.
 */
export function PlayerVideo() {
  const open = usePlayer((state) => state.videoOpen)
  const route = useCabin((state) => state.navigation.route)
  const handedOver = useCabin((state) => state.truckScreen)

  useEffect(() => {
    if (open && (handedOver || route.kind !== 'app' || route.app !== 'player')) {
      leaveVideoPlayer()
    }
  }, [open, route, handedOver])

  return open ? <OpenVideoPlayer /> : null
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

function shareAt(bar: HTMLElement, event: PointerEvent): number {
  const box = bar.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - box.left) / Math.max(box.width, 1)))
}

function OpenVideoPlayer() {
  const text = useText()
  const item = useCurrentSong()
  const playback = usePlayer((state) => state.playback)
  const posters = usePlayer((state) => state.posters)
  const crop = usePlayer((state) => state.crop)
  const rate = usePlayer((state) => state.rate)
  const volume = usePlayer((state) => state.volume)

  const [controls, setControls] = useState(true)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [skipInd, setSkipInd] = useState<{ side: Side; seconds: number; at: number } | null>(null)
  const [now, setNow] = useState(() => performance.now())
  const [draggingSeek, setDraggingSeek] = useState(false)
  const [draggingVolume, setDraggingVolume] = useState(false)

  const touched = useRef(0)
  const beforeMute = useRef(volume || 0.5)
  const seekBar = useRef<HTMLDivElement>(null)
  const volumeBar = useRef<HTMLDivElement>(null)
  const lastTap = useRef<{ at: number; side: Side | null; single?: ReturnType<typeof setTimeout> }>({
    at: -Infinity,
    side: null,
  })

  const playing = Boolean(playback?.playing && !playback.ended && !playback.error)
  const loading = Boolean(playback?.loading && !playback.error)
  const ended = Boolean(playback?.ended)
  const hasError = Boolean(playback?.error)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setNow(performance.now()), 250)
    return () => window.clearInterval(timer)
  }, [playing])

  useEffect(() => {
    if (!skipInd) return
    const timer = window.setTimeout(() => setSkipInd(null), SKIP_MS)
    return () => window.clearTimeout(timer)
  }, [skipInd])

  useEffect(() => () => clearTimeout(lastTap.current.single), [])

  const touch = () => {
    touched.current = performance.now()
    setControls(true)
  }

  useEffect(() => {
    if (!controls || !playing || speedOpen || ended || hasError || draggingSeek || draggingVolume) return
    const timer = window.setTimeout(() => setControls(false), CONTROLS_MS)
    return () => window.clearTimeout(timer)
  }, [controls, playing, speedOpen, ended, hasError, draggingSeek, draggingVolume])

  // Position the underlying Player WebView2 over `.carplay` whenever the frame or crop mode changes.
  useEffect(() => {
    const place = () => {
      const area = document.querySelector('.carplay')?.getBoundingClientRect()
      if (!area) return
      const scale = window.devicePixelRatio
      sendCommand({
        action: 'show',
        x: Math.round(area.left * scale),
        y: Math.round(area.top * scale),
        width: Math.round(area.width * scale),
        height: Math.round(area.height * scale),
        crop,
      })
    }
    return followArea(place)
  }, [crop])

  if (!playback || !item) return null

  const position = positionOf(playback, Math.max(now, playback.at))
  const length = playback.duration || item.seconds
  const cover = coverOf(item, posters)
  const counter = playback.count > 1 ? `${playback.index + 1} / ${playback.count}` : null
  const resolution =
    playback.videoWidth && playback.videoHeight ? `${playback.videoWidth}×${playback.videoHeight}` : null

  const handleStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (speedOpen) {
      setSpeedOpen(false)
      touch()
      return
    }
    const toggle = () => {
      if (controls && playing && performance.now() - touched.current > 300) setControls(false)
      else touch()
    }
    const box = event.currentTarget.getBoundingClientRect()
    const across = (event.clientX - box.left) / Math.max(box.width, 1)
    const skippable = !hasError && length > 0
    const side: Side | null = !skippable ? null : across < 1 / 3 ? 'back' : across > 2 / 3 ? 'forward' : null
    const currentNow = performance.now()
    const last = lastTap.current
    const skipping = side !== null && skipInd?.side === side && currentNow - skipInd.at < SKIP_MS
    if (side && (skipping || (last.side === side && currentNow - last.at < DOUBLE_TAP_MS))) {
      clearTimeout(last.single)
      lastTap.current = { at: -Infinity, side: null }
      seekBy(side === 'back' ? -SKIP_SECONDS : SKIP_SECONDS)
      setSkipInd({ side, seconds: (skipping && skipInd ? skipInd.seconds : 0) + SKIP_SECONDS, at: currentNow })
      return
    }
    clearTimeout(last.single)
    lastTap.current = { at: currentNow, side, single: side ? setTimeout(toggle, DOUBLE_TAP_MS) : undefined }
    if (!side) toggle()
  }

  return (
    <div
      className={`pl-video-player${controls || ended || hasError ? ' controls' : ''}`}
      onPointerDown={handleStagePointerDown}
      onPointerMove={() => controls && touch()}
    >
      {/* Non-host browser preview backdrop so Vite dev preview displays a clean theater stage */}
      {!isInHost() && (
        <div className="pl-video-dev-stage" aria-hidden="true">
          {cover ? <img src={cover} alt="" /> : <div className="pl-video-dev-title">{nameOf(item)}</div>}
        </div>
      )}

      {loading && <div className="pl-video-spinner" role="progressbar" />}

      {skipInd && (
        <div key={skipInd.at} className={`yt-skip ${skipInd.side}`} aria-live="polite">
          <span className="yt-skip-arrows" aria-hidden="true">
            {skipInd.side === 'back' ? '◀◀' : '▶▶'}
          </span>
          {text.youtube.seconds(skipInd.seconds)}
        </div>
      )}

      {hasError && (
        <div className="pl-video-error" role="alert">
          <div className="pl-video-error-title">{text.player.videoError}</div>
          <p className="pl-video-error-hint">{text.player.videoErrorHint}</p>
          <div className="pl-video-error-actions">
            {playback.count > 1 && (
              <button
                type="button"
                className="pl-video-pill accent"
                onClick={() => {
                  touch()
                  skip(1)
                }}
              >
                {text.next}
              </button>
            )}
            <button type="button" className="pl-video-pill" onClick={closeVideoPlayer}>
              {text.close}
            </button>
          </div>
        </div>
      )}

      <div className="pl-video-top">
        <button
          type="button"
          className="pl-video-glass pl-video-round"
          aria-label={text.player.back}
          onClick={closeVideoPlayer}
        >
          <BackGlyph />
        </button>

        <div className="pl-video-heading">
          <div className="pl-video-title">{nameOf(item)}</div>
          <div className="pl-video-meta">
            {[counter, resolution, item.artist].filter(Boolean).join(' · ') || item.file}
          </div>
        </div>

        <button
          type="button"
          className={`pl-video-glass pl-video-chip${crop ? ' on' : ''}`}
          aria-label={crop ? text.player.fitScreen : text.player.fillScreen}
          aria-pressed={crop}
          onClick={() => {
            touch()
            setCrop(!crop)
          }}
        >
          <FillGlyph />
          <span>{crop ? text.player.fillScreen : text.player.fitScreen}</span>
        </button>

        <button
          type="button"
          className={`pl-video-glass pl-video-chip${speedOpen || rate !== 1 ? ' on' : ''}`}
          aria-label={text.player.speed}
          aria-expanded={speedOpen}
          onClick={() => {
            touch()
            setSpeedOpen((v) => !v)
          }}
        >
          <SettingsGlyph />
          <span>{rate === 1 ? text.player.speed : `${rate}×`}</span>
        </button>
      </div>

      {speedOpen && (
        <div className="pl-video-menu pl-video-glass" role="menu" aria-label={text.player.speed}>
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={rate === option}
              className={`pl-video-menu-item${rate === option ? ' active' : ''}`}
              onClick={() => {
                setRate(option)
                setSpeedOpen(false)
                touch()
              }}
            >
              <span>{option === 1 ? text.youtube.normal : `${option}×`}</span>
              {rate === option && <CheckGlyph />}
            </button>
          ))}
        </div>
      )}

      <div className="pl-video-bottom">
        <div className="pl-video-progress-row">
          <span className="pl-video-time">{formatDuration(position)}</span>
          <div
            ref={seekBar}
            className={`pl-video-bar${draggingSeek ? ' dragging' : ''}`}
            role="slider"
            aria-label={text.nowPlaying}
            aria-valuemin={0}
            aria-valuemax={length}
            aria-valuenow={position}
            style={{ '--share': length > 0 ? Math.min(1, position / length) : 0 } as CSSProperties}
            onPointerDown={(event) => {
              if (length <= 0) return
              event.currentTarget.setPointerCapture(event.pointerId)
              setDraggingSeek(true)
              touch()
              seek(shareAt(seekBar.current!, event) * length)
            }}
            onPointerMove={(event) => {
              if (!draggingSeek || length <= 0) return
              touch()
              seek(shareAt(seekBar.current!, event) * length)
            }}
            onPointerUp={(event) => {
              if (!draggingSeek) return
              if (length > 0) seek(shareAt(seekBar.current!, event) * length)
              setDraggingSeek(false)
              touch()
            }}
            onPointerCancel={() => setDraggingSeek(false)}
          >
            <span />
          </div>
          <span className="pl-video-time">{length > 0 ? formatDuration(length) : ''}</span>
        </div>

        <div className="pl-video-controls">
          <div className="pl-video-transport">
            <button
              type="button"
              className={`pl-video-glass pl-video-btn small${playback.shuffle ? ' on' : ''}`}
              aria-label={text.shuffle}
              aria-pressed={playback.shuffle}
              onClick={() => {
                touch()
                setShuffle(!playback.shuffle)
              }}
            >
              <ShuffleIcon />
            </button>
            <button
              type="button"
              className="pl-video-glass pl-video-btn"
              aria-label={text.previous}
              onClick={() => {
                touch()
                skip(-1)
              }}
            >
              <PreviousGlyph />
            </button>
            <button
              type="button"
              className="pl-video-glass pl-video-btn main"
              aria-label={ended ? text.player.replay : playing ? text.pause : text.play}
              onClick={() => {
                touch()
                if (ended) replay()
                else playOrPause()
              }}
            >
              {ended ? <ReplayGlyph /> : playing ? <PauseGlyph /> : <PlayGlyph />}
            </button>
            <button
              type="button"
              className="pl-video-glass pl-video-btn"
              aria-label={text.next}
              onClick={() => {
                touch()
                skip(1)
              }}
            >
              <NextGlyph />
            </button>
            <button
              type="button"
              className={`pl-video-glass pl-video-btn small${playback.repeat !== 'off' ? ' on' : ''}`}
              aria-label={text.repeat}
              aria-pressed={playback.repeat !== 'off'}
              onClick={() => {
                touch()
                cycleRepeat()
              }}
            >
              {playback.repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
            </button>
          </div>

          <div className="pl-video-volume pl-video-glass">
            <button
              type="button"
              className="pl-video-vol-btn"
              aria-label={volume === 0 ? text.player.unmute : text.player.mute}
              onClick={() => {
                touch()
                if (volume > 0) beforeMute.current = volume
                setVolume(volume > 0 ? 0 : beforeMute.current)
              }}
            >
              <VolumeGlyph muted={volume === 0} />
            </button>
            <div
              ref={volumeBar}
              className={`pl-video-vol-bar${draggingVolume ? ' dragging' : ''}`}
              role="slider"
              aria-label={text.player.volume}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(volume * 100)}
              style={{ '--share': volume } as CSSProperties}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                setDraggingVolume(true)
                touch()
                setVolume(shareAt(volumeBar.current!, event))
              }}
              onPointerMove={(event) => {
                if (!draggingVolume) return
                touch()
                setVolume(shareAt(volumeBar.current!, event))
              }}
              onPointerUp={(event) => {
                if (!draggingVolume) return
                setVolume(shareAt(volumeBar.current!, event))
                setDraggingVolume(false)
                touch()
              }}
              onPointerCancel={() => setDraggingVolume(false)}
            >
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ShuffleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 4.8c1.1 1.6 2.3 2.6 4.3 2.6H21" />
    <path d="M3 17h3.5c1.6 0 2.7-.6 3.6-1.7M13.9 8.7c.9-1.1 2-1.7 3.6-1.7H21" />
    <path d="m18 4 3 3-3 3M18 14l3 3-3 3" />
  </svg>
)

const RepeatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3" />
    <path d="M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" />
  </svg>
)

const RepeatOneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3" />
    <path d="M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" />
    <path d="M11 10.5 12.5 9.5v5" strokeWidth={1.8} />
  </svg>
)
