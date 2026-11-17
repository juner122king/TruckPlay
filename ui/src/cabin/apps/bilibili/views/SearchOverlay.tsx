import { useEffect, useState } from 'react'
import { SearchGlyph } from '../../../keyboard/glyphs'
import { CloseGlyph, FillGlyph, HistoryGlyph } from '../../youtube/glyphs'
import { ask, clearSearches, forgetSearch, useBilibili } from '../bilibili'
import { FireGlyph, TrashGlyph } from '../glyphs'

const TRENDING_SEARCHES = [
  { rank: 1, title: '欧卡2 极限重载运输', tag: '热' },
  { rank: 2, title: '4K 车载沉浸式自驾', tag: '热' },
  { rank: 3, title: '车载无损音乐大碟', tag: '新' },
  { rank: 4, title: '夜间雨天自驾ASMR', tag: '' },
  { rank: 5, title: 'Steam 年度高分大作', tag: '' },
  { rank: 6, title: '赛博朋克2077 往日之影', tag: '' },
  { rank: 7, title: '黑神话悟空 隐藏支线', tag: '' },
  { rank: 8, title: '科技数码 降噪车机横评', tag: '' },
]

export function SearchOverlay({
  query,
  onSearch,
  onFill,
}: {
  query: string
  onSearch(q: string): void
  onFill(q: string): void
}) {
  const searches = useBilibili((store) => store.searches)
  const [suggested, setSuggested] = useState<{ query: string; list: string[] }>({ query: '', list: [] })

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return
    let active = true
    const timer = setTimeout(() => {
      ask({ ask: 'suggest', query: trimmed }).then((answer) => {
        if (active) setSuggested({ query: trimmed, list: answer.suggestions ?? [] })
      })
    }, 150)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query])

  const typed = query.trim().toLowerCase()

  if (!typed) {
    return (
      <div className="bili-scroll bili-suggestions-page">
        {searches.length > 0 && (
          <section className="bili-sug-section">
            <div className="bili-sug-header">
              <h3 className="bili-sug-title">
                <HistoryGlyph />
                <span>最近搜索</span>
              </h3>
              <button type="button" className="bili-clear-history-btn" onClick={clearSearches}>
                <TrashGlyph />
                <span>清空</span>
              </button>
            </div>
            <div className="bili-history-tags">
              {searches.map((s) => (
                <div key={s} className="bili-history-tag">
                  <button type="button" className="bili-history-text-btn" onClick={() => onSearch(s)}>
                    {s}
                  </button>
                  <button
                    type="button"
                    className="bili-history-del-btn"
                    aria-label={`删除 ${s}`}
                    onClick={() => forgetSearch(s)}
                  >
                    <CloseGlyph />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bili-sug-section">
          <div className="bili-sug-header">
            <h3 className="bili-sug-title">
              <FireGlyph />
              <span>热门搜索</span>
            </h3>
          </div>
          <div className="bili-hot-grid">
            {TRENDING_SEARCHES.map((item) => (
              <button key={item.rank} type="button" className="bili-hot-item" onClick={() => onSearch(item.title)}>
                <span className={item.rank <= 3 ? `bili-hot-rank rank-${item.rank}` : 'bili-hot-rank rank-normal'}>
                  {item.rank}
                </span>
                <span className="bili-hot-text">{item.title}</span>
                {item.tag && <span className={`bili-hot-tag ${item.tag === '热' ? 'hot' : 'new'}`}>{item.tag}</span>}
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const past = searches.filter((s) => s.toLowerCase().startsWith(typed)).slice(0, 4)
  const theirs = (suggested.query.trim() ? suggested.list : []).filter(
    (s) => !past.some((p) => p.toLowerCase() === s.toLowerCase()),
  )
  const rows = [...past.map((s) => ({ s, past: true })), ...theirs.map((s) => ({ s, past: false }))].slice(0, 6)

  return (
    <div className="bili-scroll bili-suggestions-page">
      <div className="bili-suggestions-card">
        {rows.length > 0 ? (
          rows.map(({ s, past: isPast }) => {
            const isMatch = s.toLowerCase().startsWith(typed)
            const prefix = isMatch ? s.slice(0, typed.length) : ''
            const rest = isMatch ? s.slice(typed.length) : s

            return (
              <div key={`${isPast}:${s}`} className="bili-suggestion-row">
                <button type="button" className="bili-suggestion-main" onClick={() => onSearch(s)}>
                  <span className="bili-sug-icon">{isPast ? <HistoryGlyph /> : <SearchGlyph />}</span>
                  <span className="bili-sug-label">
                    {isMatch ? (
                      <>
                        <span className="bili-sug-prefix">{prefix}</span>
                        <span className="bili-sug-rest">{rest}</span>
                      </>
                    ) : (
                      <span className="bili-sug-rest">{s}</span>
                    )}
                  </span>
                  {isPast && <span className="bili-sug-history-badge">历史</span>}
                </button>
                <button
                  type="button"
                  className="bili-suggestion-fill-btn"
                  aria-label={`填充 ${s}`}
                  onClick={() => onFill(`${s} `)}
                >
                  <FillGlyph />
                </button>
              </div>
            )
          })
        ) : (
          <div className="bili-sug-empty">按回车直接搜索 &ldquo;{query}&rdquo;</div>
        )}
      </div>
    </div>
  )
}
