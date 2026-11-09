import { getMockUserForToken } from '@/mock/auth'
import { managementMockState as state } from '@/mock/report'
import { managementMockFilings as filings } from '@/mock/filing'
import { mockManagementProvider } from '@/mock/management'
import { chartDemoFacts, chartDemoPeriods } from '@/mock/chartFixtures'
import { getMockRegionInfo, mockCityOrgId } from '@/mock/system'
import { ApiError } from '@/services/api'
import { noticeErrors, orderedPeriods, roundedPercent } from '@/utils/week6'
import type { AnalysisProvider, AnalysisQuery, NoticeProvider } from '@/services/week6'
import type { AnalysisFilters, SixMetrics, NoticeDetail, NoticeCreate } from '@/types/week6'
import type { EffectiveReportRow, EnterpriseInfoRow } from '@/types/management'
import type { EnterpriseAnalysisQuery } from '@/types/revision'
const ok = <T>(data:T) => ({code:'OK',message:'',data:structuredClone(data),traceId:'mock-w6'})
function fail(status:number,message:string,fields:Record<string,string>={}):never {
  throw new ApiError(status,message,'MOCK_ERROR','mock-w6',fields)
}
function user(token:string, write=false) {
  const u=getMockUserForToken(token)
  if(!u) return fail(401,'请重新登录')
  if(write && u.roleCode!=='PROVINCE') return fail(403,'仅省级可操作')
  return u
}
function provinceOf(token:string) {
  const u=user(token)
  if(u.roleCode==='PROVINCE') return u.orgId
  if(u.roleCode==='CITY') return [...state.owners.values()].find(o=>o.cityId===u.orgId)?.provinceId ?? (u.orgId==='201'?'100':undefined)
  return [...state.owners.values()].find(o=>o.orgId===u.orgId)?.provinceId ?? (filings.records.has(u.orgId)?'100':undefined)
}
const sampleRule='APPROVED_PROVINCE_NOT_VOIDED_LATEST_SUBMISSION_EFFECTIVE_VALUES' as const
function filters(q:AnalysisQuery):AnalysisFilters {
  return {enterpriseOrgId:q.enterpriseOrgId||null,regionCode:q.regionCode||null,natureParentCode:q.natureParentCode||null,natureCode:q.natureCode||null,industryParentCode:q.industryParentCode||null,industryCode:q.industryCode||null}
}
function validateFilters(q:AnalysisQuery) {
  for(const kind of ['nature','industry'] as const) {
    const options=kind==='nature'?filings.options.natures:filings.options.industries
    const parent=q[`${kind}ParentCode`], code=q[`${kind}Code`]
    if(parent && !options.some(p=>p.code===parent)) fail(400,'父级分类无效',{[`${kind}ParentCode`]:'未知父级代码'})
    if(code && !options.some(p=>(!parent||p.code===parent)&&p.children.some(c=>c.code===code))) fail(400,'分类代码或父子关系无效',{[`${kind}Code`]:'请核对父子代码'})
  }
}
export async function sample(code:string,q:AnalysisQuery,t:string) {
  user(t,true);validateFilters(q)
  const reportRows:EffectiveReportRow[]=[], infoRows:EnterpriseInfoRow[]=[]
  for(let page=0;;page++) {
    const query={periodCode:code,regionCode:q.regionCode||undefined,page,size:100}
    const [r,i]=await Promise.all([mockManagementProvider.reports(query,t),mockManagementProvider.enterprises(query,t)])
    reportRows.push(...r.data.items);infoRows.push(...i.data.items)
    if((page+1)*100>=r.data.total) break
  }
  const latest=new Map<string,EffectiveReportRow>()
  for(const row of reportRows) if(!latest.has(row.orgId)||row.submissionVersion>latest.get(row.orgId)!.submissionVersion) latest.set(row.orgId,row)
  return [...latest.values()].flatMap(row=>{
    if(q.enterpriseOrgId && row.orgId !== q.enterpriseOrgId) return []
    const info=infoRows.find(i=>i.reportId===row.reportId)!
    if(!info) return []
    for(const kind of ['nature','industry'] as const) {
      const code=info[`${kind}Code`], options=kind==='nature'?filings.options.natures:filings.options.industries
      if(q[`${kind}Code`] && code!==q[`${kind}Code`]) return []
      if(q[`${kind}ParentCode`] && !options.find(p=>p.code===q[`${kind}ParentCode`])?.children.some(c=>c.code===code)) return []
    }
    return [{row,info}]
  })
}
type ChartSample = {
  row: { cityOrgId: string; cityName: string; regionCode: string; effectiveForm: Pick<EffectiveReportRow['effectiveForm'], 'baselineEmploymentCount' | 'periodEmploymentCount'> }
  info: Pick<EnterpriseInfoRow, 'filingSource'>
}

function demoSample(code: string, q: AnalysisQuery, token: string) {
  const current = user(token, true)
  if (current.orgId !== '100') fail(404, '调查期不在本省')
  validateFilters(q)
  return chartDemoFacts(code, q) ?? fail(400, '调查期不存在')
}

async function chartSample(code: string, q: AnalysisQuery, token: string): Promise<ChartSample[]> {
  if (!chartDemoPeriods.some(item => item.code === code)) return sample(code, q, token)
  return demoSample(code, q, token).map(({ report, filingSource }) => ({
    row: { cityOrgId: report.cityCode === 'DEMO_C' ? '201' : report.cityCode, cityName: report.cityName, regionCode: report.cityCode, effectiveForm: report },
    info: { filingSource },
  }))
}

export function mockChartEnterprisePage({ periodCode, page, size, ...query }: EnterpriseAnalysisQuery, token: string) {
  const rows = demoSample(periodCode, query, token)
  const items = rows.filter(({ report }) => !query.changeDirection || report.changeDirection === query.changeDirection).map(({ report }) => report)
  return { periodCode, page, size, total: items.length, items: items.slice(page * size, (page + 1) * size) }
}

export function metrics(rows: ChartSample[]):SixMetrics {
  const baseline=rows.reduce((n,x)=>n+x.row.effectiveForm.baselineEmploymentCount,0)
  const current=rows.reduce((n,x)=>n+x.row.effectiveForm.periodEmploymentCount,0)
  const filingSourceCounts={SNAPSHOT_VERSION:0,CURRENT_FALLBACK:0,UNAVAILABLE:0}
  rows.forEach(x=>filingSourceCounts[x.info.filingSource]++)
  return {enterpriseCount:rows.length,baselineEmploymentTotal:baseline,periodEmploymentTotal:current,netChange:current-baseline,reductionTotal:rows.reduce((n,x)=>n+Math.max(x.row.effectiveForm.baselineEmploymentCount-x.row.effectiveForm.periodEmploymentCount,0),0),changePercent:rows.length?roundedPercent(current-baseline,baseline):null,filingSourceCounts}
}
function createMockAnalysisProvider(includeDemos: boolean): AnalysisProvider {
const availablePeriods = () => includeDemos ? [...state.periods, ...chartDemoPeriods] : state.periods
const period = (code: string) => availablePeriods().find(p => p.code === code) ?? fail(400, '调查期不存在')
const readSample = includeDemos ? chartSample : sample
return {
  async cities(q,t) {
    const rows=await readSample(q.periodCode,{regionCode:q.regionCode},t)
    const grouped=new Map<string,typeof rows>()
    rows.forEach(x=>grouped.set(x.row.cityOrgId,[...(grouped.get(x.row.cityOrgId)??[]),x]))
    const cities=[...grouped].map(([id,list])=>{
      const region=getMockRegionInfo(list[0]!.row.regionCode)?.path.find(p=>p.level===2)
      return {cityOrgId:id,cityName:region?.name??list[0]!.row.cityName,cityRegionCode:region?.code??list[0]!.row.regionCode,enterpriseCount:list.length,sharePercent:roundedPercent(list.length,rows.length)!}
    }).sort((a,b)=>a.cityRegionCode.localeCompare(b.cityRegionCode)||Number(a.cityOrgId)-Number(b.cityOrgId))
    return ok({periodCode:q.periodCode,periodLabel:period(q.periodCode).label,regionCode:q.regionCode||null,sampleRule,totalEnterpriseCount:rows.length,empty:!rows.length,cities})
  },
  async compare(q,t) {
    user(t,true)
    if(q.firstPeriodCode===q.secondPeriodCode) fail(400,'请选择两个不同调查期',{secondPeriodCode:'两期必须不同'})
    const periods=[]
    for(const [i,code] of [q.firstPeriodCode,q.secondPeriodCode].entries()) {
      const rows=await readSample(code,q,t), p=period(code)
      periods.push({position:i===0?'FIRST' as const:'SECOND' as const,periodCode:code,periodLabel:p.label,startAt:p.startAt,metrics:metrics(rows)})
    }
    return ok({firstPeriodCode:q.firstPeriodCode,secondPeriodCode:q.secondPeriodCode,filters:filters(q),sampleRule,periods})
  },
  async trend(q,t) {
    const u=user(t,true)
    if(u.orgId!=='100') fail(400,'调查期不在本省')
    const sorted=orderedPeriods(availablePeriods().filter(p=>!p.legacy)), indexes=q.periodCodes.map(c=>sorted.findIndex(p=>p.code===c))
    if(indexes.length<2||indexes.length>24||indexes.some((n,i)=>n<0||(i>0&&n!==indexes[i-1]!+1))) fail(400,'请选择升序相邻的 2 至 24 个不同期次',{periodCodes:'期次须连续且按时间升序'})
    const points=[]
    for(const code of q.periodCodes){const p=period(code), rows=await readSample(code,q,t);points.push({periodCode:code,periodLabel:p.label,startAt:p.startAt,hasSample:rows.length>0,metrics:rows.length?metrics(rows):null})}
    return ok({periodCodes:q.periodCodes,filters:filters(q),sampleRule,points})
  },
}
}
export const mockAnalysisProvider = createMockAnalysisProvider(false)
export const mockChartAnalysisProvider = createMockAnalysisProvider(true)
interface StoredNotice {detail:NoticeDetail;deleted:boolean;events:{action:'CREATE'|'UPDATE'|'DELETE';actor:string;at:string;version:number}[]}
const notices=new Map<string,StoredNotice>();let nextId=1
function canReadNotice(d: NoticeDetail, t: string) {
  const u = user(t)
  if (d.publisherLevel !== 'CITY') return d.publisherOrgId === provinceOf(t)
  if (u.roleCode === 'CITY') return u.orgId === d.publisherOrgId
  if (u.roleCode !== 'ENTERPRISE' || !provinceOf(t)) return false
  const city = [...state.owners.values()].find(o => o.orgId === u.orgId)?.cityId ?? mockCityOrgId(filings.records.get(u.orgId)?.regionCode ?? '')
  return city === d.publisherOrgId
}
function canWriteNotice(d: NoticeDetail, t: string) {
  const u = user(t)
  return (d.publisherLevel ?? 'PROVINCE') === u.roleCode && d.publisherOrgId === u.orgId
}
function accessible(id: string, t: string, writer?: 'CITY' | 'PROVINCE') {
  const u = user(t), notice = notices.get(id)
  if (writer && u.roleCode !== writer) return fail(403, '无权管理此级别通知')
  if (!notice || !canReadNotice(notice.detail, t)) return fail(404, '通知不存在或不在辖区')
  if (writer && !canWriteNotice(notice.detail, t)) return fail(403, '无权管理该通知')
  if (notice.deleted) return fail(writer ? 409 : 404, writer ? '通知已删除' : '通知不存在')
  return { u, notice }
}
function visible(d: NoticeDetail, t: string) {
  const editable = canWriteNotice(d, t)
  return { ...d, canEdit: editable, canDelete: editable }
}
function validateNotice(b:NoticeCreate) {const errors=noticeErrors(b);if(Object.keys(errors).length)fail(400,'请修改通知字段',errors);return {title:b.title.trim(),content:b.content.trim()}}
function makeMockNoticeProvider(level: 'CITY' | 'PROVINCE'): NoticeProvider {
return {
  async list(q,t) {
    user(t)
    if(!Number.isInteger(q.page)||q.page<0||!Number.isInteger(q.size)||q.size<1||q.size>100)fail(400,'分页无效')
    const rows=[...notices.values()].filter(n=>!n.deleted&&canReadNotice(n.detail,t)).map(n=>visible(n.detail,t)).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||Number(b.noticeId)-Number(a.noticeId))
    return ok({items:rows.slice(q.page*q.size,(q.page+1)*q.size).map(({content,publisherUserId,...summary})=>summary),total:rows.length,page:q.page,size:q.size})
  },
  async detail(id,t){return ok(visible(accessible(id,t).notice.detail,t))},
  async create(b,t) {
    const u=user(t)
    if (u.roleCode !== level) return fail(403, '无权发布此级别通知')
    const fields=validateNotice(b), now=new Date().toISOString(), id=String(nextId++)
    const detail:NoticeDetail={...fields,noticeId:id,publisherLevel:level,publisherUserId:u.id,publisherOrgId:u.orgId,publisherUnitName:u.orgName,publishedAt:now,updatedAt:null,currentVersion:1,canEdit:true,canDelete:true}
    notices.set(id,{detail,deleted:false,events:[{action:'CREATE',actor:u.id,at:now,version:1}]})
    return ok(detail)
  },
  async update(id,b,t) {
    const {u,notice:n}=accessible(id,t,level)
    if(b.expectedVersion!==n.detail.currentVersion)fail(409,'通知版本已变化')
    const fields=validateNotice(b),now=new Date().toISOString()
    n.detail={...n.detail,...fields,updatedAt:now,currentVersion:n.detail.currentVersion+1}
    n.events.push({action:'UPDATE',actor:u.id,at:now,version:n.detail.currentVersion})
    return ok(n.detail)
  },
  async delete(id,version,t) {
    const {u,notice:n}=accessible(id,t,level)
    if(version!==n.detail.currentVersion)fail(409,'通知版本已变化')
    const now=new Date().toISOString();n.deleted=true;n.detail.currentVersion++
    n.events.push({action:'DELETE',actor:u.id,at:now,version:n.detail.currentVersion})
    return ok({noticeId:id,currentVersion:n.detail.currentVersion,deleted:true as const,deletedAt:now})
  },
}
}
export const mockNoticeProvider = makeMockNoticeProvider('PROVINCE')
export const mockCityNoticeProvider = makeMockNoticeProvider('CITY')
export const noticeMockState = {notices}
