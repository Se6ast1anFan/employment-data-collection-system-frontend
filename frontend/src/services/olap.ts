import { apiMode } from '@/services/auth'
import { reportProvider } from '@/services/report'
import { revisionProvider } from '@/services/revision'
import type { EnterpriseAnalysisResult } from '@/types/revision'
import type { CubeFact } from '@/utils/olap'
import { orderedPeriods } from '@/utils/week6'

export const cubePeriodLimit = 12
export const cubeFactLimit = 12_000
const pageSize = 100

export async function listOlapPeriods(token: string) {
  const { data } = await reportProvider.periods(token)
  const demos = apiMode === 'mock' ? (await import('@/mock/olap')).olapDemoPeriods : []
  return { periods: orderedPeriods([...data.items.filter(period => !period.legacy), ...demos]), demoCodes: demos.map(period => period.code) }
}

export async function readCubeFacts(
  periodCodes: readonly string[],
  readPage: (code: string, page: number, size: number) => Promise<EnterpriseAnalysisResult>,
  limits = { periods: cubePeriodLimit, facts: cubeFactLimit },
): Promise<CubeFact[]> {
  const codes = [...new Set(periodCodes)]
  if (!codes.length || codes.length > limits.periods) throw new Error(`一次最多比较 ${limits.periods} 个调查期，请缩小比较范围。`)
  const facts: CubeFact[] = []
  for (const code of codes) {
    const companies = new Set<string>()
    let page = 0
    let total: number | undefined
    let size: number | undefined
    do {
      const response = await readPage(code, page, pageSize)
      total ??= response.total
      size ??= response.size
      const inconsistent = response.periodCode !== code || response.page !== page || response.total !== total || response.size !== size
        || !Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(size) || size < 1 || size > pageSize
        || response.items.length !== Math.min(size, total - page * size)
      if (inconsistent) throw new Error(`调查期 ${code} 的明细分页不一致，请重新载入。`)
      if (facts.length - companies.size + total > limits.facts) throw new Error(`所选调查期超过 ${limits.facts.toLocaleString('zh-CN')} 条明细，请缩小范围后重试。`)
      for (const item of response.items) {
        if (!item.enterpriseOrgId || companies.has(item.enterpriseOrgId)) throw new Error(`调查期 ${code} 出现缺失或重复的企业编号，请重新载入。`)
        if ([item.baselineEmploymentCount, item.periodEmploymentCount].some(value => !Number.isSafeInteger(value) || value < 0)) {
          throw new Error(`调查期 ${code} 的岗位人数无效，请核对报表数据。`)
        }
        companies.add(item.enterpriseOrgId)
        facts.push({ ...item, periodCode: code })
      }
      page++
    } while (companies.size < total)
  }
  return facts
}

export async function loadOlapFacts(periodCodes: readonly string[], token: string) {
  const mock = apiMode === 'mock' ? await import('@/mock/olap') : undefined
  const demos = new Set(mock?.olapDemoPeriods.map(period => period.code))
  return readCubeFacts(periodCodes, async (periodCode, page, size) => {
    if (mock && demos.has(periodCode)) return mock.olapDemoPage(periodCode, page, size, token)
    return (await revisionProvider.enterprises({ periodCode, page, size }, token)).data
  })
}
