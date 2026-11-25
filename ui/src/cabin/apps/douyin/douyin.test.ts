import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DouyinVideo, PageMessage } from '../../../shared/host'
import { oneAtATime } from '../oneAtATime'
import { douyinPlayer } from './pauseWithGame'
import {
  applyFadeVolume,
  ask,
  clearHistory,
  closePlayer,
  enterDouyin,
  formatClock,
  formatCount,
  getDisplayedList,
  getFeedSlice,
  MOCK_DOUYIN_VIDEOS,
  openPlayer,
  play,
  playFromList,
  playFromQueueIndex,
  playOrPause,
  positionOf,
  queueSourceLabel,
  receiveAnswer,
  receivePlayback,
  receiveState,
  refreshFeed,
  releaseResource,
  search,
  selectChannel,
  selectTab,
  sendVolume,
  setRate,
  skip,
  toggleAutoScroll,
  toggleCollect,
  toggleCrop,
  toggleLike,
  useDouyin,
} from './douyin'

function makeVideo(id: string, title = `Video ${id}`, channel = 'recommend'): DouyinVideo {
  return {
    id,
    title,
    author: `Author ${id}`,
    duration: 45,
    channel,
  }
}

describe('douyin store, tabs, queue, and lifecycle', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    useDouyin.setState(useDouyin.getInitialState(), true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('formats durations and Chinese view/like counts', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(94)).toBe('1:34')
    expect(formatClock(3665)).toBe('1:01:05')
    expect(formatCount(850)).toBe('850')
    expect(formatCount(2400)).toBe('2.4k')
    expect(formatCount(45200)).toBe('4.5万')
    expect(formatCount(120000000)).toBe('1.2亿')
  })

  it('interpolates playback position according to status and playback rate', () => {
    const base = {
      id: 'dy_01',
      title: 'Test',
      artist: 'Author',
      duration: 60,
      position: 10,
      status: 'playing',
      rate: 1.5,
      at: 1000,
    }
    expect(positionOf(base, 5000)).toBeCloseTo(16, 4)
    expect(positionOf({ ...base, status: 'paused' }, 5000)).toBe(10)
    expect(positionOf(base, 999999)).toBe(60)
  })

  it('plays videos, records watch history, and toggles play/pause & fullscreen theater', () => {
    const target = MOCK_DOUYIN_VIDEOS[1]
    play(target, 1, false)
    const s = useDouyin.getState()
    expect(s.playing).toBe(true)
    expect(s.current?.id).toBe(target.id)
    expect(s.queue?.index).toBe(1)
    expect(s.queue?.source).toBe('recommend')
    expect(s.open).toBe(false)
    expect(s.watchedHistory[0]?.id).toBe(target.id)

    openPlayer(true)
    expect(useDouyin.getState().open).toBe(true)

    playOrPause()
    expect(useDouyin.getState().playing).toBe(false)
    expect(useDouyin.getState().userPaused).toBe(true)

    closePlayer()
    expect(useDouyin.getState().open).toBe(false)

    clearHistory()
    expect(useDouyin.getState().watchedHistory).toEqual([])
  })

  it('decouples browsed tab caches from the active playback queue', async () => {
    const recList = [makeVideo('r1', 'Rec 1', 'recommend'), makeVideo('r2', 'Rec 2', 'recommend')]
    const foodList = [makeVideo('f1', 'Food 1', 'food'), makeVideo('f2', 'Food 2', 'food')]
    receiveAnswer(0, false, undefined, recList, 'recommend')
    receiveAnswer(0, false, undefined, foodList, 'food')

    // Start playing from recommend
    playFromList('recommend', recList, 0)
    expect(useDouyin.getState().queue?.source).toBe('recommend')
    expect(useDouyin.getState().queue?.items.map((v) => v.id)).toEqual(['r1', 'r2'])

    // Browse channels -> food and search; neither overwrites recommend cache nor changes playback queue
    selectChannel('food')
    expect(getDisplayedList(useDouyin.getState()).map((v) => v.id)).toEqual(['f1', 'f2'])
    expect(getFeedSlice(useDouyin.getState(), 'recommend').items.map((v) => v.id)).toEqual(['r1', 'r2'])
    expect(useDouyin.getState().queue?.source).toBe('recommend')
    expect(useDouyin.getState().current?.id).toBe('r1')

    // Skipping moves along the active recommend queue, NOT the browsed food tab
    skip(1)
    expect(useDouyin.getState().current?.id).toBe('r2')
    expect(useDouyin.getState().queue?.index).toBe(1)

    // Switching back to recommend immediately shows cached list without wiping
    selectTab('recommend')
    expect(getDisplayedList(useDouyin.getState()).map((v) => v.id)).toEqual(['r1', 'r2'])
  })

  it('plays from search, liked, or history lists with matching queue source and smooth loop fallback', async () => {
    const posted: PageMessage[] = []
    vi.stubGlobal('window', { chrome: { webview: { postMessage: (m: PageMessage) => posted.push(m) } } })

    const likedList = [makeVideo('l1', 'Liked 1'), makeVideo('l2', 'Liked 2')]
    playFromList('liked', likedList, 0, { openFullscreen: false })
    expect(useDouyin.getState().queue?.source).toBe('liked')
    expect(useDouyin.getState().queue?.boundToFeed).toBe(false)
    expect(queueSourceLabel(useDouyin.getState().queue, true)).toBe('我赞过的')
    expect(posted).toContainEqual({
      type: 'douyin',
      command: {
        action: 'play',
        video: likedList[0],
        index: 0,
        source: 'liked',
        queueIds: ['l1', 'l2'],
      },
    })

    // Step to last item, then hit end-of-queue fallback -> loops smoothly to index 0
    skip(1)
    expect(useDouyin.getState().queue?.index).toBe(1)
    expect(useDouyin.getState().current?.id).toBe('l2')
    skip(1)
    expect(useDouyin.getState().queue?.index).toBe(0)
    expect(useDouyin.getState().current?.id).toBe('l1')

    // Single-item finite list replays cleanly on next
    const single = [makeVideo('s1', 'Only Search Result')]
    playFromList('search', single, 0, { label: '川藏线' })
    expect(queueSourceLabel(useDouyin.getState().queue, true)).toBe('搜索 · 川藏线')
    posted.length = 0
    skip(1)
    expect(useDouyin.getState().current?.id).toBe('s1')
    expect(posted).toContainEqual({ type: 'douyin', command: { action: 'seek', seconds: 0 } })
  })

  it('detaches queue on manual refresh without interrupting playback and hands off to fresh batch at queue end', () => {
    const posted: PageMessage[] = []
    vi.stubGlobal('window', { chrome: { webview: { postMessage: (m: PageMessage) => posted.push(m) } } })

    const batch1 = [makeVideo('b1', 'Batch 1-1'), makeVideo('b2', 'Batch 1-2')]
    const batch2 = [makeVideo('n1', 'Batch 2-1'), makeVideo('n2', 'Batch 2-2')]
    receiveAnswer(0, false, undefined, batch1, 'recommend')
    playFromList('recommend', batch1, 1)
    expect(useDouyin.getState().queue?.boundToFeed).toBe(true)

    // User taps Refresh while playing recommend: detaches active queue, keeps playing b2
    refreshFeed()
    expect(useDouyin.getState().queue?.boundToFeed).toBe(false)
    expect(useDouyin.getState().current?.id).toBe('b2')
    expect(useDouyin.getState().queue?.items.map((v) => v.id)).toEqual(['b1', 'b2'])
    expect(posted).toContainEqual({ type: 'douyin', command: { action: 'refresh', channel: 'recommend' } })

    // New batch arrives for recommend: updates right-side tab feed, does NOT overwrite detached queue
    receiveAnswer(0, false, undefined, batch2, 'recommend')
    expect(getFeedSlice(useDouyin.getState(), 'recommend').items.map((v) => v.id)).toEqual(['n1', 'n2'])
    expect(useDouyin.getState().queue?.items.map((v) => v.id)).toEqual(['b1', 'b2'])

    // Reaching end of detached queue seamlessly hands off to fresh batch and re-binds!
    posted.length = 0
    skip(1)
    expect(useDouyin.getState().current?.id).toBe('n1')
    expect(useDouyin.getState().queue?.boundToFeed).toBe(true)
    expect(useDouyin.getState().queue?.items.map((v) => v.id)).toEqual(['n1', 'n2'])
    expect(posted).toContainEqual({
      type: 'douyin',
      command: {
        action: 'play',
        video: batch2[0],
        index: 0,
        source: 'recommend',
        queueIds: ['n1', 'n2'],
      },
    })
  })

  it('appends passive feed updates to bound queue and waits for host fallback at bound feed end', () => {
    const posted: PageMessage[] = []
    vi.stubGlobal('window', { chrome: { webview: { postMessage: (m: PageMessage) => posted.push(m) } } })

    const initial = [makeVideo('v1'), makeVideo('v2')]
    receiveAnswer(0, false, undefined, initial, 'recommend')
    playFromList('recommend', initial, 1)

    // At end of bound feed in host mode, skip(1) enters buffering and delegates fallback fetch/loop to host
    posted.length = 0
    skip(1)
    expect(useDouyin.getState().buffering).toBe(true)
    expect(useDouyin.getState().current?.id).toBe('v2')
    expect(posted).toContainEqual({ type: 'douyin', command: { action: 'next' } })

    // Host captures new items and pushes passive update -> appended to bound queue without shifting index
    receiveAnswer(0, false, undefined, [...initial, makeVideo('v3')], 'recommend')
    expect(useDouyin.getState().queue?.items.map((v) => v.id)).toEqual(['v1', 'v2', 'v3'])
    expect(useDouyin.getState().queue?.index).toBe(1)

    // Jump directly inside queue keeps source intact
    playFromQueueIndex(2, true)
    expect(useDouyin.getState().current?.id).toBe('v3')
    expect(useDouyin.getState().queue?.index).toBe(2)
  })

  it('respects playback state and other active players on enterDouyin()', () => {
    const posted: PageMessage[] = []
    vi.stubGlobal('window', { chrome: { webview: { postMessage: (m: PageMessage) => posted.push(m) } } })

    // 1) Cold start when another media player is active -> autoPlay: false
    const stopOther = oneAtATime([
      {
        name: 'netease',
        playingHere: () => true,
        pauseHere: () => {},
        resumeHere: () => {},
        volume: () => 1,
        sendVolume: () => {},
        setVolume: () => {},
        skip: () => {},
        subscribe: () => () => {},
      },
      douyinPlayer,
    ])
    enterDouyin()
    expect(posted).toContainEqual({ type: 'douyin', command: { action: 'start', autoPlay: false } })
    stopOther()

    // 2) Re-entering in the same session never sends start again
    posted.length = 0
    enterDouyin()
    expect(posted.filter((m) => m.type === 'douyin' && m.command.action === 'start')).toHaveLength(0)

    // 3) After idle release with no other player active -> cold start sends autoPlay: true
    releaseResource()
    posted.length = 0
    enterDouyin()
    expect(posted).toContainEqual({ type: 'douyin', command: { action: 'start', autoPlay: true } })

    // 4) Cold start in non-host preview mode also auto-plays the first recommend video
    vi.unstubAllGlobals()
    useDouyin.setState(useDouyin.getInitialState(), true)
    enterDouyin()
    expect(useDouyin.getState().playing).toBe(true)
    expect(useDouyin.getState().playback?.status).toBe('playing')
    expect(useDouyin.getState().current?.id).toBe(MOCK_DOUYIN_VIDEOS[0].id)
  })

  it('handles likes, collects, channel switching, search, preferences, fade volume, and profile state', async () => {
    play(MOCK_DOUYIN_VIDEOS[0], 0)
    toggleLike(MOCK_DOUYIN_VIDEOS[0])
    expect(useDouyin.getState().liked[MOCK_DOUYIN_VIDEOS[0].id]).toBe(true)
    expect(useDouyin.getState().likedVideos[0]?.id).toBe(MOCK_DOUYIN_VIDEOS[0].id)

    toggleLike(MOCK_DOUYIN_VIDEOS[0])
    expect(useDouyin.getState().liked[MOCK_DOUYIN_VIDEOS[0].id]).toBe(false)
    expect(useDouyin.getState().likedVideos).toHaveLength(0)

    toggleCollect(MOCK_DOUYIN_VIDEOS[0])
    expect(useDouyin.getState().collected[MOCK_DOUYIN_VIDEOS[0].id]).toBe(true)

    receiveState(true, false, false, '老张重卡', 'https://example.com/a.jpg')
    expect(useDouyin.getState().profile).toEqual({
      nickname: '老张重卡',
      avatar: 'https://example.com/a.jpg',
    })

    selectChannel('music')
    expect(useDouyin.getState().tab).toBe('channels')
    expect(useDouyin.getState().channelId).toBe('music')

    await search('川藏线')
    expect(useDouyin.getState().tab).toBe('search')
    expect(useDouyin.getState().recentSearches[0]).toBe('川藏线')
    expect(useDouyin.getState().searchResults.length).toBeGreaterThan(0)

    setRate(1.5)
    toggleCrop()
    toggleAutoScroll()
    sendVolume(0.75)
    // Game fade volume must NOT overwrite saved user volume or mute preference
    applyFadeVolume(0)
    const s = useDouyin.getState()
    expect(s.rate).toBe(1.5)
    expect(s.crop).toBe(true)
    expect(s.autoScroll).toBe(false)
    expect(s.volume).toBe(0.75)
    expect(s.muted).toBe(false)
  })

  it('releases all remote feeds, queue, timers, and pending asks while keeping login, prefs, and local library', async () => {
    const posted: PageMessage[] = []
    vi.stubGlobal('window', { chrome: { webview: { postMessage: (m: PageMessage) => posted.push(m) } } })

    receiveState(true, true, false, '老张', null)
    toggleLike(MOCK_DOUYIN_VIDEOS[0])
    toggleCrop()
    receiveAnswer(0, false, undefined, [makeVideo('r1')], 'recommend')
    receivePlayback({
      id: MOCK_DOUYIN_VIDEOS[0].id,
      title: MOCK_DOUYIN_VIDEOS[0].title,
      artist: MOCK_DOUYIN_VIDEOS[0].author,
      duration: 94,
      position: 12,
      status: 'playing',
      queueSource: 'recommend',
      error: '模拟错误',
    })
    expect(useDouyin.getState().playbackError).toBe('模拟错误')
    openPlayer(true)

    // Start an in-flight ask before reclamation
    const pendingAsk = ask({ ask: 'feed', channel: 'music' })

    releaseResource()
    const ans = await pendingAsk
    expect(ans.failed).toBe(true)
    expect(ans.error).toBe('cancelled')

    const after = useDouyin.getState()
    expect(after.signedIn).toBe(true)
    expect(after.profile?.nickname).toBe('老张')
    expect(after.crop).toBe(true)
    expect(after.likedVideos).toHaveLength(1)
    expect(after.feeds).toEqual({})
    expect(after.queue).toBeNull()
    expect(after.current).toBeNull()
    expect(after.playback).toBeNull()
    expect(after.playbackError).toBeNull()
    expect(after.sessionStarted).toBe(false)
    expect(after.userPaused).toBe(false)
    expect(after.open).toBe(false)
    expect(after.playing).toBe(false)
  })
})
