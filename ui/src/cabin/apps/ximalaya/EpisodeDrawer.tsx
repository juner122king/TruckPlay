import { play, setQueueOpen, useXimalaya } from './ximalaya'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function EpisodeDrawer() {
  const queueOpen = useXimalaya((s) => s.queueOpen)
  const queue = useXimalaya((s) => s.queue)
  const queueIndex = useXimalaya((s) => s.queueIndex)
  const playing = useXimalaya((s) => s.playing)
  const selectedAlbum = useXimalaya((s) => s.selectedAlbum)

  if (!queueOpen) return null

  return (
    <div className="xima-drawer-backdrop" onClick={() => setQueueOpen(false)}>
      <aside className="xima-drawer-panel" onClick={(e) => e.stopPropagation()} aria-label="剧集章节选集">
        <header className="xima-drawer-header">
          <div className="xima-drawer-title-box">
            <span className="xima-drawer-tag">章节选集</span>
            <h3 className="xima-drawer-title">{selectedAlbum?.title || '当前播放列表'}</h3>
            <span className="xima-drawer-count">共 {queue.length} 集</span>
          </div>
          <button
            type="button"
            className="xima-drawer-close"
            onClick={() => setQueueOpen(false)}
            aria-label="关闭选集列表"
          >
            ✕
          </button>
        </header>

        <div className="xima-drawer-list">
          {queue.length === 0 ? (
            <div className="xima-drawer-empty">暂无更多章节</div>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === queueIndex
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`xima-drawer-item ${isCurrent ? 'active' : ''}`}
                  onClick={() => play(track, queue)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="xima-drawer-num">
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
                  <div className="xima-drawer-info">
                    <span className="xima-drawer-item-title">{track.title}</span>
                    <span className="xima-drawer-item-sub">
                      {track.artist} · {formatSeconds(track.duration || 1800)}
                    </span>
                  </div>
                  {isCurrent && <span className="xima-drawer-playing-tag">播放中</span>}
                </div>
              )
            })
          )}
        </div>
      </aside>
    </div>
  )
}
