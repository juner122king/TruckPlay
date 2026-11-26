import { useMemo } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  type PlayerCommand,
  type PlayerMediaKind,
  type PlayerPlayback,
  type PlayerRepeat,
  type PlayerSong,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { whenTransitionEnds } from '../../state/launch'
import type { Hole } from '../youtube/youtube'
import { SONGS, VIDEOS } from './mock'

export type PlayerTab = 'music' | 'videos'

/**
 * Player: WestPlay's own player for the game's music folder and separate videos folder (`westplay_host::music_folder`).
 * The host lists both folders (`musicFolder`) and streams/plays them in a dedicated WebView under the cabin page,
 * routing audio through the truck's own speakers; this follows playback state (`playerPlayback`) and sends commands.
 * In a plain browser (no host), made-up songs and videos stand in for previewing the UI.
 */
export interface PlayerState {
  /** The music folder's songs, in its order; `null` until the host has said them. */
  songs: PlayerSong[] | null
  /** The videos folder's videos, in its order; `null` until the host has said them. */
  videos: PlayerSong[] | null
  /** Where the music folder is (`null`: not known). */
  folder: string | null
  /** Where the videos folder is (`null`: not known). */
  videosFolder: string | null
  /** Active library tab in PlayerApp. */
  tab: PlayerTab
  /** What plays: the host's, its position at `at` (performance.now ms); `null`: nothing. */
  playback: (PlayerPlayback & { at: number }) | null
  /** Audio Now Playing sheet open over the app. */
  nowPlaying: boolean
  /** Full-screen video theater open over the CarPlay area (Shell `.watching`). */
  videoOpen: boolean
  /** Re-enter full-screen video when returning to the Player app. */
  returnToVideo: boolean
  /** Dashboard VideoHole cutout region when showing video in the widget. */
  hole: Hole | null
  /** Video aspect mode in full-screen player (`false`: contain/fit, `true`: cover/fill). */
  crop: boolean
  /** Chosen playback speed for videos. */
  rate: number
  /** The volume the player chose (0 to 1): a fade's steps aren't it. */
  volume: number
  /** Captured first-frame JPEG posters keyed by video filename (for smooth transitions & thumbnails). */
  posters: Record<string, string>
}

/** In the host (not the cab's preview in a plain browser, nor a test without a page). */
const IN_HOST = typeof window !== 'undefined' && isInHost()

export const usePlayer = create<PlayerState>(() => ({
  songs: IN_HOST ? null : SONGS,
  videos: IN_HOST ? null : VIDEOS,
  folder: IN_HOST ? null : 'Documents\\Euro Truck Simulator 2\\music',
  videosFolder: IN_HOST ? null : 'Documents\\Euro Truck Simulator 2\\videos',
  tab: 'music',
  playback: null,
  nowPlaying: false,
  videoOpen: false,
  returnToVideo: false,
  hole: null,
  crop: false,
  rate: 1,
  volume: 1,
  posters: {},
}))

/** Where extracted media covers are served (the host's `music_folder::COVERS_HOST`). */
const COVERS = 'https://westplay.music-covers/'

/** Incremented whenever the video surface is placed (`show`), so deferred `hide` doesn't race with a new placement. */
let shows = 0

/** Whether playback is a video item. */
export function isVideoPlayback(playback: Pick<PlayerPlayback, 'kind'> | null | undefined): boolean {
  return playback?.kind === 'video'
}

/** A song or video's cover URL (embedded tag cover, else captured video poster), or `null`. */
export function coverOf(song: PlayerSong | null | undefined, posters?: Record<string, string>): string | null {
  if (!song) return null
  if (song.cover) return COVERS + encodeURIComponent(song.cover)
  if (posters && song.file in posters) return posters[song.file]
  return null
}

/** A media item's display name: its title, else its file's name without its extension. */
export function nameOf(song: PlayerSong): string {
  return song.title ?? song.file.replace(/\.[^.]+$/, '')
}

/** Sends a command to Player's host WebView. */
export function sendCommand(command: PlayerCommand): void {
  if (command.action === 'show') shows += 1
  if (isInHost()) postToHost({ type: 'player', command })
}

/** The folders as the host listed them. */
export function receiveFolder(
  folder: string | null,
  songs: PlayerSong[],
  videosFolder: string | null = null,
  videos: PlayerSong[] = [],
): void {
  usePlayer.setState((state) => {
    // Keep only posters for videos still present in the folder.
    const present = new Set(videos.map((v) => v.file))
    const posters: Record<string, string> = {}
    for (const [file, url] of Object.entries(state.posters)) {
      if (present.has(file)) posters[file] = url
    }
    return { folder, songs, videosFolder, videos, posters }
  })
}

/** What the host says plays. */
export function receivePlayback(playback: PlayerPlayback | null): void {
  usePlayer.setState((state) => {
    const isVideo = isVideoPlayback(playback)
    const nextPosters =
      isVideo && playback?.poster && playback.file
        ? state.posters[playback.file] === playback.poster
          ? state.posters
          : { ...state.posters, [playback.file]: playback.poster }
        : state.posters
    return {
      playback: playback ? { ...playback, at: performance.now() } : null,
      posters: nextPosters,
      ...(playback?.rate && Number.isFinite(playback.rate) ? { rate: playback.rate } : {}),
      ...(playback
        ? isVideo
          ? { nowPlaying: false }
          : { videoOpen: false, returnToVideo: false }
        : { nowPlaying: false, videoOpen: false, returnToVideo: false }),
    }
  })
}

/** The media item playing (found in songs or videos by playback kind), or `null`. */
export function currentSong(
  state: Pick<PlayerState, 'songs' | 'playback'> & { videos?: PlayerSong[] | null },
): PlayerSong | null {
  const file = state.playback?.file
  if (!file) return null
  const kind: PlayerMediaKind = isVideoPlayback(state.playback) ? 'video' : 'audio'
  const list = kind === 'video' ? state.videos : state.songs
  return list?.find((item) => item.file === file) ?? { file, kind, seconds: 0 }
}

/** The media item playing (`currentSong`), as a hook: the same object while it's the same item. */
export function useCurrentSong(): PlayerSong | null {
  const songs = usePlayer((state) => state.songs)
  const videos = usePlayer((state) => state.videos)
  const file = usePlayer((state) => state.playback?.file ?? null)
  const kind = usePlayer((state) => state.playback?.kind)
  return useMemo(
    () => (file ? currentSong({ songs, videos, playback: { file, kind } as PlayerState['playback'] }) : null),
    [songs, videos, file, kind],
  )
}

/** Where playback is now (seconds): time advances from the last host report while playing. */
export function positionOf(playback: PlayerState['playback'], now: number): number {
  if (!playback) return 0
  const rate = playback.rate && Number.isFinite(playback.rate) ? playback.rate : 1
  const run = playback.playing && !playback.loading && !playback.ended ? ((now - playback.at) / 1000) * rate : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, Math.max(0, playback.position + run))
}

/** Current interpolated playback position in seconds. */
export function positionNow(): number {
  return positionOf(usePlayer.getState().playback, performance.now())
}

/** Shows a change at once (the host's next word confirms it). */
function show(change: Partial<PlayerPlayback>): void {
  const { playback } = usePlayer.getState()
  if (!playback) return
  const now = performance.now()
  usePlayer.setState({ playback: { ...playback, position: positionOf(playback, now), at: now, ...change } })
}

/** Plays the music folder's songs from `index` (shuffled: from any when `index` is undefined). */
export function play(index: number | undefined, shuffle: boolean): void {
  const songs = usePlayer.getState().songs ?? []
  if (songs.length === 0) return
  usePlayer.setState({ videoOpen: false, returnToVideo: false })
  sendCommand({ action: 'hide' })
  // At the volume chosen (a player started anew plays at full).
  sendVolume(usePlayer.getState().volume)
  sendCommand({ action: 'play', files: songs.map((song) => song.file), index, shuffle, kind: 'audio' })
  if (!IN_HOST) {
    const picked = songs[index ?? 0]
    if (picked) {
      receivePlayback({
        file: picked.file,
        kind: 'audio',
        playing: true,
        loading: false,
        ended: false,
        position: 0,
        duration: picked.seconds,
        shuffle,
        repeat: 'off',
        volume: usePlayer.getState().volume,
        rate: 1,
        index: index ?? 0,
        count: songs.length,
      })
    }
  }
}

/** Plays the videos folder's videos from `index` and opens the full-screen video player. */
export function playVideo(index: number | undefined, shuffle: boolean): void {
  const videos = usePlayer.getState().videos ?? []
  if (videos.length === 0) return
  const rate = usePlayer.getState().rate
  usePlayer.setState({ nowPlaying: false, videoOpen: true, returnToVideo: false, tab: 'videos' })
  sendVolume(usePlayer.getState().volume)
  sendCommand({ action: 'play', files: videos.map((video) => video.file), index, shuffle, kind: 'video' })
  if (rate !== 1) sendCommand({ action: 'rate', rate })
  if (!IN_HOST) {
    const picked = videos[index ?? 0]
    if (picked) {
      receivePlayback({
        file: picked.file,
        kind: 'video',
        playing: true,
        loading: false,
        ended: false,
        position: 0,
        duration: picked.seconds,
        shuffle,
        repeat: 'off',
        volume: usePlayer.getState().volume,
        rate,
        index: index ?? 0,
        count: videos.length,
      })
    }
  }
}

/** Opens the full-screen video player if a video is currently loaded. */
export function openVideoPlayer(): void {
  if (isVideoPlayback(usePlayer.getState().playback)) {
    usePlayer.setState({ videoOpen: true, returnToVideo: false, nowPlaying: false })
  }
}

/** Minimizes the full-screen video player back to the Player list (video keeps playing). */
export function closeVideoPlayer(): void {
  usePlayer.setState({ videoOpen: false, returnToVideo: false })
  sendCommand({ action: 'hide' })
}

/** Leaves the full-screen video player when navigating to another screen; returns to it when reopening Player. */
export function leaveVideoPlayer(): void {
  const hasVideo = isVideoPlayback(usePlayer.getState().playback)
  usePlayer.setState({ videoOpen: false, returnToVideo: hasVideo })
  const placed = shows
  whenTransitionEnds(() => {
    if (shows === placed && !usePlayer.getState().videoOpen) sendCommand({ action: 'hide' })
  })
}

export function playOrPause(): void {
  const { playback } = usePlayer.getState()
  if (!playback) return
  if (playback.playing) {
    sendCommand({ action: 'pause' })
    show({ playing: false, loading: false })
  } else {
    if (playback.ended) {
      sendCommand({ action: 'seek', seconds: 0 })
      show({ position: 0, ended: false })
    }
    sendCommand({ action: 'play' })
    show({ playing: true, ended: false, error: null })
  }
}

export function replay(): void {
  const { playback } = usePlayer.getState()
  if (!playback) return
  sendCommand({ action: 'seek', seconds: 0 })
  sendCommand({ action: 'play' })
  show({ position: 0, playing: true, ended: false, error: null })
}

/** Next (1) or Back (-1): Back past a track's first seconds returns to start. */
export function skip(direction: 1 | -1): boolean {
  if (!usePlayer.getState().playback) return false
  sendCommand({ action: direction === 1 ? 'next' : 'previous' })
  return true
}

export function seek(seconds: number): void {
  const clamped = Math.max(0, seconds)
  sendCommand({ action: 'seek', seconds: clamped })
  show({ position: clamped, ended: false })
}

export function seekBy(deltaSeconds: number): void {
  const { playback } = usePlayer.getState()
  if (!playback) return
  const target = Math.min(playback.duration || Number.POSITIVE_INFINITY, Math.max(0, positionNow() + deltaSeconds))
  seek(target)
}

export function setRate(rate: number): void {
  usePlayer.setState({ rate })
  sendCommand({ action: 'rate', rate })
  show({ rate })
}

export function setCrop(crop: boolean): void {
  usePlayer.setState({ crop })
  sendCommand({ action: 'crop', on: crop })
}

export function setShuffle(on: boolean): void {
  sendCommand({ action: 'shuffle', on })
  show({ shuffle: on })
}

export function cycleRepeat(): void {
  const repeat = usePlayer.getState().playback?.repeat ?? 'off'
  const next: PlayerRepeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off'
  sendCommand({ action: 'repeat', mode: next })
  show({ repeat: next })
}

/** Sets the volume it plays at (0 to 1) without making it the player's choice: a fade's step. */
export function sendVolume(share: number): void {
  sendCommand({ action: 'volume', percent: Math.round(Math.min(1, Math.max(0, share)) * 100) })
}

/** Sets the volume it plays at (0 to 1) as the player's choice (a keybind). */
export function setVolume(share: number): void {
  const volume = Math.min(1, Math.max(0, share))
  usePlayer.setState({ volume })
  sendVolume(volume)
}

/** Whether Player plays now. */
export function playingNow(): boolean {
  return Boolean(usePlayer.getState().playback?.playing)
}

/** Pauses what plays (the game paused, tabbed out of, its electrics off; another player started). */
export function pauseNow(): void {
  if (!playingNow()) return
  sendCommand({ action: 'pause' })
  show({ playing: false, loading: false })
}

/** Plays on what was paused (back in the game). */
export function resumeNow(): void {
  const { playback } = usePlayer.getState()
  if (!playback || playback.playing) return
  sendCommand({ action: 'play' })
  show({ playing: true })
}

/** What Player plays, as the Dashboard's Now Playing takes music/video, and its cover; `null` while nothing does. */
export function usePlayerSource(): { source: MediaSource; artwork: string | null; isVideo: boolean } | null {
  const playback = usePlayer((state) => state.playback)
  const songs = usePlayer((state) => state.songs)
  const videos = usePlayer((state) => state.videos)
  const posters = usePlayer((state) => state.posters)
  return useMemo(() => {
    const song = currentSong({ songs, videos, playback })
    if (!playback || !song) return null
    const video = isVideoPlayback(playback)
    return {
      source: {
        id: 'westplay-player',
        service: 'player',
        title: nameOf(song),
        artist: song.artist ?? '',
        album: '',
        artwork: null,
        status: playback.playing ? 'playing' : 'paused',
        positionMs: playback.position * 1000,
        positionAt: Math.round(performance.timeOrigin + playback.at),
        durationMs: (playback.duration || song.seconds) * 1000,
        controls: { playPause: true, next: true, previous: true, shuffle: true, repeat: true },
        shuffle: playback.shuffle,
        repeat: playback.repeat === 'one' ? 'track' : playback.repeat === 'all' ? 'list' : 'off',
      },
      artwork: coverOf(song, posters),
      isVideo: video,
    }
  }, [playback, songs, videos, posters])
}

/** Release session data while keeping folders, library listings and the player's preferences. */
export function releaseResource(): void {
  const before = usePlayer.getState()
  const kept = {
    songs: before.songs,
    videos: before.videos,
    folder: before.folder,
    videosFolder: before.videosFolder,
    tab: before.tab,
    volume: before.volume,
    crop: before.crop,
    rate: before.rate,
    posters: before.posters,
  }
  usePlayer.setState({ ...usePlayer.getInitialState(), ...kept })
}
