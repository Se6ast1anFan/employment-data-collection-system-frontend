import { readCubeFacts } from '@/services/olap'
import { revisionProvider } from '@/services/revision'
import { apiMode } from '@/services/auth'
import { reportProvider } from '@/services/report'
import { analysisProvider } from '@/services/week6'
import { mockChartAnalysisProvider, mockChartEnterprisePage } from '@/mock/week6'
import type { AnalysisFilters } from '@/types/week6'
import { summarizeCalendar, type CalendarBucket } from '@/utils/calendarAnalysis'
import { orderedPeriods } from '@/utils/week6'

export const chartAnalysisProvider = apiMode === 'mock' ? mockChartAnalysisProvider : analysisProvider

export async function listChartPeriods(token: string) {
  const { data } = await reportProvider.periods(token)
  const demo = apiMode === 'mock' ? await import('@/mock/chartFixtures') : undefined
  return { periods: orderedPeriods([...data.items, ...(demo?.chartDemoPeriods ?? [])].filter(period => !period.legacy)), defaults: demo?.chartDemoDefaults }
}

export async function compareCalendar(buckets: readonly CalendarBucket[], filters: Partial<AnalysisFilters>, token: string) {
  const demo = apiMode === 'mock' ? await import('@/mock/chartFixtures') : undefined
  const facts = await readCubeFacts(buckets.flatMap(bucket => bucket.periodCodes), async (periodCode, page, size) => {
    if (demo?.chartDemoPeriods.some(period => period.code === periodCode)) {
      return mockChartEnterprisePage({ ...filters, periodCode, page, size }, token)
    }
    return (await revisionProvider.enterprises({ ...filters, periodCode, page, size }, token)).data
  }, { periods: 120, facts: 80_000 })
  return summarizeCalendar(buckets, facts)
}
