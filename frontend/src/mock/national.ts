import { getMockUserForToken } from '@/mock/auth'
import { managementMockFilings } from '@/mock/filing'
import { mockCorrectionDetails } from '@/mock/management'
import { managementMockState as state, mockRollingReportProvider } from '@/mock/report'
import { getMockRegionInfo, registerMockRegionPath } from '@/mock/system'
import { mockNationalLocks } from '@/mock/national-lock'
import { ApiError } from '@/services/api'
import { emptyReport } from '@/utils/report'
import { batchStatusLabels, canRetryNational } from '@/utils/national'
import type { NationalProvider } from '@/services/national'
import type { ReportView, SurveyPeriod } from '@/types/report'
import type { MissingEnterprise, NationalBatchDetail, NationalBlocker, NationalCity, NationalEnterprise, NationalPayload, NationalQueue, NationalReadiness, NationalReportCard, NationalSummary } from '@/types/national'

const ok = <T>(data: T) => ({ code: 'OK', message: '', traceId: 'mock-national', data: structuredClone(data) })
function fail(status: number, message: string, data?: ApiError['data']): never {
  throw new ApiError(status, message, status === 409 ? 'CONFLICT' : 'MOCK_NATIONAL_ERROR', 'mock-national', {}, data)
}
function province(token: string) {
  const user = getMockUserForToken(token)
  if (!user) fail(401, '请重新登录')
  if (user.roleCode !== 'PROVINCE') fail(403, '仅省级可使用国家上报')
  return user
}
const fixtureCode = 'MOCK_NATIONAL_CLOSED'
const iso = (ms: number) => new Date(ms).toISOString()
const todayOffset = (days: number) => iso(Date.now() + days * 86400000)
const fixtureRows = [
  { orgId: '91301', reportId: '99101', name: '匿名模拟企业甲', city: '5301', region: '530102', base: 100, count: 90 },
  { orgId: '91302', reportId: '99102', name: '匿名模拟企业乙', city: '5303', region: '530302', base: 50, count: 55 },
  { orgId: '91303', reportId: null, name: '匿名模拟缺报企业', city: '5303', region: '530302', base: 0, count: 0 },
]
function seedProvinceMock() {
  if (state.periods.some(p => p.code === fixtureCode)) return
  const period: SurveyPeriod = {
    code: fixtureCode, label: 'Mock 国家上报已截止期', startAt: todayOffset(-60), endExclusiveAt: todayOffset(-30),
    openAt: todayOffset(-28), closeAt: todayOffset(-3), demo: true, legacy: false, windowStatus: 'CLOSED', currentVersion: 1,
  }
  state.periods.push(period)
  const filings = managementMockFilings.records
  const template = filings.get('301')!
  for (const row of fixtureRows) {
    registerMockRegionPath([
      { code: 'DEMO_P', name: '演示省', level: 1 },
      { code: row.city, name: row.city === '5301' ? '模拟甲市' : '模拟乙市', level: 2 },
      { code: row.region, name: '演示区县', level: 3 },
    ])
    const profile = {
      organizationCode: 'NAT' + row.orgId, enterpriseName: row.name, natureParentCode: 'DEMO_NATURE_1', natureCode: 'DEMO_NATURE_1_1',
      industryParentCode: 'DEMO_INDUSTRY_1', industryCode: 'DEMO_INDUSTRY_1_1', mainBusiness: '本地模拟',
      contactName: '匿名', addressParentCode: 'DEMO_ADDR_1', addressCode: 'DEMO_ADDR_1_1',
      postalCode: '650000', contactPhone: '0871-12345678', fax: '0871-12345678', email: null,
    }
    filings.set(row.orgId, { ...template, orgId: row.orgId, userId: row.orgId, username: 'national-fixture-' + row.orgId,
      orgName: row.name, regionCode: row.region, filingId: row.orgId, status: 'APPROVED', currentVersion: 1, profile,
      versions: new Map(), returnReason: null })
    if (!row.reportId) continue
    const form = { ...emptyReport(), baselineEmploymentCount: row.base, periodEmploymentCount: row.count, otherReason: '无',
      ...(row.count < row.base ? { reductionTypeCode: 'MOCK_TYPE', primaryReasonCode: 'MOCK_LEAVE', primaryReasonDetail: '本地匿名减员' } : {}) }
    const key = row.orgId + ':' + fixtureCode
    const submittedAt = todayOffset(-10)
    const source = { baselineSourcePeriodCode: 'MOCK_NATIONAL_PREVIOUS', baselineSourceReportId: null, baselineEmploymentCount: row.base }
    state.owners.set(row.reportId, { orgId: row.orgId, name: row.name, cityId: row.city, provinceId: '100' })
    state.reports.set(key, {
      reportId: row.reportId, periodCode: fixtureCode, status: 'APPROVED_PROVINCE', currentVersion: 4, submissionVersion: 1,
      baselineEditable: false, baselineSourceKind: 'LEGACY_MIGRATED', ...source,
      form, updatedAt: submittedAt, submittedAt, latestReturn: null, baselineLocked: true,
      lockedBaselineEmploymentCount: row.base, filingEligible: true, windowStatus: 'CLOSED', canWrite: false, blockedReason: 'ALREADY_SUBMITTED',
    })
    state.histories.set(key, {
      reportId: row.reportId, periodCode: fixtureCode, status: 'APPROVED_PROVINCE', reviewEvents: [],
      snapshots: [{ form, submissionVersion: 1, submittedAt, submittedBy: row.orgId, result: 'SUBMITTED_CITY',
        filingId: row.orgId, filingVersion: 1, ...source }],
    })
  }
}
function geography(regionCode: string) {
  const city = getMockRegionInfo(regionCode)?.path.find(x => x.level === 2)
  return { cityCode: city?.code === 'DEMO_C' ? '5301' : city?.code ?? '', cityName: city?.name ?? '—',
    regionCode: regionCode === 'DEMO_D' ? '530102' : regionCode }
}
function summarize(items: NationalEnterprise[]): NationalSummary {
  return items.reduce((sum, row) => ({
    enterpriseCount: sum.enterpriseCount + 1,
    baselineEmploymentTotal: sum.baselineEmploymentTotal + row.baselineEmploymentCount,
    periodEmploymentTotal: sum.periodEmploymentTotal + row.periodEmploymentCount,
    netChange: sum.netChange + row.netChange,
  }), { enterpriseCount: 0, baselineEmploymentTotal: 0, periodEmploymentTotal: 0, netChange: 0 })
}
function effectiveRow(report: ReportView, orgId: string, name: string): NationalEnterprise {
  const record = managementMockFilings.records.get(orgId)
  const snapshot = state.histories.get(orgId + ':' + report.periodCode)?.snapshots[0]
  const profile = record?.versions.get(snapshot?.filingVersion ?? 0)?.profile ?? record?.profile
  const form = mockCorrectionDetails.get(report.reportId!)?.effectiveForm ?? snapshot?.form ?? report.form!
  const geo = geography(record?.regionCode ?? 'DEMO_D')
  const baseline = form.baselineEmploymentCount ?? 0
  const current = form.periodEmploymentCount ?? 0
  return {
    organizationCode: profile?.organizationCode ?? '', enterpriseName: profile?.enterpriseName ?? name,
    cityCode: geo.cityCode, regionCode: geo.regionCode, natureCode: profile?.natureCode ?? '', industryCode: profile?.industryCode ?? '',
    reportId: report.reportId!, submissionVersion: report.submissionVersion, currentVersion: report.currentVersion,
    baselineSourcePeriodCode: report.baselineSourcePeriodCode ?? snapshot?.baselineSourcePeriodCode ?? report.periodCode,
    baselineEmploymentCount: baseline, periodEmploymentCount: current, netChange: current - baseline,
    reductionTypeCode: form.reductionTypeCode, primaryReasonCode: form.primaryReasonCode, primaryReasonDetail: form.primaryReasonDetail,
    otherReason: form.otherReason ?? '',
  }
}
interface StoredBatch { owner: string; detail: NationalBatchDetail; queuedAt: number | null }
export function createMockNationalProvider(shouldFail: (attemptNo: number) => boolean = () => false): NationalProvider {
  const batches = new Map<string, StoredBatch>()
  const preparing = new Set<string>()
  function advance(stored: StoredBatch) {
    const { detail: batch, queuedAt } = stored
    if (queuedAt === null) return
    const elapsed = Date.now() - queuedAt
    if (elapsed >= 350 && batch.status === 'QUEUED') {
      batch.status = 'SENDING'
      batch.lastSentAt = iso(queuedAt + 350)
      batch.attempts.push({ attemptNo: batch.attempts.length + 1, startedAt: batch.lastSentAt,
        finishedAt: null, result: 'SENDING', errorSummary: null, mockReceiptId: null })
    }
    if (elapsed < 1100 || batch.status !== 'SENDING') return
    const attempt = batch.attempts.at(-1)!
    attempt.finishedAt = iso(queuedAt + 1100)
    stored.queuedAt = null
    if (shouldFail(attempt.attemptNo)) {
      batch.status = 'SEND_FAILED'
      attempt.result = 'FAILED'
      batch.lastError = attempt.errorSummary = '模拟发送失败'
      return
    }
    const mockReceiptId = 'MOCK-' + batch.batchId
    batch.status = 'MOCK_ACCEPTED'
    batch.lastError = null
    attempt.result = 'ACCEPTED'
    attempt.mockReceiptId = mockReceiptId
    batch.receipt = { batchId: batch.batchId, mockReceiptId, result: 'ACCEPTED',
      receivedAt: attempt.finishedAt, acceptedEnterpriseCount: batch.enterpriseCount, payloadSha256: batch.payloadSha256 }
  }
  function ownBatch(id: string, token: string) {
    const user = province(token)
    const item = batches.get(id)
    if (!item || item.owner !== user.orgId) fail(404, '批次不存在或不在本省')
    advance(item)
    return item
  }
  function readiness(code: string, token: string): NationalReadiness {
    const user = province(token)
    const p = state.periods.find(period => period.code === code)
    if (!p || user.orgId !== '100') fail(404, '调查期不存在或不在本省')
    const period: NationalReadiness['period'] = {
      periodCode: code, periodLabel: p.label, startAt: p.startAt, endExclusiveAt: p.endExclusiveAt, closeAt: p.closeAt,
      legacy: p.legacy, windowStatus: p.legacy ? 'UNAVAILABLE' : Date.now() < Date.parse(p.openAt!) ? 'NOT_OPEN' : Date.now() >= Date.parse(p.closeAt!) ? 'CLOSED' : 'OPEN',
    }
    const counts: NationalReadiness['counts'] = { approvedCount: 0, pendingCityCount: 0, pendingProvinceCount: 0, returnedCityCount: 0, returnedProvinceCount: 0, voidedCount: 0, missingCount: 0 }
    const enterprises: NationalEnterprise[] = []
    for (const report of state.reports.values()) {
      const owner = state.owners.get(report.reportId ?? '')
      if (report.periodCode !== code || owner?.provinceId !== user.orgId || !report.submissionVersion) continue
      if (report.voided) counts.voidedCount++
      else if (report.status === 'APPROVED_PROVINCE') enterprises.push(effectiveRow(report, owner.orgId, owner.name))
      else if (report.status === 'SUBMITTED_CITY') counts.pendingCityCount++
      else if (report.status === 'SUBMITTED_PROVINCE') counts.pendingProvinceCount++
      else if (report.status === 'RETURNED_CITY') counts.returnedCityCount++
      else if (report.status === 'RETURNED_PROVINCE') counts.returnedProvinceCount++
    }
    const missingEnterprises: MissingEnterprise[] = []
    for (const record of managementMockFilings.records.values()) {
      if (record.status !== 'APPROVED') continue
      const report = state.reports.get(record.orgId + ':' + code)
      if (report?.submissionVersion) continue
      const geo = geography(record.regionCode)
      missingEnterprises.push({ enterpriseOrgId: record.orgId, enterpriseName: record.profile?.enterpriseName ?? record.orgName,
        cityCode: geo.cityCode, regionCode: geo.regionCode, reportStatus: report?.status === 'DRAFT' ? 'DRAFT' : null })
    }
    counts.approvedCount = enterprises.length
    counts.missingCount = missingEnterprises.length
    const cities: NationalCity[] = [...new Set(enterprises.map(row => row.cityCode))].map(cityCode => {
      const rows = enterprises.filter(row => row.cityCode === cityCode)
      return { cityCode, cityName: geography(rows[0]!.regionCode).cityName, ...summarize(rows) }
    })
    const stored = batches.get('YN-' + code + '-0001')
    if (stored) advance(stored)
    const existingBatch = stored ? { batchId: stored.detail.batchId, status: stored.detail.status } : null
    const blockers: NationalBlocker[] = []
    if (period.legacy) blockers.push({ code: 'LEGACY_PERIOD', message: '旧演示期次不可上报' })
    if (period.windowStatus !== 'CLOSED') blockers.push({ code: 'WINDOW_NOT_CLOSED', message: '填报窗口尚未关闭' })
    if (counts.pendingCityCount) blockers.push({ code: 'PENDING_CITY', message: '仍有待市审报表' })
    if (counts.pendingProvinceCount) blockers.push({ code: 'PENDING_PROVINCE', message: '仍有待省审报表' })
    if (counts.returnedCityCount) blockers.push({ code: 'RETURNED_CITY', message: '仍有市级退回待重报记录' })
    if (counts.returnedProvinceCount) blockers.push({ code: 'RETURNED_PROVINCE', message: '仍有省级退回待重报记录' })
    if (!enterprises.length) blockers.push({ code: 'NO_VALID_REPORT', message: '暂无可上报的有效报表' })
    if (existingBatch) blockers.push({ code: 'BATCH_EXISTS', message: '本期已有上报批次' })
    return { period, canSubmit: !blockers.length, blockers, counts, missingEnterprises, requiresMissingAcknowledgement: !!missingEnterprises.length,
      preview: { summary: summarize(enterprises), cities, enterprises }, existingBatch }
  }
  const queue = (batch: NationalBatchDetail): NationalQueue => ({ batchId: batch.batchId, status: 'QUEUED', mode: 'MOCK',
    enterpriseCount: batch.enterpriseCount, detailPath: '/province/national/batches/' + batch.batchId })
  return {
    async periods(token) {
      const user = province(token)
      if (user.orgId === '100') seedProvinceMock()
      return mockRollingReportProvider.periods(token)
    },
    async readiness(code, token) { return ok(readiness(code, token)) },
    async create({ periodCode, acknowledgeMissing }, token) {
      const user = province(token)
      const id = 'YN-' + periodCode + '-0001'
      const check = () => {
        const fresh = readiness(periodCode, token)
        if (fresh.existingBatch) fail(409, '本期已有上报批次', { reasonCode: 'BATCH_EXISTS', existingBatchId: fresh.existingBatch.batchId })
        if (!fresh.canSubmit) fail(409, '本期暂不可上报', { reasonCode: 'NOT_READY', blockers: fresh.blockers })
        if (fresh.requiresMissingAcknowledgement && !acknowledgeMissing) fail(409, '请勾选知晓缺报企业', { reasonCode: 'MISSING_ACKNOWLEDGEMENT' })
        return fresh
      }
      if (preparing.has(id)) fail(409, '本期批次正在创建，请刷新查看')
      const fresh = check()
      if (fresh.preview.enterprises.some(row => !row.organizationCode || !row.natureCode || !row.industryCode || !/^53\d{2}$/.test(row.cityCode) || !/^53\d{4}$/.test(row.regionCode))) {
        fail(400, '企业地区或备案字段不符合模拟报文要求', { reasonCode: 'PAYLOAD_INVALID' })
      }
      const now = iso(Date.now())
      const payload: NationalPayload = { schemaVersion: 'demo-1', batchId: id, mode: 'MOCK', provinceCode: '53', periodCode,
        periodStartAt: fresh.period.startAt, periodEndExclusiveAt: fresh.period.endExclusiveAt, generatedAt: now, ...fresh.preview }
      preparing.add(id)
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(payload))
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        const payloadSha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
        if (JSON.stringify(check().preview) !== JSON.stringify(fresh.preview)) fail(409, '有效报表已变化，请重新预览', { reasonCode: 'NOT_READY' })
        const detail: NationalBatchDetail = { batchId: id, periodCode, mode: 'MOCK', status: 'QUEUED', enterpriseCount: payload.summary.enterpriseCount,
          payloadSha256, createdAt: now, lastSentAt: null, retryCount: 0, lastError: null, payload, attempts: [], receipt: null }
        batches.set(id, { detail, owner: user.orgId, queuedAt: Date.now() })
        for (const row of payload.enterprises) mockNationalLocks.set(row.reportId, id)
        return ok(queue(detail))
      } finally { preparing.delete(id) }
    },
    async list(query, token) {
      const user = province(token)
      const rows = [...batches.values()].filter(item => item.owner === user.orgId).map(item => { advance(item); return item.detail })
        .filter(row => (!query.periodCode || row.periodCode === query.periodCode) && (!query.status || row.status === query.status))
        .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.batchId.localeCompare(a.batchId))
      return ok({ items: rows.slice(query.page * query.size, (query.page + 1) * query.size).map(({ payload, attempts, receipt, ...row }) => row),
        total: rows.length, page: query.page, size: query.size })
    },
    async detail(id, token) { return ok(ownBatch(id, token).detail) },
    async retry(id, token) {
      const item = ownBatch(id, token)
      if (!canRetryNational(item.detail.status)) fail(409, '当前状态不可继续发送', { reasonCode: 'RETRY_NOT_ALLOWED' })
      if (item.detail.status === 'SEND_FAILED') {
        item.detail.status = 'QUEUED'
        item.detail.retryCount++
        item.queuedAt = Date.now()
      }
      return ok(queue(item.detail))
    },
  }
}
export const mockNationalProvider = createMockNationalProvider()
export async function mockNationalCard(code: string | undefined, token: string): Promise<NationalReportCard> {
  const base = { route: '/province/national' as const, batchId: null, canStart: false, canRetry: false }
  if (!code) return { ...base, periodCode: null, state: 'NO_PERIOD', label: '暂无调查期' }
  const { data } = await mockNationalProvider.readiness(code, token)
  const batch = data.existingBatch
  if (batch) return { ...base, periodCode: code, state: batch.status, label: batchStatusLabels[batch.status], batchId: batch.batchId, canRetry: canRetryNational(batch.status) }
  return { ...base, periodCode: code, state: data.canSubmit ? 'READY' : 'BLOCKED', label: data.canSubmit ? '本期可上报' : '本期暂不可上报', canStart: data.canSubmit }
}
