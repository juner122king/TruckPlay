import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOURS_24 } from '../../shared/format'
import {
  GAMEPLAY_EVENT_FERRY_USED,
  GAMEPLAY_EVENT_FINED,
  GAMEPLAY_EVENT_JOB_DELIVERED,
  GAMEPLAY_EVENT_TOLLGATE_PAID,
  GAMEPLAY_FLAG_AUTO_PARK,
  type JobInfo,
  type Telemetry,
} from '../../shared/host'
import { strings as zhStrings } from './strings/zh_cn'

function baseTelemetry(overrides: Partial<Telemetry> = {}): Telemetry {
  return {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 20,
    engineRpm: 1200,
    gear: 10,
    displayedGear: 10,
    cruiseControlSpeed: 20,
    fuel: 600,
    fuelRange: 1000,
    navigationDistance: 100_000,
    navigationTime: 3600,
    navigationSpeedLimit: 22,
    gameTime: 3000,
    multiplayerTimeOffset: 0,
    localScale: 1,
    dashboardBacklight: 0.8,
    electricEnabled: true,
    engineEnabled: true,
    parkingBrake: false,
    lowBeam: false,
    highBeam: false,
    leftBlinker: false,
    rightBlinker: false,
    paused: false,
    nextRestStop: 300,
    cargoDamage: 0,
    wearEngine: 0.01,
    wearTransmission: 0.01,
    wearCabin: 0.01,
    wearChassis: 0.01,
    wearWheels: 0.02,
    brakeAirPressure: 120,
    brakeAirPressureWarning: false,
    ...overrides,
  }
}

function baseJob(overrides: Partial<JobInfo> = {}): JobInfo {
  return {
    active: true,
    cargoLoaded: false,
    special: false,
    cargo: 'Yogurt',
    cargoMass: 18000,
    sourceCity: 'Duisburg',
    sourceCompany: 'Kaarfor',
    destinationCity: 'Amsterdam',
    destinationCompany: 'Tree-ET',
    deliveryTime: 3500,
    plannedDistanceKm: 400,
    income: 15000,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('useSimulation', () => {
  it('tracks job lifecycle, damage cooldown, tight schedule, and gameplay delivery without fallback duplication', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('location', { search: '' })
    const { useSimulation, resetSimulationTracker, countUnread } = await import('./simulation')
    resetSimulationTracker()
    useSimulation.getState().clearMessages()
    useSimulation.getState().clearLogbook()

    const tel = baseTelemetry({ gameTime: 3000, navigationTime: 3600 })
    const job = baseJob({ cargoLoaded: false, deliveryTime: 3500 })

    // 1. Assigned
    useSimulation.getState().ingestJob(job, tel, 0, HOURS_24, zhStrings, {}, 1000)
    expect(useSimulation.getState().messages).toHaveLength(1)
    expect(useSimulation.getState().banner?.thread).toBe('dispatch')

    // 2. Loaded
    const loadedJob = { ...job, cargoLoaded: true }
    useSimulation.getState().ingestJob(loadedJob, tel, 0, HOURS_24, zhStrings, {}, 2000)
    expect(useSimulation.getState().messages).toHaveLength(2)

    // 3. Damage spike + cooldown
    useSimulation.getState().ingestTelemetry({ ...tel, cargoDamage: 0.03 }, loadedJob, 0, false, zhStrings, {}, 65_000)
    expect(useSimulation.getState().messages).toHaveLength(3)
    // Within 60s cooldown, another jump does not spam
    useSimulation.getState().ingestTelemetry({ ...tel, cargoDamage: 0.06 }, loadedJob, 0, false, zhStrings, {}, 90_000)
    expect(useSimulation.getState().messages).toHaveLength(3)

    // 4. Tight schedule (3500 - 3390 = 110m window, 60m nav -> 50m buffer <= 75)
    useSimulation
      .getState()
      .ingestTelemetry({ ...tel, gameTime: 3390, navigationTime: 3600 }, loadedJob, 0, false, zhStrings, {}, 130_000)
    expect(useSimulation.getState().messages).toHaveLength(4)

    // 5. Job cleared then gameplay event arrives
    useSimulation.getState().ingestJob({ ...loadedJob, active: false }, tel, 0, HOURS_24, zhStrings, {}, 131_000)
    useSimulation.getState().ingestGameplayEvent(
      {
        kind: GAMEPLAY_EVENT_JOB_DELIVERED,
        gameTime: 3440,
        amount: 14550,
        earnedXp: 520,
        deliveryTime: 440,
        distanceKm: 412,
        cargoDamage: 0.03,
        flags: GAMEPLAY_FLAG_AUTO_PARK,
        code: '',
        source: '',
        target: '',
      },
      null,
      tel,
      0,
      false,
      zhStrings,
      {},
      131_200,
    )

    // Even after grace period passes, no duplicate fallback message is emitted
    useSimulation.getState().ingestTelemetry({ ...tel, gameTime: 3445 }, null, 0, false, zhStrings, {}, 140_000)

    const state = useSimulation.getState()
    expect(state.messages).toHaveLength(5)
    expect(state.logbook).toHaveLength(1)
    expect(state.logbook[0].kind).toBe('delivered')
    expect(state.logbook[0].sourceCity).toBe('Duisburg')
    expect(state.logbook[0].income).toBe(14550)
    expect(state.logbook[0].autoPark).toBe(true)
    expect(countUnread(state.messages)).toBe(5)
  })

  it('handles fines, silent tolls, and ferry tickets via gameplayEvent', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('location', { search: '' })
    const { useSimulation, resetSimulationTracker } = await import('./simulation')
    resetSimulationTracker()
    useSimulation.getState().clearMessages()
    useSimulation.getState().clearLogbook()

    const tel = baseTelemetry({ gameTime: 1000 })

    // Silent toll: no banner, recorded in messages + logbook
    useSimulation.getState().ingestGameplayEvent(
      {
        kind: GAMEPLAY_EVENT_TOLLGATE_PAID,
        gameTime: 1005,
        amount: 25,
        earnedXp: 0,
        deliveryTime: 0,
        distanceKm: 0,
        cargoDamage: 0,
        flags: 0,
        code: '',
        source: '',
        target: '',
      },
      null,
      tel,
      0,
      false,
      zhStrings,
    )
    expect(useSimulation.getState().banner).toBeNull()
    expect(useSimulation.getState().messages).toHaveLength(1)

    // Fine: high priority -> triggers banner
    useSimulation.getState().ingestGameplayEvent(
      {
        kind: GAMEPLAY_EVENT_FINED,
        gameTime: 1010,
        amount: 400,
        earnedXp: 0,
        deliveryTime: 0,
        distanceKm: 0,
        cargoDamage: 0,
        flags: 0,
        code: 'red_signal',
        source: '',
        target: '',
      },
      null,
      tel,
      0,
      false,
      zhStrings,
    )
    expect(useSimulation.getState().banner?.thread).toBe('traffic')
    expect(useSimulation.getState().messages[1].body).toContain('闯红灯')

    // Ferry
    useSimulation.getState().ingestGameplayEvent(
      {
        kind: GAMEPLAY_EVENT_FERRY_USED,
        gameTime: 1100,
        amount: 550,
        earnedXp: 0,
        deliveryTime: 0,
        distanceKm: 0,
        cargoDamage: 0,
        flags: 0,
        code: '',
        source: 'Calais',
        target: 'Dover',
      },
      null,
      tel,
      0,
      false,
      zhStrings,
    )
    expect(useSimulation.getState().logbook).toHaveLength(3)
    expect(useSimulation.getState().logbook[2].kind).toBe('ferry')
  })

  it('applies hysteresis to fuel/wear/fatigue and suppresses overdue alert when fatigue simulation is off', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('location', { search: '' })
    const { useSimulation, resetSimulationTracker } = await import('./simulation')
    resetSimulationTracker()
    useSimulation.getState().clearMessages()

    // Fatigue disabled (nextRestStop = 0 from start): must NOT fire restOverdue
    useSimulation
      .getState()
      .ingestTelemetry(baseTelemetry({ nextRestStop: 0, fuelRange: 800 }), null, 0, false, zhStrings, {}, 1000)
    expect(useSimulation.getState().messages).toHaveLength(0)

    // Low fuel fires once and includes fuel action
    useSimulation
      .getState()
      .ingestTelemetry(baseTelemetry({ nextRestStop: 300, fuelRange: 210 }), null, 0, false, zhStrings, {}, 2000)
    useSimulation
      .getState()
      .ingestTelemetry(baseTelemetry({ nextRestStop: 300, fuelRange: 190 }), null, 0, false, zhStrings, {}, 3000)
    expect(useSimulation.getState().messages).toHaveLength(1)
    expect(useSimulation.getState().messages[0].action).toEqual({ kind: 'addStop', stopType: 'fuel' })

    // Refuel resets hysteresis, then low fuel can fire again
    useSimulation
      .getState()
      .ingestTelemetry(baseTelemetry({ nextRestStop: 300, fuelRange: 900 }), null, 0, false, zhStrings, {}, 4000)
    useSimulation
      .getState()
      .ingestTelemetry(baseTelemetry({ nextRestStop: 300, fuelRange: 200 }), null, 0, false, zhStrings, {}, 5000)
    expect(useSimulation.getState().messages).toHaveLength(2)

    // Fatigue counted down from 300 -> 80 -> 0
    useSimulation
      .getState()
      .ingestTelemetry(baseTelemetry({ nextRestStop: 80, fuelRange: 900 }), null, 0, false, zhStrings, {}, 6000)
    useSimulation
      .getState()
      .ingestTelemetry(baseTelemetry({ nextRestStop: 0, fuelRange: 900 }), null, 0, false, zhStrings, {}, 7000)
    expect(useSimulation.getState().messages).toHaveLength(4)
  })

  it('prunes logbook to 30 game days, respects DND, and syncs plan_rest quick reply to Calendar', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('location', { search: '' })
    const { useSimulation, resetSimulationTracker } = await import('./simulation')
    resetSimulationTracker()
    useSimulation.getState().clearMessages()
    useSimulation.getState().clearLogbook()

    useSimulation.getState().setDnd(true)
    useSimulation.getState().ingestGameplayEvent(
      {
        kind: GAMEPLAY_EVENT_FINED,
        gameTime: 100, // day 0
        amount: 200,
        earnedXp: 0,
        deliveryTime: 0,
        distanceKm: 0,
        cargoDamage: 0,
        flags: 0,
        code: 'speeding',
        source: '',
        target: '',
      },
      null,
      null,
      0,
      false,
      zhStrings,
    )
    expect(useSimulation.getState().banner).toBeNull()
    expect(useSimulation.getState().messages).toHaveLength(1)

    // Day 35 event prunes day 0 (< 35 - 29 = 6)
    useSimulation.getState().ingestGameplayEvent(
      {
        kind: GAMEPLAY_EVENT_FINED,
        gameTime: 35 * 1440 + 60,
        amount: 300,
        earnedXp: 0,
        deliveryTime: 0,
        distanceKm: 0,
        cargoDamage: 0,
        flags: 0,
        code: 'speeding',
        source: '',
        target: '',
      },
      null,
      null,
      0,
      false,
      zhStrings,
    )
    expect(useSimulation.getState().logbook.every((e) => e.gameDay >= 6)).toBe(true)

    // Quick reply plan_rest updates plannedRest & logs rest_note
    useSimulation.getState().sendQuickReply('dispatch', 'plan_rest', 35 * 1440 + 120, zhStrings)
    expect(useSimulation.getState().plannedRest?.gameDay).toBe(35)
    expect(useSimulation.getState().logbook.some((e) => e.kind === 'rest_note' && e.gameDay === 35)).toBe(true)
  })

  it('triggers high-priority global weather banners on real rain transition and direct onset without spamming', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('location', { search: '' })
    const { useSimulation, resetSimulationTracker } = await import('./simulation')
    resetSimulationTracker()
    useSimulation.getState().clearMessages()

    // Spawning already in rain does not falsely trigger an alert
    useSimulation
      .getState()
      .ingestWeather(
        { now: 'rain', coming: 'rain', wetness: 50 },
        baseTelemetry({ gameTime: 100 }),
        0,
        zhStrings,
        {},
        1000,
      )
    expect(useSimulation.getState().messages).toHaveLength(0)

    // Turning clear -> rain emits high-priority rainTurning with global banner (even when changeIn is 0 / absent)
    useSimulation
      .getState()
      .ingestWeather(
        { now: 'clear', coming: 'clear', changeIn: 120 },
        baseTelemetry({ gameTime: 200 }),
        0,
        zhStrings,
        {},
        2000,
      )
    useSimulation
      .getState()
      .ingestWeather(
        { now: 'clear', coming: 'rain', changeIn: 0 },
        baseTelemetry({ gameTime: 220 }),
        0,
        zhStrings,
        {},
        3000,
      )
    expect(useSimulation.getState().messages).toHaveLength(1)
    expect(useSimulation.getState().messages[0].priority).toBe('high')
    expect(useSimulation.getState().messages[0].body).toBe(zhStrings.messages.events.rainTurning)
    expect(useSimulation.getState().banner?.thread).toBe('fleet')
    expect(useSimulation.getState().banner?.body).toBe(zhStrings.messages.events.rainTurning)

    // Settling into rain for the same shower does not duplicate
    useSimulation.getState().dismissBanner()
    useSimulation
      .getState()
      .ingestWeather(
        { now: 'rain', coming: 'rain', wetness: 40 },
        baseTelemetry({ gameTime: 222 }),
        0,
        zhStrings,
        {},
        4000,
      )
    expect(useSimulation.getState().messages).toHaveLength(1)
    expect(useSimulation.getState().banner).toBeNull()

    // Clearing sky resets shower latch; after 120m cooldown a direct clear -> rain jump emits rainStarted + banner
    useSimulation
      .getState()
      .ingestWeather(
        { now: 'clear', coming: 'clear', wetness: 0 },
        baseTelemetry({ gameTime: 300 }),
        0,
        zhStrings,
        {},
        5000,
      )
    useSimulation
      .getState()
      .ingestWeather(
        { now: 'rain', coming: 'rain', wetness: 30 },
        baseTelemetry({ gameTime: 360 }),
        0,
        zhStrings,
        {},
        6000,
      )
    expect(useSimulation.getState().messages).toHaveLength(2)
    expect(useSimulation.getState().messages[1].priority).toBe('high')
    expect(useSimulation.getState().messages[1].body).toBe(zhStrings.messages.events.rainStarted)
    expect(useSimulation.getState().banner?.thread).toBe('fleet')
  })
})
