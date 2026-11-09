import { describe, expect, it } from 'vitest'
import type { SurveyPeriod } from '@/types/report'
import type { CubeFact } from '@/utils/olap'
import { calendarBuckets, calendarMetricChange, referenceCalendarBucket, summarizeCalendar } from '@/utils/calendarAnalysis'

function period(code: string, startAt: string, legacy = false): SurveyPeriod {
  return { code, label: code, startAt, endExclusiveAt: startAt, openAt: null, closeAt: null,
    demo: true, legacy, currentVersion: 1, windowStatus: 'CLOSED' }
}

const periods = [
  period('LAST_YEAR', '2025-01-08T00:00:00Z'),
  period('DECEMBER', '2025-12-12T00:00:00Z'),
  period('JAN_FIRST', '2025-12-31T16:00:00Z'),
  period('JAN_SECOND', '2026-01-19T00:00:00Z'),
  period('APRIL', '2026-03-31T16:00:00Z'),
  period('JUNE', '2026-06-05T00:00:00Z'),
  period('OLD', '2025-08-01T00:00:00Z', true),
]

function fact(periodCode: string, enterpriseOrgId: string, baseline: number, current: number): CubeFact {
  const netChange = current - baseline
  return { periodCode, enterpriseOrgId, enterpriseName: enterpriseOrgId, cityCode: 'C1', cityName: '演示市',
    reportId: periodCode + enterpriseOrgId, submissionVersion: 1, baselineSourcePeriodCode: null,
    baselineEmploymentCount: baseline, periodEmploymentCount: current, netChange, changePercent: null,
    changeDirection: netChange > 0 ? 'INCREASE' : netChange < 0 ? 'DECREASE' : 'UNCHANGED' }
}

describe('省级日历对比', () => {
  it('按北京时间归入月、季度、年，并精确匹配跨年的同比和环比', () => {
    const months = calendarBuckets(periods, 'month')
    const january = months.find(item => item.code === '2026-01')!
    expect(january.periodCodes).toEqual(['JAN_FIRST', 'JAN_SECOND'])
    expect(referenceCalendarBucket(january, 'month', 'sequential', months)).toMatchObject({ code: '2025-12', periodCodes: ['DECEMBER'] })
    expect(referenceCalendarBucket(january, 'month', 'yoy', months)).toMatchObject({ code: '2025-01', periodCodes: ['LAST_YEAR'] })
    const june = months.find(item => item.code === '2026-06')!
    expect(referenceCalendarBucket(june, 'month', 'sequential', months)).toMatchObject({ code: '2026-05', periodCodes: [] })
    const quarters = calendarBuckets(periods, 'quarter')
    const firstQuarter = quarters.find(item => item.code === '2026-Q1')!
    expect(quarters.find(item => item.code === '2026-Q2')?.periodCodes).toEqual(['APRIL', 'JUNE'])
    expect(referenceCalendarBucket(firstQuarter, 'quarter', 'sequential', quarters).code).toBe('2025-Q4')
    expect(referenceCalendarBucket(firstQuarter, 'quarter', 'yoy', quarters).code).toBe('2025-Q1')
    const years = calendarBuckets(periods, 'year')
    expect(referenceCalendarBucket(years[1]!, 'year', 'yoy', years).periodCodes).toEqual(['LAST_YEAR', 'DECEMBER'])
  })

  it('跨期企业去重，减员独立累加，重新计算占比，区分空期和无基期', () => {
    const months = calendarBuckets(periods, 'month')
    const january = months.find(item => item.code === '2026-01')!
    const june = months.find(item => item.code === '2026-06')!
    const may = referenceCalendarBucket(june, 'month', 'sequential', months)
    const rows = summarizeCalendar([january, june, may], [
      fact('JAN_FIRST', 'A', 100, 80), fact('JAN_SECOND', 'A', 50, 70), fact('JAN_SECOND', 'B', 90, 100),
    ])
    expect(rows[0]).toMatchObject({ periodCount: 2, samplePeriodCount: 2, hasSample: true, metrics: {
      enterpriseCount: 2, baselineEmploymentTotal: 240, periodEmploymentTotal: 250,
      netChange: 10, reductionTotal: 20, changePercent: 4.17,
    } })
    expect(rows[1]).toMatchObject({ periodCount: 1, samplePeriodCount: 0, hasSample: false, metrics: null })
    expect(rows[2]).toMatchObject({ periodCount: 0, hasSample: false, metrics: null })
  })

  it('差额和增长率按基期计算，占比用百分点，非正基期只显示差额', () => {
    expect(calendarMetricChange(60, 81)).toEqual({ difference: 21, growth: 35 })
    expect(calendarMetricChange(4.17, 2.61, true)).toEqual({ difference: -1.56, growth: null })
    expect(calendarMetricChange(0, 12)).toEqual({ difference: 12, growth: null })
    expect(calendarMetricChange(-4, -1)).toEqual({ difference: 3, growth: null })
    expect(calendarMetricChange(null, 0)).toEqual({ difference: null, growth: null })
  })
})
