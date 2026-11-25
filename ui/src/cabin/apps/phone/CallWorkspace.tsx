import { useEffect, useMemo, useState } from 'react'
import {
  cabClock,
  type CompanySnapshot,
  type GameActionKind,
  type JobInfo,
  type Telemetry,
  type TruckInfo,
} from '../../../shared/host'
import type { MapLabel } from '../../maps/mapData'
import type { Destination } from '../../maps/places'
import type { QuickStopCategory, RouteGeometryLike } from '../../maps/quickStop'
import { type ActiveCall, triggerGameAction, usePhone } from '../../state/phone'
import { formatDistance, formatMoney, type LogbookEntry } from '../../state/simulation'
import { go } from '../../state/store'
import type { Strings } from '../../state/strings'
import { evaluateBuffer, formatDuration, resolveLocalizedCity } from '../freight/freight'
import {
  ContactAvatarGlyph,
  ExternalMenuGlyph,
  FuelDropGlyph,
  HangUpGlyph,
  HazardGlyph,
  MapPinGlyph,
  RoadGlyph,
  WrenchGlyph,
} from './glyphs'
import {
  formatActionAnswer,
  formatCallDuration,
  formatTruckModelName,
  type PhoneFeedback,
  roadsideDiagnosticLine,
  type RouteContext,
  routeNearestStopWithFeedback,
  routePlaceWithFeedback,
  summarizeLast7DaysCashflow,
} from './phoneLogic'
import { PhoneCaptionCard, PhoneFeedbackBar } from './shared'

interface CallWorkspaceProps {
  call: ActiveCall
  company: CompanySnapshot | null
  telemetry: Telemetry | null
  rawTelemetry: Telemetry | null
  job: JobInfo | null
  truck: TruckInfo | null
  logbook: readonly LogbookEntry[]
  places: readonly Destination[] | null | undefined
  labels: readonly MapLabel[] | undefined
  route: RouteGeometryLike | null
  routeNext: number
  clockShift: number
  mph: boolean
  isZh: boolean
  usingPreview: boolean
  strings: Strings
}

const DIAL_CONNECT_MS = 1350

export function CallWorkspace({
  call,
  company,
  telemetry,
  rawTelemetry,
  job,
  truck,
  logbook,
  places,
  labels,
  route,
  routeNext,
  clockShift,
  mph,
  isZh,
  usingPreview,
  strings,
}: CallWorkspaceProps) {
  const autoConfirm = usePhone((s) => s.autoConfirmRoadside)
  const setAutoConfirm = usePhone((s) => s.setAutoConfirmRoadside)
  const markConnected = usePhone((s) => s.markConnected)
  const setCallResultNote = usePhone((s) => s.setCallResultNote)
  const endCall = usePhone((s) => s.endCall)

  const [clockTick, setClockTick] = useState(0)
  const [feedback, setFeedback] = useState<PhoneFeedback | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  // Automatic dialing -> connected transition (pure visual, no audio).
  useEffect(() => {
    if (call.phase !== 'dialing') return
    const timer = setTimeout(() => {
      markConnected(Date.now())
    }, DIAL_CONNECT_MS)
    return () => clearTimeout(timer)
  }, [call.id, call.phase, markConnected])

  // Live call duration counter while connected.
  useEffect(() => {
    if (call.phase !== 'connected' || call.connectedAtMs === null) return
    const base = call.connectedAtMs
    const timer = setInterval(() => {
      setClockTick(Math.max(0, Math.floor((Date.now() - base) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [call.phase, call.connectedAtMs])

  const elapsedSec = call.phase === 'connected' && call.connectedAtMs !== null ? clockTick : 0

  const currentCabTime = telemetry ? cabClock(telemetry, clockShift) : null
  const todayGameDay = currentCabTime !== null ? Math.floor(currentCabTime / 1440) : null
  const cashflow = useMemo(() => summarizeLast7DaysCashflow(logbook, todayGameDay), [logbook, todayGameDay])

  const routeCtx: RouteContext = {
    places,
    labels,
    rawTelemetry,
    route,
    routeNext,
    job,
    mph,
    isZh,
    usingPreview,
    strings,
  }

  const runGameAction = async (
    action: GameActionKind,
    label: string,
    useAutoConfirm = false,
    isRoadsideChoice = false,
  ) => {
    setBusyAction(action)
    setFeedback({ status: 'loading', text: strings.phone.feedback.sending })
    if (usingPreview && !rawTelemetry) {
      setCallResultNote(label)
      setFeedback({ status: 'ok', text: `${strings.phone.feedback.previewSimulated} · ${label}` })
      setBusyAction(null)
      return
    }
    const answer = await triggerGameAction(action, useAutoConfirm)
    setBusyAction(null)
    if (answer === 'done') {
      setCallResultNote(label)
      setFeedback({
        status: 'ok',
        text: isRoadsideChoice
          ? useAutoConfirm
            ? strings.phone.roadside.triggered(label)
            : strings.phone.roadside.triggeredConfirmHint(label)
          : `${strings.phone.feedback.done} · ${label}`,
      })
    } else {
      setFeedback({ status: 'error', text: formatActionAnswer(answer, strings) })
    }
  }

  const handleRouteResult = (key: string, work: () => Promise<PhoneFeedback>) => {
    setBusyAction(key)
    setFeedback({ status: 'loading', text: strings.phone.feedback.sending })
    void work().then((res) => {
      setBusyAction(null)
      if (res.status === 'ok' && res.placeName) setCallResultNote(res.placeName)
      setFeedback(res)
    })
  }

  const routeToNearestStop = (category: QuickStopCategory) =>
    handleRouteResult(`stop-${category}`, () => routeNearestStopWithFeedback(category, routeCtx))

  const routeToPlaceKind = (kind: 'dealer' | 'garage', cityId?: string) =>
    handleRouteResult(`place-${kind}`, () => routePlaceWithFeedback(kind, routeCtx, cityId))

  const { contact } = call
  const brand = truck?.brand?.trim() || ''

  if (call.phase === 'dialing') {
    return (
      <div className={`phone-call-stage dialing tone-${contact.kind}`}>
        <div className="phone-call-dial-center">
          <div className={`phone-pulse-wrap tone-${contact.kind}`}>
            <span className="phone-pulse-ring r1" aria-hidden="true" />
            <span className="phone-pulse-ring r2" aria-hidden="true" />
            <span className={`phone-avatar xl tone-${contact.kind}`}>
              <ContactAvatarGlyph kind={contact.kind} size={42} />
            </span>
          </div>
          <h2 className="phone-dial-name">{contact.name}</h2>
          <p className="phone-dial-sub">{contact.subtitle}</p>
          <div className="phone-dial-status">{strings.phone.call.dialing}</div>
          <p className="phone-dial-caption">{strings.phone.call.connectingNote}</p>
          <p className="phone-mute-note">{strings.phone.call.muteNote}</p>
        </div>

        <footer className="phone-call-footer centered">
          <button
            type="button"
            className="phone-hangup-btn large"
            aria-label={strings.phone.call.hangUp}
            onClick={() => endCall()}
          >
            <HangUpGlyph size={24} />
            <span>{strings.phone.call.hangUp}</span>
          </button>
        </footer>
      </div>
    )
  }

  return (
    <div className={`phone-call-stage connected tone-${contact.kind}`}>
      <header className="phone-call-bar glass">
        <div className="phone-call-bar-left">
          <span className={`phone-avatar md tone-${contact.kind}`}>
            <ContactAvatarGlyph kind={contact.kind} size={22} />
          </span>
          <div className="phone-call-meta">
            <h2 className="phone-call-name">{contact.name}</h2>
            <div className="phone-call-sub">{contact.subtitle}</div>
          </div>
        </div>
        <div className="phone-call-bar-right">
          <span className="phone-live-timer">
            <span className="phone-live-dot" aria-hidden="true" />
            <span>{strings.phone.call.connected}</span>
            <span className="phone-timer-num">{formatCallDuration(elapsedSec)}</span>
          </span>
          <button type="button" className="phone-hangup-btn" onClick={() => endCall()}>
            <HangUpGlyph size={18} />
            <span>{strings.phone.call.hangUp}</span>
          </button>
        </div>
      </header>

      <div className="phone-call-body">
        {feedback && <PhoneFeedbackBar feedback={feedback} strings={strings} />}

        {contact.kind === 'roadside' && (
          <RoadsidePanel
            brand={brand}
            telemetry={telemetry}
            mph={mph}
            suggestedAction={call.suggestedAction}
            autoConfirm={autoConfirm}
            onToggleAutoConfirm={setAutoConfirm}
            busyAction={busyAction}
            onTrigger={runGameAction}
            onRouteService={() => routeToNearestStop('service')}
            strings={strings}
          />
        )}

        {contact.kind === 'bank' && (
          <BankPanel
            company={company}
            cashflow={cashflow}
            mph={mph}
            busyAction={busyAction}
            onOpenGameMenu={() => void runGameAction('openGameDesktop', strings.phone.bank.openGameMenu)}
            strings={strings}
          />
        )}

        {contact.kind === 'usedTrucks' && (
          <UsedTrucksPanel
            company={company}
            currentCabTime={currentCabTime}
            mph={mph}
            isZh={isZh}
            busyAction={busyAction}
            onRouteDealer={() => routeToPlaceKind('dealer')}
            onOpenGameMenu={() => void runGameAction('openGameDesktop', strings.phone.usedTrucks.openGameMenu)}
            strings={strings}
          />
        )}

        {contact.kind === 'garage' && (
          <GaragePanel
            contact={contact}
            company={company}
            busyAction={busyAction}
            onRouteGarage={() => routeToPlaceKind('garage', contact.metaId)}
            onOpenGarageManager={() =>
              void runGameAction('openGarageManager', strings.phone.company.openGarageManager)
            }
            strings={strings}
          />
        )}

        {contact.kind === 'driver' && (
          <DriverPanel contact={contact} company={company} labels={labels} isZh={isZh} mph={mph} strings={strings} />
        )}

        {(contact.kind === 'shipper' || contact.kind === 'receiver') && (
          <TripCompanyPanel
            contact={contact}
            job={job}
            telemetry={telemetry}
            isZh={isZh}
            busyAction={busyAction}
            onOpenFreight={() => go({ type: 'openApp', app: 'freight' })}
            onAddRestStop={() => routeToNearestStop('rest')}
            strings={strings}
          />
        )}
      </div>

      <div className="phone-call-caption-hint">{strings.phone.call.muteNote}</div>
    </div>
  )
}

function RoadsidePanel({
  brand,
  telemetry,
  mph,
  suggestedAction,
  autoConfirm,
  onToggleAutoConfirm,
  busyAction,
  onTrigger,
  onRouteService,
  strings,
}: {
  brand: string
  telemetry: Telemetry | null
  mph: boolean
  suggestedAction?: ActiveCall['suggestedAction']
  autoConfirm: boolean
  onToggleAutoConfirm: (on: boolean) => void
  busyAction: string | null
  onTrigger: (action: GameActionKind, label: string, autoConfirm: boolean, isRoadsideChoice: boolean) => Promise<void>
  onRouteService: () => void
  strings: Strings
}) {
  const diagLine = roadsideDiagnosticLine(telemetry, mph, strings)
  const fuelPlenty = telemetry !== null && telemetry.fuelRange > 150

  const services = [
    {
      action: 'roadsideTowToService' as const,
      tone: 'tow',
      title: strings.phone.roadside.towToService,
      desc: strings.phone.roadside.towToServiceDesc,
      icon: <WrenchGlyph size={24} />,
      note: null,
    },
    {
      action: 'roadsideTowToRoad' as const,
      tone: 'road',
      title: strings.phone.roadside.towToRoad,
      desc: strings.phone.roadside.towToRoadDesc,
      icon: <RoadGlyph size={24} />,
      note: null,
    },
    {
      action: 'roadsideEmergencyRefuel' as const,
      tone: 'fuel',
      title: strings.phone.roadside.emergencyRefuel,
      desc: strings.phone.roadside.emergencyRefuelDesc,
      icon: <FuelDropGlyph size={24} />,
      note: fuelPlenty ? strings.phone.roadside.refuelFuelPlentyNote : null,
    },
  ]

  return (
    <div className="phone-workspace-stack">
      <PhoneCaptionCard diag={diagLine}>{strings.phone.roadside.greeting(brand)}</PhoneCaptionCard>

      <div className="phone-section-bar">
        <span className="phone-section-label">{strings.phone.roadside.askService}</span>
        <button
          type="button"
          className={`phone-toggle-chip${autoConfirm ? ' active' : ''}`}
          aria-pressed={autoConfirm}
          title={strings.phone.call.autoConfirmHint}
          onClick={() => onToggleAutoConfirm(!autoConfirm)}
        >
          <span className="phone-toggle-dot" aria-hidden="true" />
          <span>{strings.phone.call.autoConfirm}</span>
        </button>
      </div>

      <div className="phone-roadside-grid">
        {services.map((svc) => (
          <button
            key={svc.action}
            type="button"
            className={`phone-service-card tone-${svc.tone}${suggestedAction === svc.action ? ' suggested' : ''}`}
            disabled={busyAction !== null}
            onClick={() => void onTrigger(svc.action, svc.title, autoConfirm, true)}
          >
            <span className="phone-service-icon">{svc.icon}</span>
            <span className="phone-service-title">{svc.title}</span>
            <span className="phone-service-desc">{svc.desc}</span>
            {svc.note && <span className="phone-service-note">{svc.note}</span>}
          </button>
        ))}
      </div>

      <div className="phone-helper-row">
        <button type="button" className="phone-helper-btn" disabled={busyAction !== null} onClick={onRouteService}>
          <MapPinGlyph size={16} />
          <span>{strings.phone.roadside.navService}</span>
        </button>
        <button
          type="button"
          className="phone-helper-btn"
          disabled={busyAction !== null}
          onClick={() => void onTrigger('toggleHazardLights', strings.phone.roadside.toggleHazards, false, false)}
        >
          <HazardGlyph size={16} />
          <span>{strings.phone.roadside.toggleHazards}</span>
        </button>
        <button
          type="button"
          className="phone-helper-btn"
          disabled={busyAction !== null}
          onClick={() => void onTrigger('openAssistanceMenu', strings.phone.roadside.openF7Menu, false, false)}
        >
          <ExternalMenuGlyph size={16} />
          <span>{strings.phone.roadside.openF7Menu}</span>
        </button>
      </div>
    </div>
  )
}

function BankPanel({
  company,
  cashflow,
  mph,
  busyAction,
  onOpenGameMenu,
  strings,
}: {
  company: CompanySnapshot | null
  cashflow: { income: number; expense: number; net: number }
  mph: boolean
  busyAction: string | null
  onOpenGameMenu: () => void
  strings: Strings
}) {
  const companyLabel = company?.companyName || company?.playerName || strings.phone.defaults.bankName
  const loans = company?.bank.loans ?? []

  return (
    <div className="phone-workspace-stack">
      <PhoneCaptionCard>{strings.phone.bank.greeting(companyLabel)}</PhoneCaptionCard>

      {!company ? (
        <div className="phone-empty-card">{strings.phone.bank.noSaveData}</div>
      ) : (
        <div className="phone-bank-grid">
          <div className="phone-metric-card hero">
            <span className="phone-metric-label">{strings.phone.bank.balanceLabel}</span>
            <span className="phone-metric-value">{formatMoney(company.bank.moneyAccount, mph)}</span>
            <div className="phone-cashflow-strip">
              <div className="phone-cf-item">
                <span>{strings.phone.bank.cashflowIncome}</span>
                <strong className="pos">+{formatMoney(cashflow.income, mph)}</strong>
              </div>
              <div className="phone-cf-item">
                <span>{strings.phone.bank.cashflowExpense}</span>
                <strong className="neg">-{formatMoney(cashflow.expense, mph)}</strong>
              </div>
              <div className="phone-cf-item">
                <span>{strings.phone.bank.cashflowNet}</span>
                <strong>{formatMoney(cashflow.net, mph)}</strong>
              </div>
            </div>
          </div>

          <div className="phone-loans-card">
            <div className="phone-card-heading">{strings.phone.bank.loansHeading}</div>
            {loans.length === 0 ? (
              <p className="phone-muted-line">{strings.phone.bank.noLoans}</p>
            ) : (
              <div className="phone-loan-list">
                {loans.map((loan, i) => (
                  <div key={`${loan.originalAmount}-${i}`} className="phone-loan-row">
                    <div className="phone-loan-main">
                      <strong>{formatMoney(loan.amount, mph)}</strong>
                      <span>
                        {strings.phone.bank.loanOriginal} {formatMoney(loan.originalAmount, mph)}
                      </span>
                    </div>
                    <div className="phone-loan-meta">
                      <span>
                        {strings.phone.bank.loanDaily} {formatMoney(loan.dailyRepayment, mph)}
                      </span>
                      <span>
                        {strings.phone.bank.loanDaysLeft(loan.remainingDays)} ·{' '}
                        {strings.phone.bank.loanRate(`${Math.round(loan.interestRate * 100)}%`)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="phone-helper-row">
        <button
          type="button"
          className="phone-helper-btn primary"
          disabled={busyAction !== null}
          onClick={onOpenGameMenu}
        >
          <ExternalMenuGlyph size={16} />
          <span>{strings.phone.bank.openGameMenu}</span>
        </button>
      </div>
    </div>
  )
}

function UsedTrucksPanel({
  company,
  currentCabTime,
  mph,
  isZh,
  busyAction,
  onRouteDealer,
  onOpenGameMenu,
  strings,
}: {
  company: CompanySnapshot | null
  currentCabTime: number | null
  mph: boolean
  isZh: boolean
  busyAction: string | null
  onRouteDealer: () => void
  onOpenGameMenu: () => void
  strings: Strings
}) {
  const offers = company?.usedTrucks ?? []

  return (
    <div className="phone-workspace-stack">
      <PhoneCaptionCard>
        {offers.length > 0 ? strings.phone.usedTrucks.greeting(offers.length) : strings.phone.usedTrucks.emptyGreeting}
      </PhoneCaptionCard>

      {offers.length === 0 ? (
        <div className="phone-empty-card">
          <strong>{strings.phone.usedTrucks.emptyTitle}</strong>
          <p>{strings.phone.usedTrucks.emptyDesc}</p>
        </div>
      ) : (
        <div className="phone-used-grid">
          {offers.map((offer) => {
            const wearPct = Math.round(offer.wear * 100)
            const condTone = wearPct < 15 ? 'good' : wearPct < 30 ? 'fair' : 'rough'
            const condLabel =
              condTone === 'good'
                ? strings.phone.usedTrucks.conditionGood
                : condTone === 'fair'
                  ? strings.phone.usedTrucks.conditionFair
                  : strings.phone.usedTrucks.conditionRough
            const remainingMin =
              offer.expirationTime && currentCabTime !== null ? offer.expirationTime - currentCabTime : null
            return (
              <article key={offer.id} className="phone-used-card">
                <div className="phone-used-top">
                  <strong className="phone-used-model">{formatTruckModelName(offer.model)}</strong>
                  <span className="phone-used-price">{formatMoney(offer.price, mph)}</span>
                </div>
                <div className="phone-used-meta">
                  <span>{strings.phone.usedTrucks.odometer(formatDistance(offer.odometerKm, mph))}</span>
                  <span>{strings.phone.usedTrucks.wear(`${wearPct}%`)}</span>
                </div>
                <div className="phone-used-badges">
                  <span className={`phone-cond-pill ${condTone}`}>{condLabel}</span>
                  {remainingMin !== null && remainingMin > 0 && (
                    <span className="phone-exp-pill">
                      {strings.phone.usedTrucks.expiresIn(formatDuration(remainingMin, isZh))}
                    </span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="phone-helper-row">
        <button
          type="button"
          className="phone-helper-btn primary"
          disabled={busyAction !== null}
          onClick={onRouteDealer}
        >
          <MapPinGlyph size={16} />
          <span>{strings.phone.usedTrucks.navDealer}</span>
        </button>
        <button type="button" className="phone-helper-btn" disabled={busyAction !== null} onClick={onOpenGameMenu}>
          <ExternalMenuGlyph size={16} />
          <span>{strings.phone.usedTrucks.openGameMenu}</span>
        </button>
      </div>
    </div>
  )
}

function GaragePanel({
  contact,
  company,
  busyAction,
  onRouteGarage,
  onOpenGarageManager,
  strings,
}: {
  contact: ActiveCall['contact']
  company: CompanySnapshot | null
  busyAction: string | null
  onRouteGarage: () => void
  onOpenGarageManager: () => void
  strings: Strings
}) {
  const detail = company?.garages.find((g) => g.cityId === contact.metaId)
  const vehicles = detail?.vehicleCount ?? 0
  const drivers = detail?.driverCount ?? 0

  return (
    <div className="phone-workspace-stack">
      <PhoneCaptionCard>{strings.phone.company.garageGreeting(contact.name, vehicles, drivers)}</PhoneCaptionCard>
      <div className="phone-helper-row">
        <button
          type="button"
          className="phone-helper-btn primary"
          disabled={busyAction !== null}
          onClick={onRouteGarage}
        >
          <MapPinGlyph size={16} />
          <span>{strings.phone.company.navGarage}</span>
        </button>
        <button
          type="button"
          className="phone-helper-btn"
          disabled={busyAction !== null}
          onClick={onOpenGarageManager}
        >
          <ExternalMenuGlyph size={16} />
          <span>{strings.phone.company.openGarageManager}</span>
        </button>
      </div>
    </div>
  )
}

function DriverPanel({
  contact,
  company,
  labels,
  isZh,
  mph,
  strings,
}: {
  contact: ActiveCall['contact']
  company: CompanySnapshot | null
  labels: readonly MapLabel[] | undefined
  isZh: boolean
  mph: boolean
  strings: Strings
}) {
  const driver = company?.drivers.find((d) => d.id === contact.metaId)
  const curCity = resolveLocalizedCity(driver?.currentCity || driver?.garageCity || '', labels, isZh)
  const garageCity = resolveLocalizedCity(driver?.garageCity || '', labels, isZh)
  const working = driver?.state === 2 || driver?.state === 3

  return (
    <div className="phone-workspace-stack">
      <PhoneCaptionCard>
        {working
          ? strings.phone.company.driverGreetingWorking(contact.name, curCity, garageCity)
          : strings.phone.company.driverGreetingIdle(contact.name, curCity)}
      </PhoneCaptionCard>
      {driver && (
        <div className="phone-stat-pills">
          <span className="phone-stat-pill">{strings.phone.company.driverSkillLevel(driver.skillPoints)}</span>
          {typeof driver.lastProfit === 'number' && (
            <span className="phone-stat-pill">
              {strings.phone.company.driverLastProfit(formatMoney(driver.lastProfit, mph))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function TripCompanyPanel({
  contact,
  job,
  telemetry,
  isZh,
  busyAction,
  onOpenFreight,
  onAddRestStop,
  strings,
}: {
  contact: ActiveCall['contact']
  job: JobInfo | null
  telemetry: Telemetry | null
  isZh: boolean
  busyAction: string | null
  onOpenFreight: () => void
  onAddRestStop: () => void
  strings: Strings
}) {
  const cargo = job?.cargo || strings.freight.waybill.cargoLabel
  const damagePct = Math.round((telemetry?.cargoDamage ?? 0) * 100)
  const bufferText =
    job && telemetry && job.deliveryTime > 0 && telemetry.gameTime > 0
      ? evaluateBuffer(job.deliveryTime, telemetry.gameTime, telemetry.navigationTime, isZh).remainingText
      : '—'

  return (
    <div className="phone-workspace-stack">
      <PhoneCaptionCard>
        {contact.kind === 'shipper'
          ? strings.phone.company.shipperGreeting(contact.name, cargo, Boolean(job?.cargoLoaded))
          : strings.phone.company.receiverGreeting(contact.name, cargo, bufferText, damagePct)}
      </PhoneCaptionCard>
      <div className="phone-helper-row">
        <button type="button" className="phone-helper-btn primary" onClick={onOpenFreight}>
          <ExternalMenuGlyph size={16} />
          <span>{strings.phone.company.openFreight}</span>
        </button>
        <button type="button" className="phone-helper-btn" disabled={busyAction !== null} onClick={onAddRestStop}>
          <MapPinGlyph size={16} />
          <span>{strings.phone.company.planRest}</span>
        </button>
      </div>
    </div>
  )
}
