import { beforeEach, describe, expect, it } from 'vitest'
import {
  backToBrowse,
  clearHistory,
  cyclePlaybackSpeed,
  getAudioUrlForCategory,
  getAudioUrlForTrack,
  MOCK_ALBUM_TRACKS_MAP,
  MOCK_FEATURED_ALBUMS,
  MOCK_RECOMMENDED_TRACKS,
  MOCK_XIANGSHENG_ALBUMS,
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
  selectTab,
  sendVolume,
  setNowPlaying,
  setPlaybackSpeed,
  setQueueOpen,
  setSleepTimer,
  skip,
  skipSeconds,
  toggleFavorite,
  useXimalaya,
} from './ximalaya'

describe('Ximalaya App State & Controls', () => {
  beforeEach(() => {
    useXimalaya.setState(useXimalaya.getInitialState())
  })

  it('starts with default initial state and catalogs', () => {
    const state = useXimalaya.getState()
    expect(state.tab).toBe('featured')
    expect(state.playing).toBe(false)
    expect(state.nowPlaying).toBe(false)
    expect(state.playbackSpeed).toBe(1.0)
    expect(state.volume).toBe(1)
    expect(state.selectedAlbum).toBeNull()
  })

  it('switches navigation tabs and updates album catalog', () => {
    selectTab('xiangsheng')
    expect(useXimalaya.getState().tab).toBe('xiangsheng')
    expect(useXimalaya.getState().albums).toEqual(MOCK_XIANGSHENG_ALBUMS)

    selectTab('story')
    expect(useXimalaya.getState().tab).toBe('story')
    expect(useXimalaya.getState().albums.length).toBeGreaterThan(0)

    selectTab('radio')
    expect(useXimalaya.getState().tab).toBe('radio')
    expect(useXimalaya.getState().albums.length).toBeGreaterThan(0)

    selectTab('featured')
    expect(useXimalaya.getState().tab).toBe('featured')
    expect(useXimalaya.getState().albums).toEqual(MOCK_FEATURED_ALBUMS)
  })

  it('selects an album and loads its episodes, then returns with backToBrowse', () => {
    const album = MOCK_FEATURED_ALBUMS[0]
    selectAlbum(album)
    const state = useXimalaya.getState()
    expect(state.selectedAlbum).toBe(album)
    expect(state.albumTracks.length).toBeGreaterThan(0)
    expect(state.albumTracks[0].title).toContain('红岸基地')
    expect(state.albumTracks[0].album).toContain('三体')

    backToBrowse()
    expect(useXimalaya.getState().selectedAlbum).toBeNull()
    expect(useXimalaya.getState().albumTracks).toEqual([])
  })

  it('plays a track, updates queue, and records in listening history', () => {
    const track = MOCK_RECOMMENDED_TRACKS[0]
    play(track)
    const state = useXimalaya.getState()
    expect(state.playing).toBe(true)
    expect(state.nowPlaying).toBe(true)
    expect(state.playback?.title).toBe(track.title)
    expect(state.history[0].id).toBe(track.id)
  })

  it('plays an entire album and queues its episodes', () => {
    const album = MOCK_FEATURED_ALBUMS[1]
    playAlbum(album, 0)
    const state = useXimalaya.getState()
    expect(state.playing).toBe(true)
    expect(state.selectedAlbum).toBe(album)
    expect(state.playback?.artist).toContain('郭德纲')
    expect(state.queue.length).toBeGreaterThan(0)
  })

  it('toggles play/pause state correctly', () => {
    const track = MOCK_RECOMMENDED_TRACKS[0]
    play(track)
    expect(useXimalaya.getState().playing).toBe(true)

    playOrPause()
    expect(useXimalaya.getState().playing).toBe(false)
    expect(useXimalaya.getState().playback?.status).toBe('paused')

    playOrPause()
    expect(useXimalaya.getState().playing).toBe(true)
    expect(useXimalaya.getState().playback?.status).toBe('playing')
  })

  it('skips to next and previous track in the queue', () => {
    const tracks = MOCK_RECOMMENDED_TRACKS
    play(tracks[0], tracks)
    expect(useXimalaya.getState().queueIndex).toBe(0)

    skip(1)
    expect(useXimalaya.getState().queueIndex).toBe(1)
    expect(useXimalaya.getState().playback?.title).toBe(tracks[1].title)

    skip(-1)
    expect(useXimalaya.getState().queueIndex).toBe(0)
    expect(useXimalaya.getState().playback?.title).toBe(tracks[0].title)
  })

  it('seeks to absolute position and skips relative seconds (-15s / +30s)', () => {
    const track = { ...MOCK_RECOMMENDED_TRACKS[0], duration: 1800 }
    play(track)

    seek(300)
    expect(useXimalaya.getState().playback?.position).toBeCloseTo(300, 0)

    // Skip forward +30s
    skipSeconds(30)
    expect(useXimalaya.getState().playback?.position).toBeCloseTo(330, 0)

    // Skip backward -15s
    skipSeconds(-15)
    expect(useXimalaya.getState().playback?.position).toBeCloseTo(315, 0)
  })

  it('cycles playback speed between 1.0x, 1.25x, 1.5x, 1.75x, and 2.0x', () => {
    setPlaybackSpeed(1.0)
    expect(useXimalaya.getState().playbackSpeed).toBe(1.0)

    cyclePlaybackSpeed()
    expect(useXimalaya.getState().playbackSpeed).toBe(1.25)

    cyclePlaybackSpeed()
    expect(useXimalaya.getState().playbackSpeed).toBe(1.5)

    cyclePlaybackSpeed()
    expect(useXimalaya.getState().playbackSpeed).toBe(1.75)

    cyclePlaybackSpeed()
    expect(useXimalaya.getState().playbackSpeed).toBe(2.0)

    cyclePlaybackSpeed()
    expect(useXimalaya.getState().playbackSpeed).toBe(1.0)
  })

  it('sets and updates sleep timer', () => {
    setSleepTimer(30)
    const state = useXimalaya.getState()
    expect(state.sleepTimerMinutes).toBe(30)
    expect(state.sleepTimerEndsAt).toBeGreaterThan(Date.now())

    setSleepTimer(null)
    expect(useXimalaya.getState().sleepTimerMinutes).toBeNull()
    expect(useXimalaya.getState().sleepTimerEndsAt).toBeNull()
  })

  it('updates volume', () => {
    sendVolume(0.75)
    expect(useXimalaya.getState().volume).toBe(0.75)
  })

  it('toggles favorites and clears history', () => {
    const album = MOCK_FEATURED_ALBUMS[0]
    useXimalaya.setState({ favorites: [] })
    toggleFavorite(album)
    expect(useXimalaya.getState().favorites.some((f) => f.id === album.id)).toBe(true)

    toggleFavorite(album)
    expect(useXimalaya.getState().favorites.some((f) => f.id === album.id)).toBe(false)

    play(MOCK_RECOMMENDED_TRACKS[0])
    expect(useXimalaya.getState().history.length).toBeGreaterThan(0)
    clearHistory()
    expect(useXimalaya.getState().history).toEqual([])
  })

  it('searches for keywords and matches episodes/albums', () => {
    selectTab('search')
    search('三体')
    const state = useXimalaya.getState()
    expect(state.searchQuery).toBe('三体')
    expect(state.searchResults.length).toBeGreaterThan(0)
    expect(state.searchResults.some((r) => r.title.includes('三体'))).toBe(true)
  })

  it('receives state, answer, and playback updates from host', () => {
    receiveState(true, true, false)
    expect(useXimalaya.getState().signedIn).toBe(true)
    expect(useXimalaya.getState().playing).toBe(true)
    expect(useXimalaya.getState().signingIn).toBe(false)

    receiveAnswer(1, false, undefined, undefined, [MOCK_FEATURED_ALBUMS[0]])
    expect(useXimalaya.getState().albums).toEqual([MOCK_FEATURED_ALBUMS[0]])

    receivePlayback({
      title: '定制节目',
      artist: '喜马主播',
      duration: 2000,
      position: 120,
      status: 'playing',
    })
    expect(useXimalaya.getState().playback?.title).toBe('定制节目')
    expect(useXimalaya.getState().playing).toBe(true)
  })

  it('releases resources while preserving session preferences', () => {
    receiveState(true, false, false)
    sendVolume(0.8)
    setPlaybackSpeed(1.5)
    setNowPlaying(true)
    setQueueOpen(true)

    releaseResource()
    const state = useXimalaya.getState()
    expect(state.signedIn).toBe(true)
    expect(state.volume).toBe(0.8)
    expect(state.playbackSpeed).toBe(1.5)
    expect(state.nowPlaying).toBe(false)
    expect(state.queueOpen).toBe(false)
  })

  it('calculates positionOf accurately considering speed', () => {
    const now = performance.now()
    const playback = {
      title: '测试',
      artist: '主播',
      duration: 1000,
      position: 100,
      status: 'playing',
      at: now - 10000, // 10 seconds ago
      speed: 1.5,
    }
    const pos = positionOf(playback, now)
    // 100 + (10 * 1.5) = 115
    expect(pos).toBeCloseTo(115, 0)
  })

  it('assigns genre-appropriate, distinct audio stream URLs across different programs', () => {
    const scifiUrl = getAudioUrlForCategory('科幻有声剧', 0)
    const xiangshengUrl = getAudioUrlForCategory('相声名作', 0)
    const pingshuUrl = getAudioUrlForCategory('经典评书', 0)
    const djUrl = getAudioUrlForCategory('车载DJ', 0)
    const relaxUrl = getAudioUrlForCategory('治愈音乐', 0)

    // Verify all genre streams are distinct
    const distinctUrls = new Set([scifiUrl, xiangshengUrl, pingshuUrl, djUrl, relaxUrl])
    expect(distinctUrls.size).toBe(5)

    // Verify tracks from different albums play distinct sounds
    const santiTrack = MOCK_ALBUM_TRACKS_MAP['xm-feat-1'][0]
    const guoTrack = MOCK_ALBUM_TRACKS_MAP['xm-feat-2'][0]
    const djTrack = MOCK_ALBUM_TRACKS_MAP['xm-rd-3'][0]

    expect(santiTrack.url).not.toBe(guoTrack.url)
    expect(guoTrack.url).not.toBe(djTrack.url)
    expect(getAudioUrlForTrack(santiTrack)).not.toBe(getAudioUrlForTrack(guoTrack))
  })
})
