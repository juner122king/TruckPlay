import { describe, expect, it } from 'vitest'
import { HOURS_24 } from '../../../shared/format'
import type { SimMessage } from '../../state/simulation'
import { strings as enStrings } from '../../state/strings/en_us'
import { strings as zhStrings } from '../../state/strings/zh_cn'
import { createPreviewData } from '../freight/freight'
import {
  buildThreadLiveStatus,
  buildThreadSummaries,
  classifyMessageAlert,
  formatMessageTime,
  groupThreadMessages,
  quickReplyStopCategory,
  visibleThreads,
} from './messages'

const msg = (partial: Partial<SimMessage>): SimMessage => ({
  id: 'id',
  thread: 'dispatch',
  sender: 'them',
  body: 'hello',
  gameTime: 1000,
  createdAt: 1,
  read: false,
  priority: 'normal',
  ...partial,
})

describe('messages helpers', () => {
  it('hides convoy thread when inactive and without history, shows it when active', () => {
    expect(visibleThreads([], false)).toEqual(['dispatch', 'fleet', 'traffic'])
    expect(visibleThreads([], true)).toEqual(['dispatch', 'fleet', 'traffic', 'convoy'])
    expect(visibleThreads([msg({ thread: 'convoy' })], false)).toEqual(['dispatch', 'fleet', 'traffic', 'convoy'])
  })

  it('orders threads by latest message timestamp and computes unread counts', () => {
    const messages = [
      msg({ id: '1', thread: 'dispatch', createdAt: 10, read: true }),
      msg({ id: '2', thread: 'traffic', createdAt: 30, read: false }),
      msg({ id: '3', thread: 'fleet', createdAt: 20, read: false }),
      msg({ id: '4', thread: 'fleet', createdAt: 25, read: false }),
    ]
    const summaries = buildThreadSummaries(messages, false, enStrings)
    expect(summaries.map((s) => s.id)).toEqual(['traffic', 'fleet', 'dispatch'])
    expect(summaries[0].unreadCount).toBe(1)
    expect(summaries[1].unreadCount).toBe(2)
    expect(summaries[2].unreadCount).toBe(0)
  })

  it('formats message time with weekday only when day differs from today', () => {
    // Day 2: 2*1440 + 600 = 3480 (10:00)
    expect(formatMessageTime(3480, 3500, zhStrings.days, HOURS_24)).toBe('10:00')
    // Day 1: 1*1440 + 600 = 2040 (Tue 10:00)
    expect(formatMessageTime(2040, 3500, zhStrings.days, HOURS_24)).toBe('周二 10:00')
  })

  it('maps fleet quick replies to route stop categories', () => {
    expect(quickReplyStopCategory('find_fuel')).toBe('fuel')
    expect(quickReplyStopCategory('find_rest')).toBe('rest')
    expect(quickReplyStopCategory('find_service')).toBe('service')
    expect(quickReplyStopCategory('ack_on_way')).toBeNull()
  })

  it('classifies incoming simulation messages into semantic alert tones', () => {
    expect(classifyMessageAlert(msg({ id: 'fine-1', thread: 'traffic', priority: 'high' }))).toBe('critical')
    expect(classifyMessageAlert(msg({ id: 'rest-overdue-1', thread: 'fleet', priority: 'high' }))).toBe('critical')
    expect(classifyMessageAlert(msg({ id: 'air-1', thread: 'fleet', priority: 'high' }))).toBe('critical')
    expect(classifyMessageAlert(msg({ id: 'late-1', thread: 'dispatch', priority: 'high' }))).toBe('critical')
    expect(classifyMessageAlert(msg({ id: 'dmg-1', thread: 'dispatch', priority: 'high' }))).toBe('critical')
    expect(classifyMessageAlert(msg({ id: 'cancel-1', thread: 'dispatch', priority: 'high' }))).toBe('critical')

    expect(classifyMessageAlert(msg({ id: 'fuel-1', thread: 'fleet', priority: 'high' }))).toBe('warning')
    expect(classifyMessageAlert(msg({ id: 'rest-soon-1', thread: 'fleet', priority: 'high' }))).toBe('warning')
    expect(classifyMessageAlert(msg({ id: 'wear-1', thread: 'fleet', priority: 'high' }))).toBe('warning')
    expect(classifyMessageAlert(msg({ id: 'tight-1', thread: 'dispatch', priority: 'high' }))).toBe('warning')
    expect(classifyMessageAlert(msg({ id: 'wx-1', thread: 'fleet', priority: 'high' }))).toBe('warning')

    expect(classifyMessageAlert(msg({ id: 'deliv-1', thread: 'dispatch', priority: 'high' }))).toBe('success')
    expect(classifyMessageAlert(msg({ id: 'done-fb-1', thread: 'dispatch', priority: 'high' }))).toBe('success')

    expect(classifyMessageAlert(msg({ id: 'job-1', thread: 'dispatch', priority: 'high' }))).toBe('info')
    expect(classifyMessageAlert(msg({ id: 'ferry-1', thread: 'traffic', priority: 'high' }))).toBe('info')

    expect(classifyMessageAlert(msg({ id: 'toll-1', thread: 'traffic', priority: 'normal' }))).toBeNull()
    expect(classifyMessageAlert(msg({ id: 'fine-me', sender: 'me', priority: 'high' }))).toBeNull()
  })

  it('groups consecutive same-sender bubbles and inserts time dividers across 30m/day gaps', () => {
    // Day 1 (1440+600=2040), Day 2 (2880+600=3480)
    const now = 3550
    const stream = [
      msg({ id: 'a1', sender: 'me', gameTime: 2040 }),
      msg({ id: 'a2', sender: 'me', gameTime: 2050 }),
      msg({ id: 'a3', sender: 'me', gameTime: 2055 }),
      msg({ id: 'b1', sender: 'them', gameTime: 3480 }),
      msg({
        id: 'b2',
        sender: 'them',
        gameTime: 3520,
        action: { kind: 'addStop', stopType: 'fuel' },
        priority: 'high',
      }),
      msg({ id: 'b3', sender: 'them', gameTime: 3525 }),
    ]

    const entries = groupThreadMessages(stream, now, zhStrings.days, HOURS_24, zhStrings.messages.today)
    expect(entries.map((e) => e.kind)).toEqual([
      'divider',
      'message',
      'message',
      'message',
      'divider',
      'message',
      'divider',
      'message',
      'message',
    ])

    const dividers = entries.filter((e) => e.kind === 'divider')
    expect(dividers.map((d) => d.label)).toEqual(['周二 10:00', '今天 10:00', '今天 10:40'])

    const grouped = entries.filter((e) => e.kind === 'message')
    expect(grouped.map((g) => g.groupPos)).toEqual(['first', 'middle', 'last', 'single', 'single', 'single'])
    expect(grouped.map((g) => g.showStamp)).toEqual([false, false, true, true, true, true])
  })

  it('builds live header status pills per thread and telemetry state', () => {
    const preview = createPreviewData(true)

    const dispatchActive = buildThreadLiveStatus(
      'dispatch',
      {
        job: preview.job,
        telemetry: preview.telemetry,
        mph: false,
        truckersmp: false,
        nearbyCount: 0,
        threadMessageCount: 2,
        isZh: true,
      },
      zhStrings,
    )
    expect(dispatchActive).toEqual({ tone: 'info', label: '杜伊斯堡 → 阿姆斯特丹' })

    const dispatchIdle = buildThreadLiveStatus(
      'dispatch',
      {
        job: null,
        telemetry: null,
        mph: false,
        truckersmp: false,
        nearbyCount: 0,
        threadMessageCount: 0,
        isZh: false,
      },
      enStrings,
    )
    expect(dispatchIdle).toEqual({ tone: 'neutral', label: enStrings.messages.status.idle })

    const fleetLowFuel = buildThreadLiveStatus(
      'fleet',
      {
        job: null,
        telemetry: { ...preview.telemetry, fuelRange: 190 },
        mph: false,
        truckersmp: false,
        nearbyCount: 0,
        threadMessageCount: 1,
        isZh: true,
      },
      zhStrings,
    )
    expect(fleetLowFuel?.tone).toBe('warn')
    expect(fleetLowFuel?.label).toContain('190')

    const convoyBusy = buildThreadLiveStatus(
      'convoy',
      {
        job: null,
        telemetry: null,
        mph: false,
        truckersmp: true,
        nearbyCount: 12,
        threadMessageCount: 1,
        isZh: true,
      },
      zhStrings,
    )
    expect(convoyBusy).toEqual({ tone: 'warn', label: '周边 12 车' })
  })
})
