import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { BilibiliVideo } from '../../../shared/host'
import { PersonGlyph, PlayGlyph } from '../youtube/glyphs'
import { formatClock, openChannel, play, sendSignIn, sendSignOut, useBilibili } from './bilibili'
import { TvGlyph } from './glyphs'
import type { FeedStatus } from './usePaginatedFeed'

export function BiliImage({
  src,
  alt = '',
  className,
  loading,
  fallback,
}: {
  src?: string | null
  alt?: string
  className?: string
  loading?: 'lazy' | 'eager'
  fallback: ReactNode
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) {
    return <>{fallback}</>
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  )
}

export function Thumbnail({ video, progress = 0, rank }: { video: BilibiliVideo; progress?: number; rank?: number }) {
  return (
    <span className="bili-thumb">
      <BiliImage
        src={video.artwork}
        loading="lazy"
        fallback={
          <span className="bili-thumb-blank" aria-hidden="true">
            <TvGlyph />
          </span>
        }
      />
      {rank !== undefined && (
        <span
          className={`bili-rank-badge ${rank === 0 ? 'gold' : rank === 1 ? 'silver' : rank === 2 ? 'bronze' : 'normal'}`}
        >
          {rank < 3 ? `TOP ${rank + 1}` : rank + 1}
        </span>
      )}
      {video.isLive ? (
        <span className="bili-badge live">直播中</span>
      ) : video.duration ? (
        <span className="bili-badge">{formatClock(video.duration)}</span>
      ) : null}
      {progress > 0 && <span className="bili-progress" style={{ width: `${Math.min(100, progress * 100)}%` }} />}
    </span>
  )
}

export function VideoCard({
  video,
  rank,
  progress = 0,
  className = '',
}: {
  video: BilibiliVideo
  rank?: number
  progress?: number
  className?: string
}) {
  const stats = [video.playCount, video.pubdate].filter(Boolean).join(' · ')

  return (
    <article className={`bili-card ${className}`.trim()}>
      <Thumbnail video={video} rank={rank} progress={progress} />
      <div className="bili-meta">
        <button type="button" className="bili-card-trigger" onClick={() => play(video, true)}>
          <span className="bili-title">{video.title}</span>
        </button>
        <div className="bili-sub">
          {video.mid ? (
            <button
              type="button"
              className="bili-author-link"
              onClick={() => openChannel({ mid: video.mid!, name: video.author })}
            >
              {video.author}
            </button>
          ) : (
            <span className="bili-author-plain">{video.author}</span>
          )}
          {stats && <span className="bili-sub-stats"> · {stats}</span>}
        </div>
      </div>
    </article>
  )
}

export function VideoRow({ video, onClick }: { video: BilibiliVideo; onClick?: () => void }) {
  const stats = [video.playCount, video.pubdate].filter(Boolean).join(' · ')

  return (
    <article className="bili-row">
      <Thumbnail video={video} />
      <div className="bili-row-text">
        <button type="button" className="bili-card-trigger" onClick={onClick ?? (() => play(video, true))}>
          <span className="bili-title">{video.title}</span>
        </button>
        <div className="bili-sub">
          {video.mid ? (
            <button
              type="button"
              className="bili-author-link"
              onClick={() => openChannel({ mid: video.mid!, name: video.author })}
            >
              {video.author}
            </button>
          ) : (
            <span className="bili-author-plain">{video.author}</span>
          )}
          {stats && <span className="bili-sub-stats"> · {stats}</span>}
        </div>
      </div>
    </article>
  )
}

export function SectionTitle({ title, onClear }: { title: string; onClear?: () => void }) {
  return (
    <div className="bili-section-title">
      <h3 className="bili-section-heading">{title}</h3>
      {onClear && (
        <button type="button" className="bili-clear" onClick={onClear}>
          清除
        </button>
      )}
    </div>
  )
}

export function FeedSkeletons({ layout, count }: { layout: 'rows' | 'grid' | 'posters'; count: number }) {
  if (layout === 'posters') {
    return (
      <>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="bili-movie-card bili-skeleton" aria-hidden="true">
            <span className="bili-movie-poster-wrap" />
            <span className="bili-movie-meta">
              <span className="bili-skeleton-line" />
              <span className="bili-skeleton-line short" />
            </span>
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      {Array.from({ length: count }, (_, i) =>
        layout === 'grid' ? (
          <div key={i} className="bili-card bili-skeleton" aria-hidden="true">
            <span className="bili-thumb" />
            <span className="bili-meta">
              <span className="bili-skeleton-line" />
              <span className="bili-skeleton-line short" />
            </span>
          </div>
        ) : (
          <div key={i} className="bili-row bili-skeleton" aria-hidden="true">
            <span className="bili-thumb" />
            <span className="bili-row-text">
              <span className="bili-skeleton-line" />
              <span className="bili-skeleton-line short" />
            </span>
          </div>
        ),
      )}
    </>
  )
}

export function FeedStatusNote({
  status,
  empty,
  emptyText,
  failedText = '加载失败',
  onRetry,
}: {
  status: FeedStatus
  empty: boolean
  emptyText: string
  failedText?: string
  onRetry: () => void
}) {
  if (status === 'done' && empty) {
    return <p className="bili-note">{emptyText}</p>
  }
  if (status === 'failed') {
    return (
      <div className="bili-note" role="status">
        <span>{failedText}</span>
        <button type="button" className="bili-retry-btn" onClick={onRetry}>
          重试
        </button>
      </div>
    )
  }
  return null
}

export function AccountControl() {
  const signedIn = useBilibili((store) => store.signedIn)
  const profile = useBilibili((store) => store.profile)
  const [menuOpen, setMenuOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  if (!signedIn) {
    return (
      <button type="button" className="bili-sign-in" onClick={sendSignIn}>
        <PersonGlyph />
        <span>扫码登录</span>
      </button>
    )
  }

  return (
    <div ref={boxRef} className="bili-account-box">
      <button
        ref={triggerRef}
        type="button"
        className="bili-me"
        aria-label={profile?.name ? `${profile.name} 账号菜单` : '账号菜单'}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setMenuOpen(true)
            requestAnimationFrame(() => itemRefs.current[0]?.focus())
          }
        }}
      >
        {profile?.avatar ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" /> : <PersonGlyph />}
      </button>

      {menuOpen && (
        <div
          className="bili-account-popover"
          role="menu"
          aria-label="账号操作"
          onKeyDown={(e) => {
            const items = itemRefs.current.filter((el): el is HTMLButtonElement => Boolean(el))
            if (items.length === 0) return
            const idx = items.indexOf(document.activeElement as HTMLButtonElement)
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              items[(idx + 1) % items.length].focus()
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              items[(idx - 1 + items.length) % items.length].focus()
            }
          }}
        >
          {profile?.name && (
            <div className="bili-account-name" role="presentation">
              {profile.name}
            </div>
          )}
          <button
            ref={(el) => {
              itemRefs.current[0] = el
            }}
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              sendSignIn()
            }}
          >
            切换账号
          </button>
          <button
            ref={(el) => {
              itemRefs.current[1] = el
            }}
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              setMenuOpen(false)
              sendSignOut()
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}

export function SigningInBanner() {
  const signingIn = useBilibili((store) => store.signingIn)
  if (!signingIn) return null
  return (
    <div className="bili-signing-in-banner" role="status">
      <span className="bili-spinner" aria-hidden="true" />
      <span>请在电脑屏幕上使用哔哩哔哩手机客户端扫码登录...</span>
    </div>
  )
}

export function PlayInlineGlyph() {
  return <PlayGlyph />
}
