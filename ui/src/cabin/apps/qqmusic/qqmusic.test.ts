import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backToPlaylists,
  DEFAULT_USER_ARTISTS,
  DEFAULT_USER_PLAYLISTS,
  DISCOVER_CATEGORIES,
  dismissPlaybackNotice,
  formatPlaybackNotice,
  getFallbackTracksForPlaylist,
  MOCK_LYRICS_LRC,
  MOCK_RADIOS,
  MOCK_RECOMMENDED_PLAYLISTS,
  parseLrc,
  play,
  receiveAnswer,
  receivePlayback,
  receiveState,
  releaseResource,
  requestLyrics,
  selectDiscoverChart,
  selectMyCategory,
  selectPlaylist,
  selectRadio,
  selectTab,
  sendVolume,
  setVolume,
  skip,
  toggleLike,
  togglePlayMode,
  useQqmusic,
} from './qqmusic'

afterEach(() => {
  vi.unstubAllGlobals()
  dismissPlaybackNotice()
})

function stubHostWindow() {
  const sent: unknown[] = []
  vi.stubGlobal('window', {
    chrome: {
      webview: {
        postMessage: (msg: unknown) => sent.push(msg),
      },
    },
  })
  return sent
}

describe('qqmusic app store, lyrics & playback', () => {
  it('provides default playlists, radios, artists and discover categories', () => {
    expect(DEFAULT_USER_PLAYLISTS.length).toBeGreaterThan(0)
    expect(DEFAULT_USER_PLAYLISTS[0].name).toBe('我喜欢')
    expect(MOCK_RADIOS.length).toBeGreaterThan(0)
    expect(DEFAULT_USER_ARTISTS.length).toBeGreaterThan(0)
    expect(DISCOVER_CATEGORIES.length).toBeGreaterThanOrEqual(4)
    expect(DISCOVER_CATEGORIES[0].id).toBe('26')
    expect(MOCK_RECOMMENDED_PLAYLISTS.length).toBeGreaterThan(0)
  })

  it('parses synced LRC timestamps, multi-timestamps, HTML entities, stanzas and plain fallback', () => {
    const parsed = parseLrc(
      [
        '[ti:晴天]',
        '[ar:周杰伦]',
        '[00:01.50]故事的小黄花 &amp; 晴天',
        '[00:05.00][00:20.00]从出生那年就飘着',
        '[00:35.250]刮风这天我试过握着你手 &apos;yeah&apos;',
      ].join('\n'),
    )
    expect(parsed.synced).toBe(true)
    expect(parsed.lines).toHaveLength(4)
    expect(parsed.lines[0]).toMatchObject({ start: 1.5, end: 5, text: '故事的小黄花 & 晴天' })
    expect(parsed.lines[1]).toMatchObject({ start: 5, end: 20, text: '从出生那年就飘着' })
    expect(parsed.lines[2]).toMatchObject({ start: 20, end: 35.25, text: '从出生那年就飘着', stanza: true })
    expect(parsed.lines[3]).toMatchObject({
      start: 35.25,
      end: 0,
      text: "刮风这天我试过握着你手 'yeah'",
      stanza: true,
    })

    const plain = parseLrc('第一行纯文本\n第二行纯文本')
    expect(plain.synced).toBe(false)
    expect(plain.lines.map((l) => l.text)).toEqual(['第一行纯文本', '第二行纯文本'])

    expect(parseLrc('')).toEqual({ synced: false, lines: [] })
    expect(parseLrc(MOCK_LYRICS_LRC).synced).toBe(true)
  })

  it('updates green diamond profile and clears VIP locks when signing in', () => {
    useQqmusic.setState({
      signedIn: false,
      tracks: [{ id: 'mid-vip', title: 'VIP曲目', artist: '歌手', payPlay: 1, playable: false }],
      queue: [{ id: 'mid-vip', title: 'VIP曲目', artist: '歌手', payPlay: 1, playable: false }],
      playbackNotice: { trackId: 'mid-vip', title: 'VIP曲目', reason: 'login_required' },
    })

    receiveState(true, false, false, '测试司机', 'https://example.com/avatar.jpg', 2)
    const state = useQqmusic.getState()
    expect(state.signedIn).toBe(true)
    expect(state.userProfile).toEqual({
      nickname: '测试司机',
      avatarUrl: 'https://example.com/avatar.jpg',
      vipType: 2,
    })
    expect(state.tracks[0].playable).toBe(true)
    expect(state.queue[0].playable).toBe(true)
    expect(state.playbackNotice).toBeNull()

    receiveState(false, false, false)
    expect(useQqmusic.getState().signedIn).toBe(false)
    expect(useQqmusic.getState().userProfile).toBeNull()
  })

  it('isolates recommend, my, radio, discover and playlistTracks asks across tab switches', () => {
    const sent = stubHostWindow()

    selectTab('recommend')
    const recAskId = (sent.at(-1) as { command: { id: number } }).command.id

    selectTab('my')
    const beforePlaylists = useQqmusic.getState().playlists

    receiveAnswer(
      recAskId,
      false,
      undefined,
      [{ id: 'r-mid-1', title: '推荐歌曲', artist: '推荐歌手' }],
      [{ id: 'rec-pl-1', name: '官方推荐歌单', trackCount: 25 }],
    )
    expect(useQqmusic.getState().playlists).toEqual(beforePlaylists)
    expect(useQqmusic.getState().recommendedPlaylists[0]?.id).toBe('rec-pl-1')

    const plA = { id: '10001', name: '歌单A', trackCount: 2 }
    const plB = { id: '10002', name: '歌单B', trackCount: 2 }
    selectPlaylist(plA)
    const askA = (sent.at(-1) as { command: { id: number } }).command.id
    backToPlaylists()
    selectPlaylist(plB)
    const askB = (sent.at(-1) as { command: { id: number; question: { playlistId: string } } }).command

    expect(askB.question.playlistId).toBe('10002')

    // Late playlist A response must be ignored
    receiveAnswer(askA, false, undefined, [{ id: 'a1', title: 'A Song', artist: 'A' }])
    expect(useQqmusic.getState().tracks).toEqual([])
    expect(useQqmusic.getState().currentPlaylist?.id).toBe('10002')

    // Playlist B response deduplicates songs cleanly
    receiveAnswer(askB.id, false, undefined, [
      { id: 'b1', title: 'B1', artist: 'B' },
      { id: 'b1', title: 'B1', artist: 'B' },
      { id: 'b2', title: 'B2', artist: 'B' },
    ])
    expect(useQqmusic.getState().tracks.map((t) => t.id)).toEqual(['b1', 'b2'])
    expect(useQqmusic.getState().loading).toBe(false)
  })

  it('requests and receives synced lyrics in host mode and ignores stale lyric replies', () => {
    const sent = stubHostWindow()
    requestLyrics('mid-first', '101')
    const ask1 = (sent.at(-1) as { command: { id: number; question: { ask: string; id: string; songId?: string } } })
      .command
    expect(ask1.question).toEqual({ ask: 'lyrics', id: 'mid-first', songId: '101' })

    requestLyrics('mid-second', '102')
    const ask2 = (sent.at(-1) as { command: { id: number } }).command.id

    // Stale reply for first song should be ignored
    receiveAnswer(ask1.id, false, undefined, null, null, '[00:01.00]旧歌词')
    expect(useQqmusic.getState().lyrics).toBeNull()
    expect(useQqmusic.getState().lyricsLoading).toBe(true)

    // Latest reply populates lyrics
    receiveAnswer(ask2, false, undefined, null, null, '[00:02.00]新歌词第一行\n[00:06.00]新歌词第二行')
    const state = useQqmusic.getState()
    expect(state.lyricsLoading).toBe(false)
    expect(state.lyricsTrackId).toBe('mid-second')
    expect(state.lyrics?.synced).toBe(true)
    expect(state.lyrics?.lines.map((l) => l.text)).toEqual(['新歌词第一行', '新歌词第二行'])
  })

  it('pauses with persistent login_required banner without marking tracks unplayable', () => {
    useQqmusic.setState({ playMode: 'loop', signedIn: false })
    const q = [
      { id: 'm1', title: '晴天', artist: '周杰伦', duration: 269, playable: true },
      { id: 'm2', title: '起风了', artist: '买辣椒也用券', duration: 325, playable: true },
    ]
    play(q[0], q, 0)

    receivePlayback({
      title: '晴天',
      artist: '周杰伦',
      duration: 269,
      position: 0,
      status: 'paused',
      trackId: 'm1',
      error: 'login_required',
    })

    const state = useQqmusic.getState()
    expect(state.playing).toBe(false)
    expect(state.playback?.status).toBe('paused')
    expect(state.queue[0].playable).toBe(true)
    expect(state.playbackNotice).toMatchObject({ trackId: 'm1', reason: 'login_required' })
    expect(formatPlaybackNotice(state.playbackNotice!)).toContain('扫码登录')
  })

  it('marks vip_required track unplayable and auto-skips to next playable song', () => {
    useQqmusic.setState({ playMode: 'loop', signedIn: true })
    const q = [
      { id: 'vip-1', title: '绿钻专享A', artist: '歌手A', duration: 210, payPlay: 1, playable: true },
      { id: 'vip-2', title: '绿钻专享B', artist: '歌手B', duration: 220, payPlay: 1, playable: true },
      { id: 'free-3', title: '免费好歌', artist: '歌手C', duration: 240, payPlay: 0, playable: true },
    ]
    play(q[0], q, 0)

    receivePlayback({
      title: '绿钻专享A',
      artist: '歌手A',
      duration: 210,
      position: 0,
      status: 'paused',
      trackId: 'vip-1',
      error: 'vip_required',
    })

    const state = useQqmusic.getState()
    expect(state.playing).toBe(true)
    expect(state.queue[0].playable).toBe(false)
    expect(state.playback?.trackId).toBe('free-3')
    expect(state.playbackNotice).toMatchObject({
      trackId: 'vip-1',
      reason: 'vip_required',
      skippedTo: '免费好歌',
    })
  })

  it('auto-advances cleanly on playback ended in loop, single and shuffle modes', () => {
    useQqmusic.setState({ playMode: 'loop', signedIn: true })
    const q = [
      { id: 't1', title: '第一首', artist: '歌手', duration: 200, playable: true },
      { id: 't2', title: '第二首', artist: '歌手', duration: 210, playable: true },
    ]
    play(q[0], q, 0)

    receivePlayback({
      title: '第一首',
      artist: '歌手',
      duration: 200,
      position: 200,
      status: 'paused',
      trackId: 't1',
      error: 'ended',
    })
    expect(useQqmusic.getState().playback?.trackId).toBe('t2')
    expect(useQqmusic.getState().playing).toBe(true)

    // Single repeat replays current track
    useQqmusic.setState({ playMode: 'single' })
    receivePlayback({
      title: '第二首',
      artist: '歌手',
      duration: 210,
      position: 210,
      status: 'paused',
      trackId: 't2',
      error: 'ended',
    })
    expect(useQqmusic.getState().playback?.trackId).toBe('t2')
    expect(useQqmusic.getState().playing).toBe(true)
  })

  it('supports radio selection, discover charts, likes, modes, volume and resource release', () => {
    selectDiscoverChart('62')
    expect(useQqmusic.getState().discoverChartId).toBe('62')

    selectMyCategory('artist')
    expect(useQqmusic.getState().myCategory).toBe('artist')

    selectRadio(MOCK_RADIOS[0])
    expect(useQqmusic.getState().currentCollectionKind).toBe('radio')
    expect(useQqmusic.getState().tracks.length).toBeGreaterThan(0)

    const fallback = getFallbackTracksForPlaylist(DEFAULT_USER_PLAYLISTS[0])
    expect(fallback.length).toBeGreaterThan(0)

    const modeBefore = useQqmusic.getState().playMode
    togglePlayMode()
    expect(useQqmusic.getState().playMode).not.toBe(modeBefore)

    toggleLike('custom-mid')
    expect(useQqmusic.getState().likedTrackIds).toContain('custom-mid')
    toggleLike('custom-mid')
    expect(useQqmusic.getState().likedTrackIds).not.toContain('custom-mid')

    const sent = stubHostWindow()
    setVolume(0.4)
    sendVolume(0.25)
    expect(sent.at(-1)).toEqual({ type: 'qqmusic', command: { action: 'volume', percent: 25 } })

    skip(1)
    useQqmusic.setState({ signedIn: true, userProfile: { nickname: '司机A' } })
    releaseResource()
    const released = useQqmusic.getState()
    expect(released.playing).toBe(false)
    expect(released.playback).toBeNull()
    expect(released.lyrics).toBeNull()
    expect(released.queue).toEqual([])
    expect(released.signedIn).toBe(true)
    expect(released.userProfile?.nickname).toBe('司机A')
  })
})
