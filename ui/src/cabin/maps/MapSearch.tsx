import { useEffect, useState } from 'react'
import { SearchGlyph } from '../keyboard/glyphs'
import { useKeyboard } from '../keyboard/store'
import { TextField } from '../keyboard/TextField'
import { useText } from '../state/text'
import { Destinations } from './Destinations'

/** How long the word that the game took a change stays over the map, ms. */
const CONFIRMATION_MS = 2500
/** Must match the panel's closing animation in maps.css: how long it takes to slide away, ms. */
const CLOSING_MS = 280
const FIELD = 'map-search'

/**
 * Maps' search drawer, toggled from the bottom-right dock: opens Destinations (Destinations.tsx) on the left
 * beside the sidebar, where offered routes are framed clearly to its right (`panelCover` in liveMap.ts).
 * The keyboard comes up when the field is pressed, not with the panel. A change the game takes closes it,
 * with a confirmation pill over the map.
 */
export function MapSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const text = useText()
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>(open ? 'open' : 'closed')
  const [query, setQuery] = useState('')
  const [confirmation, setConfirmation] = useState<{ text: string; id: number } | null>(null)
  const typing = useKeyboard((state) => state.field?.id === FIELD)

  if (open && phase !== 'open') setPhase('open')
  if (!open && phase === 'open') setPhase('closing')

  useEffect(() => {
    if (!open) useKeyboard.getState().detach(FIELD)
  }, [open])

  useEffect(() => {
    if (!confirmation) return
    const timer = setTimeout(() => setConfirmation(null), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [confirmation])

  useEffect(() => {
    if (phase !== 'closing') return
    const timer = setTimeout(() => {
      setPhase('closed')
      setQuery('')
    }, CLOSING_MS)
    return () => clearTimeout(timer)
  }, [phase])

  const close = () => {
    useKeyboard.getState().detach(FIELD)
    onClose()
  }

  return (
    <>
      {phase !== 'closed' && (
        <div className={`map-search glass${typing ? ' typing' : ''}${phase === 'closing' ? ' closing' : ''}`}>
          <div className="map-search-top">
            <TextField
              id={FIELD}
              value={query}
              onChange={setQuery}
              returnKind="search"
              hint={text.searchPlaces}
              label={text.search}
              icon={<SearchGlyph />}
            />
            <button type="button" className="map-search-close" aria-label={text.close} onClick={close}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          </div>
          <div className="destinations">
            <Destinations
              query={query}
              field={FIELD}
              onDone={(message) => {
                close()
                setConfirmation({ text: message, id: Date.now() })
              }}
            />
          </div>
        </div>
      )}
      {confirmation && (
        <div key={confirmation.id} className="map-confirmation glass" role="status">
          {confirmation.text}
        </div>
      )}
    </>
  )
}
