import { type CSSProperties, type KeyboardEvent, useId, useMemo, useRef, useState } from 'react'
import { IS_DEMO, isInHost } from '../../../shared/host'
import { formatDeadline } from '../../dashboard/destination'
import { useTripProgress } from '../../dashboard/tripProgress'
import { useMapData } from '../../maps/mapData'
import { nextStop } from '../../maps/nextStop'
import { useClockStyle } from '../../state/hooks'
import { useLive } from '../../state/store'
import { useLanguage, useText } from '../../state/text'
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
import {
  AlertTriangleGlyph,
  BedRestGlyph,
  BrakeGlyph,
  CargoBoxGlyph,
  CheckCircleGlyph,
  ClockGlyph,
  CoffeeCupGlyph,
  FuelGlyph,
  HosGlyph,
  InspectionGlyph,
  RouteArrowGlyph,
  TachographRing,
  TruckLineGlyph,
  WaybillGlyph,
} from './glyphs'
import './freight.css'

type FreightTab = 'waybill' | 'inspection' | 'hos'

const TABS: readonly FreightTab[] = ['waybill', 'inspection', 'hos']

/**
 * CarPlay-style Freight Assistant (iOS 26 / Apple HIG):
 * - Floating glass pill navigation across Waybill, Inspection, and HOS / Rest.
 * - Full Light/Dark appearance via `--apple-*` tokens and `--text-scale` typography.
 * - Real empty states in live mode; sample data strictly gated to `?preview` / `?demo`.
 */
export function FreightApp() {
  const text = useText()
  const language = useLanguage()
  const isZh = language === 'zh_cn' || language.startsWith('zh')
  const clockStyle = useClockStyle()
  const baseId = useId()

  const [activeTab, setActiveTab] = useState<FreightTab>('waybill')
  const tabRefs = useRef<Record<FreightTab, HTMLButtonElement | null>>({
    waybill: null,
    inspection: null,
    hos: null,
  })

  // Live simulator telemetry from store
  const rawJob = useLive((state) => state.job)
  const rawTelemetry = useLive((state) => state.telemetry)
  const rawTruck = useLive((state) => state.truck)
  const mph = useLive((state) => state.mph)
  const clockShift = useLive((state) => state.clockShift)
  const route = useLive((state) => state.route)
  const routeStops = useLive((state) => state.routeStops)
  const routeNext = useLive((state) => state.routeNext)
  const labels = useMapData()?.labels

  const preview = isPreviewMode(isInHost(), IS_DEMO, typeof location !== 'undefined' ? location.search : '')
  const previewData = useMemo(() => (preview ? createPreviewData(isZh) : null), [preview, isZh])

  const telemetry = rawTelemetry ?? previewData?.telemetry ?? null
  const job = rawJob?.active ? rawJob : (previewData?.job ?? null)
  const truck = rawTruck ?? previewData?.truck ?? null
  const isLiveSession = Boolean(rawTelemetry)

  // Always call hook unconditionally before conditional branch rendering
  const trackedTripProgress = useTripProgress(telemetry?.navigationDistance ?? 0, route?.id, route?.distances, job)

  const selectTab = (tab: FreightTab, focus = false) => {
    setActiveTab(tab)
    if (focus) {
      tabRefs.current[tab]?.focus()
    }
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = TABS.indexOf(activeTab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TABS.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1
    } else {
      return
    }
    event.preventDefault()
    selectTab(TABS[nextIndex], true)
  }

  const tabId = (tab: FreightTab) => `${baseId}-tab-${tab}`
  const panelId = (tab: FreightTab) => `${baseId}-panel-${tab}`

  const tabMeta: Record<FreightTab, { label: string; icon: React.ReactNode }> = {
    waybill: { label: text.freight.tabs.waybill, icon: <WaybillGlyph size={22} /> },
    inspection: { label: text.freight.tabs.inspection, icon: <InspectionGlyph size={22} /> },
    hos: { label: text.freight.tabs.hos, icon: <HosGlyph size={22} /> },
  }

  // Shared derived job/route metrics
  const gameTime = telemetry?.gameTime ?? 0
  const cabNow = gameTime + (telemetry?.multiplayerTimeOffset ?? 0) + clockShift
  const cabOffset = cabNow - gameTime
  const navSeconds = telemetry?.navigationTime ?? 0
  const navDistance = telemetry?.navigationDistance ?? 0
  const distUnit = mph ? 'mi' : 'km'

  const displaySourceCity = resolveLocalizedCity(job?.sourceCity, labels, isZh)
  const displaySourceCompany = job?.special ? '' : resolveLocalizedCompany(job?.sourceCompany, isZh)
  const displayDestCity = resolveLocalizedCity(job?.destinationCity, labels, isZh)
  const displayDestCompany = job?.special ? '' : resolveLocalizedCompany(job?.destinationCompany, isZh)

  const nextBreakSubtitle = useMemo(() => {
    if (!telemetry) return '--'
    if (isLiveSession && route && routeStops.length > 0 && telemetry.navigationDistance > 0) {
      const stop = nextStop(
        routeStops,
        route.distances,
        routeNext,
        telemetry.navigationDistance,
        telemetry.navigationTime,
      )
      if (stop) {
        const stopMinutes = Math.ceil(stop.minutes)
        const stopEtaTime = formatDeadline(cabNow + stopMinutes, cabNow, text.days, clockStyle)
        return formatNextBreakLocation(text.freight.waybill.enRoute, stop.distance, stopEtaTime, mph, isZh)
      }
    }
    const targetCity = job?.active && displayDestCity !== '--' ? displayDestCity : text.freight.hos.restAreaFallback
    const defaultMeters = Math.min(67000, telemetry.navigationDistance > 0 ? telemetry.navigationDistance : 67000)
    const approxMinutes = Math.round((defaultMeters / 1000) * 1.2)
    const defaultEta = formatDeadline(cabNow + approxMinutes, cabNow, text.days, clockStyle)
    return formatNextBreakLocation(targetCity, defaultMeters, defaultEta, mph, isZh)
  }, [
    telemetry,
    isLiveSession,
    route,
    routeStops,
    routeNext,
    cabNow,
    text.days,
    text.freight.waybill.enRoute,
    text.freight.hos.restAreaFallback,
    clockStyle,
    mph,
    isZh,
    job?.active,
    displayDestCity,
  ])

  const hos = evaluateHos(telemetry?.nextRestStop, navSeconds, isZh)

  return (
    <section className="app-panel freight-app" aria-label={text.apps.freight}>
      {/* Floating iOS 26 / CarPlay Navigation Bar */}
      <header className="fr-bar">
        <div className="fr-bar-side">
          {truck && (
            <div className="fr-truck-chip glass" title={`${truck.brand} ${truck.name}`}>
              {isLiveSession && <i className="fr-live-dot" aria-hidden="true" />}
              <TruckLineGlyph size={18} />
              <span>{truck.brand}</span>
            </div>
          )}
        </div>

        <nav className="fr-tab-bar glass" role="tablist" aria-label={text.freight.title} onKeyDown={handleTabKeyDown}>
          {TABS.map((tab) => {
            const selected = activeTab === tab
            return (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[tab] = el
                }}
                id={tabId(tab)}
                type="button"
                role="tab"
                className="fr-tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab)}
              >
                {tabMeta[tab].icon}
                <span>{tabMeta[tab].label}</span>
              </button>
            )
          })}
        </nav>

        <div className="fr-bar-side end">
          {preview && (
            <span className="fr-preview-badge" aria-label={text.freight.waybill.previewBadge}>
              {text.freight.waybill.previewBadge}
            </span>
          )}
        </div>
      </header>

      {/* Scrollable Body beneath Floating Bar */}
      <div className="fr-scroll">
        <div
          key={activeTab}
          id={panelId(activeTab)}
          role="tabpanel"
          aria-labelledby={tabId(activeTab)}
          tabIndex={0}
          className="fr-panel"
        >
          {!telemetry ? (
            <div className="fr-empty">
              <div className="fr-empty-icon">
                <TruckLineGlyph size={42} />
              </div>
              <h1 className="fr-empty-title">{text.freight.waybill.noTelemetryTitle}</h1>
              <p className="fr-empty-desc">{text.freight.waybill.noTelemetryDesc}</p>
            </div>
          ) : (
            <>
              {activeTab === 'waybill' && (
                <WaybillPanel
                  job={job}
                  telemetry={telemetry}
                  mph={mph}
                  isZh={isZh}
                  distUnit={distUnit}
                  gameTime={gameTime}
                  cabNow={cabNow}
                  cabOffset={cabOffset}
                  navSeconds={navSeconds}
                  navDistance={navDistance}
                  trackedTripProgress={trackedTripProgress}
                  displaySourceCity={displaySourceCity}
                  displaySourceCompany={displaySourceCompany}
                  displayDestCity={displayDestCity}
                  displayDestCompany={displayDestCompany}
                  hosRestDueText={hos.restDueText}
                  needRestEnRoute={hos.needRestEnRoute}
                  nextBreakSubtitle={nextBreakSubtitle}
                  onOpenTab={(tab) => selectTab(tab)}
                />
              )}

              {activeTab === 'inspection' && (
                <InspectionPanel job={job} telemetry={telemetry} truck={truck} mph={mph} />
              )}

              {activeTab === 'hos' && (
                <HosPanel
                  job={job}
                  telemetry={telemetry}
                  hos={hos}
                  gameTime={gameTime}
                  cabNow={cabNow}
                  cabOffset={cabOffset}
                  navSeconds={navSeconds}
                  nextBreakSubtitle={nextBreakSubtitle}
                  isZh={isZh}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function WaybillPanel({
  job,
  telemetry,
  mph,
  isZh,
  distUnit,
  gameTime,
  cabNow,
  cabOffset,
  navSeconds,
  navDistance,
  trackedTripProgress,
  displaySourceCity,
  displaySourceCompany,
  displayDestCity,
  displayDestCompany,
  hosRestDueText,
  needRestEnRoute,
  nextBreakSubtitle,
  onOpenTab,
}: {
  job: ReturnType<typeof useLive.getState>['job']
  telemetry: NonNullable<ReturnType<typeof useLive.getState>['telemetry']>
  mph: boolean
  isZh: boolean
  distUnit: string
  gameTime: number
  cabNow: number
  cabOffset: number
  navSeconds: number
  navDistance: number
  trackedTripProgress: number
  displaySourceCity: string
  displaySourceCompany: string
  displayDestCity: string
  displayDestCompany: string
  hosRestDueText: string
  needRestEnRoute: boolean
  nextBreakSubtitle: string
  onOpenTab: (tab: FreightTab) => void
}) {
  const text = useText()
  const clockStyle = useClockStyle()

  if (!job?.active) {
    return (
      <div className="fr-empty">
        <div className="fr-empty-icon">
          <WaybillGlyph size={40} />
        </div>
        <h1 className="fr-empty-title">{text.freight.waybill.noJobTitle}</h1>
        <p className="fr-empty-desc">{text.freight.waybill.noJobDesc}</p>
        <div className="fr-empty-actions">
          <button type="button" className="fr-action-pill" onClick={() => onOpenTab('inspection')}>
            <InspectionGlyph size={20} />
            <span>{text.freight.waybill.openInspection}</span>
          </button>
          <button type="button" className="fr-action-pill" onClick={() => onOpenTab('hos')}>
            <HosGlyph size={20} />
            <span>{text.freight.waybill.openHos}</span>
          </button>
        </div>
      </div>
    )
  }

  const progress = calculateRouteProgress(job.plannedDistanceKm, navDistance, mph)
  const displayPercent = trackedTripProgress > 0 ? trackedTripProgress : progress.progressPercent
  const remainingDistKm = navDistance / 1000
  const remainingDistScale = mph ? 0.621371 : 1
  const remainingDistNum = Math.max(0, Math.round(remainingDistKm * remainingDistScale))
  const heroDistanceText = `${remainingDistNum.toLocaleString()} ${distUnit}`

  const buffer = evaluateBuffer(job.deliveryTime, gameTime, navSeconds, isZh)
  const cargoMassText = formatCargoMass(job.cargoMass, mph)
  const rawDamage = telemetry.cargoDamage ?? 0
  const damagePercent = Math.round(rawDamage * 100)
  const damagePercentText = `${damagePercent}%`
  const netIncome = calculateNetPayout(job.income, rawDamage)
  const rateText = calculateRate(job.income, job.plannedDistanceKm, mph)
  const rateUnit = mph ? '€/mi' : '€/km'
  const plannedDistanceText = progress.totalText

  const arrivalText = formatArrivalTime(cabNow, navSeconds, 0, text.days, clockStyle, isZh)
  const deadlineStr =
    job.deliveryTime > 0 ? formatDeadline(job.deliveryTime + cabOffset, cabNow, text.days, clockStyle) : '--'
  const bufferDurationText = formatDuration(Math.max(0, buffer.bufferMinutes), isZh)

  const statusPillClass = buffer.status === 'ample' ? 'good' : buffer.status === 'tight' ? 'warn' : 'bad'
  const statusLabel =
    buffer.status === 'ample'
      ? text.freight.waybill.timeAmple
      : buffer.status === 'tight'
        ? text.freight.waybill.timeTight
        : text.freight.waybill.timeLate

  const clampedPercent = Math.max(4, Math.min(100, displayPercent))

  return (
    <div className="fr-grid-2">
      {/* Left Card: Electronic Waybill & Earnings */}
      <article className="fr-card" data-tone="neutral">
        <header className="fr-card-head">
          <div className="fr-card-title-row">
            <span className="fr-tile blue" aria-hidden="true">
              <CargoBoxGlyph size={20} />
            </span>
            <h2 className="fr-card-title">{text.freight.tabs.waybill}</h2>
          </div>
          <span className={`fr-status-pill ${job.special ? 'warn' : job.cargoLoaded ? 'info' : 'neutral'}`}>
            {job.special
              ? text.freight.waybill.specialTransport
              : job.cargoLoaded
                ? text.freight.waybill.statusInTransit
                : text.freight.waybill.statusPickup}
          </span>
        </header>

        <div className="fr-route-stage">
          <div className="fr-route-pair">
            <div className="fr-city-block">
              <span className="fr-city-kicker">{text.pickup}</span>
              <div className="fr-city-name">{displaySourceCity}</div>
              {displaySourceCompany && <div className="fr-city-sub">{displaySourceCompany}</div>}
            </div>
            <div className="fr-route-connector" aria-hidden="true">
              <span className="fr-route-dot origin" />
              <span className="fr-route-line" />
              <RouteArrowGlyph size={18} />
              <span className="fr-route-dot dest" />
            </div>
            <div className="fr-city-block end">
              <span className="fr-city-kicker">{text.delivery}</span>
              <div className="fr-city-name">{displayDestCity}</div>
              {displayDestCompany && <div className="fr-city-sub">{displayDestCompany}</div>}
            </div>
          </div>

          <div className="fr-cargo-chip">
            <span className="fr-cargo-label">
              <CargoBoxGlyph size={17} />
              <span className="fr-cargo-name">{job.cargo || text.freight.waybill.cargoLabel}</span>
            </span>
            <span className="fr-cargo-mass">{cargoMassText}</span>
          </div>
        </div>

        <div className="fr-kv-plate">
          <dl className="fr-kv-list">
            <div className="fr-kv-row">
              <dt>{text.freight.waybill.payout}</dt>
              <dd>{job.income.toLocaleString()} €</dd>
            </div>
            <div className="fr-kv-row">
              <dt>{mph ? text.freight.waybill.ratePerMi : text.freight.waybill.ratePerKm}</dt>
              <dd>{rateText === '--' ? '--' : `${rateText} ${rateUnit}`}</dd>
            </div>
            <div className="fr-kv-row">
              <dt>{text.freight.waybill.plannedDistance}</dt>
              <dd>{plannedDistanceText}</dd>
            </div>
            <div className="fr-kv-row">
              <dt>{text.freight.waybill.cargoDamage}</dt>
              <dd className={rawDamage > 0.05 ? 'tone-bad' : rawDamage > 0 ? 'tone-warn' : ''}>{damagePercentText}</dd>
            </div>
            <div className="fr-kv-row featured">
              <dt className="fr-kv-strong">{text.freight.waybill.netPayout}</dt>
              <dd className={rawDamage > 0.05 ? 'tone-warn' : 'tone-good'}>{netIncome.toLocaleString()} €</dd>
            </div>
          </dl>
        </div>
      </article>

      {/* Right Card: Progress, Schedule & Next Break */}
      <article className="fr-card" data-tone={statusPillClass}>
        <header className="fr-card-head">
          <div className="fr-card-title-row">
            <span className="fr-tile cyan" aria-hidden="true">
              <ClockGlyph size={20} />
            </span>
            <h2 className="fr-card-title">{text.freight.waybill.progress}</h2>
          </div>
          <span className="fr-pct-badge">{displayPercent}%</span>
        </header>

        <div className="fr-hero-metric">
          <span className="fr-hero-value">{navDistance > 0 ? heroDistanceText : '--'}</span>
          <span className="fr-hero-caption">{text.freight.waybill.distanceLeft}</span>
        </div>

        <div className="fr-progress-shell">
          <div
            className="fr-progress-track"
            role="progressbar"
            aria-label={text.freight.waybill.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayPercent}
          >
            <div className="fr-progress-fill" style={{ width: `${clampedPercent}%` }} />
          </div>
          <span className="fr-progress-thumb" style={{ left: `${clampedPercent}%` }} aria-hidden="true" />
        </div>

        <div className="fr-progress-meta">
          <span>
            {text.freight.waybill.distanceCovered}: <strong>{progress.coveredText}</strong>
          </span>
          <span>
            {text.freight.waybill.plannedDistance}: <strong>{plannedDistanceText}</strong>
          </span>
        </div>

        <div className="fr-kv-plate">
          <dl className="fr-kv-list">
            <div className="fr-kv-row">
              <dt className="fr-kv-strong">{arrivalText}</dt>
              <dd>
                <span className={`fr-status-pill ${statusPillClass}`}>
                  {buffer.status === 'ample' && <CheckCircleGlyph size={14} />}
                  {buffer.status === 'tight' && <ClockGlyph size={14} />}
                  {buffer.status === 'late' && <AlertTriangleGlyph size={14} />}
                  <span>{statusLabel}</span>
                </span>
              </dd>
            </div>
            <div className="fr-kv-row">
              <dt>{text.freight.waybill.deadline}</dt>
              <dd>{deadlineStr}</dd>
            </div>
            <div className="fr-kv-row">
              <dt>{text.freight.waybill.bufferTime}</dt>
              <dd>{bufferDurationText}</dd>
            </div>
          </dl>
        </div>

        <div className={`fr-inset-card ${needRestEnRoute ? 'alert-border' : ''}`}>
          <div className="fr-inset-top">
            <div className="fr-card-title-row">
              <span className="fr-tile orange small" aria-hidden="true">
                <CoffeeCupGlyph size={16} />
              </span>
              <span className="fr-inset-title">{text.freight.waybill.nextBreak}</span>
            </div>
            <span className={`fr-inset-value ${needRestEnRoute ? 'tone-warn' : ''}`}>{hosRestDueText}</span>
          </div>
          <div className="fr-inset-sub">{nextBreakSubtitle}</div>
        </div>
      </article>
    </div>
  )
}

function InspectionPanel({
  job,
  telemetry,
  truck,
  mph,
}: {
  job: ReturnType<typeof useLive.getState>['job']
  telemetry: NonNullable<ReturnType<typeof useLive.getState>['telemetry']>
  truck: ReturnType<typeof useLive.getState>['truck']
  mph: boolean
}) {
  const text = useText()

  const truckWear = [
    evaluateWear(text.freight.inspection.engine, telemetry.wearEngine),
    evaluateWear(text.freight.inspection.transmission, telemetry.wearTransmission),
    evaluateWear(text.freight.inspection.cabin, telemetry.wearCabin),
    evaluateWear(text.freight.inspection.chassis, telemetry.wearChassis),
    evaluateWear(text.freight.inspection.wheels, telemetry.wearWheels),
  ]

  const coupled = isTrailerCoupled(telemetry, job)
  const trailerWear = coupled
    ? [
        evaluateWear(text.freight.inspection.body, telemetry.wearTrailerBody),
        evaluateWear(text.freight.inspection.chassis, telemetry.wearTrailerChassis),
        evaluateWear(text.freight.inspection.wheels, telemetry.wearTrailerWheels),
      ]
    : []

  const health = calculateOverallHealth(truckWear, trailerWear)
  const ratingMap = {
    excellent: { label: text.freight.inspection.healthExcellent, tone: 'good' as const },
    good: { label: text.freight.inspection.healthGood, tone: 'good' as const },
    fair: { label: text.freight.inspection.healthFair, tone: 'warn' as const },
    critical: { label: text.freight.inspection.healthCritical, tone: 'bad' as const },
  }
  const healthBadge = ratingMap[health.rating]

  const fuelFill = estimateFuelFillPercent(telemetry.fuel, telemetry.fuelRange)
  const lowFuel = isLowFuel(telemetry.fuelRange)

  const cargoDamage = telemetry.cargoDamage ?? 0
  const cargoDamagePct = `${(cargoDamage * 100).toFixed(1)}%`
  const deduction = job?.active ? job.income - calculateNetPayout(job.income, cargoDamage) : 0

  return (
    <div className="fr-grid-2">
      {/* Left Card: Overall Health, Fuel, Braking & Cargo Integrity */}
      <article className="fr-card" data-tone={healthBadge.tone}>
        <header className="fr-card-head">
          <div className="fr-card-title-row">
            <span className="fr-tile green" aria-hidden="true">
              <InspectionGlyph size={20} />
            </span>
            <div className="fr-card-heading-stack">
              <h2 className="fr-card-title">{text.freight.inspection.overallHealth}</h2>
              {truck && (
                <div className="fr-card-subtitle">
                  {truck.brand} {truck.name}
                </div>
              )}
            </div>
          </div>
          <span className={`fr-status-pill ${healthBadge.tone}`}>
            {healthBadge.tone === 'good' ? <CheckCircleGlyph size={14} /> : <AlertTriangleGlyph size={14} />}
            <span>{healthBadge.label}</span>
          </span>
        </header>

        <div className="fr-health-band">
          <div className="fr-health-ring-wrap">
            <progress
              value={health.score}
              max={100}
              aria-label={text.freight.inspection.overallHealth}
              aria-valuetext={`${health.score} / 100, ${healthBadge.label}`}
              className={`fr-health-ring tone-${healthBadge.tone}`}
              style={{ '--value': health.score } as CSSProperties}
            />
            <div className="fr-health-ring-center" aria-hidden="true">
              <span className="fr-health-score">{health.score}</span>
              <span className="fr-health-max">/ 100</span>
            </div>
          </div>

          <div className={`fr-fuel-card${lowFuel ? ' low' : ''}`}>
            <div className="fr-fuel-head">
              <span className="fr-fuel-title">
                <FuelGlyph size={17} />
                <span>{text.freight.inspection.fuelLevel}</span>
              </span>
              <span className={`fr-fuel-range${lowFuel ? ' tone-warn' : ''}`}>
                {formatFuelRange(telemetry.fuelRange, mph)}
              </span>
            </div>
            <div className="fr-fuel-amount">{formatFuel(telemetry.fuel, mph)}</div>
            <div className="fr-fuel-track" aria-hidden="true">
              <div className="fr-fuel-fill" style={{ width: `${fuelFill}%` }} />
            </div>
          </div>
        </div>

        <div className="fr-kv-plate">
          <dl className="fr-kv-list">
            <div className="fr-kv-row">
              <dt className="fr-kv-icon-label">
                <BrakeGlyph size={18} />
                <span>{text.freight.inspection.parkingBrake}</span>
              </dt>
              <dd className={telemetry.parkingBrake ? 'tone-warn' : ''}>
                {telemetry.parkingBrake ? text.freight.inspection.engaged : text.freight.inspection.released}
              </dd>
            </div>
            <div className="fr-kv-row">
              <dt>{text.freight.inspection.airPressure}</dt>
              <dd className={telemetry.brakeAirPressureWarning ? 'tone-bad' : ''}>
                {formatAirPressure(telemetry.brakeAirPressure, mph)}
                {telemetry.brakeAirPressureWarning ? ` · ${text.freight.inspection.airWarning}` : ''}
              </dd>
            </div>
          </dl>
        </div>

        <div className="fr-inset-card">
          <div className="fr-inset-top">
            <span className="fr-inset-title">{text.freight.inspection.cargoDamage}</span>
            {job?.active ? (
              <span className={`fr-status-pill ${cargoDamage > 0.02 ? 'bad' : 'good'}`}>
                {cargoDamage > 0.02 ? text.freight.inspection.damaged : text.freight.inspection.safe} · {cargoDamagePct}
              </span>
            ) : (
              <span className="fr-inset-sub-inline">{text.freight.inspection.noCargo}</span>
            )}
          </div>
          {job?.active && (
            <div className="fr-inset-sub">
              {text.freight.inspection.estimatedDeduction}: <strong>-{deduction.toLocaleString()} €</strong>
            </div>
          )}
        </div>
      </article>

      {/* Right Card: Tractor & Trailer Component Wear */}
      <article className="fr-card" data-tone="neutral">
        <header className="fr-card-head">
          <div className="fr-card-title-row">
            <h2 className="fr-card-title">{text.freight.inspection.truckWearTitle}</h2>
          </div>
          <span className={`fr-status-pill ${coupled ? 'info' : 'neutral'}`}>
            {coupled ? text.freight.inspection.trailerConnected : text.freight.inspection.trailerDetached}
          </span>
        </header>

        <div className="fr-wear-list">
          {truckWear.map((item) => (
            <WearMeterRow
              key={item.name}
              name={item.name}
              percentText={item.percentText}
              fraction={item.fraction}
              grade={item.grade}
            />
          ))}
        </div>

        {coupled && (
          <>
            <div className="fr-section-divider">{text.freight.inspection.trailerWearTitle}</div>
            <div className="fr-wear-list">
              {trailerWear.map((item) => (
                <WearMeterRow
                  key={`trailer-${item.name}`}
                  name={item.name}
                  percentText={item.percentText}
                  fraction={item.fraction}
                  grade={item.grade}
                />
              ))}
            </div>
          </>
        )}
      </article>
    </div>
  )
}

function WearMeterRow({
  name,
  percentText,
  fraction,
  grade,
}: {
  name: string
  percentText: string
  fraction: number
  grade: 'good' | 'warn' | 'bad'
}) {
  const fillPercent = Math.min(100, Math.max(0, Math.round(fraction * 100)))
  return (
    <div className={`fr-wear-row grade-${grade}`}>
      <div className="fr-wear-head">
        <span className="fr-wear-label">
          <span className={`fr-wear-dot grade-${grade}`} aria-hidden="true" />
          <span className="fr-wear-name">{name}</span>
        </span>
        <span className={`fr-wear-val grade-${grade}`}>{percentText}</span>
      </div>
      <div className="fr-wear-track" aria-hidden="true">
        <div
          className={`fr-wear-fill grade-${grade}`}
          style={{ width: `${Math.max(fillPercent > 0 ? 4 : 0, fillPercent)}%` }}
        />
      </div>
    </div>
  )
}

function HosPanel({
  job,
  telemetry,
  hos,
  gameTime,
  cabNow,
  cabOffset,
  navSeconds,
  nextBreakSubtitle,
  isZh,
}: {
  job: ReturnType<typeof useLive.getState>['job']
  telemetry: NonNullable<ReturnType<typeof useLive.getState>['telemetry']>
  hos: ReturnType<typeof evaluateHos>
  gameTime: number
  cabNow: number
  cabOffset: number
  navSeconds: number
  nextBreakSubtitle: string
  isZh: boolean
}) {
  const text = useText()
  const clockStyle = useClockStyle()

  const statusMap = {
    fresh: { label: text.freight.hos.statusFresh, tone: 'good' as const },
    normal: { label: text.freight.hos.statusNormal, tone: 'info' as const },
    tired: { label: text.freight.hos.statusTired, tone: 'bad' as const },
  }
  const hosBadge = statusMap[hos.level]

  const timeline =
    job?.active && job.deliveryTime > 0
      ? calculateJourneyTimeline(gameTime, navSeconds, telemetry.nextRestStop, job.deliveryTime)
      : null

  return (
    <div className="fr-grid-2">
      {/* Left Card: Digital Tachograph */}
      <article className="fr-card" data-tone={hosBadge.tone}>
        <header className="fr-card-head">
          <div className="fr-card-title-row">
            <span className="fr-tile blue" aria-hidden="true">
              <HosGlyph size={20} />
            </span>
            <h2 className="fr-card-title">{text.freight.hos.tachographTitle}</h2>
          </div>
          <span className={`fr-status-pill ${hosBadge.tone}`}>
            {hosBadge.tone === 'bad' ? <AlertTriangleGlyph size={14} /> : <CheckCircleGlyph size={14} />}
            <span>{hosBadge.label}</span>
          </span>
        </header>

        <div className="fr-tacho-wrap">
          <TachographRing
            fatiguePercent={hos.fatiguePercent}
            level={hos.level}
            restDueText={hos.restDueText}
            fatigueLabel={`${hos.fatiguePercent}% ${text.freight.hos.fatigueSuffix}`}
          />
        </div>

        <div className="fr-kv-plate">
          <dl className="fr-kv-list">
            <div className="fr-kv-row">
              <dt>{text.freight.hos.restDueIn}</dt>
              <dd>{hos.restDueText}</dd>
            </div>
            <div className="fr-kv-row">
              <dt>{text.freight.hos.fatigueRate}</dt>
              <dd>{hos.fatiguePercent}%</dd>
            </div>
          </dl>
        </div>
      </article>

      {/* Right Card: Smart Rest Advice & Journey Timeline */}
      <article className="fr-card" data-tone={hos.needRestEnRoute ? 'warn' : 'good'}>
        <header className="fr-card-head">
          <div className="fr-card-title-row">
            <span className="fr-tile orange" aria-hidden="true">
              <BedRestGlyph size={20} />
            </span>
            <h2 className="fr-card-title">{text.freight.hos.adviceTitle}</h2>
          </div>
        </header>

        <div className={`fr-advice-box ${hos.needRestEnRoute ? 'warn' : 'good'}`}>
          <div className="fr-advice-head">
            {hos.needRestEnRoute ? <AlertTriangleGlyph size={18} /> : <CheckCircleGlyph size={18} />}
            <span>{hos.needRestEnRoute ? text.freight.hos.restStop8h : text.freight.hos.nonStopCapable}</span>
          </div>
          <p className="fr-advice-text">
            {hos.needRestEnRoute ? text.freight.hos.adviceRestNeeded : text.freight.hos.adviceNonStop}
          </p>
        </div>

        {timeline ? (
          <div className="fr-timeline-block">
            <div className="fr-timeline-title-row">
              <span className="fr-timeline-title">{text.freight.hos.timelineTitle}</span>
              <span className={`fr-status-pill ${timeline.canDeliverAfterRest ? 'good' : 'warn'}`}>
                {timeline.canDeliverAfterRest ? text.freight.hos.restPunctual : text.freight.hos.restTightRisk}
              </span>
            </div>

            <div className="fr-timeline-bar" aria-hidden="true">
              <div className="fr-tl-seg drive" style={{ width: `${Math.round(timeline.navRatio * 100)}%` }} />
              <div className="fr-tl-seg rest" style={{ width: `${Math.round(timeline.restRatio * 100)}%` }} />
              <div className="fr-tl-seg buffer" style={{ width: `${Math.round(timeline.bufferRatio * 100)}%` }} />
            </div>

            <div className="fr-timeline-legend">
              <span className="fr-tl-legend-item">
                <i className="drive" aria-hidden="true" />
                {text.freight.hos.legendDrive}
              </span>
              <span className="fr-tl-legend-item">
                <i className="rest" aria-hidden="true" />
                {text.freight.hos.legendRest}
              </span>
              <span className="fr-tl-legend-item">
                <i className="buffer" aria-hidden="true" />
                {text.freight.hos.legendBuffer}
              </span>
            </div>

            <div className="fr-kv-plate">
              <dl className="fr-kv-list">
                <div className="fr-kv-row">
                  <dt>{text.freight.hos.timelineDirectArrival}</dt>
                  <dd>{formatDeadline(timeline.etaDirectMinutes + cabOffset, cabNow, text.days, clockStyle)}</dd>
                </div>
                <div className="fr-kv-row">
                  <dt>{text.freight.hos.timelineRestArrival}</dt>
                  <dd className={timeline.canDeliverAfterRest ? 'tone-good' : 'tone-warn'}>
                    {formatDeadline(timeline.etaWithRestMinutes + cabOffset, cabNow, text.days, clockStyle)}
                  </dd>
                </div>
                <div className="fr-kv-row">
                  <dt>{text.freight.hos.timelineDeadline}</dt>
                  <dd>{formatDeadline(job!.deliveryTime + cabOffset, cabNow, text.days, clockStyle)}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : (
          <p className="fr-hos-note">{text.freight.hos.simulationNote}</p>
        )}

        <div className="fr-inset-card">
          <div className="fr-inset-top">
            <div className="fr-card-title-row">
              <span className="fr-tile orange small" aria-hidden="true">
                <CoffeeCupGlyph size={16} />
              </span>
              <span className="fr-inset-title">{text.freight.waybill.nextBreak}</span>
            </div>
            <span className="fr-inset-value">{formatDuration(hos.restDueMinutes, isZh)}</span>
          </div>
          <div className="fr-inset-sub">{nextBreakSubtitle}</div>
        </div>
      </article>
    </div>
  )
}
