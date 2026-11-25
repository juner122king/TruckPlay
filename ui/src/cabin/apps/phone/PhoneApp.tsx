import { useEffect, useMemo, useState } from 'react'
import { cabClock, IS_DEMO, isInHost } from '../../../shared/host'
import { useMapData } from '../../maps/mapData'
import { usePlaces } from '../../maps/places'
import { useClockStyle } from '../../state/hooks'
import {
  countMissedCalls,
  createPreviewCompany,
  createPreviewRecents,
  type PhoneContact,
  type PhoneTab,
  usePhone,
} from '../../state/phone'
import { createPreviewSimulation, useSimulation } from '../../state/simulation'
import { useLive } from '../../state/store'
import { useText } from '../../state/text'
import { createPreviewData, isPreviewMode } from '../freight/freight'
import { formatMessageTime } from '../messages/messages'
import { CallWorkspace } from './CallWorkspace'
import {
  BackspaceGlyph,
  ClockGlyph,
  ContactAvatarGlyph,
  DriverGlyph,
  KeypadGlyph,
  PhoneGlyph,
  StarGlyph,
} from './glyphs'
import {
  buildCompanyContacts,
  buildDefaultContacts,
  buildTripContacts,
  formatCallDuration,
  type PhoneFeedback,
  resolveDialCode,
  type RouteContext,
  routeNearestStopWithFeedback,
  routePlaceWithFeedback,
} from './phoneLogic'
import { PhoneFeedbackBar } from './shared'
import './phone.css'

const KEYPAD_KEYS: readonly { digit: string; sub: string }[] = [
  { digit: '1', sub: '⛽' },
  { digit: '2', sub: '🛏' },
  { digit: '3', sub: '🔧' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '' },
  { digit: '0', sub: 'HQ' },
  { digit: '#', sub: '' },
]

/**
 * CarPlay Phone App (iOS 26 Liquid Glass, purely visual + live captions, zero audio disruption):
 * - Default hotlines: Roadside Service (Tow to Service / Tow to Road / Emergency Refuel), Bank, Used Trucks.
 * - Live savegame Company directory: owned garages & hired AI drivers, plus active trip shipper/receiver.
 * - Recents with missed-call badges and Keypad with built-in service & GPS shortcodes.
 */
export function PhoneApp() {
  const text = useText()
  const isZh = text.locale.toLowerCase().startsWith('zh')
  const clockStyle = useClockStyle()
  const places = usePlaces()
  const labels = useMapData()?.labels

  const rawTelemetry = useLive((s) => s.telemetry)
  const rawJob = useLive((s) => s.job)
  const rawTruck = useLive((s) => s.truck)
  const rawCompany = useLive((s) => s.company)
  const ownedGarages = useLive((s) => s.ownedGarages)
  const headquarters = useLive((s) => s.headquarters)
  const clockShift = useLive((s) => s.clockShift)
  const mph = useLive((s) => s.mph)
  const route = useLive((s) => s.route)
  const routeNext = useLive((s) => s.routeNext)

  const storeLogbook = useSimulation((s) => s.logbook)

  const activeTab = usePhone((s) => s.activeTab)
  const activeCall = usePhone((s) => s.activeCall)
  const storeRecents = usePhone((s) => s.recents)
  const setActiveTab = usePhone((s) => s.setActiveTab)
  const startCall = usePhone((s) => s.startCall)
  const clearRecents = usePhone((s) => s.clearRecents)
  const markRecentsSeen = usePhone((s) => s.markRecentsSeen)

  const preview = isPreviewMode(isInHost(), IS_DEMO, typeof location !== 'undefined' ? location.search : '')
  const previewFreight = useMemo(() => (preview ? createPreviewData(isZh) : null), [preview, isZh])
  const previewCompany = useMemo(() => (preview ? createPreviewCompany(isZh) : null), [preview, isZh])
  const previewSim = useMemo(() => (preview ? createPreviewSimulation(text, mph) : null), [preview, text, mph])
  const previewRecents = useMemo(() => (preview ? createPreviewRecents(text) : []), [preview, text])

  const usingPreview = preview && !rawTelemetry && !rawCompany
  const telemetry = rawTelemetry ?? (usingPreview ? (previewFreight?.telemetry ?? null) : null)
  const job = rawJob?.active ? rawJob : usingPreview ? (previewFreight?.job ?? null) : null
  const truck = rawTruck ?? (usingPreview ? (previewFreight?.truck ?? null) : null)
  const company = rawCompany ?? (usingPreview ? previewCompany : null)
  const logbook = storeLogbook.length > 0 ? storeLogbook : usingPreview && previewSim ? previewSim.logbook : []
  const recents = storeRecents.length > 0 ? storeRecents : usingPreview ? previewRecents : []

  const currentGameTime = telemetry ? cabClock(telemetry, clockShift) : usingPreview ? 3780 : null

  const defaultContacts = useMemo(() => buildDefaultContacts(truck, text), [truck, text])
  const tripContacts = useMemo(() => buildTripContacts(job, labels, isZh, text), [job, labels, isZh, text])
  const { garages, drivers } = useMemo(
    () => buildCompanyContacts(company, ownedGarages, headquarters, labels, isZh, text),
    [company, ownedGarages, headquarters, labels, isZh, text],
  )

  const [digits, setDigits] = useState('')
  const [keypadFeedback, setKeypadFeedback] = useState<PhoneFeedback | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (activeTab === 'recents' && !usingPreview) {
      markRecentsSeen()
    }
  }, [activeTab, usingPreview, markRecentsSeen])

  useEffect(() => {
    if (!confirmClear) return
    const timer = setTimeout(() => setConfirmClear(false), 4500)
    return () => clearTimeout(timer)
  }, [confirmClear])

  const dialContact = (contact: PhoneContact) => {
    startCall(contact, currentGameTime ?? 0, { direction: 'outgoing' })
  }

  const routeCtx: RouteContext = {
    places,
    labels,
    rawTelemetry,
    route,
    routeNext,
    job: rawJob,
    mph,
    isZh,
    usingPreview,
    strings: text,
  }

  const handleDialDigits = async () => {
    const clean = digits.trim()
    if (!clean) return
    const res = resolveDialCode(clean, defaultContacts)
    if (res.kind === 'contact') {
      setDigits('')
      setKeypadFeedback(null)
      dialContact(res.contact)
      return
    }
    if (res.kind === 'quickStop') {
      const fb = await routeNearestStopWithFeedback(res.category, routeCtx)
      setKeypadFeedback(fb)
      if (fb.status === 'ok') setDigits('')
      return
    }
    if (res.kind === 'routeHq') {
      const hqId = headquarters ?? company?.garages.find((g) => g.isHq)?.cityId ?? null
      const fb = hqId
        ? await routePlaceWithFeedback('garage', routeCtx, hqId)
        : ({ status: 'error', text: text.phone.feedback.navNoPlaces } satisfies PhoneFeedback)
      setKeypadFeedback(fb)
      if (fb.status === 'ok') setDigits('')
      return
    }
    setKeypadFeedback({ status: 'error', text: text.phone.keypad.unknownCode(clean) })
  }

  const missedCount = countMissedCalls(storeRecents)

  if (activeCall) {
    return (
      <section className="app-panel phone-app in-call" aria-label={text.apps.phone}>
        <CallWorkspace
          call={activeCall}
          company={company}
          telemetry={telemetry}
          rawTelemetry={rawTelemetry}
          job={job}
          truck={truck}
          logbook={logbook}
          places={places}
          labels={labels}
          route={route}
          routeNext={routeNext}
          clockShift={clockShift}
          mph={mph}
          isZh={isZh}
          usingPreview={usingPreview}
          strings={text}
        />
      </section>
    )
  }

  const tabs: readonly { id: PhoneTab; label: string }[] = [
    { id: 'hotlines', label: text.phone.tabs.hotlines },
    { id: 'contacts', label: text.phone.tabs.contacts },
    { id: 'recents', label: text.phone.tabs.recents },
    { id: 'keypad', label: text.phone.tabs.keypad },
  ]

  const shortcutLabels = [
    text.phone.keypad.shortcutRoadside,
    text.phone.keypad.shortcutBank,
    text.phone.keypad.shortcutUsedTrucks,
    text.phone.keypad.shortcutFuel,
    text.phone.keypad.shortcutRest,
    text.phone.keypad.shortcutService,
    text.phone.keypad.shortcutHq,
  ]

  return (
    <section className="app-panel phone-app" aria-label={text.apps.phone}>
      <header className="phone-top-bar glass">
        <div className="phone-brand">
          <h1 className="phone-title">{text.phone.title}</h1>
          {usingPreview && <span className="phone-preview-pill">{text.phone.feedback.previewBadge}</span>}
        </div>
        <nav className="phone-tabs" role="tablist" aria-label={text.phone.title}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`phone-tab-btn${active ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.id === 'hotlines' && <StarGlyph size={16} />}
                {tab.id === 'contacts' && <DriverGlyph size={16} />}
                {tab.id === 'recents' && <ClockGlyph size={16} />}
                {tab.id === 'keypad' && <KeypadGlyph size={16} />}
                <span>{tab.label}</span>
                {tab.id === 'recents' && missedCount > 0 && <span className="phone-tab-badge">{missedCount}</span>}
              </button>
            )
          })}
        </nav>
      </header>

      <div className="phone-content">
        {activeTab === 'hotlines' && (
          <div className="phone-scroll">
            <section className="phone-group">
              <h2 className="phone-group-title">{text.phone.sections.defaultServices}</h2>
              <div className="phone-hotline-grid">
                {defaultContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    className={`phone-hotline-card tone-${contact.kind}`}
                    onClick={() => dialContact(contact)}
                  >
                    <span className={`phone-avatar lg tone-${contact.kind}`}>
                      <ContactAvatarGlyph kind={contact.kind} size={28} />
                    </span>
                    <span className="phone-hotline-name">{contact.name}</span>
                    <span className="phone-hotline-sub">{contact.subtitle}</span>
                    <span className="phone-hotline-cta">
                      <PhoneGlyph size={14} />
                      <span>{text.phone.call.callNow}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {tripContacts.length > 0 && (
              <section className="phone-group">
                <h2 className="phone-group-title">{text.phone.sections.activeTrip}</h2>
                <div className="phone-list-grid">
                  {tripContacts.map((contact) => (
                    <ContactRow key={contact.id} contact={contact} onCall={dialContact} callLabel={text.phone.call.callNow} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="phone-scroll">
            <section className="phone-group">
              <h2 className="phone-group-title">{text.phone.sections.defaultServices}</h2>
              <div className="phone-list-grid">
                {defaultContacts.map((contact) => (
                  <ContactRow key={contact.id} contact={contact} onCall={dialContact} callLabel={text.phone.call.callNow} />
                ))}
              </div>
            </section>

            <section className="phone-group">
              <h2 className="phone-group-title">{text.phone.sections.garages}</h2>
              {garages.length === 0 ? (
                <div className="phone-empty-inline">{text.phone.company.noGarages}</div>
              ) : (
                <div className="phone-list-grid">
                  {garages.map((contact) => (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      badge={contact.isHq ? text.phone.company.hqBadge : undefined}
                      onCall={dialContact}
                      callLabel={text.phone.call.callNow}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="phone-group">
              <h2 className="phone-group-title">{text.phone.sections.drivers}</h2>
              {drivers.length === 0 ? (
                <div className="phone-empty-inline">{text.phone.company.noDrivers}</div>
              ) : (
                <div className="phone-list-grid">
                  {drivers.map((contact) => (
                    <ContactRow key={contact.id} contact={contact} onCall={dialContact} callLabel={text.phone.call.callNow} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'recents' && (
          <div className="phone-scroll">
            {storeRecents.length > 0 && (
              <div className="phone-recents-bar">
                {!confirmClear ? (
                  <button type="button" className="phone-clear-btn" onClick={() => setConfirmClear(true)}>
                    {text.phone.recents.clearAll}
                  </button>
                ) : (
                  <div className="phone-clear-confirm">
                    <button
                      type="button"
                      className="phone-confirm-btn"
                      onClick={() => {
                        clearRecents()
                        setConfirmClear(false)
                      }}
                    >
                      {text.phone.recents.confirmClear}
                    </button>
                    <button type="button" className="phone-cancel-btn" onClick={() => setConfirmClear(false)}>
                      {text.phone.recents.cancel}
                    </button>
                  </div>
                )}
              </div>
            )}

            {recents.length === 0 ? (
              <div className="phone-empty-state">
                <span className="phone-empty-icon">
                  <ClockGlyph size={34} />
                </span>
                <h3>{text.phone.recents.emptyTitle}</h3>
                <p>{text.phone.recents.emptyDesc}</p>
              </div>
            ) : (
              <div className="phone-recents-list">
                {recents.map((rec) => {
                  const dirLabel = text.phone.recents[rec.direction]
                  const isMissed = rec.direction === 'missed'
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      className={`phone-recent-row${isMissed ? ' missed' : ''}`}
                      onClick={() => dialContact(rec.contact)}
                    >
                      <span className={`phone-avatar md tone-${rec.contact.kind}`}>
                        <ContactAvatarGlyph kind={rec.contact.kind} size={20} />
                      </span>
                      <span className="phone-recent-info">
                        <span className="phone-recent-name">{rec.contact.name}</span>
                        <span className="phone-recent-sub">
                          {dirLabel}
                          {rec.durationSec > 0 ? ` · ${formatCallDuration(rec.durationSec)}` : ''}
                          {rec.note ? ` · ${rec.note}` : ''}
                        </span>
                      </span>
                      <span className="phone-recent-time">
                        {formatMessageTime(rec.gameTime, currentGameTime, text.days, clockStyle)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'keypad' && (
          <div className="phone-keypad-layout">
            <div className="phone-keypad-left">
              <div className="phone-dial-display">
                <span className={`phone-dial-digits${digits ? '' : ' placeholder'}`}>
                  {digits || text.phone.keypad.placeholder}
                </span>
                {digits && (
                  <button
                    type="button"
                    className="phone-backspace-btn"
                    aria-label={text.phone.keypad.clear}
                    onClick={() => setDigits((d) => d.slice(0, -1))}
                  >
                    <BackspaceGlyph size={20} />
                  </button>
                )}
              </div>

              {keypadFeedback && <PhoneFeedbackBar feedback={keypadFeedback} compact strings={text} />}

              <div className="phone-shortcuts-card">
                <div className="phone-card-heading">{text.phone.keypad.shortcutsTitle}</div>
                <ul className="phone-shortcut-list">
                  {shortcutLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="phone-keypad-right">
              <div className="phone-keypad-grid">
                {KEYPAD_KEYS.map((key) => (
                  <button
                    key={key.digit}
                    type="button"
                    className="phone-key-btn"
                    onClick={() => {
                      setKeypadFeedback(null)
                      setDigits((d) => (d.length < 12 ? d + key.digit : d))
                    }}
                  >
                    <span className="phone-key-digit">{key.digit}</span>
                    {key.sub && <span className="phone-key-sub">{key.sub}</span>}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="phone-dial-call-btn"
                disabled={!digits.trim()}
                onClick={() => void handleDialDigits()}
              >
                <PhoneGlyph size={20} />
                <span>{text.phone.keypad.call}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function ContactRow({
  contact,
  badge,
  onCall,
  callLabel,
}: {
  contact: PhoneContact
  badge?: string
  onCall: (contact: PhoneContact) => void
  callLabel: string
}) {
  return (
    <button type="button" className="phone-contact-row" onClick={() => onCall(contact)}>
      <span className={`phone-avatar md tone-${contact.kind}`}>
        <ContactAvatarGlyph kind={contact.kind} size={20} />
      </span>
      <span className="phone-contact-info">
        <span className="phone-contact-name-row">
          <span className="phone-contact-name">{contact.name}</span>
          {badge && <span className="phone-hq-pill">{badge}</span>}
        </span>
        <span className="phone-contact-sub">{contact.subtitle}</span>
      </span>
      <span className="phone-row-call-pill" aria-hidden="true">
        <PhoneGlyph size={14} />
        <span>{callLabel}</span>
      </span>
    </button>
  )
}
