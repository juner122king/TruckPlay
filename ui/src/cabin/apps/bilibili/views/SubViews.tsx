import { useEffect, useState } from 'react'
import type { BilibiliAnswers, BilibiliChannel, BilibiliVideo, BilibiliVideoPage } from '../../../../shared/host'
import { PersonGlyph, PlayGlyph } from '../../youtube/glyphs'
import { ask, formatClock, openChannel, openResults, play } from '../bilibili'
import { FeedSkeletons, FeedStatusNote, Thumbnail, VideoCard, VideoRow } from '../shared'
import { usePaginatedFeed } from '../usePaginatedFeed'

export function ResultsView({ query, filter }: { query: string; filter: 'videos' | 'users' }) {
  const [channels, setChannels] = useState<BilibiliChannel[]>([])

  const {
    items: videos,
    status,
    scrollRef,
    onScroll,
    retry,
  } = usePaginatedFeed<BilibiliVideo>({
    resetKey: `search-${query}-${filter}`,
    question: (page) => ({ ask: 'search', query, filter, page }),
    extract: (answer) => answer.videos ?? [],
    getKey: (video) => video.bvid,
    onAnswer: (answer, page) => {
      if (answer.channels) {
        setChannels((before) => {
          if (page === 1) return answer.channels!
          const seen = new Set(before.map((c) => c.mid))
          return [...before, ...answer.channels!.filter((c) => !seen.has(c.mid))]
        })
      } else if (page === 1) {
        setChannels([])
      }
    },
  })

  const filters: { filter: 'videos' | 'users'; label: string; icon: React.ReactNode }[] = [
    { filter: 'videos', label: '视频', icon: <PlayGlyph /> },
    { filter: 'users', label: 'UP主', icon: <PersonGlyph /> },
  ]

  return (
    <div className="bili-subview">
      <div className="bili-results-header">
        <div className="bili-segmented-control small" role="tablist" aria-label="搜索结果类型">
          {filters.map((chip) => (
            <button
              key={chip.filter}
              type="button"
              role="tab"
              aria-selected={filter === chip.filter}
              className={`bili-segmented-btn${filter === chip.filter ? ' active' : ''}`}
              onClick={() => filter !== chip.filter && openResults(query, chip.filter)}
            >
              <span className="bili-tab-icon">{chip.icon}</span>
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
        <span className="bili-filter-query">“{query}”</span>
      </div>

      <div
        ref={scrollRef}
        className={filter === 'users' ? 'bili-scroll bili-results-grid-wrap' : 'bili-scroll bili-results'}
        onScroll={onScroll}
      >
        {channels.length > 0 && (
          <div className={filter === 'users' ? 'bili-grid' : 'bili-results'}>
            {channels.map((ch) => (
              <button
                key={ch.mid}
                type="button"
                className="bili-channel-row"
                onClick={() => openChannel({ mid: ch.mid, name: ch.name, avatar: ch.avatar })}
              >
                {ch.avatar ? (
                  <img className="bili-avatar large" src={ch.avatar} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="bili-avatar large blank">{ch.name.slice(0, 1)}</span>
                )}
                <span className="bili-row-text">
                  <span className="bili-title">{ch.name}</span>
                  <span className="bili-sub">
                    {[ch.fans ? `${ch.fans}粉丝` : '', ch.videos ? `${ch.videos}视频` : ''].filter(Boolean).join(' · ')}
                  </span>
                  {ch.sign && <span className="bili-sign-small">{ch.sign}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {filter === 'videos' && (
          <div className="bili-results">
            {videos.map((video) => (
              <VideoRow key={video.bvid} video={video} />
            ))}
            {status === 'loading' && <FeedSkeletons layout="rows" count={videos.length > 0 ? 2 : 5} />}
          </div>
        )}

        {filter === 'users' && status === 'loading' && (
          <div className="bili-results">
            <FeedSkeletons layout="rows" count={channels.length > 0 ? 2 : 4} />
          </div>
        )}

        <FeedStatusNote
          status={status}
          empty={videos.length === 0 && channels.length === 0}
          emptyText={filter === 'users' ? '未找到相关 UP 主' : '暂无相关视频'}
          onRetry={retry}
        />
      </div>
    </div>
  )
}

export function ChannelView({ channel: known }: { channel: { mid: string; name: string; avatar?: string | null } }) {
  const [channel, setChannel] = useState<BilibiliChannel>({
    mid: known.mid,
    name: known.name || 'UP主',
    avatar: known.avatar,
  })
  const [subscribing, setSubscribing] = useState(false)

  const {
    items: videos,
    status,
    scrollRef,
    onScroll,
    retry,
  } = usePaginatedFeed<BilibiliVideo>({
    resetKey: `channel-${known.mid}`,
    question: (page) => ({ ask: 'channel', mid: known.mid, page }),
    extract: (answer) => answer.videos,
    getKey: (video) => video.bvid,
    onAnswer: (answer: BilibiliAnswers) => {
      if (answer.channel) {
        setChannel((prev) => ({
          ...prev,
          ...answer.channel,
          name: answer.channel?.name || prev.name,
        }))
      }
    },
  })

  const toggleSubscribe = async () => {
    if (subscribing || channel.subscribed === undefined || channel.subscribed === null) return
    setSubscribing(true)
    const next = !channel.subscribed
    setChannel((c) => ({ ...c, subscribed: next }))
    const res = await ask({ ask: 'subscribe', mid: known.mid, on: next })
    if (res.failed) {
      setChannel((c) => ({ ...c, subscribed: !next }))
    } else if (res.channel?.subscribed !== undefined && res.channel.subscribed !== null) {
      setChannel((c) => ({ ...c, subscribed: res.channel!.subscribed }))
    }
    setSubscribing(false)
  }

  return (
    <div ref={scrollRef} className="bili-scroll bili-channel-scroll" onScroll={onScroll}>
      <div className="bili-channel-head">
        {channel.banner && <img className="bili-banner" src={channel.banner} alt="" referrerPolicy="no-referrer" />}
        <div className="bili-channel-who">
          {channel.avatar ? (
            <img className="bili-avatar large" src={channel.avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="bili-avatar large blank">{channel.name.slice(0, 1)}</span>
          )}
          <div className="bili-channel-text">
            <h2>{channel.name}</h2>
            <span className="bili-sub">
              {[channel.fans ? `${channel.fans} 粉丝` : '', channel.videos ? `${channel.videos} 视频` : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
            {channel.sign && <p className="bili-sign">{channel.sign}</p>}
          </div>
          {channel.subscribed !== undefined && channel.subscribed !== null && (
            <button
              type="button"
              className={`bili-subscribe${channel.subscribed ? ' subscribed' : ''}`}
              aria-pressed={channel.subscribed}
              disabled={subscribing}
              onClick={toggleSubscribe}
            >
              {channel.subscribed ? '已关注' : '关注 UP 主'}
            </button>
          )}
        </div>
      </div>

      <div className="bili-grid">
        {videos.map((video) => (
          <VideoCard key={video.bvid} video={video} />
        ))}
        {status === 'loading' && <FeedSkeletons layout="grid" count={videos.length > 0 ? 2 : 6} />}
      </div>

      <FeedStatusNote status={status} empty={videos.length === 0} emptyText="该 UP 主暂无投稿视频" onRetry={retry} />
    </div>
  )
}

export function PlaylistView({ video }: { video: BilibiliVideo }) {
  const [pages, setPages] = useState<BilibiliVideoPage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    ask({ ask: 'playlist', bvid: video.bvid }).then((ans) => {
      if (!active) return
      if (ans.pages) setPages(ans.pages)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [video.bvid])

  const playPart = (page: number) => {
    play(video, true, page)
  }

  return (
    <div className="bili-scroll bili-playlist-page">
      <div className="bili-playlist-head">
        <Thumbnail video={video} />
        <div className="bili-playlist-text">
          <h2>{video.title}</h2>
          <span className="bili-sub">
            {video.author} · 共 {pages.length} P
          </span>
          <button type="button" className="bili-primary-btn" disabled={pages.length === 0} onClick={() => playPart(1)}>
            <PlayGlyph />
            <span>播放全部</span>
          </button>
        </div>
      </div>

      <div className="bili-playlist-list">
        {loading ? (
          <FeedSkeletons layout="rows" count={4} />
        ) : pages.length === 0 ? (
          <p className="bili-note">暂无分 P 选集</p>
        ) : (
          pages.map((p) => (
            <button key={p.page} type="button" className="bili-row bili-playlist-item" onClick={() => playPart(p.page)}>
              <span className="bili-page-badge">P{p.page}</span>
              <span className="bili-row-text">
                <span className="bili-title">{p.part}</span>
                {p.duration ? <span className="bili-sub">{formatClock(p.duration)}</span> : null}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
