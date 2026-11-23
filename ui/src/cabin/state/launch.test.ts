import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  animateAppearance,
  animateNavigation,
  canUseViewTransitions,
  carriesLaunch,
  inSubframe,
  type Launch,
  launchFor,
  transitionKind,
} from './launch'
import type { Route } from './navigation'

const home: Route = { kind: 'home' }
const dashboard: Route = { kind: 'dashboard' }
const music: Route = { kind: 'app', app: 'music' }
const maps: Route = { kind: 'app', app: 'maps' }

describe('launchFor', () => {
  it('opens an app out of the icon that was clicked', () => {
    expect(launchFor(home, music, 'home')).toEqual({ app: 'music', origin: 'home', direction: 'open' })
    expect(launchFor(dashboard, music, 'sidebar')).toEqual({ app: 'music', origin: 'sidebar', direction: 'open' })
    expect(launchFor(maps, music, 'sidebar')).toEqual({ app: 'music', origin: 'sidebar', direction: 'open' })
  })

  it('closes an app into its Home icon, or its sidebar icon when going to the Dashboard', () => {
    expect(launchFor(music, home, null)).toEqual({ app: 'music', origin: 'home', direction: 'close' })
    expect(launchFor(music, dashboard, null)).toEqual({ app: 'music', origin: 'sidebar', direction: 'close' })
  })

  it('crossfades everything else', () => {
    expect(launchFor(home, dashboard, null)).toBeNull()
    expect(launchFor(dashboard, home, null)).toBeNull()
    // An app opened without a clicked icon (no origin) has nothing to grow out of.
    expect(launchFor(home, music, null)).toBeNull()
    expect(launchFor(music, music, 'sidebar')).toBeNull()
  })
})

describe('carriesLaunch', () => {
  const open: Launch = { app: 'music', origin: 'home', direction: 'open' }
  const close: Launch = { app: 'music', origin: 'home', direction: 'close' }
  const homeIcon = { kind: 'icon', origin: 'home' } as const
  const sidebarIcon = { kind: 'icon', origin: 'sidebar' } as const
  const window = { kind: 'window' } as const

  it('opening: the icon before the navigation, the window after', () => {
    expect(carriesLaunch({ launch: open, phase: 'from' }, 'music', homeIcon)).toBe(true)
    expect(carriesLaunch({ launch: open, phase: 'from' }, 'music', window)).toBe(false)
    expect(carriesLaunch({ launch: open, phase: 'to' }, 'music', homeIcon)).toBe(false)
    expect(carriesLaunch({ launch: open, phase: 'to' }, 'music', window)).toBe(true)
  })

  it('closing: the window before, the Home icon after', () => {
    expect(carriesLaunch({ launch: close, phase: 'from' }, 'music', window)).toBe(true)
    expect(carriesLaunch({ launch: close, phase: 'to' }, 'music', homeIcon)).toBe(true)
    expect(carriesLaunch({ launch: close, phase: 'to' }, 'music', window)).toBe(false)
  })

  it('only the clicked icon of the launching app takes part', () => {
    expect(carriesLaunch({ launch: open, phase: 'from' }, 'music', sidebarIcon)).toBe(false)
    expect(carriesLaunch({ launch: open, phase: 'from' }, 'maps', homeIcon)).toBe(false)
    expect(carriesLaunch({ launch: null, phase: 'from' }, 'music', homeIcon)).toBe(false)
  })
})

describe('transitionKind', () => {
  it('opens and closes apps, and crossfades the rest', () => {
    expect(transitionKind({ app: 'music', origin: 'home', direction: 'open' })).toBe('open')
    expect(transitionKind({ app: 'music', origin: 'sidebar', direction: 'close' })).toBe('close')
    expect(transitionKind(null)).toBe('switch')
  })
})

describe('subframe View Transitions guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects whether the page runs inside an iframe', () => {
    const topRef = {}
    expect(inSubframe({ self: topRef, top: topRef })).toBe(false)

    const childRef = {}
    expect(inSubframe({ self: childRef, top: topRef })).toBe(true)

    const blockedWindow = {
      self: childRef,
      get top(): unknown {
        throw new Error('Blocked a frame from accessing a cross-origin frame')
      },
    }
    expect(inSubframe(blockedWindow)).toBe(true)
    expect(inSubframe(undefined)).toBe(false)
  })

  it('allows View Transitions only in top-level documents that support them', () => {
    const topRef = {}
    const topWindow = { self: topRef, top: topRef }
    const childWindow = { self: {}, top: topRef }
    const doc = { startViewTransition: vi.fn() as unknown as Document['startViewTransition'] }

    expect(canUseViewTransitions(doc, topWindow)).toBe(true)
    expect(canUseViewTransitions({ startViewTransition: undefined }, topWindow)).toBe(false)
    expect(canUseViewTransitions(doc, childWindow)).toBe(false)
  })

  it('updates synchronously without startViewTransition when running inside an iframe', () => {
    const childWindow = { self: {}, top: {} }
    const startViewTransition = vi.fn()
    vi.stubGlobal('window', childWindow)
    vi.stubGlobal('document', {
      startViewTransition,
      documentElement: { dataset: {} },
    })

    const navUpdate = vi.fn()
    animateNavigation({ app: 'maps', origin: 'home', direction: 'open' }, navUpdate)
    expect(navUpdate).toHaveBeenCalledTimes(1)
    expect(startViewTransition).not.toHaveBeenCalled()

    const appearanceUpdate = vi.fn()
    animateAppearance(appearanceUpdate)
    expect(appearanceUpdate).toHaveBeenCalledTimes(1)
    expect(startViewTransition).not.toHaveBeenCalled()
  })
})
