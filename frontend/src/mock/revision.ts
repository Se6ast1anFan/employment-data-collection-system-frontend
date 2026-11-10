import { mockNationalCard } from '@/mock/national'
import { addCoverage, emptyCoverage, mockCoverage, mockCoverageRow } from '@/mock/midtermCoverage'
import type { Coverage, HomeState } from '@/types/midterm'
import { getMockUserForToken, managementMockAccounts } from '@/mock/auth'
import { getMockRegionInfo, mockCityOrgId } from '@/mock/system'
import { managementMockFilings } from '@/mock/filing'
import { mockManagementProvider } from '@/mock/management'
import { managementMockState as state, mockRollingReportProvider as reports } from '@/mock/report'
import { mockNoticeProvider, metrics, sample } from '@/mock/week6'
import { ApiError } from '@/services/api'
import { reportFilterStates, directionLabels } from '@/utils/revision'
import { orderedPeriods } from '@/utils/week6'
import type { RevisionProvider } from '@/services/revision'
import type { RoleCode } from '@/types/api'
import type { BatchItemResult, ChangeDirection, EnterpriseAnalysisRow, EnterpriseStepSummary, ProgressRow, SelectedPeriod } from '@/types/revision'
import type { EnterprisePeriod, SurveyPeriod } from '@/types/report'

const ok = <T>(data: T) => ({ code: 'OK', message: '', traceId: 'mock-revision', data })
function fail(status: number, message: string): never {
  throw new ApiError(status, message, 'MOCK_REVISION_ERROR')
}
function session(token: string, role: RoleCode) {
  const user = getMockUserForToken(token)
  if (!user) fail(401, '请重新登录')
  if (user.roleCode !== role) fail(403, '当前角色无权访问')
  return user
}
function selectPeriod(code: string, periods: SurveyPeriod[]): SelectedPeriod | null {
  const sorted = orderedPeriods(periods.filter(p => !p.legacy))
  const p = code ? sorted.find(p => p.code === code) : sorted.filter(p => p.windowStatus === 'OPEN').at(-1) ?? sorted.at(-1)
  if (!p && code) fail(400, '调查期不存在')
  return p ? { periodCode: p.code, periodLabel: p.label, windowStatus: p.windowStatus, deadlineAt: p.closeAt } : null
}
function reportState(orgId: string, periodCode: string): ProgressRow['reportStatus'] {
  const report = state.reports.get(orgId + ':' + periodCode)
  return report?.voided ? 'VOIDED' : report?.status ?? 'NOT_SUBMITTED'
}
function direction(change: number): ChangeDirection {
  return change > 0 ? 'INCREASE' : change < 0 ? 'DECREASE' : 'UNCHANGED'
}

export const mockRevisionProvider: RevisionProvider = {
  async enterpriseOverview(code, token) {
    const user = session(token, 'ENTERPRISE')
    const [periods, notices] = await Promise.all([reports.enterprisePeriods(token), mockNoticeProvider.list({ page: 0, size: 20 }, token)])
    const filingStatus = managementMockFilings.records.get(user.orgId)?.status ?? 'NO_FILING'
    const selectedPeriod = selectPeriod(code, periods.data.items)
    const report = selectedPeriod ? (await reports.get(selectedPeriod.periodCode, token)).data : null
    const reportStatus = report?.voided ? 'VOIDED' : report?.status ?? null
    const reportRoute = '/enterprise/reports/' + selectedPeriod?.periodCode
    let currentStep: EnterpriseStepSummary = 'WAIT_FOR_FILING'
    let nextAction = { route: '/enterprise/profile', label: '查看备案资料', enabled: true }
    if (filingStatus === 'APPROVED') {
      if (!selectedPeriod) {
        currentStep = 'WAIT_FOR_PERIOD'
        nextAction = { route: '/enterprise/report/history', label: '等待调查期开放', enabled: false }
      } else if (reportStatus === 'RETURNED_CITY' || reportStatus === 'RETURNED_PROVINCE') {
        currentStep = 'FIX_RETURNED_REPORT'
        nextAction = { route: reportRoute, label: '修改并重新提交', enabled: report?.canWrite === true }
      } else if (reportStatus === 'SUBMITTED_CITY' || reportStatus === 'SUBMITTED_PROVINCE' || reportStatus === 'APPROVED_PROVINCE') {
        currentStep = 'WAIT_FOR_REVIEW'
        nextAction = { route: reportRoute, label: '查看报表', enabled: true }
      } else {
        currentStep = 'COMPLETE_REPORT'
        nextAction = report?.canWrite
          ? { route: reportRoute, label: '打开当期填报', enabled: true }
          : { route: '/enterprise/report/history', label: '查看历史进度', enabled: true }
      }
    }
    const homeState: HomeState = reportStatus === 'RETURNED_CITY' || reportStatus === 'RETURNED_PROVINCE' ? 'RETURNED'
      : report && !report.voided && report.submissionVersion > 0 ? 'SUBMITTED' : reportStatus === 'DRAFT' ? 'DRAFT_SAVED' : 'NOT_SAVED'
    return ok({ selectedPeriod, filingStatus, reportStatus, currentStep, nextAction, latestReturnReason: report?.latestReturn?.comment ?? null, visibleNoticeCount: notices.data.total,
      homeState, homePeriod: selectedPeriod, homeReturnReason: homeState === 'RETURNED' ? report?.latestReturn?.comment ?? null : null,
      homeNextAction: { ...nextAction, enabled: !!selectedPeriod && nextAction.enabled } })
  },
  async cityOverview(code, token) {
    const user = session(token, 'CITY')
    const periods = state.periods.map(p => ({
      ...p,
      windowStatus: (p.legacy ? 'UNAVAILABLE' : Date.now() < Date.parse(p.openAt!) ? 'NOT_OPEN' : Date.now() >= Date.parse(p.closeAt!) ? 'CLOSED' : 'OPEN') as EnterprisePeriod['windowStatus'],
    }))
    const selectedPeriod = selectPeriod(code, periods)
    const cityOwners = [...state.owners.values()].filter(o => o.cityId === user.orgId)
    const ids = new Set(cityOwners.map(o => o.orgId))
    for (const record of managementMockFilings.records.values()) {
      const owner = [...state.owners.values()].find(o => o.orgId === record.orgId)
      if ((owner?.cityId ?? mockCityOrgId(record.regionCode)) === user.orgId) ids.add(record.orgId)
    }
    const counts = { pendingCity: 0, approvedCity: 0, returnedCity: 0, forwardedProvince: 0, notSubmitted: 0 }
    if (selectedPeriod) for (const orgId of ids) {
      const status = reportState(orgId, selectedPeriod.periodCode)
      if (status === 'SUBMITTED_CITY') counts.pendingCity++
      if (status === 'RETURNED_CITY') counts.returnedCity++
      if (['SUBMITTED_PROVINCE', 'RETURNED_PROVINCE', 'APPROVED_PROVINCE'].includes(status)) {
        counts.approvedCity++
        counts.forwardedProvince++
      }
      if (status === 'NOT_SUBMITTED' || status === 'DRAFT') counts.notSubmitted++
    }
    return ok({
      selectedPeriod, reportCounts: counts, ...mockCoverage(selectedPeriod?.periodCode, user.orgId),
      noticeEntry: { label: '通知管理', route: '/city/notices' },
      nextAction: { label: '审核待办', route: '/city/reports', enabled: !!selectedPeriod },
    })
  },
  async provinceOverview(code, token) {
    session(token, 'PROVINCE')
    const selectedPeriod = selectPeriod(code, (await reports.periods(token)).data.items)
    const pendingFilingCount = (await mockManagementProvider.accounts({ dataStatus: 'PENDING', page: 0, size: 1 }, token)).data.total
    const rows: ProgressRow[] = []
    if (selectedPeriod) for (let page = 0; ; page++) {
      const data = (await mockRevisionProvider.progress({ periodCode: selectedPeriod.periodCode, page, size: 100 }, token)).data
      rows.push(...data.items)
      if ((page + 1) * data.size >= data.total) break
    }
    const cities = new Map<string, Coverage & { cityCode: string; cityName: string; submittedEnterpriseCount: number; notSubmittedEnterpriseCount: number; forwarded: boolean }>()
    const period = state.periods.find(item => item.code === selectedPeriod?.periodCode)
    for (const row of rows) {
      const city = cities.get(row.cityCode) ?? { cityCode: row.cityCode, cityName: row.cityName, ...emptyCoverage(), submittedEnterpriseCount: 0, notSubmittedEnterpriseCount: 0, forwarded: false }
      if (period) addCoverage(city, mockCoverageRow(row.enterpriseOrgId, period).coverage)
      if (row.reportStatus === 'DRAFT' || row.reportStatus === 'NOT_SUBMITTED') city.notSubmittedEnterpriseCount++
      if (['SUBMITTED_PROVINCE', 'RETURNED_PROVINCE', 'APPROVED_PROVINCE'].includes(row.reportStatus)) { city.forwarded = true; city.submittedEnterpriseCount++ }
      cities.set(row.cityCode, city)
    }
    const groups = [...cities.values()]
    return ok({
      nationalReportCard: await mockNationalCard(selectedPeriod?.periodCode, token),
      provinceTotals: groups.reduce(addCoverage, emptyCoverage()),
      selectedPeriod, pendingFilingCount, pendingReportCount: rows.filter(r => r.reportStatus === 'SUBMITTED_PROVINCE').length,
      approvedReportCount: rows.filter(r => r.reportStatus === 'APPROVED_PROVINCE').length,
      cityProgress: { submittedCityCount: groups.filter(c => c.forwarded).length, notSubmittedCityCount: groups.filter(c => !c.forwarded).length, items: groups.map(({ forwarded, ...city }) => city) },
      entries: [{ label: '备案审核', route: '/province/filings' }, { label: '报表审核', route: '/province/reports' }, { label: '企业进度', route: '/province/enterprise-progress' }],
    })
  },
  async progress(q, token) {
    session(token, 'PROVINCE')
    selectPeriod(q.periodCode, state.periods)
    const period = state.periods.find(item => item.code === q.periodCode)!
    const coverageSummary = emptyCoverage()
    const orgIds = new Map(managementMockAccounts().map(({ user }) => [user.id, user.orgId]))
    const all: ProgressRow[] = []
    for (let page = 0; ; page++) {
      const data = (await mockManagementProvider.accounts({ page, size: 100, userType: 'ENTERPRISE', cityCode: q.cityCode === '530100' ? 'DEMO_C' : q.cityCode }, token)).data
      for (const account of data.items) {
        const orgId = orgIds.get(account.userId)!
        const report = state.reports.get(orgId + ':' + q.periodCode)
        const { coverage, ...attributes } = mockCoverageRow(orgId, period)
        addCoverage(coverageSummary, coverage)
        all.push({
          enterpriseOrgId: orgId, enterpriseName: account.unitName, cityCode: account.cityCode === 'DEMO_C' ? '530100' : account.cityCode ?? '', cityName: account.cityName ?? '—',
          ...attributes,
          filingStatus: account.dataStatus ?? 'NO_FILING', reportStatus: reportState(orgId, q.periodCode),
          reportId: report?.reportId ?? null, reportVoided: report?.voided ?? false, lastSubmittedAt: report?.submittedAt ?? null,
        })
      }
      if ((page + 1) * data.size >= data.total) break
    }
    const summary: Awaited<ReturnType<RevisionProvider['progress']>>['data']['summary'] = { totalEnterprises: all.length, filingCounts: {}, reportCounts: {} }
    for (const row of all) {
      summary.filingCounts[row.filingStatus] = (summary.filingCounts[row.filingStatus] ?? 0) + 1
      summary.reportCounts[row.reportStatus] = (summary.reportCounts[row.reportStatus] ?? 0) + 1
    }
    const matching = all.filter(row => (!q.filingStatus || q.filingStatus === row.filingStatus) && (!q.reportStatus || reportFilterStates[q.reportStatus].includes(row.reportStatus)))
    return ok({ periodCode: q.periodCode, summary, coverageSummary, items: matching.slice(q.page * q.size, (q.page + 1) * q.size), total: matching.length, page: q.page, size: q.size })
  },
  async batchSubmit(items, token) {
    session(token, 'ENTERPRISE')
    if (!items.length || new Set(items.map(i => i.periodCode)).size !== items.length) fail(400, '请选择不同的调查期')
    const indexes = new Map(orderedPeriods(state.periods).map((p, i) => [p.code, i]))
    const sorted = [...items].sort((a, b) => (indexes.get(a.periodCode) ?? Infinity) - (indexes.get(b.periodCode) ?? Infinity) || a.periodCode.localeCompare(b.periodCode))
    const results: BatchItemResult[] = []
    for (const item of sorted) {
      const base = { periodCode: item.periodCode, reportId: null, currentVersion: null, submissionVersion: null, baselineSourcePeriodCode: null, baselineEmploymentCount: null }
      if (!indexes.has(item.periodCode)) {
        results.push({ ...base, success: false, reasonCode: 'PERIOD_NOT_FOUND', reason: '调查期不存在' })
        continue
      }
      const view = (await reports.get(item.periodCode, token)).data
      try {
        const saved = (await reports.submit(item.periodCode, item.expectedVersion, token)).data
        const fresh = (await reports.get(item.periodCode, token)).data
        results.push({ ...saved, baselineSourcePeriodCode: fresh.baselineSourcePeriodCode ?? null, baselineEmploymentCount: fresh.computedBaselineEmploymentCount ?? null, success: true, reason: null, reasonCode: null })
      } catch (e) {
        let reasonCode: BatchItemResult['reasonCode'] = 'FORM_INVALID'
        if (!view.filingEligible) reasonCode = 'FILING_NOT_APPROVED'
        else if (view.blockedReason === 'WINDOW_NOT_OPEN') reasonCode = 'WINDOW_NOT_OPEN'
        else if (view.blockedReason === 'WINDOW_CLOSED') reasonCode = 'WINDOW_CLOSED'
        else if (!view.canWrite || !view.form || view.voided) reasonCode = 'REPORT_NOT_DRAFT'
        else if (view.currentVersion !== item.expectedVersion) reasonCode = 'VERSION_CONFLICT'
        results.push({ ...base, reportId: view.reportId, currentVersion: view.currentVersion, submissionVersion: view.submissionVersion, success: false, reasonCode, reason: (e as Error).message })
      }
    }
    const successCount = results.filter(x => x.success).length
    return ok({ successCount, failureCount: results.length - successCount, items: results })
  },
  async breakdown({ periodCode, groupBy, ...filters }, token) {
    const groups = new Map<string, { name: string; members: Awaited<ReturnType<typeof sample>> }>()
    for (const item of await sample(periodCode, filters, token)) {
      const { row, info } = item
      const d = direction(row.effectiveForm.periodEmploymentCount - row.effectiveForm.baselineEmploymentCount)
      const city = getMockRegionInfo(row.regionCode)?.path.find(p => p.level === 2)
      const [code, name] = groupBy === 'CITY' ? [city?.code ?? row.regionCode, city?.name ?? row.cityName]
        : groupBy === 'NATURE' ? [info.natureCode, info.natureName]
        : groupBy === 'INDUSTRY' ? [info.industryCode, info.industryName] : [d, directionLabels[d]]
      const key = code ?? 'UNAVAILABLE'
      const group = groups.get(key) ?? { name: name ?? code ?? '分类不可用', members: [] }
      group.members.push(item)
      groups.set(key, group)
    }
    return ok({ periodCode, groupBy, filters: { regionCode: null, natureCode: null, natureParentCode: null, industryCode: null, industryParentCode: null, ...filters },
      items: [...groups].map(([groupCode, group]) => {
        const counts = { INCREASE: 0, UNCHANGED: 0, DECREASE: 0 }
        let increaseTotal = 0
        for (const {row} of group.members) {
          const change = row.effectiveForm.periodEmploymentCount - row.effectiveForm.baselineEmploymentCount
          counts[direction(change)]++
          increaseTotal += Math.max(0, change)
        }
        return { ...metrics(group.members), groupCode, groupName: group.name, increaseTotal, increaseEnterpriseCount: counts.INCREASE, unchangedEnterpriseCount: counts.UNCHANGED, decreaseEnterpriseCount: counts.DECREASE }
      }),
    })
  },
  async enterprises({ periodCode, page, size, changeDirection, ...filters }, token) {
    const items: EnterpriseAnalysisRow[] = []
    for (const { row, info } of await sample(periodCode, filters, token)) {
      const f = row.effectiveForm
      const change = f.periodEmploymentCount - f.baselineEmploymentCount
      if (changeDirection && changeDirection !== direction(change)) continue
      const city = getMockRegionInfo(row.regionCode)?.path.find(p => p.level === 2)
      items.push({
        enterpriseOrgId: row.orgId, enterpriseName: row.enterpriseName, reportId: row.reportId,
        cityCode: city?.code ?? row.regionCode, cityName: city?.name ?? row.cityName,
        natureCode: info.natureCode, natureName: info.natureName, industryCode: info.industryCode, industryName: info.industryName,
        submissionVersion: row.submissionVersion, correctionVersion: row.correctionCount,
        baselineSourcePeriodCode: state.reports.get(row.orgId + ':' + periodCode)?.baselineSourcePeriodCode ?? null,
        baselineEmploymentCount: f.baselineEmploymentCount, periodEmploymentCount: f.periodEmploymentCount,
        netChange: change, changeDirection: direction(change), changePercent: metrics([{ row, info }]).changePercent,
        primaryReasonCode: f.primaryReasonCode, primaryReasonDetail: f.primaryReasonDetail,
      })
    }
    return ok({ periodCode, items: items.slice(page * size, (page + 1) * size), total: items.length, page, size })
  },
}
