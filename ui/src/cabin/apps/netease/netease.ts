import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  type NeteaseArtist,
  type NeteaseCommand,
  type NeteasePlayback,
  type NeteasePlaylist,
  type NeteaseQuestion,
  type NeteaseRadio,
  type NeteaseTrack,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import {
  CAR_FAV_TRACKS,
  CHARTS,
  DEFAULT_USER_ARTISTS,
  DEFAULT_USER_PLAYLISTS,
  DEFAULT_USER_RADIOS,
  DISCOVER_CATEGORIES,
  EDM_TRACKS,
  FOLK_TRACKS,
  getFallbackTracksForArtist,
  getFallbackTracksForPlaylist,
  getFallbackTracksForRadio,
  HIGHWAY_TRACKS,
  HOT_SEARCH_TAGS,
  MOCK_RECOMMENDED_PLAYLISTS,
  MOCK_TRACKS,
  type NeteaseCategory,
  ORIGINAL_TRACKS,
  PREVIEW_USER_PROFILE,
  ROCK_TRACKS,
  SOARING_TRACKS,
} from './mock'

export {
  CAR_FAV_TRACKS,
  CHARTS,
  DEFAULT_USER_ARTISTS,
  DEFAULT_USER_PLAYLISTS,
  DEFAULT_USER_RADIOS,
  DISCOVER_CATEGORIES,
  EDM_TRACKS,
  FOLK_TRACKS,
  getFallbackTracksForArtist,
  getFallbackTracksForPlaylist,
  getFallbackTracksForRadio,
  HIGHWAY_TRACKS,
  HOT_SEARCH_TAGS,
  MOCK_RECOMMENDED_PLAYLISTS,
  MOCK_TRACKS,
  type NeteaseCategory,
  ORIGINAL_TRACKS,
  PREVIEW_USER_PROFILE,
  ROCK_TRACKS,
  SOARING_TRACKS,
}

export type NeteaseTab = 'recommend' | 'discover' | 'roaming' | 'my' | 'search'
export type MyCategory = 'all' | 'created' | 'collected' | 'radio' | 'artist'
export type CollectionKind = 'playlist' | 'radio' | 'artist'
export type NeteasePlayMode = 'loop' | 'shuffle' | 'single'

export interface UserProfile {
  nickname: string
  avatarUrl?: string
  vipType?: number
}

export interface PlaybackNotice {
  trackId: string
  title: string
  reason: 'vip_required' | 'unavailable'
  skippedTo?: string
}

export interface NeteaseState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  tracks: NeteaseTrack[]
  playlists: NeteasePlaylist[]
  radios: NeteaseRadio[]
  artists: NeteaseArtist[]
  recommendedPlaylists: NeteasePlaylist[]
  currentPlaylist: NeteasePlaylist | null
  currentCollectionKind: CollectionKind
  currentCollectionSubtitle?: string
  tab: NeteaseTab
  myCategory: MyCategory
  discoverChartId: string
  searchQuery: string
  loading: boolean
  playback: (NeteasePlayback & { at: number }) | null
  playbackNotice: PlaybackNotice | null
  nowPlaying: boolean
  direction: 1 | -1
  volume: number
  lyrics?: string
  playMode: NeteasePlayMode
  queue: NeteaseTrack[]
  queueIndex: number
  queueOpen: boolean
  likedTrackIds: string[]
  userProfile: UserProfile | null
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

export const useNetease = create<NeteaseState>(() => ({
  signedIn: IN_HOST ? null : true,
  signingIn: false,
  playing: false,
  tracks: MOCK_TRACKS,
  playlists: DEFAULT_USER_PLAYLISTS,
  radios: DEFAULT_USER_RADIOS,
  artists: DEFAULT_USER_ARTISTS,
  recommendedPlaylists: MOCK_RECOMMENDED_PLAYLISTS,
  currentPlaylist: null,
  currentCollectionKind: 'playlist',
  currentCollectionSubtitle: undefined,
  tab: 'recommend',
  myCategory: 'all',
  discoverChartId: '3778678',
  searchQuery: '',
  loading: false,
  playback: {
    title: MOCK_TRACKS[1].title,
    artist: MOCK_TRACKS[1].artist,
    artwork: MOCK_TRACKS[1].artwork,
    duration: MOCK_TRACKS[1].duration ?? 215,
    position: 28,
    status: 'paused',
    trackId: MOCK_TRACKS[1].id,
    at: performance.now(),
  },
  playbackNotice: null,
  nowPlaying: false,
  direction: 1,
  volume: 1,
  playMode: 'loop',
  queue: MOCK_TRACKS,
  queueIndex: 1,
  queueOpen: false,
  likedTrackIds: ['1413585838', '186016'],
  userProfile: IN_HOST ? null : PREVIEW_USER_PROFILE,
}))

type AskKind =
  | 'recommend'
  | 'chart'
  | 'roaming'
  | 'userPlaylists'
  | 'userRadios'
  | 'userArtists'
  | 'search'
  | 'playlistTracks'
  | 'radioPrograms'
  | 'artistSongs'

interface InFlightAsk {
  kind: AskKind
  playlistId?: string
}

let nextAskId = 100
const inFlightAsks = new Map<number, InFlightAsk>()
let latestRecommendAskId = 0
let latestUserPlaylistsAskId = 0
let latestUserRadiosAskId = 0
let latestUserArtistsAskId = 0
let latestTabTracksAskId = 0
let latestPlaylistTracksAskId = 0
let savedTabTracks: NeteaseTrack[] | null = null

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function send(command: NeteaseCommand): void {
  if (isInHost()) postToHost({ type: 'netease', command })
}

function sendAsk(question: NeteaseQuestion, kind: AskKind, playlistId?: string): number {
  const id = nextAskId++
  inFlightAsks.set(id, { kind, playlistId })
  if (kind === 'recommend') latestRecommendAskId = id
  if (kind === 'userPlaylists') latestUserPlaylistsAskId = id
  if (kind === 'userRadios') latestUserRadiosAskId = id
  if (kind === 'userArtists') latestUserArtistsAskId = id
  if (kind === 'playlistTracks' || kind === 'radioPrograms' || kind === 'artistSongs') {
    latestPlaylistTracksAskId = id
  } else if (kind !== 'userPlaylists' && kind !== 'userRadios' && kind !== 'userArtists') {
    latestTabTracksAskId = id
  }
  send({ action: 'ask', id, question })
  return id
}

export function sendStart(): void {
  send({ action: 'start' })
  sendAsk({ ask: 'recommend' }, 'recommend')
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  playbackWanted = false
  playbackPendingTrackId = null
  lastEndedTrackId = null
  ignoreDuplicateEndTrackId = null
  useNetease.setState({ userProfile: null, playing: false })
  send({ action: 'signOut' })
}

export function selectTab(tab: NeteaseTab): void {
  latestPlaylistTracksAskId = nextAskId++
  const restoreTracks = savedTabTracks
  savedTabTracks = null
  useNetease.setState({
    tab,
    currentPlaylist: null,
    currentCollectionKind: 'playlist',
    currentCollectionSubtitle: undefined,
    ...(restoreTracks && restoreTracks.length > 0 ? { tracks: restoreTracks } : {}),
  })
  if (tab === 'recommend') {
    useNetease.setState({ loading: isInHost() })
    sendAsk({ ask: 'recommend' }, 'recommend')
  } else if (tab === 'discover') {
    const chartId = useNetease.getState().discoverChartId
    if (chartId === 'rock') {
      useNetease.setState({ tracks: ROCK_TRACKS, loading: false })
    } else if (chartId === 'folk') {
      useNetease.setState({ tracks: FOLK_TRACKS, loading: false })
    } else {
      useNetease.setState({ loading: isInHost() })
      sendAsk({ ask: 'chart', id: chartId }, 'chart')
    }
  } else if (tab === 'roaming') {
    useNetease.setState({ loading: isInHost() })
    sendAsk({ ask: 'chart', id: '19723756' }, 'roaming')
  } else if (tab === 'my') {
    const { myCategory } = useNetease.getState()
    fetchMyCategoryData(myCategory)
  }
}

function fetchMyCategoryData(category: MyCategory): void {
  if (category === 'radio') {
    const currentRadios = useNetease.getState().radios
    if (!currentRadios || currentRadios.length === 0) {
      useNetease.setState({ radios: isInHost() ? [] : DEFAULT_USER_RADIOS })
    }
    useNetease.setState({ loading: isInHost() })
    if (!isInHost()) return
    const askId = sendAsk({ ask: 'userRadios' }, 'userRadios')
    setTimeout(() => {
      const s = useNetease.getState()
      if (inFlightAsks.has(askId) && s.loading && s.tab === 'my' && askId === latestUserRadiosAskId) {
        inFlightAsks.delete(askId)
        useNetease.setState({ loading: false })
      }
    }, 3000)
    return
  }

  if (category === 'artist') {
    const currentArtists = useNetease.getState().artists
    if (!currentArtists || currentArtists.length === 0) {
      useNetease.setState({ artists: isInHost() ? [] : DEFAULT_USER_ARTISTS })
    }
    useNetease.setState({ loading: isInHost() })
    if (!isInHost()) return
    const askId = sendAsk({ ask: 'userArtists' }, 'userArtists')
    setTimeout(() => {
      const s = useNetease.getState()
      if (inFlightAsks.has(askId) && s.loading && s.tab === 'my' && askId === latestUserArtistsAskId) {
        inFlightAsks.delete(askId)
        useNetease.setState({ loading: false })
      }
    }, 3000)
    return
  }

  const current = useNetease.getState().playlists
  if (!current || current.length === 0) {
    useNetease.setState({ playlists: DEFAULT_USER_PLAYLISTS })
  }
  useNetease.setState({ loading: isInHost() })
  if (!isInHost()) return
  const askId = sendAsk({ ask: 'userPlaylists' }, 'userPlaylists')
  setTimeout(() => {
    const s = useNetease.getState()
    if (inFlightAsks.has(askId) && s.loading && s.tab === 'my' && askId === latestUserPlaylistsAskId) {
      inFlightAsks.delete(askId)
      useNetease.setState({ loading: false })
    }
  }, 2000)
}

export function selectMyCategory(category: MyCategory): void {
  useNetease.setState({ myCategory: category })
  fetchMyCategoryData(category)
}

export function selectDiscoverChart(chartId: string): void {
  useNetease.setState({ discoverChartId: chartId, loading: isInHost() && chartId !== 'rock' && chartId !== 'folk' })
  if (chartId === 'rock') {
    latestTabTracksAskId = nextAskId++
    useNetease.setState({ tracks: ROCK_TRACKS, loading: false })
  } else if (chartId === 'folk') {
    latestTabTracksAskId = nextAskId++
    useNetease.setState({ tracks: FOLK_TRACKS, loading: false })
  } else {
    sendAsk({ ask: 'chart', id: chartId }, 'chart')
  }
}

export function searchSongs(query: string): void {
  if (!query.trim()) return
  useNetease.setState({ loading: isInHost(), searchQuery: query })
  sendAsk({ ask: 'search', query: query.trim() }, 'search')
}

export function selectPlaylist(playlist: NeteasePlaylist): void {
  const { currentPlaylist, tracks } = useNetease.getState()
  if (!currentPlaylist && savedTabTracks === null) {
    savedTabTracks = tracks
  }

  const isSynthetic = playlist.id.startsWith('user_')
  if (!isInHost() || isSynthetic) {
    latestPlaylistTracksAskId = nextAskId++
    useNetease.setState({
      loading: false,
      currentPlaylist: playlist,
      currentCollectionKind: 'playlist',
      currentCollectionSubtitle: undefined,
      tracks: getFallbackTracksForPlaylist(playlist),
    })
    return
  }

  useNetease.setState({
    loading: true,
    currentPlaylist: playlist,
    currentCollectionKind: 'playlist',
    currentCollectionSubtitle: undefined,
    tracks: [],
  })
  const askId = sendAsk({ ask: 'playlistTracks', playlistId: playlist.id }, 'playlistTracks', playlist.id)
  setTimeout(() => {
    const s = useNetease.getState()
    if (
      inFlightAsks.has(askId) &&
      s.loading &&
      s.currentPlaylist?.id === playlist.id &&
      askId === latestPlaylistTracksAskId
    ) {
      inFlightAsks.delete(askId)
      useNetease.setState({
        tracks: getFallbackTracksForPlaylist(playlist),
        loading: false,
      })
    }
  }, 6000)
}

export function selectRadio(radio: NeteaseRadio): void {
  const { currentPlaylist, tracks } = useNetease.getState()
  if (!currentPlaylist && savedTabTracks === null) {
    savedTabTracks = tracks
  }

  const asPlaylist: NeteasePlaylist = {
    id: radio.id,
    name: radio.name,
    coverImgUrl: radio.picUrl,
    trackCount: radio.programCount,
    playCount: radio.subCount,
  }
  const subtitle = radio.djName ? `主播 ${radio.djName}` : '订阅电台'
  const isSynthetic = radio.id.startsWith('radio_')
  if (!isInHost() || isSynthetic) {
    latestPlaylistTracksAskId = nextAskId++
    useNetease.setState({
      loading: false,
      currentPlaylist: asPlaylist,
      currentCollectionKind: 'radio',
      currentCollectionSubtitle: subtitle,
      tracks: getFallbackTracksForRadio(radio),
    })
    return
  }

  useNetease.setState({
    loading: true,
    currentPlaylist: asPlaylist,
    currentCollectionKind: 'radio',
    currentCollectionSubtitle: subtitle,
    tracks: [],
  })
  const askId = sendAsk({ ask: 'radioPrograms', radioId: radio.id }, 'radioPrograms', radio.id)
  setTimeout(() => {
    const s = useNetease.getState()
    if (
      inFlightAsks.has(askId) &&
      s.loading &&
      s.currentPlaylist?.id === radio.id &&
      askId === latestPlaylistTracksAskId
    ) {
      inFlightAsks.delete(askId)
      useNetease.setState({
        tracks: getFallbackTracksForRadio(radio),
        loading: false,
      })
    }
  }, 6000)
}

export function selectArtist(artist: NeteaseArtist): void {
  const { currentPlaylist, tracks } = useNetease.getState()
  if (!currentPlaylist && savedTabTracks === null) {
    savedTabTracks = tracks
  }

  const asPlaylist: NeteasePlaylist = {
    id: artist.id,
    name: artist.name,
    coverImgUrl: artist.picUrl,
    trackCount: artist.musicSize ?? 0,
  }
  const subtitle = artist.albumSize ? `${artist.albumSize} 张专辑` : '收藏歌手'
  const isSynthetic = artist.id.startsWith('artist_')
  if (!isInHost() || isSynthetic) {
    latestPlaylistTracksAskId = nextAskId++
    useNetease.setState({
      loading: false,
      currentPlaylist: asPlaylist,
      currentCollectionKind: 'artist',
      currentCollectionSubtitle: subtitle,
      tracks: getFallbackTracksForArtist(artist),
    })
    return
  }

  useNetease.setState({
    loading: true,
    currentPlaylist: asPlaylist,
    currentCollectionKind: 'artist',
    currentCollectionSubtitle: subtitle,
    tracks: [],
  })
  const askId = sendAsk({ ask: 'artistSongs', artistId: artist.id }, 'artistSongs', artist.id)
  setTimeout(() => {
    const s = useNetease.getState()
    if (
      inFlightAsks.has(askId) &&
      s.loading &&
      s.currentPlaylist?.id === artist.id &&
      askId === latestPlaylistTracksAskId
    ) {
      inFlightAsks.delete(askId)
      useNetease.setState({
        tracks: getFallbackTracksForArtist(artist),
        loading: false,
      })
    }
  }, 6000)
}

export function backToPlaylists(): void {
  latestPlaylistTracksAskId = nextAskId++
  const restoreTracks = savedTabTracks
  savedTabTracks = null
  useNetease.setState({
    currentPlaylist: null,
    currentCollectionKind: 'playlist',
    currentCollectionSubtitle: undefined,
    loading: false,
    ...(restoreTracks && restoreTracks.length > 0 ? { tracks: restoreTracks } : {}),
  })
}

export function togglePlayMode(): void {
  const modes: NeteasePlayMode[] = ['loop', 'shuffle', 'single']
  const current = useNetease.getState().playMode
  const nextIdx = (modes.indexOf(current) + 1) % modes.length
  useNetease.setState({ playMode: modes[nextIdx] })
}

export function toggleLike(trackId: string): void {
  const { likedTrackIds } = useNetease.getState()
  const exists = likedTrackIds.includes(trackId)
  const updated = exists ? likedTrackIds.filter((id) => id !== trackId) : [...likedTrackIds, trackId]
  useNetease.setState({ likedTrackIds: updated })
}

export function toggleQueue(open?: boolean): void {
  useNetease.setState((s) => ({ queueOpen: open !== undefined ? open : !s.queueOpen }))
}

export function toggleFullscreenPlayer(open?: boolean): void {
  useNetease.setState((s) => ({ nowPlaying: open !== undefined ? open : !s.nowPlaying }))
}

export function clearQueue(): void {
  useNetease.setState({ queue: [], queueIndex: -1 })
}

export function removeFromQueue(index: number): void {
  const { queue, queueIndex } = useNetease.getState()
  const newQueue = queue.filter((_, i) => i !== index)
  let newIndex = queueIndex
  if (index < queueIndex) {
    newIndex = queueIndex - 1
  } else if (index === queueIndex) {
    newIndex = Math.min(queueIndex, newQueue.length - 1)
  }
  useNetease.setState({ queue: newQueue, queueIndex: newIndex })
}

export function playQueueTrack(index: number): void {
  const { queue } = useNetease.getState()
  const track = queue[index]
  if (track) {
    play(track, queue, index)
  }
}

let playbackStartedInHost = false
let playbackPendingTrackId: string | null = null
let playbackWanted = false
let playSessionSeq = 0
let lastEndedSessionKey: string | null = null
let lastEndedTrackId: string | null = null
let ignoreDuplicateEndTrackId: string | null = null
let vipBlockedForSession = false
const autoSkipVisitedIds = new Set<string>()
let noticeTimer: ReturnType<typeof setTimeout> | null = null

export function isPlaybackPending(): boolean {
  return playbackPendingTrackId !== null
}

export function formatPlaybackNotice(notice: PlaybackNotice): string {
  const base =
    notice.reason === 'vip_required' ? `「${notice.title}」需要网易云黑胶 VIP` : `「${notice.title}」暂无可用音源`
  if (notice.skippedTo) {
    return `${base}，已为您自动播放「${notice.skippedTo}」`
  }
  return notice.reason === 'vip_required' ? `${base}，当前队列暂无其他可播曲目` : `${base}，请切换其他歌曲`
}

export function dismissPlaybackNotice(): void {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
  useNetease.setState({ playbackNotice: null })
}

function setPlaybackNotice(notice: PlaybackNotice | null, autoHideMs = 5500): void {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
  useNetease.setState({ playbackNotice: notice })
  if (notice && autoHideMs > 0) {
    noticeTimer = setTimeout(() => {
      noticeTimer = null
      const curr = useNetease.getState().playbackNotice
      if (curr?.trackId === notice.trackId && curr?.skippedTo === notice.skippedTo) {
        useNetease.setState({ playbackNotice: null })
      }
    }, autoHideMs)
  }
}

function isTrackVipLocked(track: NeteaseTrack, assumeNoVip: boolean): boolean {
  if (track.playable === false) return true
  if (assumeNoVip && (track.fee === 1 || track.fee === 4)) return true
  return false
}

function markTrackUnplayable(trackId: string, reason: 'vip_required' | 'unavailable'): void {
  const patch = (t: NeteaseTrack): NeteaseTrack => {
    if (t.id !== trackId) return t
    return {
      ...t,
      playable: false,
      ...(reason === 'vip_required' && t.fee === undefined ? { fee: 1 } : {}),
    }
  }
  useNetease.setState((s) => ({
    tracks: s.tracks.map(patch),
    queue: s.queue.map(patch),
  }))
}

function findNextPlayableIndex(
  queue: NeteaseTrack[],
  fromIndex: number,
  direction: 1 | -1,
  playMode: NeteasePlayMode,
  visited: Set<string>,
  assumeNoVip: boolean,
): number {
  if (queue.length === 0) return -1
  const safeFrom = fromIndex >= 0 && fromIndex < queue.length ? fromIndex : 0
  const candidates: number[] = []
  for (let offset = 1; offset < queue.length; offset++) {
    const idx = (safeFrom + direction * offset + queue.length * 2) % queue.length
    candidates.push(idx)
  }
  if (playMode === 'shuffle') {
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }
  }
  for (const idx of candidates) {
    const candidate = queue[idx]
    if (!candidate || visited.has(candidate.id)) continue
    if (!isTrackVipLocked(candidate, assumeNoVip)) return idx
  }
  return -1
}

function resolveCurrentQueueIndex(queue: NeteaseTrack[], queueIndex: number, trackId?: string): number {
  if (queue.length === 0) return -1
  if (trackId) {
    if (queueIndex >= 0 && queueIndex < queue.length && queue[queueIndex]?.id === trackId) {
      return queueIndex
    }
    const found = queue.findIndex((t) => t.id === trackId)
    if (found >= 0) return found
  }
  return queueIndex >= 0 && queueIndex < queue.length ? queueIndex : 0
}

export function receiveState(
  signedIn: boolean | null,
  playing: boolean | null,
  signingIn: boolean,
  nickname?: string | null,
  avatarUrl?: string | null,
  vipType?: number | null,
): void {
  const prevState = useNetease.getState()
  const prevSignedIn = prevState.signedIn
  if (signedIn !== prevSignedIn) {
    vipBlockedForSession = false
    autoSkipVisitedIds.clear()
    if (signedIn) {
      const clearVipBlock = (t: NeteaseTrack): NeteaseTrack =>
        t.fee === 1 || t.fee === 4 ? { ...t, playable: true } : t
      useNetease.setState((s) => ({
        tracks: s.tracks.map(clearVipBlock),
        queue: s.queue.map(clearVipBlock),
        playbackNotice: null,
      }))
    } else if (signedIn === false) {
      playbackWanted = false
      useNetease.setState({ userProfile: null })
    }
  }

  let nextProfile = signedIn === false ? null : prevState.userProfile
  if (signedIn && (nickname !== undefined || avatarUrl !== undefined || vipType !== undefined)) {
    const hasIncoming =
      (nickname !== null && nickname !== undefined && nickname !== '') ||
      (avatarUrl !== null && avatarUrl !== undefined && avatarUrl !== '') ||
      (typeof vipType === 'number' && Number.isFinite(vipType))
    if (hasIncoming) {
      nextProfile = {
        nickname: nickname || prevState.userProfile?.nickname || '网易云用户',
        avatarUrl: avatarUrl || prevState.userProfile?.avatarUrl,
        vipType: typeof vipType === 'number' ? vipType : prevState.userProfile?.vipType,
      }
    }
  }

  const keepActivePlaying =
    signedIn !== false &&
    playing === false &&
    (playbackWanted || playbackPendingTrackId !== null || prevState.playing === true)

  useNetease.setState({
    signedIn,
    signingIn,
    userProfile: nextProfile,
    playing: signedIn === false ? false : keepActivePlaying ? prevState.playing : playing,
  })

  const state = useNetease.getState()
  if (signedIn && state.tab === 'my') {
    if (state.myCategory === 'radio' && (!prevSignedIn || state.radios.every((r) => r.id.startsWith('radio_')))) {
      sendAsk({ ask: 'userRadios' }, 'userRadios')
    } else if (
      state.myCategory === 'artist' &&
      (!prevSignedIn || state.artists.every((a) => a.id.startsWith('artist_')))
    ) {
      sendAsk({ ask: 'userArtists' }, 'userArtists')
    } else if (!prevSignedIn || state.playlists.every((p) => p.id.startsWith('user_'))) {
      sendAsk({ ask: 'userPlaylists' }, 'userPlaylists')
    }
  }
  if (!state.currentPlaylist && state.tab === 'recommend' && state.tracks.length <= 5) {
    sendAsk({ ask: 'recommend' }, 'recommend')
  }
}

export function receiveAnswer(
  id: number,
  failed?: boolean,
  _error?: string,
  songs?: NeteaseTrack[] | null,
  playlists?: NeteasePlaylist[] | null,
  lyric?: string | null,
  radios?: NeteaseRadio[] | null,
  artists?: NeteaseArtist[] | null,
): void {
  const meta = inFlightAsks.get(id)
  if (meta) inFlightAsks.delete(id)
  const state = useNetease.getState()

  if (!failed) {
    if (Array.isArray(playlists)) {
      const uniquePlaylists = dedupeById(playlists)
      if (meta?.kind === 'userPlaylists' || (!meta && state.tab === 'my')) {
        if (!meta || id === latestUserPlaylistsAskId) {
          useNetease.setState({
            playlists: uniquePlaylists.length > 0 ? uniquePlaylists : DEFAULT_USER_PLAYLISTS,
            loading: false,
          })
        }
      } else if (meta?.kind === 'recommend' || (!meta && state.tab === 'recommend')) {
        if (!meta || id === latestRecommendAskId) {
          useNetease.setState({
            recommendedPlaylists: uniquePlaylists.length > 0 ? uniquePlaylists : MOCK_RECOMMENDED_PLAYLISTS,
            loading: false,
          })
        }
      }
    }

    if (Array.isArray(radios)) {
      const uniqueRadios = dedupeById(radios)
      if (!meta || (meta.kind === 'userRadios' && id === latestUserRadiosAskId)) {
        useNetease.setState({
          radios: uniqueRadios,
          loading: false,
        })
      }
    }

    if (Array.isArray(artists)) {
      const uniqueArtists = dedupeById(artists)
      if (!meta || (meta.kind === 'userArtists' && id === latestUserArtistsAskId)) {
        useNetease.setState({
          artists: uniqueArtists,
          loading: false,
        })
      }
    }

    if (Array.isArray(songs)) {
      const uniqueSongs = dedupeById(songs)
      if (meta?.kind === 'playlistTracks' || meta?.kind === 'radioPrograms' || meta?.kind === 'artistSongs') {
        const activePlaylist = state.currentPlaylist
        if (id === latestPlaylistTracksAskId && activePlaylist && activePlaylist.id === meta.playlistId) {
          const finalSongs =
            uniqueSongs.length > 0
              ? uniqueSongs
              : meta.kind === 'radioPrograms' || meta.kind === 'artistSongs'
                ? []
                : (activePlaylist.trackCount ?? 0) === 0
                  ? []
                  : getFallbackTracksForPlaylist(activePlaylist)
          useNetease.setState({ tracks: finalSongs, loading: false })
        }
      } else if (meta) {
        if (id === latestTabTracksAskId && !state.currentPlaylist) {
          useNetease.setState({
            tracks: uniqueSongs.length > 0 ? uniqueSongs : MOCK_TRACKS,
            loading: false,
          })
        }
      } else if (!state.currentPlaylist && state.tab === 'recommend') {
        useNetease.setState({
          tracks: uniqueSongs.length > 0 ? uniqueSongs : MOCK_TRACKS,
          loading: false,
        })
      }
    }

    if (lyric) useNetease.setState({ lyrics: lyric })
    return
  }

  if (meta?.kind === 'playlistTracks' || meta?.kind === 'radioPrograms' || meta?.kind === 'artistSongs') {
    const activePlaylist = state.currentPlaylist
    if (id === latestPlaylistTracksAskId && activePlaylist && activePlaylist.id === meta.playlistId) {
      useNetease.setState({
        tracks: meta.kind === 'playlistTracks' ? getFallbackTracksForPlaylist(activePlaylist) : [],
        loading: false,
      })
    }
  } else if (meta?.kind === 'userPlaylists') {
    if (id === latestUserPlaylistsAskId) {
      useNetease.setState((s) => ({
        playlists: s.playlists.length > 0 ? s.playlists : DEFAULT_USER_PLAYLISTS,
        loading: false,
      }))
    }
  } else if (meta?.kind === 'userRadios') {
    if (id === latestUserRadiosAskId) {
      useNetease.setState({ loading: false })
    }
  } else if (meta?.kind === 'userArtists') {
    if (id === latestUserArtistsAskId) {
      useNetease.setState({ loading: false })
    }
  } else if (meta) {
    if (id === latestTabTracksAskId) {
      useNetease.setState({ loading: false })
    }
  } else if (state.currentPlaylist) {
    useNetease.setState({ tracks: getFallbackTracksForPlaylist(state.currentPlaylist), loading: false })
  } else {
    useNetease.setState({ loading: false })
  }
}

export function advanceOnTrackEnd(endedTrackId?: string): void {
  const { queue, queueIndex, tracks, playMode, signedIn, playback } = useNetease.getState()
  const activeList = queue.length > 0 ? queue : tracks
  if (activeList.length === 0) {
    playbackWanted = false
    playbackPendingTrackId = null
    useNetease.setState((s) => ({
      playing: false,
      playback: s.playback ? { ...s.playback, status: 'paused', at: performance.now() } : null,
    }))
    return
  }

  const currentIdx = resolveCurrentQueueIndex(activeList, queueIndex, endedTrackId || playback?.trackId)
  const endedId = activeList[currentIdx]?.id || endedTrackId || playback?.trackId || null
  lastEndedTrackId = endedId
  autoSkipVisitedIds.clear()

  if (playMode === 'single') {
    const sameTrack = activeList[currentIdx]
    if (sameTrack) {
      startPlayTrack(sameTrack, activeList, currentIdx, true, 1, true)
    }
    return
  }

  const assumeNoVip = vipBlockedForSession || !signedIn
  let nextIdx = findNextPlayableIndex(activeList, currentIdx, 1, playMode, autoSkipVisitedIds, assumeNoVip)
  if (nextIdx < 0 && activeList.length === 1 && !isTrackVipLocked(activeList[0], assumeNoVip)) {
    nextIdx = 0
  }

  if (nextIdx >= 0 && activeList[nextIdx]) {
    startPlayTrack(activeList[nextIdx], activeList, nextIdx, true, 1, true)
    return
  }

  playbackWanted = false
  playbackPendingTrackId = null
  useNetease.setState((s) => ({
    playing: false,
    playback: s.playback ? { ...s.playback, status: 'paused', at: performance.now() } : null,
  }))
}

export function receivePlayback(playback: NeteasePlayback | null): void {
  if (!playback) {
    playbackPendingTrackId = null
    playbackWanted = false
    ignoreDuplicateEndTrackId = null
    useNetease.setState({ playback: null, playing: false })
    return
  }

  // Ignore late updates/timeupdates from the outgoing track while switching to a new track
  if (playbackPendingTrackId !== null && playback.trackId && playback.trackId !== playbackPendingTrackId) {
    return
  }

  const state = useNetease.getState()
  const activeTrack = state.queue[state.queueIndex]
  const targetTrackId = playback.trackId || activeTrack?.id || playback.title

  if (playback.error === 'ended') {
    if (playback.trackId && playback.trackId === ignoreDuplicateEndTrackId) {
      return
    }
    const matchesCurrent =
      !playback.trackId ||
      activeTrack?.id === playback.trackId ||
      state.playback?.trackId === playback.trackId ||
      playback.title === state.playback?.title
    if (!matchesCurrent) return

    const endKey = `${playSessionSeq}:${targetTrackId}`
    if (endKey === lastEndedSessionKey) return

    const shouldAdvance =
      playbackWanted || state.playing === true || (playback.trackId !== undefined && playback.trackId === playbackPendingTrackId)

    playbackStartedInHost = true
    lastEndedSessionKey = endKey

    if (shouldAdvance && (state.queue.length > 0 || state.tracks.length > 0)) {
      advanceOnTrackEnd(playback.trackId)
      return
    }

    playbackPendingTrackId = null
    playbackWanted = false
    useNetease.setState({
      playback: { ...playback, status: 'paused', at: performance.now() },
      playing: false,
    })
    return
  }

  if (playback.error === 'vip_required' || playback.error === 'unavailable') {
    const matchesCurrent =
      !playback.trackId ||
      activeTrack?.id === playback.trackId ||
      state.playback?.trackId === playback.trackId ||
      playback.title === state.playback?.title
    if (!matchesCurrent) return

    const wasActiveOrPending =
      playbackWanted || state.playing === true || (playback.trackId !== undefined && playback.trackId === playbackPendingTrackId)

    playbackPendingTrackId = null
    if (!wasActiveOrPending) {
      playbackWanted = false
      useNetease.setState({
        playback: { ...playback, status: 'paused', at: performance.now() },
        playing: false,
      })
      return
    }

    const reason = playback.error
    if (reason === 'vip_required') {
      vipBlockedForSession = true
    }
    markTrackUnplayable(targetTrackId, reason)
    autoSkipVisitedIds.add(targetTrackId)

    const updatedQueue = useNetease.getState().queue
    const assumeNoVip = vipBlockedForSession || !state.signedIn
    const nextIdx = findNextPlayableIndex(
      updatedQueue,
      state.queueIndex,
      1,
      state.playMode,
      autoSkipVisitedIds,
      assumeNoVip,
    )

    if (nextIdx >= 0 && updatedQueue[nextIdx]) {
      const nextTrack = updatedQueue[nextIdx]
      setPlaybackNotice(
        {
          trackId: targetTrackId,
          title: playback.title,
          reason,
          skippedTo: nextTrack.title,
        },
        5500,
      )
      startPlayTrack(nextTrack, updatedQueue, nextIdx, false, 1)
      return
    }

    playbackWanted = false
    useNetease.setState({
      playback: { ...playback, position: 0, status: 'paused', at: performance.now() },
      playing: false,
    })
    setPlaybackNotice({ trackId: targetTrackId, title: playback.title, reason }, 0)
    return
  }

  playbackStartedInHost = true
  if (playback.status === 'playing') {
    playbackPendingTrackId = null
    playbackWanted = true
    lastEndedSessionKey = null
    ignoreDuplicateEndTrackId = null
    autoSkipVisitedIds.clear()
  } else {
    const nearEnd = playback.duration > 0 && playback.position >= playback.duration - 1
    if (!nearEnd) {
      playbackWanted = false
    }
  }
  useNetease.setState({
    playback: { ...playback, at: performance.now() },
    playing: playback.status === 'playing',
  })
}

export function positionOf(playback: NeteaseState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? (now - playback.at) / 1000 : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

function show(change: Partial<NeteasePlayback>): void {
  const { playback } = useNetease.getState()
  if (!playback) return
  const now = performance.now()
  useNetease.setState({
    playback: { ...playback, position: positionOf(playback, now), at: now, ...change },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

function startPlayTrack(
  track: NeteaseTrack,
  list?: NeteaseTrack[],
  index?: number,
  clearNotice = true,
  direction: 1 | -1 = 1,
  fromEnded = false,
): void {
  const { queue } = useNetease.getState()
  const currentList = list || (queue.length > 0 ? queue : [track])
  const foundIdx = index !== undefined ? index : currentList.findIndex((t) => t.id === track.id)
  const idx = foundIdx >= 0 ? foundIdx : 0

  playSessionSeq++
  lastEndedSessionKey = null
  ignoreDuplicateEndTrackId = fromEnded && track.id === lastEndedTrackId ? track.id : null
  if (!fromEnded) {
    lastEndedTrackId = null
  }
  playbackPendingTrackId = track.id
  playbackWanted = true
  autoSkipVisitedIds.add(track.id)
  if (clearNotice) {
    dismissPlaybackNotice()
  }

  send({ action: 'play', track })
  useNetease.setState({
    playback: {
      title: track.title,
      artist: track.artist,
      artwork: track.artwork,
      duration: track.duration || 240,
      position: 0,
      status: 'playing',
      trackId: track.id,
      at: performance.now(),
    },
    playing: true,
    queue: currentList,
    queueIndex: idx,
    direction,
  })
}

export function play(track?: NeteaseTrack, list?: NeteaseTrack[], index?: number): void {
  if (track) {
    autoSkipVisitedIds.clear()
    startPlayTrack(track, list, index, true, 1)
  } else {
    autoSkipVisitedIds.clear()
    playbackWanted = true
    lastEndedSessionKey = null
    ignoreDuplicateEndTrackId = null
    dismissPlaybackNotice()
    send({ action: 'play' })
    show({ status: 'playing' })
  }
}

export function playShuffled(list: NeteaseTrack[]): void {
  if (list.length === 0) return
  const { signedIn } = useNetease.getState()
  const assumeNoVip = vipBlockedForSession || !signedIn
  const playable = list
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => !isTrackVipLocked(track, assumeNoVip))
  const pool = playable.length > 0 ? playable : list.map((track, index) => ({ track, index }))
  const picked = pool[Math.floor(Math.random() * pool.length)]
  if (!picked) return
  useNetease.setState({ playMode: 'shuffle' })
  play(picked.track, list, picked.index)
}

export function playOrPause(): void {
  const { playing, playback, queue, queueIndex, playbackNotice } = useNetease.getState()
  if (playing || playbackPendingTrackId !== null) {
    playbackWanted = false
    playbackPendingTrackId = null
    send({ action: 'pause' })
    show({ status: 'paused' })
  } else {
    const idx = resolveCurrentQueueIndex(queue, queueIndex, playback?.trackId)
    const currentTrack = queue[idx]
    if ((!playback || !playbackStartedInHost || playbackNotice) && currentTrack) {
      play(currentTrack, queue, idx)
    } else {
      playbackWanted = true
      lastEndedSessionKey = null
      ignoreDuplicateEndTrackId = null
      playbackPendingTrackId = playback?.trackId || currentTrack?.id || null
      send({ action: 'play' })
      show({ status: 'playing' })
    }
  }
}

export function skip(direction: 1 | -1): void {
  const { queue, queueIndex, playMode, signedIn, playback } = useNetease.getState()
  if (queue.length === 0) {
    send({ action: direction === 1 ? 'next' : 'previous' })
    return
  }

  autoSkipVisitedIds.clear()
  const assumeNoVip = vipBlockedForSession || !signedIn
  const currentIdx = resolveCurrentQueueIndex(queue, queueIndex, playback?.trackId)
  // Manual skip always advances even when playMode === 'single'
  const skipMode: NeteasePlayMode = playMode === 'shuffle' ? 'shuffle' : 'loop'
  let nextIdx = findNextPlayableIndex(queue, currentIdx, direction, skipMode, autoSkipVisitedIds, assumeNoVip)
  if (nextIdx < 0) {
    nextIdx = (currentIdx + direction + queue.length) % queue.length
  }

  const nextTrack = queue[nextIdx]
  if (nextTrack) {
    startPlayTrack(nextTrack, queue, nextIdx, true, direction)
  }
}

export function seek(seconds: number): void {
  lastEndedSessionKey = null
  ignoreDuplicateEndTrackId = null
  send({ action: 'seek', seconds })
  show({ position: Math.max(0, seconds) })
}

/** Sends volume to host without overwriting the user's chosen `state.volume` (used by fades). */
export function sendVolume(percent: number): void {
  const clamped = Number.isFinite(percent) ? Math.min(1, Math.max(0, percent)) : 1
  send({ action: 'volume', percent: Math.round(clamped * 100) })
}

/** Sets the user's chosen volume (0..1) and forwards it to the host. */
export function setVolume(percent: number): void {
  const volume = Number.isFinite(percent) ? Math.min(1, Math.max(0, percent)) : 1
  useNetease.setState({ volume })
  sendVolume(volume)
}

export function setNowPlaying(open: boolean): void {
  useNetease.setState({ nowPlaying: open })
}

/** In standalone browser preview (outside host), advances to next track when simulated playback finishes. */
export function usePreviewPlaybackEnd(): void {
  const playing = useNetease((s) => Boolean(s.playing))
  useEffect(() => {
    if (!playing || isInHost()) return
    const timer = setInterval(() => {
      const { playback } = useNetease.getState()
      if (
        playback &&
        playback.status === 'playing' &&
        playback.duration > 0 &&
        positionOf(playback, performance.now()) >= playback.duration
      ) {
        advanceOnTrackEnd(playback.trackId)
      }
    }, 400)
    return () => clearInterval(timer)
  }, [playing])
}

export function useNeteaseSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useNetease((s) => s.playback)
  const playMode = useNetease((s) => s.playMode)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-netease',
        service: 'netease',
        title: playback.title,
        artist: playback.artist,
        album: '网易云音乐',
        artwork: playback.artwork ?? null,
        status: playback.status === 'playing' ? 'playing' : 'paused',
        positionMs: playback.position * 1000,
        positionAt: Math.round(performance.timeOrigin + playback.at),
        durationMs: playback.duration * 1000,
        controls: { playPause: true, next: true, previous: true, shuffle: true, repeat: true },
        shuffle: playMode === 'shuffle',
        repeat: playMode === 'single' ? 'track' : 'list',
      },
    }
  }, [playback, playMode])
}

/** Release session data while keeping login and the player's preferences. */
export function releaseResource(): void {
  inFlightAsks.clear()
  savedTabTracks = null
  playbackStartedInHost = false
  playbackPendingTrackId = null
  playbackWanted = false
  playSessionSeq++
  lastEndedSessionKey = null
  lastEndedTrackId = null
  ignoreDuplicateEndTrackId = null
  autoSkipVisitedIds.clear()
  if (noticeTimer !== null) clearTimeout(noticeTimer)
  noticeTimer = null
  const before = useNetease.getState()
  const kept = {
    signedIn: before.signedIn,
    volume: before.volume,
    playMode: before.playMode,
    likedTrackIds: before.likedTrackIds,
    userProfile: before.userProfile,
  }
  useNetease.setState({
    ...useNetease.getInitialState(),
    ...kept,
    tracks: [],
    playlists: [],
    radios: [],
    artists: [],
    recommendedPlaylists: [],
    queue: [],
    playback: null,
    playing: false,
  })
}
