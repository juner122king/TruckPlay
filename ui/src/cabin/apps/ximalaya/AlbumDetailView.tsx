import { useLanguage } from '../../state/text'
import { PauseGlyph, PlayGlyph, StarGlyph } from '../music/glyphs'
import { CoverImage } from './CoverImage'
import { AudioBookGlyph, CrownGlyph, HeadphonesGlyph, SortGlyph } from './glyphs'
import { XmBars } from './NowPlaying'
import {
  loadAlbumPage,
  play,
  playAlbum,
  playOrPause,
  toggleAlbumOrder,
  toggleFavorite,
  useXimalaya,
  type ExtendedXimalayaAlbum,
} from './ximalaya'

function formatDuration(secs?: number): string {
  if (!secs || !Number.isFinite(secs) || secs <= 0) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function AlbumDetailView({ album }: { album: ExtendedXimalayaAlbum }) {
  const chinese = useLanguage().startsWith('zh')
  const t = (zh: string, en: string) => (chinese ? zh : en)

  const albumTracks = useXimalaya((s) => s.albumTracks)
  const albumPage = useXimalaya((s) => s.albumPage)
  const albumMaxPage = useXimalaya((s) => s.albumMaxPage)
  const albumTotalTracks = useXimalaya((s) => s.albumTotalTracks)
  const albumAsc = useXimalaya((s) => s.albumAsc)
  const loading = useXimalaya((s) => s.albumLoading)
  const error = useXimalaya((s) => s.albumError)
  const playback = useXimalaya((s) => s.playback)
  const playing = useXimalaya((s) => Boolean(s.playing))
  const favorites = useXimalaya((s) => s.favorites)
  const progress = useXimalaya((s) => s.progressMap[album.id] ?? null)

  const isFavorited = favorites.some((f) => f.id === album.id)
  const vod = playback && playback.owner !== 'radio' ? playback : null
  const isAlbumActive = Boolean(vod && vod.albumId === album.id)
  const totalCount = albumTotalTracks || album.episodeCount || albumTracks.length
  const pageCount = Math.min(albumMaxPage, 20)

  const handlePrimaryPlay = () => {
    if (isAlbumActive) {
      playOrPause()
      return
    }
    if (progress) {
      const idx = albumTracks.findIndex((tr) => tr.id === progress.trackId)
      if (idx >= 0) {
        play(albumTracks[idx], albumTracks, progress.position)
        return
      }
    }
    void playAlbum(album, 0)
  }

  return (
    <div className="xm-detail" aria-label={`${t('专辑详情', 'Album')}: ${album.title}`}>
      <section className="xm-collection-head">
        <div className="xm-collection-cover">
          <CoverImage src={album.artwork} alt={album.title} fallback={<AudioBookGlyph size={64} />} />
        </div>

        <div className="xm-collection-text">
          <div className="xm-eyebrow-row">
            {album.category && <span className="xm-eyebrow">{album.category}</span>}
            {album.isPaid && (
              <span className="xm-pill-tag vip">
                <CrownGlyph size={13} />
                VIP
              </span>
            )}
            {album.completed !== undefined && (
              <span className={`xm-pill-tag${album.completed ? ' done' : ''}`}>
                {album.completed ? t('已完结', 'Completed') : t('连载中', 'Ongoing')}
              </span>
            )}
          </div>

          <h1>{album.title}</h1>
          <p className="xm-collection-artist">{album.artist}</p>

          <div className="xm-collection-stats">
            {album.playCount && (
              <span>
                <HeadphonesGlyph size={16} />
                {album.playCount}
              </span>
            )}
            {totalCount > 0 && <span>{t(`共 ${totalCount} 集`, `${totalCount} episodes`)}</span>}
            {progress && (
              <span className="xm-resume-hint">
                {t(
                  `上次听到第 ${progress.episodeNumber ?? 1} 集`,
                  `Last played Ep. ${progress.episodeNumber ?? 1}`,
                )}
              </span>
            )}
          </div>

          {album.description && <p className="xm-collection-desc">{album.description}</p>}

          <div className="xm-actions">
            <button type="button" className="xm-pill key" onClick={handlePrimaryPlay}>
              {isAlbumActive && playing ? <PauseGlyph size={24} /> : <PlayGlyph size={24} />}
              <span>
                {isAlbumActive && playing
                  ? t('暂停播放', 'Pause')
                  : progress
                    ? t(`继续收听 · 第${progress.episodeNumber ?? 1}集`, `Resume Ep. ${progress.episodeNumber ?? 1}`)
                    : t('立即播放', 'Play All')}
              </span>
            </button>
            <button
              type="button"
              className={`xm-pill${isFavorited ? ' active' : ''}`}
              aria-pressed={isFavorited}
              onClick={() => toggleFavorite(album)}
            >
              <StarGlyph size={22} on={isFavorited} />
              <span>{isFavorited ? t('已收藏', 'Favorited') : t('收藏专辑', 'Favorite')}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="xm-episodes-section" aria-label={t('剧集列表', 'Episodes')}>
        <div className="xm-episodes-head">
          <div className="xm-episodes-title-group">
            <h2>{t('选集列表', 'Episodes')}</h2>
            {totalCount > 0 && <span className="xm-count">{t(`${totalCount} 集`, `${totalCount}`)}</span>}
          </div>

          <button
            type="button"
            className="xm-order-btn"
            onClick={toggleAlbumOrder}
            aria-label={albumAsc ? t('切换为倒序', 'Sort newest first') : t('切换为正序', 'Sort oldest first')}
          >
            <SortGlyph size={18} />
            <span>{albumAsc ? t('正序', 'Oldest') : t('倒序', 'Newest')}</span>
          </button>
        </div>

        {pageCount > 1 && (
          <div className="xm-range-strip xm-fade-scroller" role="group" aria-label={t('选集分段', 'Episode ranges')}>
            {Array.from({ length: pageCount }, (_, i) => {
              const p = i + 1
              const start = (p - 1) * 50 + 1
              const end = totalCount > 0 ? Math.min(totalCount, p * 50) : p * 50
              const active = p === albumPage
              return (
                <button
                  key={p}
                  type="button"
                  className={`xm-chip${active ? ' active' : ''}`}
                  aria-pressed={active}
                  onClick={(e) => {
                    e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
                    loadAlbumPage(p)
                  }}
                >
                  {start}–{end}
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <div className="xm-feedback" role="alert">
            <span>
              {t('剧集加载失败', 'Failed to load episodes')}: {error}
            </span>
            <button type="button" className="xm-pill" onClick={() => loadAlbumPage(albumPage)}>
              {t('重试', 'Retry')}
            </button>
          </div>
        )}

        {loading && albumTracks.length === 0 ? (
          <div className="xm-list-skeleton" aria-busy="true">
            {Array.from({ length: 6 }, (_, idx) => (
              <div key={idx} className="xm-row-skel" aria-hidden="true" />
            ))}
          </div>
        ) : albumTracks.length === 0 ? (
          <div className="xm-empty">
            <AudioBookGlyph size={44} />
            <p>{t('暂无剧集数据', 'No episodes available')}</p>
          </div>
        ) : (
          <div className={`xm-episode-list${loading ? ' refreshing' : ''}`}>
            {albumTracks.map((track, idx) => {
              const isCurrent = Boolean(vod && (vod.trackId ? vod.trackId === track.id : vod.title === track.title))
              const num = track.episodeNumber ?? (albumPage - 1) * 50 + idx + 1
              const dur = formatDuration(track.duration)
              const locked = Boolean(track.isPaid && track.isFree === false && track.isAuthorized === false)
              return (
                <button
                  key={`${track.id}-${idx}`}
                  type="button"
                  className={`xm-episode-row${isCurrent ? ' active' : ''}`}
                  onClick={() =>
                    isCurrent
                      ? playOrPause()
                      : play(track, albumTracks, progress?.trackId === track.id ? progress.position : 0)
                  }
                >
                  <span className="xm-ep-index">
                    {isCurrent ? <XmBars playing={playing} /> : String(num).padStart(2, '0')}
                  </span>

                  <span className="xm-ep-body">
                    <span className="xm-ep-title">{track.title}</span>
                    <span className="xm-ep-meta">
                      {dur && <span>{dur}</span>}
                      {track.playCount && <span>· {track.playCount}</span>}
                      {locked && <em className="xm-ep-badge vip">VIP</em>}
                      {track.isPaid && track.isFree && <em className="xm-ep-badge free">{t('试听', 'Sample')}</em>}
                    </span>
                  </span>

                  <span className="xm-ep-action" aria-hidden="true">
                    {isCurrent && playing ? <PauseGlyph size={24} /> : <PlayGlyph size={24} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
