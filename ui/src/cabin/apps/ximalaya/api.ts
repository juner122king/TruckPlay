import {
  isInHost,
  postToHost,
  type XimalayaAlbum,
  type XimalayaAnswers,
  type XimalayaCategory,
  type XimalayaQuestion,
  type XimalayaTrack,
} from '../../../shared/host'

export type XimalayaCatalogQuestion = Exclude<
  XimalayaQuestion,
  { ask: 'radioHome' | 'radioList' | 'radioDetail' | 'radioSchedule' }
>

const MIN_ID = 1_000_000_000
const MAX_ID = 1_999_999_999
let serial = MIN_ID

const pending = new Map<
  number,
  {
    resolve(value: XimalayaAnswers): void
    reject(reason: Error): void
    timer: ReturnType<typeof setTimeout>
  }
>()

export function receiveXimalayaApiAnswer(id: number, answer: XimalayaAnswers): boolean {
  const req = pending.get(id)
  if (!req) return id >= MIN_ID && id <= MAX_ID
  pending.delete(id)
  clearTimeout(req.timer)
  if (answer.failed) req.reject(new Error(answer.error || '喜马拉雅请求失败'))
  else req.resolve(answer)
  return true
}

export function cancelXimalayaRequests(): void {
  for (const [id, req] of pending) {
    clearTimeout(req.timer)
    pending.delete(id)
    req.reject(new Error('Session closed'))
  }
}

export function formatPlayCount(value: unknown): string | undefined {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return String(Math.round(n))
}

export function normalizeCoverUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice(7)}`
  if (trimmed.startsWith('https://')) return trimmed
  if (trimmed.startsWith('/')) return `https://imagev2.xmcdn.com${trimmed}`
  return `https://imagev2.xmcdn.com/${trimmed}`
}

const CATEGORY_SLUG_MAP: Record<string, number> = {
  youshengshu: 3,
  book: 3,
  xiangsheng: 12,
  comic: 12,
  lishi: 9,
  culture: 9,
  shangye: 8,
  finance: 8,
  renwen: 39,
  yinyue: 2,
  music: 2,
  qinggan: 10,
  emotion: 10,
  toutiao: 1,
  news: 1,
  ertong: 6,
  kid: 6,
  yule: 4,
  entertainment: 4,
  duanzi: 48,
  keji: 18,
  it: 18,
  guangbojv: 46,
  diantai: 10,
}

async function fetchProxyJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Record<string, unknown>
}

function mapCategoryAlbum(a: Record<string, unknown>): XimalayaAlbum {
  const isPaid = Boolean(a.isPaid)
  const finished = a.isFinished === 2 ? true : a.isFinished === 1 ? false : undefined
  return {
    id: String(a.albumId ?? a.id ?? ''),
    title: String(a.albumTitle ?? a.title ?? '有声专辑'),
    artist: String(a.albumUserNickName ?? a.anchorName ?? a.nickname ?? '喜马拉雅主播'),
    artwork: normalizeCoverUrl(a.albumCoverPath ?? a.coverLarge ?? a.coverPath ?? a.cover),
    description: String(a.intro ?? a.description ?? ''),
    episodeCount: Number(a.albumTrackCount ?? a.trackCount ?? 0) || undefined,
    playCount: formatPlayCount(a.albumPlayCount ?? a.playCount),
    completed: finished,
    isPaid,
    vipType: typeof a.vipType === 'number' ? a.vipType : undefined,
    tag: isPaid ? 'VIP' : finished ? '完结' : undefined,
  }
}

function mapRankAlbum(item: Record<string, unknown>): XimalayaAlbum {
  const info = (item.albumInfo ?? item) as Record<string, unknown>
  const stats = (item.statCountInfo ?? {}) as Record<string, unknown>
  const uri = (item.pageUriInfo ?? {}) as Record<string, unknown>
  const isPaid = Boolean(Number(info.albumPayType) > 0 || Number(info.albumVipPayType) > 0 || info.isPaid)
  return {
    id: String(info.id ?? item.id ?? ''),
    title: String(info.title ?? '热门专辑'),
    artist: String(info.anchorName ?? uri.categoryName ?? '喜马拉雅精选'),
    artwork: normalizeCoverUrl(info.cover ?? info.albumCoverPath ?? info.coverLarge),
    description: String(info.customTitle ?? info.shortIntro ?? info.salePoint ?? ''),
    episodeCount: Number(stats.trackCount ?? 0) || undefined,
    playCount: formatPlayCount(stats.playCount),
    category: uri.categoryName ? String(uri.categoryName) : undefined,
    completed: info.albumFinishTag === 2 ? true : info.albumFinishTag === 1 ? false : undefined,
    isPaid,
    tag: isPaid ? 'VIP' : uri.categoryName ? String(uri.categoryName) : undefined,
  }
}

async function fetchDevCategories(): Promise<XimalayaCategory[]> {
  const data = await fetchProxyJson('/__ximalaya-www/revision/category/allCategoryInfo')
  const groups = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : []
  const seen = new Set<number>()
  const list: XimalayaCategory[] = []
  for (const group of groups) {
    const cats = Array.isArray(group.categories) ? (group.categories as Record<string, unknown>[]) : []
    for (const cat of cats) {
      const id = Number(cat.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const slug = String(cat.link ?? '')
        .replace(/^\/|\/$/g, '')
        .split('/')[0]
      list.push({
        id,
        name: String(cat.displayName ?? cat.name ?? '分类'),
        code: slug || String(cat.name ?? id),
        group: group.name ? String(group.name) : undefined,
      })
    }
  }
  return list
}

async function fetchDevRank(cluster: string, categoryCode: string, page: number, pageSize = 30): Promise<XimalayaAlbum[]> {
  const data = await fetchProxyJson(
    `/__ximalaya-m/m-revision/page/rank/queryRank?clusterCode=${encodeURIComponent(cluster)}&categoryCode=${encodeURIComponent(categoryCode)}&page=${page}&pageSize=${pageSize}`,
  )
  const payload = (data.data ?? {}) as Record<string, unknown>
  const list = Array.isArray(payload.rankModuleInfoList) ? (payload.rankModuleInfoList as Record<string, unknown>[]) : []
  return list.map(mapRankAlbum).filter((a) => Boolean(a.id && a.id !== 'undefined'))
}

async function queryDevProxy(question: XimalayaCatalogQuestion): Promise<XimalayaAnswers> {
  if (question.ask === 'categories') {
    return { categories: await fetchDevCategories() }
  }
  if (question.ask === 'home' || question.ask === 'recommend') {
    const [freeRes, riseRes, catRes] = await Promise.allSettled([
      fetchDevRank('free', 'all', 1, 24),
      fetchDevRank('rise', 'all', 1, 18),
      fetchDevCategories(),
    ])
    const albums = freeRes.status === 'fulfilled' ? freeRes.value : []
    const riseAlbums = riseRes.status === 'fulfilled' ? riseRes.value : []
    const categories = catRes.status === 'fulfilled' ? catRes.value : []
    if (!albums.length && !riseAlbums.length) {
      const fallback = await fetchProxyJson('/__ximalaya-www/revision/category/v2/albums?pageNum=1&pageSize=24&sort=1')
      const raw = ((fallback.data as Record<string, unknown>)?.albums ?? []) as Record<string, unknown>[]
      return { albums: raw.map(mapCategoryAlbum), riseAlbums: [], categories }
    }
    return { albums, riseAlbums, categories }
  }
  if (question.ask === 'category') {
    const page = Math.max(1, question.page ?? 1)
    const sort = typeof question.sort === 'number' ? question.sort : 1
    const slug = (question.category ?? '').toLowerCase()
    const categoryId = question.categoryId ?? CATEGORY_SLUG_MAP[slug] ?? 0
    const params = new URLSearchParams({ pageNum: String(page), pageSize: '24', sort: String(sort) })
    if (categoryId > 0) params.set('categoryId', String(categoryId))
    const data = await fetchProxyJson(`/__ximalaya-www/revision/category/v2/albums?${params.toString()}`)
    const payload = (data.data ?? {}) as Record<string, unknown>
    const raw = (payload.albums ?? payload.albumList ?? []) as Record<string, unknown>[]
    const albums = raw.map(mapCategoryAlbum)
    const totalCount = Number(payload.total ?? albums.length)
    return { albums, totalCount, page, maxPage: Math.max(1, Math.ceil(totalCount / 24)) }
  }
  if (question.ask === 'rank') {
    const page = Math.max(1, question.page ?? 1)
    const albums = await fetchDevRank(question.cluster || 'free', question.categoryCode || 'all', page, 30)
    return { albums, page }
  }
  if (question.ask === 'albumDetail') {
    const data = await fetchProxyJson(
      `/__ximalaya-m/m-revision/page/album/v2/queryAlbumPage/${encodeURIComponent(question.albumId)}`,
    )
    const detail = ((data.data as Record<string, unknown>)?.albumDetailInfo ?? {}) as Record<string, unknown>
    const info = (detail.albumInfo ?? {}) as Record<string, unknown>
    const stats = (detail.statCountInfo ?? {}) as Record<string, unknown>
    const anchor = (detail.anchorInfo ?? {}) as Record<string, unknown>
    const album: XimalayaAlbum = {
      id: String(info.id ?? question.albumId),
      title: String(info.title ?? '有声专辑'),
      artist: String(anchor.nickname ?? info.anchorName ?? '喜马拉雅主播'),
      artwork: normalizeCoverUrl(info.cover),
      description: String(info.shortIntro ?? info.customTitle ?? ''),
      episodeCount: Number(stats.trackCount ?? 0) || undefined,
      playCount: formatPlayCount(stats.playCount),
      completed: info.albumFinishTag === 2 ? true : info.albumFinishTag === 1 ? false : undefined,
      isPaid: Boolean(Number(info.albumPayType) > 0 || info.price),
      category: info.categoryName ? String(info.categoryName) : undefined,
    }
    return { album }
  }
  if (question.ask === 'albumTracks') {
    const page = Math.max(1, question.page ?? 1)
    const asc = question.asc !== false
    const sort = asc ? 0 : 1
    const [showRes, pageRes] = await Promise.allSettled([
      fetchProxyJson(
        `/__ximalaya-www/revision/play/v1/show?id=${encodeURIComponent(question.albumId)}&num=${page}&sort=${sort}&size=50&ptype=0`,
      ),
      fetchProxyJson(`/__ximalaya-www/m-revision/page/album/v2/queryAlbumPage/${encodeURIComponent(question.albumId)}`),
    ])
    if (showRes.status === 'rejected') throw showRes.reason
    const payload = (showRes.value.data ?? {}) as Record<string, unknown>
    const list = (payload.tracksAudioPlay ?? []) as Record<string, unknown>[]
    const detail =
      pageRes.status === 'fulfilled'
        ? (((pageRes.value.data as Record<string, unknown>)?.albumDetailInfo as Record<string, unknown>) ?? {})
        : {}
    const anchor = (detail.anchorInfo ?? {}) as Record<string, unknown>
    const info = (detail.albumInfo ?? {}) as Record<string, unknown>
    const stats = (detail.statCountInfo ?? {}) as Record<string, unknown>
    const anchorName = String(anchor.nickname ?? info.anchorName ?? '喜马拉雅主播')
    const albumTotal = Number(stats.trackCount ?? 0)
    const totalCount = albumTotal || (payload.hasMore ? page * 50 + 1 : (page - 1) * 50 + list.length)
    const maxPage = Math.max(1, Math.ceil(totalCount / 50))
    const tracks: XimalayaTrack[] = list.map((t, idx) => ({
      id: String(t.trackId ?? ''),
      title: String(t.trackName ?? t.title ?? `第${idx + 1}集`),
      artist: anchorName,
      album: t.albumName ? String(t.albumName) : info.title ? String(info.title) : undefined,
      albumId: String(question.albumId),
      duration: Number(t.duration ?? 0),
      artwork: normalizeCoverUrl(t.trackCoverPath ?? t.coverLarge ?? info.cover),
      episodeNumber: Number(t.index ?? (page - 1) * 50 + idx + 1),
      isPaid: Boolean(t.isPaid),
      isFree: t.isPaid ? Boolean(t.isFree) : true,
      isAuthorized: !t.isPaid || Boolean(t.isAuthorized),
    }))
    return { tracks, totalCount, page, maxPage }
  }
  if (question.ask === 'search') {
    const kw = encodeURIComponent(question.query)
    const page = Math.max(1, question.page ?? 1)
    const [albRes, trkRes] = await Promise.allSettled([
      fetchProxyJson(`/__ximalaya-search/front/v1?kw=${kw}&core=album&page=${page}&rows=18&device=iPhone`),
      fetchProxyJson(`/__ximalaya-search/front/v1?kw=${kw}&core=track&page=${page}&rows=24&device=iPhone`),
    ])
    const albDocs =
      albRes.status === 'fulfilled'
        ? (((albRes.value.response as Record<string, unknown>)?.docs as Record<string, unknown>[]) ?? [])
        : []
    const trkDocs =
      trkRes.status === 'fulfilled'
        ? (((trkRes.value.response as Record<string, unknown>)?.docs as Record<string, unknown>[]) ?? [])
        : []
    const albums: XimalayaAlbum[] = albDocs.map((a) => ({
      id: String(a.id ?? a.albumId ?? ''),
      title: String(a.title ?? '有声专辑'),
      artist: String(a.nickname ?? a.anchorName ?? '喜马拉雅主播'),
      artwork: normalizeCoverUrl(a.cover_path ?? a.coverLarge ?? a.cover),
      description: String(a.intro ?? a.custom_title ?? ''),
      episodeCount: Number(a.tracks ?? 0) || undefined,
      playCount: formatPlayCount(a.play),
      category: a.category_title ? String(a.category_title) : undefined,
      completed: a.is_finished === 2 ? true : a.is_finished === 1 ? false : undefined,
      isPaid: Boolean(a.is_paid),
      tag: a.is_paid ? 'VIP' : a.category_title ? String(a.category_title) : undefined,
    }))
    const tracks: XimalayaTrack[] = trkDocs.map((t) => ({
      id: String(t.id ?? t.trackId ?? ''),
      title: String(t.title ?? '声音片段'),
      artist: String(t.nickname ?? t.anchorName ?? '喜马拉雅主播'),
      album: t.album_title ? String(t.album_title) : undefined,
      albumId: t.album_id ? String(t.album_id) : undefined,
      artwork: normalizeCoverUrl(t.cover_path ?? t.coverLarge ?? t.cover),
      duration: Number(t.duration ?? 0),
      playCount: formatPlayCount(t.count_play),
      isPaid: Boolean(t.is_paid),
    }))
    return { albums, tracks, page }
  }
  if (question.ask === 'hotSearch') {
    const data = await fetchProxyJson('/__ximalaya-search/hotWordBillboard/list/2.0?categoryId=-1&size=12')
    const raw = (data.hotWordResultList ?? []) as Record<string, unknown>[]
    const hotWords = raw.map((item) => String(item.display_word ?? item.word ?? '')).filter(Boolean)
    return { hotWords }
  }
  if (question.ask === 'mySection') {
    return { needLogin: true, albums: [], tracks: [], totalCount: 0, page: question.page ?? 1, maxPage: 1 }
  }
  return {}
}

export async function queryXimalaya(question: XimalayaCatalogQuestion): Promise<XimalayaAnswers> {
  if (isInHost()) {
    return new Promise((resolve, reject) => {
      const id = ++serial > MAX_ID ? (serial = MIN_ID + 1) : serial
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('请求喜马拉雅超时，请稍后重试'))
      }, 15000)
      pending.set(id, { resolve, reject, timer })
      postToHost({ type: 'ximalaya', command: { action: 'ask', id, question } })
    })
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && typeof fetch === 'function') {
    return queryDevProxy(question)
  }
  throw new Error('Offline preview')
}
