import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { type ClockStyle, formatGameTime } from '../../shared/format'
import {
  cabClock,
  GAMEPLAY_EVENT_FERRY_USED,
  GAMEPLAY_EVENT_FINED,
  GAMEPLAY_EVENT_JOB_CANCELLED,
  GAMEPLAY_EVENT_JOB_DELIVERED,
  GAMEPLAY_EVENT_TOLLGATE_PAID,
  GAMEPLAY_EVENT_TRAIN_USED,
  GAMEPLAY_FLAG_AUTO_PARK,
  type GameplayEvent,
  type GameWeather,
  IS_DEMO,
  type JobInfo,
  type Telemetry,
} from '../../shared/host'
import {
  evaluateBuffer,
  evaluateWear,
  formatDuration,
  formatFuelRange,
  resolveLocalizedCity,
} from '../apps/freight/freight'
import type { QuickStopCategory } from '../maps/quickStop'
import type { Strings } from './strings'

export type ThreadId = 'dispatch' | 'traffic' | 'fleet' | 'convoy'

export const THREAD_ORDER: readonly ThreadId[] = ['dispatch', 'fleet', 'traffic', 'convoy']

export type QuickReplyId =
  'ack_on_way' | 'plan_rest' | 'find_fuel' | 'find_rest' | 'find_service' | 'confirm_fine' | 'drive_safe'

export interface MessageAction {
  kind: 'addStop'
  stopType: QuickStopCategory
}

export interface SimMessage {
  id: string
  thread: ThreadId
  sender: 'them' | 'me'
  body: string
  gameTime: number
  createdAt: number
  read: boolean
  priority: 'normal' | 'high'
  action?: MessageAction
}

export type LogbookKind = 'delivered' | 'cancelled' | 'ferry' | 'train' | 'fine' | 'toll' | 'rest_note'

export interface LogbookEntry {
  id: string
  kind: LogbookKind
  gameDay: number
  gameTime: number
  cargo?: string
  cargoMass?: number
  sourceCity?: string
  sourceCompany?: string
  destinationCity?: string
  destinationCompany?: string
  distanceKm?: number
  income?: number
  expense?: number
  earnedXp?: number
  cargoDamage?: number
  onTime?: boolean
  autoPark?: boolean
  offenceCode?: string
  note?: string
}

export interface BannerItem {
  id: string
  thread: ThreadId
  title: string
  body: string
  gameTime: number
  shownAt: number
}

export interface PlannedRestNote {
  gameDay: number
  gameTime: number
  note: string
  createdAt: number
}

export interface SuppressOptions {
  suppressBanner?: boolean
  viewingThread?: ThreadId | null
}

const MAX_MESSAGES_PER_THREAD = 60
const MAX_MESSAGES_TOTAL = 160
const MAX_LOGBOOK_DAYS = 30
const DAMAGE_COOLDOWN_MS = 60_000
const CONVOY_BUSY_COOLDOWN_MS = 300_000
const JOB_CLEAR_GRACE_MS = 2000

interface RuntimeTracker {
  lastJobKey: string | null
  lastCargoLoaded: boolean
  lastJobSnapshot: JobInfo | null
  pendingClearedJob: { job: JobInfo; clearedAtMs: number; gameTime: number; cabNow: number } | null
  resolvedJobKeys: Set<string>
  lastDamageReported: number
  lastDamageAtMs: number
  tightAlertedJobKey: string | null
  lateAlertedJobKey: string | null
  lowFuelAlerted: boolean
  sawPositiveRestStop: boolean
  restSoonAlerted: boolean
  restOverdueAlerted: boolean
  airWarningAlerted: boolean
  highWearAlerted: boolean
  lastWeatherSky: 'clear' | 'rain' | null
  rainAlertedThisShower: boolean
  rainAlertedAtGameTime: number | null
  lastTmpActive: boolean
  lastNearbySurgeAtMs: number
  seq: number
}

function createInitialTracker(): RuntimeTracker {
  return {
    lastJobKey: null,
    lastCargoLoaded: false,
    lastJobSnapshot: null,
    pendingClearedJob: null,
    resolvedJobKeys: new Set(),
    lastDamageReported: 0,
    lastDamageAtMs: 0,
    tightAlertedJobKey: null,
    lateAlertedJobKey: null,
    lowFuelAlerted: false,
    sawPositiveRestStop: false,
    restSoonAlerted: false,
    restOverdueAlerted: false,
    airWarningAlerted: false,
    highWearAlerted: false,
    lastWeatherSky: null,
    rainAlertedThisShower: false,
    rainAlertedAtGameTime: null,
    lastTmpActive: false,
    lastNearbySurgeAtMs: 0,
    seq: 0,
  }
}

let tracker: RuntimeTracker = createInitialTracker()

export function resetSimulationTracker(): void {
  tracker = createInitialTracker()
}

function nextId(prefix: string): string {
  tracker.seq += 1
  return `${prefix}-${Date.now()}-${tracker.seq}`
}

export function jobIdentity(
  job: Pick<
    JobInfo,
    'sourceCity' | 'sourceCompany' | 'destinationCity' | 'destinationCompany' | 'cargo' | 'deliveryTime'
  >,
): string {
  return `${job.sourceCity}|${job.sourceCompany}|${job.destinationCity}|${job.destinationCompany}|${job.cargo}|${job.deliveryTime}`
}

export function formatMoney(amount: number, mph: boolean): string {
  const rounded = Math.round(amount)
  return mph ? `$${rounded.toLocaleString()}` : `${rounded.toLocaleString()} €`
}

export function formatDistance(km: number, mph: boolean): string {
  const value = mph ? km * 0.621371 : km
  return `${Math.round(value).toLocaleString()} ${mph ? 'mi' : 'km'}`
}

function isChinese(strings: Strings): boolean {
  return strings.locale.toLowerCase().startsWith('zh')
}

function appendMessages(existing: readonly SimMessage[], incoming: readonly SimMessage[]): SimMessage[] {
  if (incoming.length === 0) return [...existing]
  const combined = [...existing, ...incoming]
  const perThreadCount = new Map<ThreadId, number>()
  const keptReversed: SimMessage[] = []
  for (let i = combined.length - 1; i >= 0; i--) {
    const msg = combined[i]
    const count = perThreadCount.get(msg.thread) ?? 0
    if (count >= MAX_MESSAGES_PER_THREAD) continue
    perThreadCount.set(msg.thread, count + 1)
    keptReversed.push(msg)
    if (keptReversed.length >= MAX_MESSAGES_TOTAL) break
  }
  return keptReversed.reverse()
}

function pruneLogbook(existing: readonly LogbookEntry[], incoming: readonly LogbookEntry[]): LogbookEntry[] {
  if (incoming.length === 0) return [...existing]
  const combined = [...existing, ...incoming]
  let maxDay = 0
  for (const entry of combined) {
    if (entry.gameDay > maxDay) maxDay = entry.gameDay
  }
  const minDay = Math.max(0, maxDay - (MAX_LOGBOOK_DAYS - 1))
  return combined.filter((entry) => entry.gameDay >= minDay)
}

export function countUnread(messages: readonly SimMessage[]): number {
  let count = 0
  for (const m of messages) {
    if (!m.read && m.sender === 'them') count += 1
  }
  return count
}

export function countUnreadByThread(messages: readonly SimMessage[]): Record<ThreadId, number> {
  const counts: Record<ThreadId, number> = { dispatch: 0, traffic: 0, fleet: 0, convoy: 0 }
  for (const m of messages) {
    if (!m.read && m.sender === 'them') counts[m.thread] += 1
  }
  return counts
}

export interface SimulationState {
  messages: SimMessage[]
  logbook: LogbookEntry[]
  plannedRest: PlannedRestNote | null
  banner: BannerItem | null
  activeThread: ThreadId
  dnd: boolean
  setDnd(on: boolean): void
  setActiveThread(thread: ThreadId): void
  markThreadRead(thread: ThreadId): void
  dismissBanner(): void
  clearMessages(): void
  clearLogbook(): void
  sendQuickReply(thread: ThreadId, replyId: QuickReplyId, gameTime: number, strings: Strings, nowMs?: number): void
  ingestJob(
    job: JobInfo,
    telemetry: Telemetry | null,
    clockShift: number,
    clockStyle: ClockStyle,
    strings: Strings,
    options?: SuppressOptions,
    nowMs?: number,
  ): void
  ingestTelemetry(
    telemetry: Telemetry,
    job: JobInfo | null,
    clockShift: number,
    mph: boolean,
    strings: Strings,
    options?: SuppressOptions,
    nowMs?: number,
  ): void
  ingestWeather(
    weather: GameWeather | null,
    telemetry: Telemetry | null,
    clockShift: number,
    strings: Strings,
    options?: SuppressOptions,
    nowMs?: number,
  ): void
  ingestGameplayEvent(
    event: GameplayEvent,
    currentJob: JobInfo | null,
    telemetry: Telemetry | null,
    clockShift: number,
    mph: boolean,
    strings: Strings,
    options?: SuppressOptions,
    nowMs?: number,
  ): void
  ingestTruckersMp(
    on: boolean,
    nearbyCount: number,
    telemetry: Telemetry | null,
    clockShift: number,
    strings: Strings,
    options?: SuppressOptions,
    nowMs?: number,
  ): void
}

type PersistedSimulation = Pick<SimulationState, 'messages' | 'logbook' | 'plannedRest' | 'activeThread' | 'dnd'>

export const useSimulation = create<SimulationState>()(
  persist(
    (set) => {
      const commit = (
        newMessages: SimMessage[],
        newLogs: LogbookEntry[],
        strings: Strings,
        options?: SuppressOptions,
        nowMs = Date.now(),
      ) => {
        if (newMessages.length === 0 && newLogs.length === 0) return
        const markedMessages = options?.viewingThread
          ? newMessages.map((m) => (m.thread === options.viewingThread ? { ...m, read: true } : m))
          : newMessages
        set((state) => {
          const messages = appendMessages(state.messages, markedMessages)
          const logbook = pruneLogbook(state.logbook, newLogs)
          let banner = state.banner
          if (!state.dnd && !options?.suppressBanner) {
            const highPriority = [...markedMessages]
              .reverse()
              .find((m) => m.sender === 'them' && m.priority === 'high' && m.thread !== options?.viewingThread)
            if (highPriority) {
              banner = {
                id: highPriority.id,
                thread: highPriority.thread,
                title: strings.messages.events.bannerTitle(strings.messages.threads[highPriority.thread].name),
                body: highPriority.body,
                gameTime: highPriority.gameTime,
                shownAt: nowMs,
              }
            }
          }
          return { messages, logbook, banner }
        })
      }

      return {
        messages: [],
        logbook: [],
        plannedRest: null,
        banner: null,
        activeThread: 'dispatch',
        dnd: true,

        setDnd: (dnd) => set((state) => ({ dnd, banner: dnd ? null : state.banner })),

        setActiveThread: (activeThread) =>
          set((state) => ({
            activeThread,
            messages: state.messages.map((m) => (m.thread === activeThread && !m.read ? { ...m, read: true } : m)),
          })),

        markThreadRead: (thread) =>
          set((state) => {
            if (!state.messages.some((m) => m.thread === thread && !m.read)) return state
            return {
              messages: state.messages.map((m) => (m.thread === thread && !m.read ? { ...m, read: true } : m)),
            }
          }),

        dismissBanner: () => set((state) => (state.banner ? { banner: null } : state)),

        clearMessages: () => set({ messages: [], banner: null }),

        clearLogbook: () => set({ logbook: [], plannedRest: null }),

        sendQuickReply: (thread, replyId, gameTime, strings, nowMs = Date.now()) => {
          const labelMap: Record<QuickReplyId, string> = {
            ack_on_way: strings.messages.quickReplies.ackOnWay,
            plan_rest: strings.messages.quickReplies.planRest,
            find_fuel: strings.messages.quickReplies.findFuel,
            find_rest: strings.messages.quickReplies.findRest,
            find_service: strings.messages.quickReplies.findService,
            confirm_fine: strings.messages.quickReplies.confirmFine,
            drive_safe: strings.messages.quickReplies.driveSafe,
          }
          const body = labelMap[replyId]
          const msg: SimMessage = {
            id: nextId('me'),
            thread,
            sender: 'me',
            body,
            gameTime,
            createdAt: nowMs,
            read: true,
            priority: 'normal',
          }
          const gameDay = Math.max(0, Math.floor(gameTime / 1440))
          set((state) => {
            const messages = appendMessages(state.messages, [msg])
            if (replyId === 'plan_rest') {
              const plannedRest: PlannedRestNote = {
                gameDay,
                gameTime,
                note: body,
                createdAt: nowMs,
              }
              const logEntry: LogbookEntry = {
                id: nextId('rest'),
                kind: 'rest_note',
                gameDay,
                gameTime,
                note: body,
              }
              return {
                messages,
                plannedRest,
                logbook: pruneLogbook(state.logbook, [logEntry]),
              }
            }
            return { messages }
          })
        },

        ingestJob: (job, telemetry, clockShift, clockStyle, strings, options, nowMs = Date.now()) => {
          const isZh = isChinese(strings)
          const cabNow = telemetry ? cabClock(telemetry, clockShift) : clockShift
          const cabOffset = telemetry ? cabNow - telemetry.gameTime : clockShift
          const newMessages: SimMessage[] = []

          if (!job.active) {
            if (tracker.lastJobSnapshot && tracker.lastJobKey && !tracker.resolvedJobKeys.has(tracker.lastJobKey)) {
              tracker.pendingClearedJob = {
                job: tracker.lastJobSnapshot,
                clearedAtMs: nowMs,
                gameTime: telemetry?.gameTime ?? 0,
                cabNow,
              }
            }
            tracker.lastJobKey = null
            tracker.lastCargoLoaded = false
            tracker.lastJobSnapshot = null
            tracker.lastDamageReported = 0
            return
          }

          tracker.pendingClearedJob = null
          const key = jobIdentity(job)
          const from = resolveLocalizedCity(job.sourceCity, undefined, isZh)
          const to = resolveLocalizedCity(job.destinationCity, undefined, isZh)
          const cargo = job.cargo || strings.freight.waybill.cargoLabel

          if (tracker.lastJobKey !== key) {
            tracker.lastJobKey = key
            tracker.lastCargoLoaded = job.cargoLoaded
            tracker.lastJobSnapshot = job
            tracker.lastDamageReported = Math.round((telemetry?.cargoDamage ?? 0) * 100)
            tracker.lastDamageAtMs = nowMs
            tracker.tightAlertedJobKey = null
            tracker.lateAlertedJobKey = null

            const deadlineClock = job.deliveryTime + cabOffset
            const deadlineDay = strings.days[Math.floor(deadlineClock / 1440) % 7] ?? ''
            const deadlineTime = formatGameTime(deadlineClock, clockStyle)
            const deadlineStr = deadlineDay ? `${deadlineDay} ${deadlineTime}` : deadlineTime

            newMessages.push({
              id: nextId('job'),
              thread: 'dispatch',
              sender: 'them',
              body: strings.messages.events.jobAssigned(from, to, cargo, deadlineStr),
              gameTime: cabNow,
              createdAt: nowMs,
              read: false,
              priority: 'high',
            })
          } else {
            tracker.lastJobSnapshot = job
            if (!tracker.lastCargoLoaded && job.cargoLoaded) {
              tracker.lastCargoLoaded = true
              newMessages.push({
                id: nextId('load'),
                thread: 'dispatch',
                sender: 'them',
                body: strings.messages.events.cargoLoaded(cargo, to),
                gameTime: cabNow,
                createdAt: nowMs,
                read: false,
                priority: 'high',
              })
            }
          }

          commit(newMessages, [], strings, options, nowMs)
        },

        ingestTelemetry: (telemetry, job, clockShift, mph, strings, options, nowMs = Date.now()) => {
          const isZh = isChinese(strings)
          const cabNow = cabClock(telemetry, clockShift)
          const newMessages: SimMessage[] = []
          const newLogs: LogbookEntry[] = []

          // Fallback delivery recording when job cleared and no gameplayEvent arrived (older plugin).
          if (tracker.pendingClearedJob && nowMs - tracker.pendingClearedJob.clearedAtMs >= JOB_CLEAR_GRACE_MS) {
            const pending = tracker.pendingClearedJob
            const key = jobIdentity(pending.job)
            tracker.pendingClearedJob = null
            if (!tracker.resolvedJobKeys.has(key) && pending.job.cargoLoaded) {
              tracker.resolvedJobKeys.add(key)
              const from = resolveLocalizedCity(pending.job.sourceCity, undefined, isZh)
              const to = resolveLocalizedCity(pending.job.destinationCity, undefined, isZh)
              const cargo = pending.job.cargo || strings.freight.waybill.cargoLabel
              newMessages.push({
                id: nextId('done-fb'),
                thread: 'dispatch',
                sender: 'them',
                body: strings.messages.events.jobDeliveredSimple(from, to, cargo),
                gameTime: cabNow,
                createdAt: nowMs,
                read: false,
                priority: 'high',
              })
              newLogs.push({
                id: nextId('log-fb'),
                kind: 'delivered',
                gameDay: Math.max(0, Math.floor(pending.cabNow / 1440)),
                gameTime: pending.cabNow,
                cargo,
                cargoMass: pending.job.cargoMass,
                sourceCity: pending.job.sourceCity,
                sourceCompany: pending.job.sourceCompany,
                destinationCity: pending.job.destinationCity,
                destinationCompany: pending.job.destinationCompany,
                distanceKm: pending.job.plannedDistanceKm,
                income: pending.job.income,
                onTime: pending.gameTime <= pending.job.deliveryTime,
              })
            }
          }

          // Active job schedule & cargo damage checks
          if (job?.active) {
            const key = jobIdentity(job)
            if (job.deliveryTime > 0 && telemetry.gameTime > 0) {
              const buffer = evaluateBuffer(job.deliveryTime, telemetry.gameTime, telemetry.navigationTime, isZh)
              if (buffer.status === 'late' && tracker.lateAlertedJobKey !== key) {
                tracker.lateAlertedJobKey = key
                tracker.tightAlertedJobKey = key
                newMessages.push({
                  id: nextId('late'),
                  thread: 'dispatch',
                  sender: 'them',
                  body: strings.messages.events.scheduleLate,
                  gameTime: cabNow,
                  createdAt: nowMs,
                  read: false,
                  priority: 'high',
                })
              } else if (
                buffer.status === 'tight' &&
                telemetry.navigationTime > 0 &&
                tracker.tightAlertedJobKey !== key
              ) {
                tracker.tightAlertedJobKey = key
                newMessages.push({
                  id: nextId('tight'),
                  thread: 'dispatch',
                  sender: 'them',
                  body: strings.messages.events.scheduleTight(formatDuration(Math.max(0, buffer.bufferMinutes), isZh)),
                  gameTime: cabNow,
                  createdAt: nowMs,
                  read: false,
                  priority: 'high',
                })
              }
            }

            const dmgPercent = Math.round((telemetry.cargoDamage ?? 0) * 100)
            if (dmgPercent >= tracker.lastDamageReported + 2 && nowMs - tracker.lastDamageAtMs >= DAMAGE_COOLDOWN_MS) {
              tracker.lastDamageReported = dmgPercent
              tracker.lastDamageAtMs = nowMs
              newMessages.push({
                id: nextId('dmg'),
                thread: 'dispatch',
                sender: 'them',
                body: strings.messages.events.cargoDamageSpike(dmgPercent),
                gameTime: cabNow,
                createdAt: nowMs,
                read: false,
                priority: 'high',
              })
            }
          }

          // Vehicle / Fleet alerts only when truck electrics are powered on
          if (telemetry.electricEnabled) {
            // 1. Low fuel with hysteresis (< 250 km triggers, > 400 km resets)
            if (telemetry.fuelRange > 0 && telemetry.fuelRange < 250) {
              if (!tracker.lowFuelAlerted) {
                tracker.lowFuelAlerted = true
                newMessages.push({
                  id: nextId('fuel'),
                  thread: 'fleet',
                  sender: 'them',
                  body: strings.messages.events.lowFuel(formatFuelRange(telemetry.fuelRange, mph)),
                  gameTime: cabNow,
                  createdAt: nowMs,
                  read: false,
                  priority: 'high',
                  action: { kind: 'addStop', stopType: 'fuel' },
                })
              }
            } else if (telemetry.fuelRange >= 400) {
              tracker.lowFuelAlerted = false
            }

            // 2. Fatigue / HOS (only if fatigue is enabled in game: i.e. positive rest stop observed or positive window)
            const restMin = telemetry.nextRestStop
            if (restMin !== undefined) {
              if (restMin > 0) tracker.sawPositiveRestStop = true
              if (restMin > 180) {
                tracker.restSoonAlerted = false
                tracker.restOverdueAlerted = false
              } else if (restMin > 60) {
                tracker.restOverdueAlerted = false
              }

              if (restMin > 0 && restMin <= 90 && !tracker.restSoonAlerted) {
                tracker.restSoonAlerted = true
                newMessages.push({
                  id: nextId('rest-soon'),
                  thread: 'fleet',
                  sender: 'them',
                  body: strings.messages.events.restSoon(formatDuration(restMin, isZh)),
                  gameTime: cabNow,
                  createdAt: nowMs,
                  read: false,
                  priority: 'high',
                  action: { kind: 'addStop', stopType: 'rest' },
                })
              } else if (
                restMin <= 0 &&
                tracker.sawPositiveRestStop &&
                telemetry.engineEnabled &&
                !tracker.restOverdueAlerted
              ) {
                tracker.restOverdueAlerted = true
                tracker.restSoonAlerted = true
                newMessages.push({
                  id: nextId('rest-overdue'),
                  thread: 'fleet',
                  sender: 'them',
                  body: strings.messages.events.restOverdue,
                  gameTime: cabNow,
                  createdAt: nowMs,
                  read: false,
                  priority: 'high',
                  action: { kind: 'addStop', stopType: 'rest' },
                })
              }
            }

            // 3. Brake air pressure alert
            if (telemetry.brakeAirPressureWarning && telemetry.engineEnabled) {
              if (!tracker.airWarningAlerted) {
                tracker.airWarningAlerted = true
                newMessages.push({
                  id: nextId('air'),
                  thread: 'fleet',
                  sender: 'them',
                  body: strings.messages.events.airPressureLow,
                  gameTime: cabNow,
                  createdAt: nowMs,
                  read: false,
                  priority: 'high',
                })
              }
            } else if (!telemetry.brakeAirPressureWarning) {
              tracker.airWarningAlerted = false
            }

            // 4. Component high wear (>= 20% triggers, < 12% resets)
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
            if (worst.fraction >= 0.2) {
              if (!tracker.highWearAlerted) {
                tracker.highWearAlerted = true
                newMessages.push({
                  id: nextId('wear'),
                  thread: 'fleet',
                  sender: 'them',
                  body: strings.messages.events.highWear(worst.name, worst.percentText),
                  gameTime: cabNow,
                  createdAt: nowMs,
                  read: false,
                  priority: 'high',
                  action: { kind: 'addStop', stopType: 'service' },
                })
              }
            } else if (worst.fraction < 0.12) {
              tracker.highWearAlerted = false
            }
          }

          commit(newMessages, newLogs, strings, options, nowMs)
        },

        ingestWeather: (weather, telemetry, clockShift, strings, options, nowMs = Date.now()) => {
          if (!weather) {
            tracker.lastWeatherSky = null
            tracker.rainAlertedThisShower = false
            return
          }
          if (!telemetry) return

          if (weather.now === 'clear' && weather.coming === 'clear') {
            tracker.rainAlertedThisShower = false
          }

          const turningToRain = weather.now === 'clear' && weather.coming === 'rain'
          const justStartedRain = tracker.lastWeatherSky === 'clear' && weather.now === 'rain'
          tracker.lastWeatherSky = weather.now

          if ((!turningToRain && !justStartedRain) || tracker.rainAlertedThisShower) return

          const cabNow = cabClock(telemetry, clockShift)
          if (
            tracker.rainAlertedAtGameTime !== null &&
            cabNow >= tracker.rainAlertedAtGameTime &&
            cabNow - tracker.rainAlertedAtGameTime < 120
          ) {
            return
          }

          tracker.rainAlertedThisShower = true
          tracker.rainAlertedAtGameTime = cabNow
          commit(
            [
              {
                id: nextId('wx'),
                thread: 'fleet',
                sender: 'them',
                body: turningToRain ? strings.messages.events.rainTurning : strings.messages.events.rainStarted,
                gameTime: cabNow,
                createdAt: nowMs,
                read: false,
                priority: 'high',
              },
            ],
            [],
            strings,
            options,
            nowMs,
          )
        },

        ingestGameplayEvent: (event, currentJob, telemetry, clockShift, mph, strings, options, nowMs = Date.now()) => {
          const isZh = isChinese(strings)
          const cabShift = (telemetry?.multiplayerTimeOffset ?? 0) + clockShift
          const eventTime = event.gameTime > 0 ? event.gameTime : (telemetry?.gameTime ?? 0)
          const cabTime = eventTime + cabShift
          const gameDay = Math.max(0, Math.floor(cabTime / 1440))
          const refJob = currentJob?.active ? currentJob : (tracker.pendingClearedJob?.job ?? tracker.lastJobSnapshot)
          const newMessages: SimMessage[] = []
          const newLogs: LogbookEntry[] = []

          if (event.kind === GAMEPLAY_EVENT_JOB_DELIVERED) {
            if (refJob) tracker.resolvedJobKeys.add(jobIdentity(refJob))
            tracker.pendingClearedJob = null

            const from = resolveLocalizedCity(refJob?.sourceCity, undefined, isZh)
            const to = resolveLocalizedCity(refJob?.destinationCity, undefined, isZh)
            const cargo = refJob?.cargo || strings.freight.waybill.cargoLabel
            const distText = formatDistance(event.distanceKm || refJob?.plannedDistanceKm || 0, mph)
            const incomeText = formatMoney(event.amount, mph)
            const autoPark = Boolean(event.flags & GAMEPLAY_FLAG_AUTO_PARK)
            const parkNote = autoPark ? strings.messages.events.autoParkNote : strings.messages.events.manualParkNote

            newMessages.push({
              id: nextId('deliv'),
              thread: 'dispatch',
              sender: 'them',
              body: strings.messages.events.jobDeliveredReceipt(
                from,
                to,
                cargo,
                distText,
                incomeText,
                event.earnedXp,
                parkNote,
              ),
              gameTime: cabTime,
              createdAt: nowMs,
              read: false,
              priority: 'high',
            })
            newLogs.push({
              id: nextId('log-deliv'),
              kind: 'delivered',
              gameDay,
              gameTime: cabTime,
              cargo,
              cargoMass: refJob?.cargoMass,
              sourceCity: refJob?.sourceCity,
              sourceCompany: refJob?.sourceCompany,
              destinationCity: refJob?.destinationCity,
              destinationCompany: refJob?.destinationCompany,
              distanceKm: event.distanceKm || refJob?.plannedDistanceKm || 0,
              income: event.amount,
              earnedXp: event.earnedXp,
              cargoDamage: event.cargoDamage,
              onTime: refJob && refJob.deliveryTime > 0 ? eventTime <= refJob.deliveryTime : true,
              autoPark,
            })
          } else if (event.kind === GAMEPLAY_EVENT_JOB_CANCELLED) {
            if (refJob) tracker.resolvedJobKeys.add(jobIdentity(refJob))
            tracker.pendingClearedJob = null
            const penalty = Math.max(0, event.amount)
            newMessages.push({
              id: nextId('cancel'),
              thread: 'dispatch',
              sender: 'them',
              body: strings.messages.events.jobCancelled(formatMoney(penalty, mph)),
              gameTime: cabTime,
              createdAt: nowMs,
              read: false,
              priority: 'high',
            })
            newLogs.push({
              id: nextId('log-cancel'),
              kind: 'cancelled',
              gameDay,
              gameTime: cabTime,
              cargo: refJob?.cargo,
              sourceCity: refJob?.sourceCity,
              destinationCity: refJob?.destinationCity,
              expense: penalty,
            })
          } else if (event.kind === GAMEPLAY_EVENT_FINED) {
            const amount = Math.max(0, event.amount)
            const offenceName = strings.messages.offences[event.code] ?? strings.messages.offences.generic
            newMessages.push({
              id: nextId('fine'),
              thread: 'traffic',
              sender: 'them',
              body: strings.messages.events.fineTicket(offenceName, formatMoney(amount, mph)),
              gameTime: cabTime,
              createdAt: nowMs,
              read: false,
              priority: 'high',
            })
            newLogs.push({
              id: nextId('log-fine'),
              kind: 'fine',
              gameDay,
              gameTime: cabTime,
              expense: amount,
              offenceCode: event.code,
            })
          } else if (event.kind === GAMEPLAY_EVENT_TOLLGATE_PAID) {
            const amount = Math.max(0, event.amount)
            newMessages.push({
              id: nextId('toll'),
              thread: 'traffic',
              sender: 'them',
              body: strings.messages.events.tollPaid(formatMoney(amount, mph)),
              gameTime: cabTime,
              createdAt: nowMs,
              read: false,
              priority: 'normal',
            })
            newLogs.push({
              id: nextId('log-toll'),
              kind: 'toll',
              gameDay,
              gameTime: cabTime,
              expense: amount,
            })
          } else if (event.kind === GAMEPLAY_EVENT_FERRY_USED || event.kind === GAMEPLAY_EVENT_TRAIN_USED) {
            const amount = Math.max(0, event.amount)
            const isFerry = event.kind === GAMEPLAY_EVENT_FERRY_USED
            const from = resolveLocalizedCity(event.source || '--', undefined, isZh)
            const to = resolveLocalizedCity(event.target || '--', undefined, isZh)
            newMessages.push({
              id: nextId(isFerry ? 'ferry' : 'train'),
              thread: 'traffic',
              sender: 'them',
              body: isFerry
                ? strings.messages.events.ferryTicket(from, to, formatMoney(amount, mph))
                : strings.messages.events.trainTicket(from, to, formatMoney(amount, mph)),
              gameTime: cabTime,
              createdAt: nowMs,
              read: false,
              priority: 'high',
            })
            newLogs.push({
              id: nextId(isFerry ? 'log-ferry' : 'log-train'),
              kind: isFerry ? 'ferry' : 'train',
              gameDay,
              gameTime: cabTime,
              sourceCity: event.source,
              destinationCity: event.target,
              expense: amount,
            })
          }

          commit(newMessages, newLogs, strings, options, nowMs)
        },

        ingestTruckersMp: (on, nearbyCount, telemetry, clockShift, strings, options, nowMs = Date.now()) => {
          const cabNow = telemetry ? cabClock(telemetry, clockShift) : clockShift
          const newMessages: SimMessage[] = []
          if (on && !tracker.lastTmpActive) {
            tracker.lastTmpActive = true
            newMessages.push({
              id: nextId('tmp-join'),
              thread: 'convoy',
              sender: 'them',
              body: strings.messages.events.convoyJoined,
              gameTime: cabNow,
              createdAt: nowMs,
              read: false,
              priority: 'normal',
            })
          } else if (!on) {
            tracker.lastTmpActive = false
          }

          if (on && nearbyCount >= 8 && nowMs - tracker.lastNearbySurgeAtMs >= CONVOY_BUSY_COOLDOWN_MS) {
            tracker.lastNearbySurgeAtMs = nowMs
            newMessages.push({
              id: nextId('tmp-busy'),
              thread: 'convoy',
              sender: 'them',
              body: strings.messages.events.convoyBusy(nearbyCount),
              gameTime: cabNow,
              createdAt: nowMs,
              read: false,
              priority: 'normal',
            })
          }

          commit(newMessages, [], strings, options, nowMs)
        },
      }
    },
    {
      name: IS_DEMO ? 'westplay.simulation.demo' : 'westplay.simulation',
      // 2: Do Not Disturb defaults to enabled so new and upgraded installs start silent until toggled off.
      version: 2,
      migrate: (stored, version) => {
        const kept = (stored ?? {}) as Partial<PersistedSimulation>
        if (version < 2) return { ...kept, dnd: true }
        return kept
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedSimulation => ({
        messages: state.messages,
        logbook: state.logbook,
        plannedRest: state.plannedRest,
        activeThread: state.activeThread,
        dnd: state.dnd,
      }),
      merge: (stored, current) => ({
        ...current,
        ...sanitizeSimulation(stored as Partial<PersistedSimulation> | undefined),
      }),
    },
  ),
)

const VALID_THREADS: ReadonlySet<string> = new Set<ThreadId>(THREAD_ORDER)

function sanitizeSimulation(stored: Partial<PersistedSimulation> | undefined): Partial<PersistedSimulation> {
  if (!stored) return {}
  const out: Partial<PersistedSimulation> = {}
  if (Array.isArray(stored.messages)) {
    out.messages = stored.messages
      .filter(
        (m): m is SimMessage =>
          Boolean(m) &&
          typeof m.id === 'string' &&
          typeof m.body === 'string' &&
          VALID_THREADS.has(m.thread) &&
          (m.sender === 'them' || m.sender === 'me'),
      )
      .slice(-MAX_MESSAGES_TOTAL)
  }
  if (Array.isArray(stored.logbook)) {
    out.logbook = stored.logbook.filter(
      (e): e is LogbookEntry =>
        Boolean(e) && typeof e.id === 'string' && typeof e.gameDay === 'number' && typeof e.kind === 'string',
    )
  }
  if (
    stored.plannedRest &&
    typeof stored.plannedRest.gameDay === 'number' &&
    typeof stored.plannedRest.note === 'string'
  ) {
    out.plannedRest = stored.plannedRest
  }
  if (typeof stored.activeThread === 'string' && VALID_THREADS.has(stored.activeThread)) {
    out.activeThread = stored.activeThread as ThreadId
  }
  if (typeof stored.dnd === 'boolean') {
    out.dnd = stored.dnd
  }
  return out
}

/** Builds deterministic demo messages and multi-day logbook entries for `?preview` / `?demo` browser previews. */
export function createPreviewSimulation(
  strings: Strings,
  mph: boolean,
): { messages: SimMessage[]; logbook: LogbookEntry[]; plannedRest: PlannedRestNote | null } {
  const isZh = isChinese(strings)
  const todayBase = 3780 // Wed 15:00 (Day 2)
  const monBase = 720 // Mon 12:00 (Day 0)
  const tueBase = 2310 // Tue 14:30 (Day 1)

  const messages: SimMessage[] = [
    {
      id: 'preview-dispatch-1',
      thread: 'dispatch',
      sender: 'them',
      body: strings.messages.events.jobAssigned(
        resolveLocalizedCity('Duisburg', undefined, isZh),
        resolveLocalizedCity('Amsterdam', undefined, isZh),
        isZh ? '酸奶' : 'Yogurt',
        isZh ? '周三 23:30' : 'Wed 23:30',
      ),
      gameTime: todayBase - 140,
      createdAt: 1,
      read: true,
      priority: 'high',
    },
    {
      id: 'preview-dispatch-2',
      thread: 'dispatch',
      sender: 'me',
      body: strings.messages.quickReplies.ackOnWay,
      gameTime: todayBase - 135,
      createdAt: 2,
      read: true,
      priority: 'normal',
    },
    {
      id: 'preview-dispatch-3',
      thread: 'dispatch',
      sender: 'them',
      body: strings.messages.events.scheduleTight(formatDuration(55, isZh)),
      gameTime: todayBase - 12,
      createdAt: 3,
      read: false,
      priority: 'high',
    },
    {
      id: 'preview-fleet-1',
      thread: 'fleet',
      sender: 'them',
      body: strings.messages.events.lowFuel(formatFuelRange(215, mph)),
      gameTime: todayBase - 25,
      createdAt: 4,
      read: false,
      priority: 'high',
      action: { kind: 'addStop', stopType: 'fuel' },
    },
    {
      id: 'preview-fleet-2',
      thread: 'fleet',
      sender: 'them',
      body: strings.messages.events.restSoon(formatDuration(85, isZh)),
      gameTime: todayBase - 8,
      createdAt: 5,
      read: true,
      priority: 'high',
      action: { kind: 'addStop', stopType: 'rest' },
    },
    {
      id: 'preview-traffic-1',
      thread: 'traffic',
      sender: 'them',
      body: strings.messages.events.tollPaid(formatMoney(18, mph)),
      gameTime: todayBase - 90,
      createdAt: 6,
      read: true,
      priority: 'normal',
    },
    {
      id: 'preview-traffic-2',
      thread: 'traffic',
      sender: 'them',
      body: strings.messages.events.fineTicket(
        strings.messages.offences.speeding_camera ?? strings.messages.offences.generic,
        formatMoney(320, mph),
      ),
      gameTime: todayBase - 40,
      createdAt: 7,
      read: false,
      priority: 'high',
    },
  ]

  const logbook: LogbookEntry[] = [
    {
      id: 'preview-log-mon-1',
      kind: 'delivered',
      gameDay: 0,
      gameTime: monBase + 180,
      cargo: isZh ? '电子精密元件' : 'Electronics',
      cargoMass: 12400,
      sourceCity: 'Berlin',
      sourceCompany: 'TradeAux',
      destinationCity: 'Hannover',
      destinationCompany: 'Kaarfor',
      distanceKm: 288,
      income: 11200,
      earnedXp: 360,
      cargoDamage: 0,
      onTime: true,
      autoPark: false,
    },
    {
      id: 'preview-log-mon-toll',
      kind: 'toll',
      gameDay: 0,
      gameTime: monBase + 95,
      expense: 24,
    },
    {
      id: 'preview-log-tue-1',
      kind: 'delivered',
      gameDay: 1,
      gameTime: tueBase + 220,
      cargo: isZh ? '建筑钢材' : 'Steel Beams',
      cargoMass: 21500,
      sourceCity: 'Hannover',
      sourceCompany: 'Sanbuilders',
      destinationCity: 'Duisburg',
      destinationCompany: 'ITCC',
      distanceKm: 312,
      income: 14600,
      earnedXp: 420,
      cargoDamage: 0.01,
      onTime: true,
      autoPark: true,
    },
    {
      id: 'preview-log-tue-ferry',
      kind: 'ferry',
      gameDay: 1,
      gameTime: tueBase + 60,
      sourceCity: 'Calais',
      destinationCity: 'Dover',
      expense: 480,
    },
    {
      id: 'preview-log-wed-fine',
      kind: 'fine',
      gameDay: 2,
      gameTime: todayBase - 40,
      expense: 320,
      offenceCode: 'speeding_camera',
    },
    {
      id: 'preview-log-wed-toll',
      kind: 'toll',
      gameDay: 2,
      gameTime: todayBase - 90,
      expense: 18,
    },
  ]

  return { messages, logbook, plannedRest: null }
}

export function clockStyleFor(hours24: boolean, strings: Strings): ClockStyle {
  return hours24 ? { hours24: true, period: null } : { hours24: false, period: strings.timeOfDay }
}

/** Shared React hook selector for the Messages unread badge. */
export function useMessagesUnreadCount(): number {
  return useSimulation((state) => countUnread(state.messages))
}
