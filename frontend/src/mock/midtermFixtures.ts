import { registerMockEnterpriseAccount } from '@/mock/auth'
import { managementMockFilings as filings } from '@/mock/filing'
import { managementMockState as state } from '@/mock/report'
import { registerMockRegionPath } from '@/mock/system'
import { emptyProfile } from '@/utils/filing'
import { emptyReport } from '@/utils/report'
import type { SurveyPeriod } from '@/types/report'

export const v2ReadyPeriod = 'MOCK_V2_CLOSED'
export const v2BlockedPeriod = 'MOCK_V2_NO_SOURCE'

export function seedMidtermFixtures() {
  if (state.periods.some(period => period.code === v2ReadyPeriod)) return
  const local = new Date(Date.now() + 8 * 3600000)
  const at = (offset: number, day = 1) => new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, day) - 8 * 3600000).toISOString()
  const makePeriod = (code: string, label: string, offset: number): SurveyPeriod => ({
    code, label, startAt: at(offset), endExclusiveAt: at(offset + 1), openAt: at(offset + 1),
    closeAt: at(offset + 1, 8), demo: true, legacy: false, windowStatus: 'CLOSED', currentVersion: 1,
  })
  const history = makePeriod('MOCK_V2_PREVIOUS', 'V2 历史来源期（演示）', -5)
  const ready = makePeriod(v2ReadyPeriod, 'V2 可补齐期（演示）', -4)
  const blocked = makePeriod(v2BlockedPeriod, 'V2 无来源阻止期（演示）', -3)
  state.periods.push(history, ready, blocked)
  registerMockRegionPath([{ code: 'DEMO_P', name: '演示省', level: 1 }, { code: '530300', name: '演示乙市', level: 2 },
    { code: '530303', name: '演示乙市区县', level: 3 }])
  for (let n = 1; n <= 5; n++) {
    const orgId = String(92000 + n)
    const name = '匿名 V2 企业 ' + n
    const username = 'v2_fixture_' + n
    const firstCity = n % 2 === 1
    const cityId = firstCity ? '201' : '530300'
    const regionCode = firstCity ? 'DEMO_D' : '530303'
    const approvedAt = n === 5 ? blocked.startAt : at(-6)
    const profile = { ...emptyProfile(), organizationCode: 'V2' + orgId, enterpriseName: name,
      natureParentCode: 'DEMO_NATURE_1', natureCode: 'DEMO_NATURE_1_1', industryParentCode: 'DEMO_INDUSTRY_1', industryCode: 'DEMO_INDUSTRY_1_1' }
    registerMockEnterpriseAccount({ username, password: crypto.randomUUID(), user: { id: orgId, orgId, orgName: name, displayName: name, roleCode: 'ENTERPRISE' } })
    filings.records.set(orgId, { orgId, userId: orgId, username, orgName: name, regionCode, filingId: orgId,
      status: 'APPROVED', currentVersion: 1, profile, updatedAt: approvedAt, submittedAt: approvedAt, reviewedAt: approvedAt, returnReason: null, versions: new Map() })
    if (n === 5) continue
    for (const [index, period] of [history, ready].entries()) {
      if (index === 1 && n > 2) continue
      const reportId = String(94000 + n + index * 10)
      const baseline = 60 + n * 12
      const count = baseline + (index === 1 && n === 1 ? -5 : 3)
      const form = { ...emptyReport(), baselineEmploymentCount: baseline, periodEmploymentCount: count, otherReason: '无',
        ...(count < baseline ? { reductionTypeCode: 'MOCK_TYPE', primaryReasonCode: 'MOCK_LEAVE', primaryReasonDetail: '匿名减员原因' } : {}) }
      const key = orgId + ':' + period.code
      const submittedAt = period.openAt!
      const source = { baselineSourcePeriodCode: history.code, baselineSourceReportId: null, baselineEmploymentCount: baseline }
      state.owners.set(reportId, { orgId, name, cityId, provinceId: '100' })
      state.reports.set(key, { reportId, periodCode: period.code, status: 'APPROVED_PROVINCE', currentVersion: 4,
        submissionVersion: 1, form, ...source, updatedAt: submittedAt, submittedAt, latestReturn: null, baselineLocked: true,
        lockedBaselineEmploymentCount: baseline, filingEligible: true, windowStatus: 'CLOSED', canWrite: false, blockedReason: 'ALREADY_SUBMITTED' })
      state.histories.set(key, { reportId, periodCode: period.code, status: 'APPROVED_PROVINCE', reviewEvents: [],
        snapshots: [{ form, ...source, submissionVersion: 1, submittedAt, submittedBy: orgId, result: 'SUBMITTED_CITY', filingId: orgId, filingVersion: 1 }] })
    }
  }
}
