import { useMemo, useState } from 'react'

export function CoverImage({
  src,
  alt,
  className,
  fallback = '🎙️',
}: {
  src?: string | null
  alt?: string
  className?: string
  fallback?: string
}) {
  const [failed, setFailed] = useState(false)

  const cleanSrc = useMemo(() => {
    if (!src || failed) return null
    let s = src.trim()
    if (s.startsWith('//')) s = 'https:' + s
    else if (s.startsWith('http://')) s = 'https://' + s.slice(7)
    return s
  }, [src, failed])

  if (!cleanSrc || failed) {
    return <div className={`xima-art-placeholder ${className || ''}`}>{fallback}</div>
  }

  return (
    <img
      src={cleanSrc}
      alt={alt || ''}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
