import { CloseGlyph } from '../music/glyphs'
import { DiamondVipGlyph, QrCodeGlyph, WarningGlyph } from './glyphs'
import { dismissPlaybackNotice, formatPlaybackNotice, sendSignIn, useQqmusic } from './qqmusic'

/** Banner notifying the driver when login is required or a VIP/unavailable track was skipped or paused. */
export function PlaybackNoticeBanner({ className = '' }: { className?: string }) {
  const playbackNotice = useQqmusic((s) => s.playbackNotice)
  const signedIn = useQqmusic((s) => s.signedIn)

  if (!playbackNotice) return null

  const showSignIn =
    playbackNotice.reason === 'login_required' ||
    (playbackNotice.reason === 'vip_required' && !signedIn && !playbackNotice.skippedTo)

  return (
    <div className={`qqm-notice glass ${className}`.trim()} role="status" aria-live="polite">
      <span className="qqm-notice-icon" aria-hidden="true">
        {playbackNotice.reason === 'login_required' ? (
          <QrCodeGlyph size={20} />
        ) : playbackNotice.reason === 'vip_required' ? (
          <DiamondVipGlyph size={20} />
        ) : (
          <WarningGlyph size={20} />
        )}
      </span>
      <span className="qqm-notice-text">{formatPlaybackNotice(playbackNotice)}</span>
      <div className="qqm-notice-actions">
        {showSignIn && (
          <button type="button" className="qqm-notice-signin" onClick={sendSignIn}>
            扫码登录
          </button>
        )}
        <button type="button" className="qqm-notice-close" onClick={dismissPlaybackNotice} aria-label="关闭提示">
          <CloseGlyph size={18} />
        </button>
      </div>
    </div>
  )
}
