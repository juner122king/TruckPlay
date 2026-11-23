import { describe, expect, it } from 'vitest'
import {
  calculateJourneyTimeline,
  calculateNetPayout,
  calculateOverallHealth,
  calculateRate,
  calculateRouteProgress,
  createPreviewData,
  estimateFuelFillPercent,
  evaluateBuffer,
  evaluateHos,
  evaluateWear,
  formatAirPressure,
  formatArrivalTime,
  formatCargoMass,
  formatDuration,
  formatFuel,
  formatFuelRange,
  formatNextBreakLocation,
  isLowFuel,
  isPreviewMode,
  isTrailerCoupled,
  resolveLocalizedCity,
  resolveLocalizedCompany,
} from './freight'

describe('freight logic helpers', () => {
  it('resolves localized city and company names with dictionary and map labels', () => {
    // Szczecin and Berlin from user screenshot
    expect(resolveLocalizedCity('Szczecin', undefined, true)).toBe('什切青')
    expect(resolveLocalizedCity('Berlin', undefined, true)).toBe('柏林')
    expect(resolveLocalizedCity('Duisburg', undefined, true)).toBe('杜伊斯堡')
    expect(resolveLocalizedCity('Amsterdam', undefined, true)).toBe('阿姆斯特丹')
    expect(resolveLocalizedCity('Szczecin', undefined, false)).toBe('Szczecin')

    // Company names
    expect(resolveLocalizedCompany('ITCC', true)).toBe('欧洲化工')
    expect(resolveLocalizedCompany('Sanbuilders', true)).toBe('圣建重工')
    expect(resolveLocalizedCompany('Kaarfor', true)).toBe('卡福货运')
    expect(resolveLocalizedCompany('ITCC', false)).toBe('ITCC')

    // Map labels resolution
    const mockLabels = [
      { name: 'Kraków', localized: '克拉科夫', kind: 'city', at: [0, 0] as [number, number], population: 100 },
    ]
    expect(resolveLocalizedCity('Kraków', mockLabels, true)).toBe('克拉科夫')
  })

  it('calculates net payout correctly with cargo damage', () => {
    expect(calculateNetPayout(18450, 0)).toBe(18450)
    expect(calculateNetPayout(18450, 0.01)).toBe(18450 - 185) // 18265
    expect(calculateNetPayout(10000, 0.1)).toBe(9000)
    expect(calculateNetPayout(0, 0.05)).toBe(0)
  })

  it('formats arrival time in English and Chinese', () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const zhDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    // Game time: Wed 15:00 = 2 * 1440 + 15 * 60 = 2880 + 900 = 3780
    // Nav seconds: 4h 49m = 289m = 17340 seconds -> Arrival Wed 19:49 (same day)
    const arrivalSameDay = formatArrivalTime(3780, 17340, 0, days, undefined, false)
    expect(arrivalSameDay).toBe('Arrival 19:49')

    // Different day: 10 hours later -> Thu 01:49
    const arrivalNextDay = formatArrivalTime(3780, 36000, 0, days, undefined, false)
    expect(arrivalNextDay).toBe('Arrival Thu 01:00')

    const zhNextDay = formatArrivalTime(3780, 36000, 0, zhDays, undefined, true)
    expect(zhNextDay).toBe('预计到达 周四 01:00')
  })

  it('formats next break location details', () => {
    const enText = formatNextBreakLocation('Amsterdam', 67000, '15:02', false, false)
    expect(enText).toBe('Rest area in Amsterdam · 67 km · 15:02')

    const zhText = formatNextBreakLocation('阿姆斯特丹', 67000, '15:02', false, true)
    expect(zhText).toBe('阿姆斯特丹服务区 · 67 km · 15:02')

    const miText = formatNextBreakLocation('Los Angeles', 67000, '15:02', true, false)
    expect(miText).toContain('mi')
  })

  it('calculates kilometer and mile rates accurately', () => {
    expect(calculateRate(10000, 500, false)).toBe('20.0')
    expect(calculateRate(0, 500, false)).toBe('--')
    expect(calculateRate(10000, 0, false)).toBe('--')
    const miRate = calculateRate(10000, 500, true)
    expect(parseFloat(miRate)).toBeGreaterThan(20) // in $/mi it is larger than €/km
  })

  it('formats cargo mass in metric tonnes and imperial pounds', () => {
    expect(formatCargoMass(24500, false)).toBe('24.5 t')
    expect(formatCargoMass(800, false)).toBe('800 kg')
    expect(formatCargoMass(1000, true)).toContain('lbs')
    expect(formatCargoMass(0, false)).toBe('--')
  })

  it('formats duration correctly in Chinese and English', () => {
    expect(formatDuration(1500, true)).toBe('1天 1小时 0分')
    expect(formatDuration(1500, false)).toBe('1d 1h 0m')
    expect(formatDuration(135, true)).toBe('2小时 15分')
    expect(formatDuration(45, true)).toBe('45分钟')
  })

  it('evaluates delivery buffer margins correctly', () => {
    // 3 hours left, 1 hour navigation -> 2 hours buffer (ample)
    const ample = evaluateBuffer(1000, 820, 3600, true)
    expect(ample.status).toBe('ample')
    expect(ample.bufferMinutes).toBe(120)
    expect(ample.bufferRatio).toBeGreaterThan(0.5)

    // 1 hour 10 min left, 1 hour navigation -> 10 min buffer (tight)
    const tight = evaluateBuffer(1000, 930, 3600, true)
    expect(tight.status).toBe('tight')
    expect(tight.bufferMinutes).toBe(10)

    // Overdue or impossible
    const late = evaluateBuffer(1000, 950, 7200, true)
    expect(late.status).toBe('late')
    expect(late.bufferMinutes).toBeLessThan(0)
    expect(late.bufferRatio).toBe(0)
  })

  it('evaluates component wear status with clean thresholds', () => {
    const fresh = evaluateWear('Engine', 0.02)
    expect(fresh.grade).toBe('good')
    expect(fresh.percentText).toBe('2.0%')

    const warning = evaluateWear('Transmission', 0.09)
    expect(warning.grade).toBe('warn')

    const damaged = evaluateWear('Wheels', 0.25)
    expect(damaged.grade).toBe('bad')

    const empty = evaluateWear('Chassis', undefined)
    expect(empty.fraction).toBe(0)
    expect(empty.grade).toBe('good')
  })

  it('evaluates HOS fatigue and generates rest recommendations', () => {
    // 8 hours available, 2 hours trip -> fresh, no need to rest en route
    const ok = evaluateHos(480, 7200, true)
    expect(ok.level).toBe('fresh')
    expect(ok.isOverdue).toBe(false)
    expect(ok.adviceStatus).toBe('ok')
    expect(ok.needRestEnRoute).toBe(false)

    // 1 hour available, 2 hours trip -> tired, must rest en route
    const needRest = evaluateHos(60, 7200, true)
    expect(needRest.level).toBe('tired')
    expect(needRest.isOverdue).toBe(false)
    expect(needRest.adviceStatus).toBe('rest_soon')
    expect(needRest.needRestEnRoute).toBe(true)

    // 1 hour available with no active GPS route (navTimeSeconds = 0) -> rest soon
    const lowWithNoNav = evaluateHos(60, 0, true)
    expect(lowWithNoNav.adviceStatus).toBe('rest_soon')
    expect(lowWithNoNav.needRestEnRoute).toBe(true)

    // 1 hour available, short 20 min trip (60 > 20 + 30) -> ok
    const shortOk = evaluateHos(60, 1200, true)
    expect(shortOk.adviceStatus).toBe('ok')
    expect(shortOk.needRestEnRoute).toBe(false)

    // Already at or past HOS limit (0 or negative), both with route and with 0 navTime
    for (const restDue of [0, -30]) {
      for (const navSeconds of [7200, 0]) {
        const overdueZh = evaluateHos(restDue, navSeconds, true)
        expect(overdueZh.isOverdue).toBe(true)
        expect(overdueZh.adviceStatus).toBe('overdue')
        expect(overdueZh.needRestEnRoute).toBe(true)
        expect(overdueZh.restDueText).toBe('已达上限')

        const overdueEn = evaluateHos(restDue, navSeconds, false)
        expect(overdueEn.isOverdue).toBe(true)
        expect(overdueEn.adviceStatus).toBe('overdue')
        expect(overdueEn.needRestEnRoute).toBe(true)
        expect(overdueEn.restDueText).toBe('Overdue')
      }
    }
  })

  it('calculates route progress metrics', () => {
    // 1000km planned, 400km left (400,000 meters)
    const prog = calculateRouteProgress(1000, 400000, false)
    expect(prog.progressPercent).toBe(60)
    expect(prog.distanceCoveredKm).toBe(600)
    expect(prog.distanceRemainingKm).toBe(400)
    expect(prog.coveredText).toBe('600 km')
    expect(prog.remainingText).toBe('400 km')

    // Imperial conversion
    const progMph = calculateRouteProgress(1000, 400000, true)
    expect(progMph.coveredText).toContain('mi')
    expect(progMph.remainingText).toContain('mi')

    // Edge cases: 0 planned or no navigation
    const zeroProg = calculateRouteProgress(0, undefined, false)
    expect(zeroProg.progressPercent).toBe(0)
    expect(zeroProg.remainingText).toBe('--')
  })

  it('simulates journey timeline with rest periods', () => {
    // Game time: 1000, Nav: 2 hours (120 min, 7200s), Rest in: 5 hours (300 min), Deadline: 1800
    // Direct ETA: 1120. With 8h rest (480 min): ETA 1600. Deadline: 1800 -> On time!
    const plan = calculateJourneyTimeline(1000, 7200, 300, 1800)
    expect(plan.canDirectDeliver).toBe(true)
    expect(plan.canDirectOnTime).toBe(true)
    expect(plan.canDeliverAfterRest).toBe(true)
    expect(plan.etaDirectMinutes).toBe(1120)
    expect(plan.etaWithRestMinutes).toBe(1600)
    expect(plan.restMarginMinutes).toBe(200)
    expect(plan.bufferRatio).toBeGreaterThan(0)
    expect(plan.navRatio + plan.restRatio + plan.bufferRatio).toBeCloseTo(1, 5)

    // Very tight deadline: Direct arrival 1120 is on time, but 8h rest ETA 1600 exceeds 1500
    const tightPlan = calculateJourneyTimeline(1000, 7200, 300, 1500)
    expect(tightPlan.canDirectOnTime).toBe(true)
    expect(tightPlan.canDeliverAfterRest).toBe(false)
    expect(tightPlan.restMarginMinutes).toBeLessThan(0)
    expect(tightPlan.bufferRatio).toBe(0)
    expect(tightPlan.navRatio + tightPlan.restRatio).toBeCloseTo(1, 5)

    // Already past delivery deadline: direct & rested arrival are both late, no false buffer
    const latePlan = calculateJourneyTimeline(2000, 7200, 300, 1800)
    expect(latePlan.canDirectOnTime).toBe(false)
    expect(latePlan.canDeliverAfterRest).toBe(false)
    expect(latePlan.bufferRatio).toBe(0)
    expect(latePlan.navRatio + latePlan.restRatio).toBeCloseTo(1, 5)

    // Overdue driver cannot deliver directly even when navTimeSeconds is 0
    for (const restDue of [0, -20]) {
      for (const navSeconds of [0, 3600]) {
        const overduePlan = calculateJourneyTimeline(1000, navSeconds, restDue, 2000)
        expect(overduePlan.canDirectDeliver).toBe(false)
      }
    }
  })

  it('calculates composite vehicle health score', () => {
    const truckItems = [evaluateWear('Engine', 0.01), evaluateWear('Transmission', 0.02), evaluateWear('Chassis', 0.01)]
    const trailerItems = [evaluateWear('Trailer Body', 0.02)]
    const healthy = calculateOverallHealth(truckItems, trailerItems)
    expect(healthy.score).toBeGreaterThan(90)
    expect(healthy.rating).toBe('excellent')

    const damagedTruck = [
      evaluateWear('Engine', 0.28), // ruinous damage
      evaluateWear('Transmission', 0.1),
    ]
    const bad = calculateOverallHealth(damagedTruck, [])
    expect(bad.rating).toBe('critical')
    expect(bad.maxWearComponent).toBe('Engine')
  })

  it('detects preview mode only outside host with ?preview or demo flag', () => {
    expect(isPreviewMode(true, false, '?preview')).toBe(false)
    expect(isPreviewMode(true, true, '')).toBe(false)
    expect(isPreviewMode(false, false, '')).toBe(false)
    expect(isPreviewMode(false, false, '?layout=daf-2021')).toBe(false)
    expect(isPreviewMode(false, false, '?preview')).toBe(true)
    expect(isPreviewMode(false, true, '')).toBe(true)
  })

  it('formats fuel, range, and brake air pressure in metric and imperial units', () => {
    expect(formatFuel(685, false)).toBe('685 L')
    expect(formatFuel(685, true)).toBe('181 gal')
    expect(formatFuel(undefined, false)).toBe('--')

    expect(formatFuelRange(1420, false)).toBe('1,420 km')
    expect(formatFuelRange(1000, true)).toBe('621 mi')
    expect(formatFuelRange(undefined, true)).toBe('--')

    expect(formatAirPressure(125, false)).toBe('8.6 bar')
    expect(formatAirPressure(125, true)).toBe('125 psi')
    expect(formatAirPressure(undefined, false)).toBe('--')
  })

  it('detects trailer coupling and provides complete preview data', () => {
    const preview = createPreviewData(true)
    expect(preview.job.active).toBe(true)
    expect(preview.telemetry.electricEnabled).toBe(true)
    expect(isTrailerCoupled(preview.telemetry, preview.job)).toBe(true)
    expect(
      isTrailerCoupled({ ...preview.telemetry, wearTrailerBody: 0, wearTrailerChassis: 0, wearTrailerWheels: 0 }, null),
    ).toBe(false)
    expect(
      isTrailerCoupled(
        { ...preview.telemetry, wearTrailerBody: 0, wearTrailerChassis: 0, wearTrailerWheels: 0 },
        { ...preview.job, cargoLoaded: false },
      ),
    ).toBe(false)
  })

  it('estimates fuel tank fill percentage and detects low fuel range', () => {
    expect(estimateFuelFillPercent(undefined, undefined)).toBe(0)
    expect(estimateFuelFillPercent(0, 0)).toBe(0)
    expect(estimateFuelFillPercent(450, 800)).toBe(50)
    expect(estimateFuelFillPercent(1200, 2000)).toBe(100)
    expect(estimateFuelFillPercent(undefined, 900)).toBe(50)

    expect(isLowFuel(undefined)).toBe(false)
    expect(isLowFuel(0)).toBe(false)
    expect(isLowFuel(180)).toBe(true)
    expect(isLowFuel(250)).toBe(false)
    expect(isLowFuel(1420)).toBe(false)
  })
})
