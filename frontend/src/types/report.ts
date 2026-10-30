import type { ReportView as W4View, ReportListItem as W4Item, ReportHistory as W4History } from './review'
export type WindowStatus = 'UNAVAILABLE' | 'NOT_OPEN' | 'OPEN' | 'CLOSED'
export type BlockedReason = 'LEGACY_PERIOD' | 'ALREADY_SUBMITTED' | 'FILING_NOT_APPROVED' | 'WINDOW_NOT_OPEN' | 'WINDOW_CLOSED'
export interface SurveyPeriod { code: string; label: string; startAt: string; endExclusiveAt: string; openAt: string | null; closeAt: string | null; demo: boolean; legacy: boolean; currentVersion: number; windowStatus: WindowStatus }
export interface EnterprisePeriod extends SurveyPeriod { filingEligible: boolean; canWrite: boolean; blockedReason: BlockedReason | null }
export interface CreatePeriod { code: string; label: string; startAt: string; endExclusiveAt: string; openAt: string; closeAt: string; demo: boolean }
export type UpdatePeriod = Omit<CreatePeriod, 'code' | 'demo'> & { expectedVersion: number }
export interface Reason { code: string; name: string; parentTypeCode: string; parentCode: string | null; children: { code: string; name: string; parentCode: string }[] }
export interface ReportOptions { reductionTypes: { code: string; name: string }[]; reasons: Reason[] }
export interface ReportForm { baselineEmploymentCount: number | null; periodEmploymentCount: number | null; otherReason: string | null; reductionTypeCode: string | null; primaryReasonCode: string | null; primaryReasonDetail: string | null; secondaryReasonCode: string | null; secondaryReasonDetail: string | null; tertiaryReasonCode: string | null; tertiaryReasonDetail: string | null }
export type ReportView = W4View
export interface SubmitResult { reportId: string; periodCode: string; status: 'SUBMITTED_CITY'; currentVersion: number; submissionVersion: number; submittedAt: string }
export type ReportListItem = W4Item
export type ReportHistory = W4History
export interface ReportQuery { periodCode?: string; status?: string; page: number; size: number }
