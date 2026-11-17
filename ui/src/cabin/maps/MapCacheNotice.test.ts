import { describe, expect, it } from 'vitest'
import { companionMapCacheNotice, mapCacheNotice } from './cacheNotice'
describe('map availability notices', () => {
  it('keeps current maps and unrelated game states quiet', () => {
    for (const state of ['ready', 'unknown', 'noGame', 'notAllowed']) {
      expect(mapCacheNotice(state, false, 'zh_cn')).toBeNull()
      expect(companionMapCacheNotice(state, true, 'zh_cn')).toBeNull()
    }
  })
  it('hides older-map warnings on the cabin map and moves them to the companion', () => {
    for (const state of ['unverified', 'stale', 'cancelled', 'checking', 'building', 'failed']) {
      expect(mapCacheNotice(state, true, 'zh_cn')).toBeNull()
      expect(mapCacheNotice(state, true, 'en_us')).toBeNull()
      expect(companionMapCacheNotice(state, true, 'zh_cn')).toContain('旧地图')
      expect(companionMapCacheNotice(state, true, 'en_us')).toContain('older map')
    }
  })
  it('explains missing caches independently of automatic maintenance', () => {
    expect(mapCacheNotice('notPrepared', false, 'zh_cn')).toContain('尚未准备地图')
    expect(mapCacheNotice('cancelled', false, null)).toContain('Map not prepared')
    expect(companionMapCacheNotice('notPrepared', false, 'zh_cn')).toBeNull()
  })
})
