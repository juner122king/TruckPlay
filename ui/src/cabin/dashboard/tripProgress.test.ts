import { describe, expect, it } from 'vitest'
import type { JobInfo } from '../../shared/host'
import { calculateTripProgress } from './tripProgress'

describe('calculateTripProgress', () => {
  it('returns 0 when navigation distance is zero, negative, or not finite', () => {
    expect(calculateTripProgress(0)).toBe(0)
    expect(calculateTripProgress(-100)).toBe(0)
    expect(calculateTripProgress(NaN)).toBe(0)
    expect(calculateTripProgress(Infinity)).toBe(0)
  })

  it('calculates progress percentage based on job planned distance', () => {
    const job: JobInfo = {
      active: true,
      cargoLoaded: true,
      special: false,
      cargo: 'Tomatoes',
      cargoMass: 18_400,
      sourceCity: 'Bari',
      sourceCompany: 'Agrominta',
      destinationCity: 'Kraków',
      destinationCompany: 'Wielton',
      deliveryTime: 1000,
      plannedDistanceKm: 100, // 100,000 m
      income: 5000,
    }

    // At start: 100 km left -> 0%
    expect(calculateTripProgress(100_000, null, job)).toBe(0)
    // Halfway: 50 km left -> 50%
    expect(calculateTripProgress(50_000, null, job)).toBe(50)
    // Near end: 10 km left -> 90%
    expect(calculateTripProgress(10_000, null, job)).toBe(90)
    // 1 km left -> 99%
    expect(calculateTripProgress(1_000, null, job)).toBe(99)
  })

  it('calculates progress percentage based on route distances array', () => {
    const route = {
      id: 1,
      distances: [80_000, 60_000, 40_000, 20_000, 0],
    }

    // At start: 80 km left -> 0%
    expect(calculateTripProgress(80_000, route, null)).toBe(0)
    // 60 km left -> 25%
    expect(calculateTripProgress(60_000, route, null)).toBe(25)
    // 20 km left -> 75%
    expect(calculateTripProgress(20_000, route, null)).toBe(75)
  })

  it('uses baseline distance when provided', () => {
    // Started with 50 km baseline
    expect(calculateTripProgress(25_000, null, null, 50_000)).toBe(50)
    expect(calculateTripProgress(12_500, null, null, 50_000)).toBe(75)
  })

  it('handles detours without producing negative progress', () => {
    // Baseline was 50 km, but detour caused remaining distance to become 60 km
    expect(calculateTripProgress(60_000, null, null, 50_000)).toBe(0)
  })

  it('caps progress between 0 and 100', () => {
    expect(calculateTripProgress(100, null, null, 50)).toBe(0)
    expect(calculateTripProgress(1, null, null, 100_000)).toBe(100)
  })
})
