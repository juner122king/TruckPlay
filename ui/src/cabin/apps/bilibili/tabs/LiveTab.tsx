import { type ReactNode, useState } from 'react'
import type { BilibiliLiveRoom } from '../../../../shared/host'
import { PersonGlyph } from '../../youtube/glyphs'
import { play, sendSignIn } from '../bilibili'
import {
  CarGlyph,
  CompassGlyph,
  GamepadGlyph,
  LiveGlyph,
  MicGlyph,
  PhoneGlyph,
  SmileGlyph,
  SparkleGlyph,
} from '../glyphs'
import { BiliImage, FeedSkeletons, FeedStatusNote } from '../shared'
import { usePaginatedFeed } from '../usePaginatedFeed'

interface LiveAreaItem {
  label: string
  parentAreaId: number
  icon: ReactNode
}

const LIVE_AREAS: LiveAreaItem[] = [
  { label: '全部精选', parentAreaId: 0, icon: <SparkleGlyph /> },
  { label: '单机·驾驶', parentAreaId: 6, icon: <CarGlyph /> },
  { label: '网游竞技', parentAreaId: 2, icon: <GamepadGlyph /> },
  { label: '手机游戏', parentAreaId: 3, icon: <PhoneGlyph /> },
  { label: '虚拟主播', parentAreaId: 9, icon: <LiveGlyph /> },
  { label: '娱乐日常', parentAreaId: 1, icon: <SmileGlyph /> },
  { label: '语音电台', parentAreaId: 5, icon: <MicGlyph /> },
]

function playLive(room: BilibiliLiveRoom) {
  play(
    {
      bvid: `live:${room.roomId}`,
      roomId: room.roomId,
      isLive: true,
      title: room.title,
      author: room.uname,
      artwork: room.cover,
      mid: String(room.uid),
    },
    true,
  )
}

export function LiveTab({ signedIn, refreshKey }: { signedIn: boolean; refreshKey: number }) {
  const [selectedArea, setSelectedArea] = useState(0)
  const [followingRooms, setFollowingRooms] = useState<BilibiliLiveRoom[]>([])

  const {
    items: liveRooms,
    status,
    scrollRef,
    onScroll,
    retry,
  } = usePaginatedFeed<BilibiliLiveRoom>({
    resetKey: `live-${selectedArea}`,
    refreshKey,
    question: (page) => ({ ask: 'live', parentAreaId: selectedArea, page }),
    extract: (answer) => answer.liveRooms,
    getKey: (room) => room.roomId,
    onAnswer: (answer, page) => {
      if (page === 1 && answer.followingLiveRooms) {
        setFollowingRooms(answer.followingLiveRooms)
      }
    },
  })

  return (
    <div ref={scrollRef} className="bili-scroll bili-live-scroll" onScroll={onScroll}>
      {signedIn ? (
        followingRooms.length > 0 ? (
          <section className="bili-live-section">
            <div className="bili-live-header">
              <div className="bili-live-title">
                <span className="bili-live-pulse-dot" aria-hidden="true" />
                <span>关注的 UP 主正在直播</span>
                <span className="bili-live-count-badge">{followingRooms.length}</span>
              </div>
            </div>
            <div className="bili-following-live-shelf">
              {followingRooms.map((room) => (
                <button
                  key={room.roomId}
                  type="button"
                  className="bili-following-live-card"
                  onClick={() => playLive(room)}
                >
                  <div className="bili-following-thumb-wrap">
                    <BiliImage
                      src={room.cover}
                      loading="lazy"
                      fallback={
                        <span className="bili-thumb-blank" aria-hidden="true">
                          <LiveGlyph />
                        </span>
                      }
                    />
                    <span className="bili-live-pill-badge">
                      <span className="bili-live-pulse-dot small" aria-hidden="true" />
                      直播中
                    </span>
                    {room.online && <span className="bili-live-bottom-heat">{room.online} 人气</span>}
                  </div>
                  <div className="bili-following-meta">
                    <div className="bili-following-host-row">
                      <div className="bili-following-avatar-wrap">
                        <BiliImage
                          className="bili-avatar"
                          src={room.avatar}
                          fallback={<span className="bili-avatar blank">{room.uname.slice(0, 1)}</span>}
                        />
                        <span className="bili-live-mini-badge" aria-hidden="true" />
                      </div>
                      <span className="bili-following-uname">{room.uname}</span>
                    </div>
                    <span className="bili-title">{room.title}</span>
                    {room.areaName && <span className="bili-sub">{room.areaName}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="bili-live-quiet-card">
            <span className="bili-quiet-icon" aria-hidden="true">
              <LiveGlyph />
            </span>
            <div className="bili-quiet-text">
              <span className="bili-quiet-title">关注的 UP 主当前暂无直播</span>
              <span className="bili-quiet-sub">为你推荐热门与分类直播频道</span>
            </div>
          </div>
        )
      ) : (
        <div className="bili-live-signin-banner">
          <div className="bili-signin-banner-text">
            <span className="bili-live-pulse-dot" aria-hidden="true" />
            <span>登录哔哩哔哩账号，即时查看关注的 UP 主开播动态</span>
          </div>
          <button type="button" className="bili-live-login-btn" onClick={sendSignIn}>
            <PersonGlyph />
            <span>扫码登录</span>
          </button>
        </div>
      )}

      <section className="bili-live-section">
        <div className="bili-live-header">
          <div className="bili-live-title">
            <CompassGlyph />
            <span>分类直播精选</span>
          </div>
        </div>

        <div className="bili-subtabs-wrap">
          <div className="bili-subtabs-track" role="tablist" aria-label="直播分区">
            {LIVE_AREAS.map((area) => (
              <button
                key={area.parentAreaId}
                type="button"
                role="tab"
                aria-selected={selectedArea === area.parentAreaId}
                className={`bili-subtab-btn${selectedArea === area.parentAreaId ? ' active' : ''}`}
                onClick={() => setSelectedArea(area.parentAreaId)}
              >
                <span className="bili-subtab-icon">{area.icon}</span>
                <span>{area.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bili-grid">
          {liveRooms.map((room) => (
            <button key={room.roomId} type="button" className="bili-card bili-live-card" onClick={() => playLive(room)}>
              <div className="bili-live-thumb-wrap">
                <BiliImage
                  src={room.cover}
                  loading="lazy"
                  fallback={
                    <span className="bili-thumb-blank" aria-hidden="true">
                      <LiveGlyph />
                    </span>
                  }
                />
                <span className="bili-live-pill-badge">
                  <span className="bili-live-pulse-dot small" aria-hidden="true" />
                  直播中
                </span>
                {room.areaName && <span className="bili-live-area-pill">{room.areaName}</span>}
                <span className="bili-live-bottom-heat">
                  <span>{room.online ? `${room.online} 人气` : '在线'}</span>
                  <span className="bili-live-host-name">{room.uname}</span>
                </span>
              </div>
              <div className="bili-meta">
                <span className="bili-title">{room.title}</span>
                <span className="bili-sub">
                  {room.uname}
                  {room.areaName ? ` · ${room.areaName}` : ''}
                </span>
              </div>
            </button>
          ))}
          {status === 'loading' && <FeedSkeletons layout="grid" count={liveRooms.length > 0 ? 2 : 6} />}
        </div>

        <FeedStatusNote
          status={status}
          empty={liveRooms.length === 0}
          emptyText="当前分类暂无直播"
          failedText="加载直播失败"
          onRetry={retry}
        />
      </section>
    </div>
  )
}
