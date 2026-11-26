import { useEffect, useState } from 'react'
import { go } from '../../state/store'
import { useText } from '../../state/text'
import {
  CloseGlyph,
  FullScreenGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  ReplayGlyph,
} from '../youtube/glyphs'
import { OverVideo, VideoHole } from '../youtube/VideoHole'
import { nameOf, playOrPause, replay, skip, stopPlayback, useCurrentSong, usePlayer } from './player'

const CONTROLS_MS = 3000

/**
 * Dashboard Now Playing widget while Player plays a local video: shows the live video through VideoHole
 * (cropped to fill the card) with touch HUD controls to skip, play/pause, expand to full screen, or close.
 */
export function PlayerVideoWidget() {
  const text = useText()
  const item = useCurrentSong()
  const playback = usePlayer((state) => state.playback)
  const playing = Boolean(playback?.playing && !playback.ended)
  const ended = Boolean(playback?.ended)
  const [controls, setControls] = useState(false)
  const [touched, setTouched] = useState(0)

  const touch = () => {
    setControls(true)
    setTouched((n) => n + 1)
  }

  useEffect(() => {
    if (!controls || !playing) return
    const timer = window.setTimeout(() => setControls(false), CONTROLS_MS)
    return () => window.clearTimeout(timer)
  }, [controls, playing, touched])

  if (!playback || !item) return null

  const title = nameOf(item)
  return (
    <article className="widget now-playing yt-widget" aria-label={title}>
      <VideoHole app="player" className="yt-widget-video" crop />
      <OverVideo app="player">
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
              <span className="yt-widget-title pl-widget-title">{title}</span>
              <div className="yt-widget-controls">
                <button
                  type="button"
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
                  className="main"
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
                  aria-label={text.next}
                  onClick={() => {
                    touch()
                    skip(1)
                  }}
                >
                  <NextGlyph />
                </button>
              </div>
              <div className="pl-widget-actions">
                <button
                  type="button"
                  className="pl-widget-action"
                  aria-label={text.player.fullScreen}
                  onClick={() => {
                    usePlayer.setState({ returnToVideo: true })
                    go({ type: 'openApp', app: 'player' })
                  }}
                >
                  <FullScreenGlyph />
                </button>
                <button
                  type="button"
                  className="pl-widget-action close"
                  aria-label={text.player.closeVideo}
                  onClick={stopPlayback}
                >
                  <CloseGlyph />
                </button>
              </div>
            </>
          )}
        </div>
      </OverVideo>
    </article>
  )
}
