import type { CompanySnapshot, GameActionAnswer, JobInfo, Telemetry, TruckInfo } from '../../../shared/host'
import type { MapLabel } from '../../maps/mapData'
import { type Destination, nameOf, nearestOfKind } from '../../maps/places'
import { toLngLat } from '../../maps/projection'
import { addNearestStop, type QuickStopCategory, type RouteGeometryLike } from '../../maps/quickStop'
import { changeRoute } from '../../maps/routeChange'
import type { PhoneContact } from '../../state/phone'
import { formatDistance, type LogbookEntry } from '../../state/simulation'
import type { Strings } from '../../state/strings'
import { evaluateWear, formatFuelRange, resolveLocalizedCity } from '../freight/freight'

export interface PhoneFeedback {
  status: 'loading' | 'ok' | 'error'
  text: string
  showMapJump?: boolean
  placeName?: string
}

export interface RouteContext {
  places: readonly Destination[] | null | undefined
  labels?: readonly MapLabel[]
  rawTelemetry: Telemetry | null
  route: RouteGeometryLike | null
  routeNext: number
  job: Pick<JobInfo, 'active'> | null
  mph: boolean
  isZh: boolean
  usingPreview: boolean
  strings: Strings
}

/** Finds the most worn core truck component for diagnostics and emergency incoming-call alerts. */
export function findWorstTruckWear(telemetry: Telemetry, strings: Strings): ReturnType<typeof evaluateWear> {
  const components = [
    evaluateWear(strings.freight.inspection.engine, telemetry.wearEngine),
    evaluateWear(strings.freight.inspection.transmission, telemetry.wearTransmission),
    evaluateWear(strings.freight.inspection.cabin, telemetry.wearCabin),
    evaluateWear(strings.freight.inspection.chassis, telemetry.wearChassis),
    evaluateWear(strings.freight.inspection.wheels, telemetry.wearWheels),
  ]
  let worst = components[0]
  for (const c of components) {
    if (c.fraction > worst.fraction) worst = c
  }
  return worst
}

/** Shared GPS helper for adding the nearest fuel / rest / service stop with localized feedback. */
export async function routeNearestStopWithFeedback(
  category: QuickStopCategory,
  ctx: RouteContext,
): Promise<PhoneFeedback> {
  const { places, rawTelemetry, route, routeNext, job, mph, usingPreview, strings } = ctx
  if (usingPreview && !rawTelemetry) {
    const sampleName =
      category === 'service' ? 'DAF Service' : category === 'rest' ? 'Autohof A2' : 'Shell Station'
    return {
      status: 'ok',
      text: strings.phone.feedback.navAdded(sampleName, mph ? '14 mi' : '22 km'),
      showMapJump: true,
      placeName: sampleName,
    }
  }
  const res = await addNearestStop(places, category, { telemetry: rawTelemetry, route, routeNext, job })
  if (res.status === 'added' && res.place) {
    const placeName = nameOf(res.place, strings.destinations.kinds[res.place.kind])
    const dist = typeof res.distanceMeters === 'number' ? formatDistance(res.distanceMeters / 1000, mph) : undefined
    return {
      status: 'ok',
      text: strings.phone.feedback.navAdded(placeName, dist),
      showMapJump: true,
      placeName,
    }
  }
  return {
    status: 'error',
    text: res.status === 'noPlaces' ? strings.phone.feedback.navNoPlaces : strings.phone.feedback.navFailed,
  }
}

/** Shared GPS helper for routing to a specific owned garage or the nearest truck dealer. */
export async function routePlaceWithFeedback(
  kind: 'dealer' | 'garage',
  ctx: RouteContext,
  cityId?: string,
  applyRoute: typeof changeRoute = changeRoute,
): Promise<PhoneFeedback> {
  const { places, labels, rawTelemetry, route, job, mph, isZh, usingPreview, strings } = ctx
  if (usingPreview && !rawTelemetry) {
    const label = cityId ? resolveLocalizedCity(cityId, labels, isZh) : strings.destinations.kinds[kind]
    return {
      status: 'ok',
      text: strings.phone.feedback.navAdded(label, mph ? '19 mi' : '31 km'),
      showMapJump: true,
      placeName: label,
    }
  }
  if (!places || places.length === 0 || !rawTelemetry) {
    return { status: 'error', text: strings.phone.feedback.navNoPlaces }
  }
  const from = toLngLat(rawTelemetry.x, rawTelemetry.z)
  const target =
    kind === 'garage' && cityId
      ? places.find((p) => p.kind === 'garage' && p.cityId === cityId)
      : nearestOfKind(places, kind, from, 1)[0]
  if (!target) {
    return { status: 'error', text: strings.phone.feedback.navNoPlaces }
  }
  const action = route || job?.active ? 'addStop' : 'go'
  const answer = await applyRoute(action, target.node)
  if (answer === 'done' || answer === 'alreadyThere') {
    const placeName = nameOf(target, strings.destinations.kinds[target.kind])
    return {
      status: 'ok',
      text: strings.phone.feedback.navAdded(placeName),
      showMapJump: true,
      placeName,
    }
  }
  return { status: 'error', text: strings.phone.feedback.navFailed }
}

/** The three default built-in service hotlines: Roadside Assistance, Bank, and Used Trucks. */
export function buildDefaultContacts(truck: TruckInfo | null, strings: Strings): PhoneContact[] {
  const brand = truck?.brand?.trim() || ''
  return [
    {
      id: 'default-roadside',
      kind: 'roadside',
      name: strings.phone.defaults.roadsideName,
      subtitle: brand ? strings.phone.defaults.roadsideBrandRole(brand) : strings.phone.defaults.roadsideRole,
    },
    {
      id: 'default-bank',
      kind: 'bank',
      name: strings.phone.defaults.bankName,
      subtitle: strings.phone.defaults.bankRole,
    },
    {
      id: 'default-used-trucks',
      kind: 'usedTrucks',
      name: strings.phone.defaults.usedTrucksName,
      subtitle: strings.phone.defaults.usedTrucksRole,
    },
  ]
}

/** Dynamic contacts for the active job's shipper and receiver companies. */
export function buildTripContacts(
  job: JobInfo | null,
  labels: readonly MapLabel[] | undefined,
  isZh: boolean,
  strings: Strings,
): PhoneContact[] {
  if (!job?.active) return []
  const contacts: PhoneContact[] = []
  if (job.sourceCompany) {
    const city = resolveLocalizedCity(job.sourceCity, labels, isZh)
    contacts.push({
      id: 'trip-shipper',
      kind: 'shipper',
      name: job.sourceCompany,
      subtitle: strings.phone.defaults.shipperRole(city),
    })
  }
  if (job.destinationCompany) {
    const city = resolveLocalizedCity(job.destinationCity, labels, isZh)
    contacts.push({
      id: 'trip-receiver',
      kind: 'receiver',
      name: job.destinationCompany,
      subtitle: strings.phone.defaults.receiverRole(city),
    })
  }
  return contacts
}

export function driverStateLabel(state: number, strings: Strings): string {
  switch (state) {
    case 2:
      return strings.phone.company.driverStateWorking
    case 3:
      return strings.phone.company.driverStateReturning
    default:
      return strings.phone.company.driverStateIdle
  }
}

/** Builds Garage and Hired Driver contacts from the savegame `CompanySnapshot` (with fallback to `ownedGarages`). */
export function buildCompanyContacts(
  company: CompanySnapshot | null,
  ownedGarages: readonly string[],
  headquarters: string | null,
  labels: readonly MapLabel[] | undefined,
  isZh: boolean,
  strings: Strings,
): { garages: PhoneContact[]; drivers: PhoneContact[] } {
  const garages: PhoneContact[] =
    company && company.garages.length > 0
      ? company.garages.map((g) => ({
          id: `garage-${g.cityId}`,
          kind: 'garage',
          name: resolveLocalizedCity(g.cityId, labels, isZh),
          subtitle: strings.phone.company.garageStats(g.vehicleCount, g.driverCount),
          metaId: g.cityId,
          isHq: g.isHq,
        }))
      : ownedGarages.map((cityId) => ({
          id: `garage-${cityId}`,
          kind: 'garage',
          name: resolveLocalizedCity(cityId, labels, isZh),
          subtitle: cityId === headquarters ? strings.phone.company.hqBadge : strings.phone.sections.garages,
          metaId: cityId,
          isHq: cityId === headquarters,
        }))

  const drivers: PhoneContact[] = (company?.drivers ?? []).map((d) => {
    const city = resolveLocalizedCity(d.currentCity || d.garageCity, labels, isZh)
    return {
      id: `driver-${d.id}`,
      kind: 'driver',
      name: strings.phone.company.driverLabel(d.id),
      subtitle: strings.phone.company.driverSubtitle(city, driverStateLabel(d.state, strings)),
      metaId: d.id,
    }
  })

  return { garages, drivers }
}

export type DialResolution =
  | { kind: 'contact'; contact: PhoneContact }
  | { kind: 'quickStop'; category: QuickStopCategory }
  | { kind: 'routeHq' }
  | { kind: 'unknown' }

const CONTACT_SHORTCODES: Readonly<Record<string, PhoneContact['kind']>> = {
  '112': 'roadside',
  '911': 'roadside',
  '122': 'roadside',
  '95588': 'bank',
  '800': 'bank',
  '888': 'usedTrucks',
}

const STOP_SHORTCODES: Readonly<Record<string, QuickStopCategory>> = {
  '1': 'fuel',
  '2': 'rest',
  '3': 'service',
}

/** Resolves keypad shortcodes to either a direct hotline call or a one-tap GPS navigation shortcut. */
export function resolveDialCode(digits: string, defaults: readonly PhoneContact[]): DialResolution {
  const clean = digits.trim()
  const contactKind = CONTACT_SHORTCODES[clean]
  if (contactKind) {
    const contact = defaults.find((c) => c.kind === contactKind)
    if (contact) return { kind: 'contact', contact }
  }
  const stopCategory = STOP_SHORTCODES[clean]
  if (stopCategory) return { kind: 'quickStop', category: stopCategory }
  if (clean === '0') return { kind: 'routeHq' }
  return { kind: 'unknown' }
}

export function formatCallDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const BRAND_UPPER = new Set([
  'daf',
  'man',
  'iveco',
  'volvo',
  'scania',
  'renault',
  'mercedes',
  'mack',
  'kenworth',
  'peterbilt',
  'freightliner',
  'westernstar',
  'international',
])

/** Turns an internal truck model id like `scania.s_2016` or `daf.2021` into a clean display name. */
export function formatTruckModelName(model: string): string {
  const stripped = model.replace(/^vehicle\./, '')
  const parts = stripped.split(/[._]+/).filter(Boolean)
  if (parts.length === 0) return model
  return parts
    .map((p, idx) => {
      const lower = p.toLowerCase()
      if (idx === 0 && (lower === 'daf' || lower === 'man')) return lower.toUpperCase()
      if (idx === 0 && BRAND_UPPER.has(lower)) return lower.charAt(0).toUpperCase() + lower.slice(1)
      if (/^[a-z]{1,2}\d*$/i.test(p)) return p.toUpperCase()
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join(' ')
}

/** Builds a concise live diagnostic subtitle for the Roadside Service operator. */
export function roadsideDiagnosticLine(telemetry: Telemetry | null, mph: boolean, strings: Strings): string {
  if (!telemetry) return strings.phone.roadside.diagOk
  if (telemetry.brakeAirPressureWarning) {
    return strings.phone.roadside.diagAirLow
  }
  if (telemetry.fuelRange > 0 && telemetry.fuelRange < 120) {
    return strings.phone.roadside.diagFuelLow(formatFuelRange(telemetry.fuelRange, mph))
  }
  const worst = findWorstTruckWear(telemetry, strings)
  if (worst.fraction >= 0.2) {
    return strings.phone.roadside.diagWearHigh(worst.name, worst.percentText)
  }
  return strings.phone.roadside.diagOk
}

export function formatActionAnswer(answer: GameActionAnswer, strings: Strings): string {
  return strings.phone.feedback[answer]
}

export interface CashflowSummary {
  income: number
  expense: number
  net: number
}

export function summarizeLast7DaysCashflow(logbook: readonly LogbookEntry[], todayGameDay: number | null): CashflowSummary {
  const maxDay =
    todayGameDay ??
    logbook.reduce((acc, entry) => (entry.gameDay > acc ? entry.gameDay : acc), 0)
  const minDay = Math.max(0, maxDay - 6)
  let income = 0
  let expense = 0
  for (const entry of logbook) {
    if (entry.gameDay < minDay || entry.gameDay > maxDay) continue
    income += entry.income ?? 0
    expense += entry.expense ?? 0
  }
  return { income, expense, net: income - expense }
}
