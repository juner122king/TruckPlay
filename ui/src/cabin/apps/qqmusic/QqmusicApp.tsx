import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type QqmusicArtist, type QqmusicPlaylist, type QqmusicRadio, type QqmusicTrack } from '../../../shared/host'
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
  RadioGlyph,
  SearchGlyph,
  ShuffleGlyph,
} from '../music/glyphs'
import {
  CalendarDayGlyph,
  DiamondVipGlyph,
  DiscoverGlyph,
  FlameGlyph,
  HeadphonesGlyph,
  HeartGlyph,
  QqmusicMarkGlyph,
  QrCodeGlyph,
  SignOutGlyph,
  TrendGlyph,
} from './glyphs'
import { NowPlaying, QqmusicMiniPlayer } from './NowPlaying'
import { PlaybackNoticeBanner } from './PlaybackNoticeBanner'
import { QueueDrawer } from './QueueDrawer'
import {
  backToPlaylists,
  DEFAULT_USER_PLAYLISTS,
  DISCOVER_CATEGORIES,
  HOT_SEARCH_TAGS,
  type MyCategory,
  play,
  playOrPause,
  playShuffled,
  type QqmusicTab,
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
  usePreviewPlaybackEnd,
  useQqmusic,
  type UserProfile,
} from './qqmusic'
import './qqmusic.css'

const SEARCH_FIELD = 'qqmusic-search-input'

const NAV_TABS: readonly { id: Exclude<QqmusicTab, 'search'>; label: string }[] = [
  { id: 'recommend', label: '推荐' },
  { id: 'discover', label: '乐馆' },
  { id: 'radio', label: '电台' },
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
    clipPath: `inset(0 ${frame.cut}px 0 0 round calc(var(--qqm-bar) / 2))`,
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

export function QqmusicApp() {
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
  } = useQqmusic()

  const [query, setQuery] = useState('')
  const [beforeSearchTab, setBeforeSearchTab] = useState<Exclude<QqmusicTab, 'search'>>('recommend')
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
    if (typing) useQqmusic.setState({ tab: 'search', currentPlaylist: null })
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

  const goTab = (nextTab: QqmusicTab) => {
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

  const openChartInDiscover = (chartId: string) => {
    stopTyping()
    useQqmusic.setState({ discoverChartId: chartId })
    selectTab('discover')
  }

  const searching = tab === 'search'
  const bar = useBar({ bar: barRef, start: startRef, end: endRef, tabs: tabsRef }, searching)

  const sourcePlaylists = playlists.length > 0 ? playlists : loading ? [] : DEFAULT_USER_PLAYLISTS
  const myPlaylists = sourcePlaylists.filter((pl, idx, arr) => {
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
      <section className="app-panel qqmusic-app" aria-label="QQ音乐">
        {/* Floating CarPlay Glass Top Navigation Bar */}
        <header ref={barRef} className={`qqm-bar${bar.ready ? ' ready' : ''}`}>
          <div ref={startRef} className="qqm-bar-side">
            {currentPlaylist && !typing && (
              <button type="button" className="qqm-round glass" aria-label="返回" onClick={backToPlaylists}>
                <BackGlyph size={32} />
              </button>
            )}
          </div>

          <nav className={`qqm-tabs${searching ? ' searching' : ''}`} aria-label="QQ音乐导航">
            <div className="qqm-tab-bar glass" style={bar.tabs}>
              <div ref={tabsRef} className="qqm-tab-list" aria-hidden={searching}>
                {NAV_TABS.map((item) => {
                  const active = item.id === tab && !typing && !currentPlaylist
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`qqm-tab${active ? ' on' : ''}`}
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
                className="qqm-close-search"
                aria-label="关闭搜索"
                aria-hidden={!searching}
                tabIndex={searching ? undefined : -1}
                onClick={closeSearch}
              >
                <CloseGlyph size={28} />
              </button>
            </div>

            <div className={`qqm-search glass${searching ? ' open' : ''}`} style={bar.search}>
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
                <button type="button" className="qqm-search-button" aria-label="搜索" onClick={() => goTab('search')}>
                  <SearchGlyph size={30} />
                </button>
              )}
            </div>
          </nav>

          <div ref={endRef} className="qqm-bar-side end">
            {signingIn ? (
              <div className="qqm-signing-pill glass" role="status">
                <span className="qqm-spinner" aria-hidden="true" />
                <span>扫码中…</span>
              </div>
            ) : signedIn && !typing ? (
              <AccountMenu userProfile={userProfile} onSignOut={sendSignOut} />
            ) : !signedIn ? (
              <button type="button" className="qqm-sign-in glass" onClick={sendSignIn}>
                扫码登录
              </button>
            ) : null}
          </div>
        </header>

        {/* Scrollable Content Viewport */}
        <div ref={scrollRef} className={`qqm-scroll${playback ? ' has-mini' : ''}`}>
          {signingIn && (
            <div className="qqm-qr-notice glass" role="status">
              <span className="qqm-qr-icon" aria-hidden="true">
                <QrCodeGlyph size={26} />
              </span>
              <div className="qqm-qr-copy">
                <strong>桌面扫码登录窗口已开启</strong>
                <span>请在电脑桌面使用手机 QQ 或微信扫码，即可解锁曲库播放、个人歌单与绿钻 VIP 权益。</span>
              </div>
            </div>
          )}

          <PlaybackNoticeBanner className="qqm-inline-notice" />

          {/* 1. RECOMMEND VIEW */}
          {tab === 'recommend' && !currentPlaylist && (
            <div className="qqm-page">
              <div className="qqm-page-head">
                <h1 className="qqm-page-title">推荐</h1>
                <span className="qqm-greeting-pill">{getGreeting()}</span>
              </div>

              <section className="qqm-hero-grid" aria-label="快捷听歌模式">
                <button
                  type="button"
                  className="qqm-hero-card hero-daily"
                  onClick={() => {
                    if (tracks.length > 0) play(tracks[0], tracks, 0)
                  }}
                >
                  <div className="qqm-hero-top">
                    <span className="qqm-hero-icon">
                      <CalendarDayGlyph size={26} day={currentDateNumber} />
                    </span>
                    <span className="qqm-hero-badge">每日热歌</span>
                  </div>
                  <span className="qqm-hero-sub">一键开听今日精选好歌</span>
                </button>

                <button type="button" className="qqm-hero-card hero-radio" onClick={() => goTab('radio')}>
                  <div className="qqm-hero-top">
                    <span className="qqm-hero-icon">
                      <RadioGlyph size={26} />
                    </span>
                    <span className="qqm-hero-badge">随心听电台</span>
                  </div>
                  <span className="qqm-hero-sub">车载场景电台省心连播</span>
                </button>

                <button type="button" className="qqm-hero-card hero-soar" onClick={() => openChartInDiscover('62')}>
                  <div className="qqm-hero-top">
                    <span className="qqm-hero-icon">
                      <FlameGlyph size={26} />
                    </span>
                    <span className="qqm-hero-badge">巅峰飙升</span>
                  </div>
                  <span className="qqm-hero-sub">全网热度实时上升榜</span>
                </button>

                <button type="button" className="qqm-hero-card hero-trend" onClick={() => openChartInDiscover('4')}>
                  <div className="qqm-hero-top">
                    <span className="qqm-hero-icon">
                      <TrendGlyph size={26} />
                    </span>
                    <span className="qqm-hero-badge">流行指数</span>
                  </div>
                  <span className="qqm-hero-sub">近期高人气趋势热曲</span>
                </button>
              </section>

              <section className="qqm-section">
                <div className="qqm-section-head">
                  <h2>推荐歌单</h2>
                </div>
                <PlaylistGrid playlists={uniqueRecommended} onSelect={selectPlaylist} />
              </section>

              <section className="qqm-section">
                <div className="qqm-section-head">
                  <h2>巅峰热歌榜</h2>
                </div>
                <SongListView tracks={tracks} loading={loading} />
              </section>
            </div>
          )}

          {/* 2. DISCOVER / MUSIC HALL (CHARTS) VIEW */}
          {tab === 'discover' && !currentPlaylist && (
            <div className="qqm-page">
              <div className="qqm-page-head">
                <h1 className="qqm-page-title">乐馆</h1>
              </div>

              <div ref={discoverTabsRef} className="qqm-sub-tabs" role="tablist" aria-label="巅峰榜与特色榜分类">
                {DISCOVER_CATEGORIES.map((c) => {
                  const active = discoverChartId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`qqm-pill ${c.kind === 'brand' ? 'brand' : 'genre'}${active ? ' active' : ''}`}
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

          {/* 3. RADIO (随心听) VIEW */}
          {tab === 'radio' && !currentPlaylist && (
            <div className="qqm-page">
              <div className="qqm-page-head">
                <h1 className="qqm-page-title">电台</h1>
                {loading && <span className="qqm-sync-badge">正在加载…</span>}
              </div>

              <div className="qqm-radio-hero">
                <div className="qqm-radio-badge" aria-hidden="true">
                  <RadioGlyph size={38} />
                </div>
                <div className="qqm-radio-info">
                  <h2>QQ音乐随心听</h2>
                  <p>官方精选主题与场景电台，点开即播，陪伴每一段长途旅程。</p>
                  <div className="qqm-radio-actions">
                    <button
                      type="button"
                      className="qqm-btn-primary"
                      disabled={radios.length === 0}
                      onClick={() => {
                        if (radios[0]) selectRadio(radios[0])
                      }}
                    >
                      <PlayGlyph size={20} />
                      <span>进入热门电台</span>
                    </button>
                    <button
                      type="button"
                      className="qqm-btn-secondary"
                      disabled={radios.length === 0}
                      onClick={() => {
                        if (radios.length > 0) {
                          const picked = radios[Math.floor(Math.random() * radios.length)]
                          if (picked) selectRadio(picked)
                        }
                      }}
                    >
                      <ShuffleGlyph size={20} />
                      <span>随机电台</span>
                    </button>
                  </div>
                </div>
              </div>

              <section className="qqm-section">
                <div className="qqm-section-head">
                  <h2>精选电台</h2>
                </div>
                {loading && radios.length === 0 ? (
                  <div className="qqm-playlists-grid" aria-busy="true">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="qqm-pl-skeleton">
                        <div className="qqm-pl-skel-cover" />
                        <div className="qqm-pl-skel-line" />
                      </div>
                    ))}
                  </div>
                ) : radios.length === 0 ? (
                  <div className="qqm-list-empty">暂无可用电台</div>
                ) : (
                  <RadioGrid radios={radios} onSelect={selectRadio} />
                )}
              </section>
            </div>
          )}

          {/* 4. MY MUSIC VIEW */}
          {tab === 'my' && !currentPlaylist && (
            <div className="qqm-page">
              <div className="qqm-page-head">
                <h1 className="qqm-page-title">我的</h1>
                {loading && <span className="qqm-sync-badge">正在同步…</span>}
              </div>

              {!signedIn ? (
                <div className="qqm-empty-card">
                  <span className="qqm-empty-emblem" aria-hidden="true">
                    <QqmusicMarkGlyph size={56} />
                  </span>
                  <h2>登录 QQ 音乐</h2>
                  <p>支持手机 QQ 或微信扫码登录，在座舱内同步「我喜欢」、自建/收藏歌单、关注歌手与绿钻 VIP 曲库。</p>
                  <button type="button" className="qqm-btn-primary large" onClick={sendSignIn}>
                    桌面扫码登录
                  </button>
                </div>
              ) : (
                <>
                  <div className="qqm-sub-tabs" role="tablist" aria-label="我的曲库分类">
                    {(
                      [
                        { id: 'all', label: '全部' },
                        { id: 'created', label: '自建' },
                        { id: 'collected', label: '收藏' },
                        { id: 'artist', label: '歌手' },
                      ] as const satisfies readonly { id: MyCategory; label: string }[]
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={myCategory === cat.id}
                        className={`qqm-pill brand${myCategory === cat.id ? ' active' : ''}`}
                        onClick={() => selectMyCategory(cat.id)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {myCategory === 'artist' ? (
                    loading && artists.length === 0 ? (
                      <div className="qqm-playlists-grid" aria-busy="true">
                        {Array.from({ length: 6 }, (_, i) => (
                          <div key={i} className="qqm-pl-skeleton">
                            <div className="qqm-pl-skel-cover round" />
                            <div className="qqm-pl-skel-line" />
                          </div>
                        ))}
                      </div>
                    ) : artists.length === 0 ? (
                      <div className="qqm-list-empty">暂无关注歌手</div>
                    ) : (
                      <ArtistGrid artists={artists} onSelect={selectArtist} />
                    )
                  ) : loading && myPlaylists.length === 0 ? (
                    <div className="qqm-playlists-grid" aria-busy="true">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="qqm-pl-skeleton">
                          <div className="qqm-pl-skel-cover" />
                          <div className="qqm-pl-skel-line" />
                        </div>
                      ))}
                    </div>
                  ) : myPlaylists.length === 0 ? (
                    <div className="qqm-list-empty">暂无{myCategory === 'collected' ? '收藏' : '自建'}歌单</div>
                  ) : (
                    <PlaylistGrid playlists={myPlaylists} onSelect={selectPlaylist} showCount />
                  )}
                </>
              )}
            </div>
          )}

          {/* 5. SEARCH VIEW */}
          {tab === 'search' && !currentPlaylist && (
            <div className="qqm-page">
              <div className="qqm-page-head">
                <h1 className="qqm-page-title">搜索</h1>
                {query.trim() && (
                  <button type="button" className="qqm-search-go" onClick={handleSearchSubmit}>
                    立即搜索
                  </button>
                )}
              </div>

              <div className="qqm-search-tags">
                <span className="qqm-tags-label">大家都在搜</span>
                <div className="qqm-sub-tabs">
                  {HOT_SEARCH_TAGS.map((tag, idx) => (
                    <button
                      key={tag}
                      type="button"
                      className={`qqm-pill ${idx < 2 ? 'brand' : 'genre'}${query.trim() === tag ? ' active' : ''}`}
                      onClick={() => handleTagClick(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <section className="qqm-section">
                <div className="qqm-section-head">
                  <h2>{query.trim() ? `搜索结果：“${query.trim()}”` : '推荐热搜好歌'}</h2>
                </div>
                <SongListView tracks={tracks} loading={loading} />
              </section>
            </div>
          )}

          {/* 6. PLAYLIST / RADIO / ARTIST DETAIL VIEW */}
          {currentPlaylist && (
            <div className="qqm-page">
              <div className="qqm-collection-head">
                <div className={`qqm-collection-cover${currentCollectionKind === 'artist' ? ' round' : ''}`}>
                  {currentPlaylist.coverImgUrl ? (
                    <img src={currentPlaylist.coverImgUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="qqm-cover-fallback" aria-hidden="true">
                      {currentCollectionKind === 'artist' ? (
                        <PersonGlyph size={56} />
                      ) : currentCollectionKind === 'radio' ? (
                        <RadioGlyph size={56} />
                      ) : (
                        <NoteGlyph size={56} />
                      )}
                    </span>
                  )}
                </div>

                <div className="qqm-collection-meta">
                  <h1 className="qqm-collection-title">{currentPlaylist.name}</h1>
                  <p className="qqm-collection-sub">
                    {currentCollectionSubtitle && <span>{currentCollectionSubtitle} · </span>}
                    <span>
                      {tracks.length > 0 ? tracks.length : currentPlaylist.trackCount}{' '}
                      {currentCollectionKind === 'artist' ? '首热门单曲' : '首歌曲'}
                    </span>
                    {loading && <span className="qqm-sync-badge">· 正在同步…</span>}
                  </p>
                  <div className="qqm-collection-actions">
                    <button
                      type="button"
                      className="qqm-btn-primary"
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
                      className="qqm-btn-secondary"
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
        <QqmusicMiniPlayer aside={typing} />

        {/* Slide-In Queue Drawer */}
        <QueueDrawer />
      </section>

      {/* Fullscreen CarPlay Now Playing Overlay */}
      <NowPlaying />
    </>
  )
}

function TabGlyph({ tab, on }: { tab: Exclude<QqmusicTab, 'search'>; on: boolean }) {
  switch (tab) {
    case 'recommend':
      return <HomeGlyph size={28} on={on} />
    case 'discover':
      return <DiscoverGlyph size={28} on={on} />
    case 'radio':
      return <RadioGlyph size={28} />
    case 'my':
      return <LibraryGlyph size={28} />
  }
}

function AccountMenu({ userProfile, onSignOut }: { userProfile: UserProfile | null; onSignOut(): void }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const vipType = userProfile?.vipType ?? 0
  const isVip = vipType > 0
  const vipLabel = vipType >= 2 ? '豪华绿钻' : vipType === 1 ? '绿钻 VIP' : '已登录'

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
    <div ref={boxRef} className="qqm-account">
      <button
        type="button"
        className={`qqm-me glass${isVip ? ' vip' : ''}`}
        aria-label={userProfile?.nickname ? `账号：${userProfile.nickname}` : 'QQ音乐账号'}
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
          <span className="qqm-me-vip-dot" aria-hidden="true">
            <DiamondVipGlyph size={11} />
          </span>
        )}
      </button>

      {open && (
        <div className="qqm-account-menu" role="menu" aria-label="账号菜单">
          <div className="qqm-account-profile">
            <span className="qqm-account-name">{userProfile?.nickname || 'QQ音乐账号'}</span>
            <span className={`qqm-account-tier${isVip ? ' vip' : ''}`}>
              {isVip && <DiamondVipGlyph size={13} />}
              <span>{vipLabel}</span>
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="qqm-account-signout"
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
  playlists: QqmusicPlaylist[]
  onSelect(playlist: QqmusicPlaylist): void
  showCount?: boolean
}) {
  const albumArt = useCabin((s) => s.albumArt)
  return (
    <div className="qqm-playlists-grid">
      {playlists.map((pl) => (
        <button key={pl.id} type="button" className="qqm-pl-card" onClick={() => onSelect(pl)}>
          <div className="qqm-pl-thumb">
            {albumArt && pl.coverImgUrl ? (
              <img src={pl.coverImgUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="qqm-cover-fallback" aria-hidden="true">
                <NoteGlyph size={38} />
              </span>
            )}
            {pl.playCount !== undefined && pl.playCount > 0 && (
              <span className="qqm-pl-play-count">
                <HeadphonesGlyph size={13} />
                <span>{formatPlayCount(pl.playCount)}</span>
              </span>
            )}
          </div>
          <span className="qqm-pl-title">{pl.name}</span>
          {showCount && <span className="qqm-pl-sub">{pl.trackCount} 首歌曲</span>}
        </button>
      ))}
    </div>
  )
}

function RadioGrid({ radios, onSelect }: { radios: QqmusicRadio[]; onSelect(radio: QqmusicRadio): void }) {
  const albumArt = useCabin((s) => s.albumArt)
  return (
    <div className="qqm-playlists-grid">
      {radios.map((radio) => (
        <button key={radio.id} type="button" className="qqm-pl-card" onClick={() => onSelect(radio)}>
          <div className="qqm-pl-thumb">
            {albumArt && radio.picUrl ? (
              <img src={radio.picUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="qqm-cover-fallback" aria-hidden="true">
                <RadioGlyph size={38} />
              </span>
            )}
            {radio.subCount !== undefined && radio.subCount > 0 && (
              <span className="qqm-pl-play-count">
                <HeadphonesGlyph size={13} />
                <span>{formatPlayCount(radio.subCount)}</span>
              </span>
            )}
          </div>
          <span className="qqm-pl-title">{radio.name}</span>
          <span className="qqm-pl-sub">{radio.djName || '随心听'}</span>
        </button>
      ))}
    </div>
  )
}

function ArtistGrid({ artists, onSelect }: { artists: QqmusicArtist[]; onSelect(artist: QqmusicArtist): void }) {
  const albumArt = useCabin((s) => s.albumArt)
  return (
    <div className="qqm-playlists-grid">
      {artists.map((artist) => {
        const subParts: string[] = []
        if (artist.musicSize) subParts.push(`${artist.musicSize} 首单曲`)
        if (artist.albumSize) subParts.push(`${artist.albumSize} 张专辑`)
        return (
          <button
            key={artist.id}
            type="button"
            className="qqm-pl-card qqm-artist-card"
            onClick={() => onSelect(artist)}
          >
            <div className="qqm-pl-thumb qqm-artist-thumb">
              {albumArt && artist.picUrl ? (
                <img src={artist.picUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="qqm-cover-fallback" aria-hidden="true">
                  <PersonGlyph size={44} />
                </span>
              )}
            </div>
            <span className="qqm-pl-title">{artist.name}</span>
            {subParts.length > 0 && <span className="qqm-pl-sub">{subParts.join(' · ')}</span>}
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
  tracks: QqmusicTrack[]
  loading: boolean
  showRank?: boolean
}) {
  const playback = useQqmusic((s) => s.playback)
  const playing = useQqmusic((s) => Boolean(s.playing))
  const likedTrackIds = useQqmusic((s) => s.likedTrackIds)
  const albumArt = useCabin((s) => s.albumArt)

  if (loading && tracks.length === 0) {
    return (
      <div className="qqm-list-loading" role="status">
        <span className="qqm-spinner" aria-hidden="true" />
        <span>正在加载歌曲列表…</span>
      </div>
    )
  }

  if (tracks.length === 0) {
    return <div className="qqm-list-empty">暂无歌曲</div>
  }

  return (
    <div className="qqm-song-list">
      {tracks.map((track, idx) => {
        const isCurrent = playback?.trackId
          ? playback.trackId === track.id
          : playback?.title === track.title && playback?.artist === track.artist
        const isUnplayable = track.playable === false
        const isVip = track.payPlay === 1
        const isLiked = likedTrackIds.includes(track.id)
        const durText = formatDuration(track.duration)

        return (
          <div
            key={`${track.id}-${idx}`}
            className={`qqm-song-row${isCurrent ? ' is-playing' : ''}${isUnplayable ? ' is-unplayable' : ''}`}
          >
            <button
              type="button"
              className="qqm-song-main"
              onClick={() => play(track, tracks, idx)}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span className="qqm-song-idx">
                {isCurrent ? (
                  <span className="qqm-sound-bars" aria-hidden="true">
                    <i className={`b1${playing ? ' anim' : ''}`} />
                    <i className={`b2${playing ? ' anim' : ''}`} />
                    <i className={`b3${playing ? ' anim' : ''}`} />
                  </span>
                ) : (
                  <span className={`qqm-idx-num${showRank && idx < 3 ? ' top' : ''}`}>{idx + 1}</span>
                )}
              </span>

              <span className="qqm-song-thumb">
                {albumArt && track.artwork ? (
                  <img src={track.artwork} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="qqm-song-thumb-fallback" aria-hidden="true">
                    <NoteGlyph size={24} />
                  </span>
                )}
              </span>

              <span className="qqm-song-body">
                <span className="qqm-song-title-row">
                  <span className="qqm-song-title">{track.title}</span>
                  {isVip && <span className="qqm-badge-vip">VIP</span>}
                  {isUnplayable && <span className="qqm-badge-muted">{isVip ? 'VIP限播' : '无音源'}</span>}
                </span>
                <span className="qqm-song-artist">
                  {track.artist}
                  {track.album ? ` · ${track.album}` : ''}
                </span>
              </span>

              {durText && <span className="qqm-song-duration">{durText}</span>}
            </button>

            <button
              type="button"
              className={`qqm-song-action qqm-song-like${isLiked ? ' liked' : ''}`}
              onClick={() => toggleLike(track.id)}
              aria-label={isLiked ? `取消喜欢 ${track.title}` : `喜欢 ${track.title}`}
              aria-pressed={isLiked}
            >
              <HeartGlyph size={20} on={isLiked} />
            </button>

            <button
              type="button"
              className="qqm-song-action qqm-song-play"
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
