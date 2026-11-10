import type { NationalAttempt, NationalPayload, NationalReceipt, NationalSummary } from './national'
import type { WindowStatus } from './report'

export interface YearMonth {
  periodCode: string
  periodLabel: string
  startAt: string
  endExclusiveAt: string
  openAt: string
  closeAt: string
  disposition: 'CREATE' | 'EXISTING' | 'CONFLICT'
  conflictReason: 'CODE_BOUNDARY_MISMATCH' | 'OVERLAPPING_PERIOD' | null
}
export interface YearPreview { year: number; canCreate: boolean; months: YearMonth[]; createdCount: number; existingCount: number; conflictCount: number }
export interface YearResult { year: number; created: YearMonth[]; existing: YearMonth[]; total: 12 }
export interface Coverage {
  eligibleEnterpriseCount: number
  realSubmittedCount: number
  proxyCount: number
  notCoveredCount: number
  pendingCount: number
  returnedCount: number
}
export type HomeState = 'NOT_SAVED' | 'DRAFT_SAVED' | 'SUBMITTED' | 'RETURNED'
export type CoverageMode = 'REAL' | 'PROXY' | 'NONE'
export interface ProxySource { sourcePeriodCode: string; sourceReportId: string; sourceSubmissionVersion: number; sourceCurrentVersion: number; periodEmploymentCount: number }
interface EnterpriseIdentity { enterpriseOrgId: string; enterpriseName: string; regionCode: string }
interface MissingIdentity extends EnterpriseIdentity { cityCode: string }
export interface Fillable extends MissingIdentity { source: ProxySource }
export interface NoSource extends MissingIdentity { reason: 'NO_PREVIOUS_APPROVED_REAL_REPORT' }
export interface ProxyItem extends MissingIdentity, Omit<ProxySource, 'sourcePeriodCode'> {
  organizationCode: string
  proxySourcePeriodCode: string
  baselineEmploymentCount: number
  netChange: 0
  generatedAt: string
}
export interface RealItem extends EnterpriseIdentity { reportId: string; baselineEmploymentCount: number; periodEmploymentCount: number; netChange: number }
export interface NationalTotals extends NationalSummary { realCount: number; proxyCount: number }
export type BatchStatusV2 = 'QUEUED' | 'SENDING' | 'ASSEMBLING' | 'MOCK_ACCEPTED' | 'SEND_FAILED'
export type PayloadFormat = 'JSON' | 'XML'
export interface Blocker { code: string; message: string }
export interface ReadinessV2 {
  period: { periodCode: string; periodLabel: string; startAt: string; endExclusiveAt: string; closeAt: string | null; windowStatus: WindowStatus; legacy: boolean }
  canSubmit: boolean
  blockers: Blocker[]
  counts: Record<'eligibleCount' | 'realCount' | 'proxyCount' | 'missingCount' | 'fillableCount' | 'noSourceCount' | 'pendingCityCount' | 'pendingProvinceCount' | 'returnedCityCount' | 'returnedProvinceCount' | 'voidedCount', number>
  proxyVersion: number
  realEnterprises: RealItem[]
  proxyItems: ProxyItem[]
  fillable: Fillable[]
  noRealSource: NoSource[]
  previewSummary: NationalTotals
  existingBatch: { batchId: string; status: BatchStatusV2; payloadFormat: PayloadFormat } | null
}
export interface ProxyFillResult { periodCode: string; proxyVersion: number; generatedCount: number; items: ProxyItem[]; previewSummary: NationalTotals }
export interface ProxyDeleteResult { periodCode: string; proxyVersion: number; removedCount: number }
export interface QueueResult { batchId: string; status: 'QUEUED'; mode: 'MOCK_QUEUE'; payloadFormat: 'XML'; enterpriseCount: number; realCount: number; proxyCount: number; detailPath: string }
export interface BatchSummaryV2 {
  batchId: string; periodCode: string; schemaVersion: 'demo-1' | 'demo-2'; mode: 'MOCK' | 'MOCK_QUEUE'; payloadFormat: PayloadFormat
  status: BatchStatusV2; enterpriseCount: number; realCount: number; proxyCount: number; payloadSha256: string
  createdAt: string; lastSentAt: string | null; retryCount: number; lastError: string | null
}
export interface ChunkProgress { chunkCount: number; brokerConfirmedCount: number; receiverStoredCount: number; assembledAt: string | null; lastError: string | null }
export interface MockReceiptV2 extends NationalReceipt { realCount: number; proxyCount: number; chunkCount: number }
export interface BatchDetailV2 extends BatchSummaryV2 {
  payload: NationalPayload | null; payloadXml: string | null; chunkProgress: ChunkProgress | null
  attempts: NationalAttempt[]; receipt: NationalReceipt | MockReceiptV2 | null
}
export interface BatchQueryV2 { periodCode?: string; status?: BatchStatusV2; page: number; size: number }
export interface BatchListV2 { items: BatchSummaryV2[]; total: number; page: number; size: number }
