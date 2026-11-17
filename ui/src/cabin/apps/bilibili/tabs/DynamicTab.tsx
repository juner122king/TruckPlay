import type { BilibiliDynamicItem } from '../../../../shared/host'
import { PersonGlyph } from '../../youtube/glyphs'
import { openChannel, play, sendSignIn } from '../bilibili'
import { SignalGlyph } from '../glyphs'
import { BiliImage, FeedSkeletons, FeedStatusNote, Thumbnail } from '../shared'
import { usePaginatedFeed } from '../usePaginatedFeed'

export function DynamicTab({ signedIn, refreshKey }: { signedIn: boolean; refreshKey: number }) {
  if (!signedIn) {
    return (
      <div className="bili-scroll bili-signin-guide-wrap">
        <div className="bili-signin-guide-card">
          <div className="bili-signin-guide-icon" aria-hidden="true">
            <SignalGlyph />
          </div>
          <div className="bili-signin-guide-text">
            <h3>登录哔哩哔哩查看动态</h3>
            <p>登录后即可同步关注 UP 主的最新视频投稿、图文动态与精彩转发</p>
          </div>
          <button type="button" className="bili-primary-btn" onClick={sendSignIn}>
            <PersonGlyph />
            <span>扫码登录</span>
          </button>
        </div>
      </div>
    )
  }

  return <DynamicTimeline refreshKey={refreshKey} />
}

function DynamicTimeline({ refreshKey }: { refreshKey: number }) {
  const { items, status, scrollRef, onScroll, retry } = usePaginatedFeed<BilibiliDynamicItem>({
    resetKey: 'dynamic',
    refreshKey,
    question: (page) => ({ ask: 'feed', which: 'dynamic', page }),
    extract: (answer) => answer.dynamics,
    getKey: (item) => item.id,
  })

  return (
    <div ref={scrollRef} className="bili-scroll bili-timeline-container" onScroll={onScroll}>
      <div className="bili-timeline">
        {items.map((item) => (
          <article key={item.id} className="bili-timeline-item">
            <div className="bili-timeline-rail" aria-hidden="true">
              <span className="bili-timeline-dot" />
              <span className="bili-timeline-line" />
            </div>
            <div className="bili-timeline-card">
              <button
                type="button"
                className="bili-timeline-author-row"
                onClick={() =>
                  openChannel({
                    mid: item.author.mid,
                    name: item.author.name,
                    avatar: item.author.avatar,
                  })
                }
              >
                <BiliImage
                  className="bili-avatar"
                  src={item.author.avatar}
                  fallback={<span className="bili-avatar blank">{item.author.name.slice(0, 1)}</span>}
                />
                <span className="bili-timeline-author-meta">
                  <span className="bili-timeline-author-name">{item.author.name}</span>
                  <span className="bili-timeline-pub-time">
                    {item.author.pubTime}
                    {item.author.pubAction ? ` · ${item.author.pubAction}` : ''}
                  </span>
                </span>
              </button>

              {item.desc && <p className="bili-timeline-text">{item.desc}</p>}

              {item.origAuthor && (
                <div className="bili-timeline-orig-box">
                  <span className="bili-timeline-orig-author">@{item.origAuthor}: </span>
                  <span className="bili-timeline-orig-desc">{item.origDesc}</span>
                </div>
              )}

              {item.video && (
                <button type="button" className="bili-timeline-video" onClick={() => play(item.video!, true)}>
                  <Thumbnail video={item.video} />
                  <span className="bili-timeline-video-meta">
                    <span className="bili-title">{item.video.title}</span>
                    <span className="bili-sub">
                      {[item.video.author, item.video.playCount ? `${item.video.playCount}播放` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              )}
            </div>
          </article>
        ))}

        {status === 'loading' && <FeedSkeletons layout="rows" count={items.length > 0 ? 2 : 4} />}
      </div>

      <FeedStatusNote
        status={status}
        empty={items.length === 0}
        emptyText="暂无关注 UP 主动态"
        failedText="加载动态失败"
        onRetry={retry}
      />
    </div>
  )
}
