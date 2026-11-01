import type { NoticeCreate, SixMetrics } from '@/types/week6'
export const codePointLength = (s: string) => Array.from(s).length
export function noticeErrors(body: NoticeCreate) {
  const errors: Record<string,string> = {}
  if (!body.title.trim() || codePointLength(body.title.trim()) > 50) errors.title = '标题必填，最多 50 个字'
  if (!body.content.trim() || codePointLength(body.content.trim()) > 2000) errors.content = '正文必填，最多 2000 个字'
  return errors
}
export const percentText = (v: number | null) => v == null ? '—' : `${v.toFixed(2)}%`
export const signedText = (v: number) => v > 0 ? `+${v}` : String(v)
export const metricDefinitions: {key: Exclude<keyof SixMetrics,'filingSourceCounts'>; label: string; unit: string}[] = [
  {key:'enterpriseCount',label:'企业总数',unit:'家'},
  {key:'baselineEmploymentTotal',label:'建档期总岗位',unit:'人'},
  {key:'periodEmploymentTotal',label:'调查期总岗位',unit:'人'},
  {key:'netChange',label:'岗位净变化',unit:'人'},
  {key:'reductionTotal',label:'岗位减少总数',unit:'人'},
  {key:'changePercent',label:'岗位变化占比',unit:'%'},
]
export function orderedPeriods<T extends {code:string;startAt:string}>(periods:T[]) {
  return [...periods].sort((a,b)=> Date.parse(a.startAt)-Date.parse(b.startAt) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}
export function contiguousCodes<T extends {code:string;startAt:string}>(periods:T[], first:string,last:string) {
  const sorted=orderedPeriods(periods), start=sorted.findIndex(p=>p.code===first), end=sorted.findIndex(p=>p.code===last)
  if(start<0||end<=start||end-start+1>24) throw new Error('请选择按时间相邻的 2 至 24 个调查期，结束期必须晚于起始期')
  return sorted.slice(start,end+1).map(p=>p.code)
}
// 只用于 Mock 指标，正式页面直接展示后端结果；负数亦按 HALF_UP 远离零舍入。
export function roundedPercent(numerator:number,denominator:number):number|null {
  if(!denominator) return null
  const n=BigInt(numerator)*10000n, d=BigInt(denominator), absolute=n<0n?-n:n
  const rounded=(absolute*2n+d)/(d*2n)
  return Number(n<0n?-rounded:rounded)/100
}
