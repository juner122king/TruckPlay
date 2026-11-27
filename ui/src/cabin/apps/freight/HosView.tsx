import { formatDeadline } from '../../dashboard/destination'
import { useClockStyle } from '../../state/hooks'
import type { useLive } from '../../state/store'
import { useText } from '../../state/text'
import { HOS_BREAK_TONES, calculateJourneyTimeline, type evaluateHos } from './freight'
import {
  AlertTriangleGlyph,
  BedRestGlyph,
  CheckCircleGlyph,
  CoffeeCupGlyph,
  HosGlyph,
  TachographRing,
} from './glyphs'

interface HosViewProps {
  job: ReturnType<typeof useLive.getState>['job']
  telemetry: NonNullable<ReturnType<typeof useLive.getState>['telemetry']>
  hos: ReturnType<typeof evaluateHos>
  gameTime: number
  cabNow: number
  cabOffset: number
  navSeconds: number
  nextBreakSubtitle: string
}

export function HosView({
  job,
  telemetry,
  hos,
  gameTime,
  cabNow,
  cabOffset,
  navSeconds,
  nextBreakSubtitle,
}: HosViewProps) {
  const text = useText()
  const clockStyle = useClockStyle()

  const statusMap = {
    fresh: { label: text.freight.hos.statusFresh, tone: 'good' as const },
    normal: { label: text.freight.hos.statusNormal, tone: 'info' as const },
    tired: { label: text.freight.hos.statusTired, tone: 'bad' as const },
  }
  const hosBadge = statusMap[hos.level]

  const adviceMeta = {
    ok: {
      tone: 'good' as const,
      heading: text.freight.hos.nonStopCapable,
      body: text.freight.hos.adviceNonStop,
    },
    rest_soon: {
      tone: 'warn' as const,
      heading: text.freight.hos.restStop8h,
      body: text.freight.hos.adviceRestNeeded,
    },
    overdue: {
      tone: 'bad' as const,
      heading: text.freight.hos.restOverdueTitle,
      body: text.freight.hos.adviceOverdue,
    },
  }[hos.adviceStatus]

  const breakTone = HOS_BREAK_TONES[hos.adviceStatus]

  const timeline =
    job?.active && job.deliveryTime > 0
      ? calculateJourneyTimeline(gameTime, navSeconds, telemetry.nextRestStop, job.deliveryTime)
      : null

  const timelineStatus = timeline
    ? !timeline.canDirectOnTime
      ? {
          pillClass: 'bad' as const,
          label: text.freight.waybill.timeLate,
          directClass: 'tone-bad',
          restClass: 'tone-bad',
        }
      : !timeline.canDeliverAfterRest
        ? {
            pillClass: 'warn' as const,
            label: text.freight.hos.restTightRisk,
            directClass: '',
            restClass: 'tone-warn',
          }
        : {
            pillClass: 'good' as const,
            label: text.freight.hos.restPunctual,
            directClass: '',
            restClass: 'tone-good',
          }
    : null

  return (
    <div className="fr-hos-layout">
      {/* Left Instrument: Horological 11-Hour Digital Tachograph */}
      <article className="fr-module fr-hos-dial-card" data-tone={hosBadge.tone}>
        <header className="fr-mod-head">
          <div className="fr-mod-heading">
            <HosGlyph size={16} />
            <h2 className="fr-mod-title">{text.freight.hos.tachographTitle}</h2>
          </div>
          <span className={`fr-status-pill compact ${hosBadge.tone}`}>
            {hosBadge.tone === 'bad' ? <AlertTriangleGlyph size={12} /> : <CheckCircleGlyph size={12} />}
            <span>{hosBadge.label}</span>
          </span>
        </header>

        <div className="fr-tacho-wrap">
          <TachographRing
            fatiguePercent={hos.fatiguePercent}
            level={hos.level}
            restDueText={hos.restDueText}
            fatigueLabel={`${hos.fatiguePercent}% ${text.freight.hos.fatigueSuffix}`}
          />
        </div>

        <div className="fr-metric-grid cols-2">
          <div className="fr-cell">
            <span className="fr-cell-label">{text.freight.hos.restDueIn}</span>
            <strong className="fr-cell-val">{hos.restDueText}</strong>
          </div>
          <div className="fr-cell">
            <span className="fr-cell-label">{text.freight.hos.fatigueRate}</span>
            <strong className={`fr-cell-val${hos.level === 'tired' ? ' tone-bad' : ''}`}>{hos.fatiguePercent}%</strong>
          </div>
        </div>
      </article>

      {/* Right Console: Rest Advisory + Calibrated Journey Timeline + Next Break */}
      <article className="fr-module fr-hos-plan-card" data-tone={adviceMeta.tone}>
        <header className="fr-mod-head">
          <div className="fr-mod-heading">
            <BedRestGlyph size={16} />
            <h2 className="fr-mod-title">{text.freight.hos.adviceTitle}</h2>
          </div>
          {timelineStatus && (
            <span className={`fr-status-pill compact ${timelineStatus.pillClass}`}>{timelineStatus.label}</span>
          )}
        </header>

        <div className={`fr-advice-box ${adviceMeta.tone}`}>
          <div className="fr-advice-head">
            {adviceMeta.tone === 'good' ? <CheckCircleGlyph size={16} /> : <AlertTriangleGlyph size={16} />}
            <span>{adviceMeta.heading}</span>
          </div>
          <p className="fr-advice-text">{adviceMeta.body}</p>
        </div>

        {timeline && timelineStatus ? (
          <div className="fr-timeline-block">
            <div className="fr-timeline-head">
              <span className="fr-timeline-title">{text.freight.hos.timelineTitle}</span>
              <div className="fr-timeline-legend">
                <span className="fr-tl-legend-item">
                  <i className="drive" aria-hidden="true" />
                  {text.freight.hos.legendDrive}
                </span>
                <span className="fr-tl-legend-item">
                  <i className="rest" aria-hidden="true" />
                  {text.freight.hos.legendRest}
                </span>
                {timeline.bufferRatio > 0 && (
                  <span className="fr-tl-legend-item">
                    <i className="buffer" aria-hidden="true" />
                    {text.freight.hos.legendBuffer}
                  </span>
                )}
              </div>
            </div>

            <div className="fr-timeline-bar" aria-hidden="true">
              <div className="fr-tl-seg drive" style={{ width: `${Math.round(timeline.navRatio * 100)}%` }} />
              <div className="fr-tl-seg rest" style={{ width: `${Math.round(timeline.restRatio * 100)}%` }} />
              {timeline.bufferRatio > 0 && (
                <div className="fr-tl-seg buffer" style={{ width: `${Math.round(timeline.bufferRatio * 100)}%` }} />
              )}
            </div>

            <div className="fr-metric-grid cols-3">
              <div className="fr-cell">
                <span className="fr-cell-label">{text.freight.hos.timelineDirectArrival}</span>
                <strong className={`fr-cell-val${timelineStatus.directClass ? ` ${timelineStatus.directClass}` : ''}`}>
                  {formatDeadline(timeline.etaDirectMinutes + cabOffset, cabNow, text.days, clockStyle)}
                </strong>
              </div>
              <div className="fr-cell">
                <span className="fr-cell-label">{text.freight.hos.timelineRestArrival}</span>
                <strong className={`fr-cell-val ${timelineStatus.restClass}`}>
                  {formatDeadline(timeline.etaWithRestMinutes + cabOffset, cabNow, text.days, clockStyle)}
                </strong>
              </div>
              <div className="fr-cell">
                <span className="fr-cell-label">{text.freight.hos.timelineDeadline}</span>
                <strong className="fr-cell-val">
                  {formatDeadline(job!.deliveryTime + cabOffset, cabNow, text.days, clockStyle)}
                </strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="fr-hos-note-box">
            <p className="fr-hos-note">{text.freight.hos.simulationNote}</p>
          </div>
        )}

        <div className={`fr-break-strip tone-${breakTone}`}>
          <div className="fr-break-top">
            <span className="fr-break-label">
              <CoffeeCupGlyph size={15} />
              <span>{text.freight.waybill.nextBreak}</span>
            </span>
            <span className={`fr-break-time${breakTone !== 'neutral' ? ` tone-${breakTone}` : ''}`}>
              {hos.restDueText}
            </span>
          </div>
          <div className="fr-break-sub">{nextBreakSubtitle}</div>
        </div>
      </article>
    </div>
  )
}
