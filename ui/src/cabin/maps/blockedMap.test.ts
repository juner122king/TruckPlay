import { describe, expect, it } from 'vitest'
import { HVT_MAP_MESSAGES, hvtMapMessage } from './blockedMap'

/** The supported languages. */
const GAME_LANGUAGES = ['en_us', 'zh_cn']

describe('the HVT map message', () => {
  it('is in every supported language, naming HVT and TruckPlay', () => {
    expect(Object.keys(HVT_MAP_MESSAGES).sort()).toEqual(GAME_LANGUAGES)
    for (const message of Object.values(HVT_MAP_MESSAGES)) {
      expect(message).toContain('HVT')
      expect(message).toContain('TruckPlay')
    }
  })

  it('says it in the game language, or English', () => {
    expect(hvtMapMessage('en_us')).toBe('Maps by HVT are not allowed in TruckPlay. Contact TruckPlay to learn more.')
    expect(hvtMapMessage('zh_cn')).toContain('TruckPlay 不允许使用 HVT 的地图')
    expect(hvtMapMessage('tr_tr')).toBe(HVT_MAP_MESSAGES.en_us)
    expect(hvtMapMessage('xx_mod')).toBe(HVT_MAP_MESSAGES.en_us)
    expect(hvtMapMessage(null)).toBe(HVT_MAP_MESSAGES.en_us)
  })
})
