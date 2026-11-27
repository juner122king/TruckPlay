import maplibregl from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { roadSpeed } from '../../shared/format'
import { MapResourceCache } from '../../shared/idleResources'
import type { Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import {
  CORRIDOR_MIN_ZOOM,
  type CorridorRoute,
  isPointInsideViewport,
  nearestAheadOnCorridor,
  removeUnusedMarkers,
  type UpcomingCorridor,
} from './corridor'
import { useMapData } from './mapData'
import { toLngLat } from './projection'

export interface SpeedCamera {
  x: number
  y: number
  z: number
  heading: number
  reverse: boolean
}

const MAX_MARKERS = 1

const CAMERA_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M4.5 9.5A2 2 0 0 1 6.5 7.5h7a2 2 0 0 1 2 2v1.2l3.3-2a.8.8 0 0 1 1.2.7v5.2a.8.8 0 0 1-1.2.7l-3.3-2v1.2a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-5Z" fill="currentColor"/>' +
  '<circle cx="10" cy="12" r="2.1" fill="#181b20"/>' +
  '<path d="M10 17.5v3M7 20.5h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
  '</svg>'

const loading = new MapResourceCache<SpeedCamera[]>()
const loadedByUrl = new Map<string, SpeedCamera[] | null>()

/** Fetches and caches fixed speed cameras for `url`. */
export function loadSpeedCameras(url: string): Promise<SpeedCamera[] | null> {
  return loading.load(url, () =>
    fetch(url)
      .then((response) => (response.ok ? (response.json() as Promise<SpeedCamera[]>) : null))
      .then((data) => {
        loadedByUrl.set(url, data)
        return data
      }),
  )
}

/** Ensures `url` is fetched in the background (for non-React frame loops such as `liveMap.ts`). */
export function ensureSpeedCameras(url: string | null): void {
  if (!url || loadedByUrl.has(url)) return
  void loadSpeedCameras(url).catch(() => loadedByUrl.set(url, null))
}

/** Synchronous cache lookup for `liveMap.ts` frame sync. */
export function getLoadedSpeedCameras(url: string | null): readonly SpeedCamera[] {
  return (url && loadedByUrl.get(url)) || []
}

/** Fixed speed cameras of the active map (`null` when unavailable, `undefined` while loading). */
export function useSpeedCameras(): SpeedCamera[] | null | undefined {
  const map = useMapData()
  const url = map?.speedCameras ?? null
  const [loaded, setLoaded] = useState<{ url: string; cameras: SpeedCamera[] | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let current = true
    loadSpeedCameras(url).then((cameras) => current && setLoaded({ url, cameras }))
    return () => {
      current = false
    }
  }, [url])
  if (map === undefined) return undefined
  if (!url) return null
  return loaded?.url === url ? loaded.cameras : undefined
}

export interface NearestSpeedCamera {
  camera: SpeedCamera
  distance: number
}

const CAMERA_CELL_SIZE = 4000
const cameraGridCache = new WeakMap<readonly SpeedCamera[], Map<string, SpeedCamera[]>>()
const nearbyCellCache = new WeakMap<readonly SpeedCamera[], { key: string; items: readonly SpeedCamera[] }>()

function cameraGridFor(cameras: readonly SpeedCamera[]): Map<string, SpeedCamera[]> {
  let grid = cameraGridCache.get(cameras)
  if (!grid) {
    grid = new Map()
    for (const camera of cameras) {
      if (!Number.isFinite(camera.x) || !Number.isFinite(camera.z)) continue
      const key = `${Math.floor(camera.x / CAMERA_CELL_SIZE)},${Math.floor(camera.z / CAMERA_CELL_SIZE)}`
      let bucket = grid.get(key)
      if (!bucket) {
        bucket = []
        grid.set(key, bucket)
      }
      bucket.push(camera)
    }
    cameraGridCache.set(cameras, grid)
  }
  return grid
}

function nearbyCameras(cameras: readonly SpeedCamera[], x: number, z: number): readonly SpeedCamera[] {
  // Small maps/test fixtures need no grid overhead.
  if (cameras.length <= 32) return cameras
  const cx = Math.floor(x / CAMERA_CELL_SIZE)
  const cz = Math.floor(z / CAMERA_CELL_SIZE)
  const cellKey = `${cx},${cz}`
  const cached = nearbyCellCache.get(cameras)
  if (cached && cached.key === cellKey) return cached.items
  const grid = cameraGridFor(cameras)
  const out: SpeedCamera[] = []
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(`${cx + dx},${cz + dz}`)
      if (bucket) {
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i])
      }
    }
  }
  nearbyCellCache.set(cameras, { key: cellKey, items: out })
  return out
}

/**
 * Finds the nearest fixed speed camera ahead in the vehicle's driving corridor,
 * using the exact same corridor geometry and rules as `nearestTrafficLightAhead`.
 */
export function nearestSpeedCameraAhead(
  cameras: readonly SpeedCamera[],
  telemetry: Telemetry | null,
  route: CorridorRoute | null = null,
  routeNext = 0,
  precomputedUpcoming?: UpcomingCorridor | null,
): NearestSpeedCamera | null {
  if (!telemetry || cameras.length === 0) return null
  const candidates = nearbyCameras(cameras, telemetry.x, telemetry.z)
  if (candidates.length === 0) return null
  const found = nearestAheadOnCorridor(candidates, telemetry, route, routeNext, () => true, precomputedUpcoming)
  return found ? { camera: found.item, distance: found.distance } : null
}

export interface SpeedCameraElements {
  badge: HTMLDivElement
  pin: HTMLDivElement
  limitBox: HTMLDivElement
  limitText: HTMLSpanElement
}

export interface SpeedCameraPool {
  markers: maplibregl.Marker[]
  elements: SpeedCameraElements[]
}

/** Creates a reusable pool of MapLibre DOM markers for fixed speed cameras. */
export function createSpeedCameraPool(): SpeedCameraPool {
  const markers: maplibregl.Marker[] = []
  const elements: SpeedCameraElements[] = []

  for (let i = 0; i < MAX_MARKERS; i++) {
    const badge = document.createElement('div')
    badge.className = 'speed-camera-badge'

    const pin = document.createElement('div')
    pin.className = 'speed-camera-pin'

    const icon = document.createElement('div')
    icon.className = 'speed-camera-icon'
    icon.innerHTML = CAMERA_SVG

    const limitBox = document.createElement('div')
    limitBox.className = 'speed-camera-limit-box'

    const limitText = document.createElement('span')
    limitText.className = 'speed-camera-limit'
    limitBox.appendChild(limitText)

    pin.appendChild(icon)
    pin.appendChild(limitBox)
    badge.appendChild(pin)

    const marker = new maplibregl.Marker({
      element: badge,
      anchor: 'bottom',
      offset: [0, -8],
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })

    markers.push(marker)
    elements.push({ badge, pin, limitBox, limitText })
  }

  return { markers, elements }
}

interface SpeedCameraRenderState {
  connected: boolean
  limit: number
  overspeed: boolean
  lng: number
  lat: number
}

const cameraPoolRenderState = new WeakMap<SpeedCameraPool, SpeedCameraRenderState>()

/**
 * Synchronizes speed camera markers on the map using the same display rules as traffic lights:
 * displays only the single nearest speed camera ahead in the driving corridor when `zoom >= 13.5` and not hidden.
 */
export function syncSpeedCameras(
  map: maplibregl.Map,
  pool: SpeedCameraPool,
  cameras: readonly SpeedCamera[],
  hidden = false,
  precomputed?: NearestSpeedCamera | null,
) {
  const { telemetry, route, routeNext, mph } = useLive.getState()
  const zoom = map.getZoom()

  const clearPool = () => {
    const prev = cameraPoolRenderState.get(pool)
    if (prev && !prev.connected && pool.markers.length <= 1) return
    removeUnusedMarkers(pool.markers, 0)
    if (prev) prev.connected = false
  }

  if (hidden || zoom < CORRIDOR_MIN_ZOOM || cameras.length === 0 || !telemetry) {
    clearPool()
    return
  }

  const nearest =
    precomputed !== undefined ? precomputed : nearestSpeedCameraAhead(cameras, telemetry, route, routeNext)
  if (!nearest) {
    clearPool()
    return
  }

  const c = nearest.camera
  if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) {
    clearPool()
    return
  }

  const lngLat = toLngLat(c.x, c.z)
  if (!isPointInsideViewport(map, lngLat)) {
    clearPool()
    return
  }

  const { badge, limitBox, limitText } = pool.elements[0]
  const marker = pool.markers[0]

  const limit = roadSpeed(telemetry.navigationSpeedLimit, mph)
  const speed = roadSpeed(telemetry.speed, mph)
  const overspeed = limit > 0 && speed > limit

  let prev = cameraPoolRenderState.get(pool)
  const connectedNow = marker.getElement().isConnected
  if (
    prev &&
    connectedNow &&
    prev.connected &&
    prev.limit === limit &&
    prev.overspeed === overspeed &&
    Math.abs(prev.lng - lngLat[0]) < 1e-7 &&
    Math.abs(prev.lat - lngLat[1]) < 1e-7
  ) {
    if (pool.markers.length > 1) removeUnusedMarkers(pool.markers, 1)
    return
  }

  if (!prev || prev.overspeed !== overspeed || (prev.limit <= 0) !== (limit <= 0)) {
    if (badge.classList) {
      badge.classList.toggle('overspeed', overspeed)
      badge.classList.toggle('no-limit', limit <= 0)
    } else {
      badge.className = `speed-camera-badge${overspeed ? ' overspeed' : ''}${limit <= 0 ? ' no-limit' : ''}`
    }
  }

  if (!prev || prev.limit !== limit) {
    if (limit > 0) {
      limitBox.style.display = 'flex'
      limitText.textContent = `${limit}`
    } else {
      limitBox.style.display = 'none'
      limitText.textContent = ''
    }
  }

  if (!prev || !connectedNow || Math.abs(prev.lng - lngLat[0]) >= 1e-7 || Math.abs(prev.lat - lngLat[1]) >= 1e-7) {
    marker.setLngLat(lngLat)
  }
  if (!connectedNow) {
    marker.addTo(map)
  }

  if (!prev) {
    prev = { connected: true, limit, overspeed, lng: lngLat[0], lat: lngLat[1] }
    cameraPoolRenderState.set(pool, prev)
  } else {
    prev.connected = true
    prev.limit = limit
    prev.overspeed = overspeed
    prev.lng = lngLat[0]
    prev.lat = lngLat[1]
  }

  if (pool.markers.length > 1) {
    removeUnusedMarkers(pool.markers, 1)
  }
}
