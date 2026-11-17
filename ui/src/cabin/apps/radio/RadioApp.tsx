import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useLanguage } from '../../state/text'
import { BackGlyph, FilterGlyph, PauseGlyph, PlayGlyph, QueueGlyph, RadioGlyph, StarGlyph } from '../music/glyphs'
import { CoverImage } from '../ximalaya/CoverImage'
import { useXimalaya } from '../ximalaya/ximalaya'
import { RadioBars, RadioMiniPlayer, RadioNowPlaying } from './RadioNowPlaying'
import {
  beijingDate,
  closeRadioDetail,
  loadRadioDetail,
  loadRadioHome,
  loadRadioList,
  pauseOrResumeRadio,
  playRadio,
  scheduleIsLive,
  scheduleProgress,
  secureCover,
  setRadioFilter,
  setRadioTab,
  setScheduleDay,
  statusLabel,
  toggleRadioFavorite,
  useRadio,
  type RadioStation,
} from './radio'
import './radio.css'

const SKELETON_COUNT = 8

export function RadioApp() {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)
  const state = useRadio()
  const { playback, playing } = useXimalaya()
  const [filterOpen, setFilterOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [chipsFade, setChipsFade] = useState({ left: false, right: false })
  const liveRowRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadRadioHome()
    void loadRadioList()
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const time = Date.now()
      setNow(time)
      const s = useRadio.getState()
      if (s.detail && !s.detailLoading) void loadRadioDetail(s.detail, true)
      if (beijingDate(time) !== s.scheduleDate && !s.detail) useRadio.setState({ scheduleDate: beijingDate(time) })
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!filterOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filterOpen])

  const detail = state.detail
  const schedules =
    state.schedules?.[(state.scheduleDay + 'Schedules') as keyof NonNullable<typeof state.schedules>] || []

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [detail?.id, state.tab])

  useEffect(() => {
    const el = chipsRef.current
    if (!el) return
    const update = () => {
      setChipsFade({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [state.categories.length, state.tab, detail])

  const jumpToLiveRow = () => {
    const container = scrollRef.current
    const row = liveRowRef.current
    if (!container || !row) return
    const cRect = container.getBoundingClientRect()
    const rRect = row.getBoundingClientRect()
    const targetTop = container.scrollTop + (rRect.top - cRect.top) - container.clientHeight * 0.42
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
  }

  const stations = state.tab === 'favorites' ? state.favorites : state.stations
  const live = playback?.owner === 'radio' ? playback : null
  const pages = Math.max(1, Math.ceil(state.total / 48))
  const hasFilter = state.locationId !== 0 || state.categoryId !== 0
  const activeRegion =
    state.locations.find((l) => l.id === state.locationId && l.type === state.locationTypeId)?.name ??
    t('全部地区', 'All regions')
  const detailFavorite = detail ? state.favorites.some((s) => s.id === detail.id) : false
  const detailActive = Boolean(detail && live?.radioId === detail.id)
  const detailBusy = Boolean(detailActive && (playing || live?.status === 'loading'))

  const cover = (station: RadioStation) => (
    <CoverImage
      key={station.coverLarge || station.coverSmall}
      src={secureCover(station.coverLarge || station.coverSmall)}
      alt=""
      fallback="FM"
    />
  )

  const retry = (error: string, action: () => void) => (
    <div className="rd-feedback" role="alert">
      <span>
        {t('请求失败', 'Request failed')}: {error}
      </span>
      <button type="button" className="rd-pill" onClick={action}>
        {t('重试', 'Retry')}
      </button>
    </div>
  )

  return (
    <>
      <section className="app-panel radio-app" aria-label={t('电台', 'Radio')}>
        {/* Floating iOS 26 / CarPlay Glass Navigation Bar */}
        <header className="rd-bar">
          <div className="rd-bar-side">
            {detail && (
              <button
                type="button"
                className="rd-round glass"
                aria-label={t('返回电台', 'Back to stations')}
                onClick={closeRadioDetail}
              >
                <BackGlyph size={34} />
              </button>
            )}
          </div>

          <nav className="rd-tab-bar glass" aria-label={t('电台页面', 'Radio pages')}>
            <button
              type="button"
              className={`rd-tab${state.tab === 'all' && !detail ? ' on' : ''}`}
              aria-current={state.tab === 'all' && !detail ? 'page' : undefined}
              onClick={() => {
                setFilterOpen(false)
                setRadioTab('all')
              }}
            >
              <RadioGlyph size={26} />
              <span>{t('全部电台', 'Stations')}</span>
            </button>
            <button
              type="button"
              className={`rd-tab${state.tab === 'favorites' && !detail ? ' on' : ''}`}
              aria-current={state.tab === 'favorites' && !detail ? 'page' : undefined}
              onClick={() => {
                setFilterOpen(false)
                setRadioTab('favorites')
              }}
            >
              <StarGlyph size={26} on={state.tab === 'favorites' && !detail} />
              <span>
                {t('我的收藏', 'Favorites')}
                {state.favorites.length > 0 && <em className="rd-tab-count">{state.favorites.length}</em>}
              </span>
            </button>
          </nav>

          <div className="rd-bar-side end">
            {detail ? (
              <button
                type="button"
                className={`rd-round glass${detailFavorite ? ' on' : ''}`}
                aria-label={detailFavorite ? t('取消收藏', 'Unfavorite') : t('收藏电台', 'Favorite station')}
                aria-pressed={detailFavorite}
                onClick={() => toggleRadioFavorite(detail)}
              >
                <StarGlyph size={30} on={detailFavorite} />
              </button>
            ) : (
              state.tab === 'all' && (
                <button
                  type="button"
                  className={`rd-round glass${hasFilter || filterOpen ? ' on' : ''}`}
                  aria-label={t('筛选地区与类型', 'Filter regions and genres')}
                  aria-expanded={filterOpen}
                  aria-haspopup="dialog"
                  onClick={() => setFilterOpen((v) => !v)}
                >
                  <FilterGlyph size={28} />
                </button>
              )
            )}
          </div>
        </header>

        {/* Scrollable Body (scrolls beneath floating bar with edge fade mask) */}
        <main ref={scrollRef} className={`rd-scroll${live ? ' has-mini' : ''}`}>
          {state.notice && (
            <div className="rd-notice" role="status">
              <span>
                {state.notice === 'host'
                  ? t(
                      '开发预览提供真实目录与节目表；直播请在 WestPlay 主机中播放。',
                      'Live playback is available in the WestPlay host. This preview shows the real directory and schedules.',
                    )
                  : t('无法保存收藏，请检查本机存储空间。', 'Unable to save favorites. Check local storage.')}
              </span>
              <button
                type="button"
                aria-label={t('关闭提示', 'Dismiss')}
                onClick={() => useRadio.setState({ notice: null })}
              >
                ×
              </button>
            </div>
          )}

          {detail ? (
            <div className="rd-detail">
              <div className="rd-collection-head">
                <div className="rd-collection-cover">{cover(detail)}</div>
                <div className="rd-collection-text">
                  <span className="rd-eyebrow">
                    {detailActive ? (
                      <>
                        {live?.status === 'playing' && <RadioBars playing />}
                        {statusLabel(live!.status, t)}
                      </>
                    ) : (
                      <>FM · {t('在线广播', 'ON AIR')}</>
                    )}
                  </span>
                  <h1>{detail.name}</h1>
                  <p className="rd-collection-program">
                    {detail.programName || detail.categoryName || t('广播电台', 'Radio station')}
                  </p>
                  <div className="rd-actions">
                    <button
                      type="button"
                      className="rd-pill key"
                      onClick={() => (detailActive ? pauseOrResumeRadio() : playRadio(detail, stations))}
                    >
                      {detailBusy ? <PauseGlyph size={24} /> : <PlayGlyph size={24} />}
                      <span>{detailBusy ? t('暂停直播', 'Pause') : t('播放直播', 'Listen live')}</span>
                    </button>
                    <button
                      type="button"
                      className="rd-pill"
                      aria-pressed={detailFavorite}
                      onClick={() => toggleRadioFavorite(detail)}
                    >
                      <StarGlyph size={22} on={detailFavorite} />
                      <span>{detailFavorite ? t('已收藏', 'Favorited') : t('收藏', 'Favorite')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="rd-schedule-heading">
                <div className="rd-day-tabs" role="tablist" aria-label={t('节目日期', 'Schedule day')}>
                  {(['yesterday', 'today', 'tomorrow'] as const).map((day, i) => (
                    <button
                      type="button"
                      role="tab"
                      key={day}
                      aria-selected={day === state.scheduleDay}
                      onClick={() => setScheduleDay(day)}
                    >
                      {[t('昨天', 'Yesterday'), t('今天', 'Today'), t('明天', 'Tomorrow')][i]}
                    </button>
                  ))}
                </div>
                <div className="rd-schedule-meta">
                  {state.scheduleDay === 'today' &&
                    schedules.some((item) => scheduleIsLive(item, 'today', state.scheduleDate, now)) && (
                      <button type="button" className="rd-jump-live" onClick={jumpToLiveRow}>
                        {t('定位直播', 'Jump to live')}
                      </button>
                    )}
                  <small>{state.scheduleDate} · UTC+8</small>
                </div>
              </div>

              {state.detailError && retry(state.detailError, () => void loadRadioDetail(detail, true))}
              {state.detailLoading && !schedules.length && (
                <div className="rd-feedback" role="status">
                  {t('正在更新节目表…', 'Updating schedule…')}
                </div>
              )}
              {!state.detailLoading && !state.detailError && !schedules.length && (
                <div className="rd-empty">{t('这一天暂无节目表', 'No schedule available for this day')}</div>
              )}

              <div className="rd-schedule">
                {schedules.map((item, index) => {
                  const onAir = scheduleIsLive(item, state.scheduleDay, state.scheduleDate, now)
                  const progress = onAir ? scheduleProgress(item, state.scheduleDay, state.scheduleDate, now) : null
                  return (
                    <article
                      key={String(item.programScheduleId) + '-' + index}
                      ref={onAir ? liveRowRef : undefined}
                      className={`rd-schedule-row${onAir ? ' live' : ''}`}
                    >
                      <time>
                        {item.startTime} — {item.endTime}
                      </time>
                      <div className="rd-schedule-main">
                        <strong>{item.programName}</strong>
                        {item.announcerList && item.announcerList.length > 0 && (
                          <span>{item.announcerList.map((a) => a.announcerName).join(' / ')}</span>
                        )}
                        {progress !== null && (
                          <div className="rd-schedule-progress" aria-hidden>
                            <span style={{ '--share': progress } as CSSProperties} />
                          </div>
                        )}
                      </div>
                      <div className="rd-schedule-badge">
                        {onAir && (
                          <em>
                            <RadioBars playing={detailActive && Boolean(playing)} />
                            {t('正在直播', 'ON AIR')}
                          </em>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="rd-page-head">
                <h1 className="rd-title">
                  {state.tab === 'favorites' ? t('我的收藏', 'Favorites') : t('电台', 'Radio')}
                </h1>
                <span className="rd-count">
                  {state.tab === 'favorites' ? state.favorites.length : state.total} {t('个电台', 'stations')}
                </span>
              </div>

              {state.tab === 'all' && (
                <div className="rd-filter-strip">
                  {state.homeError && retry(state.homeError, () => void loadRadioHome())}
                  <button
                    type="button"
                    className={`rd-chip rd-region-trigger${state.locationId !== 0 ? ' active' : ''}`}
                    onClick={() => setFilterOpen(true)}
                  >
                    <span>
                      {t('地区', 'Region')}: {activeRegion}
                    </span>
                    <span aria-hidden>⌄</span>
                  </button>

                  {state.categories.length > 0 && (
                    <div
                      ref={chipsRef}
                      className={`rd-chips${chipsFade.left ? ' fade-left' : ''}${chipsFade.right ? ' fade-right' : ''}`}
                      role="group"
                      aria-label={t('电台类型', 'Station genres')}
                    >
                      {state.categories.map((category) => {
                        const selected = state.categoryId === category.id
                        return (
                          <button
                            type="button"
                            key={category.id}
                            className={`rd-chip${selected ? ' active' : ''}`}
                            aria-pressed={selected}
                            onClick={(event) => {
                              event.currentTarget.scrollIntoView({
                                block: 'nearest',
                                inline: 'nearest',
                                behavior: 'smooth',
                              })
                              setRadioFilter(state.locationId, state.locationTypeId, category.id)
                            }}
                          >
                            {category.name}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {hasFilter && (
                    <button type="button" className="rd-chip rd-chip-reset" onClick={() => setRadioFilter(0, 0, 0)}>
                      {t('重置', 'Reset')}
                    </button>
                  )}
                </div>
              )}

              {state.tab === 'all' && state.error && retry(state.error, () => void loadRadioList(state.page))}

              {state.tab === 'all' && state.loading && !stations.length ? (
                <div className="rd-grid" aria-busy="true" aria-label={t('正在加载电台…', 'Loading stations…')}>
                  {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                    <div key={i} className="rd-tile skeleton" aria-hidden>
                      <div className="rd-cover" />
                      <div className="rd-skel-line" />
                      <div className="rd-skel-line short" />
                    </div>
                  ))}
                </div>
              ) : !stations.length ? (
                <div className="rd-empty">
                  <RadioGlyph size={52} />
                  <p>
                    {state.tab === 'favorites'
                      ? t('收藏喜欢的电台，下次一触即听', 'Favorite a station to find it here')
                      : t('暂无电台，换个筛选条件试试', 'No stations. Try another filter.')}
                  </p>
                </div>
              ) : (
                <div className={`rd-grid${state.loading ? ' refreshing' : ''}`}>
                  {stations.map((station) => {
                    const active = live?.radioId === station.id
                    const busy = active && (Boolean(playing) || live?.status === 'loading')
                    const favorite = state.favorites.some((s) => s.id === station.id)
                    return (
                      <article key={station.id} className={`rd-tile${active ? ' active' : ''}`}>
                        <div className="rd-tile-art-wrap">
                          <button
                            type="button"
                            className="rd-tile-main"
                            onClick={() => (active ? pauseOrResumeRadio() : playRadio(station, stations))}
                            aria-label={
                              station.name + ' · ' + (active ? statusLabel(live!.status, t) : t('播放', 'Play'))
                            }
                          >
                            <span className="rd-cover">
                              {cover(station)}
                              {active && (
                                <span className="rd-cover-overlay">
                                  {busy ? <RadioBars playing={Boolean(playing)} /> : <PlayGlyph size={32} />}
                                </span>
                              )}
                            </span>
                            <span className="rd-tile-name">{station.name}</span>
                            <span className="rd-tile-sub">
                              {active
                                ? statusLabel(live!.status, t) + ' · ' + live!.title
                                : station.programName || t('实时广播', 'Live broadcast')}
                            </span>
                          </button>

                          <div className="rd-tile-actions">
                            <button
                              type="button"
                              className={`rd-tile-btn${favorite ? ' on' : ''}`}
                              aria-label={favorite ? t('取消收藏', 'Unfavorite') : t('收藏', 'Favorite')}
                              aria-pressed={favorite}
                              onClick={() => toggleRadioFavorite(station)}
                            >
                              <StarGlyph size={20} on={favorite} />
                            </button>
                            <button
                              type="button"
                              className="rd-tile-btn"
                              aria-label={station.name + ' · ' + t('节目表', 'Schedule')}
                              onClick={() => void loadRadioDetail(station)}
                            >
                              <QueueGlyph size={19} />
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              {state.tab === 'all' && !state.loading && !state.error && pages > 1 && (
                <nav className="rd-pages" aria-label={t('电台分页', 'Directory pages')}>
                  <button
                    type="button"
                    className="rd-pill"
                    disabled={state.page <= 1}
                    onClick={() => void loadRadioList(state.page - 1)}
                  >
                    ‹ {t('上一页', 'Previous')}
                  </button>
                  <span>
                    {state.page} / {pages}
                  </span>
                  <button
                    type="button"
                    className="rd-pill"
                    disabled={state.page >= pages}
                    onClick={() => void loadRadioList(state.page + 1)}
                  >
                    {t('下一页', 'Next')} ›
                  </button>
                </nav>
              )}
            </>
          )}

          {!isInHost() && (
            <div className="rd-preview">
              {t('开发预览 · 目录与节目表来自喜马拉雅', 'PREVIEW · Directory and schedules from Ximalaya')}
            </div>
          )}
        </main>

        {/* Glass Filter Popover */}
        {filterOpen && !detail && state.tab === 'all' && (
          <>
            <div className="rd-menu-veil" onClick={() => setFilterOpen(false)} />
            <div className="rd-popover glass" role="dialog" aria-label={t('筛选电台', 'Filter stations')}>
              <div className="rd-popover-head">
                <h2>{t('筛选电台', 'Filter stations')}</h2>
                {hasFilter && (
                  <button
                    type="button"
                    className="rd-popover-reset"
                    onClick={() => {
                      setRadioFilter(0, 0, 0)
                      setFilterOpen(false)
                    }}
                  >
                    {t('重置全部', 'Reset all')}
                  </button>
                )}
              </div>

              {state.homeLoading && !state.locations.length ? (
                <p className="rd-popover-status">{t('正在加载筛选项…', 'Loading filters…')}</p>
              ) : (
                <>
                  {state.locations.length > 0 && (
                    <div className="rd-popover-group">
                      <h3>{t('地区', 'Region')}</h3>
                      <div className="rd-popover-pills">
                        {state.locations.map((location) => {
                          const selected = state.locationId === location.id && state.locationTypeId === location.type
                          return (
                            <button
                              type="button"
                              key={location.id + '-' + location.type}
                              className={`rd-chip${selected ? ' active' : ''}`}
                              aria-pressed={selected}
                              onClick={() => {
                                setRadioFilter(location.id, location.type, state.categoryId)
                                setFilterOpen(false)
                              }}
                            >
                              {location.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {state.categories.length > 0 && (
                    <div className="rd-popover-group">
                      <h3>{t('类型', 'Genre')}</h3>
                      <div className="rd-popover-pills">
                        {state.categories.map((category) => {
                          const selected = state.categoryId === category.id
                          return (
                            <button
                              type="button"
                              key={category.id}
                              className={`rd-chip${selected ? ' active' : ''}`}
                              aria-pressed={selected}
                              onClick={() => {
                                setRadioFilter(state.locationId, state.locationTypeId, category.id)
                                setFilterOpen(false)
                              }}
                            >
                              {category.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        <RadioMiniPlayer />
      </section>

      <RadioNowPlaying now={now} />
    </>
  )
}
