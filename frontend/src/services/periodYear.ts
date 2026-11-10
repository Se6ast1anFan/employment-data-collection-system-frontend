import { apiMode } from '@/services/auth'
import { request } from '@/services/api'
import type { YearPreview, YearResult } from '@/types/midterm'

export async function previewPeriodYear(year: number, token: string) {
  if (apiMode === 'mock') return (await import('@/mock/periodYear')).previewYear(year, token)
  return (await request<YearPreview>('/province/periods/year/preview?' + new URLSearchParams({ year: String(year) }), {}, token)).data
}

export async function createPeriodYear(year: number, token: string) {
  if (apiMode === 'mock') return (await import('@/mock/periodYear')).createYear(year, token)
  return (await request<YearResult>('/province/periods/year', { method: 'POST', body: JSON.stringify({ year }) }, token)).data
}
