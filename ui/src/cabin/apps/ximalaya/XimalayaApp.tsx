import { useEffect, useState } from 'react'
import { TextField } from '../../keyboard/TextField'
import { SearchGlyph } from '../../keyboard/glyphs'
import { useKeyboard } from '../../keyboard/store'
import {
  clearHistory,
  play,
  playAlbum,
  playOrPause,
  search,
  selectAlbum,
  selectTab,
  sendSignIn,
  sendSignOut,
  sendStart,
  setNowPlaying,
  skip,
  useXimalaya,
} from './ximalaya'
import { AlbumDetailView } from './AlbumDetailView'
import { CoverImage } from './CoverImage'
import { NowPlaying } from './NowPlaying'
import { FireGlyph } from './glyphs'
import './ximalaya.css'

const HOT_SEARCH_TAGS = [
  '郭德纲',
  '三体',
  '明朝那些事儿',
  '单田芳',
  '鬼吹灯',
  '凡人修仙传',
  '盗墓笔记',
  '深夜电台',
  '易中天',
  '岳云鹏',
]

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function XimalayaApp() {
  const {
    signedIn,
    signingIn,
    playing,
    tab,
    loading,
    tracks,
    albums,
    selectedAlbum,
    playback,
    nowPlaying,
    searchQuery,
    searchResults,
    searching,
    favorites,
    history,
  } = useXimalaya()

  const [queryInput, setQueryInput] = useState('')
  const [mySubTab, setMySubTab] = useState<'favorites' | 'history'>('favorites')

  useEffect(() => {
    sendStart()
  }, [])

  // If user entered full-screen immersive automotive player
  if (nowPlaying && playback && playback.owner !== 'radio') {
    return (
      <section className="app-panel ximalaya-app" aria-label="喜马拉雅车载播放中">
        <NowPlaying />
      </section>
    )
  }

  const handleSearchSubmit = () => {
    const q = queryInput.trim()
    if (q) {
      useKeyboard.getState().detach('ximalaya-search')
      search(q)
    }
  }

  const handleTagClick = (tag: string) => {
    setQueryInput(tag)
    search(tag)
  }

  return (
    <section className="app-panel ximalaya-app" aria-label="喜马拉雅FM车载版">
      {/* Top Header Bar */}
      <header className="xima-header">
        {/* Brand Logo */}
        <div className="xima-brand-box" onClick={() => selectTab('featured')} role="button" tabIndex={0}>
          <span className="xima-badge">FM</span>
          <div className="xima-brand-names">
            <h1 className="xima-brand-title">喜马拉雅</h1>
            <span className="xima-brand-subtitle">车载有声空间</span>
          </div>
        </div>

        {/* Category Tabs */}
        <nav className="xima-nav-tabs" aria-label="喜马拉雅导航栏">
          <button
            type="button"
            className={`xima-tab-btn ${tab === 'featured' ? 'active' : ''}`}
            onClick={() => selectTab('featured')}
          >
            精选
          </button>
          <button
            type="button"
            className={`xima-tab-btn ${tab === 'xiangsheng' ? 'active' : ''}`}
            onClick={() => selectTab('xiangsheng')}
          >
            相声评书
          </button>
          <button
            type="button"
            className={`xima-tab-btn ${tab === 'story' ? 'active' : ''}`}
            onClick={() => selectTab('story')}
          >
            有声小说
          </button>
          <button
            type="button"
            className={`xima-tab-btn ${tab === 'radio' ? 'active' : ''}`}
            onClick={() => selectTab('radio')}
          >
            车载电台
          </button>
          <button
            type="button"
            className={`xima-tab-btn ${tab === 'search' ? 'active' : ''}`}
            onClick={() => selectTab('search')}
          >
            搜索 🔍
          </button>
          <button
            type="button"
            className={`xima-tab-btn ${tab === 'my' ? 'active' : ''}`}
            onClick={() => selectTab('my')}
          >
            我的
          </button>
        </nav>

        {/* Account / VIP Status */}
        <div className="xima-account-box">
          {signingIn ? (
            <div className="xima-status-signing-in">
              <span className="xima-spinner" />
              <span>桌面扫码中...</span>
            </div>
          ) : signedIn ? (
            <div className="xima-signed-in">
              <span className="xima-vip-pill" title="已激活车载VIP专享特权">
                👑 喜马VIP
              </span>
              <button type="button" className="xima-signout-btn" onClick={sendSignOut} title="退出喜马拉雅登录">
                退出
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="xima-signin-btn"
              onClick={sendSignIn}
              title="在电脑屏幕上打开二维码进行手机扫码登录"
            >
              桌面扫码登录
            </button>
          )}
        </div>
      </header>

      {/* QR Banner when signing in */}
      {signingIn && (
        <div className="xima-qr-banner">
          <div className="xima-qr-icon">📱</div>
          <div className="xima-qr-text">
            <strong>喜马拉雅桌面扫码窗口已启动</strong>
            <p>请切到电脑屏幕使用手机喜马拉雅客户端扫码，登录后畅享海量VIP高品质有声大作。</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="xima-main-content">
        {/* If user clicked an album, show the Album Detail Page */}
        {selectedAlbum ? (
          <AlbumDetailView album={selectedAlbum} />
        ) : tab === 'featured' ? (
          /* ================= FEATURED TAB ================= */
          <div className="xima-featured-view">
            {/* Hero Panoramic Banner Card */}
            {albums[0] && (
              <section className="xima-hero-banner">
                <div className="xima-hero-bg" style={{ backgroundImage: `url(${albums[0].artwork})` }} />
                <div className="xima-hero-content">
                  <div className="xima-hero-badge">今日主打 · 重磅力荐</div>
                  <h2 className="xima-hero-title">{albums[0].title}</h2>
                  <p className="xima-hero-desc">{albums[0].description}</p>
                  <div className="xima-hero-actions">
                    <button type="button" className="xima-hero-play-btn" onClick={() => playAlbum(albums[0], 0)}>
                      ▶ 立即收听全部
                    </button>
                    <button type="button" className="xima-hero-detail-btn" onClick={() => selectAlbum(albums[0])}>
                      查看专辑
                    </button>
                  </div>
                </div>
                <div className="xima-hero-art">
                  <CoverImage src={albums[0].artwork} alt={albums[0].title} fallback="🎙️" />
                </div>
              </section>
            )}

            {/* Popular Albums Grid */}
            <section className="xima-section">
              <div className="xima-section-header">
                <h2 className="xima-section-title">🔥 热门有声专辑</h2>
                <span className="xima-section-sub">千万听众精选 · 长途好伴侣</span>
              </div>

              <div className="xima-albums-grid">
                {albums.slice(1).map((alb) => (
                  <div
                    key={alb.id}
                    className="xima-album-card"
                    onClick={() => selectAlbum(alb)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="xima-card-art">
                      <CoverImage src={alb.artwork} alt={alb.title} fallback="🎙️" />
                      {alb.tag && <span className="xima-card-tag">{alb.tag}</span>}
                      {alb.playCount && (
                        <span className="xima-card-plays">
                          <FireGlyph /> {alb.playCount}
                        </span>
                      )}
                    </div>
                    <div className="xima-card-body">
                      <h3 className="xima-card-title">{alb.title}</h3>
                      <div className="xima-card-author">{alb.artist}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Trending Single Tracks List */}
            {tracks.length > 0 && (
              <section className="xima-section">
                <div className="xima-section-header">
                  <h2 className="xima-section-title">⚡ 今日热播声音片段</h2>
                </div>
                <div className="xima-tracks-grid">
                  {tracks.map((track) => (
                    <div
                      key={track.id}
                      className="xima-track-chip"
                      onClick={() => play(track, tracks)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="xima-chip-thumb">
                        <CoverImage src={track.artwork} alt={track.title} fallback="🎙️" />
                      </div>
                      <div className="xima-chip-info">
                        <span className="xima-chip-title">{track.title}</span>
                        <span className="xima-chip-sub">
                          {track.artist} · {formatSeconds(track.duration || 1800)}
                        </span>
                      </div>
                      <button type="button" className="xima-chip-play" aria-label="播放">
                        ▶
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : tab === 'xiangsheng' || tab === 'story' || tab === 'radio' ? (
          /* ================= CATEGORY TABS ================= */
          <div className="xima-category-view">
            <div className="xima-section-header">
              <h2 className="xima-section-title">
                {tab === 'xiangsheng'
                  ? '🎭 相声评书专区 · 长途解乏必备'
                  : tab === 'story'
                    ? '📚 经典有声小说 · 史诗巨作畅听'
                    : '📻 车载公路电台 · 深夜暖心相伴'}
              </h2>
              <span className="xima-section-sub">
                {tab === 'xiangsheng'
                  ? '德云社对口相声 / 单田芳袁阔成经典评书'
                  : tab === 'story'
                    ? '科幻巨著 / 悬疑探险 / 经典修仙 / 多人有声剧'
                    : '司机树洞 / 百家讲坛 / 动感DJ / 治愈解乏'}
              </span>
            </div>

            {loading ? (
              <div className="xima-loading-box">
                <span className="xima-spinner" />
                <span>正在加载中...</span>
              </div>
            ) : (
              <div className="xima-albums-grid large-grid">
                {albums.map((alb) => (
                  <div
                    key={alb.id}
                    className="xima-album-card"
                    onClick={() => selectAlbum(alb)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="xima-card-art">
                      <CoverImage src={alb.artwork} alt={alb.title} fallback="🎙️" />
                      {alb.tag && <span className="xima-card-tag">{alb.tag}</span>}
                      {alb.playCount && (
                        <span className="xima-card-plays">
                          <FireGlyph /> {alb.playCount}
                        </span>
                      )}
                    </div>
                    <div className="xima-card-body">
                      <h3 className="xima-card-title">{alb.title}</h3>
                      <div className="xima-card-author">{alb.artist}</div>
                      {alb.description && <p className="xima-card-snippet">{alb.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'search' ? (
          /* ================= SEARCH TAB ================= */
          <div className="xima-search-view">
            {/* Search Input Bar */}
            <div className="xima-search-bar-wrap">
              <TextField
                id="ximalaya-search"
                value={queryInput}
                onChange={setQueryInput}
                onSubmit={handleSearchSubmit}
                returnKind="search"
                hint="搜索相声、评书、小说、主播..."
                label="喜马拉雅搜索"
                icon={<SearchGlyph />}
              />
              <button type="button" className="xima-search-submit-btn" onClick={handleSearchSubmit}>
                搜索
              </button>
            </div>

            {/* Hot Search Tags */}
            <div className="xima-hot-tags-row">
              <span className="xima-hot-label">🔥 热门搜索：</span>
              <div className="xima-tag-chips">
                {HOT_SEARCH_TAGS.map((tag) => (
                  <button key={tag} type="button" className="xima-tag-chip" onClick={() => handleTagClick(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Results */}
            <div className="xima-search-results">
              {searching ? (
                <div className="xima-loading-box">
                  <span className="xima-spinner" />
                  <span>正在搜索 "{searchQuery || queryInput}" ...</span>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="xima-results-list">
                  <div className="xima-results-count">
                    找到关于 "{searchQuery}" 的 {searchResults.length} 条声音结果：
                  </div>
                  {searchResults.map((track) => (
                    <div
                      key={track.id}
                      className="xima-search-result-row"
                      onClick={() => play(track, searchResults)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="xima-result-thumb">
                        <CoverImage src={track.artwork} alt={track.title} fallback="🎙️" />
                      </div>
                      <div className="xima-result-body">
                        <span className="xima-result-title">{track.title}</span>
                        <span className="xima-result-sub">
                          {track.artist} {track.album && `· 专辑《${track.album}》`} ·{' '}
                          {formatSeconds(track.duration || 1800)}
                        </span>
                      </div>
                      <button type="button" className="xima-result-play-btn" aria-label="播放">
                        ▶ 播放
                      </button>
                    </div>
                  ))}
                </div>
              ) : searchQuery ? (
                <div className="xima-search-empty">未找到与 "{searchQuery}" 相关的内容，请尝试其他关键词</div>
              ) : (
                <div className="xima-search-idle">输入关键词或点击热门标签即可搜索喜马拉雅全网优质有声节目</div>
              )}
            </div>
          </div>
        ) : (
          /* ================= MY LIBRARY TAB ================= */
          <div className="xima-my-view">
            <div className="xima-my-subnav">
              <button
                type="button"
                className={`xima-subnav-btn ${mySubTab === 'favorites' ? 'active' : ''}`}
                onClick={() => setMySubTab('favorites')}
              >
                ⭐ 我的收藏专辑 ({favorites.length})
              </button>
              <button
                type="button"
                className={`xima-subnav-btn ${mySubTab === 'history' ? 'active' : ''}`}
                onClick={() => setMySubTab('history')}
              >
                🕒 最近收听历史 ({history.length})
              </button>
            </div>

            {mySubTab === 'favorites' ? (
              <div className="xima-my-content">
                {favorites.length === 0 ? (
                  <div className="xima-empty-state">
                    <span className="xima-empty-icon">⭐</span>
                    <p>暂无收藏专辑，在浏览时点击“收藏”即可快速添加</p>
                  </div>
                ) : (
                  <div className="xima-albums-grid">
                    {favorites.map((alb) => (
                      <div
                        key={alb.id}
                        className="xima-album-card"
                        onClick={() => selectAlbum(alb)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="xima-card-art">
                          <CoverImage src={alb.artwork} alt={alb.title} fallback="🎙️" />
                          {alb.tag && <span className="xima-card-tag">{alb.tag}</span>}
                        </div>
                        <div className="xima-card-body">
                          <h3 className="xima-card-title">{alb.title}</h3>
                          <div className="xima-card-author">{alb.artist}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="xima-my-content">
                <div className="xima-history-header">
                  <span className="xima-history-tip">记录您在车内收听的声音足迹</span>
                  {history.length > 0 && (
                    <button type="button" className="xima-clear-history-btn" onClick={clearHistory}>
                      清空历史
                    </button>
                  )}
                </div>

                {history.length === 0 ? (
                  <div className="xima-empty-state">
                    <span className="xima-empty-icon">🕒</span>
                    <p>暂无收听历史，播放声音后将自动记录</p>
                  </div>
                ) : (
                  <div className="xima-history-list">
                    {history.map((track) => (
                      <div
                        key={track.id}
                        className="xima-search-result-row"
                        onClick={() => play(track, history)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="xima-result-thumb">
                          <CoverImage src={track.artwork} alt={track.title} fallback="🎙️" />
                        </div>
                        <div className="xima-result-body">
                          <span className="xima-result-title">{track.title}</span>
                          <span className="xima-result-sub">
                            {track.artist} · {formatSeconds(track.duration || 1800)}
                          </span>
                        </div>
                        <button type="button" className="xima-result-play-btn" aria-label="继续播放">
                          ▶ 继续播放
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Mini Player Bar at Bottom */}
      {playback && playback.owner !== 'radio' && (
        <aside className="xima-mini-bar" onClick={() => setNowPlaying(true)} role="region" aria-label="车载悬浮播放器">
          <div className="xima-mini-thumb">
            <CoverImage src={playback.artwork} alt={playback.title} fallback="🎙️" />
          </div>

          <div className="xima-mini-meta">
            <div className="xima-mini-title-wrap">
              <span className="xima-mini-title">{playback.title}</span>
              <span className="xima-mini-tag">播放中</span>
            </div>
            <div className="xima-mini-sub">{playback.artist}</div>
          </div>

          {/* Mini Soundwave Animation */}
          <div className={`xima-mini-wave ${playing ? 'active' : ''}`}>
            <span className="wave-bar w1" />
            <span className="wave-bar w2" />
            <span className="wave-bar w3" />
          </div>

          <div className="xima-mini-controls" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="xima-mini-btn xima-mini-play"
              onClick={playOrPause}
              aria-label={playing ? '暂停' : '播放'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <button type="button" className="xima-mini-btn xima-mini-skip" onClick={() => skip(1)} aria-label="下一集">
              ⏭
            </button>
          </div>
        </aside>
      )}
    </section>
  )
}
