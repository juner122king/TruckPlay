import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RadioStation } from './radio'
const host = vi.hoisted(() => ({ inHost: true, posted: [] as unknown[] }))
vi.mock('../../../shared/host', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isInHost: () => host.inHost,
  postToHost: (message: unknown) => host.posted.push(message),
}))
import {
  loadLiveSchedule,
  loadRadioList,
  loadRadioDetail,
  closeRadioDetail,
  favoriteMetadata,
  resetRadioSession,
  scheduleIsLive,
  scheduleProgress,
  beijingDate,
  playRadio,
  setRadioFilter,
  setRadioNowPlaying,
  toggleRadioFavorite,
  useRadio,
} from './radio'
import { receiveRadioAnswer, cancelRadioRequests } from './api'
import { pausePlayback, play, receiveAnswer, receivePlayback, skip, useXimalaya } from '../ximalaya/ximalaya'
const station: RadioStation = {
  id: 1011,
  name: 'Music',
  programName: 'Live show',
  coverLarge: 'http://image.xmcdn.com/a.jpg',
}
function requests() {
  return host.posted.filter((m: any) => m.command?.action === 'ask') as {
    command: { id: number; question: { ask: string; radioId?: number } }
  }[]
}
function respond(index: number, kind: string, data: unknown) {
  const id = requests()[index].command.id
  receiveAnswer(id, false, undefined, undefined, undefined, { kind, data })
}
beforeEach(() => {
  host.inHost = true
  host.posted.length = 0
  useRadio.setState({ ...useRadio.getInitialState(), favorites: [] })
  useXimalaya.setState(useXimalaya.getInitialState())
  vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn() })
})
afterEach(() => {
  cancelRadioRequests()
  vi.unstubAllGlobals()
})
describe('radio directory and schedules', () => {
  it('resets pagination and ignores an old filter response without changing VOD loading', async () => {
    useXimalaya.setState({ loading: true, searching: true })
    const old = loadRadioList(4)
    setRadioFilter(310000, 0, 14)
    expect(useRadio.getState()).toMatchObject({ page: 1, locationId: 310000, categoryId: 14 })
    respond(1, 'list', { total: 1, radios: [station] })
    await Promise.resolve()
    respond(0, 'list', { total: 200, radios: [] })
    await old
    expect(useRadio.getState().stations[0].id).toBe(1011)
    expect(useXimalaya.getState()).toMatchObject({ loading: true, searching: true })
  })
  it('routes failures by request id and clears loading', async () => {
    const request = loadRadioList()
    receiveAnswer(requests()[0].command.id, true, 'offline')
    await request
    expect(useRadio.getState()).toMatchObject({ error: 'offline', loading: false })
  })
  it('isolates detail and schedule answers after switching station or leaving detail', async () => {
    const old = loadRadioDetail(station)
    const next = loadRadioDetail({ id: 2, name: 'News' })
    respond(2, 'detail', { id: 2, name: 'News updated' })
    respond(3, 'schedule', { todaySchedules: [] })
    await next
    respond(0, 'detail', station)
    respond(1, 'schedule', { todaySchedules: [{ programName: 'Old' }] })
    await old
    expect(useRadio.getState().detail?.name).toBe('News updated')
    closeRadioDetail()
    expect(useRadio.getState().detail).toBeNull()
  })
  it('deduplicates and persists only favorite metadata, never expiring URLs', () => {
    expect(
      favoriteMetadata([null, { ...station, playUrl: { aac64: 'secret' } }, station, { id: '1', name: 'invalid' }]),
    ).toEqual([{ id: 1011, name: 'Music', coverLarge: 'https://image.xmcdn.com/a.jpg', coverSmall: undefined }])
    toggleRadioFavorite(station)
    expect(JSON.parse(vi.mocked(localStorage.setItem).mock.calls[0][1])).toEqual(favoriteMetadata([station]))
    toggleRadioFavorite({ ...station, name: 'Changed' })
    expect(useRadio.getState().favorites).toEqual([])
  })
  it('uses Beijing dates and distinguishes cross-midnight programs on each day', () => {
    const now = Date.parse('2026-11-16T00:20:00+08:00')
    expect(beijingDate(now)).toBe('2026-11-16')
    const overnight = { programName: 'Night', startTime: '23:00', endTime: '01:00' }
    expect(scheduleIsLive(overnight, 'yesterday', beijingDate(now), now)).toBe(true)
    expect(scheduleIsLive(overnight, 'today', beijingDate(now), now)).toBe(false)
    expect(scheduleIsLive(overnight, 'tomorrow', beijingDate(now), now)).toBe(false)
    expect(scheduleIsLive(overnight, 'yesterday', beijingDate(now), now + 40 * 60000)).toBe(false)
    expect(scheduleProgress(overnight, 'yesterday', beijingDate(now), now)).toBeCloseTo(80 / 120, 5)
    expect(scheduleProgress(overnight, 'today', beijingDate(now), now)).toBeNull()
    expect(
      scheduleProgress({ programName: 'Bad', startTime: 'x', endTime: 'y' }, 'today', beijingDate(now), now),
    ).toBeNull()
  })
  it('loads live schedule independently from detail and resets now playing state on session reset', async () => {
    useRadio.setState({ detail: { id: 99, name: 'Detail station' } })
    const old = loadLiveSchedule(1011)
    const next = loadLiveSchedule(2022)
    respond(1, 'schedule', {
      yesterdaySchedules: [],
      todaySchedules: [{ programName: 'Show 2', startTime: '10:00', endTime: '12:00' }],
      tomorrowSchedules: [],
    })
    await next
    respond(0, 'schedule', {
      yesterdaySchedules: [],
      todaySchedules: [{ programName: 'Show 1', startTime: '08:00', endTime: '09:00' }],
      tomorrowSchedules: [],
    })
    await old
    expect(useRadio.getState().detail?.id).toBe(99)
    expect(useRadio.getState().liveScheduleRadioId).toBe(2022)
    expect(useRadio.getState().liveSchedules?.todaySchedules[0].programName).toBe('Show 2')
    setRadioNowPlaying(true)
    expect(useRadio.getState().nowPlaying).toBe(true)
    resetRadioSession()
    expect(useRadio.getState()).toMatchObject({ nowPlaying: false, liveScheduleRadioId: null, liveSchedules: null })
  })
})
describe('shared audio session', () => {
  it('preserves VOD queue, history and speed; uses the original radio list snapshot for skipping', () => {
    const vod = { id: '123', title: 'Book', artist: 'Reader' }
    play(vod, [vod])
    useXimalaya.setState({ playbackSpeed: 1.75 })
    const history = useXimalaya.getState().history
    const list = [station, { id: 2, name: 'News' }]
    playRadio(station, list)
    list.reverse()
    useRadio.setState({ stations: [{ id: 3, name: 'Different filter' }] })
    skip(1)
    expect(useXimalaya.getState()).toMatchObject({
      queue: [vod],
      history,
      playbackSpeed: 1.75,
      playback: { owner: 'radio', radioId: 2, status: 'loading', isLive: true },
    })
    skip(1)
    expect(useXimalaya.getState().playback?.radioId).toBe(1011)
    play(vod)
    expect(useXimalaya.getState().playback?.owner).toBe('ximalaya')
  })
  it('waits for actual media events and rejects playback reports from a canceled request', () => {
    playRadio(station, [station])
    const old = useXimalaya.getState().sessionRequestId!
    expect(useXimalaya.getState().playing).toBe(false)
    pausePlayback()
    receivePlayback({
      title: 'Old',
      artist: 'Music',
      duration: 0,
      position: 0,
      owner: 'radio',
      radioId: 1011,
      isLive: true,
      status: 'playing',
      requestId: old,
    })
    expect(useXimalaya.getState().playback?.status).toBe('paused')
    expect(receiveRadioAnswer(2_000_000_099, undefined, true)).toBe(true)
  })
  it('uses an explicit host-only playback notice in development preview', () => {
    host.inHost = false
    playRadio(station)
    expect(useRadio.getState().notice).toBe('host')
    expect(useXimalaya.getState().playback).toBeNull()
  })
})
