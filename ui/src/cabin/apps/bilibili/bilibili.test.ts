import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ask,
  positionOf,
  receivePlayback,
  receiveState,
  setDanmaku,
  stopVideo,
  toggleDanmaku,
  useBilibili,
} from './bilibili'
import { BilibiliApp } from './BilibiliApp'
import { ProgressBar } from './Player'
import { VideoCard } from './shared'

describe('bilibili store', () => {
  beforeEach(() => {
    useBilibili.setState({
      playback: null,
      current: null,
      queue: null,
      playing: false,
      open: false,
      returnToPlayer: false,
      signedIn: false,
      signingIn: false,
      profile: null,
      confirmedBvid: null,
      hostReady: false,
      buffering: false,
    })
  })

  it('asks and returns movie mock answer when no webview host is active', async () => {
    const answer = await ask({ ask: 'movie', seasonType: 1, order: 2, page: 1 })
    expect(answer.failed).toBeFalsy()
    expect(answer.movies?.length).toBeGreaterThan(0)
  })

  it('forwards freshIdx on refreshable feed/popular/recommend questions', async () => {
    const feedAns = await ask({ ask: 'feed', which: 'popular', page: 1, freshIdx: 2 })
    expect(feedAns.videos?.length).toBeGreaterThan(0)
    const popAns = await ask({ ask: 'popular', page: 1, freshIdx: 3 })
    expect(popAns.videos?.length).toBeGreaterThan(0)
  })

  it('stores user profile metadata when receiveState updates login status', () => {
    receiveState(true, false, false, '卡车老司机', 'https://i0.hdslb.com/bfs/face/test.jpg')
    const state = useBilibili.getState()
    expect(state.signedIn).toBe(true)
    expect(state.signingIn).toBe(false)
    expect(state.profile?.name).toBe('卡车老司机')
    expect(state.profile?.avatar).toContain('test.jpg')

    receiveState(false, false, false)
    expect(useBilibili.getState().profile).toBeNull()
  })

  it('stopVideo resets playback and playing state', () => {
    useBilibili.setState({
      playback: {
        bvid: 'BV1xx',
        title: 'Test',
        artist: 'UP',
        status: 'playing',
        position: 10,
        duration: 100,
        at: 0,
      },
      current: { bvid: 'BV1xx', title: 'Test', author: 'UP' },
      playing: true,
      open: true,
      hostReady: true,
      buffering: true,
    })
    stopVideo()
    const state = useBilibili.getState()
    expect(state.playback).toBeNull()
    expect(state.playing).toBe(false)
    expect(state.open).toBe(false)
    expect(state.current).toBeNull()
    expect(state.hostReady).toBe(false)
    expect(state.buffering).toBe(false)
  })

  it('receivePlayback ignores paused state without current video and clears runtime flags when stopped', () => {
    receivePlayback({
      bvid: 'BV1xx',
      title: 'Test',
      artist: 'UP',
      status: 'paused',
      position: 0,
      duration: 100,
    })
    expect(useBilibili.getState().playback).toBeNull()

    useBilibili.setState({ current: { bvid: 'BV1xx', title: 'Test', author: 'UP' }, playing: true, open: true })
    receivePlayback({
      bvid: 'BV1xx',
      title: 'Test',
      artist: 'UP',
      status: 'playing',
      position: 12,
      duration: 100,
      ready: true,
      buffering: true,
    })
    expect(useBilibili.getState().confirmedBvid).toBe('BV1xx')
    expect(useBilibili.getState().hostReady).toBe(true)
    expect(useBilibili.getState().buffering).toBe(true)

    receivePlayback(null)
    const state = useBilibili.getState()
    expect(state.playback).toBeNull()
    expect(state.playing).toBe(false)
    expect(state.confirmedBvid).toBeNull()
    expect(state.hostReady).toBe(false)
    expect(state.buffering).toBe(false)
  })

  it('positionOf advances playback linearly when playing', () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000)
    useBilibili.setState({
      current: { bvid: 'BV1xx', title: 'Test', author: 'UP' },
      playing: true,
    })
    receivePlayback({
      bvid: 'BV1xx',
      title: 'Test',
      artist: 'UP',
      status: 'playing',
      position: 10,
      duration: 100,
    })

    const pos = positionOf(useBilibili.getState().playback, 3500)
    expect(pos).toBeCloseTo(12.5, 1)
    now.mockRestore()
  })

  it('setDanmaku and toggleDanmaku update store danmaku preference', () => {
    setDanmaku(true)
    expect(useBilibili.getState().danmaku).toBe(true)
    toggleDanmaku()
    expect(useBilibili.getState().danmaku).toBe(false)
  })
})

describe('bilibili UI structure', () => {
  it('renders 4 consolidated navigation tabs without emoji chrome', () => {
    const html = renderToStaticMarkup(createElement(BilibiliApp))
    expect(html).toContain('role="tablist"')
    expect(html).toContain('精选')
    expect(html).toContain('动态')
    expect(html).toContain('直播')
    expect(html).toContain('影视')
    expect(html).toContain('bili-subtab-btn')
    expect(html).not.toContain('🔥')
    expect(html).not.toContain('📺')
    expect(html).not.toContain('🎬')
  })

  it('renders semantic article cards with stretched trigger, sibling author link, and no-referrer images', () => {
    const html = renderToStaticMarkup(
      createElement(VideoCard, {
        video: {
          bvid: 'BV1mock001',
          title: '美国西部卡车模拟器沉浸式夜驾体验',
          author: '卡车老司机',
          mid: '1001',
          duration: 320,
          artwork: 'https://i0.hdslb.com/bfs/archive/mock.jpg',
        },
      }),
    )
    expect(html.startsWith('<article')).toBe(true)
    expect(html).toContain('class="bili-card-trigger"')
    expect(html).toContain('class="bili-author-link"')
    expect(html).toContain('referrerPolicy="no-referrer"')
  })

  it('renders ProgressBar with accessible slider semantics and drag isolation', () => {
    const html = renderToStaticMarkup(createElement(ProgressBar, { onTouch: () => {} }))
    expect(html).toContain('role="slider"')
    expect(html).toContain('data-own-drag=""')
  })
})
