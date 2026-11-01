import { request, download } from '@/services/api'
import { apiMode } from '@/services/auth'
import { mockManagementProvider } from '@/mock/management'
import type { ApiResponse } from '@/types/api'
import type { DownloadedFile } from '@/types/filing'
import type { CorrectionDetail, CorrectionRequest, CorrectionResult, VoidRequest, VoidResult, Summary, EffectiveReportPage, EnterpriseInfoPage, AccountPage, AccountFilters } from '@/types/management'
export type DataFilter = { periodCode: string; regionCode?: string }
export type PageQuery = { page: number; size: number }
export function queryString(q: object) { const p=new URLSearchParams(); for(const [k,v] of Object.entries(q)) if(v!==undefined&&v!==null&&v!=='')p.set(k,String(v)); return p.size?'?'+p:'' }
export interface ManagementProvider {
 detail(id:string,t:string):Promise<ApiResponse<CorrectionDetail>>
 correct(id:string,b:CorrectionRequest,t:string):Promise<ApiResponse<CorrectionResult>>
 void(id:string,b:VoidRequest,t:string):Promise<ApiResponse<VoidResult>>
 summary(q:DataFilter,t:string):Promise<ApiResponse<Summary>>
 reports(q:DataFilter & PageQuery,t:string):Promise<ApiResponse<EffectiveReportPage>>
 enterprises(q:DataFilter & PageQuery,t:string):Promise<ApiResponse<EnterpriseInfoPage>>
 accounts(q:AccountFilters & PageQuery,t:string):Promise<ApiResponse<AccountPage>>
 export(kind:'reports'|'enterprise-info'|'accounts',q:DataFilter|AccountFilters,t:string):Promise<DownloadedFile>
}
const path=(id:string)=>`/province/reports/${encodeURIComponent(id)}`
const real:ManagementProvider={
 detail:(id,t)=>request(path(id)+'/corrections',{},t),
 correct:(id,b,t)=>request(path(id)+'/corrections',{method:'POST',body:JSON.stringify(b)},t),
 void:(id,b,t)=>request(path(id)+'/void',{method:'POST',body:JSON.stringify(b)},t),
 summary:(q,t)=>request('/province/summaries'+queryString(q),{},t),
 reports:(q,t)=>request('/province/data/reports'+queryString(q),{},t),
 enterprises:(q,t)=>request('/province/data/enterprise-info'+queryString(q),{},t),
 accounts:(q,t)=>request('/province/accounts'+queryString(q),{},t),
 export:(kind,q,t)=>download((kind==='accounts'?'/province/accounts/export':'/province/exports/'+kind)+queryString(q),{},t),
}
export const managementProvider=apiMode==='mock'?mockManagementProvider:real
export function saveDownload(file:DownloadedFile){const url=URL.createObjectURL(file.blob);const a=document.createElement('a');a.href=url;a.download=file.fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
