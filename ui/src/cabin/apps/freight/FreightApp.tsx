import { type CSSProperties, type KeyboardEvent, type ReactNode, useId, useMemo, useRef, useState } from 'react'
import { IS_DEMO, isInHost } from '../../../shared/host'
import { formatDeadline } from '../../dashboard/destination'
import { useTripProgress } from '../../dashboard/tripProgress'
import { useMapData } from '../../maps/mapData'
import { nextStop } from '../../maps/nextStop'
import { useClockStyle } from '../../state/hooks'
import { useLive } from '../../state/store'
import { useLanguage, useText } from '../../state/text'
import {
  createPreviewData,
  evaluateHos,
  formatNextBreakLocation,
  isPreviewMode,
  resolveBrandIdentity,
  resolveLocalizedCity,
  resolveLocalizedCompany,
} from './freight'
import { HosGlyph, InspectionGlyph, TruckLineGlyph, WaybillGlyph } from './glyphs'
import { HosView } from './HosView'
import { InspectionView } from './InspectionView'
import { type FreightTab, WaybillView } from './WaybillView'
import './freight.css'

const TABS: readonly FreightTab[] = ['waybill', 'inspection', 'hos']

/**
 * Precision Automotive Cockpit Freight Assistant (Porsche Cockpit / Scania Smart Dash aesthetic):
 * - Sleek floating machined-glass console bar with sliding segmented selector.
 * - Asymmetric single-viewport layouts for Waybill, CAD Vehicle Inspection, and 11h Digital Tachograph.
 * - Full Dark Obsidian / Light Brushed Aluminum appearance, `data-lite`, and `--text-scale` adaptation.
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
  const activeTabIndex = TABS.indexOf(activeTab)

  const tabMeta: Record<FreightTab, { label: string; icon: ReactNode }> = {
    waybill: { label: text.freight.tabs.waybill, icon: <WaybillGlyph size={17} /> },
    inspection: { label: text.freight.tabs.inspection, icon: <InspectionGlyph size={17} /> },
    hos: { label: text.freight.tabs.hos, icon: <HosGlyph size={17} /> },
  }

  // Shared derived job/route metrics
  const gameTime = telemetry?.gameTime ?? 0
  const cabNow = gameTime + (telemetry?.multiplayerTimeOffset ?? 0) + clockShift
  const cabOffset = cabNow - gameTime
  const navSeconds = telemetry?.navigationTime ?? 0
  const navDistance = telemetry?.navigationDistance ?? 0
  const distUnit = mph ? 'mi' : 'km'
  const speedValue = telemetry ? Math.round(Math.abs(telemetry.speed) * (mph ? 2.23694 : 3.6)) : 0
  const speedUnit = mph ? 'mph' : 'km/h'

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
  const brandIdentity = truck ? resolveBrandIdentity(truck.brandId, truck.brand) : null

  return (
    <section className="app-panel freight-app" aria-label={text.apps.freight}>
      {/* Sleek Floating Precision Console Bar */}
      <header className="fr-bar">
        <div className="fr-bar-side">
          {truck && brandIdentity && (
            <div
              className={`fr-brand-plate${truck.name ? '' : ' single-line'}`}
              data-brand={brandIdentity.key}
              style={
                {
                  '--brand-accent-dark': brandIdentity.accentDark,
                  '--brand-accent-light': brandIdentity.accentLight,
                } as CSSProperties
              }
              title={`${truck.brand} ${truck.name}`.trim()}
            >
              <span className="fr-brand-blade" aria-hidden="true" />
              <div className="fr-brand-text">
                <span className="fr-brand-wordmark">{brandIdentity.wordmark}</span>
                {truck.name && <span className="fr-brand-model">{truck.name}</span>}
              </div>
              <span className="fr-brand-status" aria-hidden="true">
                <i className={`fr-live-dot${isLiveSession ? ' live' : ''}`} />
              </span>
            </div>
          )}
        </div>

        <nav
          className="fr-tab-bar"
          role="tablist"
          aria-label={text.freight.title}
          style={{ '--active-index': activeTabIndex } as CSSProperties}
          onKeyDown={handleTabKeyDown}
        >
          <span className="fr-tab-slider" aria-hidden="true" />
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
          {preview ? (
            <span className="fr-preview-badge" aria-label={text.freight.waybill.previewBadge}>
              <i className="fr-preview-dot" aria-hidden="true" />
              <span>{text.freight.waybill.previewBadge}</span>
            </span>
          ) : telemetry ? (
            <div className="fr-speed-chip" aria-label={`${speedValue} ${speedUnit}`}>
              <strong>{speedValue}</strong>
              <span>{speedUnit}</span>
            </div>
          ) : null}
        </div>
      </header>

      {/* Main Cockpit Canvas */}
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
              <div className="fr-empty-bezel">
                <TruckLineGlyph size={36} />
              </div>
              <h1 className="fr-empty-title">{text.freight.waybill.noTelemetryTitle}</h1>
              <p className="fr-empty-desc">{text.freight.waybill.noTelemetryDesc}</p>
            </div>
          ) : (
            <>
              {activeTab === 'waybill' && (
                <WaybillView
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
                  hosAdviceStatus={hos.adviceStatus}
                  nextBreakSubtitle={nextBreakSubtitle}
                  onOpenTab={(tab) => selectTab(tab)}
                />
              )}

              {activeTab === 'inspection' && (
                <InspectionView job={job} telemetry={telemetry} truck={truck} mph={mph} />
              )}

              {activeTab === 'hos' && (
                <HosView
                  job={job}
                  telemetry={telemetry}
                  hos={hos}
                  gameTime={gameTime}
                  cabNow={cabNow}
                  cabOffset={cabOffset}
                  navSeconds={navSeconds}
                  nextBreakSubtitle={nextBreakSubtitle}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
