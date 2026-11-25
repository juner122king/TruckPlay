import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatPlayCount, normalizeCoverUrl } from './api'
import {
  backToBrowse,
  clearHistory,
  cyclePlaybackSpeed,
  cycleSleepTimer,
  FALLBACK_ALBUMS,
  loadHome,
  pausePlayback,
  play,
  playAlbum,
  playOrPause,
  positionOf,
  receiveAnswer,
  receivePlayback,
  receiveState,
  releaseResource,
  search,
  seek,
  selectAlbum,
  selectMySection,
  selectTab,
  sendVolume,
  setNowPlaying,
  setPlaybackSpeed,
  setSleepTimer,
  skip,
  skipSeconds,
  toggleAlbumOrder,
  toggleFavorite,
  useXimalaya,
} from './ximalaya'

const SAMPLE_TRACKS = [
  {
    id: '101',
    title: '第01集：开篇',
    artist: '喜马主播',
    album: '测试专辑',
    albumId: '70299661',
    duration: 1800,
    episodeNumber: 1,
  },
  {
    id: '102',
    title: '第02集：续篇',
    artist: '喜马主播',
    album: '测试专辑',
    albumId: '70299661',
    duration: 2100,
    episodeNumber: 2,
  },
]

describe('Ximalaya App State, API Helpers & Controls', () => {
  beforeEach(() => {
    vi.useRealTimers()
    useXimalaya.setState(useXimalaya.getInitialState())
  })

  afterEach(() => {
    setSleepTimer(null)
    vi.useRealTimers()
  })

  it('normalizes Ximalaya cover URLs and formats play counts accurately', () => {
    expect(normalizeCoverUrl('storages/abc/test.jpg')).toBe('https://imagev2.xmcdn.com/storages/abc/test.jpg')
    expect(normalizeCoverUrl('//fdfs.xmcdn.com/a.png')).toBe('https://fdfs.xmcdn.com/a.png')
    expect(normalizeCoverUrl('http://imagev2.xmcdn.com/b.jpg')).toBe('https://imagev2.xmcdn.com/b.jpg')
    expect(normalizeCoverUrl('')).toBeUndefined()

    expect(formatPlayCount(156_000_000)).toBe('1.6亿')
    expect(formatPlayCount(258_000)).toBe('25.8万')
    expect(formatPlayCount(820)).toBe('820')
    expect(formatPlayCount(0)).toBeUndefined()
  })

  it('starts with default Discover state and switches tabs cleanly', async () => {
    const state = useXimalaya.getState()
    expect(state.tab).toBe('discover')
    expect(state.playing).toBe(false)
    expect(state.nowPlaying).toBe(false)
    expect(state.playbackSpeed).toBe(1.0)
    expect(state.sleepTimerMode).toBeNull()
    expect(state.volume).toBe(1)
    expect(state.selectedAlbum).toBeNull()

    await loadHome()
    expect(useXimalaya.getState().hotAlbums.length).toBeGreaterThan(0)

    selectTab('categories')
    expect(useXimalaya.getState().tab).toBe('categories')

    selectTab('charts')
    expect(useXimalaya.getState().tab).toBe('charts')

    selectTab('my')
    expect(useXimalaya.getState().tab).toBe('my')
    for (const sec of ['subscribed', 'listened', 'like', 'buy'] as const) {
      selectMySection(sec)
      expect(useXimalaya.getState().mySection).toBe(sec)
    }

    selectTab('discover')
    expect(useXimalaya.getState().tab).toBe('discover')
  })

  it('selects an album, supports order toggling, and returns via backToBrowse', async () => {
    const album = FALLBACK_ALBUMS[0]
    selectAlbum(album)
    await Promise.resolve()
    expect(useXimalaya.getState().selectedAlbum?.id).toBe(album.id)
    expect(useXimalaya.getState().albumTracks.length).toBeGreaterThan(0)
    expect(useXimalaya.getState().albumAsc).toBe(true)

    toggleAlbumOrder()
    await Promise.resolve()
    expect(useXimalaya.getState().albumAsc).toBe(false)

    backToBrowse()
    expect(useXimalaya.getState().selectedAlbum).toBeNull()
    expect(useXimalaya.getState().albumTracks).toEqual([])
  })

  it('plays a track, updates queue, records listening history, and resumes playback controls', () => {
    play(SAMPLE_TRACKS[0], SAMPLE_TRACKS)
    const state = useXimalaya.getState()
    expect(state.playing).toBe(true)
    expect(state.nowPlaying).toBe(true)
    expect(state.playback?.title).toBe(SAMPLE_TRACKS[0].title)
    expect(state.history[0].id).toBe(SAMPLE_TRACKS[0].id)

    playOrPause()
    expect(useXimalaya.getState().playing).toBe(false)
    expect(useXimalaya.getState().playback?.status).toBe('paused')

    playOrPause()
    expect(useXimalaya.getState().playing).toBe(true)
    expect(useXimalaya.getState().playback?.status).toBe('playing')
  })

  it('plays an album and skips episodes forward/backward', async () => {
    await playAlbum(FALLBACK_ALBUMS[1], 0)
    expect(useXimalaya.getState().playing).toBe(true)
    expect(useXimalaya.getState().queue.length).toBeGreaterThan(1)
    const first = useXimalaya.getState().queue[0]
    const second = useXimalaya.getState().queue[1]

    skip(1)
    expect(useXimalaya.getState().queueIndex).toBe(1)
    expect(useXimalaya.getState().playback?.title).toBe(second.title)

    skip(-1)
    expect(useXimalaya.getState().queueIndex).toBe(0)
    expect(useXimalaya.getState().playback?.title).toBe(first.title)
  })

  it('safely handles radio liveQueue skip even when current radioId is missing from queue', () => {
    useXimalaya.setState({
      playing: true,
      liveQueue: [{ id: 'radio-10', radioId: 10, radio: true, title: '节目A', artist: '电台A', duration: 0 }],
      playback: {
        radioId: 999,
        owner: 'radio',
        isLive: true,
        title: '未知节目',
        artist: '未知电台',
        duration: 0,
        position: 0,
        status: 'playing',
        at: 0,
      },
    })
    expect(skip(-1)).toBe(true)
    expect(useXimalaya.getState().playback?.radioId).toBe(10)
    useXimalaya.setState({ liveQueue: [] })
    expect(skip(1)).toBe(false)
  })

  it('seeks to absolute position and skips -15s / +30s accurately', () => {
    play(SAMPLE_TRACKS[0], SAMPLE_TRACKS)
    seek(300)
    expect(useXimalaya.getState().playback?.position).toBeCloseTo(300, 0)

    skipSeconds(30)
    expect(useXimalaya.getState().playback?.position).toBeCloseTo(330, 0)

    skipSeconds(-15)
    expect(useXimalaya.getState().playback?.position).toBeCloseTo(315, 0)
  })

  it('cycles playback speed across 0.75x through 2.0x', () => {
    setPlaybackSpeed(0.75)
    expect(useXimalaya.getState().playbackSpeed).toBe(0.75)
    for (const expected of [1.0, 1.25, 1.5, 1.75, 2.0, 0.75]) {
      cyclePlaybackSpeed()
      expect(useXimalaya.getState().playbackSpeed).toBe(expected)
    }
  })

  it('executes real sleep timer auto-pause and end-of-episode stop', () => {
    vi.useFakeTimers()
    play(SAMPLE_TRACKS[0], SAMPLE_TRACKS)
    expect(useXimalaya.getState().playing).toBe(true)

    setSleepTimer(15)
    expect(useXimalaya.getState().sleepTimerMode).toBe(15)
    expect(useXimalaya.getState().sleepTimerEndsAt).not.toBeNull()

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(useXimalaya.getState().playing).toBe(false)
    expect(useXimalaya.getState().sleepTimerMode).toBeNull()

    // End-of-episode mode stops instead of auto-skipping to next episode
    play(SAMPLE_TRACKS[0], SAMPLE_TRACKS)
    setSleepTimer('episode')
    receivePlayback({
      title: SAMPLE_TRACKS[0].title,
      artist: SAMPLE_TRACKS[0].artist,
      duration: 1800,
      position: 1800,
      status: 'ended',
      owner: 'ximalaya',
    })
    expect(useXimalaya.getState().playing).toBe(false)
    expect(useXimalaya.getState().queueIndex).toBe(0)
    expect(useXimalaya.getState().sleepTimerMode).toBeNull()

    // Cycle order: null -> episode -> 15 -> 30 -> 60 -> null
    for (const mode of ['episode', 15, 30, 60, null] as const) {
      cycleSleepTimer()
      expect(useXimalaya.getState().sleepTimerMode).toBe(mode)
    }
  })

  it('persists resume progress when pausing playback', () => {
    play(SAMPLE_TRACKS[0], SAMPLE_TRACKS)
    seek(245)
    pausePlayback()
    const saved = useXimalaya.getState().progressMap['70299661']
    expect(saved).toBeDefined()
    expect(saved.trackId).toBe('101')
    expect(saved.position).toBeGreaterThanOrEqual(245)
  })

  it('toggles favorites, searches offline fallback, and clears history', async () => {
    const album = FALLBACK_ALBUMS[0]
    useXimalaya.setState({ favorites: [] })
    toggleFavorite(album)
    expect(useXimalaya.getState().favorites.some((f) => f.id === album.id)).toBe(true)

    toggleFavorite(album)
    expect(useXimalaya.getState().favorites.some((f) => f.id === album.id)).toBe(false)

    await search('三体')
    expect(useXimalaya.getState().searchQuery).toBe('三体')
    expect(useXimalaya.getState().searchAlbums.length).toBeGreaterThan(0)
    expect(useXimalaya.getState().searchTracks.length).toBeGreaterThan(0)

    play(SAMPLE_TRACKS[0], SAMPLE_TRACKS)
    expect(useXimalaya.getState().history.length).toBeGreaterThan(0)
    clearHistory()
    expect(useXimalaya.getState().history).toEqual([])
  })

  it('handles host state/answer/playback reports and preserves preferences on releaseResource', () => {
    receiveState(true, true, false)
    expect(useXimalaya.getState().signedIn).toBe(true)
    expect(useXimalaya.getState().playing).toBe(true)

    receiveAnswer(1, { albums: [FALLBACK_ALBUMS[0]] })
    expect(useXimalaya.getState().hotAlbums).toEqual([FALLBACK_ALBUMS[0]])

    receivePlayback({
      title: '定制节目',
      artist: '喜马主播',
      duration: 2000,
      position: 120,
      status: 'playing',
      owner: 'ximalaya',
    })
    expect(useXimalaya.getState().playback?.title).toBe('定制节目')
    expect(useXimalaya.getState().playing).toBe(true)

    sendVolume(0.75)
    setPlaybackSpeed(1.5)
    setNowPlaying(true)

    releaseResource()
    const after = useXimalaya.getState()
    expect(after.signedIn).toBe(true)
    expect(after.volume).toBe(0.75)
    expect(after.playbackSpeed).toBe(1.5)
    expect(after.nowPlaying).toBe(false)
  })

  it('calculates positionOf accurately considering playback speed', () => {
    const now = performance.now()
    const pos = positionOf(
      {
        title: '测试',
        artist: '主播',
        duration: 1000,
        position: 100,
        status: 'playing',
        at: now - 10_000,
        speed: 1.5,
      },
      now,
    )
    expect(pos).toBeCloseTo(115, 0)
  })
})
