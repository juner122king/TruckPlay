import { describe, expect, it } from 'vitest'
import { HOURS_24 } from '../../../shared/format'
import type { JobInfo, Telemetry } from '../../../shared/host'
import type { LogbookEntry } from '../../state/simulation'
import { strings as enStrings } from '../../state/strings/en_us'
import { strings as zhStrings } from '../../state/strings/zh_cn'
import { buildDaySchedule, buildWeekDays, summarizePeriod } from './schedule'

const baseTel: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  speed: 20,
  engineRpm: 1200,
  gear: 12,
  displayedGear: 12,
  cruiseControlSpeed: 20,
  fuel: 600,
  fuelRange: 1000,
  navigationDistance: 300_000,
  navigationTime: 18_000, // 5h
  navigationSpeedLimit: 22,
  gameTime: 2 * 1440 + 22 * 60, // Wed 22:00 (day 2)
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
  nextRestStop: 120, // 2h left < 5h nav -> rest needed
  cargoDamage: 0,
  wearEngine: 0.18, // >= 15% -> maintenance
  wearTransmission: 0.01,
  wearCabin: 0.01,
  wearChassis: 0.01,
  wearWheels: 0.02,
  brakeAirPressure: 120,
  brakeAirPressureWarning: false,
}

const crossDayJob: JobInfo = {
  active: true,
  cargoLoaded: true,
  special: false,
  cargo: 'Yogurt',
  cargoMass: 18000,
  sourceCity: 'Duisburg',
  sourceCompany: 'Kaarfor',
  destinationCity: 'Amsterdam',
  destinationCompany: 'Tree-ET',
  deliveryTime: 3 * 1440 + 8 * 60, // Thu 08:00 (day 3)
  plannedDistanceKm: 400,
  income: 16000,
}

describe('calendar schedule synthesis', () => {
  it('builds a 7-day Monday..Sunday strip with job, rest, and completed dots', () => {
    const logbook: LogbookEntry[] = [
      { id: '1', kind: 'delivered', gameDay: 0, gameTime: 900, income: 12000, distanceKm: 300 },
      { id: '2', kind: 'fine', gameDay: 1, gameTime: 2100, expense: 250, offenceCode: 'speeding' },
    ]
    const week = buildWeekDays(
      2,
      2,
      new Date(2026, 10, 25),
      logbook,
      { telemetry: baseTel, job: crossDayJob, weather: null, clockShift: 0, mph: false, routeStopsCount: 0 },
      zhStrings,
    )
    expect(week).toHaveLength(7)
    expect(week[0].gameDay).toBe(0)
    expect(week[0].dots).toContain('green')
    expect(week[1].dots).toContain('orange')
    expect(week[2].isToday).toBe(true)
    expect(week[2].dots).toEqual(['blue', 'orange'])
    expect(week[3].dots).toEqual(['blue']) // deadline milestone on Thu (day 3)
  })

  it('projects cross-day deadline onto tomorrow and includes HOS/maintenance actions today', () => {
    const live = {
      telemetry: baseTel,
      job: crossDayJob,
      weather: { now: 'clear' as const, coming: 'rain' as const, changeIn: 35, wetness: 0 },
      clockShift: 0,
      mph: false,
      routeStopsCount: 1,
    }
    const todayItems = buildDaySchedule(2, 2, live, [], HOURS_24, enStrings)
    expect(todayItems.some((i) => i.id === 'live-active-job')).toBe(true)
    expect(todayItems.some((i) => i.id === 'live-hos-rest' && i.action?.stopType === 'rest')).toBe(true)
    expect(todayItems.some((i) => i.id === 'live-maintenance' && i.action?.stopType === 'service')).toBe(true)
    expect(todayItems.some((i) => i.id === 'live-weather-shift')).toBe(true)
    expect(todayItems.some((i) => i.id === 'live-route-stops')).toBe(true)

    const tomorrowItems = buildDaySchedule(3, 2, live, [], HOURS_24, enStrings)
    expect(tomorrowItems.map((i) => i.id)).toEqual(['live-job-deadline'])
  })

  it('summarizes daily and weekly revenue, road expenses, and net profit', () => {
    const logbook: LogbookEntry[] = [
      { id: '1', kind: 'delivered', gameDay: 0, gameTime: 800, distanceKm: 280, income: 10000 },
      { id: '2', kind: 'toll', gameDay: 0, gameTime: 850, expense: 30 },
      { id: '3', kind: 'delivered', gameDay: 1, gameTime: 2200, distanceKm: 420, income: 15000 },
      { id: '4', kind: 'fine', gameDay: 1, gameTime: 2300, expense: 400, offenceCode: 'red_signal' },
      { id: '5', kind: 'ferry', gameDay: 2, gameTime: 3200, expense: 500 },
    ]
    const day1 = summarizePeriod(logbook, 1, 1)
    expect(day1).toEqual({
      deliveredCount: 1,
      distanceKm: 420,
      grossIncome: 15000,
      roadExpenses: 400,
      netProfit: 14600,
    })

    const week = summarizePeriod(logbook, 0, 6)
    expect(week).toEqual({
      deliveredCount: 2,
      distanceKm: 700,
      grossIncome: 25000,
      roadExpenses: 930,
      netProfit: 24070,
    })
  })
})
