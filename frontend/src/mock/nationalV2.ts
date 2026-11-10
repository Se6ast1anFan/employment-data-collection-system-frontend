import { getMockUserForToken } from '@/mock/auth'
import { managementMockFilings as filings } from '@/mock/filing'
import { managementMockState as state, mockRollingReportProvider } from '@/mock/report'
import { effectiveRow, mockNationalProvider } from '@/mock/national'
import { mockNationalLocks } from '@/mock/national-lock'
import { eligibleInMock, mockGeography, mockV2Proxies } from '@/mock/midtermCoverage'
import { seedMidtermFixtures } from '@/mock/midtermFixtures'
import { ApiError } from '@/services/api'
import type { NationalV2Provider } from '@/services/nationalV2'
import type { BatchDetailV2, Blocker, Fillable, NationalTotals, NoSource, ProxyItem, QueueResult, ReadinessV2, RealItem } from '@/types/midterm'
import type { NationalBatchSummary } from '@/types/national'

const ok = <T>(data: T) => ({ code: 'OK', message: '', traceId: 'mock-national-v2', data: structuredClone(data) })
const fail = (status: number, message: string, data?: ApiError['data']): never => {
  throw new ApiError(status, message, status === 409 ? 'CONFLICT' : 'MOCK_V2_ERROR', '', {}, data)
}
function scope(token: string) {
  const user = getMockUserForToken(token)
  if (!user) fail(401, '请重新登录')
  if (user?.roleCode !== 'PROVINCE' || user.orgId !== '100') fail(403, '当前账号无权操作本省批次')
}
const iso = (time = Date.now()) => new Date(time).toISOString()
const idFor = (periodCode: string) => 'YN-' + periodCode + '-0001'
const legacyCode = 'MOCK_NATIONAL_CLOSED'
const legacyId = idFor(legacyCode)
const legacySummary = (batch: NationalBatchSummary) => ({ ...batch, schemaVersion: 'demo-1' as const,
  payloadFormat: 'JSON' as const, realCount: batch.enterpriseCount, proxyCount: 0 })

function totals(real: RealItem[], proxies: ProxyItem[]): NationalTotals {
  const rows = [...real, ...proxies]
  return { enterpriseCount: rows.length, realCount: real.length, proxyCount: proxies.length,
    baselineEmploymentTotal: rows.reduce((sum, row) => sum + row.baselineEmploymentCount, 0),
    periodEmploymentTotal: rows.reduce((sum, row) => sum + row.periodEmploymentCount, 0),
    netChange: rows.reduce((sum, row) => sum + row.netChange, 0) }
}
function isMonthly(startAt: string, endAt: string) {
  const local = new Date(Date.parse(startAt) + 8 * 3600000)
  if (local.getUTCDate() !== 1 || local.getUTCHours() || local.getUTCMinutes() || local.getUTCSeconds() || local.getUTCMilliseconds()) return false
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - 8 * 3600000 === Date.parse(endAt)
}
function previousReal(orgId: string, before: string) {
  const prior = state.periods.filter(period => !period.legacy && isMonthly(period.startAt, period.endExclusiveAt) && Date.parse(period.startAt) < Date.parse(before))
    .sort((left, right) => Date.parse(right.startAt) - Date.parse(left.startAt))
  for (const period of prior) {
    const report = state.reports.get(orgId + ':' + period.code)
    if (!report?.reportId || report.status !== 'APPROVED_PROVINCE' || !report.submissionVersion || report.voided) continue
    const owner = state.owners.get(report.reportId)
    if (owner?.provinceId !== '100') continue
    return { sourcePeriodCode: period.code, sourceReportId: report.reportId, sourceSubmissionVersion: report.submissionVersion,
      sourceCurrentVersion: report.currentVersion, periodEmploymentCount: effectiveRow(report, orgId, owner.name).periodEmploymentCount }
  }
}
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)
function elements(data: Record<string, string | number | null>) {
  return Object.entries(data).filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => '<' + key + '>' + escape(value!) + '</' + key + '>').join('')
}
function makeXml(preview: ReadinessV2, batchId: string, generatedAt: string) {
  const p = preview.period
  const header = elements({ BatchId: batchId, Mode: 'MOCK_QUEUE', ProvinceCode: '53', PeriodCode: p.periodCode,
    PeriodStartAt: p.startAt, PeriodEndExclusiveAt: p.endExclusiveAt, GeneratedAt: generatedAt })
  const s = preview.previewSummary
  const summary = elements({ EnterpriseCount: s.enterpriseCount, RealCount: s.realCount, ProxyCount: s.proxyCount,
    BaselineEmploymentTotal: s.baselineEmploymentTotal, PeriodEmploymentTotal: s.periodEmploymentTotal, NetChange: s.netChange })
  const enterprises = [...preview.realEnterprises, ...preview.proxyItems].map(item => {
    const real = 'reportId' in item
    const report = state.reports.get(item.enterpriseOrgId + ':' + (real ? p.periodCode : item.proxySourcePeriodCode))!
    const source = effectiveRow(report, item.enterpriseOrgId, item.enterpriseName)
    const organizationCode = real ? source.organizationCode : item.organizationCode
    const identity = elements({ OrganizationCode: organizationCode, EnterpriseName: item.enterpriseName,
      RegionCode: item.regionCode, NatureCode: source.natureCode, IndustryCode: source.industryCode })
    const provenance = real ? elements({ ReportId: source.reportId, SubmissionVersion: source.submissionVersion, CurrentVersion: source.currentVersion,
      BaselineSourcePeriodCode: source.baselineSourcePeriodCode }) : elements({ ProxySourcePeriodCode: item.proxySourcePeriodCode,
      SourceReportId: item.sourceReportId, SourceSubmissionVersion: item.sourceSubmissionVersion, SourceCurrentVersion: item.sourceCurrentVersion })
    const values = elements({ BaselineEmploymentCount: item.baselineEmploymentCount, PeriodEmploymentCount: item.periodEmploymentCount, NetChange: item.netChange })
    const reason = real && item.netChange < 0 ? elements({ ReductionTypeCode: source.reductionTypeCode, PrimaryReasonCode: source.primaryReasonCode,
      PrimaryReasonDetail: source.primaryReasonDetail, OtherReason: source.otherReason }) : ''
    return { region: item.regionCode, organizationCode, xml: '<Enterprise reportMode="' + (real ? 'REAL' : 'PROXY') + '">' + identity + provenance + values + reason + '</Enterprise>' }
  }).sort((a, b) => a.region.localeCompare(b.region) || a.organizationCode.localeCompare(b.organizationCode))
  return '<?xml version="1.0" encoding="UTF-8"?>\n<ProvinceReport schemaVersion="demo-2"><Header>' + header + '</Header><Summary>' + summary
    + '</Summary><Enterprises>' + enterprises.map(item => item.xml).join('') + '</Enterprises></ProvinceReport>'
}

export function createMockNationalV2(shouldFail: (attempt: number) => boolean = () => false): NationalV2Provider {
  const batches = new Map<string, { detail: BatchDetailV2; queuedAt: number | null }>()
  const preparing = new Set<string>()
  let legacySeed: Promise<void> | undefined
  function seedLegacy(token: string) {
    legacySeed ??= (async () => {
      await mockNationalProvider.periods(token)
      const preview = (await mockNationalProvider.readiness(legacyCode, token)).data
      if (preview.canSubmit) await mockNationalProvider.create({ periodCode: legacyCode, acknowledgeMissing: true }, token)
    })().catch(error => { legacySeed = undefined; throw error })
    return legacySeed
  }
  function advance(stored: { detail: BatchDetailV2; queuedAt: number | null }) {
    const { detail, queuedAt } = stored
    if (queuedAt === null) return
    const elapsed = Date.now() - queuedAt
    const progress = detail.chunkProgress!
    if (elapsed >= 400 && detail.status === 'QUEUED') {
      detail.status = 'SENDING'
      detail.lastSentAt = iso(queuedAt + 400)
      detail.attempts.push({ attemptNo: detail.attempts.length + 1, startedAt: detail.lastSentAt,
        finishedAt: null, result: 'SENDING', errorSummary: null, mockReceiptId: null })
    }
    if (elapsed >= 1400 && detail.status === 'SENDING') {
      const attempt = detail.attempts.at(-1)!
      if (shouldFail(attempt.attemptNo)) {
        stored.queuedAt = null
        detail.status = 'SEND_FAILED'
        detail.lastError = progress.lastError = attempt.errorSummary = '本地演示发送失败'
        attempt.result = 'FAILED'
        attempt.finishedAt = iso(queuedAt + 1400)
        return
      }
      detail.status = 'ASSEMBLING'
      progress.brokerConfirmedCount = progress.chunkCount
      progress.receiverStoredCount = Math.max(0, progress.chunkCount - 1)
    }
    if (elapsed >= 3000 && detail.status === 'ASSEMBLING') {
      const attempt = detail.attempts.at(-1)!
      const receivedAt = iso(queuedAt + 3000)
      const receiptId = 'MOCK-V2-' + detail.batchId
      stored.queuedAt = null
      detail.status = 'MOCK_ACCEPTED'
      progress.receiverStoredCount = progress.chunkCount
      progress.assembledAt = receivedAt
      attempt.result = 'ACCEPTED'
      attempt.finishedAt = receivedAt
      attempt.mockReceiptId = receiptId
      detail.receipt = { batchId: detail.batchId, mockReceiptId: receiptId, result: 'ACCEPTED', receivedAt,
        acceptedEnterpriseCount: detail.enterpriseCount, realCount: detail.realCount, proxyCount: detail.proxyCount,
        chunkCount: progress.chunkCount, payloadSha256: detail.payloadSha256 }
    }
  }
  async function buildReadiness(code: string, token: string) {
    scope(token)
    const item = state.periods.find(period => period.code === code) ?? fail(404, '本省调查期不存在')
    const period: ReadinessV2['period'] = { periodCode: code, periodLabel: item.label, startAt: item.startAt, endExclusiveAt: item.endExclusiveAt,
      closeAt: item.closeAt, legacy: item.legacy, windowStatus: item.legacy || !item.closeAt || !item.openAt ? 'UNAVAILABLE'
        : Date.now() >= Date.parse(item.closeAt) ? 'CLOSED' : Date.now() >= Date.parse(item.openAt) ? 'OPEN' : 'NOT_OPEN' }
    const set = mockV2Proxies.get(code)
    const counts: ReadinessV2['counts'] = { eligibleCount: 0, realCount: 0, proxyCount: 0, missingCount: 0, fillableCount: 0, noSourceCount: 0,
      pendingCityCount: 0, pendingProvinceCount: 0, returnedCityCount: 0, returnedProvinceCount: 0, voidedCount: 0 }
    const realEnterprises: RealItem[] = [], proxyItems: ProxyItem[] = [], fillable: Fillable[] = [], noRealSource: NoSource[] = []
    const candidates: Fillable[] = [], blocked: NoSource[] = []
    const reasons = { SUBMITTED_CITY: 'pendingCityCount', SUBMITTED_PROVINCE: 'pendingProvinceCount', RETURNED_CITY: 'returnedCityCount', RETURNED_PROVINCE: 'returnedProvinceCount' } as const
    for (const filing of filings.records.values()) {
      const orgId = filing.orgId
      if (!eligibleInMock(orgId, item)) continue
      counts.eligibleCount++
      const geo = mockGeography(filing.regionCode)
      const identity = { enterpriseOrgId: orgId, enterpriseName: filing.profile?.enterpriseName ?? filing.orgName, regionCode: geo.regionCode }
      const report = state.reports.get(orgId + ':' + code)
      if (report?.voided) counts.voidedCount++
      if (report?.reportId && report.submissionVersion && !report.voided) {
        if (report.status === 'APPROVED_PROVINCE') {
          const r = effectiveRow(report, orgId, identity.enterpriseName)
          realEnterprises.push({ ...identity, reportId: r.reportId, baselineEmploymentCount: r.baselineEmploymentCount,
            periodEmploymentCount: r.periodEmploymentCount, netChange: r.netChange })
        } else if (report.status && Object.hasOwn(reasons, report.status)) counts[reasons[report.status as keyof typeof reasons]]++
        continue
      }
      const source = previousReal(orgId, item.startAt)
      const missing = { ...identity, cityCode: geo.cityCode }
      const prospect = source && { ...missing, source }
      const noSource = { ...missing, reason: 'NO_PREVIOUS_APPROVED_REAL_REPORT' as const }
      if (prospect) candidates.push(prospect)
      else blocked.push(noSource)
      const proxy = set?.items.find(row => row.enterpriseOrgId === orgId)
      if (proxy) proxyItems.push(proxy)
      else if (prospect) fillable.push(prospect)
      else noRealSource.push(noSource)
    }
    counts.realCount = realEnterprises.length
    counts.proxyCount = proxyItems.length
    counts.missingCount = counts.eligibleCount - counts.realCount - counts.proxyCount
    counts.fillableCount = fillable.length
    counts.noSourceCount = noRealSource.length
    const stored = batches.get(idFor(code))
    if (stored) advance(stored)
    const legacy = code === legacyCode ? (await mockNationalProvider.readiness(code, token)).data.existingBatch : null
    const existingBatch = stored ? { batchId: stored.detail.batchId, status: stored.detail.status, payloadFormat: 'XML' as const }
      : legacy ? { ...legacy, payloadFormat: 'JSON' as const } : null
    const blockers: Blocker[] = []
    if (period.legacy || !isMonthly(item.startAt, item.endExclusiveAt)) blockers.push({ code: 'LEGACY_PERIOD', message: '仅支持非旧版月度调查期' })
    if (period.windowStatus !== 'CLOSED') blockers.push({ code: 'WINDOW_NOT_CLOSED', message: '填报窗口尚未关闭' })
    for (const [key, message] of [['PENDING_CITY', '仍有待市审报表'], ['PENDING_PROVINCE', '仍有待省审报表'], ['RETURNED_CITY', '仍有市级退回待重报'], ['RETURNED_PROVINCE', '仍有省级退回待重报']] as const) {
      if (counts[reasons[key === 'PENDING_CITY' ? 'SUBMITTED_CITY' : key === 'PENDING_PROVINCE' ? 'SUBMITTED_PROVINCE' : key]]) blockers.push({ code: key, message })
    }
    if (!counts.eligibleCount) blockers.push({ code: 'NO_ELIGIBLE_ENTERPRISE', message: '本期暂无应报企业' })
    if (counts.missingCount) blockers.push({ code: 'UNCOVERED_ENTERPRISE', message: '仍有应报企业未覆盖' })
    if (counts.noSourceCount) blockers.push({ code: 'NO_REAL_SOURCE', message: '有企业没有可用历史真实报表' })
    if (existingBatch) blockers.push({ code: 'BATCH_EXISTS', message: '本期已有冻结批次' })
    const readiness: ReadinessV2 = { period, counts, blockers, canSubmit: blockers.length === 0, existingBatch, proxyVersion: set?.version ?? 0,
      realEnterprises, proxyItems, fillable, noRealSource, previewSummary: totals(realEnterprises, proxyItems) }
    return { readiness, candidates, blocked }
  }
  const queue = (detail: BatchDetailV2): QueueResult => ({ batchId: detail.batchId, status: 'QUEUED', mode: 'MOCK_QUEUE', payloadFormat: 'XML',
    enterpriseCount: detail.enterpriseCount, realCount: detail.realCount, proxyCount: detail.proxyCount, detailPath: '/province/national/batches/' + detail.batchId })
  function checkVersion(code: string, version: number) {
    if (preparing.has(code) || batches.has(idFor(code))) fail(409, '本期正在冻结或已冻结', { reasonCode: 'BATCH_EXISTS' })
    if ((mockV2Proxies.get(code)?.version ?? 0) !== version) fail(409, '代填集合版本已变化，请刷新', { reasonCode: 'VERSION_CONFLICT' })
  }
  function requireCurrentSources(data: ReadinessV2, candidates: Fillable[]) {
    for (const item of data.proxyItems) {
      const source = candidates.find(row => row.enterpriseOrgId === item.enterpriseOrgId)?.source
      if (!source || source.sourceReportId !== item.sourceReportId || source.sourceCurrentVersion !== item.sourceCurrentVersion
        || source.sourceSubmissionVersion !== item.sourceSubmissionVersion) fail(409, '代填来源已变化，请重新生成', { reasonCode: 'PROXY_SOURCE_CHANGED' })
    }
  }
  return {
    async periods(token) {
      scope(token)
      seedMidtermFixtures()
      await seedLegacy(token)
      return mockRollingReportProvider.periods(token)
    },
    async readiness(code, token) { return ok((await buildReadiness(code, token)).readiness) },
    async generate(code, version, token) {
      const { readiness, candidates, blocked } = await buildReadiness(code, token)
      checkVersion(code, version)
      if (readiness.blockers.some(item => !['UNCOVERED_ENTERPRISE', 'NO_REAL_SOURCE'].includes(item.code))) {
        fail(409, '当前期次不满足代填门槛', { reasonCode: 'NOT_READY', blockers: readiness.blockers })
      }
      if (blocked.length) fail(409, '有企业没有历史真实来源，本次未生成代填', { reasonCode: 'NO_REAL_SOURCE', enterpriseOrgIds: blocked.map(row => row.enterpriseOrgId) })
      const generatedAt = iso()
      const items = candidates.map(({ source, ...row }): ProxyItem => ({
        ...row, organizationCode: filings.records.get(row.enterpriseOrgId)?.profile?.organizationCode ?? '',
        proxySourcePeriodCode: source.sourcePeriodCode, sourceReportId: source.sourceReportId, sourceSubmissionVersion: source.sourceSubmissionVersion,
        sourceCurrentVersion: source.sourceCurrentVersion, periodEmploymentCount: source.periodEmploymentCount,
        baselineEmploymentCount: source.periodEmploymentCount, netChange: 0, generatedAt,
      }))
      mockV2Proxies.set(code, { version: version + 1, items })
      return ok({ periodCode: code, proxyVersion: version + 1, generatedCount: items.length, items, previewSummary: totals(readiness.realEnterprises, items) })
    },
    async revoke(code, version, token) {
      const { readiness } = await buildReadiness(code, token)
      checkVersion(code, version)
      if (readiness.existingBatch) fail(409, '批次已冻结', { reasonCode: 'BATCH_EXISTS' })
      const removedCount = mockV2Proxies.get(code)?.items.length ?? 0
      mockV2Proxies.set(code, { version: version + 1, items: [] })
      return ok({ periodCode: code, proxyVersion: version + 1, removedCount })
    },
    async create(code, token) {
      scope(token)
      if (preparing.has(code)) fail(409, '本期正在冻结', { reasonCode: 'NOT_READY' })
      preparing.add(code)
      try {
        const { readiness, candidates } = await buildReadiness(code, token)
        if (readiness.existingBatch) fail(409, '本期已有批次', { reasonCode: 'BATCH_EXISTS', existingBatchId: readiness.existingBatch.batchId })
        if (!readiness.canSubmit) fail(409, '当前期次尚不可建批', { reasonCode: 'NOT_READY', blockers: readiness.blockers })
        requireCurrentSources(readiness, candidates)
        const batchId = idFor(code), createdAt = iso()
        const payloadXml = makeXml(readiness, batchId, createdAt)
        const bytes = new TextEncoder().encode(payloadXml)
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        const fresh = await buildReadiness(code, token)
        requireCurrentSources(fresh.readiness, fresh.candidates)
        if (!fresh.readiness.canSubmit || makeXml(fresh.readiness, batchId, createdAt) !== payloadXml) fail(409, '预览数据已变化，请刷新', { reasonCode: 'NOT_READY' })
        const summary = fresh.readiness.previewSummary
        const detail: BatchDetailV2 = { batchId, periodCode: code, schemaVersion: 'demo-2', mode: 'MOCK_QUEUE', payloadFormat: 'XML', status: 'QUEUED',
          enterpriseCount: summary.enterpriseCount, realCount: summary.realCount, proxyCount: summary.proxyCount,
          payloadSha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
          createdAt, lastSentAt: null, retryCount: 0, lastError: null, payload: null, payloadXml,
          chunkProgress: { chunkCount: Math.ceil(bytes.length / 1024), brokerConfirmedCount: 0, receiverStoredCount: 0, assembledAt: null, lastError: null },
          attempts: [], receipt: null }
        batches.set(batchId, { detail, queuedAt: Date.now() })
        const set = mockV2Proxies.get(code)
        if (set) set.frozen = true
        for (const item of fresh.readiness.realEnterprises) mockNationalLocks.set(item.reportId, batchId)
        return ok(queue(detail))
      } finally { preparing.delete(code) }
    },
    async list({ page, size, periodCode, status }, token) {
      scope(token)
      await seedLegacy(token)
      const prior = (await mockNationalProvider.list({ page: 0, size: 100, periodCode }, token)).data.items.map(legacySummary)
      const fresh = [...batches.values()].map(item => {
        advance(item)
        const { payload, payloadXml, chunkProgress, attempts, receipt, ...summary } = item.detail
        return summary
      })
      const items = [...prior, ...fresh].filter(item => (!periodCode || item.periodCode === periodCode) && (!status || item.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.batchId.localeCompare(a.batchId))
      return ok({ items: items.slice(page * size, (page + 1) * size), total: items.length, page, size })
    },
    async detail(id, token) {
      scope(token)
      const stored = batches.get(id)
      if (stored) { advance(stored); return ok(stored.detail) }
      await seedLegacy(token)
      const legacy = (await mockNationalProvider.detail(id, token)).data
      return ok({ ...legacy, ...legacySummary(legacy), payloadXml: null, chunkProgress: null })
    },
    async retry(id, token) {
      scope(token)
      if (id === legacyId) fail(409, 'V1 历史批次仅可查看', { reasonCode: 'V1_READ_ONLY' })
      const stored = batches.get(id) ?? fail(404, '本省批次不存在')
      advance(stored)
      if (!['QUEUED', 'SEND_FAILED'].includes(stored.detail.status)) fail(409, '当前批次不可重试', { reasonCode: 'RETRY_NOT_ALLOWED' })
      stored.detail.retryCount++
      stored.detail.status = 'QUEUED'
      stored.detail.lastError = null
      stored.detail.chunkProgress!.lastError = null
      stored.queuedAt = Date.now()
      return ok(queue(stored.detail))
    },
  }
}
export const mockNationalV2 = createMockNationalV2()
