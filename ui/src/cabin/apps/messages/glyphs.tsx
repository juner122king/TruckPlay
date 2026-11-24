import type { QuickStopCategory } from '../../maps/quickStop'
import type { QuickReplyId, ThreadId } from '../../state/simulation'

export function ThreadAvatarGlyph({ thread, size = 22 }: { thread: ThreadId; size?: number }) {
  switch (thread) {
    case 'dispatch':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M9 4h6a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2Z" />
          <rect x="5" y="5.5" width="14" height="15" rx="2.5" />
          <path d="M9 11h6M9 15h4" strokeLinecap="round" />
        </svg>
      )
    case 'traffic':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            d="M12 3.2 4.8 6.5v5.4c0 4.6 3.1 7.8 7.2 9.1 4.1-1.3 7.2-4.5 7.2-9.1V6.5L12 3.2Z"
            strokeLinejoin="round"
          />
          <path d="M12 8.5v4.2" strokeLinecap="round" />
          <circle cx="12" cy="15.8" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'fleet':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            d="M14.7 6.3a4.3 4.3 0 0 0-5.4 5.4l-4.9 4.9a1.5 1.5 0 0 0 2.1 2.1l4.9-4.9a4.3 4.3 0 0 0 5.4-5.4l-2.3 2.3-1.9-.4-.4-1.9 2.5-2.1Z"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'convoy':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
          <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
          <path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" strokeLinecap="round" />
        </svg>
      )
  }
}

export function PinRouteGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      aria-hidden="true"
    >
      <path d="M12 21s6-5.7 6-10.5a6 6 0 1 0-12 0C6 15.3 12 21 12 21Z" strokeLinejoin="round" />
      <circle cx="12" cy="10.5" r="2.2" />
    </svg>
  )
}

export function FuelGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20V6.5A2.5 2.5 0 0 1 6.5 4h6A2.5 2.5 0 0 1 15 6.5V20" />
      <path d="M3 20h13" />
      <path d="M7.5 8.5h4" />
      <path d="M15 10h2a2 2 0 0 1 2 2v4.5a1.5 1.5 0 0 0 3 0V9.5L19 6" />
    </svg>
  )
}

export function RestBedGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
    </svg>
  )
}

export function WrenchGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.7 6.3a4.3 4.3 0 0 0-5.4 5.4l-4.9 4.9a1.5 1.5 0 0 0 2.1 2.1l4.9-4.9a4.3 4.3 0 0 0 5.4-5.4l-2.3 2.3-1.9-.4-.4-1.9 2.5-2.1Z" />
    </svg>
  )
}

export function AlertTriangleGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.4 4.3 3.2 17a1.8 1.8 0 0 0 1.6 2.7h14.4a1.8 1.8 0 0 0 1.6-2.7L13.6 4.3a1.8 1.8 0 0 0-3.2 0Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CheckCircleGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5" />
    </svg>
  )
}

export function InfoCircleGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ChevronDownGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  )
}

export function MapArrowGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 11.2 20 4l-7.2 16.5-2.3-6.9-7-2.4Z" />
    </svg>
  )
}

export function StopCategoryGlyph({ category, size = 18 }: { category: QuickStopCategory; size?: number }) {
  switch (category) {
    case 'fuel':
      return <FuelGlyph size={size} />
    case 'rest':
      return <RestBedGlyph size={size} />
    case 'service':
      return <WrenchGlyph size={size} />
  }
}

export function QuickReplyGlyph({ replyId, size = 16 }: { replyId: QuickReplyId; size?: number }) {
  switch (replyId) {
    case 'find_fuel':
      return <FuelGlyph size={size} />
    case 'find_rest':
    case 'plan_rest':
      return <RestBedGlyph size={size} />
    case 'find_service':
      return <WrenchGlyph size={size} />
    case 'ack_on_way':
    case 'confirm_fine':
    case 'drive_safe':
      return <CheckCircleGlyph size={size} />
  }
}

export function BackGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5.5 8.5 12 15 18.5" />
    </svg>
  )
}

export function TrashGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4.5 7h15M9.5 7V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" strokeLinecap="round" />
      <path d="M7.5 7 8.4 19a1.5 1.5 0 0 0 1.5 1.4h4.2a1.5 1.5 0 0 0 1.5-1.4L16.5 7" strokeLinejoin="round" />
    </svg>
  )
}

export function BellGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 15.5c-.9-1.2-1.2-2.6-1.2-4.7a4.8 4.8 0 1 0-9.6 0c0 2.1-.3 3.5-1.3 4.7l-.6.8h13.4l-.7-.8Z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </svg>
  )
}

export function BellSlashGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M18 15.5c-.9-1.2-1.2-2.6-1.2-4.7a4.8 4.8 0 0 0-8-3.6M7.2 10.7c0 2.2-.4 3.6-1.3 4.8l-.6.8h10.2"
        strokeLinecap="round"
      />
      <path d="M10.3 19a2 2 0 0 0 3.4 0M3.5 3.5l17 17" strokeLinecap="round" />
    </svg>
  )
}

export function MessageBubbleGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H10l-4 3.5V16a2.5 2.5 0 0 1-1-2V6.5Z"
        strokeLinejoin="round"
      />
      <path d="M9 9.5h6M9 12.5h4" strokeLinecap="round" />
    </svg>
  )
}
