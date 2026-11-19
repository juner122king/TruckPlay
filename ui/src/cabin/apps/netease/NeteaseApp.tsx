import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type NeteaseArtist, type NeteasePlaylist, type NeteaseRadio, type NeteaseTrack } from '../../../shared/host'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import { useCabin } from '../../state/store'
import { framed, GAP, INNER, type Place } from '../music/barLayout'
import {
  BackGlyph,
  CloseGlyph,
  HomeGlyph,
  LibraryGlyph,
  NoteGlyph,
  PauseGlyph,
  PersonGlyph,
  PlayGlyph,
  SearchGlyph,
  ShuffleGlyph,
} from '../music/glyphs'
import {
  CalendarDayGlyph,
  CrownGlyph,
  DiscoverGlyph,
  FlameGlyph,
  HeadphonesGlyph,
  HeartbeatGlyph,
  HeartGlyph,
  NeteaseMarkGlyph,
  QrCodeGlyph,
  RoamingGlyph,
  SignOutGlyph,
} from './glyphs'
import {
  backToPlaylists,
  DEFAULT_USER_PLAYLISTS,
  DISCOVER_CATEGORIES,
  HOT_SEARCH_TAGS,
  MOCK_RECOMMENDED_PLAYLISTS,
  type MyCategory,
  type NeteaseTab,
  play,
  playOrPause,
  playShuffled,
  searchSongs,
  selectArtist,
  selectDiscoverChart,
  selectMyCategory,
  selectPlaylist,
  selectRadio,
  selectTab,
  sendSignIn,
  sendSignOut,
  sendStart,
  toggleLike,
  useNetease,
  usePreviewPlaybackEnd,
  type UserProfile,
} from './netease'
import { NeteaseMiniPlayer, NowPlaying } from './NowPlaying'
import { PlaybackNoticeBanner } from './PlaybackNoticeBanner'
import { QueueDrawer } from './QueueDrawer'
import './netease.css'

const SEARCH_FIELD = 'netease-search-input'

const NAV_TABS: readonly { id: Exclude<NeteaseTab, 'search'>; label: string }[] = [
  { id: 'recommend', label: '推荐' },
  { id: 'discover', label: '发现' },
  { id: 'roaming', label: '漫游' },
  { id: 'my', label: '我的' },
]

function formatPlayCount(count?: number): string {
  if (!count) return '10万'
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}亿`
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  return `${count}`
}

function formatDuration(secs?: number): string {
  if (!secs || !Number.isFinite(secs) || secs <= 0) return ''
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m < 10 ? `0${m}` : m}:${s < 10 ? `0${s}` : s}`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11) return '早上好'
  if (hour >= 11 && hour < 14) return '中午好'
  if (hour >= 14 && hour < 19) return '下午好'
  return '晚上好'
}

interface BarMeasure {
  bar: number
  circle: number
  start: number
  end: number
  tabs: number
}

function computeBarPlaces(sizes: BarMeasure, searching: boolean): { tabs: Place; search: Place } {
  const from = sizes.start > 0 ? sizes.start + GAP : 0
  const to = sizes.bar - (sizes.end > 0 ? sizes.end + GAP : 0)
  if (searching) {
    const fieldLeft = from + sizes.circle + INNER
    return {
      tabs: { left: from, width: sizes.circle },
      search: { left: fieldLeft, width: Math.max(sizes.circle, to - fieldLeft) },
    }
  }
  const group = sizes.tabs + INNER + sizes.circle
  const centred = (sizes.bar - group) / 2
  const left = Math.max(from, Math.min(centred, to - group))
  return {
    tabs: { left, width: sizes.tabs },
    search: { left: left + sizes.tabs + INNER, width: sizes.circle },
  }
}

function barSliceStyle(frame: ReturnType<typeof framed>): CSSProperties {
  return {
    left: frame.left,
    width: frame.width,
    transform: `translateX(${frame.shift}px)`,
    clipPath: `inset(0 ${frame.cut}px 0 0 round calc(var(--ne-bar) / 2))`,
  }
}

function useBar(
  parts: {
    bar: RefObject<HTMLDivElement | null>
    start: RefObject<HTMLDivElement | null>
    end: RefObject<HTMLDivElement | null>
    tabs: RefObject<HTMLDivElement | null>
  },
  searching: boolean,
) {
  const [sizes, setSizes] = useState<BarMeasure | null>(null)
  const [ready, setReady] = useState(false)
  const { bar, start, end, tabs } = parts

  useLayoutEffect(() => {
    if (!bar.current || !start.current || !end.current || !tabs.current) return
    const measure = () =>
      setSizes({
        bar: bar.current?.clientWidth ?? 0,
        circle: bar.current?.clientHeight || 76,
        start: start.current?.offsetWidth ?? 0,
        end: end.current?.offsetWidth ?? 0,
        tabs: tabs.current?.offsetWidth ?? 0,
      })
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of [bar.current, start.current, end.current, tabs.current]) observer.observe(el)
    const timer = setTimeout(() => setReady(true), 80)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [bar, start, end, tabs])

  if (!sizes) return { ready, tabs: undefined, search: undefined }
  const closed = computeBarPlaces(sizes, false)
  const open = computeBarPlaces(sizes, true)
  const current = searching ? open : closed
  return {
    ready,
    tabs: barSliceStyle(framed(closed.tabs, current.tabs)),
    search: barSliceStyle(framed(open.search, current.search)),
  }
}

export function NeteaseApp() {
  const {
    signedIn,
    signingIn,
    tracks,
    playlists,
    radios,
    artists,
    recommendedPlaylists,
    currentPlaylist,
    currentCollectionKind,
    currentCollectionSubtitle,
    tab,
    myCategory,
    discoverChartId,
    loading,
    playback,
    userProfile,
  } = useNetease()

  const [query, setQuery] = useState('')
  const [beforeSearchTab, setBeforeSearchTab] = useState<Exclude<NeteaseTab, 'search'>>('recommend')
  const [currentDateNumber] = useState(() => new Date().getDate())
  const typing = useKeyboard((s) => s.field?.id === SEARCH_FIELD)

  const scrollRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const discoverTabsRef = useRef<HTMLDivElement>(null)
  const leavingTypingRef = useRef(false)
  const wasTypingRef = useRef(typing)

  usePreviewPlaybackEnd()

  useEffect(() => {
    sendStart()
  }, [])

  useEffect(() => {
    if (typing) useNetease.setState({ tab: 'search', currentPlaylist: null })
  }, [typing])

  useEffect(() => {
    const dismissed = wasTypingRef.current && !typing
    wasTypingRef.current = typing
    if (!dismissed) return
    const deliberate = leavingTypingRef.current
    leavingTypingRef.current = false
    const trimmed = query.trim()
    if (!deliberate && trimmed) {
      searchSongs(trimmed)
    }
  }, [typing, query])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [tab, myCategory, currentPlaylist?.id, discoverChartId])

  useEffect(() => {
    if (tab !== 'discover') return
    const activeBtn = discoverTabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    activeBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [discoverChartId, tab])

  const stopTyping = () => {
    if (useKeyboard.getState().field?.id === SEARCH_FIELD) leavingTypingRef.current = true
    useKeyboard.getState().detach(SEARCH_FIELD)
  }

  const goTab = (nextTab: NeteaseTab) => {
    stopTyping()
    if (nextTab === 'search' && tab !== 'search') {
      setBeforeSearchTab(tab)
    }
    selectTab(nextTab)
  }

  const closeSearch = () => {
    stopTyping()
    setQuery('')
    selectTab(beforeSearchTab)
  }

  const handleSearchSubmit = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    stopTyping()
    searchSongs(trimmed)
  }

  const handleTagClick = (tag: string) => {
    stopTyping()
    setQuery(tag)
    searchSongs(tag)
  }

  const searching = tab === 'search'
  const bar = useBar({ bar: barRef, start: startRef, end: endRef, tabs: tabsRef }, searching)

  const myPlaylists = (playlists.length > 0 ? playlists : DEFAULT_USER_PLAYLISTS).filter((pl, idx, arr) => {
    if (arr.findIndex((other) => other.id === pl.id) !== idx) return false
    if (myCategory === 'created') return !pl.subscribed
    if (myCategory === 'collected') return Boolean(pl.subscribed)
    return true
  })

  const uniqueRecommended = recommendedPlaylists.filter(
    (pl, idx, arr) => arr.findIndex((other) => other.id === pl.id) === idx,
  )

  return (
    <>
      <section className="app-panel netease-app" aria-label="网易云音乐">
        {/* Floating CarPlay Glass Top Navigation Bar */}
        <header ref={barRef} className={`ne-bar${bar.ready ? ' ready' : ''}`}>
          <div ref={startRef} className="ne-bar-side">
            {currentPlaylist && !typing && (
              <button type="button" className="ne-round glass" aria-label="返回" onClick={backToPlaylists}>
                <BackGlyph size={32} />
              </button>
            )}
          </div>

          <nav className={`ne-tabs${searching ? ' searching' : ''}`} aria-label="网易云导航">
            <div className="ne-tab-bar glass" style={bar.tabs}>
              <div ref={tabsRef} className="ne-tab-list" aria-hidden={searching}>
                {NAV_TABS.map((item) => {
                  const active = item.id === tab && !typing && !currentPlaylist
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`ne-tab${active ? ' on' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      tabIndex={searching ? -1 : undefined}
                      onClick={() => goTab(item.id)}
                    >
                      <TabGlyph tab={item.id} on={active} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                className="ne-close-search"
                aria-label="关闭搜索"
                aria-hidden={!searching}
                tabIndex={searching ? undefined : -1}
                onClick={closeSearch}
              >
                <CloseGlyph size={28} />
              </button>
            </div>

            <div className={`ne-search glass${searching ? ' open' : ''}`} style={bar.search}>
              {searching ? (
                <TextField
                  id={SEARCH_FIELD}
                  value={query}
                  onChange={setQuery}
                  onSubmit={handleSearchSubmit}
                  returnKind="search"
                  hint="搜索歌曲、歌手、专辑…"
                  label="搜索歌曲"
                  icon={<SearchGlyph size={28} />}
                />
              ) : (
                <button type="button" className="ne-search-button" aria-label="搜索" onClick={() => goTab('search')}>
                  <SearchGlyph size={30} />
                </button>
              )}
            </div>
          </nav>

          <div ref={endRef} className="ne-bar-side end">
            {signingIn ? (
              <div className="ne-signing-pill glass" role="status">
                <span className="ne-spinner" aria-hidden="true" />
                <span>扫码中…</span>
              </div>
            ) : signedIn && !typing ? (
              <AccountMenu userProfile={userProfile} onSignOut={sendSignOut} />
            ) : !signedIn ? (
              <button type="button" className="ne-sign-in glass" onClick={sendSignIn}>
                扫码登录
              </button>
            ) : null}
          </div>
        </header>

        {/* Full-Width Scrollable Content Viewport */}
        <div ref={scrollRef} className={`ne-scroll${playback ? ' has-mini' : ''}`}>
          {signingIn && (
            <div className="ne-qr-notice glass" role="status">
              <span className="ne-qr-icon" aria-hidden="true">
                <QrCodeGlyph size={26} />
              </span>
              <div className="ne-qr-copy">
                <strong>桌面扫码登录窗口已开启</strong>
                <span>请在电脑桌面使用网易云音乐手机端扫码，即可同步个人红心歌单与黑胶权益。</span>
              </div>
            </div>
          )}

          <PlaybackNoticeBanner className="ne-inline-notice" />

          {/* 1. RECOMMEND VIEW */}
          {tab === 'recommend' && !currentPlaylist && (
            <div className="ne-page">
              <div className="ne-page-head">
                <h1 className="ne-page-title">推荐</h1>
                <span className="ne-greeting-pill">{getGreeting()}</span>
              </div>

              <section className="ne-hero-grid" aria-label="快捷听歌模式">
                <button
                  type="button"
                  className="ne-hero-card hero-daily"
                  onClick={() => {
                    if (tracks.length > 0) play(tracks[0], tracks, 0)
                  }}
                >
                  <div className="ne-hero-top">
                    <span className="ne-hero-icon">
                      <CalendarDayGlyph size={26} day={currentDateNumber} />
                    </span>
                    <span className="ne-hero-badge">每日推荐</span>
                  </div>
                  <span className="ne-hero-sub">符合口味的新鲜好歌</span>
                </button>

                <button type="button" className="ne-hero-card hero-roaming" onClick={() => goTab('roaming')}>
                  <div className="ne-hero-top">
                    <span className="ne-hero-icon">
                      <RoamingGlyph size={26} />
                    </span>
                    <span className="ne-hero-badge">私人漫游</span>
                  </div>
                  <span className="ne-hero-sub">多种听歌模式随心播</span>
                </button>

                <button
                  type="button"
                  className="ne-hero-card hero-heartbeat"
                  onClick={() => {
                    const target = tracks[1] ?? tracks[0]
                    const idx = tracks[1] ? 1 : 0
                    if (target) play(target, tracks, idx)
                  }}
                >
                  <div className="ne-hero-top">
                    <span className="ne-hero-icon">
                      <HeartbeatGlyph size={26} />
                    </span>
                    <span className="ne-hero-badge">心动模式</span>
                  </div>
                  <span className="ne-hero-sub">智能推荐你的红心最爱</span>
                </button>

                <button
                  type="button"
                  className="ne-hero-card hero-soar"
                  onClick={() =>
                    selectPlaylist(
                      recommendedPlaylists.find((p) => p.id === '19723756') ??
                        MOCK_RECOMMENDED_PLAYLISTS[1],
                    )
                  }
                >
                  <div className="ne-hero-top">
                    <span className="ne-hero-icon">
                      <FlameGlyph size={26} />
                    </span>
                    <span className="ne-hero-badge">飙升榜单</span>
                  </div>
                  <span className="ne-hero-sub">全网热度实时更新</span>
                </button>
              </section>

              <section className="ne-section">
                <div className="ne-section-head">
                  <h2>推荐歌单</h2>
                </div>
                <PlaylistGrid playlists={uniqueRecommended} onSelect={selectPlaylist} />
              </section>

              <section className="ne-section">
                <div className="ne-section-head">
                  <h2>今日热推好歌</h2>
                </div>
                <SongListView tracks={tracks} loading={loading} />
              </section>
            </div>
          )}

          {/* 2. DISCOVER VIEW */}
          {tab === 'discover' && !currentPlaylist && (
            <div className="ne-page">
              <div className="ne-page-head">
                <h1 className="ne-page-title">发现</h1>
              </div>

              <div ref={discoverTabsRef} className="ne-sub-tabs" role="tablist" aria-label="榜单与曲风分类">
                {DISCOVER_CATEGORIES.map((c) => {
                  const active = discoverChartId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`ne-pill ${c.kind === 'brand' ? 'brand' : 'genre'}${active ? ' active' : ''}`}
                      onClick={() => selectDiscoverChart(c.id)}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>

              <SongListView tracks={tracks} loading={loading} showRank />
            </div>
          )}

          {/* 3. ROAMING VIEW */}
          {tab === 'roaming' && !currentPlaylist && (
            <div className="ne-page">
              <div className="ne-page-head">
                <h1 className="ne-page-title">漫游</h1>
              </div>

              <div className="ne-roaming-hero">
                <div className="ne-roaming-badge" aria-hidden="true">
                  <RoamingGlyph size={38} />
                </div>
                <div className="ne-roaming-info">
                  <h2>车载私人漫游电台</h2>
                  <p>根据驾驶节奏与收听偏好持续匹配曲目，长途巡航省心连播。</p>
                  <div className="ne-roaming-actions">
                    <button
                      type="button"
                      className="ne-btn-primary"
                      onClick={() => {
                        if (tracks.length > 0) play(tracks[0], tracks, 0)
                      }}
                    >
                      <PlayGlyph size={20} />
                      <span>开始漫游播放</span>
                    </button>
                    <button
                      type="button"
                      className="ne-btn-secondary"
                      onClick={() => playShuffled(tracks)}
                      disabled={tracks.length === 0}
                    >
                      <ShuffleGlyph size={20} />
                      <span>随机切换</span>
                    </button>
                  </div>
                </div>
              </div>

              <section className="ne-section">
                <div className="ne-section-head">
                  <h2>漫游推荐曲目</h2>
                </div>
                <SongListView tracks={tracks} loading={loading} />
              </section>
            </div>
          )}

          {/* 4. MY MUSIC VIEW */}
          {tab === 'my' && !currentPlaylist && (
            <div className="ne-page">
              <div className="ne-page-head">
                <h1 className="ne-page-title">我的</h1>
                {loading && <span className="ne-sync-badge">正在同步…</span>}
              </div>

              {!signedIn ? (
                <div className="ne-empty-card">
                  <span className="ne-empty-emblem" aria-hidden="true">
                    <NeteaseMarkGlyph size={56} />
                  </span>
                  <h2>登录网易云音乐</h2>
                  <p>扫码登录后，可在座舱内同步「我喜欢的音乐」、自建歌单与黑胶 VIP 曲库。</p>
                  <button type="button" className="ne-btn-primary large" onClick={sendSignIn}>
                    桌面扫码登录
                  </button>
                </div>
              ) : (
                <>
                  <div className="ne-sub-tabs" role="tablist" aria-label="我的曲库分类">
                    {(
                      [
                        { id: 'all', label: '全部' },
                        { id: 'created', label: '自建' },
                        { id: 'collected', label: '收藏' },
                        { id: 'radio', label: '电台' },
                        { id: 'artist', label: '歌手' },
                      ] as const satisfies readonly { id: MyCategory; label: string }[]
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={myCategory === cat.id}
                        className={`ne-pill brand${myCategory === cat.id ? ' active' : ''}`}
                        onClick={() => selectMyCategory(cat.id)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {myCategory === 'radio' ? (
                    loading && radios.length === 0 ? (
                      <div className="ne-playlists-grid" aria-busy="true">
                        {Array.from({ length: 6 }, (_, i) => (
                          <div key={i} className="ne-pl-skeleton">
                            <div className="ne-pl-skel-cover" />
                            <div className="ne-pl-skel-line" />
                          </div>
                        ))}
                      </div>
                    ) : radios.length === 0 ? (
                      <div className="ne-list-empty">暂无订阅电台</div>
                    ) : (
                      <RadioGrid radios={radios} onSelect={selectRadio} />
                    )
                  ) : myCategory === 'artist' ? (
                    loading && artists.length === 0 ? (
                      <div className="ne-playlists-grid" aria-busy="true">
                        {Array.from({ length: 6 }, (_, i) => (
                          <div key={i} className="ne-pl-skeleton">
                            <div className="ne-pl-skel-cover round" />
                            <div className="ne-pl-skel-line" />
                          </div>
                        ))}
                      </div>
                    ) : artists.length === 0 ? (
                      <div className="ne-list-empty">暂无收藏歌手</div>
                    ) : (
                      <ArtistGrid artists={artists} onSelect={selectArtist} />
                    )
                  ) : loading && myPlaylists.length === 0 ? (
                    <div className="ne-playlists-grid" aria-busy="true">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="ne-pl-skeleton">
                          <div className="ne-pl-skel-cover" />
                          <div className="ne-pl-skel-line" />
                        </div>
                      ))}
                    </div>
                  ) : myPlaylists.length === 0 ? (
                    <div className="ne-list-empty">暂无{myCategory === 'collected' ? '收藏' : '自建'}歌单</div>
                  ) : (
                    <PlaylistGrid playlists={myPlaylists} onSelect={selectPlaylist} showCount />
                  )}
                </>
              )}
            </div>
          )}

          {/* 5. SEARCH VIEW */}
          {tab === 'search' && !currentPlaylist && (
            <div className="ne-page">
              <div className="ne-page-head">
                <h1 className="ne-page-title">搜索</h1>
                {query.trim() && (
                  <button type="button" className="ne-search-go" onClick={handleSearchSubmit}>
                    立即搜索
                  </button>
                )}
              </div>

              <div className="ne-search-tags">
                <span className="ne-tags-label">大家都在搜</span>
                <div className="ne-sub-tabs">
                  {HOT_SEARCH_TAGS.map((tag, idx) => (
                    <button
                      key={tag}
                      type="button"
                      className={`ne-pill ${idx < 2 ? 'brand' : 'genre'}${query.trim() === tag ? ' active' : ''}`}
                      onClick={() => handleTagClick(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <section className="ne-section">
                <div className="ne-section-head">
                  <h2>{query.trim() ? `搜索结果：“${query.trim()}”` : '推荐热搜好歌'}</h2>
                </div>
                <SongListView tracks={tracks} loading={loading} />
              </section>
            </div>
          )}

          {/* 6. PLAYLIST / RADIO / ARTIST DETAIL VIEW */}
          {currentPlaylist && (
            <div className="ne-page">
              <div className="ne-collection-head">
                <div className={`ne-collection-cover${currentCollectionKind === 'artist' ? ' round' : ''}`}>
                  {currentPlaylist.coverImgUrl ? (
                    <img src={currentPlaylist.coverImgUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="ne-cover-fallback" aria-hidden="true">
                      {currentCollectionKind === 'artist' ? <PersonGlyph size={56} /> : <NoteGlyph size={56} />}
                    </span>
                  )}
                </div>

                <div className="ne-collection-meta">
                  <h1 className="ne-collection-title">{currentPlaylist.name}</h1>
                  <p className="ne-collection-sub">
                    {currentCollectionSubtitle && <span>{currentCollectionSubtitle} · </span>}
                    <span>
                      {tracks.length > 0 ? tracks.length : currentPlaylist.trackCount}{' '}
                      {currentCollectionKind === 'radio'
                        ? '期节目'
                        : currentCollectionKind === 'artist'
                          ? '首热门单曲'
                          : '首歌曲'}
                    </span>
                    {loading && <span className="ne-sync-badge">· 正在同步…</span>}
                  </p>
                  <div className="ne-collection-actions">
                    <button
                      type="button"
                      className="ne-btn-primary"
                      disabled={tracks.length === 0}
                      onClick={() => {
                        if (tracks.length > 0) play(tracks[0], tracks, 0)
                      }}
                    >
                      <PlayGlyph size={20} />
                      <span>播放全部</span>
                    </button>
                    <button
                      type="button"
                      className="ne-btn-secondary"
                      disabled={tracks.length === 0}
                      onClick={() => playShuffled(tracks)}
                    >
                      <ShuffleGlyph size={20} />
                      <span>随机播放</span>
                    </button>
                  </div>
                </div>
              </div>

              <SongListView tracks={tracks} loading={loading} />
            </div>
          )}
        </div>

        {/* Floating Glass Mini Player Capsule */}
        <NeteaseMiniPlayer aside={typing} />

        {/* Slide-In Queue Drawer */}
        <QueueDrawer />
      </section>

      {/* Fullscreen CarPlay Vinyl Now Playing Overlay */}
      <NowPlaying />
    </>
  )
}

function TabGlyph({ tab, on }: { tab: Exclude<NeteaseTab, 'search'>; on: boolean }) {
  switch (tab) {
    case 'recommend':
      return <HomeGlyph size={28} on={on} />
    case 'discover':
      return <DiscoverGlyph size={28} on={on} />
    case 'roaming':
      return <RoamingGlyph size={28} />
    case 'my':
      return <LibraryGlyph size={28} />
  }
}

function AccountMenu({ userProfile, onSignOut }: { userProfile: UserProfile | null; onSignOut(): void }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const isVip = (userProfile?.vipType ?? 0) > 0

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={boxRef} className="ne-account">
      <button
        type="button"
        className={`ne-me glass${isVip ? ' vip' : ''}`}
        aria-label={userProfile?.nickname ? `账号：${userProfile.nickname}` : '网易云账号'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {userProfile?.avatarUrl ? (
          <img src={userProfile.avatarUrl} alt="" referrerPolicy="no-referrer" draggable={false} />
        ) : (
          <PersonGlyph size={32} />
        )}
        {isVip && (
          <span className="ne-me-vip-dot" aria-hidden="true">
            <CrownGlyph size={11} />
          </span>
        )}
      </button>

      {open && (
        <div className="ne-account-menu" role="menu" aria-label="账号菜单">
          <div className="ne-account-profile">
            <span className="ne-account-name">{userProfile?.nickname || '网易云音乐账号'}</span>
            <span className={`ne-account-tier${isVip ? ' vip' : ''}`}>
              {isVip && <CrownGlyph size={13} />}
              <span>{isVip ? '黑胶 VIP' : '已登录'}</span>
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="ne-account-signout"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            <SignOutGlyph size={20} />
            <span>退出登录</span>
          </button>
        </div>
      )}
    </div>
  )
}

function PlaylistGrid({
  playlists,
  onSelect,
  showCount = false,
}: {
  playlists: NeteasePlaylist[]
  onSelect(playlist: NeteasePlaylist): void
  showCount?: boolean
}) {
  const albumArt = useCabin((s) => s.albumArt)
  return (
    <div className="ne-playlists-grid">
      {playlists.map((pl) => (
        <button key={pl.id} type="button" className="ne-pl-card" onClick={() => onSelect(pl)}>
          <div className="ne-pl-thumb">
            {albumArt && pl.coverImgUrl ? (
              <img src={pl.coverImgUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="ne-cover-fallback" aria-hidden="true">
                <NoteGlyph size={38} />
              </span>
            )}
            <span className="ne-pl-play-count">
              <HeadphonesGlyph size={13} />
              <span>{formatPlayCount(pl.playCount)}</span>
            </span>
          </div>
          <span className="ne-pl-title">{pl.name}</span>
          {showCount && <span className="ne-pl-sub">{pl.trackCount} 首歌曲</span>}
        </button>
      ))}
    </div>
  )
}

function RadioGrid({ radios, onSelect }: { radios: NeteaseRadio[]; onSelect(radio: NeteaseRadio): void }) {
  const albumArt = useCabin((s) => s.albumArt)
  return (
    <div className="ne-playlists-grid">
      {radios.map((radio) => (
        <button key={radio.id} type="button" className="ne-pl-card" onClick={() => onSelect(radio)}>
          <div className="ne-pl-thumb">
            {albumArt && radio.picUrl ? (
              <img src={radio.picUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="ne-cover-fallback" aria-hidden="true">
                <RoamingGlyph size={38} />
              </span>
            )}
            {radio.programCount > 0 && <span className="ne-pl-play-count">{radio.programCount} 期</span>}
          </div>
          <span className="ne-pl-title">{radio.name}</span>
          <span className="ne-pl-sub">{radio.djName ? `by ${radio.djName}` : '播客电台'}</span>
        </button>
      ))}
    </div>
  )
}

function ArtistGrid({ artists, onSelect }: { artists: NeteaseArtist[]; onSelect(artist: NeteaseArtist): void }) {
  const albumArt = useCabin((s) => s.albumArt)
  return (
    <div className="ne-playlists-grid">
      {artists.map((artist) => {
        const subParts: string[] = []
        if (artist.musicSize) subParts.push(`${artist.musicSize} 首单曲`)
        if (artist.albumSize) subParts.push(`${artist.albumSize} 张专辑`)
        return (
          <button key={artist.id} type="button" className="ne-pl-card ne-artist-card" onClick={() => onSelect(artist)}>
            <div className="ne-pl-thumb ne-artist-thumb">
              {albumArt && artist.picUrl ? (
                <img src={artist.picUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="ne-cover-fallback" aria-hidden="true">
                  <PersonGlyph size={44} />
                </span>
              )}
            </div>
            <span className="ne-pl-title">{artist.name}</span>
            {subParts.length > 0 && <span className="ne-pl-sub">{subParts.join(' · ')}</span>}
          </button>
        )
      })}
    </div>
  )
}

function SongListView({
  tracks,
  loading,
  showRank = false,
}: {
  tracks: NeteaseTrack[]
  loading: boolean
  showRank?: boolean
}) {
  const playback = useNetease((s) => s.playback)
  const playing = useNetease((s) => Boolean(s.playing))
  const likedTrackIds = useNetease((s) => s.likedTrackIds)
  const albumArt = useCabin((s) => s.albumArt)

  if (loading && tracks.length === 0) {
    return (
      <div className="ne-list-loading" role="status">
        <span className="ne-spinner" aria-hidden="true" />
        <span>正在加载歌曲列表…</span>
      </div>
    )
  }

  if (tracks.length === 0) {
    return <div className="ne-list-empty">暂无歌曲</div>
  }

  return (
    <div className="ne-song-list">
      {tracks.map((track, idx) => {
        const isCurrent = playback?.trackId
          ? playback.trackId === track.id
          : playback?.title === track.title && playback?.artist === track.artist
        const isUnplayable = track.playable === false
        const isVip = track.fee === 1 || track.fee === 4
        const isLiked = likedTrackIds.includes(track.id)
        const durText = formatDuration(track.duration)

        return (
          <div
            key={`${track.id}-${idx}`}
            className={`ne-song-row${isCurrent ? ' is-playing' : ''}${isUnplayable ? ' is-unplayable' : ''}`}
          >
            <button
              type="button"
              className="ne-song-main"
              onClick={() => play(track, tracks, idx)}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span className="ne-song-idx">
                {isCurrent ? (
                  <span className="ne-sound-bars" aria-hidden="true">
                    <i className={`b1${playing ? ' anim' : ''}`} />
                    <i className={`b2${playing ? ' anim' : ''}`} />
                    <i className={`b3${playing ? ' anim' : ''}`} />
                  </span>
                ) : (
                  <span className={`ne-idx-num${showRank && idx < 3 ? ' top' : ''}`}>{idx + 1}</span>
                )}
              </span>

              <span className="ne-song-thumb">
                {albumArt && track.artwork ? (
                  <img src={track.artwork} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="ne-song-thumb-fallback" aria-hidden="true">
                    <NoteGlyph size={24} />
                  </span>
                )}
              </span>

              <span className="ne-song-body">
                <span className="ne-song-title-row">
                  <span className="ne-song-title">{track.title}</span>
                  {isVip && <span className="ne-badge-vip">{track.fee === 4 ? '付费' : 'VIP'}</span>}
                  {isUnplayable && <span className="ne-badge-muted">{isVip ? 'VIP限播' : '无音源'}</span>}
                </span>
                <span className="ne-song-artist">
                  {track.artist}
                  {track.album ? ` · ${track.album}` : ''}
                </span>
              </span>

              {durText && <span className="ne-song-duration">{durText}</span>}
            </button>

            <button
              type="button"
              className={`ne-song-action ne-song-like${isLiked ? ' liked' : ''}`}
              onClick={() => toggleLike(track.id)}
              aria-label={isLiked ? `取消喜欢 ${track.title}` : `喜欢 ${track.title}`}
              aria-pressed={isLiked}
            >
              <HeartGlyph size={20} on={isLiked} />
            </button>

            <button
              type="button"
              className="ne-song-action ne-song-play"
              onClick={() => {
                if (isCurrent) {
                  playOrPause()
                } else {
                  play(track, tracks, idx)
                }
              }}
              aria-label={isCurrent && playing ? `暂停 ${track.title}` : `播放 ${track.title}`}
            >
              {isCurrent && playing ? <PauseGlyph size={20} /> : <PlayGlyph size={20} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
