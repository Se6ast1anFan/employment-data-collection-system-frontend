import { describe,it,expect } from 'vitest'
import { mockNoticeProvider as api,noticeMockState } from '@/mock/week6'
import { mockAuthProvider,registerMockEnterpriseAccount } from '@/mock/auth'
import { noticeErrors,roundedPercent,contiguousCodes } from '@/utils/week6'
import { chartGeometry } from '@/utils/chart'
const login=async(username:string)=>(await mockAuthProvider.login({username,password:'Demo@123456'})).data.accessToken

describe('第六周通知与图表边界',()=>{
 it('Unicode码点字数、首尾空白、负数 HALF_UP 舍入及空值断线',()=>{
   expect(noticeErrors({title:'😀'.repeat(50),content:'文'.repeat(2000)})).toEqual({})
   expect(noticeErrors({title:'😀'.repeat(51),content:'文'.repeat(2001)})).toHaveProperty('title')
   expect(noticeErrors({title:' ',content:'\n'})).toHaveProperty('content')
   expect(roundedPercent(-1,32)).toBe(-3.13)
   expect(roundedPercent(1,32)).toBe(3.13)
   expect(roundedPercent(0,0)).toBeNull()
   const chart=chartGeometry([{label:'一期',value:-15},{label:'二期',value:null},{label:'三期',value:0}])
   expect(chart.segments).toHaveLength(2);expect(chart.segments.map(s=>s.length)).toEqual([1,1])
   expect(chart.y(-15)).toBeGreaterThan(chart.zero)
   expect(contiguousCodes([{code:'C',startAt:'2026-03-01Z'},{code:'A',startAt:'2026-01-01Z'},{code:'B',startAt:'2026-01-01Z'}],'A','C')).toEqual(['A','B','C'])
   expect(()=>contiguousCodes([{code:'A',startAt:'2026-01-01Z'}],'A','A')).toThrow()
 })
 it('通知发布、分页、只读、跨省隔离、整份修改、版本冲突与删除审计',async()=>{
   const p=await login('demo_province'),city=await login('demo_city'),enterprise=await login('demo_enterprise')
   registerMockEnterpriseAccount({username:'w6_outer',password:'Demo@123456',user:{id:'990',orgId:'990',orgName:'外省',displayName:'外省用户',roleCode:'PROVINCE'}})
   const outer=await login('w6_outer')
   await expect(api.create({title:'标题',content:'正文'},city)).rejects.toMatchObject({status:403})
   await expect(api.create({title:' ',content:'正文'},p)).rejects.toMatchObject({status:400,fieldErrors:{title:expect.any(String)}})
   const created=(await api.create({title:' '+ '😀'.repeat(50)+' ',content:'文'.repeat(2000)},p)).data
   expect(created.currentVersion).toBe(1);expect(created.publisherOrgId).toBe('100')
   expect((await api.detail(created.noticeId,enterprise)).data.canEdit).toBe(false)
   expect((await api.list({page:0,size:20},city)).data.total).toBe(1)
   expect((await api.list({page:0,size:20},outer)).data.total).toBe(0)
   await expect(api.detail(created.noticeId,outer)).rejects.toMatchObject({status:404})
   await expect(api.update(created.noticeId,{expectedVersion:1,title:'外省改',content:'拒绝'},outer)).rejects.toMatchObject({status:404})
   await expect(api.delete(created.noticeId,1,enterprise)).rejects.toMatchObject({status:403})
   const changed=(await api.update(created.noticeId,{expectedVersion:1,title:'更新',content:'第一行\n<script>alert(1)</script>'},p)).data
   expect(changed.currentVersion).toBe(2);expect(changed.publishedAt).toBe(created.publishedAt);expect(changed.publisherUserId).toBe(created.publisherUserId)
   await expect(api.update(created.noticeId,{expectedVersion:1,title:'旧页',content:'拒绝'},p)).rejects.toMatchObject({status:409})
   await expect(api.delete(created.noticeId,1,p)).rejects.toMatchObject({status:409})
   await api.delete(created.noticeId,2,p)
   await expect(api.detail(created.noticeId,city)).rejects.toMatchObject({status:404})
   await expect(api.delete(created.noticeId,3,p)).rejects.toMatchObject({status:409})
   expect((await api.list({page:0,size:20},enterprise)).data.total).toBe(0)
   expect(noticeMockState.notices.get(created.noticeId)!.events.map(e=>e.action)).toEqual(['CREATE','UPDATE','DELETE'])
 })
})
