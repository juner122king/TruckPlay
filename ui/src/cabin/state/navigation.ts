import { APP_IDS, type AppId, isReleasedApp } from './apps'

/** Where the cabin screen is. */
export type Route = { kind: 'home' } | { kind: 'dashboard' } | { kind: 'app'; app: AppId }

/** The two screens apps are opened from. */
export type BaseScreen = 'home' | 'dashboard'

export interface NavigationState {
  route: Route
  /** The apps in the order last used, newest first; the sidebar pins Maps first and fills the rest from here
   * ([`sidebarApps`]). */
  recents: AppId[]
  /** Home or the Dashboard, whichever was shown last: where the Home button leaves an app for. */
  base: BaseScreen
}

export type NavigationAction =
  | { type: 'openApp'; app: AppId }
  /** The sidebar's Home button, which behaves like CarPlay's (see `navigate`). */
  | { type: 'pressHome' }
  | { type: 'showDashboard' }
  /** Home itself (the onboarding's demo: cabin/demo.ts), wherever the screen is; nothing if it's there. */
  | { type: 'showHome' }

/** The apps kept in the order last used: all of them, so each sidebar slot knows its last used app however
 * many others were opened since. */
export const RECENTS_LIMIT = APP_IDS.length

/** Filters `apps` to unique released apps in their original order, at most `limit`. */
export function uniqueReleasedApps(apps: readonly AppId[], limit: number): AppId[] {
  if (limit <= 0) return []
  const result: AppId[] = []
  const seen = new Set<AppId>()
  for (const app of apps) {
    if (!isReleasedApp(app) || seen.has(app)) continue
    seen.add(app)
    result.push(app)
    if (result.length >= limit) break
  }
  return result
}

/** The sidebar's apps: Maps pinned first, followed by the most recently used released apps (`recents`, newest first),
 * at most `room`. */
export function sidebarApps(recents: readonly AppId[], room: number): AppId[] {
  if (room <= 0) return []
  const pinned: AppId = 'maps'
  return [
    pinned,
    ...uniqueReleasedApps(
      recents.filter((app) => app !== pinned),
      room - 1,
    ),
  ]
}

export const INITIAL_NAVIGATION: NavigationState = {
  route: { kind: 'dashboard' },
  recents: ['maps', 'music', 'netease', 'bilibili', 'radio', 'youtube'],
  base: 'dashboard',
}

/**
 * Where the Home button goes, after CarPlay's: from an app back to Home or the Dashboard, whichever it was
 * opened from; between those two, to the other. Its icon shows this destination.
 */
export function homeButtonTarget(state: NavigationState): BaseScreen {
  switch (state.route.kind) {
    case 'app':
      return state.base
    case 'home':
      return 'dashboard'
    case 'dashboard':
      return 'home'
  }
}

/** Navigation rules, after CarPlay. Opening an app moves it to the front of the recents. */
export function navigate(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'openApp':
      if (!isReleasedApp(action.app)) return state
      return {
        ...state,
        route: { kind: 'app', app: action.app },
        recents: [action.app, ...state.recents.filter((app) => app !== action.app)].slice(0, RECENTS_LIMIT),
      }
    case 'pressHome': {
      const target = homeButtonTarget(state)
      return { ...state, route: { kind: target }, base: target }
    }
    case 'showDashboard':
      return { ...state, route: { kind: 'dashboard' }, base: 'dashboard' }
    case 'showHome':
      return { ...state, route: { kind: 'home' }, base: 'home' }
  }
}

/** A stable string for a route, e.g. for React keys. */
export function routeKey(route: Route): string {
  return route.kind === 'app' ? `app:${route.app}` : route.kind
}
