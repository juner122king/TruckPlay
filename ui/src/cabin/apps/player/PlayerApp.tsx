import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import type { PlayerSong } from '../../../shared/host'
import { useText } from '../../state/text'
import { CloseGlyph } from '../youtube/glyphs'
import {
  coverOf,
  cycleRepeat,
  isVideoPlayback,
  nameOf,
  openVideoPlayer,
  play,
  playOrPause,
  playVideo,
  positionOf,
  seek,
  setShuffle,
  setVolume,
  skip,
  stopPlayback,
  useCurrentSong,
  usePlayer,
} from './player'
import './player.css'

/**
 * Player (owner 2026-11-04): WestPlay's own player for the game's music folder and separate videos folder
 * (one set of folders for all the game's profiles). Songs and videos in separate tabs with Play and Shuffle;
 * files without tags show their file name. At the foot the mini player; pressed, Now Playing (for audio) or
 * the full-screen theater (for video) opens. The host lists and streams them (player.ts), through the truck's
 * own speakers.
 */
export function PlayerApp() {
  const text = useText()
  const songs = usePlayer((state) => state.songs)
  const videos = usePlayer((state) => state.videos)
  const folder = usePlayer((state) => state.folder)
  const videosFolder = usePlayer((state) => state.videosFolder)
  const tab = usePlayer((state) => state.tab)
  const open = usePlayer((state) => state.nowPlaying)
  const has = usePlayer((state) => state.playback !== null)
  const returnToVideo = usePlayer((state) => state.returnToVideo)
  const playingVideo = usePlayer((state) => isVideoPlayback(state.playback))

  // Returning to Player after leaving full-screen video (e.g. from Dashboard or Home): reopen the video.
  useEffect(() => {
    if (returnToVideo && playingVideo) {
      openVideoPlayer()
    }
  }, [returnToVideo, playingVideo])

  const items = tab === 'videos' ? videos : songs
  const isVideos = tab === 'videos'
  const activeFolder = isVideos ? videosFolder : folder

  return (
    <section className="app-panel player-app" aria-label={text.apps.player}>
      <header className="pl-bar">
        <h1 className="pl-title">{text.apps.player}</h1>
        <div className="pl-tabs" role="tablist" aria-label={text.apps.player}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'music'}
            className={tab === 'music' ? 'pl-tab active' : 'pl-tab'}
            onClick={() => usePlayer.setState({ tab: 'music' })}
          >
            <NoteGlyph />
            <span>{text.player.music}</span>
            {songs && songs.length > 0 && <span className="pl-tab-count">{songs.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'videos'}
            className={tab === 'videos' ? 'pl-tab active' : 'pl-tab'}
            onClick={() => usePlayer.setState({ tab: 'videos' })}
          >
            <FilmGlyph />
            <span>{text.player.videos}</span>
            {videos && videos.length > 0 && <span className="pl-tab-count">{videos.length}</span>}
          </button>
        </div>
        <span className="pl-gap" />
        {items && items.length > 0 && (
          <>
            <button
              type="button"
              className="pl-capsule"
              onClick={() => (isVideos ? playVideo(0, false) : play(0, false))}
            >
              <PlayGlyph /> {text.play}
            </button>
            <button
              type="button"
              className="pl-capsule key"
              onClick={() => (isVideos ? playVideo(undefined, true) : play(undefined, true))}
            >
              <ShuffleGlyph /> {text.shuffle}
            </button>
          </>
        )}
      </header>

      {items && items.length === 0 && (
        <div className="pl-empty">
          <div className="pl-empty-icon">{isVideos ? <FilmGlyph /> : <NoteGlyph />}</div>
          <div className="pl-empty-title">{isVideos ? text.player.noVideos : text.player.noSongs}</div>
          <p className="pl-empty-body">{isVideos ? text.player.addVideos : text.player.addSongs}</p>
          {isVideos && <p className="pl-empty-formats">{text.player.videoFormats}</p>}
          {activeFolder && <p className="pl-empty-folder">{activeFolder}</p>}
        </div>
      )}
      {items && items.length > 0 && (
        <div className="pl-scroll">
          <MediaList items={items} isVideos={isVideos} />
        </div>
      )}

      {has && <MiniPlayer />}
      {has && open && !playingVideo && <NowPlaying />}
    </section>
  )
}

function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

function extensionOf(file: string): string {
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(dot + 1).toUpperCase() : ''
}

/** Where playback is, kept running while it plays (a few times a second). */
function usePosition(): number {
  const playback = usePlayer((state) => state.playback)
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!playback?.playing) return
    const timer = window.setInterval(() => setNow(performance.now()), 250)
    return () => window.clearInterval(timer)
  }, [playback])
  return positionOf(playback, Math.max(now, playback?.at ?? 0))
}

// ---------- The list ----------

function MediaList({ items, isVideos }: { items: PlayerSong[]; isVideos: boolean }) {
  const playingFile = usePlayer((state) => state.playback?.file ?? null)
  const playingIsVideo = usePlayer((state) => isVideoPlayback(state.playback))
  const sounding = usePlayer((state) => Boolean(state.playback?.playing))
  return (
    <ul className="pl-list">
      {items.map((item, i) => {
        const current = playingFile === item.file && playingIsVideo === isVideos
        const ext = isVideos ? extensionOf(item.file) : ''
        const detail = item.artist ?? (isVideos && ext ? `${ext} · ${item.file}` : item.file)
        return (
          <li key={item.file}>
            <button
              type="button"
              className={current ? 'pl-row playing' : 'pl-row'}
              onClick={() => (isVideos ? playVideo(i, false) : play(i, false))}
            >
              <Cover song={item} size={isVideos ? 'video-row' : 'row'} isVideo={isVideos} />
              <span className="pl-row-words">
                <span className="pl-row-name">{nameOf(item)}</span>
                <span className="pl-row-detail">{detail}</span>
              </span>
              <span className="pl-row-end">
                {current ? <Bars playing={sounding} /> : item.seconds > 0 ? duration(item.seconds) : ''}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---------- The mini player and Now Playing ----------

function MiniPlayer() {
  const text = useText()
  const song = useCurrentSong()
  const playback = usePlayer((state) => state.playback)
  const open = usePlayer((state) => state.nowPlaying || state.videoOpen)
  const position = usePosition()
  if (!song || !playback) return null
  const isVideo = isVideoPlayback(playback)
  const length = playback.duration || song.seconds
  return (
    <div className={open ? 'pl-mini away' : 'pl-mini'}>
      <button
        type="button"
        className="pl-mini-open"
        onClick={() => {
          if (isVideo) openVideoPlayer()
          else usePlayer.setState({ nowPlaying: true })
        }}
      >
        <Cover song={song} size="mini" isVideo={isVideo} />
        <span className="pl-row-words">
          <span className="pl-row-name">{nameOf(song)}</span>
          <span className="pl-row-detail">{song.artist ?? song.file}</span>
        </span>
      </button>
      <button
        type="button"
        className="pl-icon"
        aria-label={playback.playing ? text.pause : text.play}
        onClick={playOrPause}
      >
        {playback.playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <button type="button" className="pl-icon" aria-label={text.next} onClick={() => skip(1)}>
        <NextGlyph />
      </button>
      <button type="button" className="pl-icon pl-mini-close" aria-label={text.close} onClick={stopPlayback}>
        <CloseGlyph />
      </button>
      {length > 0 && <span className="pl-mini-progress" style={{ width: `${(position / length) * 100}%` }} />}
    </div>
  )
}

function NowPlaying() {
  const text = useText()
  const song = useCurrentSong()
  const playback = usePlayer((state) => state.playback)
  const position = usePosition()
  if (!song || !playback) return null
  const length = playback.duration || song.seconds
  return (
    <div className="pl-now">
      <button
        type="button"
        className="pl-round pl-now-close"
        aria-label={text.close}
        onClick={() => usePlayer.setState({ nowPlaying: false })}
      >
        <DownGlyph />
      </button>
      <Cover song={song} size="now" isVideo={false} />
      <div className="pl-now-side">
        <div className="pl-now-words">
          <div className="pl-now-title">{nameOf(song)}</div>
          {song.artist && <div className="pl-now-artist">{song.artist}</div>}
        </div>
        <div
          className="pl-now-bar"
          role="slider"
          aria-label={text.nowPlaying}
          aria-valuemin={0}
          aria-valuemax={length}
          aria-valuenow={position}
          onPointerDown={(event) => {
            if (length <= 0) return
            const box = event.currentTarget.getBoundingClientRect()
            seek(((event.clientX - box.left) / box.width) * length)
          }}
        >
          <span style={{ width: length > 0 ? `${(position / length) * 100}%` : '0%' }} />
        </div>
        <div className="pl-now-times">
          <span>{duration(position)}</span>
          <span>{length > 0 ? `-${duration(length - position)}` : ''}</span>
        </div>
        <div className="pl-now-controls">
          <button
            type="button"
            className={playback.shuffle ? 'pl-icon small on' : 'pl-icon small'}
            aria-label={text.shuffle}
            aria-pressed={playback.shuffle}
            onClick={() => setShuffle(!playback.shuffle)}
          >
            <ShuffleGlyph />
          </button>
          <button type="button" className="pl-icon" aria-label={text.previous} onClick={() => skip(-1)}>
            <PreviousGlyph />
          </button>
          <button
            type="button"
            className="pl-icon big"
            aria-label={playback.playing ? text.pause : text.play}
            onClick={playOrPause}
          >
            {playback.playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button type="button" className="pl-icon" aria-label={text.next} onClick={() => skip(1)}>
            <NextGlyph />
          </button>
          <button
            type="button"
            className={playback.repeat === 'off' ? 'pl-icon small' : 'pl-icon small on'}
            aria-label={text.repeat}
            aria-pressed={playback.repeat !== 'off'}
            onClick={cycleRepeat}
          >
            {playback.repeat === 'one' ? <RepeatOneGlyph /> : <RepeatGlyph />}
          </button>
        </div>
        <Volume />
      </div>
    </div>
  )
}

/** Where the pointer is along a bar, 0 to 1. */
function shareAt(bar: HTMLElement, event: PointerEvent): number {
  const box = bar.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
}

/** Player's volume, as the player chooses it: the speaker (pressed, it mutes, or plays again as loud as it was)
 * and its bar to drag. */
function Volume() {
  const text = useText()
  const volume = usePlayer((state) => state.volume)
  const bar = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const before = useRef(volume || 0.5)
  return (
    <div className="pl-volume">
      <button
        type="button"
        className="pl-icon small"
        aria-label={volume === 0 ? text.player.unmute : text.player.mute}
        onClick={() => {
          if (volume > 0) before.current = volume
          setVolume(volume > 0 ? 0 : before.current)
        }}
      >
        <SpeakerGlyph volume={volume} />
      </button>
      <div
        ref={bar}
        className={dragging ? 'pl-volume-bar dragging' : 'pl-volume-bar'}
        role="slider"
        aria-label={text.player.volume}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(volume * 100)}
        style={{ '--share': volume } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          setVolume(shareAt(bar.current!, event))
        }}
        onPointerMove={(event) => {
          if (dragging) setVolume(shareAt(bar.current!, event))
        }}
        onPointerUp={(event) => {
          if (!dragging) return
          setVolume(shareAt(bar.current!, event))
          setDragging(false)
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <span />
      </div>
    </div>
  )
}

/** A song's or video's cover, from its tags / captured poster, or a note/film glyph without one. */
function Cover({ song, size, isVideo }: { song: PlayerSong; size: 'row' | 'video-row' | 'mini' | 'now'; isVideo: boolean }) {
  const posters = usePlayer((state) => state.posters)
  const cover = coverOf(song, posters)
  return (
    <span className={cover ? `pl-cover ${size}` : `pl-cover ${size} none`}>
      {cover ? <img src={cover} alt="" draggable={false} /> : isVideo ? <FilmGlyph /> : <NoteGlyph />}
    </span>
  )
}

function Bars({ playing }: { playing: boolean }) {
  return (
    <span className={playing ? 'pl-bars moving' : 'pl-bars'} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

// ---------- Glyphs (Player's own, drawn here) ----------

function Glyph({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  return (
    <svg
      className="pl-glyph"
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={fill ? 0 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const PlayGlyph = () => (
  <Glyph fill>
    <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8Z" />
  </Glyph>
)
const PauseGlyph = () => (
  <Glyph fill>
    <rect x="5.5" y="4" width="4.5" height="16" rx="1.4" />
    <rect x="14" y="4" width="4.5" height="16" rx="1.4" />
  </Glyph>
)
const NextGlyph = () => (
  <Glyph fill>
    <path d="M3 6.2v11.6a.9.9 0 0 0 1.38.76L12 13.6v4.2a.9.9 0 0 0 1.38.76l8.6-5.8a.9.9 0 0 0 0-1.52l-8.6-5.8A.9.9 0 0 0 12 6.2v4.2L4.38 5.44A.9.9 0 0 0 3 6.2Z" />
  </Glyph>
)
const PreviousGlyph = () => (
  <Glyph fill>
    <path d="M21 6.2v11.6a.9.9 0 0 1-1.38.76L12 13.6v4.2a.9.9 0 0 1-1.38.76l-8.6-5.8a.9.9 0 0 1 0-1.52l8.6-5.8A.9.9 0 0 1 12 6.2v4.2l7.62-4.96A.9.9 0 0 1 21 6.2Z" />
  </Glyph>
)
const ShuffleGlyph = () => (
  <Glyph>
    <path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 4.8c1.1 1.6 2.3 2.6 4.3 2.6H21" />
    <path d="M3 17h3.5c1.6 0 2.7-.6 3.6-1.7M13.9 8.7c.9-1.1 2-1.7 3.6-1.7H21" />
    <path d="m18 4 3 3-3 3M18 14l3 3-3 3" />
  </Glyph>
)
const RepeatGlyph = () => (
  <Glyph>
    <path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3" />
    <path d="M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" />
  </Glyph>
)
const RepeatOneGlyph = () => (
  <Glyph>
    <path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3" />
    <path d="M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3" />
    <path d="M11 10.5 12.5 9.5v5" strokeWidth={1.8} />
  </Glyph>
)
/** A speaker, its waves by how loud (none: muted, struck through). */
const SpeakerGlyph = ({ volume }: { volume: number }) => (
  <Glyph>
    <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" fill="currentColor" strokeWidth={1.6} />
    {volume === 0 && <path d="m15.5 9.5 5 5m0-5-5 5" />}
    {volume > 0 && <path d="M15 9.2a4 4 0 0 1 0 5.6" />}
    {volume > 0.5 && <path d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" />}
  </Glyph>
)
const DownGlyph = () => (
  <Glyph>
    <path d="m5 9 7 7 7-7" />
  </Glyph>
)
const NoteGlyph = () => (
  <Glyph fill>
    <path d="M19 3.6v11.9a3 3 0 1 1-2-2.83V7.4l-7 1.7v8.4a3 3 0 1 1-2-2.83V6.3a1 1 0 0 1 .76-.97l9-2.2A1 1 0 0 1 19 3.6Z" />
  </Glyph>
)
const FilmGlyph = () => (
  <Glyph>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M10 9.2 15.2 12 10 14.8Z" fill="currentColor" stroke="none" />
  </Glyph>
)
