import type { SurveyPeriod } from '@/types/report'
import type { EnterpriseAnalysisRow } from '@/types/revision'
import type { AnalysisFilters, FilingSourceCounts } from '@/types/week6'
import { roundedPercent } from '@/utils/week6'

const companies = [
  ['CHART-E01', '云峰设备（演示）', 'DEMO_C', '演示市', 'DEMO_D'],
  ['CHART-E02', '云桥物流（演示）', 'DEMO_C', '演示市', 'DEMO_D'],
  ['CHART-E03', '云岚商贸（演示）', 'DEMO_C', '演示市', 'DEMO_D'],
  ['CHART-E04', '松岭制造（演示）', 'CHART_C2', '松岭市（演示）', 'CHART_D2'],
  ['CHART-E05', '松原服务（演示）', 'CHART_C2', '松岭市（演示）', 'CHART_D2'],
  ['CHART-E06', '溪谷制造（演示）', 'CHART_C3', '溪谷市（演示）', 'CHART_D3'],
] as const

const series = [
  ['2025-01', [110, 85, 55, 96, 57, 72]],
  ['2025-04', [114, 88, 57, 98, 59, 73]],
  ['2025-12', [120, 90, 60, 100, 60, 75]],
  ['2026-01', [130, 87, null, 102, 58, 76]],
  ['2026-02', [132, 82, 61, 97, 60, 76]],
  ['2026-03', []],
  ['2026-04', [129, 90, 64, 106, null, 78]],
  ['2026-05', [135, 93, 65, 105, 66, 81]],
] as const

export const chartDemoPeriods: SurveyPeriod[] = series.map(([month]) => {
  const startAt = `${month}-01T00:00:00+08:00`
  const endExclusiveAt = `${month}-21T00:00:00+08:00`
  return { code: `CHART_DEMO_${month.replace('-', '')}`, label: `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月就业调查（演示）`,
    startAt, endExclusiveAt, openAt: startAt, closeAt: endExclusiveAt, demo: true, legacy: false, currentVersion: 1, windowStatus: 'CLOSED' }
})

export const chartDemoDefaults = {
  first: 'CHART_DEMO_202601', last: 'CHART_DEMO_202605',
  calendar: { year: '2026', quarter: '2026-Q2', month: '2026-01' },
  calendarBase: { year: '2025', quarter: '2026-Q1', month: '2025-12' },
}

export function chartDemoFacts(periodCode: string, filters: Partial<AnalysisFilters>) {
  const periodIndex = chartDemoPeriods.findIndex(period => period.code === periodCode)
  const values = series[periodIndex]?.[1]
  if (!values) return undefined
  return companies.flatMap((company, index) => {
    const [enterpriseOrgId, enterpriseName, cityCode, cityName, districtCode] = company
    const periodEmploymentCount = values[index]
    if (periodEmploymentCount == null) return []
    const natureParentCode = index % 2 === 0 ? 'DEMO_NATURE_1' : 'DEMO_NATURE_2'
    const industryParentCode = index % 2 === 0 ? 'DEMO_INDUSTRY_1' : 'DEMO_INDUSTRY_2'
    const natureCode = `${natureParentCode}_1`, industryCode = `${industryParentCode}_1`
    if ((filters.enterpriseOrgId && filters.enterpriseOrgId !== enterpriseOrgId)
      || (filters.regionCode && !['DEMO_P', cityCode, districtCode].includes(filters.regionCode))
      || (filters.natureParentCode && filters.natureParentCode !== natureParentCode) || (filters.natureCode && filters.natureCode !== natureCode)
      || (filters.industryParentCode && filters.industryParentCode !== industryParentCode) || (filters.industryCode && filters.industryCode !== industryCode)) return []
    const previousIndex = series.slice(0, periodIndex).map(([, counts]) => counts[index] != null).lastIndexOf(true)
    const baselineEmploymentCount = series[previousIndex]?.[1][index] ?? periodEmploymentCount
    const netChange = periodEmploymentCount - baselineEmploymentCount
    const filingSource: keyof FilingSourceCounts = index === 5 ? 'CURRENT_FALLBACK' : 'SNAPSHOT_VERSION'
    const report: EnterpriseAnalysisRow = { enterpriseOrgId, enterpriseName, cityCode, cityName, natureCode, industryCode,
      reportId: `${periodCode}-${enterpriseOrgId}`, submissionVersion: 1, baselineSourcePeriodCode: chartDemoPeriods[previousIndex]?.code ?? null,
      baselineEmploymentCount, periodEmploymentCount, netChange, changePercent: roundedPercent(netChange, baselineEmploymentCount),
      changeDirection: netChange > 0 ? 'INCREASE' : netChange < 0 ? 'DECREASE' : 'UNCHANGED' }
    return [{ report, filingSource }]
  })
}
