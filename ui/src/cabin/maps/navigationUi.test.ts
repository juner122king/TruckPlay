import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LaneHint, SemaphoreInfo, Telemetry } from '../../shared/host'
import { strings as zhStrings } from '../state/strings/zh_cn'
import { matchesTurnDirection } from './laneGuidance'
import { LaneRibbon } from './LaneRibbon'
import { MapControlsView } from './MapControls'
import { OverviewStopsCardView } from './OverviewStopsCard'
import { TrafficLightPillView } from './TrafficLightPill'
import { TripBarView } from './TripBar'
import { trafficLightSnapshotOf } from './useTrafficLight'

const baseTelemetry: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  speed: 12,
  engineRpm: 1200,
  gear: 6,
  displayedGear: 6,
  cruiseControlSpeed: 60,
  fuel: 300,
  fuelRange: 800,
  navigationDistance: 1000,
  navigationTime: 120,
  navigationSpeedLimit: 80,
  gameTime: 500,
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
}

describe('LaneRibbon direction emphasis', () => {
  it('matches active turn directions conservatively', () => {
    expect(matchesTurnDirection('right', 'right')).toBe(true)
    expect(matchesTurnDirection('slight-right', 'exit-right')).toBe(true)
    expect(matchesTurnDirection('straight', 'right')).toBe(false)
    expect(matchesTurnDirection('straight', 'roundabout')).toBe(false)
    expect(matchesTurnDirection('straight', null)).toBe(false)
  })

  it('renders secondary directions dimmed before primary turn arrow on shared recommended lanes', () => {
    const hint: LaneHint = {
      node: 1,
      start: 0,
      end: 2,
      lanes: [
        { directions: ['straight'], recommended: false },
        { directions: ['straight', 'right'], recommended: true },
        { directions: ['right'], recommended: true },
      ],
    }

    const html = renderToStaticMarkup(createElement(LaneRibbon, { hint, activeTurn: 'right' }))
    const secondaryAt = html.indexOf('class="lane-arrow-secondary"')
    const primaryAt = html.indexOf('class="lane-arrow-primary"')
    expect(secondaryAt).toBeGreaterThan(-1)
    expect(primaryAt).toBeGreaterThan(secondaryAt)
  })

  it('keeps all arrows un-dimmed when activeTurn is roundabout or null', () => {
    const hint: LaneHint = {
      node: 1,
      start: 0,
      end: 2,
      lanes: [
        { directions: ['straight', 'right'], recommended: true },
        { directions: ['left'], recommended: false },
      ],
    }

    const withNull = renderToStaticMarkup(createElement(LaneRibbon, { hint, activeTurn: null }))
    expect(withNull).not.toContain('lane-arrow-secondary')
    expect(withNull).not.toContain('lane-arrow-primary')

    const withRoundabout = renderToStaticMarkup(createElement(LaneRibbon, { hint, activeTurn: 'roundabout' }))
    expect(withRoundabout).not.toContain('lane-arrow-secondary')
  })
})

describe('TrafficLightPill quantization and rendering', () => {
  it('quantizes distance, progressPct to 5% steps, and marks urgent <= 3s', () => {
    const semaphores: SemaphoreInfo[] = [{ x: 2, y: 0, z: -93, heading: 0.5, state: 1, countdown: 2.3, duration: 30 }]
    const snap = trafficLightSnapshotOf(semaphores, baseTelemetry, null, 0, '.', false)
    expect(snap).toEqual({
      stateClass: 'traffic-red',
      countdown: 3,
      distanceText: '90 m',
      progressPct: 10,
      urgent: true,
    })
  })

  it('omits distance when closer than 15m and returns null for inactive state', () => {
    const near: SemaphoreInfo[] = [{ x: 1, y: 0, z: -10, heading: 0.5, state: 3, countdown: 12, duration: 30 }]
    const snap = trafficLightSnapshotOf(near, baseTelemetry, null, 0, '.', false)
    expect(snap).toEqual({
      stateClass: 'traffic-green',
      countdown: 12,
      distanceText: '',
      progressPct: 40,
      urgent: false,
    })

    const off: SemaphoreInfo[] = [{ x: 1, y: 0, z: -50, heading: 0.5, state: 4, countdown: 0, duration: 0 }]
    expect(trafficLightSnapshotOf(off, baseTelemetry, null, 0, '.', false)).toBeNull()
  })

  it('renders full HUD pill and compact widget variant appropriately', () => {
    const signal = {
      stateClass: 'traffic-yellow',
      countdown: 2,
      distanceText: '150 m',
      progressPct: 50,
      urgent: true,
    }
    const fullHtml = renderToStaticMarkup(createElement(TrafficLightPillView, { signal }))
    expect(fullHtml).toContain('traffic-pill traffic-yellow urgent')
    expect(fullHtml).toContain('lamp-red')
    expect(fullHtml).toContain('lamp-yellow')
    expect(fullHtml).toContain('lamp-green')
    expect(fullHtml).toContain('2s')
    expect(fullHtml).toContain('150 m')
    expect(fullHtml).toContain('width:50%')

    const compactHtml = renderToStaticMarkup(createElement(TrafficLightPillView, { signal, compact: true }))
    expect(compactHtml).toContain('traffic-pill traffic-yellow urgent compact')
    expect(compactHtml).toContain('2s')
    expect(compactHtml).not.toContain('150 m')
    expect(compactHtml).not.toContain('traffic-pill-track')
  })
})

describe('MapControlsView corner dock layout', () => {
  const labels = {
    recentre: 'Recenter',
    returnToNavigation: 'Return to navigation',
    search: 'Search',
    routeOverview: 'Route overview',
    northUp: 'North up',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
  }

  it('renders two stacked vertical capsules with recentre + compass above zoom when following a route', () => {
    const html = renderToStaticMarkup(
      createElement(MapControlsView, {
        browsing: false,
        overview: false,
        northUp: false,
        hasRoute: true,
        searchOpen: false,
        labels,
      }),
    )
    expect(html).toContain('map-controls map-dock')
    expect(html).toContain('map-view-rail map-orient-rail glass')
    expect(html).toContain('map-recentre-btn centred')
    expect(html).not.toContain('map-recentre-label')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('map-compass north-up')
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('map-action-bar glass')
    expect(html).toContain('map-dock-search')
    expect(html).toContain('map-overview')
    expect(html).toContain('map-view-rail map-zoom-rail glass')
    expect(html).toContain('data-control="zoom-in"')
    expect(html).toContain('data-control="zoom-out"')
  })

  it('shows off-center state while browsing with compass still interactive', () => {
    const html = renderToStaticMarkup(
      createElement(MapControlsView, {
        browsing: true,
        overview: false,
        northUp: false,
        hasRoute: true,
        searchOpen: false,
        labels,
      }),
    )
    expect(html).toContain('map-recentre-btn off-center')
    expect(html).toContain('aria-label="Recenter"')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('map-overview selected')
  })

  it('disables compass and suppresses north-up highlight during route overview', () => {
    const html = renderToStaticMarkup(
      createElement(MapControlsView, {
        browsing: true,
        overview: true,
        overviewLocked: false,
        northUp: true,
        hasRoute: true,
        searchOpen: true,
        labels,
      }),
    )
    expect(html).toContain('map-recentre-btn off-center')
    expect(html).toContain('aria-label="Return to navigation"')
    expect(html).toContain('map-dock-search selected')
    expect(html).toContain('map-overview selected')
    expect(html).toContain('data-overview-mode="timed"')
    expect(html).not.toContain('map-overview-lock')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('map-compass north-up')
  })

  it('shows locked overview badge and mode when route overview is locked', () => {
    const html = renderToStaticMarkup(
      createElement(MapControlsView, {
        browsing: true,
        overview: true,
        overviewLocked: true,
        northUp: false,
        hasRoute: true,
        searchOpen: false,
        labels,
      }),
    )
    expect(html).toContain('map-overview selected locked')
    expect(html).toContain('data-overview-mode="locked"')
    expect(html).toContain('map-overview-lock')
    expect(html).toContain('disabled=""')
  })

  it('stays centred while north-up is active if the map has not browsed away', () => {
    const html = renderToStaticMarkup(
      createElement(MapControlsView, {
        browsing: false,
        overview: false,
        northUp: true,
        hasRoute: true,
        searchOpen: false,
        labels,
      }),
    )
    expect(html).toContain('map-recentre-btn centred')
    expect(html).toContain('map-compass north-up')
    expect(html).not.toContain('disabled=""')
  })

  it('hides the redundant dock action bar when free-driving with search closed', () => {
    const html = renderToStaticMarkup(
      createElement(MapControlsView, { browsing: false, overview: false, hasRoute: false, searchOpen: false, labels }),
    )
    expect(html).toContain('map-view-rail map-orient-rail glass')
    expect(html).toContain('map-view-rail map-zoom-rail glass')
    expect(html).not.toContain('map-action-bar')
    expect(html).not.toContain('map-dock-search')
    expect(html).not.toContain('map-overview')
  })

  it('keeps the selected search toggle in the dock when search is open without a route', () => {
    const html = renderToStaticMarkup(
      createElement(MapControlsView, { browsing: false, overview: false, hasRoute: false, searchOpen: true, labels }),
    )
    expect(html).toContain('map-action-bar glass')
    expect(html).toContain('map-dock-search selected')
    expect(html).not.toContain('map-overview')
  })
})

describe('TripBarView Liquid Glass interactive trip & pit-stop controls', () => {
  const sampleTrip = {
    arrival: '16:45',
    time: '42 分钟',
    stopTime: null,
    totalTime: '42 分钟',
    distance: '68 km',
    progressPercent: 62,
    stopCount: 1,
    onJob: false,
  }

  it('renders compact Dashboard ETA pill without interactive drawer', () => {
    const html = renderToStaticMarkup(
      createElement(TripBarView, {
        trip: sampleTrip,
        interactive: false,
        concealed: false,
        hasMapData: true,
        expanded: false,
        busyStop: null,
        endingRoute: false,
        text: zhStrings,
      }),
    )
    expect(html).toContain('eta-pill glass')
    expect(html).toContain('16:45')
    expect(html).toContain('68 km')
    expect(html).not.toContain('trip-drawer')
  })

  it('renders expanded Maps trip drawer with along-route pit-stop buttons and end-route control', () => {
    const html = renderToStaticMarkup(
      createElement(TripBarView, {
        trip: sampleTrip,
        interactive: true,
        concealed: false,
        hasMapData: true,
        expanded: true,
        busyStop: null,
        endingRoute: false,
        text: zhStrings,
      }),
    )
    expect(html).toContain('trip-drawer glass')
    expect(html).toContain('pitstop-fuel')
    expect(html).toContain('pitstop-rest')
    expect(html).toContain('pitstop-service')
    expect(html).toContain('结束路线')
    expect(html).toContain('全路线总览')
    expect(html).toContain('1 个途经点')
  })

  it('replaces end-route action with job-locked indicator while delivering a freight job', () => {
    const html = renderToStaticMarkup(
      createElement(TripBarView, {
        trip: { ...sampleTrip, onJob: true },
        interactive: true,
        concealed: false,
        hasMapData: true,
        expanded: true,
        busyStop: null,
        endingRoute: false,
        text: zhStrings,
      }),
    )
    expect(html).toContain('trip-job-lock')
    expect(html).not.toContain('结束路线')
  })

  it('renders free-drive quick search & pit-stop toolbar when no route is active', () => {
    const html = renderToStaticMarkup(
      createElement(TripBarView, {
        trip: null,
        interactive: true,
        concealed: false,
        hasMapData: true,
        expanded: false,
        busyStop: null,
        endingRoute: false,
        text: zhStrings,
      }),
    )
    expect(html).toContain('free-drive-bar glass')
    expect(html).toContain('free-drive-search-btn')
    expect(html).toContain('pitstop-fuel')
    expect(html).toContain('pitstop-rest')
    expect(html).toContain('pitstop-service')
  })
})

describe('OverviewStopsCardView job vs non-job rendering', () => {
  it('renders drag handles and delete buttons for all rows including destination in non-job mode', () => {
    const html = renderToStaticMarkup(
      createElement(OverviewStopsCardView, {
        snapshot: {
          routeId: 1,
          onJob: false,
          movableCount: 2,
          intermediateCount: 1,
          items: [
            {
              uid: 'a1',
              key: 'uid:a1',
              position: [100, 0],
              nodeIndex: 1,
              locked: false,
              isDestination: false,
              stopNumber: 1,
              placeKind: 'fuel',
              title: 'Shell',
              subtitle: '加油站 · 柏林',
              distance: '30 km',
              editable: true,
            },
            {
              uid: 'b2',
              key: 'uid:b2',
              position: [200, 0],
              nodeIndex: 2,
              locked: false,
              isDestination: true,
              stopNumber: null,
              placeKind: 'company',
              title: 'LKW',
              subtitle: '公司 · 慕尼黑',
              distance: '120 km',
              editable: true,
            },
          ],
        },
        text: zhStrings,
        busy: false,
        draggingIndex: null,
        dragOffsetY: 0,
        dropMarker: null,
        keyboardGrabbedIndex: null,
        statusAnnouncement: '',
        onAddStop: () => {},
      }),
    )
    expect(html).toContain('overview-stops-card glass')
    expect(html).toContain('路线途经点')
    expect(html).toContain('1 个途经点')
    expect(html).toContain('overview-stops-add')
    expect(html.match(/class="overview-stop-handle"/g)?.length).toBe(2)
    expect(html.match(/class="overview-stop-delete"/g)?.length).toBe(2)
    expect(html).not.toContain('overview-stop-lock')
    expect(html).toContain('data-own-drag=""')
  })

  it('locks the job destination row without drag handle or delete button on a freight job', () => {
    const html = renderToStaticMarkup(
      createElement(OverviewStopsCardView, {
        snapshot: {
          routeId: 2,
          onJob: true,
          movableCount: 1,
          intermediateCount: 1,
          items: [
            {
              uid: 'a1',
              key: 'uid:a1',
              position: [100, 0],
              nodeIndex: 1,
              locked: false,
              isDestination: false,
              stopNumber: 1,
              placeKind: 'fuel',
              title: 'Shell',
              subtitle: '加油站 · 柏林',
              distance: '30 km',
              editable: true,
            },
            {
              uid: 'jobdest',
              key: 'uid:jobdest',
              position: [300, 0],
              nodeIndex: 3,
              locked: true,
              isDestination: true,
              stopNumber: null,
              placeKind: null,
              title: 'EuroGoodies',
              subtitle: '送达地 · 慕尼黑',
              distance: '120 km',
              editable: false,
            },
          ],
        },
        text: zhStrings,
        busy: false,
        draggingIndex: null,
        dragOffsetY: 0,
        dropMarker: null,
        keyboardGrabbedIndex: null,
        statusAnnouncement: '',
        onAddStop: () => {},
      }),
    )
    expect(html).toContain('overview-stop-row is-destination is-locked')
    expect(html.match(/class="overview-stop-handle"/g)?.length).toBe(1)
    expect(html.match(/class="overview-stop-delete"/g)?.length).toBe(1)
    expect(html.match(/class="overview-stop-lock"/g)?.length).toBe(1)
    expect(html).toContain('EuroGoodies')
    expect(html).toContain('任务终点已锁定')
  })

  it('still renders the card with add button and locked destination when a job has zero intermediate stops', () => {
    const html = renderToStaticMarkup(
      createElement(OverviewStopsCardView, {
        snapshot: {
          routeId: 3,
          onJob: true,
          movableCount: 0,
          intermediateCount: 0,
          items: [
            {
              uid: 'jobdest',
              key: 'uid:jobdest',
              position: [300, 0],
              nodeIndex: 3,
              locked: true,
              isDestination: true,
              stopNumber: null,
              placeKind: null,
              title: 'EuroGoodies',
              subtitle: '送达地 · 慕尼黑',
              distance: '120 km',
              editable: false,
            },
          ],
        },
        text: zhStrings,
        busy: false,
        draggingIndex: null,
        dragOffsetY: 0,
        dropMarker: null,
        keyboardGrabbedIndex: null,
        statusAnnouncement: '',
        onAddStop: () => {},
      }),
    )
    expect(html).toContain('overview-stops-card glass')
    expect(html).toContain('overview-stops-add')
    expect(html).toContain('overview-stop-lock')
    expect(html).toContain('overview-stops-hint')
    expect(html).not.toContain('overview-stop-delete')
  })
})
