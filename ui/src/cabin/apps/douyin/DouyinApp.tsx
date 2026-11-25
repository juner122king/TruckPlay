import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type DouyinVideo, isInHost } from '../../../shared/host'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import { useLanguage } from '../../state/text'
import { barLayout, framed } from '../music/barLayout'
import { CloseGlyph, PauseGlyph, PersonGlyph, PlayGlyph, SearchGlyph } from '../music/glyphs'
import { FullScreenGlyph } from '../youtube/glyphs'
import { OverVideo, VideoHole } from '../youtube/VideoHole'
import {
  clearHistory,
  clearRecentSearches,
  clearSearch,
  DOUYIN_CHANNELS,
  DOUYIN_HOT_KEYWORDS,
  type DouyinTab,
  formatClock,
  formatCount,
  openPlayer,
  play,
  playOrPause,
  positionOf,
  refreshFeed,
  search,
  seek,
  selectChannel,
  selectTab,
  sendSignIn,
  sendSignOut,
  sendStart,
  setLibrarySection,
  skip,
  toggleAutoScroll,
  toggleCollect,
  toggleCrop,
  toggleLike,
  useDouyin,
} from './douyin'
import {
  ArrowDownGlyph,
  ArrowUpGlyph,
  AutoScrollGlyph,
  BookmarkGlyph,
  DouyinLogoGlyph,
  DyBars,
  FitFillGlyph,
  FlameGlyph,
  FollowGlyph,
  GridGlyph,
  HeartGlyph,
  LibraryGlyph,
  MusicNoteGlyph,
  RefreshGlyph,
  SignOutGlyph,
  SparkleGlyph,
  TrashGlyph,
} from './glyphs'
import './douyin.css'

const SEARCH_FIELD = 'douyin-search'
const WHEEL_COOLDOWN_MS = 450
const SWIPE_THRESHOLD_PX = 48
const DOUBLE_TAP_MS = 280

type MainTab = Exclude<DouyinTab, 'search'>

interface BarMeasure {
  bar: number
  circle: number
  start: number
  end: number
  tabs: number
}

function barSliceStyle(frame: ReturnType<typeof framed>): CSSProperties {
  return {
    left: frame.left,
    width: frame.width,
    transform: `translateX(${frame.shift}px)`,
    clipPath: `inset(0 ${frame.cut}px 0 0 round calc(var(--dy-bar) / 2))`,
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
        circle: bar.current?.clientHeight || 72,
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
  const closed = barLayout(sizes, false)
  const open = barLayout(sizes, true)
  const current = searching ? open : closed
  return {
    ready,
    tabs: barSliceStyle(framed(closed.tabs, current.tabs)),
    search: barSliceStyle(framed(open.search, current.search)),
  }
}

function TabIcon({ id, on }: { id: MainTab; on: boolean }) {
  if (id === 'recommend') return <FlameGlyph size={22} on={on} />
  if (id === 'jingxuan') return <SparkleGlyph size={22} on={on} />
  if (id === 'follow') return <FollowGlyph size={22} on={on} />
  if (id === 'channels') return <GridGlyph size={22} on={on} />
  return <LibraryGlyph size={22} on={on} />
}

function useStagePosition(): { time: number; duration: number } {
  const playback = useDouyin((s) => s.playback)
  const playing = useDouyin((s) => s.playing)
  const [now, setNow] = useState(() => performance.now())
  const active = Boolean(playing || playback?.status === 'playing')

  useEffect(() => {
    if (!active) return
    let frame = requestAnimationFrame(function tick() {
      setNow(performance.now())
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  return {
    time: positionOf(playback, active ? now : (playback?.at ?? now)),
    duration: playback?.duration || 0,
  }
}

export function DouyinApp() {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)

  const state = useDouyin()
  const [query, setQuery] = useState(state.searchQuery)
  const [beforeSearchTab, setBeforeSearchTab] = useState<MainTab>('recommend')
  const [accountOpen, setAccountOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const typing = useKeyboard((s) => s.field?.id === SEARCH_FIELD)
  const barRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const leavingTypingRef = useRef(false)
  const wasTypingRef = useRef(typing)

  useEffect(() => {
    sendStart()
  }, [])

  useEffect(() => {
    if (state.returnToPlayer) {
      openPlayer(true)
    }
  }, [state.returnToPlayer])

  useEffect(() => {
    if (typing) useDouyin.setState({ tab: 'search' })
  }, [typing])

  useEffect(() => {
    const dismissed = wasTypingRef.current && !typing
    wasTypingRef.current = typing
    if (!dismissed) return
    const deliberate = leavingTypingRef.current
    leavingTypingRef.current = false
    const trimmed = query.trim()
    if (!deliberate && trimmed) {
      void search(trimmed)
    }
  }, [typing, query])

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [state.tab, state.channelId, state.librarySection])

  useEffect(() => {
    if (!accountOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [accountOpen])

  const stopTyping = () => {
    if (useKeyboard.getState().field?.id === SEARCH_FIELD) leavingTypingRef.current = true
    useKeyboard.getState().detach(SEARCH_FIELD)
  }

  const goTab = (next: DouyinTab) => {
    setAccountOpen(false)
    stopTyping()
    if (next === 'search' && state.tab !== 'search') {
      setBeforeSearchTab(state.tab)
    }
    selectTab(next)
  }

  const closeSearch = () => {
    stopTyping()
    setQuery('')
    clearSearch()
    selectTab(beforeSearchTab)
  }

  const submitSearch = (word = query) => {
    const trimmed = word.trim()
    if (!trimmed) return
    setQuery(trimmed)
    stopTyping()
    void search(trimmed)
  }

  const triggerRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    refreshFeed()
    setTimeout(() => setRefreshing(false), 650)
  }

  const searching = state.tab === 'search'
  const bar = useBar({ bar: barRef, start: startRef, end: endRef, tabs: tabsRef }, searching)

  const navTabs: { id: MainTab; label: string }[] = [
    { id: 'recommend', label: t('推荐', 'For You') },
    { id: 'jingxuan', label: t('精选', 'Featured') },
    { id: 'follow', label: t('关注', 'Follow') },
    { id: 'channels', label: t('频道', 'Channels') },
    { id: 'library', label: t('记录', 'Library') },
  ]

  const activeVideo = state.current ?? state.videos[state.currentVideoIndex] ?? state.videos[0] ?? null
  const activeId = state.playback?.id || activeVideo?.id
  const isPlayingNow = Boolean(state.playing || state.playback?.status === 'playing')

  const displayedList: DouyinVideo[] =
    state.tab === 'search'
      ? state.searchResults
      : state.tab === 'library'
        ? state.librarySection === 'liked'
          ? state.likedVideos
          : state.watchedHistory
        : state.videos

  const sideTitle =
    state.tab === 'recommend'
      ? t('推荐视频流', 'For You Feed')
      : state.tab === 'jingxuan'
        ? t('抖音精选', 'Featured Picks')
        : state.tab === 'follow'
          ? t('关注动态', 'Following')
          : state.tab === 'channels'
            ? (DOUYIN_CHANNELS.find((c) => c.id === state.channelId)?.[chinese ? 'zh' : 'en'] ?? t('频道精选', 'Channel'))
            : state.tab === 'search'
              ? state.searchQuery
                ? t(`“${state.searchQuery}”`, `"${state.searchQuery}"`)
                : t('发现与搜索', 'Search Douyin')
              : state.librarySection === 'liked'
                ? t('我赞过的', 'Liked Videos')
                : t('最近看过', 'Watch History')

  const inHost = isInHost()

  return (
    <section className="app-panel douyin-app" aria-label={t('抖音', 'Douyin')}>
      {/* Floating CarPlay Liquid Glass Morphing Top Bar */}
      <header ref={barRef} className={`dy-bar${bar.ready ? ' ready' : ''}`}>
        <div ref={startRef} className="dy-bar-side">
          <div className="dy-brand-pill glass" aria-hidden="true">
            <span className="dy-brand-glitch">
              <DouyinLogoGlyph size={26} />
            </span>
          </div>
        </div>

        <nav className={`dy-tabs${searching ? ' searching' : ''}`} aria-label={t('抖音导航', 'Douyin navigation')}>
          <div className="dy-tab-bar glass" style={bar.tabs}>
            <div ref={tabsRef} className="dy-tab-list" aria-hidden={searching}>
              {navTabs.map((item) => {
                const active = item.id === state.tab && !typing
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`dy-tab${active ? ' on' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    tabIndex={searching ? -1 : undefined}
                    onClick={() => goTab(item.id)}
                  >
                    <TabIcon id={item.id} on={active} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              className="dy-close-search"
              aria-label={t('关闭搜索', 'Close search')}
              aria-hidden={!searching}
              tabIndex={searching ? undefined : -1}
              onClick={closeSearch}
            >
              <CloseGlyph size={26} />
            </button>
          </div>

          <div className={`dy-search glass${searching ? ' open' : ''}`} style={bar.search}>
            {searching ? (
              <TextField
                id={SEARCH_FIELD}
                value={query}
                onChange={setQuery}
                onSubmit={() => submitSearch(query)}
                returnKind="search"
                hint={t('搜索短视频、创作者、车载音乐…', 'Search videos, creators, music…')}
                label={t('搜索抖音', 'Search Douyin')}
                icon={<SearchGlyph size={24} />}
              />
            ) : (
              <button
                type="button"
                className="dy-search-button"
                aria-label={t('搜索', 'Search')}
                onClick={() => goTab('search')}
              >
                <SearchGlyph size={26} />
              </button>
            )}
          </div>
        </nav>

        <div ref={endRef} className="dy-bar-side end">
          {state.signingIn ? (
            <div className="dy-signing-pill glass" role="status">
              <span className="dy-spinner" aria-hidden="true" />
              <span>{t('扫码中…', 'Signing in…')}</span>
            </div>
          ) : state.signedIn && !typing ? (
            <button
              type="button"
              className={`dy-round glass dy-account-btn${accountOpen ? ' on' : ''}`}
              aria-label={t('抖音账号', 'Douyin account')}
              aria-expanded={accountOpen}
              aria-haspopup="dialog"
              onClick={() => setAccountOpen((v) => !v)}
            >
              {state.profile?.avatar ? (
                <img src={state.profile.avatar} alt="" className="dy-account-avatar" referrerPolicy="no-referrer" />
              ) : (
                <PersonGlyph size={26} />
              )}
            </button>
          ) : !state.signedIn && !typing ? (
            <button type="button" className="dy-sign-in glass" onClick={sendSignIn}>
              {t('扫码登录', 'Sign In')}
            </button>
          ) : null}
        </div>
      </header>

      {/* Account Liquid Glass Popover */}
      {accountOpen && state.signedIn && (
        <>
          <div className="dy-menu-veil" onClick={() => setAccountOpen(false)} />
          <div className="dy-account-popover glass" role="dialog" aria-label={t('抖音账号信息', 'Account info')}>
            <div className="dy-account-head">
              <div className="dy-account-avatar-lg">
                {state.profile?.avatar ? (
                  <img src={state.profile.avatar} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <PersonGlyph size={30} />
                )}
              </div>
              <div className="dy-account-meta">
                <strong>{state.profile?.nickname || t('已登录抖音', 'Signed in to Douyin')}</strong>
                <span>{t('已同步桌面账号与推荐流', 'Desktop session synced')}</span>
              </div>
            </div>
            <div className="dy-account-actions">
              <button
                type="button"
                className="dy-popover-row"
                onClick={() => {
                  setAccountOpen(false)
                  triggerRefresh()
                }}
              >
                <RefreshGlyph size={18} />
                <span>{t('刷新推荐流', 'Refresh Feed')}</span>
              </button>
              <button
                type="button"
                className="dy-popover-row danger"
                onClick={() => {
                  setAccountOpen(false)
                  sendSignOut()
                }}
              >
                <SignOutGlyph size={18} />
                <span>{t('退出登录', 'Sign Out')}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Non-blocking Signing-in Notice */}
      {state.signingIn && (
        <div className="dy-signin-banner glass" role="status">
          <span className="dy-spinner" aria-hidden="true" />
          <div className="dy-signin-banner-text">
            <strong>{t('桌面扫码登录窗口已打开', 'Desktop Sign-In Window Opened')}</strong>
            <span>{t('请使用手机抖音扫码登录，完成后自动同步推荐与关注。', 'Scan the QR code on your desktop with the Douyin app.')}</span>
          </div>
        </div>
      )}

      {/* Dual-Pane Split Stage Workspace */}
      <main className="dy-workspace">
        {/* Left Live Short-Video Stage */}
        <section className="dy-stage" aria-label={t('视频播放舞台', 'Video stage')}>
          <div className="dy-stage-frame">
            {!state.open && (
              <VideoHole
                app="douyin"
                className="dy-video-hole"
                crop={state.crop}
                thumbnailSrc={state.playback?.artwork ?? activeVideo?.artwork ?? null}
              />
            )}

            {/* Browser preview backdrop when outside Tauri host */}
            {!inHost && (
              <div className="dy-stage-preview" aria-hidden="true">
                {activeVideo?.artwork && (
                  <img className="dy-stage-preview-blur" src={activeVideo.artwork} alt="" referrerPolicy="no-referrer" />
                )}
                {activeVideo?.artwork ? (
                  <img
                    className={`dy-stage-preview-img${state.crop ? ' crop' : ''}`}
                    src={activeVideo.artwork}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="dy-stage-preview-empty">
                    <DouyinLogoGlyph size={56} />
                  </div>
                )}
              </div>
            )}

            {/* Overlay HUD: rendered in OverVideo portal in host so holeMask never clips it */}
            {!state.open &&
              (inHost ? (
                <OverVideo app="douyin">
                  <StageOverlay activeVideo={activeVideo} activeId={activeId} isPlayingNow={isPlayingNow} t={t} />
                </OverVideo>
              ) : (
                <StageOverlay activeVideo={activeVideo} activeId={activeId} isPlayingNow={isPlayingNow} t={t} />
              ))}
          </div>
        </section>

        {/* Right Liquid Glass Discovery / Queue / Channel / Search / Library Panel */}
        <aside className="dy-panel glass" aria-label={sideTitle}>
          <div className="dy-panel-head">
            <h2 className="dy-panel-title">{sideTitle}</h2>

            {state.tab === 'library' ? (
              <div className="dy-panel-head-actions">
                <div className="dy-segment" role="tablist" aria-label={t('记录切换', 'Library filter')}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={state.librarySection === 'liked'}
                    className={state.librarySection === 'liked' ? 'on' : ''}
                    onClick={() => setLibrarySection('liked')}
                  >
                    {t('赞过', 'Liked')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={state.librarySection === 'history'}
                    className={state.librarySection === 'history' ? 'on' : ''}
                    onClick={() => setLibrarySection('history')}
                  >
                    {t('历史', 'History')}
                  </button>
                </div>
                {state.librarySection === 'history' && state.watchedHistory.length > 0 && (
                  <button
                    type="button"
                    className="dy-icon-pill"
                    aria-label={t('清空观看历史', 'Clear history')}
                    onClick={clearHistory}
                  >
                    <TrashGlyph size={17} />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                className={`dy-refresh-pill${refreshing ? ' spinning' : ''}`}
                aria-label={t('刷新视频流', 'Refresh feed')}
                onClick={triggerRefresh}
              >
                <RefreshGlyph size={17} />
                <span>{t('换一批', 'Refresh')}</span>
              </button>
            )}
          </div>

          {/* Horizontal swipeable channel pills when in Channels tab */}
          {state.tab === 'channels' && (
            <div className="dy-channel-strip dy-fade-scroller" role="tablist" aria-label={t('抖音频道分类', 'Channels')}>
              {DOUYIN_CHANNELS.map((ch) => {
                const selected = ch.id === state.channelId
                return (
                  <button
                    key={ch.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`dy-chip${selected ? ' on' : ''}`}
                    onClick={() => selectChannel(ch.id)}
                  >
                    {chinese ? ch.zh : ch.en}
                  </button>
                )
              })}
            </div>
          )}

          {/* Search suggestions & recent searches when search query is empty */}
          {state.tab === 'search' && !state.searchQuery && (
            <div className="dy-search-discover">
              {state.recentSearches.length > 0 && (
                <div className="dy-search-block">
                  <div className="dy-search-block-head">
                    <span>{t('最近搜索', 'Recent')}</span>
                    <button type="button" className="dy-text-btn" onClick={clearRecentSearches}>
                      {t('清空', 'Clear')}
                    </button>
                  </div>
                  <div className="dy-chip-wrap">
                    {state.recentSearches.map((word) => (
                      <button key={word} type="button" className="dy-chip" onClick={() => submitSearch(word)}>
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="dy-search-block">
                <div className="dy-search-block-head">
                  <span>{t('热门搜索', 'Trending')}</span>
                </div>
                <div className="dy-chip-wrap">
                  {DOUYIN_HOT_KEYWORDS.map((word) => (
                    <button key={word} type="button" className="dy-chip" onClick={() => submitSearch(word)}>
                      {word}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Video Queue / Results List */}
          {(state.tab !== 'search' || Boolean(state.searchQuery)) && (
            <div ref={listRef} className="dy-feed-list">
              {state.tab === 'follow' && state.signedIn === false && (
                <div className="dy-empty-card">
                  <FollowGlyph size={34} />
                  <strong>{t('登录后查看关注动态', 'Sign in to view Following')}</strong>
                  <p>{t('使用手机抖音扫码即可同步你关注的创作者更新。', 'Scan with Douyin mobile app to sync followed creators.')}</p>
                  <button type="button" className="dy-primary-btn" onClick={sendSignIn}>
                    {t('立即扫码登录', 'Sign In with QR')}
                  </button>
                </div>
              )}

              {(state.feedLoading || state.searchLoading) && displayedList.length === 0 ? (
                <div className="dy-skeleton-list" aria-busy="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="dy-skeleton-row" />
                  ))}
                </div>
              ) : displayedList.length === 0 ? (
                <div className="dy-empty-card">
                  <DouyinLogoGlyph size={34} />
                  <strong>
                    {state.tab === 'library'
                      ? state.librarySection === 'liked'
                        ? t('还没有点赞的视频', 'No liked videos yet')
                        : t('暂无观看记录', 'No watch history yet')
                      : t('暂未获取到视频内容', 'No videos loaded')}
                  </strong>
                  <p>
                    {state.tab === 'library'
                      ? t('点击舞台右侧红心或浏览推荐流即可记录。', 'Tap the heart on any video or watch from For You.')
                      : t('点击右上角「换一批」重新拉取抖音推荐流。', 'Tap Refresh to fetch a new batch of videos.')}
                  </p>
                </div>
              ) : (
                displayedList.map((video, idx) => {
                  const isCurrent = video.id === activeId
                  return (
                    <button
                      key={`${video.id}-${idx}`}
                      type="button"
                      className={`dy-feed-card${isCurrent ? ' active' : ''}`}
                      onClick={() => play(video, idx, false)}
                    >
                      <div className="dy-feed-thumb">
                        {video.artwork ? (
                          <img src={video.artwork} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="dy-feed-thumb-fallback">
                            <DouyinLogoGlyph size={22} />
                          </span>
                        )}
                        {isCurrent && (
                          <span className="dy-thumb-live">
                            <DyBars playing={isPlayingNow} />
                          </span>
                        )}
                        {video.duration ? <span className="dy-thumb-dur">{formatClock(video.duration)}</span> : null}
                      </div>

                      <div className="dy-feed-info">
                        <span className="dy-feed-title">{video.title}</span>
                        <div className="dy-feed-meta">
                          <span className="dy-feed-author">@{video.author}</span>
                          {video.likes ? (
                            <span className="dy-feed-likes">
                              <HeartGlyph size={12} filled />
                              {formatCount(video.likes)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </aside>
      </main>
    </section>
  )
}

/**
 * Interactive Liquid Glass overlay rendered over the left split-stage video viewport.
 * Runs inside `<OverVideo app="douyin">` in the host so the CarPlay hole mask never clips controls.
 */
function StageOverlay({
  activeVideo,
  activeId,
  isPlayingNow,
  t,
}: {
  activeVideo: DouyinVideo | null
  activeId: string | undefined
  isPlayingNow: boolean
  t: (zh: string, en: string) => string
}) {
  const playback = useDouyin((s) => s.playback)
  const crop = useDouyin((s) => s.crop)
  const autoScroll = useDouyin((s) => s.autoScroll)
  const likedMap = useDouyin((s) => s.liked)
  const collectedMap = useDouyin((s) => s.collected)
  const buffering = useDouyin((s) => s.buffering)

  const { time, duration } = useStagePosition()
  const [hudVisible, setHudVisible] = useState(true)
  const [heartBurstAt, setHeartBurstAt] = useState<number | null>(null)
  const lastWheel = useRef(0)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const lastTap = useRef<{ at: number; timer?: ReturnType<typeof setTimeout> }>({ at: -Infinity })

  useEffect(() => {
    if (!heartBurstAt) return
    const timer = setTimeout(() => setHeartBurstAt(null), 650)
    return () => clearTimeout(timer)
  }, [heartBurstAt])

  useEffect(() => () => clearTimeout(lastTap.current.timer), [])

  const isLiked = activeId ? Boolean(likedMap[activeId] ?? playback?.liked) : false
  const isCollected = activeId ? Boolean(collectedMap[activeId] ?? playback?.collected) : false
  const displayTitle = playback?.title || activeVideo?.title || t('抖音精选短视频', 'Douyin Short Video')
  const displayAuthor = playback?.author || playback?.artist || activeVideo?.author || t('抖音创作者', 'Creator')
  const displayAvatar = playback?.avatar || activeVideo?.avatar || null
  const displayMusic = playback?.music || activeVideo?.music || null
  const likeLabel = formatCount(playback?.likes ?? activeVideo?.likes, t('赞', 'Like'))
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 28) return
    const now = performance.now()
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return
    lastWheel.current = now
    skip(e.deltaY > 0 ? 1 : -1)
  }

  return (
    <div
      className={`dy-over-stage${hudVisible ? ' hud-on' : ' hud-quiet'}`}
      onWheel={handleWheel}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement | null)?.closest('button, .dy-stage-progress')) return
        swiped.current = false
        dragStart.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerMove={(e) => {
        if (!dragStart.current || swiped.current) return
        const dy = e.clientY - dragStart.current.y
        const dx = e.clientX - dragStart.current.x
        if (Math.abs(dy) >= SWIPE_THRESHOLD_PX && Math.abs(dy) > Math.abs(dx) * 1.4) {
          swiped.current = true
          dragStart.current = null
          skip(dy < 0 ? 1 : -1)
        }
      }}
      onPointerUp={(e) => {
        dragStart.current = null
        if (swiped.current) {
          swiped.current = false
          return
        }
        if ((e.target as HTMLElement | null)?.closest('button, .dy-stage-progress')) return
        const now = performance.now()
        if (now - lastTap.current.at < DOUBLE_TAP_MS) {
          clearTimeout(lastTap.current.timer)
          lastTap.current.at = -Infinity
          if (!isLiked) toggleLike(activeVideo ?? activeId)
          setHeartBurstAt(now)
          return
        }
        clearTimeout(lastTap.current.timer)
        lastTap.current = {
          at: now,
          timer: setTimeout(() => {
            if (!isPlayingNow) {
              playOrPause()
              setHudVisible(true)
            } else {
              setHudVisible((v) => !v)
            }
          }, DOUBLE_TAP_MS),
        }
      }}
    >
      {/* Subtle top & bottom readability scrims */}
      <div className="dy-stage-scrim-top" aria-hidden="true" />
      <div className="dy-stage-scrim-bottom" aria-hidden="true" />

      {buffering && <div className="dy-spinner large floating" role="progressbar" aria-label={t('正在缓冲', 'Buffering')} />}

      {heartBurstAt && (
        <div key={heartBurstAt} className="dy-heart-burst" aria-hidden="true">
          <HeartGlyph size={76} filled />
        </div>
      )}

      {/* Center play affordance when paused */}
      {!isPlayingNow && (
        <button
          type="button"
          className="dy-stage-center-play"
          aria-label={t('播放视频', 'Play video')}
          onClick={playOrPause}
        >
          <PlayGlyph size={34} />
        </button>
      )}

      {/* Top Glass Utility Strip */}
      <div className="dy-stage-top">
        <button
          type="button"
          className={`dy-stage-pill${autoScroll ? ' on' : ''}`}
          aria-pressed={autoScroll}
          aria-label={autoScroll ? t('自动连播', 'Auto-scroll') : t('单曲循环', 'Loop')}
          onClick={toggleAutoScroll}
        >
          <AutoScrollGlyph size={16} on={autoScroll} />
          <span>{autoScroll ? t('连播', 'Auto') : t('循环', 'Loop')}</span>
        </button>

        <div className="dy-stage-top-right">
          <button
            type="button"
            className={`dy-stage-pill${crop ? ' on' : ''}`}
            aria-pressed={crop}
            aria-label={crop ? t('切换适应画面', 'Switch to fit') : t('切换铺满裁切', 'Switch to fill')}
            onClick={toggleCrop}
          >
            <FitFillGlyph size={16} crop={crop} />
            <span>{crop ? t('铺满', 'Fill') : t('适应', 'Fit')}</span>
          </button>

          <button
            type="button"
            className="dy-stage-pill primary"
            aria-label={t('全屏影院', 'Fullscreen theater')}
            onClick={() => openPlayer(false)}
          >
            <FullScreenGlyph />
            <span>{t('全屏', 'Full')}</span>
          </button>
        </div>
      </div>

      {/* Right Floating Vertical Action Rail */}
      <div className="dy-stage-rail">
        <button
          type="button"
          className="dy-stage-rail-btn"
          aria-label={t('上一条', 'Previous')}
          onClick={() => skip(-1)}
        >
          <ArrowUpGlyph size={22} />
        </button>

        <button
          type="button"
          className="dy-stage-rail-btn play"
          aria-label={isPlayingNow ? t('暂停', 'Pause') : t('播放', 'Play')}
          onClick={playOrPause}
        >
          {isPlayingNow ? <PauseGlyph size={22} /> : <PlayGlyph size={22} />}
        </button>

        <button
          type="button"
          className="dy-stage-rail-btn"
          aria-label={t('下一条', 'Next')}
          onClick={() => skip(1)}
        >
          <ArrowDownGlyph size={22} />
        </button>

        <button
          type="button"
          className={`dy-stage-rail-btn${isLiked ? ' liked' : ''}`}
          aria-label={isLiked ? t('取消点赞', 'Unlike') : t('点赞', 'Like')}
          aria-pressed={isLiked}
          onClick={() => toggleLike(activeVideo ?? activeId)}
        >
          <HeartGlyph size={22} filled={isLiked} />
          <span className="dy-stage-rail-label">{likeLabel}</span>
        </button>

        <button
          type="button"
          className={`dy-stage-rail-btn${isCollected ? ' collected' : ''}`}
          aria-label={isCollected ? t('取消收藏', 'Uncollect') : t('收藏', 'Collect')}
          aria-pressed={isCollected}
          onClick={() => toggleCollect(activeVideo ?? activeId)}
        >
          <BookmarkGlyph size={20} filled={isCollected} />
          <span className="dy-stage-rail-label">{isCollected ? t('已藏', 'Saved') : t('收藏', 'Save')}</span>
        </button>
      </div>

      {/* Bottom Author, Caption, Music Pill & Interactive Progress Bar */}
      <div className="dy-stage-bottom">
        <div className="dy-stage-author-row">
          <span className="dy-stage-avatar">
            {displayAvatar ? (
              <img src={displayAvatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              <DouyinLogoGlyph size={16} />
            )}
          </span>
          <span className="dy-stage-author">@{displayAuthor}</span>
        </div>

        <p className="dy-stage-desc">{displayTitle}</p>

        {displayMusic && (
          <div className="dy-stage-music">
            <MusicNoteGlyph size={13} />
            <span>{displayMusic}</span>
          </div>
        )}

        <div
          className="dy-stage-progress"
          role="slider"
          aria-label={t('播放进度', 'Playback progress')}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
          onClick={(e) => {
            if (duration <= 0) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)))
            seek(pct * duration)
          }}
        >
          <div className="dy-stage-progress-track">
            <div className="dy-stage-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
