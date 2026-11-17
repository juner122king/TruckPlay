import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { SearchGlyph } from '../../keyboard/glyphs'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import { BackGlyph } from '../youtube/glyphs'
import {
  type BilibiliTab,
  type BilibiliView,
  goBack,
  openPlayer,
  openResults,
  rememberSearch,
  selectTab,
  sendStart,
  useBilibili,
} from './bilibili'
import { FilmGlyph, LiveGlyph, RefreshGlyph, SignalGlyph, SparkleGlyph } from './glyphs'
import { NowPlayingBar } from './NowPlayingBar'
import { AccountControl, SigningInBanner } from './shared'
import { DynamicTab } from './tabs/DynamicTab'
import { FeaturedTab } from './tabs/FeaturedTab'
import { LiveTab } from './tabs/LiveTab'
import { MovieTab } from './tabs/MovieTab'
import { SearchOverlay } from './views/SearchOverlay'
import { ChannelView, PlaylistView, ResultsView } from './views/SubViews'
import './bilibili.css'

const FIELD = 'bilibili-search'

const HOME_TABS: { id: BilibiliTab; label: string; icon: ReactNode }[] = [
  { id: 'featured', label: '精选', icon: <SparkleGlyph /> },
  { id: 'dynamic', label: '动态', icon: <SignalGlyph /> },
  { id: 'live', label: '直播', icon: <LiveGlyph /> },
  { id: 'movie', label: '影视', icon: <FilmGlyph /> },
]

export function BilibiliApp() {
  const tab = useBilibili((store) => store.tab)
  const views = useBilibili((store) => store.views)
  const signedIn = useBilibili((store) => store.signedIn ?? false)
  const [query, setQuery] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const typing = useKeyboard((state) => state.field?.id === FIELD)

  useEffect(() => {
    sendStart()
  }, [])

  useEffect(() => {
    if (useBilibili.getState().returnToPlayer) openPlayer(true)
  }, [])

  const triggerRefresh = useCallback(() => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshKey((k) => k + 1)
    setTimeout(() => setRefreshing(false), 650)
  }, [refreshing])

  const search = (wanted: string) => {
    const trimmed = wanted.trim()
    if (!trimmed) return
    rememberSearch(trimmed)
    setQuery(trimmed)
    useKeyboard.getState().detach(FIELD)
    openResults(trimmed)
  }

  const back = () => {
    useKeyboard.getState().detach(FIELD)
    goBack()
  }

  const cancelSearch = () => {
    useKeyboard.getState().detach(FIELD)
    setQuery('')
  }

  const top = views.at(-1)
  const shownQuery = top?.kind === 'results' ? top.query : ''
  const [lastShown, setLastShown] = useState(shownQuery)
  if (shownQuery !== lastShown) {
    setLastShown(shownQuery)
    setQuery(shownQuery)
  }

  const atHome = views.length === 0 && !typing

  return (
    <section className="app-panel bilibili-app" aria-label="哔哩哔哩">
      <header className="bili-top">
        {views.length > 0 && !typing && (
          <button type="button" className="bili-round" aria-label="返回" onClick={back}>
            <BackGlyph />
          </button>
        )}
        <TextField
          id={FIELD}
          value={query}
          onChange={setQuery}
          onSubmit={() => search(query)}
          returnKind="search"
          hint="搜索哔哩哔哩视频、UP主..."
          label="搜索哔哩哔哩"
          icon={<SearchGlyph />}
        />
        {typing ? (
          <button type="button" className="bili-cancel-search-btn" onClick={cancelSearch}>
            取消
          </button>
        ) : (
          <AccountControl />
        )}
      </header>

      {!typing && <SigningInBanner />}

      {atHome && (
        <div className="bili-home-header">
          <div
            className="bili-segmented-control"
            role="tablist"
            aria-label="哔哩哔哩频道"
            onKeyDown={(e) => {
              const currentIndex = HOME_TABS.findIndex((t) => t.id === tab)
              if (currentIndex < 0) return
              let nextIndex = -1
              if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % HOME_TABS.length
              else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + HOME_TABS.length) % HOME_TABS.length
              else if (e.key === 'Home') nextIndex = 0
              else if (e.key === 'End') nextIndex = HOME_TABS.length - 1
              if (nextIndex >= 0) {
                e.preventDefault()
                selectTab(HOME_TABS[nextIndex].id)
                tabRefs.current[nextIndex]?.focus()
              }
            }}
          >
            {HOME_TABS.map((t, idx) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[idx] = el
                }}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                className={`bili-segmented-btn${tab === t.id ? ' active' : ''}`}
                onClick={() => {
                  if (tab === t.id) triggerRefresh()
                  else selectTab(t.id)
                }}
              >
                <span className="bili-tab-icon">{t.icon}</span>
                <span className="bili-tab-label">{t.label}</span>
                {t.id === 'live' && <span className="bili-live-pulse-dot small" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`bili-home-refresh-btn${refreshing ? ' refreshing' : ''}`}
            onClick={triggerRefresh}
            aria-label="刷新当前频道"
          >
            <span className="bili-refresh-icon">
              <RefreshGlyph />
            </span>
            <span className="bili-refresh-label">刷新</span>
          </button>
        </div>
      )}

      <main className="bili-body">
        <div className={atHome ? 'bili-layer' : 'bili-layer away'} inert={!atHome || undefined} aria-hidden={!atHome}>
          <div className="bili-tab-content">
            {tab === 'featured' && <FeaturedTab onSearch={search} signedIn={signedIn} refreshKey={refreshKey} />}
            {tab === 'dynamic' && <DynamicTab signedIn={signedIn} refreshKey={refreshKey} />}
            {tab === 'live' && <LiveTab signedIn={signedIn} refreshKey={refreshKey} />}
            {tab === 'movie' && <MovieTab refreshKey={refreshKey} />}
          </div>
        </div>

        {views.map((view, index) => {
          const active = index === views.length - 1 && !typing
          return (
            <div
              key={view.id}
              className={active ? 'bili-layer' : 'bili-layer away'}
              inert={!active || undefined}
              aria-hidden={!active}
            >
              <SubView view={view} />
            </div>
          )
        })}

        {typing && (
          <div className="bili-layer bili-search-layer">
            <SearchOverlay query={query} onSearch={search} onFill={setQuery} />
          </div>
        )}
      </main>

      {!typing && <NowPlayingBar />}
    </section>
  )
}

function SubView({ view }: { view: BilibiliView }) {
  switch (view.kind) {
    case 'results':
      return <ResultsView query={view.query} filter={view.filter} />
    case 'channel':
      return <ChannelView channel={view.channel} />
    case 'playlist':
      return <PlaylistView video={view.video} />
  }
}
