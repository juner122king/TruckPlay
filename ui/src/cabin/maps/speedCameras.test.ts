import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import { GuidanceFooterView } from './GuidanceCard'
import { SpeedCameraPillView } from './SpeedCameraPill'
import {
  nearestSpeedCameraAhead,
  type SpeedCamera,
  type SpeedCameraPool,
  syncSpeedCameras,
} from './speedCameras'
import { speedCameraSnapshotOf } from './useSpeedCamera'

const baseTelemetry: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  speed: 20, // 72 km/h
  engineRpm: 1200,
  gear: 6,
  displayedGear: 6,
  cruiseControlSpeed: 60,
  fuel: 300,
  fuelRange: 800,
  navigationDistance: 1000,
  navigationTime: 120,
  navigationSpeedLimit: 22.222, // ~80 km/h
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

describe('nearestSpeedCameraAhead', () => {
  it('selects the nearest fixed speed camera ahead in free-driving mode', () => {
    const cameras: SpeedCamera[] = [
      { x: 4, y: 0, z: -180, heading: 0, reverse: false },
      { x: 4, y: 0, z: -70, heading: 0, reverse: false },
    ]
    const nearest = nearestSpeedCameraAhead(cameras, baseTelemetry)
    expect(nearest).not.toBeNull()
    expect(nearest?.camera.z).toBe(-70)
    expect(nearest?.distance).toBeCloseTo(70, 1)
  })

  it('ignores cameras behind, on parallel roads, or on overpasses', () => {
    const cameras: SpeedCamera[] = [
      { x: 0, y: 0, z: 40, heading: 0, reverse: false },
      { x: 25, y: 0, z: -60, heading: 0, reverse: false },
      { x: 2, y: 18, z: -50, heading: 0, reverse: false },
    ]
    expect(nearestSpeedCameraAhead(cameras, baseTelemetry)).toBeNull()
  })

  it('matches only cameras along the active navigation route polyline', () => {
    const route = {
      nodes: [
        { position: [-10, -5] as [number, number], forward: [-1, 0] as [number, number] },
        { position: [-80, -5] as [number, number], forward: [-1, 0] as [number, number] },
      ],
    }
    const cameras: SpeedCamera[] = [
      { x: 4, y: 0, z: -110, heading: 0, reverse: false },
      { x: -60, y: 0, z: -4, heading: 0.25, reverse: false },
    ]
    const nearest = nearestSpeedCameraAhead(cameras, { ...baseTelemetry, x: -5, z: -5, heading: 0.25 }, route, 0)
    expect(nearest?.camera.x).toBe(-60)
  })
})

describe('syncSpeedCameras', () => {
  it('activates only the single nearest marker, obeys zoom/hidden, and reflects overspeed state', () => {
    const markers: any[] = []
    const elements: any[] = []
    for (let i = 0; i < 3; i++) {
      const el = { isConnected: false }
      markers.push({
        getElement: () => el,
        addTo: () => {
          el.isConnected = true
        },
        remove: () => {
          el.isConnected = false
        },
        setLngLat: () => {},
      })
      elements.push({
        badge: { className: '' },
        pin: {},
        limitBox: { style: { display: '' } },
        limitText: { textContent: '' },
      })
    }
    const pool = { markers, elements } as unknown as SpeedCameraPool
    let zoom = 16
    const mockMap: any = {
      getZoom: () => zoom,
      getContainer: () => ({ clientWidth: 1000, clientHeight: 1000 }),
      project: () => ({ x: 500, y: 500 }),
    }
    const cameras: SpeedCamera[] = [
      { x: 2, y: 0, z: -60, heading: 0, reverse: false },
      { x: 2, y: 0, z: -140, heading: 0, reverse: true },
    ]

    useLive.setState({ telemetry: baseTelemetry, route: null, routeNext: 0, mph: false })
    syncSpeedCameras(mockMap, pool, cameras)
    expect(markers[0].getElement().isConnected).toBe(true)
    expect(markers[1].getElement().isConnected).toBe(false)
    expect(elements[0].limitText.textContent).toBe('80')
    expect(elements[0].badge.className).not.toContain('overspeed')

    // Overspeeding (> 80 km/h)
    useLive.setState({ telemetry: { ...baseTelemetry, speed: 26 }, route: null, routeNext: 0, mph: false })
    syncSpeedCameras(mockMap, pool, cameras)
    expect(elements[0].badge.className).toContain('overspeed')

    // Zoomed out (< 13.5)
    zoom = 12
    syncSpeedCameras(mockMap, pool, cameras)
    expect(markers[0].getElement().isConnected).toBe(false)

    // Hidden during overview
    zoom = 16
    syncSpeedCameras(mockMap, pool, cameras, true)
    expect(markers[0].getElement().isConnected).toBe(false)
  })
})

describe('SpeedCameraPill', () => {
  it('quantizes snapshot and renders GuidanceCard / free-drive pill', () => {
    const cameras: SpeedCamera[] = [{ x: 2, y: 0, z: -65, heading: 0, reverse: false }]
    const snap = speedCameraSnapshotOf(cameras, { ...baseTelemetry, speed: 25 }, null, 0, '.', false)
    expect(snap).not.toBeNull()
    expect(snap?.limit).toBe(80)
    expect(snap?.overspeed).toBe(true)
    expect(snap?.urgent).toBe(true)
    expect(snap?.distanceText).toBe('70 m')

    const html = renderToStaticMarkup(createElement(SpeedCameraPillView, { camera: snap!, label: '前方测速' }))
    expect(html).toContain('前方测速')
    expect(html).toContain('80')
    expect(html).toContain('70 m')
    expect(html).toContain('overspeed')

    const footerHtml = renderToStaticMarkup(
      createElement(GuidanceFooterView, {
        thenStep: { kind: 'arrive' },
        signal: { stateClass: 'traffic-red', countdown: 8, distanceText: '120 m', progressPct: 50, urgent: false },
        camera: snap,
        closing: false,
        variant: 'banner',
      }),
    )
    expect(footerHtml).toContain('guidance-footer-slot guidance-then-slot open')
    expect(footerHtml).toContain('traffic-pill traffic-red')
    expect(footerHtml).toContain('speed-camera-pill overspeed')
  })
})
