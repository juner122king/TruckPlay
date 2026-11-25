import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearHistory,
  closePlayer,
  formatClock,
  formatCount,
  MOCK_DOUYIN_VIDEOS,
  openPlayer,
  play,
  playOrPause,
  positionOf,
  receivePlayback,
  receiveState,
  releaseResource,
  search,
  selectChannel,
  setRate,
  skip,
  toggleAutoScroll,
  toggleCollect,
  toggleCrop,
  toggleLike,
  useDouyin,
} from './douyin'

describe('douyin store and actions', () => {
  beforeEach(() => {
    useDouyin.setState(useDouyin.getInitialState(), true)
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
    let s = useDouyin.getState()
    expect(s.playing).toBe(true)
    expect(s.current?.id).toBe(target.id)
    expect(s.currentVideoIndex).toBe(1)
    expect(s.open).toBe(false)
    expect(s.watchedHistory[0]?.id).toBe(target.id)

    openPlayer(true)
    expect(useDouyin.getState().open).toBe(true)

    playOrPause()
    expect(useDouyin.getState().playing).toBe(false)

    closePlayer()
    expect(useDouyin.getState().open).toBe(false)

    clearHistory()
    expect(useDouyin.getState().watchedHistory).toEqual([])
  })

  it('skips videos cyclically in preview mode and persists like/collect lists', () => {
    play(MOCK_DOUYIN_VIDEOS[0], 0)
    skip(1)
    expect(useDouyin.getState().currentVideoIndex).toBe(1)
    skip(-1)
    expect(useDouyin.getState().currentVideoIndex).toBe(0)

    toggleLike(MOCK_DOUYIN_VIDEOS[0])
    expect(useDouyin.getState().liked[MOCK_DOUYIN_VIDEOS[0].id]).toBe(true)
    expect(useDouyin.getState().likedVideos[0]?.id).toBe(MOCK_DOUYIN_VIDEOS[0].id)

    toggleLike(MOCK_DOUYIN_VIDEOS[0])
    expect(useDouyin.getState().liked[MOCK_DOUYIN_VIDEOS[0].id]).toBe(false)
    expect(useDouyin.getState().likedVideos).toHaveLength(0)

    toggleCollect(MOCK_DOUYIN_VIDEOS[0])
    expect(useDouyin.getState().collected[MOCK_DOUYIN_VIDEOS[0].id]).toBe(true)
  })

  it('handles channel switching, search, preferences, and profile state', async () => {
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
    const s = useDouyin.getState()
    expect(s.rate).toBe(1.5)
    expect(s.crop).toBe(true)
    expect(s.autoScroll).toBe(false)
  })

  it('releases transient session state while keeping login, preferences, and local library', () => {
    receiveState(true, true, false, '老张', null)
    toggleLike(MOCK_DOUYIN_VIDEOS[0])
    toggleCrop()
    receivePlayback({
      id: MOCK_DOUYIN_VIDEOS[0].id,
      title: MOCK_DOUYIN_VIDEOS[0].title,
      artist: MOCK_DOUYIN_VIDEOS[0].author,
      duration: 94,
      position: 12,
      status: 'playing',
    })
    openPlayer(true)

    releaseResource()
    const after = useDouyin.getState()
    expect(after.signedIn).toBe(true)
    expect(after.profile?.nickname).toBe('老张')
    expect(after.crop).toBe(true)
    expect(after.likedVideos).toHaveLength(1)
    expect(after.playback).toBeNull()
    expect(after.open).toBe(false)
    expect(after.playing).toBe(false)
  })
})
