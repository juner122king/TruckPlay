import { describe, expect, it } from 'vitest'
import { type ImageStore, PlaceIconCache } from './placeIconCache'
import { framesApart, LEAST_PACE, LITE_PACE, mapFrameDue } from './frameCap'
import { nearestSpeedCameraAhead, type SpeedCamera } from './speedCameras'
import type { Telemetry } from '../../shared/host'

function memoryStore(): ImageStore & { images: Set<string>; removed: string[] } {
  const images = new Set<string>()
  const removed: string[] = []
  return {
    images,
    removed,
    hasImage: (id) => images.has(id),
    removeImage: (id) => {
      images.delete(id)
      removed.push(id)
    },
  }
}

describe('PlaceIconCache', () => {
  it('evicts the oldest place icons once the cache exceeds its cap', () => {
    const store = memoryStore()
    const cache = new PlaceIconCache(3)

    for (const id of ['place-company|A', 'place-company|B', 'place-company|C']) {
      store.images.add(id)
      expect(cache.track(id, store)).toEqual([])
    }
    expect(cache.size).toBe(3)

    store.images.add('place-company|D')
    expect(cache.track('place-company|D', store)).toEqual(['place-company|A'])
    expect(store.images.has('place-company|A')).toBe(false)
    expect(store.images.has('place-company|D')).toBe(true)
    expect(cache.size).toBe(3)
  })

  it('clears all tracked icons lazily on appearance or text-size changes', () => {
    const store = memoryStore()
    const cache = new PlaceIconCache(10)
    for (const id of ['place-fuel|Shell', 'place-garage|Berlin']) {
      store.images.add(id)
      cache.track(id, store)
    }
    expect(cache.clear(store)).toBe(2)
    expect(cache.size).toBe(0)
    expect(store.images.size).toBe(0)
  })
})

describe('frameCap lite pace', () => {
  it('halves map frame cadence on 60 Hz and 144 Hz displays in lite mode', () => {
    expect(framesApart(1000 / 60, LEAST_PACE)).toBe(1)
    expect(framesApart(1000 / 60, LITE_PACE)).toBe(2)
    expect(framesApart(1000 / 144, LITE_PACE)).toBe(4)

    expect(mapFrameDue(16.6, 0, 1000 / 60, LITE_PACE)).toBe(false)
    expect(mapFrameDue(33.3, 0, 1000 / 60, LITE_PACE)).toBe(true)
  })
})

describe('speedCameras spatial grid', () => {
  it('matches linear corridor search across large camera sets', () => {
    const cameras: SpeedCamera[] = []
    for (let i = 0; i < 400; i++) {
      cameras.push({
        x: (i % 20) * 5000 - 50000,
        y: 0,
        z: Math.floor(i / 20) * 5000 - 50000,
        heading: 0,
        reverse: false,
      })
    }
    // Place one camera directly 180m north of the truck (heading = 0 faces -z).
    cameras.push({ x: 100, y: 0, z: -80, heading: 0, reverse: false })

    const telemetry = {
      x: 100,
      y: 0,
      z: 100,
      heading: 0,
      speed: 22,
      navigationSpeedLimit: 22.2,
    } as Telemetry

    const found = nearestSpeedCameraAhead(cameras, telemetry)
    expect(found).not.toBeNull()
    expect(found?.camera.x).toBe(100)
    expect(found?.camera.z).toBe(-80)
    expect(found?.distance).toBeCloseTo(180, 0)
  })
})
