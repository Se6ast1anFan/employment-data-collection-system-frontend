import { request } from '@/services/api'
import { apiMode } from '@/services/auth'
import { queryString } from '@/services/management'
import { reportProvider } from '@/services/report'
import { mockNationalProvider } from '@/mock/national'
import type { ApiResponse } from '@/types/api'
import type { SurveyPeriod } from '@/types/report'
import type { CreateNationalBatch, NationalBatchDetail, NationalBatchPage, NationalBatchQuery, NationalQueue, NationalReadiness } from '@/types/national'

export interface NationalProvider {
  periods(token: string): Promise<ApiResponse<{ items: SurveyPeriod[]; total: number }>>
  readiness(periodCode: string, token: string): Promise<ApiResponse<NationalReadiness>>
  create(body: CreateNationalBatch, token: string): Promise<ApiResponse<NationalQueue>>
  list(query: NationalBatchQuery, token: string): Promise<ApiResponse<NationalBatchPage>>
  detail(batchId: string, token: string, signal?: AbortSignal): Promise<ApiResponse<NationalBatchDetail>>
  retry(batchId: string, token: string): Promise<ApiResponse<NationalQueue>>
}

const path = '/province/national'
const batchPath = (id: string) => path + '/batches/' + encodeURIComponent(id)
export const realNationalProvider: NationalProvider = {
  periods: token => reportProvider.periods(token),
  readiness: (periodCode, token) => request(path + '/periods/' + encodeURIComponent(periodCode) + '/readiness', {}, token),
  create: ({ periodCode, acknowledgeMissing }, token) => request(path + '/batches', {
    method: 'POST', body: JSON.stringify({ periodCode, acknowledgeMissing }),
  }, token),
  list: (query, token) => request(path + '/batches' + queryString(query), {}, token),
  detail: (id, token, signal) => request(batchPath(id), { signal }, token),
  retry: (id, token) => request(batchPath(id) + '/retry', { method: 'POST' }, token),
}
export const nationalProvider = apiMode === 'mock' ? mockNationalProvider : realNationalProvider
