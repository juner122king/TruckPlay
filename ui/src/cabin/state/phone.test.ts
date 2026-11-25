import { beforeEach, describe, expect, it } from 'vitest'
import type { JobInfo, Telemetry, TruckInfo } from '../../shared/host'
import { strings as zhStrings } from './strings/zh_cn'
import { countMissedCalls, resetPhoneTracker, usePhone } from './phone'

function baseTelemetry(overrides: Partial<Telemetry> = {}): Telemetry {
  return {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 20,
    engineRpm: 1200,
    gear: 10,
    displayedGear: 10,
    cruiseControlSpeed: 0,
    fuel: 400,
    fuelRange: 800,
    navigationDistance: 50000,
    navigationTime: 3600,
    navigationSpeedLimit: 22,
    gameTime: 3780,
    multiplayerTimeOffset: 0,
    localScale: 19,
    dashboardBacklight: 1,
    electricEnabled: true,
    engineEnabled: true,
    parkingBrake: false,
    lowBeam: false,
    highBeam: false,
    leftBlinker: false,
    rightBlinker: false,
    paused: false,
    nextRestStop: 400,
    cargoDamage: 0,
    wearEngine: 0.05,
    wearTransmission: 0.04,
    wearCabin: 0.02,
    wearChassis: 0.03,
    wearWheels: 0.06,
    brakeAirPressure: 110,
    brakeAirPressureWarning: false,
    ...overrides,
  }
}

const sampleTruck: TruckInfo = {
  brandId: 'daf',
  brand: 'DAF',
  id: 'vehicle.daf.2021',
  name: 'XG+',
}

const sampleJob: JobInfo = {
  active: true,
  cargoLoaded: true,
  special: false,
  cargo: 'Medical Vaccines',
  cargoMass: 12000,
  sourceCity: 'Berlin',
  sourceCompany: 'Tradeaux',
  destinationCity: 'Munich',
  destinationCompany: 'EuroGoodies',
  deliveryTime: 3700, // already past 3780
  plannedDistanceKm: 580,
  income: 18500,
}

describe('usePhone state machine and incoming alerts', () => {
  beforeEach(() => {
    resetPhoneTracker()
    usePhone.setState({
      activeTab: 'hotlines',
      activeCall: null,
      incomingCall: null,
      recents: [],
      autoConfirmRoadside: false,
    })
  })

  it('transitions dialing -> connected -> ended and logs call duration into recents', () => {
    const contact = {
      id: 'default-roadside',
      kind: 'roadside' as const,
      name: '道路服务',
      subtitle: 'DAF 24 小时道路救援中心',
    }
    usePhone.getState().startCall(contact, 3780, {}, 10_000)
    expect(usePhone.getState().activeCall?.phase).toBe('dialing')

    usePhone.getState().markConnected(11_500)
    expect(usePhone.getState().activeCall?.phase).toBe('connected')

    usePhone.getState().setCallResultNote('拖至服务中心')
    usePhone.getState().endCall(26_500)

    expect(usePhone.getState().activeCall).toBeNull()
    const recents = usePhone.getState().recents
    expect(recents).toHaveLength(1)
    expect(recents[0].durationSec).toBe(15)
    expect(recents[0].note).toBe('拖至服务中心')
    expect(recents[0].direction).toBe('outgoing')
  })

  it('triggers incoming roadside call on critical low fuel with hysteresis and respects DND', () => {
    // DND suppresses banner
    usePhone
      .getState()
      .evaluateIncomingCalls(baseTelemetry({ fuelRange: 55 }), null, sampleTruck, 0, false, true, zhStrings, 1000)
    expect(usePhone.getState().incomingCall).toBeNull()

    // Reset after refuel (> 180km), then drop again without DND
    usePhone
      .getState()
      .evaluateIncomingCalls(baseTelemetry({ fuelRange: 400 }), null, sampleTruck, 0, false, false, zhStrings, 2000)
    usePhone
      .getState()
      .evaluateIncomingCalls(baseTelemetry({ fuelRange: 62 }), null, sampleTruck, 0, false, false, zhStrings, 3000)
    const incoming = usePhone.getState().incomingCall
    expect(incoming).not.toBeNull()
    expect(incoming?.contact.kind).toBe('roadside')
    expect(incoming?.suggestedAction).toBe('roadsideEmergencyRefuel')

    // Answering switches immediately to connected call
    const answered = usePhone.getState().answerIncoming(4000)
    expect(answered?.phase).toBe('connected')
    expect(usePhone.getState().incomingCall).toBeNull()
    expect(usePhone.getState().activeCall?.suggestedAction).toBe('roadsideEmergencyRefuel')
  })

  it('records missed calls and clears badge count when viewing recents', () => {
    usePhone
      .getState()
      .evaluateIncomingCalls(baseTelemetry({ wearEngine: 0.42 }), null, sampleTruck, 0, false, false, zhStrings, 1000)
    expect(usePhone.getState().incomingCall?.suggestedAction).toBe('roadsideTowToService')

    usePhone.getState().declineIncoming(true, 2000)
    expect(usePhone.getState().incomingCall).toBeNull()
    expect(countMissedCalls(usePhone.getState().recents)).toBe(1)

    usePhone.getState().setActiveTab('recents')
    expect(countMissedCalls(usePhone.getState().recents)).toBe(0)
  })

  it('triggers receiver call when active job is overdue', () => {
    usePhone
      .getState()
      .evaluateIncomingCalls(baseTelemetry(), sampleJob, sampleTruck, 0, false, false, zhStrings, 1000)
    const inc = usePhone.getState().incomingCall
    expect(inc?.contact.kind).toBe('receiver')
    expect(inc?.contact.name).toBe('EuroGoodies')
  })
})
