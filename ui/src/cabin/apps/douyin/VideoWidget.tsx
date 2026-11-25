import { useEffect, useState } from 'react'
import { go } from '../../state/store'
import { FullScreenGlyph, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from '../youtube/glyphs'
import { OverVideo, VideoHole } from '../youtube/VideoHole'
import { playOrPause, skip, useDouyin } from './douyin'
import { DouyinLogoGlyph } from './glyphs'

const CONTROLS_MS = 3000

/**
 * Dashboard Now Playing live video card for Douyin (`抖音`).
 * Embeds the live WebView2 via `VideoHole` (cropped to fit the dashboard frame) with CarPlay touch HUD controls.
 */
export function DouyinVideoWidget() {
  const playback = useDouyin((store) => store.playback)
  const playing = useDouyin((store) => store.playing)
  const current = useDouyin((store) => store.current)

  const isPlayingNow = Boolean(playing || playback?.status === 'playing')
  const [controls, setControls] = useState(false)
  const [touched, setTouched] = useState(0)

  const touch = () => {
    setControls(true)
    setTouched((n) => n + 1)
  }

  useEffect(() => {
    if (!controls || !isPlayingNow) return
    const timer = setTimeout(() => setControls(false), CONTROLS_MS)
    return () => clearTimeout(timer)
  }, [controls, isPlayingNow, touched])

  if (!playback) return null

  const label = playback.title || current?.title || '抖音精选短视频'
  const author = playback.author || playback.artist || current?.author

  return (
    <article className="widget now-playing yt-widget dy-widget" aria-label={label}>
      <VideoHole
        app="douyin"
        className="yt-widget-video"
        crop
        thumbnailSrc={playback.artwork ?? current?.artwork ?? null}
      />
      <OverVideo app="douyin">
        <div
          className={controls ? 'yt-widget-over shown' : 'yt-widget-over'}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (controls) setControls(false)
            else touch()
          }}
        >
          {controls && (
            <>
              <div className="dy-widget-meta">
                <span className="dy-widget-badge">
                  <DouyinLogoGlyph size={14} />
                  <span>抖音{author ? ` · @${author}` : ''}</span>
                </span>
                <span className="yt-widget-title">{label}</span>
              </div>
              <div className="yt-widget-controls">
                <button
                  type="button"
                  aria-label="上一条"
                  onClick={() => {
                    touch()
                    skip(-1)
                  }}
                >
                  <PreviousGlyph />
                </button>
                <button
                  type="button"
                  className="main"
                  aria-label={isPlayingNow ? '暂停' : '播放'}
                  onClick={() => {
                    touch()
                    playOrPause()
                  }}
                >
                  {isPlayingNow ? <PauseGlyph /> : <PlayGlyph />}
                </button>
                <button
                  type="button"
                  aria-label="下一条"
                  onClick={() => {
                    touch()
                    skip(1)
                  }}
                >
                  <NextGlyph />
                </button>
              </div>
              <button
                type="button"
                className="yt-widget-full"
                aria-label="全屏观看"
                onClick={() => {
                  useDouyin.setState({ returnToPlayer: true })
                  go({ type: 'openApp', app: 'douyin' })
                }}
              >
                <FullScreenGlyph />
              </button>
            </>
          )}
        </div>
      </OverVideo>
    </article>
  )
}
