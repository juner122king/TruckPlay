import { describe, expect, it } from 'vitest'
import type { JobInfo, RouteTargetInfo, Telemetry } from '../../shared/host'
import { strings as zhStrings } from '../state/strings/zh_cn'
import type { MapLabel } from './mapData'
import type { Destination } from './places'
import { toLngLat } from './projection'
import { deleteOverviewStop, reorderOverviewStops, resolveOverviewStops } from './routeTargets'

const baseTelemetry: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  speed: 20,
  engineRpm: 1300,
  gear: 8,
  displayedGear: 8,
  cruiseControlSpeed: 80,
  fuel: 400,
  fuelRange: 900,
  navigationDistance: 120_000,
  navigationTime: 5400,
  navigationSpeedLimit: 80,
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

const sampleRoute = {
  id: 12,
  nodes: [
    { position: [0, 0] as [number, number], forward: [1, 0] as [number, number] },
    { position: [1000, 0] as [number, number], forward: [1, 0] as [number, number] },
    { position: [2000, 0] as [number, number], forward: [1, 0] as [number, number] },
    { position: [3000, 0] as [number, number], forward: [1, 0] as [number, number] },
  ],
  distances: [120_000, 90_000, 45_000, 0],
  heights: [0, 0, 0, 0],
  paths: new Map(),
  maneuvers: [],
  shifts: new Map(),
}

const samplePlaces: Destination[] = [
  { kind: 'fuel', name: 'Shell', city: '柏林', at: toLngLat(1000, 0), node: 'a1' },
  { kind: 'service', city: '莱比锡', at: toLngLat(2000, 0), node: 'b2', also: 'b2alt' },
  { kind: 'company', name: 'LKW', city: '慕尼黑', at: toLngLat(3000, 0), node: 'c3' },
]

const sampleLabels: MapLabel[] = [
  { kind: 'city', name: 'Berlin', localized: '柏林', population: 1000, at: toLngLat(1000, 0) },
  { kind: 'city', name: 'Munich', localized: '慕尼黑', population: 900, at: toLngLat(3000, 0) },
]

const deliveryJob: JobInfo = {
  active: true,
  cargoLoaded: true,
  special: false,
  cargo: '医疗设备',
  cargoMass: 12000,
  sourceCity: '汉堡',
  sourceCompany: 'Nordic Cargo',
  destinationCity: '慕尼黑',
  destinationCompany: 'EuroGoodies',
  deliveryTime: 1800,
  plannedDistanceKm: 120,
  income: 15000,
}

describe('resolveOverviewStops & dual-state stop mutations', () => {
  it('resolves non-job routes with all points editable and computes remaining distances', () => {
    const targets: RouteTargetInfo[] = [
      { uid: 'a1', position: [1000, 0], nodeIndex: 1, locked: false },
      { uid: 'b2alt', position: [2000, 0], nodeIndex: 2, locked: false },
      { uid: 'c3', position: [3000, 0], nodeIndex: 3, locked: false },
    ]
    const snap = resolveOverviewStops(
      {
        route: sampleRoute,
        routeNext: 0,
        routeStops: [1, 2],
        routeTargets: targets,
        telemetry: baseTelemetry,
        job: null,
        mph: false,
      },
      samplePlaces,
      sampleLabels,
      zhStrings,
    )

    expect(snap.onJob).toBe(false)
    expect(snap.movableCount).toBe(3)
    expect(snap.intermediateCount).toBe(2)
    expect(
      snap.items.map((item) => [item.title, item.stopNumber, item.isDestination, item.locked, item.distance]),
    ).toEqual([
      ['Shell', 1, false, false, '30 km'],
      ['服务站', 2, false, false, '75 km'],
      ['LKW', null, true, false, '120 km'],
    ])
  })

  it('allows reordering and deleting the endpoint in non-job mode', () => {
    const targets: RouteTargetInfo[] = [
      { uid: 'a1', position: [1000, 0], nodeIndex: 1, locked: false },
      { uid: 'b2', position: [2000, 0], nodeIndex: 2, locked: false },
      { uid: 'c3', position: [3000, 0], nodeIndex: 3, locked: false },
    ]
    const snap = resolveOverviewStops(
      {
        route: sampleRoute,
        routeNext: 0,
        routeStops: [1, 2],
        routeTargets: targets,
        telemetry: baseTelemetry,
        job: null,
        mph: false,
      },
      samplePlaces,
      sampleLabels,
      zhStrings,
    )

    // Moving destination (index 2) to the front makes b2 the new destination.
    const movedDest = reorderOverviewStops(snap.items, snap.onJob, 2, 0)
    expect(movedDest?.submitUids).toEqual(['c3', 'a1', 'b2'])

    // Deleting the destination keeps the remaining stops with b2 promoted to destination.
    const deletedDest = deleteOverviewStop(snap.items, snap.onJob, 2)
    expect(deletedDest?.submitUids).toEqual(['a1', 'b2'])
    expect(deletedDest?.endsRoute).toBe(false)

    // Deleting the only remaining point in non-job mode ends the route.
    const single = resolveOverviewStops(
      {
        route: sampleRoute,
        routeNext: 0,
        routeStops: [],
        routeTargets: [{ uid: 'c3', position: [3000, 0], nodeIndex: 3, locked: false }],
        telemetry: baseTelemetry,
        job: null,
        mph: false,
      },
      samplePlaces,
      sampleLabels,
      zhStrings,
    )
    const ended = deleteOverviewStop(single.items, single.onJob, 0)
    expect(ended).toEqual({ items: [], submitUids: [], endsRoute: true })
  })

  it('locks the trailing job destination and clamps intermediate reordering strictly before it', () => {
    const targets: RouteTargetInfo[] = [
      { uid: 'a1', position: [1000, 0], nodeIndex: 1, locked: false },
      { uid: 'b2', position: [2000, 0], nodeIndex: 2, locked: false },
      { uid: 'jobdest', position: [3000, 0], nodeIndex: 3, locked: true },
    ]
    const snap = resolveOverviewStops(
      {
        route: sampleRoute,
        routeNext: 0,
        routeStops: [1, 2],
        routeTargets: targets,
        telemetry: baseTelemetry,
        job: deliveryJob,
        mph: false,
      },
      samplePlaces,
      sampleLabels,
      zhStrings,
    )

    expect(snap.onJob).toBe(true)
    expect(snap.movableCount).toBe(2)
    expect(snap.items[2].locked).toBe(true)
    expect(snap.items[2].title).toBe('EuroGoodies')
    expect(snap.items[2].subtitle).toBe('送达地 · 慕尼黑')

    // Trying to move the job destination itself is rejected.
    expect(reorderOverviewStops(snap.items, true, 2, 0)).toBeNull()
    // Trying to delete the job destination itself is rejected.
    expect(deleteOverviewStop(snap.items, true, 2)).toBeNull()

    // Trying to drag stop 0 past the locked destination (index 2) clamps to index 1 (last intermediate slot).
    const clamped = reorderOverviewStops(snap.items, true, 0, 2)
    expect(clamped?.submitUids).toEqual(['b2', 'a1'])
    expect(clamped?.items[2].uid).toBe('jobdest')

    // Deleting the last intermediate stop on a job submits [] without ending the job route.
    const oneStop = resolveOverviewStops(
      {
        route: sampleRoute,
        routeNext: 0,
        routeStops: [1],
        routeTargets: [
          { uid: 'a1', position: [1000, 0], nodeIndex: 1, locked: false },
          { uid: 'jobdest', position: [3000, 0], nodeIndex: 3, locked: true },
        ],
        telemetry: baseTelemetry,
        job: deliveryJob,
        mph: false,
      },
      samplePlaces,
      sampleLabels,
      zhStrings,
    )
    const cleared = deleteOverviewStop(oneStop.items, true, 0)
    expect(cleared?.submitUids).toEqual([])
    expect(cleared?.endsRoute).toBe(false)
    expect(cleared?.items).toHaveLength(1)
    expect(cleared?.items[0].locked).toBe(true)
  })

  it('uses pickup company info before cargo is loaded and falls back to nearest city for custom pins', () => {
    const pickupJob: JobInfo = { ...deliveryJob, cargoLoaded: false }
    const snap = resolveOverviewStops(
      {
        route: sampleRoute,
        routeNext: 0,
        routeStops: [1],
        routeTargets: [
          { uid: 'ff99', position: [1010, 0], nodeIndex: 1, locked: false },
          { uid: 'pickup1', position: [3000, 0], nodeIndex: 3, locked: true },
        ],
        telemetry: baseTelemetry,
        job: pickupJob,
        mph: false,
      },
      samplePlaces,
      sampleLabels,
      zhStrings,
    )

    expect(snap.items[0].title).toBe('Berlin')
    expect(snap.items[0].subtitle).toBe('地图上的点')
    expect(snap.items[1].title).toBe('Nordic Cargo')
    expect(snap.items[1].subtitle).toBe('取货地 · 汉堡')
  })
})
