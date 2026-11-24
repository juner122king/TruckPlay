import { describe, expect, it, vi } from 'vitest'
import type { Destination, DestinationKind } from './places'
import { toLngLat } from './projection'
import type { RouteNode } from './route'
import { addNearestStop, findNearestStop, type RouteGeometryLike } from './quickStop'

const node = (x: number, z: number): RouteNode => ({ position: [x, z], forward: [1, 0] })
const place = (kind: DestinationKind, name: string, x: number, z: number): Destination => ({
  kind,
  name,
  at: toLngLat(x, z),
  node: `node-${name}`,
})

const route: RouteGeometryLike = {
  nodes: [node(0, 0), node(5_000, 0), node(15_000, 0)],
  paths: new Map(),
  shifts: new Map(),
}

describe('quickStop', () => {
  it('picks the nearest matching place along the route ahead of the truck', () => {
    const places = [
      place('fuel', 'behind', 1_000, 50),
      place('parking', 'rest-ahead', 4_500, 200),
      place('fuel', 'fuel-ahead', 8_000, 150),
      place('fuel', 'fuel-far', 13_000, 100),
    ]
    const found = findNearestStop(places, ['fuel'], { x: 3_000, z: 0 }, route, 1)
    expect(found?.place.name).toBe('fuel-ahead')
    expect(found?.alongRoute).toBe(true)
    expect(found?.distanceMeters).toBeCloseTo(5_000, -1)
  })

  it('matches parking or hotel when looking for rest stops', () => {
    const places = [place('hotel', 'hotel-ahead', 6_000, 100), place('parking', 'parking-farther', 10_000, 100)]
    const found = findNearestStop(places, ['parking', 'hotel'], { x: 2_000, z: 0 }, route, 1)
    expect(found?.place.name).toBe('hotel-ahead')
    expect(found?.alongRoute).toBe(true)
  })

  it('falls back to straight-line nearest place when there is no route', () => {
    const places = [place('service', 'far-service', 12_000, 0), place('service', 'near-service', 2_400, 300)]
    const found = findNearestStop(places, ['service'], { x: 2_000, z: 0 }, null, 0)
    expect(found?.place.name).toBe('near-service')
    expect(found?.alongRoute).toBe(false)
    expect(found?.distanceMeters).toBeCloseTo(500, 0)
  })

  it('sends addStop when on a route or job, and go when idle', async () => {
    const places = [place('fuel', 'station-1', 6_000, 0)]
    const apply = vi.fn().mockResolvedValue('done')

    const onRouteResult = await addNearestStop(
      places,
      'fuel',
      { telemetry: { x: 2_000, z: 0 }, route, routeNext: 1, job: null },
      apply,
    )
    expect(onRouteResult.status).toBe('added')
    expect(apply).toHaveBeenCalledWith('addStop', 'node-station-1')

    apply.mockClear()
    const idleResult = await addNearestStop(
      places,
      'fuel',
      { telemetry: { x: 2_000, z: 0 }, route: null, routeNext: 0, job: { active: false } },
      apply,
    )
    expect(idleResult.status).toBe('added')
    expect(apply).toHaveBeenCalledWith('go', 'node-station-1')
  })
})
