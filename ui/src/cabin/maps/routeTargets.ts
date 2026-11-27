import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { formatTripDistance } from '../../shared/format'
import type { RouteTargetInfo } from '../../shared/host'
import { nearestCity } from '../dashboard/destination'
import { type LiveState, useLive } from '../state/store'
import { type Strings, useText } from '../state/text'
import { type MapLabel, useMapData } from './mapData'
import { type Destination, type DestinationKind, nameOf, usePlaces } from './places'

export interface OverviewStopItem {
  /** Map node uid in lowercase hex (empty string only in synthetic previews lacking target uids). */
  uid: string
  /** Stable React/DOM identity key for list items. */
  key: string
  /** World coordinates `[x, z]` in game metres. */
  position: [number, number]
  /** Matched node index along `route.nodes`, or `null` if not directly indexed. */
  nodeIndex: number | null
  /** True only for the final target of an active freight job (cannot be moved or deleted). */
  locked: boolean
  /** True when this entry is the final target (current destination). */
  isDestination: boolean
  /** 1-based stop badge number for intermediate stops (`null` for destination). */
  stopNumber: number | null
  /** Matched place category from `places.json`, if known. */
  placeKind: DestinationKind | null
  /** Primary display title. */
  title: string
  /** Secondary metadata line (`Kind · City`, `Delivery · City`, etc.). */
  subtitle: string | null
  /** Formatted game-scaled distance along route from truck to this point, or `null`. */
  distance: string | null
  /** Whether this row can be edited/submitted via `setRouteStops`. */
  editable: boolean
}

export interface OverviewStopsSnapshot {
  routeId: number | null
  onJob: boolean
  items: readonly OverviewStopItem[]
  /** Leading slice length of `items` eligible for drag reordering (`items.length - 1` on a job, else `items.length`). */
  movableCount: number
  /** Number of intermediate stops (excluding final destination). */
  intermediateCount: number
}

const EMPTY_PLACE_MAP: ReadonlyMap<string, Destination> = new Map()
const placeByNodeCache = new WeakMap<readonly Destination[], ReadonlyMap<string, Destination>>()

/** Lazily indexes `places.json` by lowercase hex `node` and `also` UIDs for O(1) waypoint lookups. */
export function indexPlacesByNode(places: readonly Destination[] | null | undefined): ReadonlyMap<string, Destination> {
  if (!places || places.length === 0) return EMPTY_PLACE_MAP
  let cached = placeByNodeCache.get(places)
  if (!cached) {
    const map = new Map<string, Destination>()
    for (const place of places) {
      const node = place.node.toLowerCase()
      if (!map.has(node)) map.set(node, place)
      if (place.also) {
        const also = place.also.toLowerCase()
        if (!map.has(also)) map.set(also, place)
      }
    }
    placeByNodeCache.set(places, map)
    cached = map
  }
  return cached
}

function rawTargetsOf(
  state: Pick<LiveState, 'route' | 'routeStops' | 'routeTargets' | 'job'>,
): readonly RouteTargetInfo[] {
  if (!state.route || state.route.nodes.length === 0) return []
  if (state.routeTargets.length > 0) return state.routeTargets
  const fallback: RouteTargetInfo[] = []
  for (const nodeIndex of state.routeStops) {
    const node = state.route.nodes[nodeIndex]
    if (!node) continue
    fallback.push({
      uid: '',
      position: node.position,
      nodeIndex,
      locked: false,
    })
  }
  const lastIndex = state.route.nodes.length - 1
  const end = state.route.nodes[lastIndex]
  if (end) {
    fallback.push({
      uid: '',
      position: end.position,
      nodeIndex: lastIndex,
      locked: state.job !== null,
    })
  }
  return fallback
}

function targetDistanceOf(
  target: RouteTargetInfo,
  isDestination: boolean,
  route: NonNullable<LiveState['route']>,
  routeNext: number,
  navigationDistance: number,
  decimal: string,
  mph: boolean,
): string | null {
  if (!Number.isFinite(navigationDistance) || navigationDistance <= 0) return null
  if (isDestination) return formatTripDistance(navigationDistance, decimal, mph)
  if (target.nodeIndex === null || target.nodeIndex < routeNext) return null
  const leftFromStop = route.distances[target.nodeIndex]
  if (leftFromStop === undefined || !Number.isFinite(leftFromStop)) return null
  const toStop = navigationDistance - leftFromStop
  return toStop > 0 ? formatTripDistance(toStop, decimal, mph) : null
}

/**
 * Resolves the ordered overview stops/destination list for both active freight jobs (`onJob = true`,
 * destination locked at bottom) and free-roam routes (`onJob = false`, every point editable).
 * Optional `optimisticUids` overrides the editable slice order immediately after a user drag/delete
 * while awaiting the game's replanned route snapshot.
 */
export function resolveOverviewStops(
  state: Pick<LiveState, 'route' | 'routeNext' | 'routeStops' | 'routeTargets' | 'telemetry' | 'job' | 'mph'>,
  places: readonly Destination[] | null | undefined,
  labels: readonly MapLabel[],
  text: Strings,
  optimisticUids: readonly string[] | null = null,
): OverviewStopsSnapshot {
  const route = state.route
  if (!route || route.nodes.length === 0) {
    return { routeId: null, onJob: state.job !== null, items: [], movableCount: 0, intermediateCount: 0 }
  }
  const baseTargets = rawTargetsOf(state)
  if (baseTargets.length === 0) {
    return { routeId: route.id, onJob: state.job !== null, items: [], movableCount: 0, intermediateCount: 0 }
  }
  const onJob = state.job !== null || baseTargets.some((target) => target.locked)
  let effectiveTargets: readonly RouteTargetInfo[] = baseTargets
  if (optimisticUids !== null) {
    const byUid = new Map<string, RouteTargetInfo>()
    for (const target of baseTargets) {
      if (target.uid) byUid.set(target.uid.toLowerCase(), target)
    }
    const chosen: RouteTargetInfo[] = []
    for (const uid of optimisticUids) {
      const found = byUid.get(uid.toLowerCase())
      if (found) chosen.push(found)
    }
    if (onJob) {
      const lockedDest = baseTargets[baseTargets.length - 1]
      effectiveTargets = [...chosen.filter((item) => item !== lockedDest), lockedDest]
    } else {
      effectiveTargets = chosen
    }
  }

  const placeMap = indexPlacesByNode(places)
  const navDistance = optimisticUids === null ? (state.telemetry?.navigationDistance ?? 0) : 0
  const items: OverviewStopItem[] = effectiveTargets.map((target, index) => {
    const isDestination = index === effectiveTargets.length - 1
    const locked = isDestination && onJob
    const stopNumber = isDestination ? null : index + 1
    const uid = target.uid.toLowerCase()
    const place = uid ? (placeMap.get(uid) ?? null) : null

    let title: string
    let subtitle: string | null = null
    let placeKind: DestinationKind | null = place?.kind ?? null

    if (locked && state.job) {
      if (!state.job.cargoLoaded) {
        title =
          state.job.sourceCompany ||
          state.job.sourceCity ||
          (place
            ? nameOf(place, text.destinations.kinds[place.kind])
            : (nearestCity(target.position, labels) ?? text.destination))
        subtitle =
          [text.pickup, state.job.sourceCompany ? state.job.sourceCity : null].filter(Boolean).join(' · ') || null
      } else {
        title =
          state.job.destinationCompany ||
          state.job.destinationCity ||
          (place
            ? nameOf(place, text.destinations.kinds[place.kind])
            : (nearestCity(target.position, labels) ?? text.destination))
        subtitle =
          [text.delivery, state.job.destinationCompany ? state.job.destinationCity : null]
            .filter(Boolean)
            .join(' · ') || null
      }
    } else if (place) {
      const kindName = text.destinations.kinds[place.kind]
      title = nameOf(place, kindName)
      subtitle =
        [kindName !== title ? kindName : null, place.city && place.city !== title ? place.city : null]
          .filter(Boolean)
          .join(' · ') || null
    } else {
      const city = nearestCity(target.position, labels)
      title = city ?? (isDestination ? text.destination : text.mapPoint)
      subtitle = city ? text.mapPoint : null
      placeKind = null
    }

    const distance = targetDistanceOf(
      target,
      isDestination,
      route,
      state.routeNext,
      navDistance,
      text.decimal,
      state.mph,
    )
    return {
      uid,
      key: uid
        ? `uid:${uid}`
        : `fallback:${target.nodeIndex ?? index}:${target.position[0].toFixed(1)},${target.position[1].toFixed(1)}`,
      position: target.position,
      nodeIndex: target.nodeIndex,
      locked,
      isDestination,
      stopNumber,
      placeKind,
      title,
      subtitle,
      distance,
      editable: !locked && uid.length > 0,
    }
  })

  const movableCount = onJob ? Math.max(0, items.length - 1) : items.length
  const intermediateCount = Math.max(0, items.length - 1)
  return { routeId: route.id, onJob, items, movableCount, intermediateCount }
}

/**
 * Pure reorder transform enforcing job vs free-roam endpoint rules:
 * - On a job (`onJob = true`): only `0 .. items.length - 2` are movable; `toIndex` is clamped within that
 *   range so nothing can move past the locked job destination.
 * - Off a job (`onJob = false`): every item including the final destination participates in reordering.
 */
export function reorderOverviewStops(
  items: readonly OverviewStopItem[],
  onJob: boolean,
  fromIndex: number,
  toIndex: number,
): { items: OverviewStopItem[]; submitUids: string[] } | null {
  const movableCount = onJob ? Math.max(0, items.length - 1) : items.length
  if (movableCount < 2) return null
  if (fromIndex < 0 || fromIndex >= movableCount) return null
  const clampedTo = Math.max(0, Math.min(movableCount - 1, toIndex))
  if (clampedTo === fromIndex) return null
  const movable = items.slice(0, movableCount)
  const [moved] = movable.splice(fromIndex, 1)
  if (moved.locked) return null
  movable.splice(clampedTo, 0, moved)
  const nextItems = onJob ? [...movable, items[items.length - 1]] : movable
  const editableSlice = onJob ? movable : nextItems
  if (editableSlice.some((item) => !item.uid)) return null
  return {
    items: nextItems,
    submitUids: editableSlice.map((item) => item.uid),
  }
}

/**
 * Pure delete transform enforcing job vs free-roam endpoint rules:
 * - Refuses to delete a locked job destination.
 * - Deleting the last remaining intermediate stop on a job yields `submitUids: []`, `endsRoute: false`.
 * - Deleting the only remaining point off a job yields `submitUids: []`, `endsRoute: true`.
 */
export function deleteOverviewStop(
  items: readonly OverviewStopItem[],
  onJob: boolean,
  index: number,
): { items: OverviewStopItem[]; submitUids: string[]; endsRoute: boolean } | null {
  const target = items[index]
  if (!target || target.locked) return null
  if (onJob && index >= items.length - 1) return null
  const nextItems = items.filter((_, i) => i !== index)
  const editableSlice = onJob ? nextItems.slice(0, Math.max(0, nextItems.length - 1)) : nextItems
  if (editableSlice.some((item) => !item.uid)) return null
  return {
    items: nextItems,
    submitUids: editableSlice.map((item) => item.uid),
    endsRoute: !onJob && nextItems.length === 0,
  }
}

/**
 * Quantized hook for `OverviewStopsCard`: avoids 20 Hz telemetry re-renders by subscribing only to
 * structural route/target/job fields plus formatted per-stop distance strings.
 */
export function useOverviewStops(
  optimistic: { routeId: number; uids: readonly string[] } | null,
): OverviewStopsSnapshot {
  const text = useText()
  const places = usePlaces()
  const mapData = useMapData()
  const labels = mapData?.labels ?? EMPTY_LABELS

  const slice = useLive(
    useShallow((state) => {
      const route = state.route
      const raw = rawTargetsOf(state)
      const navDistance = state.telemetry?.navigationDistance ?? 0
      const distancesKey =
        route && raw.length > 0 && navDistance > 0
          ? raw
              .map(
                (target, index) =>
                  targetDistanceOf(
                    target,
                    index === raw.length - 1,
                    route,
                    state.routeNext,
                    navDistance,
                    text.decimal,
                    state.mph,
                  ) ?? '',
              )
              .join('\0')
          : ''
      return {
        route,
        routeNext: state.routeNext,
        routeStops: state.routeStops,
        routeTargets: state.routeTargets,
        job: state.job,
        mph: state.mph,
        distancesKey,
      }
    }),
  )

  return useMemo(() => {
    const activeOptimistic = optimistic && slice.route && optimistic.routeId === slice.route.id ? optimistic.uids : null
    const snapshot = resolveOverviewStops(
      {
        ...slice,
        telemetry: useLive.getState().telemetry,
      },
      places,
      labels,
      text,
      activeOptimistic,
    )
    if (activeOptimistic !== null || !slice.distancesKey) return snapshot
    const parts = slice.distancesKey.split('\0')
    if (parts.length !== snapshot.items.length) return snapshot
    return {
      ...snapshot,
      items: snapshot.items.map((item, idx) => ({ ...item, distance: parts[idx] || null })),
    }
  }, [slice, places, labels, text, optimistic])
}

const EMPTY_LABELS: readonly MapLabel[] = []
