import { getMockUserForToken, hasMockUsername, registerMockEnterpriseAccount } from '@/mock/auth'
import { getMockRegionInfo } from '@/mock/system'
import { ApiError } from '@/services/api'
import type { ApiResponse, CurrentUser } from '@/types/api'
import type {
  DownloadedFile, EnterpriseAccountCreateRequest, EnterpriseAccountData, EnterpriseProfileData,
  EnterpriseProfileFields, FilingDetailData, FilingExportQuery, FilingHistoryItem, FilingListData,
  FilingListQuery, FilingOptionsData, FilingStatusData, FilingVersionData, Period, ReviewData,
  SubmitData,
} from '@/types/filing'
import type { FilingProvider } from '@/services/filing'
import { formatBeijingTime, formatRegion, normalizeProfile, validateProfile } from '@/utils/filing'
import { createXlsxBlob } from '@/utils/xlsx'

interface MockEnterpriseRecord {
  orgId: string
  userId: string
  username: string
  orgName: string
  regionCode: string
  filingId: string | null
  status: EnterpriseProfileData['status']
  currentVersion: number
  profile: EnterpriseProfileFields | null
  updatedAt: string | null
  submittedAt: string | null
  reviewedAt: string | null
  returnReason: string | null
  versions: Map<number, FilingVersionData>
}

const options: FilingOptionsData = {
  natures: [
    { code: 'DEMO_NATURE_1', name: '国有及国有控股', children: [{ code: 'DEMO_NATURE_1_1', name: '国有企业', parentCode: 'DEMO_NATURE_1' }] },
    { code: 'DEMO_NATURE_2', name: '非国有企业', children: [{ code: 'DEMO_NATURE_2_1', name: '有限责任公司', parentCode: 'DEMO_NATURE_2' }] },
  ],
  industries: [
    { code: 'DEMO_INDUSTRY_1', name: '制造业', children: [{ code: 'DEMO_INDUSTRY_1_1', name: '通用设备制造', parentCode: 'DEMO_INDUSTRY_1' }] },
    { code: 'DEMO_INDUSTRY_2', name: '服务业', children: [{ code: 'DEMO_INDUSTRY_2_1', name: '信息技术服务', parentCode: 'DEMO_INDUSTRY_2' }] },
  ],
  addresses: [
    { code: 'DEMO_ADDR_1', name: '演示市', children: [{ code: 'DEMO_ADDR_1_1', name: '演示区县', parentCode: 'DEMO_ADDR_1' }] },
    { code: 'DEMO_ADDR_2', name: '示例市', children: [{ code: 'DEMO_ADDR_2_1', name: '示例区县', parentCode: 'DEMO_ADDR_2' }] },
  ],
  demo: true,
}

const periods: Period[] = [{
  code: 'DEMO_2026_10', label: '演示 2026 年 10 月', startAt: '2026-09-30T16:00:00Z',
  endExclusiveAt: '2026-10-31T16:00:00Z', demo: true,
}]

const records = new Map<string, MockEnterpriseRecord>([
  ['301', {
    orgId: '301', userId: '101', username: 'demo_enterprise', orgName: '演示企业', regionCode: 'DEMO_D',
    filingId: null, status: null, currentVersion: 0, profile: null, updatedAt: null,
    submittedAt: null, reviewedAt: null, returnReason: null, versions: new Map(),
  }],
])

let nextOrgId = 400
let nextUserId = 200
let nextFilingId = 600
const wait = () => new Promise((resolve) => window.setTimeout(resolve, 80))
const traceId = () => `mock-w2-${crypto.randomUUID()}`
const now = () => new Date().toISOString()
const clone = <T>(value: T): T => structuredClone(value)
const response = <T>(data: T): ApiResponse<T> => ({ code: 'OK', message: '', data, traceId: traceId() })

function error(status: number, message: string, code: string, fieldErrors: Record<string, string> = {}): never {
  throw new ApiError(status, message, code, traceId(), fieldErrors)
}

function userFor(token: string, role?: CurrentUser['roleCode']): CurrentUser {
  const user = getMockUserForToken(token)
  if (!user) return error(401, '未登录或登录已过期', 'UNAUTHORIZED')
  if (role && user.roleCode !== role) return error(403, '无权访问', 'FORBIDDEN')
  return user
}

function enterpriseRecord(token: string): MockEnterpriseRecord {
  const user = userFor(token, 'ENTERPRISE')
  const record = records.get(user.orgId)
  if (!record) return error(404, '企业资料不存在', 'NOT_FOUND')
  return record
}

function regionFor(record: MockEnterpriseRecord) {
  return getMockRegionInfo(record.regionCode)!
}

function historyFor(record: MockEnterpriseRecord): FilingHistoryItem[] {
  return [...record.versions.values()].sort((a, b) => a.version - b.version).map((item) => ({
    version: item.version, result: item.result, submittedAt: item.submittedAt,
    reviewedAt: item.reviewedAt, reason: item.reason,
  }))
}

function profileData(record: MockEnterpriseRecord): EnterpriseProfileData {
  return {
    filingId: record.filingId, status: record.status, currentVersion: record.currentVersion,
    editable: record.status === null || record.status === 'DRAFT' || record.status === 'RETURNED',
    region: regionFor(record), profile: record.profile ? clone(record.profile) : null, updatedAt: record.updatedAt,
  }
}

function statusData(record: MockEnterpriseRecord): FilingStatusData {
  return {
    filingId: record.filingId, status: record.status, currentVersion: record.currentVersion,
    canReport: record.status === 'APPROVED', submittedAt: record.submittedAt,
    reviewedAt: record.reviewedAt, returnReason: record.returnReason, history: historyFor(record),
  }
}

function validateDictionary(parent: string | null, child: string | null, source: FilingOptionsData['natures'], field: string) {
  if (!parent && !child) return
  const found = source.find((item) => item.code === parent)
  if (found && !child) return
  if (!found || !child || !found.children.some((item) => item.code === child && item.parentCode === parent)) {
    error(400, '请求参数不合法', 'BAD_REQUEST', { [field]: '请选择有效且匹配的两级选项' })
  }
}

function getRecordByFilingId(filingId: string): MockEnterpriseRecord {
  const record = [...records.values()].find((item) => item.filingId === filingId)
  if (!record) return error(404, '备案记录不存在', 'NOT_FOUND')
  return record
}

function currentVersion(record: MockEnterpriseRecord): FilingVersionData {
  const version = record.versions.get(record.currentVersion)
  if (!version) return error(404, '备案版本不存在', 'NOT_FOUND')
  return version
}

function detailData(record: MockEnterpriseRecord): FilingDetailData {
  const version = currentVersion(record)
  return {
    filingId: record.filingId!, orgId: record.orgId,
    status: record.status as FilingDetailData['status'], currentVersion: record.currentVersion,
    region: regionFor(record), profile: clone(version.profile), submittedAt: version.submittedAt,
    reviewedAt: record.reviewedAt, returnReason: record.returnReason, history: historyFor(record),
  }
}

function matchRegion(record: MockEnterpriseRecord, regionCode?: string) {
  return !regionCode || regionFor(record).path.some((node) => node.code === regionCode)
}

function queryRecords(query: FilingListQuery): MockEnterpriseRecord[] {
  const status = query.status ?? 'PENDING'
  if (status === 'PENDING' && query.periodCode) error(400, '待审列表不能使用调查期筛选', 'BAD_REQUEST')
  const period = query.periodCode ? periods.find((item) => item.code === query.periodCode) : undefined
  if (query.periodCode && !period) error(400, '调查期不存在', 'BAD_REQUEST')
  return [...records.values()].filter((record) => {
    if (record.status !== status || !matchRegion(record, query.regionCode)) return false
    return !period || Boolean(record.reviewedAt && record.reviewedAt < period.endExclusiveAt)
  }).sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
}

export const mockFilingProvider: FilingProvider = {
  async createEnterpriseAccount(payload, token) {
    await wait(); userFor(token, 'PROVINCE')
    const fieldErrors: Record<string, string> = {}
    const username = payload.username.trim()
    const orgName = payload.orgName.trim()
    if (!username || username.length > 64) fieldErrors.username = '登录账号长度须为 1 至 64 个字符'
    if (!/^(?=.*[A-Za-z])(?=.*[0-9])[!-~]{8,64}$/.test(payload.initialPassword)) {
      fieldErrors.initialPassword = '初始口令须为 8 至 64 位可见 ASCII 字符，且至少包含一个字母和一个数字'
    }
    if (!orgName || orgName.length > 120) fieldErrors.orgName = '企业名称长度须为 1 至 120 个字符'
    const region = getMockRegionInfo(payload.regionCode)
    if (!region) fieldErrors.regionCode = '请选择有效地区'
    if (Object.keys(fieldErrors).length) error(400, '请求参数不合法', 'BAD_REQUEST', fieldErrors)
    if (hasMockUsername(username)) error(409, '登录账号已存在', 'CONFLICT')
    const orgId = String(nextOrgId++)
    const userId = String(nextUserId++)
    registerMockEnterpriseAccount({
      username, password: payload.initialPassword,
      user: { id: userId, displayName: orgName, roleCode: 'ENTERPRISE', orgId, orgName },
    })
    records.set(orgId, {
      orgId, userId, username, orgName, regionCode: payload.regionCode, filingId: null,
      status: null, currentVersion: 0, profile: null, updatedAt: null, submittedAt: null,
      reviewedAt: null, returnReason: null, versions: new Map(),
    })
    const data: EnterpriseAccountData = { orgId, userId, username, orgName, region: region!, enabled: true }
    return response(data)
  },

  async getOptions(token) { await wait(); userFor(token, 'ENTERPRISE'); return response(clone(options)) },
  async getProfile(token) { await wait(); return response(profileData(enterpriseRecord(token))) },

  async saveProfile(payload, token) {
    await wait()
    const record = enterpriseRecord(token)
    if (record.status === 'PENDING' || record.status === 'APPROVED') error(409, '当前状态不允许修改资料', 'CONFLICT')
    const normalized = normalizeProfile(payload)
    const fieldErrors = validateProfile(normalized, false)
    if (Object.keys(fieldErrors).length) error(400, '请求参数不合法', 'BAD_REQUEST', fieldErrors)
    validateDictionary(normalized.natureParentCode, normalized.natureCode, options.natures, 'natureCode')
    validateDictionary(normalized.industryParentCode, normalized.industryCode, options.industries, 'industryCode')
    validateDictionary(normalized.addressParentCode, normalized.addressCode, options.addresses, 'addressCode')
    if (normalized.organizationCode && [...records.values()].some((item) => item.orgId !== record.orgId && item.profile?.organizationCode === normalized.organizationCode)) {
      error(409, '组织机构代码已被其他企业使用', 'CONFLICT')
    }
    record.profile = normalized
    if (record.status === null) record.status = 'DRAFT'
    record.updatedAt = now()
    return response(profileData(record))
  },

  async getFiling(token) { await wait(); return response(statusData(enterpriseRecord(token))) },

  async getEnterpriseVersion(version, token) {
    await wait()
    const record = enterpriseRecord(token)
    const snapshot = record.versions.get(version)
    if (!snapshot) error(404, '备案版本不存在', 'NOT_FOUND')
    return response(clone(snapshot!))
  },

  async submit(payload, token) {
    await wait()
    const record = enterpriseRecord(token)
    if (payload.expectedVersion !== record.currentVersion) error(409, '当前版本已变化，请刷新后重试', 'CONFLICT')
    if (!record.profile) error(400, '请先填写并保存企业资料', 'BAD_REQUEST')
    const fieldErrors = validateProfile(record.profile!, true)
    if (Object.keys(fieldErrors).length) error(400, '企业资料不完整', 'BAD_REQUEST', fieldErrors)
    if (record.status !== 'DRAFT' && record.status !== 'RETURNED') error(409, '当前状态不允许提交', 'CONFLICT')
    record.filingId ??= String(nextFilingId++)
    record.currentVersion += 1
    record.status = 'PENDING'
    record.submittedAt = now()
    record.reviewedAt = null
    record.returnReason = null
    record.versions.set(record.currentVersion, {
      filingId: record.filingId, version: record.currentVersion, result: 'PENDING',
      profile: clone(record.profile!), region: regionFor(record), submittedAt: record.submittedAt,
      reviewedAt: null, reason: null,
    })
    const data: SubmitData = {
      filingId: record.filingId, status: 'PENDING', currentVersion: record.currentVersion,
      submittedAt: record.submittedAt, canReport: false,
    }
    return response(data)
  },

  async getPeriods(token) { await wait(); userFor(token, 'PROVINCE'); return response(clone(periods)) },

  async listFilings(query, token) {
    await wait(); userFor(token, 'PROVINCE')
    const status = query.status ?? 'PENDING'
    const page = query.page ?? 0
    const size = query.size ?? 20
    if (page < 0 || size < 1 || size > 100) error(400, '分页参数不合法', 'BAD_REQUEST')
    const filtered = queryRecords({ ...query, status })
    const items = filtered.slice(page * size, page * size + size).map((record) => {
      const version = currentVersion(record)
      return {
        filingId: record.filingId!, orgId: record.orgId, enterpriseName: version.profile.enterpriseName!,
        organizationCode: version.profile.organizationCode!, region: regionFor(record), status,
        currentVersion: record.currentVersion, submittedAt: version.submittedAt, reviewedAt: record.reviewedAt,
      }
    })
    const data: FilingListData = {
      items, total: filtered.length, page, size,
      filters: { status, regionCode: query.regionCode ?? null, periodCode: query.periodCode ?? null },
    }
    return response(data)
  },

  async getProvinceFiling(filingId, token) {
    await wait(); userFor(token, 'PROVINCE'); return response(detailData(getRecordByFilingId(filingId)))
  },

  async getProvinceVersion(filingId, version, token) {
    await wait(); userFor(token, 'PROVINCE')
    const snapshot = getRecordByFilingId(filingId).versions.get(version)
    if (!snapshot) error(404, '备案版本不存在', 'NOT_FOUND')
    return response(clone(snapshot!))
  },

  async approve(filingId, payload, token) {
    await wait(); userFor(token, 'PROVINCE')
    const record = getRecordByFilingId(filingId)
    if (record.status !== 'PENDING' || payload.expectedVersion !== record.currentVersion) {
      error(409, '当前状态或版本已变化，请刷新后重试', 'CONFLICT')
    }
    record.status = 'APPROVED'; record.reviewedAt = now(); record.returnReason = null
    const version = currentVersion(record)
    version.result = 'APPROVED'; version.reviewedAt = record.reviewedAt; version.reason = null
    record.orgName = version.profile.enterpriseName!
    const data: ReviewData = {
      filingId, status: 'APPROVED', currentVersion: record.currentVersion,
      reviewedAt: record.reviewedAt, returnReason: null, canReport: true,
    }
    return response(data)
  },

  async returnFiling(filingId, payload, token) {
    await wait(); userFor(token, 'PROVINCE')
    const record = getRecordByFilingId(filingId)
    const reason = payload.reason.trim()
    if (!reason || reason.length > 500) error(400, '退回理由长度须为 1 至 500 字', 'BAD_REQUEST', { reason: '请输入 1 至 500 字退回理由' })
    if (record.status !== 'PENDING' || payload.expectedVersion !== record.currentVersion) {
      error(409, '当前状态或版本已变化，请刷新后重试', 'CONFLICT')
    }
    record.status = 'RETURNED'; record.reviewedAt = now(); record.returnReason = reason
    const version = currentVersion(record)
    version.result = 'RETURNED'; version.reviewedAt = record.reviewedAt; version.reason = reason
    const data: ReviewData = {
      filingId, status: 'RETURNED', currentVersion: record.currentVersion,
      reviewedAt: record.reviewedAt, returnReason: reason, canReport: false,
    }
    return response(data)
  },

  async exportFilings(query: FilingExportQuery, token: string): Promise<DownloadedFile> {
    await wait(); userFor(token, 'PROVINCE')
    const filtered = queryRecords({ ...query, status: 'APPROVED' })
    const headers = ['组织机构代码', '企业名称', '所属地区', '企业性质', '所属行业', '主要经营业务', '联系人', '联系地址', '邮政编码', '联系电话', '传真', 'EMAIL', '备案通过时间']
    const rows = filtered.map((record) => {
      const version = currentVersion(record)
      const profile = version.profile
      return [profile.organizationCode, profile.enterpriseName, formatRegion(regionFor(record)),
        `${profile.natureParentCode}/${profile.natureCode}`, `${profile.industryParentCode}/${profile.industryCode}`,
        profile.mainBusiness, profile.contactName, `${profile.addressParentCode}/${profile.addressCode}`,
        profile.postalCode, profile.contactPhone, profile.fax, profile.email, formatBeijingTime(record.reviewedAt),
      ].map((item) => item ?? '')
    })
    return { blob: createXlsxBlob([headers, ...rows]), fileName: '已备案企业.xlsx' }
  },
}

export const managementMockFilings = { records, options }
