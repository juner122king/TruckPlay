import { notifyPlaybackStarted } from '../../shared/host'
import type { MusicPlayer } from './musicWithGame'

/**
 * One player at a time, as on a phone: when one of the cab's players (Apple Music, Spotify, YouTube Music, Player,
 * YouTube) starts playing here, the others playing here pause, and the newest plays on (owner 2026-10-21: a
 * player's report, Spotify and YouTube Music playing over each other). Music playing elsewhere (Spotify on a
 * phone) is left as it is. Returns the function that stops it.
 */
let registeredPlayers: readonly MusicPlayer[] = []

/** Whether any other registered cabin player is currently playing or starting playback. */
export function isOtherPlayerActive(exceptName: string): boolean {
  return registeredPlayers.some(
    (player) => player.name !== exceptName && (player.playingHere() || Boolean(player.pendingHere?.())),
  )
}

export function oneAtATime(players: readonly MusicPlayer[]): () => void {
  registeredPlayers = players
  const stops = players.map((player) =>
    player.subscribe((started) => {
      if (!started) return
      notifyPlaybackStarted(player.name)
      for (const other of players) {
        if (other !== player && (other.playingHere() || other.pendingHere?.())) other.pauseHere()
      }
    }),
  )
  return () => {
    if (registeredPlayers === players) registeredPlayers = []
    for (const stop of stops) stop()
  }
}
