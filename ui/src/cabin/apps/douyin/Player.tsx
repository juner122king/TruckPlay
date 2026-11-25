import { useEffect, useRef, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useCabin } from '../../state/store'
import { useLanguage } from '../../state/text'
import {
  BackGlyph,
  CheckGlyph,
  CloseGlyph,
  PauseGlyph,
  PlayGlyph,
  QueueGlyph,
  VolumeGlyph,
} from '../youtube/glyphs'
import { followArea } from '../youtube/youtube'
import {
  closePlayer,
  DOUYIN_CHANNELS,
  formatClock,
  formatCount,
  leavePlayer,
  play,
  playOrPause,
  positionOf,
  seek,
  seekBy,
  send,
  sendVolumePercent,
  setRate,
  skip,
  toggleAutoScroll,
  toggleCollect,
  toggleCrop,
  toggleLike,
  toggleMute,
  useDouyin,
} from './douyin'
import {
  ArrowDownGlyph,
  ArrowUpGlyph,
  AutoScrollGlyph,
  BookmarkGlyph,
  DouyinLogoGlyph,
  DyBars,
  FitFillGlyph,
  HeartGlyph,
  MusicNoteGlyph,
  SpeedGlyph,
} from './glyphs'

const CONTROLS_MS = 3200
const DOUBLE_TAP_MS = 280
const SKIP_MS = 800
const SKIP_SECONDS = 10
const WHEEL_COOLDOWN_MS = 450
const SWIPE_THRESHOLD_PX = 54
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2]

type Side = 'back' | 'forward'

/**
 * Full-screen CarPlay Liquid Glass theater overlay for Douyin (`抖音`).
 * Leaves `.carplay.watching` transparent so the underlying WebView2 renders directly through
 * when running in the Tauri host, with swipe/wheel video switching and automotive controls.
 */
export function DouyinPlayer() {
  const open = useDouyin((store) => store.open)
  const route = useCabin((state) => state.navigation.route)
  const handedOver = useCabin((state) => state.truckScreen)

  useEffect(() => {
    if (open && (handedOver || route.kind !== 'app' || route.app !== 'douyin')) {
      leavePlayer()
    }
  }, [open, route, handedOver])

  return open ? <OpenDouyinPlayer /> : null
}

function useDouyinPosition(): { time: number; duration: number } {
  const playback = useDouyin((s) => s.playback)
  const playing = useDouyin((s) => s.playing)
  const [now, setNow] = useState(() => performance.now())
  const active = Boolean(playing || playback?.status === 'playing')

  useEffect(() => {
    if (!active) return
    let frame = requestAnimationFrame(function tick() {
      setNow(performance.now())
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  const time = positionOf(playback, active ? now : (playback?.at ?? now))
  return { time, duration: playback?.duration || 0 }
}

function OpenDouyinPlayer() {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)

  const current = useDouyin((s) => s.current)
  const playback = useDouyin((s) => s.playback)
  const playing = useDouyin((s) => s.playing)
  const hostReady = useDouyin((s) => s.hostReady)
  const buffering = useDouyin((s) => s.buffering)
  const videos = useDouyin((s) => s.videos)
  const currentVideoIndex = useDouyin((s) => s.currentVideoIndex)
  const crop = useDouyin((s) => s.crop)
  const autoScroll = useDouyin((s) => s.autoScroll)
  const rate = useDouyin((s) => s.rate)
  const likedMap = useDouyin((s) => s.liked)
  const collectedMap = useDouyin((s) => s.collected)
  const tab = useDouyin((s) => s.tab)
  const channelId = useDouyin((s) => s.channelId)

  const [controls, setControls] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [skipInd, setSkipInd] = useState<{ side: Side; seconds: number; at: number } | null>(null)
  const [heartBurstAt, setHeartBurstAt] = useState<number | null>(null)

  const touched = useRef(0)
  const lastWheel = useRef(0)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const lastTap = useRef<{ at: number; side: Side | 'center' | null; single?: ReturnType<typeof setTimeout> }>({
    at: -Infinity,
    side: null,
  })

  const isPlayingNow = Boolean(playing || playback?.status === 'playing')
  const activeId = playback?.id || current?.id
  const isLiked = activeId ? Boolean(likedMap[activeId] ?? playback?.liked) : false
  const isCollected = activeId ? Boolean(collectedMap[activeId] ?? playback?.collected) : false

  const touch = () => {
    touched.current = performance.now()
    setControls(true)
  }

  useEffect(() => {
    if (!controls || !isPlayingNow || showDrawer || showSpeedMenu) return
    const timer = setTimeout(() => setControls(false), CONTROLS_MS)
    return () => clearTimeout(timer)
  }, [controls, isPlayingNow, showDrawer, showSpeedMenu])

  useEffect(() => {
    if (!skipInd) return
    const timer = setTimeout(() => setSkipInd(null), SKIP_MS)
    return () => clearTimeout(timer)
  }, [skipInd])

  useEffect(() => {
    if (!heartBurstAt) return
    const timer = setTimeout(() => setHeartBurstAt(null), 650)
    return () => clearTimeout(timer)
  }, [heartBurstAt])

  useEffect(() => () => clearTimeout(lastTap.current.single), [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSpeedMenu) {
          e.stopPropagation()
          setShowSpeedMenu(false)
        } else if (showDrawer) {
          e.stopPropagation()
          setShowDrawer(false)
        } else {
          closePlayer()
        }
      } else if (e.key === 'ArrowDown' && !showDrawer && !showSpeedMenu) {
        e.preventDefault()
        touch()
        skip(1)
      } else if (e.key === 'ArrowUp' && !showDrawer && !showSpeedMenu) {
        e.preventDefault()
        touch()
        skip(-1)
      } else if (e.key === ' ' && !showDrawer && !showSpeedMenu) {
        e.preventDefault()
        touch()
        playOrPause()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showDrawer, showSpeedMenu])

  // Place underlying Douyin WebView2 over the entire `.carplay` canvas
  useEffect(() => {
    const place = () => {
      const area = document.querySelector('.carplay')?.getBoundingClientRect()
      if (!area) return
      const scale = window.devicePixelRatio
      send({
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

  const title = playback?.title || current?.title || t('抖音精选短视频', 'Douyin Short Video')
  const author = playback?.author || playback?.artist || current?.author || t('抖音创作者', 'Creator')
  const artwork = playback?.artwork || current?.artwork || null
  const avatar = playback?.avatar || current?.avatar || null
  const music = playback?.music || current?.music || null
  const likeCount = formatCount(playback?.likes ?? current?.likes, t('赞', 'Like'))
  const inHost = isInHost()
  const showCover = inHost && !hostReady

  const channelLabel =
    tab === 'jingxuan'
      ? t('精选', 'Featured')
      : tab === 'follow'
        ? t('关注', 'Following')
        : tab === 'channels'
          ? (DOUYIN_CHANNELS.find((c) => c.id === channelId)?.[chinese ? 'zh' : 'en'] ?? t('频道', 'Channel'))
          : t('推荐', 'For You')

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (showDrawer || showSpeedMenu) return
    if (Math.abs(e.deltaY) < 28) return
    const now = performance.now()
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return
    lastWheel.current = now
    touch()
    skip(e.deltaY > 0 ? 1 : -1)
  }

  return (
    <div
      className={`dy-player${controls ? ' controls' : ''}`}
      onWheel={handleWheel}
      onPointerDown={(event) => {
        const hit = event.target as HTMLElement | null
        if (hit?.closest('.dy-player-top, .dy-player-rail, .dy-player-bottom, .dy-speed-menu, .dy-drawer-backdrop')) {
          return
        }
        swiped.current = false
        dragStart.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerMove={(event) => {
        if (controls) touch()
        if (!dragStart.current || swiped.current) return
        const dy = event.clientY - dragStart.current.y
        const dx = event.clientX - dragStart.current.x
        if (Math.abs(dy) >= SWIPE_THRESHOLD_PX && Math.abs(dy) > Math.abs(dx) * 1.4) {
          swiped.current = true
          dragStart.current = null
          touch()
          skip(dy < 0 ? 1 : -1)
        }
      }}
      onPointerUp={(event) => {
        const hit = event.target as HTMLElement | null
        dragStart.current = null
        if (swiped.current) {
          swiped.current = false
          return
        }
        if (hit?.closest('.dy-player-top, .dy-player-rail, .dy-player-bottom, .dy-speed-menu, .dy-drawer-backdrop')) {
          return
        }
        if (showSpeedMenu) {
          setShowSpeedMenu(false)
          touch()
          return
        }

        const toggleHud = () => {
          if (controls && isPlayingNow && performance.now() - touched.current > 280) setControls(false)
          else touch()
        }

        const box = event.currentTarget.getBoundingClientRect()
        const across = (event.clientX - box.left) / Math.max(box.width, 1)
        const zone: Side | 'center' = across < 0.28 ? 'back' : across > 0.72 ? 'forward' : 'center'
        const now = performance.now()
        const last = lastTap.current

        if (zone === 'center' && last.side === 'center' && now - last.at < DOUBLE_TAP_MS) {
          clearTimeout(last.single)
          lastTap.current = { at: -Infinity, side: null }
          if (!isLiked) toggleLike(current ?? activeId)
          setHeartBurstAt(now)
          return
        }

        const skipping = zone !== 'center' && skipInd?.side === zone && now - skipInd.at < SKIP_MS
        if (zone !== 'center' && (skipping || (last.side === zone && now - last.at < DOUBLE_TAP_MS))) {
          clearTimeout(last.single)
          lastTap.current = { at: -Infinity, side: null }
          seekBy(zone === 'back' ? -SKIP_SECONDS : SKIP_SECONDS)
          setSkipInd({ side: zone, seconds: (skipping ? skipInd.seconds : 0) + SKIP_SECONDS, at: now })
          return
        }

        clearTimeout(last.single)
        lastTap.current = { at: now, side: zone, single: setTimeout(toggleHud, DOUBLE_TAP_MS) }
      }}
    >
      {/* Non-host browser preview backdrop */}
      {!inHost && (
        <div className="dy-player-dev-stage" aria-hidden="true">
          {artwork && <img className="dy-player-dev-blur" src={artwork} alt="" referrerPolicy="no-referrer" />}
          {artwork ? (
            <img
              className={`dy-player-dev-frame${crop ? ' crop' : ''}`}
              src={artwork}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="dy-player-dev-blank">
              <DouyinLogoGlyph size={72} />
            </div>
          )}
        </div>
      )}

      {/* Initial loading cover until WebView2 frames arrive */}
      {showCover && (
        <div className="dy-cover" aria-hidden="true">
          {artwork && <img src={artwork} alt="" referrerPolicy="no-referrer" />}
          <div className="dy-spinner large" role="progressbar" aria-label={t('正在加载视频', 'Loading video')} />
        </div>
      )}

      {/* Mid-playback buffering */}
      {inHost && hostReady && buffering && (
        <div className="dy-spinner large floating" role="progressbar" aria-label={t('正在缓冲', 'Buffering')} />
      )}

      {/* Double-tap seek indicator */}
      {skipInd && (
        <div key={skipInd.at} className={`dy-skip-ind ${skipInd.side}`} aria-live="polite">
          <span>{skipInd.side === 'back' ? `-${skipInd.seconds}s` : `+${skipInd.seconds}s`}</span>
        </div>
      )}

      {/* Double-tap heart burst */}
      {heartBurstAt && (
        <div key={heartBurstAt} className="dy-heart-burst" aria-hidden="true">
          <HeartGlyph size={84} filled />
        </div>
      )}

      {/* Top Glass HUD */}
      <div className="dy-player-top" inert={showDrawer || undefined}>
        <button
          type="button"
          className="dy-pglass dy-pround big"
          aria-label={t('返回双栏视图', 'Back to split view')}
          onClick={closePlayer}
        >
          <BackGlyph />
        </button>

        <div className="dy-player-headline">
          <div className="dy-player-badges">
            <span className="dy-player-channel-pill">
              <DouyinLogoGlyph size={14} />
              <span>{channelLabel}</span>
            </span>
            <span className="dy-player-author-pill">
              {avatar && <img src={avatar} alt="" referrerPolicy="no-referrer" />}
              <span>@{author}</span>
            </span>
          </div>
          <h2 className="dy-player-title">{title}</h2>
          {music && (
            <div className="dy-player-music">
              <MusicNoteGlyph size={14} />
              <span>{music}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Floating Vertical Short-Video Action Rail */}
      <div className="dy-player-rail" inert={showDrawer || undefined}>
        <button
          type="button"
          className="dy-pglass dy-rail-circle"
          aria-label={t('上一条', 'Previous')}
          onClick={() => {
            touch()
            skip(-1)
          }}
        >
          <ArrowUpGlyph size={24} />
        </button>

        <button
          type="button"
          className={`dy-pglass dy-rail-circle${isLiked ? ' liked' : ''}`}
          aria-label={isLiked ? t('取消点赞', 'Unlike') : t('点赞', 'Like')}
          aria-pressed={isLiked}
          onClick={() => {
            touch()
            toggleLike(current ?? activeId)
          }}
        >
          <HeartGlyph size={24} filled={isLiked} />
          <span className="dy-rail-count">{likeCount}</span>
        </button>

        <button
          type="button"
          className={`dy-pglass dy-rail-circle${isCollected ? ' collected' : ''}`}
          aria-label={isCollected ? t('取消收藏', 'Uncollect') : t('收藏', 'Collect')}
          aria-pressed={isCollected}
          onClick={() => {
            touch()
            toggleCollect(current ?? activeId)
          }}
        >
          <BookmarkGlyph size={22} filled={isCollected} />
          <span className="dy-rail-count">{isCollected ? t('已藏', 'Saved') : t('收藏', 'Save')}</span>
        </button>

        <button
          type="button"
          className="dy-pglass dy-rail-circle"
          aria-label={t('下一条', 'Next')}
          onClick={() => {
            touch()
            skip(1)
          }}
        >
          <ArrowDownGlyph size={24} />
        </button>
      </div>

      {/* Bottom Glass Controls */}
      {!showDrawer && (
        <div className="dy-player-bottom">
          <PlayerProgressBar onTouch={touch} />

          <div className="dy-player-controls">
            <button
              type="button"
              className="dy-pglass dy-pround big primary"
              aria-label={isPlayingNow ? t('暂停', 'Pause') : t('播放', 'Play')}
              onClick={() => {
                touch()
                playOrPause()
              }}
            >
              {isPlayingNow ? <PauseGlyph /> : <PlayGlyph />}
            </button>

            <PlayerVolumeControl onTouch={touch} />

            <div className="dy-pglass dy-ppill dy-ptime">
              <PlayerTimeDisplay />
            </div>

            <span className="dy-pspacer" />

            <button
              type="button"
              className={`dy-pglass dy-ppill${autoScroll ? ' on' : ''}`}
              aria-pressed={autoScroll}
              aria-label={autoScroll ? t('自动连播已开', 'Auto-scroll on') : t('单视频循环', 'Loop single video')}
              onClick={() => {
                touch()
                toggleAutoScroll()
              }}
            >
              <AutoScrollGlyph size={18} on={autoScroll} />
              <span>{autoScroll ? t('连播', 'Auto') : t('循环', 'Loop')}</span>
            </button>

            <button
              type="button"
              className={`dy-pglass dy-ppill${crop ? ' on' : ''}`}
              aria-pressed={crop}
              aria-label={crop ? t('铺满裁切', 'Fill crop') : t('完整适应', 'Fit frame')}
              onClick={() => {
                touch()
                toggleCrop()
              }}
            >
              <FitFillGlyph size={18} crop={crop} />
              <span>{crop ? t('铺满', 'Fill') : t('适应', 'Fit')}</span>
            </button>

            <button
              type="button"
              className={`dy-pglass dy-ppill${showSpeedMenu ? ' on' : ''}`}
              aria-label={t('倍速', 'Playback speed')}
              aria-haspopup="menu"
              aria-expanded={showSpeedMenu}
              onClick={() => {
                touch()
                setShowSpeedMenu((v) => !v)
              }}
            >
              <SpeedGlyph size={18} />
              <span>{rate === 1 ? '1.0x' : `${rate}x`}</span>
            </button>

            <button
              type="button"
              className="dy-pglass dy-ppill"
              aria-label={t('视频队列', 'Video queue')}
              onClick={() => {
                touch()
                setShowSpeedMenu(false)
                setShowDrawer(true)
              }}
            >
              <QueueGlyph />
              <span>{videos.length}</span>
            </button>
          </div>
        </div>
      )}

      {/* Playback Speed Glass Menu */}
      {controls && !showDrawer && showSpeedMenu && (
        <div className="dy-speed-menu" role="menu" aria-label={t('播放倍速', 'Playback speed')}>
          <span className="dy-speed-menu-title">{t('播放倍速', 'Speed')}</span>
          <div className="dy-speed-grid">
            {SPEED_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                role="menuitemradio"
                aria-checked={rate === r}
                className={`dy-speed-item${rate === r ? ' on' : ''}`}
                onClick={() => {
                  setRate(r)
                  setShowSpeedMenu(false)
                }}
              >
                {rate === r && <CheckGlyph />}
                <span>{r === 1 ? t('正常', '1x') : `${r}x`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Slide-over Video Queue Drawer */}
      {showDrawer && (
        <div
          className="dy-drawer-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setShowDrawer(false)
          }}
        >
          <div className="dy-drawer" role="dialog" aria-modal="true" aria-label={t('当前推荐队列', 'Current queue')}>
            <div className="dy-drawer-head">
              <h3>{t('推荐视频队列', 'Up Next')}</h3>
              <button
                type="button"
                className="dy-pglass dy-pround"
                aria-label={t('关闭队列', 'Close queue')}
                onClick={() => setShowDrawer(false)}
              >
                <CloseGlyph />
              </button>
            </div>

            <div className="dy-drawer-list">
              {videos.map((v, idx) => {
                const active = v.id === activeId || idx === currentVideoIndex
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`dy-drawer-item${active ? ' active' : ''}`}
                    onClick={() => {
                      play(v, idx, true)
                      setShowDrawer(false)
                    }}
                  >
                    <div className="dy-drawer-thumb">
                      {v.artwork ? (
                        <img src={v.artwork} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <DouyinLogoGlyph size={22} />
                      )}
                      {active && (
                        <span className="dy-thumb-live">
                          <DyBars playing={isPlayingNow} />
                        </span>
                      )}
                      {v.duration ? <span className="dy-thumb-dur">{formatClock(v.duration)}</span> : null}
                    </div>
                    <div className="dy-drawer-info">
                      <span className="dy-drawer-title">{v.title}</span>
                      <span className="dy-drawer-sub">
                        @{v.author}
                        {v.likes ? ` · ${formatCount(v.likes)}` : ''}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerProgressBar({ onTouch }: { onTouch: () => void }) {
  const { time, duration } = useDouyinPosition()
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? time
  const safeDuration = duration || 1
  const pct = Math.min(100, Math.max(0, (shown / safeDuration) * 100))

  const calc = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)))
    return ratio * safeDuration
  }

  return (
    <div
      className="dy-progress"
      role="slider"
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onTouch()
        setDragging(calc(e.currentTarget, e.clientX))
      }}
      onPointerMove={(e) => {
        if (dragging === null) return
        setDragging(calc(e.currentTarget, e.clientX))
      }}
      onPointerUp={(e) => {
        if (dragging === null) return
        const next = calc(e.currentTarget, e.clientX)
        setDragging(null)
        seek(next)
      }}
      onPointerCancel={() => setDragging(null)}
    >
      <div className="dy-progress-track">
        <div className="dy-progress-fill" style={{ width: `${pct}%` }} />
        <div className="dy-progress-thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  )
}

function PlayerTimeDisplay() {
  const { time, duration } = useDouyinPosition()
  return (
    <span>
      {formatClock(time)} / {formatClock(duration)}
    </span>
  )
}

function PlayerVolumeControl({ onTouch }: { onTouch: () => void }) {
  const volume = useDouyin((s) => s.volume)
  const muted = useDouyin((s) => s.muted)
  const pct = muted ? 0 : Math.round(volume * 100)

  return (
    <div className="dy-pglass dy-ppill dy-volume">
      <button
        type="button"
        className="dy-vol-btn"
        aria-label={muted ? '取消静音' : '静音'}
        onClick={() => {
          onTouch()
          toggleMute()
        }}
      >
        <VolumeGlyph muted={muted || volume === 0} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        aria-label="音量"
        className="dy-vol-slider"
        onChange={(e) => {
          onTouch()
          sendVolumePercent(Number(e.target.value))
        }}
      />
    </div>
  )
}
