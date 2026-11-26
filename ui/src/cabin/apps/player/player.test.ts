import { beforeEach, describe, expect, it } from 'vitest'
import {
  closeVideoPlayer,
  coverOf,
  currentSong,
  isVideoPlayback,
  leaveVideoPlayer,
  nameOf,
  openVideoPlayer,
  play,
  playVideo,
  positionOf,
  receiveFolder,
  receivePlayback,
  releaseResource,
  stopPlayback,
  usePlayer,
} from './player'

describe('Player', () => {
  beforeEach(() => {
    usePlayer.setState(usePlayer.getInitialState(), true)
  })

  it('names a song or video by its title, else by its file without its extension', () => {
    expect(nameOf({ file: 'a.mp3', title: 'Night Drive', seconds: 1 })).toBe('Night Drive')
    expect(nameOf({ file: 'weigh station (live).mp3', seconds: 1 })).toBe('weigh station (live)')
    expect(nameOf({ file: 'Alpine Pass.mp4', kind: 'video', seconds: 100 })).toBe('Alpine Pass')
    expect(nameOf({ file: 'no extension', seconds: 1 })).toBe('no extension')
  })

  it('shows embedded cover first, else captured video poster, else null', () => {
    expect(coverOf({ file: 'a.mp3', seconds: 1, cover: '0011.jpg' })).toBe('https://westplay.music-covers/0011.jpg')
    expect(coverOf({ file: 'clip.mp4', kind: 'video', seconds: 10 }, { 'clip.mp4': 'data:image/jpeg;base64,abc' })).toBe(
      'data:image/jpeg;base64,abc',
    )
    expect(
      coverOf(
        { file: 'clip.mp4', kind: 'video', seconds: 10, cover: 'embedded.jpg' },
        { 'clip.mp4': 'data:image/jpeg;base64,abc' },
      ),
    ).toBe('https://westplay.music-covers/embedded.jpg')
    expect(coverOf({ file: 'a.mp3', seconds: 1 })).toBeNull()
    expect(coverOf(null)).toBeNull()
  })

  it('finds the item playing in songs or videos by playback kind', () => {
    const songs = [{ file: 'a.mp3', kind: 'audio' as const, title: 'A', seconds: 10 }]
    const videos = [{ file: 'v.mp4', kind: 'video' as const, title: 'V', seconds: 60 }]
    const playing = (file: string, kind: 'audio' | 'video' = 'audio') =>
      ({ file, kind, at: 0 }) as Parameters<typeof positionOf>[0]

    expect(currentSong({ songs, videos, playback: playing('a.mp3', 'audio') })).toBe(songs[0])
    expect(currentSong({ songs, videos, playback: playing('v.mp4', 'video') })).toBe(videos[0])
    expect(currentSong({ songs, videos, playback: playing('gone.mp3', 'audio') })).toEqual({
      file: 'gone.mp3',
      kind: 'audio',
      seconds: 0,
    })
    expect(currentSong({ songs, videos, playback: playing('gone.mp4', 'video') })).toEqual({
      file: 'gone.mp4',
      kind: 'video',
      seconds: 0,
    })
    expect(currentSong({ songs, videos, playback: null })).toBeNull()
  })

  it('runs time on with playback rate while playing, holds when paused/loading/ended', () => {
    const base = {
      file: 'a.mp4',
      kind: 'video' as const,
      position: 10,
      duration: 20,
      shuffle: false,
      repeat: 'off' as const,
      volume: 1,
      rate: 1,
      index: 0,
      count: 1,
      at: 1000,
    }
    expect(positionOf({ ...base, playing: true, loading: false }, 2500)).toBe(11.5)
    expect(positionOf({ ...base, playing: true, loading: false, rate: 2 }, 2500)).toBe(13)
    expect(positionOf({ ...base, playing: true, loading: false }, 15000)).toBe(20)
    expect(positionOf({ ...base, playing: false, loading: false }, 9000)).toBe(10)
    expect(positionOf({ ...base, playing: true, loading: true }, 9000)).toBe(10)
    expect(positionOf({ ...base, playing: true, loading: false, ended: true }, 9000)).toBe(10)
    expect(positionOf(null, 9000)).toBe(0)
  })

  it('tracks separate music and videos folders, poster caching, and video theater transitions', () => {
    receiveFolder(
      'C:\\Docs\\ETS2\\music',
      [{ file: 'song.mp3', kind: 'audio', seconds: 120 }],
      'C:\\Docs\\ETS2\\videos',
      [{ file: 'road.mp4', kind: 'video', seconds: 240 }],
    )
    expect(usePlayer.getState().folder).toBe('C:\\Docs\\ETS2\\music')
    expect(usePlayer.getState().videosFolder).toBe('C:\\Docs\\ETS2\\videos')
    expect(usePlayer.getState().videos).toHaveLength(1)

    playVideo(0, false)
    expect(usePlayer.getState().videoOpen).toBe(true)
    expect(usePlayer.getState().tab).toBe('videos')
    expect(isVideoPlayback(usePlayer.getState().playback)).toBe(true)

    receivePlayback({
      file: 'road.mp4',
      kind: 'video',
      playing: true,
      loading: false,
      ended: false,
      position: 5,
      duration: 240,
      shuffle: false,
      repeat: 'off',
      volume: 1,
      rate: 1.25,
      index: 0,
      count: 1,
      poster: 'data:image/jpeg;base64,frame1',
    })
    expect(usePlayer.getState().posters['road.mp4']).toBe('data:image/jpeg;base64,frame1')
    expect(usePlayer.getState().rate).toBe(1.25)

    leaveVideoPlayer()
    expect(usePlayer.getState().videoOpen).toBe(false)
    expect(usePlayer.getState().returnToVideo).toBe(true)

    openVideoPlayer()
    expect(usePlayer.getState().videoOpen).toBe(true)
    expect(usePlayer.getState().returnToVideo).toBe(false)

    closeVideoPlayer()
    expect(usePlayer.getState().videoOpen).toBe(false)
    expect(usePlayer.getState().returnToVideo).toBe(false)

    // Switching to audio closes video player state.
    play(0, false)
    expect(isVideoPlayback(usePlayer.getState().playback)).toBe(false)
    expect(usePlayer.getState().videoOpen).toBe(false)

    // Releasing session resources keeps folder listings and preferences.
    releaseResource()
    expect(usePlayer.getState().playback).toBeNull()
    expect(usePlayer.getState().songs).toHaveLength(1)
    expect(usePlayer.getState().videos).toHaveLength(1)
    expect(usePlayer.getState().videosFolder).toBe('C:\\Docs\\ETS2\\videos')
  })

  it('stops video playback completely and ignores stale host reports until confirmed or restarted', () => {
    receiveFolder(
      'C:\\Docs\\ETS2\\music',
      [],
      'C:\\Docs\\ETS2\\videos',
      [
        { file: 'clip1.mp4', kind: 'video', seconds: 180 },
        { file: 'clip2.mp4', kind: 'video', seconds: 90 },
      ],
    )

    playVideo(0, false)
    usePlayer.setState({ hole: { x: 10, y: 10, width: 320, height: 180, radius: 12 } })
    expect(usePlayer.getState().videoOpen).toBe(true)
    expect(usePlayer.getState().playback?.file).toBe('clip1.mp4')

    stopPlayback()
    expect(usePlayer.getState().playback).toBeNull()
    expect(usePlayer.getState().videoOpen).toBe(false)
    expect(usePlayer.getState().returnToVideo).toBe(false)
    expect(usePlayer.getState().nowPlaying).toBe(false)
    expect(usePlayer.getState().hole).toBeNull()

    // Stale in-flight report from host before stop took effect must not resurrect playback.
    receivePlayback({
      file: 'clip1.mp4',
      kind: 'video',
      playing: true,
      loading: false,
      ended: false,
      position: 12,
      duration: 180,
      shuffle: false,
      repeat: 'off',
      volume: 1,
      rate: 1,
      index: 0,
      count: 2,
    })
    expect(usePlayer.getState().playback).toBeNull()

    // Host null confirmation clears stopping guard, and starting a new video works cleanly.
    receivePlayback(null)
    playVideo(1, false)
    expect(usePlayer.getState().videoOpen).toBe(true)
    expect(usePlayer.getState().playback?.file).toBe('clip2.mp4')
  })

  it('keeps full-screen video open when a stale null report arrives during cold start or quick restart', () => {
    receiveFolder('C:\\Docs\\ETS2\\music', [], 'C:\\Docs\\ETS2\\videos', [
      { file: 'cold.mp4', kind: 'video', seconds: 120 },
    ])

    playVideo(0, false)
    expect(usePlayer.getState().videoOpen).toBe(true)

    // Cold-start WebView2 or prior stop ack reporting null before first video report must not minimize full-screen.
    receivePlayback(null)
    expect(usePlayer.getState().videoOpen).toBe(true)
    expect(usePlayer.getState().playback?.file).toBe('cold.mp4')

    // Once host confirms playback, subsequent null reports close playback normally.
    receivePlayback({
      file: 'cold.mp4',
      kind: 'video',
      playing: true,
      loading: false,
      ended: false,
      position: 0.5,
      duration: 120,
      shuffle: false,
      repeat: 'off',
      volume: 1,
      rate: 1,
      index: 0,
      count: 1,
    })
    expect(usePlayer.getState().videoOpen).toBe(true)

    receivePlayback(null)
    expect(usePlayer.getState().videoOpen).toBe(false)
    expect(usePlayer.getState().playback).toBeNull()
  })
})
