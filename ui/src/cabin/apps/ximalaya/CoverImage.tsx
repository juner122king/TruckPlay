import { type ReactNode, useMemo, useState } from 'react'

export function CoverImage({
  src,
  alt,
  className,
  fallback = 'FM',
}: {
  src?: string | null
  alt?: string
  className?: string
  fallback?: ReactNode
}) {
  const cleanSrc = useMemo(() => {
    if (!src) return null
    let s = src.trim()
    if (!s) return null
    if (s.startsWith('//')) s = 'https:' + s
    else if (s.startsWith('http://')) s = 'https://' + s.slice(7)
    else if (!s.startsWith('http') && !s.startsWith('/') && !s.startsWith('data:')) {
      s = 'https://imagev2.xmcdn.com/' + s
    }
    return s
  }, [src])

  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = !cleanSrc || failedSrc === cleanSrc

  if (failed) {
    return (
      <div className={`xima-art-placeholder ${className || ''}`} aria-hidden="true">
        {fallback}
      </div>
    )
  }

  return (
    <img
      src={cleanSrc}
      alt={alt || ''}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(cleanSrc)}
    />
  )
}
