import { backToBrowse, play, playAlbum, toggleFavorite, useXimalaya, type ExtendedXimalayaAlbum } from './ximalaya'
import { CoverImage } from './CoverImage'
import { FireGlyph, HeadphoneGlyph, StarGlyph } from './glyphs'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function AlbumDetailView({ album }: { album: ExtendedXimalayaAlbum }) {
  const albumTracks = useXimalaya((s) => s.albumTracks)
  const loading = useXimalaya((s) => s.loading)
  const playback = useXimalaya((s) => s.playback)
  const playing = useXimalaya((s) => s.playing)
  const favorites = useXimalaya((s) => s.favorites)

  const isFavorited = favorites.some((f) => f.id === album.id)

  return (
    <div className="xima-detail-view" aria-label={`专辑详情：${album.title}`}>
      {/* Top Navigation */}
      <div className="xima-detail-nav">
        <button type="button" className="xima-back-btn" onClick={backToBrowse} aria-label="返回专辑列表">
          ‹ 返回浏览
        </button>
        <span className="xima-detail-category-badge">{album.category || '喜马拉雅有声精选'}</span>
      </div>

      {/* Album Hero Info Card */}
      <section className="xima-detail-hero">
        <div className="xima-detail-cover">
          <CoverImage src={album.artwork} alt={album.title} fallback="🎙️" />
          <span className="xima-cover-badge">{album.tag || '独家精品'}</span>
        </div>

        <div className="xima-detail-meta">
          <div className="xima-detail-title-row">
            <h1 className="xima-detail-title">{album.title}</h1>
          </div>

          <div className="xima-detail-author-row">
            <span className="xima-detail-author">🎙️ {album.artist}</span>
            {album.completed !== undefined && (
              <span className={`xima-status-pill ${album.completed ? 'completed' : 'ongoing'}`}>
                {album.completed ? '已完结' : '连载中'}
              </span>
            )}
          </div>

          <div className="xima-detail-stats">
            {album.playCount && (
              <span className="xima-stat-item">
                <FireGlyph /> {album.playCount} 次播放
              </span>
            )}
            <span className="xima-stat-item">
              <HeadphoneGlyph /> 共 {album.episodeCount || albumTracks.length || 60} 集
            </span>
          </div>

          {album.description && <p className="xima-detail-desc">{album.description}</p>}

          <div className="xima-detail-actions">
            <button type="button" className="xima-btn-primary" onClick={() => playAlbum(album, 0)}>
              ▶ 立即播放全部
            </button>
            <button
              type="button"
              className={`xima-btn-secondary ${isFavorited ? 'favorited' : ''}`}
              onClick={() => toggleFavorite(album)}
            >
              <StarGlyph filled={isFavorited} />
              <span>{isFavorited ? '已收藏' : '收藏专辑'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Episode / Tracks List */}
      <section className="xima-detail-tracks-section">
        <div className="xima-tracks-header">
          <h2 className="xima-tracks-title">章节节目单 ({albumTracks.length}集)</h2>
          <span className="xima-tracks-sub">点击即可立即播放并连续畅听</span>
        </div>

        {loading ? (
          <div className="xima-loading-box">
            <span className="xima-spinner" />
            <span>正在加载剧集列表...</span>
          </div>
        ) : albumTracks.length === 0 ? (
          <div className="xima-empty-tracks">暂无剧集数据</div>
        ) : (
          <div className="xima-episodes-list">
            {albumTracks.map((track, idx) => {
              const isCurrent = playback?.title === track.title
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`xima-episode-row ${isCurrent ? 'active' : ''}`}
                  onClick={() => play(track, albumTracks)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="xima-ep-num">
                    {isCurrent ? (
                      <div className="xima-wave-icon">
                        <span className={`bar b1 ${playing ? 'anim' : ''}`} />
                        <span className={`bar b2 ${playing ? 'anim' : ''}`} />
                        <span className={`bar b3 ${playing ? 'anim' : ''}`} />
                      </div>
                    ) : (
                      <span>{(track.episodeNumber || idx + 1).toString().padStart(2, '0')}</span>
                    )}
                  </div>

                  <div className="xima-ep-content">
                    <span className="xima-ep-title">{track.title}</span>
                    <span className="xima-ep-author">{track.artist}</span>
                  </div>

                  <div className="xima-ep-meta">
                    <span className="xima-ep-duration">{formatSeconds(track.duration || 1800)}</span>
                    <button type="button" className="xima-ep-play-btn" aria-label="播放此章节">
                      {isCurrent && playing ? '⏸' : '▶'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
