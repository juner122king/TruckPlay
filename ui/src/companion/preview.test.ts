import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostStatus } from './useHostStatus'
import type { Settings } from './useSettings'

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('location', { search: '?update&ats' })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('domestic companion preview', () => {
  it('simulates domestic update offers when the ?update query parameter is present', async () => {
    const preview = await import('./preview')
    const found = vi.fn()
    const stop = preview.subscribe('update-found', found)
    const enabled = preview.answer('online_updates_enabled')
    const offer = preview.answer('update_offer')
    const lookup = preview.answer('look_for_update')
    await vi.advanceTimersByTimeAsync(800)
    expect(await enabled).toBe(true)
    expect(await offer).toMatchObject({ version: '2.4.0-domestic.2' })
    expect(await lookup).toMatchObject({ version: '2.4.0-domestic.2' })
    expect(found).toHaveBeenCalledWith(expect.objectContaining({ version: '2.4.0-domestic.2' }))
    stop()
  })

  it('provides domestic account fields alongside the new map folder fields and defaults', async () => {
    const preview = await import('./preview')
    const take = vi.fn()
    const stop = preview.subscribe('host-status', take)
    const pending = preview.answer('get_settings')
    await vi.advanceTimersByTimeAsync(300)
    const settings = (await pending) as Settings
    expect(settings.map.fast).toBe(false)
    const status = take.mock.calls[0][0] as HostStatus
    for (const service of ['bilibili', 'netease', 'qqmusic', 'ximalaya', 'douyin', 'hongguo']) {
      expect(status).toHaveProperty(service + 'SignedIn')
      expect(status).toHaveProperty(service + 'SigningIn')
    }
    expect(status.profileMaps.length).toBeGreaterThan(0)
    for (const map of status.profileMaps) expect(map.folder).toBeTruthy()
    stop()
  })
})

it('prepares explicit preview targets and cancels only the matching task without changing maintenance', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('location', { search: '?ats&game=off' })
  const preview = await import('./preview')
  let status: HostStatus | null = null
  preview.subscribe('host-status', (value) => {
    status = value as HostStatus
  })
  await vi.advanceTimersByTimeAsync(50)
  expect(status!.profileMaps.map((map) => map.status.state)).toEqual(['notPrepared', 'notPrepared', 'notPrepared'])
  const request = preview.answer('prepare_maps', { targets: ['ets2:profiles/57657374'], force: false })
  await vi.advanceTimersByTimeAsync(1000)
  await request
  const taskId = status!.profileMaps[0].taskId
  expect(status!.profileMaps[0].status.state).toBe('building')
  const cancel = preview.answer('cancel_map_preparation', { taskId })
  await vi.advanceTimersByTimeAsync(1000)
  expect(await cancel).toBe(true)
  expect(status!.profileMaps.map((map) => map.status.state)).toEqual(['cancelled', 'notPrepared', 'notPrepared'])
  const settings = preview.answer('get_settings')
  await vi.advanceTimersByTimeAsync(1000)
  expect(((await settings) as { map: { maintenance: unknown } }).map.maintenance).toEqual({ games: {}, profiles: {} })
})
