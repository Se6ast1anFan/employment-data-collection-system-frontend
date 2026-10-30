import { describe, expect, it, vi } from 'vitest'
import { mockAuthProvider, registerMockEnterpriseAccount } from '@/mock/auth'
import { mockReviewProvider as review } from '@/mock/report'
import { mockFilingProvider } from '@/mock/filing'
import { mockReportProvider as api } from '@/mock/report'
import { emptyReport, normalizeReport, validateReport, beijingUtc, beijingInput, validatePeriod } from '@/utils/report'

describe('第三周填报规则',()=>{
  it('北京时间往返、时间边界及减员校验',()=>{
    expect(beijingUtc('2026-10-30 08:00:00')).toBe('2026-10-30T00:00:00.000Z')
    expect(beijingInput('2026-10-30T00:00:00Z')).toBe('2026-10-30 08:00:00')
    expect(validatePeriod({code:'X',label:'期次',startAt:'2026-01-01Z',endExclusiveAt:'2026-01-01Z',openAt:'2026-01-02Z',closeAt:'2026-01-01Z',demo:true})).toHaveProperty('closeAt')
    const f={...emptyReport(),baselineEmploymentCount:100,periodEmploymentCount:90,otherReason:'无'}
    expect(validateReport(f,{reductionTypes:[],reasons:[]},true)).toHaveProperty('primaryReasonCode')
    expect(validateReport({...f,baselineEmploymentCount:-1},{reductionTypes:[],reasons:[]},false)).toHaveProperty('baselineEmploymentCount')
    expect(normalizeReport({...f,periodEmploymentCount:100,reductionTypeCode:'X'}).reductionTypeCode).toBeNull()
  })
  it('备案门禁、草稿重读、条件必填、提交快照、跨期基准和角色隔离',async()=>{
    const p=(await mockAuthProvider.login({username:'demo_province',password:'Demo@123456'})).data.accessToken
    const t=(await mockAuthProvider.login({username:'demo_enterprise',password:'Demo@123456'})).data.accessToken
    await expect(api.save('MOCK_OPEN',{...emptyReport(),expectedVersion:0},t)).rejects.toMatchObject({status:403})
    await expect(api.periods(t)).rejects.toMatchObject({status:403})
    const fields={organizationCode:'W3TEST',enterpriseName:'三周测试',natureParentCode:'DEMO_NATURE_1',natureCode:'DEMO_NATURE_1_1',industryParentCode:'DEMO_INDUSTRY_1',industryCode:'DEMO_INDUSTRY_1_1',mainBusiness:'演示',contactName:'演示',addressParentCode:'DEMO_ADDR_1',addressCode:'DEMO_ADDR_1_1',postalCode:'650000',contactPhone:'0871-12345678',fax:null,email:'w3@example.com'}
    await mockFilingProvider.saveProfile({...fields,fax:'0871-12345678'},t);const filed=await mockFilingProvider.submit({expectedVersion:0},t);await mockFilingProvider.approve(filed.data.filingId,{expectedVersion:1},p)
    const form={...emptyReport(),baselineEmploymentCount:100,periodEmploymentCount:90,otherReason:'无'}
    await api.save('MOCK_OPEN',{...form,expectedVersion:0},t)
    expect((await api.get('MOCK_OPEN',t)).data.form).toEqual(form)
    await expect(api.submit('MOCK_OPEN',1,t)).rejects.toMatchObject({status:400})
    await expect(api.save('MOCK_OPEN',{...form,expectedVersion:0},t)).rejects.toMatchObject({status:409})
    const complete={...form,reductionTypeCode:'MOCK_TYPE',primaryReasonCode:'MOCK_LEAVE',primaryReasonDetail:'匿名演示离职'}
    await api.save('MOCK_OPEN',{...complete,expectedVersion:1},t)
    const result=await api.submit('MOCK_OPEN',2,t);expect(result.data.currentVersion).toBe(3)
    expect((await api.history('MOCK_OPEN',t)).data.snapshots[0].form).toEqual(complete)
    expect((await api.get('MOCK_FUTURE',t)).data.lockedBaselineEmploymentCount).toBe(100)
    await expect(api.submit('MOCK_OPEN',3,t)).rejects.toMatchObject({status:409})
    expect((await api.list({page:0,size:20,status:'SUBMITTED_CITY'},t)).data.total).toBe(1)
    await expect(api.save('MOCK_FUTURE',{...complete,expectedVersion:0},t)).rejects.toMatchObject({status:409})
    const second=(await mockAuthProvider.login({username:'demo_city',password:'Demo@123456'})).data.accessToken
    await expect(api.history('MOCK_OPEN',second)).rejects.toMatchObject({status:403})
    expect((await api.list({page:0,size:20},t)).data.items[0].status).toBe('SUBMITTED_CITY')
    const id=result.data.reportId
    await expect(review.detail('province',id,p)).rejects.toMatchObject({status:404})
    registerMockEnterpriseAccount({username:'w4_other_city',password:'MockCity123',user:{id:'900',orgId:'OTHER_CITY',orgName:'另一市',displayName:'外市审核员',roleCode:'CITY'}})
    const other=(await mockAuthProvider.login({username:'w4_other_city',password:'MockCity123'})).data.accessToken
    expect((await review.list('city',{page:0,size:20},other)).data.total).toBe(0)
    await expect(review.detail('city',id,other)).rejects.toMatchObject({status:404})
    await expect(review.act('city',id,'approve',{expectedVersion:3,submissionVersion:1},other)).rejects.toMatchObject({status:404})
    await expect(review.act('city',id,'approve',{expectedVersion:2,submissionVersion:1},second)).rejects.toMatchObject({status:409})
    await review.act('city',id,'return',{expectedVersion:3,submissionVersion:1,comment:'   '},second)
    expect((await api.get('MOCK_OPEN',t)).data.latestReturn?.comment).toBeNull()
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+3*86400000)
    try {
      expect((await api.get('MOCK_OPEN',t)).data.canWrite).toBe(true)
      await api.save('MOCK_OPEN',{...complete,primaryReasonDetail:'第二次提交',expectedVersion:4},t)
      expect((await review.detail('city',id,second)).data.form.primaryReasonDetail).toBe(complete.primaryReasonDetail)
      await api.submit('MOCK_OPEN',5,t)
      await expect(review.act('city',id,'approve',{expectedVersion:6,submissionVersion:1},second)).rejects.toMatchObject({status:409})
      await review.act('city',id,'approve',{expectedVersion:6,submissionVersion:2},second)
      await review.act('province',id,'return',{expectedVersion:7,submissionVersion:2,comment:'省级请核对'},p)
      expect((await api.get('MOCK_OPEN',t)).data.latestReturn?.level).toBe('PROVINCE')
      await api.save('MOCK_OPEN',{...complete,primaryReasonDetail:'第三次提交',expectedVersion:8},t)
      await api.submit('MOCK_OPEN',9,t)
      expect((await api.get('MOCK_OPEN',t)).data.status).toBe('SUBMITTED_CITY')
      await expect(review.act('province',id,'approve',{expectedVersion:10,submissionVersion:3},p)).rejects.toMatchObject({status:409})
      await review.act('city',id,'approve',{expectedVersion:10,submissionVersion:3},second)
      await review.act('province',id,'approve',{expectedVersion:11,submissionVersion:3},p)
      const final=(await api.history('MOCK_OPEN',t)).data
      expect(final.status).toBe('APPROVED_PROVINCE');expect(final.snapshots).toHaveLength(3);expect(final.reviewEvents).toHaveLength(5)
      expect(final.snapshots[2].form).toEqual(complete)
      await expect(api.save('MOCK_OPEN',{...complete,expectedVersion:12},t)).rejects.toMatchObject({status:409})
    } finally {vi.useRealTimers()}
  })
})
