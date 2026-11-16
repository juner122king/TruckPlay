import { useMemo } from 'react'
import { formatDeadline } from '../../dashboard/destination'
import { useMapData } from '../../maps/mapData'
import { nextStop } from '../../maps/nextStop'
import { useClockStyle } from '../../state/hooks'
import { useLive } from '../../state/store'
import { useLanguage, useText } from '../../state/text'
import {
  calculateNetPayout,
  calculateRouteProgress,
  evaluateBuffer,
  evaluateHos,
  formatArrivalTime,
  formatCargoMass,
  formatDuration,
  formatNextBreakLocation,
  resolveLocalizedCity,
  resolveLocalizedCompany,
} from './freight'
import { ArrowUpGlyph, CargoBoxGlyph, CoffeeCupGlyph, RouteArrowGlyph } from './glyphs'
import './freight.css'

/**
 * Automotive In-Cabin Modern Glassmorphism Freight Cockpit HUD
 * Refactored to strictly match the reference image:
 * - Two independent glassmorphic cards (Job Card + Progress Card)
 * - Margins to sidebar, edges, and inter-card gap strictly unified via design tokens
 */
export function FreightApp() {
  const text = useText()
  const language = useLanguage()
  const isZh = language === 'zh_cn' || language.startsWith('zh')
  const clockStyle = useClockStyle()

  // Live simulator telemetry from store
  const rawJob = useLive((state) => state.job)
  const telemetry = useLive((state) => state.telemetry)
  const mph = useLive((state) => state.mph)
  const clockShift = useLive((state) => state.clockShift)
  const route = useLive((state) => state.route)
  const routeStops = useLive((state) => state.routeStops)
  const routeNext = useLive((state) => state.routeNext)

  const hasLiveJob = Boolean(rawJob && rawJob.active)

  // Game time reference: fallback to Wed 15:00 (day 2, 15*60 = 3780)
  const gameTime = telemetry?.gameTime ?? 3780
  const navSeconds = telemetry?.navigationTime ?? 17340 // ~4h 49m -> ETA 19:49
  const navDistance = telemetry?.navigationDistance ?? 411000 // 411 km left

  // Active or reference demo fallback job
  const job = useMemo(() => {
    if (hasLiveJob) return rawJob!
    return {
      active: true,
      cargoLoaded: true,
      special: false,
      cargo: isZh ? '酸奶' : 'Yogurt',
      cargoMass: 18200,
      sourceCity: isZh ? '杜伊斯堡' : 'Duisburg',
      sourceCompany: isZh ? '卡福物流' : 'Kaarfor',
      destinationCity: isZh ? '阿姆斯特丹' : 'Amsterdam',
      destinationCompany: isZh ? '泛欧环保' : 'Tree-ET',
      deliveryTime: gameTime + 510, // Wed 23:30 (8.5 hours delivery window)
      plannedDistanceKm: 430, // 430 km planned
      income: 18450,
    }
  }, [hasLiveJob, rawJob, isZh, gameTime])

  // Map labels for official game-map city localizations
  const labels = useMapData()?.labels
  const displaySourceCity = resolveLocalizedCity(job.sourceCity, labels, isZh)
  const displaySourceCompany = resolveLocalizedCompany(job.sourceCompany, isZh)
  const displayDestCity = resolveLocalizedCity(job.destinationCity, labels, isZh)
  const displayDestCompany = resolveLocalizedCompany(job.destinationCompany, isZh)

  // Progress calculations
  const progress = useMemo(() => {
    const navMeters = hasLiveJob ? telemetry?.navigationDistance : navDistance
    return calculateRouteProgress(job.plannedDistanceKm, navMeters, mph)
  }, [job.plannedDistanceKm, hasLiveJob, telemetry?.navigationDistance, navDistance, mph])

  // Remaining distance hero number
  const remainingDistKm = (hasLiveJob ? (telemetry?.navigationDistance ?? 0) : navDistance) / 1000
  const remainingDistScale = mph ? 0.621371 : 1
  const remainingDistNum = Math.max(0, Math.round(remainingDistKm * remainingDistScale))
  const distUnit = mph ? 'mi' : 'km'
  const heroDistanceText = isZh
    ? `剩余 ${remainingDistNum.toLocaleString()} ${distUnit}`
    : `${remainingDistNum.toLocaleString()} ${distUnit} left`

  // Delivery Buffer
  const buffer = useMemo(() => {
    const navSec = hasLiveJob ? (telemetry?.navigationTime ?? 0) : navSeconds
    return evaluateBuffer(job.deliveryTime, gameTime, navSec, isZh)
  }, [job.deliveryTime, hasLiveJob, telemetry?.navigationTime, navSeconds, gameTime, isZh])

  // Formatted Cargo & Financials
  const cargoMassText = formatCargoMass(job.cargoMass, mph)
  const rawDamage = telemetry?.cargoDamage ?? (hasLiveJob ? 0 : 0.01) // 1% fallback matching reference
  const damagePercentText = `${Math.round(rawDamage * 100)}%`
  const netIncome = calculateNetPayout(job.income, rawDamage)
  const plannedDistanceText = `${Math.round(mph ? job.plannedDistanceKm * 0.621371 : job.plannedDistanceKm).toLocaleString()} ${distUnit}`

  // Arrival & Deadline Strings
  const arrivalText = formatArrivalTime(
    gameTime,
    hasLiveJob ? (telemetry?.navigationTime ?? 0) : navSeconds,
    clockShift,
    text.days,
    clockStyle,
    isZh,
  )
  const deadlineStr = formatDeadline(job.deliveryTime, gameTime, text.days, clockStyle)
  const bufferDurationText = formatDuration(Math.max(0, buffer.bufferMinutes), isZh)

  // Driver Rest & Next Break
  const nextRestStopMinutes = telemetry?.nextRestStop ?? (hasLiveJob ? 480 : 312) // 5h 12m fallback
  const hos = evaluateHos(nextRestStopMinutes, hasLiveJob ? (telemetry?.navigationTime ?? 0) : navSeconds, isZh)

  // Subtitle for Next Break
  const nextBreakSubtitle = useMemo(() => {
    if (!hasLiveJob) {
      return isZh ? '阿姆斯特丹服务区 · 67 km · 15:02' : 'Rest area in Amsterdam · 67 km · 15:02'
    }
    if (route && routeStops.length > 0 && telemetry?.navigationDistance) {
      const stop = nextStop(
        routeStops,
        route.distances,
        routeNext,
        telemetry.navigationDistance,
        telemetry.navigationTime,
      )
      if (stop) {
        const stopMinutes = Math.ceil(stop.minutes)
        const stopEtaTime = formatDeadline(gameTime + stopMinutes + clockShift, gameTime, text.days, clockStyle)
        return formatNextBreakLocation(isZh ? '沿途' : 'En route', stop.distance, stopEtaTime, mph, isZh)
      }
    }
    const destCity = displayDestCity || (isZh ? '目的地' : 'Destination')
    const defaultMeters = Math.min(67000, telemetry?.navigationDistance ?? 67000)
    const approxMinutes = Math.round((defaultMeters / 1000) * 1.2)
    const defaultEta = formatDeadline(gameTime + approxMinutes + clockShift, gameTime, text.days, clockStyle)
    return formatNextBreakLocation(destCity, defaultMeters, defaultEta, mph, isZh)
  }, [
    hasLiveJob,
    isZh,
    route,
    routeStops,
    routeNext,
    telemetry,
    gameTime,
    clockShift,
    text.days,
    clockStyle,
    mph,
    displayDestCity,
  ])

  return (
    <section className="app-panel freight-app modern-hud" aria-label={text.freight.title}>
      {/* =================================================================
          LEFT CARD: Job (货运任务)
          ================================================================= */}
      <section className="hud-glass-card card-job">
        {/* Card Header */}
        <div className="card-top-header">
          <div className="card-title-cluster">
            <div className="card-icon-badge purple" aria-hidden>
              <CargoBoxGlyph size={18} />
            </div>
            <h2 className="card-heading">{isZh ? '货运任务' : 'Job'}</h2>
          </div>
          <span className="market-pill-badge">
            {job.special ? (isZh ? '特种大件' : 'Special transport') : isZh ? '货运市场' : 'Freight market'}
          </span>
        </div>

        {/* Route City Pair */}
        <div className="route-cities-row">
          <div className="city-block origin">
            <div className="city-title">{displaySourceCity}</div>
            <div className="city-company">{displaySourceCompany}</div>
          </div>

          <div className="route-arrow-cell" aria-hidden>
            <RouteArrowGlyph size={22} color="#38bdf8" />
          </div>

          <div className="city-block destination">
            <div className="city-title">{displayDestCity}</div>
            <div className="city-company">{displayDestCompany}</div>
          </div>
        </div>

        {/* Cargo Manifest Summary */}
        <div className="cargo-tagline">
          {job.cargo} {cargoMassText}
        </div>

        {/* Financial & Status Metrics */}
        <div className="card-kv-list">
          <div className="card-kv-row">
            <span className="card-kv-label">{isZh ? '合同运费' : 'Pay'}</span>
            <span className="card-kv-value">{job.income.toLocaleString()} €</span>
          </div>
          <div className="card-kv-row">
            <span className="card-kv-label">{isZh ? '途中费用' : 'Costs on the road'}</span>
            <span className="card-kv-value">0 €</span>
          </div>
          <div className="card-kv-row">
            <span className="card-kv-label">{isZh ? '净收益' : 'Net'}</span>
            <span className="card-kv-value highlight-net">{netIncome.toLocaleString()} €</span>
          </div>
          <div className="card-kv-row">
            <span className="card-kv-label">{isZh ? '运输里程' : 'Distance'}</span>
            <span className="card-kv-value">{plannedDistanceText}</span>
          </div>
          <div className="card-kv-row">
            <span className="card-kv-label">{isZh ? '货物货损' : 'Cargo damage'}</span>
            <span className={`card-kv-value ${rawDamage > 0.05 ? 'damage-alert' : ''}`}>{damagePercentText}</span>
          </div>
        </div>
      </section>

      {/* =================================================================
          RIGHT CARD: Progress (行程进度)
          ================================================================= */}
      <section className="hud-glass-card card-progress">
        {/* Card Header */}
        <div className="card-top-header">
          <div className="card-title-cluster">
            <div className="card-icon-badge cyan" aria-hidden>
              <ArrowUpGlyph size={18} />
            </div>
            <h2 className="card-heading">{isZh ? '行程进度' : 'Progress'}</h2>
          </div>
        </div>

        {/* Distance Remaining Hero */}
        <div className="progress-hero-text">{heroDistanceText}</div>

        {/* Sleek Progress Bar */}
        <div className="sleek-progress-bar" aria-label="Route Progress">
          <div
            className="sleek-progress-fill"
            style={{ width: `${Math.max(4, Math.min(100, progress.progressPercent))}%` }}
          />
        </div>

        {/* Schedule & Buffer Metrics */}
        <div className="card-kv-list">
          <div className="card-kv-row">
            <span className="card-kv-label-plain">{arrivalText}</span>
            <span className={`arrival-status-pill ${buffer.status}`}>
              {buffer.status === 'ample' && (isZh ? '准时' : 'on time')}
              {buffer.status === 'tight' && (isZh ? '时效紧迫' : 'tight')}
              {buffer.status === 'late' && (isZh ? '延误' : 'delayed')}
            </span>
          </div>
          <div className="card-kv-row">
            <span className="card-kv-label">{isZh ? '交付截止' : 'Deadline'}</span>
            <span className="card-kv-value">{deadlineStr}</span>
          </div>
          <div className="card-kv-row">
            <span className="card-kv-label">{isZh ? '时效缓冲' : 'Buffer'}</span>
            <span className="card-kv-value">{bufferDurationText}</span>
          </div>
        </div>

        {/* Next Break Micro-Card */}
        <div className="next-break-card">
          <div className="next-break-top-row">
            <div className="next-break-title-group">
              <div className="card-icon-badge amber" aria-hidden>
                <CoffeeCupGlyph size={16} />
              </div>
              <span className="next-break-title">{isZh ? '下次休息' : 'Next break'}</span>
            </div>
            <span className="next-break-timer">{hos.restDueText}</span>
          </div>
          <div className="next-break-subtext">{nextBreakSubtitle}</div>
        </div>
      </section>
    </section>
  )
}
