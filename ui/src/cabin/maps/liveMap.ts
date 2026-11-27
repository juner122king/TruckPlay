import { idleDisposal } from '../../shared/idleResources'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url'
import { displayClock, LEAST_PACE, LITE_PACE, mapFrameDue } from './frameCap'
import { create as createStore } from 'zustand'
import { postToHost, type Telemetry } from '../../shared/host'
import type { Appearance } from '../state/appearance'
import { recordRenderedFrame } from '../state/frameMeter'
import { type LiveState, useCabin, useLive } from '../state/store'
import { textScale } from '../state/textSize'
import {
  AUTO_RECENTRE_MS,
  BASE_FOLLOW_PITCH,
  bearingOf,
  blendPadding,
  blendPose,
  type CameraPadding,
  type CameraPose,
  clampZoomOffset,
  damp,
  dampBearing,
  type DynamicCameraSettings,
  easeInOut,
  FOLLOW_DELAY_MS,
  GLIDE_MS,
  navigationCameraFor,
  navZoomOffsetFor,
  samePadding,
  samePose,
  type TruckSample,
  truckAt,
  visualCenterPadding,
  zoomForSpeed,
  zoomOffsetFor,
} from './camera'
import { physicalGuidanceFor } from './guidanceDistance'
import { buildingFilter, type Canopy, canopiesOver } from './buildings'
import { labelLines, placeLabels } from './labels'
import { NO_ENTRY_ICON, drawNoEntry, drawPlaceIcon, parsePlaceIcon } from './placeIcons'
import { PlaceIconCache } from './placeIconCache'
import { type BuildingMeshes, buildingMeshes } from './buildingMeshes'
import { type RaisedRoads, raisedRoads } from './raisedRoads'
import {
  createSpeedCameraPool,
  ensureSpeedCameras,
  getLoadedSpeedCameras,
  syncSpeedCameras,
  type SpeedCameraPool,
} from './speedCameras'
import { createTrafficLightPool, syncTrafficLights, type TrafficLightPool } from './trafficLights'
import { corridorMatchesFor } from './navigationSnapshot'
import { cameraBounds, type MapData } from './mapData'
import { loadView, type SavedView, saveView } from './mapView'
import { createOverviewSession, routeBounds } from './routeOverview'
import { fromLngLat, labelRange, metresBetween, toLngLat } from './projection'
import {
  approachLine,
  cutRaised,
  headLine,
  heightOnSpan,
  type Heights,
  type Point,
  routeAhead,
  type Progress,
  progressOf,
  type RaisedLine,
  restLine,
  routeHeights,
  routeSpans,
  snapToRoute,
  type Spans,
} from './route'
import {
  BUILDING_FLAT_LAYER,
  BUILDING_LAYER,
  MAP_SOURCE,
  SURFACE_SOURCE,
  mapStyle,
  OFFERED_SOURCE,
  PLAYERS_SOURCE,
  paintFor,
  placeImagesFor,
  ROUTE_HEAD_SOURCE,
  ROUTE_SOURCE,
  TRAFFIC_SOURCE,
} from './style'
import { corridorOf, type TrafficStretch, trafficAlong } from './traffic'
import { setMapView, setRouteAhead, useTruckersMp } from './truckersmp'
import { type Area, type OtherPlayer, trackAt } from './truckersmpFeed'
import { addSeaProtocol } from './seaTiles'

/**
 * The one live map of the page. It's made once and moved between the screens that show it (the
 * Dashboard's map tile, the Maps app), so opening either is instant: no new WebGL context, no parsing
 * the map again, and the camera carries on where it was.
 *
 * It follows the truck. In the Maps app the player can also move it (holding the interaction key): drag
 * to pan, right-drag to turn, the wheel or the zoom buttons to zoom. Moving it leaves the truck behind
 * (browsing) until the recentre button, or a while without touching it, glides it back; zooming while
 * following only brings the following camera closer or further.
 */

// MapLibre's worker as its own file: the copy inlined in its main bundle never starts once Vite has
// pre-bundled it.
maplibregl.setWorkerUrl(workerUrl)

/** The driving view's tilt, degrees. */
const PITCH = BASE_FOLLOW_PITCH
/** The truck sits this far down the map (share of its height above it), leaving the road ahead in view. */
const PUCK_FROM_TOP = 0.66
/** How quickly the map turns after the truck (ms): slow enough to feel calm, quick enough to keep up. */
const BEARING_TAU_MS = 450
const ZOOM_TAU_MS = 1500
const NAV_ZOOM_TAU_MS = 1100
const NAV_PITCH_TAU_MS = 1000
/** How smoothly the camera shifts horizontally/vertically as HUD overlays appear or resize, ms. */
const PADDING_TAU_MS = 280
const SAMPLES_KEPT = 8
/** Place names' type size (a second line smaller: labelLines; both times the player's text size,
 * `nameScale`), and halo (maps.css), and the space kept between two names, pixels. */
const LABEL_SIZE = 26
const LABEL_SECOND_SIZE = 20
const LABEL_HALO = 4
const LABEL_GAP = 16
/** How much the player's text size scales the map's names (state/textSize.ts). */
const nameScale = () => textScale(useCabin.getState().textSize)
/** How long the text size stays put before the map's names follow it, ms. */
const TEXT_SIZE_SETTLE_MS = 350
/** Stops the map following the text size (the map's own, let go of when this module is replaced in
 * development: the store outlives it). */
let stopTextSize: (() => void) | undefined
/** Releases window-level gesture listeners when the map is disposed or replaced. */
let stopInteractions: (() => void) | undefined
/** Zoom levels per wheel notch (120 units). */
const WHEEL_ZOOM = 0.5
const MIN_ZOOM = 9
const MAX_ZOOM = 19.5
/** How far the truck moves along the route before the route's head is drawn again from it, metres. */
const ROUTE_HEAD_STEP = 1.0
/** Spatial grid cell size (world metres) used to index city labels for O(1) viewport queries. */
const LABEL_CELL_METRES = 20_000

type Mode = 'follow' | 'browse' | 'return'

interface LiveMap {
  data: MapData
  map: maplibregl.Map
  /** The map's own container, moved into whichever screen shows it. */
  element: HTMLDivElement
  puck: maplibregl.Marker
  /** The roads at their real heights, on a map with them, and how high over the map the puck is drawn, m. */
  raised: RaisedRoads | null
  /** The buildings in their real shapes, on a map with them. */
  meshes: BuildingMeshes | null
  puckHeight: number
  /** The end of the route. */
  destination: maplibregl.Marker
  stops: { key: string; markers: maplibregl.Marker[] }
  /** The route drawn (`route`, as the store has it), as spans, with the span the rest of it is drawn after
   * and where its head was last drawn from (`null`: not drawn yet). */
  routeShown: {
    route: LiveState['route']
    spans: Spans
    restAfter: number | null
    headFrom: Point | null
    /** How high its points are drawn, as of which of `raised`'s tiles, and its stretches over the flat map. */
    heights: Heights
    heightsFor: number | null
    restRaised: RaisedLine[]
    headRaised: RaisedLine[]
  } | null
  /** Where the truck is along the route this frame (`null`: no route). */
  progress: Progress | null
  /** The canopies the truck is under, left out of the raised buildings (their ids, joined), and when they
   * were last looked for. */
  canopies: { hidden: string; at: number; lastX: number; lastZ: number }
  /** Place names, most important first; text sizes and DOM markers are created lazily when in view. */
  labels: {
    kind: string
    first: string
    second: string | null
    marker: maplibregl.Marker | null
    at: [number, number]
    world: [number, number]
    width: number | null
    height: number | null
  }[]
  /** Spatial cell index for city labels (keyed by `cx,cz` in `LABEL_CELL_METRES` cells). */
  labelGrid: Map<string, number[]>
  /** Indices of city labels currently mounted on the map. */
  activeLabels: Set<number>
  /** Lazily measures a label's CSS pixel box once it enters the candidate range. */
  measureLabel: (label: { first: string; second: string | null }) => { width: number; height: number }
  /** Cached container CSS pixel dimensions maintained via ResizeObserver to avoid per-frame layout reads. */
  containerSize: { width: number; height: number }
  resizeObserver: ResizeObserver | null
  /** Last applied puck and destination marker transforms to avoid redundant DOM mutations when stationary. */
  puckLast: { lng: number; lat: number; bearing: number; liftX: number; liftY: number } | null
  destLiftLast: { x: number; y: number } | null
  /** Bounded tracker for dynamically generated `place-*` icons so MapLibre's sprite atlas stays bounded. */
  placeIcons: PlaceIconCache
  /** Traffic light markers with real-time countdown timers. */
  trafficLights: TrafficLightPool
  /** Fixed speed camera markers ahead in the driving corridor. */
  speedCameras: SpeedCameraPool
  /** The appearance the page wants, and the one the map is painted in (they differ until it's restyled). */
  wanted: Appearance
  painted: Appearance
  /** The owned garages' cities the place icons show as the player's (`null`: not applied yet). */
  garagesShown: string | null
  /** TruckersMP's other players: how many were last drawn, when, and when the part of the map shown was last
   * told the reader. */
  playersShown: number
  playersDrawn: number
  viewTold: number
  /** Under TruckersMP, driving a route: the route ahead (its traffic shown on it), when it was last worked
   * out, and the read of the trucks along it last shown (`null`: to show anew). */
  ahead: Point[] | null
  aheadTold: number
  aheadShown: readonly OtherPlayer[] | null
  /** The following camera's damped bearing, zoom, tilt and visual-center padding. */
  camera: { bearing: number; zoom: number; pitch: number; padding: CameraPadding } | null
  mode: Mode
  /** Whether the screen showing it lets the player move it (the Maps app). */
  interactive: boolean
  /** A mouse button is held on the map: a drag may be starting, which moving the camera would cancel. */
  pressed: boolean
  /** When the player last moved the map, ms. */
  touched: number
  /** Showing the routes offered before Go (Directions): the map stays on them, not back on the truck. */
  overview: boolean
  /** Current-route overview is separate from offered-route preview. */
  routeOverviewZoom: number | null
  overviewNeedsFit: boolean
  /** Picks one of the routes offered, by its index, as its line on the map is tapped (`null`: none offered). */
  offeredPick: ((index: number) => void) | null
  /** How far the player zoomed the following camera from its speed zoom. */
  zoomOffset: number
  /** The zoom when browsing began: a different zoom when it ends is one the player chose, and kept. */
  browsedFrom: number
  /** The glide back onto the truck: where it set off from, its padding, and when. */
  glide: { from: CameraPose; fromPadding: CameraPadding; started: number } | null
  /** Following north up, from above (the compass tapped), rather than behind the truck; the arrow brings the
   * chase view back. */
  northUp: boolean
  /** The view the place names were last placed for (`null`: place them again), and when (ms). */
  labelsPlacedFor: string | null
  labelsPlacedAt: number
  /** The view as last kept (mapView.ts), and when it was last looked at. */
  kept: string
  keptAt: number
}

/** Whether the map is browsing away from the truck, showing route overview (timed or locked), or locked north up. */
export const useMapBrowsing = createStore<{
  browsing: boolean
  routeOverview: boolean
  routeOverviewLocked: boolean
  northUp: boolean
}>()(() => ({
  browsing: false,
  routeOverview: false,
  routeOverviewLocked: false,
  northUp: false,
}))

/** Those following the map's bearing (the compass), told each time it turns. */
const bearingListeners = new Set<(bearing: number) => void>()

function tellBearing(bearing: number) {
  for (const listener of bearingListeners) listener(bearing)
}

/** Follows the map's bearing (degrees clockwise from north): told it now, and each time the map turns.
 * Returns the function that stops it. */
export function followBearing(listener: (bearing: number) => void): () => void {
  bearingListeners.add(listener)
  listener(live?.map.getBearing() ?? 0)
  return () => bearingListeners.delete(listener)
}

let live: LiveMap | null = null
/** Cached horizontal visual occlusion widths pushed by `MapView` (0 DOM layout reads in the 70 FPS loop). */
let visualInsets: { left: number; right: number } = { left: 0, right: 0 }

/** Updates the unobstructed viewport's left/right occlusion widths (in container CSS pixels) for visual centering. */
export function setLiveMapVisualInsets(left: number, right: number): void {
  visualInsets = {
    left: Number.isFinite(left) ? Math.max(0, left) : 0,
    right: Number.isFinite(right) ? Math.max(0, right) : 0,
  }
}
const currentOverview = createOverviewSession(
  (routeOverview) => {
    useMapBrowsing.setState({ routeOverview })
    if (!live) return
    if (routeOverview) {
      live.map.dragRotate.disable()
      live.map.touchZoomRotate.disableRotation()
      if (live.map.getBearing() !== 0 || live.map.getPitch() !== 0) {
        live.map.easeTo({ bearing: 0, pitch: 0, duration: reducedMotion() ? 0 : 300 })
      }
    } else if (live.interactive && !live.overview) {
      live.map.dragRotate.enable()
      live.map.touchZoomRotate.enableRotation()
    }
  },
  () => recentreLiveMap(),
  (routeOverviewLocked) => useMapBrowsing.setState({ routeOverviewLocked }),
)
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** The truck's recent positions, kept from the first map onwards so the camera never starts cold. */
const samples: TruckSample[] = []
let stopSamples: (() => void) | undefined

function collectSamples() {
  if (stopSamples) return
  const add = (telemetry: Telemetry) => {
    samples.push({
      time: performance.now(),
      x: telemetry.x,
      y: telemetry.y,
      z: telemetry.z,
      heading: telemetry.heading,
      speed: telemetry.speed,
    })
    if (samples.length > SAMPLES_KEPT) samples.shift()
  }
  // Where the truck is now: the host only sends telemetry when it changes, so a parked truck may send
  // nothing more for a long while.
  const current = useLive.getState().telemetry
  if (current) add(current)
  stopSamples = useLive.subscribe((state, previous) => {
    if (state.telemetry && state.telemetry !== previous.telemetry) add(state.telemetry)
  })
}

function create(data: MapData, appearance: Appearance): LiveMap {
  const element = document.createElement('div')
  element.className = 'road-map'
  addSeaProtocol(maplibregl)
  const initialLite = useCabin.getState().liteMode
  const map = new maplibregl.Map({
    container: element,
    style: mapStyle(appearance, data),
    center: data.centre,
    zoom: 15,
    pitch: PITCH,
    maxPitch: 70,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    maxBounds: cameraBounds(data),
    maxTileCacheSize: initialLite ? 24 : 64,
    maxTileCacheZoomLevels: 2,
    // Gestures are switched on only where the map can be moved (setInteractive).
    interactive: false,
    // Turning (right-drag) keeps the tilt.
    pitchWithRotate: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { antialias: !initialLite },
  })
  map.on('render', () => recordRenderedFrame())

  // Added to the map when in range and clear of more important names (showLabels). Both text measurements
  // and MapLibre DOM markers are created lazily on first visibility to avoid pre-creating thousands of DOM
  // nodes or measuring thousands of city names synchronously on large map mods.
  const measure = document.createElement('canvas').getContext('2d')
  const fontFamily = getComputedStyle(document.body).fontFamily
  const font = (size: number) => `600 ${size}px ${fontFamily}`
  const textWidth = (text: string, size: number) => {
    if (!measure) return text.length * size * 0.6
    measure.font = font(size)
    return measure.measureText(text).width
  }
  const measureLabel = ({ first, second }: { first: string; second: string | null }) => {
    const scale = nameScale()
    const [size, secondSize] = [LABEL_SIZE * scale, LABEL_SECOND_SIZE * scale]
    return {
      width: Math.max(textWidth(first, size), second ? textWidth(second, secondSize) : 0) + LABEL_HALO * 2,
      height: (size + (second ? secondSize : 0)) * 1.2 + LABEL_HALO * 2,
    }
  }
  const lines = [...data.labels]
    .sort((a, b) => b.population - a.population)
    .map((label) => ({ label, ...labelLines(label.name, label.localized) }))
  const labelGrid = new Map<string, number[]>()
  const labels = lines.map(({ label, first, second }, index) => {
    const world = fromLngLat(label.at[0], label.at[1])
    const cellKey = `${Math.floor(world[0] / LABEL_CELL_METRES)},${Math.floor(world[1] / LABEL_CELL_METRES)}`
    let bucket = labelGrid.get(cellKey)
    if (!bucket) {
      bucket = []
      labelGrid.set(cellKey, bucket)
    }
    bucket.push(index)
    return {
      kind: label.kind,
      first,
      second,
      marker: null as maplibregl.Marker | null,
      at: label.at,
      world,
      width: null as number | null,
      height: null as number | null,
    }
  })

  const puckElement = document.createElement('div')
  puckElement.className = 'map-puck'
  puckElement.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8 18.6 19.4l-6.6-3.4-6.6 3.4Z" fill="currentColor"/></svg>'
  const puck = new maplibregl.Marker({ element: puckElement, pitchAlignment: 'viewport', rotationAlignment: 'map' })
  const destinationElement = document.createElement('div')
  destinationElement.className = 'map-destination'
  destinationElement.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 21V4.2c3.6-1.9 6.6 1.6 11 0v8.6c-4.4 1.6-7.4-1.9-11 0" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
  const destination = new maplibregl.Marker({
    element: destinationElement,
    pitchAlignment: 'viewport',
    rotationAlignment: 'viewport',
  })

  const raised = data.raised ? raisedRoads(map, data.raised, () => created.painted) : null
  raised?.setShown(useCabin.getState().mapRoads)
  raised?.setLite(initialLite)
  const meshes = data.meshes ? buildingMeshes(map, data.meshes, () => created.painted) : null
  meshes?.setShown(useCabin.getState().mapBuildings)
  meshes?.setLite(initialLite)
  ensureSpeedCameras(data.speedCameras)
  const placeIcons = new PlaceIconCache()
  const containerSize = { width: element.clientWidth, height: element.clientHeight }
  let resizeObserver: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) {
        containerSize.width = box.width
        containerSize.height = box.height
      }
    })
    resizeObserver.observe(element)
  }
  const created: LiveMap = {
    data,
    map,
    element,
    raised,
    meshes,
    puckHeight: 0,
    puck,
    destination,
    stops: { key: '', markers: [] },
    routeShown: null,
    progress: null,
    canopies: { hidden: '', at: -Infinity, lastX: Number.NaN, lastZ: Number.NaN },
    labels,
    labelGrid,
    activeLabels: new Set(),
    measureLabel,
    containerSize,
    resizeObserver,
    puckLast: null,
    destLiftLast: null,
    placeIcons,
    trafficLights: createTrafficLightPool(),
    speedCameras: createSpeedCameraPool(),
    wanted: appearance,
    painted: appearance,
    garagesShown: null,
    playersShown: 0,
    playersDrawn: 0,
    viewTold: 0,
    ahead: null,
    aheadTold: 0,
    aheadShown: null,
    camera: null,
    mode: 'follow',
    interactive: false,
    pressed: false,
    touched: 0,
    overview: false,
    routeOverviewZoom: null,
    overviewNeedsFit: false,
    offeredPick: null,
    zoomOffset: 0,
    browsedFrom: 0,
    glide: null,
    northUp: false,
    labelsPlacedFor: null,
    labelsPlacedAt: -Infinity,
    kept: '',
    keptAt: 0,
  }
  // Place icons are drawn lazily when the map first needs each (placeIcons.ts), bounded by `placeIcons`
  // LRU eviction so multi-hour drives never bloat MapLibre's WebGL sprite atlas.
  map.on('styleimagemissing', ({ id }: { id: string }) => {
    const pixelRatio = window.devicePixelRatio || 1
    if (id === NO_ENTRY_ICON && !map.hasImage(id)) {
      map.addImage(id, drawNoEntry(pixelRatio), { pixelRatio })
      return
    }
    const icon = parsePlaceIcon(id)
    if (!icon || map.hasImage(id)) return
    map.addImage(id, drawPlaceIcon(icon.kind, icon.name, created.painted, pixelRatio, fontFamily, nameScale()), {
      pixelRatio,
    })
    placeIcons.track(id, map)
  })
  document.fonts.ready
    .then(() => {
      if (live !== created) return
      for (const label of created.labels) {
        label.width = null
        label.height = null
      }
      created.labelsPlacedFor = null
      clearPlaceIcons(created)
    })
    .catch(() => {})
  // React to map settings, performance mode, and text size changes.
  let resized: ReturnType<typeof setTimeout> | undefined
  stopTextSize?.()
  const unsubscribeTextSize = useCabin.subscribe((state, before) => {
    if (state.mapBuildings !== before.mapBuildings) {
      showBuildings(map)
      meshes?.setShown(state.mapBuildings)
    }
    if (state.mapRoads !== before.mapRoads) raised?.setShown(state.mapRoads)
    if (state.liteMode !== before.liteMode) {
      meshes?.setLite(state.liteMode)
      raised?.setLite(state.liteMode)
    }
    if (state.textSize === before.textSize) return
    clearTimeout(resized)
    resized = setTimeout(() => {
      for (const label of created.labels) {
        label.width = null
        label.height = null
      }
      created.labelsPlacedFor = null
      clearPlaceIcons(created)
    }, TEXT_SIZE_SETTLE_MS)
  })
  stopTextSize = () => {
    clearTimeout(resized)
    unsubscribeTextSize()
  }
  map.once('style.load', () => showBuildings(map))
  listen(created)
  restoreView(created)
  return created
}

/** The map's buildings raised or flat, as the player has it (the companion's Map page). */
function showBuildings(map: maplibregl.Map) {
  if (!map.getLayer(BUILDING_LAYER) || !map.getLayer(BUILDING_FLAT_LAYER)) return
  const raised = useCabin.getState().mapBuildings
  map.setLayoutProperty(BUILDING_LAYER, 'visibility', raised ? 'visible' : 'none')
  map.setLayoutProperty(BUILDING_FLAT_LAYER, 'visibility', raised ? 'none' : 'visible')
}

/** How often the view is looked at to be kept, ms. */
const KEEP_EVERY_MS = 500

/** The view the player left the map in, kept from before (a hot reload, a reload, a restart): their
 * follow zoom, and where they'd browsed to (with the full while to look again before it glides back). */
function restoreView(target: LiveMap) {
  const saved = loadView()
  if (!saved) return
  target.zoomOffset = clampZoomOffset(saved.zoomOffset)
  if (saved.browse) {
    const { center, zoom, bearing, pitch, from } = saved.browse
    target.map.jumpTo({ center, zoom, bearing, pitch })
    browse(target)
    target.browsedFrom = from
  }
  target.kept = JSON.stringify(viewOf(target))
}

/** Keeps the view, now and then, when it has changed. */
function keepView(target: LiveMap, now: number) {
  if (currentOverview.active()) return
  if (now - target.keptAt < KEEP_EVERY_MS) return
  target.keptAt = now
  const view = JSON.stringify(viewOf(target))
  if (view === target.kept) return
  target.kept = view
  saveView(JSON.parse(view) as SavedView)
}

function viewOf({ map, mode, zoomOffset, browsedFrom }: LiveMap): SavedView {
  const browse =
    mode === 'browse'
      ? {
          center: map.getCenter().toArray() as [number, number],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
          from: browsedFrom,
        }
      : null
  return { zoomOffset, browse }
}

/** The player's hands on the map. */
function listen(target: LiveMap) {
  stopInteractions?.()
  const { map } = target
  const canvas = map.getCanvasContainer()
  canvas.addEventListener('pointerdown', () => {
    if (!target.interactive) return
    target.pressed = true
    currentOverview.hold(true)
    target.touched = performance.now()
  })
  const release = () => {
    if (!target.pressed) return
    target.pressed = false
    currentOverview.hold(false)
    if (currentOverview.active() && target.overviewNeedsFit) frameCurrentRoute(target)
  }
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
  window.addEventListener('blur', release)
  stopInteractions = () => {
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
    window.removeEventListener('blur', release)
  }
  canvas.addEventListener('click', () => {
    if (target.interactive) currentOverview.touch()
  })
  // Dragging leaves the truck behind; manually rotating also clears any north-up lock.
  map.on('dragstart', (event: { originalEvent?: unknown }) => {
    if (event.originalEvent && target.interactive) browse(target)
  })
  map.on('rotatestart', (event: { originalEvent?: unknown }) => {
    if (!event.originalEvent || !target.interactive) return
    if (target.northUp) {
      target.northUp = false
      useMapBrowsing.setState({ northUp: false })
    }
    browse(target)
  })
  // The compass (MapControls.tsx) turns with the map.
  map.on('rotate', () => tellBearing(map.getBearing()))
  // A route offered tapped (Directions): picked, as its row on the card is.
  map.on('click', (event) => {
    if (target.interactive && target.offeredPick) pickOffered(target, event.point, target.offeredPick)
  })
  map.on('move', (event) => {
    if (event.originalEvent) {
      target.touched = performance.now()
      currentOverview.touch()
    }
  })
  // The wheel, while following: closer or further, still following. (Browsing, MapLibre zooms.)
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!target.interactive) return
      target.touched = performance.now()
      currentOverview.touch()
      if (target.mode !== 'browse') {
        target.zoomOffset = clampZoomOffset(target.zoomOffset - (event.deltaY / 120) * WHEEL_ZOOM)
      }
    },
    { passive: true },
  )
}

function browse(target: LiveMap) {
  // Measured from here (a glide back cut short may have moved the zoom already: that's no choice).
  target.browsedFrom = target.map.getZoom()
  target.mode = 'browse'
  target.glide = null
  target.touched = performance.now()
  // Browsing, the wheel zooms around the cursor, like any desktop map.
  target.map.scrollZoom.enable()
  useMapBrowsing.setState({ browsing: true })
}

function follow(target: LiveMap) {
  target.mode = 'follow'
  target.glide = null
  target.map.scrollZoom.disable()
  useMapBrowsing.setState({ browsing: false, northUp: target.northUp })
}

/** Switches the gestures for the screen showing the map: the Maps app moves it, the Dashboard doesn't. */
function setInteractive(target: LiveMap, interactive: boolean) {
  target.interactive = interactive
  const { map } = target
  const overviewActive = currentOverview.active() || target.overview
  map.dragPan[interactive ? 'enable' : 'disable']()
  map.touchZoomRotate[interactive ? 'enable' : 'disable']()
  if (interactive && !overviewActive) {
    map.dragRotate.enable()
    map.touchZoomRotate.enableRotation()
  } else {
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
  }
  if (!interactive) {
    exitCurrentOverview(target)
    target.pressed = false
    follow(target)
    // Straight onto the truck.
    target.camera = null
  }
}

/**
 * Restyles the map to the wanted appearance, if it isn't already. Called every frame: until the style
 * itself has loaded, MapLibre refuses paint changes, and the next frame tries again. (Its "is the style
 * loaded" check also waits for every tile, which never settles while driving: a switch made then was lost.)
 */
function syncAppearance(target: LiveMap) {
  if (target.painted === target.wanted) return
  try {
    for (const { layer, property, value } of paintFor(target.wanted, Boolean(target.map.getSource(SURFACE_SOURCE)))) {
      target.map.setPaintProperty(layer, property, value)
    }
    target.painted = target.wanted
    // Drop cached place icons so MapLibre lazily regenerates only currently visible icons in the new theme.
    clearPlaceIcons(target)
  } catch {
    // The style is still loading.
  }
}

/** Shows the player's own garages as theirs (the host reads them from their save), once they change.
 * Like the appearance, retried each frame until the style has loaded. */
function syncGarages(target: LiveMap) {
  const owned = useLive.getState().ownedGarages
  const key = owned.join(',')
  if (target.garagesShown === key) return
  try {
    for (const { layer, value } of placeImagesFor(owned)) target.map.setLayoutProperty(layer, 'icon-image', value)
    target.garagesShown = key
  } catch {
    // The style is still loading.
  }
}

/** How often (ms) the part of the map shown is told TruckersMP's reader, and the other players drawn. */
const VIEW_TOLD_EVERY = 500
const PLAYERS_DRAWN_EVERY = 33
/** How far behind the feed's clock (s) the further trucks are drawn: between places it has given, never
 * guessing ahead (guessing ahead went back and forth: owner 2026-10-21). Read every 3 s (truckersmp.ts), each
 * truck's newest place is up to 3 s older than the read, and the feed lags a second or two: 5 s keeps one
 * place ahead to slide to. */
const PLAYERS_BEHIND = 5
/** How far (m) round its centre the part of the map shown reaches at most (tilted, it sees to the horizon). */
const VIEW_REACH = 20000

/** The part of the map shown (the game's x and z), at most [`VIEW_REACH`] round its centre. */
function viewArea(map: maplibregl.Map): Area {
  const bounds = map.getBounds()
  const [x0, z0] = fromLngLat(bounds.getWest(), bounds.getNorth())
  const [x1, z1] = fromLngLat(bounds.getEast(), bounds.getSouth())
  const [cx, cz] = fromLngLat(map.getCenter().lng, map.getCenter().lat)
  return [
    Math.max(Math.min(x0, x1), cx - VIEW_REACH),
    Math.max(Math.min(z0, z1), cz - VIEW_REACH),
    Math.min(Math.max(x0, x1), cx + VIEW_REACH),
    Math.min(Math.max(z0, z1), cz + VIEW_REACH),
  ]
}

/** Draws TruckersMP's other players smoothly (owner 2026-10-21): those around the player where TruckersMP's
 * SDK has them now (the plugin's, as the game draws them); the rest each where it was [`PLAYERS_BEHIND`]
 * seconds ago on the feed's clock, between the places the feed gave it (truckersmp.ts). Tells the reader the
 * part of the map shown (none: nothing is read for it). */
function syncPlayers(target: LiveMap, now: number) {
  if (now - target.viewTold >= VIEW_TOLD_EVERY) {
    target.viewTold = now
    setMapView(hosts.length > 0 ? viewArea(target.map) : null)
  }
  const { tracks, clock } = useTruckersMp.getState()
  const around = useLive.getState().nearby?.players ?? []
  if (hosts.length === 0 || now - target.playersDrawn < PLAYERS_DRAWN_EVERY) return
  // None to draw, and none drawn: nothing to do.
  if (tracks.size === 0 && around.length === 0 && target.playersShown === 0) return
  const source = target.map.getSource<GeoJSONSource>(PLAYERS_SOURCE)
  // The style still loading: next frame.
  if (!source) return
  target.playersDrawn = now
  const point = (x: number, z: number) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Point' as const, coordinates: toLngLat(x, z) },
  })
  // Around the player, as the SDK has them; the feed's own place for them left out.
  const close = new Set(around.map(([id]) => id))
  const t = now / 1000 + (clock ?? 0) - PLAYERS_BEHIND
  const features = [
    ...around.map(([, x, z]) => point(x, z)),
    ...[...tracks].filter(([id]) => !close.has(id)).map(([, samples]) => point(...trackAt(samples, t))),
  ]
  target.playersShown = features.length
  source.setData({ type: 'FeatureCollection', features })
}

/** How far ahead along the route driven (m, the world's own: about 20 minutes' drive) its traffic is shown. */
const TRAFFIC_AHEAD = 25000
/** How often (ms) the route ahead is worked out again, for its traffic. */
const AHEAD_EVERY = 2000
/** How far off a raised road's height the truck can be and still be on it, m: less than a road under it is. */
const TRUCK_ON_SURFACE = 3
/** How quickly the puck goes up to and down from a raised road, ms. */
const PUCK_RISE_MS = 200

/** Under TruckersMP, driving a route: the traffic on the route ahead, over its blue line (owner 2026-10-21),
 * from the trucks along it (truckersmp.ts reads its corridor). While routes are offered, theirs is shown
 * instead (Destinations.tsx). */
function syncRouteTraffic(target: LiveMap, now: number) {
  if (target.overview) return
  const shown = target.routeShown
  const progress = target.progress
  if (!useLive.getState().truckersmp || !shown?.route || !progress) {
    if (target.ahead) {
      target.ahead = null
      target.aheadShown = null
      setRouteAhead(null)
      showTraffic([])
    }
    return
  }
  if (!target.ahead || now - target.aheadTold >= AHEAD_EVERY) {
    target.aheadTold = now
    target.ahead = routeAhead(shown.spans, progress.span, TRAFFIC_AHEAD)
    target.aheadShown = null
    setRouteAhead(corridorOf(target.ahead))
  }
  const { aheadAlong } = useTruckersMp.getState()
  if (aheadAlong !== target.aheadShown) {
    target.aheadShown = aheadAlong
    showTraffic(trafficAlong(target.ahead, aheadAlong))
  }
}

/** Shows the traffic on the route previewed (traffic.ts: TruckersMP's), over it; none to clear it. */
export function showTraffic(stretches: readonly TrafficStretch[]) {
  const source = live?.map.getSource<GeoJSONSource>(TRAFFIC_SOURCE)
  if (!source) return
  source.setData({
    type: 'FeatureCollection',
    features: stretches
      .filter(({ line }) => line.length > 1)
      .map(({ line, level }) => ({
        type: 'Feature',
        properties: { level },
        geometry: { type: 'LineString', coordinates: line.map(([x, z]) => toLngLat(x, z)) },
      })),
  })
}

/** Releases cached place icons so MapLibre regenerates only currently visible icons via `styleimagemissing`. */
function clearPlaceIcons({ map, placeIcons }: LiveMap) {
  placeIcons.clear(map)
  for (const id of map.listImages()) {
    if (parsePlaceIcon(id)?.name && map.hasImage(id)) map.removeImage(id)
  }
}

/** The screens showing the map, latest last: it's in the latest, and goes back when that one closes. */
const hosts: { element: HTMLElement; interactive: boolean }[] = []
let frame: number | null = null
const idleMap = idleDisposal(() => {
  if (hosts.length === 0) disposeLiveMap()
})

function disposeLiveMap() {
  currentOverview.exit()
  idleMap.cancel()
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  stopTextSize?.()
  stopTextSize = undefined
  stopInteractions?.()
  stopInteractions = undefined
  stopSamples?.()
  stopSamples = undefined
  samples.length = 0
  if (!live) return
  live.resizeObserver?.disconnect()
  live.resizeObserver = null
  live.stops.markers.forEach((marker) => marker.remove())
  live.labels.forEach((label) => label.marker?.remove())
  live.activeLabels.clear()
  live.meshes?.dispose()
  live.raised?.dispose()
  live.element.remove()
  live.map.remove()
  if (import.meta.env.DEV)
    Object.assign(window, { westplayMap: undefined, westplayRaised: undefined, westplayMeshes: undefined })
  live = null
  postToHost({ type: 'mapResource', resident: false })
  useMapBrowsing.setState({ browsing: false, routeOverview: false, routeOverviewLocked: false, northUp: false })
}

/**
 * Shows the live map in `host` and follows the truck there (letting the player move it if `interactive`),
 * until the returned function is called. With no hosts it stays warm for 30 seconds, then releases its resources.
 */
export function showLiveMap(
  host: HTMLElement,
  data: MapData,
  appearance: Appearance,
  interactive: boolean,
): () => void {
  idleMap.cancel()
  if (live?.data !== data) {
    disposeLiveMap()
    live = create(data, appearance)
    postToHost({ type: 'mapResource', resident: true })
    // Development: the map, for inspecting it from the browser's console.
    if (import.meta.env.DEV)
      Object.assign(window, { westplayMap: live.map, westplayRaised: live.raised, westplayMeshes: live.meshes })
  }
  collectSamples()
  live.wanted = appearance
  syncAppearance(live)
  const entry = { element: host, interactive }
  hosts.push(entry)
  place()
  return () => {
    const index = hosts.indexOf(entry)
    if (index < 0) return
    hosts.splice(index, 1)
    if (entry.interactive && currentOverview.active()) recentreLiveMap()
    place()
  }
}

/** Puts the map in the latest screen showing it, following the truck while any does. */
function place() {
  if (!live) return
  const current = live
  const host = hosts.at(-1)
  if (!host) {
    exitCurrentOverview(current)
    current.element.remove()
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    idleMap.idle()
    return
  }
  idleMap.cancel()
  if (current.element.parentElement !== host.element) {
    host.element.appendChild(current.element)
    current.map.resize()
    current.containerSize.width = current.element.clientWidth
    current.containerSize.height = current.element.clientHeight
    // Straight onto the truck, without easing in from wherever the camera was.
    current.camera = null
  }
  if (current.interactive !== host.interactive) setInteractive(current, host.interactive)
  if (frame === null) {
    let lastFrame = performance.now()
    const display = displayClock()
    frame = requestAnimationFrame(function step(now) {
      frame = requestAnimationFrame(step)
      // On every display frame, or evenly every few on a fast one (frameCap.ts): each frame drawn here redraws every
      // 3D building in view (a player's log, 2026-10-27: the cab page's share up to 4x in towns), and the host hands
      // the game a new one in each of its 60 a second only if they come evenly and more often than that.
      const frameMs = display.tick(now)
      const pace = useCabin.getState().liteMode ? LITE_PACE : LEAST_PACE
      if (!mapFrameDue(now, lastFrame, frameMs, pace)) return
      const dt = Math.min(now - lastFrame, 100)
      lastFrame = now
      syncAppearance(current)
      syncGarages(current)
      syncPlayers(current, now)
      syncRouteTraffic(current, now)
      syncRoute(current, now)
      syncCanopies(current, now)
      const overviewActive = currentOverview.active()
      const cameras = getLoadedSpeedCameras(current.data.speedCameras)
      const matches = overviewActive ? null : corridorMatchesFor(useLive.getState(), cameras)
      syncTrafficLights(current.map, current.trafficLights, overviewActive, matches?.light ?? null)
      syncSpeedCameras(current.map, current.speedCameras, cameras, overviewActive, matches?.camera ?? null)
      current.raised?.update(now)
      current.meshes?.update(now)
      updateCamera(current, now, dt)
      showLabels(current, now)
      keepView(current, now)
    })
  }
}

/** How near a tap (px) picks a route offered: a finger's width either side of its line. */
const OFFERED_TAP = 16
/** The layers the routes offered are drawn in (style.ts). */
const OFFERED_LAYERS = ['offered-picked', 'offered-picked-casing', 'offered', 'offered-casing']

/** Picks the route offered whose line is under `point`: where the one picked runs too (a road they share), it
 * stays picked. */
function pickOffered(target: LiveMap, point: { x: number; y: number }, pick: (index: number) => void) {
  const { map } = target
  const layers = OFFERED_LAYERS.filter((id) => map.getLayer(id))
  if (layers.length === 0) return
  const hits = map.queryRenderedFeatures(
    [
      [point.x - OFFERED_TAP, point.y - OFFERED_TAP],
      [point.x + OFFERED_TAP, point.y + OFFERED_TAP],
    ],
    { layers },
  )
  const indices = hits.map((hit) => hit.properties?.index).filter((index): index is number => typeof index === 'number')
  if (indices.length === 0 || hits.some((hit) => hit.properties?.picked === true)) return
  pick(indices[0])
}

/** How far the map's left edge is covered by the search panel (px, in the map's own units): the routes
 * offered are framed beside it. */
function panelCover(map: maplibregl.Map): number {
  const container = map.getContainer()
  const box = container.getBoundingClientRect()
  const panel = document.querySelector('.map-tile .map-search')?.getBoundingClientRect()
  if (!panel || box.width === 0) return 0
  // The screen may be scaled: the map's padding is in its own pixels.
  return Math.max(0, (panel.right - box.left) * (container.clientWidth / box.width))
}

/** How far the map's right edge is covered by the speed capsule and map controls dock (px, in the map's own units). */
function rightControlsCover(map: maplibregl.Map): number {
  const container = map.getContainer()
  const box = container.getBoundingClientRect()
  if (box.width === 0) return 0
  const scaleX = container.clientWidth / box.width
  let cover = 0
  for (const selector of ['.map-tile .speed-stack', '.map-tile .map-controls.map-dock']) {
    const rect = document.querySelector(selector)?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) {
      cover = Math.max(cover, (box.right - rect.left) * scaleX)
    }
  }
  return cover
}

/** Shows the routes offered before Go (`lines`, `[x, z]` metres each), `picked` in the route's blue over the
 * others, `onPick` called with a route's index as its line is tapped; none to clear them. */
export function showOfferedRoutes(lines: Point[][], picked: number | null, onPick?: (index: number) => void) {
  const source = live?.map.getSource<GeoJSONSource>(OFFERED_SOURCE)
  if (!live || !source) return
  if (lines.length > 0 && currentOverview.active()) recentreLiveMap()
  live.offeredPick = lines.length > 0 ? (onPick ?? null) : null
  // Offered, the map shows them all, from above (as Apple Maps' Directions), in the part the search panel
  // leaves free; gone, it's back on the truck.
  if (lines.length > 0 && !live.overview) {
    browse(live)
    live.overview = true
    live.map.dragRotate.disable()
    live.map.touchZoomRotate.disableRotation()
    // (A loop: a long route has too many points to spread into Math.min.)
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const [x, z] of lines.flat()) {
      ;[x0, x1, z0, z1] = [Math.min(x0, x), Math.max(x1, x), Math.min(z0, z), Math.max(z1, z)]
    }
    if (x0 < x1 || z0 < z1) {
      const [lng0, lat0] = toLngLat(x0, z1)
      const [lng1, lat1] = toLngLat(x1, z0)
      const width = live.map.getContainer().clientWidth
      const rightPadding = Math.min(Math.max(60, rightControlsCover(live.map) + 28), Math.max(60, width / 4))
      const leftPadding = Math.min(panelCover(live.map) + 40, Math.max(60, width - rightPadding - 120))
      // Clear the chase camera's persistent visual-center padding first: MapLibre's fitBounds adds its
      // padding option on top of any existing camera padding, which otherwise double-shifts the preview right.
      live.map.stop()
      live.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
      live.map.fitBounds(
        [
          [lng0, lat0],
          [lng1, lat1],
        ],
        {
          padding: { top: 60, right: rightPadding, bottom: 60, left: leftPadding },
          pitch: 0,
          bearing: 0,
          duration: reducedMotion() ? 0 : 900,
        },
      )
    } else if (live.map.getBearing() !== 0 || live.map.getPitch() !== 0) {
      live.map.easeTo({ bearing: 0, pitch: 0, duration: reducedMotion() ? 0 : 300 })
    }
  } else if (lines.length === 0 && live.overview) {
    live.overview = false
    if (live.interactive && !currentOverview.active()) {
      live.map.dragRotate.enable()
      live.map.touchZoomRotate.enableRotation()
    }
    // Back on the truck at the zoom the player had before the routes were offered: zooming out to show them
    // all was the map's doing, not a zoom they chose (owner 2026-10-21).
    live.browsedFrom = live.map.getZoom()
    recentreLiveMap()
  }
  // The picked one last: drawn over the others where they share roads.
  const order = lines
    .map((line, index) => ({ line, index, picked: index === picked }))
    .sort((a, b) => +a.picked - +b.picked)
  source.setData({
    type: 'FeatureCollection',
    features: order
      .filter(({ line }) => line.length > 1)
      .map(({ line, index, picked }) => ({
        type: 'Feature',
        properties: { picked, index },
        geometry: { type: 'LineString', coordinates: line.map(([x, z]) => toLngLat(x, z)) },
      })),
  })
}

/** The route as the map draws it, and where the truck is along it this frame (`null`: no route, or the
 * truck not placed on it yet). */
export function liveRouteProgress(): { spans: Spans; progress: Progress } | null {
  const spans = live?.routeShown?.spans
  const progress = live?.progress
  return spans && spans.length > 0 && progress ? { spans, progress } : null
}

export function setLiveMapAppearance(appearance: Appearance) {
  if (!live) return
  live.wanted = appearance
  syncAppearance(live)
}

/** Cycles the active route overview through [timed overview -> locked overview -> off]. */
export function overviewLiveRoute() {
  const mode = currentOverview.mode()
  if (mode === 'locked') {
    recentreLiveMap()
    return
  }
  if (mode === 'timed') {
    currentOverview.lock()
    if (live?.overviewNeedsFit) frameCurrentRoute(live)
    return
  }
  if (
    !live ||
    !live.interactive ||
    live.overview ||
    !useLive.getState().route ||
    (useLive.getState().telemetry?.navigationDistance ?? 0) <= 0
  )
    return
  live.routeOverviewZoom = live.zoomOffset
  browse(live)
  currentOverview.enter()
  live.map.stop()
  frameCurrentRoute(live)
}

/** How far the map's left edge is covered by the overview stops card (px, in the map's own units). */
function overviewCardCover(map: maplibregl.Map): number {
  const container = map.getContainer()
  const box = container.getBoundingClientRect()
  const panel = document.querySelector('.map-tile .overview-stops-card')?.getBoundingClientRect()
  if (!panel || panel.width <= 0 || box.width === 0) return 0
  return Math.max(0, (panel.right - box.left) * (container.clientWidth / box.width))
}

/** Extends the timed route-overview deadline on explicit interaction with overview HUD controls. */
export function touchLiveOverview() {
  currentOverview.touch()
}

/** Suspends or resumes the timed route-overview auto-return timer (e.g. while dragging a waypoint). */
export function holdLiveOverview(held: boolean) {
  currentOverview.hold(held)
}

/** Reframes the active route overview once an overview HUD overlay mounts or resizes. */
export function reframeLiveOverview() {
  if (!live || !currentOverview.active() || live.pressed) return
  frameCurrentRoute(live)
}

function frameCurrentRoute(target: LiveMap) {
  const route = useLive.getState().route
  if (!route) return
  const spans =
    target.routeShown?.route === route ? target.routeShown.spans : routeSpans(route.nodes, route.paths, route.shifts)
  const progress = target.progress
  const line = progress
    ? [...headLine(spans, progress), ...restLine(spans, progress.span)]
    : restLine(spans, Math.max(-1, useLive.getState().routeNext - 2))
  const truck = useLive.getState().telemetry
  const bounds = routeBounds(truck ? [[truck.x, truck.z], ...line] : line)
  if (!bounds) return
  const [[x0, z0], [x1, z1]] = bounds
  target.overviewNeedsFit = false
  const width = target.map.getContainer().clientWidth
  const rightPadding = Math.min(140, width / 4)
  const cardCover = target.interactive ? overviewCardCover(target.map) : 0
  const wantedLeft = target.interactive ? Math.max(160, width * 0.18, cardCover > 0 ? cardCover + 32 : 0) : 64
  const leftPadding = Math.min(wantedLeft, Math.max(64, width - rightPadding - 120))
  // fitBounds adds its padding to the existing camera insets. Remove the chase camera's
  // top inset first, otherwise the current-position marker is pushed against the bottom edge.
  target.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
  target.map.fitBounds([toLngLat(x0, z1), toLngLat(x1, z0)], {
    padding: {
      top: 72,
      bottom: 90,
      left: leftPadding,
      right: rightPadding,
    },
    bearing: 0,
    pitch: 0,
    maxZoom: 17,
    duration: reducedMotion() ? 0 : 850,
  })
}

function exitCurrentOverview(target: LiveMap) {
  currentOverview.exit()
  if (target.routeOverviewZoom === null) return
  target.map.stop()
  target.zoomOffset = target.routeOverviewZoom
  target.routeOverviewZoom = null
  target.overviewNeedsFit = false
  // Programmatic fit and manual overview zoom must not overwrite the driving zoom preference.
  target.browsedFrom = target.map.getZoom()
}

/** Glides the map back onto the truck and exits overview without overriding the current north-up toggle. */
export function recentreLiveMap() {
  const wasOverview = currentOverview.active()
  if (live) exitCurrentOverview(live)
  if (!live || (!wasOverview && live.mode !== 'browse')) return
  glideToTruck(live)
  useMapBrowsing.setState({ browsing: false })
}

/** Toggles between heading-up 3D chase and top-down north-up while preserving follow vs browse centering. */
export function northUpLiveMap() {
  if (!live || currentOverview.active() || live.overview) return
  const next = !live.northUp
  live.northUp = next
  useMapBrowsing.setState({ northUp: next })
  if (live.mode === 'browse') {
    const truck = truckAt(samples, performance.now() - FOLLOW_DELAY_MS)
    const headingBearing = truck ? bearingOf(truck.heading) : 0
    const settings = navCameraSettings()
    const guidance = settings.autoZoom && settings.junctionZoom ? physicalGuidanceFor(useLive.getState()) : null
    const pitch = next ? 0 : live.interactive ? navigationCameraFor(truck?.speed ?? 0, settings, guidance).pitch : PITCH
    live.map.easeTo({
      bearing: next ? 0 : headingBearing,
      pitch,
      duration: reducedMotion() ? 0 : 300,
    })
    return
  }
  glideToTruck(live)
}

function navCameraSettings(): DynamicCameraSettings {
  const { mapAutoZoom, mapZoomIntensity, mapJunctionZoom } = useCabin.getState()
  return { autoZoom: mapAutoZoom, intensity: mapZoomIntensity, junctionZoom: mapJunctionZoom }
}

/** Glides from where the map is to the following camera ([`updateCamera`]): behind the truck, or north up. */
function glideToTruck(target: LiveMap) {
  const { map } = target
  // A zoom the player chose while browsing (the wheel, the buttons) stays: the camera follows at it.
  if (target.mode === 'browse' && Math.abs(map.getZoom() - target.browsedFrom) > 0.01) {
    const speed = truckAt(samples, performance.now() - FOLLOW_DELAY_MS)?.speed ?? 0
    target.zoomOffset = target.interactive
      ? navZoomOffsetFor(map.getZoom(), speed, navCameraSettings())
      : zoomOffsetFor(map.getZoom(), speed)
  }
  const currentPad = map.getPadding()
  target.glide = {
    from: {
      center: map.getCenter().toArray() as [number, number],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    },
    fromPadding: {
      top: currentPad.top ?? 0,
      bottom: currentPad.bottom ?? 0,
      left: currentPad.left ?? 0,
      right: currentPad.right ?? 0,
    },
    started: performance.now() - (reducedMotion() ? GLIDE_MS : 0),
  }
  target.mode = 'return'
  map.scrollZoom.disable()
}

/** Zooms in (1) or out (-1) a step: the following camera closer or further, or the browsed map. */
export function zoomLiveMap(direction: 1 | -1) {
  if (!live) return
  live.touched = performance.now()
  currentOverview.touch()
  // Browsing, or with no truck to follow (none yet: the camera only follows one), the map itself zooms.
  const following = truckAt(samples, performance.now() - FOLLOW_DELAY_MS) !== null
  if (live.mode === 'browse' || !following) {
    live.map.easeTo({ zoom: live.map.getZoom() + direction, duration: 300 })
  } else {
    live.zoomOffset = clampZoomOffset(live.zoomOffset + direction)
  }
}

/** Minimum interval (ms) between city-label layout passes while moving. */
const LABELS_EVERY_MS = 100

/**
 * Shows the place names that fit: only places near enough to matter at this zoom (the tilted view reaches
 * to the horizon, where everything far away would pile up, and the game's distances between cities are
 * short), and of those, none overlapping a more important one.
 */
function showLabels(target: LiveMap, now: number) {
  const { map, labels, labelGrid, activeLabels } = target
  if (target.labelsPlacedFor !== null && now - target.labelsPlacedAt < LABELS_EVERY_MS) return
  const centre = map.getCenter().toArray() as [number, number]
  const width = target.containerSize.width || map.getContainer().clientWidth
  const height = target.containerSize.height || map.getContainer().clientHeight
  // Quantize view coordinates (~50m centre, 0.05 zoom, 1.5° bearing, 1° pitch) so gentle camera damping
  // does not trigger full O(N) projection passes on every single frame.
  const view = `${Math.round(centre[0] * 2000)},${Math.round(centre[1] * 2000)} ${Math.round(map.getZoom() * 20)} ${Math.round(map.getBearing() / 1.5)} ${Math.round(map.getPitch())} ${Math.round(width)}x${Math.round(height)}`
  if (view === target.labelsPlacedFor) return
  target.labelsPlacedFor = view
  target.labelsPlacedAt = now
  const range = labelRange(map.getZoom(), width)
  const [cx, cz] = fromLngLat(centre[0], centre[1])
  const minCellX = Math.floor((cx - range) / LABEL_CELL_METRES)
  const maxCellX = Math.floor((cx + range) / LABEL_CELL_METRES)
  const minCellZ = Math.floor((cz - range) / LABEL_CELL_METRES)
  const maxCellZ = Math.floor((cz + range) / LABEL_CELL_METRES)
  const candidateIndices: number[] = []
  for (let gx = minCellX; gx <= maxCellX; gx++) {
    for (let gz = minCellZ; gz <= maxCellZ; gz++) {
      const bucket = labelGrid.get(`${gx},${gz}`)
      if (bucket) {
        for (let i = 0; i < bucket.length; i++) candidateIndices.push(bucket[i])
      }
    }
  }
  // Preserve importance order (labels are sorted descending by population).
  candidateIndices.sort((a, b) => a - b)
  const boxes = candidateIndices.map((index) => {
    const label = labels[index]
    if (metresBetween(centre, label.at) > range) return null
    if (label.width === null || label.height === null) {
      const dims = target.measureLabel(label)
      label.width = dims.width
      label.height = dims.height
    }
    const { x, y } = map.project(label.at)
    if (x < -label.width || x > width + label.width || y < -label.height || y > height + label.height) return null
    return { x, y, width: label.width, height: label.height }
  })
  const keptLocal = placeLabels(boxes, LABEL_GAP)
  const nextActive = new Set<number>()
  for (const localIndex of keptLocal) {
    const index = candidateIndices[localIndex]
    nextActive.add(index)
    const label = labels[index]
    if (!label.marker) {
      const el = document.createElement('div')
      el.className = `map-label map-label-${label.kind}`
      const line = (text: string, className: string) => {
        const span = document.createElement('span')
        span.className = className
        span.textContent = text
        el.append(span)
      }
      line(label.first, 'map-label-first')
      if (label.second) line(label.second, 'map-label-second')
      label.marker = new maplibregl.Marker({
        element: el,
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      }).setLngLat(label.at)
    }
    if (!activeLabels.has(index) || !label.marker.getElement().isConnected) {
      label.marker.addTo(map)
    }
  }
  for (const prevIndex of activeLabels) {
    if (!nextActive.has(prevIndex)) {
      const marker = labels[prevIndex].marker
      if (marker && marker.getElement().isConnected) marker.remove()
    }
  }
  target.activeLabels = nextActive
}

/** A unit direction on the ground (x east, z south) for a compass bearing (degrees). */
function along(bearing: number): Point {
  const radians = (bearing * Math.PI) / 180
  return [Math.sin(radians), -Math.cos(radians)]
}

/** A route source's data. */
type LineData = Parameters<GeoJSONSource['setData']>[0]

const NO_LINE: LineData = { type: 'FeatureCollection', features: [] }

/** The route line, in its stretches `lines`. */
function linesOf(lines: Point[][]): LineData {
  if (lines.length === 0) return NO_LINE
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiLineString', coordinates: lines.map((line) => line.map(([x, z]) => toLngLat(x, z))) },
  }
}

/** How often the canopies over the truck are looked for, ms. */
const CANOPIES_EVERY_MS = 400

/**
 * Leaves the canopies the truck is under out of the raised buildings, and every other one in (owner
 * 2026-10-22: a filling station's or a border crossing's roof would cover the truck). From the tiles loaded;
 * the layer's filter changed only when they change.
 */
function syncCanopies(target: LiveMap, now: number) {
  const { canopies, map } = target
  if (now - canopies.at < CANOPIES_EVERY_MS || !map.getLayer(BUILDING_LAYER)) return
  const truck = samples.at(-1)
  if (!truck) return
  if (
    Number.isFinite(canopies.lastX) &&
    Number.isFinite(canopies.lastZ) &&
    Math.hypot(truck.x - canopies.lastX, truck.z - canopies.lastZ) < 2
  ) {
    canopies.at = now
    return
  }
  canopies.at = now
  canopies.lastX = truck.x
  canopies.lastZ = truck.z
  const found = map.querySourceFeatures(MAP_SOURCE, {
    sourceLayer: 'building',
    filter: ['==', ['get', 'kind'], 'canopy'],
  })
  const shapes: Canopy[] = found.flatMap((feature) => {
    const id = feature.properties?.id
    const geometry = feature.geometry
    if (typeof id !== 'number') return []
    if (geometry.type === 'Polygon') return [{ id, rings: geometry.coordinates as [number, number][][] }]
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.map((rings: number[][][]) => ({ id, rings: rings as [number, number][][] }))
    }
    return []
  })
  const hidden = canopiesOver(shapes, toLngLat(truck.x, truck.z))
  const key = hidden.join(',')
  if (key === canopies.hidden) return
  canopies.hidden = key
  map.setFilter(BUILDING_LAYER, buildingFilter(hidden))
}

/**
 * Draws the game's GPS route (route.ts) as it changes, and the part ahead of the truck as it moves: the
 * rest of the route only when the truck reaches its next span, the head (to the end of the truck's span)
 * every half metre, so a parked truck leaves the map idle. Until the style has loaded, its sources aren't
 * there, and the next frame tries again.
 */
function syncRoute(target: LiveMap, now: number) {
  const { map, destination } = target
  const rest = map.getSource<GeoJSONSource>(ROUTE_SOURCE)
  const head = map.getSource<GeoJSONSource>(ROUTE_HEAD_SOURCE)
  target.progress = null
  if (
    currentOverview.active() &&
    (!useLive.getState().route || (useLive.getState().telemetry?.navigationDistance ?? 0) <= 0)
  ) {
    recentreLiveMap()
  }
  if (!rest || !head) return
  const { route, routeNext, routeStops } = useLive.getState()
  const stopsKey = `${route?.id ?? ''}:${routeStops.join(',')}`
  if (target.stops.key !== stopsKey) {
    target.stops.markers.forEach((marker) => marker.remove())
    const markers = route
      ? routeStops.flatMap((node, index) => {
          const point = route.nodes[node]?.position
          if (!point) return []
          const element = document.createElement('div')
          element.className = 'map-route-stop'
          element.textContent = String(index + 1)
          return [new maplibregl.Marker({ element }).setLngLat(toLngLat(...point)).addTo(map)]
        })
      : []
    target.stops = { key: stopsKey, markers }
  }
  if (target.routeShown?.route !== route) {
    target.routeShown = {
      route,
      spans: route ? routeSpans(route.nodes, route.paths, route.shifts) : [],
      restAfter: null,
      headFrom: null,
      heights: new Map(),
      heightsFor: null,
      restRaised: [],
      headRaised: [],
    }
    if (currentOverview.active()) target.overviewNeedsFit = true
    const end = route?.nodes.at(-1)
    if (end) {
      destination.setLngLat(toLngLat(...end.position))
      target.destLiftLast = null
      if (!destination.getElement().isConnected) destination.addTo(map)
    } else {
      rest.setData(NO_LINE)
      head.setData(NO_LINE)
      target.raised?.showRouteParts([], [], true)
      destination.remove()
    }
  }
  const shown = target.routeShown
  // The raised roads the route is on come and go with the tiles round the view.
  if (route && target.raised && shown.heightsFor !== target.raised.tilesChanged()) {
    shown.heightsFor = target.raised.tilesChanged()
    shown.heights = routeHeights(shown.spans, route.heights, target.raised.surfaceAt)
    shown.restAfter = null
    shown.headFrom = null
  }
  const truck = truckAt(samples, now - FOLLOW_DELAY_MS)
  // The way the truck faces, on the ground (x east, z south), from its compass bearing.
  const facing = truck && along(bearingOf(truck.heading))
  const found = route && truck ? progressOf(shown.spans, routeNext, [truck.x, truck.z], facing ?? undefined) : null
  // Short of the route's start, the line runs from the truck to it, and the truck is shown where it is.
  const approach = found && truck && facing ? approachLine(shown.spans, found, [truck.x, truck.z], facing) : null
  target.progress = found && truck && approach ? { ...found, at: [truck.x, truck.z], distance: 0 } : found
  const progress = target.progress
  if (!progress) return
  if (currentOverview.active() && target.overviewNeedsFit && !target.pressed && now - target.touched > 300)
    frameCurrentRoute(target)
  const { heights } = shown
  let restChanged = false
  if (progress.span !== shown.restAfter) {
    const { flat, raised } = cutRaised(restLine(shown.spans, progress.span), (point) => heights.get(point) ?? 0)
    rest.setData(linesOf(flat))
    shown.restRaised = raised
    shown.restAfter = progress.span
    shown.headFrom = null
    restChanged = true
  }
  const moved = shown.headFrom
    ? Math.hypot(progress.at[0] - shown.headFrom[0], progress.at[1] - shown.headFrom[1])
    : Infinity
  if (moved >= ROUTE_HEAD_STEP) {
    const line = approach ? [...approach, ...shown.spans[0].slice(1)] : headLine(shown.spans, progress)
    const atHeight = heightOnSpan(shown.spans[progress.span], progress, heights)
    const { flat, raised } = cutRaised(line, (point) => (point === progress.at ? atHeight : (heights.get(point) ?? 0)))
    head.setData(linesOf(flat))
    shown.headRaised = raised
    shown.headFrom = progress.at
    target.raised?.showRouteParts(shown.headRaised, shown.restRaised, restChanged)
  }
}

function updateCamera(target: LiveMap, now: number, dt: number) {
  const truck = truckAt(samples, now - FOLLOW_DELAY_MS)
  const { map, puck } = target
  if (!truck) return

  // The puck goes with the truck whatever the camera does: on the route, in the middle of its road.
  const shown: Point = target.progress ? snapToRoute(target.progress, [truck.x, truck.z]) : [truck.x, truck.z]
  const position = toLngLat(...shown)
  const bearing = bearingOf(truck.heading)
  let liftX = 0
  let liftY = 0
  if (target.raised) {
    // On a raised road, up there with it. Eased: a point off a road's edge isn't a drop.
    const surface = target.raised.surfaceAt(shown[0], shown[1], truck.y, TRUCK_ON_SURFACE)
    target.puckHeight += ((surface?.drawn ?? 0) - target.puckHeight) * Math.min(dt / PUCK_RISE_MS, 1)
    ;[liftX, liftY] = target.raised.screenLift(shown[0], shown[1], target.puckHeight)
    // The flag at the end of the route too, on the road the route ends on.
    const end = target.routeShown?.spans.at(-1)?.at(-1)
    if (end) {
      const [dx, dy] = target.raised.screenLift(end[0], end[1], target.routeShown?.heights.get(end) ?? 0)
      const prevDest = target.destLiftLast
      if (!prevDest || Math.abs(prevDest.x - dx) >= 0.05 || Math.abs(prevDest.y - dy) >= 0.05) {
        target.destination.setOffset([dx, dy])
        target.destLiftLast = { x: dx, y: dy }
      }
    }
  }
  const prevPuck = target.puckLast
  const connected = puck.getElement().isConnected
  if (
    !prevPuck ||
    !connected ||
    Math.abs(prevPuck.lng - position[0]) >= 1e-7 ||
    Math.abs(prevPuck.lat - position[1]) >= 1e-7 ||
    Math.abs(prevPuck.bearing - bearing) >= 0.05
  ) {
    puck.setLngLat(position).setRotation(bearing)
  }
  if (
    target.raised &&
    (!prevPuck || Math.abs(prevPuck.liftX - liftX) >= 0.05 || Math.abs(prevPuck.liftY - liftY) >= 0.05)
  ) {
    puck.setOffset([liftX, liftY])
  }
  if (!prevPuck) {
    target.puckLast = { lng: position[0], lat: position[1], bearing, liftX, liftY }
  } else {
    prevPuck.lng = position[0]
    prevPuck.lat = position[1]
    prevPuck.bearing = bearing
    prevPuck.liftX = liftX
    prevPuck.liftY = liftY
  }
  if (!connected) puck.addTo(map)

  if (target.mode === 'browse') {
    if (!target.pressed && !target.overview && !currentOverview.active() && now - target.touched > AUTO_RECENTRE_MS)
      recentreLiveMap()
    return
  }

  let baseZoom: number
  let basePitch: number
  if (target.interactive) {
    const settings = navCameraSettings()
    const guidance = settings.autoZoom && settings.junctionZoom ? physicalGuidanceFor(useLive.getState()) : null
    const targetCam = navigationCameraFor(truck.speed, settings, guidance)
    baseZoom = targetCam.zoom
    basePitch = targetCam.pitch
  } else {
    baseZoom = zoomForSpeed(truck.speed)
    basePitch = PITCH
  }
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, baseZoom + target.zoomOffset))
  const width = target.containerSize.width || map.getContainer().clientWidth
  const height = target.containerSize.height || map.getContainer().clientHeight
  // Behind the truck: facing its way, tilted, the truck at the lower third of the unobstructed visual viewport.
  // North up: from above, vertically centered at 50% while preserving horizontal visual centering.
  const wanted = target.northUp ? { bearing: 0, pitch: 0 } : { bearing, pitch: basePitch }
  const wantedPadding = visualCenterPadding({
    width,
    height,
    leftOcc: target.interactive ? visualInsets.left : 0,
    rightOcc: target.interactive ? visualInsets.right : 0,
    northUp: target.northUp,
    puckFromTop: PUCK_FROM_TOP,
  })

  if (target.mode === 'return' && target.glide) {
    // Towards where the following camera is now (the truck moves on while it glides).
    const t = (now - target.glide.started) / GLIDE_MS
    const eased = easeInOut(t)
    const towards = { center: position, zoom, bearing: wanted.bearing, pitch: wanted.pitch }
    const pad = blendPadding(target.glide.fromPadding, wantedPadding, eased)
    moveCamera(map, blendPose(target.glide.from, towards, eased), pad)
    if (t >= 1) {
      follow(target)
      target.camera = { bearing: wanted.bearing, zoom, pitch: wanted.pitch, padding: wantedPadding }
    }
    return
  }

  const dampAxis = (cur: number, dst: number) => {
    const next = reducedMotion() ? dst : damp(cur, dst, dt, PADDING_TAU_MS)
    return Math.abs(next - dst) < 0.1 ? dst : next
  }
  const zoomTau = target.interactive ? NAV_ZOOM_TAU_MS : ZOOM_TAU_MS
  target.camera = target.camera
    ? {
        bearing: dampBearing(target.camera.bearing, wanted.bearing, dt, BEARING_TAU_MS),
        zoom: damp(target.camera.zoom, zoom, dt, zoomTau),
        pitch: target.interactive ? damp(target.camera.pitch, wanted.pitch, dt, NAV_PITCH_TAU_MS) : wanted.pitch,
        padding: {
          top: dampAxis(target.camera.padding.top, wantedPadding.top),
          bottom: dampAxis(target.camera.padding.bottom, wantedPadding.bottom),
          left: dampAxis(target.camera.padding.left, wantedPadding.left),
          right: dampAxis(target.camera.padding.right, wantedPadding.right),
        },
      }
    : { bearing: wanted.bearing, zoom, pitch: wanted.pitch, padding: wantedPadding }
  // Held still while a button is down, so a drag can start (moving the camera cancels it).
  if (target.pressed) return
  const pose = {
    center: position,
    bearing: target.camera.bearing,
    zoom: target.camera.zoom,
    pitch: target.camera.pitch,
  }
  moveCamera(map, pose, target.camera.padding)
}

/**
 * Moves the map to `pose`, unless it's there already: every move draws the whole map again, so a parked
 * truck (and a camera that has settled) leaves the map, and the GPU the game shares, idle.
 */
function moveCamera(map: maplibregl.Map, pose: CameraPose, padding: CameraPadding) {
  const current = {
    center: map.getCenter().toArray() as [number, number],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }
  if (samePose(current, pose) && samePadding(map.getPadding(), padding)) return
  map.jumpTo({ ...pose, padding })
}

// Development: when this module is replaced (Vite hot reload), the old map goes with it, so a new one
// doesn't land on top.
import.meta.hot?.dispose(disposeLiveMap)

/** Resource state for the host's performance sample, without creating a map. */
export function mapResourceResident(): boolean {
  return live !== null
}
