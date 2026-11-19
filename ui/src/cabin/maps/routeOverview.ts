import { AUTO_RECENTRE_MS } from './camera'
import type { Point } from './route'

export type OverviewMode = 'off' | 'timed' | 'locked'

/** User activity only: camera animations and telemetry never extend this deadline. */
export function createOverviewSession(
  onChange: (active: boolean) => void,
  onReturn: () => void,
  onLockChange?: (locked: boolean) => void,
) {
  let active = false
  let locked = false
  let held = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const exit = () => {
    cancel()
    held = false
    if (locked) {
      locked = false
      onLockChange?.(false)
    }
    if (!active) return
    active = false
    onChange(false)
  }
  const touch = () => {
    cancel()
    if (active && !locked && !held)
      timer = setTimeout(() => {
        exit()
        onReturn()
      }, AUTO_RECENTRE_MS)
  }
  return {
    active: () => active,
    locked: () => locked,
    mode: (): OverviewMode => (!active ? 'off' : locked ? 'locked' : 'timed'),
    enter() {
      if (locked) {
        locked = false
        onLockChange?.(false)
      }
      if (!active) {
        active = true
        onChange(true)
      }
      touch()
    },
    lock() {
      cancel()
      if (!active) {
        active = true
        onChange(true)
      }
      if (!locked) {
        locked = true
        onLockChange?.(true)
      }
    },
    touch,
    hold(value: boolean) {
      held = value
      touch()
    },
    exit,
  }
}

/** A streaming bounds calculation: even a continent-spanning route must not overflow Math.min's args. */
export function routeBounds(points: readonly Point[]): [Point, Point] | null {
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity
  for (const [x, z] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    z0 = Math.min(z0, z)
    z1 = Math.max(z1, z)
  }
  if (!Number.isFinite(x0)) return null
  // A very short route still gets a useful, finite view.
  const padX = Math.max(0, 15 - (x1 - x0) / 2)
  const padZ = Math.max(0, 15 - (z1 - z0) / 2)
  return [
    [x0 - padX, z0 - padZ],
    [x1 + padX, z1 + padZ],
  ]
}
