import type { LaneDirection, LaneHint } from '../../shared/host'
import { useText } from '../state/text'
import type { TurnKind } from './guidance'
import { matchesTurnDirection } from './laneGuidance'

const PATHS: Record<LaneDirection, string> = {
  straight: 'M24 42V7m-9 9 9-9 9 9',
  left: 'M24 42V24Q24 16 16 16H6m9-9-9 9 9 9',
  right: 'M24 42V24Q24 16 32 16h10m-9-9 9 9-9 9',
  'slight-left': 'M24 42V26L8 10m0 13V10h13',
  'slight-right': 'M24 42V26l16-16m-13 0h13v13',
  'u-turn': 'M32 42V17a8 8 0 0 0-16 0v13m-8-8 8 8 8-8',
}

export function LaneRibbon({ hint, activeTurn }: { hint: LaneHint; activeTurn?: TurnKind | null }) {
  const text = useText()
  return (
    <div className="lane-guidance" role="group" aria-label={text.laneGuidance}>
      {hint.lanes.map((lane, index) => {
        const splitByTurn =
          lane.recommended &&
          lane.directions.length > 1 &&
          lane.directions.some((direction) => matchesTurnDirection(direction, activeTurn))
        const secondary = splitByTurn
          ? lane.directions.filter((direction) => !matchesTurnDirection(direction, activeTurn))
          : []
        const primary = splitByTurn
          ? lane.directions.filter((direction) => matchesTurnDirection(direction, activeTurn))
          : lane.directions

        return (
          <div
            key={index}
            className={`lane-guidance-lane${lane.recommended ? ' recommended' : ''}`}
            role="img"
            aria-label={`${index + 1}: ${lane.directions.map((direction) => text.turns[direction]).join(' / ')} · ${lane.recommended ? text.recommendedLane : text.unavailableLane}`}
          >
            <svg viewBox="0 0 48 48" aria-hidden="true">
              {lane.directions.length ? (
                <>
                  {secondary.map((direction) => (
                    <path key={direction} d={PATHS[direction]} className="lane-arrow-secondary" />
                  ))}
                  {primary.map((direction) => (
                    <path
                      key={direction}
                      d={PATHS[direction]}
                      className={splitByTurn ? 'lane-arrow-primary' : undefined}
                    />
                  ))}
                </>
              ) : (
                <path d="M12 24h24" />
              )}
            </svg>
            {lane.recommended && <span className="lane-recommended-mark" />}
          </div>
        )
      })}
    </div>
  )
}
