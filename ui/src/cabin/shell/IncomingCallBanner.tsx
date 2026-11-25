import { useEffect } from 'react'
import { ContactAvatarGlyph, HangUpGlyph, PhoneGlyph } from '../apps/phone/glyphs'
import { usePhone } from '../state/phone'
import { useSimulation } from '../state/simulation'
import { go } from '../state/store'
import { useText } from '../state/text'
import './incomingCallBanner.css'

const RING_TIMEOUT_MS = 18_000

/**
 * Compact floating CarPlay incoming-call banner at the top of the screen:
 * - Never obscures the navigation map.
 * - Respects global Do Not Disturb (`useSimulation.dnd`).
 * - Purely visual (no audio hijack); unanswered calls expire into Recents as missed calls.
 */
export function IncomingCallBanner() {
  const incoming = usePhone((s) => s.incomingCall)
  const answerIncoming = usePhone((s) => s.answerIncoming)
  const declineIncoming = usePhone((s) => s.declineIncoming)
  const dnd = useSimulation((s) => s.dnd)
  const text = useText()

  const shown = Boolean(incoming && !dnd)

  useEffect(() => {
    if (!shown || !incoming) return
    const timer = setTimeout(() => {
      declineIncoming(true)
    }, RING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [shown, incoming, declineIncoming])

  const handleAnswer = () => {
    const call = answerIncoming()
    if (call) {
      go({ type: 'openApp', app: 'phone' })
    }
  }

  return (
    <div className={shown ? 'call-banner-slot shown' : 'call-banner-slot'} aria-live="assertive" inert={!shown}>
      {incoming && (
        <div
          className={`call-banner glass tone-${incoming.contact.kind}`}
          role="region"
          aria-label={`${text.phone.call.incomingTitle}: ${incoming.contact.name}`}
        >
          <span className={`call-banner-avatar tone-${incoming.contact.kind}`} aria-hidden="true">
            <ContactAvatarGlyph kind={incoming.contact.kind} size={22} />
          </span>
          <div className="call-banner-info">
            <div className="call-banner-top">
              <span className="call-banner-tag">{text.phone.call.incomingTitle}</span>
              <span className="call-banner-name">{incoming.contact.name}</span>
            </div>
            <div className="call-banner-reason">{incoming.reason}</div>
          </div>
          <div className="call-banner-actions">
            <button
              type="button"
              className="call-banner-btn decline"
              aria-label={text.phone.call.decline}
              onClick={() => declineIncoming(false)}
            >
              <HangUpGlyph size={18} />
            </button>
            <button
              type="button"
              className="call-banner-btn answer"
              aria-label={text.phone.call.answer}
              onClick={handleAnswer}
            >
              <PhoneGlyph size={18} />
              <span>{text.phone.call.answer}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
