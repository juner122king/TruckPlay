import { MapResourceCache } from '../../shared/idleResources'
import { useEffect, useState } from 'react'
import { useMapData } from './mapData'
import { fromLngLat, metresBetween } from './projection'

/**
 * Where the player can be routed (Maps' search, Destinations): every place on the map, and cities, from the
 * map export (crates/mapdata, `places.json` beside the tiles), each with the map node the game's GPS takes it
 * as.
 *
 * DEVELOPMENT ONLY for now, like the map itself (mapData.ts).
 */

export type DestinationKind =
  | 'fuel'
  | 'service'
  | 'garage'
  | 'dealer'
  | 'company'
  | 'parking'
  | 'hotel'
  | 'recruitment'
  | 'weigh'
  | 'ferry'
  | 'train'
  | 'city'

export interface Destination {
  kind: DestinationKind
  /** Its name (in the player's language, or its own), if it has one; a city's own name. */
  name?: string
  /** A city's name in the player's language, when that's different. */
  localized?: string
  /** The city it's in (in the player's language), and its id (as the save names it). */
  city?: string
  cityId?: string
  /** lng, lat */
  at: [number, number]
  /** The map node the game routes to (its uid, hex). */
  node: string
  /** The other end of the lane past it, in a service area: a route goes to whichever it comes to last. */
  also?: string
}

const loading = new MapResourceCache<Destination[]>()

/** The places of a map, cached for the two most recently used versions. */
function loadPlaces(url: string): Promise<Destination[] | null> {
  return loading.load(url, () =>
    fetch(url).then((response) => (response.ok ? (response.json() as Promise<Destination[]>) : null)),
  )
}

/** The places of the map shown, `null` if there are none, `undefined` while they load (first asked for when
 * needed). */
export function usePlaces(): Destination[] | null | undefined {
  const map = useMapData()
  const url = map?.places ?? null
  const [loaded, setLoaded] = useState<{ url: string; places: Destination[] | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let current = true
    loadPlaces(url).then((places) => current && setLoaded({ url, places }))
    return () => {
      current = false
    }
  }, [url])
  if (map === undefined) return undefined
  if (!url) return null
  return loaded?.url === url ? loaded.places : undefined
}

/** A place's name as shown: a city's in the player's language, else its own (or what it is, `generic`). */
export function nameOf(place: Destination, generic: string): string {
  return place.localized ?? place.name ?? generic
}

/** Text folded for matching: lower case, accents off, the Turkish dotted and dotless i alike, and hiragana as
 * katakana (the Japanese keyboard types hiragana; the game names places in katakana: ぱり finds パリ). */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[ぁ-ゖ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) + 0x60))
}

const words = (text: string) =>
  fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** How far `place` is from `from` (lng, lat), metres; `Infinity` without a `from`. */
export function distanceTo(place: Destination, from: [number, number] | null): number {
  return from ? metresBetween(place.at, from) : Infinity
}

export interface IndexedPlace {
  place: Destination
  foldedNames: readonly string[]
  ownWords: readonly string[]
  cityWords: readonly string[]
  world: [number, number]
}

const placeIndexCache = new WeakMap<readonly Destination[], readonly IndexedPlace[]>()

/** Lazily pre-indexes normalized search tokens and projected world coordinates once per places array. */
export function indexedPlaces(places: readonly Destination[]): readonly IndexedPlace[] {
  let index = placeIndexCache.get(places)
  if (!index) {
    index = places.map((place) => {
      const foldedNames: string[] = []
      if (place.name) foldedNames.push(fold(place.name))
      if (place.localized) foldedNames.push(fold(place.localized))
      return {
        place,
        foldedNames,
        ownWords: words(`${place.name ?? ''} ${place.localized ?? ''}`),
        cityWords: place.city ? words(place.city) : [],
        world: fromLngLat(place.at[0], place.at[1]),
      }
    })
    placeIndexCache.set(places, index)
  }
  return index
}

/** At most this many results. */
const RESULTS = 40

/**
 * The places matching `query`: each of its words starts a word of the place's name, its city, or what it is
 * (`kindNames`, in the player's language: "fuel" finds filling stations). Those whose name starts with the
 * whole query come first (cities before the rest), then those whose name has every word, then the rest
 * (places in a city of that name); each group nearest first (from the truck, `from`).
 */
export function searchPlaces(
  places: readonly Destination[],
  query: string,
  from: [number, number] | null,
  kindNames: Record<DestinationKind, string>,
  distanceOf: (place: Destination) => number = (place) => distanceTo(place, from),
): Destination[] {
  const asked = words(query)
  if (asked.length === 0) return []
  const whole = fold(query.trim())
  const kindWordMap: Partial<Record<DestinationKind, string[]>> = {}
  const kindWordsOf = (kind: DestinationKind): string[] => {
    let cached = kindWordMap[kind]
    if (!cached) {
      cached = words(kindNames[kind] ?? '')
      kindWordMap[kind] = cached
    }
    return cached
  }
  const indexed = indexedPlaces(places)
  const found: { place: Destination; group: number; distance: number }[] = []
  for (let i = 0; i < indexed.length; i++) {
    const entry = indexed[i]
    const { place, foldedNames, ownWords, cityWords } = entry
    const kindWords = kindWordsOf(place.kind)
    let matchedAll = true
    let matchedOwn = true
    for (let w = 0; w < asked.length; w++) {
      const needle = asked[w]
      let inOwn = false
      for (let k = 0; k < ownWords.length; k++) {
        if (ownWords[k].startsWith(needle)) {
          inOwn = true
          break
        }
      }
      if (!inOwn) {
        matchedOwn = false
        let inOther = false
        for (let k = 0; k < cityWords.length; k++) {
          if (cityWords[k].startsWith(needle)) {
            inOther = true
            break
          }
        }
        if (!inOther) {
          for (let k = 0; k < kindWords.length; k++) {
            if (kindWords[k].startsWith(needle)) {
              inOther = true
              break
            }
          }
        }
        if (!inOther) {
          matchedAll = false
          break
        }
      }
    }
    if (!matchedAll) continue
    let startsWhole = false
    for (let n = 0; n < foldedNames.length; n++) {
      if (foldedNames[n].startsWith(whole)) {
        startsWhole = true
        break
      }
    }
    const group = startsWhole ? (place.kind === 'city' ? 0 : 1) : matchedOwn ? 2 : 3
    found.push({ place, group, distance: distanceOf(place) })
  }
  found.sort((a, b) => a.group - b.group || a.distance - b.distance)
  return found.slice(0, RESULTS).map(({ place }) => place)
}

/** The nearest places of `kind` to `from`, at most `count`. */
export function nearestOfKind(
  places: readonly Destination[],
  kind: DestinationKind,
  from: [number, number] | null,
  count = RESULTS,
): Destination[] {
  return places
    .filter((place) => place.kind === kind)
    .map((place) => ({ place, distance: distanceTo(place, from) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .map(({ place }) => place)
}

/** The player's own garages (in the cities the save says they own one), their headquarters' first. */
export function ownGarages(
  places: readonly Destination[],
  owned: readonly string[],
  headquarters: string | null,
): Destination[] {
  return places
    .filter((place) => place.kind === 'garage' && place.cityId !== undefined && owned.includes(place.cityId))
    .sort((a, b) => Number(b.cityId === headquarters) - Number(a.cityId === headquarters))
}
