import { useEffect, useState } from 'react'
import {
  cyclePlaybackSpeed,
  playOrPause,
  positionOf,
  seek,
  sendVolume,
  setNowPlaying,
  setQueueOpen,
  setSleepTimer,
  skip,
  skipSeconds,
  useXimalaya,
} from './ximalaya'
import { EpisodeDrawer } from './EpisodeDrawer'
import { CoverImage } from './CoverImage'
import { Forward30Glyph, PlaylistGlyph, Rewind15Glyph, SpeedGlyph, TimerGlyph, VolumeGlyph } from './glyphs'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function NowPlaying() {
  const playback = useXimalaya((s) => s.playback)
  const playing = useXimalaya((s) => s.playing)
  const playbackSpeed = useXimalaya((s) => s.playbackSpeed)
  const sleepTimerMinutes = useXimalaya((s) => s.sleepTimerMinutes)
  const volume = useXimalaya((s) => s.volume)
  const queue = useXimalaya((s) => s.queue)
  const queueIndex = useXimalaya((s) => s.queueIndex)

  const [pos, setPos] = useState(0)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)

  useEffect(() => {
    const update = () => {
      setPos(positionOf(playback, performance.now()))
    }
    update()
    const interval = setInterval(update, 200)
    return () => clearInterval(interval)
  }, [playback])

  if (!playback || playback.owner === 'radio') return null

  const duration = playback.duration || 1800
  const progressPercent = Math.min(100, Math.max(0, (pos / duration) * 100))

  const handleTimerCycle = () => {
    const options = [null, 15, 30, 60]
    const currentIdx = options.indexOf(sleepTimerMinutes)
    const next = options[(currentIdx + 1) % options.length]
    setSleepTimer(next)
  }

  return (
    <div className="xima-now-playing-container" aria-label="喜马拉雅车载播放器">
      {/* Dynamic blurred ambient glow */}
      {playback.artwork && (
        <div className="xima-ambient-backdrop" style={{ backgroundImage: `url(${playback.artwork})` }} />
      )}
      <div className="xima-ambient-overlay" />

      {/* Top Header */}
      <header className="xima-np-header">
        <button type="button" className="xima-np-back-btn" onClick={() => setNowPlaying(false)} aria-label="返回列表">
          ‹ 返回浏览
        </button>

        <div className="xima-np-header-title">
          <span className="xima-np-header-brand">喜马拉雅 FM · 车载空间</span>
          {queue.length > 0 && (
            <span className="xima-np-header-ep">
              第 {queueIndex + 1} 集 / 共 {queue.length} 集
            </span>
          )}
        </div>

        <div className="xima-np-header-right">
          <span className="xima-audio-quality-tag">杜比全景声</span>
        </div>
      </header>

      {/* Center Content */}
      <div className="xima-np-center">
        {/* Artwork with ambient ring and wave animation */}
        <div className="xima-np-art-wrap">
          <div className={`xima-np-artwork ${playing ? 'playing-glow' : ''}`}>
            <CoverImage src={playback.artwork} alt={playback.title} fallback="🎙️" />
          </div>

          {/* Soundwave equalizer indicator */}
          <div className={`xima-np-soundwave ${playing ? 'active' : ''}`}>
            <span className="wave-bar w1" />
            <span className="wave-bar w2" />
            <span className="wave-bar w3" />
            <span className="wave-bar w4" />
            <span className="wave-bar w5" />
          </div>
        </div>

        {/* Title and Metadata */}
        <div className="xima-np-meta-box">
          <h1 className="xima-np-title" title={playback.title}>
            {playback.title}
          </h1>
          <div className="xima-np-sub">
            <span className="xima-np-author">🎙️ {playback.artist}</span>
            <span className="xima-audio-badge">喜马独家</span>
          </div>
        </div>

        {/* Progress Scrubber */}
        <div className="xima-np-progress-section">
          <div
            className="xima-np-progress-bar"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={pos}
            aria-label="播放进度"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              seek(pct * duration)
            }}
          >
            <div className="xima-np-fill" style={{ width: `${progressPercent}%` }}>
              <span className="xima-np-thumb" />
            </div>
          </div>

          <div className="xima-np-time-labels">
            <span className="xima-np-time-curr">{formatSeconds(pos)}</span>
            <span className="xima-np-time-total">-{formatSeconds(Math.max(0, duration - pos))}</span>
          </div>
        </div>

        {/* Hero Automotive Control Buttons */}
        <div className="xima-np-controls-row">
          {/* Rewind 15s */}
          <button
            type="button"
            className="xima-btn-secondary-ctrl"
            onClick={() => skipSeconds(-15)}
            title="快退15秒"
            aria-label="快退15秒"
          >
            <Rewind15Glyph />
          </button>

          {/* Previous Episode */}
          <button
            type="button"
            className="xima-btn-main-ctrl"
            onClick={() => skip(-1)}
            title="上一集"
            aria-label="上一集"
          >
            ⏮
          </button>

          {/* Hero Play/Pause Toggle */}
          <button
            type="button"
            className="xima-btn-hero-play"
            onClick={playOrPause}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? <span className="xima-pause-icon">❚❚</span> : <span className="xima-play-icon">▶</span>}
          </button>

          {/* Next Episode */}
          <button
            type="button"
            className="xima-btn-main-ctrl"
            onClick={() => skip(1)}
            title="下一集"
            aria-label="下一集"
          >
            ⏭
          </button>

          {/* Forward 30s */}
          <button
            type="button"
            className="xima-btn-secondary-ctrl"
            onClick={() => skipSeconds(30)}
            title="快进30秒"
            aria-label="快进30秒"
          >
            <Forward30Glyph />
          </button>
        </div>

        {/* Bottom Utility Features Bar */}
        <footer className="xima-np-bottom-bar">
          {/* Speed Button */}
          <button type="button" className="xima-util-btn" onClick={cyclePlaybackSpeed} title="切换播放倍速">
            <SpeedGlyph />
            <span>{playbackSpeed.toFixed(2).replace(/\.00$/, '')}x</span>
          </button>

          {/* Chapter Drawer Toggle */}
          <button type="button" className="xima-util-btn" onClick={() => setQueueOpen(true)} title="选集节目单">
            <PlaylistGlyph />
            <span>选集 ({queue.length})</span>
          </button>

          {/* Sleep Timer */}
          <button
            type="button"
            className={`xima-util-btn ${sleepTimerMinutes ? 'active-timer' : ''}`}
            onClick={handleTimerCycle}
            title="定时关闭"
          >
            <TimerGlyph />
            <span>{sleepTimerMinutes ? `${sleepTimerMinutes}分` : '定时'}</span>
          </button>

          {/* Volume Control */}
          <div className="xima-volume-box">
            <button
              type="button"
              className="xima-util-btn"
              onClick={() => setShowVolumeSlider(!showVolumeSlider)}
              title="调节音量"
            >
              <VolumeGlyph muted={volume === 0} />
            </button>
            {showVolumeSlider && (
              <div className="xima-volume-popup">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => sendVolume(parseFloat(e.target.value))}
                  aria-label="音量滑块"
                />
                <span className="xima-volume-percent">{Math.round(volume * 100)}%</span>
              </div>
            )}
          </div>
        </footer>
      </div>

      {/* Slide-over Episode Drawer */}
      <EpisodeDrawer />
    </div>
  )
}
