import { request } from '@/services/api'
import { apiMode } from '@/services/auth'
import { mockReportProvider } from '@/mock/report'
import type { ApiResponse } from '@/types/api'
import type { SurveyPeriod, EnterprisePeriod, CreatePeriod, UpdatePeriod, ReportOptions, ReportView, ReportForm, ReportQuery, ReportListItem, ReportHistory, SubmitResult } from '@/types/report'
export interface ReportProvider {
  periods(token: string): Promise<ApiResponse<{items: SurveyPeriod[]; total: number}>>
  create(body: CreatePeriod, token: string): Promise<ApiResponse<SurveyPeriod>>
  update(code: string, body: UpdatePeriod, token: string): Promise<ApiResponse<SurveyPeriod>>
  enterprisePeriods(token: string): Promise<ApiResponse<{items: EnterprisePeriod[]}>>
  options(token: string): Promise<ApiResponse<ReportOptions>>
  get(code: string, token: string): Promise<ApiResponse<ReportView>>
  save(code: string, body: ReportForm & {expectedVersion: number}, token: string): Promise<ApiResponse<ReportView>>
  submit(code: string, version: number, token: string): Promise<ApiResponse<SubmitResult>>
  list(query: ReportQuery, token: string): Promise<ApiResponse<{items: ReportListItem[];total:number;page:number;size:number}>>
  history(code: string, token: string): Promise<ApiResponse<ReportHistory>>
}
const json = (method: string, body: unknown) => ({method, body: JSON.stringify(body)})
const path = (code: string) => `/enterprise/reports/${encodeURIComponent(code)}`
const real: ReportProvider = {
  periods: t => request('/province/periods', {}, t), create: (b,t) => request('/province/periods', json('POST',b),t), update: (c,b,t) => request(`/province/periods/${encodeURIComponent(c)}`,json('PUT',b),t),
  enterprisePeriods: t => request('/enterprise/periods',{},t), options: t => request('/enterprise/reports/options',{},t), get: (c,t) => request(path(c),{},t), save: (c,b,t) => request(path(c),json('PUT',b),t), submit: (c,v,t) => request(path(c)+'/submit',json('POST',{expectedVersion:v}),t),
  list: (q,t) => { const p = new URLSearchParams(); for(const [k,v] of Object.entries(q)) if(v !== undefined && v !== '') p.set(k,String(v)); return request('/enterprise/reports?'+p,{},t) }, history: (c,t) => request(path(c)+'/history',{},t),
}
export const reportProvider: ReportProvider = apiMode === 'mock' ? mockReportProvider : real
