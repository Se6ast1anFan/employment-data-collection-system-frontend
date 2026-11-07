import { filingStatusLabels } from '@/utils/filing'
import { reportStatusLabels } from '@/utils/review'
import type { FilingProgressStatus, ReportProgressStatus, ReportProgressFilter, GroupBy, ChangeDirection } from '@/types/revision'
import type { ReportForm, ReportView } from '@/types/report'

export const filingProgressLabels: Record<FilingProgressStatus, string> = { NO_FILING: '未备案', ...filingStatusLabels }
export const reportProgressLabels: Record<ReportProgressStatus, string> = { NOT_SUBMITTED: '本期未上报', ...reportStatusLabels, VOIDED: '已作废' }
export const reportFilterLabels: Record<ReportProgressFilter, string> = {
  NOT_SUBMITTED: '本期未上报', DRAFT: '草稿', PENDING_CITY: '待市审', PENDING_PROVINCE: '待省审',
  APPROVED: '省审通过', RETURNED: '已退回', VOIDED: '已作废',
}
export const reportFilterStates: Record<ReportProgressFilter, ReportProgressStatus[]> = {
  NOT_SUBMITTED: ['NOT_SUBMITTED'], DRAFT: ['DRAFT'], PENDING_CITY: ['SUBMITTED_CITY'],
  PENDING_PROVINCE: ['SUBMITTED_PROVINCE'], APPROVED: ['APPROVED_PROVINCE'],
  RETURNED: ['RETURNED_CITY', 'RETURNED_PROVINCE'], VOIDED: ['VOIDED'],
}
export const groupLabels: Record<GroupBy, string> = { CITY: '城市', NATURE: '企业性质', INDUSTRY: '所属行业', CHANGE_DIRECTION: '人员变动' }
export const directionLabels: Record<ChangeDirection, string> = { INCREASE: '增员', UNCHANGED: '不变', DECREASE: '减员' }
export const baselineLabels = { FIRST_SUBMISSION: '本期（首次上报）', PREVIOUS_SUBMISSION: '上一实际上报期', LEGACY_MIGRATED: '历史数据迁移' }

export function hasRollingBaseline(view: ReportView | null) {
  return typeof view?.baselineEditable === 'boolean'
}

export function displayBaseline(view: ReportView, form: ReportForm) {
  if (view.baselineSourceKind === 'FIRST_SUBMISSION' && view.submissionVersion === 0) return form.periodEmploymentCount
  return view.computedBaselineEmploymentCount ?? view.lockedBaselineEmploymentCount ?? view.form?.baselineEmploymentCount ?? null
}
