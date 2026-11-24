import { describe, expect, it } from 'vitest'
import type { LaneHint } from '../../shared/host'
import { formatTripDistance } from '../../shared/format'
import {
  gameGuidanceDistancesOf,
  guidanceDistancesOf,
  guidanceFor,
  type GuidanceState,
  physicalGuidanceFor,
} from './guidanceDistance'
import { NOW_WITHIN, type Maneuver } from './guidance'
import { laneHintOf } from './laneGuidance'
import { type Point, SNAP_NONE } from './route'

const turn = (node: number, kind: Maneuver['turn'] = 'right'): Maneuver => ({
  node,
  turn: kind,
  angle: 90,
  exit: null,
})

function routeOf(
  points: Point[] = [
    [0, 0],
    [100, 0],
    [200, 0],
  ],
) {
  return {
    id: 1,
    nodes: points.map((position) => ({ position, forward: [1, 0] as Point })),
    distances: points.map((_, i) => (points.length - 1 - i) * 2000),
    paths: new Map(points.slice(1).map((point, i) => [i, [points[i], point]])),
    shifts: new Map<number, number>(),
    maneuvers: [turn(1)],
  }
}

function stateOf(scale = 20, x = 50): GuidanceState {
  const route = routeOf()
  route.distances = [200 * scale, 100 * scale, 0]
  return {
    route,
    routeNext: 1,
    telemetry: { x, z: 0, heading: 0.75, navigationDistance: (200 - x) * scale, localScale: scale },
  }
}

const laneHint: LaneHint = {
  node: 1,
  start: 0,
  end: 2,
  lanes: [
    { directions: ['straight'], recommended: true },
    { directions: ['right'], recommended: false },
  ],
}

function adviceOf(state: GuidanceState, previous: LaneHint | null = null) {
  const distance = guidanceDistancesOf(state)
  return distance ? laneHintOf([laneHint], distance.distances, state.routeNext, distance.distanceLeft, previous) : null
}

describe('game-scaled card guidance distances', () => {
  for (const scale of [1, 3, 15, 19, 20]) {
    for (const physicalMetres of [50, 100]) {
      it(`matches game trip distance (${physicalMetres * scale} m) for a turn at scale ${scale}`, () => {
        const state = stateOf(scale, 100 - physicalMetres)
        const guidance = guidanceFor(state)!
        expect(guidance.step).toEqual({ kind: 'turn', maneuver: turn(1) })
        expect(guidance.distance).toBeCloseTo(physicalMetres * scale)
      })
    }
  }

  it('keeps highway exit countdown 1:1 with total remaining trip distance (5 km physical at 1:20 = 100 km game)', () => {
    const route = routeOf([
      [0, 0],
      [5000, 0],
      [12_500, 0],
    ])
    route.distances = [250_000, 150_000, 0]
    route.maneuvers = [turn(1, 'exit-right')]
    const start: GuidanceState = {
      route,
      routeNext: 1,
      telemetry: { x: 0, z: 0, heading: 0.75, navigationDistance: 250_000, localScale: 20 },
    }
    const atStart = guidanceFor(start)!
    expect(atStart.step).toEqual({ kind: 'turn', maneuver: turn(1, 'exit-right') })
    expect(atStart.distance).toBe(100_000)
    expect(formatTripDistance(atStart.distance)).toBe('100 km')
    // Physical guidance for camera/triggers still sees 5,000 actual metres.
    expect(physicalGuidanceFor(start)?.distance).toBeCloseTo(5000)

    const atExit: GuidanceState = {
      route,
      routeNext: 1,
      telemetry: { x: 5000, z: 0, heading: 0.75, navigationDistance: 150_000, localScale: 20 },
    }
    expect(start.telemetry!.navigationDistance - atExit.telemetry!.navigationDistance).toBe(atStart.distance)
    expect(guidanceFor(atExit)?.distance).toBe(0)
  })

  it('does not jump across mixed city/highway routes when localScale changes', () => {
    const state = stateOf(3)
    state.route = routeOf([
      [0, 0],
      [100, 0],
      [300, 0],
    ])
    state.route.distances = [4300, 4000, 0] // 100 city metres (300 m game) + 200 highway metres (4000 m game).
    state.route.maneuvers = [turn(2)]
    state.telemetry = { ...state.telemetry!, navigationDistance: 4150 }
    for (const localScale of [3, 19, 20, 0, NaN]) {
      const changed = { ...state, telemetry: { ...state.telemetry!, localScale } }
      expect(guidanceFor(changed)?.distance).toBe(4150)
      expect(physicalGuidanceFor(changed)?.distance).toBeCloseTo(250)
    }
  })

  it('matches total trip distance on arrival so the card never contradicts the trip pill', () => {
    const state = stateOf(20, 175)
    const passed: GuidanceState = {
      ...state,
      routeNext: 3,
      telemetry: { ...state.telemetry!, x: 175, navigationDistance: 500 },
    }
    expect(guidanceFor(passed)).toEqual({ step: { kind: 'arrive' }, distance: 500, then: null })
    expect(physicalGuidanceFor(passed)?.distance).toBeCloseTo(25)
    expect(guidanceFor({ ...passed, telemetry: { ...passed.telemetry!, navigationDistance: 0 } })).toBeNull()
  })

  it('uses game distance for now while keeping physical distance for consecutive-turn "then" warnings', () => {
    const state = stateOf(20, 99)
    const almostNow = guidanceFor({
      ...state,
      telemetry: { ...state.telemetry!, x: 99, navigationDistance: 2020 },
    })!
    expect(almostNow.distance).toBe(20)
    expect(almostNow.distance < NOW_WITHIN).toBe(true)

    // Two highway turns 350 physical m apart (7000 game m apart) still trigger "then" via physical proximity.
    for (const [gap, expectedThen] of [
      [350, true],
      [400, true],
      [401, false],
    ] as const) {
      const route = routeOf([
        [0, 0],
        [100, 0],
        [100 + gap, 0],
        [1000, 0],
      ])
      route.distances = [20_000, 18_000, 18_000 - gap * 20, 0]
      route.maneuvers = [turn(1), turn(2, 'left')]
      const guidance = guidanceFor({
        ...state,
        route,
        telemetry: { ...state.telemetry!, x: 50, navigationDistance: 19_000 },
      })!
      expect(guidance.distance).toBe(1000)
      expect(guidance.then).toEqual(expectedThen ? { kind: 'turn', maneuver: turn(2, 'left') } : null)
    }
  })

  it('handles non-monotonic multi-leg/ferry routes without collapsing upcoming turns to "now"', () => {
    const route = routeOf([
      [0, 0],
      [100, 0],
      [200, 0],
      [300, 0],
      [400, 0],
    ])
    // Leg 1 falls 900 -> 500, ferry/leg-2 rises 500 -> 7000 -> 6000 -> 0 (as logged in crates/host/src/route.rs).
    route.distances = [900, 500, 7000, 6000, 0]
    route.maneuvers = [turn(1, 'right'), turn(3, 'left')]

    // On leg 1 (halfway between node 0 and node 1): distance to node 1 is 200 m, never 0 ("now") or 7400 m.
    const onLeg1: GuidanceState = {
      route,
      routeNext: 1,
      telemetry: { x: 50, z: 0, heading: 0.75, navigationDistance: 7900, localScale: 19 },
    }
    const leg1Guidance = guidanceFor(onLeg1)!
    expect(leg1Guidance.step).toEqual({ kind: 'turn', maneuver: turn(1, 'right') })
    expect(leg1Guidance.distance).toBeCloseTo(200)

    // Still accurate even if localScale is unavailable while on a monotonic span before the rise.
    const leg1NoScale: GuidanceState = {
      ...onLeg1,
      telemetry: { ...onLeg1.telemetry!, localScale: 0 },
    }
    expect(guidanceFor(leg1NoScale)?.distance).toBeCloseTo(200)

    // Once past the rise (on the final monotonic leg), game distances work directly even without geometry.
    const brokenGeometryRoute = { ...route, paths: new Map([[0, [] as Point[]]]) }
    const onLeg2: GuidanceState = {
      route: brokenGeometryRoute,
      routeNext: 3,
      telemetry: { x: 250, z: 0, heading: 0.75, navigationDistance: 6500, localScale: 19 },
    }
    const leg2Guidance = guidanceFor(onLeg2)!
    expect(leg2Guidance.step).toEqual({ kind: 'turn', maneuver: turn(3, 'left') })
    expect(leg2Guidance.distance).toBe(500)

    // Arrival after the final turn always matches telemetry.navigationDistance.
    const arriving: GuidanceState = {
      route,
      routeNext: 5,
      telemetry: { x: 350, z: 0, heading: 0.75, navigationDistance: 3000, localScale: 19 },
    }
    expect(guidanceFor(arriving)).toEqual({ step: { kind: 'arrive' }, distance: 3000, then: null })

    // On a non-monotonic leg without geometry or far off-route, hide guidance conservatively.
    expect(guidanceFor({ ...onLeg1, route: brokenGeometryRoute })).toBeNull()
    expect(guidanceFor({ ...onLeg1, telemetry: { ...onLeg1.telemetry!, z: SNAP_NONE + 1 } })).toBeNull()
  })

  it('preserves unit formatting for nearby turns in both metric and imperial profiles', () => {
    const guidance = guidanceFor(stateOf(1, 50))!
    expect(formatTripDistance(guidance.distance, ',', false)).toBe('50 m')
    expect(formatTripDistance(guidance.distance, '.', true)).toBe('150 ft')
  })

  it('falls back to physical * localScale when route.distances is invalid and hides when neither source works', () => {
    const state = stateOf(20, 50)
    for (const distances of [[], [4000, NaN, 0], [4000, Infinity, 0], [4000, -1, 0], [4000]]) {
      const route = { ...state.route!, distances }
      expect(guidanceFor({ ...state, route })?.distance).toBeCloseTo(1000)
      expect(guidanceFor({ ...state, route, telemetry: { ...state.telemetry!, localScale: 0 } })).toBeNull()
      const noGeometry = { ...route, paths: new Map([[0, [] as Point[]]]) }
      expect(guidanceFor({ ...state, route: noGeometry })).toBeNull()
    }
  })

  it('handles single-node routes with the game arrival distance', () => {
    const state = stateOf()
    state.route = routeOf([[0, 0]])
    state.route.distances = [0]
    state.route.maneuvers = []
    expect(guidanceFor(state)).toEqual({ step: { kind: 'arrive' }, distance: 3000, then: null })
  })

  it('hides for no route, no telemetry, invalid progress or inactive navigation', () => {
    const state = stateOf()
    expect(guidanceFor({ ...state, route: null })).toBeNull()
    expect(guidanceFor({ ...state, telemetry: null })).toBeNull()
    for (const navigationDistance of [0, -1, NaN, Infinity])
      expect(guidanceFor({ ...state, telemetry: { ...state.telemetry!, navigationDistance } })).toBeNull()
    for (const routeNext of [-1, 0.5, NaN, Infinity]) expect(guidanceFor({ ...state, routeNext })).toBeNull()
  })
})

describe('physical guidance distances for spatial triggers (lane hysteresis & junction camera)', () => {
  for (const scale of [1, 3, 15, 19, 20]) {
    for (const metres of [50, 100]) {
      it(`supplies ${metres} physical metres to a turn at scale ${scale}`, () => {
        const state = stateOf(scale, 100 - metres)
        const guidance = physicalGuidanceFor(state)!
        expect(guidance.step).toEqual({ kind: 'turn', maneuver: turn(1) })
        expect(guidance.distance).toBeCloseTo(metres)
      })
    }
  }

  it('follows a bent junction path instead of measuring its straight-line chord', () => {
    const state = stateOf()
    const route = routeOf([
      [0, 0],
      [100, 100],
      [200, 100],
    ])
    route.paths.set(0, [
      [0, 0],
      [100, 0],
      [100, 100],
    ])
    state.route = route
    state.telemetry = { ...state.telemetry!, x: 50 }
    expect(physicalGuidanceFor(state)?.distance).toBeCloseTo(150)
  })

  it('uses the inferred road curve before junction paths are available', () => {
    const state = stateOf()
    state.route = routeOf([
      [0, 0],
      [100, 100],
    ])
    state.route.paths = new Map()
    state.route.nodes[1].forward = [0, 1]
    state.telemetry = { ...state.telemetry!, x: 0 }
    expect(physicalGuidanceFor(state)?.distance).toBeGreaterThan(Math.hypot(100, 100))
  })

  it('keeps a looping roundabout approach distinct from its overlapping way back', () => {
    const state = stateOf()
    const route = routeOf([
      [0, 0],
      [100, 0],
      [100, 10],
      [0, 0],
    ])
    route.paths.set(2, [
      [100, 10],
      [100, 0],
      [0, 0],
    ])
    route.maneuvers = [{ ...turn(1, 'roundabout'), exit: 2 }]
    state.route = route
    expect(physicalGuidanceFor(state)?.distance).toBeCloseTo(50)
    const returning = { ...state, routeNext: 4, telemetry: { ...state.telemetry!, heading: 0.25 } }
    expect(physicalGuidanceFor(returning)?.step).toEqual({ kind: 'arrive' })
    expect(physicalGuidanceFor(returning)?.distance).toBeCloseTo(50)
  })

  it('includes the approach before the route start, then counts down smoothly onto the route', () => {
    const state = stateOf(20, -50)
    state.routeNext = 0
    for (const [x, distance] of [
      [-50, 150],
      [-1, 101],
      [0, 100],
      [1, 99],
    ]) {
      const moving = { ...state, telemetry: { ...state.telemetry!, x } }
      expect(physicalGuidanceFor(moving)?.distance).toBeCloseTo(distance)
    }
  })

  it('measures from the projected vehicle position within the map snap range', () => {
    const state = stateOf()
    for (const z of [0, 10, SNAP_NONE])
      expect(physicalGuidanceFor({ ...state, telemetry: { ...state.telemetry!, z } })?.distance).toBeCloseTo(50)
  })

  it('keeps physical 1000m/1200m thresholds for lane advice while card distance stays in game metres', () => {
    const state = stateOf()
    state.route = routeOf([
      [0, 0],
      [1500, 0],
      [3000, 0],
    ])
    for (const localScale of [3, 20]) {
      const route = {
        ...state.route,
        distances: [3000 * localScale, 1500 * localScale, 0],
      }
      for (const [distance, eligible] of [
        [1000, true],
        [1001, false],
      ] as const) {
        const near: GuidanceState = {
          ...state,
          route,
          telemetry: {
            ...state.telemetry!,
            localScale,
            x: 1500 - distance,
            navigationDistance: (1500 + distance) * localScale,
          },
        }
        const physical = guidanceDistancesOf(near)!
        const game = gameGuidanceDistancesOf(near)!
        expect(physical.distanceLeft - physical.distances[laneHint.node]).toBeCloseTo(distance)
        expect(game.distanceLeft - game.distances[laneHint.node]).toBeCloseTo(distance * localScale)
        expect(guidanceFor(near)?.distance).toBeCloseTo(distance * localScale)
        expect(adviceOf(near)).toBe(eligible ? laneHint : null)
      }
      for (const [distance, retained] of [
        [1200, true],
        [1201, false],
      ] as const) {
        const near: GuidanceState = {
          ...state,
          route,
          telemetry: {
            ...state.telemetry!,
            localScale,
            x: 1500 - distance,
            navigationDistance: (1500 + distance) * localScale,
          },
        }
        expect(adviceOf(near, laneHint)).toBe(retained ? laneHint : null)
      }
    }
  })
})

describe('guidance geometry lifetime and physical fallback', () => {
  it('shares one sample across consumers and keeps cumulative lengths as the truck moves', () => {
    const state = stateOf()
    const first = guidanceDistancesOf(state)!
    expect(guidanceDistancesOf(state)).toBe(first)
    const firstGame = gameGuidanceDistancesOf(state)!
    expect(gameGuidanceDistancesOf(state)).toBe(firstGame)
    const moved = guidanceDistancesOf({ ...state, telemetry: { ...state.telemetry!, x: 60 } })!
    expect(moved.distances).toBe(first.distances)
    expect(moved.distanceLeft).toBeCloseTo(first.distanceLeft - 10)
    expect(state.route?.distances).toEqual([4000, 2000, 0])
    expect(state.telemetry?.navigationDistance).toBe(3000)
  })

  it('rebuilds geometry when junction paths arrive under the same route ID', () => {
    const state = stateOf()
    const before = guidanceDistancesOf(state)!
    const paths = new Map(state.route!.paths)
    paths.set(0, [
      [0, 0],
      [50, 0],
      [50, 100],
      [100, 100],
      [100, 0],
    ])
    const updated = { ...state, route: { ...state.route!, paths } }
    const after = guidanceDistancesOf(updated)!
    expect(after.distances).not.toBe(before.distances)
    expect(physicalGuidanceFor(updated)?.distance).toBeCloseTo(250)
    expect(physicalGuidanceFor(state)?.distance).toBeCloseTo(50)
  })

  it('rebuilds after a reroute, without retaining a distance from the old route', () => {
    const state = stateOf()
    expect(physicalGuidanceFor(state)?.distance).toBeCloseTo(50)
    const route = {
      ...routeOf([
        [0, 0],
        [500, 0],
        [1000, 0],
      ]),
      id: 2,
    }
    expect(physicalGuidanceFor({ ...state, route })?.distance).toBeCloseTo(450)
  })

  it('rebuilds carriageway shifts and uses them even before detailed paths arrive', () => {
    const state = stateOf()
    const route = { ...routeOf(), paths: new Map<number, Point[]>() }
    const before = guidanceDistancesOf({ ...state, route })!
    const updated = {
      ...route,
      shifts: new Map([
        [0, 10],
        [1, 10],
        [2, 10],
      ]),
    }
    const after = guidanceDistancesOf({ ...state, route: updated, telemetry: { ...state.telemetry!, z: 10 } })!
    expect(after.distances).not.toBe(before.distances)
    expect(after.distanceLeft).toBeCloseTo(before.distanceLeft)
  })

  it('divides the game distance difference by local scale for physical triggers when geometry is missing', () => {
    for (const scale of [1, 3, 19, 20]) {
      const state = stateOf(scale)
      state.route!.paths = new Map([[0, []]])
      expect(physicalGuidanceFor(state)?.distance).toBeCloseTo(50)
      expect(adviceOf(state)).toBe(laneHint)
    }
  })

  it('rejects an off-route projection outside the map snap limit and falls back for physical distances', () => {
    const state = stateOf()
    state.telemetry = { ...state.telemetry!, z: SNAP_NONE + 1, navigationDistance: 6000 }
    expect(physicalGuidanceFor(state)?.distance).toBeCloseTo(200)
    expect(physicalGuidanceFor({ ...state, telemetry: { ...state.telemetry, localScale: 0 } })).toBeNull()
  })

  it('does not invent a route approach when the truck faces away from its start', () => {
    const state = stateOf(20, -50)
    state.telemetry = { ...state.telemetry!, heading: 0.25, navigationDistance: 6000 }
    expect(physicalGuidanceFor(state)?.distance).toBeCloseTo(200)
  })

  it('hides physical guidance without usable geometry or scale, then restores when valid data returns', () => {
    const state = stateOf()
    state.route!.paths = new Map([[0, []]])
    for (const localScale of [0, -1, NaN, Infinity]) {
      const missing = { ...state, telemetry: { ...state.telemetry!, localScale } }
      expect(guidanceDistancesOf(missing)).toBeNull()
      expect(physicalGuidanceFor(missing)).toBeNull()
      expect(adviceOf(missing)).toBeNull()
    }
    expect(physicalGuidanceFor({ ...state, telemetry: { ...state.telemetry!, localScale: 20 } })?.distance).toBeCloseTo(
      50,
    )
  })

  it('uses physical fallback for non-finite geometry, coordinates or heading', () => {
    const state = stateOf()
    for (const property of ['x', 'z', 'heading'] as const)
      expect(
        physicalGuidanceFor({ ...state, telemetry: { ...state.telemetry!, [property]: NaN } })?.distance,
      ).toBeCloseTo(50)
    const route = routeOf()
    route.paths.set(0, [
      [0, 0],
      [NaN, 0],
    ])
    expect(physicalGuidanceFor({ ...state, route })?.distance).toBeCloseTo(50)
  })
})
