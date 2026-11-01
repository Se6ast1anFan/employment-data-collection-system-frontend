import { request } from '@/services/api'
import { apiMode } from '@/services/auth'
import { queryString } from '@/services/management'
import { mockAnalysisProvider, mockNoticeProvider } from '@/mock/week6'
import type { ApiResponse } from '@/types/api'
import type { AnalysisFilters, CitiesAnalysis, CompareAnalysis, TrendAnalysis, NoticePage, NoticeDetail, NoticeCreate, NoticeUpdate, NoticeDeleteResult } from '@/types/week6'

export type AnalysisQuery = Partial<AnalysisFilters>
export type CompareQuery = AnalysisQuery & { firstPeriodCode: string; secondPeriodCode: string }
export type TrendQuery = AnalysisQuery & { periodCodes: string[] }
export interface AnalysisProvider {
  cities(q: { periodCode: string; regionCode?: string | null }, token: string): Promise<ApiResponse<CitiesAnalysis>>
  compare(q: CompareQuery, token: string): Promise<ApiResponse<CompareAnalysis>>
  trend(q: TrendQuery, token: string): Promise<ApiResponse<TrendAnalysis>>
}
export interface NoticeProvider {
  list(q: { page: number; size: number }, token: string): Promise<ApiResponse<NoticePage>>
  detail(id: string, token: string): Promise<ApiResponse<NoticeDetail>>
  create(body: NoticeCreate, token: string): Promise<ApiResponse<NoticeDetail>>
  update(id: string, body: NoticeUpdate, token: string): Promise<ApiResponse<NoticeDetail>>
  delete(id: string, expectedVersion: number, token: string): Promise<ApiResponse<NoticeDeleteResult>>
}
const noticePath = (id: string) => '/province/notices/' + encodeURIComponent(id)
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })
export const realAnalysisProvider: AnalysisProvider = {
  cities: (q,t) => request('/province/analysis/cities' + queryString(q), {}, t),
  compare: (q,t) => request('/province/analysis/compare' + queryString(q), {}, t),
  trend: (q,t) => request('/province/analysis/trend' + queryString({...q, periodCodes:q.periodCodes.join(',')}), {}, t),
}
export const realNoticeProvider: NoticeProvider = {
  list: (q,t) => request('/notices' + queryString(q), {}, t),
  detail: (id,t) => request('/notices/' + encodeURIComponent(id), {}, t),
  create: (b,t) => request('/province/notices', json('POST',b), t),
  update: (id,b,t) => request(noticePath(id), json('PUT',b), t),
  delete: (id,v,t) => request(noticePath(id) + queryString({expectedVersion:v}), {method:'DELETE'}, t),
}
export const analysisProvider = apiMode === 'mock' ? mockAnalysisProvider : realAnalysisProvider
export const noticeProvider = apiMode === 'mock' ? mockNoticeProvider : realNoticeProvider
