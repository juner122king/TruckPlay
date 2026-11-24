import { useMemo } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  postToHost,
  type XimalayaAlbum,
  type XimalayaAnswers,
  type XimalayaCategory,
  type XimalayaCommand,
  type XimalayaPlayback,
  type XimalayaTrack,
  type XimalayaUser,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { cancelRadioRequests, receiveRadioAnswer } from '../radio/api'
import { cancelXimalayaRequests, queryXimalaya, receiveXimalayaApiAnswer } from './api'

export type XimalayaTab = 'discover' | 'categories' | 'charts' | 'my' | 'search'
export type MySection = 'subscribed' | 'listened' | 'like' | 'buy'
export type PlaybackSpeed = 0.75 | 1.0 | 1.25 | 1.5 | 1.75 | 2.0
export type SleepTimerMode = null | 'episode' | 15 | 30 | 60
export type ChartCluster = 'free' | 'rise'

export type ExtendedXimalayaAlbum = XimalayaAlbum
export type ExtendedXimalayaTrack = XimalayaTrack

export interface AlbumProgress {
  trackId: string
  trackTitle: string
  episodeNumber?: number
  position: number
  duration: number
  updatedAt: number
}

export interface XimalayaState {
  liveQueue: ExtendedXimalayaTrack[]
  sessionRequestId: number | null
  /** Selected target withheld from the host while game or power controls pause it. */
  pendingPlaybackTrack: ExtendedXimalayaTrack | null
  signedIn: boolean | null
  signingIn: boolean
  user: XimalayaUser | null
  playing: boolean | null
  loading: boolean
  tab: XimalayaTab
  notice: string | null

  // Discover
  homeLoading: boolean
  homeError: string | null
  hotAlbums: ExtendedXimalayaAlbum[]
  riseAlbums: ExtendedXimalayaAlbum[]
  categories: XimalayaCategory[]

  // Categories
  selectedCategoryId: number
  categorySort: 1 | 2
  categoryPage: number
  categoryMaxPage: number
  categoryTotal: number
  categoryAlbums: ExtendedXimalayaAlbum[]
  categoryLoading: boolean
  categoryError: string | null

  // Charts
  chartCluster: ChartCluster
  chartCategoryCode: string
  chartAlbums: ExtendedXimalayaAlbum[]
  chartLoading: boolean
  chartError: string | null

  // Album detail
  selectedAlbum: ExtendedXimalayaAlbum | null
  albumTracks: ExtendedXimalayaTrack[]
  albumPage: number
  albumMaxPage: number
  albumTotalTracks: number
  albumAsc: boolean
  albumLoading: boolean
  albumError: string | null

  // Search
  hotWords: string[]
  searchQuery: string
  searchAlbums: ExtendedXimalayaAlbum[]
  searchTracks: ExtendedXimalayaTrack[]
  searching: boolean
  searchError: string | null

  // Playback & session
  playback: (XimalayaPlayback & { at: number; speed?: number }) | null
  nowPlaying: boolean
  volume: number
  playbackSpeed: PlaybackSpeed
  sleepTimerMode: SleepTimerMode
  sleepTimerEndsAt: number | null
  queue: ExtendedXimalayaTrack[]
  queueIndex: number

  // Local library & cloud My sections (subscribed / listened / like / buy)
  mySection: MySection
  myLoading: boolean
  myError: string | null
  myNeedLogin: boolean
  mySubscribed: ExtendedXimalayaAlbum[]
  mySubscribedPage: number
  mySubscribedMaxPage: number
  mySubscribedTotal: number
  myListened: ExtendedXimalayaTrack[]
  myLiked: ExtendedXimalayaTrack[]
  myLikedPage: number
  myLikedMaxPage: number
  myLikedTotal: number
  myBought: ExtendedXimalayaAlbum[]
  myBoughtPage: number
  myBoughtMaxPage: number
  myBoughtTotal: number
  favorites: ExtendedXimalayaAlbum[]
  history: ExtendedXimalayaTrack[]
  progressMap: Record<string, AlbumProgress>
}

export const DEFAULT_CATEGORIES: XimalayaCategory[] = [
  { id: 3, name: '有声书', code: 'youshengshu', group: '有声小说' },
  { id: 12, name: '相声评书', code: 'xiangsheng', group: '娱乐' },
  { id: 9, name: '历史', code: 'lishi', group: '知识' },
  { id: 8, name: '商业财经', code: 'shangye', group: '知识' },
  { id: 39, name: '人文', code: 'renwen', group: '知识' },
  { id: 2, name: '音乐', code: 'yinyue', group: '娱乐' },
  { id: 10, name: '情感生活', code: 'qinggan', group: '娱乐' },
  { id: 1, name: '头条', code: 'toutiao', group: '生活' },
  { id: 6, name: '儿童', code: 'ertong', group: '知识' },
  { id: 48, name: '段子', code: 'duanzi', group: '娱乐' },
  { id: 18, name: 'IT科技', code: 'keji', group: '知识' },
  { id: 46, name: '广播剧', code: 'guangbojv', group: '特色' },
]

export const CHART_CATEGORIES: readonly { code: string; name: string; en: string }[] = [
  { code: 'all', name: '全站', en: 'All' },
  { code: 'youshengshu', name: '有声书', en: 'Audiobooks' },
  { code: 'xiangsheng', name: '相声评书', en: 'Crosstalk' },
  { code: 'lishi', name: '历史', en: 'History' },
  { code: 'shangye', name: '商业财经', en: 'Business' },
  { code: 'renwen', name: '人文', en: 'Culture' },
  { code: 'yinyue', name: '音乐', en: 'Music' },
  { code: 'ertong', name: '儿童', en: 'Kids' },
]

export const DEFAULT_HOT_WORDS: string[] = [
  '郭德纲',
  '三体',
  '明朝那些事儿',
  '单田芳',
  '鬼吹灯',
  '凡人修仙传',
  '易中天',
  '盗墓笔记',
  '岳云鹏',
  '大奉打更人',
]

export const FALLBACK_ALBUMS: ExtendedXimalayaAlbum[] = [
  {
    id: 'xm-offline-1',
    title: '郭德纲于谦 相声经典珍藏',
    artist: '郭德纲 / 于谦',
    description: '长途解乏相声精选，包含经典对口与返场名段。',
    episodeCount: 120,
    playCount: '38.2亿',
    category: '相声评书',
    completed: true,
  },
  {
    id: 'xm-offline-2',
    title: '《三体》全集广播剧',
    artist: '729声工场 / 刘慈欣原著',
    description: '科幻史诗巨制，沉浸式音效还原红岸基地与黑暗森林。',
    episodeCount: 78,
    playCount: '15.6亿',
    category: '有声书',
    completed: true,
  },
  {
    id: 'xm-offline-3',
    title: '单田芳评书《白眉大侠》',
    artist: '单田芳',
    description: '经典评书全本，长途伴听佳作。',
    episodeCount: 320,
    playCount: '18.9亿',
    category: '相声评书',
    completed: true,
  },
  {
    id: 'xm-offline-4',
    title: '《明朝那些事儿》典藏版',
    artist: '当年明月 原著',
    description: '幽默通俗剖析三百年明朝兴衰史。',
    episodeCount: 96,
    playCount: '9.4亿',
    category: '历史',
    completed: true,
  },
]

const FAVORITES_KEY = 'westplay.ximalaya.favorites.v2'
const HISTORY_KEY = 'westplay.ximalaya.history.v2'
const PROGRESS_KEY = 'westplay.ximalaya.progress.v1'

function loadStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveStorage(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Storage quota is optional. */
  }
}

function loadInitialFavorites(): ExtendedXimalayaAlbum[] {
  const v2 = loadStorage<ExtendedXimalayaAlbum[] | null>(FAVORITES_KEY, null)
  if (v2) return v2
  // Migrate non-mock numeric albums from legacy storage if present
  const legacy = loadStorage<ExtendedXimalayaAlbum[]>('westplay.ximalaya.favorites', [])
  return legacy.filter((a) => /^\d+$/.test(String(a.id)))
}

function loadInitialHistory(): ExtendedXimalayaTrack[] {
  const v2 = loadStorage<ExtendedXimalayaTrack[] | null>(HISTORY_KEY, null)
  if (v2) return v2
  const legacy = loadStorage<ExtendedXimalayaTrack[]>('westplay.ximalaya.history', [])
  return legacy.filter((t) => /^\d+$/.test(String(t.id)))
}

export const useXimalaya = create<XimalayaState>(() => ({
  liveQueue: [],
  sessionRequestId: null,
  pendingPlaybackTrack: null,
  signedIn: typeof window !== 'undefined' && isInHost() ? null : false,
  signingIn: false,
  user: null,
  playing: false,
  loading: false,
  tab: 'discover',
  notice: null,

  homeLoading: false,
  homeError: null,
  hotAlbums: [],
  riseAlbums: [],
  categories: DEFAULT_CATEGORIES,

  selectedCategoryId: 3,
  categorySort: 1,
  categoryPage: 1,
  categoryMaxPage: 1,
  categoryTotal: 0,
  categoryAlbums: [],
  categoryLoading: false,
  categoryError: null,

  chartCluster: 'free',
  chartCategoryCode: 'all',
  chartAlbums: [],
  chartLoading: false,
  chartError: null,

  selectedAlbum: null,
  albumTracks: [],
  albumPage: 1,
  albumMaxPage: 1,
  albumTotalTracks: 0,
  albumAsc: true,
  albumLoading: false,
  albumError: null,

  hotWords: DEFAULT_HOT_WORDS,
  searchQuery: '',
  searchAlbums: [],
  searchTracks: [],
  searching: false,
  searchError: null,

  playback: null,
  nowPlaying: false,
  volume: 1,
  playbackSpeed: 1.0,
  sleepTimerMode: null,
  sleepTimerEndsAt: null,
  queue: [],
  queueIndex: 0,

  mySection: 'subscribed',
  myLoading: false,
  myError: null,
  myNeedLogin: false,
  mySubscribed: [],
  mySubscribedPage: 1,
  mySubscribedMaxPage: 1,
  mySubscribedTotal: 0,
  myListened: [],
  myLiked: [],
  myLikedPage: 1,
  myLikedMaxPage: 1,
  myLikedTotal: 0,
  myBought: [],
  myBoughtPage: 1,
  myBoughtMaxPage: 1,
  myBoughtTotal: 0,
  favorites: loadInitialFavorites(),
  history: loadInitialHistory(),
  progressMap: loadStorage<Record<string, AlbumProgress>>(PROGRESS_KEY, {}),
}))

let playbackSequence = 0
let homeSeq = 0
let categorySeq = 0
let chartSeq = 0
let albumSeq = 0
let searchSeq = 0
let mySeq = 0
let browserAudio: HTMLAudioElement | null = null
let sleepTimeout: ReturnType<typeof setTimeout> | null = null
let lastProgressPersistAt = 0

function clearSleepTimeout(): void {
  if (sleepTimeout) {
    clearTimeout(sleepTimeout)
    sleepTimeout = null
  }
}

function getBrowserAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined' || isInHost()) return null
  if (!browserAudio) {
    try {
      browserAudio = new Audio()
      browserAudio.preload = 'auto'
      browserAudio.addEventListener?.('ended', () => {
        const state = useXimalaya.getState()
        if (state.sleepTimerMode === 'episode') {
          setSleepTimer(null)
          pausePlayback()
          return
        }
        skip(1)
      })
      browserAudio.addEventListener?.('error', () => {
        useXimalaya.setState((s) => ({
          playing: false,
          playback: s.playback ? { ...s.playback, status: 'failed', error: '预览模式下无法直接解码该音频' } : null,
        }))
      })
    } catch {
      browserAudio = null
    }
  }
  return browserAudio
}

function send(command: XimalayaCommand): void {
  if (isInHost()) postToHost({ type: 'ximalaya', command })
}

export function sendStart(): void {
  send({ action: 'start' })
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  useXimalaya.setState({
    user: null,
    mySubscribed: [],
    myListened: [],
    myLiked: [],
    myBought: [],
    mySubscribedTotal: 0,
    myLikedTotal: 0,
    myBoughtTotal: 0,
    myNeedLogin: true,
  })
  send({ action: 'signOut' })
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  const before = useXimalaya.getState()
  useXimalaya.setState({
    signedIn,
    playing: before.playback ? before.playing : playing,
    signingIn,
    ...(signedIn
      ? { myNeedLogin: false }
      : {
          user: null,
          mySubscribed: [],
          myListened: [],
          myLiked: [],
          myBought: [],
        }),
  })
  if (signedIn && !before.signedIn) {
    void loadUserProfile()
    if (before.tab === 'my') {
      void loadMySection(before.mySection, 1, true)
    }
  }
}

export function receiveAnswer(id: number, answer: XimalayaAnswers): void
export function receiveAnswer(
  id: number,
  failed?: boolean,
  error?: string,
  tracks?: XimalayaTrack[],
  albums?: XimalayaAlbum[],
  radio?: { kind: string; data: unknown },
): void
export function receiveAnswer(
  id: number,
  answerOrFailed?: XimalayaAnswers | boolean,
  error?: string,
  tracks?: XimalayaTrack[],
  albums?: XimalayaAlbum[],
  radio?: { kind: string; data: unknown },
): void {
  const answer: XimalayaAnswers =
    typeof answerOrFailed === 'object' && answerOrFailed !== null
      ? answerOrFailed
      : { failed: Boolean(answerOrFailed), error, tracks, albums, radio }
  if (receiveRadioAnswer(id, answer.radio, answer.failed, answer.error)) return
  if (receiveXimalayaApiAnswer(id, answer)) return
  // Legacy fallback if an untracked id arrives
  if (!answer.failed && answer.albums?.length) {
    useXimalaya.setState({ hotAlbums: answer.albums })
  }
}

function recordProgress(playback: XimalayaPlayback | null): void {
  if (!playback || playback.owner === 'radio' || !playback.albumId || !playback.trackId) return
  if (playback.position < 3) return
  const now = Date.now()
  if (now - lastProgressPersistAt < 4000 && playback.status === 'playing') return
  lastProgressPersistAt = now
  const current = useXimalaya.getState()
  const activeTrack = current.queue[current.queueIndex]
  const next: Record<string, AlbumProgress> = {
    ...current.progressMap,
    [playback.albumId]: {
      trackId: playback.trackId,
      trackTitle: playback.title,
      episodeNumber: activeTrack?.episodeNumber,
      position: playback.position,
      duration: playback.duration,
      updatedAt: now,
    },
  }
  // Keep latest 80 albums
  const entries = Object.entries(next)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, 80)
  const pruned = Object.fromEntries(entries)
  saveStorage(PROGRESS_KEY, pruned)
  useXimalaya.setState({ progressMap: pruned })
}

export function receivePlayback(playback: XimalayaPlayback | null): void {
  const state = useXimalaya.getState()
  if (playback?.requestId != null && state.sessionRequestId != null && playback.requestId !== state.sessionRequestId)
    return
  if (playback && playback.owner !== 'radio' && playback.status === 'ended') {
    if (state.playback?.status !== 'ended') {
      useXimalaya.setState({ playback: { ...playback, at: performance.now() }, playing: false })
      if (state.sleepTimerMode === 'episode') {
        setSleepTimer(null)
        return
      }
      skip(1)
    }
    return
  }
  useXimalaya.setState({
    playback: playback ? { ...playback, at: performance.now(), speed: state.playbackSpeed } : null,
    playing: playback ? playback.status === 'playing' : false,
    ...(playback ? {} : { nowPlaying: false }),
  })
  if (playback && playback.owner !== 'radio') {
    recordProgress(playback)
  }
}

export function positionOf(playback: XimalayaState['playback'], now: number): number {
  if (!playback || playback.isLive) return 0
  const speed = playback.speed || 1.0
  const run = playback.status === 'playing' ? ((now - playback.at) / 1000) * speed : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, Math.max(0, playback.position + run))
}

function show(change: Partial<XimalayaPlayback & { speed?: number }>): void {
  const { playback, playbackSpeed } = useXimalaya.getState()
  if (!playback) return
  const now = performance.now()
  useXimalaya.setState({
    playback: {
      ...playback,
      position: positionOf(playback, now),
      at: now,
      speed: playbackSpeed,
      ...change,
    },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

export async function loadHome(force = false): Promise<void> {
  const state = useXimalaya.getState()
  if (!force && state.hotAlbums.length > 0 && !state.homeError) return
  const seq = ++homeSeq
  useXimalaya.setState({ homeLoading: true, homeError: null })
  try {
    const answer = await queryXimalaya({ ask: 'home' })
    if (seq !== homeSeq) return
    const hotAlbums = answer.albums?.length ? answer.albums : FALLBACK_ALBUMS
    const riseAlbums = answer.riseAlbums ?? []
    const categories = answer.categories?.length ? answer.categories : DEFAULT_CATEGORIES
    useXimalaya.setState({
      hotAlbums,
      riseAlbums,
      categories,
      homeLoading: false,
      homeError: null,
    })
  } catch (err) {
    if (seq !== homeSeq) return
    const offline = String(err instanceof Error ? err.message : err) === 'Offline preview'
    useXimalaya.setState({
      hotAlbums: state.hotAlbums.length ? state.hotAlbums : FALLBACK_ALBUMS,
      riseAlbums: state.riseAlbums.length ? state.riseAlbums : FALLBACK_ALBUMS.slice().reverse(),
      homeLoading: false,
      homeError: offline ? null : String(err instanceof Error ? err.message : err),
    })
  }
}

export async function loadCategory(
  categoryId = useXimalaya.getState().selectedCategoryId,
  sort: 1 | 2 = useXimalaya.getState().categorySort,
  page = 1,
): Promise<void> {
  const seq = ++categorySeq
  useXimalaya.setState({
    selectedCategoryId: categoryId,
    categorySort: sort,
    categoryPage: page,
    categoryLoading: true,
    categoryError: null,
  })
  try {
    const answer = await queryXimalaya({ ask: 'category', categoryId, sort, page })
    if (seq !== categorySeq) return
    useXimalaya.setState({
      categoryAlbums: answer.albums ?? [],
      categoryTotal: answer.totalCount ?? answer.albums?.length ?? 0,
      categoryPage: answer.page ?? page,
      categoryMaxPage: answer.maxPage ?? 1,
      categoryLoading: false,
      categoryError: null,
    })
  } catch (err) {
    if (seq !== categorySeq) return
    const offline = String(err instanceof Error ? err.message : err) === 'Offline preview'
    useXimalaya.setState({
      categoryAlbums: offline ? FALLBACK_ALBUMS : useXimalaya.getState().categoryAlbums,
      categoryLoading: false,
      categoryError: offline ? null : String(err instanceof Error ? err.message : err),
    })
  }
}

export async function loadChart(
  cluster: ChartCluster = useXimalaya.getState().chartCluster,
  categoryCode = useXimalaya.getState().chartCategoryCode,
  page = 1,
): Promise<void> {
  const seq = ++chartSeq
  useXimalaya.setState({
    chartCluster: cluster,
    chartCategoryCode: categoryCode,
    chartLoading: true,
    chartError: null,
  })
  try {
    const answer = await queryXimalaya({ ask: 'rank', cluster, categoryCode, page })
    if (seq !== chartSeq) return
    useXimalaya.setState({
      chartAlbums: answer.albums ?? [],
      chartLoading: false,
      chartError: null,
    })
  } catch (err) {
    if (seq !== chartSeq) return
    const offline = String(err instanceof Error ? err.message : err) === 'Offline preview'
    useXimalaya.setState({
      chartAlbums: offline ? FALLBACK_ALBUMS : useXimalaya.getState().chartAlbums,
      chartLoading: false,
      chartError: offline ? null : String(err instanceof Error ? err.message : err),
    })
  }
}

export async function loadHotSearch(): Promise<void> {
  try {
    const answer = await queryXimalaya({ ask: 'hotSearch' })
    if (answer.hotWords?.length) {
      useXimalaya.setState({ hotWords: answer.hotWords })
    }
  } catch {
    /* Keep default hot words on error. */
  }
}

export async function loadUserProfile(): Promise<void> {
  try {
    const answer = await queryXimalaya({ ask: 'userProfile' })
    if (answer.user) useXimalaya.setState({ user: answer.user })
  } catch {
    /* Optional user profile enrichment. */
  }
}

export async function loadMySection(
  section: MySection = useXimalaya.getState().mySection,
  page = 1,
  force = false,
): Promise<void> {
  const state = useXimalaya.getState()
  if (!force && page === 1 && !state.myError) {
    if (section === 'subscribed' && state.mySubscribed.length > 0) return
    if (section === 'listened' && state.myListened.length > 0) return
    if (section === 'like' && state.myLiked.length > 0) return
    if (section === 'buy' && state.myBought.length > 0) return
  }
  const seq = ++mySeq
  useXimalaya.setState({ mySection: section, myLoading: true, myError: null })
  try {
    const answer = await queryXimalaya({ ask: 'mySection', section, page })
    if (seq !== mySeq) return
    if (answer.needLogin) {
      useXimalaya.setState({ myLoading: false, myNeedLogin: true, myError: null })
      return
    }
    if (section === 'subscribed') {
      useXimalaya.setState({
        mySubscribed: answer.albums ?? [],
        mySubscribedPage: answer.page ?? page,
        mySubscribedMaxPage: answer.maxPage ?? 1,
        mySubscribedTotal: answer.totalCount ?? answer.albums?.length ?? 0,
        myLoading: false,
        myNeedLogin: false,
        myError: null,
      })
    } else if (section === 'listened') {
      useXimalaya.setState({
        myListened: answer.tracks ?? [],
        myLoading: false,
        myNeedLogin: false,
        myError: null,
      })
    } else if (section === 'like') {
      useXimalaya.setState({
        myLiked: answer.tracks ?? [],
        myLikedPage: answer.page ?? page,
        myLikedMaxPage: answer.maxPage ?? 1,
        myLikedTotal: answer.totalCount ?? answer.tracks?.length ?? 0,
        myLoading: false,
        myNeedLogin: false,
        myError: null,
      })
    } else if (section === 'buy') {
      useXimalaya.setState({
        myBought: answer.albums ?? [],
        myBoughtPage: answer.page ?? page,
        myBoughtMaxPage: answer.maxPage ?? 1,
        myBoughtTotal: answer.totalCount ?? answer.albums?.length ?? 0,
        myLoading: false,
        myNeedLogin: false,
        myError: null,
      })
    }
  } catch (err) {
    if (seq !== mySeq) return
    const offline = String(err instanceof Error ? err.message : err) === 'Offline preview'
    useXimalaya.setState({
      myLoading: false,
      myNeedLogin: offline ? true : useXimalaya.getState().myNeedLogin,
      myError: offline ? null : String(err instanceof Error ? err.message : err),
    })
  }
}

export function selectMySection(section: MySection): void {
  useXimalaya.setState({ mySection: section, myError: null })
  void loadMySection(section, 1, false)
}

export function selectTab(tab: XimalayaTab): void {
  useXimalaya.setState({ tab, selectedAlbum: null })
  const state = useXimalaya.getState()
  if (tab === 'discover') {
    void loadHome()
  } else if (tab === 'categories') {
    if (!state.categoryAlbums.length) void loadCategory(state.selectedCategoryId, state.categorySort, 1)
  } else if (tab === 'charts') {
    if (!state.chartAlbums.length) void loadChart(state.chartCluster, state.chartCategoryCode, 1)
  } else if (tab === 'my') {
    void loadMySection(state.mySection, 1, false)
  } else if (tab === 'search') {
    void loadHotSearch()
  }
}

export function openCategoryById(categoryId: number): void {
  useXimalaya.setState({ tab: 'categories', selectedAlbum: null })
  void loadCategory(categoryId, useXimalaya.getState().categorySort, 1)
}

function buildOfflineTracks(album: ExtendedXimalayaAlbum): ExtendedXimalayaTrack[] {
  return [1, 2, 3].map((n) => ({
    id: `${album.id}-ep-${n}`,
    title: `${album.title} - 第0${n}集`,
    artist: album.artist,
    album: album.title,
    albumId: album.id,
    artwork: album.artwork,
    duration: 1800 + n * 180,
    episodeNumber: n,
  }))
}

async function fetchAlbumTracksPage(album: ExtendedXimalayaAlbum, page: number, asc: boolean): Promise<ExtendedXimalayaTrack[]> {
  const seq = ++albumSeq
  useXimalaya.setState({
    albumPage: page,
    albumAsc: asc,
    albumLoading: true,
    albumError: null,
  })
  const isNumeric = /^\d+$/.test(String(album.id))
  if (!isNumeric) {
    const list = buildOfflineTracks(album)
    useXimalaya.setState({
      albumTracks: list,
      albumTotalTracks: list.length,
      albumMaxPage: 1,
      albumLoading: false,
      albumError: null,
    })
    return list
  }
  try {
    const [tracksRes, detailRes] = await Promise.allSettled([
      queryXimalaya({ ask: 'albumTracks', albumId: album.id, page, asc }),
      page === 1 && !album.description
        ? queryXimalaya({ ask: 'albumDetail', albumId: album.id })
        : Promise.resolve<XimalayaAnswers>({}),
    ])
    if (seq !== albumSeq) return []
    if (detailRes.status === 'fulfilled' && detailRes.value.album) {
      const merged: ExtendedXimalayaAlbum = {
        ...album,
        ...detailRes.value.album,
        artwork: detailRes.value.album.artwork || album.artwork,
        description: detailRes.value.album.description || album.description,
      }
      useXimalaya.setState((s) => (s.selectedAlbum?.id === album.id ? { selectedAlbum: merged } : {}))
    }
    if (tracksRes.status === 'rejected') throw tracksRes.reason
    const ans = tracksRes.value
    const list = ans.tracks ?? []
    useXimalaya.setState({
      albumTracks: list,
      albumTotalTracks: ans.totalCount ?? list.length,
      albumPage: ans.page ?? page,
      albumMaxPage: ans.maxPage ?? 1,
      albumLoading: false,
      albumError: null,
    })
    return list
  } catch (err) {
    if (seq !== albumSeq) return []
    const offline = String(err instanceof Error ? err.message : err) === 'Offline preview'
    if (offline) {
      const list = buildOfflineTracks(album)
      useXimalaya.setState({
        albumTracks: list,
        albumTotalTracks: list.length,
        albumMaxPage: 1,
        albumLoading: false,
        albumError: null,
      })
      return list
    }
    useXimalaya.setState({
      albumLoading: false,
      albumError: String(err instanceof Error ? err.message : err),
    })
    return []
  }
}

export function selectAlbum(album: ExtendedXimalayaAlbum): void {
  useXimalaya.setState({
    selectedAlbum: album,
    albumTracks: [],
    albumPage: 1,
    albumMaxPage: 1,
    albumTotalTracks: album.episodeCount ?? 0,
    albumAsc: true,
    albumError: null,
  })
  void fetchAlbumTracksPage(album, 1, true)
}

export function loadAlbumPage(page: number): void {
  const { selectedAlbum, albumAsc } = useXimalaya.getState()
  if (!selectedAlbum) return
  void fetchAlbumTracksPage(selectedAlbum, page, albumAsc)
}

export function toggleAlbumOrder(): void {
  const { selectedAlbum, albumAsc } = useXimalaya.getState()
  if (!selectedAlbum) return
  void fetchAlbumTracksPage(selectedAlbum, 1, !albumAsc)
}

export function backToBrowse(): void {
  ++albumSeq
  useXimalaya.setState({ selectedAlbum: null, albumTracks: [], albumError: null, albumLoading: false })
}

export async function playAlbum(album: ExtendedXimalayaAlbum, startIndex = 0): Promise<void> {
  const state = useXimalaya.getState()
  if (state.selectedAlbum?.id === album.id && state.albumTracks.length > 0) {
    const target = state.albumTracks[startIndex] || state.albumTracks[0]
    if (target) play(target, state.albumTracks)
    return
  }
  useXimalaya.setState({
    selectedAlbum: album,
    albumTracks: [],
    albumPage: 1,
    albumMaxPage: 1,
    albumTotalTracks: album.episodeCount ?? 0,
    albumAsc: true,
  })
  const tracks = await fetchAlbumTracksPage(album, 1, true)
  const target = tracks[startIndex] || tracks[0]
  if (target) play(target, tracks)
}

/** Shared playback session. Radio never mutates the on-demand queue or preferences. */
export function play(track?: ExtendedXimalayaTrack, queue?: ExtendedXimalayaTrack[], startAt?: number): void {
  const state = useXimalaya.getState()
  if (!track && state.pendingPlaybackTrack) {
    play(state.pendingPlaybackTrack, state.playback?.isLive ? state.liveQueue : state.queue)
    return
  }
  const requestId = ++playbackSequence
  if (!track) {
    useXimalaya.setState({ sessionRequestId: requestId })
    if (state.playback?.isLive) show({ status: 'loading', error: null })
    if (useXimalaya.getState().sessionRequestId !== requestId) return
    send({ action: 'play', requestId })
    if (state.playback?.isLive) return
    getBrowserAudio()
      ?.play?.()
      .catch(() => {})
    if (!isInHost()) show({ status: 'playing', error: null })
    return
  }

  const targetTrack: ExtendedXimalayaTrack = {
    ...track,
    url: track.radio ? undefined : track.url,
  }
  const newQueue = queue?.length ? queue.slice() : state.queue.length ? state.queue : [targetTrack]
  const history = targetTrack.radio
    ? state.history
    : [targetTrack, ...state.history.filter((h) => h.id !== targetTrack.id)].slice(0, 50)
  if (!targetTrack.radio) {
    saveStorage(HISTORY_KEY, history)
  } else {
    clearSleepTimeout()
  }

  const resumePos = typeof startAt === 'number' && startAt > 0 ? startAt : 0
  const inHost = isInHost()
  const previewNeedsHost = !inHost && !targetTrack.radio && !targetTrack.url

  useXimalaya.setState({
    sessionRequestId: requestId,
    pendingPlaybackTrack: targetTrack,
    notice: previewNeedsHost ? 'host' : state.notice,
    playback: {
      title: targetTrack.title,
      artist: targetTrack.artist,
      artwork: targetTrack.artwork,
      duration: targetTrack.radio ? 0 : targetTrack.duration || 1800,
      position: resumePos,
      status: inHost ? 'loading' : 'playing',
      at: performance.now(),
      speed: targetTrack.radio ? 1 : state.playbackSpeed,
      owner: targetTrack.radio ? 'radio' : 'ximalaya',
      trackId: targetTrack.radio ? undefined : targetTrack.id,
      albumId: targetTrack.radio ? undefined : targetTrack.albumId,
      radioId: targetTrack.radioId,
      isLive: Boolean(targetTrack.radio),
      requestId,
      error: null,
    },
    playing: !inHost,
    nowPlaying: !targetTrack.radio,
    history,
    ...(targetTrack.radio
      ? { liveQueue: newQueue, sleepTimerMode: null, sleepTimerEndsAt: null }
      : {
          queue: newQueue,
          queueIndex: Math.max(
            0,
            newQueue.findIndex((t) => t.id === track.id),
          ),
        }),
  })
  if (useXimalaya.getState().sessionRequestId !== requestId) return
  send({ action: 'speed', rate: targetTrack.radio ? 1 : state.playbackSpeed })
  send({ action: 'volume', percent: Math.round(state.volume * 100) })
  send({ action: 'play', track: targetTrack, requestId })
  if (resumePos > 0 && !targetTrack.radio) {
    send({ action: 'seek', seconds: resumePos })
  }
  if (useXimalaya.getState().sessionRequestId === requestId) useXimalaya.setState({ pendingPlaybackTrack: null })

  const audio = getBrowserAudio()
  if (audio && !targetTrack.radio && targetTrack.url) {
    audio.pause?.()
    audio.src = targetTrack.url
    audio.playbackRate = state.playbackSpeed
    audio.volume = state.volume
    if (resumePos > 0) {
      try {
        audio.currentTime = resumePos
      } catch {
        /* Seek after metadata if needed. */
      }
    }
    audio.play?.().catch(() => {})
  }
}

export function pausePlayback(): void {
  const { playback } = useXimalaya.getState()
  const requestId = ++playbackSequence
  const now = performance.now()
  const nextPlayback = playback
    ? { ...playback, requestId, position: positionOf(playback, now), at: now, status: 'paused' }
    : null
  useXimalaya.setState({
    sessionRequestId: requestId,
    playing: false,
    playback: nextPlayback,
  })
  if (nextPlayback && nextPlayback.owner !== 'radio') {
    lastProgressPersistAt = 0
    recordProgress(nextPlayback)
  }
  send(playback ? { action: 'pause', requestId } : { action: 'pause' })
  getBrowserAudio()?.pause?.()
}

export function playOrPause(): void {
  const { playing, playback } = useXimalaya.getState()
  if (playing || playback?.status === 'loading') pausePlayback()
  else play()
}

export function skip(direction: 1 | -1): void {
  const state = useXimalaya.getState()
  const live = state.playback?.owner === 'radio'
  const queue = live ? state.liveQueue : state.queue
  const index = live ? queue.findIndex((t) => t.radioId === state.playback?.radioId) : state.queueIndex
  if (queue.length) play(queue[(index + direction + queue.length) % queue.length], queue)
  else send({ action: direction === 1 ? 'next' : 'previous' })
}

export function seek(seconds: number): void {
  if (useXimalaya.getState().playback?.isLive) return
  const clamped = Math.max(0, seconds)
  send({ action: 'seek', seconds: clamped })
  const audio = getBrowserAudio()
  if (audio) {
    try {
      audio.currentTime = clamped
    } catch {
      /* ignore */
    }
  }
  show({ position: clamped })
}

export function skipSeconds(delta: number): void {
  const { playback } = useXimalaya.getState()
  if (!playback || playback.isLive) return
  const current = positionOf(playback, performance.now())
  const target = Math.max(0, Math.min(playback.duration || 3600, current + delta))
  seek(target)
}

export function setPlaybackSpeed(speed: PlaybackSpeed): void {
  if (useXimalaya.getState().playback?.isLive) return
  send({ action: 'speed', rate: speed })
  useXimalaya.setState({ playbackSpeed: speed })
  const audio = getBrowserAudio()
  if (audio) {
    try {
      audio.playbackRate = speed
    } catch {
      /* ignore */
    }
  }
  show({ speed })
}

export function cyclePlaybackSpeed(): void {
  const speeds: PlaybackSpeed[] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
  const current = useXimalaya.getState().playbackSpeed
  const idx = speeds.indexOf(current)
  setPlaybackSpeed(speeds[(idx + 1) % speeds.length])
}

export function setSleepTimer(mode: SleepTimerMode): void {
  clearSleepTimeout()
  if (mode === null) {
    useXimalaya.setState({ sleepTimerMode: null, sleepTimerEndsAt: null })
    return
  }
  if (mode === 'episode') {
    useXimalaya.setState({ sleepTimerMode: 'episode', sleepTimerEndsAt: null })
    return
  }
  const ms = mode * 60 * 1000
  const endsAt = Date.now() + ms
  useXimalaya.setState({ sleepTimerMode: mode, sleepTimerEndsAt: endsAt })
  sleepTimeout = setTimeout(() => {
    sleepTimeout = null
    useXimalaya.setState({ sleepTimerMode: null, sleepTimerEndsAt: null })
    const cur = useXimalaya.getState()
    if (cur.playback && cur.playback.owner !== 'radio' && cur.playing) {
      pausePlayback()
    }
  }, ms)
}

export function cycleSleepTimer(): void {
  const order: SleepTimerMode[] = [null, 'episode', 15, 30, 60]
  const current = useXimalaya.getState().sleepTimerMode
  const idx = order.indexOf(current)
  setSleepTimer(order[(idx + 1) % order.length])
}

export function sendVolume(percent: number): void {
  const bounded = Math.max(0, Math.min(1, percent))
  useXimalaya.setState({ volume: bounded })
  sendPlaybackVolume(bounded)
}

export function sendPlaybackVolume(percent: number): void {
  const bounded = Math.max(0, Math.min(1, percent))
  send({ action: 'volume', percent: Math.round(bounded * 100) })
  const audio = getBrowserAudio()
  if (audio) {
    try {
      audio.volume = bounded
    } catch {
      /* ignore */
    }
  }
}

export function setNowPlaying(open: boolean): void {
  useXimalaya.setState({ nowPlaying: open })
}

export function toggleFavorite(album: ExtendedXimalayaAlbum): void {
  const { favorites } = useXimalaya.getState()
  const exists = favorites.some((f) => f.id === album.id)
  const next = exists ? favorites.filter((f) => f.id !== album.id) : [album, ...favorites]
  saveStorage(FAVORITES_KEY, next)
  useXimalaya.setState({ favorites: next })
}

export function clearHistory(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* ignore */
  }
  useXimalaya.setState({ history: [] })
}

export async function search(query: string): Promise<void> {
  const clean = query.trim()
  if (!clean) return
  const seq = ++searchSeq
  useXimalaya.setState({ searchQuery: clean, searching: true, searchError: null })
  try {
    const answer = await queryXimalaya({ ask: 'search', query: clean, page: 1 })
    if (seq !== searchSeq) return
    useXimalaya.setState({
      searchAlbums: answer.albums ?? [],
      searchTracks: answer.tracks ?? [],
      searching: false,
      searchError: null,
    })
  } catch (err) {
    if (seq !== searchSeq) return
    const offline = String(err instanceof Error ? err.message : err) === 'Offline preview'
    if (offline) {
      const qLower = clean.toLowerCase()
      const albums = FALLBACK_ALBUMS.filter(
        (a) => a.title.toLowerCase().includes(qLower) || a.artist.toLowerCase().includes(qLower),
      )
      const tracks = albums.flatMap(buildOfflineTracks)
      useXimalaya.setState({ searchAlbums: albums, searchTracks: tracks, searching: false, searchError: null })
      return
    }
    useXimalaya.setState({
      searching: false,
      searchError: String(err instanceof Error ? err.message : err),
    })
  }
}

export function clearSearch(): void {
  ++searchSeq
  useXimalaya.setState({
    searchQuery: '',
    searchAlbums: [],
    searchTracks: [],
    searching: false,
    searchError: null,
  })
}

export function useXimalayaSource(): { source: MediaSource; artwork: string | null; radio: boolean } | null {
  const playback = useXimalaya((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      radio: playback.owner === 'radio',
      source: {
        id: 'westplay-ximalaya',
        service: 'ximalaya',
        title: playback.title,
        artist: playback.artist,
        album: playback.owner === 'radio' ? 'Radio · LIVE' : '喜马拉雅',
        live: playback.owner === 'radio',
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

/** Release session data while keeping login and player preferences. */
export function releaseResource(): void {
  clearSleepTimeout()
  cancelRadioRequests()
  cancelXimalayaRequests()
  void import('../radio/radio').then((m) => m.resetRadioSession())
  if (browserAudio) {
    try {
      browserAudio.pause?.()
      browserAudio.src = ''
    } catch {
      /* ignore */
    }
  }
  const before = useXimalaya.getState()
  const kept = {
    signedIn: before.signedIn,
    user: before.user,
    volume: before.volume,
    playbackSpeed: before.playbackSpeed,
    favorites: before.favorites,
    history: before.history,
    progressMap: before.progressMap,
  }
  useXimalaya.setState({ ...useXimalaya.getInitialState(), ...kept })
}
