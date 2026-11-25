import { type KeybindAction, subscribeMediaIntent } from '../../shared/host'
import { levelOf, stopFade } from './fade'
import type { MusicPlayer } from './musicWithGame'

/**
 * The player's keybinds pressed in the game (the companion's Controls; the host's `keybind` message): volume up
 * or down, play or pause, and previous or next track across all built-in multimedia apps. Targets the currently
 * playing or connecting app first, else the most recently played app that still has an active session, else the
 * first app with loaded media.
 */

/** A volume step (owner 2026-10-21: 5%). */
export const VOLUME_STEP = 0.05

/** A brightness step: a sixteenth of the slider, as a Mac's brightness keys step it (16 presses end to end). */
export const BRIGHTNESS_STEP = 1 / 16

/** What a keybind did, to show in the top HUD. */
export type KeybindFeedback =
  { kind: 'volume'; volume: number } | { kind: 'track'; direction: 1 | -1; title: string | null }

const PLAYBACK_INTENTS = new Set(['play', 'resume', 'load', 'next', 'previous', 'selectEpisode', 'started'])

function appKeyOf(player: MusicPlayer): string {
  return player.name === 'apple music' ? 'appleMusic' : player.name
}

function hasSession(player: MusicPlayer): boolean {
  return player.hasMedia ? player.hasMedia() : true
}

function isSkippable(player: MusicPlayer): boolean {
  return player.canSkip !== false
}

/** The keybinds for `players` (the cab's music apps). `press` acts on one; `stop` stops following them. */
export function keybinds(players: readonly MusicPlayer[]): {
  press(action: KeybindAction): KeybindFeedback | null
  stop(): void
} {
  let last: MusicPlayer | null = null
  let lastSkippable: MusicPlayer | null = null
  const remember = (player: MusicPlayer) => {
    last = player
    if (isSkippable(player)) lastSkippable = player
  }
  const byApp = new Map(players.map((player) => [appKeyOf(player), player]))
  const stops = players.map((player) =>
    player.subscribe((started) => {
      if (started) remember(player)
    }),
  )
  const stopIntent = subscribeMediaIntent((app, action) => {
    if (!PLAYBACK_INTENTS.has(action)) return
    const player = byApp.get(app)
    if (player) remember(player)
  })
  const activeOrPending = () =>
    (last?.playingHere() ? last : null) ??
    players.find((player) => player.playingHere()) ??
    (last?.pendingHere?.() ? last : null) ??
    players.find((player) => player.pendingHere?.()) ??
    null
  const current = () =>
    activeOrPending() ??
    (last && hasSession(last) ? last : null) ??
    players.find((player) => player.hasMedia?.()) ??
    null
  const currentForSkip = () => {
    const live = activeOrPending()
    if (live) return isSkippable(live) ? live : null
    if (lastSkippable && hasSession(lastSkippable)) return lastSkippable
    return players.find((player) => isSkippable(player) && player.hasMedia?.()) ?? null
  }
  return {
    press(action) {
      // The screen's brightness is the cab's, not a player's (CabinApp.tsx).
      if (action === 'brightnessDown' || action === 'brightnessUp') return null
      if (action === 'nextTrack' || action === 'previousTrack') {
        const player = currentForSkip()
        if (!player) return null
        const direction: 1 | -1 = action === 'nextTrack' ? 1 : -1
        const beforeTitle = player.trackTitle?.() ?? null
        if (player.skip(direction) === false) return null
        remember(player)
        const afterTitle = player.trackTitle?.() ?? null
        const title = afterTitle && afterTitle !== beforeTitle ? afterTitle : null
        return { kind: 'track', direction, title }
      }
      const player = current()
      if (!player) return null
      if (action === 'playPause') {
        // A fade with the game stops where it is; the volume the player chose comes back with it.
        const left = levelOf(player.name) !== undefined
        stopFade(player.name)
        const volume = player.volume()
        if (left && volume !== null) player.sendVolume(volume)
        if (player.playingHere() || player.pendingHere?.()) player.pauseHere()
        else player.resumeHere()
        return null
      }
      const volume = player.volume()
      if (volume === null) return null
      stopFade(player.name)
      const next = stepped(volume, action === 'volumeUp' ? 1 : -1)
      player.setVolume(next)
      return { kind: 'volume', volume: next }
    },
    stop() {
      stopIntent()
      for (const stop of stops) stop()
    },
  }
}

/** `volume` a step (`step`, the volume's unless told) up (1) or down (-1), onto the steps (a volume between two
 * goes to the next one). */
export function stepped(volume: number, direction: 1 | -1, step = VOLUME_STEP): number {
  const steps = Math.round(1 / step)
  // Close enough to a step counts as on it (a volume the player set as 0.6 may come back as 0.6000001).
  const at = volume * steps
  const on = Math.abs(at - Math.round(at)) < 0.01 ? Math.round(at) : null
  const next = on !== null ? on + direction : direction > 0 ? Math.ceil(at) : Math.floor(at)
  return Math.min(steps, Math.max(0, next)) / steps
}
