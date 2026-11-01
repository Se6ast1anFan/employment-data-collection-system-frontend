import {describe,it,expect} from 'vitest'
import {mockAnalysisProvider as api} from '@/mock/week6'
import {mockManagementProvider as management} from '@/mock/management'
import {managementMockState as s} from '@/mock/report'
import {managementMockFilings as f} from '@/mock/filing'
import {mockAuthProvider,registerMockEnterpriseAccount} from '@/mock/auth'
import {registerMockRegionPath} from '@/mock/system'
import {emptyReport} from '@/utils/report'
const login=async(username:string)=>(await mockAuthProvider.login({username,password:'Demo@123456'})).data.accessToken
function seed(id:string,orgId:string,code:string,base:number,current:number,city='201',source='SNAPSHOT_VERSION'){
 const form={...emptyReport(),baselineEmploymentCount:base,periodEmploymentCount:current,otherReason:'无',...(current<base?{reductionTypeCode:'MOCK_TYPE',primaryReasonCode:'MOCK_LEAVE',primaryReasonDetail:'匿名演示减员'}:{})}
 const region=city==='201'?'DEMO_D':'W6_D2'
 const profile={organizationCode:'W6'+orgId,enterpriseName:'匿名样例'+orgId,natureParentCode:'DEMO_NATURE_1',natureCode:'DEMO_NATURE_1_1',industryParentCode:'DEMO_INDUSTRY_1',industryCode:'DEMO_INDUSTRY_1_1',mainBusiness:'匿名演示',contactName:'演示',addressParentCode:'DEMO_ADDR_1',addressCode:'DEMO_ADDR_1_1',postalCode:'650000',contactPhone:'13800000000',fax:null,email:'demo@example.com'}
 if(source!=='UNAVAILABLE')f.records.set(orgId,{...structuredClone(f.records.get('301')!),orgId,userId:orgId,username:'mock'+orgId,orgName:profile.enterpriseName,regionCode:region,filingId:orgId,status:'APPROVED',currentVersion:1,profile,versions:new Map(source==='SNAPSHOT_VERSION'?[[1,{filingId:orgId,version:1,result:'APPROVED',profile:structuredClone(profile),region:{code:region,name:'匿名地区',path:[]},submittedAt:'2026-01-01T00:00:00Z',reviewedAt:null,reason:null}]]:[])})
 s.owners.set(id,{orgId,name:profile.enterpriseName,cityId:city,provinceId:'100'})
 s.reports.set(orgId+':'+code,{reportId:id,periodCode:code,status:'APPROVED_PROVINCE',currentVersion:4,submissionVersion:1,filingEligible:true,windowStatus:'CLOSED',canWrite:false,blockedReason:'ALREADY_SUBMITTED',baselineLocked:true,lockedBaselineEmploymentCount:base,form,submittedAt:'2026-01-01T00:00:00Z',updatedAt:null,latestReturn:null})
 s.histories.set(orgId+':'+code,{reportId:id,periodCode:code,status:'APPROVED_PROVINCE',snapshots:[{submissionVersion:1,form:structuredClone(form),submittedAt:'2026-01-01T00:00:00Z',submittedBy:orgId,result:'SUBMITTED_CITY',filingId:source==='SNAPSHOT_VERSION'?orgId:null,filingVersion:source==='SNAPSHOT_VERSION'?1:null}],reviewEvents:[]})
}
describe('第六周两市三期指标与动态有效值',()=>{
 it('独立样本、去重口径、城市分母、六指标、来源标记、修订和作废动态重算',async()=>{
 const p=await login('demo_province'),city=await login('demo_city')
 registerMockRegionPath([{code:'DEMO_P',name:'演示省',level:1},{code:'W6_C2',name:'第二演示市',level:2},{code:'W6_D2',name:'第二演示县',level:3}])
 for(const [i,code] of ['W6_A','W6_B','W6_C'].entries())s.periods.push({code,label:code,startAt:`2026-0${i+1}-01T00:00:00Z`,endExclusiveAt:`2026-0${i+2}-01T00:00:00Z`,openAt:null,closeAt:null,demo:true,legacy:false,currentVersion:1,windowStatus:'CLOSED'})
 seed('710','801','W6_A',100,80);seed('711','802','W6_A',50,60,'202','CURRENT_FALLBACK')
 seed('712','803','W6_B',200,220)
 const a=(await api.compare({firstPeriodCode:'W6_A',secondPeriodCode:'W6_B'},p)).data
 expect(a.periods[0].metrics).toMatchObject({enterpriseCount:2,baselineEmploymentTotal:150,periodEmploymentTotal:140,netChange:-10,reductionTotal:20,changePercent:-6.67,filingSourceCounts:{SNAPSHOT_VERSION:1,CURRENT_FALLBACK:1,UNAVAILABLE:0}})
 expect(a.periods[1].metrics).toMatchObject({enterpriseCount:1,baselineEmploymentTotal:200,periodEmploymentTotal:220,netChange:20,reductionTotal:0,changePercent:10})
 const shares=(await api.cities({periodCode:'W6_A'},p)).data
 expect(shares.totalEnterpriseCount).toBe(2);expect(shares.cities.map(c=>c.sharePercent)).toEqual([50,50])
 expect((await api.cities({periodCode:'W6_A',regionCode:'W6_C2'},p)).data).toMatchObject({totalEnterpriseCount:1,cities:[{cityName:'第二演示市',sharePercent:100}]})
 const trend=(await api.trend({periodCodes:['W6_A','W6_B','W6_C']},p)).data
 expect(trend.points.map(p=>p.metrics.changePercent)).toEqual([-6.67,10,null]);expect(trend.points[2].hasSample).toBe(false)
 await expect(api.trend({periodCodes:['W6_A','W6_C']},p)).rejects.toMatchObject({status:400})
 await expect(api.trend({periodCodes:['W6_B','W6_A']},p)).rejects.toMatchObject({status:400})
 await expect(api.compare({firstPeriodCode:'W6_A',secondPeriodCode:'W6_A'},p)).rejects.toMatchObject({status:400})
 await expect(api.cities({periodCode:'W6_A'},city)).rejects.toMatchObject({status:403})
 registerMockEnterpriseAccount({username:'w6_external_analysis',password:'Demo@123456',user:{id:'999',orgId:'999',orgName:'外省',displayName:'外省',roleCode:'PROVINCE'}})
 await expect(api.cities({periodCode:'W6_A'},await login('w6_external_analysis'))).rejects.toMatchObject({status:400})
 const before=structuredClone(s.histories.get('801:W6_A'))
 await management.correct('710',{expectedVersion:4,submissionVersion:1,reason:'核对人数',changes:{periodEmploymentCount:70}},p)
 expect((await api.compare({firstPeriodCode:'W6_A',secondPeriodCode:'W6_B'},p)).data.periods[0].metrics).toMatchObject({periodEmploymentTotal:130,netChange:-20,reductionTotal:30,changePercent:-13.33})
 expect(s.histories.get('801:W6_A')).toEqual(before)
 await management.void('711',{expectedVersion:4,submissionVersion:1,reason:'匿名样例作废'},p)
 expect((await api.cities({periodCode:'W6_A'},p)).data.totalEnterpriseCount).toBe(1)
 const after=(await api.trend({periodCodes:['W6_A','W6_B','W6_C']},p)).data
 expect(after.points[0].metrics.changePercent).toBe(-30)
 // 当前备案属性变化不能污染冻结版本筛选。
 f.records.get('801')!.profile!.natureCode='DEMO_NATURE_2_1'
 expect((await api.compare({firstPeriodCode:'W6_A',secondPeriodCode:'W6_B',natureParentCode:'DEMO_NATURE_1'},p)).data.periods[0].metrics.enterpriseCount).toBe(1)
 await expect(api.compare({firstPeriodCode:'W6_A',secondPeriodCode:'W6_B',natureParentCode:'DEMO_NATURE_2',natureCode:'DEMO_NATURE_1_1'},p)).rejects.toMatchObject({status:400})
 seed('713','804','W6_C',0,0,'201','UNAVAILABLE')
 const zero=(await api.trend({periodCodes:['W6_B','W6_C']},p)).data.points[1]
 expect(zero.hasSample).toBe(true);expect(zero.metrics.changePercent).toBeNull();expect(zero.metrics.filingSourceCounts.UNAVAILABLE).toBe(1)
 })
})
