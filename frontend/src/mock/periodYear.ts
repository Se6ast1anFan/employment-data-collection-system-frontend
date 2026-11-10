import { getMockUserForToken } from '@/mock/auth'
import { managementMockState as state } from '@/mock/report'
import { ApiError } from '@/services/api'
import type { YearMonth, YearPreview, YearResult } from '@/types/midterm'

export function previewYear(year: number, token: string): YearPreview {
  const user = getMockUserForToken(token)
  if (!user) throw new ApiError(401, '请重新登录')
  if (user.roleCode !== 'PROVINCE' || user.orgId !== '100') throw new ApiError(403, '当前账号无权创建本省调查期')
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, '请输入 2000 至 2100 的整数年份')
  const at = (month: number, day = 1) => new Date(Date.UTC(year, month, day) - 8 * 3600000).toISOString()
  const months = Array.from({ length: 12 }, (_, month): YearMonth => {
    const mm = String(month + 1).padStart(2, '0')
    const periodCode = `P${year}${mm}`
    const row = { periodCode, periodLabel: `${year} 年 ${mm} 月调查期`, startAt: at(month),
      endExclusiveAt: at(month + 1), openAt: at(month + 1), closeAt: at(month + 1, 8) }
    const existing = state.periods.find(period => period.code === periodCode)
    const mismatch = existing && (['startAt', 'endExclusiveAt', 'openAt', 'closeAt'] as const).some(key => Date.parse(existing[key] ?? '') !== Date.parse(row[key]))
    const overlap = state.periods.some(period => !period.demo && !period.legacy && period.code !== periodCode
      && Date.parse(period.startAt) < Date.parse(row.endExclusiveAt) && Date.parse(row.startAt) < Date.parse(period.endExclusiveAt))
    const conflictReason = mismatch ? 'CODE_BOUNDARY_MISMATCH' : overlap ? 'OVERLAPPING_PERIOD' : null
    return { ...row, conflictReason, disposition: conflictReason ? 'CONFLICT' : existing ? 'EXISTING' : 'CREATE' }
  })
  const conflictCount = months.filter(row => row.disposition === 'CONFLICT').length
  return { year, months, conflictCount, canCreate: conflictCount === 0,
    createdCount: months.filter(row => row.disposition === 'CREATE').length, existingCount: months.filter(row => row.disposition === 'EXISTING').length }
}

export function createYear(year: number, token: string): YearResult {
  const preview = previewYear(year, token)
  if (!preview.canCreate) throw new ApiError(409, '全年创建已阻止，未新增任何期次', 'CONFLICT', '', {},
    { reasonCode: 'YEAR_CONFLICT', conflictMonths: preview.months.filter(row => row.disposition === 'CONFLICT') })
  const created = preview.months.filter(row => row.disposition === 'CREATE')
  const existing = preview.months.filter(row => row.disposition === 'EXISTING')
  state.periods.push(...created.map(row => ({ code: row.periodCode, label: row.periodLabel, startAt: row.startAt,
    endExclusiveAt: row.endExclusiveAt, openAt: row.openAt, closeAt: row.closeAt,
    currentVersion: 1, legacy: false, demo: false, windowStatus: 'NOT_OPEN' as const })))
  return { year, created, existing, total: 12 }
}
