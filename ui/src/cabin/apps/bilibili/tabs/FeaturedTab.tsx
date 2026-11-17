import { useState } from 'react'
import type { BilibiliVideo } from '../../../../shared/host'
import { clearWatched, useBilibili } from '../bilibili'
import { FireGlyph, SparkleGlyph } from '../glyphs'
import { FeedSkeletons, FeedStatusNote, SectionTitle, VideoCard } from '../shared'
import { usePaginatedFeed } from '../usePaginatedFeed'

const PRESET_CHIPS = ['车载音乐', '欧卡驾驶', '科技数码', '热门单曲', '影视解说', '二次元', '户外自驾']

type FeaturedMode = 'recommend' | 'popular'

/**
 * Consolidated "精选" tab combining personalized recommendations and popular rankings
 * inside a single scrollport so infinite pagination always triggers reliably.
 */
export function FeaturedTab({
  onSearch,
  signedIn,
  refreshKey,
}: {
  onSearch(query: string): void
  signedIn: boolean
  refreshKey: number
}) {
  const [mode, setMode] = useState<FeaturedMode>('recommend')
  const watched = useBilibili((store) => store.watched)

  const {
    items: videos,
    status,
    scrollRef,
    onScroll,
    retry,
  } = usePaginatedFeed<BilibiliVideo>({
    resetKey: `${mode}-${signedIn ? 'in' : 'out'}`,
    refreshKey,
    question: (page) =>
      mode === 'popular'
        ? { ask: 'popular', page, freshIdx: refreshKey }
        : signedIn
          ? { ask: 'feed', which: 'recommend', page, freshIdx: refreshKey }
          : { ask: 'popular', page, freshIdx: refreshKey },
    extract: (answer) => answer.videos,
    getKey: (video) => video.bvid,
  })

  return (
    <div ref={scrollRef} className="bili-scroll bili-featured" onScroll={onScroll}>
      <div className="bili-subbar">
        <div className="bili-mode-pills" role="group" aria-label="精选分类">
          <button
            type="button"
            className={`bili-subtab-btn${mode === 'recommend' ? ' active' : ''}`}
            aria-pressed={mode === 'recommend'}
            onClick={() => setMode('recommend')}
          >
            <span className="bili-subtab-icon">
              <SparkleGlyph />
            </span>
            <span>个性推荐</span>
          </button>
          <button
            type="button"
            className={`bili-subtab-btn${mode === 'popular' ? ' active' : ''}`}
            aria-pressed={mode === 'popular'}
            onClick={() => setMode('popular')}
          >
            <span className="bili-subtab-icon">
              <FireGlyph />
            </span>
            <span>热门榜</span>
          </button>
        </div>

        <span className="bili-subbar-divider" aria-hidden="true" />

        <div className="bili-topic-strip">
          {PRESET_CHIPS.map((chip) => (
            <button key={chip} type="button" className="bili-chip" onClick={() => onSearch(chip)}>
              {chip}
            </button>
          ))}
        </div>
      </div>

      {mode === 'recommend' && watched.length > 0 && (
        <section className="bili-section">
          <SectionTitle title="继续观看" onClear={clearWatched} />
          <div className="bili-shelf">
            {watched.slice(0, 10).map((w) => (
              <VideoCard
                key={w.video.bvid}
                video={w.video}
                progress={w.duration > 0 ? w.time / w.duration : 0}
                className="shelf"
              />
            ))}
          </div>
        </section>
      )}

      <div className="bili-grid">
        {videos.map((video, index) => (
          <VideoCard key={video.bvid} video={video} rank={mode === 'popular' && refreshKey === 0 ? index : undefined} />
        ))}
        {status === 'loading' && <FeedSkeletons layout="grid" count={videos.length > 0 ? 2 : 6} />}
      </div>

      <FeedStatusNote
        status={status}
        empty={videos.length === 0}
        emptyText={mode === 'popular' ? '暂无热门视频' : '暂无推荐视频'}
        onRetry={retry}
      />
    </div>
  )
}
