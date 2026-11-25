import { useEffect } from 'react'
import { CloseGlyph, RepeatGlyph, RepeatOneGlyph, ShuffleGlyph } from '../music/glyphs'
import { TrashGlyph } from './glyphs'
import { clearQueue, playQueueTrack, removeFromQueue, togglePlayMode, toggleQueue, useQqmusic } from './qqmusic'

export function QueueDrawer() {
  const queue = useQqmusic((s) => s.queue)
  const queueIndex = useQqmusic((s) => s.queueIndex)
  const queueOpen = useQqmusic((s) => s.queueOpen)
  const playing = useQqmusic((s) => s.playing)
  const playMode = useQqmusic((s) => s.playMode)

  useEffect(() => {
    if (!queueOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') toggleQueue(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [queueOpen])

  if (!queueOpen) return null

  const modeLabel = playMode === 'loop' ? '列表循环' : playMode === 'shuffle' ? '随机播放' : '单曲循环'

  return (
    <div className="qqm-drawer-backdrop" onClick={() => toggleQueue(false)}>
      <aside
        className="qqm-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="播放队列"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="qqm-drawer-head">
          <div className="qqm-drawer-title-group">
            <h3 className="qqm-drawer-title">当前播放</h3>
            <span className="qqm-drawer-count">{queue.length} 首</span>
          </div>

          <div className="qqm-drawer-actions">
            <button
              type="button"
              className="qqm-drawer-mode-btn"
              onClick={togglePlayMode}
              aria-label={`切换播放模式，当前${modeLabel}`}
            >
              {playMode === 'loop' && <RepeatGlyph size={18} />}
              {playMode === 'shuffle' && <ShuffleGlyph size={18} />}
              {playMode === 'single' && <RepeatOneGlyph size={18} />}
              <span>{modeLabel}</span>
            </button>

            {queue.length > 0 && (
              <button type="button" className="qqm-drawer-clear-btn" onClick={clearQueue} aria-label="清空列表">
                <TrashGlyph size={18} />
                <span>清空</span>
              </button>
            )}

            <button
              type="button"
              className="qqm-drawer-close-btn"
              onClick={() => toggleQueue(false)}
              aria-label="关闭队列"
            >
              <CloseGlyph size={20} />
            </button>
          </div>
        </header>

        <div className="qqm-drawer-list">
          {queue.length === 0 ? (
            <div className="qqm-drawer-empty">播放列表为空</div>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === queueIndex
              const isVip = track.payPlay === 1
              const isUnplayable = track.playable === false
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`qqm-queue-row${isCurrent ? ' active' : ''}${isUnplayable ? ' unplayable' : ''}`}
                >
                  <button
                    type="button"
                    className="qqm-queue-main"
                    onClick={() => playQueueTrack(idx)}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    <span className="qqm-queue-indicator">
                      {isCurrent ? (
                        <span className="qqm-sound-bars" aria-hidden="true">
                          <i className={`b1${playing ? ' anim' : ''}`} />
                          <i className={`b2${playing ? ' anim' : ''}`} />
                          <i className={`b3${playing ? ' anim' : ''}`} />
                        </span>
                      ) : (
                        <span className="qqm-queue-num">{idx + 1}</span>
                      )}
                    </span>

                    <span className="qqm-queue-body">
                      <span className="qqm-queue-title-row">
                        <span className="qqm-queue-title">{track.title}</span>
                        {isVip && <span className="qqm-badge-vip">VIP</span>}
                      </span>
                      <span className="qqm-queue-artist">{track.artist}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="qqm-queue-remove"
                    onClick={() => removeFromQueue(idx)}
                    aria-label={`移除 ${track.title}`}
                  >
                    <CloseGlyph size={16} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </aside>
    </div>
  )
}
