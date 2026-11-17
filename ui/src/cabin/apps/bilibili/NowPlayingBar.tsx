import { isInHost } from '../../../shared/host'
import { CloseGlyph, PauseGlyph, PlayGlyph } from '../youtube/glyphs'
import { VideoHole } from '../youtube/VideoHole'
import { openPlayer, playOrPause, stopVideo, useBilibili } from './bilibili'
import { TvGlyph } from './glyphs'
import { BiliImage } from './shared'

export function NowPlayingBar() {
  const playback = useBilibili((store) => store.playback)
  const open = useBilibili((store) => store.open)
  const playing = useBilibili((store) => store.playing)

  if (!playback || open) return null

  const isPlayingNow = Boolean(
    playing || playback.status === 'playing' || (playback.isLive && playback.status !== 'paused'),
  )
  const liveHole = isInHost() && isPlayingNow

  return (
    <div className="bili-now" role="region" aria-label="正在播放">
      <button
        type="button"
        className="bili-now-open"
        aria-label={`展开播放器：${playback.title}`}
        onClick={() => openPlayer(true)}
      >
        {liveHole ? (
          <VideoHole app="bilibili" className="bili-thumb bili-now-video" crop />
        ) : (
          <span className="bili-thumb bili-now-video">
            <BiliImage
              src={playback.artwork}
              fallback={
                <span className="bili-thumb-blank" aria-hidden="true">
                  <TvGlyph />
                </span>
              }
            />
          </span>
        )}
        <span className="bili-now-text">
          <span className="bili-title">{playback.title}</span>
          <span className="bili-sub">
            {playback.isLive ? '直播中 · ' : ''}
            {playback.artist}
          </span>
        </span>
      </button>

      <button
        type="button"
        className="bili-round"
        aria-label={isPlayingNow ? '暂停' : '播放'}
        onClick={() => playOrPause()}
      >
        {isPlayingNow ? <PauseGlyph /> : <PlayGlyph />}
      </button>

      <button type="button" className="bili-round" aria-label="关闭播放" onClick={() => stopVideo()}>
        <CloseGlyph />
      </button>
    </div>
  )
}
