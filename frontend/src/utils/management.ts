import type { ReportForm as Form, ReportOptions } from '@/types/report'
import type { CorrectionChanges } from '@/types/management'
import { normalizeReport, validateReport } from '@/utils/report'
export function correctionChanges(original:Form,edited:Form):CorrectionChanges {
 const normalized=normalizeReport(edited)
 return Object.fromEntries(Object.entries(normalized).filter(([k,v])=>k!=='baselineEmploymentCount'&&v!==original[k as keyof Form])) as CorrectionChanges
}
export function correctionErrors(form:Form,options:ReportOptions|null,reason:string){const e=validateReport(normalizeReport(form),options??{reductionTypes:[],reasons:[]},true,form.baselineEmploymentCount);if(!options)for(const key of ['reductionTypeCode','primaryReasonCode','secondaryReasonCode','tertiaryReasonCode'])if(e[key]==='请选择有效减少类型'||e[key]==='原因不属于所选减少类型')delete e[key];if(!reason.trim()||reason.trim().length>500)e.reason='修订原因必填，最多500字';return e}
export function accountErrors(q:Record<string,unknown>){const e:Record<string,string>={};if(q.reportStatus&&!q.periodCode)e.reportStatus='筛选报表状态时必须指定调查期';if(q.createdFrom&&q.createdTo&&String(q.createdFrom)>String(q.createdTo))e.createdTo='结束日期不能早于开始日期';if(q.quarter&&!/^\d{4}-Q[1-4]$/.test(String(q.quarter)))e.quarter='请输入 YYYY-Q1 至 YYYY-Q4';return e}
