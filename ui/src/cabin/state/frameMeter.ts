import { routeKey } from './navigation'
import { useCabin, useLive } from './store'

/** A frame this long (ms) or longer counts as slow: the page waited (for the processor or the graphics card). */
const SLOW_MS = 50

/** What the page says with each of the host's performance lines (`westplayReport()`). */
export interface FrameReport {
  /** Its animation frames since the last line. */
  frames: number
  /** Of them, those that came [`SLOW_MS`] or more after the one before. */
  slow: number
  /** The seconds each screen was shown (`maps`, `home`, `dashboard`, `off`, `truck`…). */
  screens: Record<string, number>
}

/** The screen the cab shows now, by name (an app by its own: `maps`). */
export function screenName(): string {
  const { power, truckScreen, navigation } = useCabin.getState()
  if (power.phase !== 'on') return 'off'
  if (truckScreen) return 'truck'
  return routeKey(navigation.route).replace(/^app:/, '')
}

/**
 * Passive frame counter driven by real rendering work (such as the live map's render callback) instead of an
 * unconditional `requestAnimationFrame` loop. Static screens (Home, Settings, Music, Freight, or handed-over
 * truck screen) stay completely idle so Chromium's compositor and Windows Graphics Capture consume zero CPU/GPU.
 */
let activeRecorder: ((now: number) => void) | null = null

/** Records a rendered frame timestamp (ms) from active animated views such as `liveMap.ts`. */
export function recordRenderedFrame(now = performance.now()): void {
  activeRecorder?.(now)
}

export function meterFrames(): () => void {
  let frames = 0
  let slow = 0
  let screens: Record<string, number> = {}
  let running = false
  let last: number | null = null
  let shownEach: ReturnType<typeof setInterval> | undefined

  const record = (now: number) => {
    frames++
    // Only count a gap as slow if it's a real frame stall (< 1000ms); longer gaps mean the map was paused/hidden.
    if (last !== null) {
      const gap = now - last
      if (gap >= SLOW_MS && gap < 1000) slow++
    }
    last = now
  }

  const follow = (on: boolean) => {
    if (on === running) return
    running = on
    last = null
    clearInterval(shownEach)
    activeRecorder = on ? record : null
    if (!on) return
    shownEach = setInterval(() => {
      const name = screenName()
      screens[name] = (screens[name] ?? 0) + 1
    }, 1000)
  }
  const taker = window as { westplayReport?: () => FrameReport }
  taker.westplayReport = () => {
    const report = { frames, slow, screens }
    frames = 0
    slow = 0
    screens = {}
    return report
  }
  follow(useLive.getState().telemetry !== null)
  const stop = useLive.subscribe((live) => follow(live.telemetry !== null))
  return () => {
    stop()
    follow(false)
    clearInterval(shownEach)
    activeRecorder = null
    delete taker.westplayReport
  }
}
