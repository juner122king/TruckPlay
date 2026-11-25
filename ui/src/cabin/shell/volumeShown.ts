import { create } from 'zustand'

/** How long the HUD stays shown after the last change, ms. */
const SHOWN_MS = 1500

export type HudKind = 'volume' | 'brightness' | 'previousTrack' | 'nextTrack'

/** What a keybind last changed: the volume, screen brightness, or track skip (VolumeHud.tsx). */
export const useVolumeHud = create<{ kind: HudKind; level: number; label: string | null; shown: boolean }>()(() => ({
  kind: 'volume',
  level: 0,
  label: null,
  shown: false,
}))

let hiding: ReturnType<typeof setTimeout> | undefined

function show(kind: HudKind, level: number, label: string | null): void {
  clearTimeout(hiding)
  useVolumeHud.setState({ kind, level, label, shown: true })
  hiding = setTimeout(() => useVolumeHud.setState({ shown: false }), SHOWN_MS)
}

/** Shows `volume` (0 to 1) for a moment: a keybind changed it. */
export function showVolume(volume: number): void {
  show('volume', volume, null)
}

/** Shows the screen's brightness `level` (0 to 1) for a moment, as the volume is: a keybind changed it. */
export function showBrightness(level: number): void {
  show('brightness', level, null)
}

/** Shows a previous/next track change for a moment, with the new title when known synchronously. */
export function showTrackChange(direction: 1 | -1, title?: string | null): void {
  show(direction === 1 ? 'nextTrack' : 'previousTrack', 0, title?.trim() || null)
}
