import type { EnterpriseProfileFields, FilingResult, FilingStatus, RegionInfo } from '@/types/filing'

export const emptyProfile = (): EnterpriseProfileFields => ({
  organizationCode: null,
  enterpriseName: null,
  natureParentCode: null,
  natureCode: null,
  industryParentCode: null,
  industryCode: null,
  mainBusiness: null,
  contactName: null,
  addressParentCode: null,
  addressCode: null,
  postalCode: null,
  contactPhone: null,
  fax: null,
  email: null,
})

const trimOrNull = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? ''
  return normalized || null
}

export function normalizeProfile(profile: EnterpriseProfileFields): EnterpriseProfileFields {
  const normalized = Object.fromEntries(
    Object.entries(profile).map(([key, value]) => [key, trimOrNull(value)]),
  ) as unknown as EnterpriseProfileFields
  if (normalized.organizationCode) normalized.organizationCode = normalized.organizationCode.toUpperCase()
  return normalized
}

export function validateProfile(
  profile: EnterpriseProfileFields,
  requireAll: boolean,
): Record<string, string> {
  const value = normalizeProfile(profile)
  const errors: Record<string, string> = {}
  const required: Array<keyof EnterpriseProfileFields> = [
    'organizationCode', 'enterpriseName', 'natureParentCode', 'natureCode', 'industryParentCode',
    'industryCode', 'mainBusiness', 'contactName', 'addressParentCode', 'addressCode', 'postalCode',
    'contactPhone', 'fax',
  ]
  const labels: Record<keyof EnterpriseProfileFields, string> = {
    organizationCode: '组织机构代码', enterpriseName: '企业名称', natureParentCode: '企业性质一级选项',
    natureCode: '企业性质二级选项', industryParentCode: '所属行业一级选项', industryCode: '所属行业二级选项',
    mainBusiness: '主要经营业务', contactName: '联系人', addressParentCode: '联系地址一级选项',
    addressCode: '联系地址二级选项', postalCode: '邮政编码', contactPhone: '联系电话', fax: '传真', email: 'EMAIL',
  }
  if (requireAll) {
    for (const key of required) if (!value[key]) errors[key] = `${labels[key]}为必填项`
  }
  if (value.organizationCode && !/^[A-Z0-9]{1,9}$/.test(value.organizationCode)) {
    errors.organizationCode = '组织机构代码只能包含字母或数字，且不超过 9 位'
  }
  if (value.enterpriseName && value.enterpriseName.length > 120) errors.enterpriseName = '企业名称不能超过 120 个字符'
  if (value.mainBusiness && value.mainBusiness.length > 500) errors.mainBusiness = '主要经营业务不能超过 500 个字符'
  if (value.contactName && value.contactName.length > 80) errors.contactName = '联系人不能超过 80 个字符'
  if (value.postalCode && !/^\d{6}$/.test(value.postalCode)) errors.postalCode = '邮政编码必须为 6 位数字'
  if (value.contactPhone && !/^(1[3-9]\d{9}|0\d{2,3}-\d{7,8})$/.test(value.contactPhone)) {
    errors.contactPhone = '联系电话须为 11 位手机号码或“区号-7/8 位电话号码”'
  }
  if (value.fax && !/^0\d{2,3}-\d{7,8}$/.test(value.fax)) errors.fax = '传真须为“区号-7/8 位电话号码”'
  if (value.email && (value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) {
    errors.email = 'EMAIL 格式不正确'
  }
  return errors
}

export const filingStatusLabels: Record<FilingStatus, string> = {
  DRAFT: '草稿', PENDING: '待省级备案', RETURNED: '已退回', APPROVED: '已备案',
}

export const filingResultLabels: Record<FilingResult, string> = {
  PENDING: '待审核', RETURNED: '已退回', APPROVED: '已通过',
}

export function formatRegion(region: RegionInfo | null | undefined): string {
  return region?.path.map((item) => item.name).join(' / ') || '—'
}

const beijingFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

export function formatBeijingTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : beijingFormatter.format(date)
}
