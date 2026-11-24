import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useLook } from '../../state/hooks'
import { useCabin } from '../../state/store'
import { useLanguage } from '../../state/text'
import { Crossfade } from '../music/Crossfade'
import { type Backdrop, type Look, useBackdropLight, useWordsOver, wordsClass } from '../music/contrast'
import {
  ChevronDownGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  QueueGlyph,
  SpeakerGlyph,
  StarGlyph,
} from '../music/glyphs'
import { CoverImage } from './CoverImage'
import { AudioBookGlyph, Forward30Glyph, Rewind15Glyph, SpeedGlyph, TimerGlyph } from './glyphs'
import {
  cyclePlaybackSpeed,
  cycleSleepTimer,
  play,
  playOrPause,
  positionOf,
  seek,
  selectAlbum,
  sendVolume,
  setNowPlaying,
  skip,
  skipSeconds,
  toggleFavorite,
  useXimalaya,
  type ExtendedXimalayaAlbum,
} from './ximalaya'

const NOW_PLAYING_BACKDROPS: Record<Look, Backdrop> = {
  dark: { cover: 0.58, rest: [0, 0, 0] },
  light: { cover: 0.55, rest: [255, 255, 255] },
}

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function formatCountdown(endsAt: number, nowWall: number): string {
  const left = Math.max(0, Math.ceil((endsAt - nowWall) / 1000))
  const m = Math.floor(left / 60)
  const s = left % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
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

export function XmBars({ playing }: { playing: boolean }) {
  return (
    <span className={`xm-bars${playing ? ' playing' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * Floating CarPlay Liquid Glass capsule mini player anchored at the bottom of the Ximalaya panel.
 * Tapping opens the fullscreen slide-up CarPlay audiobook Now Playing sheet.
 */
export function XimalayaMiniPlayer({ aside }: { aside: boolean }) {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)

  const playback = useXimalaya((s) => s.playback)
  const playing = useXimalaya((s) => Boolean(s.playing))
  const open = useXimalaya((s) => s.nowPlaying)
  const albumArt = useCabin((s) => s.albumArt)
  const barRef = useRef<HTMLDivElement>(null)

  const vod = playback && playback.owner !== 'radio' ? playback : null
  const away = open || aside
  const light = useBackdropLight(barRef, Boolean(vod) && !away)
  const now = usePlaybackClock(Boolean(vod && vod.status === 'playing' && !away))

  if (!vod) return null

  const duration = vod.duration || 1800
  const current = positionOf(vod, Math.max(now, vod.at))
  const share = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0
  const busy = playing || vod.status === 'loading'
  const cover = albumArt ? (vod.artwork ?? null) : null

  return (
    <div
      ref={barRef}
      className={`xm-mini glass${away ? ' away' : ''}${light ? ' on-light' : ''}`}
      inert={away || undefined}
    >
      <button
        type="button"
        className="xm-mini-open"
        aria-label={`${t('打开正在播放', 'Open Now Playing')}: ${vod.title}`}
        onClick={() => setNowPlaying(true)}
      >
        <span className="xm-mini-cover">
          <CoverImage src={cover} alt="" fallback={<AudioBookGlyph size={26} />} />
        </span>

        <span className="xm-mini-text">
          <span className="xm-mini-title-row">
            <span className="xm-mini-name">{vod.title}</span>
            {vod.isSample && <span className="xm-mini-badge sample">{t('试听', 'Sample')}</span>}
            {vod.status === 'failed' && <span className="xm-mini-badge error">{t('受限', 'Locked')}</span>}
          </span>
          <span className="xm-mini-by">
            {playing && <XmBars playing />}
            <span className="xm-mini-artist">{vod.artist}</span>
          </span>
        </span>
      </button>

      <button
        type="button"
        className="xm-mini-button"
        aria-label={busy ? t('暂停', 'Pause') : t('播放', 'Play')}
        onClick={playOrPause}
      >
        {busy ? <PauseGlyph size={32} /> : <PlayGlyph size={32} />}
      </button>

      <button type="button" className="xm-mini-button" aria-label={t('下一集', 'Next episode')} onClick={() => skip(1)}>
        <NextGlyph size={34} />
      </button>

      <span className="xm-mini-progress" style={{ '--share': share } as CSSProperties} aria-hidden="true" />
    </div>
  )
}

/**
 * Fullscreen CarPlay-style audiobook Now Playing sheet sliding smoothly over XimalayaApp.
 * Features Crossfade ambient backdrop, adaptive ink contrast, 5-key audiobook transport,
 * inline toggleable episode queue, native scrubbable range slider, playback speed, and real sleep timer.
 */
export function NowPlaying() {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)

  const playback = useXimalaya((s) => s.playback)
  const playing = useXimalaya((s) => Boolean(s.playing))
  const open = useXimalaya((s) => s.nowPlaying)
  const playbackSpeed = useXimalaya((s) => s.playbackSpeed)
  const sleepTimerMode = useXimalaya((s) => s.sleepTimerMode)
  const sleepTimerEndsAt = useXimalaya((s) => s.sleepTimerEndsAt)
  const volume = useXimalaya((s) => s.volume)
  const queue = useXimalaya((s) => s.queue)
  const queueIndex = useXimalaya((s) => s.queueIndex)
  const selectedAlbum = useXimalaya((s) => s.selectedAlbum)
  const favorites = useXimalaya((s) => s.favorites)
  const albumArt = useCabin((s) => s.albumArt)

  const [showQueue, setShowQueue] = useState(false)
  const [scrubPos, setScrubPos] = useState<number | null>(null)
  const [wallNow, setWallNow] = useState(() => Date.now())
  const beforeMuteRef = useRef(volume > 0 ? volume : 0.6)
  const activeRowRef = useRef<HTMLButtonElement | null>(null)
  const queueListRef = useRef<HTMLDivElement>(null)

  const vod = playback && playback.owner !== 'radio' ? playback : null
  const cover = albumArt ? (vod?.artwork ?? null) : null
  const ink = useWordsOver(cover, useLook().appearance, NOW_PLAYING_BACKDROPS)
  const now = usePlaybackClock(Boolean(open && vod && vod.status === 'playing' && scrubPos === null))

  useEffect(() => {
    if (!open || !sleepTimerEndsAt) return
    const timer = setInterval(() => setWallNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [open, sleepTimerEndsAt])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNowPlaying(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const list = queueListRef.current
    const row = activeRowRef.current
    if (open && showQueue && list && row) {
      const lRect = list.getBoundingClientRect()
      const rRect = row.getBoundingClientRect()
      const top = list.scrollTop + (rRect.top - lRect.top) - list.clientHeight * 0.38
      list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
  }, [open, showQueue, queueIndex])

  if (!vod) return null

  const activeTrack = queue[queueIndex] ?? null
  const albumId = vod.albumId || activeTrack?.albumId || selectedAlbum?.id || ''
  const albumTitle = activeTrack?.album || selectedAlbum?.title || ''
  const albumObj: ExtendedXimalayaAlbum | null = albumId
    ? {
        id: albumId,
        title: albumTitle || vod.title,
        artist: vod.artist,
        artwork: vod.artwork,
      }
    : null
  const isFavorited = albumId ? favorites.some((f) => f.id === albumId) : false

  const duration = vod.duration || 1800
  const displayPos = scrubPos ?? Math.min(duration, Math.max(0, positionOf(vod, Math.max(now, vod.at))))
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayPos / duration) * 100)) : 0
  const volumePercent = Math.round(Math.min(1, Math.max(0, volume)) * 100)
  const busy = playing || vod.status === 'loading'

  const speedLabel = `${playbackSpeed.toFixed(2).replace(/\.?0+$/, '')}x`
  const timerLabel =
    sleepTimerMode === 'episode'
      ? t('播完本集', 'End of ep.')
      : sleepTimerEndsAt
        ? formatCountdown(sleepTimerEndsAt, wallNow)
        : t('定时', 'Timer')

  const close = () => setNowPlaying(false)

  const handleOpenAlbum = () => {
    if (!albumObj) return
    close()
    selectAlbum(albumObj)
  }

  return (
    <div className={`xm-now ${wordsClass(ink)}${open ? ' open' : ''}`} aria-hidden={!open} inert={!open || undefined}>
      <Crossfade
        value={cover}
        className="xm-now-backdrop"
        render={(url) => url && <img src={url} alt="" referrerPolicy="no-referrer" />}
      />

      <section className="app-panel xm-now-panel" aria-label={t('喜马拉雅正在播放', 'Ximalaya Now Playing')}>
        <div className="xm-now-layout">
          {/* Top Bar */}
          <div className="xm-now-header">
            <button
              type="button"
              className="xm-corner glass"
              aria-label={t('收起播放页', 'Close Now Playing')}
              tabIndex={open ? 0 : -1}
              onClick={close}
            >
              <ChevronDownGlyph size={34} />
            </button>

            <div className="xm-now-brand">
              <span className="xm-now-brand-name">{t('喜马拉雅', 'Ximalaya')}</span>
              {queue.length > 0 && (
                <span className="xm-now-ep-counter">
                  {t(`第 ${queueIndex + 1} / ${queue.length} 集`, `Ep. ${queueIndex + 1} / ${queue.length}`)}
                </span>
              )}
            </div>

            <button
              type="button"
              className={`xm-corner glass${showQueue ? ' xm-on' : ''}`}
              aria-label={t('选集列表', 'Episodes queue')}
              aria-pressed={showQueue}
              tabIndex={open ? 0 : -1}
              onClick={() => setShowQueue((v) => !v)}
            >
              <QueueGlyph size={30} />
              {queue.length > 0 && <span className="xm-corner-badge">{queue.length}</span>}
            </button>
          </div>

          {/* Left: Info & 5-Button Audiobook Transport */}
          <div className="xm-now-info">
            <div className="xm-now-status-row">
              {vod.status === 'loading' && (
                <span className="xm-now-pill">{t('缓冲中…', 'Buffering…')}</span>
              )}
              {vod.isSample && (
                <span className="xm-now-pill accent">
                  {t('试听片段 · 登录畅听完整版', 'Sample · Sign in for full audio')}
                </span>
              )}
              {vod.status === 'failed' && vod.error && (
                <span className="xm-now-pill error" role="alert">
                  {vod.error}
                </span>
              )}
            </div>

            <div className="xm-now-text">
              <span className="xm-now-title">{vod.title}</span>
              {albumObj && albumTitle ? (
                <button type="button" className="xm-now-sub-btn" tabIndex={open ? 0 : -1} onClick={handleOpenAlbum}>
                  {vod.artist} · {albumTitle}
                </button>
              ) : (
                <span className="xm-now-sub">{vod.artist}</span>
              )}
            </div>

            <div className="xm-now-controls">
              <button
                type="button"
                className="xm-now-button skip-sec"
                aria-label={t('快退 15 秒', 'Rewind 15 seconds')}
                tabIndex={open ? 0 : -1}
                onClick={() => skipSeconds(-15)}
              >
                <Rewind15Glyph size={38} />
              </button>

              <button
                type="button"
                className="xm-now-button"
                aria-label={t('上一集', 'Previous episode')}
                tabIndex={open ? 0 : -1}
                onClick={() => skip(-1)}
              >
                <PreviousGlyph size={44} />
              </button>

              <button
                type="button"
                className="xm-now-button primary"
                aria-label={busy ? t('暂停', 'Pause') : t('播放', 'Play')}
                tabIndex={open ? 0 : -1}
                onClick={playOrPause}
              >
                {busy ? <PauseGlyph size={64} /> : <PlayGlyph size={64} />}
              </button>

              <button
                type="button"
                className="xm-now-button"
                aria-label={t('下一集', 'Next episode')}
                tabIndex={open ? 0 : -1}
                onClick={() => skip(1)}
              >
                <NextGlyph size={44} />
              </button>

              <button
                type="button"
                className="xm-now-button skip-sec"
                aria-label={t('快进 30 秒', 'Forward 30 seconds')}
                tabIndex={open ? 0 : -1}
                onClick={() => skipSeconds(30)}
              >
                <Forward30Glyph size={38} />
              </button>
            </div>
          </div>

          {/* Right: Artwork or Inline Episode Queue */}
          {showQueue ? (
            <div className="xm-now-queue" role="region" aria-label={t('选集节目单', 'Episode queue')}>
              <div className="xm-now-queue-head">
                <h3>{albumTitle || t('当前播放列表', 'Up Next')}</h3>
                <small>{t(`共 ${queue.length} 集`, `${queue.length} eps`)}</small>
              </div>
              {queue.length === 0 ? (
                <p className="xm-now-queue-empty">{t('暂无更多剧集', 'No episodes in queue')}</p>
              ) : (
                <div ref={queueListRef} className="xm-now-queue-list">
                  {queue.map((track, idx) => {
                    const current = idx === queueIndex
                    return (
                      <button
                        key={`${track.id}-${idx}`}
                        ref={current ? activeRowRef : undefined}
                        type="button"
                        className={`xm-now-queue-row${current ? ' active' : ''}`}
                        tabIndex={open ? 0 : -1}
                        onClick={() => play(track, queue)}
                      >
                        <span className="xm-now-q-num">
                          {current ? <XmBars playing={playing} /> : String(track.episodeNumber ?? idx + 1).padStart(2, '0')}
                        </span>
                        <span className="xm-now-q-body">
                          <strong>{track.title}</strong>
                          <span>
                            {track.artist}
                            {track.duration ? ` · ${formatTime(track.duration)}` : ''}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <Crossfade
              value={cover}
              className="xm-now-art"
              render={(url) =>
                url ? (
                  <img src={url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <div className="xm-now-art-placeholder" aria-hidden="true">
                    <AudioBookGlyph size={80} />
                  </div>
                )
              }
            />
          )}

          {/* Scrubbable Native Range Progress Bar */}
          <div className="xm-now-progress">
            <span className="xm-now-time">{formatTime(displayPos)}</span>
            <input
              type="range"
              className="xm-range xm-progress-range"
              min={0}
              max={duration}
              step={1}
              value={Math.min(duration, Math.max(0, displayPos))}
              aria-label={t('播放进度', 'Playback progress')}
              aria-valuetext={`${formatTime(displayPos)} / ${formatTime(duration)}`}
              tabIndex={open ? 0 : -1}
              style={{ '--slider-progress': `${progressPercent}%` } as CSSProperties}
              onChange={(e) => {
                const v = Number(e.target.value)
                setScrubPos(v)
              }}
              onPointerUp={(e) => {
                const v = Number((e.target as HTMLInputElement).value)
                setScrubPos(null)
                seek(v)
              }}
              onKeyUp={(e) => {
                if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
                  const v = Number((e.target as HTMLInputElement).value)
                  setScrubPos(null)
                  seek(v)
                }
              }}
              onBlur={() => {
                if (scrubPos !== null) {
                  const v = scrubPos
                  setScrubPos(null)
                  seek(v)
                }
              }}
            />
            <span className="xm-now-time end">-{formatTime(Math.max(0, duration - displayPos))}</span>
          </div>

          {/* Bottom Utility Controls: Speed, Real Sleep Timer, Favorite, Inline Volume */}
          <div className="xm-now-extras">
            <button
              type="button"
              className={`xm-now-pill-btn${playbackSpeed !== 1 ? ' active' : ''}`}
              aria-label={t('切换倍速', 'Playback speed')}
              tabIndex={open ? 0 : -1}
              onClick={cyclePlaybackSpeed}
            >
              <SpeedGlyph size={20} />
              <span>{speedLabel}</span>
            </button>

            <button
              type="button"
              className={`xm-now-pill-btn${sleepTimerMode !== null ? ' active' : ''}`}
              aria-label={t('定时关闭', 'Sleep timer')}
              tabIndex={open ? 0 : -1}
              onClick={cycleSleepTimer}
            >
              <TimerGlyph size={20} />
              <span>{timerLabel}</span>
            </button>

            {albumObj && (
              <button
                type="button"
                className={`xm-now-button small${isFavorited ? ' active' : ''}`}
                aria-label={isFavorited ? t('取消收藏专辑', 'Unfavorite album') : t('收藏专辑', 'Favorite album')}
                aria-pressed={isFavorited}
                tabIndex={open ? 0 : -1}
                onClick={() => toggleFavorite(albumObj)}
              >
                <StarGlyph size={30} on={isFavorited} />
              </button>
            )}

            <div className="xm-volume">
              <button
                type="button"
                className="xm-now-button small"
                aria-label={volume === 0 ? t('取消静音', 'Unmute') : t('静音', 'Mute')}
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  if (volume > 0) beforeMuteRef.current = volume
                  sendVolume(volume > 0 ? 0 : beforeMuteRef.current)
                }}
              >
                <SpeakerGlyph size={30} volume={volume} />
              </button>
              <input
                type="range"
                className="xm-range xm-volume-range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                aria-label={t('音量', 'Volume')}
                aria-valuetext={`${volumePercent}%`}
                tabIndex={open ? 0 : -1}
                style={{ '--slider-progress': `${volumePercent}%` } as CSSProperties}
                onChange={(e) => sendVolume(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
