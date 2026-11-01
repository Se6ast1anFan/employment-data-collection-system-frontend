import { afterEach, describe, expect, it, vi } from 'vitest'

import { mockAuthProvider } from '@/mock/auth'
import { mockFilingProvider } from '@/mock/filing'
import { ApiError } from '@/services/api'
import type { EnterpriseProfileFields } from '@/types/filing'

const profile: EnterpriseProfileFields = {
  organizationCode: 'W2TEST001', enterpriseName: '第二周演示企业',
  natureParentCode: 'DEMO_NATURE_1', natureCode: 'DEMO_NATURE_1_1',
  industryParentCode: 'DEMO_INDUSTRY_1', industryCode: 'DEMO_INDUSTRY_1_1',
  mainBusiness: '演示制造业务', contactName: '测试人员',
  addressParentCode: 'DEMO_ADDR_1', addressCode: 'DEMO_ADDR_1_1', postalCode: '650000',
  contactPhone: '0871-12345678', fax: '0871-12345678', email: 'w2@example.com',
}

describe('第二周备案 Mock 闭环', () => {
  afterEach(() => vi.useRealTimers())
  it('完成建号、提交、退回、重提、通过、筛选和 Excel 导出', async () => {
    vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-10-24T08:00:00Z'))
    const provinceLogin = await mockAuthProvider.login({ username: 'demo_province', password: 'Demo@123456' })
    const provinceToken = provinceLogin.data.accessToken
    const account = await mockFilingProvider.createEnterpriseAccount({
      username: 'w2_test_enterprise', initialPassword: 'W2test123!', orgName: '第二周演示企业', regionCode: 'DEMO_D',
    }, provinceToken)
    expect(account.data).not.toHaveProperty('initialPassword')

    await expect(mockFilingProvider.createEnterpriseAccount({
      username: 'w2_test_enterprise', initialPassword: 'W2test123!', orgName: '重复账号', regionCode: 'DEMO_D',
    }, provinceToken)).rejects.toEqual(expect.objectContaining<Partial<ApiError>>({ status: 409 }))

    const enterpriseLogin = await mockAuthProvider.login({ username: 'w2_test_enterprise', password: 'W2test123!' })
    const enterpriseToken = enterpriseLogin.data.accessToken
    const initial = await mockFilingProvider.getProfile(enterpriseToken)
    expect(initial.data.status).toBeNull()
    expect(initial.data.region.code).toBe('DEMO_D')

    const draft = await mockFilingProvider.saveProfile(profile, enterpriseToken)
    expect(draft.data.status).toBe('DRAFT')
    expect(draft.data.currentVersion).toBe(0)
    const firstSubmit = await mockFilingProvider.submit({ expectedVersion: 0 }, enterpriseToken)
    expect(firstSubmit.data.currentVersion).toBe(1)

    const pending = await mockFilingProvider.listFilings({ status: 'PENDING' }, provinceToken)
    expect(pending.data.total).toBe(1)
    const filingId = pending.data.items[0].filingId
    await mockFilingProvider.returnFiling(filingId, { expectedVersion: 1, reason: '请核对联系电话' }, provinceToken)
    expect((await mockFilingProvider.getFiling(enterpriseToken)).data.returnReason).toBe('请核对联系电话')

    const changed = { ...profile, contactPhone: '13800138000' }
    await mockFilingProvider.saveProfile(changed, enterpriseToken)
    const oldSnapshot = await mockFilingProvider.getEnterpriseVersion(1, enterpriseToken)
    expect(oldSnapshot.data.profile.contactPhone).toBe('0871-12345678')
    const secondSubmit = await mockFilingProvider.submit({ expectedVersion: 1 }, enterpriseToken)
    expect(secondSubmit.data.currentVersion).toBe(2)

    await expect(mockFilingProvider.approve(filingId, { expectedVersion: 1 }, provinceToken)).rejects.toEqual(
      expect.objectContaining<Partial<ApiError>>({ status: 409 }),
    )
    await mockFilingProvider.approve(filingId, { expectedVersion: 2 }, provinceToken)
    const approvedStatus = await mockFilingProvider.getFiling(enterpriseToken)
    expect(approvedStatus.data.canReport).toBe(true)
    expect(approvedStatus.data.history.map((item) => item.result)).toEqual(['RETURNED', 'APPROVED'])

    const approved = await mockFilingProvider.listFilings({ status: 'APPROVED', periodCode: 'DEMO_2026_10' }, provinceToken)
    expect(approved.data.total).toBe(1)
    const exported = await mockFilingProvider.exportFilings({ periodCode: 'DEMO_2026_10' }, provinceToken)
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(exported.blob)
    })
    const bytes = new Uint8Array(buffer)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    expect(exported.fileName).toMatch(/\.xlsx$/)
  })

  it('市级账号不能调用省级备案接口', async () => {
    const city = await mockAuthProvider.login({ username: 'demo_city', password: 'Demo@123456' })
    await expect(mockFilingProvider.listFilings({}, city.data.accessToken)).rejects.toEqual(
      expect.objectContaining<Partial<ApiError>>({ status: 403 }),
    )
  })
})
