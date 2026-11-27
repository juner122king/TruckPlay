import { useState } from 'react'
import type { useLive } from '../../state/store'
import { useText } from '../../state/text'
import {
  type WearPartId,
  calculateNetPayout,
  calculateOverallHealth,
  estimateFuelFillPercent,
  evaluateWear,
  formatAirPressure,
  formatCurrency,
  formatFuel,
  formatFuelRange,
  isLowFuel,
  isTrailerCoupled,
  splitValueUnit,
} from './freight'
import {
  AlertTriangleGlyph,
  BrakeGlyph,
  CheckCircleGlyph,
  FuelGlyph,
  HealthArcGauge,
} from './glyphs'
import { type BlueprintPart, TruckBlueprint } from './TruckBlueprint'

interface InspectionViewProps {
  job: ReturnType<typeof useLive.getState>['job']
  telemetry: NonNullable<ReturnType<typeof useLive.getState>['telemetry']>
  truck: ReturnType<typeof useLive.getState>['truck']
  mph: boolean
}

export function InspectionView({ job, telemetry, truck, mph }: InspectionViewProps) {
  const text = useText()
  const [selectedPart, setSelectedPart] = useState<WearPartId | null>(null)

  const coupled = isTrailerCoupled(telemetry, job)

  const truckWear: BlueprintPart[] = [
    { id: 'engine', group: 'truck', ...evaluateWear(text.freight.inspection.engine, telemetry.wearEngine) },
    {
      id: 'transmission',
      group: 'truck',
      ...evaluateWear(text.freight.inspection.transmission, telemetry.wearTransmission),
    },
    { id: 'cabin', group: 'truck', ...evaluateWear(text.freight.inspection.cabin, telemetry.wearCabin) },
    { id: 'chassis', group: 'truck', ...evaluateWear(text.freight.inspection.chassis, telemetry.wearChassis) },
    { id: 'wheels', group: 'truck', ...evaluateWear(text.freight.inspection.wheels, telemetry.wearWheels) },
  ]

  const trailerWear: BlueprintPart[] = coupled
    ? [
        {
          id: 'trailerBody',
          group: 'trailer',
          ...evaluateWear(text.freight.inspection.body, telemetry.wearTrailerBody),
        },
        {
          id: 'trailerChassis',
          group: 'trailer',
          ...evaluateWear(text.freight.inspection.chassis, telemetry.wearTrailerChassis),
        },
        {
          id: 'trailerWheels',
          group: 'trailer',
          ...evaluateWear(text.freight.inspection.wheels, telemetry.wearTrailerWheels),
        },
      ]
    : []

  const partsMap = new Map<WearPartId, BlueprintPart>()
  for (const item of truckWear) partsMap.set(item.id, item)
  for (const item of trailerWear) partsMap.set(item.id, item)

  // Clear trailer selection cleanly if trailer becomes detached
  const activePart = selectedPart && partsMap.has(selectedPart) ? selectedPart : null

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
  const fuelParts = splitValueUnit(formatFuel(telemetry.fuel, mph))
  const airParts = splitValueUnit(formatAirPressure(telemetry.brakeAirPressure, mph))

  const cargoDamage = telemetry.cargoDamage ?? 0
  const cargoDamagePct = `${(cargoDamage * 100).toFixed(1)}%`
  const deduction = job?.active ? job.income - calculateNetPayout(job.income, cargoDamage) : 0

  const togglePart = (id: WearPartId) => {
    setSelectedPart((current) => (current === id ? null : id))
  }

  return (
    <div className="fr-inspect-layout">
      {/* Left Primary Cockpit: Health Gauge + Interactive CAD Blueprint + Fuel & Pneumatics */}
      <article className="fr-module fr-inspect-primary" data-tone={healthBadge.tone}>
        <header className="fr-inspect-head">
          <div className="fr-inspect-hero">
            <HealthArcGauge
              score={health.score}
              tone={healthBadge.tone}
              label={text.freight.inspection.overallHealth}
              valueText={`${health.score} / 100, ${healthBadge.label}`}
            />
            <div className="fr-inspect-meta">
              <div className="fr-inspect-title-row">
                <h2 className="fr-mod-title">{text.freight.inspection.overallHealth}</h2>
                <span className={`fr-status-pill compact ${healthBadge.tone}`}>
                  {healthBadge.tone === 'good' ? <CheckCircleGlyph size={12} /> : <AlertTriangleGlyph size={12} />}
                  <span>{healthBadge.label}</span>
                </span>
              </div>
              {truck && (
                <div className="fr-inspect-truck-name">
                  {truck.brand} {truck.name}
                </div>
              )}
            </div>
          </div>

          <span className={`fr-status-pill ${coupled ? 'info' : 'neutral'}`}>
            {coupled ? text.freight.inspection.trailerConnected : text.freight.inspection.trailerDetached}
          </span>
        </header>

        {/* Interactive Minimalist CAD Wireframe Vehicle Blueprint */}
        <TruckBlueprint
          parts={partsMap}
          coupled={coupled}
          selectedPart={activePart}
          onSelectPart={setSelectedPart}
          interactiveTip={text.freight.inspection.interactiveTip}
          normalLabel={text.freight.inspection.normal}
          warningLabel={text.freight.inspection.warning}
          criticalLabel={text.freight.inspection.healthCritical}
        />

        {/* Bottom Dual Instrument Strip: Fuel & Braking Pneumatics */}
        <div className="fr-telemetry-strip">
          <div className={`fr-inst-cell${lowFuel ? ' tone-warn-box' : ''}`}>
            <div className="fr-inst-top">
              <span className="fr-inst-label">
                <FuelGlyph size={15} />
                <span>{text.freight.inspection.fuelLevel}</span>
              </span>
              <span className={`fr-inst-sub${lowFuel ? ' tone-warn' : ''}`}>
                {formatFuelRange(telemetry.fuelRange, mph)}
              </span>
            </div>
            <div className="fr-metric-pair compact">
              <span className="fr-metric-val">{fuelParts.value}</span>
              {fuelParts.unit && <span className="fr-metric-unit">{fuelParts.unit}</span>}
            </div>
            <div className="fr-bar-track" aria-hidden="true">
              <div className={`fr-bar-fill${lowFuel ? ' warn' : ' fuel'}`} style={{ width: `${fuelFill}%` }} />
            </div>
          </div>

          <div className={`fr-inst-cell${telemetry.brakeAirPressureWarning ? ' tone-bad-box' : ''}`}>
            <div className="fr-inst-top">
              <span className="fr-inst-label">
                <BrakeGlyph size={15} />
                <span>{text.freight.inspection.airPressure}</span>
              </span>
              {telemetry.brakeAirPressureWarning ? (
                <span className="fr-status-pill compact bad">
                  <AlertTriangleGlyph size={11} />
                  <span>{text.freight.inspection.airWarning}</span>
                </span>
              ) : (
                <span className="fr-inst-sub">{text.freight.inspection.normal}</span>
              )}
            </div>
            <div className="fr-inst-pneumatic-row">
              <div className={`fr-metric-pair compact${telemetry.brakeAirPressureWarning ? ' tone-bad' : ''}`}>
                <span className="fr-metric-val">{airParts.value}</span>
                {airParts.unit && <span className="fr-metric-unit">{airParts.unit}</span>}
              </div>
              <div className="fr-brake-badge">
                <span className="fr-brake-badge-label">{text.freight.inspection.parkingBrake}</span>
                <span className={`fr-status-pill compact ${telemetry.parkingBrake ? 'warn' : 'neutral'}`}>
                  {telemetry.parkingBrake ? text.freight.inspection.engaged : text.freight.inspection.released}
                </span>
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* Right Column: Synchronized Subsystem Wear Matrix + Cargo Integrity */}
      <article className="fr-module fr-inspect-matrix" data-tone="neutral">
        <header className="fr-mod-head">
          <h2 className="fr-mod-title">{text.freight.inspection.truckWearTitle}</h2>
          <span className="fr-kicker">{health.maxWearPercent} MAX</span>
        </header>

        <div className="fr-wear-groups">
          <div className="fr-wear-list">
            {truckWear.map((item) => (
              <WearMeterRow
                key={item.id}
                item={item}
                selected={activePart === item.id}
                onToggle={() => togglePart(item.id)}
              />
            ))}
          </div>

          {coupled && (
            <div className="fr-wear-subblock">
              <div className="fr-section-divider">{text.freight.inspection.trailerWearTitle}</div>
              <div className="fr-wear-list">
                {trailerWear.map((item) => (
                  <WearMeterRow
                    key={item.id}
                    item={item}
                    selected={activePart === item.id}
                    onToggle={() => togglePart(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="fr-cargo-integrity">
          <div className="fr-cargo-integrity-top">
            <span className="fr-cell-label">{text.freight.inspection.cargoDamage}</span>
            {job?.active ? (
              <span className={`fr-status-pill compact ${cargoDamage > 0.02 ? 'bad' : 'good'}`}>
                {cargoDamage > 0.02 ? text.freight.inspection.damaged : text.freight.inspection.safe} · {cargoDamagePct}
              </span>
            ) : (
              <span className="fr-kicker">{text.freight.inspection.noCargo}</span>
            )}
          </div>
          {job?.active && (
            <div className="fr-cargo-integrity-sub">
              <span>{text.freight.inspection.estimatedDeduction}</span>
              <strong className={deduction > 0 ? 'tone-warn' : ''}>
                {deduction > 0 ? formatCurrency(-deduction, mph) : formatCurrency(0, mph)}
              </strong>
            </div>
          )}
        </div>
      </article>
    </div>
  )
}

function WearMeterRow({
  item,
  selected,
  onToggle,
}: {
  item: BlueprintPart
  selected: boolean
  onToggle: () => void
}) {
  const fillPercent = Math.min(100, Math.max(0, Math.round(item.fraction * 100)))
  return (
    <button
      type="button"
      className={`fr-wear-row grade-${item.grade}${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <div className="fr-wear-head">
        <span className="fr-wear-label">
          <span className={`fr-wear-dot grade-${item.grade}`} aria-hidden="true" />
          <span className="fr-wear-name">{item.name}</span>
        </span>
        <span className={`fr-wear-val grade-${item.grade}`}>{item.percentText}</span>
      </div>
      <div className="fr-wear-track" aria-hidden="true">
        <div
          className={`fr-wear-fill grade-${item.grade}`}
          style={{ width: `${Math.max(fillPercent > 0 ? 4 : 0, fillPercent)}%` }}
        />
      </div>
    </button>
  )
}
