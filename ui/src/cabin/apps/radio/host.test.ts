import { afterEach, describe, expect, it, vi } from 'vitest'
import script from '../../../../../crates/host/src/ximalaya.js?raw'

interface Track {
  id: string
  title: string
  artist: string
  radio?: boolean
  radioId?: number
  url?: string
}
const radio = (id: number): Track => ({
  id: 'radio-' + id,
  title: 'Radio',
  artist: 'Station',
  radio: true,
  radioId: id,
})
function harness(native = false) {
  vi.useFakeTimers()
  const posted: any[] = [],
    elements: FakeAudio[] = [],
    requests: { url: string; signal?: AbortSignal; resolve(value: unknown): void; reject(error: Error): void }[] = []
  class FakeAudio {
    src = ''
    paused = true
    volume = 1
    muted = false
    duration = Infinity
    currentTime = 0
    playbackRate = 1
    error: { code: number } | null = null
    listeners = new Map<string, (() => void)[]>()
    addEventListener(name: string, listener: () => void) {
      this.listeners.set(name, [...(this.listeners.get(name) || []), listener])
    }
    emit(name: string) {
      for (const listener of this.listeners.get(name) || []) listener()
    }
    canPlayType() {
      return native ? 'maybe' : ''
    }
    play = vi.fn(async () => {
      this.paused = false
      this.emit('play')
    })
    pause() {
      const playing = !this.paused
      this.paused = true
      if (playing) this.emit('pause')
    }
    removeAttribute(name: string) {
      if (name === 'src') this.src = ''
    }
    load() {}
  }
  class FakeHls {
    static Events = { MEDIA_ATTACHED: 'attached', MANIFEST_PARSED: 'manifest', ERROR: 'error' }
    static isSupported() {
      return true
    }
    static instances: FakeHls[] = []
    handlers = new Map<string, (...args: any[]) => void>()
    destroy = vi.fn()
    loadSource = vi.fn()
    constructor() {
      FakeHls.instances.push(this)
    }
    on(name: string, fn: (...args: any[]) => void) {
      this.handlers.set(name, fn)
    }
    attachMedia() {
      this.emit('attached')
    }
    emit(name: string, data?: unknown) {
      this.handlers.get(name)?.(name, data)
    }
  }
  const sound = {
    speakers: vi.fn(),
    head: vi.fn(),
    outside: vi.fn(),
    equalizer: vi.fn(),
    spectrum: vi.fn(),
    tick: vi.fn(),
  }
  const makeSound = vi.fn(() => sound)
  const window = {
    top: null as unknown,
    chrome: { webview: { postMessage: (m: unknown) => posted.push(m), addEventListener() {} } },
    Hls: FakeHls,
    westplayCabSound: makeSound,
    westplayXimalayaCommand: undefined as unknown,
  }
  window.top = window
  const fetch = vi.fn(
    (url: string, options?: { signal?: AbortSignal }) =>
      new Promise((resolve, reject) =>
        requests.push({
          url,
          signal: options?.signal,
          resolve: (data) => resolve({ ok: true, json: async () => ({ ret: 0, data }) }),
          reject,
        }),
      ),
  )
  const location = { hostname: 'www.ximalaya.com' }
  const document = {
    cookie: '',
    createElement: () => {
      const audio = new FakeAudio()
      elements.push(audio)
      return audio
    },
    body: { appendChild() {} },
  }
  new Function(
    'window',
    'location',
    'document',
    'fetch',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'AbortController',
    'AbortSignal',
    'URL',
    'URLSearchParams',
    'console',
    script,
  )(
    window,
    location,
    document,
    fetch,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController,
    AbortSignal,
    URL,
    URLSearchParams,
    console,
  )
  const command = async (cmd: unknown) => {
    ;(window.westplayXimalayaCommand as (cmd: unknown) => void)(cmd)
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }
  const detail = (id: number) => ({
    id,
    name: 'Station ' + id,
    programName: 'Program ' + id,
    playUrl: {
      aac64: 'http://live.ximalaya.com/live/' + id + '.m3u8',
      ts64: 'http://live.ximalaya.com/live/' + id + '.m3u8?transcode=ts',
    },
  })
  const last = () => posted.filter((m) => m.type === 'playback').at(-1)?.playback
  return { command, requests, detail, elements, Hls: FakeHls, makeSound, sound, posted, last }
}
afterEach(() => vi.useRealTimers())
describe('the single Ximalaya audio host', () => {
  it('stops the old sound before resolving the new target, ignores the old response and connects sound once', async () => {
    const h = harness()
    await h.command({
      action: 'play',
      requestId: 1,
      track: { id: 'vod', title: 'Book', artist: 'Reader', url: 'https://example.com/book.mp3' },
    })
    h.elements[0].emit('playing')
    expect(h.last().status).toBe('playing')
    const old = h.command({ action: 'play', requestId: 2, track: radio(1) })
    expect(h.elements[0].paused).toBe(true)
    expect(h.elements[0].src).toBe('')
    const fresh = h.command({ action: 'play', requestId: 3, track: radio(2) })
    await Promise.resolve()
    await Promise.resolve()
    expect(h.requests[0].signal?.aborted).toBe(true)
    h.requests[1].resolve(h.detail(2))
    await fresh
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    h.requests[0].resolve(h.detail(1))
    await old
    await Promise.resolve()
    await Promise.resolve()
    expect(h.Hls.instances).toHaveLength(1)
    const instance = h.Hls.instances[0]
    expect(instance.loadSource).toHaveBeenCalledWith('https://live.ximalaya.com/live/2.m3u8?transcode=ts')
    expect(h.last()).toMatchObject({ radioId: 2, status: 'loading', duration: 0, position: 0, requestId: 3 })
    instance.emit('manifest')
    await Promise.resolve()
    h.elements[0].emit('playing')
    expect(h.last().status).toBe('playing')
    expect(h.elements).toHaveLength(1)
    expect(h.makeSound).toHaveBeenCalledTimes(1)
    await h.command({
      action: 'play',
      requestId: 4,
      track: { id: 'vod2', title: 'Second book', artist: 'Reader', url: 'https://example.com/second.mp3' },
    })
    expect(instance.destroy).toHaveBeenCalledTimes(1)
    instance.emit('manifest')
    expect(h.elements[0].src).toBe('https://example.com/second.mp3')
  })
  it('cancels pending resolution on pause and cannot resurrect it', async () => {
    const h = harness()
    const pending = h.command({ action: 'play', requestId: 1, track: radio(1) })
    await h.command({ action: 'pause', requestId: 2 })
    h.requests[0].resolve(h.detail(1))
    await pending
    expect(h.last()).toMatchObject({ status: 'paused', requestId: 2 })
    expect(h.Hls.instances).toHaveLength(0)
    expect(h.elements[0].play).not.toHaveBeenCalled()
  })
  it('bounds reconnect attempts, supports manual retry and cancels delayed retries', async () => {
    const h = harness()
    const start = h.command({ action: 'play', requestId: 1, track: radio(1) })
    await Promise.resolve()
    await Promise.resolve()
    h.requests[0].resolve(h.detail(1))
    await start
    for (let n = 0; n < 10; n++) await Promise.resolve()
    const delays = [2000, 4000, 8000, 15000, 30000]
    for (let i = 0; i <= delays.length; i++) {
      h.Hls.instances[i].emit('error', { fatal: true, details: 'offline' })
      if (i < delays.length) {
        await vi.advanceTimersByTimeAsync(delays[i])
        h.requests[i + 1].resolve(h.detail(1))
        for (let n = 0; n < 10; n++) await Promise.resolve()
      }
    }
    expect(h.last()).toMatchObject({ status: 'failed', error: 'offline' })
    await vi.advanceTimersByTimeAsync(60000)
    expect(h.requests).toHaveLength(6)
    const retry = h.command({ action: 'play', requestId: 2 })
    h.requests[6].resolve(h.detail(1))
    await retry
    await Promise.resolve()
    await Promise.resolve()
    h.Hls.instances.at(-1)!.emit('error', { fatal: true, details: 'again' })
    await h.command({ action: 'pause', requestId: 3 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.requests).toHaveLength(7)
    expect(h.last().status).toBe('paused')
  })
  it('prefers native HLS and reconnects at the live edge, while forwarding cab settings once', async () => {
    const h = harness(true)
    await h.command({
      action: 'cab',
      head: { x: 0 },
      speakers: [],
      equalizer: { bass: 4 },
      outside: true,
      distance: 5,
      spectrum: true,
    })
    const first = h.command({ action: 'play', requestId: 1, track: radio(1) })
    await Promise.resolve()
    await Promise.resolve()
    h.requests[0].resolve(h.detail(1))
    await first
    await Promise.resolve()
    await Promise.resolve()
    expect(h.Hls.instances).toHaveLength(0)
    expect(h.elements[0].src).toBe('https://live.ximalaya.com/live/1.m3u8')
    h.elements[0].emit('playing')
    expect(h.last().status).toBe('playing')
    expect(h.sound.equalizer).toHaveBeenCalledWith({ bass: 4 })
    expect(h.sound.outside).toHaveBeenCalledWith(true, 5)
    expect(h.makeSound).toHaveBeenCalledTimes(1)
    const [getter] = h.makeSound.mock.calls[0] as unknown as [() => unknown, unknown]
    expect(typeof getter).toBe('function')
    expect(getter()).toBe(h.elements[0])
    await h.command({ action: 'pause', requestId: 2 })
    const resumed = h.command({ action: 'play', requestId: 3 })
    await Promise.resolve()
    await Promise.resolve()
    h.requests[1].resolve(h.detail(1))
    await resumed
    await Promise.resolve()
    await Promise.resolve()
    expect(h.requests).toHaveLength(2)
    expect(h.elements[0].playbackRate).toBe(1)
    expect(h.makeSound).toHaveBeenCalledTimes(1)
  })
  it('auto-recovers from unexpected audio pause events and escalates repeated bursts to reconnect', async () => {
    const h = harness()
    const start = h.command({ action: 'play', requestId: 1, track: radio(1) })
    await Promise.resolve()
    await Promise.resolve()
    h.requests[0].resolve(h.detail(1))
    await start
    for (let n = 0; n < 10; n++) await Promise.resolve()
    h.Hls.instances[0].emit('manifest')
    await Promise.resolve()
    h.elements[0].emit('playing')
    expect(h.last().status).toBe('playing')
    h.elements[0].play.mockClear()

    // Simulate an unsolicited pause (e.g. WebView2/audio focus glitch): resumes automatically.
    h.elements[0].pause()
    expect(h.last()).toMatchObject({ status: 'loading', error: 'Unexpected audio pause' })
    expect(h.elements[0].play).toHaveBeenCalledTimes(1)
    h.elements[0].emit('playing')
    expect(h.last()).toMatchObject({ status: 'playing', error: null })

    // A burst of unexpected pauses escalates to a clean HLS reconnect.
    h.elements[0].pause()
    h.elements[0].emit('playing')
    h.elements[0].pause()
    expect(h.requests).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.requests).toHaveLength(2)
  })
  it('resets retry budget after sustained stable playback across long radio sessions', async () => {
    const h = harness()
    const start = h.command({ action: 'play', requestId: 1, track: radio(1) })
    await Promise.resolve()
    await Promise.resolve()
    h.requests[0].resolve(h.detail(1))
    await start
    for (let n = 0; n < 10; n++) await Promise.resolve()
    h.Hls.instances[0].emit('manifest')
    await Promise.resolve()
    h.elements[0].emit('playing')

    // Exhaust 4 retries, then recover on the 5th attempt.
    const delays = [2000, 4000, 8000, 15000]
    for (let i = 0; i < delays.length; i++) {
      h.Hls.instances[i].emit('error', { fatal: true, details: 'blip' })
      await vi.advanceTimersByTimeAsync(delays[i])
      h.requests[i + 1].resolve(h.detail(1))
      for (let n = 0; n < 10; n++) await Promise.resolve()
    }
    h.Hls.instances[4].emit('manifest')
    await Promise.resolve()
    h.elements[0].emit('playing')
    expect(h.last().status).toBe('playing')

    // Stay playing for 10s so the retry budget resets.
    await vi.advanceTimersByTimeAsync(10000)

    // A later transient error starts from the initial 2s retry delay again instead of failing at limit.
    h.Hls.instances[4].emit('error', { fatal: true, details: 'later-blip' })
    expect(h.last().status).toBe('loading')
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.requests).toHaveLength(6)
  })
})
