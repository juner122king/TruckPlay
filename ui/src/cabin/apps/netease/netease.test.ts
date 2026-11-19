import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backToPlaylists,
  DEFAULT_USER_ARTISTS,
  DEFAULT_USER_PLAYLISTS,
  DEFAULT_USER_RADIOS,
  DISCOVER_CATEGORIES,
  dismissPlaybackNotice,
  getFallbackTracksForPlaylist,
  MOCK_RECOMMENDED_PLAYLISTS,
  play,
  playOrPause,
  receiveAnswer,
  receivePlayback,
  receiveState,
  seek,
  selectArtist,
  selectDiscoverChart,
  selectMyCategory,
  selectPlaylist,
  selectRadio,
  selectTab,
  sendVolume,
  setVolume,
  skip,
  useNetease,
  togglePlayMode,
  toggleLike,
} from './netease'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('netease app store & playlists', () => {
  it('has default user playlists so "我的" is never empty', () => {
    expect(DEFAULT_USER_PLAYLISTS.length).toBeGreaterThan(0)
    expect(DEFAULT_USER_PLAYLISTS[0].name).toBe('我喜欢的音乐')
    expect(useNetease.getState().playlists.length).toBeGreaterThan(0)
  })

  it('selectTab("my") keeps default playlists while loading', () => {
    selectTab('my')
    const state = useNetease.getState()
    expect(state.tab).toBe('my')
    expect(state.playlists.length).toBeGreaterThan(0)
  })

  it('receiveAnswer handles null and empty arrays safely without throwing', () => {
    expect(() => {
      receiveAnswer(1, false, undefined, null, null, null)
      receiveAnswer(2, false, undefined, [], [], null)
      receiveAnswer(3, true, 'Network Error', null, null, null)
    }).not.toThrow()
  })

  it('receiveAnswer falls back to DEFAULT_USER_PLAYLISTS when empty playlists returned on "my" tab', () => {
    selectTab('my')
    receiveAnswer(4, false, undefined, null, [], null)
    const state = useNetease.getState()
    expect(state.playlists.length).toBe(DEFAULT_USER_PLAYLISTS.length)
  })

  it('getFallbackTracksForPlaylist handles user liked and genre playlists', () => {
    const likedTracks = getFallbackTracksForPlaylist({ id: 'user_liked', name: '我喜欢的音乐', trackCount: 10 })
    expect(likedTracks.length).toBeGreaterThan(0)

    const rockTracks = getFallbackTracksForPlaylist({ id: 'rock_1', name: '经典欧美摇滚', trackCount: 50 })
    expect(rockTracks[0].title).toBe('Hotel California')

    const folkTracks = getFallbackTracksForPlaylist({ id: 'folk_1', name: '公路民谣', trackCount: 20 })
    expect(folkTracks[0].title).toBe('漠河舞厅')
  })

  it('has discover secondary categories matching user requested pills', () => {
    expect(DISCOVER_CATEGORIES.length).toBeGreaterThanOrEqual(3)
    expect(DISCOVER_CATEGORIES[0].name).toBe('推荐')
    expect(DISCOVER_CATEGORIES[0].kind).toBe('brand')
    expect(DISCOVER_CATEGORIES[1].name).toBe('官方')
    expect(DISCOVER_CATEGORIES[1].kind).toBe('brand')
    expect(DISCOVER_CATEGORIES[2].name).toBe('华语')
    expect(DISCOVER_CATEGORIES[2].kind).toBe('genre')

    selectDiscoverChart('rock')
    expect(useNetease.getState().tracks[0].title).toBe('Hotel California')

    selectDiscoverChart('folk')
    expect(useNetease.getState().tracks[0].title).toBe('漠河舞厅')
  })

  it('selectPlaylist pre-populates fallback tracks immediately', () => {
    const pl = DEFAULT_USER_PLAYLISTS[1]
    selectPlaylist(pl)
    const state = useNetease.getState()
    expect(state.currentPlaylist?.id).toBe(pl.id)
    expect(state.tracks.length).toBeGreaterThan(0)
  })

  it('DEFAULT_USER_PLAYLISTS each load distinct, non-overlapping tracks', () => {
    const seenIds = new Set<string>()
    for (const pl of DEFAULT_USER_PLAYLISTS) {
      selectPlaylist(pl)
      const tracks = useNetease.getState().tracks
      expect(tracks.length).toBeGreaterThan(0)
      for (const track of tracks) {
        expect(seenIds.has(track.id)).toBe(false)
        seenIds.add(track.id)
      }
    }
  })

  it('MOCK_RECOMMENDED_PLAYLISTS each load distinct, non-overlapping tracks', () => {
    const seenIds = new Set<string>()
    for (const pl of MOCK_RECOMMENDED_PLAYLISTS) {
      selectPlaylist(pl)
      const tracks = useNetease.getState().tracks
      expect(tracks.length).toBeGreaterThan(0)
      for (const track of tracks) {
        expect(seenIds.has(track.id)).toBe(false)
        seenIds.add(track.id)
      }
    }
  })

  it('keeps recommend playlists separate from "我的" playlists when answers arrive across tabs', () => {
    const sent: unknown[] = []
    vi.stubGlobal('window', {
      chrome: {
        webview: {
          postMessage: (msg: unknown) => sent.push(msg),
        },
      },
    })

    selectTab('recommend')
    const recAskId = (sent.at(-1) as { command: { id: number } }).command.id

    selectTab('my')
    const before = useNetease.getState().playlists

    // Late recommend answer arriving after user switched to "my" must not overwrite "我的" playlists
    receiveAnswer(
      recAskId,
      false,
      undefined,
      [{ id: 'r1', title: 'Hot Song', artist: 'Hot Artist' }],
      [{ id: '9001', name: '首页推荐歌单', trackCount: 20 }],
    )

    expect(useNetease.getState().playlists).toEqual(before)
    expect(useNetease.getState().recommendedPlaylists[0]?.id).toBe('9001')
  })

  it('ignores stale playlistTracks responses and deduplicates tracks per playlist in host mode', () => {
    const sent: unknown[] = []
    vi.stubGlobal('window', {
      chrome: {
        webview: {
          postMessage: (msg: unknown) => sent.push(msg),
        },
      },
    })

    selectTab('my')
    const plA = { id: '1001', name: '第一份歌单', trackCount: 2 }
    const plB = { id: '1002', name: '第二份歌单', trackCount: 2 }

    selectPlaylist(plA)
    expect(useNetease.getState().tracks).toEqual([])
    expect(useNetease.getState().loading).toBe(true)
    const askA = (sent.at(-1) as { command: { id: number } }).command.id

    backToPlaylists()
    selectPlaylist(plB)
    const askB = (sent.at(-1) as { command: { id: number; question: { playlistId: string } } }).command

    expect(askB.question.playlistId).toBe('1002')

    // Late response for playlist A must not overwrite playlist B
    receiveAnswer(askA, false, undefined, [{ id: 's1', title: 'Song A1', artist: 'Artist A' }])
    expect(useNetease.getState().tracks).toEqual([])
    expect(useNetease.getState().currentPlaylist?.id).toBe('1002')

    // Response for playlist B arrives with duplicate entries -> deduplicated cleanly
    receiveAnswer(askB.id, false, undefined, [
      { id: 's2', title: 'Song B1', artist: 'Artist B' },
      { id: 's2', title: 'Song B1', artist: 'Artist B' },
      { id: 's3', title: 'Song B2', artist: 'Artist B' },
    ])
    expect(useNetease.getState().loading).toBe(false)
    expect(useNetease.getState().tracks.map((t) => t.id)).toEqual(['s2', 's3'])
  })

  it('auto-skips VIP-restricted tracks to the next playable track instead of stalling paused', () => {
    dismissPlaybackNotice()
    useNetease.setState({ playMode: 'loop', signedIn: false })

    const q = [
      { id: 'vip-1', title: '迷恋', artist: '梅卡德尔', duration: 215, fee: 1, playable: true },
      { id: 'vip-2', title: '海阔天空', artist: 'Beyond', duration: 326, fee: 1, playable: true },
      { id: 'free-3', title: '起风了', artist: '买辣椒也用券', duration: 325, fee: 8, playable: true },
    ]
    play(q[0], q, 0)

    receivePlayback({
      title: '迷恋',
      artist: '梅卡德尔',
      duration: 215,
      position: 0,
      status: 'paused',
      trackId: 'vip-1',
      error: 'vip_required',
    })

    const state = useNetease.getState()
    expect(state.playing).toBe(true)
    expect(state.queue[0].playable).toBe(false)
    expect(state.playback?.trackId).toBe('free-3')
    expect(state.playbackNotice?.reason).toBe('vip_required')
    expect(state.playbackNotice?.skippedTo).toBe('起风了')
  })

  it('pauses cleanly with notice without looping when every track in queue requires VIP', () => {
    dismissPlaybackNotice()
    useNetease.setState({ playMode: 'loop', signedIn: true })
    receiveState(true, false, false)

    const vipOnly = [
      { id: 'vip-a', title: 'VIP曲目A', artist: '歌手A', duration: 200, fee: 1, playable: true },
      { id: 'vip-b', title: 'VIP曲目B', artist: '歌手B', duration: 200, fee: 1, playable: true },
    ]
    play(vipOnly[0], vipOnly, 0)

    receivePlayback({
      title: 'VIP曲目A',
      artist: '歌手A',
      duration: 200,
      position: 0,
      status: 'paused',
      trackId: 'vip-a',
      error: 'vip_required',
    })

    const state = useNetease.getState()
    expect(state.playing).toBe(false)
    expect(state.playback?.status).toBe('paused')
    expect(state.playbackNotice?.reason).toBe('vip_required')
    expect(state.playbackNotice?.skippedTo).toBeUndefined()
  })

  it('advances cleanly when a 30s trial or track emits playback ended', () => {
    dismissPlaybackNotice()
    useNetease.setState({ playMode: 'loop', signedIn: false })

    const q = [
      { id: 'trial-1', title: '试听曲目', artist: '歌手', duration: 30, fee: 1, playable: true },
      { id: 'free-2', title: '正常曲目', artist: '歌手', duration: 240, fee: 8, playable: true },
    ]
    play(q[0], q, 0)

    receivePlayback({
      title: '试听曲目',
      artist: '歌手',
      duration: 30,
      position: 30,
      status: 'paused',
      trackId: 'trial-1',
      error: 'ended',
    })

    const state = useNetease.getState()
    expect(state.playing).toBe(true)
    expect(state.playback?.trackId).toBe('free-2')
  })

  it('toggles play modes and likes correctly', () => {
    const initialMode = useNetease.getState().playMode
    togglePlayMode()
    expect(useNetease.getState().playMode).not.toBe(initialMode)

    const testId = '999999'
    toggleLike(testId)
    expect(useNetease.getState().likedTrackIds).toContain(testId)
    toggleLike(testId)
    expect(useNetease.getState().likedTrackIds).not.toContain(testId)
  })

  it('auto-advances to the next track even when HTML5 audio emits pause before ended', () => {
    const sent: unknown[] = []
    vi.stubGlobal('window', {
      chrome: {
        webview: {
          postMessage: (msg: unknown) => sent.push(msg),
        },
      },
    })
    dismissPlaybackNotice()
    useNetease.setState({ playMode: 'loop', signedIn: true })

    const q = [
      { id: 't-1', title: '第一首', artist: '歌手A', duration: 215, fee: 8, playable: true },
      { id: 't-2', title: '第二首', artist: '歌手B', duration: 240, fee: 8, playable: true },
    ]
    play(q[0], q, 0)

    // Host confirms playback started (which clears playbackPendingTrackId)
    receivePlayback({
      title: '第一首',
      artist: '歌手A',
      duration: 215,
      position: 10,
      status: 'playing',
      trackId: 't-1',
    })
    expect(useNetease.getState().playing).toBe(true)

    sent.length = 0

    // Simulate Chromium firing `pause` right at track end before `ended`
    receivePlayback({
      title: '第一首',
      artist: '歌手A',
      duration: 215,
      position: 215,
      status: 'paused',
      trackId: 't-1',
    })

    receivePlayback({
      title: '第一首',
      artist: '歌手A',
      duration: 215,
      position: 215,
      status: 'paused',
      trackId: 't-1',
      error: 'ended',
    })

    const state = useNetease.getState()
    expect(state.playing).toBe(true)
    expect(state.playback?.trackId).toBe('t-2')
    expect(state.queueIndex).toBe(1)
    expect(sent).toContainEqual({
      type: 'netease',
      command: { action: 'play', track: q[1] },
    })
  })

  it('deduplicates duplicate ended events and ignores stale updates from outgoing tracks', () => {
    dismissPlaybackNotice()
    useNetease.setState({ playMode: 'loop', signedIn: true })

    const q = [
      { id: 's-1', title: 'Track 1', artist: 'Artist', duration: 200, playable: true },
      { id: 's-2', title: 'Track 2', artist: 'Artist', duration: 200, playable: true },
      { id: 's-3', title: 'Track 3', artist: 'Artist', duration: 200, playable: true },
    ]
    play(q[0], q, 0)
    receivePlayback({ title: 'Track 1', artist: 'Artist', duration: 200, position: 1, status: 'playing', trackId: 's-1' })

    // Duplicate ended events for s-1 should only advance once to s-2
    receivePlayback({
      title: 'Track 1',
      artist: 'Artist',
      duration: 200,
      position: 200,
      status: 'paused',
      trackId: 's-1',
      error: 'ended',
    })
    receivePlayback({
      title: 'Track 1',
      artist: 'Artist',
      duration: 200,
      position: 200,
      status: 'paused',
      trackId: 's-1',
      error: 'ended',
    })
    // Stale paused timeupdate from s-1 arriving while s-2 is pending must also be ignored
    receivePlayback({
      title: 'Track 1',
      artist: 'Artist',
      duration: 200,
      position: 199,
      status: 'paused',
      trackId: 's-1',
    })

    const state = useNetease.getState()
    expect(state.playing).toBe(true)
    expect(state.playback?.trackId).toBe('s-2')
    expect(state.queueIndex).toBe(1)
  })

  it('replays current track on natural end in single mode, while manual skip advances normally', () => {
    dismissPlaybackNotice()
    useNetease.setState({ playMode: 'single', signedIn: true })

    const q = [
      { id: 'm-1', title: 'One', artist: 'Artist', duration: 180, playable: true },
      { id: 'm-2', title: 'Two', artist: 'Artist', duration: 190, playable: true },
    ]
    play(q[0], q, 0)
    receivePlayback({ title: 'One', artist: 'Artist', duration: 180, position: 1, status: 'playing', trackId: 'm-1' })

    // Natural track end in single mode replays m-1
    receivePlayback({
      title: 'One',
      artist: 'Artist',
      duration: 180,
      position: 180,
      status: 'paused',
      trackId: 'm-1',
      error: 'ended',
    })
    expect(useNetease.getState().playback?.trackId).toBe('m-1')
    expect(useNetease.getState().playing).toBe(true)

    // Duplicate ended before replay starts is ignored
    receivePlayback({
      title: 'One',
      artist: 'Artist',
      duration: 180,
      position: 180,
      status: 'paused',
      trackId: 'm-1',
      error: 'ended',
    })
    expect(useNetease.getState().playback?.trackId).toBe('m-1')

    // Manual skip(1) still switches to m-2, and skip(-1) goes back to m-1
    skip(1)
    expect(useNetease.getState().playback?.trackId).toBe('m-2')
    expect(useNetease.getState().queueIndex).toBe(1)
    skip(-1)
    expect(useNetease.getState().playback?.trackId).toBe('m-1')
    expect(useNetease.getState().queueIndex).toBe(0)
  })

  it('wraps in loop mode, handles single-track queues, advances in shuffle, and respects manual pause', () => {
    dismissPlaybackNotice()
    useNetease.setState({ playMode: 'loop', signedIn: true })

    const q = [
      { id: 'l-1', title: 'First', artist: 'Artist', duration: 120, playable: true },
      { id: 'l-2', title: 'Last', artist: 'Artist', duration: 120, playable: true },
    ]
    play(q[1], q, 1)
    receivePlayback({ title: 'Last', artist: 'Artist', duration: 120, position: 1, status: 'playing', trackId: 'l-2' })
    receivePlayback({
      title: 'Last',
      artist: 'Artist',
      duration: 120,
      position: 120,
      status: 'paused',
      trackId: 'l-2',
      error: 'ended',
    })
    expect(useNetease.getState().playback?.trackId).toBe('l-1')

    // Single-track queue loops cleanly
    const single = [{ id: 'only-1', title: 'Solo', artist: 'Artist', duration: 90, playable: true }]
    play(single[0], single, 0)
    receivePlayback({ title: 'Solo', artist: 'Artist', duration: 90, position: 1, status: 'playing', trackId: 'only-1' })
    receivePlayback({
      title: 'Solo',
      artist: 'Artist',
      duration: 90,
      position: 90,
      status: 'paused',
      trackId: 'only-1',
      error: 'ended',
    })
    expect(useNetease.getState().playback?.trackId).toBe('only-1')
    expect(useNetease.getState().playing).toBe(true)

    // Shuffle mode picks another playable track
    useNetease.setState({ playMode: 'shuffle', signedIn: true })
    play(q[0], q, 0)
    receivePlayback({ title: 'First', artist: 'Artist', duration: 120, position: 1, status: 'playing', trackId: 'l-1' })
    receivePlayback({
      title: 'First',
      artist: 'Artist',
      duration: 120,
      position: 120,
      status: 'paused',
      trackId: 'l-1',
      error: 'ended',
    })
    expect(useNetease.getState().playback?.trackId).toBe('l-2')

    // Manual pause prevents delayed ended from auto-resuming
    useNetease.setState({ playMode: 'loop', signedIn: true })
    play(q[0], q, 0)
    receivePlayback({ title: 'First', artist: 'Artist', duration: 120, position: 20, status: 'playing', trackId: 'l-1' })
    playOrPause()
    expect(useNetease.getState().playing).toBe(false)
    receivePlayback({
      title: 'First',
      artist: 'Artist',
      duration: 120,
      position: 120,
      status: 'paused',
      trackId: 'l-1',
      error: 'ended',
    })
    expect(useNetease.getState().playing).toBe(false)
    expect(useNetease.getState().playback?.trackId).toBe('l-1')
  })

  it('preserves real userProfile without clobbering active playback on receiveState', () => {
    const q = [{ id: 'p-1', title: 'Song', artist: 'Singer', duration: 180, playable: true }]
    play(q[0], q, 0)

    receiveState(true, false, false, '真实昵称', 'https://p1.music.126.net/avatar.jpg', 11)
    let state = useNetease.getState()
    expect(state.userProfile).toEqual({
      nickname: '真实昵称',
      avatarUrl: 'https://p1.music.126.net/avatar.jpg',
      vipType: 11,
    })
    expect(state.playing).toBe(true)

    receiveState(false, false, false)
    state = useNetease.getState()
    expect(state.userProfile).toBeNull()
    expect(state.playing).toBe(false)
  })

  it('keeps user volume intact when sendVolume is called during fades', () => {
    const sent: unknown[] = []
    vi.stubGlobal('window', {
      chrome: {
        webview: {
          postMessage: (msg: unknown) => sent.push(msg),
        },
      },
    })

    setVolume(0.7)
    expect(useNetease.getState().volume).toBe(0.7)

    sendVolume(0.2)
    expect(useNetease.getState().volume).toBe(0.7)
    expect(sent.at(-1)).toEqual({ type: 'netease', command: { action: 'volume', percent: 20 } })
  })

  it('allows ended to auto-advance again after resuming or seeking a previously ended track', () => {
    dismissPlaybackNotice()
    useNetease.setState({ playMode: 'loop', signedIn: true })

    const q = [
      { id: 'rs-1', title: 'Track 1', artist: 'Artist', duration: 120, playable: true },
      { id: 'rs-2', title: 'Track 2', artist: 'Artist', duration: 120, playable: true },
    ]
    play(q[0], q, 0)
    receivePlayback({ title: 'Track 1', artist: 'Artist', duration: 120, position: 10, status: 'playing', trackId: 'rs-1' })

    // Pause first, then track ends while paused -> stays paused on Track 1
    playOrPause()
    receivePlayback({
      title: 'Track 1',
      artist: 'Artist',
      duration: 120,
      position: 120,
      status: 'paused',
      trackId: 'rs-1',
      error: 'ended',
    })
    expect(useNetease.getState().playback?.trackId).toBe('rs-1')
    expect(useNetease.getState().playing).toBe(false)

    // Resume via seek + playOrPause (clears lastEndedSessionKey)
    seek(100)
    playOrPause()
    receivePlayback({
      title: 'Track 1',
      artist: 'Artist',
      duration: 120,
      position: 120,
      status: 'paused',
      trackId: 'rs-1',
      error: 'ended',
    })
    expect(useNetease.getState().playback?.trackId).toBe('rs-2')
    expect(useNetease.getState().queueIndex).toBe(1)
    expect(useNetease.getState().playing).toBe(true)
  })

  it('supports "电台" and "歌手" sub-tabs in "我的" with preview fallback and detail views', () => {
    selectTab('my')
    selectMyCategory('radio')
    let state = useNetease.getState()
    expect(state.myCategory).toBe('radio')
    expect(state.radios.length).toBe(DEFAULT_USER_RADIOS.length)

    selectRadio(DEFAULT_USER_RADIOS[0])
    state = useNetease.getState()
    expect(state.currentPlaylist?.id).toBe(DEFAULT_USER_RADIOS[0].id)
    expect(state.currentCollectionKind).toBe('radio')
    expect(state.tracks.length).toBeGreaterThan(0)

    backToPlaylists()
    expect(useNetease.getState().currentPlaylist).toBeNull()
    expect(useNetease.getState().currentCollectionKind).toBe('playlist')

    selectMyCategory('artist')
    state = useNetease.getState()
    expect(state.myCategory).toBe('artist')
    expect(state.artists.length).toBe(DEFAULT_USER_ARTISTS.length)

    selectArtist(DEFAULT_USER_ARTISTS[0])
    state = useNetease.getState()
    expect(state.currentPlaylist?.id).toBe(DEFAULT_USER_ARTISTS[0].id)
    expect(state.currentCollectionKind).toBe('artist')
    expect(state.tracks.length).toBeGreaterThan(0)
    backToPlaylists()
  })

  it('updates radios and artists from receiveAnswer and deduplicates by id', () => {
    receiveAnswer(
      901,
      false,
      undefined,
      null,
      null,
      null,
      [
        { id: 'r1', name: '电台A', djName: '主播A', programCount: 10 },
        { id: 'r1', name: '电台A重复', djName: '主播A', programCount: 10 },
        { id: 'r2', name: '电台B', programCount: 5 },
      ],
      [
        { id: 'a1', name: '歌手A', albumSize: 4, musicSize: 30 },
        { id: 'a1', name: '歌手A重复', albumSize: 4, musicSize: 30 },
      ],
    )
    const state = useNetease.getState()
    expect(state.radios).toHaveLength(2)
    expect(state.radios[0].name).toBe('电台A')
    expect(state.artists).toHaveLength(1)
    expect(state.artists[0].name).toBe('歌手A')
  })
})
