import type { SurveyPeriod } from './report'
import type { AnalysisFilters, SixMetrics } from './week6'
import type { NationalReportCard } from './national'
import type { Coverage, CoverageMode, HomeState, ProxySource } from './midterm'

export type BaselineSourceKind = 'FIRST_SUBMISSION' | 'PREVIOUS_SUBMISSION' | 'LEGACY_MIGRATED'
export interface BaselineSource {
  baselineSourcePeriodCode?: string | null
  baselineSourceReportId?: string | null
}
export interface BatchItem { periodCode: string; expectedVersion: number }
export interface BatchItemResult {
  periodCode: string
  reportId: string | null
  success: boolean
  reasonCode: 'VERSION_CONFLICT' | 'FILING_NOT_APPROVED' | 'WINDOW_NOT_OPEN' | 'WINDOW_CLOSED' | 'FORM_INVALID' | 'REPORT_NOT_DRAFT' | 'PERIOD_NOT_FOUND' | null
  reason: string | null
  currentVersion: number | null
  submissionVersion: number | null
  baselineSourcePeriodCode: string | null
  baselineEmploymentCount: number | null
}
export interface BatchResult { successCount: number; failureCount: number; items: BatchItemResult[] }
export interface SelectedPeriod {
  periodCode: string
  periodLabel: string
  deadlineAt: string | null
  windowStatus: SurveyPeriod['windowStatus']
}
export interface OverviewLink { label: string; route: string }
export interface NextAction extends OverviewLink { enabled: boolean }
export type EnterpriseStepSummary = 'WAIT_FOR_FILING' | 'WAIT_FOR_PERIOD' | 'COMPLETE_REPORT' | 'FIX_RETURNED_REPORT' | 'WAIT_FOR_REVIEW'
export interface EnterpriseOverview {
  selectedPeriod: SelectedPeriod | null
  filingStatus: string
  reportStatus: string | null
  latestReturnReason: string | null
  currentStep: EnterpriseStepSummary
  nextAction: NextAction
  visibleNoticeCount: number
  homeState?: HomeState
  homePeriod?: SelectedPeriod | null
  homeReturnReason?: string | null
  homeNextAction?: NextAction
}
export interface CityOverview extends Partial<Coverage> {
  selectedPeriod: SelectedPeriod | null
  reportCounts: Record<'pendingCity' | 'approvedCity' | 'returnedCity' | 'forwardedProvince' | 'notSubmitted', number>
  noticeEntry: OverviewLink
  nextAction: NextAction
}
export interface ProvinceOverview {
  nationalReportCard?: NationalReportCard
  selectedPeriod: SelectedPeriod | null
  pendingFilingCount: number
  pendingReportCount: number
  approvedReportCount: number
  cityProgress: {
    submittedCityCount: number
    notSubmittedCityCount: number
    items: (Partial<Coverage> & { cityCode: string; cityName: string; eligibleEnterpriseCount: number; submittedEnterpriseCount: number; notSubmittedEnterpriseCount: number })[]
  }
  provinceTotals?: Coverage
  entries: OverviewLink[]
}
export type FilingProgressStatus = 'NO_FILING' | 'DRAFT' | 'PENDING' | 'RETURNED' | 'APPROVED'
export type ReportProgressStatus = 'NOT_SUBMITTED' | 'DRAFT' | 'SUBMITTED_CITY' | 'RETURNED_CITY' | 'SUBMITTED_PROVINCE' | 'RETURNED_PROVINCE' | 'APPROVED_PROVINCE' | 'VOIDED'
export type ReportProgressFilter = 'NOT_SUBMITTED' | 'DRAFT' | 'PENDING_CITY' | 'PENDING_PROVINCE' | 'APPROVED' | 'RETURNED' | 'VOIDED'
export interface ProgressQuery {
  periodCode: string
  cityCode?: string | null
  filingStatus?: FilingProgressStatus
  reportStatus?: ReportProgressFilter
  page: number
  size: number
}
export interface ProgressRow {
  enterpriseOrgId: string
  enterpriseName: string
  cityCode: string
  cityName: string
  filingStatus: FilingProgressStatus
  reportStatus: ReportProgressStatus
  reportId: string | null
  reportVoided: boolean
  lastSubmittedAt: string | null
  eligible?: boolean
  coverageMode?: CoverageMode
  proxySource?: ProxySource | null
}
export interface ProgressResult {
  periodCode: string
  summary: {
    totalEnterprises: number
    filingCounts: Partial<Record<FilingProgressStatus, number>>
    reportCounts: Partial<Record<ReportProgressStatus, number>>
  }
  items: ProgressRow[]
  total: number
  page: number
  size: number
  coverageSummary?: Coverage
}
export type GroupBy = 'CITY' | 'NATURE' | 'INDUSTRY' | 'CHANGE_DIRECTION'
export type ChangeDirection = 'INCREASE' | 'UNCHANGED' | 'DECREASE'
export type BreakdownQuery = Partial<Omit<AnalysisFilters, 'enterpriseOrgId'>> & { periodCode: string; groupBy: GroupBy }
export interface BreakdownRow extends Omit<SixMetrics, 'filingSourceCounts'> {
  groupCode: string
  groupName: string
  increaseTotal: number
  decreaseEnterpriseCount: number
  unchangedEnterpriseCount: number
  increaseEnterpriseCount: number
}
export interface BreakdownResult { periodCode: string; groupBy: GroupBy; filters: AnalysisFilters; items: BreakdownRow[] }
export type EnterpriseAnalysisQuery = Partial<AnalysisFilters> & { periodCode: string; changeDirection?: ChangeDirection; page: number; size: number }
export interface EnterpriseAnalysisRow {
  enterpriseOrgId: string
  enterpriseName: string
  cityCode: string
  cityName: string
  natureCode?: string | null
  natureName?: string | null
  industryCode?: string | null
  industryName?: string | null
  reportId: string
  submissionVersion: number
  correctionVersion?: number
  baselineSourcePeriodCode: string | null
  baselineEmploymentCount: number
  periodEmploymentCount: number
  netChange: number
  changePercent: number | null
  changeDirection: ChangeDirection
  primaryReasonCode?: string | null
  primaryReasonDetail?: string | null
}
export interface EnterpriseAnalysisResult { periodCode: string; items: EnterpriseAnalysisRow[]; total: number; page: number; size: number }
