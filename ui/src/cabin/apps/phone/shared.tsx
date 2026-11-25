import type { ReactNode } from 'react'
import { go } from '../../state/store'
import type { Strings } from '../../state/strings'
import { MapPinGlyph } from './glyphs'
import type { PhoneFeedback } from './phoneLogic'

/** Shared feedback status banner with an optional one-tap jump to Maps. */
export function PhoneFeedbackBar({
  feedback,
  compact = false,
  strings,
}: {
  feedback: PhoneFeedback
  compact?: boolean
  strings: Strings
}) {
  return (
    <div
      className={`phone-feedback-bar${compact ? ' compact' : ''} ${feedback.status}`}
      role="status"
      aria-live={feedback.status === 'loading' ? 'off' : 'polite'}
    >
      <span className="phone-feedback-text">{feedback.text}</span>
      {feedback.showMapJump && (
        <button
          type="button"
          className="phone-inline-map-btn"
          onClick={() => go({ type: 'openApp', app: 'maps' })}
        >
          <MapPinGlyph size={14} />
          <span>{strings.phone.feedback.viewOnMap}</span>
        </button>
      )}
    </div>
  )
}

export function PhoneCaptionCard({ children, diag }: { children: ReactNode; diag?: string }) {
  return (
    <div className="phone-caption-card">
      <p className="phone-caption-line">{children}</p>
      {diag && <p className="phone-caption-diag">{diag}</p>}
    </div>
  )
}
