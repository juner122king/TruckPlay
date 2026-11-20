import { describe, expect, it } from 'vitest'
import type { SemaphoreInfo, Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import {
  nearestTrafficLightAhead,
  syncTrafficLights,
  trafficLightStateClass,
  type TrafficLightPool,
} from './trafficLights'

const baseTelemetry: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  // 0 heading in turns: north (-z direction)
  heading: 0,
  pitch: 0,
  roll: 0,
  speed: 10,
  engineRpm: 1200,
  gear: 6,
  displayedGear: 6,
  cruiseControlSpeed: 60,
  fuel: 300,
  fuelRange: 800,
  navigationDistance: 1000,
  navigationTime: 120,
  navigationSpeedLimit: 80,
  gameTime: 500,
  multiplayerTimeOffset: 0,
  localScale: 19,
  dashboardBacklight: 1,
  electricEnabled: true,
  engineEnabled: true,
  parkingBrake: false,
  lowBeam: false,
  highBeam: false,
  leftBlinker: false,
  rightBlinker: false,
  paused: false,
}

describe('nearestTrafficLightAhead', () => {
  it('detects a traffic light ahead in north direction (-z)', () => {
    const semaphores: SemaphoreInfo[] = [
      { x: 5, y: 0, z: -50, heading: 0.5, state: 2, countdown: 12.5, duration: 30 },
      { x: 5, y: 0, z: -150, heading: 0.5, state: 0, countdown: 25.0, duration: 40 },
    ]
    const nearest = nearestTrafficLightAhead(semaphores, baseTelemetry)
    expect(nearest).not.toBeNull()
    expect(nearest?.semaphore.countdown).toBe(12.5)
    expect(nearest?.distance).toBeCloseTo(50, 1)
  })

  it('ignores traffic lights behind, on adjacent streets, or on overpasses in free-driving mode', () => {
    const semaphores: SemaphoreInfo[] = [
      // Behind (+z when heading north)
      { x: 0, y: 0, z: 50, heading: 0, state: 2, countdown: 10, duration: 30 },
      // Adjacent parallel street (25m lateral, previously allowed by 45m corridor)
      { x: 25, y: 0, z: -60, heading: 0, state: 0, countdown: 20, duration: 30 },
      // Near cross-street signal (14m lateral at only 15m ahead, outside tapered cone)
      { x: 14, y: 0, z: -15, heading: 0, state: 1, countdown: 15, duration: 30 },
      // Overpass signal directly above (y = 18m vs truck y = 0m)
      { x: 2, y: 18, z: -50, heading: 0, state: 1, countdown: 12, duration: 30 },
      // Inactive / off (state 4)
      { x: 2, y: 0, z: -40, heading: 0, state: 4, countdown: 0, duration: 0 },
    ]
    const nearest = nearestTrafficLightAhead(semaphores, baseTelemetry)
    expect(nearest).toBeNull()
  })

  it('ignores traffic lights straight ahead of the truck nose when the active navigation route turns away', () => {
    // Reproduces the yard-exit scenario: truck faces North (heading 0), and a traffic light sits 110m
    // North at (4, -110), but the active route goes West and then turns South, never going North.
    const route = {
      nodes: [
        { position: [-10, -5] as [number, number], forward: [-1, 0] as [number, number] },
        { position: [-60, -5] as [number, number], forward: [-1, 0] as [number, number] },
        { position: [-60, 80] as [number, number], forward: [0, 1] as [number, number] },
      ],
    }
    const semaphores: SemaphoreInfo[] = [{ x: 4, y: 0, z: -110, heading: 0.5, state: 1, countdown: 19, duration: 30 }]
    const nearest = nearestTrafficLightAhead(semaphores, baseTelemetry, route, 0)
    expect(nearest).toBeNull()
  })

  it('matches only traffic lights along the active navigation route and ignores non-route lights past a turn', () => {
    // Route goes North from (0, 0) to (0, -60), then turns West to (-100, -60).
    const route = {
      nodes: [
        { position: [0, 0] as [number, number], forward: [0, -1] as [number, number] },
        { position: [0, -60] as [number, number], forward: [0, -1] as [number, number] },
        { position: [-100, -60] as [number, number], forward: [-1, 0] as [number, number] },
      ],
      paths: new Map<number, [number, number][]>([
        [
          1,
          [
            [0, -60],
            [-15, -60],
            [-40, -60],
            [-100, -60],
          ],
        ],
      ]),
    }
    const semaphores: SemaphoreInfo[] = [
      // Non-route traffic light continuing straight North at (3, -120)
      { x: 3, y: 0, z: -120, heading: 0.5, state: 1, countdown: 19, duration: 30 },
      // On-route traffic light along the Westbound road after the turn at (-55, -55)
      { x: -55, y: 0, z: -55, heading: 0.25, state: 3, countdown: 14, duration: 30 },
    ]
    const nearest = nearestTrafficLightAhead(semaphores, baseTelemetry, route, 1)
    expect(nearest).not.toBeNull()
    expect(nearest?.semaphore.countdown).toBe(14)
  })

  it('works when truck is heading east (0.75 turns, +x)', () => {
    // East: heading = 0.75
    const eastTelemetry: Telemetry = {
      ...baseTelemetry,
      heading: 0.75,
    }
    const semaphores: SemaphoreInfo[] = [
      // 80m ahead east (+x), 4m right (+z)
      { x: 80, y: 0, z: 4, heading: 0.25, state: 0, countdown: 18, duration: 30 },
      // 200m ahead east (+x)
      { x: 200, y: 0, z: 0, heading: 0.25, state: 2, countdown: 5, duration: 30 },
    ]
    const nearest = nearestTrafficLightAhead(semaphores, eastTelemetry)
    expect(nearest).not.toBeNull()
    expect(nearest?.semaphore.countdown).toBe(18)
    expect(nearest?.distance).toBeCloseTo(80, 1)
  })

  it('maps Prism3D semaphore states to correct CSS classes', () => {
    // 0: Yellow, 1: Red, 2: Red+Amber, 3: Green
    expect(trafficLightStateClass(0)).toBe('traffic-yellow')
    expect(trafficLightStateClass(1)).toBe('traffic-red')
    expect(trafficLightStateClass(2)).toBe('traffic-red-amber')
    expect(trafficLightStateClass(3)).toBe('traffic-green')
    expect(trafficLightStateClass(4)).toBe('traffic-off')
  })

  it('syncTrafficLights activates only the single nearest marker and removes all others', () => {
    // Construct mock pool without needing real DOM
    const markers: any[] = []
    const elements: any[] = []
    for (let i = 0; i < 4; i++) {
      const el = { isConnected: false }
      const marker = {
        getElement: () => el,
        addTo: () => {
          el.isConnected = true
        },
        remove: () => {
          el.isConnected = false
        },
        setLngLat: () => {},
      }
      markers.push(marker)
      elements.push({
        badge: { className: '' },
        timerBox: { style: { display: '' } },
        timer: { textContent: '' },
        housing: {},
      })
    }
    const pool = { markers, elements } as unknown as TrafficLightPool

    // Mock map
    const mockMap: any = {
      getZoom: () => 16,
      getContainer: () => ({ clientWidth: 1000, clientHeight: 1000 }),
      project: () => ({ x: 500, y: 500 }),
    }

    // Set state with 3 semaphores (state 1 = Red)
    useLive.setState({
      telemetry: baseTelemetry,
      semaphores: [
        { x: 2, y: 0, z: -30, heading: 0.5, state: 1, countdown: 14.2, duration: 30 },
        { x: 5, y: 0, z: -80, heading: 0.5, state: 3, countdown: 20.0, duration: 30 },
        { x: 3, y: 0, z: -120, heading: 0.5, state: 0, countdown: 3.0, duration: 30 },
      ],
    })

    syncTrafficLights(mockMap, pool)

    // Exactly 1 marker should be connected (the nearest one at z = -30, Red light)
    expect(pool.markers[0].getElement().isConnected).toBe(true)
    expect(pool.elements[0].timer.textContent).toBe('15')
    expect(pool.elements[0].badge.className).toContain('traffic-red')

    // Markers 1..3 must NOT be connected
    for (let i = 1; i < pool.markers.length; i++) {
      expect(pool.markers[i].getElement().isConnected).toBe(false)
    }
  })

  it('syncTrafficLights hides active markers when hidden (e.g. route overview) and tracks urgent countdown + phase progress', () => {
    const cssProps = new Map<string, string>()
    const el = { isConnected: false }
    const marker = {
      getElement: () => el,
      addTo: () => {
        el.isConnected = true
      },
      remove: () => {
        el.isConnected = false
      },
      setLngLat: () => {},
    }
    const element = {
      badge: {
        className: '',
        style: {
          setProperty: (k: string, v: string) => cssProps.set(k, v),
        },
      },
      timerBox: { style: { display: '' } },
      timer: { textContent: '' },
      housing: {},
      progress: { style: { display: '', transform: '' } },
    }
    const pool = { markers: [marker], elements: [element] } as unknown as TrafficLightPool
    const mockMap: any = {
      getZoom: () => 16,
      getContainer: () => ({ clientWidth: 1000, clientHeight: 1000 }),
      project: () => ({ x: 500, y: 500 }),
    }

    useLive.setState({
      telemetry: baseTelemetry,
      route: null,
      routeNext: 0,
      semaphores: [{ x: 2, y: 0, z: -40, heading: 0.5, state: 1, countdown: 2.4, duration: 24 }],
    })

    syncTrafficLights(mockMap, pool)
    expect(el.isConnected).toBe(true)
    expect(element.badge.className).toContain('traffic-red')
    expect(element.badge.className).toContain('urgent')
    expect(element.timer.textContent).toBe('3')
    expect(cssProps.get('--signal-progress')).toBe('0.100')
    expect(element.progress.style.display).toBe('block')
    expect(element.progress.style.transform).toBe('scaleX(0.100)')

    // Non-urgent signal
    useLive.setState({
      semaphores: [{ x: 2, y: 0, z: -40, heading: 0.5, state: 3, countdown: 12, duration: 30 }],
    })
    syncTrafficLights(mockMap, pool)
    expect(element.badge.className).toContain('traffic-green')
    expect(element.badge.className).not.toContain('urgent')
    expect(cssProps.get('--signal-progress')).toBe('0.400')

    // Hidden during route overview removes connected marker
    syncTrafficLights(mockMap, pool, true)
    expect(el.isConnected).toBe(false)
  })

  it('syncTrafficLights preserves MapLibre marker classes across state updates', () => {
    const classes = new Set(['maplibregl-marker', 'maplibregl-marker-anchor-bottom', 'traffic-light-badge'])
    const el = { isConnected: false }
    const marker = {
      getElement: () => el,
      addTo: () => {
        el.isConnected = true
      },
      remove: () => {
        el.isConnected = false
      },
      setLngLat: () => {},
    }
    const badge = {
      classList: {
        add: (...items: string[]) => items.forEach((item) => classes.add(item)),
        remove: (...items: string[]) => items.forEach((item) => classes.delete(item)),
      },
      get className() {
        return Array.from(classes).join(' ')
      },
      set className(value: string) {
        classes.clear()
        for (const item of value.split(/\s+/).filter(Boolean)) classes.add(item)
      },
    }
    const element = {
      badge,
      timerBox: { style: { display: '' } },
      timer: { textContent: '' },
      housing: {},
      progress: { style: { display: '', transform: '' } },
    }
    const pool = { markers: [marker], elements: [element] } as unknown as TrafficLightPool
    const mockMap: any = {
      getZoom: () => 16,
      getContainer: () => ({ clientWidth: 1000, clientHeight: 1000 }),
      project: () => ({ x: 500, y: 500 }),
    }

    useLive.setState({
      telemetry: baseTelemetry,
      route: null,
      routeNext: 0,
      semaphores: [{ x: 2, y: 0, z: -40, heading: 0.5, state: 1, countdown: 0, duration: 24 }],
    })
    syncTrafficLights(mockMap, pool)
    expect(classes.has('maplibregl-marker')).toBe(true)
    expect(classes.has('maplibregl-marker-anchor-bottom')).toBe(true)
    expect(classes.has('traffic-red')).toBe(true)
    expect(classes.has('no-timer')).toBe(true)

    useLive.setState({
      semaphores: [{ x: 2, y: 0, z: -40, heading: 0.5, state: 3, countdown: 10, duration: 30 }],
    })
    syncTrafficLights(mockMap, pool)
    expect(classes.has('maplibregl-marker')).toBe(true)
    expect(classes.has('maplibregl-marker-anchor-bottom')).toBe(true)
    expect(classes.has('traffic-green')).toBe(true)
    expect(classes.has('traffic-red')).toBe(false)
    expect(classes.has('no-timer')).toBe(false)
  })
})
