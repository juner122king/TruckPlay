import { describe, expect, it } from 'vitest'
import { isReleasedApp, RELEASED_APP_IDS } from './apps'

describe('the apps this release has', () => {
  it('leaves Podcasts and temporarily hidden domestic apps for a later release, keeping Home’s order', () => {
    expect(RELEASED_APP_IDS).toEqual([
      'maps',
      'music',
      'netease',
      'bilibili',
      'ximalaya',
      'radio',
      'youtube',
      'player',
      'freight',
      'safari',
      'phone',
      'messages',
      'calendar',
      'weather',
      'settings',
    ])
  })

  it('opens none of the later ones from a saved screen or recent', () => {
    expect(isReleasedApp('podcasts')).toBe(false)
    expect(isReleasedApp('ximalaya')).toBe(true)
    expect(isReleasedApp('douyin')).toBe(false)
    expect(isReleasedApp('hongguo')).toBe(false)
    expect(isReleasedApp('radio')).toBe(true)
    expect(isReleasedApp('phone')).toBe(true)
    expect(isReleasedApp('calendar')).toBe(true)
    expect(isReleasedApp('nonsense')).toBe(false)
  })
})
