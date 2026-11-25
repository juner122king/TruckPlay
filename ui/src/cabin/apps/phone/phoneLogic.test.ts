import { describe, expect, it } from 'vitest'
import { strings as enStrings } from '../../state/strings/en_us'
import { strings as zhStrings } from '../../state/strings/zh_cn'
import {
  buildCompanyContacts,
  buildDefaultContacts,
  formatCallDuration,
  formatTruckModelName,
  resolveDialCode,
  summarizeLast7DaysCashflow,
} from './phoneLogic'

describe('phoneLogic', () => {
  it('builds the three default service contacts with active truck brand', () => {
    const list = buildDefaultContacts(
      { brandId: 'scania', brand: 'Scania', id: 'vehicle.scania.s_2016', name: 'S' },
      zhStrings,
    )
    expect(list.map((c) => c.kind)).toEqual(['roadside', 'bank', 'usedTrucks'])
    expect(list[0].subtitle).toContain('Scania')
  })

  it('resolves built-in keypad shortcodes cleanly', () => {
    const defaults = buildDefaultContacts(null, enStrings)
    expect(resolveDialCode('112', defaults)).toMatchObject({ kind: 'contact', contact: { kind: 'roadside' } })
    expect(resolveDialCode('911', defaults)).toMatchObject({ kind: 'contact', contact: { kind: 'roadside' } })
    expect(resolveDialCode('95588', defaults)).toMatchObject({ kind: 'contact', contact: { kind: 'bank' } })
    expect(resolveDialCode('888', defaults)).toMatchObject({ kind: 'contact', contact: { kind: 'usedTrucks' } })
    expect(resolveDialCode('1', defaults)).toEqual({ kind: 'quickStop', category: 'fuel' })
    expect(resolveDialCode('2', defaults)).toEqual({ kind: 'quickStop', category: 'rest' })
    expect(resolveDialCode('3', defaults)).toEqual({ kind: 'quickStop', category: 'service' })
    expect(resolveDialCode('0', defaults)).toEqual({ kind: 'routeHq' })
    expect(resolveDialCode('404', defaults)).toEqual({ kind: 'unknown' })
  })

  it('formats durations and truck model ids readably', () => {
    expect(formatCallDuration(0)).toBe('00:00')
    expect(formatCallDuration(75)).toBe('01:15')
    expect(formatTruckModelName('scania.s_2016')).toBe('Scania S 2016')
    expect(formatTruckModelName('daf.2021')).toBe('DAF 2021')
    expect(formatTruckModelName('vehicle.volvo.fh16_2012')).toBe('Volvo FH16 2012')
  })

  it('builds garage and driver contacts from CompanySnapshot', () => {
    const { garages, drivers } = buildCompanyContacts(
      {
        companyName: 'TestCo',
        playerName: 'Driver',
        bank: { moneyAccount: 10000, loans: [] },
        garages: [{ cityId: 'berlin', status: 2, vehicleCount: 3, driverCount: 2, isHq: true }],
        drivers: [
          {
            id: 'driver.104',
            garageCity: 'berlin',
            currentCity: 'hamburg',
            state: 2,
            onDutyTimer: 200,
            skillPoints: 14,
            lastProfit: 3200,
          },
        ],
        usedTrucks: [],
      },
      ['berlin'],
      'berlin',
      undefined,
      false,
      enStrings,
    )
    expect(garages).toHaveLength(1)
    expect(garages[0].isHq).toBe(true)
    expect(drivers).toHaveLength(1)
    expect(drivers[0].name).toBe('Driver #104')
    expect(drivers[0].subtitle).toContain('On delivery')
  })

  it('summarizes last 7 days logbook cashflow', () => {
    const summary = summarizeLast7DaysCashflow(
      [
        { id: '1', kind: 'delivered', gameDay: 10, gameTime: 14400, income: 12000 },
        { id: '2', kind: 'fine', gameDay: 9, gameTime: 13000, expense: 600 },
        { id: '3', kind: 'delivered', gameDay: 1, gameTime: 1500, income: 99999 }, // older than 7 days
      ],
      10,
    )
    expect(summary).toEqual({ income: 12000, expense: 600, net: 11400 })
  })
})
