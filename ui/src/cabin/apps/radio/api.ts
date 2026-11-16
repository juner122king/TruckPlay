import { isInHost, postToHost, type XimalayaQuestion } from '../../../shared/host'

type RadioQuestion = Extract<XimalayaQuestion, { ask: 'radioHome' | 'radioList' | 'radioDetail' | 'radioSchedule' }>
let serial = 2_000_000_000
const pending = new Map<
  number,
  { resolve(value: unknown): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout> }
>()

export function receiveRadioAnswer(
  id: number,
  answer?: { kind: string; data: unknown },
  failed?: boolean,
  error?: string,
): boolean {
  const request = pending.get(id)
  if (!request) return id >= 2_000_000_000 && id < 3_000_000_000
  pending.delete(id)
  clearTimeout(request.timer)
  if (failed || !answer) request.reject(new Error(error || 'Radio request failed'))
  else request.resolve(answer.data)
  return true
}
export function cancelRadioRequests(): void {
  for (const [id, request] of pending) {
    clearTimeout(request.timer)
    pending.delete(id)
    request.reject(new Error('Session closed'))
  }
}
export async function queryRadio(question: RadioQuestion): Promise<unknown> {
  if (isInHost()) {
    return new Promise((resolve, reject) => {
      const id = ++serial
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('Radio request timed out'))
      }, 15000)
      pending.set(id, { resolve, reject, timer })
      postToHost({ type: 'ximalaya', command: { action: 'ask', id, question } })
    })
  }
  if (!import.meta.env.DEV) throw new Error('Radio requires the WestPlay host')
  let path = '/homePage'
  if (question.ask === 'radioList')
    path =
      '/search?' +
      new URLSearchParams({
        locationId: String(question.locationId),
        locationTypeId: String(question.locationTypeId),
        categoryId: String(question.categoryId),
        pageNum: String(question.pageNum),
        pageSize: '48',
      })
  if (question.ask === 'radioDetail') path = '/v1/radio?radioId=' + question.radioId
  if (question.ask === 'radioSchedule') path = '/v1/getProgramSchedules?device=ios&radioId=' + question.radioId
  const response = await fetch('/__radio-api' + path, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('Radio HTTP ' + response.status)
  const payload = await response.json()
  if (payload.ret !== 0 && payload.ret !== '0000') throw new Error(payload.msg || 'Radio request failed')
  return payload.data ?? payload.result
}
