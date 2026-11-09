import type { SurveyPeriod } from '@/types/report'
import type { SixMetrics } from '@/types/week6'
import { aggregateCube, cubeValue, type CubeFact } from '@/utils/olap'
import { orderedPeriods, roundedPercent } from '@/utils/week6'

export const comparisonGrains = { period: '调查期', year: '年度', quarter: '季度', month: '月度' } as const
export type ComparisonGrain = keyof typeof comparisonGrains
type CalendarGrain = Exclude<ComparisonGrain, 'period'>
export const calendarMethods = { manual: '自选对比', yoy: '同比', sequential: '环比' } as const
export type CalendarMethod = keyof typeof calendarMethods
export interface CalendarBucket { code: string; label: string; periodCodes: string[] }
const beijing = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric' })

function calendarBucket(year: number, month: number, grain: CalendarGrain): CalendarBucket {
  const quarter = Math.ceil(month / 3)
  const code = grain === 'year' ? `${year}` : grain === 'quarter' ? `${year}-Q${quarter}` : `${year}-${String(month).padStart(2, '0')}`
  const label = grain === 'year' ? `${year} 年` : grain === 'quarter' ? `${year} 年第 ${quarter} 季度` : `${year} 年 ${month} 月`
  return { code, label, periodCodes: [] }
}

export function calendarBuckets(periods: readonly SurveyPeriod[], grain: CalendarGrain) {
  const buckets = new Map<string, CalendarBucket>()
  for (const period of orderedPeriods(periods.filter(item => !item.legacy))) {
    const start = Date.parse(period.startAt)
    if (!Number.isFinite(start)) throw new Error(`「${period.label}」的开始时间无效，无法按日历比较。`)
    const parts = beijing.formatToParts(start)
    const year = Number(parts.find(part => part.type === 'year')?.value)
    const month = Number(parts.find(part => part.type === 'month')?.value)
    const next = calendarBucket(year, month, grain)
    const bucket = buckets.get(next.code) ?? next
    bucket.periodCodes.push(period.code)
    buckets.set(bucket.code, bucket)
  }
  return [...buckets.values()]
}

export function referenceCalendarBucket(current: CalendarBucket, grain: CalendarGrain, method: Exclude<CalendarMethod, 'manual'>, buckets: readonly CalendarBucket[]) {
  const [yearText, part] = current.code.split('-')
  const year = Number(yearText)
  const month = grain === 'year' ? 1 : grain === 'quarter' ? (Number(part?.slice(1)) - 1) * 3 + 1 : Number(part)
  const offset = method === 'yoy' || grain === 'year' ? 12 : grain === 'quarter' ? 3 : 1
  const previous = year * 12 + month - 1 - offset
  const reference = calendarBucket(Math.floor(previous / 12), previous % 12 + 1, grain)
  return buckets.find(bucket => bucket.code === reference.code) ?? reference
}

export function calendarMetricChange(base: number | null, current: number | null, percentMetric = false) {
  if (base === null || current === null) return { difference: null, growth: null }
  const difference = current - base
  return percentMetric
    ? { difference: Number(difference.toFixed(2)), growth: null }
    : { difference, growth: base > 0 ? roundedPercent(difference, base) : null }
}

export function summarizeCalendar(buckets: readonly CalendarBucket[], facts: readonly CubeFact[]) {
  return buckets.map(bucket => {
    const codes = new Set(bucket.periodCodes)
    const rows = facts.filter(fact => codes.has(fact.periodCode))
    const total = aggregateCube(rows)
    const metrics: SixMetrics | null = rows.length ? {
      enterpriseCount: total.companies.size,
      baselineEmploymentTotal: total.baseline,
      periodEmploymentTotal: total.current,
      netChange: total.current - total.baseline,
      reductionTotal: total.reduction,
      changePercent: cubeValue(total, 'rate'),
    } : null
    return { periodCode: bucket.code, periodLabel: bucket.label, periodCount: codes.size,
      samplePeriodCount: new Set(rows.map(row => row.periodCode)).size, hasSample: !!rows.length, metrics }
  })
}
