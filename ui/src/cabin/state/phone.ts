import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  cabClock,
  type CompanySnapshot,
  type GameActionAnswer,
  type GameActionKind,
  IS_DEMO,
  isInHost,
  type JobInfo,
  postToHost,
  type Telemetry,
  type TruckInfo,
} from '../../shared/host'
import { evaluateBuffer, formatFuelRange } from '../apps/freight/freight'
import { findWorstTruckWear } from '../apps/phone/phoneLogic'
import { jobIdentity } from './simulation'
import type { Strings } from './strings'

export type PhoneTab = 'hotlines' | 'contacts' | 'recents' | 'keypad'

export type PhoneContactKind = 'roadside' | 'bank' | 'usedTrucks' | 'garage' | 'driver' | 'shipper' | 'receiver'

export type CallDirection = 'outgoing' | 'incoming' | 'missed' | 'declined'

export interface PhoneContact {
  id: string
  kind: PhoneContactKind
  name: string
  subtitle: string
  /** Optional metadata for specific contact kinds (garage cityId, driverId, etc.). */
  metaId?: string
  isHq?: boolean
  urgent?: boolean
}

export interface ActiveCall {
  id: string
  contact: PhoneContact
  phase: 'dialing' | 'connected'
  direction: 'outgoing' | 'incoming'
  startedAtMs: number
  connectedAtMs: number | null
  gameTime: number
  /** Highlighted roadside action when triggered by an incoming alert. */
  suggestedAction?: 'roadsideTowToService' | 'roadsideTowToRoad' | 'roadsideEmergencyRefuel'
  /** Summary note recorded when an in-call action runs (e.g. "Tow to Service"). */
  resultNote?: string
}

export interface IncomingCall {
  id: string
  contact: PhoneContact
  reason: string
  gameTime: number
  shownAt: number
  suggestedAction?: 'roadsideTowToService' | 'roadsideTowToRoad' | 'roadsideEmergencyRefuel'
}

export interface CallRecord {
  id: string
  contact: PhoneContact
  direction: CallDirection
  gameTime: number
  createdAt: number
  durationSec: number
  note?: string
  seen: boolean
}

export interface PhoneState {
  activeTab: PhoneTab
  activeCall: ActiveCall | null
  incomingCall: IncomingCall | null
  recents: CallRecord[]
  autoConfirmRoadside: boolean
  setActiveTab(tab: PhoneTab): void
  setAutoConfirmRoadside(on: boolean): void
  startCall(
    contact: PhoneContact,
    gameTime: number,
    options?: {
      direction?: 'outgoing' | 'incoming'
      immediate?: boolean
      suggestedAction?: ActiveCall['suggestedAction']
    },
    nowMs?: number,
  ): void
  markConnected(nowMs?: number): void
  setCallResultNote(note: string): void
  endCall(nowMs?: number): void
  answerIncoming(nowMs?: number): ActiveCall | null
  declineIncoming(missed?: boolean, nowMs?: number): void
  markRecentsSeen(): void
  clearRecents(): void
  evaluateIncomingCalls(
    telemetry: Telemetry,
    job: JobInfo | null,
    truck: TruckInfo | null,
    clockShift: number,
    mph: boolean,
    dnd: boolean,
    strings: Strings,
    nowMs?: number,
  ): void
}

const MAX_RECENTS = 40
const DAMAGE_CALL_COOLDOWN_MS = 120_000
const CRITICAL_FUEL_RANGE_KM = 80
const FUEL_RESET_RANGE_KM = 180
const CRITICAL_WEAR_FRACTION = 0.35
const WEAR_RESET_FRACTION = 0.2

interface IncomingTracker {
  lowFuelCalled: boolean
  highWearCalled: boolean
  airWarningCalled: boolean
  lateJobKey: string | null
  lastDamageCalled: number
  lastDamageAtMs: number
  seq: number
}

function initialTracker(): IncomingTracker {
  return {
    lowFuelCalled: false,
    highWearCalled: false,
    airWarningCalled: false,
    lateJobKey: null,
    lastDamageCalled: 0,
    lastDamageAtMs: 0,
    seq: 0,
  }
}

let incomingTracker: IncomingTracker = initialTracker()

export function resetPhoneTracker(): void {
  incomingTracker = initialTracker()
}

function nextCallId(prefix: string): string {
  incomingTracker.seq += 1
  return `${prefix}-${Date.now()}-${incomingTracker.seq}`
}

// --- Host GameAction RPC plumbing (mirrors maps/routeChange.ts) ---

let nextActionId = 1
const pendingActions = new Map<number, { resolve: (answer: GameActionAnswer) => void; timer: ReturnType<typeof setTimeout> }>()

const ACTION_TIMEOUT_MS = 4000

/** Receives a `gameActionAnswer` message from the host and settles its awaiting promise. */
export function receiveGameActionAnswer(id: number, answer: GameActionAnswer): void {
  const entry = pendingActions.get(id)
  if (!entry) return
  pendingActions.delete(id)
  clearTimeout(entry.timer)
  entry.resolve(answer)
}

/** Triggers an in-game action through the host & plugin bridge. */
export function triggerGameAction(action: GameActionKind, autoConfirm = false): Promise<GameActionAnswer> {
  if (!isInHost()) {
    return Promise.resolve('done')
  }
  const id = nextActionId++
  return new Promise<GameActionAnswer>((resolve) => {
    const timer = setTimeout(() => {
      if (pendingActions.delete(id)) resolve('noAnswer')
    }, ACTION_TIMEOUT_MS)
    pendingActions.set(id, { resolve, timer })
    postToHost({ type: 'gameAction', id, action, autoConfirm })
  })
}

export function countMissedCalls(recents: readonly CallRecord[]): number {
  let count = 0
  for (const r of recents) {
    if (r.direction === 'missed' && !r.seen) count += 1
  }
  return count
}

type PersistedPhone = Pick<PhoneState, 'recents' | 'autoConfirmRoadside'>

export const usePhone = create<PhoneState>()(
  persist(
    (set, get) => ({
      activeTab: 'hotlines',
      activeCall: null,
      incomingCall: null,
      recents: [],
      autoConfirmRoadside: false,

      setActiveTab: (activeTab) =>
        set((state) => ({
          activeTab,
          recents:
            activeTab === 'recents'
              ? state.recents.map((r) => (r.seen ? r : { ...r, seen: true }))
              : state.recents,
        })),

      setAutoConfirmRoadside: (autoConfirmRoadside) => set({ autoConfirmRoadside }),

      startCall: (contact, gameTime, options, nowMs = Date.now()) => {
        const direction = options?.direction ?? 'outgoing'
        const immediate = options?.immediate ?? false
        const call: ActiveCall = {
          id: nextCallId('call'),
          contact,
          phase: immediate ? 'connected' : 'dialing',
          direction,
          startedAtMs: nowMs,
          connectedAtMs: immediate ? nowMs : null,
          gameTime,
          suggestedAction: options?.suggestedAction,
        }
        set({ activeCall: call, incomingCall: null })
      },

      markConnected: (nowMs = Date.now()) =>
        set((state) => {
          if (!state.activeCall || state.activeCall.phase === 'connected') return state
          return {
            activeCall: {
              ...state.activeCall,
              phase: 'connected',
              connectedAtMs: nowMs,
            },
          }
        }),

      setCallResultNote: (note) =>
        set((state) => {
          if (!state.activeCall) return state
          return {
            activeCall: {
              ...state.activeCall,
              resultNote: note,
            },
          }
        }),

      endCall: (nowMs = Date.now()) =>
        set((state) => {
          const call = state.activeCall
          if (!call) return state
          const durationSec =
            call.connectedAtMs !== null ? Math.max(1, Math.round((nowMs - call.connectedAtMs) / 1000)) : 0
          const record: CallRecord = {
            id: call.id,
            contact: call.contact,
            direction: call.direction,
            gameTime: call.gameTime,
            createdAt: nowMs,
            durationSec,
            note: call.resultNote,
            seen: true,
          }
          return {
            activeCall: null,
            recents: [record, ...state.recents].slice(0, MAX_RECENTS),
          }
        }),

      answerIncoming: (nowMs = Date.now()) => {
        const inc = get().incomingCall
        if (!inc) return null
        const call: ActiveCall = {
          id: inc.id,
          contact: inc.contact,
          phase: 'connected',
          direction: 'incoming',
          startedAtMs: nowMs,
          connectedAtMs: nowMs,
          gameTime: inc.gameTime,
          suggestedAction: inc.suggestedAction,
          resultNote: inc.reason,
        }
        set({ incomingCall: null, activeCall: call })
        return call
      },

      declineIncoming: (missed = false, nowMs = Date.now()) =>
        set((state) => {
          const inc = state.incomingCall
          if (!inc) return state
          const record: CallRecord = {
            id: inc.id,
            contact: inc.contact,
            direction: missed ? 'missed' : 'declined',
            gameTime: inc.gameTime,
            createdAt: nowMs,
            durationSec: 0,
            note: inc.reason,
            seen: !missed,
          }
          return {
            incomingCall: null,
            recents: [record, ...state.recents].slice(0, MAX_RECENTS),
          }
        }),

      markRecentsSeen: () =>
        set((state) => {
          if (!state.recents.some((r) => !r.seen)) return state
          return { recents: state.recents.map((r) => (r.seen ? r : { ...r, seen: true })) }
        }),

      clearRecents: () => set({ recents: [] }),

      evaluateIncomingCalls: (telemetry, job, truck, clockShift, mph, dnd, strings, nowMs = Date.now()) => {
        const state = get()
        const cabNow = cabClock(telemetry, clockShift)
        const brand = truck?.brand || ''
        const roadsideContact: PhoneContact = {
          id: 'default-roadside',
          kind: 'roadside',
          name: strings.phone.defaults.roadsideName,
          subtitle: brand
            ? strings.phone.defaults.roadsideBrandRole(brand)
            : strings.phone.defaults.roadsideRole,
          urgent: true,
        }

        const pushIncoming = (
          contact: PhoneContact,
          reason: string,
          suggestedAction?: IncomingCall['suggestedAction'],
        ) => {
          // If DND is on or a call is already active/ringing, record silently as missed in recents only when not on a call.
          if (dnd || state.activeCall || state.incomingCall) return
          set({
            incomingCall: {
              id: nextCallId('inc'),
              contact,
              reason,
              gameTime: cabNow,
              shownAt: nowMs,
              suggestedAction,
            },
          })
        }

        if (telemetry.electricEnabled) {
          // 1. Critical fuel (< 80 km triggers, >= 180 km resets)
          if (telemetry.fuelRange > 0 && telemetry.fuelRange < CRITICAL_FUEL_RANGE_KM) {
            if (!incomingTracker.lowFuelCalled) {
              incomingTracker.lowFuelCalled = true
              pushIncoming(
                roadsideContact,
                strings.phone.incoming.lowFuelReason(formatFuelRange(telemetry.fuelRange, mph)),
                'roadsideEmergencyRefuel',
              )
              return
            }
          } else if (telemetry.fuelRange >= FUEL_RESET_RANGE_KM) {
            incomingTracker.lowFuelCalled = false
          }

          // 2. Brake air pressure warning while engine running
          if (telemetry.brakeAirPressureWarning && telemetry.engineEnabled) {
            if (!incomingTracker.airWarningCalled) {
              incomingTracker.airWarningCalled = true
              pushIncoming(roadsideContact, strings.phone.incoming.airPressureReason, 'roadsideTowToService')
              return
            }
          } else if (!telemetry.brakeAirPressureWarning) {
            incomingTracker.airWarningCalled = false
          }

          // 3. Heavy component wear (>= 35% triggers, < 20% resets)
          const worst = findWorstTruckWear(telemetry, strings)
          if (worst.fraction >= CRITICAL_WEAR_FRACTION) {
            if (!incomingTracker.highWearCalled) {
              incomingTracker.highWearCalled = true
              pushIncoming(
                roadsideContact,
                strings.phone.incoming.highWearReason(worst.name, worst.percentText),
                'roadsideTowToService',
              )
              return
            }
          } else if (worst.fraction < WEAR_RESET_FRACTION) {
            incomingTracker.highWearCalled = false
          }
        }

        // 4. Active job overdue / severe cargo damage spike
        if (job?.active) {
          const key = jobIdentity(job)
          const receiverName = job.destinationCompany || strings.messages.threads.dispatch.name
          const receiverContact: PhoneContact = {
            id: 'trip-receiver',
            kind: 'receiver',
            name: receiverName,
            subtitle: strings.phone.defaults.receiverRole(job.destinationCity || ''),
            urgent: true,
          }
          const isZh = strings.locale.toLowerCase().startsWith('zh')
          if (job.deliveryTime > 0 && telemetry.gameTime > 0) {
            const buffer = evaluateBuffer(job.deliveryTime, telemetry.gameTime, telemetry.navigationTime, isZh)
            if (buffer.status === 'late' && incomingTracker.lateJobKey !== key) {
              incomingTracker.lateJobKey = key
              pushIncoming(receiverContact, strings.phone.incoming.lateJobReason)
              return
            }
          }
          const dmgPercent = Math.round((telemetry.cargoDamage ?? 0) * 100)
          if (dmgPercent >= Math.max(8, incomingTracker.lastDamageCalled + 5) && nowMs - incomingTracker.lastDamageAtMs >= DAMAGE_CALL_COOLDOWN_MS) {
            incomingTracker.lastDamageCalled = dmgPercent
            incomingTracker.lastDamageAtMs = nowMs
            pushIncoming(receiverContact, strings.phone.incoming.cargoDamageReason(dmgPercent))
          }
        } else {
          incomingTracker.lastDamageCalled = 0
        }
      },
    }),
    {
      name: 'westplay-phone',
      storage: createJSONStorage(() => (IS_DEMO ? sessionStorage : localStorage)),
      partialize: (state): PersistedPhone => ({
        recents: state.recents,
        autoConfirmRoadside: state.autoConfirmRoadside,
      }),
    },
  ),
)

export function useMissedCallsCount(): number {
  return usePhone((state) => countMissedCalls(state.recents))
}

/** Sample company & fleet snapshot strictly for `?preview` / `?demo` browser previews. */
export function createPreviewCompany(isZh: boolean): CompanySnapshot {
  return {
    companyName: isZh ? '欧亚快运物流有限公司' : 'EuroExpress Logistics',
    playerName: isZh ? '陈师傅' : 'Alex',
    bank: {
      moneyAccount: 248_650,
      loans: [
        {
          amount: 142_000,
          originalAmount: 400_000,
          interestRate: 0.12,
          remainingDays: 24,
          dailyRepayment: 5917,
        },
        {
          amount: 32_500,
          originalAmount: 100_000,
          interestRate: 0.18,
          remainingDays: 11,
          dailyRepayment: 2955,
        },
      ],
    },
    garages: [
      { cityId: 'berlin', status: 3, vehicleCount: 4, driverCount: 4, isHq: true },
      { cityId: 'hamburg', status: 2, vehicleCount: 3, driverCount: 2, isHq: false },
      { cityId: 'munich', status: 1, vehicleCount: 1, driverCount: 1, isHq: false },
    ],
    drivers: [
      {
        id: 'driver.104',
        garageCity: 'berlin',
        currentCity: 'rotterdam',
        state: 2,
        onDutyTimer: 540,
        skillPoints: 22,
        lastProfit: 4820,
      },
      {
        id: 'driver.218',
        garageCity: 'berlin',
        currentCity: 'berlin',
        state: 1,
        onDutyTimer: 120,
        skillPoints: 15,
        lastProfit: 3150,
      },
      {
        id: 'driver.305',
        garageCity: 'hamburg',
        currentCity: 'prague',
        state: 3,
        onDutyTimer: 310,
        skillPoints: 18,
        lastProfit: 2640,
      },
    ],
    usedTrucks: [
      {
        id: 'offer.1',
        model: 'scania.s_2016',
        price: 78_400,
        odometerKm: 138_200,
        wear: 0.18,
        expirationTime: 4620,
      },
      {
        id: 'offer.2',
        model: 'daf.2021',
        price: 94_900,
        odometerKm: 86_500,
        wear: 0.11,
        expirationTime: 5100,
      },
      {
        id: 'offer.3',
        model: 'volvo.fh16_2012',
        price: 52_300,
        odometerKm: 312_000,
        wear: 0.34,
        expirationTime: 4140,
      },
    ],
  }
}

export function createPreviewRecents(strings: Strings): CallRecord[] {
  return [
    {
      id: 'preview-rec-1',
      contact: {
        id: 'default-roadside',
        kind: 'roadside',
        name: strings.phone.defaults.roadsideName,
        subtitle: strings.phone.defaults.roadsideBrandRole('DAF'),
      },
      direction: 'outgoing',
      gameTime: 3745,
      createdAt: 1003,
      durationSec: 42,
      note: strings.phone.roadside.towToRoad,
      seen: true,
    },
    {
      id: 'preview-rec-2',
      contact: {
        id: 'default-bank',
        kind: 'bank',
        name: strings.phone.defaults.bankName,
        subtitle: strings.phone.defaults.bankRole,
      },
      direction: 'outgoing',
      gameTime: 3690,
      createdAt: 1002,
      durationSec: 28,
      seen: true,
    },
    {
      id: 'preview-rec-3',
      contact: {
        id: 'driver-driver.104',
        kind: 'driver',
        name: strings.phone.company.driverLabel('driver.104'),
        subtitle: strings.phone.company.driverSubtitle('Rotterdam', strings.phone.company.driverStateWorking),
        metaId: 'driver.104',
      },
      direction: 'missed',
      gameTime: 3610,
      createdAt: 1001,
      durationSec: 0,
      seen: false,
    },
  ]
}
