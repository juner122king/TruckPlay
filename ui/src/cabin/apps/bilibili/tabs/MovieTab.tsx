import { type ReactNode, useState } from 'react'
import type { BilibiliMovieItem } from '../../../../shared/host'
import { PlayGlyph } from '../../youtube/glyphs'
import { play } from '../bilibili'
import {
  ClockGlyph,
  DocGlyph,
  FilmGlyph,
  FireGlyph,
  SmileGlyph,
  SortGlyph,
  SparkleGlyph,
  StarGlyph,
  TvGlyph,
} from '../glyphs'
import { FeedSkeletons, FeedStatusNote, BiliImage } from '../shared'
import { usePaginatedFeed } from '../usePaginatedFeed'

interface MovieCategory {
  seasonType: number
  label: string
  icon: ReactNode
}

const MOVIE_CATEGORIES: MovieCategory[] = [
  { seasonType: 2, label: '电影', icon: <FilmGlyph /> },
  { seasonType: 5, label: '电视剧', icon: <TvGlyph /> },
  { seasonType: 3, label: '纪录片', icon: <DocGlyph /> },
  { seasonType: 7, label: '综艺', icon: <SmileGlyph /> },
  { seasonType: 1, label: '番剧', icon: <SparkleGlyph /> },
]

interface MovieSortOption {
  order: number
  label: string
  icon: ReactNode
}

const MOVIE_SORT_OPTIONS: MovieSortOption[] = [
  { order: 3, label: '最热追剧', icon: <FireGlyph /> },
  { order: 2, label: '最高播放', icon: <PlayGlyph /> },
  { order: 4, label: '高分必看', icon: <StarGlyph /> },
  { order: 0, label: '最新上映', icon: <ClockGlyph /> },
]

function badgeClass(badge?: string) {
  if (!badge) return ''
  if (badge.includes('会员')) return 'vip'
  if (badge.includes('独家') || badge.includes('独播')) return 'exclusive'
  if (badge.includes('出品')) return 'original'
  if (badge.includes('限免') || badge.includes('限时')) return 'limited'
  return 'free'
}

function playMovie(movie: BilibiliMovieItem) {
  play(
    {
      bvid: movie.epId ? `ep${movie.epId}` : `ss${movie.seasonId}`,
      seasonId: movie.seasonId,
      epId: movie.epId,
      title: movie.title,
      author: '哔哩哔哩影视',
      artwork: movie.cover,
    },
    true,
  )
}

export function MovieTab({ refreshKey }: { refreshKey: number }) {
  const [selectedType, setSelectedType] = useState(2)
  const [selectedOrder, setSelectedOrder] = useState(3)

  const {
    items: movies,
    status,
    scrollRef,
    onScroll,
    retry,
  } = usePaginatedFeed<BilibiliMovieItem>({
    resetKey: `movie-${selectedType}-${selectedOrder}`,
    refreshKey,
    question: (page) => ({ ask: 'movie', seasonType: selectedType, order: selectedOrder, page }),
    extract: (answer) => answer.movies,
    getKey: (movie) => movie.seasonId,
  })

  return (
    <div ref={scrollRef} className="bili-scroll bili-movie-scroll" onScroll={onScroll}>
      <div className="bili-movie-controls">
        <div className="bili-subtabs-wrap">
          <div className="bili-subtabs-track" role="tablist" aria-label="影视频道">
            {MOVIE_CATEGORIES.map((cat) => (
              <button
                key={cat.seasonType}
                type="button"
                role="tab"
                aria-selected={selectedType === cat.seasonType}
                className={`bili-subtab-btn${selectedType === cat.seasonType ? ' active' : ''}`}
                onClick={() => setSelectedType(cat.seasonType)}
              >
                <span className="bili-subtab-icon">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bili-movie-sort-bar" role="group" aria-label="排序方式">
          <span className="bili-movie-sort-label" aria-hidden="true">
            <SortGlyph />
            <span>排序</span>
          </span>
          <div className="bili-movie-sort-chips">
            {MOVIE_SORT_OPTIONS.map((opt) => (
              <button
                key={opt.order}
                type="button"
                aria-pressed={selectedOrder === opt.order}
                className={`bili-sort-btn${selectedOrder === opt.order ? ' active' : ''}`}
                onClick={() => setSelectedOrder(opt.order)}
              >
                <span className="bili-sort-icon">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bili-movie-grid">
        {movies.map((movie) => (
          <button key={movie.seasonId} type="button" className="bili-movie-card" onClick={() => playMovie(movie)}>
            <div className="bili-movie-poster-wrap">
              <BiliImage
                src={movie.cover}
                loading="lazy"
                fallback={
                  <span className="bili-thumb-blank" aria-hidden="true">
                    <FilmGlyph />
                  </span>
                }
              />
              {movie.badge && <span className={`bili-movie-badge ${badgeClass(movie.badge)}`}>{movie.badge}</span>}
              {movie.score && (
                <span className="bili-movie-score-badge">
                  <StarGlyph />
                  <span>{movie.score}</span>
                </span>
              )}
              {movie.indexShow && <span className="bili-movie-status-pill">{movie.indexShow}</span>}
            </div>
            <div className="bili-movie-meta">
              <span className="bili-movie-title">{movie.title}</span>
              <span className="bili-movie-sub">{movie.subTitle || movie.order || '哔哩哔哩影视'}</span>
            </div>
          </button>
        ))}
        {status === 'loading' && <FeedSkeletons layout="posters" count={movies.length > 0 ? 3 : 6} />}
      </div>

      <FeedStatusNote
        status={status}
        empty={movies.length === 0}
        emptyText="暂无相关影视内容"
        failedText="加载影视失败"
        onRetry={retry}
      />
    </div>
  )
}
