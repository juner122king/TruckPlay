import { type ClockStyle, formatGameTime } from '../../../shared/format'
import type { JobInfo, Telemetry } from '../../../shared/host'
import type { MapLabel } from '../../maps/mapData'
import type { QuickStopCategory } from '../../maps/quickStop'
import {
  countUnreadByThread,
  type QuickReplyId,
  type SimMessage,
  THREAD_ORDER,
  type ThreadId,
} from '../../state/simulation'
import type { Strings } from '../../state/strings'
import { formatFuelRange, resolveLocalizedCity } from '../freight/freight'

export const THREAD_QUICK_REPLIES: Record<ThreadId, readonly QuickReplyId[]> = {
  dispatch: ['ack_on_way', 'plan_rest'],
  fleet: ['find_fuel', 'find_rest', 'find_service'],
  traffic: ['confirm_fine'],
  convoy: ['drive_safe'],
}

export interface ThreadSummary {
  id: ThreadId
  name: string
  role: string
  unreadCount: number
  lastMessage: SimMessage | null
}

/** Returns thread ids visible in the sidebar (`convoy` hidden unless active or holding messages). */
export function visibleThreads(messages: readonly SimMessage[], convoyActive: boolean): ThreadId[] {
  const hasConvoyMsg = messages.some((m) => m.thread === 'convoy')
  return THREAD_ORDER.filter((id) => id !== 'convoy' || convoyActive || hasConvoyMsg)
}

/** Builds ordered thread summaries (threads with newer messages sorted first, preserving base order). */
export function buildThreadSummaries(
  messages: readonly SimMessage[],
  convoyActive: boolean,
  strings: Strings,
): ThreadSummary[] {
  const unread = countUnreadByThread(messages)
  const latestByThread = new Map<ThreadId, SimMessage>()
  for (const m of messages) {
    latestByThread.set(m.thread, m)
  }
  const ids = visibleThreads(messages, convoyActive)
  const summaries: ThreadSummary[] = ids.map((id) => ({
    id,
    name: strings.messages.threads[id].name,
    role: strings.messages.threads[id].role,
    unreadCount: unread[id],
    lastMessage: latestByThread.get(id) ?? null,
  }))
  return summaries.sort((a, b) => {
    const ta = a.lastMessage?.createdAt ?? -1
    const tb = b.lastMessage?.createdAt ?? -1
    if (ta !== tb) return tb - ta
    return THREAD_ORDER.indexOf(a.id) - THREAD_ORDER.indexOf(b.id)
  })
}

export function quickReplyLabel(replyId: QuickReplyId, strings: Strings): string {
  switch (replyId) {
    case 'ack_on_way':
      return strings.messages.quickReplies.ackOnWay
    case 'plan_rest':
      return strings.messages.quickReplies.planRest
    case 'find_fuel':
      return strings.messages.quickReplies.findFuel
    case 'find_rest':
      return strings.messages.quickReplies.findRest
    case 'find_service':
      return strings.messages.quickReplies.findService
    case 'confirm_fine':
      return strings.messages.quickReplies.confirmFine
    case 'drive_safe':
      return strings.messages.quickReplies.driveSafe
  }
}

export function quickReplyStopCategory(replyId: QuickReplyId): QuickStopCategory | null {
  switch (replyId) {
    case 'find_fuel':
      return 'fuel'
    case 'find_rest':
      return 'rest'
    case 'find_service':
      return 'service'
    default:
      return null
  }
}

export function stopActionLabel(stopType: QuickStopCategory, strings: Strings): string {
  switch (stopType) {
    case 'fuel':
      return strings.messages.actions.addFuelStop
    case 'rest':
      return strings.messages.actions.addRestStop
    case 'service':
      return strings.messages.actions.addServiceStop
  }
}

export function formatMessageTime(
  gameTime: number,
  currentGameTime: number | null,
  days: readonly string[],
  clockStyle: ClockStyle,
): string {
  const timeStr = formatGameTime(gameTime, clockStyle)
  if (currentGameTime === null) return timeStr
  const msgDay = Math.floor(gameTime / 1440)
  const nowDay = Math.floor(currentGameTime / 1440)
  if (msgDay === nowDay) return timeStr
  const weekday = days[((msgDay % 7) + 7) % 7] ?? ''
  return weekday ? `${weekday} ${timeStr}` : timeStr
}

export type BubbleGroupPosition = 'single' | 'first' | 'middle' | 'last'
export type MessageAlertTone = 'critical' | 'warning' | 'info' | 'success'

export type StreamEntry =
  | { kind: 'divider'; id: string; label: string }
  | {
      kind: 'message'
      message: SimMessage
      groupPos: BubbleGroupPosition
      showStamp: boolean
      alertTone: MessageAlertTone | null
    }

const DIVIDER_GAP_MINUTES = 30

/** Classifies an incoming simulation message into a semantic alert tone (or null for standard bubbles). */
export function classifyMessageAlert(msg: SimMessage): MessageAlertTone | null {
  if (msg.sender === 'me') return null
  const { id } = msg
  if (
    id.startsWith('fine-') ||
    id.startsWith('rest-overdue') ||
    id.startsWith('air-') ||
    id.startsWith('late-') ||
    id.startsWith('dmg-') ||
    id.startsWith('cancel-') ||
    id === 'preview-traffic-2'
  ) {
    return 'critical'
  }
  if (
    id.startsWith('fuel-') ||
    id.startsWith('rest-soon') ||
    id.startsWith('wear-') ||
    id.startsWith('tight-') ||
    id.startsWith('wx-') ||
    id === 'preview-dispatch-3' ||
    id.startsWith('preview-fleet-')
  ) {
    return 'warning'
  }
  if (id.startsWith('deliv-') || id.startsWith('done-fb-')) {
    return 'success'
  }
  if (
    id.startsWith('job-') ||
    id.startsWith('load-') ||
    id.startsWith('ferry-') ||
    id.startsWith('train-') ||
    id === 'preview-dispatch-1'
  ) {
    return 'info'
  }
  if (msg.priority === 'high') {
    if (msg.thread === 'traffic') return 'critical'
    if (msg.thread === 'fleet') return 'warning'
    return 'info'
  }
  return null
}

/** Formats a centered time-divider label for message streams. */
export function formatDividerLabel(
  gameTime: number,
  currentGameTime: number | null,
  days: readonly string[],
  clockStyle: ClockStyle,
  todayLabel: string,
): string {
  const timeStr = formatGameTime(gameTime, clockStyle)
  if (currentGameTime === null) return timeStr
  const msgDay = Math.floor(gameTime / 1440)
  const nowDay = Math.floor(currentGameTime / 1440)
  if (msgDay === nowDay) return `${todayLabel} ${timeStr}`
  const weekday = days[((msgDay % 7) + 7) % 7] ?? ''
  return weekday ? `${weekday} ${timeStr}` : timeStr
}

function sameGameDay(a: number, b: number): boolean {
  return Math.floor(a / 1440) === Math.floor(b / 1440)
}

function hasBreakBetween(a: SimMessage, b: SimMessage): boolean {
  return !sameGameDay(a.gameTime, b.gameTime) || Math.abs(b.gameTime - a.gameTime) >= DIVIDER_GAP_MINUTES
}

/** Groups chronological thread messages with time dividers and iMessage-style consecutive bubble clusters. */
export function groupThreadMessages(
  messages: readonly SimMessage[],
  currentGameTime: number | null,
  days: readonly string[],
  clockStyle: ClockStyle,
  todayLabel: string,
): StreamEntry[] {
  if (messages.length === 0) return []
  const tones = messages.map((m) => classifyMessageAlert(m))
  const isClusterable = (index: number) => !messages[index].action && tones[index] === null
  const entries: StreamEntry[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const prev = i > 0 ? messages[i - 1] : null
    const next = i + 1 < messages.length ? messages[i + 1] : null

    const breakBefore = !prev || hasBreakBetween(prev, msg)
    if (breakBefore) {
      entries.push({
        kind: 'divider',
        id: `div-${msg.id}`,
        label: formatDividerLabel(msg.gameTime, currentGameTime, days, clockStyle, todayLabel),
      })
    }

    const breakAfter = !next || hasBreakBetween(msg, next)
    const joinPrev =
      !breakBefore && prev !== null && prev.sender === msg.sender && isClusterable(i - 1) && isClusterable(i)
    const joinNext =
      !breakAfter && next !== null && next.sender === msg.sender && isClusterable(i) && isClusterable(i + 1)

    let groupPos: BubbleGroupPosition = 'single'
    if (joinPrev && joinNext) groupPos = 'middle'
    else if (joinPrev) groupPos = 'last'
    else if (joinNext) groupPos = 'first'

    entries.push({
      kind: 'message',
      message: msg,
      groupPos,
      showStamp: groupPos === 'single' || groupPos === 'last',
      alertTone: tones[i],
    })
  }

  return entries
}

export interface ThreadLiveStatus {
  tone: 'good' | 'info' | 'warn' | 'bad' | 'neutral'
  label: string
}

export interface ThreadStatusContext {
  job: JobInfo | null
  telemetry: Telemetry | null
  mph: boolean
  truckersmp: boolean
  nearbyCount: number
  threadMessageCount: number
  isZh: boolean
  labels?: readonly MapLabel[]
}

/** Builds a concise live status pill for the active conversation header. */
export function buildThreadLiveStatus(
  thread: ThreadId,
  ctx: ThreadStatusContext,
  strings: Strings,
): ThreadLiveStatus | null {
  switch (thread) {
    case 'dispatch': {
      if (ctx.job?.active) {
        const from = resolveLocalizedCity(ctx.job.sourceCity, ctx.labels, ctx.isZh)
        const to = resolveLocalizedCity(ctx.job.destinationCity, ctx.labels, ctx.isZh)
        return { tone: 'info', label: `${from} → ${to}` }
      }
      return { tone: 'neutral', label: strings.messages.status.idle }
    }
    case 'fleet': {
      if (!ctx.telemetry) return null
      if (ctx.telemetry.brakeAirPressureWarning) {
        return { tone: 'bad', label: strings.messages.alerts.critical }
      }
      const range = ctx.telemetry.fuelRange
      if (range > 0 && range < 250) {
        return { tone: 'warn', label: strings.messages.status.rangeLeft(formatFuelRange(range, ctx.mph)) }
      }
      if (range > 0) {
        return { tone: 'good', label: strings.messages.status.rangeLeft(formatFuelRange(range, ctx.mph)) }
      }
      return { tone: 'good', label: strings.messages.status.fleetOk }
    }
    case 'traffic': {
      if (ctx.threadMessageCount > 0) {
        return { tone: 'neutral', label: strings.messages.status.recordCount(ctx.threadMessageCount) }
      }
      return { tone: 'good', label: strings.messages.status.trafficClear }
    }
    case 'convoy': {
      if (ctx.nearbyCount > 0) {
        return {
          tone: ctx.nearbyCount >= 10 ? 'warn' : 'info',
          label: strings.messages.status.convoyNearby(ctx.nearbyCount),
        }
      }
      if (ctx.truckersmp) {
        return { tone: 'good', label: strings.messages.status.convoyOnline }
      }
      return null
    }
  }
}
