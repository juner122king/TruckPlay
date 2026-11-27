import { beforeEach, describe, expect, it } from 'vitest'
import type { SemaphoreInfo, Telemetry } from '../../shared/host'
import { strings as enStrings } from '../state/strings/en_us'
import {
  corridorMatchesFor,
  quantizedTripOf,
  resetNavigationSnapshotCache,
  upcomingCorridorFor,
} from './navigationSnapshot'
import type { SpeedCamera } from './speedCameras'

const baseTelemetry: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  speed: 20,
  engineRpm: 1200,
  gear: 8,
  displayedGear: 8,
  cruiseControlSpeed: 80,
  fuel: 400,
  fuelRange: 900,
  navigationDistance: 12_450,
  navigationTime: 720,
  navigationSpeedLimit: 22.222,
  gameTime: 600,
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

beforeEach(() => {
  resetNavigationSnapshotCache()
})

describe('navigationSnapshot corridor caching', () => {
  it('returns reference-stable cached results when telemetry, route, semaphores, and cameras are unchanged', () => {
    const route = {
      id: 1,
      nodes: [
        { position: [0, 0] as [number, number], forward: [0, -1] as [number, number] },
        { position: [0, -250] as [number, number], forward: [0, -1] as [number, number] },
      ],
      distances: [250, 0],
      heights: [0, 0],
      paths: new Map(),
      maneuvers: [],
      shifts: new Map(),
    }
    const semaphores: SemaphoreInfo[] = [{ x: 2, y: 0, z: -80, heading: 0.5, state: 1, countdown: 9, duration: 30 }]
    const cameras: SpeedCamera[] = [{ x: -2, y: 0, z: -130, heading: 0, reverse: false }]
    const state = { telemetry: baseTelemetry, route, routeNext: 1, semaphores }

    const firstUpcoming = upcomingCorridorFor(baseTelemetry, route, 1)
    const secondUpcoming = upcomingCorridorFor(baseTelemetry, route, 1)
    expect(firstUpcoming).not.toBeNull()
    expect(secondUpcoming).toBe(firstUpcoming)

    const first = corridorMatchesFor(state, cameras)
    const second = corridorMatchesFor(state, cameras)
    expect(first.light?.semaphore.countdown).toBe(9)
    expect(first.camera?.camera.z).toBe(-130)
    expect(second.light).toBe(first.light)
    expect(second.camera).toBe(first.camera)

    // Replacing semaphores invalidates only light while keeping camera cached
    const updatedSemaphores: SemaphoreInfo[] = [
      { x: 2, y: 0, z: -80, heading: 0.5, state: 3, countdown: 14, duration: 30 },
    ]
    const third = corridorMatchesFor({ ...state, semaphores: updatedSemaphores }, cameras)
    expect(third.light?.semaphore.countdown).toBe(14)
    expect(third.camera).toBe(first.camera)
  })
})

describe('quantizedTripOf', () => {
  it('quantizes minor telemetry distance changes into identical shallow snapshots', () => {
    const route = {
      id: 42,
      nodes: [],
      distances: [25_000, 10_000, 0],
      heights: [0, 0, 0],
      paths: new Map(),
      maneuvers: [],
      shifts: new Map(),
    }
    const clock = { hours24: true, period: null }
    const a = quantizedTripOf(
      {
        telemetry: { ...baseTelemetry, navigationDistance: 12_450, navigationTime: 720 },
        route,
        routeStops: [1],
        routeNext: 0,
        clockShift: 0,
        mph: false,
        job: null,
      },
      enStrings,
      clock,
    )
    const b = quantizedTripOf(
      {
        telemetry: { ...baseTelemetry, navigationDistance: 12_448.6, navigationTime: 719.8 },
        route,
        routeStops: [1],
        routeNext: 0,
        clockShift: 0,
        mph: false,
        job: null,
      },
      enStrings,
      clock,
    )
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
    expect(a?.stopCount).toBe(1)
    expect(a?.onJob).toBe(false)
    expect(a?.progressPercent).toBe(50)
  })

  it('returns null when there is no active navigation distance', () => {
    const clock = { hours24: true, period: null }
    expect(
      quantizedTripOf(
        {
          telemetry: { ...baseTelemetry, navigationDistance: 0 },
          route: null,
          routeStops: [],
          routeNext: 0,
          clockShift: 0,
          mph: false,
          job: null,
        },
        enStrings,
        clock,
      ),
    ).toBeNull()
  })
})
