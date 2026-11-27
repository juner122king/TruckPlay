import { formatDeadline } from '../../dashboard/destination'
import { useClockStyle } from '../../state/hooks'
import type { useLive } from '../../state/store'
import { useText } from '../../state/text'
import {
  type HosAdviceStatus,
  HOS_BREAK_TONES,
  calculateNetPayout,
  calculateOverallHealth,
  calculateRate,
  calculateRouteProgress,
  evaluateBuffer,
  evaluateWear,
  formatArrivalTime,
  formatCargoMass,
  formatCurrency,
  formatDuration,
  formatFuelRange,
  splitValueUnit,
} from './freight'
import {
  AlertTriangleGlyph,
  CargoBoxGlyph,
  CheckCircleGlyph,
  ClockGlyph,
  CoffeeCupGlyph,
  HosGlyph,
  InspectionGlyph,
  WaybillGlyph,
} from './glyphs'

export type FreightTab = 'waybill' | 'inspection' | 'hos'

interface WaybillViewProps {
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
  hosAdviceStatus: HosAdviceStatus
  nextBreakSubtitle: string
  onOpenTab: (tab: FreightTab) => void
}

export function WaybillView({
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
  hosAdviceStatus,
  nextBreakSubtitle,
  onOpenTab,
}: WaybillViewProps) {
  const text = useText()
  const clockStyle = useClockStyle()

  if (!job?.active) {
    const truckHealth = calculateOverallHealth(
      [
        evaluateWear(text.freight.inspection.engine, telemetry.wearEngine),
        evaluateWear(text.freight.inspection.transmission, telemetry.wearTransmission),
        evaluateWear(text.freight.inspection.cabin, telemetry.wearCabin),
        evaluateWear(text.freight.inspection.chassis, telemetry.wearChassis),
        evaluateWear(text.freight.inspection.wheels, telemetry.wearWheels),
      ],
      [],
    )
    const rangeText = formatFuelRange(telemetry.fuelRange, mph)

    return (
      <div className="fr-empty">
        <div className="fr-empty-bezel">
          <WaybillGlyph size={34} />
        </div>
        <h1 className="fr-empty-title">{text.freight.waybill.noJobTitle}</h1>
        <p className="fr-empty-desc">{text.freight.waybill.noJobDesc}</p>

        {/* Vehicle standby readiness readout strip */}
        <div className="fr-standby-strip">
          <div className="fr-standby-item">
            <span className="fr-standby-label">{text.freight.inspection.fuelRange}</span>
            <strong className="fr-standby-val">{rangeText}</strong>
          </div>
          <span className="fr-standby-sep" aria-hidden="true" />
          <div className="fr-standby-item">
            <span className="fr-standby-label">{text.freight.inspection.overallHealth}</span>
            <strong className="fr-standby-val">{truckHealth.score} / 100</strong>
          </div>
          <span className="fr-standby-sep" aria-hidden="true" />
          <div className="fr-standby-item">
            <span className="fr-standby-label">{text.freight.hos.restDueIn}</span>
            <strong className="fr-standby-val">{hosRestDueText}</strong>
          </div>
        </div>

        <div className="fr-empty-actions">
          <button type="button" className="fr-action-pill" onClick={() => onOpenTab('inspection')}>
            <InspectionGlyph size={18} />
            <span>{text.freight.waybill.openInspection}</span>
          </button>
          <button type="button" className="fr-action-pill" onClick={() => onOpenTab('hos')}>
            <HosGlyph size={18} />
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
  const heroDistParts = navDistance > 0 ? { value: remainingDistNum.toLocaleString(), unit: distUnit } : { value: '--', unit: '' }

  const buffer = evaluateBuffer(job.deliveryTime, gameTime, navSeconds, isZh)
  const cargoMassText = formatCargoMass(job.cargoMass, mph)
  const rawDamage = telemetry.cargoDamage ?? 0
  const damagePercent = Math.round(rawDamage * 100)
  const damagePercentText = `${damagePercent}%`
  const netIncome = calculateNetPayout(job.income, rawDamage)
  const netIncomeParts = splitValueUnit(formatCurrency(netIncome, mph))
  const grossPayoutText = formatCurrency(job.income, mph)
  const rateText = calculateRate(job.income, job.plannedDistanceKm, mph)
  const rateUnit = mph ? '$/mi' : '€/km'
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

  const clampedPercent = Math.max(3, Math.min(100, displayPercent))
  const bufferBarPercent = Math.round(Math.max(0, Math.min(1, buffer.bufferRatio)) * 100)
  const driveBarPercent = Math.max(8, 100 - bufferBarPercent)
  const breakTone = HOS_BREAK_TONES[hosAdviceStatus]

  return (
    <div className="fr-waybill-layout">
      {/* Top Full-Width Corridor Hero Stage */}
      <article className="fr-module fr-corridor-hero" data-tone="info">
        <header className="fr-corridor-top">
          <div className="fr-corridor-cargo">
            <span className={`fr-status-pill ${job.special ? 'warn' : job.cargoLoaded ? 'info' : 'neutral'}`}>
              {job.special
                ? text.freight.waybill.specialTransport
                : job.cargoLoaded
                  ? text.freight.waybill.statusInTransit
                  : text.freight.waybill.statusPickup}
            </span>
            <span className="fr-cargo-inline">
              <CargoBoxGlyph size={15} />
              <span className="fr-cargo-title">{job.cargo || text.freight.waybill.cargoLabel}</span>
              <span className="fr-cargo-dot" aria-hidden="true">
                ·
              </span>
              <span className="fr-cargo-weight">{cargoMassText}</span>
            </span>
          </div>

          <div className="fr-corridor-pct">
            <span className="fr-kicker">{text.freight.waybill.progress}</span>
            <span className="fr-pct-readout">{displayPercent}%</span>
          </div>
        </header>

        <div className="fr-corridor-body">
          <div className="fr-corridor-route">
            <div className="fr-city-node">
              <span className="fr-city-kicker">{text.pickup}</span>
              <div className="fr-city-name">{displaySourceCity}</div>
              {displaySourceCompany && <div className="fr-city-sub">{displaySourceCompany}</div>}
            </div>

            <div className="fr-corridor-track-col">
              <div className="fr-track-shell">
                <span className="fr-track-anchor origin" aria-hidden="true" />
                <div
                  className="fr-track-rail"
                  role="progressbar"
                  aria-label={text.freight.waybill.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={displayPercent}
                >
                  <div className="fr-track-ticks" aria-hidden="true" />
                  <div className="fr-track-fill" style={{ width: `${clampedPercent}%` }} />
                </div>
                <span className="fr-track-marker" style={{ left: `${clampedPercent}%` }} aria-hidden="true" />
                <span className="fr-track-anchor dest" aria-hidden="true" />
              </div>

              <div className="fr-track-caption">
                <span>
                  {text.freight.waybill.distanceCovered} <strong>{progress.coveredText}</strong>
                </span>
                <span>
                  {text.freight.waybill.plannedDistance} <strong>{plannedDistanceText}</strong>
                </span>
              </div>
            </div>

            <div className="fr-city-node end">
              <span className="fr-city-kicker">{text.delivery}</span>
              <div className="fr-city-name">{displayDestCity}</div>
              {displayDestCompany && <div className="fr-city-sub">{displayDestCompany}</div>}
            </div>
          </div>

          <div className="fr-corridor-divider" aria-hidden="true" />

          <div className="fr-hero-distance">
            <span className="fr-kicker">{text.freight.waybill.distanceLeft}</span>
            <div className="fr-metric-pair hero">
              <span className="fr-metric-val">{heroDistParts.value}</span>
              {heroDistParts.unit && <span className="fr-metric-unit">{heroDistParts.unit}</span>}
            </div>
          </div>
        </div>
      </article>

      {/* Bottom Asymmetric Instrument Deck */}
      <div className="fr-waybill-deck">
        {/* Left Instrument: Delivery Schedule & Next Break */}
        <article className="fr-module fr-schedule-card" data-tone={statusPillClass}>
          <header className="fr-mod-head">
            <div className="fr-mod-heading">
              <ClockGlyph size={16} />
              <h2 className="fr-mod-title">{arrivalText}</h2>
            </div>
            <span className={`fr-status-pill ${statusPillClass}`}>
              {buffer.status === 'ample' && <CheckCircleGlyph size={13} />}
              {buffer.status === 'tight' && <ClockGlyph size={13} />}
              {buffer.status === 'late' && <AlertTriangleGlyph size={13} />}
              <span>{statusLabel}</span>
            </span>
          </header>

          <div className="fr-margin-console">
            <div className="fr-margin-head">
              <span className="fr-kicker">{text.freight.waybill.remainingTime}</span>
              <strong className="fr-margin-countdown">{buffer.remainingText}</strong>
            </div>
            <div className="fr-margin-bar" aria-hidden="true">
              <div className="fr-margin-drive" style={{ width: `${driveBarPercent}%` }} />
              {bufferBarPercent > 0 && (
                <div className={`fr-margin-buf ${statusPillClass}`} style={{ width: `${bufferBarPercent}%` }} />
              )}
            </div>
          </div>

          <div className="fr-metric-grid cols-2">
            <div className="fr-cell">
              <span className="fr-cell-label">{text.freight.waybill.deadline}</span>
              <strong className="fr-cell-val">{deadlineStr}</strong>
            </div>
            <div className="fr-cell">
              <span className="fr-cell-label">{text.freight.waybill.bufferTime}</span>
              <strong className={`fr-cell-val${statusPillClass !== 'good' ? ` tone-${statusPillClass}` : ''}`}>
                {bufferDurationText}
              </strong>
            </div>
          </div>

          <div className={`fr-break-strip tone-${breakTone}`}>
            <div className="fr-break-top">
              <span className="fr-break-label">
                <CoffeeCupGlyph size={15} />
                <span>{text.freight.waybill.nextBreak}</span>
              </span>
              <span className={`fr-break-time${breakTone !== 'neutral' ? ` tone-${breakTone}` : ''}`}>
                {hosRestDueText}
              </span>
            </div>
            <div className="fr-break-sub">{nextBreakSubtitle}</div>
          </div>
        </article>

        {/* Right Instrument: Financial Settlement */}
        <article className="fr-module fr-finance-card" data-tone="neutral">
          <header className="fr-mod-head">
            <div className="fr-mod-heading">
              <WaybillGlyph size={16} />
              <h2 className="fr-mod-title">{text.freight.waybill.netPayout}</h2>
            </div>
            <div className={`fr-metric-pair payout${rawDamage > 0.05 ? ' tone-warn' : ' tone-good'}`}>
              {mph && netIncomeParts.unit === '$' && <span className="fr-metric-unit prefix">$</span>}
              <span className="fr-metric-val">{netIncomeParts.value}</span>
              {!mph && netIncomeParts.unit && <span className="fr-metric-unit">{netIncomeParts.unit}</span>}
            </div>
          </header>

          <div className="fr-metric-grid cols-2 dense">
            <div className="fr-cell">
              <span className="fr-cell-label">{text.freight.waybill.payout}</span>
              <strong className="fr-cell-val">{grossPayoutText}</strong>
            </div>
            <div className="fr-cell">
              <span className="fr-cell-label">
                {mph ? text.freight.waybill.ratePerMi : text.freight.waybill.ratePerKm}
              </span>
              <strong className="fr-cell-val">{rateText === '--' ? '--' : `${rateText} ${rateUnit}`}</strong>
            </div>
            <div className="fr-cell">
              <span className="fr-cell-label">{text.freight.waybill.plannedDistance}</span>
              <strong className="fr-cell-val">{plannedDistanceText}</strong>
            </div>
            <div className="fr-cell">
              <span className="fr-cell-label">{text.freight.waybill.cargoDamage}</span>
              <strong className={`fr-cell-val${rawDamage > 0.05 ? ' tone-bad' : rawDamage > 0 ? ' tone-warn' : ''}`}>
                {damagePercentText}
              </strong>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
