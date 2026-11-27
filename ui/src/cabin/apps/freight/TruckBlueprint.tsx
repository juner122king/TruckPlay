import type { KeyboardEvent } from 'react'
import type { ComponentWear, WearGrade, WearPartId } from './freight'

export interface BlueprintPart extends ComponentWear {
  id: WearPartId
  group: 'truck' | 'trailer'
}

interface TruckBlueprintProps {
  parts: ReadonlyMap<WearPartId, BlueprintPart>
  coupled: boolean
  selectedPart: WearPartId | null
  onSelectPart: (part: WearPartId | null) => void
  interactiveTip: string
  normalLabel: string
  warningLabel: string
  criticalLabel: string
}

/**
 * Minimalist CAD wireframe side-elevation schematic of a flagship European/American tractor
 * and optional coupled semi-trailer. Every subsystem reflects live telemetry wear grade
 * and supports pointer + keyboard selection synchronized with the wear telemetry matrix.
 */
export function TruckBlueprint({
  parts,
  coupled,
  selectedPart,
  onSelectPart,
  interactiveTip,
  normalLabel,
  warningLabel,
  criticalLabel,
}: TruckBlueprintProps) {
  const gradeOf = (id: WearPartId): WearGrade => parts.get(id)?.grade ?? 'good'
  const partOf = (id: WearPartId): BlueprintPart | undefined => parts.get(id)

  const togglePart = (id: WearPartId) => {
    onSelectPart(selectedPart === id ? null : id)
  }

  const handleKey = (id: WearPartId) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      togglePart(id)
    } else if (event.key === 'Escape' && selectedPart) {
      event.preventDefault()
      onSelectPart(null)
    }
  }

  const partProps = (id: WearPartId) => {
    const info = partOf(id)
    const grade = gradeOf(id)
    const active = selectedPart === id
    return {
      role: 'button' as const,
      tabIndex: 0,
      'aria-pressed': active,
      'aria-label': info ? `${info.name} ${info.percentText}` : id,
      className: `fr-cad-part grade-${grade}${active ? ' selected' : ''}`,
      onClick: () => togglePart(id),
      onKeyDown: handleKey(id),
    }
  }

  const activeInfo = selectedPart ? partOf(selectedPart) : null
  const activeGradeLabel = activeInfo
    ? activeInfo.grade === 'good'
      ? normalLabel
      : activeInfo.grade === 'warn'
        ? warningLabel
        : criticalLabel
    : ''

  // In solo mode, re-frame viewBox tightly around the tractor so it occupies the CAD stage proudly.
  const viewBox = coupled ? '0 0 540 176' : '0 0 264 176'
  const tractorOffset = coupled ? 0 : 28

  return (
    <div className="fr-cad-stage">
      <div className="fr-cad-viewport">
        <svg viewBox={viewBox} className="fr-cad-svg" preserveAspectRatio="xMidYMid meet">
          {/* Technical blueprint datum grid & ground baseline */}
          <g className="fr-cad-grid" aria-hidden="true">
            <line x1="12" y1="32" x2={coupled ? 528 : 252} y2="32" />
            <line x1="12" y1="74" x2={coupled ? 528 : 252} y2="74" />
            <line x1="12" y1="116" x2={coupled ? 528 : 252} y2="116" />
            <line x1="12" y1="153" x2={coupled ? 528 : 252} y2="153" className="fr-cad-ground" />
            {(coupled ? [66, 158, 250, 342, 438] : [64, 132, 200]).map((x) => (
              <line key={x} x1={x} y1="149" x2={x} y2="157" className="fr-cad-datum-tick" />
            ))}
          </g>

          {/* Tractor Assembly */}
          <g transform={`translate(${tractorOffset} 0)`}>
            {/* 1. Tractor Chassis Frame + Fifth Wheel */}
            <g {...partProps('chassis')}>
              <rect x="28" y="114" width="160" height="26" fill="transparent" stroke="none" />
              {/* Main structural ladder rail */}
              <path
                className="fr-cad-fill"
                d="M34 123 H180 V131 H174 L170 134 H44 L34 130 Z"
              />
              <path
                className="fr-cad-stroke"
                d="M34 123 H180 V131 H174 L170 134 H44 L34 130 Z"
              />
              {/* Side fuel tank bay */}
              <rect x="88" y="123" width="46" height="11" rx="2.5" className="fr-cad-stroke thin" />
              {/* Fifth wheel coupling saddle */}
              <path d="M148 123 L154 117 H168 L174 123" className="fr-cad-stroke" />
              <line x1="48" y1="127" x2="176" y2="127" className="fr-cad-detail" />
              <circle cx="111" cy="128" r="2.8" className="fr-cad-node" />
            </g>

            {/* 2. Tractor Cabin Shell */}
            <g {...partProps('cabin')}>
              <rect x="30" y="28" width="96" height="94" fill="transparent" stroke="none" />
              {/* Aerodynamic high-roof cab silhouette */}
              <path
                className="fr-cad-fill"
                d="M34 121 V78 L42 42 Q45 34 55 34 H114 Q122 34 122 42 V121 Z"
              />
              <path
                className="fr-cad-stroke"
                d="M34 121 V78 L42 42 Q45 34 55 34 H114 Q122 34 122 42 V121 Z"
              />
              {/* Roof aero deflector */}
              <path d="M84 34 Q106 25 122 25 V38" className="fr-cad-stroke thin" />
              {/* Slanted windshield & side window */}
              <path d="M44 74 L50 45 H76 V74 Z" className="fr-cad-detail" />
              <path d="M82 45 H112 V74 H82 Z" className="fr-cad-detail" />
              {/* Front grille louvers */}
              <line x1="38" y1="86" x2="54" y2="86" className="fr-cad-detail" />
              <line x1="38" y1="93" x2="54" y2="93" className="fr-cad-detail" />
              <line x1="38" y1="100" x2="54" y2="100" className="fr-cad-detail" />
              {/* Door seam */}
              <line x1="78" y1="45" x2="78" y2="118" className="fr-cad-detail" />
              <circle cx="96" cy="59" r="3" className="fr-cad-node" />
            </g>

            {/* 3. Engine Powerplant (Internal Cutaway) */}
            <g {...partProps('engine')}>
              <rect x="46" y="86" width="44" height="36" fill="transparent" stroke="none" />
              <rect x="52" y="92" width="32" height="24" rx="4" className="fr-cad-fill strong" />
              <rect x="52" y="92" width="32" height="24" rx="4" className="fr-cad-stroke" />
              {/* Cylinder head & cooling fins */}
              <line x1="58" y1="98" x2="78" y2="98" className="fr-cad-detail" />
              <line x1="58" y1="104" x2="78" y2="104" className="fr-cad-detail" />
              <line x1="58" y1="110" x2="78" y2="110" className="fr-cad-detail" />
              <circle cx="68" cy="104" r="3.2" className="fr-cad-node" />
            </g>

            {/* 4. Transmission & Driveline */}
            <g {...partProps('transmission')}>
              <rect x="86" y="98" width="60" height="26" fill="transparent" stroke="none" />
              <path className="fr-cad-fill strong" d="M88 103 H116 L122 108 V116 L116 120 H88 Z" />
              <path className="fr-cad-stroke" d="M88 103 H116 L122 108 V116 L116 120 H88 Z" />
              {/* Propshaft to rear drive axle */}
              <line x1="122" y1="112" x2="152" y2="112" className="fr-cad-stroke thin" strokeDasharray="3 2" />
              <circle cx="102" cy="111.5" r="3" className="fr-cad-node" />
            </g>

            {/* 5. Tractor Wheels (Steer + Drive Axles) */}
            <g {...partProps('wheels')}>
              {[65, 158].map((cx) => (
                <g key={cx}>
                  <circle cx={cx} cy="138" r="20" fill="transparent" stroke="none" />
                  <circle cx={cx} cy="138" r="18" className="fr-cad-wheel-halo" />
                  <circle cx={cx} cy="138" r="14.5" className="fr-cad-wheel-outer" />
                  <circle cx={cx} cy="138" r="8.2" className="fr-cad-wheel-rim" />
                  <circle cx={cx} cy="138" r="2.8" className="fr-cad-node" />
                </g>
              ))}
            </g>
          </g>

          {/* Semi-Trailer Assembly (shown when coupled) */}
          {coupled && (
            <g>
              {/* 6. Trailer Body */}
              <g {...partProps('trailerBody')}>
                <rect x="150" y="20" width="366" height="98" fill="transparent" stroke="none" />
                <path
                  className="fr-cad-fill"
                  d="M154 27 Q154 23 158 23 H506 Q510 23 510 27 V114 H154 Z"
                />
                <path
                  className="fr-cad-stroke"
                  d="M154 27 Q154 23 158 23 H506 Q510 23 510 27 V114 H154 Z"
                />
                {/* Vertical structural panel ribs */}
                {[214, 274, 334, 394, 454].map((x) => (
                  <line key={x} x1={x} y1="26" x2={x} y2="112" className="fr-cad-detail" />
                ))}
                {/* Upper longitudinal aerodynamic rib */}
                <line x1="158" y1="36" x2="506" y2="36" className="fr-cad-detail" />
                <line x1="158" y1="104" x2="506" y2="104" className="fr-cad-detail" />
                {/* Rear door seal */}
                <line x1="502" y1="26" x2="502" y2="112" className="fr-cad-detail" />
                <circle cx="334" cy="68" r="3.4" className="fr-cad-node" />
              </g>

              {/* 7. Trailer Chassis & Underrun */}
              <g {...partProps('trailerChassis')}>
                <rect x="156" y="114" width="356" height="22" fill="transparent" stroke="none" />
                <path className="fr-cad-fill" d="M160 115 H508 V124 H378 L372 128 H222 L214 122 H160 Z" />
                <path className="fr-cad-stroke" d="M160 115 H508 V124 H378 L372 128 H222 L214 122 H160 Z" />
                {/* Landing gear legs */}
                <line x1="234" y1="128" x2="234" y2="144" className="fr-cad-stroke thin" />
                <line x1="229" y1="144" x2="239" y2="144" className="fr-cad-stroke thin" />
                {/* Side pallet box / aerodynamic skirt */}
                <rect x="254" y="118" width="104" height="10" rx="2" className="fr-cad-detail" />
                <circle cx="306" cy="123" r="2.8" className="fr-cad-node" />
              </g>

              {/* 8. Trailer Tri-Axle Wheel Bogie */}
              <g {...partProps('trailerWheels')}>
                {[404, 439, 474].map((cx) => (
                  <g key={cx}>
                    <circle cx={cx} cy="138.5" r="18" fill="transparent" stroke="none" />
                    <circle cx={cx} cy="138.5" r="17.2" className="fr-cad-wheel-halo" />
                    <circle cx={cx} cy="138.5" r="14" className="fr-cad-wheel-outer" />
                    <circle cx={cx} cy="138.5" r="7.8" className="fr-cad-wheel-rim" />
                    <circle cx={cx} cy="138.5" r="2.6" className="fr-cad-node" />
                  </g>
                ))}
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* Synchronized precision readout footer */}
      <div className="fr-cad-bar">
        {activeInfo ? (
          <div className="fr-cad-readout">
            <span className={`fr-wear-dot grade-${activeInfo.grade}`} aria-hidden="true" />
            <span className="fr-cad-readout-name">{activeInfo.name}</span>
            <span className={`fr-cad-readout-val grade-${activeInfo.grade}`}>{activeInfo.percentText}</span>
            <span className={`fr-status-pill compact ${activeInfo.grade}`}>{activeGradeLabel}</span>
          </div>
        ) : (
          <span className="fr-cad-tip">{interactiveTip}</span>
        )}
      </div>
    </div>
  )
}
