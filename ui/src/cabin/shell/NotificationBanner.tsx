import { type FocusEvent, useEffect, useState } from 'react'
import { ThreadAvatarGlyph } from '../apps/messages/glyphs'
import { usePhone } from '../state/phone'
import { useSimulation } from '../state/simulation'
import { go } from '../state/store'
import { useText } from '../state/text'
import './notificationBanner.css'

const BANNER_TIMEOUT_MS = 4500

/**
 * Floating iOS 26 CarPlay notification banner for high-priority dispatch/traffic/fleet events.
 * Uses `inert` when hidden so focus never enters off-screen controls, and pauses auto-dismiss
 * while hovered or keyboard-focused.
 */
export function NotificationBanner() {
  const banner = useSimulation((state) => state.banner)
  const dnd = useSimulation((state) => state.dnd)
  const dismissBanner = useSimulation((state) => state.dismissBanner)
  const setActiveThread = useSimulation((state) => state.setActiveThread)
  const incomingCall = usePhone((state) => state.incomingCall)
  const text = useText()

  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const shown = Boolean(banner && !dnd && !incomingCall)
  const paused = hovered || focused

  useEffect(() => {
    if (!shown || paused) return
    const timer = setTimeout(() => {
      setHovered(false)
      setFocused(false)
      dismissBanner()
    }, BANNER_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [shown, paused, banner?.id, dismissBanner])

  const openThread = () => {
    if (!banner) return
    setHovered(false)
    setFocused(false)
    setActiveThread(banner.thread)
    dismissBanner()
    go({ type: 'openApp', app: 'messages' })
  }

  const handleClose = () => {
    setHovered(false)
    setFocused(false)
    dismissBanner()
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocused(false)
    }
  }

  return (
    <div className={shown ? 'notify-banner-slot shown' : 'notify-banner-slot'} aria-live="polite" inert={!shown}>
      {banner && (
        <div
          className="notify-banner glass"
          role="region"
          data-thread={banner.thread}
          aria-label={banner.title}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
        >
          <button type="button" className="notify-banner-main" onClick={openThread}>
            <span className={`notify-banner-icon tone-${banner.thread}`} aria-hidden="true">
              <ThreadAvatarGlyph thread={banner.thread} size={20} />
            </span>
            <span className="notify-banner-text">
              <span className="notify-banner-title">{banner.title}</span>
              <span className="notify-banner-body">{banner.body}</span>
            </span>
          </button>
          <button type="button" className="notify-banner-close" aria-label={text.close} onClick={handleClose}>
            <svg
              viewBox="0 0 20 20"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              aria-hidden="true"
            >
              <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
