import { type UIEvent, useCallback, useEffect, useRef, useState } from 'react'
import type { BilibiliAnswers } from '../../../shared/host'
import { ask } from './bilibili'
import type { BilibiliQuestion } from '../../../shared/host'

export type FeedStatus = 'loading' | 'done' | 'failed'

interface UsePaginatedFeedOptions<T> {
  /** Build the host query for `page` (1-indexed). */
  question: (page: number) => BilibiliQuestion
  /** Extract list items from the host answer. */
  extract: (answer: BilibiliAnswers) => T[] | undefined
  /** Unique key per item for cross-page deduplication. */
  getKey: (item: T) => string | number
  /** Key identifying the current feed query; changing it resets list and reloads from page 1. */
  resetKey: string
  /** Optional refresh counter; incrementing smoothly scrolls back to top. */
  refreshKey?: number
  /** Optional callback for side data returned alongside items (e.g. channel metadata, following live rooms). */
  onAnswer?: (answer: BilibiliAnswers, page: number) => void
}

/**
 * Shared paginated feed loader with stale-request cancellation, cross-page deduplication,
 * refresh-to-top, and unified near-end scroll triggering.
 */
export function usePaginatedFeed<T>({
  question,
  extract,
  getKey,
  resetKey,
  refreshKey = 0,
  onAnswer,
}: UsePaginatedFeedOptions<T>) {
  const [items, setItems] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [status, setStatus] = useState<FeedStatus>('loading')

  const reqSeq = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const handlersRef = useRef({ question, extract, getKey, onAnswer })
  handlersRef.current = { question, extract, getKey, onAnswer }

  const load = useCallback((nextPage: number) => {
    const reqId = ++reqSeq.current
    setStatus('loading')
    ask(handlersRef.current.question(nextPage)).then((answer) => {
      if (reqId !== reqSeq.current) return
      if (answer.failed) {
        setStatus('failed')
        return
      }
      handlersRef.current.onAnswer?.(answer, nextPage)
      const incoming = handlersRef.current.extract(answer)
      if (incoming) {
        setItems((before) => {
          if (nextPage === 1) return incoming
          const seen = new Set(before.map((item) => handlersRef.current.getKey(item)))
          const added = incoming.filter((item) => !seen.has(handlersRef.current.getKey(item)))
          return [...before, ...added]
        })
      }
      setHasMore(answer.hasMore ?? false)
      setPage(nextPage)
      setStatus('done')
    })
  }, [])

  useEffect(() => {
    setItems([])
    setPage(1)
    setHasMore(true)
    if (refreshKey > 0) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    }
    load(1)
  }, [resetKey, refreshKey, load])

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!hasMore || status !== 'done') return
      const el = event.currentTarget
      if (el.scrollTop + el.clientHeight > el.scrollHeight - el.clientHeight * 0.8) {
        load(page + 1)
      }
    },
    [hasMore, status, page, load],
  )

  const retry = useCallback(() => {
    load(items.length > 0 ? page + 1 : 1)
  }, [load, items.length, page])

  return { items, page, hasMore, status, scrollRef, onScroll, retry, reload: () => load(1) }
}
