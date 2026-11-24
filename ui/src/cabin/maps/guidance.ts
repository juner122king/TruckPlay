/**
 * Turn-by-turn: the host identifies maneuvers from the game's junctions. Displayed countdowns use
 * game-scaled metres (matching the trip pill, game GPS and odometer), while spatial triggers such as
 * lane hysteresis, dynamic junction zoom and consecutive-turn proximity use physical metres from
 * guidanceDistance.ts.
 */

export type TurnKind =
  | 'straight'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'u-turn'
  | 'keep-left'
  | 'keep-right'
  | 'exit-left'
  | 'exit-right'
  | 'roundabout'

/** A turn of the route, at the junction entered at its node `node`: how far it turns (degrees, right
 * positive), and a roundabout's exit. */
export interface Maneuver {
  node: number
  turn: TurnKind
  angle: number
  exit: number | null
}

/** What to do next: a turn, or arrive. */
export type Step = { kind: 'turn'; maneuver: Maneuver } | { kind: 'arrive' }

export interface Guidance {
  step: Step
  /** How far to it, metres (in the caller's distance frame: game-scaled for card display, physical for camera). */
  distance: number
  /** What comes right after it, when it's that close behind (the game's "…and then"). */
  then: Step | null
}

/** A second step this close behind the first (physical metres when geometry is available) is shown with it. */
export const THEN_WITHIN = 400

const ARRIVE: Step = { kind: 'arrive' }

/**
 * The guidance along a route (`distances`: each node's distance left to the destination; `maneuvers` in
 * route order) for a truck before its node `next`, with `distanceLeft` to go; `null` without a route. A
 * turn stays next until the truck is through its junction (it's "now" while inside).
 *
 * When `gapDistances` / `gapDistanceLeft` are supplied (e.g. physical metres along the route geometry),
 * the `then` ("…and then") proximity check uses them independently of the displayed `distances` frame.
 */
export function guidanceOf(
  distances: readonly number[],
  maneuvers: readonly Maneuver[],
  next: number,
  distanceLeft: number,
  gapDistances: readonly number[] = distances,
  gapDistanceLeft: number = distanceLeft,
): Guidance | null {
  if (!Number.isFinite(distanceLeft) || distanceLeft <= 0 || distances.length === 0) return null
  const ahead = maneuvers.filter((maneuver) => maneuver.node >= next - 1)
  const to = (maneuver: Maneuver) => Math.max(0, distanceLeft - (distances[maneuver.node] ?? 0))
  const [first, second] = ahead
  if (!first) return { step: ARRIVE, distance: distanceLeft, then: null }
  const distance = to(first)
  const afterStep: Step = second ? { kind: 'turn', maneuver: second } : ARRIVE
  let gap: number
  if (
    (gapDistances === distances && gapDistanceLeft === distanceLeft) ||
    !Number.isFinite(gapDistanceLeft) ||
    gapDistances.length === 0
  ) {
    const afterDistance = second ? to(second) : distanceLeft
    gap = afterDistance - distance
  } else {
    const firstGap = Math.max(0, gapDistanceLeft - (gapDistances[first.node] ?? 0))
    const afterGap = second ? Math.max(0, gapDistanceLeft - (gapDistances[second.node] ?? 0)) : gapDistanceLeft
    gap = afterGap - firstGap
  }
  return {
    step: { kind: 'turn', maneuver: first },
    distance,
    then: gap <= THEN_WITHIN ? afterStep : null,
  }
}

/** Within this, metres, a step is "now". */
export const NOW_WITHIN = 30

/**
 * The guidance along `route` as a line for the log: the turn taken as the next, at which node and that node's own
 * distance left, the node ahead (`next`), the game's distance left (`distanceLeft`), and what's shown.
 */
export function guidanceLine(
  route: { id: number; distances: readonly number[]; maneuvers: readonly Maneuver[] },
  next: number,
  distanceLeft: number,
): string {
  const guidance = guidanceOf(route.distances, route.maneuvers, next, distanceLeft)
  const count = `route ${route.id}: ${route.distances.length} nodes, ${route.maneuvers.length} turns`
  const at = `node ahead ${next}, distance left ${Math.round(distanceLeft)} m (the game's telemetry)`
  if (!guidance) return `${count}; ${at}; no guidance shown`
  const step = guidance.step
  const own = (node: number) => Math.round(route.distances[node] ?? -1)
  const turn =
    step.kind === 'turn'
      ? `${step.maneuver.turn} at node ${step.maneuver.node} (its own distance left ${own(step.maneuver.node)} m)`
      : 'arriving'
  const shown = guidance.distance < NOW_WITHIN ? 'now' : `${Math.round(guidance.distance)} m`
  return `${count}; ${at}; next: ${turn}; shown: ${shown}`
}
