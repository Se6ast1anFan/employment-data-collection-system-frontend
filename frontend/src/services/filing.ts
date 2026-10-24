import { mockFilingProvider } from '@/mock/filing'
import { download, request } from '@/services/api'
import { apiMode } from '@/services/auth'
import type { ApiResponse } from '@/types/api'
import type {
  ApproveRequest, DownloadedFile, EnterpriseAccountCreateRequest, EnterpriseAccountData,
  EnterpriseProfileData, EnterpriseProfileFields, FilingDetailData, FilingExportQuery,
  FilingListData, FilingListQuery, FilingOptionsData, FilingStatusData, FilingVersionData,
  PeriodsData, ReturnRequest, ReviewData, SubmitData, SubmitRequest,
} from '@/types/filing'

export interface FilingProvider {
  createEnterpriseAccount(payload: EnterpriseAccountCreateRequest, token: string): Promise<ApiResponse<EnterpriseAccountData>>
  getOptions(token: string): Promise<ApiResponse<FilingOptionsData>>
  getProfile(token: string): Promise<ApiResponse<EnterpriseProfileData>>
  saveProfile(payload: EnterpriseProfileFields, token: string): Promise<ApiResponse<EnterpriseProfileData>>
  getFiling(token: string): Promise<ApiResponse<FilingStatusData>>
  getEnterpriseVersion(version: number, token: string): Promise<ApiResponse<FilingVersionData>>
  submit(payload: SubmitRequest, token: string): Promise<ApiResponse<SubmitData>>
  getPeriods(token: string): Promise<ApiResponse<PeriodsData>>
  listFilings(query: FilingListQuery, token: string): Promise<ApiResponse<FilingListData>>
  getProvinceFiling(filingId: string, token: string): Promise<ApiResponse<FilingDetailData>>
  getProvinceVersion(filingId: string, version: number, token: string): Promise<ApiResponse<FilingVersionData>>
  approve(filingId: string, payload: ApproveRequest, token: string): Promise<ApiResponse<ReviewData>>
  returnFiling(filingId: string, payload: ReturnRequest, token: string): Promise<ApiResponse<ReviewData>>
  exportFilings(query: FilingExportQuery, token: string): Promise<DownloadedFile>
}

const queryString = (query: object) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query) as Array<[string, string | number | undefined]>) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const value = params.toString()
  return value ? `?${value}` : ''
}

const json = (method: 'POST' | 'PUT', body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
})

const realFilingProvider: FilingProvider = {
  createEnterpriseAccount: (payload, token) => request('/province/enterprise-accounts', json('POST', payload), token),
  getOptions: (token) => request('/enterprise/filing/options', {}, token),
  getProfile: (token) => request('/enterprise/profile', {}, token),
  saveProfile: (payload, token) => request('/enterprise/profile', json('PUT', payload), token),
  getFiling: (token) => request('/enterprise/filing', {}, token),
  getEnterpriseVersion: (version, token) => request(`/enterprise/filing/versions/${version}`, {}, token),
  submit: (payload, token) => request('/enterprise/filing/submit', json('POST', payload), token),
  getPeriods: (token) => request('/province/filings/periods', {}, token),
  listFilings: (query, token) => request(`/province/filings${queryString(query)}`, {}, token),
  getProvinceFiling: (filingId, token) => request(`/province/filings/${encodeURIComponent(filingId)}`, {}, token),
  getProvinceVersion: (filingId, version, token) => request(`/province/filings/${encodeURIComponent(filingId)}/versions/${version}`, {}, token),
  approve: (filingId, payload, token) => request(`/province/filings/${encodeURIComponent(filingId)}/approve`, json('POST', payload), token),
  returnFiling: (filingId, payload, token) => request(`/province/filings/${encodeURIComponent(filingId)}/return`, json('POST', payload), token),
  exportFilings: (query, token) => download(`/province/filings/export${queryString(query)}`, {}, token),
}

export const filingProvider: FilingProvider = apiMode === 'mock' ? mockFilingProvider : realFilingProvider
