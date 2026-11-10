import { request } from '@/services/api'
import { apiMode } from '@/services/auth'
import { queryString } from '@/services/management'
import { reportProvider } from '@/services/report'
import type { ApiResponse } from '@/types/api'
import type { SurveyPeriod } from '@/types/report'
import type { BatchDetailV2, BatchListV2, BatchQueryV2, ProxyDeleteResult, ProxyFillResult, QueueResult, ReadinessV2 } from '@/types/midterm'

export interface NationalV2Provider {
  periods(token: string): Promise<ApiResponse<{ items: SurveyPeriod[]; total: number }>>
  readiness(code: string, token: string): Promise<ApiResponse<ReadinessV2>>
  generate(code: string, version: number, token: string): Promise<ApiResponse<ProxyFillResult>>
  revoke(code: string, version: number, token: string): Promise<ApiResponse<ProxyDeleteResult>>
  create(code: string, token: string): Promise<ApiResponse<QueueResult>>
  list(query: BatchQueryV2, token: string): Promise<ApiResponse<BatchListV2>>
  detail(id: string, token: string, signal?: AbortSignal): Promise<ApiResponse<BatchDetailV2>>
  retry(id: string, token: string): Promise<ApiResponse<QueueResult>>
}

const base = '/province/national'
const periodPath = (code: string) => base + '/periods/' + encodeURIComponent(code)
const batchPath = (id: string) => base + '/batches/' + encodeURIComponent(id)
const post = (data: object) => ({ method: 'POST', body: JSON.stringify(data) })

export const realNationalV2: NationalV2Provider = {
  periods: token => reportProvider.periods(token),
  readiness: (code, token) => request(periodPath(code) + '/readiness', {}, token),
  generate: (code, expectedVersion, token) => request(periodPath(code) + '/proxy-fill', post({ expectedVersion }), token),
  revoke: (code, expectedVersion, token) => request(periodPath(code) + '/proxy-fill' + queryString({ expectedVersion }), { method: 'DELETE' }, token),
  create: (periodCode, token) => request(base + '/batches', post({ periodCode, schemaVersion: 'demo-2' }), token),
  list: (query, token) => request(base + '/batches' + queryString(query), {}, token),
  detail: (id, token, signal) => request(batchPath(id), { signal }, token),
  retry: (id, token) => request(batchPath(id) + '/retry', { method: 'POST' }, token),
}

export async function getNationalV2(): Promise<NationalV2Provider> {
  return apiMode === 'mock' ? (await import('@/mock/nationalV2')).mockNationalV2 : realNationalV2
}
