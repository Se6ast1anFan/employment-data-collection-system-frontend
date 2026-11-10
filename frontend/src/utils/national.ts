import type { BatchStatus } from '@/types/national'
import type { BatchDetailV2 } from '@/types/midterm'

export const batchStatusLabels: Record<BatchStatus, string> = {
  QUEUED: '等待模拟发送',
  SENDING: '模拟发送中',
  MOCK_ACCEPTED: '模拟已接收',
  SEND_FAILED: '发送失败',
}
export const canRetryNational = (status: BatchStatus) => status === 'QUEUED' || status === 'SEND_FAILED'
export const nationalInFlight = (status: BatchStatus) => status === 'QUEUED' || status === 'SENDING'
export const nationalLockMessage = '已纳入上报批次，本版不允许修改'

export function hasFrozenRealReport(batch: BatchDetailV2, reportId: string) {
  if (batch.payloadFormat !== 'XML') return batch.payload?.enterprises.some(row => row.reportId === reportId) ?? false
  const xml = batch.payloadXml
  if (!xml || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) return false
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.documentElement.tagName !== 'ProvinceReport' || document.querySelector('parsererror')) return false
  return [...document.querySelectorAll('ProvinceReport > Enterprises > Enterprise[reportMode="REAL"] > ReportId')]
    .some(node => node.textContent === reportId)
}
export const nationalBatchLocation = (periodCode?: string | null, batchId?: string | null) => ({
  path: '/province/national',
  query: { periodCode: periodCode ?? undefined, batchId: batchId ?? undefined },
})
