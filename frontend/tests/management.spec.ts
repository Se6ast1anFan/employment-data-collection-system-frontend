import { describe,it,expect } from 'vitest'
import { mockManagementProvider as api } from '@/mock/management'
import { managementMockState as s } from '@/mock/report'
import { managementMockFilings as f } from '@/mock/filing'
import { mockAuthProvider,registerMockEnterpriseAccount } from '@/mock/auth'
import { correctionChanges, accountErrors } from '@/utils/management'
import { emptyReport } from '@/utils/report'
import type { ReportForm } from '@/types/report'
const login=async(username:string)=>(await mockAuthProvider.login({username,password:'Demo@123456'})).data.accessToken
function seed(id:string,cityId:string,count:number,code='MOCK_OPEN'){
 const form={...emptyReport(),baselineEmploymentCount:100,periodEmploymentCount:count,otherReason:'无',reductionTypeCode:'MOCK_TYPE',primaryReasonCode:'MOCK_LEAVE',primaryReasonDetail:'演示减员'} as ReportForm
 const key='301:'+code+id
 s.owners.set(id,{orgId:'301',name:'匿名企业'+id,cityId,provinceId:'100'})
 s.reports.set(key,{reportId:id,periodCode:code,status:'APPROVED_PROVINCE',currentVersion:4,submissionVersion:1,form,filingEligible:true,windowStatus:'OPEN',canWrite:false,blockedReason:'ALREADY_SUBMITTED',baselineLocked:true,lockedBaselineEmploymentCount:100,updatedAt:new Date().toISOString(),submittedAt:new Date().toISOString(),latestReturn:null})
 s.histories.set('301:'+code,{reportId:id,periodCode:code,status:'APPROVED_PROVINCE',snapshots:[{submissionVersion:1,form:structuredClone(form),submittedAt:new Date().toISOString(),submittedBy:'101',result:'SUBMITTED_CITY',filingId:null,filingVersion:null}],reviewEvents:[]})
}
describe('第五周有效值与追溯',()=>{
 it('两期汇总、九字段修订、留痕、冲突、角色和跨省隔离、作废排除及三类空导出',async()=>{
 const p=await login('demo_province'),c=await login('demo_city'),e=await login('demo_enterprise')
 seed('901','201',90);seed('902','202',90,'MOCK_FUTURE')
 const q={periodCode:'MOCK_OPEN'}
 expect((await api.summary(q,p)).data).toMatchObject({enterpriseCount:1,baselineEmploymentTotal:100,periodEmploymentTotal:90,netChange:-10})
 expect((await api.summary({periodCode:'MOCK_FUTURE'},p)).data.periodEmploymentTotal).toBe(90)
 const original=(await api.detail('901',p)).data
 const snapshot=structuredClone(s.histories.get('301:MOCK_OPEN')!)
 await expect(api.correct('901',{expectedVersion:4,submissionVersion:2,reason:'核对',changes:{periodEmploymentCount:85}},p)).rejects.toMatchObject({status:409})
 await expect(api.correct('901',{expectedVersion:4,submissionVersion:1,reason:' ',changes:{periodEmploymentCount:85}},p)).rejects.toMatchObject({status:400})
 await expect(api.correct('901',{expectedVersion:4,submissionVersion:1,reason:'核对',changes:{primaryReasonCode:null}},p)).rejects.toMatchObject({status:400})
 const b={expectedVersion:4,submissionVersion:1,reason:'核对原始资料',changes:{periodEmploymentCount:85}}
 await expect(api.correct('901',b,e)).rejects.toMatchObject({status:403})
 await expect(api.void('901',b,c)).rejects.toMatchObject({status:403})
 registerMockEnterpriseAccount({username:'w5_other_province',password:'Demo@123456',user:{id:'999',orgId:'999',orgName:'外省',displayName:'外省',roleCode:'PROVINCE'}})
 const other=await login('w5_other_province')
 await expect(api.detail('901',other)).rejects.toMatchObject({status:404})
 expect((await api.correct('901',b,p)).data.currentVersion).toBe(5)
 await expect(api.correct('901',b,p)).rejects.toMatchObject({status:409})
 const d=(await api.detail('901',p)).data
 expect(d.originalForm).toEqual(original.originalForm);expect(d.effectiveForm.periodEmploymentCount).toBe(85)
 expect(d.corrections[0]).toMatchObject({oldValue:90,newValue:85,reason:b.reason,actorUserId:'103'})
 expect(s.histories.get('301:MOCK_OPEN')).toEqual(snapshot)
 expect((await api.summary(q,p)).data.periodEmploymentTotal).toBe(85)
 const rows=(await api.reports({...q,page:0,size:20},p)).data
 expect(rows.items[0].effectiveForm.periodEmploymentCount).toBe(85)
 expect((await api.enterprises({...q,page:0,size:20},p)).data.items[0].filingSource).toBe('UNAVAILABLE')
 const xlsx=await api.export('reports',q,p);const text=await blobText(xlsx.blob)
 expect(text).toContain('调查期人数');expect(text).toContain('85');expect(text).toContain('PK')
 await api.void('901',{expectedVersion:5,submissionVersion:1,reason:'匿名历史样本作废'},p)
 expect((await api.summary(q,p)).data).toMatchObject({enterpriseCount:0,baselineEmploymentTotal:0,periodEmploymentTotal:0,netChange:0})
 expect((await api.reports({...q,page:0,size:20},p)).data.total).toBe(0)
 expect((await api.enterprises({...q,page:0,size:20},p)).data.total).toBe(0)
 expect((await api.detail('901',p)).data.voidEvent?.reason).toBe('匿名历史样本作废')
 await expect(api.void('901',{expectedVersion:6,submissionVersion:1,reason:'重复'},p)).rejects.toMatchObject({status:409})
 expect(s.histories.get('301:MOCK_OPEN')!.snapshots).toEqual(snapshot.snapshots)
 for(const kind of ['reports','enterprise-info','accounts'] as const){const file=await api.export(kind,kind==='accounts'?{username:'不存在'}:q,p);const xml=await blobText(file.blob);expect(xml).toContain('<row r="1">');expect(xml).not.toContain('<row r="2">')}
 })
 it('账号条件组合、日期、状态依赖与清除',async()=>{
 const p=await login('demo_province')
 expect((await api.accounts({page:0,size:20},p)).data.total).toBeGreaterThanOrEqual(3)
 expect((await api.accounts({username:'demo_',userType:'CITY',cityCode:'DEMO_C',page:0,size:20},p)).data.items.map(r=>r.username)).toEqual(['demo_city'])
 expect((await api.accounts({createdTo:'2000-01-01',page:0,size:20},p)).data.total).toBe(0)
 expect((await api.accounts({userType:'ENTERPRISE',dataStatus:'NO_FILING',page:0,size:20},p)).data.items[0].username).toBe('demo_enterprise')
 await expect(api.accounts({reportStatus:'DRAFT',page:0,size:20},p)).rejects.toMatchObject({status:400})
 expect(accountErrors({createdFrom:'2026-11-02',createdTo:'2026-11-01'})).toHaveProperty('createdTo')
 expect((await api.accounts({page:0,size:20},p)).data.filters).toEqual({})
 })
 it('修订仅提交实际变化，null 清空，禁止修改基准',()=>{
 const a={...emptyReport(),baselineEmploymentCount:100,periodEmploymentCount:90,otherReason:'无',reductionTypeCode:'MOCK_TYPE',primaryReasonCode:'MOCK_LEAVE',primaryReasonDetail:'原因'}
 expect(correctionChanges(a,{...a,otherReason:' 无 '})).toEqual({})
 expect(correctionChanges(a,{...a,baselineEmploymentCount:120,periodEmploymentCount:95,secondaryReasonDetail:'   '})).toEqual({periodEmploymentCount:95})
 expect(correctionChanges(a,{...a,periodEmploymentCount:100})).toMatchObject({reductionTypeCode:null,primaryReasonCode:null,primaryReasonDetail:null})
 })
})
function blobText(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=reject;reader.readAsText(blob)})}
