/**
 * Bounded cache tracker for dynamically generated MapLibre place icon images (`place-<kind>|<name>`).
 *
 * MapLibre retains every image added via `addImage` until explicitly removed. Over multi-hour drives across
 * hundreds of cities, unbounded `place-*` icons bloat the WebGL sprite atlas and cause multi-second stalls
 * when day/night appearance changes synchronously redraw every historical icon.
 */
export const MAX_PLACE_ICONS = 160

export interface ImageStore {
  hasImage(id: string): boolean
  removeImage(id: string): void
}

export class PlaceIconCache {
  private readonly ids = new Set<string>()
  private readonly maxSize: number

  constructor(maxSize = MAX_PLACE_ICONS) {
    this.maxSize = Math.max(1, maxSize)
  }

  /** Number of tracked place icon IDs currently retained. */
  get size(): number {
    return this.ids.size
  }

  /** Records `id` as newly added (or most recently used) and evicts the oldest icons past `maxSize`. */
  track(id: string, store: ImageStore): string[] {
    if (this.ids.has(id)) {
      this.ids.delete(id)
    }
    this.ids.add(id)
    const evicted: string[] = []
    while (this.ids.size > this.maxSize) {
      const oldest = this.ids.values().next().value
      if (oldest === undefined) break
      this.ids.delete(oldest)
      if (store.hasImage(oldest)) {
        store.removeImage(oldest)
      }
      evicted.push(oldest)
    }
    return evicted
  }

  /**
   * Clears all tracked place icons from `store` so MapLibre lazily regenerates only the icons currently
   * visible on screen via `styleimagemissing` (e.g. on day/night appearance or text-size changes).
   */
  clear(store: ImageStore): number {
    let removed = 0
    for (const id of this.ids) {
      if (store.hasImage(id)) {
        store.removeImage(id)
        removed++
      }
    }
    this.ids.clear()
    return removed
  }
}
