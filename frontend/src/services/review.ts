import { request } from '@/services/api'
import { apiMode } from '@/services/auth'
import { mockReviewProvider } from '@/mock/report'
import type { ApiResponse } from '@/types/api'
import type { ReviewList, ReviewDetail, ReviewResult, ApproveReviewRequest, ReturnReviewRequest } from '@/types/review'
export type ReviewLevel = 'city' | 'province'
export interface ReviewProvider {
 list(level: ReviewLevel, query: {periodCode?:string;status?:string;page:number;size:number}, token:string):Promise<ApiResponse<ReviewList>>
 detail(level:ReviewLevel,id:string,token:string):Promise<ApiResponse<ReviewDetail>>
 act(level:ReviewLevel,id:string,action:'approve'|'return',body:ApproveReviewRequest|ReturnReviewRequest,token:string):Promise<ApiResponse<ReviewResult>>
}
const real:ReviewProvider={
 list:(l,q,t)=>{const p=new URLSearchParams();for(const [k,v] of Object.entries(q))if(v!==undefined&&v!=='')p.set(k,String(v));return request(`/${l}/reports?${p}`,{},t)},
 detail:(l,id,t)=>request(`/${l}/reports/${encodeURIComponent(id)}`,{},t),
 act:(l,id,a,b,t)=>request(`/${l}/reports/${encodeURIComponent(id)}/${a}`,{method:'POST',body:JSON.stringify(b)},t),
}
export const reviewProvider:ReviewProvider=apiMode==='mock'?mockReviewProvider:real
