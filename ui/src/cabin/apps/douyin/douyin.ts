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
import { isOtherPlayerActive } from '../oneAtATime'
import type { Hole } from '../youtube/youtube'

export type { Hole }

export type DouyinTab = 'recommend' | 'jingxuan' | 'follow' | 'channels' | 'library' | 'search'
export type DouyinLibrarySection = 'liked' | 'history'
export type DouyinChannelId = 'knowledge' | 'music' | 'film' | 'food' | 'game' | 'sports' | 'entertainment' | 'anime'
export type DouyinFeedKey = 'recommend' | 'jingxuan' | 'follow' | DouyinChannelId
export type DouyinQueueSource = DouyinFeedKey | 'search' | 'liked' | 'history'
export type DouyinLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface DouyinProfile {
  nickname: string | null
  avatar: string | null
}

export interface DouyinChannel {
  id: DouyinChannelId
  zh: string
  en: string
}

export interface DouyinFeedSlice {
  items: DouyinVideo[]
  status: DouyinLoadStatus
  refreshing: boolean
  error: string | null
  updatedAt: number | null
}

export interface DouyinPlayQueue {
  source: DouyinQueueSource
  label?: string
  items: DouyinVideo[]
  index: number
  /** Whether passive feed appends for `source` extend this queue (detached on manual refresh). */
  boundToFeed: boolean
}

export const DOUYIN_CHANNELS: readonly DouyinChannel[] = [
  { id: 'knowledge', zh: '硬核知识', en: 'Knowledge' },
  { id: 'music', zh: '音乐现场', en: 'Music' },
  { id: 'film', zh: '影视解说', en: 'Film & TV' },
  { id: 'food', zh: '烟火美食', en: 'Food' },
  { id: 'game', zh: '游戏实况', en: 'Gaming' },
  { id: 'sports', zh: '体育竞技', en: 'Sports' },
  { id: 'entertainment', zh: '搞笑娱乐', en: 'Fun' },
  { id: 'anime', zh: '二次元', en: 'Anime' },
]

const FEED_KEY_SET = new Set<string>(['recommend', 'jingxuan', 'follow', ...DOUYIN_CHANNELS.map((c) => c.id)])

export function isFeedSource(source: string | undefined | null): source is DouyinFeedKey {
  return Boolean(source && FEED_KEY_SET.has(source))
}

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
    channel: 'game',
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
    channel: 'film',
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

export const EMPTY_FEED_SLICE: DouyinFeedSlice = {
  items: [],
  status: 'idle',
  refreshing: false,
  error: null,
  updatedAt: null,
}

export interface DouyinState {
  signedIn: boolean | null
  signingIn: boolean
  profile: DouyinProfile | null
  playing: boolean | null
  hostReady: boolean
  buffering: boolean
  tab: DouyinTab
  channelId: DouyinChannelId
  librarySection: DouyinLibrarySection
  /** Independent per-tab/per-channel browsed lists, decoupled from active playback queue. */
  feeds: Record<string, DouyinFeedSlice>
  searchQuery: string
  searchResults: DouyinVideo[]
  searchStatus: DouyinLoadStatus
  searchError: string | null
  recentSearches: string[]
  /** Single source of truth for actual playback list, independent of the browsed tab. */
  queue: DouyinPlayQueue | null
  current: DouyinVideo | null
  playback: (DouyinPlayback & { at: number }) | null
  playbackError: string | null
  /** Resident session lifecycle flags (reset on sign-out and 30s idle resource reclamation). */
  sessionStarted: boolean
  userPaused: boolean
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

const ANSWER_TIMEOUT_MS = 10000
const FEED_FALLBACK_MS = 2200
const MAX_HISTORY = 30
const MAX_LIKED = 40
const MAX_SEARCHES = 8
const MAX_QUEUE_ITEMS = 120

let nextAskId = 1
const pendingAsks = new Map<
  number,
  { resolve: (ans: DouyinAnswers & { failed?: boolean; error?: string }) => void; timer: ReturnType<typeof setTimeout> }
>()

let sessionGeneration = 0
let searchEpoch = 0
const feedEpochs = new Map<string, number>()
const feedTimers = new Map<string, ReturnType<typeof setTimeout>>()
const tabScrollTop = new Map<string, number>()

function inHostNow(): boolean {
  return typeof window !== 'undefined' && isInHost()
}

function dedupeVideos(items: readonly DouyinVideo[]): DouyinVideo[] {
  const seen = new Set<string>()
  const out: DouyinVideo[] = []
  for (const v of items) {
    if (!v || !v.id || seen.has(v.id)) continue
    seen.add(v.id)
    out.push(v)
  }
  return out
}

function buildInitialState(): DouyinState {
  const inHost = inHostNow()
  const previewVideos = inHost ? [] : MOCK_DOUYIN_VIDEOS
  return {
    signedIn: inHost ? null : false,
    signingIn: false,
    profile: null,
    playing: false,
    hostReady: !inHost,
    buffering: false,
    tab: 'recommend',
    channelId: 'knowledge',
    librarySection: 'liked',
    feeds: inHost
      ? {}
      : {
          recommend: {
            items: previewVideos,
            status: 'ready',
            refreshing: false,
            error: null,
            updatedAt: null,
          },
        },
    searchQuery: '',
    searchResults: [],
    searchStatus: 'idle',
    searchError: null,
    recentSearches: [],
    queue: inHost
      ? null
      : {
          source: 'recommend',
          items: previewVideos,
          index: 0,
          boundToFeed: true,
        },
    current: previewVideos[0] ?? null,
    playback: null,
    playbackError: null,
    sessionStarted: false,
    userPaused: false,
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
  }
}

export const useDouyin = create<DouyinState>()(
  persist(buildInitialState, {
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
  }),
)

export function activeFeedKey(tab: DouyinTab, channelId: DouyinChannelId): DouyinFeedKey {
  if (tab === 'channels') return channelId
  if (tab === 'jingxuan' || tab === 'follow') return tab
  return 'recommend'
}

export function activeBrowseSource(
  state: Pick<DouyinState, 'tab' | 'channelId' | 'librarySection'>,
): DouyinQueueSource {
  if (state.tab === 'search') return 'search'
  if (state.tab === 'library') return state.librarySection
  return activeFeedKey(state.tab, state.channelId)
}

export function getFeedSlice(state: Pick<DouyinState, 'feeds'>, key: string): DouyinFeedSlice {
  return state.feeds[key] ?? EMPTY_FEED_SLICE
}

export function getDisplayedList(
  state: Pick<
    DouyinState,
    'tab' | 'channelId' | 'librarySection' | 'feeds' | 'searchResults' | 'likedVideos' | 'watchedHistory'
  >,
): DouyinVideo[] {
  if (state.tab === 'search') return state.searchResults
  if (state.tab === 'library') return state.librarySection === 'liked' ? state.likedVideos : state.watchedHistory
  return getFeedSlice(state, activeFeedKey(state.tab, state.channelId)).items
}

export function queueSourceLabel(queue: DouyinPlayQueue | null, chinese: boolean): string {
  const t = (zh: string, en: string) => (chinese ? zh : en)
  if (!queue) return t('推荐', 'For You')
  if (queue.source === 'recommend') return t('推荐', 'For You')
  if (queue.source === 'jingxuan') return t('精选', 'Featured')
  if (queue.source === 'follow') return t('关注', 'Following')
  if (queue.source === 'search') {
    return queue.label ? t(`搜索 · ${queue.label}`, `Search · ${queue.label}`) : t('搜索结果', 'Search')
  }
  if (queue.source === 'liked') return t('我赞过的', 'Liked')
  if (queue.source === 'history') return t('最近看过', 'History')
  const ch = DOUYIN_CHANNELS.find((c) => c.id === queue.source)
  return ch ? (chinese ? ch.zh : ch.en) : t('频道', 'Channel')
}

export function getTabScrollTop(key: string): number {
  return tabScrollTop.get(key) ?? 0
}

export function setTabScrollTop(key: string, top: number): void {
  tabScrollTop.set(key, Math.max(0, top))
}

function clearFeedTimer(key: string): void {
  const existing = feedTimers.get(key)
  if (existing) {
    clearTimeout(existing)
    feedTimers.delete(key)
  }
}

function nextFeedEpoch(key: string): number {
  const next = (feedEpochs.get(key) ?? 0) + 1
  feedEpochs.set(key, next)
  return next
}

function cancelPendingRequests(): void {
  sessionGeneration++
  searchEpoch++
  for (const [, entry] of pendingAsks) {
    clearTimeout(entry.timer)
    entry.resolve({ failed: true, error: 'cancelled' })
  }
  pendingAsks.clear()
  for (const [, timer] of feedTimers) {
    clearTimeout(timer)
  }
  feedTimers.clear()
  feedEpochs.clear()
}

function setFeedSlice(
  key: string,
  patch: Partial<DouyinFeedSlice> | ((prev: DouyinFeedSlice) => DouyinFeedSlice),
): void {
  useDouyin.setState((s) => {
    const prev = s.feeds[key] ?? EMPTY_FEED_SLICE
    const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
    return { feeds: { ...s.feeds, [key]: next } }
  })
}

function findVideoMetadata(state: DouyinState, id: string | undefined): DouyinVideo | null {
  if (!id) return null
  const inQueue = state.queue?.items.find((v) => v.id === id)
  if (inQueue) return inQueue
  for (const slice of Object.values(state.feeds)) {
    const hit = slice.items.find((v) => v.id === id)
    if (hit) return hit
  }
  const inSearch = state.searchResults.find((v) => v.id === id)
  if (inSearch) return inSearch
  const inLiked = state.likedVideos.find((v) => v.id === id)
  if (inLiked) return inLiked
  const inHistory = state.watchedHistory.find((v) => v.id === id)
  if (inHistory) return inHistory
  return null
}

function hasNovelVideos(candidate: readonly DouyinVideo[], existing: readonly DouyinVideo[]): boolean {
  if (candidate.length === 0) return false
  const existingIds = new Set(existing.map((v) => v.id))
  return candidate.some((v) => !existingIds.has(v.id))
}

export function send(command: DouyinCommand): void {
  if (isInHost()) postToHost({ type: 'douyin', command })
}

export function ask(question: DouyinQuestion): Promise<DouyinAnswers & { failed?: boolean; error?: string }> {
  if (!isInHost()) {
    if (question.ask === 'search') {
      const q = question.query.trim().toLowerCase()
      const matched = MOCK_DOUYIN_VIDEOS.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.author.toLowerCase().includes(q) ||
          (v.music ?? '').toLowerCase().includes(q),
      )
      return Promise.resolve({ videos: matched.length > 0 ? matched : MOCK_DOUYIN_VIDEOS.slice(0, 4) })
    }
    if (question.ask === 'feed') {
      const ch = question.channel
      if (ch && ch !== 'recommend' && ch !== 'jingxuan' && ch !== 'follow') {
        const filtered = MOCK_DOUYIN_VIDEOS.filter((v) => v.channel === ch)
        return Promise.resolve({
          channel: ch,
          videos:
            filtered.length > 0
              ? [...filtered, ...MOCK_DOUYIN_VIDEOS.filter((v) => v.channel !== ch)]
              : MOCK_DOUYIN_VIDEOS,
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

/**
 * Lifecycle entry point when `DouyinApp` mounts.
 * - First entry in a resident session: syncs preferences and requests auto-play ONLY if no other media
 *   is active and the user has not manually paused.
 * - Subsequent re-entries (e.g. returning from Dashboard/Maps): never hijacks playback or wipes cached tabs.
 */
export function enterDouyin(): void {
  const state = useDouyin.getState()
  if (!state.sessionStarted) {
    const autoPlay = !state.userPaused && !state.playback && !isOtherPlayerActive('douyin')
    useDouyin.setState({ sessionStarted: true })
    send({ action: 'start', autoPlay })
    send({ action: 'rate', rate: state.rate })
    send({ action: 'mute', muted: state.muted })
    send({ action: 'volume', percent: Math.round(state.volume * 100) })
    send({ action: 'autoScroll', on: state.autoScroll })
    if (autoPlay && !inHostNow()) {
      const initialList = getFeedSlice(state, 'recommend').items
      if (initialList.length > 0) {
        playFromList('recommend', initialList, 0, { openFullscreen: false })
      }
    }
  }

  if (state.tab === 'recommend' || state.tab === 'jingxuan' || state.tab === 'follow' || state.tab === 'channels') {
    if (state.tab === 'follow' && state.signedIn === false) return
    const key = activeFeedKey(state.tab, state.channelId)
    const slice = getFeedSlice(state, key)
    if (slice.status === 'idle' || (slice.status === 'error' && slice.items.length === 0)) {
      requestFeedForKey(key, { isInitialRecommend: key === 'recommend' && !state.sessionStarted })
    }
  }
}

/** Backwards-compatible alias for `enterDouyin`. */
export function sendStart(): void {
  enterDouyin()
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  cancelPendingRequests()
  tabScrollTop.clear()
  send({ action: 'signOut' })
  const inHost = inHostNow()
  const previewVideos = inHost ? [] : MOCK_DOUYIN_VIDEOS
  useDouyin.setState({
    signedIn: false,
    profile: null,
    feeds: inHost
      ? {}
      : {
          recommend: {
            items: previewVideos,
            status: 'ready',
            refreshing: false,
            error: null,
            updatedAt: null,
          },
        },
    queue: inHost
      ? null
      : {
          source: 'recommend',
          items: previewVideos,
          index: 0,
          boundToFeed: true,
        },
    current: previewVideos[0] ?? null,
    playback: null,
    playbackError: null,
    playing: false,
    buffering: false,
    hostReady: !inHost,
    sessionStarted: false,
    userPaused: false,
  })
}

export function receiveState(
  signedIn: boolean | null,
  playing: boolean | null,
  signingIn: boolean,
  nickname?: string | null,
  avatar?: string | null,
): void {
  const prev = useDouyin.getState()
  const becameSignedIn = signedIn === true && prev.signedIn === false
  const profile: DouyinProfile | null = signedIn
    ? {
        nickname: nickname ?? prev.profile?.nickname ?? null,
        avatar: avatar ?? prev.profile?.avatar ?? null,
      }
    : null

  if (becameSignedIn && inHostNow()) {
    cancelPendingRequests()
    useDouyin.setState({
      signedIn,
      playing: false,
      signingIn,
      profile,
      feeds: {},
      queue: null,
      current: null,
      playback: null,
      playbackError: null,
      buffering: false,
      hostReady: false,
      sessionStarted: false,
      userPaused: false,
    })
    if (prev.sessionStarted) {
      enterDouyin()
    }
    return
  }

  useDouyin.setState({
    signedIn,
    playing: playing ?? prev.playing,
    signingIn,
    profile,
  })
}

function applyFeedVideos(key: string, rawVideos: DouyinVideo[]): void {
  const videos = dedupeVideos(rawVideos)
  if (videos.length === 0) return

  const state = useDouyin.getState()
  const nextFeeds: Record<string, DouyinFeedSlice> = {
    ...state.feeds,
    [key]: {
      items: videos,
      status: 'ready',
      refreshing: false,
      error: null,
      updatedAt: Date.now(),
    },
  }

  const patch: Partial<DouyinState> = { feeds: nextFeeds }

  // Extend active queue ONLY when it is still bound to this feed source (not detached by manual refresh).
  if (state.queue?.boundToFeed && state.queue.source === key) {
    const existingIds = new Set(state.queue.items.map((v) => v.id))
    const appended = videos.filter((v) => !existingIds.has(v.id))
    if (appended.length > 0) {
      let nextItems = [...state.queue.items, ...appended]
      let nextIndex = state.queue.index
      if (nextItems.length > MAX_QUEUE_ITEMS) {
        const overflow = nextItems.length - MAX_QUEUE_ITEMS
        const safeTrim = Math.max(0, Math.min(overflow, Math.max(0, nextIndex - 10)))
        if (safeTrim > 0) {
          nextItems = nextItems.slice(safeTrim)
          nextIndex -= safeTrim
        }
      }
      patch.queue = { ...state.queue, items: nextItems, index: nextIndex }
    }
  } else if (!state.current && !state.playback && !state.queue) {
    const browseKey = activeFeedKey(state.tab, state.channelId)
    if (key === browseKey && state.tab !== 'search' && state.tab !== 'library') {
      patch.current = videos[0] ?? null
    }
  }

  useDouyin.setState(patch)
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

  // Passive feed pushes (id === 0) hydrate the matching channel bucket regardless of which tab is currently open,
  // so background-fetched feeds are ready immediately when the user switches back.
  if (!failed && videos && videos.length > 0 && id === 0) {
    const state = useDouyin.getState()
    const key = channel || activeFeedKey(state.tab, state.channelId)
    if (isFeedSource(key)) {
      clearFeedTimer(key)
      applyFeedVideos(key, videos)
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
    useDouyin.setState({ playback: null, playing: false, buffering: false, playbackError: null })
    return
  }
  const now = performance.now()
  const state = useDouyin.getState()
  const matchedVideo = findVideoMetadata(state, playback.id)

  const isGenericTitle = (t?: string) => !t || t === '抖音精选短视频'
  const isGenericAuthor = (a?: string) => !a || a === '抖音创作者'

  const mergedCurrent: DouyinVideo = {
    id:
      (playback.id && playback.id !== 'dy_current' ? playback.id : undefined) ||
      matchedVideo?.id ||
      state.current?.id ||
      'dy_current',
    title:
      (!isGenericTitle(playback.title) ? playback.title : undefined) ||
      matchedVideo?.title ||
      (!isGenericTitle(state.current?.title) ? state.current?.title : undefined) ||
      playback.title ||
      '抖音精选短视频',
    author:
      (!isGenericAuthor(playback.author) ? playback.author : undefined) ||
      (!isGenericAuthor(playback.artist) ? playback.artist : undefined) ||
      matchedVideo?.author ||
      (!isGenericAuthor(state.current?.author) ? state.current?.author : undefined) ||
      '抖音创作者',
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

  const rawSource = playback.queueSource || playback.channel || state.queue?.source || 'recommend'
  const resolvedSource: DouyinQueueSource =
    rawSource === 'search' || rawSource === 'liked' || rawSource === 'history' || isFeedSource(rawSource)
      ? rawSource
      : 'recommend'

  // Keep active playback queue index & handoffs aligned with host truth without disturbing unrelated browsed tabs.
  let nextQueue = state.queue
  if (mergedCurrent.id !== 'dy_current') {
    const existingIdx = state.queue ? state.queue.items.findIndex((v) => v.id === mergedCurrent.id) : -1
    if (state.queue && existingIdx >= 0) {
      nextQueue = { ...state.queue, index: existingIdx }
    } else if (isFeedSource(resolvedSource)) {
      const feedItems = getFeedSlice(state, resolvedSource).items
      const idxInFeed = feedItems.findIndex((v) => v.id === mergedCurrent.id)
      if (idxInFeed >= 0) {
        nextQueue = {
          source: resolvedSource,
          items: feedItems,
          index: idxInFeed,
          boundToFeed: true,
        }
      } else if (!state.queue) {
        nextQueue = {
          source: resolvedSource,
          items: [mergedCurrent],
          index: 0,
          boundToFeed: true,
        }
      }
    } else if (!state.queue) {
      nextQueue = {
        source: resolvedSource,
        items: [mergedCurrent],
        index: 0,
        boundToFeed: false,
      }
    }
  }

  const resolvedHostReady = Boolean(playback.hostReady || playback.position > 0 || state.hostReady)
  const resolvedBuffering = Boolean(playback.buffering && !playback.error && playback.status !== 'paused')

  useDouyin.setState({
    playback: {
      ...playback,
      title: mergedCurrent.title,
      author: mergedCurrent.author,
      artist: mergedCurrent.author,
      at: now,
    },
    playing: playback.status === 'playing',
    hostReady: resolvedHostReady,
    buffering: resolvedBuffering,
    playbackError: playback.error ?? null,
    current: mergedCurrent,
    queue: nextQueue,
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

export async function loadFeed(
  channelOverride?: DouyinFeedKey,
  opts?: { epoch?: number; generation?: number },
): Promise<void> {
  const state = useDouyin.getState()
  const key = channelOverride ?? activeFeedKey(state.tab, state.channelId)
  const myGen = opts?.generation ?? sessionGeneration
  const myEpoch = opts?.epoch ?? nextFeedEpoch(key)
  clearFeedTimer(key)

  setFeedSlice(key, (prev) => ({
    ...prev,
    status: prev.items.length > 0 ? prev.status : 'loading',
    refreshing: prev.items.length > 0 ? true : prev.refreshing,
    error: null,
  }))

  const ans = await ask({ ask: 'feed', channel: key })
  if (myGen !== sessionGeneration || feedEpochs.get(key) !== myEpoch) return

  if (ans.failed) {
    setFeedSlice(key, (prev) => ({
      ...prev,
      status: prev.items.length > 0 ? 'ready' : 'error',
      refreshing: false,
      error: ans.error ?? '加载失败',
    }))
    return
  }

  if (ans.videos && ans.videos.length > 0) {
    applyFeedVideos(key, ans.videos)
  } else {
    setFeedSlice(key, (prev) => ({
      ...prev,
      status: prev.items.length > 0 ? 'ready' : 'ready',
      refreshing: false,
    }))
  }
}

function scheduleFeedFallback(key: DouyinFeedKey, epoch: number, generation: number): void {
  clearFeedTimer(key)
  if (!inHostNow()) {
    void loadFeed(key, { epoch, generation })
    return
  }
  const timer = setTimeout(() => {
    feedTimers.delete(key)
    if (generation !== sessionGeneration || feedEpochs.get(key) !== epoch) return
    const slice = getFeedSlice(useDouyin.getState(), key)
    if (slice.status === 'loading' || slice.refreshing || slice.items.length === 0) {
      void loadFeed(key, { epoch, generation })
    }
  }, FEED_FALLBACK_MS)
  feedTimers.set(key, timer)
}

function requestFeedForKey(key: DouyinFeedKey, opts?: { isInitialRecommend?: boolean }): void {
  const gen = sessionGeneration
  const epoch = nextFeedEpoch(key)
  setFeedSlice(key, (prev) => ({
    ...prev,
    status: prev.items.length > 0 ? prev.status : 'loading',
    error: null,
  }))
  if (!opts?.isInitialRecommend) {
    send({ action: 'channel', channel: key })
  }
  scheduleFeedFallback(key, epoch, gen)
}

export function selectTab(tab: DouyinTab): void {
  const state = useDouyin.getState()
  useDouyin.setState({ tab })
  if (tab === 'recommend' || tab === 'jingxuan' || tab === 'follow' || tab === 'channels') {
    if (tab === 'follow' && state.signedIn === false) return
    const key = activeFeedKey(tab, state.channelId)
    const slice = getFeedSlice(useDouyin.getState(), key)
    if (slice.status === 'idle' || (slice.status === 'error' && slice.items.length === 0)) {
      requestFeedForKey(key)
    }
  }
}

export function selectChannel(channelId: DouyinChannelId): void {
  useDouyin.setState({ tab: 'channels', channelId })
  const slice = getFeedSlice(useDouyin.getState(), channelId)
  if (slice.status === 'idle' || (slice.status === 'error' && slice.items.length === 0)) {
    requestFeedForKey(channelId)
  }
}

export function refreshFeed(): void {
  const state = useDouyin.getState()
  if (state.tab === 'library') return
  if (state.tab === 'search') {
    if (state.searchQuery.trim()) void search(state.searchQuery)
    return
  }
  if (state.tab === 'follow' && state.signedIn === false) return

  const key = activeFeedKey(state.tab, state.channelId)
  setTabScrollTop(key, 0)

  // Detach active play queue if refreshing the same source so active playback & queue stay intact.
  if (state.queue && state.queue.source === key && state.queue.boundToFeed) {
    useDouyin.setState({ queue: { ...state.queue, boundToFeed: false } })
  }

  if (!inHostNow()) {
    const existing = getFeedSlice(useDouyin.getState(), key).items
    const base = existing.length > 0 ? existing : MOCK_DOUYIN_VIDEOS
    const rotated = base.length > 1 ? [...base.slice(1), base[0]] : [...base]
    setFeedSlice(key, {
      items: rotated,
      status: 'ready',
      refreshing: false,
      error: null,
      updatedAt: Date.now(),
    })
    return
  }

  const gen = sessionGeneration
  const epoch = nextFeedEpoch(key)
  setFeedSlice(key, (prev) => ({
    ...prev,
    status: prev.items.length > 0 ? prev.status : 'loading',
    refreshing: true,
    error: null,
  }))
  send({ action: 'refresh', channel: key })
  scheduleFeedFallback(key, epoch, gen)
}

export async function search(query: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) return
  const myGen = sessionGeneration
  const myEpoch = ++searchEpoch
  setTabScrollTop('search', 0)

  useDouyin.setState((s) => ({
    tab: 'search',
    searchQuery: trimmed,
    searchStatus: 'loading',
    searchError: null,
    recentSearches: [trimmed, ...s.recentSearches.filter((q) => q !== trimmed)].slice(0, MAX_SEARCHES),
  }))

  const ans = await ask({ ask: 'search', query: trimmed })
  if (myGen !== sessionGeneration || myEpoch !== searchEpoch) return

  if (ans.failed) {
    useDouyin.setState({
      searchStatus: 'error',
      searchError: ans.error ?? '搜索失败',
    })
    return
  }

  useDouyin.setState({
    searchStatus: 'ready',
    searchError: null,
    searchResults: dedupeVideos(ans.videos ?? []),
  })
}

export function clearSearch(): void {
  searchEpoch++
  setTabScrollTop('search', 0)
  useDouyin.setState({ searchQuery: '', searchResults: [], searchStatus: 'idle', searchError: null })
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

function applyOptimisticPlay(targetVideo: DouyinVideo, queue: DouyinPlayQueue, openFullscreen: boolean): void {
  const state = useDouyin.getState()
  const inHost = inHostNow()
  const now = performance.now()
  useDouyin.setState({
    queue,
    current: targetVideo,
    userPaused: false,
    playbackError: null,
    hostReady: !inHost,
    buffering: inHost,
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
      channel: queue.source,
      queueSource: queue.source,
      at: now,
    },
    playing: true,
    ...(openFullscreen ? { open: true } : {}),
  })
  recordWatched(targetVideo)
}

export function playFromList(
  source: DouyinQueueSource,
  items: readonly DouyinVideo[],
  index: number,
  options?: { openFullscreen?: boolean; label?: string; boundToFeed?: boolean },
): void {
  const deduped = dedupeVideos(items)
  if (deduped.length === 0) return
  const safeIndex = Math.max(0, Math.min(deduped.length - 1, index))
  const targetVideo = deduped[safeIndex]
  const queue: DouyinPlayQueue = {
    source,
    label: options?.label,
    items: deduped,
    index: safeIndex,
    boundToFeed: options?.boundToFeed ?? isFeedSource(source),
  }
  send({
    action: 'play',
    video: targetVideo,
    index: safeIndex,
    source,
    queueIds: deduped.map((v) => v.id),
  })
  applyOptimisticPlay(targetVideo, queue, Boolean(options?.openFullscreen))
}

export function playFromQueueIndex(index: number, openFullscreen?: boolean): void {
  const state = useDouyin.getState()
  const queue = state.queue
  if (!queue || queue.items.length === 0) return
  const safeIndex = Math.max(0, Math.min(queue.items.length - 1, index))
  const targetVideo = queue.items[safeIndex]
  const nextQueue: DouyinPlayQueue = { ...queue, index: safeIndex }
  send({
    action: 'play',
    video: targetVideo,
    index: safeIndex,
    source: queue.source,
    queueIds: queue.items.map((v) => v.id),
  })
  applyOptimisticPlay(targetVideo, nextQueue, openFullscreen ?? state.open)
}

export function play(video?: DouyinVideo, index?: number, openFullscreen = false): void {
  const state = useDouyin.getState()
  const source = activeBrowseSource(state)
  const displayed = getDisplayedList(state)
  const label = source === 'search' ? state.searchQuery || undefined : undefined

  if (video) {
    const inDisplayed = displayed.findIndex((v) => v.id === video.id)
    if (inDisplayed >= 0) {
      playFromList(source, displayed, inDisplayed, { openFullscreen, label })
      return
    }
    if (state.queue) {
      const inQueue = state.queue.items.findIndex((v) => v.id === video.id)
      if (inQueue >= 0) {
        playFromQueueIndex(inQueue, openFullscreen)
        return
      }
    }
    const list = displayed.length > 0 ? [video, ...displayed.filter((v) => v.id !== video.id)] : [video]
    playFromList(source, list, typeof index === 'number' ? Math.max(0, Math.min(list.length - 1, index)) : 0, {
      openFullscreen,
      label,
    })
    return
  }

  if (state.queue && state.queue.items.length > 0) {
    playFromQueueIndex(typeof index === 'number' ? index : state.queue.index, openFullscreen)
    return
  }

  if (displayed.length > 0) {
    playFromList(source, displayed, typeof index === 'number' ? index : 0, { openFullscreen, label })
    return
  }

  send({ action: 'play' })
  useDouyin.setState({ userPaused: false, playbackError: null })
  show({ status: 'playing' })
  if (openFullscreen) useDouyin.setState({ open: true })
}

export function retryCurrent(): void {
  const state = useDouyin.getState()
  if (state.queue && state.queue.items.length > 0) {
    playFromQueueIndex(state.queue.index, state.open)
    return
  }
  if (state.current) {
    play(state.current, 0, state.open)
  }
}

function togglePlayback(automatic: boolean): void {
  const state = useDouyin.getState()
  const { playing, playback, current, queue } = state
  if (playing) {
    send({ action: 'pause' })
    useDouyin.setState({
      playing: false,
      buffering: false,
      ...(automatic ? {} : { userPaused: true }),
    })
    show({ status: 'paused' })
  } else if (playback) {
    send({ action: 'play' })
    useDouyin.setState({
      playbackError: null,
      ...(automatic ? {} : { userPaused: false }),
    })
    show({ status: 'playing' })
  } else if (queue && queue.items.length > 0) {
    playFromQueueIndex(queue.index, state.open)
  } else {
    const displayed = getDisplayedList(state)
    const fallback = current ?? displayed[0]
    if (fallback) {
      play(fallback, 0, state.open)
    }
  }
}

export function playOrPause(): void {
  togglePlayback(false)
}

export function pauseAutomatically(): void {
  const s = useDouyin.getState()
  if (s.playing || s.buffering) togglePlayback(true)
}

export function resumeAutomatically(): void {
  if (!useDouyin.getState().playing) togglePlayback(true)
}

export function skip(direction: 1 | -1): boolean {
  const state = useDouyin.getState()
  const inHost = inHostNow()
  const queue = state.queue

  // Bootstrap queue from current browsed list if none exists yet.
  if (!queue || queue.items.length === 0) {
    const displayed = getDisplayedList(state)
    if (displayed.length > 0) {
      const source = activeBrowseSource(state)
      const label = source === 'search' ? state.searchQuery || undefined : undefined
      playFromList(source, displayed, direction === 1 ? 0 : displayed.length - 1, {
        openFullscreen: state.open,
        label,
      })
      return true
    }
    if (!inHost) return false
    send({ action: direction === 1 ? 'next' : 'previous' })
    return true
  }

  const len = queue.items.length
  const curIdx =
    state.current?.id && queue.items.some((v) => v.id === state.current?.id)
      ? queue.items.findIndex((v) => v.id === state.current?.id)
      : Math.max(0, Math.min(len - 1, queue.index))

  const atEnd = direction === 1 && curIdx >= len - 1
  const feedQueue = isFeedSource(queue.source)

  // End-of-queue fallback for remote feeds:
  if (atEnd && feedQueue) {
    // 1) If queue was detached by manual refresh and fresh batch already arrived, hand off seamlessly!
    if (!queue.boundToFeed) {
      const freshItems = getFeedSlice(state, queue.source).items
      if (hasNovelVideos(freshItems, queue.items)) {
        playFromList(queue.source, freshItems, 0, { openFullscreen: state.open, boundToFeed: true })
        return true
      }
    }
    // 2) In host mode, let douyin.js attempt fallback incremental fetch (4.5s) or loop back to 0 without UI flicker.
    if (inHost) {
      useDouyin.setState({ buffering: true, playbackError: null, userPaused: false })
      send({ action: 'next' })
      return true
    }
  }

  // Single-item queue fallback: replay from start.
  if (len === 1) {
    replay()
    return true
  }

  // Deterministic index transition (non-end step, or finite list loop-around, or preview feed loop-around).
  const nextIdx = (curIdx + direction + len) % len
  const nextVid = queue.items[nextIdx]
  if (!inHost) {
    playFromQueueIndex(nextIdx, state.open)
    return true
  }

  send({ action: direction === 1 ? 'next' : 'previous' })
  useDouyin.setState({
    queue: { ...queue, index: nextIdx },
    current: nextVid,
    buffering: true,
    playbackError: null,
    userPaused: false,
  })
  return true
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
  useDouyin.setState({ userPaused: false, playbackError: null })
  show({ position: 0, status: 'playing' })
}

/** Transient volume change used by automatic game pause/resume fade; never overwrites saved user volume. */
export function applyFadeVolume(share: number): void {
  const clamped = Math.max(0, Math.min(1, share))
  send({ action: 'volume', percent: Math.round(clamped * 100) })
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
      : (findVideoMetadata(state, target) ?? state.current ?? undefined)
  const targetId = typeof target === 'string' ? target : (videoObj?.id ?? state.playback?.id)
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
  const targetId = typeof target === 'string' ? target : (target?.id ?? state.current?.id ?? state.playback?.id)
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
  if (!state.playback) {
    if (state.queue && state.queue.items.length > 0) {
      playFromQueueIndex(state.queue.index, true)
      return
    }
    if (state.current) {
      play(state.current, 0, true)
      return
    }
    const displayed = getDisplayedList(state)
    if (displayed[0]) {
      play(displayed[0], 0, true)
      return
    }
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

/**
 * Release all transient session data after 30s idle reclamation:
 * cancels pending asks/timers, clears remote tab caches, active queue, and playback state,
 * while preserving login profile, playback preferences, and persisted local library/search history.
 */
export function releaseResource(): void {
  cancelPendingRequests()
  tabScrollTop.clear()
  const before = useDouyin.getState()
  const inHost = inHostNow()
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
    ...buildInitialState(),
    ...kept,
    feeds: {},
    searchQuery: '',
    searchResults: [],
    searchStatus: 'idle',
    searchError: null,
    queue: null,
    current: null,
    playback: null,
    playbackError: null,
    playing: false,
    buffering: false,
    hostReady: !inHost,
    sessionStarted: false,
    userPaused: false,
    open: false,
    returnToPlayer: false,
    hole: null,
  })
}
