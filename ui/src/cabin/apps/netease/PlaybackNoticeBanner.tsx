import { CloseGlyph } from '../music/glyphs'
import { CrownGlyph, WarningGlyph } from './glyphs'
import { dismissPlaybackNotice, formatPlaybackNotice, sendSignIn, useNetease } from './netease'

/** Banner notifying the driver when a VIP or unavailable track was skipped or paused. */
export function PlaybackNoticeBanner({ className = '' }: { className?: string }) {
  const playbackNotice = useNetease((s) => s.playbackNotice)
  const signedIn = useNetease((s) => s.signedIn)

  if (!playbackNotice) return null

  return (
    <div className={`ne-notice glass ${className}`.trim()} role="status" aria-live="polite">
      <span className="ne-notice-icon" aria-hidden="true">
        {playbackNotice.reason === 'vip_required' ? <CrownGlyph size={20} /> : <WarningGlyph size={20} />}
      </span>
      <span className="ne-notice-text">{formatPlaybackNotice(playbackNotice)}</span>
      <div className="ne-notice-actions">
        {playbackNotice.reason === 'vip_required' && !signedIn && !playbackNotice.skippedTo && (
          <button type="button" className="ne-notice-signin" onClick={sendSignIn}>
            扫码登录
          </button>
        )}
        <button type="button" className="ne-notice-close" onClick={dismissPlaybackNotice} aria-label="关闭提示">
          <CloseGlyph size={18} />
        </button>
      </div>
    </div>
  )
}
