import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import { useLanguage } from '../../state/text'
import { barLayout, framed } from '../music/barLayout'
import {
  BackGlyph,
  CloseGlyph,
  LibraryGlyph,
  PersonGlyph,
  PlayGlyph,
  SearchGlyph,
  StarGlyph,
} from '../music/glyphs'
import { AlbumDetailView } from './AlbumDetailView'
import { CoverImage } from './CoverImage'
import {
  AudioBookGlyph,
  CategoryGlyph,
  ChartGlyph,
  CrownGlyph,
  DiscoverGlyph,
  FlameGlyph,
  HeadphonesGlyph,
  QrCodeGlyph,
  SignOutGlyph,
  TrashGlyph,
} from './glyphs'
import { NowPlaying, XimalayaMiniPlayer, XmBars } from './NowPlaying'
import {
  backToBrowse,
  CHART_CATEGORIES,
  clearHistory,
  clearSearch,
  loadCategory,
  loadChart,
  loadHome,
  loadMySection,
  openCategoryById,
  play,
  playAlbum,
  search,
  selectAlbum,
  selectMySection,
  selectTab,
  sendSignIn,
  sendSignOut,
  sendStart,
  toggleFavorite,
  useXimalaya,
  type ExtendedXimalayaAlbum,
  type MySection,
  type XimalayaTab,
} from './ximalaya'
import './ximalaya.css'

const SEARCH_FIELD = 'ximalaya-search'
const SKELETON_COUNT = 8

type MainTab = Exclude<XimalayaTab, 'search'>

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
    clipPath: `inset(0 ${frame.cut}px 0 0 round calc(var(--xm-bar) / 2))`,
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
  const closed = barLayout(sizes, false)
  const open = barLayout(sizes, true)
  const current = searching ? open : closed
  return {
    ready,
    tabs: barSliceStyle(framed(closed.tabs, current.tabs)),
    search: barSliceStyle(framed(open.search, current.search)),
  }
}

function formatDuration(secs?: number): string {
  if (!secs || !Number.isFinite(secs) || secs <= 0) return ''
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function TabIcon({ id, on }: { id: MainTab; on: boolean }) {
  if (id === 'discover') return <DiscoverGlyph size={24} on={on} />
  if (id === 'categories') return <CategoryGlyph size={24} on={on} />
  if (id === 'charts') return <ChartGlyph size={24} on={on} />
  return <LibraryGlyph size={24} />
}

export function XimalayaApp() {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)

  const state = useXimalaya()
  const [query, setQuery] = useState('')
  const [beforeSearchTab, setBeforeSearchTab] = useState<MainTab>('discover')
  const [searchSegment, setSearchSegment] = useState<'albums' | 'tracks'>('albums')
  const [accountOpen, setAccountOpen] = useState(false)

  const typing = useKeyboard((s) => s.field?.id === SEARCH_FIELD)
  const scrollRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const leavingTypingRef = useRef(false)
  const wasTypingRef = useRef(typing)

  useEffect(() => {
    sendStart()
    void loadHome()
  }, [])

  useEffect(() => {
    if (typing) useXimalaya.setState({ tab: 'search', selectedAlbum: null })
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
    scrollRef.current?.scrollTo({ top: 0 })
  }, [
    state.tab,
    state.selectedAlbum?.id,
    state.selectedCategoryId,
    state.categoryPage,
    state.chartCluster,
    state.chartCategoryCode,
    state.mySection,
    state.mySubscribedPage,
    state.myLikedPage,
    state.myBoughtPage,
  ])

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

  const goTab = (next: XimalayaTab) => {
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

  const handleSearchSubmit = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    stopTyping()
    void search(trimmed)
  }

  const handleTagClick = (word: string) => {
    stopTyping()
    setQuery(word)
    void search(word)
  }

  const searching = state.tab === 'search'
  const bar = useBar({ bar: barRef, start: startRef, end: endRef, tabs: tabsRef }, searching)

  const navTabs: { id: MainTab; label: string }[] = [
    { id: 'discover', label: t('发现', 'Discover') },
    { id: 'categories', label: t('分类', 'Browse') },
    { id: 'charts', label: t('榜单', 'Charts') },
    { id: 'my', label: t('我的', 'Library') },
  ]

  const vod = state.playback && state.playback.owner !== 'radio' ? state.playback : null
  const heroAlbum = state.hotAlbums[0] ?? null
  const featuredHot = state.hotAlbums.slice(1, 13)
  const featuredRise = state.riseAlbums.slice(0, 12)
  const quickCategories = state.categories.slice(0, 10)

  const renderAlbumTile = (alb: ExtendedXimalayaAlbum, rank?: number) => {
    const isFav = state.favorites.some((f) => f.id === alb.id)
    const isActive = Boolean(vod && vod.albumId === alb.id)
    return (
      <article key={alb.id} className={`xm-tile${isActive ? ' active' : ''}`}>
        <div className="xm-tile-art-wrap">
          <button
            type="button"
            className="xm-tile-main"
            onClick={() => selectAlbum(alb)}
            aria-label={`${alb.title} · ${alb.artist}`}
          >
            <span className="xm-cover">
              <CoverImage src={alb.artwork} alt="" fallback={<AudioBookGlyph size={44} />} />
              {typeof rank === 'number' && <span className={`xm-cover-rank${rank <= 3 ? ' top' : ''}`}>{rank}</span>}
              {alb.isPaid && (
                <span className="xm-cover-vip">
                  <CrownGlyph size={11} /> VIP
                </span>
              )}
              {alb.playCount && (
                <span className="xm-cover-plays">
                  <HeadphonesGlyph size={12} />
                  {alb.playCount}
                </span>
              )}
              {isActive && (
                <span className="xm-cover-overlay">
                  <XmBars playing={Boolean(state.playing)} />
                </span>
              )}
            </span>
            <span className="xm-tile-name">{alb.title}</span>
            <span className="xm-tile-sub">{alb.artist}</span>
          </button>

          <button
            type="button"
            className={`xm-tile-fav${isFav ? ' on' : ''}`}
            aria-label={isFav ? t('取消收藏', 'Unfavorite') : t('收藏', 'Favorite')}
            aria-pressed={isFav}
            onClick={() => toggleFavorite(alb)}
          >
            <StarGlyph size={19} on={isFav} />
          </button>
        </div>
      </article>
    )
  }

  return (
    <>
      <section className="app-panel ximalaya-app" aria-label={t('喜马拉雅', 'Ximalaya')}>
        {/* Floating CarPlay Liquid Glass Navigation Bar */}
        <header ref={barRef} className={`xm-bar${bar.ready ? ' ready' : ''}`}>
          <div ref={startRef} className="xm-bar-side">
            {state.selectedAlbum && !typing && (
              <button
                type="button"
                className="xm-round glass"
                aria-label={t('返回', 'Back')}
                onClick={backToBrowse}
              >
                <BackGlyph size={34} />
              </button>
            )}
          </div>

          <nav className={`xm-tabs${searching ? ' searching' : ''}`} aria-label={t('喜马拉雅导航', 'Ximalaya navigation')}>
            <div className="xm-tab-bar glass" style={bar.tabs}>
              <div ref={tabsRef} className="xm-tab-list" aria-hidden={searching}>
                {navTabs.map((item) => {
                  const active = item.id === state.tab && !typing && !state.selectedAlbum
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`xm-tab${active ? ' on' : ''}`}
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
                className="xm-close-search"
                aria-label={t('关闭搜索', 'Close search')}
                aria-hidden={!searching}
                tabIndex={searching ? undefined : -1}
                onClick={closeSearch}
              >
                <CloseGlyph size={28} />
              </button>
            </div>

            <div className={`xm-search glass${searching ? ' open' : ''}`} style={bar.search}>
              {searching ? (
                <TextField
                  id={SEARCH_FIELD}
                  value={query}
                  onChange={setQuery}
                  onSubmit={handleSearchSubmit}
                  returnKind="search"
                  hint={t('搜索有声书、相声、评书、主播…', 'Search audiobooks, crosstalk, hosts…')}
                  label={t('搜索喜马拉雅', 'Search Ximalaya')}
                  icon={<SearchGlyph size={26} />}
                />
              ) : (
                <button
                  type="button"
                  className="xm-search-button"
                  aria-label={t('搜索', 'Search')}
                  onClick={() => goTab('search')}
                >
                  <SearchGlyph size={28} />
                </button>
              )}
            </div>
          </nav>

          <div ref={endRef} className="xm-bar-side end">
            {state.signingIn ? (
              <div className="xm-signing-pill glass" role="status">
                <span className="xm-spinner" aria-hidden="true" />
                <span>{t('扫码中…', 'Signing in…')}</span>
              </div>
            ) : state.signedIn && !typing ? (
              <button
                type="button"
                className={`xm-round glass xm-account-btn${accountOpen ? ' on' : ''}`}
                aria-label={t('喜马拉雅账号', 'Ximalaya account')}
                aria-expanded={accountOpen}
                aria-haspopup="dialog"
                onClick={() => setAccountOpen((v) => !v)}
              >
                {state.user?.avatar ? (
                  <img src={state.user.avatar} alt="" className="xm-account-avatar" referrerPolicy="no-referrer" />
                ) : (
                  <PersonGlyph size={28} />
                )}
              </button>
            ) : !state.signedIn && !typing ? (
              <button type="button" className="xm-sign-in glass" onClick={sendSignIn}>
                {t('扫码登录', 'Sign In')}
              </button>
            ) : null}
          </div>
        </header>

        {/* Account Glass Popover */}
        {accountOpen && state.signedIn && (
          <>
            <div className="xm-menu-veil" onClick={() => setAccountOpen(false)} />
            <div className="xm-account-popover glass" role="dialog" aria-label={t('喜马拉雅账号信息', 'Account info')}>
              <div className="xm-account-head">
                <div className="xm-account-avatar-lg">
                  {state.user?.avatar ? (
                    <img src={state.user.avatar} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <PersonGlyph size={32} />
                  )}
                </div>
                <div className="xm-account-meta">
                  <strong>{state.user?.nickname || t('已登录喜马拉雅', 'Signed in to Ximalaya')}</strong>
                  <span className={state.user?.isVip ? 'vip' : ''}>
                    {state.user?.isVip ? (
                      <>
                        <CrownGlyph size={14} /> {t('喜马拉雅 VIP 会员', 'Ximalaya VIP')}
                      </>
                    ) : (
                      t('已同步桌面账号会话', 'Desktop session active')
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="xm-signout-row"
                onClick={() => {
                  setAccountOpen(false)
                  sendSignOut()
                }}
              >
                <SignOutGlyph size={20} />
                <span>{t('退出登录', 'Sign Out')}</span>
              </button>
            </div>
          </>
        )}

        {/* Full-Height Scrollable Body beneath floating top bar */}
        <main ref={scrollRef} className={`xm-scroll${vod ? ' has-mini' : ''}`}>
          {state.signingIn && (
            <div className="xm-qr-notice glass" role="status">
              <span className="xm-qr-icon" aria-hidden="true">
                <QrCodeGlyph size={26} />
              </span>
              <div className="xm-qr-copy">
                <strong>{t('喜马拉雅桌面扫码窗口已打开', 'Ximalaya sign-in window opened')}</strong>
                <span>
                  {t(
                    '请在电脑屏幕使用喜马拉雅 App 扫码登录，解锁已购与 VIP 完整剧集。',
                    'Scan the QR code on your desktop with the Ximalaya app to unlock VIP episodes.',
                  )}
                </span>
              </div>
            </div>
          )}

          {state.notice === 'host' && (
            <div className="xm-notice" role="status">
              <span>
                {t(
                  '开发预览展示喜马拉雅主站真实目录与选集；加密音频解密播放请在 TruckPlay 宿主内使用。',
                  'Browser preview loads real catalog data; encrypted audio playback runs inside the TruckPlay host.',
                )}
              </span>
              <button
                type="button"
                aria-label={t('关闭提示', 'Dismiss')}
                onClick={() => useXimalaya.setState({ notice: null })}
              >
                ×
              </button>
            </div>
          )}

          {state.selectedAlbum ? (
            <AlbumDetailView album={state.selectedAlbum} />
          ) : state.tab === 'discover' ? (
            /* ================= DISCOVER TAB ================= */
            <div className="xm-page">
              <div className="xm-page-head">
                <h1 className="xm-title">{t('喜马拉雅', 'Ximalaya')}</h1>
                <span className="xm-count">ximalaya.com</span>
              </div>

              {state.homeError && (
                <div className="xm-feedback" role="alert">
                  <span>
                    {t('内容加载失败', 'Failed to load')}: {state.homeError}
                  </span>
                  <button type="button" className="xm-pill" onClick={() => void loadHome(true)}>
                    {t('重试', 'Retry')}
                  </button>
                </div>
              )}

              {state.homeLoading && !state.hotAlbums.length ? (
                <div className="xm-grid" aria-busy="true">
                  {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                    <div key={i} className="xm-tile skeleton" aria-hidden="true">
                      <div className="xm-cover" />
                      <div className="xm-skel-line" />
                      <div className="xm-skel-line short" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Hero Featured Banner */}
                  {heroAlbum && (
                    <section className="xm-hero" aria-label={t('主站力荐', 'Featured')}>
                      {heroAlbum.artwork && (
                        <img
                          src={heroAlbum.artwork}
                          alt=""
                          className="xm-hero-bg"
                          referrerPolicy="no-referrer"
                          aria-hidden="true"
                        />
                      )}
                      <div className="xm-hero-scrim" aria-hidden="true" />
                      <div className="xm-hero-content">
                        <span className="xm-hero-eyebrow">
                          <FlameGlyph size={14} />
                          {t('主站热播榜首', 'Top Featured')}
                          {heroAlbum.category ? ` · ${heroAlbum.category}` : ''}
                        </span>
                        <h2 className="xm-hero-title">{heroAlbum.title}</h2>
                        <p className="xm-hero-sub">
                          {heroAlbum.artist}
                          {heroAlbum.playCount ? ` · ${heroAlbum.playCount}` : ''}
                          {heroAlbum.episodeCount ? ` · ${t(`共 ${heroAlbum.episodeCount} 集`, `${heroAlbum.episodeCount} eps`)}` : ''}
                        </p>
                        {heroAlbum.description && <p className="xm-hero-desc">{heroAlbum.description}</p>}
                        <div className="xm-hero-actions">
                          <button type="button" className="xm-pill key" onClick={() => void playAlbum(heroAlbum, 0)}>
                            <PlayGlyph size={22} />
                            <span>{t('立即收听', 'Listen Now')}</span>
                          </button>
                          <button type="button" className="xm-pill" onClick={() => selectAlbum(heroAlbum)}>
                            <span>{t('查看选集', 'Episodes')}</span>
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="xm-hero-art"
                        aria-label={heroAlbum.title}
                        onClick={() => selectAlbum(heroAlbum)}
                      >
                        <CoverImage src={heroAlbum.artwork} alt="" fallback={<AudioBookGlyph size={56} />} />
                      </button>
                    </section>
                  )}

                  {/* Quick Channel Chips */}
                  {quickCategories.length > 0 && (
                    <section className="xm-section">
                      <div className="xm-section-head">
                        <h2>{t('热门频道', 'Popular Channels')}</h2>
                        <button type="button" className="xm-section-link" onClick={() => goTab('categories')}>
                          {t('全部分类', 'All categories')} ›
                        </button>
                      </div>
                      <div className="xm-channel-pills xm-fade-scroller">
                        {quickCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            className="xm-channel-pill"
                            onClick={() => openCategoryById(cat.id)}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Free Hot Shelf */}
                  {featuredHot.length > 0 && (
                    <section className="xm-section">
                      <div className="xm-section-head">
                        <h2>{t('免费热播', 'Trending Free')}</h2>
                        <button type="button" className="xm-section-link" onClick={() => goTab('charts')}>
                          {t('完整榜单', 'Full charts')} ›
                        </button>
                      </div>
                      <div className="xm-shelf xm-fade-scroller">
                        {featuredHot.map((alb) => renderAlbumTile(alb))}
                      </div>
                    </section>
                  )}

                  {/* Rising Shelf */}
                  {featuredRise.length > 0 && (
                    <section className="xm-section">
                      <div className="xm-section-head">
                        <h2>{t('全站飙升', 'Rising Fast')}</h2>
                        <button
                          type="button"
                          className="xm-section-link"
                          onClick={() => {
                            useXimalaya.setState({ chartCluster: 'rise' })
                            goTab('charts')
                            void loadChart('rise', state.chartCategoryCode, 1)
                          }}
                        >
                          {t('飙升榜', 'Rising chart')} ›
                        </button>
                      </div>
                      <div className="xm-shelf xm-fade-scroller">
                        {featuredRise.map((alb) => renderAlbumTile(alb))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          ) : state.tab === 'categories' ? (
            /* ================= CATEGORIES TAB ================= */
            <div className="xm-page">
              <div className="xm-page-head">
                <h1 className="xm-title">{t('分类频道', 'Categories')}</h1>
                <div className="xm-segment" role="group" aria-label={t('排序方式', 'Sort by')}>
                  <button
                    type="button"
                    aria-pressed={state.categorySort === 1}
                    onClick={() => void loadCategory(state.selectedCategoryId, 1, 1)}
                  >
                    {t('最热', 'Popular')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={state.categorySort === 2}
                    onClick={() => void loadCategory(state.selectedCategoryId, 2, 1)}
                  >
                    {t('最新', 'Newest')}
                  </button>
                </div>
              </div>

              <div className="xm-chips xm-fade-scroller" role="group" aria-label={t('主站频道', 'Channels')}>
                {state.categories.map((cat) => {
                  const selected = cat.id === state.selectedCategoryId
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`xm-chip${selected ? ' active' : ''}`}
                      aria-pressed={selected}
                      onClick={(e) => {
                        e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
                        void loadCategory(cat.id, state.categorySort, 1)
                      }}
                    >
                      {cat.name}
                    </button>
                  )
                })}
              </div>

              {state.categoryError && (
                <div className="xm-feedback" role="alert">
                  <span>
                    {t('分类加载失败', 'Failed to load category')}: {state.categoryError}
                  </span>
                  <button
                    type="button"
                    className="xm-pill"
                    onClick={() => void loadCategory(state.selectedCategoryId, state.categorySort, state.categoryPage)}
                  >
                    {t('重试', 'Retry')}
                  </button>
                </div>
              )}

              {state.categoryLoading && !state.categoryAlbums.length ? (
                <div className="xm-grid" aria-busy="true">
                  {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                    <div key={i} className="xm-tile skeleton" aria-hidden="true">
                      <div className="xm-cover" />
                      <div className="xm-skel-line" />
                      <div className="xm-skel-line short" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`xm-grid${state.categoryLoading ? ' refreshing' : ''}`}>
                  {state.categoryAlbums.map((alb) => renderAlbumTile(alb))}
                </div>
              )}

              {!state.categoryLoading && !state.categoryError && state.categoryMaxPage > 1 && (
                <nav className="xm-pages" aria-label={t('分类分页', 'Category pages')}>
                  <button
                    type="button"
                    className="xm-pill"
                    disabled={state.categoryPage <= 1}
                    onClick={() => void loadCategory(state.selectedCategoryId, state.categorySort, state.categoryPage - 1)}
                  >
                    ‹ {t('上一页', 'Previous')}
                  </button>
                  <span>
                    {state.categoryPage} / {Math.min(state.categoryMaxPage, 50)}
                  </span>
                  <button
                    type="button"
                    className="xm-pill"
                    disabled={state.categoryPage >= Math.min(state.categoryMaxPage, 50)}
                    onClick={() => void loadCategory(state.selectedCategoryId, state.categorySort, state.categoryPage + 1)}
                  >
                    {t('下一页', 'Next')} ›
                  </button>
                </nav>
              )}
            </div>
          ) : state.tab === 'charts' ? (
            /* ================= CHARTS TAB ================= */
            <div className="xm-page">
              <div className="xm-page-head">
                <h1 className="xm-title">{t('主站榜单', 'Charts')}</h1>
                <div className="xm-segment" role="group" aria-label={t('榜单类型', 'Chart type')}>
                  <button
                    type="button"
                    aria-pressed={state.chartCluster === 'free'}
                    onClick={() => void loadChart('free', state.chartCategoryCode, 1)}
                  >
                    {t('免费热播', 'Top Free')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={state.chartCluster === 'rise'}
                    onClick={() => void loadChart('rise', state.chartCategoryCode, 1)}
                  >
                    {t('全站飙升', 'Rising')}
                  </button>
                </div>
              </div>

              <div className="xm-chips xm-fade-scroller" role="group" aria-label={t('分榜频道', 'Chart channels')}>
                {CHART_CATEGORIES.map((c) => {
                  const selected = state.chartCategoryCode === c.code
                  return (
                    <button
                      key={c.code}
                      type="button"
                      className={`xm-chip${selected ? ' active' : ''}`}
                      aria-pressed={selected}
                      onClick={(e) => {
                        e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
                        void loadChart(state.chartCluster, c.code, 1)
                      }}
                    >
                      {chinese ? c.name : c.en}
                    </button>
                  )
                })}
              </div>

              {state.chartError && (
                <div className="xm-feedback" role="alert">
                  <span>
                    {t('榜单加载失败', 'Failed to load chart')}: {state.chartError}
                  </span>
                  <button
                    type="button"
                    className="xm-pill"
                    onClick={() => void loadChart(state.chartCluster, state.chartCategoryCode, 1)}
                  >
                    {t('重试', 'Retry')}
                  </button>
                </div>
              )}

              {state.chartLoading && !state.chartAlbums.length ? (
                <div className="xm-list-skeleton" aria-busy="true">
                  {Array.from({ length: 6 }, (_, idx) => (
                    <div key={idx} className="xm-row-skel" aria-hidden="true" />
                  ))}
                </div>
              ) : (
                <div className={`xm-rank-list${state.chartLoading ? ' refreshing' : ''}`}>
                  {state.chartAlbums.map((alb, idx) => {
                    const rank = idx + 1
                    return (
                      <article key={alb.id} className="xm-rank-row">
                        <button type="button" className="xm-rank-main" onClick={() => selectAlbum(alb)}>
                          <span className={`xm-rank-num${rank <= 3 ? ' top' : ''}`}>
                            {String(rank).padStart(2, '0')}
                          </span>
                          <span className="xm-rank-thumb">
                            <CoverImage src={alb.artwork} alt="" fallback={<AudioBookGlyph size={28} />} />
                          </span>
                          <span className="xm-rank-body">
                            <span className="xm-rank-title">{alb.title}</span>
                            <span className="xm-rank-sub">
                              {alb.artist}
                              {alb.playCount ? ` · ${alb.playCount}` : ''}
                              {alb.episodeCount ? ` · ${alb.episodeCount}${t('集', ' eps')}` : ''}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="xm-rank-play"
                          aria-label={`${t('播放', 'Play')} ${alb.title}`}
                          onClick={() => void playAlbum(alb, 0)}
                        >
                          <PlayGlyph size={22} />
                        </button>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          ) : state.tab === 'search' ? (
            /* ================= SEARCH TAB ================= */
            <div className="xm-page">
              <div className="xm-hot-section">
                <span className="xm-hot-label">
                  <FlameGlyph size={16} />
                  {t('大家都在搜', 'Trending Searches')}
                </span>
                <div className="xm-hot-pills">
                  {state.hotWords.map((word) => (
                    <button key={word} type="button" className="xm-chip" onClick={() => handleTagClick(word)}>
                      {word}
                    </button>
                  ))}
                </div>
              </div>

              {state.searchError && (
                <div className="xm-feedback" role="alert">
                  <span>
                    {t('搜索失败', 'Search failed')}: {state.searchError}
                  </span>
                  <button type="button" className="xm-pill" onClick={() => void search(state.searchQuery)}>
                    {t('重试', 'Retry')}
                  </button>
                </div>
              )}

              {state.searching ? (
                <div className="xm-list-skeleton" aria-busy="true">
                  {Array.from({ length: 5 }, (_, idx) => (
                    <div key={idx} className="xm-row-skel" aria-hidden="true" />
                  ))}
                </div>
              ) : state.searchQuery ? (
                <>
                  <div className="xm-page-head xm-search-head">
                    <h2 className="xm-search-heading">
                      {t(`“${state.searchQuery}” 的搜索结果`, `Results for "${state.searchQuery}"`)}
                    </h2>
                    <div className="xm-segment" role="group" aria-label={t('结果类型', 'Result type')}>
                      <button
                        type="button"
                        aria-pressed={searchSegment === 'albums'}
                        onClick={() => setSearchSegment('albums')}
                      >
                        {t('专辑', 'Albums')} ({state.searchAlbums.length})
                      </button>
                      <button
                        type="button"
                        aria-pressed={searchSegment === 'tracks'}
                        onClick={() => setSearchSegment('tracks')}
                      >
                        {t('声音', 'Episodes')} ({state.searchTracks.length})
                      </button>
                    </div>
                  </div>

                  {searchSegment === 'albums' ? (
                    state.searchAlbums.length > 0 ? (
                      <div className="xm-grid">{state.searchAlbums.map((alb) => renderAlbumTile(alb))}</div>
                    ) : (
                      <div className="xm-empty">
                        <AudioBookGlyph size={44} />
                        <p>{t('未找到相关专辑', 'No matching albums')}</p>
                      </div>
                    )
                  ) : state.searchTracks.length > 0 ? (
                    <div className="xm-track-list">
                      {state.searchTracks.map((track) => {
                        const isCurrent = Boolean(vod && vod.trackId === track.id)
                        return (
                          <button
                            key={track.id}
                            type="button"
                            className={`xm-track-row${isCurrent ? ' active' : ''}`}
                            onClick={() => play(track, state.searchTracks)}
                          >
                            <span className="xm-track-thumb">
                              <CoverImage src={track.artwork} alt="" fallback={<AudioBookGlyph size={24} />} />
                            </span>
                            <span className="xm-track-body">
                              <span className="xm-track-title">{track.title}</span>
                              <span className="xm-track-sub">
                                {track.artist}
                                {track.album ? ` · ${track.album}` : ''}
                                {track.duration ? ` · ${formatDuration(track.duration)}` : ''}
                              </span>
                            </span>
                            <span className="xm-track-play" aria-hidden="true">
                              {isCurrent ? <XmBars playing={Boolean(state.playing)} /> : <PlayGlyph size={22} />}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="xm-empty">
                      <AudioBookGlyph size={44} />
                      <p>{t('未找到相关声音', 'No matching episodes')}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="xm-empty">
                  <SearchGlyph size={44} />
                  <p>{t('输入关键词或点击热词，搜索喜马拉雅全网有声内容', 'Enter keywords or pick a trending topic')}</p>
                </div>
              )}
            </div>
          ) : (
            /* ================= MY LIBRARY TAB (subscribed / listened / like / buy) ================= */
            (() => {
              const myTabs: { id: MySection; label: string; count?: number }[] = [
                {
                  id: 'subscribed',
                  label: t('订阅', 'Subscribed'),
                  count: state.mySubscribedTotal || (state.mySubscribed.length || state.favorites.length) || undefined,
                },
                {
                  id: 'listened',
                  label: t('听过', 'Listened'),
                  count: state.myListened.length || state.history.length || undefined,
                },
                {
                  id: 'like',
                  label: t('喜欢', 'Liked'),
                  count: state.myLikedTotal || state.myLiked.length || undefined,
                },
                {
                  id: 'buy',
                  label: t('已购', 'Purchased'),
                  count: state.myBoughtTotal || state.myBought.length || undefined,
                },
              ]

              // Merge cloud & local without duplicates for Subscribed and Listened
              const mergedSubscribed = [
                ...state.mySubscribed,
                ...state.favorites.filter((f) => !state.mySubscribed.some((c) => c.id === f.id)),
              ]
              const mergedListened = [
                ...state.myListened,
                ...state.history.filter((h) => !state.myListened.some((c) => c.id === h.id)),
              ]

              const renderTrackRow = (track: (typeof mergedListened)[number], list: typeof mergedListened) => {
                const saved = track.albumId ? state.progressMap[track.albumId] : undefined
                const resumePos = saved && saved.trackId === track.id ? saved.position : 0
                const isCurrent = Boolean(vod && vod.trackId === track.id)
                return (
                  <button
                    key={track.id}
                    type="button"
                    className={`xm-track-row${isCurrent ? ' active' : ''}`}
                    onClick={() => play(track, list, resumePos)}
                  >
                    <span className="xm-track-thumb">
                      <CoverImage src={track.artwork} alt="" fallback={<AudioBookGlyph size={24} />} />
                    </span>
                    <span className="xm-track-body">
                      <span className="xm-track-title">{track.title}</span>
                      <span className="xm-track-sub">
                        {track.artist}
                        {track.album ? ` · ${track.album}` : ''}
                        {resumePos > 5
                          ? ` · ${t(`续播 ${formatDuration(resumePos)}`, `Resume ${formatDuration(resumePos)}`)}`
                          : ''}
                        {track.duration ? ` · ${formatDuration(track.duration)}` : ''}
                        {track.playCount ? ` · ${track.playCount}` : ''}
                      </span>
                    </span>
                    <span className="xm-track-play" aria-hidden="true">
                      {isCurrent ? <XmBars playing={Boolean(state.playing)} /> : <PlayGlyph size={22} />}
                    </span>
                  </button>
                )
              }

              return (
                <div className="xm-page">
                  <div className="xm-page-head">
                    <h1 className="xm-title">{t('我的', 'My Library')}</h1>
                    <div className="xm-my-head-actions">
                      <div className="xm-segment xm-my-segment xm-fade-scroller" role="group" aria-label={t('我的栏目', 'My sections')}>
                        {myTabs.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={state.mySection === item.id}
                            onClick={() => selectMySection(item.id)}
                          >
                            {item.label}
                            {item.count ? ` (${item.count})` : ''}
                          </button>
                        ))}
                      </div>
                      {state.signedIn && (
                        <button
                          type="button"
                          className="xm-clear-btn"
                          disabled={state.myLoading}
                          onClick={() => void loadMySection(state.mySection, 1, true)}
                        >
                          {state.myLoading ? t('同步中…', 'Syncing…') : t('刷新', 'Refresh')}
                        </button>
                      )}
                    </div>
                  </div>

                  {(!state.signedIn || state.myNeedLogin) && (
                    <div className="xm-signin-banner" role="status">
                      <div className="xm-signin-banner-copy">
                        <strong>{t('登录喜马拉雅同步云端记录', 'Sign in to sync your Ximalaya account')}</strong>
                        <span>
                          {t(
                            '同步主站「订阅 / 听过 / 喜欢 / 已购」全部内容与 VIP 权益',
                            'Sync Subscribed, Listened, Liked, and Purchased items from ximalaya.com',
                          )}
                        </span>
                      </div>
                      <button type="button" className="xm-pill key" onClick={sendSignIn}>
                        {t('扫码登录', 'Sign In')}
                      </button>
                    </div>
                  )}

                  {state.myError && (
                    <div className="xm-feedback" role="alert">
                      <span>
                        {t('加载失败', 'Failed to load')}: {state.myError}
                      </span>
                      <button
                        type="button"
                        className="xm-pill"
                        onClick={() => void loadMySection(state.mySection, 1, true)}
                      >
                        {t('重试', 'Retry')}
                      </button>
                    </div>
                  )}

                  {state.mySection === 'subscribed' ? (
                    state.myLoading && mergedSubscribed.length === 0 ? (
                      <div className="xm-grid" aria-busy="true">
                        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                          <div key={i} className="xm-tile skeleton" aria-hidden="true">
                            <div className="xm-cover" />
                            <div className="xm-skel-line" />
                            <div className="xm-skel-line short" />
                          </div>
                        ))}
                      </div>
                    ) : mergedSubscribed.length === 0 ? (
                      <div className="xm-empty">
                        <StarGlyph size={48} on={false} />
                        <p>{t('暂无订阅专辑，登录后自动同步主站订阅或在此收藏', 'No subscribed albums yet')}</p>
                      </div>
                    ) : (
                      <>
                        <div className={`xm-grid${state.myLoading ? ' refreshing' : ''}`}>
                          {mergedSubscribed.map((alb) => renderAlbumTile(alb))}
                        </div>
                        {state.mySubscribedMaxPage > 1 && (
                          <nav className="xm-pages" aria-label={t('订阅分页', 'Subscribed pages')}>
                            <button
                              type="button"
                              className="xm-pill"
                              disabled={state.mySubscribedPage <= 1 || state.myLoading}
                              onClick={() => void loadMySection('subscribed', state.mySubscribedPage - 1, true)}
                            >
                              ‹ {t('上一页', 'Previous')}
                            </button>
                            <span>
                              {state.mySubscribedPage} / {state.mySubscribedMaxPage}
                            </span>
                            <button
                              type="button"
                              className="xm-pill"
                              disabled={state.mySubscribedPage >= state.mySubscribedMaxPage || state.myLoading}
                              onClick={() => void loadMySection('subscribed', state.mySubscribedPage + 1, true)}
                            >
                              {t('下一页', 'Next')} ›
                            </button>
                          </nav>
                        )}
                      </>
                    )
                  ) : state.mySection === 'listened' ? (
                    <>
                      {state.history.length > 0 && (
                        <div className="xm-history-bar">
                          <span className="xm-count">
                            {t(`共 ${mergedListened.length} 条听过记录`, `${mergedListened.length} listened episodes`)}
                          </span>
                          <button type="button" className="xm-clear-btn" onClick={clearHistory}>
                            <TrashGlyph size={17} />
                            <span>{t('清空本地记录', 'Clear Local')}</span>
                          </button>
                        </div>
                      )}
                      {state.myLoading && mergedListened.length === 0 ? (
                        <div className="xm-list-skeleton" aria-busy="true">
                          {Array.from({ length: 5 }, (_, idx) => (
                            <div key={idx} className="xm-row-skel" aria-hidden="true" />
                          ))}
                        </div>
                      ) : mergedListened.length === 0 ? (
                        <div className="xm-empty">
                          <AudioBookGlyph size={48} />
                          <p>{t('暂无听过记录，播放后会自动同步并保存续播进度', 'No listening history yet')}</p>
                        </div>
                      ) : (
                        <div className={`xm-track-list${state.myLoading ? ' refreshing' : ''}`}>
                          {mergedListened.map((track) => renderTrackRow(track, mergedListened))}
                        </div>
                      )}
                    </>
                  ) : state.mySection === 'like' ? (
                    state.myLoading && state.myLiked.length === 0 ? (
                      <div className="xm-list-skeleton" aria-busy="true">
                        {Array.from({ length: 5 }, (_, idx) => (
                          <div key={idx} className="xm-row-skel" aria-hidden="true" />
                        ))}
                      </div>
                    ) : state.myLiked.length === 0 ? (
                      <div className="xm-empty">
                        <AudioBookGlyph size={48} />
                        <p>
                          {state.signedIn
                            ? t('暂无喜欢的声音', 'No liked episodes yet')
                            : t('登录喜马拉雅账号后查看「我喜欢的声音」', 'Sign in to view your liked episodes')}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className={`xm-track-list${state.myLoading ? ' refreshing' : ''}`}>
                          {state.myLiked.map((track) => renderTrackRow(track, state.myLiked))}
                        </div>
                        {state.myLikedMaxPage > 1 && (
                          <nav className="xm-pages" aria-label={t('喜欢分页', 'Liked pages')}>
                            <button
                              type="button"
                              className="xm-pill"
                              disabled={state.myLikedPage <= 1 || state.myLoading}
                              onClick={() => void loadMySection('like', state.myLikedPage - 1, true)}
                            >
                              ‹ {t('上一页', 'Previous')}
                            </button>
                            <span>
                              {state.myLikedPage} / {state.myLikedMaxPage}
                            </span>
                            <button
                              type="button"
                              className="xm-pill"
                              disabled={state.myLikedPage >= state.myLikedMaxPage || state.myLoading}
                              onClick={() => void loadMySection('like', state.myLikedPage + 1, true)}
                            >
                              {t('下一页', 'Next')} ›
                            </button>
                          </nav>
                        )}
                      </>
                    )
                  ) : state.myLoading && state.myBought.length === 0 ? (
                    <div className="xm-grid" aria-busy="true">
                      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                        <div key={i} className="xm-tile skeleton" aria-hidden="true">
                          <div className="xm-cover" />
                          <div className="xm-skel-line" />
                          <div className="xm-skel-line short" />
                        </div>
                      ))}
                    </div>
                  ) : state.myBought.length === 0 ? (
                    <div className="xm-empty">
                      <CrownGlyph size={44} />
                      <p>
                        {state.signedIn
                          ? t('暂无已购专辑', 'No purchased albums yet')
                          : t('登录喜马拉雅账号后查看「已购专辑」', 'Sign in to view your purchased albums')}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className={`xm-grid${state.myLoading ? ' refreshing' : ''}`}>
                        {state.myBought.map((alb) => renderAlbumTile(alb))}
                      </div>
                      {state.myBoughtMaxPage > 1 && (
                        <nav className="xm-pages" aria-label={t('已购分页', 'Purchased pages')}>
                          <button
                            type="button"
                            className="xm-pill"
                            disabled={state.myBoughtPage <= 1 || state.myLoading}
                            onClick={() => void loadMySection('buy', state.myBoughtPage - 1, true)}
                          >
                            ‹ {t('上一页', 'Previous')}
                          </button>
                          <span>
                            {state.myBoughtPage} / {state.myBoughtMaxPage}
                          </span>
                          <button
                            type="button"
                            className="xm-pill"
                            disabled={state.myBoughtPage >= state.myBoughtMaxPage || state.myLoading}
                            onClick={() => void loadMySection('buy', state.myBoughtPage + 1, true)}
                          >
                            {t('下一页', 'Next')} ›
                          </button>
                        </nav>
                      )}
                    </>
                  )}
                </div>
              )
            })()
          )}

          {!isInHost() && (
            <div className="xm-preview-foot">
              {t('开发预览 · 数据来自喜马拉雅主站 (ximalaya.com)', 'PREVIEW · Live catalog from ximalaya.com')}
            </div>
          )}
        </main>

        <XimalayaMiniPlayer aside={typing} />
      </section>

      <NowPlaying />
    </>
  )
}
