import type { WindowStatus } from './report'

export type BatchStatus = 'QUEUED' | 'SENDING' | 'MOCK_ACCEPTED' | 'SEND_FAILED'
export type NationalBlockerCode = 'LEGACY_PERIOD' | 'WINDOW_NOT_CLOSED' | 'PENDING_CITY' | 'PENDING_PROVINCE' | 'RETURNED_CITY' | 'RETURNED_PROVINCE' | 'NO_VALID_REPORT' | 'BATCH_EXISTS'
export interface NationalBlocker { code: NationalBlockerCode; message: string }

export interface NationalSummary {
  enterpriseCount: number
  baselineEmploymentTotal: number
  periodEmploymentTotal: number
  netChange: number
}
export interface NationalCity extends NationalSummary { cityCode: string; cityName: string }
export interface NationalEnterprise {
  organizationCode: string
  enterpriseName: string
  cityCode: string
  regionCode: string
  natureCode: string
  industryCode: string
  reportId: string
  submissionVersion: number
  currentVersion: number
  baselineSourcePeriodCode: string
  baselineEmploymentCount: number
  periodEmploymentCount: number
  netChange: number
  reductionTypeCode: string | null
  primaryReasonCode: string | null
  primaryReasonDetail: string | null
  otherReason: string
}
export interface NationalPreview { summary: NationalSummary; cities: NationalCity[]; enterprises: NationalEnterprise[] }
export interface NationalPayload extends NationalPreview {
  schemaVersion: 'demo-1'
  batchId: string
  mode: 'MOCK'
  provinceCode: '53'
  periodCode: string
  periodStartAt: string
  periodEndExclusiveAt: string
  generatedAt: string
}
export interface MissingEnterprise {
  enterpriseOrgId: string
  enterpriseName: string
  cityCode: string
  regionCode: string
  reportStatus: 'DRAFT' | null
}
export interface NationalReadiness {
  period: { periodCode: string; periodLabel: string; startAt: string; endExclusiveAt: string; closeAt: string | null; windowStatus: WindowStatus; legacy: boolean }
  canSubmit: boolean
  blockers: NationalBlocker[]
  requiresMissingAcknowledgement: boolean
  counts: Record<'approvedCount' | 'pendingCityCount' | 'pendingProvinceCount' | 'returnedCityCount' | 'returnedProvinceCount' | 'voidedCount' | 'missingCount', number>
  missingEnterprises: MissingEnterprise[]
  preview: NationalPreview
  existingBatch: { batchId: string; status: BatchStatus } | null
}
export interface CreateNationalBatch { periodCode: string; acknowledgeMissing: boolean }
export interface NationalQueue { batchId: string; status: 'QUEUED'; mode: 'MOCK'; enterpriseCount: number; detailPath: string }
export interface NationalBatchSummary {
  batchId: string
  periodCode: string
  mode: 'MOCK'
  status: BatchStatus
  enterpriseCount: number
  payloadSha256: string
  createdAt: string
  lastSentAt: string | null
  retryCount: number
  lastError: string | null
}
export interface NationalBatchQuery { periodCode?: string; status?: BatchStatus; page: number; size: number }
export interface NationalBatchPage { items: NationalBatchSummary[]; total: number; page: number; size: number }
export interface NationalAttempt {
  attemptNo: number
  startedAt: string
  finishedAt: string | null
  result: 'SENDING' | 'ACCEPTED' | 'FAILED'
  errorSummary: string | null
  mockReceiptId: string | null
}
export interface NationalReceipt {
  batchId: string
  mockReceiptId: string
  result: 'ACCEPTED'
  receivedAt: string
  acceptedEnterpriseCount: number
  payloadSha256: string
}
export interface NationalBatchDetail extends NationalBatchSummary {
  payload: NationalPayload
  attempts: NationalAttempt[]
  receipt: NationalReceipt | null
}
export interface NationalReportCard {
  periodCode: string | null
  state: 'NO_PERIOD' | 'BLOCKED' | 'READY' | BatchStatus
  label: string
  route: '/province/national'
  batchId: string | null
  canStart: boolean
  canRetry: boolean
}
