import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useLook } from '../../state/hooks'
import { useCabin } from '../../state/store'
import { LyricsLines } from '../Lyrics'
import { Crossfade } from '../music/Crossfade'
import { type Backdrop, type Look, useBackdropLight, useWordsOver, wordsClass } from '../music/contrast'
import {
  ChevronDownGlyph,
  CloseGlyph,
  LyricsGlyph,
  NextGlyph,
  NoteGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  QueueGlyph,
  RepeatGlyph,
  RepeatOneGlyph,
  ShuffleGlyph,
  SpeakerGlyph,
} from '../music/glyphs'
import { HeartGlyph, QqmusicMarkGlyph, TrashGlyph } from './glyphs'
import { PlaybackNoticeBanner } from './PlaybackNoticeBanner'
import {
  clearQueue,
  playOrPause,
  playQueueTrack,
  positionOf,
  removeFromQueue,
  requestLyrics,
  seek,
  setVolume,
  skip,
  toggleFullscreenPlayer,
  toggleLike,
  togglePlayMode,
  toggleQueue,
  useQqmusic,
} from './qqmusic'

const NOW_PLAYING_BACKDROPS: Record<Look, Backdrop> = {
  dark: { cover: 0.58, rest: [0, 0, 0] },
  light: { cover: 0.55, rest: [255, 255, 255] },
}

type StageMode = 'vinyl' | 'lyrics' | 'queue'

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '00:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m < 10 ? `0${m}` : m}:${s < 10 ? `0${s}` : s}`
}

function usePlaybackClock(running: boolean): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [running])
  return now
}

/**
 * Floating glass capsule mini player anchored at the bottom of the QQ Music panel.
 */
export function QqmusicMiniPlayer({ aside }: { aside: boolean }) {
  const playback = useQqmusic((s) => s.playback)
  const playing = useQqmusic((s) => Boolean(s.playing))
  const open = useQqmusic((s) => s.nowPlaying)
  const queue = useQqmusic((s) => s.queue)
  const queueOpen = useQqmusic((s) => s.queueOpen)
  const albumArt = useCabin((s) => s.albumArt)
  const barRef = useRef<HTMLDivElement>(null)
  const away = open || aside
  const light = useBackdropLight(barRef, Boolean(playback) && !away)
  const now = usePlaybackClock(Boolean(playback && playback.status === 'playing' && !away))

  if (!playback) return null

  const activeTrack =
    queue.find((t) =>
      playback.trackId ? t.id === playback.trackId : t.title === playback.title && t.artist === playback.artist,
    ) || null
  const isVip = activeTrack?.payPlay === 1
  const duration = playback.duration || 240
  const current = positionOf(playback, Math.max(now, playback.at))
  const share = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0
  const cover = albumArt ? (playback.artwork ?? null) : null

  return (
    <div
      ref={barRef}
      className={`qqm-mini glass${away ? ' away' : ''}${light ? ' on-light' : ''}`}
      inert={away || undefined}
    >
      <button
        type="button"
        className="qqm-mini-open"
        aria-label={`打开正在播放：${playback.title} - ${playback.artist}`}
        onClick={() => toggleFullscreenPlayer(true)}
      >
        <div className={`qqm-mini-vinyl${playing ? ' spinning' : ''}`} aria-hidden="true">
          {cover ? (
            <img src={cover} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="qqm-mini-art-fallback">
              <NoteGlyph size={22} />
            </span>
          )}
          <span className="qqm-mini-spindle" />
        </div>

        <div className="qqm-mini-text">
          <div className="qqm-mini-title-row">
            <span className="qqm-mini-name">{playback.title}</span>
            {isVip && <span className="qqm-badge-vip">VIP</span>}
          </div>
          <span className="qqm-mini-by">{playback.artist}</span>
        </div>
      </button>

      <button type="button" className="qqm-mini-button" aria-label={playing ? '暂停' : '播放'} onClick={playOrPause}>
        {playing ? <PauseGlyph size={32} /> : <PlayGlyph size={32} />}
      </button>

      <button type="button" className="qqm-mini-button" aria-label="下一首" onClick={() => skip(1)}>
        <NextGlyph size={34} />
      </button>

      <button
        type="button"
        className={`qqm-mini-button${queueOpen ? ' active' : ''}`}
        aria-label="播放队列"
        aria-pressed={queueOpen}
        onClick={() => toggleQueue()}
      >
        <QueueGlyph size={26} />
      </button>

      <span className="qqm-mini-progress" style={{ '--share': share } as CSSProperties} aria-hidden="true" />
    </div>
  )
}

/**
 * Fullscreen CarPlay Now Playing overlay for QQ Music with Vinyl / Synced Lyrics / Inline Queue stage.
 */
export function NowPlaying() {
  const playback = useQqmusic((s) => s.playback)
  const playing = useQqmusic((s) => Boolean(s.playing))
  const open = useQqmusic((s) => s.nowPlaying)
  const direction = useQqmusic((s) => s.direction)
  const playMode = useQqmusic((s) => s.playMode)
  const likedTrackIds = useQqmusic((s) => s.likedTrackIds)
  const queue = useQqmusic((s) => s.queue)
  const queueIndex = useQqmusic((s) => s.queueIndex)
  const volume = useQqmusic((s) => s.volume)
  const lyrics = useQqmusic((s) => s.lyrics)
  const lyricsTrackId = useQqmusic((s) => s.lyricsTrackId)
  const lyricsLoading = useQqmusic((s) => s.lyricsLoading)
  const albumArt = useCabin((s) => s.albumArt)

  const [stage, setStage] = useState<StageMode>('vinyl')
  const [scrubPos, setScrubPos] = useState<number | null>(null)
  const scrubbingRef = useRef(false)
  const beforeMuteRef = useRef(volume > 0 ? volume : 0.6)

  const cover = albumArt ? (playback?.artwork ?? null) : null
  const ink = useWordsOver(cover, useLook().appearance, NOW_PLAYING_BACKDROPS)
  const now = usePlaybackClock(Boolean(open && playback && playback.status === 'playing' && scrubPos === null))

  const activeTrack = playback
    ? queue.find((t) =>
        playback.trackId ? t.id === playback.trackId : t.title === playback.title && t.artist === playback.artist,
      ) || null
    : null
  const currentTrackId = activeTrack?.id || playback?.trackId || ''

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleFullscreenPlayer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open && stage === 'lyrics' && currentTrackId && lyricsTrackId !== currentTrackId && !lyricsLoading) {
      requestLyrics(currentTrackId, activeTrack?.songId)
    }
  }, [open, stage, currentTrackId, activeTrack?.songId, lyricsTrackId, lyricsLoading])

  if (!playback) return null

  const duration = playback.duration || 240
  const displayPos = scrubPos ?? Math.min(duration, Math.max(0, positionOf(playback, Math.max(now, playback.at))))
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayPos / duration) * 100)) : 0
  const volumePercent = Math.round(Math.min(1, Math.max(0, volume)) * 100)

  const isVipTrack = activeTrack?.payPlay === 1
  const isLiked = currentTrackId ? likedTrackIds.includes(currentTrackId) : false
  const modeLabel = playMode === 'loop' ? '列表循环' : playMode === 'shuffle' ? '随机播放' : '单曲循环'

  const close = () => toggleFullscreenPlayer(false)
  const toggleStage = (target: Exclude<StageMode, 'vinyl'>) =>
    setStage((current) => (current === target ? 'vinyl' : target))

  return (
    <div className={`qqm-now ${wordsClass(ink)}${open ? ' open' : ''}`} aria-hidden={!open} inert={!open}>
      <Crossfade
        value={cover}
        className="qqm-now-backdrop"
        render={(url) => url && <img src={url} alt="" referrerPolicy="no-referrer" />}
      />

      <section className="app-panel qqm-now-panel" aria-label="QQ音乐正在播放">
        <div className="qqm-now-layout">
          {/* Header */}
          <div className="qqm-now-header">
            <button
              type="button"
              className="qqm-corner glass"
              aria-label="收起播放器"
              tabIndex={open ? 0 : -1}
              onClick={close}
            >
              <ChevronDownGlyph size={34} />
            </button>

            <div className="qqm-now-brand">
              <QqmusicMarkGlyph size={22} />
              <span>QQ音乐</span>
            </div>

            <div className="qqm-now-corners">
              <button
                type="button"
                className={`qqm-corner glass${stage === 'lyrics' ? ' qqm-on' : ''}`}
                aria-label="歌词"
                aria-pressed={stage === 'lyrics'}
                tabIndex={open ? 0 : -1}
                onClick={() => toggleStage('lyrics')}
              >
                <LyricsGlyph size={30} />
              </button>

              <button
                type="button"
                className={`qqm-corner glass${stage === 'queue' ? ' qqm-on' : ''}`}
                aria-label="播放队列"
                aria-pressed={stage === 'queue'}
                tabIndex={open ? 0 : -1}
                onClick={() => toggleStage('queue')}
              >
                <QueueGlyph size={30} />
                {queue.length > 0 && <span className="qqm-corner-badge">{queue.length}</span>}
              </button>
            </div>
          </div>

          {/* Left: Track Info & Primary Transport */}
          <div className="qqm-now-info">
            <div
              key={`${playback.trackId || playback.title}:${playback.artist}`}
              className={`qqm-now-text ${direction === -1 ? 'from-left' : 'from-right'}`}
            >
              <div className="qqm-now-title-row">
                <h1 className="qqm-now-title">{playback.title}</h1>
                {isVipTrack && <span className="qqm-now-vip">VIP</span>}
              </div>
              <p className="qqm-now-artist">{playback.artist}</p>
              {activeTrack?.album && <p className="qqm-now-album">{activeTrack.album}</p>}
            </div>

            <PlaybackNoticeBanner className="qqm-now-notice" />

            <div className="qqm-now-controls">
              <button
                type="button"
                className="qqm-now-button"
                aria-label="上一首"
                tabIndex={open ? 0 : -1}
                onClick={() => skip(-1)}
              >
                <PreviousGlyph size={52} />
              </button>

              <button
                type="button"
                className="qqm-now-button primary"
                aria-label={playing ? '暂停' : '播放'}
                tabIndex={open ? 0 : -1}
                onClick={playOrPause}
              >
                {playing ? <PauseGlyph size={72} /> : <PlayGlyph size={72} />}
              </button>

              <button
                type="button"
                className="qqm-now-button"
                aria-label="下一首"
                tabIndex={open ? 0 : -1}
                onClick={() => skip(1)}
              >
                <NextGlyph size={52} />
              </button>
            </div>
          </div>

          {/* Right: Vinyl Turntable / Synced Lyrics / Inline Queue */}
          {stage === 'queue' ? (
            <div className="qqm-now-queue" role="region" aria-label="待播队列">
              <div className="qqm-now-queue-head">
                <h3>待播队列 ({queue.length})</h3>
                {queue.length > 0 && (
                  <button
                    type="button"
                    className="qqm-now-queue-clear"
                    onClick={clearQueue}
                    aria-label="清空队列"
                    tabIndex={open ? 0 : -1}
                  >
                    <TrashGlyph size={16} />
                    <span>清空</span>
                  </button>
                )}
              </div>

              {queue.length === 0 ? (
                <p className="qqm-now-queue-empty">当前播放队列为空</p>
              ) : (
                <div className="qqm-now-queue-list">
                  {queue.map((track, idx) => {
                    const isCurrent = idx === queueIndex
                    const isUnplayable = track.playable === false
                    return (
                      <div
                        key={`${track.id}-${idx}`}
                        className={`qqm-now-queue-row${isCurrent ? ' active' : ''}${isUnplayable ? ' unplayable' : ''}`}
                      >
                        <button
                          type="button"
                          className="qqm-now-queue-main"
                          tabIndex={open ? 0 : -1}
                          onClick={() => playQueueTrack(idx)}
                          aria-current={isCurrent ? 'true' : undefined}
                        >
                          <span className="qqm-now-queue-idx">
                            {isCurrent ? (
                              <span className="qqm-sound-bars" aria-hidden="true">
                                <i className={`b1${playing ? ' anim' : ''}`} />
                                <i className={`b2${playing ? ' anim' : ''}`} />
                                <i className={`b3${playing ? ' anim' : ''}`} />
                              </span>
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <span className="qqm-now-queue-meta">
                            <strong>{track.title}</strong>
                            <span>{track.artist}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="qqm-now-queue-remove"
                          tabIndex={open ? 0 : -1}
                          aria-label={`移除 ${track.title}`}
                          onClick={() => removeFromQueue(idx)}
                        >
                          <CloseGlyph size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : stage === 'lyrics' ? (
            lyricsLoading ? (
              <div className="qqm-lyrics-box" role="status">
                <span className="qqm-spinner" aria-hidden="true" />
              </div>
            ) : !lyrics || lyrics.lines.length === 0 ? (
              <div className="qqm-lyrics-box">
                <p className="qqm-lyrics-none">暂无歌词</p>
              </div>
            ) : (
              <LyricsLines className="qqm-lyrics" lyrics={lyrics} position={displayPos} onSeek={seek} />
            )
          ) : (
            <div className="qqm-vinyl-stage" aria-hidden="true">
              <div className={`qqm-vinyl-assembly ${playing ? 'playing' : 'paused'}`}>
                <div className="qqm-vinyl-platter">
                  <div className="qqm-vinyl-disc">
                    <div className="qqm-vinyl-grooves" />
                    <div className="qqm-vinyl-label">
                      {cover ? (
                        <img src={cover} alt="" className="qqm-vinyl-art" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="qqm-vinyl-fallback">
                          <NoteGlyph size={56} />
                        </span>
                      )}
                      <span className="qqm-vinyl-spindle" />
                    </div>
                  </div>
                </div>

                <div className={`qqm-tonearm ${playing ? 'arm-playing' : 'arm-paused'}`}>
                  <svg viewBox="0 0 100 180" className="qqm-tonearm-svg">
                    <defs>
                      <linearGradient id="qqm-tonearm-metal" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ffffff" />
                        <stop offset="45%" stopColor="#d1d5db" />
                        <stop offset="70%" stopColor="#9ca3af" />
                        <stop offset="100%" stopColor="#4b5563" />
                      </linearGradient>
                    </defs>
                    <g filter="drop-shadow(2px 5px 6px rgba(0,0,0,0.5))">
                      <circle cx="78" cy="24" r="16" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
                      <circle cx="78" cy="24" r="9" fill="url(#qqm-tonearm-metal)" />
                      <circle cx="78" cy="24" r="3" fill="#111827" />
                      <path
                        d="M78 24 Q68 70 54 110 L44 140"
                        fill="none"
                        stroke="url(#qqm-tonearm-metal)"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <rect
                        x="36"
                        y="138"
                        width="14"
                        height="22"
                        rx="3"
                        transform="rotate(18 43 149)"
                        fill="#18181b"
                        stroke="#a1a1aa"
                        strokeWidth="1.5"
                      />
                      <circle cx="41" cy="155" r="2.5" fill="#1ecc94" />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Progress Range Slider */}
          <div className="qqm-now-progress">
            <span className="qqm-now-time">{formatTime(displayPos)}</span>
            <input
              type="range"
              className="qqm-range qqm-seek-range"
              min={0}
              max={duration}
              step={0.5}
              value={displayPos}
              aria-label="播放进度"
              aria-valuetext={`${formatTime(displayPos)} / ${formatTime(duration)}`}
              tabIndex={open ? 0 : -1}
              style={{ '--slider-progress': `${progressPercent}%` } as CSSProperties}
              onPointerDown={() => {
                scrubbingRef.current = true
              }}
              onChange={(e) => {
                const next = Number(e.target.value)
                if (scrubbingRef.current) {
                  setScrubPos(next)
                } else {
                  seek(next)
                }
              }}
              onPointerUp={(e) => {
                if (!scrubbingRef.current) return
                scrubbingRef.current = false
                const target = Number(e.currentTarget.value)
                setScrubPos(null)
                seek(target)
              }}
              onPointerCancel={() => {
                scrubbingRef.current = false
                setScrubPos(null)
              }}
              onBlur={() => {
                if (scrubbingRef.current) {
                  scrubbingRef.current = false
                  setScrubPos(null)
                }
              }}
            />
            <span className="qqm-now-time">{formatTime(duration)}</span>
          </div>

          {/* Extras: Play Mode, Like, Volume Slider */}
          <div className="qqm-now-extras">
            <button
              type="button"
              className={`qqm-now-button small${playMode !== 'loop' ? ' active' : ''}`}
              onClick={togglePlayMode}
              aria-label={`播放模式：${modeLabel}`}
              title={modeLabel}
              tabIndex={open ? 0 : -1}
            >
              {playMode === 'loop' && <RepeatGlyph size={32} />}
              {playMode === 'shuffle' && <ShuffleGlyph size={32} />}
              {playMode === 'single' && <RepeatOneGlyph size={32} />}
            </button>

            <button
              type="button"
              className={`qqm-now-button small qqm-like-btn${isLiked ? ' liked' : ''}`}
              onClick={() => {
                if (currentTrackId) toggleLike(currentTrackId)
              }}
              aria-label={isLiked ? '取消喜欢' : '加入我喜欢'}
              aria-pressed={isLiked}
              tabIndex={open ? 0 : -1}
            >
              <HeartGlyph size={30} on={isLiked} />
            </button>

            <span className="qqm-now-mode-pill">{modeLabel}</span>

            <div className="qqm-volume">
              <button
                type="button"
                className="qqm-now-button small"
                aria-label={volume === 0 ? '取消静音' : '静音'}
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  if (volume > 0) beforeMuteRef.current = volume
                  setVolume(volume > 0 ? 0 : beforeMuteRef.current)
                }}
              >
                <SpeakerGlyph size={30} volume={volume} />
              </button>
              <input
                type="range"
                className="qqm-range qqm-volume-range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                aria-label="音量"
                aria-valuetext={`${volumePercent}%`}
                tabIndex={open ? 0 : -1}
                style={{ '--slider-progress': `${volumePercent}%` } as CSSProperties}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
