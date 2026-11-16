import { useEffect, useState } from 'react'
import { useLanguage } from '../../state/text'
import { isInHost } from '../../../shared/host'
import { sendVolume, useXimalaya } from '../ximalaya/ximalaya'
import { CoverImage } from '../ximalaya/CoverImage'
import { PlayGlyph, PauseGlyph, PreviousGlyph, NextGlyph, StarGlyph, RadioGlyph, SpeakerGlyph } from '../music/glyphs'
import {
  beijingDate,
  closeRadioDetail,
  loadRadioDetail,
  loadRadioHome,
  loadRadioList,
  pauseOrResumeRadio,
  playRadio,
  scheduleIsLive,
  secureCover,
  setRadioFilter,
  setRadioTab,
  setScheduleDay,
  skipRadio,
  toggleRadioFavorite,
  useRadio,
  type RadioStation,
} from './radio'
import './radio.css'

export function RadioApp() {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)
  const state = useRadio()
  const { playback, playing, volume } = useXimalaya()
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())
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
  const stations = state.tab === 'favorites' ? state.favorites : state.stations
  const live = playback?.owner === 'radio' ? playback : null
  const pages = Math.max(1, Math.ceil(state.total / 48))
  const detail = state.detail
  const schedules =
    state.schedules?.[(state.scheduleDay + 'Schedules') as keyof NonNullable<typeof state.schedules>] || []
  const status = (value: string) =>
    value === 'playing'
      ? t('直播中', 'LIVE')
      : value === 'loading'
        ? t('连接中…', 'Connecting…')
        : value === 'failed'
          ? t('连接失败，点击重试', 'Connection failed · Retry')
          : t('已暂停', 'Paused')
  const cover = (station: RadioStation) => (
    <CoverImage
      key={station.coverLarge || station.coverSmall}
      src={secureCover(station.coverLarge || station.coverSmall)}
      alt=""
      fallback="FM"
    />
  )
  const retry = (error: string, action: () => void) => (
    <div className="radio-feedback" role="alert">
      <span>
        {t('请求失败', 'Request failed')}: {error}
      </span>
      <button type="button" onClick={action}>
        {t('重试', 'Retry')}
      </button>
    </div>
  )
  return (
    <section className="app-panel radio-app" aria-label={t('电台', 'Radio')}>
      <header className="radio-header">
        <div className="radio-brand">
          <span className="radio-mark">
            <RadioGlyph size={28} />
          </span>
          <div>
            <h1>{t('电台', 'Radio')}</h1>
            <small>{t('喜马拉雅广播', 'XIMALAYA RADIO')}</small>
          </div>
        </div>
        <nav className="radio-tabs" aria-label={t('电台页面', 'Radio pages')}>
          <button
            type="button"
            aria-current={state.tab === 'all' ? 'page' : undefined}
            onClick={() => setRadioTab('all')}
          >
            {t('全部电台', 'All stations')}
          </button>
          <button
            type="button"
            aria-current={state.tab === 'favorites' ? 'page' : undefined}
            onClick={() => setRadioTab('favorites')}
          >
            {t('我的收藏', 'Favorites')} <span>{state.favorites.length}</span>
          </button>
        </nav>
      </header>
      {state.notice && (
        <div className="radio-notice" role="status">
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
      <main className="radio-content">
        {detail ? (
          <>
            <button type="button" className="radio-back" onClick={closeRadioDetail}>
              ‹ {t('返回电台', 'Back to stations')}
            </button>
            <div className="radio-detail-head">
              {cover(detail)}
              <div>
                <span className="radio-eyebrow">FM · {t('在线广播', 'ON AIR')}</span>
                <h2>{detail.name}</h2>
                <p>{detail.programName || detail.categoryName || t('广播电台', 'Radio station')}</p>
              </div>
              <button type="button" className="radio-primary" onClick={() => playRadio(detail, stations)}>
                <PlayGlyph size={20} />
                {t('播放直播', 'Listen live')}
              </button>
              <button
                type="button"
                className="radio-favorite"
                aria-label={t('收藏电台', 'Favorite station')}
                aria-pressed={state.favorites.some((s) => s.id === detail.id)}
                onClick={() => toggleRadioFavorite(detail)}
              >
                <StarGlyph size={26} on={state.favorites.some((s) => s.id === detail.id)} />
              </button>
            </div>
            <div className="radio-schedule-heading">
              <nav className="radio-day-tabs" aria-label={t('节目日期', 'Schedule day')}>
                {(['yesterday', 'today', 'tomorrow'] as const).map((day, i) => (
                  <button
                    type="button"
                    key={day}
                    aria-current={day === state.scheduleDay ? 'date' : undefined}
                    onClick={() => setScheduleDay(day)}
                  >
                    {[t('昨天', 'Yesterday'), t('今天', 'Today'), t('明天', 'Tomorrow')][i]}
                  </button>
                ))}
              </nav>
              <small>
                {state.scheduleDate} · {t('北京时间', 'Beijing time')} UTC+8
              </small>
            </div>
            {state.detailError && retry(state.detailError, () => void loadRadioDetail(detail, true))}
            {state.detailLoading && (
              <div className="radio-feedback" role="status">
                {t('正在更新节目表…', 'Updating schedule…')}
              </div>
            )}
            {!state.detailLoading && !state.detailError && !schedules.length && (
              <div className="radio-empty">{t('这一天暂无节目表', 'No schedule available for this day')}</div>
            )}
            <div className="radio-schedule">
              {schedules.map((item, index) => {
                const onAir = scheduleIsLive(item, state.scheduleDay, state.scheduleDate, now)
                return (
                  <article
                    className={'radio-schedule-row' + (onAir ? ' live' : '')}
                    key={String(item.programScheduleId) + '-' + index}
                  >
                    <time>
                      {item.startTime} — {item.endTime}
                    </time>
                    <strong>{item.programName}</strong>
                    <span>{item.announcerList?.map((a) => a.announcerName).join(' / ')}</span>
                    {onAir && <em>{t('正在直播', 'ON AIR')}</em>}
                  </article>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {state.tab === 'all' && (
              <div className="radio-filter">
                {state.homeError && retry(state.homeError, () => void loadRadioHome())}
                {state.homeLoading && (
                  <div className="radio-feedback" role="status">
                    {t('正在加载筛选项…', 'Loading filters…')}
                  </div>
                )}
                <div className="radio-filter-row">
                  <b>{t('地区', 'Region')}</b>
                  <div>
                    {(expanded ? state.locations : state.locations.slice(0, 9)).map((location) => (
                      <button
                        type="button"
                        key={location.id + '-' + location.type}
                        aria-pressed={state.locationId === location.id && state.locationTypeId === location.type}
                        onClick={() => setRadioFilter(location.id, location.type, state.categoryId)}
                      >
                        {location.name}
                      </button>
                    ))}
                    {state.locations.length > 9 && (
                      <button
                        type="button"
                        className="radio-more"
                        aria-expanded={expanded}
                        onClick={() => setExpanded(!expanded)}
                      >
                        {expanded ? t('收起', 'Less') : t('更多地区', 'More regions')} {expanded ? '⌃' : '⌄'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="radio-filter-row">
                  <b>{t('类型', 'Genre')}</b>
                  <div>
                    {state.categories.map((category) => (
                      <button
                        type="button"
                        key={category.id}
                        aria-pressed={state.categoryId === category.id}
                        onClick={() => setRadioFilter(state.locationId, state.locationTypeId, category.id)}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="radio-section-heading">
              <h2>
                {state.tab === 'favorites' ? t('收藏的电台', 'Your stations') : t('发现好电台', 'Find your frequency')}
              </h2>
              <span>
                {state.tab === 'favorites' ? state.favorites.length : state.total} {t('个电台', 'stations')}
              </span>
            </div>
            {state.tab === 'all' && state.error && retry(state.error, () => void loadRadioList(state.page))}
            {state.tab === 'all' && state.loading ? (
              <div className="radio-empty" role="status">
                {t('正在加载电台…', 'Tuning the directory…')}
              </div>
            ) : !stations.length ? (
              <div className="radio-empty">
                <RadioGlyph size={46} />
                <p>
                  {state.tab === 'favorites'
                    ? t('收藏喜欢的电台，下次一触即听', 'Favorite a station to find it here')
                    : t('暂无电台，换个筛选条件试试', 'No stations. Try another filter.')}
                </p>
              </div>
            ) : (
              <div className="radio-grid">
                {stations.map((station) => {
                  const active = live?.radioId === station.id
                  const favorite = state.favorites.some((s) => s.id === station.id)
                  return (
                    <article key={station.id} className={'radio-card' + (active ? ' active' : '')}>
                      <button
                        type="button"
                        className="radio-card-main"
                        onClick={() => (active ? pauseOrResumeRadio() : playRadio(station, stations))}
                        aria-label={station.name + ' · ' + (active ? status(live.status) : t('播放', 'Play'))}
                      >
                        <span className="radio-card-art">
                          {cover(station)}
                          <span className="radio-card-play">
                            {active && (playing || live.status === 'loading') ? (
                              <PauseGlyph size={22} />
                            ) : (
                              <PlayGlyph size={22} />
                            )}
                          </span>
                        </span>
                        <strong>{station.name}</strong>
                        <small>
                          {active
                            ? status(live.status) + ' · ' + live.title
                            : station.programName || t('实时广播', 'Live broadcast')}
                        </small>
                      </button>
                      <div className="radio-card-actions">
                        <button
                          type="button"
                          aria-label={favorite ? t('取消收藏', 'Unfavorite') : t('收藏', 'Favorite')}
                          aria-pressed={favorite}
                          onClick={() => toggleRadioFavorite(station)}
                        >
                          <StarGlyph size={21} on={favorite} />
                        </button>
                        <button type="button" onClick={() => void loadRadioDetail(station)}>
                          {t('节目表', 'Schedule')}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
            {state.tab === 'all' && !state.loading && !state.error && (
              <nav className="radio-pages" aria-label={t('电台分页', 'Directory pages')}>
                <button type="button" disabled={state.page <= 1} onClick={() => void loadRadioList(state.page - 1)}>
                  ‹ {t('上一页', 'Previous')}
                </button>
                <span>
                  {state.page} / {pages}
                </span>
                <button type="button" disabled={state.page >= pages} onClick={() => void loadRadioList(state.page + 1)}>
                  {t('下一页', 'Next')} ›
                </button>
              </nav>
            )}
          </>
        )}
      </main>
      {live && (
        <footer className="radio-player">
          <button
            type="button"
            className="radio-player-station"
            onClick={() =>
              void loadRadioDetail({
                id: live.radioId!,
                name: live.artist,
                coverLarge: live.artwork,
                programName: live.title,
              })
            }
          >
            <CoverImage key={live.artwork} src={live.artwork} alt="" fallback="FM" />
            <span>
              <strong>{live.title}</strong>
              <small>
                {live.artist} · <em>{status(live.status)}</em>
              </small>
            </span>
          </button>
          <div className="radio-player-controls">
            <button type="button" onClick={() => skipRadio(-1)} aria-label={t('上一台', 'Previous station')}>
              <PreviousGlyph size={26} />
            </button>
            <button
              type="button"
              className="radio-play"
              onClick={pauseOrResumeRadio}
              aria-label={playing || live.status === 'loading' ? t('暂停', 'Pause') : t('播放或重试', 'Play or retry')}
            >
              {playing || live.status === 'loading' ? <PauseGlyph size={26} /> : <PlayGlyph size={26} />}
            </button>
            <button type="button" onClick={() => skipRadio(1)} aria-label={t('下一台', 'Next station')}>
              <NextGlyph size={26} />
            </button>
          </div>
          <label className="radio-volume">
            <SpeakerGlyph size={23} volume={volume} />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              aria-label={t('音量', 'Volume')}
              onChange={(event) => sendVolume(Number(event.target.value))}
            />
          </label>
          {live.error && (
            <span className="radio-stream-error" title={live.error}>
              {t('直播连接异常', 'Stream connection error')}
            </span>
          )}
        </footer>
      )}
      {!isInHost() && (
        <div className="radio-preview">
          {t('开发预览 · 目录与节目表来自喜马拉雅', 'PREVIEW · Directory and schedules from Ximalaya')}
        </div>
      )}
    </section>
  )
}
