import { type ClockStyle, formatGameTime } from '../../../shared/format'
import { cabClock, type GameWeather, type JobInfo, type Telemetry } from '../../../shared/host'
import type { MapLabel } from '../../maps/mapData'
import type { QuickStopCategory } from '../../maps/quickStop'
import { formatDistance, formatMoney, type LogbookEntry } from '../../state/simulation'
import type { Strings } from '../../state/strings'
import {
  calculateJourneyTimeline,
  evaluateBuffer,
  evaluateHos,
  evaluateWear,
  resolveLocalizedCity,
} from '../freight/freight'

export type ScheduleTone = 'blue' | 'orange' | 'warn' | 'bad' | 'green' | 'cyan' | 'neutral'

export interface CalendarEventItem {
  id: string
  tone: ScheduleTone
  timeText: string
  sortMinutes: number
  title: string
  subtitle?: string
  meta?: string
  statusText?: string
  amountText?: string
  amountTone?: 'good' | 'bad' | 'neutral'
  action?: {
    stopType: QuickStopCategory
    label: string
  }
}

export interface WeekDaySlot {
  gameDay: number
  weekdayIndex: number
  dayOfMonth: number
  shortLabel: string
  isToday: boolean
  dots: ('blue' | 'orange' | 'green')[]
}

export interface PeriodSummary {
  deliveredCount: number
  distanceKm: number
  grossIncome: number
  roadExpenses: number
  netProfit: number
}

export interface LiveScheduleContext {
  telemetry: Telemetry | null
  job: JobInfo | null
  weather: GameWeather | null
  clockShift: number
  mph: boolean
  routeStopsCount: number
  labels?: readonly MapLabel[]
  hasOverdueHosAlert?: boolean
}

function isChinese(strings: Strings): boolean {
  return strings.locale.toLowerCase().startsWith('zh')
}

/** Computes the 7-day Monday..Sunday strip containing `todayGameDay` (or `todayWeekday` when no game). */
export function buildWeekDays(
  todayGameDay: number | null,
  todayWeekday: number,
  todayDate: Date,
  logbook: readonly LogbookEntry[],
  live: LiveScheduleContext,
  strings: Strings,
): WeekDaySlot[] {
  const anchorDay = todayGameDay ?? todayWeekday
  const weekStart = anchorDay - (((anchorDay % 7) + 7) % 7)
  const cabOffset = live.telemetry
    ? cabClock(live.telemetry, live.clockShift) - live.telemetry.gameTime
    : live.clockShift
  const deadlineDay =
    live.job?.active && live.job.deliveryTime > 0 ? Math.floor((live.job.deliveryTime + cabOffset) / 1440) : null

  return Array.from({ length: 7 }, (_, idx) => {
    const gameDay = weekStart + idx
    const delta = gameDay - anchorDay
    const slotDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + delta)
    const dots: ('blue' | 'orange' | 'green')[] = []

    const hasLiveJob = Boolean(
      live.job?.active &&
      live.telemetry &&
      (gameDay === anchorDay || (deadlineDay !== null && gameDay === deadlineDay)),
    )
    const dayLogs = logbook.filter((e) => e.gameDay === gameDay)
    const hasDelivered = dayLogs.some((e) => e.kind === 'delivered')
    const hasRestOrMaint =
      dayLogs.some((e) => e.kind === 'rest_note' || e.kind === 'fine') ||
      (gameDay === anchorDay && hasMaintenanceOrRest(live))

    if (hasLiveJob) dots.push('blue')
    if (hasRestOrMaint) dots.push('orange')
    if (hasDelivered) dots.push('green')

    return {
      gameDay,
      weekdayIndex: idx,
      dayOfMonth: slotDate.getDate(),
      shortLabel: strings.days[idx] ?? '',
      isToday: gameDay === anchorDay,
      dots,
    }
  })
}

function hasMaintenanceOrRest(live: LiveScheduleContext): boolean {
  if (!live.telemetry) return false
  const navSec = live.telemetry.navigationTime ?? 0
  const hos = evaluateHos(live.telemetry.nextRestStop, navSec, false)
  const restRelevant =
    (live.telemetry.nextRestStop !== undefined && live.telemetry.nextRestStop > 0 && hos.needRestEnRoute) ||
    Boolean(live.hasOverdueHosAlert)
  const wears = [
    live.telemetry.wearEngine ?? 0,
    live.telemetry.wearTransmission ?? 0,
    live.telemetry.wearCabin ?? 0,
    live.telemetry.wearChassis ?? 0,
    live.telemetry.wearWheels ?? 0,
  ]
  const maxWear = Math.max(...wears)
  return restRelevant || maxWear >= 0.15
}

/** Synthesizes the chronological schedule & driving logbook items for `selectedDay`. */
export function buildDaySchedule(
  selectedDay: number,
  todayDay: number,
  live: LiveScheduleContext,
  logbook: readonly LogbookEntry[],
  clockStyle: ClockStyle,
  strings: Strings,
): CalendarEventItem[] {
  const isZh = isChinese(strings)
  const items: CalendarEventItem[] = []
  const telemetry = live.telemetry
  const isToday = selectedDay === todayDay

  if (telemetry) {
    const cabNow = cabClock(telemetry, live.clockShift)
    const cabOffset = cabNow - telemetry.gameTime

    // 1. Live active job (today & future deadline day)
    if (live.job?.active) {
      const cargo = live.job.cargo || strings.freight.waybill.cargoLabel
      const from = resolveLocalizedCity(live.job.sourceCity, live.labels, isZh)
      const to = resolveLocalizedCity(live.job.destinationCity, live.labels, isZh)
      const etaMinutes = cabNow + Math.ceil(Math.max(0, telemetry.navigationTime) / 60)
      const deadlineClock = live.job.deliveryTime > 0 ? live.job.deliveryTime + cabOffset : 0
      const etaStr = telemetry.navigationTime > 0 ? formatGameTime(etaMinutes, clockStyle) : '--'
      const deadlineStr = deadlineClock > 0 ? formatGameTime(deadlineClock, clockStyle) : '--'
      const deadlineDay = deadlineClock > 0 ? Math.floor(deadlineClock / 1440) : todayDay
      const buffer = evaluateBuffer(live.job.deliveryTime, telemetry.gameTime, telemetry.navigationTime, isZh)

      if (isToday) {
        items.push({
          id: 'live-active-job',
          tone: buffer.status === 'late' ? 'bad' : buffer.status === 'tight' ? 'warn' : 'blue',
          timeText: formatGameTime(cabNow, clockStyle),
          sortMinutes: cabNow,
          title: strings.calendar.events.activeJobTitle(cargo),
          subtitle: strings.calendar.events.activeJobRoute(from, to),
          meta: strings.calendar.events.activeJobMeta(etaStr, deadlineStr),
          statusText:
            buffer.status === 'late'
              ? strings.calendar.status.late
              : buffer.status === 'tight'
                ? strings.calendar.status.tight
                : strings.calendar.status.active,
          amountText: formatMoney(live.job.income, live.mph),
          amountTone: 'neutral',
        })
      } else if (deadlineDay === selectedDay && deadlineDay > todayDay) {
        items.push({
          id: 'live-job-deadline',
          tone: buffer.status === 'late' ? 'bad' : 'blue',
          timeText: deadlineStr,
          sortMinutes: deadlineClock,
          title: strings.calendar.events.deadlineMilestone(cargo, to),
          subtitle: strings.calendar.events.activeJobRoute(from, to),
          meta: strings.calendar.events.deadlineMilestoneMeta(deadlineStr),
          statusText: buffer.status === 'late' ? strings.calendar.status.late : strings.calendar.status.active,
        })
      }
    }

    if (isToday) {
      // 2. HOS / Mandatory rest window
      const hos = evaluateHos(telemetry.nextRestStop, telemetry.navigationTime, isZh)
      const showRestWindow =
        (telemetry.nextRestStop !== undefined && telemetry.nextRestStop > 0 && hos.needRestEnRoute) ||
        Boolean(live.hasOverdueHosAlert)

      if (showRestWindow) {
        const timeline = calculateJourneyTimeline(
          telemetry.gameTime,
          telemetry.navigationTime,
          telemetry.nextRestStop,
          live.job?.deliveryTime ?? telemetry.gameTime + 9999,
        )
        const restStartCab = cabNow + Math.max(0, telemetry.nextRestStop ?? 0)
        const subtitle = hos.isOverdue
          ? strings.calendar.events.restWindowOverdue
          : !live.job?.active || timeline.canDeliverAfterRest
            ? strings.calendar.events.restWindowPunctual
            : strings.calendar.events.restWindowTight
        items.push({
          id: 'live-hos-rest',
          tone: hos.isOverdue ? 'bad' : 'orange',
          timeText: formatGameTime(restStartCab, clockStyle),
          sortMinutes: restStartCab,
          title: strings.calendar.events.restWindowTitle,
          subtitle,
          statusText: hos.isOverdue ? strings.calendar.status.late : strings.calendar.status.recommended,
          action: { stopType: 'rest', label: strings.calendar.addRestStop },
        })
      }

      // 3. Vehicle wear >= 15% maintenance suggestion
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
      if (worst.fraction >= 0.15) {
        items.push({
          id: 'live-maintenance',
          tone: worst.fraction >= 0.25 ? 'bad' : 'warn',
          timeText: formatGameTime(cabNow, clockStyle),
          sortMinutes: cabNow + 1,
          title: strings.calendar.events.maintenanceTitle(worst.name, worst.percentText),
          subtitle: strings.calendar.events.maintenanceSubtitle,
          statusText: strings.calendar.status.recommended,
          action: { stopType: 'service', label: strings.calendar.addServiceStop },
        })
      }

      // 4. Upcoming weather shift
      if (
        live.weather &&
        typeof live.weather.changeIn === 'number' &&
        live.weather.changeIn > 0 &&
        live.weather.now !== live.weather.coming
      ) {
        const at = Math.round(cabNow + live.weather.changeIn)
        const timeStr = formatGameTime(at, clockStyle)
        items.push({
          id: 'live-weather-shift',
          tone: 'cyan',
          timeText: timeStr,
          sortMinutes: at,
          title: strings.calendar.events.weatherShiftTitle(strings.weather[live.weather.coming]),
          subtitle: strings.calendar.events.weatherShiftSubtitle(timeStr),
        })
      }

      // 5. Planned GPS waypoints
      if (live.routeStopsCount > 0) {
        items.push({
          id: 'live-route-stops',
          tone: 'blue',
          timeText: formatGameTime(cabNow, clockStyle),
          sortMinutes: cabNow + 2,
          title: strings.calendar.events.routeStopsTitle(live.routeStopsCount),
          subtitle: strings.calendar.events.routeStopsSubtitle,
        })
      }
    }
  }

  // 6. Persisted Logbook entries for selectedDay
  const dayLogs = logbook.filter((entry) => entry.gameDay === selectedDay)
  for (const entry of dayLogs) {
    const timeText = formatGameTime(entry.gameTime, clockStyle)
    if (entry.kind === 'delivered') {
      const from = resolveLocalizedCity(entry.sourceCity, live.labels, isZh)
      const to = resolveLocalizedCity(entry.destinationCity, live.labels, isZh)
      const cargo = entry.cargo || strings.freight.waybill.cargoLabel
      const dist = formatDistance(entry.distanceKm ?? 0, live.mph)
      const dmg = `${Math.round((entry.cargoDamage ?? 0) * 100)}%`
      items.push({
        id: entry.id,
        tone: 'green',
        timeText,
        sortMinutes: entry.gameTime,
        title: strings.calendar.events.deliveredTitle(from, to),
        subtitle: strings.calendar.events.deliveredSubtitle(cargo, dist, dmg),
        statusText: strings.calendar.status.completed,
        amountText: entry.income ? `+${formatMoney(entry.income, live.mph)}` : undefined,
        amountTone: 'good',
      })
    } else if (entry.kind === 'cancelled') {
      const from = resolveLocalizedCity(entry.sourceCity, live.labels, isZh)
      const to = resolveLocalizedCity(entry.destinationCity, live.labels, isZh)
      const penalty = formatMoney(entry.expense ?? 0, live.mph)
      items.push({
        id: entry.id,
        tone: 'bad',
        timeText,
        sortMinutes: entry.gameTime,
        title: strings.calendar.events.cancelledTitle(from, to),
        subtitle: strings.calendar.events.cancelledSubtitle(penalty),
        statusText: strings.calendar.status.cancelled,
        amountText: entry.expense ? `-${penalty}` : undefined,
        amountTone: 'bad',
      })
    } else if (entry.kind === 'ferry' || entry.kind === 'train') {
      const from = resolveLocalizedCity(entry.sourceCity, live.labels, isZh)
      const to = resolveLocalizedCity(entry.destinationCity, live.labels, isZh)
      items.push({
        id: entry.id,
        tone: 'cyan',
        timeText,
        sortMinutes: entry.gameTime,
        title:
          entry.kind === 'ferry'
            ? strings.calendar.events.ferryTitle(from, to)
            : strings.calendar.events.trainTitle(from, to),
        statusText: strings.calendar.status.recorded,
        amountText: entry.expense ? `-${formatMoney(entry.expense, live.mph)}` : undefined,
        amountTone: 'neutral',
      })
    } else if (entry.kind === 'fine') {
      const offence =
        (entry.offenceCode && strings.messages.offences[entry.offenceCode]) || strings.messages.offences.generic
      items.push({
        id: entry.id,
        tone: 'bad',
        timeText,
        sortMinutes: entry.gameTime,
        title: strings.calendar.events.fineTitle(offence),
        statusText: strings.calendar.status.recorded,
        amountText: entry.expense ? `-${formatMoney(entry.expense, live.mph)}` : undefined,
        amountTone: 'bad',
      })
    } else if (entry.kind === 'toll') {
      items.push({
        id: entry.id,
        tone: 'neutral',
        timeText,
        sortMinutes: entry.gameTime,
        title: strings.calendar.events.tollTitle,
        statusText: strings.calendar.status.recorded,
        amountText: entry.expense ? `-${formatMoney(entry.expense, live.mph)}` : undefined,
        amountTone: 'neutral',
      })
    } else if (entry.kind === 'rest_note') {
      items.push({
        id: entry.id,
        tone: 'orange',
        timeText,
        sortMinutes: entry.gameTime,
        title: strings.calendar.events.restNoteTitle,
        subtitle: strings.calendar.events.restNoteSubtitle,
        statusText: strings.calendar.status.recommended,
      })
    }
  }

  return items.sort((a, b) => a.sortMinutes - b.sortMinutes)
}

export function summarizePeriod(
  logbook: readonly LogbookEntry[],
  fromDayInclusive: number,
  toDayInclusive: number,
): PeriodSummary {
  let deliveredCount = 0
  let distanceKm = 0
  let grossIncome = 0
  let roadExpenses = 0

  for (const entry of logbook) {
    if (entry.gameDay < fromDayInclusive || entry.gameDay > toDayInclusive) continue
    if (entry.kind === 'delivered') {
      deliveredCount += 1
      distanceKm += entry.distanceKm ?? 0
      grossIncome += entry.income ?? 0
    } else if (entry.expense && entry.expense > 0) {
      roadExpenses += entry.expense
    }
  }

  return {
    deliveredCount,
    distanceKm: Math.round(distanceKm),
    grossIncome,
    roadExpenses,
    netProfit: grossIncome - roadExpenses,
  }
}
