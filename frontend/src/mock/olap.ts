import { getMockUserForToken } from '@/mock/auth'
import { ApiError } from '@/services/api'
import type { SurveyPeriod } from '@/types/report'
import type { EnterpriseAnalysisResult, EnterpriseAnalysisRow } from '@/types/revision'
import { roundedPercent } from '@/utils/week6'

const companies = [
  ['OLAP-E01', '云岭精密（演示）', '530100', '昆明市', 'PRIVATE', '民营企业', 'MANUFACTURING', '制造业'],
  ['OLAP-E02', '春城物流（演示）', '530100', '昆明市', 'STATE', '国有企业', 'LOGISTICS', '物流业'],
  ['OLAP-E03', '滇东材料（演示）', '530300', '曲靖市', 'PRIVATE', '民营企业', 'MANUFACTURING', '制造业'],
  ['OLAP-E04', '珠源配送（演示）', '530300', '曲靖市', 'PRIVATE', '民营企业', 'LOGISTICS', '物流业'],
  ['OLAP-E05', '洱海商贸（演示）', '532900', '大理州', 'STATE', '国有企业', 'RETAIL', '零售业'],
  ['OLAP-E06', '苍山零售（演示）', '532900', '大理州', null, null, 'RETAIL', '零售业'],
] as const

// 四期包含滚动建档、缺报、零建档及整期无样本。
const samples = [
  [[120, 132], [80, 72], [100, 100], [40, 52], [60, 54], [0, 5]],
  [[132, 128], [72, 80], [100, 90], [52, 52], [54, 60], null],
  [[128, 144], [80, 80], [90, 105], [52, 46], [60, 52], [5, 5]],
  [],
] as const

export const olapDemoPeriods: SurveyPeriod[] = samples.map((_, index) => {
  const month = String(index + 6).padStart(2, '0')
  const nextMonth = String(index + 7).padStart(2, '0')
  const startAt = `2026-${month}-01T00:00:00+08:00`
  const endExclusiveAt = `2026-${nextMonth}-01T00:00:00+08:00`
  return { code: `OLAP_DEMO_${month}`, label: `2026 年 ${index + 6} 月（演示）`, startAt, endExclusiveAt,
    openAt: startAt, closeAt: endExclusiveAt, demo: true, legacy: false, currentVersion: 1, windowStatus: 'CLOSED' }
})

export function olapDemoPage(periodCode: string, page: number, size: number, token: string): EnterpriseAnalysisResult {
  if (getMockUserForToken(token)?.roleCode !== 'PROVINCE') throw new ApiError(403, '当前角色无权访问多维分析', 'MOCK_OLAP_FORBIDDEN')
  const periodIndex = olapDemoPeriods.findIndex(period => period.code === periodCode)
  const items = companies.flatMap<EnterpriseAnalysisRow>((company, index) => {
    const counts = samples[periodIndex]?.[index]
    if (!counts) return []
    const [enterpriseOrgId, enterpriseName, cityCode, cityName, natureCode, natureName, industryCode, industryName] = company
    const [baselineEmploymentCount, periodEmploymentCount] = counts
    const netChange = periodEmploymentCount - baselineEmploymentCount
    const lastIndex = samples.slice(0, periodIndex).map(period => period[index] != null).lastIndexOf(true)
    return [{ enterpriseOrgId, enterpriseName, cityCode, cityName, natureCode, natureName, industryCode, industryName,
      baselineEmploymentCount, periodEmploymentCount, netChange, changePercent: roundedPercent(netChange, baselineEmploymentCount),
      changeDirection: netChange > 0 ? 'INCREASE' : netChange < 0 ? 'DECREASE' : 'UNCHANGED',
      reportId: `${periodCode}-${enterpriseOrgId}`, submissionVersion: 1,
      baselineSourcePeriodCode: olapDemoPeriods[lastIndex]?.code ?? null }]
  })
  return { periodCode, items: items.slice(page * size, (page + 1) * size), page, size, total: items.length }
}
