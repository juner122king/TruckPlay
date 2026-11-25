import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  type DouyinAnswers,
  type DouyinCommand,
  type DouyinPlayback,
  type DouyinQuestion,
  type DouyinVideo,
  isInHost,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { whenTransitionEnds } from '../../state/launch'
import type { Hole } from '../youtube/youtube'

export type { Hole }

export type DouyinTab = 'recommend' | 'jingxuan' | 'follow' | 'channels' | 'library' | 'search'
export type DouyinLibrarySection = 'liked' | 'history'

export interface DouyinProfile {
  nickname: string | null
  avatar: string | null
}

export interface DouyinChannel {
  id: string
  zh: string
  en: string
}

export const DOUYIN_CHANNELS: readonly DouyinChannel[] = [
  { id: 'car', zh: '汽车重卡', en: 'Auto & Trucks' },
  { id: 'music', zh: '音乐现场', en: 'Music' },
  { id: 'travel', zh: '公路旅行', en: 'Travel' },
  { id: 'knowledge', zh: '硬核知识', en: 'Knowledge' },
  { id: 'food', zh: '烟火美食', en: 'Food' },
  { id: 'game', zh: '游戏实况', en: 'Gaming' },
  { id: 'entertainment', zh: '搞笑娱乐', en: 'Fun' },
  { id: 'sports', zh: '体育竞技', en: 'Sports' },
]

export const DOUYIN_HOT_KEYWORDS: readonly string[] = [
  '川藏线重卡',
  '欧卡2风景',
  '车载提神DJ',
  '独库公路自驾',
  '卡车司机日常',
  '高速夜景延时',
  '雨夜白噪音',
  '老歌翻唱现场',
]

export const MOCK_DOUYIN_VIDEOS: DouyinVideo[] = [
  {
    id: 'dy_01',
    title: '【川藏线纪实】开着重卡翻越折多山，云海就在车窗外翻涌',
    author: '老张聊重卡',
    artwork: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=900&q=80',
    duration: 94,
    likes: 45200,
    comments: 2890,
    collects: 6120,
    music: '老张聊重卡创作的原声 - 征服群山',
    channel: 'recommend',
  },
  {
    id: 'dy_02',
    title: '长途夜车提神车载 DJ 串烧｜无损重低音，一路平安到达',
    author: '车载DJ音乐坊',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=900&q=80',
    duration: 162,
    likes: 128400,
    comments: 8520,
    collects: 24900,
    music: '午夜公路电音 - 超强低音混音版',
    channel: 'music',
  },
  {
    id: 'dy_03',
    title: '【沉浸式第一视角】雨夜斯堪尼亚 V8 长途货运，雨刮声太治愈了',
    author: '欧卡漫游指南',
    artwork: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=900&q=80',
    duration: 215,
    likes: 89300,
    comments: 3410,
    collects: 14300,
    music: '公路漫游者 - 雨夜驾驶舱',
    channel: 'car',
  },
  {
    id: 'dy_04',
    title: '新疆独库公路一天经历四季，重卡视角带你看最美天山画卷',
    author: '西域老司机',
    artwork: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=900&q=80',
    duration: 128,
    likes: 96400,
    comments: 4120,
    collects: 18700,
    music: '西域风情 - 苍茫戈壁长调',
    channel: 'travel',
  },
  {
    id: 'dy_05',
    title: '3分钟看懂液力缓速器工作原理：长下坡为什么卡车司机离不了它？',
    author: '机械科普局',
    artwork: 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=900&q=80',
    duration: 186,
    likes: 63800,
    comments: 1940,
    collects: 15800,
    music: '机械科普局原声',
    channel: 'knowledge',
  },
  {
    id: 'dy_06',
    title: '高速服务区深夜一碗牛肉拉面，跑完 800 公里最大的幸福感',
    author: '在路上的阿强',
    artwork: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
    duration: 76,
    likes: 51900,
    comments: 3120,
    collects: 4820,
    music: '人间烟火 - 吉他弹唱版',
    channel: 'food',
  },
]

export interface DouyinState {
  signedIn: boolean | null
  signingIn: boolean
  profile: DouyinProfile | null
  playing: boolean | null
  hostReady: boolean
  buffering: boolean
  tab: DouyinTab
  channelId: string
  librarySection: DouyinLibrarySection
  videos: DouyinVideo[]
  feedLoading: boolean
  feedError: string | null
  searchQuery: string
  searchResults: DouyinVideo[]
  searchLoading: boolean
  recentSearches: string[]
  currentVideoIndex: number
  current: DouyinVideo | null
  playback: (DouyinPlayback & { at: number }) | null
  open: boolean
  returnToPlayer: boolean
  crop: boolean
  autoScroll: boolean
  rate: number
  volume: number
  muted: boolean
  liked: Record<string, boolean>
  collected: Record<string, boolean>
  likedVideos: DouyinVideo[]
  watchedHistory: DouyinVideo[]
  hole: Hole | null
}

const IN_HOST = typeof window !== 'undefined' && isInHost()
const ANSWER_TIMEOUT_MS = 10000
const MAX_HISTORY = 30
const MAX_LIKED = 40
const MAX_SEARCHES = 8

let nextAskId = 1
const pendingAsks = new Map<number, { resolve: (ans: DouyinAnswers & { failed?: boolean; error?: string }) => void; timer: ReturnType<typeof setTimeout> }>()

export const useDouyin = create<DouyinState>()(
  persist(
    (): DouyinState => ({
      signedIn: IN_HOST ? null : false,
      signingIn: false,
      profile: null,
      playing: false,
      hostReady: !IN_HOST,
      buffering: false,
      tab: 'recommend',
      channelId: 'car',
      librarySection: 'liked',
      videos: MOCK_DOUYIN_VIDEOS,
      feedLoading: false,
      feedError: null,
      searchQuery: '',
      searchResults: [],
      searchLoading: false,
      recentSearches: [],
      currentVideoIndex: 0,
      current: MOCK_DOUYIN_VIDEOS[0] ?? null,
      playback: null,
      open: false,
      returnToPlayer: false,
      crop: false,
      autoScroll: true,
      rate: 1.0,
      volume: 1,
      muted: false,
      liked: {},
      collected: {},
      likedVideos: [],
      watchedHistory: [],
      hole: null,
    }),
    {
      name: 'westplay.douyin',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        crop: s.crop,
        autoScroll: s.autoScroll,
        rate: s.rate,
        volume: s.volume,
        muted: s.muted,
        liked: s.liked,
        collected: s.collected,
        likedVideos: s.likedVideos,
        watchedHistory: s.watchedHistory,
        recentSearches: s.recentSearches,
      }),
      merge: (stored, current) => {
        const s = (stored ?? {}) as Partial<DouyinState>
        return {
          ...current,
          crop: typeof s.crop === 'boolean' ? s.crop : current.crop,
          autoScroll: typeof s.autoScroll === 'boolean' ? s.autoScroll : current.autoScroll,
          rate: typeof s.rate === 'number' && s.rate >= 0.5 && s.rate <= 2.5 ? s.rate : 1.0,
          volume: typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : 1,
          muted: Boolean(s.muted),
          liked: s.liked && typeof s.liked === 'object' ? s.liked : {},
          collected: s.collected && typeof s.collected === 'object' ? s.collected : {},
          likedVideos: Array.isArray(s.likedVideos) ? s.likedVideos.slice(0, MAX_LIKED) : [],
          watchedHistory: Array.isArray(s.watchedHistory) ? s.watchedHistory.slice(0, MAX_HISTORY) : [],
          recentSearches: Array.isArray(s.recentSearches) ? s.recentSearches.slice(0, MAX_SEARCHES) : [],
        }
      },
    },
  ),
)

export function send(command: DouyinCommand): void {
  if (isInHost()) postToHost({ type: 'douyin', command })
}

export function ask(question: DouyinQuestion): Promise<DouyinAnswers & { failed?: boolean; error?: string }> {
  if (!isInHost()) {
    if (question.ask === 'search') {
      const q = question.query.trim().toLowerCase()
      const matched = MOCK_DOUYIN_VIDEOS.filter(
        (v) => v.title.toLowerCase().includes(q) || v.author.toLowerCase().includes(q) || (v.music ?? '').toLowerCase().includes(q),
      )
      return Promise.resolve({ videos: matched.length > 0 ? matched : MOCK_DOUYIN_VIDEOS.slice(0, 4) })
    }
    if (question.ask === 'feed') {
      const ch = question.channel
      if (ch && ch !== 'recommend' && ch !== 'jingxuan' && ch !== 'follow') {
        const filtered = MOCK_DOUYIN_VIDEOS.filter((v) => v.channel === ch)
        return Promise.resolve({
          channel: ch,
          videos: filtered.length > 0 ? [...filtered, ...MOCK_DOUYIN_VIDEOS.filter((v) => v.channel !== ch)] : MOCK_DOUYIN_VIDEOS,
        })
      }
      return Promise.resolve({ channel: ch, videos: MOCK_DOUYIN_VIDEOS })
    }
    return Promise.resolve({ videos: [] })
  }

  const id = nextAskId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingAsks.delete(id)
      resolve({ failed: true, error: 'timeout' })
    }, ANSWER_TIMEOUT_MS)
    pendingAsks.set(id, { resolve, timer })
    send({ action: 'ask', id, question })
  })
}

export function sendStart(): void {
  const { rate, muted, volume, autoScroll } = useDouyin.getState()
  send({ action: 'start' })
  send({ action: 'rate', rate })
  send({ action: 'mute', muted })
  send({ action: 'volume', percent: Math.round(volume * 100) })
  send({ action: 'autoScroll', on: autoScroll })
  void loadFeed()
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
  useDouyin.setState({ profile: null })
}

export function receiveState(
  signedIn: boolean | null,
  playing: boolean | null,
  signingIn: boolean,
  nickname?: string | null,
  avatar?: string | null,
): void {
  const prevProfile = useDouyin.getState().profile
  const profile: DouyinProfile | null = signedIn
    ? {
        nickname: nickname ?? prevProfile?.nickname ?? null,
        avatar: avatar ?? prevProfile?.avatar ?? null,
      }
    : null
  useDouyin.setState({ signedIn, playing, signingIn, profile })
}

export function receiveAnswer(
  id: number,
  failed?: boolean,
  error?: string,
  videos?: DouyinVideo[],
  channel?: string,
): void {
  const pending = pendingAsks.get(id)
  if (pending) {
    clearTimeout(pending.timer)
    pendingAsks.delete(id)
    pending.resolve({ failed, error, videos, channel })
  }
  // Passive feed pushes (id === 0) or direct feed answers hydrate the active queue
  if (!failed && videos && videos.length > 0 && id === 0) {
    const state = useDouyin.getState()
    if (state.tab !== 'search' && state.tab !== 'library') {
      const idx = state.current ? videos.findIndex((v) => v.id === state.current?.id) : 0
      useDouyin.setState({
        videos,
        feedLoading: false,
        feedError: null,
        currentVideoIndex: idx >= 0 ? idx : 0,
        current: state.current ?? videos[0] ?? null,
      })
    }
  }
}

function recordWatched(video: DouyinVideo): void {
  if (!video.id || video.id === 'dy_current') return
  useDouyin.setState((s) => {
    const deduped = [video, ...s.watchedHistory.filter((item) => item.id !== video.id)].slice(0, MAX_HISTORY)
    return { watchedHistory: deduped }
  })
}

export function receivePlayback(playback: DouyinPlayback | null): void {
  if (!playback) {
    useDouyin.setState({ playback: null, playing: false, buffering: false })
    return
  }
  const now = performance.now()
  const state = useDouyin.getState()
  const matchedIdx = playback.id ? state.videos.findIndex((v) => v.id === playback.id) : -1
  const matchedVideo = matchedIdx >= 0 ? state.videos[matchedIdx] : null

  const mergedCurrent: DouyinVideo = {
    id: playback.id || matchedVideo?.id || state.current?.id || 'dy_current',
    title: playback.title || matchedVideo?.title || state.current?.title || '抖音精选短视频',
    author: playback.author || playback.artist || matchedVideo?.author || state.current?.author || '抖音创作者',
    avatar: playback.avatar ?? matchedVideo?.avatar ?? state.current?.avatar,
    artwork: playback.artwork ?? matchedVideo?.artwork ?? state.current?.artwork,
    duration: playback.duration || matchedVideo?.duration || state.current?.duration || 0,
    likes: playback.likes ?? matchedVideo?.likes ?? state.current?.likes,
    comments: playback.comments ?? matchedVideo?.comments ?? state.current?.comments,
    music: playback.music ?? matchedVideo?.music ?? state.current?.music,
    liked: playback.liked ?? matchedVideo?.liked,
    collected: playback.collected ?? matchedVideo?.collected,
    channel: playback.channel ?? matchedVideo?.channel ?? state.current?.channel,
  }

  useDouyin.setState({
    playback: { ...playback, at: now },
    playing: playback.status === 'playing',
    hostReady: playback.hostReady ?? state.hostReady,
    buffering: playback.buffering ?? false,
    current: mergedCurrent,
    ...(matchedIdx >= 0 ? { currentVideoIndex: matchedIdx } : {}),
    ...(typeof playback.rate === 'number' ? { rate: playback.rate } : {}),
    ...(typeof playback.muted === 'boolean' ? { muted: playback.muted } : {}),
    ...(typeof playback.autoScroll === 'boolean' ? { autoScroll: playback.autoScroll } : {}),
    ...(playback.id && typeof playback.liked === 'boolean'
      ? { liked: { ...state.liked, [playback.id]: playback.liked } }
      : {}),
    ...(playback.id && typeof playback.collected === 'boolean'
      ? { collected: { ...state.collected, [playback.id]: playback.collected } }
      : {}),
  })

  if (playback.status === 'playing' && mergedCurrent.id !== 'dy_current') {
    recordWatched(mergedCurrent)
  }
}

export function positionOf(playback: DouyinState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? Math.max(0, (now - playback.at) / 1000) * (playback.rate ?? 1) : 0
  const end = playback.duration > 0 ? playback.duration : Number.POSITIVE_INFINITY
  return Math.min(end, Math.max(0, playback.position + run))
}

export function positionNow(): number {
  return positionOf(useDouyin.getState().playback, performance.now())
}

export function formatClock(secs?: number): string {
  if (!secs || !Number.isFinite(secs) || secs < 0) return '0:00'
  const total = Math.floor(secs)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function formatCount(count?: number, fallback = ''): string {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return fallback
  if (count >= 1e8) return `${(count / 1e8).toFixed(1).replace(/\.0$/, '')}亿`
  if (count >= 1e4) return `${(count / 1e4).toFixed(1).replace(/\.0$/, '')}万`
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(Math.round(count))
}

function show(change: Partial<DouyinPlayback>): void {
  const { playback } = useDouyin.getState()
  if (!playback) return
  const now = performance.now()
  useDouyin.setState({
    playback: { ...playback, position: positionOf(playback, now), at: now, ...change },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

function activeChannelKey(tab: DouyinTab, channelId: string): string {
  if (tab === 'channels') return channelId
  if (tab === 'jingxuan' || tab === 'follow') return tab
  return 'recommend'
}

export async function loadFeed(channelOverride?: string): Promise<void> {
  const state = useDouyin.getState()
  const channel = channelOverride ?? activeChannelKey(state.tab, state.channelId)
  useDouyin.setState({ feedLoading: true, feedError: null })
  const ans = await ask({ ask: 'feed', channel })
  if (ans.failed) {
    useDouyin.setState({ feedLoading: false, feedError: ans.error ?? '加载失败' })
    return
  }
  if (ans.videos && ans.videos.length > 0) {
    const videos = ans.videos
    const cur = useDouyin.getState().current
    const idx = cur ? videos.findIndex((v) => v.id === cur.id) : 0
    useDouyin.setState({
      videos,
      feedLoading: false,
      feedError: null,
      currentVideoIndex: idx >= 0 ? idx : 0,
      current: cur ?? videos[0] ?? null,
    })
  } else {
    useDouyin.setState({ feedLoading: false })
  }
}

export function selectTab(tab: DouyinTab): void {
  const prev = useDouyin.getState().tab
  useDouyin.setState({ tab })
  if (tab === 'recommend' || tab === 'jingxuan' || tab === 'follow' || tab === 'channels') {
    const ch = activeChannelKey(tab, useDouyin.getState().channelId)
    if (prev !== tab) {
      send({ action: 'channel', channel: ch })
    }
    void loadFeed(ch)
  }
}

export function selectChannel(channelId: string): void {
  useDouyin.setState({ tab: 'channels', channelId })
  send({ action: 'channel', channel: channelId })
  void loadFeed(channelId)
}

export function refreshFeed(): void {
  const state = useDouyin.getState()
  if (state.tab === 'search' && state.searchQuery.trim()) {
    void search(state.searchQuery)
    return
  }
  send({ action: 'refresh' })
  if (!isInHost()) {
    const rotated = [...state.videos.slice(1), state.videos[0]].filter(Boolean)
    useDouyin.setState({ videos: rotated, currentVideoIndex: 0 })
  }
  void loadFeed()
}

export async function search(query: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) return
  useDouyin.setState((s) => ({
    tab: 'search',
    searchQuery: trimmed,
    searchLoading: true,
    recentSearches: [trimmed, ...s.recentSearches.filter((q) => q !== trimmed)].slice(0, MAX_SEARCHES),
  }))
  const ans = await ask({ ask: 'search', query: trimmed })
  useDouyin.setState({
    searchLoading: false,
    searchResults: ans.videos ?? [],
  })
}

export function clearSearch(): void {
  useDouyin.setState({ searchQuery: '', searchResults: [], searchLoading: false })
}

export function clearRecentSearches(): void {
  useDouyin.setState({ recentSearches: [] })
}

export function setLibrarySection(librarySection: DouyinLibrarySection): void {
  useDouyin.setState({ librarySection })
}

export function clearHistory(): void {
  useDouyin.setState({ watchedHistory: [] })
}

export function play(video?: DouyinVideo, index?: number, openFullscreen = false): void {
  const state = useDouyin.getState()
  const list = state.tab === 'search' && state.searchResults.length > 0 ? state.searchResults : state.videos
  const targetVideo = video ?? state.current ?? list[0]
  const targetIndex =
    typeof index === 'number'
      ? index
      : targetVideo
        ? state.videos.findIndex((v) => v.id === targetVideo.id)
        : state.currentVideoIndex

  send({ action: 'play', video: targetVideo, index: targetIndex >= 0 ? targetIndex : undefined })

  if (targetVideo) {
    const now = performance.now()
    useDouyin.setState({
      currentVideoIndex: targetIndex >= 0 ? targetIndex : state.currentVideoIndex,
      current: targetVideo,
      hostReady: !IN_HOST,
      playback: {
        id: targetVideo.id,
        title: targetVideo.title,
        artist: targetVideo.author,
        author: targetVideo.author,
        avatar: targetVideo.avatar,
        artwork: targetVideo.artwork,
        duration: targetVideo.duration || 120,
        position: 0,
        status: 'playing',
        liked: state.liked[targetVideo.id] ?? targetVideo.liked ?? false,
        collected: state.collected[targetVideo.id] ?? targetVideo.collected ?? false,
        likes: targetVideo.likes,
        comments: targetVideo.comments,
        music: targetVideo.music,
        rate: state.rate,
        muted: state.muted,
        autoScroll: state.autoScroll,
        channel: targetVideo.channel,
        at: now,
      },
      playing: true,
      ...(openFullscreen ? { open: true } : {}),
    })
    recordWatched(targetVideo)
  } else {
    show({ status: 'playing' })
    if (openFullscreen) useDouyin.setState({ open: true })
  }
}

export function playOrPause(): void {
  const { playing, playback, current, videos, currentVideoIndex } = useDouyin.getState()
  if (playing) {
    send({ action: 'pause' })
    show({ status: 'paused' })
  } else if (playback) {
    send({ action: 'play' })
    show({ status: 'playing' })
  } else {
    play(current ?? videos[currentVideoIndex] ?? videos[0], currentVideoIndex)
  }
}

export function skip(direction: 1 | -1): void {
  send({ action: direction === 1 ? 'next' : 'previous' })
  const state = useDouyin.getState()
  if (state.videos.length > 0) {
    const nextIdx = (state.currentVideoIndex + direction + state.videos.length) % state.videos.length
    const nextVid = state.videos[nextIdx]
    if (!isInHost() && nextVid) {
      play(nextVid, nextIdx, state.open)
    } else {
      useDouyin.setState({ currentVideoIndex: nextIdx, ...(nextVid ? { current: nextVid } : {}) })
    }
  }
}

export function nextVideo(): void {
  skip(1)
}

export function previousVideo(): void {
  skip(-1)
}

export function seek(seconds: number): void {
  const clamped = Math.max(0, seconds)
  send({ action: 'seek', seconds: clamped })
  show({ position: clamped })
}

export function seekBy(deltaSeconds: number): void {
  const { playback } = useDouyin.getState()
  const duration = playback?.duration || Number.POSITIVE_INFINITY
  const target = Math.max(0, Math.min(duration, positionNow() + deltaSeconds))
  seek(target)
}

export function replay(): void {
  seek(0)
  send({ action: 'play' })
  show({ position: 0, status: 'playing' })
}

export function sendVolume(share: number): void {
  const clamped = Math.max(0, Math.min(1, share))
  useDouyin.setState({ volume: clamped, muted: clamped === 0 })
  send({ action: 'volume', percent: Math.round(clamped * 100) })
  if (clamped > 0) send({ action: 'mute', muted: false })
}

export function sendVolumePercent(percent: number): void {
  sendVolume(percent / 100)
}

export function toggleMute(): void {
  const next = !useDouyin.getState().muted
  useDouyin.setState({ muted: next })
  send({ action: 'mute', muted: next })
}

export function setRate(rate: number): void {
  useDouyin.setState({ rate })
  send({ action: 'rate', rate })
  show({ rate })
}

export function toggleAutoScroll(): void {
  const next = !useDouyin.getState().autoScroll
  useDouyin.setState({ autoScroll: next })
  send({ action: 'autoScroll', on: next })
  show({ autoScroll: next })
}

export function toggleCrop(): void {
  const next = !useDouyin.getState().crop
  useDouyin.setState({ crop: next })
  send({ action: 'crop', on: next })
}

export function toggleLike(target?: DouyinVideo | string): void {
  const state = useDouyin.getState()
  const videoObj =
    typeof target === 'object' && target !== null
      ? target
      : state.videos.find((v) => v.id === target) ?? state.current ?? undefined
  const targetId = typeof target === 'string' ? target : videoObj?.id ?? state.playback?.id
  if (!targetId) return

  const nextLiked = !state.liked[targetId]
  const nextLikedVideos = nextLiked
    ? videoObj
      ? [videoObj, ...state.likedVideos.filter((v) => v.id !== targetId)].slice(0, MAX_LIKED)
      : state.likedVideos
    : state.likedVideos.filter((v) => v.id !== targetId)

  useDouyin.setState({
    liked: { ...state.liked, [targetId]: nextLiked },
    likedVideos: nextLikedVideos,
  })
  if (state.playback?.id === targetId) {
    const baseLikes = state.playback.likes
    show({
      liked: nextLiked,
      ...(typeof baseLikes === 'number' ? { likes: Math.max(0, baseLikes + (nextLiked ? 1 : -1)) } : {}),
    })
  }
  send({ action: 'like', id: targetId })
}

export function toggleCollect(target?: DouyinVideo | string): void {
  const state = useDouyin.getState()
  const targetId =
    typeof target === 'string' ? target : (target?.id ?? state.current?.id ?? state.playback?.id)
  if (!targetId) return

  const nextCollected = !state.collected[targetId]
  useDouyin.setState({
    collected: { ...state.collected, [targetId]: nextCollected },
  })
  if (state.playback?.id === targetId) {
    show({ collected: nextCollected })
  }
  send({ action: 'collect', id: targetId })
}

export function openPlayer(instant = false): void {
  const state = useDouyin.getState()
  if (!state.playback && !state.current && state.videos[0]) {
    play(state.videos[0], 0, true)
    return
  }
  if (!state.playback && state.current) {
    play(state.current, state.currentVideoIndex, true)
    return
  }
  useDouyin.setState({ open: true, returnToPlayer: false })
  if (!instant) {
    whenTransitionEnds(() => {
      // Player effect handles `show` placement over `.carplay`.
    })
  }
}

export function closePlayer(): void {
  useDouyin.setState({ open: false, returnToPlayer: false })
}

export function leavePlayer(): void {
  const { open } = useDouyin.getState()
  if (!open) return
  useDouyin.setState({ open: false, returnToPlayer: false })
  whenTransitionEnds(() => {
    const after = useDouyin.getState()
    if (!after.open && !after.hole) {
      send({ action: 'hide' })
    }
  })
}

export function useDouyinSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useDouyin((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-douyin',
        service: 'douyin',
        title: playback.title,
        artist: playback.author ?? playback.artist,
        album: '抖音短视频',
        artwork: playback.artwork ?? null,
        status: playback.status === 'playing' ? 'playing' : 'paused',
        positionMs: playback.position * 1000,
        positionAt: Date.now(),
        durationMs: playback.duration * 1000,
        controls: { playPause: true, next: true, previous: true, shuffle: false, repeat: false },
        shuffle: false,
        repeat: null,
      },
    }
  }, [playback])
}

/** Release transient session data while keeping login, user preferences, and local library. */
export function releaseResource(): void {
  const before = useDouyin.getState()
  const kept = {
    signedIn: before.signedIn,
    profile: before.profile,
    volume: before.volume,
    muted: before.muted,
    crop: before.crop,
    autoScroll: before.autoScroll,
    rate: before.rate,
    liked: before.liked,
    collected: before.collected,
    likedVideos: before.likedVideos,
    watchedHistory: before.watchedHistory,
    recentSearches: before.recentSearches,
  }
  useDouyin.setState({
    ...useDouyin.getInitialState(),
    ...kept,
    open: false,
    returnToPlayer: false,
    hole: null,
    playback: null,
    playing: false,
  })
}
