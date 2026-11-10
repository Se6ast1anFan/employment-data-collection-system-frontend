import { managementMockFilings as filings } from '@/mock/filing'
import { managementMockState as state } from '@/mock/report'
import { getMockRegionInfo, mockCityOrgId } from '@/mock/system'
import type { Coverage, ProxyItem, ProxySource } from '@/types/midterm'
import type { SurveyPeriod } from '@/types/report'

export const mockV2Proxies = new Map<string, { version: number; items: ProxyItem[]; frozen?: boolean }>()
export const pendingStates = ['SUBMITTED_CITY', 'SUBMITTED_PROVINCE']
export const returnedStates = ['RETURNED_CITY', 'RETURNED_PROVINCE']
export const emptyCoverage = (): Coverage => ({ eligibleEnterpriseCount: 0, realSubmittedCount: 0,
  proxyCount: 0, notCoveredCount: 0, pendingCount: 0, returnedCount: 0 })
const countKeys = Object.keys(emptyCoverage()) as (keyof Coverage)[]

export function addCoverage(sum: Coverage, row: Coverage) {
  for (const key of countKeys) sum[key] += row[key]
  return sum
}

export function eligibleInMock(orgId: string, period: SurveyPeriod) {
  const filing = filings.records.get(orgId)
  const approvals = [...(filing?.versions.values() ?? [])].filter(item => item.result === 'APPROVED').map(item => item.reviewedAt)
  if (filing?.status === 'APPROVED') approvals.push(filing.reviewedAt)
  return approvals.some(at => at && Date.parse(at) < Date.parse(period.endExclusiveAt))
}

export function mockCoverageRow(orgId: string, period: SurveyPeriod) {
  const eligible = eligibleInMock(orgId, period)
  const report = state.reports.get(orgId + ':' + period.code)
  const real = !!(eligible && report && !report.voided && report.submissionVersion > 0)
  const set = mockV2Proxies.get(period.code)
  const item = eligible && !real && !set?.frozen ? set?.items.find(row => row.enterpriseOrgId === orgId) : undefined
  const proxySource: ProxySource | null = item ? {
    sourcePeriodCode: item.proxySourcePeriodCode, sourceReportId: item.sourceReportId,
    sourceSubmissionVersion: item.sourceSubmissionVersion, sourceCurrentVersion: item.sourceCurrentVersion,
    periodEmploymentCount: item.periodEmploymentCount,
  } : null
  const coverageMode = real ? 'REAL' as const : item ? 'PROXY' as const : 'NONE' as const
  const coverage: Coverage = { eligibleEnterpriseCount: Number(eligible), realSubmittedCount: Number(real), proxyCount: Number(!!item),
    notCoveredCount: Number(eligible && !real && !item), pendingCount: Number(real && pendingStates.includes(report?.status ?? '')),
    returnedCount: Number(real && returnedStates.includes(report?.status ?? '')) }
  return { eligible, coverageMode, proxySource, coverage }
}

export function mockCoverage(code?: string, cityOrgId?: string) {
  const result = emptyCoverage()
  const period = state.periods.find(item => item.code === code)
  if (period) for (const filing of filings.records.values()) {
    if (cityOrgId && mockCityOrgId(filing.regionCode) !== cityOrgId) continue
    addCoverage(result, mockCoverageRow(filing.orgId, period).coverage)
  }
  return result
}

export function mockGeography(code: string) {
  const city = getMockRegionInfo(code)?.path.find(item => item.level === 2)
  return { cityCode: city?.code === 'DEMO_C' ? '530100' : city?.code ?? '', cityName: city?.name ?? '—',
    regionCode: code === 'DEMO_D' ? '530102' : code }
}
