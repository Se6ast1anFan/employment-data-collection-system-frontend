export type FilingStatus = 'DRAFT' | 'PENDING' | 'RETURNED' | 'APPROVED'
export type FilingResult = 'PENDING' | 'RETURNED' | 'APPROVED'

export interface RegionPathNode {
  code: string
  name: string
  level: number
}

export interface RegionInfo {
  code: string
  name: string
  path: RegionPathNode[]
}

export interface EnterpriseAccountCreateRequest {
  username: string
  initialPassword: string
  orgName: string
  regionCode: string
}

export interface EnterpriseAccountData {
  orgId: string
  userId: string
  username: string
  orgName: string
  region: RegionInfo
  enabled: boolean
}

export interface DictionaryChild {
  code: string
  name: string
  parentCode: string
}

export interface DictionaryParent {
  code: string
  name: string
  children: DictionaryChild[]
}

export interface FilingOptionsData {
  natures: DictionaryParent[]
  industries: DictionaryParent[]
  addresses: DictionaryParent[]
  demo: boolean
}

export interface EnterpriseProfileFields {
  organizationCode: string | null
  enterpriseName: string | null
  natureParentCode: string | null
  natureCode: string | null
  industryParentCode: string | null
  industryCode: string | null
  mainBusiness: string | null
  contactName: string | null
  addressParentCode: string | null
  addressCode: string | null
  postalCode: string | null
  contactPhone: string | null
  fax: string | null
  email: string | null
}

export interface EnterpriseProfileData {
  filingId: string | null
  status: FilingStatus | null
  currentVersion: number
  editable: boolean
  region: RegionInfo
  profile: EnterpriseProfileFields | null
  updatedAt: string | null
}

export interface FilingHistoryItem {
  version: number
  result: FilingResult
  submittedAt: string
  reviewedAt: string | null
  reason: string | null
}

export interface FilingStatusData {
  filingId: string | null
  status: FilingStatus | null
  currentVersion: number
  canReport: boolean
  submittedAt: string | null
  reviewedAt: string | null
  returnReason: string | null
  history: FilingHistoryItem[]
}

export interface SubmitRequest {
  expectedVersion: number
}

export interface SubmitData {
  filingId: string
  status: 'PENDING'
  currentVersion: number
  submittedAt: string
  canReport: false
}

export interface FilingVersionData {
  filingId: string
  version: number
  result: FilingResult
  profile: EnterpriseProfileFields
  region: RegionInfo
  submittedAt: string
  reviewedAt: string | null
  reason: string | null
}

export interface FilingListItem {
  filingId: string
  orgId: string
  enterpriseName: string
  organizationCode: string
  region: RegionInfo
  status: 'PENDING' | 'APPROVED'
  currentVersion: number
  submittedAt: string
  reviewedAt: string | null
}

export interface FilingListQuery {
  status?: 'PENDING' | 'APPROVED'
  regionCode?: string
  periodCode?: string
  page?: number
  size?: number
}

export interface FilingExportQuery {
  regionCode?: string
  periodCode?: string
}

export interface FilingListData {
  items: FilingListItem[]
  total: number
  page: number
  size: number
  filters: {
    status: 'PENDING' | 'APPROVED'
    regionCode: string | null
    periodCode: string | null
  }
}

export interface FilingDetailData {
  filingId: string
  orgId: string
  status: 'PENDING' | 'RETURNED' | 'APPROVED'
  currentVersion: number
  region: RegionInfo
  profile: EnterpriseProfileFields
  submittedAt: string
  reviewedAt: string | null
  returnReason: string | null
  history: FilingHistoryItem[]
}

export interface ApproveRequest {
  expectedVersion: number
}

export interface ReturnRequest {
  expectedVersion: number
  reason: string
}

export interface ReviewData {
  filingId: string
  status: 'APPROVED' | 'RETURNED'
  currentVersion: number
  reviewedAt: string
  returnReason: string | null
  canReport: boolean
}

export interface Period {
  code: string
  label: string
  startAt: string
  endExclusiveAt: string
  demo: boolean
}

export type PeriodsData = Period[]

export interface FieldErrorData {
  fieldErrors: Record<string, string>
}

export interface DownloadedFile {
  blob: Blob
  fileName: string
}
