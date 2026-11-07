import { request } from '@/services/api'
import { apiMode } from '@/services/auth'
import { queryString } from '@/services/management'
import { mockRevisionProvider } from '@/mock/revision'
import type { ApiResponse } from '@/types/api'
import type { BatchItem, BatchResult, BreakdownQuery, BreakdownResult, CityOverview, EnterpriseAnalysisQuery, EnterpriseAnalysisResult, EnterpriseOverview, ProgressQuery, ProgressResult, ProvinceOverview } from '@/types/revision'

export interface RevisionProvider {
  enterpriseOverview(periodCode: string, token: string): Promise<ApiResponse<EnterpriseOverview>>
  cityOverview(periodCode: string, token: string): Promise<ApiResponse<CityOverview>>
  provinceOverview(periodCode: string, token: string): Promise<ApiResponse<ProvinceOverview>>
  progress(query: ProgressQuery, token: string): Promise<ApiResponse<ProgressResult>>
  batchSubmit(items: BatchItem[], token: string): Promise<ApiResponse<BatchResult>>
  breakdown(query: BreakdownQuery, token: string): Promise<ApiResponse<BreakdownResult>>
  enterprises(query: EnterpriseAnalysisQuery, token: string): Promise<ApiResponse<EnterpriseAnalysisResult>>
}

export const realRevisionProvider: RevisionProvider = {
  enterpriseOverview: (periodCode, token) => request('/enterprise/work-overview' + queryString({ periodCode }), {}, token),
  cityOverview: (periodCode, token) => request('/city/work-overview' + queryString({ periodCode }), {}, token),
  provinceOverview: (periodCode, token) => request('/province/work-overview' + queryString({ periodCode }), {}, token),
  progress: (query, token) => request('/province/enterprise-progress' + queryString(query), {}, token),
  batchSubmit: (items, token) => request('/enterprise/reports/batch-submit', {
    method: 'POST',
    body: JSON.stringify({ items: items.map(({ periodCode, expectedVersion }) => ({ periodCode, expectedVersion })) }),
  }, token),
  breakdown: (query, token) => {
    const { periodCode, groupBy, regionCode, natureParentCode, natureCode, industryParentCode, industryCode } = query
    return request('/province/analysis/breakdown' + queryString({
      periodCode, groupBy, regionCode, natureParentCode, natureCode, industryParentCode, industryCode,
    }), {}, token)
  },
  enterprises: (query, token) => request('/province/analysis/enterprises' + queryString(query), {}, token),
}

export const revisionProvider = apiMode === 'mock' ? mockRevisionProvider : realRevisionProvider
