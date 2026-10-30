import type { ReportForm, ReportOptions, CreatePeriod, BlockedReason } from '@/types/report'
export const windowLabels = { UNAVAILABLE: '旧演示期次不可填报', NOT_OPEN: '尚未开放', OPEN: '开放中', CLOSED: '已截止' }
export const blockedLabels: Record<BlockedReason, string> = { LEGACY_PERIOD: '旧演示期次只读', ALREADY_SUBMITTED: '报表处于审核中或审核完成，当前只读', FILING_NOT_APPROVED: '企业备案尚未通过', WINDOW_NOT_OPEN: '填报窗口尚未开放', WINDOW_CLOSED: '填报窗口已截止' }
export const formLabels: Record<keyof ReportForm, string> = { baselineEmploymentCount: '建档期就业人数', periodEmploymentCount: '调查期就业人数', otherReason: '其他原因（没有请填“无”）', reductionTypeCode: '就业人数减少类型', primaryReasonCode: '主要原因', primaryReasonDetail: '主要原因说明', secondaryReasonCode: '次要原因', secondaryReasonDetail: '次要原因说明', tertiaryReasonCode: '第三原因', tertiaryReasonDetail: '第三原因说明' }
export const emptyReport = (): ReportForm => Object.fromEntries(Object.keys(formLabels).map(k => [k, null])) as unknown as ReportForm
export function normalizeReport(form: ReportForm): ReportForm {
  const result = { ...form }
  for (const key of Object.keys(result) as (keyof ReportForm)[]) if (typeof result[key] === 'string') Object.assign(result, { [key]: (result[key] as string).trim() || null })
  if (result.baselineEmploymentCount != null && result.periodEmploymentCount != null && result.periodEmploymentCount >= result.baselineEmploymentCount) for (const key of Object.keys(result)) if (!['baselineEmploymentCount', 'periodEmploymentCount', 'otherReason'].includes(key)) Object.assign(result, { [key]: null })
  return result
}
export function validateReport(form: ReportForm, options: ReportOptions, submit: boolean, locked: number | null = null) {
  const errors: Record<string, string> = {}
  for (const key of ['baselineEmploymentCount', 'periodEmploymentCount'] as const) { const n = form[key]; if (n != null && (!Number.isInteger(n) || n < 0 || n > 2147483647)) errors[key] = '请输入 0 至 2147483647 的整数'; else if (submit && n == null) errors[key] = '必填' }
  if (locked != null && form.baselineEmploymentCount !== locked) errors.baselineEmploymentCount = '必须使用首次提交后锁定的建档人数'
  for (const key of ['otherReason', 'primaryReasonDetail', 'secondaryReasonDetail', 'tertiaryReasonDetail'] as const) if ((form[key]?.length ?? 0) > 500) errors[key] = '最多 500 字'
  if (submit && !form.otherReason?.trim()) errors.otherReason = '请填写其他原因，没有请填“无”'
  const reduced = form.baselineEmploymentCount != null && form.periodEmploymentCount != null && form.periodEmploymentCount < form.baselineEmploymentCount
  if (reduced && submit) for (const key of ['reductionTypeCode', 'primaryReasonCode', 'primaryReasonDetail'] as const) if (!form[key]?.trim()) errors[key] = '人数减少时必填'
  if (form.reductionTypeCode && !options.reductionTypes.some(x => x.code === form.reductionTypeCode)) errors.reductionTypeCode = '请选择有效减少类型'
  const allowed = options.reasons.filter(x => x.parentTypeCode === form.reductionTypeCode).flatMap(x => [x.code, ...x.children.map(y => y.code)])
  for (const prefix of ['primary', 'secondary', 'tertiary'] as const) { const code = `${prefix}ReasonCode` as keyof ReportForm; const detail = `${prefix}ReasonDetail` as keyof ReportForm; if (form[code] && !allowed.includes(form[code] as string)) errors[code] = '原因不属于所选减少类型'; if (prefix !== 'primary' && Boolean(form[code]) !== Boolean(form[detail])) errors[detail] = '原因与说明须成对填写' }
  return errors
}
export function validatePeriod(p: CreatePeriod) { const e: Record<string,string> = {}; if (!/^[A-Z0-9_]{1,32}$/.test(p.code)) e.code = '代码限 1 至 32 位大写字母、数字或下划线'; if (!p.label.trim() || p.label.length > 80) e.label = '名称必填且最多 80 字'; for (const k of ['startAt','endExclusiveAt','openAt','closeAt'] as const) if (!Number.isFinite(Date.parse(p[k]))) e[k] = '请选择有效时间'; if (Date.parse(p.startAt) >= Date.parse(p.endExclusiveAt)) e.endExclusiveAt = '调查结束必须晚于开始'; if (Date.parse(p.openAt) >= Date.parse(p.closeAt)) e.closeAt = '截止必须晚于开放'; return e }
export function beijingInput(utc: string | null) { return utc ? new Date(Date.parse(utc) + 8 * 3600000).toISOString().slice(0,19).replace('T',' ') : '' }
export function beijingUtc(input: string) { return new Date(input.replace(' ', 'T') + '+08:00').toISOString() }
