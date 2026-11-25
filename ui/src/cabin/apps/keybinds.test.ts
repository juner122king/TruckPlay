import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PageMessage } from '../../shared/host'
import { keybinds, stepped } from './keybinds'
import type { MusicPlayer } from './musicWithGame'

/** A player at `volume`, playing here or not; `start()` as it begins playing here. */
function player(
  volume: number | null,
  playing = false,
  options?: {
    name?: string
    pending?: boolean
    hasMedia?: boolean
    canSkip?: boolean
    tracks?: string[]
  },
) {
  const listeners = new Set<(started: boolean) => void>()
  const tracks = options?.tracks ?? []
  const state = {
    playing,
    pending: options?.pending ?? false,
    hasMedia: options?.hasMedia,
    volume,
    pauses: 0,
    resumes: 0,
    skips: [] as number[],
    trackIndex: 0,
  }
  const it: MusicPlayer = {
    name: options?.name ?? `player-${Math.random()}`,
    pendingHere: () => state.pending,
    hasMedia: options?.hasMedia !== undefined ? () => Boolean(state.hasMedia) : undefined,
    canSkip: options?.canSkip,
    trackTitle: tracks.length > 0 ? () => tracks[state.trackIndex] ?? null : undefined,
    playingHere: () => state.playing,
    pauseHere: () => {
      state.playing = false
      state.pending = false
      state.pauses += 1
    },
    resumeHere: () => {
      state.playing = true
      state.resumes += 1
    },
    volume: () => state.volume,
    sendVolume: () => {},
    setVolume: (share) => {
      state.volume = share
    },
    skip: (direction) => {
      if (options?.canSkip === false) return false
      state.skips.push(direction)
      if (tracks.length > 0) {
        state.trackIndex = (state.trackIndex + direction + tracks.length) % tracks.length
      }
      return true
    },
    subscribe: (changed) => {
      listeners.add(changed)
      return () => listeners.delete(changed)
    },
  }
  const start = () => {
    state.playing = true
    state.pending = false
    if (state.hasMedia !== undefined) state.hasMedia = true
    for (const listener of listeners) listener(true)
  }
  return { it, state, start, listeners }
}

describe('keybinds', () => {
  it('steps the volume of the player playing here by 5%', () => {
    const spotify = player(0.5)
    const youtube = player(0.8, true)
    const binds = keybinds([spotify.it, youtube.it])
    expect(binds.press('volumeUp')).toEqual({ kind: 'volume', volume: 0.85 })
    expect(binds.press('volumeDown')).toEqual({ kind: 'volume', volume: 0.8 })
    expect(spotify.state.volume).toBe(0.5)
  })

  it('pauses the player playing here, and plays the one that last played on', () => {
    const spotify = player(0.5)
    const youtube = player(0.8)
    const binds = keybinds([spotify.it, youtube.it])
    spotify.start()
    binds.press('playPause')
    expect(spotify.state).toMatchObject({ playing: false, pauses: 1 })
    // Paused, it's still the one: played on.
    binds.press('playPause')
    expect(spotify.state).toMatchObject({ playing: true, resumes: 1 })
    expect(youtube.state.resumes).toBe(0)
    // Its volume too, though paused.
    spotify.it.pauseHere()
    expect(binds.press('volumeUp')).toEqual({ kind: 'volume', volume: 0.55 })
  })

  it('skips the active player and returns track HUD feedback with the new title when changed synchronously', () => {
    const spotify = player(0.5, false, { tracks: ['A', 'B'] })
    const youtube = player(0.8, true, { tracks: ['First Video', 'Second Video'] })
    const binds = keybinds([spotify.it, youtube.it])
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: 'Second Video' })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: 'First Video' })
    expect(youtube.state.skips).toEqual([1, -1])
    // The volume as it was.
    expect(youtube.state.volume).toBe(0.8)
    expect(spotify.state.skips).toEqual([])
  })

  it('targets a pending/connecting player for rapid consecutive skips and prefers last active when multiple are pending', () => {
    const netease = player(0.8, false, { name: 'netease', pending: true, hasMedia: true, tracks: ['N1', 'N2'] })
    const radio = player(0.8, false, { name: 'ximalaya', pending: true, hasMedia: true, tracks: ['FM 1', 'FM 2'] })
    const binds = keybinds([netease.it, radio.it])
    radio.start()
    radio.state.playing = false
    radio.state.pending = true
    // Even if an earlier player still looks pending, the most recently active connecting player (Radio) wins.
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: 'FM 2' })
    expect(radio.state.skips).toEqual([1])
    expect(netease.state.skips).toEqual([])
  })

  it('falls back to a paused built-in media session when nothing played yet, and ignores active Safari', () => {
    const netease = player(0.8, false, { name: 'netease', hasMedia: true, tracks: ['Song 1', 'Song 2'] })
    const safari = player(1, true, { name: 'safari', hasMedia: true, canSkip: false })
    const binds = keybinds([netease.it, safari.it])

    // While Safari is actively playing, track skip does not hijack Safari or show a HUD.
    expect(binds.press('nextTrack')).toBeNull()
    expect(netease.state.skips).toEqual([])

    // Once Safari pauses, track skip falls back to the built-in app that still has loaded media.
    safari.it.pauseHere()
    safari.state.hasMedia = false
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: 'Song 2' })
    expect(netease.state.skips).toEqual([1])
  })

  it('does nothing with no player played yet, or one without a volume', () => {
    const spotify = player(null)
    const binds = keybinds([spotify.it])
    expect(binds.press('playPause')).toBeNull()
    expect(binds.press('nextTrack')).toBeNull()
    expect(spotify.state.resumes).toBe(0)
    spotify.start()
    expect(binds.press('volumeUp')).toBeNull()
  })

  it('stops following the players once stopped', () => {
    const spotify = player(0.5)
    const binds = keybinds([spotify.it])
    binds.stop()
    expect(spotify.listeners.size).toBe(0)
  })
})

describe('global previous/next keybinds across all built-in multimedia apps', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('skips every built-in multimedia app (including radio) and excludes Safari', async () => {
    const posted: PageMessage[] = []
    vi.stubGlobal('window', { chrome: { webview: { postMessage: (message: PageMessage) => posted.push(message) } } })

    const { keybinds: makeKeybinds } = await import('./keybinds')
    const { appleMusicPlayer } = await import('./music/pauseWithGame')
    const { useAppleMusic } = await import('./music/appleMusic')
    const { playerAppPlayer } = await import('./player/pauseWithGame')
    const { usePlayer } = await import('./player/player')
    const { neteasePlayer } = await import('./netease/pauseWithGame')
    const { useNetease } = await import('./netease/netease')
    const { qqmusicPlayer } = await import('./qqmusic/pauseWithGame')
    const { useQqmusic } = await import('./qqmusic/qqmusic')
    const { ximalayaPlayer } = await import('./ximalaya/pauseWithGame')
    const { useXimalaya } = await import('./ximalaya/ximalaya')
    const { bilibiliPlayer } = await import('./bilibili/pauseWithGame')
    const { useBilibili } = await import('./bilibili/bilibili')
    const { douyinPlayer } = await import('./douyin/pauseWithGame')
    const { useDouyin } = await import('./douyin/douyin')
    const { hongguoPlayer } = await import('./hongguo/pauseWithGame')
    const { useHongguo } = await import('./hongguo/hongguo')
    const { youtubePlayer } = await import('./youtube/pauseWithGame')
    const { useYouTube } = await import('./youtube/youtube')
    const { safariPlayer } = await import('./safari/pauseWithGame')
    const { receivePlaying: receiveSafariPlaying } = await import('./safari/safari')

    const allPlayers = [
      youtubePlayer,
      neteasePlayer,
      qqmusicPlayer,
      bilibiliPlayer,
      ximalayaPlayer,
      douyinPlayer,
      hongguoPlayer,
      appleMusicPlayer,
      playerAppPlayer,
      safariPlayer,
    ]
    const binds = makeKeybinds(allPlayers)

    const clearAll = () => {
      posted.length = 0
      useYouTube.setState({ current: null, state: null, queue: null, upNext: null, watched: [] })
      useNetease.setState({ playing: false, playback: null, queue: [], queueIndex: 0 })
      useQqmusic.setState({ playing: false, playback: null, queue: [], queueIndex: 0 })
      useBilibili.setState({ playing: false, playback: null, current: null, open: false, related: null, watched: [] })
      useXimalaya.setState({ playing: false, playback: null, queue: [], liveQueue: [], queueIndex: 0 })
      useDouyin.setState({ playing: false, playback: null, current: null, queue: null, buffering: false, open: false })
      useHongguo.setState({ playing: false, playback: null, currentDrama: null, currentEpisode: 1, open: false })
      useAppleMusic.setState({ playback: null })
      usePlayer.setState({ playback: null })
      receiveSafariPlaying(false)
    }

    // 1. NetEase Cloud Music
    clearAll()
    useNetease.setState({
      playing: true,
      queueIndex: 0,
      queue: [
        { id: 'n1', title: '网易第一首', artist: '歌手A', duration: 180 },
        { id: 'n2', title: '网易第二首', artist: '歌手B', duration: 200 },
      ],
      playback: {
        trackId: 'n1',
        title: '网易第一首',
        artist: '歌手A',
        duration: 180,
        position: 10,
        status: 'playing',
        at: 0,
      },
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: '网易第二首' })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: '网易第一首' })

    // 2. QQ Music
    clearAll()
    useQqmusic.setState({
      playing: true,
      queueIndex: 0,
      queue: [
        { id: 'q1', title: 'QQ第一首', artist: '歌手A', duration: 180 },
        { id: 'q2', title: 'QQ第二首', artist: '歌手B', duration: 200 },
      ],
      playback: {
        trackId: 'q1',
        title: 'QQ第一首',
        artist: '歌手A',
        duration: 180,
        position: 10,
        status: 'playing',
        at: 0,
      },
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: 'QQ第二首' })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: 'QQ第一首' })

    // 3. Ximalaya audiobook
    clearAll()
    useXimalaya.setState({
      playing: true,
      queueIndex: 0,
      queue: [
        { id: 'x1', title: '第一回', artist: '主播', duration: 600 },
        { id: 'x2', title: '第二回', artist: '主播', duration: 600 },
      ],
      playback: {
        trackId: 'x1',
        owner: 'ximalaya',
        title: '第一回',
        artist: '主播',
        duration: 600,
        position: 20,
        status: 'playing',
        at: 0,
      },
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: '第二回' })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: '第一回' })

    // 4. Radio (shared Ximalaya liveQueue)
    clearAll()
    useXimalaya.setState({
      playing: true,
      liveQueue: [
        { id: 'radio-1', radioId: 1, radio: true, title: '早间新闻', artist: '交通广播', duration: 0 },
        { id: 'radio-2', radioId: 2, radio: true, title: '音乐之声', artist: '音乐广播', duration: 0 },
      ],
      playback: {
        radioId: 1,
        owner: 'radio',
        isLive: true,
        title: '早间新闻',
        artist: '交通广播',
        duration: 0,
        position: 0,
        status: 'playing',
        at: 0,
      },
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: '音乐广播' })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: '交通广播' })

    // 5. Bilibili (background mode preserves open=false)
    clearAll()
    useBilibili.setState({
      playing: true,
      open: false,
      current: { bvid: 'BV1a', title: 'B站视频一', author: 'UP1', duration: 120 },
      playback: {
        bvid: 'BV1a',
        title: 'B站视频一',
        artist: 'UP1',
        duration: 120,
        position: 1,
        status: 'playing',
        at: performance.now(),
      },
      related: [{ bvid: 'BV1b', title: 'B站视频二', author: 'UP2', duration: 150 }],
      watched: [{ video: { bvid: 'BV1a', title: 'B站视频一', author: 'UP1', duration: 120 }, time: 1, duration: 120 }],
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: 'B站视频二' })
    expect(useBilibili.getState().open).toBe(false)
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: 'B站视频一' })

    // 6. Douyin
    clearAll()
    const dy1 = { id: 'dy1', title: '抖音第一条', author: '作者A' }
    const dy2 = { id: 'dy2', title: '抖音第二条', author: '作者B' }
    useDouyin.setState({
      playing: true,
      open: false,
      current: dy1,
      queue: { source: 'recommend', items: [dy1, dy2], index: 0, boundToFeed: false },
      playback: {
        id: 'dy1',
        title: '抖音第一条',
        artist: '作者A',
        author: '作者A',
        duration: 15,
        position: 2,
        status: 'playing',
        at: 0,
      },
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: '抖音第二条' })
    expect(posted).toContainEqual({ type: 'douyin', command: { action: 'next' } })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: '抖音第一条' })
    expect(posted).toContainEqual({ type: 'douyin', command: { action: 'previous' } })

    // 7. Hongguo
    clearAll()
    useHongguo.setState({
      playing: true,
      open: false,
      currentDrama: { id: 'd1', title: '卡车风云', author: '红果', totalEpisodes: 3 },
      currentEpisode: 1,
      playback: {
        dramaId: 'd1',
        title: '卡车风云 · 第1集',
        artist: '红果',
        duration: 90,
        position: 10,
        status: 'playing',
        at: 0,
      },
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: '卡车风云 · 第2集' })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: '卡车风云 · 第1集' })

    // 8. YouTube
    clearAll()
    const yt1 = {
      video: 'yt1',
      title: 'YT One',
      channel: 'Ch',
      avatar: null,
      thumbnail: '',
      duration: '5:00',
      views: '',
      age: '',
      live: false,
    }
    const yt2 = {
      video: 'yt2',
      title: 'YT Two',
      channel: 'Ch',
      avatar: null,
      thumbnail: '',
      duration: '5:00',
      views: '',
      age: '',
      live: false,
    }
    useYouTube.setState({
      current: yt1,
      state: {
        video: 'yt1',
        title: 'YT One',
        author: 'Ch',
        state: 1,
        time: 1,
        duration: 300,
        volume: 100,
        ad: false,
        live: false,
        captions: [],
        caption: null,
        rates: [1],
        rate: 1,
        quality: 'auto',
        qualityLabel: '720p',
        qualities: [],
        audioTracks: [],
        audioTrack: null,
        stableVolume: null,
        voiceBoost: null,
      },
      stateAt: performance.now(),
      upNext: [yt2],
      watched: [{ video: yt1, time: 1, duration: 300 }],
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: 'YT Two' })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: 'YT One' })

    // 9. Apple Music
    clearAll()
    useAppleMusic.setState({
      playback: {
        context: null,
        tracks: [
          {
            id: 'am1',
            name: 'Track One',
            artist: 'A',
            album: '',
            albumId: null,
            artistId: null,
            image: null,
            color: '#000000',
            duration: 180,
            explicit: false,
            number: 1,
          },
        ],
        index: 0,
        playing: true,
        loading: false,
        position: 5,
        at: performance.now(),
        duration: 180,
        preview: false,
        shuffle: false,
        repeat: 'off',
        volume: 0.8,
        direction: 1,
      },
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: null })
    expect(posted).toContainEqual({ type: 'appleMusic', command: { action: 'next' } })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: null })
    expect(posted).toContainEqual({ type: 'appleMusic', command: { action: 'previous' } })

    // 10. Local Player
    clearAll()
    usePlayer.setState({
      songs: [{ file: '01.mp3', title: 'Local One', seconds: 200 }],
      playback: {
        file: '01.mp3',
        playing: true,
        loading: false,
        position: 10,
        duration: 200,
        shuffle: false,
        repeat: 'off',
        volume: 1,
        index: 0,
        count: 2,
        at: performance.now(),
      },
    })
    expect(binds.press('nextTrack')).toEqual({ kind: 'track', direction: 1, title: null })
    expect(posted).toContainEqual({ type: 'player', command: { action: 'next' } })
    expect(binds.press('previousTrack')).toEqual({ kind: 'track', direction: -1, title: null })
    expect(posted).toContainEqual({ type: 'player', command: { action: 'previous' } })

    // 11. Safari is excluded from previous/next track
    clearAll()
    receiveSafariPlaying(true)
    expect(binds.press('nextTrack')).toBeNull()
    expect(binds.press('previousTrack')).toBeNull()

    binds.stop()
  })
})

describe('volume steps', () => {
  it('goes a step at a time, onto the steps, between none and full', () => {
    expect(stepped(0.6, 1)).toBeCloseTo(0.65)
    expect(stepped(0.6000001, -1)).toBeCloseTo(0.55)
    // Between two steps: to the next one that way.
    expect(stepped(0.62, 1)).toBeCloseTo(0.65)
    expect(stepped(0.62, -1)).toBeCloseTo(0.6)
    expect(stepped(1, 1)).toBe(1)
    expect(stepped(0.02, -1)).toBe(0)
    expect(stepped(0, -1)).toBe(0)
  })
})
