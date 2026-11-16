import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PageMessage } from '../../../shared/host'

const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0).reverse()) stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function setup() {
  vi.useFakeTimers()
  const messages: PageMessage[] = []
  vi.stubGlobal('window', { chrome: { webview: { postMessage: (message: PageMessage) => messages.push(message) } } })
  const { useCabin, useLive } = await import('../../state/store')
  const session = await import('../ximalaya/ximalaya')
  const { ximalayaPlayer, pauseXimalayaWithGame } = await import('../ximalaya/pauseWithGame')
  const { oneAtATime } = await import('../oneAtATime')
  const { safariPlayer } = await import('../safari/pauseWithGame')
  const { receivePlaying } = await import('../safari/safari')
  const radio = await import('./radio')
  useLive.setState({ gameShown: true, telemetry: null, menuGone: false })
  useCabin.setState({ power: { ...useCabin.getState().power, observed: true, phase: 'on' } })
  session.useXimalaya.setState(session.useXimalaya.getInitialState())
  stops.push(pauseXimalayaWithGame(), oneAtATime([ximalayaPlayer, safariPlayer]))
  const commands = () => messages.filter((message) => message.type === 'ximalaya').map((message) => message.command)
  return { messages, commands, session, radio, useCabin, useLive, receivePlaying }
}

const station = (id: number) => ({
  id: 'radio-' + id,
  radioId: id,
  radio: true,
  title: 'Program ' + id,
  artist: 'Station ' + id,
})

describe('shared radio playback while the game is paused', () => {
  it('pauses a connecting station once when the game goes away, without recursive state updates', async () => {
    const p = await setup()
    p.session.play(station(1011))
    expect(p.session.useXimalaya.getState().playback?.status).toBe('loading')
    p.messages.length = 0
    expect(() => {
      p.useLive.setState({ gameShown: false })
      vi.advanceTimersByTime(600)
    }).not.toThrow()
    expect(p.session.useXimalaya.getState().playback?.status).toBe('paused')
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(1)
    p.messages.length = 0
    p.useLive.setState({ gameShown: true })
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(1)
  })

  it('cancels a connecting station once on power off and ignores its late playing report', async () => {
    const p = await setup()
    p.session.play(station(1011))
    const old = p.session.useXimalaya.getState().sessionRequestId!
    p.messages.length = 0
    expect(() => p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'off' } })).not.toThrow()
    expect(p.session.useXimalaya.getState().playback?.status).toBe('paused')
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(1)
    p.session.receivePlayback({
      ...station(1011),
      owner: 'radio',
      isLive: true,
      duration: 0,
      position: 0,
      status: 'playing',
      requestId: old,
    })
    expect(p.session.useXimalaya.getState().playing).toBe(false)
    p.messages.length = 0
    p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'on' } })
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(0)
  })

  it('sends a card click to the host while the game is already paused and accepts actual playback', async () => {
    const p = await setup()
    p.useLive.setState({
      telemetry: { paused: true } as NonNullable<ReturnType<typeof p.useLive.getState>['telemetry']>,
    })
    p.radio.playRadio({ id: 1011, name: 'Music station' })
    const requestId = p.session.useXimalaya.getState().sessionRequestId!
    expect(p.commands()).toContainEqual(
      expect.objectContaining({ action: 'play', requestId, track: expect.objectContaining({ radioId: 1011 }) }),
    )
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(0)
    p.session.receivePlayback({
      ...station(1011),
      owner: 'radio',
      isLive: true,
      duration: 0,
      position: 0,
      status: 'playing',
      requestId,
    })
    expect(p.session.useXimalaya.getState()).toMatchObject({ playing: true, playback: { status: 'playing' } })
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(0)
  })

  it.each([station(93), { id: 'episode-123', title: 'Book', artist: 'Reader' }])(
    'plays a manually selected target $id while away without a second automatic resume',
    async (target) => {
      const p = await setup()
      p.session.play(station(1011))
      p.useLive.setState({ gameShown: false })
      vi.advanceTimersByTime(600)
      p.messages.length = 0
      expect(() => p.session.play(target)).not.toThrow()
      expect(p.session.useXimalaya.getState().playback).toMatchObject({ title: target.title, status: 'loading' })
      expect(p.commands()).toContainEqual(
        expect.objectContaining({ action: 'play', track: expect.objectContaining({ id: target.id }) }),
      )
      p.messages.length = 0
      p.useLive.setState({ gameShown: true })
      vi.advanceTimersByTime(600)
      expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(0)
      expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(0)
    },
  )

  it('withholds a new station selected with power off until an explicit retry after power returns', async () => {
    const p = await setup()
    p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'off' } })
    p.messages.length = 0
    expect(() => p.radio.playRadio({ id: 93, name: 'Traffic station' })).not.toThrow()
    expect(p.session.useXimalaya.getState().playback?.status).toBe('paused')
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(0)
    p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'on' } })
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(0)
    p.radio.pauseOrResumeRadio()
    expect(p.commands()).toContainEqual(
      expect.objectContaining({ action: 'play', track: expect.objectContaining({ radioId: 93 }) }),
    )
  })

  it('lets Safari cancel an automatic radio resume while the game is away', async () => {
    const p = await setup()
    p.session.play(station(1011))
    p.useLive.setState({ gameShown: false })
    vi.advanceTimersByTime(600)
    p.receivePlaying(true)
    p.messages.length = 0
    p.useLive.setState({ gameShown: true })
    vi.advanceTimersByTime(600)
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(0)
    expect(p.session.useXimalaya.getState().playback?.status).toBe('paused')
  })
})
