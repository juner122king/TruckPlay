import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  type BilibiliAnswers,
  type BilibiliCommand,
  type BilibiliPlayback,
  type BilibiliQuestion,
  type BilibiliVideo,
  type BilibiliVideoPage,
  isInHost,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { whenTransitionEnds } from '../../state/launch'
import type { Hole } from '../youtube/youtube'
import { getMockAnswer, MOCK_VIDEOS } from './mock'

export { MOCK_VIDEOS }

export type BilibiliTab = 'featured' | 'dynamic' | 'live' | 'movie'

export type BilibiliView =
  | { id: string; kind: 'results'; query: string; filter: 'videos' | 'users' }
  | { id: string; kind: 'channel'; channel: { mid: string; name: string; avatar?: string | null } }
  | { id: string; kind: 'playlist'; video: BilibiliVideo }

export interface BilibiliWatched {
  video: BilibiliVideo
  time: number
  duration: number
}

export interface BilibiliQueue {
  video: BilibiliVideo
  page: number
  pages: BilibiliVideoPage[]
}

export interface BilibiliProfile {
  name: string
  avatar: string | null
}

export interface BilibiliState {
  signedIn: boolean | null
  signingIn: boolean
  profile: BilibiliProfile | null
  playing: boolean | null
  playback: (BilibiliPlayback & { at: number }) | null
  confirmedBvid: string | null
  hostReady: boolean
  buffering: boolean
  current: BilibiliVideo | null
  open: boolean
  returnToPlayer: boolean
  tab: BilibiliTab
  views: BilibiliView[]
  queue: BilibiliQueue | null
  quality: number
  rate: number
  danmaku: boolean
  searches: string[]
  watched: BilibiliWatched[]
  volume: number
  muted: boolean
  hole: Hole | null
  related: BilibiliVideo[] | null
  videos: BilibiliVideo[]
}

const IN_HOST = typeof window !== 'undefined' && isInHost()
const ANSWER_MS = 15000
const SEARCHES_KEPT = 8
const WATCHED_KEPT = 24

const isPlaceholderTitle = (t?: string) => !t || t === '正在直播' || t === '哔哩哔哩直播' || t === '哔哩哔哩视频'
const isPlaceholderAuthor = (a?: string) => !a || a === '主播' || a === 'UP主'

export const useBilibili = create<BilibiliState>()(
  persist(
    (): BilibiliState => ({
      signedIn: IN_HOST ? null : false,
      signingIn: false,
      profile: null,
      playing: false,
      playback: null,
      confirmedBvid: null,
      hostReady: false,
      buffering: false,
      current: null,
      open: false,
      returnToPlayer: false,
      tab: 'featured',
      views: [],
      queue: null,
      quality: 64, // 720P default
      rate: 1.0,
      danmaku: false,
      searches: [],
      watched: [],
      volume: 100,
      muted: false,
      hole: null,
      related: null,
      videos: MOCK_VIDEOS,
    }),
    {
      name: 'westplay.bilibili',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (store) => ({
        searches: store.searches,
        watched: store.watched,
        volume: store.volume,
        muted: store.muted,
        quality: store.quality,
        rate: store.rate,
        danmaku: store.danmaku,
      }),
      merge: (stored, current) => {
        const s = (stored ?? {}) as Partial<BilibiliState>
        return {
          ...current,
          searches: Array.isArray(s.searches) ? s.searches.slice(0, SEARCHES_KEPT) : [],
          watched: Array.isArray(s.watched) ? s.watched.slice(0, WATCHED_KEPT) : [],
          volume: typeof s.volume === 'number' ? s.volume : 100,
          muted: Boolean(s.muted),
          quality: typeof s.quality === 'number' ? s.quality : 64,
          rate: typeof s.rate === 'number' ? s.rate : 1.0,
          danmaku: Boolean(s.danmaku),
        }
      },
    },
  ),
)

let shows = 0

export function send(command: BilibiliCommand): void {
  if (command.action === 'show') shows++
  if (isInHost()) postToHost({ type: 'bilibili', command })
}

export function followArea(place: () => void, element?: Element): () => void {
  place()
  const resized = new ResizeObserver(() => place())
  const area = document.querySelector('.carplay')
  if (area) resized.observe(area)
  if (element) resized.observe(element)
  window.addEventListener('resize', place)
  return () => {
    resized.disconnect()
    window.removeEventListener('resize', place)
  }
}

let questionId = 0
const waiting = new Map<number, (answer: BilibiliAnswers) => void>()

export function ask(question: BilibiliQuestion): Promise<BilibiliAnswers> {
  if (!isInHost()) {
    return Promise.resolve(getMockAnswer(question))
  }
  const id = ++questionId
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      resolve({ failed: true, error: 'Request timeout' })
    }, ANSWER_MS)
    waiting.set(id, (answer) => {
      clearTimeout(timer)
      resolve(answer)
    })
    send({ action: 'ask', id, question })
  })
}

export function receiveAnswer(id: number, answer: BilibiliAnswers): void {
  const handler = waiting.get(id)
  if (handler) {
    waiting.delete(id)
    handler(answer)
  }
  if (!answer.failed && answer.videos && answer.videos.length > 0) {
    useBilibili.setState({ videos: answer.videos })
  }
}

export function sendStart(): void {
  const { danmaku, quality, rate } = useBilibili.getState()
  send({ action: 'start' })
  send({ action: 'danmaku', on: danmaku })
  send({ action: 'quality', quality })
  if (rate !== 1.0) send({ action: 'rate', rate })
  send({ action: 'ask', id: 1, question: { ask: 'recommend' } })
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function selectTab(tab: BilibiliTab): void {
  useBilibili.setState({ tab })
}

export function receiveState(
  signedIn: boolean | null,
  playing: boolean | null,
  signingIn: boolean,
  name?: string | null,
  avatar?: string | null,
): void {
  useBilibili.setState((state) => {
    const isLive = Boolean(state.playback?.isLive || state.playback?.bvid?.startsWith('live:'))
    const effectivePlaying =
      state.playback && state.playback.status
        ? isLive
          ? state.playback.status !== 'paused'
          : state.playback.status === 'playing'
        : (playing ?? state.playing)
    const nextProfile: BilibiliProfile | null =
      signedIn === false
        ? null
        : name || avatar
          ? { name: name || state.profile?.name || 'B站用户', avatar: avatar ?? state.profile?.avatar ?? null }
          : state.profile
    return { signedIn, playing: effectivePlaying, signingIn, profile: nextProfile }
  })
}

export function receivePlayback(playback: BilibiliPlayback | null): void {
  const now = performance.now()
  if (playback) {
    const current = useBilibili.getState().current
    // Ignore paused/empty reports when nothing is active so stopped videos do not resurrect the mini bar.
    if (!current && (playback.status === 'paused' || !playback.bvid)) {
      return
    }

    useBilibili.setState((state) => {
      const cur = state.current
      const effectiveTitle = !isPlaceholderTitle(playback.title)
        ? playback.title
        : cur?.title && !isPlaceholderTitle(cur.title)
          ? cur.title
          : playback.title
      const effectiveAuthor = !isPlaceholderAuthor(playback.artist)
        ? playback.artist
        : cur?.author && !isPlaceholderAuthor(cur.author)
          ? cur.author
          : playback.artist
      const effectiveMid = playback.mid ?? cur?.mid
      const effectiveArtwork = playback.artwork ?? cur?.artwork
      const isLive = Boolean(playback.isLive ?? cur?.isLive ?? playback.bvid?.startsWith('live:'))
      const roomId = playback.roomId ?? cur?.roomId

      const cleanPlayback = {
        ...playback,
        title: effectiveTitle,
        artist: effectiveAuthor,
        mid: effectiveMid,
        artwork: effectiveArtwork,
        isLive,
        roomId,
      }

      const updatedCurrent: BilibiliVideo = {
        bvid: playback.bvid || cur?.bvid || '',
        title: effectiveTitle,
        author: effectiveAuthor,
        mid: effectiveMid,
        artwork: effectiveArtwork,
        duration: playback.duration || cur?.duration || 0,
        isLive,
        roomId,
      }

      let queue = state.queue
      if (playback.pages && playback.pages.length > 0) {
        queue = {
          video: updatedCurrent,
          page: playback.page || 1,
          pages: playback.pages,
        }
      }

      const incomingBvid = playback.bvid || cur?.bvid || null
      const sameVideo = Boolean(incomingBvid && state.confirmedBvid === incomingBvid)
      const becameReady =
        playback.ready === true ||
        (playback.ready === undefined && (playback.position > 0 || playback.status === 'ended'))
      const hostReady = (sameVideo && state.hostReady) || becameReady
      const buffering = Boolean(playback.buffering)

      return {
        playback: { ...cleanPlayback, at: now },
        playing: isLive ? playback.status !== 'paused' : playback.status === 'playing',
        current: updatedCurrent,
        queue,
        confirmedBvid: incomingBvid,
        hostReady,
        buffering,
      }
    })
    rememberWatched()
  } else {
    useBilibili.setState({
      playback: null,
      playing: false,
      confirmedBvid: null,
      hostReady: false,
      buffering: false,
    })
  }
}

export function positionOf(playback: BilibiliState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? (now - playback.at) / 1000 : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

export function positionNow(): number {
  const { playback } = useBilibili.getState()
  return positionOf(playback, performance.now())
}

function rememberWatched(): void {
  const { current, playback } = useBilibili.getState()
  if (!current || !playback) return
  const pos = positionNow()
  if (pos < 3) return
  const duration = playback.duration || current.duration || 0
  const entry: BilibiliWatched = {
    video: current,
    time: Math.round(pos),
    duration: Math.round(duration),
  }
  useBilibili.setState((state) => {
    const list = state.watched.filter((w) => w.video.bvid !== current.bvid)
    return { watched: [entry, ...list].slice(0, WATCHED_KEPT) }
  })
}

export function play(video?: BilibiliVideo, openPlayer = true, page?: number): void {
  const { queue } = useBilibili.getState()
  if (video) {
    const now = performance.now()
    const isLive = Boolean(video.isLive || video.roomId || video.bvid?.startsWith('live:'))
    const inHost = isInHost()
    const { danmaku, quality, rate } = useBilibili.getState()
    send({ action: 'play', video, page })
    send({ action: 'danmaku', on: danmaku })
    send({ action: 'quality', quality })
    if (rate !== 1.0) send({ action: 'rate', rate })
    useBilibili.setState((state) => {
      const prevWatched = state.watched.find((w) => w.video.bvid === video.bvid)
      const nextWatched = isLive
        ? state.watched
        : [
            { video, time: prevWatched?.time ?? 0, duration: prevWatched?.duration ?? (video.duration || 0) },
            ...state.watched.filter((w) => w.video.bvid !== video.bvid),
          ].slice(0, WATCHED_KEPT)
      return {
        current: video,
        open: openPlayer,
        confirmedBvid: inHost ? null : video.bvid,
        hostReady: !inHost,
        buffering: inHost,
        queue: queue?.video.bvid === video.bvid ? { ...queue, page: page || queue.page } : null,
        watched: nextWatched,
        playback: {
          bvid: video.bvid,
          title: video.title,
          artist: video.author,
          artwork: video.artwork,
          mid: video.mid,
          duration: isLive ? 0 : video.duration || 300,
          position: 0,
          status: 'playing',
          at: now,
          page: page || 1,
          isLive,
          roomId: video.roomId,
        },
        playing: true,
        returnToPlayer: openPlayer,
      }
    })
    if (!isLive) {
      ask({ ask: 'related', bvid: video.bvid }).then((ans) => {
        if (ans.videos) useBilibili.setState({ related: ans.videos })
      })
      ask({ ask: 'playlist', bvid: video.bvid }).then((ans) => {
        if (ans.pages && ans.pages.length > 0 && useBilibili.getState().current?.bvid === video.bvid) {
          useBilibili.setState({
            queue: {
              video,
              page: page || 1,
              pages: ans.pages,
            },
          })
        }
      })
    }
  } else if (page !== undefined && queue) {
    const inHost = isInHost()
    send({ action: 'play', video: queue.video, page })
    useBilibili.setState({
      queue: { ...queue, page },
      open: openPlayer,
      hostReady: !inHost,
      buffering: inHost,
    })
  } else {
    send({ action: 'play' })
    const { playback } = useBilibili.getState()
    if (playback) {
      useBilibili.setState({
        playback: { ...playback, status: 'playing', at: performance.now() },
        playing: true,
      })
    }
  }
}

export function replay(): void {
  const { current, queue } = useBilibili.getState()
  seek(0)
  if (queue) {
    play(queue.video, true, queue.page)
  } else if (current) {
    play(current, true)
  } else {
    send({ action: 'seek', seconds: 0 })
    send({ action: 'play' })
    useBilibili.setState((state) => ({
      playback: state.playback ? { ...state.playback, position: 0, status: 'playing', at: performance.now() } : null,
      playing: true,
    }))
  }
}

export function playOrPause(): void {
  const { playing, playback } = useBilibili.getState()
  const isLive = Boolean(playback?.isLive || playback?.bvid?.startsWith('live:'))
  const isPlayingNow = Boolean(playing || playback?.status === 'playing' || (isLive && playback?.status !== 'paused'))

  if (playback?.status === 'ended') {
    replay()
    return
  }
  if (isPlayingNow) {
    send({ action: 'pause' })
    if (playback) {
      const now = performance.now()
      useBilibili.setState({
        playback: { ...playback, position: positionOf(playback, now), status: 'paused', at: now },
        playing: false,
      })
    } else {
      useBilibili.setState({ playing: false })
    }
  } else {
    send({ action: 'play' })
    if (playback) {
      const now = performance.now()
      useBilibili.setState({
        playback: { ...playback, status: 'playing', at: now },
        playing: true,
      })
    } else {
      useBilibili.setState({ playing: true })
    }
  }
}

export function seek(seconds: number): void {
  const safe = Math.max(0, seconds)
  send({ action: 'seek', seconds: safe })
  const { playback } = useBilibili.getState()
  if (playback) {
    useBilibili.setState({
      playback: {
        ...playback,
        position: safe,
        status: playback.status === 'ended' ? 'playing' : playback.status,
        at: performance.now(),
      },
    })
  }
}

export function seekBy(seconds: number): void {
  const now = positionNow()
  const { playback } = useBilibili.getState()
  const duration = playback?.duration || 1000000
  seek(Math.min(duration, Math.max(0, now + seconds)))
}

export function skip(direction: 1 | -1): boolean {
  const { current, playback, open, queue, related, watched } = useBilibili.getState()
  if (!current && !playback) return false
  const isLive = Boolean(current?.isLive || playback?.isLive || playback?.bvid?.startsWith('live:'))
  if (isLive) return false
  if (queue && queue.pages.length > 1) {
    const nextPage = queue.page + direction
    if (nextPage >= 1 && nextPage <= queue.pages.length) {
      play(queue.video, open, nextPage)
      return true
    }
  }
  const currentBvid = current?.bvid || playback?.bvid || ''
  if (direction === 1 && related && related.length > 0) {
    const nextVideo = related.find((v) => v.bvid && v.bvid !== currentBvid) ?? related[0]
    if (nextVideo) {
      play(nextVideo, open)
      return true
    }
  }
  if (direction === -1) {
    const prevVideo = watched.find((w) => w.video.bvid && w.video.bvid !== currentBvid && !w.video.isLive)?.video
    if (prevVideo) {
      if (positionNow() > 5) seek(0)
      else play(prevVideo, open)
      return true
    }
  }
  seekBy(direction * 10)
  return true
}

export function setQuality(quality: number): void {
  useBilibili.setState({ quality })
  send({ action: 'quality', quality })
}

export function setRate(rate: number): void {
  useBilibili.setState({ rate })
  send({ action: 'rate', rate })
}

export function setDanmaku(on: boolean): void {
  useBilibili.setState({ danmaku: on })
  send({ action: 'danmaku', on })
}

export function toggleDanmaku(): void {
  const { danmaku } = useBilibili.getState()
  setDanmaku(!danmaku)
}

export function sendVolume(percent: number): void {
  const safe = Math.max(0, Math.min(100, Math.round(percent)))
  useBilibili.setState({ volume: safe, muted: false })
  send({ action: 'volume', percent: safe })
}

export function toggleMute(): void {
  const { volume, muted } = useBilibili.getState()
  if (muted) {
    useBilibili.setState({ muted: false })
    send({ action: 'volume', percent: volume })
  } else {
    useBilibili.setState({ muted: true })
    send({ action: 'volume', percent: 0 })
  }
}

export function openPlayer(returnTo = false): void {
  useBilibili.setState({ open: true, returnToPlayer: returnTo })
}

export function reopenPlayer(): void {
  if (useBilibili.getState().current || useBilibili.getState().playback) {
    useBilibili.setState({ open: true, returnToPlayer: false })
  }
}

export function closePlayer(): void {
  useBilibili.setState({ open: false, returnToPlayer: false })
  const placed = shows
  whenTransitionEnds(() => {
    if (shows === placed && !useBilibili.getState().open && !useBilibili.getState().hole) {
      send({ action: 'hide' })
    }
  })
}

export function leavePlayer(): void {
  useBilibili.setState({ open: false, returnToPlayer: useBilibili.getState().current !== null })
  const placed = shows
  whenTransitionEnds(() => {
    if (shows === placed && !useBilibili.getState().open && !useBilibili.getState().hole) {
      send({ action: 'hide' })
    }
  })
}

export function stopVideo(): void {
  send({ action: 'stop' })
  send({ action: 'hide' })
  useBilibili.setState({
    playback: null,
    current: null,
    confirmedBvid: null,
    hostReady: false,
    buffering: false,
    open: false,
    returnToPlayer: false,
    playing: false,
    queue: null,
    related: null,
  })
}

export function openResults(query: string, filter: 'videos' | 'users' = 'videos'): void {
  useBilibili.setState((state) => ({
    views: [...state.views, { id: `results-${Date.now()}`, kind: 'results', query, filter }],
  }))
}

export function openChannel(channel: { mid: string; name: string; avatar?: string | null }): void {
  if (!channel || !channel.mid || channel.mid === 'undefined') return
  useBilibili.setState((state) => ({
    views: [...state.views, { id: `channel-${channel.mid}-${Date.now()}`, kind: 'channel', channel }],
  }))
}

export function openPlaylist(video: BilibiliVideo): void {
  useBilibili.setState((state) => ({
    views: [...state.views, { id: `playlist-${video.bvid}-${Date.now()}`, kind: 'playlist', video }],
  }))
}

export function goBack(): void {
  useBilibili.setState((state) => ({
    views: state.views.slice(0, -1),
  }))
}

export function clearViews(): void {
  useBilibili.setState({ views: [] })
}

export function rememberSearch(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) return
  useBilibili.setState((state) => {
    const list = state.searches.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
    return { searches: [trimmed, ...list].slice(0, SEARCHES_KEPT) }
  })
}

export function forgetSearch(query: string): void {
  useBilibili.setState((state) => ({
    searches: state.searches.filter((s) => s !== query),
  }))
}

export function clearSearches(): void {
  useBilibili.setState({ searches: [] })
}

export function clearWatched(): void {
  useBilibili.setState({ watched: [] })
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function useBilibiliSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useBilibili((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-bilibili',
        service: 'bilibili',
        title: playback.title,
        artist: playback.artist,
        album: 'Bilibili',
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

/** Release session data while keeping login and the player's preferences. */
export function releaseResource(): void {
  shows++
  for (const answer of waiting.values()) answer({ failed: true })
  waiting.clear()
  const before = useBilibili.getState()
  const kept = {
    searches: before.searches,
    watched: before.watched,
    volume: before.volume,
    muted: before.muted,
    quality: before.quality,
    rate: before.rate,
    danmaku: before.danmaku,
    profile: before.profile,
  }
  useBilibili.setState({ ...useBilibili.getInitialState(), ...kept, signedIn: before.signedIn, playing: false })
}
