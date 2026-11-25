import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  type Lyrics,
  postToHost,
  type QqmusicArtist,
  type QqmusicCommand,
  type QqmusicPlayback,
  type QqmusicPlaylist,
  type QqmusicQuestion,
  type QqmusicRadio,
  type QqmusicTrack,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import {
  CHARTS,
  DEFAULT_USER_ARTISTS,
  DEFAULT_USER_PLAYLISTS,
  DISCOVER_CATEGORIES,
  getFallbackTracksForArtist,
  getFallbackTracksForPlaylist,
  getFallbackTracksForRadio,
  HOT_SEARCH_TAGS,
  MOCK_LYRICS_LRC,
  MOCK_RADIOS,
  MOCK_RECOMMENDED_PLAYLISTS,
  MOCK_TRACKS,
  PREVIEW_USER_PROFILE,
  type QqmusicCategory,
} from './mock'

export {
  CHARTS,
  DEFAULT_USER_ARTISTS,
  DEFAULT_USER_PLAYLISTS,
  DISCOVER_CATEGORIES,
  getFallbackTracksForArtist,
  getFallbackTracksForPlaylist,
  getFallbackTracksForRadio,
  HOT_SEARCH_TAGS,
  MOCK_LYRICS_LRC,
  MOCK_RADIOS,
  MOCK_RECOMMENDED_PLAYLISTS,
  MOCK_TRACKS,
  PREVIEW_USER_PROFILE,
  type QqmusicCategory,
}

export type QqmusicTab = 'recommend' | 'discover' | 'radio' | 'my' | 'search'
export type MyCategory = 'all' | 'created' | 'collected' | 'artist'
export type CollectionKind = 'playlist' | 'radio' | 'artist'
export type QqmusicPlayMode = 'loop' | 'shuffle' | 'single'

export interface UserProfile {
  nickname: string
  avatarUrl?: string
  vipType?: number
}

export interface PlaybackNotice {
  trackId: string
  title: string
  reason: 'login_required' | 'vip_required' | 'unavailable'
  skippedTo?: string
}

export interface QqmusicState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  tracks: QqmusicTrack[]
  playlists: QqmusicPlaylist[]
  radios: QqmusicRadio[]
  artists: QqmusicArtist[]
  recommendedPlaylists: QqmusicPlaylist[]
  currentPlaylist: QqmusicPlaylist | null
  currentCollectionKind: CollectionKind
  currentCollectionSubtitle?: string
  tab: QqmusicTab
  myCategory: MyCategory
  discoverChartId: string
  searchQuery: string
  loading: boolean
  playback: (QqmusicPlayback & { at: number }) | null
  playbackNotice: PlaybackNotice | null
  nowPlaying: boolean
  direction: 1 | -1
  volume: number
  lyrics: Lyrics | null
  lyricsTrackId: string | null
  lyricsLoading: boolean
  playMode: QqmusicPlayMode
  queue: QqmusicTrack[]
  queueIndex: number
  queueOpen: boolean
  likedTrackIds: string[]
  userProfile: UserProfile | null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Parses standard LRC lyric text into the shared `Lyrics` structure used by `LyricsLines`. */
export function parseLrc(raw?: string | null): Lyrics {
  if (!raw || !raw.trim()) return { synced: false, lines: [] }
  const timestampRe = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  const metaRe = /^\[(ti|ar|al|by|offset|re|ve):/i
  const timed: { start: number; text: string }[] = []
  const plain: string[] = []

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || metaRe.test(trimmed)) continue
    timestampRe.lastIndex = 0
    const starts: number[] = []
    let match: RegExpExecArray | null
    while ((match = timestampRe.exec(trimmed)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fracRaw = match[3] || '0'
      const frac = fracRaw.length === 3 ? Number(fracRaw) / 1000 : Number(fracRaw.padEnd(2, '0')) / 100
      starts.push(minutes * 60 + seconds + frac)
    }
    const text = decodeHtmlEntities(trimmed.replace(timestampRe, '').trim())
    if (!text) continue
    if (starts.length > 0) {
      for (const start of starts) timed.push({ start, text })
    } else {
      plain.push(text)
    }
  }

  if (timed.length > 0) {
    timed.sort((a, b) => a.start - b.start)
    const lines = timed.map((item, idx) => {
      const next = timed[idx + 1]
      const prev = timed[idx - 1]
      const stanza = prev !== undefined && item.start - prev.start >= 10
      return {
        start: item.start,
        end: next ? next.start : 0,
        text: item.text,
        ...(stanza ? { stanza: true } : {}),
      }
    })
    return { synced: true, lines }
  }

  return {
    synced: false,
    lines: plain.map((text) => ({ start: 0, end: 0, text })),
  }
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

export const useQqmusic = create<QqmusicState>(() => ({
  signedIn: IN_HOST ? null : true,
  signingIn: false,
  playing: false,
  tracks: MOCK_TRACKS,
  playlists: DEFAULT_USER_PLAYLISTS,
  radios: MOCK_RADIOS,
  artists: DEFAULT_USER_ARTISTS,
  recommendedPlaylists: MOCK_RECOMMENDED_PLAYLISTS,
  currentPlaylist: null,
  currentCollectionKind: 'playlist',
  currentCollectionSubtitle: undefined,
  tab: 'recommend',
  myCategory: 'all',
  discoverChartId: '26',
  searchQuery: '',
  loading: false,
  playback: {
    title: MOCK_TRACKS[0].title,
    artist: MOCK_TRACKS[0].artist,
    artwork: MOCK_TRACKS[0].artwork,
    duration: MOCK_TRACKS[0].duration ?? 269,
    position: 28,
    status: 'paused',
    trackId: MOCK_TRACKS[0].id,
    at: performance.now(),
  },
  playbackNotice: null,
  nowPlaying: false,
  direction: 1,
  volume: 1,
  lyrics: IN_HOST ? null : parseLrc(MOCK_LYRICS_LRC),
  lyricsTrackId: IN_HOST ? null : MOCK_TRACKS[0].id,
  lyricsLoading: false,
  playMode: 'loop',
  queue: MOCK_TRACKS,
  queueIndex: 0,
  queueOpen: false,
  likedTrackIds: [MOCK_TRACKS[0].id, MOCK_TRACKS[2].id],
  userProfile: IN_HOST ? null : PREVIEW_USER_PROFILE,
}))

type AskKind =
  | 'recommend'
  | 'chart'
  | 'radios'
  | 'userPlaylists'
  | 'userArtists'
  | 'search'
  | 'playlistTracks'
  | 'radioSongs'
  | 'artistSongs'
  | 'lyrics'

interface InFlightAsk {
  kind: AskKind
  playlistId?: string
  trackId?: string
}

let nextAskId = 100
const inFlightAsks = new Map<number, InFlightAsk>()
let latestRecommendAskId = 0
let latestUserPlaylistsAskId = 0
let latestRadiosAskId = 0
let latestUserArtistsAskId = 0
let latestTabTracksAskId = 0
let latestPlaylistTracksAskId = 0
let latestLyricsAskId = 0
let savedTabTracks: QqmusicTrack[] | null = null

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

function send(command: QqmusicCommand): void {
  if (isInHost()) postToHost({ type: 'qqmusic', command })
}

function sendAsk(question: QqmusicQuestion, kind: AskKind, meta?: { playlistId?: string; trackId?: string }): number {
  const id = nextAskId++
  inFlightAsks.set(id, { kind, ...meta })
  if (kind === 'recommend') latestRecommendAskId = id
  if (kind === 'userPlaylists') latestUserPlaylistsAskId = id
  if (kind === 'radios') latestRadiosAskId = id
  if (kind === 'userArtists') latestUserArtistsAskId = id
  if (kind === 'lyrics') latestLyricsAskId = id
  if (kind === 'playlistTracks' || kind === 'radioSongs' || kind === 'artistSongs') {
    latestPlaylistTracksAskId = id
  } else if (kind === 'recommend' || kind === 'chart' || kind === 'search') {
    latestTabTracksAskId = id
  }
  send({ action: 'ask', id, question })
  return id
}

export function requestLyrics(trackId: string, songId?: string): void {
  if (!trackId) return
  if (!isInHost()) {
    useQqmusic.setState({ lyrics: parseLrc(MOCK_LYRICS_LRC), lyricsTrackId: trackId, lyricsLoading: false })
    return
  }
  useQqmusic.setState({ lyrics: null, lyricsTrackId: trackId, lyricsLoading: true })
  const askId = sendAsk({ ask: 'lyrics', id: trackId, ...(songId ? { songId } : {}) }, 'lyrics', { trackId })
  setTimeout(() => {
    const s = useQqmusic.getState()
    if (inFlightAsks.has(askId) && askId === latestLyricsAskId && s.lyricsLoading) {
      inFlightAsks.delete(askId)
      useQqmusic.setState({ lyricsLoading: false })
    }
  }, 6000)
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
  useQqmusic.setState({ userProfile: null, playing: false })
  send({ action: 'signOut' })
}

export function selectTab(tab: QqmusicTab): void {
  latestPlaylistTracksAskId = nextAskId++
  const restoreTracks = savedTabTracks
  savedTabTracks = null
  useQqmusic.setState({
    tab,
    currentPlaylist: null,
    currentCollectionKind: 'playlist',
    currentCollectionSubtitle: undefined,
    ...(restoreTracks && restoreTracks.length > 0 ? { tracks: restoreTracks } : {}),
  })
  if (tab === 'recommend') {
    useQqmusic.setState({ loading: isInHost() })
    sendAsk({ ask: 'recommend' }, 'recommend')
  } else if (tab === 'discover') {
    const chartId = useQqmusic.getState().discoverChartId
    useQqmusic.setState({ loading: isInHost() })
    sendAsk({ ask: 'chart', id: chartId }, 'chart')
  } else if (tab === 'radio') {
    const currentRadios = useQqmusic.getState().radios
    if (!currentRadios || currentRadios.length === 0) {
      useQqmusic.setState({ radios: isInHost() ? [] : MOCK_RADIOS })
    }
    useQqmusic.setState({ loading: isInHost() })
    if (!isInHost()) return
    const askId = sendAsk({ ask: 'radios' }, 'radios')
    setTimeout(() => {
      const s = useQqmusic.getState()
      if (inFlightAsks.has(askId) && s.loading && s.tab === 'radio' && askId === latestRadiosAskId) {
        inFlightAsks.delete(askId)
        useQqmusic.setState({ loading: false })
      }
    }, 4000)
  } else if (tab === 'my') {
    const { myCategory } = useQqmusic.getState()
    fetchMyCategoryData(myCategory)
  }
}

function fetchMyCategoryData(category: MyCategory): void {
  if (category === 'artist') {
    const currentArtists = useQqmusic.getState().artists
    if (!currentArtists || currentArtists.length === 0) {
      useQqmusic.setState({ artists: isInHost() ? [] : DEFAULT_USER_ARTISTS })
    }
    useQqmusic.setState({ loading: isInHost() })
    if (!isInHost()) return
    const askId = sendAsk({ ask: 'userArtists' }, 'userArtists')
    setTimeout(() => {
      const s = useQqmusic.getState()
      if (inFlightAsks.has(askId) && s.loading && s.tab === 'my' && askId === latestUserArtistsAskId) {
        inFlightAsks.delete(askId)
        useQqmusic.setState({ loading: false })
      }
    }, 3000)
    return
  }

  const current = useQqmusic.getState().playlists
  if (!current || current.length === 0) {
    useQqmusic.setState({ playlists: isInHost() ? [] : DEFAULT_USER_PLAYLISTS })
  }
  useQqmusic.setState({ loading: isInHost() })
  if (!isInHost()) return
  const askId = sendAsk({ ask: 'userPlaylists' }, 'userPlaylists')
  setTimeout(() => {
    const s = useQqmusic.getState()
    if (inFlightAsks.has(askId) && s.loading && s.tab === 'my' && askId === latestUserPlaylistsAskId) {
      inFlightAsks.delete(askId)
      useQqmusic.setState({ loading: false })
    }
  }, 3000)
}

export function selectMyCategory(category: MyCategory): void {
  useQqmusic.setState({ myCategory: category })
  fetchMyCategoryData(category)
}

export function selectDiscoverChart(chartId: string): void {
  useQqmusic.setState({ discoverChartId: chartId, loading: isInHost() })
  sendAsk({ ask: 'chart', id: chartId }, 'chart')
}

export function searchSongs(query: string): void {
  if (!query.trim()) return
  useQqmusic.setState({ loading: isInHost(), searchQuery: query })
  sendAsk({ ask: 'search', query: query.trim() }, 'search')
}

export function selectPlaylist(playlist: QqmusicPlaylist): void {
  const { currentPlaylist, tracks } = useQqmusic.getState()
  if (!currentPlaylist && savedTabTracks === null) {
    savedTabTracks = tracks
  }

  const isSynthetic = playlist.id.startsWith('user_') || playlist.id.startsWith('qqm_rec_')
  if (!isInHost() || isSynthetic) {
    latestPlaylistTracksAskId = nextAskId++
    useQqmusic.setState({
      loading: false,
      currentPlaylist: playlist,
      currentCollectionKind: 'playlist',
      currentCollectionSubtitle: undefined,
      tracks: getFallbackTracksForPlaylist(playlist),
    })
    return
  }

  useQqmusic.setState({
    loading: true,
    currentPlaylist: playlist,
    currentCollectionKind: 'playlist',
    currentCollectionSubtitle: undefined,
    tracks: [],
  })
  const askId = sendAsk({ ask: 'playlistTracks', playlistId: playlist.id }, 'playlistTracks', {
    playlistId: playlist.id,
  })
  setTimeout(() => {
    const s = useQqmusic.getState()
    if (
      inFlightAsks.has(askId) &&
      s.loading &&
      s.currentPlaylist?.id === playlist.id &&
      askId === latestPlaylistTracksAskId
    ) {
      inFlightAsks.delete(askId)
      useQqmusic.setState({ tracks: getFallbackTracksForPlaylist(playlist), loading: false })
    }
  }, 6000)
}

export function selectRadio(radio: QqmusicRadio): void {
  const { currentPlaylist, tracks } = useQqmusic.getState()
  if (!currentPlaylist && savedTabTracks === null) {
    savedTabTracks = tracks
  }

  const asPlaylist: QqmusicPlaylist = {
    id: radio.id,
    name: radio.name,
    coverImgUrl: radio.picUrl,
    trackCount: radio.programCount,
    playCount: radio.subCount,
  }
  const subtitle = radio.djName ? `${radio.djName} · 随心听` : '官方电台'
  const isSynthetic = radio.id.startsWith('radio_')
  if (!isInHost() || isSynthetic) {
    latestPlaylistTracksAskId = nextAskId++
    useQqmusic.setState({
      loading: false,
      currentPlaylist: asPlaylist,
      currentCollectionKind: 'radio',
      currentCollectionSubtitle: subtitle,
      tracks: getFallbackTracksForRadio(radio),
    })
    return
  }

  useQqmusic.setState({
    loading: true,
    currentPlaylist: asPlaylist,
    currentCollectionKind: 'radio',
    currentCollectionSubtitle: subtitle,
    tracks: [],
  })
  const askId = sendAsk({ ask: 'radioSongs', radioId: radio.id }, 'radioSongs', { playlistId: radio.id })
  setTimeout(() => {
    const s = useQqmusic.getState()
    if (
      inFlightAsks.has(askId) &&
      s.loading &&
      s.currentPlaylist?.id === radio.id &&
      askId === latestPlaylistTracksAskId
    ) {
      inFlightAsks.delete(askId)
      useQqmusic.setState({ tracks: getFallbackTracksForRadio(radio), loading: false })
    }
  }, 6000)
}

export function selectArtist(artist: QqmusicArtist): void {
  const { currentPlaylist, tracks } = useQqmusic.getState()
  if (!currentPlaylist && savedTabTracks === null) {
    savedTabTracks = tracks
  }

  const asPlaylist: QqmusicPlaylist = {
    id: artist.id,
    name: artist.name,
    coverImgUrl: artist.picUrl,
    trackCount: artist.musicSize ?? 0,
  }
  const subtitle = artist.albumSize ? `${artist.albumSize} 张专辑` : '关注歌手'
  const isSynthetic = artist.id.startsWith('artist_')
  if (!isInHost() || isSynthetic) {
    latestPlaylistTracksAskId = nextAskId++
    useQqmusic.setState({
      loading: false,
      currentPlaylist: asPlaylist,
      currentCollectionKind: 'artist',
      currentCollectionSubtitle: subtitle,
      tracks: getFallbackTracksForArtist(artist),
    })
    return
  }

  useQqmusic.setState({
    loading: true,
    currentPlaylist: asPlaylist,
    currentCollectionKind: 'artist',
    currentCollectionSubtitle: subtitle,
    tracks: [],
  })
  const askId = sendAsk({ ask: 'artistSongs', artistId: artist.id }, 'artistSongs', { playlistId: artist.id })
  setTimeout(() => {
    const s = useQqmusic.getState()
    if (
      inFlightAsks.has(askId) &&
      s.loading &&
      s.currentPlaylist?.id === artist.id &&
      askId === latestPlaylistTracksAskId
    ) {
      inFlightAsks.delete(askId)
      useQqmusic.setState({ tracks: getFallbackTracksForArtist(artist), loading: false })
    }
  }, 6000)
}

export function backToPlaylists(): void {
  latestPlaylistTracksAskId = nextAskId++
  const restoreTracks = savedTabTracks
  savedTabTracks = null
  useQqmusic.setState({
    currentPlaylist: null,
    currentCollectionKind: 'playlist',
    currentCollectionSubtitle: undefined,
    loading: false,
    ...(restoreTracks && restoreTracks.length > 0 ? { tracks: restoreTracks } : {}),
  })
}

export function togglePlayMode(): void {
  const modes: QqmusicPlayMode[] = ['loop', 'shuffle', 'single']
  const current = useQqmusic.getState().playMode
  const nextIdx = (modes.indexOf(current) + 1) % modes.length
  useQqmusic.setState({ playMode: modes[nextIdx] })
}

export function toggleLike(trackId: string): void {
  const { likedTrackIds } = useQqmusic.getState()
  const exists = likedTrackIds.includes(trackId)
  const updated = exists ? likedTrackIds.filter((id) => id !== trackId) : [...likedTrackIds, trackId]
  useQqmusic.setState({ likedTrackIds: updated })
}

export function toggleQueue(open?: boolean): void {
  useQqmusic.setState((s) => ({ queueOpen: open !== undefined ? open : !s.queueOpen }))
}

export function toggleFullscreenPlayer(open?: boolean): void {
  useQqmusic.setState((s) => ({ nowPlaying: open !== undefined ? open : !s.nowPlaying }))
}

export function clearQueue(): void {
  useQqmusic.setState({ queue: [], queueIndex: -1 })
}

export function removeFromQueue(index: number): void {
  const { queue, queueIndex } = useQqmusic.getState()
  const newQueue = queue.filter((_, i) => i !== index)
  let newIndex = queueIndex
  if (index < queueIndex) {
    newIndex = queueIndex - 1
  } else if (index === queueIndex) {
    newIndex = Math.min(queueIndex, newQueue.length - 1)
  }
  useQqmusic.setState({ queue: newQueue, queueIndex: newIndex })
}

export function playQueueTrack(index: number): void {
  const { queue } = useQqmusic.getState()
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
  if (notice.reason === 'login_required') {
    return '播放 QQ 音乐需要先扫码登录账号（支持 QQ / 微信扫码）'
  }
  const base =
    notice.reason === 'vip_required' ? `「${notice.title}」需要 QQ 音乐绿钻 VIP` : `「${notice.title}」暂无可用音源`
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
  useQqmusic.setState({ playbackNotice: null })
}

function setPlaybackNotice(notice: PlaybackNotice | null, autoHideMs = 5500): void {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
  useQqmusic.setState({ playbackNotice: notice })
  if (notice && autoHideMs > 0) {
    noticeTimer = setTimeout(() => {
      noticeTimer = null
      const curr = useQqmusic.getState().playbackNotice
      if (curr?.trackId === notice.trackId && curr?.skippedTo === notice.skippedTo) {
        useQqmusic.setState({ playbackNotice: null })
      }
    }, autoHideMs)
  }
}

function isTrackVipLocked(track: QqmusicTrack, assumeNoVip: boolean): boolean {
  if (track.playable === false) return true
  if (assumeNoVip && track.payPlay === 1) return true
  return false
}

function markTrackUnplayable(trackId: string, reason: 'vip_required' | 'unavailable'): void {
  const patch = (t: QqmusicTrack): QqmusicTrack => {
    if (t.id !== trackId) return t
    return {
      ...t,
      playable: false,
      ...(reason === 'vip_required' && t.payPlay === undefined ? { payPlay: 1 } : {}),
    }
  }
  useQqmusic.setState((s) => ({
    tracks: s.tracks.map(patch),
    queue: s.queue.map(patch),
  }))
}

function findNextPlayableIndex(
  queue: QqmusicTrack[],
  fromIndex: number,
  direction: 1 | -1,
  playMode: QqmusicPlayMode,
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

function resolveCurrentQueueIndex(queue: QqmusicTrack[], queueIndex: number, trackId?: string): number {
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
  const prevState = useQqmusic.getState()
  const prevSignedIn = prevState.signedIn
  if (signedIn !== prevSignedIn) {
    vipBlockedForSession = false
    autoSkipVisitedIds.clear()
    if (signedIn) {
      const clearVipBlock = (t: QqmusicTrack): QqmusicTrack => (t.payPlay === 1 ? { ...t, playable: true } : t)
      useQqmusic.setState((s) => ({
        tracks: s.tracks.map(clearVipBlock),
        queue: s.queue.map(clearVipBlock),
        playbackNotice: null,
      }))
    } else if (signedIn === false) {
      playbackWanted = false
      useQqmusic.setState({ userProfile: null })
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
        nickname: nickname || prevState.userProfile?.nickname || 'QQ音乐用户',
        avatarUrl: avatarUrl || prevState.userProfile?.avatarUrl,
        vipType: typeof vipType === 'number' ? vipType : prevState.userProfile?.vipType,
      }
    }
  }

  const keepActivePlaying =
    signedIn !== false &&
    playing === false &&
    (playbackWanted || playbackPendingTrackId !== null || prevState.playing === true)

  useQqmusic.setState({
    signedIn,
    signingIn,
    userProfile: nextProfile,
    playing: signedIn === false ? false : keepActivePlaying ? prevState.playing : playing,
  })

  const state = useQqmusic.getState()
  if (signedIn && state.tab === 'my') {
    if (state.myCategory === 'artist' && (!prevSignedIn || state.artists.every((a) => a.id.startsWith('artist_')))) {
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
  songs?: QqmusicTrack[] | null,
  playlists?: QqmusicPlaylist[] | null,
  lyric?: string | null,
  radios?: QqmusicRadio[] | null,
  artists?: QqmusicArtist[] | null,
): void {
  const meta = inFlightAsks.get(id)
  if (meta) inFlightAsks.delete(id)
  const state = useQqmusic.getState()

  if (!failed) {
    if (
      meta?.kind === 'lyrics' ||
      (lyric !== undefined && lyric !== null && !songs && !playlists && !radios && !artists)
    ) {
      if (!meta || id === latestLyricsAskId) {
        useQqmusic.setState({
          lyrics: parseLrc(lyric),
          lyricsTrackId: meta?.trackId ?? state.lyricsTrackId,
          lyricsLoading: false,
        })
      }
      return
    }

    if (Array.isArray(playlists)) {
      const uniquePlaylists = dedupeById(playlists)
      if (meta?.kind === 'userPlaylists' || (!meta && state.tab === 'my')) {
        if (!meta || id === latestUserPlaylistsAskId) {
          useQqmusic.setState({
            playlists: uniquePlaylists,
            loading: false,
          })
        }
      } else if (meta?.kind === 'recommend' || (!meta && state.tab === 'recommend')) {
        if (!meta || id === latestRecommendAskId) {
          useQqmusic.setState({
            recommendedPlaylists: uniquePlaylists.length > 0 ? uniquePlaylists : MOCK_RECOMMENDED_PLAYLISTS,
            loading: false,
          })
        }
      }
    }

    if (Array.isArray(radios)) {
      const uniqueRadios = dedupeById(radios)
      if (!meta || (meta.kind === 'radios' && id === latestRadiosAskId)) {
        useQqmusic.setState({
          radios: uniqueRadios.length > 0 ? uniqueRadios : MOCK_RADIOS,
          loading: false,
        })
      }
    }

    if (Array.isArray(artists)) {
      const uniqueArtists = dedupeById(artists)
      if (!meta || (meta.kind === 'userArtists' && id === latestUserArtistsAskId)) {
        useQqmusic.setState({
          artists: uniqueArtists,
          loading: false,
        })
      }
    }

    if (Array.isArray(songs)) {
      const uniqueSongs = dedupeById(songs)
      if (meta?.kind === 'playlistTracks' || meta?.kind === 'radioSongs' || meta?.kind === 'artistSongs') {
        const activePlaylist = state.currentPlaylist
        if (id === latestPlaylistTracksAskId && activePlaylist && activePlaylist.id === meta.playlistId) {
          const finalSongs =
            uniqueSongs.length > 0
              ? uniqueSongs
              : meta.kind === 'radioSongs' || meta.kind === 'artistSongs'
                ? []
                : (activePlaylist.trackCount ?? 0) === 0
                  ? []
                  : getFallbackTracksForPlaylist(activePlaylist)
          useQqmusic.setState({ tracks: finalSongs, loading: false })
        }
      } else if (meta) {
        if (id === latestTabTracksAskId && !state.currentPlaylist) {
          useQqmusic.setState({
            tracks: meta.kind === 'search' ? uniqueSongs : uniqueSongs.length > 0 ? uniqueSongs : MOCK_TRACKS,
            loading: false,
          })
        }
      } else if (!state.currentPlaylist && state.tab === 'recommend') {
        useQqmusic.setState({
          tracks: uniqueSongs.length > 0 ? uniqueSongs : MOCK_TRACKS,
          loading: false,
        })
      }
    }

    if (typeof lyric === 'string') {
      useQqmusic.setState({ lyrics: parseLrc(lyric), lyricsLoading: false })
    }
    return
  }

  if (meta?.kind === 'lyrics') {
    if (id === latestLyricsAskId) {
      useQqmusic.setState({ lyrics: { synced: false, lines: [] }, lyricsLoading: false })
    }
  } else if (meta?.kind === 'playlistTracks' || meta?.kind === 'radioSongs' || meta?.kind === 'artistSongs') {
    const activePlaylist = state.currentPlaylist
    if (id === latestPlaylistTracksAskId && activePlaylist && activePlaylist.id === meta.playlistId) {
      useQqmusic.setState({
        tracks: meta.kind === 'playlistTracks' ? getFallbackTracksForPlaylist(activePlaylist) : [],
        loading: false,
      })
    }
  } else if (meta?.kind === 'userPlaylists') {
    if (id === latestUserPlaylistsAskId) useQqmusic.setState({ loading: false })
  } else if (meta?.kind === 'radios') {
    if (id === latestRadiosAskId) useQqmusic.setState({ loading: false })
  } else if (meta?.kind === 'userArtists') {
    if (id === latestUserArtistsAskId) useQqmusic.setState({ loading: false })
  } else if (meta) {
    if (id === latestTabTracksAskId) useQqmusic.setState({ loading: false })
  } else if (state.currentPlaylist) {
    useQqmusic.setState({ tracks: getFallbackTracksForPlaylist(state.currentPlaylist), loading: false })
  } else {
    useQqmusic.setState({ loading: false })
  }
}

export function advanceOnTrackEnd(endedTrackId?: string): void {
  const { queue, queueIndex, tracks, playMode, signedIn, playback } = useQqmusic.getState()
  const activeList = queue.length > 0 ? queue : tracks
  if (activeList.length === 0) {
    playbackWanted = false
    playbackPendingTrackId = null
    useQqmusic.setState((s) => ({
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
  useQqmusic.setState((s) => ({
    playing: false,
    playback: s.playback ? { ...s.playback, status: 'paused', at: performance.now() } : null,
  }))
}

export function receivePlayback(playback: QqmusicPlayback | null): void {
  if (!playback) {
    playbackPendingTrackId = null
    playbackWanted = false
    ignoreDuplicateEndTrackId = null
    useQqmusic.setState({ playback: null, playing: false })
    return
  }

  if (playbackPendingTrackId !== null && playback.trackId && playback.trackId !== playbackPendingTrackId) {
    return
  }

  const state = useQqmusic.getState()
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
      playbackWanted ||
      state.playing === true ||
      (playback.trackId !== undefined && playback.trackId === playbackPendingTrackId)

    playbackStartedInHost = true
    lastEndedSessionKey = endKey

    if (shouldAdvance && (state.queue.length > 0 || state.tracks.length > 0)) {
      advanceOnTrackEnd(playback.trackId)
      return
    }

    playbackPendingTrackId = null
    playbackWanted = false
    useQqmusic.setState({
      playback: { ...playback, status: 'paused', at: performance.now() },
      playing: false,
    })
    return
  }

  if (playback.error === 'login_required') {
    const matchesCurrent =
      !playback.trackId ||
      activeTrack?.id === playback.trackId ||
      state.playback?.trackId === playback.trackId ||
      playback.title === state.playback?.title
    if (!matchesCurrent) return

    playbackPendingTrackId = null
    playbackWanted = false
    useQqmusic.setState({
      playback: { ...playback, position: 0, status: 'paused', at: performance.now() },
      playing: false,
    })
    setPlaybackNotice({ trackId: targetTrackId, title: playback.title, reason: 'login_required' }, 0)
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
      playbackWanted ||
      state.playing === true ||
      (playback.trackId !== undefined && playback.trackId === playbackPendingTrackId)

    playbackPendingTrackId = null
    if (!wasActiveOrPending) {
      playbackWanted = false
      useQqmusic.setState({
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

    const updatedQueue = useQqmusic.getState().queue
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
    useQqmusic.setState({
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
  useQqmusic.setState({
    playback: { ...playback, at: performance.now() },
    playing: playback.status === 'playing',
  })
}

export function positionOf(playback: QqmusicState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? (now - playback.at) / 1000 : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

function show(change: Partial<QqmusicPlayback>): void {
  const { playback } = useQqmusic.getState()
  if (!playback) return
  const now = performance.now()
  useQqmusic.setState({
    playback: { ...playback, position: positionOf(playback, now), at: now, ...change },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

function startPlayTrack(
  track: QqmusicTrack,
  list?: QqmusicTrack[],
  index?: number,
  clearNotice = true,
  direction: 1 | -1 = 1,
  fromEnded = false,
): void {
  const { queue } = useQqmusic.getState()
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
  useQqmusic.setState({
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
  requestLyrics(track.id, track.songId)
}

export function play(track?: QqmusicTrack, list?: QqmusicTrack[], index?: number): void {
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

export function playShuffled(list: QqmusicTrack[]): void {
  if (list.length === 0) return
  const { signedIn } = useQqmusic.getState()
  const assumeNoVip = vipBlockedForSession || !signedIn
  const playable = list
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => !isTrackVipLocked(track, assumeNoVip))
  const pool = playable.length > 0 ? playable : list.map((track, index) => ({ track, index }))
  const picked = pool[Math.floor(Math.random() * pool.length)]
  if (!picked) return
  useQqmusic.setState({ playMode: 'shuffle' })
  play(picked.track, list, picked.index)
}

export function playOrPause(): void {
  const { playing, playback, queue, queueIndex, playbackNotice } = useQqmusic.getState()
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
  const { queue, queueIndex, playMode, signedIn, playback } = useQqmusic.getState()
  if (queue.length === 0) {
    send({ action: direction === 1 ? 'next' : 'previous' })
    return
  }

  autoSkipVisitedIds.clear()
  const assumeNoVip = vipBlockedForSession || !signedIn
  const currentIdx = resolveCurrentQueueIndex(queue, queueIndex, playback?.trackId)
  const skipMode: QqmusicPlayMode = playMode === 'shuffle' ? 'shuffle' : 'loop'
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
  useQqmusic.setState({ volume })
  sendVolume(volume)
}

export function setNowPlaying(open: boolean): void {
  useQqmusic.setState({ nowPlaying: open })
}

/** In standalone browser preview (outside host), advances to next track when simulated playback finishes. */
export function usePreviewPlaybackEnd(): void {
  const playing = useQqmusic((s) => Boolean(s.playing))
  useEffect(() => {
    if (!playing || isInHost()) return
    const timer = setInterval(() => {
      const { playback } = useQqmusic.getState()
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

export function useQqmusicSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useQqmusic((s) => s.playback)
  const playMode = useQqmusic((s) => s.playMode)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-qqmusic',
        service: 'qqmusic',
        title: playback.title,
        artist: playback.artist,
        album: 'QQ音乐',
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
  const before = useQqmusic.getState()
  const kept = {
    signedIn: before.signedIn,
    volume: before.volume,
    playMode: before.playMode,
    likedTrackIds: before.likedTrackIds,
    userProfile: before.userProfile,
  }
  useQqmusic.setState({
    ...useQqmusic.getInitialState(),
    ...kept,
    tracks: [],
    playlists: [],
    radios: [],
    artists: [],
    recommendedPlaylists: [],
    queue: [],
    playback: null,
    playing: false,
    lyrics: null,
    lyricsTrackId: null,
    lyricsLoading: false,
  })
}
