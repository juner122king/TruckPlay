import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useLook } from '../../state/hooks'
import { useLanguage } from '../../state/text'
import { CoverImage } from '../ximalaya/CoverImage'
import { sendVolume, useXimalaya } from '../ximalaya/ximalaya'
import { Crossfade } from '../music/Crossfade'
import { type Backdrop, type Look, useBackdropLight, useWordsOver, wordsClass } from '../music/contrast'
import {
  ChevronDownGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  QueueGlyph,
  RadioGlyph,
  SpeakerGlyph,
  StarGlyph,
} from '../music/glyphs'
import {
  beijingDate,
  loadLiveSchedule,
  loadRadioDetail,
  pauseOrResumeRadio,
  scheduleIsLive,
  scheduleProgress,
  setRadioNowPlaying,
  skipRadio,
  statusLabel,
  toggleRadioFavorite,
  useRadio,
  type RadioStation,
} from './radio'

const NOW_PLAYING_BACKDROPS: Record<Look, Backdrop> = {
  dark: { cover: 0.58, rest: [0, 0, 0] },
  light: { cover: 0.55, rest: [255, 255, 255] },
}

export function RadioBars({ playing }: { playing: boolean }) {
  return (
    <span className={`rd-bars${playing ? ' playing' : ''}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * Floating glass capsule mini player anchored above the bottom bezel edge, matching Apple Music's `.am-mini`.
 * Tapping the capsule opens the fullscreen CarPlay Radio Now Playing view.
 */
export function RadioMiniPlayer() {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)
  const open = useRadio((s) => s.nowPlaying)
  const { playback, playing } = useXimalaya()
  const bar = useRef<HTMLDivElement>(null)
  const live = playback?.owner === 'radio' ? playback : null
  const light = useBackdropLight(bar, Boolean(live) && !open)

  if (!live) return null
  const active = Boolean(playing)
  const busy = active || live.status === 'loading'
  const status = statusLabel(live.status, t)

  return (
    <div
      ref={bar}
      className={`rd-mini glass${open ? ' away' : ''}${light ? ' on-light' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={t('打开正在播放', 'Open Now Playing') + ' · ' + live.artist}
      onClick={() => setRadioNowPlaying(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setRadioNowPlaying(true)
        }
      }}
    >
      <span className="rd-mini-cover">
        <CoverImage key={live.artwork} src={live.artwork} alt="" fallback="FM" />
      </span>
      <span className="rd-mini-text">
        <span className="rd-mini-name">{live.title}</span>
        <span className="rd-mini-by">
          <span className={`rd-badge${live.status === 'playing' ? ' live' : live.status === 'failed' ? ' error' : ''}`}>
            {live.status === 'playing' && <RadioBars playing />}
            {status}
          </span>
          <span className="rd-mini-station">{live.artist}</span>
        </span>
      </span>
      <button
        type="button"
        className="rd-mini-button"
        aria-label={busy ? t('暂停', 'Pause') : t('播放或重试', 'Play or retry')}
        onClick={(event) => {
          event.stopPropagation()
          pauseOrResumeRadio()
        }}
      >
        {busy ? <PauseGlyph size={32} /> : <PlayGlyph size={32} />}
      </button>
      <button
        type="button"
        className="rd-mini-button"
        aria-label={t('下一台', 'Next station')}
        onClick={(event) => {
          event.stopPropagation()
          skipRadio(1)
        }}
      >
        <NextGlyph size={34} />
      </button>
      <span className={`rd-mini-line${live.status === 'loading' ? ' loading' : active ? ' live' : ''}`} aria-hidden />
    </div>
  )
}

/**
 * Fullscreen CarPlay-style Radio Now Playing view sliding up from the floating mini player.
 * Features blurred Crossfade artwork backdrop, adaptive ink contrast, live show progress,
 * interactive volume slider, and an inline toggleable Today's Schedule panel.
 */
export function RadioNowPlaying({ now }: { now: number }) {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)
  const open = useRadio((s) => s.nowPlaying)
  const favorites = useRadio((s) => s.favorites)
  const liveScheduleRadioId = useRadio((s) => s.liveScheduleRadioId)
  const liveScheduleLoading = useRadio((s) => s.liveScheduleLoading)
  const liveSchedules = useRadio((s) => s.liveSchedules)
  const scheduleDate = useRadio((s) => s.scheduleDate)
  const { playback, playing, volume } = useXimalaya()
  const [showSchedule, setShowSchedule] = useState(false)
  const beforeMute = useRef(volume || 0.5)
  const liveRowRef = useRef<HTMLElement | null>(null)
  const scheduleListRef = useRef<HTMLDivElement>(null)

  const live = playback?.owner === 'radio' ? playback : null
  const cover = live?.artwork || null
  const ink = useWordsOver(cover, useLook().appearance, NOW_PLAYING_BACKDROPS)

  useEffect(() => {
    if (open && live?.radioId) {
      void loadLiveSchedule(live.radioId)
    }
  }, [open, live?.radioId])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRadioNowPlaying(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const list = scheduleListRef.current
    const row = liveRowRef.current
    if (open && showSchedule && list && row) {
      const lRect = list.getBoundingClientRect()
      const rRect = row.getBoundingClientRect()
      const top = list.scrollTop + (rRect.top - lRect.top) - list.clientHeight * 0.4
      list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
  }, [open, showSchedule, liveSchedules])

  if (!live) return null

  const active = Boolean(playing)
  const busy = active || live.status === 'loading'
  const stationId = live.radioId ?? 0
  const stationObj: RadioStation = {
    id: stationId,
    name: live.artist,
    coverLarge: live.artwork,
    programName: live.title,
  }
  const isFavorite = favorites.some((s) => s.id === stationId)

  const todayList = liveScheduleRadioId === stationId ? (liveSchedules?.todaySchedules ?? []) : []
  const todayDate = scheduleDate || beijingDate(now)
  const liveShow = todayList.find((item) => scheduleIsLive(item, 'today', todayDate, now)) ?? null
  const progress = liveShow ? scheduleProgress(liveShow, 'today', todayDate, now) : null
  const close = () => setRadioNowPlaying(false)

  const openDetails = () => {
    close()
    if (stationId) void loadRadioDetail(stationObj)
  }

  return (
    <div className={`rd-now ${wordsClass(ink)}${open ? ' open' : ''}`} aria-hidden={!open}>
      <Crossfade value={cover} className="rd-now-backdrop" render={(url) => url && <img src={url} alt="" />} />
      <section className="app-panel rd-now-panel" aria-label={t('正在播放电台', 'Radio Now Playing')}>
        <div className="rd-now-layout">
          <div className="rd-now-header">
            <button
              type="button"
              className="rd-corner glass"
              aria-label={t('收起播放页', 'Close Now Playing')}
              tabIndex={open ? 0 : -1}
              onClick={close}
            >
              <ChevronDownGlyph size={34} />
            </button>
            <div className="rd-now-header-right">
              <button
                type="button"
                className={`rd-corner glass${showSchedule ? ' rd-on' : ''}`}
                aria-label={t('今日节目表', 'Today schedule')}
                aria-pressed={showSchedule}
                tabIndex={open ? 0 : -1}
                onClick={() => setShowSchedule((v) => !v)}
              >
                <QueueGlyph size={32} />
              </button>
            </div>
          </div>

          <div className="rd-now-info">
            <div className={`rd-now-status${live.status === 'failed' ? ' error' : ''}`}>
              {live.status === 'playing' && <RadioBars playing />}
              <span>{statusLabel(live.status, t)}</span>
            </div>
            <div className="rd-now-text">
              <span className="rd-now-title">{liveShow?.programName || live.title}</span>
              <button type="button" className="rd-now-station" tabIndex={open ? 0 : -1} onClick={openDetails}>
                {live.artist}
              </button>
              {live.error && <span className="rd-now-error">{live.error}</span>}
            </div>
            <div className="rd-now-controls">
              <button
                type="button"
                className="rd-now-button"
                aria-label={t('上一台', 'Previous station')}
                tabIndex={open ? 0 : -1}
                onClick={() => skipRadio(-1)}
              >
                <PreviousGlyph size={52} />
              </button>
              <button
                type="button"
                className="rd-now-button primary"
                aria-label={busy ? t('暂停', 'Pause') : t('播放或重试', 'Play or retry')}
                tabIndex={open ? 0 : -1}
                onClick={pauseOrResumeRadio}
              >
                {busy ? <PauseGlyph size={70} /> : <PlayGlyph size={70} />}
              </button>
              <button
                type="button"
                className="rd-now-button"
                aria-label={t('下一台', 'Next station')}
                tabIndex={open ? 0 : -1}
                onClick={() => skipRadio(1)}
              >
                <NextGlyph size={52} />
              </button>
            </div>
          </div>

          {showSchedule ? (
            <div className="rd-now-schedule" role="region" aria-label={t('今日节目表', 'Today schedule')}>
              <div className="rd-now-schedule-head">
                <h3>{t('今日节目表', "Today's Schedule")}</h3>
                <small>{todayDate} · UTC+8</small>
              </div>
              {liveScheduleLoading && !todayList.length ? (
                <p className="rd-now-schedule-empty">{t('正在加载节目表…', 'Loading schedule…')}</p>
              ) : !todayList.length ? (
                <p className="rd-now-schedule-empty">{t('暂无今日节目表', 'No schedule available today')}</p>
              ) : (
                <div ref={scheduleListRef} className="rd-now-schedule-list">
                  {todayList.map((item, idx) => {
                    const onAir = scheduleIsLive(item, 'today', todayDate, now)
                    return (
                      <article
                        key={String(item.programScheduleId) + '-' + idx}
                        ref={onAir ? liveRowRef : undefined}
                        className={`rd-now-schedule-row${onAir ? ' live' : ''}`}
                      >
                        <time>
                          {item.startTime}–{item.endTime}
                        </time>
                        <div className="rd-now-schedule-body">
                          <strong>{item.programName}</strong>
                          {item.announcerList && item.announcerList.length > 0 && (
                            <span>{item.announcerList.map((a) => a.announcerName).join(' / ')}</span>
                          )}
                        </div>
                        {onAir && <em>{t('正在直播', 'ON AIR')}</em>}
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <Crossfade
              value={cover}
              className="rd-now-art"
              render={(url) =>
                url ? (
                  <img src={url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <div className="rd-now-art-placeholder" aria-hidden>
                    <RadioGlyph size={76} />
                  </div>
                )
              }
            />
          )}

          <div className="rd-now-progress">
            <span className="rd-now-time">{liveShow ? liveShow.startTime : 'FM'}</span>
            <div
              className={`rd-now-track${live.status === 'loading' ? ' loading' : ''}`}
              role="progressbar"
              aria-label={t('当前节目进度', 'Current program progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress !== null ? Math.round(progress * 100) : undefined}
            >
              <span
                className={`rd-now-elapsed${progress === null ? ' live-pulse' : ''}`}
                style={{ '--share': progress ?? (active ? 1 : 0.25) } as CSSProperties}
              />
            </div>
            <span className="rd-now-time">{liveShow ? liveShow.endTime : t('直播', 'LIVE')}</span>
          </div>

          <div className="rd-now-extras">
            <button
              type="button"
              className={`rd-now-button small${isFavorite ? ' active' : ''}`}
              aria-label={isFavorite ? t('取消收藏', 'Unfavorite station') : t('收藏电台', 'Favorite station')}
              aria-pressed={isFavorite}
              tabIndex={open ? 0 : -1}
              onClick={() => stationId && toggleRadioFavorite(stationObj)}
            >
              <StarGlyph size={34} on={isFavorite} />
            </button>
            <button type="button" className="rd-now-detail-pill" tabIndex={open ? 0 : -1} onClick={openDetails}>
              {t('完整节目表', 'Full schedule')}
            </button>
            <div className="rd-volume">
              <button
                type="button"
                className="rd-now-button small"
                aria-label={volume === 0 ? t('取消静音', 'Unmute') : t('静音', 'Mute')}
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  if (volume > 0) beforeMute.current = volume
                  sendVolume(volume > 0 ? 0 : beforeMute.current)
                }}
              >
                <SpeakerGlyph size={32} volume={volume} />
              </button>
              <input
                type="range"
                className="rd-volume-range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                aria-label={t('音量', 'Volume')}
                aria-valuetext={`${Math.round(volume * 100)}%`}
                tabIndex={open ? 0 : -1}
                style={{ '--slider-progress': `${Math.round(volume * 100)}%` } as CSSProperties}
                onChange={(event) => sendVolume(Number(event.target.value))}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
