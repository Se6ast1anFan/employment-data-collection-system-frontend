import { describe, expect, it, vi } from 'vitest'
import { mockAuthProvider, registerMockEnterpriseAccount } from '@/mock/auth'
import { mockFilingProvider } from '@/mock/filing'
import { mockRollingReportProvider as report, mockReviewProvider as review } from '@/mock/report'
import { mockManagementProvider } from '@/mock/management'
import { mockCityNoticeProvider, mockNoticeProvider } from '@/mock/week6'
import { mockRevisionProvider as api } from '@/mock/revision'
import { realRevisionProvider } from '@/services/revision'
import { cityNoticeProvider } from '@/services/week6'
import { emptyReport } from '@/utils/report'

const login = async (username: string) => (await mockAuthProvider.login({ username, password: 'Demo@123456' })).data.accessToken
const draft = (count: number) => ({ ...emptyReport(), periodEmploymentCount: count, otherReason: '无', expectedVersion: 0 })
const iso = (day: number) => new Date(Date.now() + day * 86400000).toISOString()

describe('老师反馈前端联调样本', () => {
  it('市级只管理本市发布内容，所属市企业可读，外市和省级列表隔离', async () => {
    registerMockEnterpriseAccount({ username: 'demo_revision_other_city', password: 'Demo@123456',
      user: { id: 'REV-CITY', orgId: 'REV-CITY', orgName: '匿名外市', displayName: '匿名外市', roleCode: 'CITY' },
    })
    const [province, city, otherCity, enterprise] = await Promise.all(['demo_province', 'demo_city', 'demo_revision_other_city', 'demo_enterprise'].map(login))
    const draft = { title: '匿名通知', content: '第一行\n<b>原文</b>' }
    const prov = (await mockNoticeProvider.create(draft, province)).data
    const local = (await mockCityNoticeProvider.create(draft, city)).data
    expect((await mockNoticeProvider.list({ page: 0, size: 20 }, city)).data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ noticeId: prov.noticeId, publisherLevel: 'PROVINCE', canEdit: false }),
      expect.objectContaining({ noticeId: local.noticeId, publisherLevel: 'CITY', canEdit: true }),
    ]))
    expect((await mockNoticeProvider.detail(local.noticeId, enterprise)).data).toMatchObject({ canEdit: false, canDelete: false, content: draft.content })
    await expect(mockNoticeProvider.detail(local.noticeId, otherCity)).rejects.toMatchObject({ status: 404 })
    await expect(mockNoticeProvider.detail(local.noticeId, province)).rejects.toMatchObject({ status: 404 })
    await expect(mockCityNoticeProvider.update(prov.noticeId, { ...draft, expectedVersion: 1 }, city)).rejects.toMatchObject({ status: 403 })
    await expect(mockCityNoticeProvider.create(draft, enterprise)).rejects.toMatchObject({ status: 403 })
    await mockCityNoticeProvider.update(local.noticeId, { ...draft, expectedVersion: 1, title: '已修改' }, city)
    await expect(mockCityNoticeProvider.delete(local.noticeId, 1, city)).rejects.toMatchObject({ status: 409 })
    await mockCityNoticeProvider.delete(local.noticeId, 2, city)
    await expect(mockNoticeProvider.detail(local.noticeId, enterprise)).rejects.toMatchObject({ status: 404 })
  })

  it('批量按期排序允许部分成功，跳过失败期，且旧期修订不改已提交新期快照', async () => {
    const [p, c, e] = await Promise.all(['demo_province', 'demo_city', 'demo_enterprise'].map(login))
    const profile = {
      organizationCode: 'REVBATCH', enterpriseName: '匿名修订测试', natureParentCode: 'DEMO_NATURE_1', natureCode: 'DEMO_NATURE_1_1',
      industryParentCode: 'DEMO_INDUSTRY_1', industryCode: 'DEMO_INDUSTRY_1_1', mainBusiness: '演示', contactName: '演示',
      addressParentCode: 'DEMO_ADDR_1', addressCode: 'DEMO_ADDR_1_1', postalCode: '650000',
      contactPhone: '0871-12345678', fax: '0871-12345678', email: null,
    }
    await mockFilingProvider.saveProfile(profile, e)
    const filing = (await mockFilingProvider.submit({ expectedVersion: 0 }, e)).data
    await mockFilingProvider.approve(filing.filingId, { expectedVersion: 1 }, p)
    for (const [i, code] of ['REV_A', 'REV_B', 'REV_C'].entries()) {
      await report.create({ code, label: code, startAt: iso(i + 2), endExclusiveAt: iso(i + 3), openAt: iso(-1), closeAt: iso(1), demo: true }, p)
    }
    const status = (await api.progress({ periodCode: 'REV_A', reportStatus: 'NOT_SUBMITTED', page: 0, size: 20 }, p)).data
    expect(status.items).toContainEqual(expect.objectContaining({ enterpriseOrgId: '301', filingStatus: 'APPROVED', reportStatus: 'NOT_SUBMITTED' }))
    await expect(api.progress({ periodCode: 'REV_A', page: 0, size: 20 }, e)).rejects.toMatchObject({ status: 403 })
    await expect(report.save('REV_A', { ...draft(100), baselineEmploymentCount: 80 }, e)).rejects.toMatchObject({ status: 400 })
    const first = (await report.save('REV_A', draft(100), e)).data
    expect(first).toMatchObject({ baselineSourcePeriodCode: 'REV_A', baselineSourceKind: 'FIRST_SUBMISSION', baselineEditable: false })
    await report.save('REV_B', draft(105), e)
    await report.save('REV_C', draft(110), e)
    await expect(api.batchSubmit([{ periodCode: 'REV_A', expectedVersion: 1 }, { periodCode: 'REV_A', expectedVersion: 1 }], e)).rejects.toMatchObject({ status: 400 })
    expect((await report.get('REV_A', e)).data.status).toBe('DRAFT')
    const batch = (await api.batchSubmit([
      { periodCode: 'REV_C', expectedVersion: 1 }, { periodCode: 'REV_B', expectedVersion: 0 }, { periodCode: 'REV_A', expectedVersion: 1 },
    ], e)).data
    expect(batch).toMatchObject({ successCount: 2, failureCount: 1, items: [
      { periodCode: 'REV_A', success: true, baselineSourcePeriodCode: 'REV_A', baselineEmploymentCount: 100 },
      { periodCode: 'REV_B', success: false, reasonCode: 'VERSION_CONFLICT', currentVersion: 1 },
      { periodCode: 'REV_C', success: true, baselineSourcePeriodCode: 'REV_A', baselineEmploymentCount: 100 },
    ] })
    const firstId = batch.items[0]!.reportId!
    await review.act('city', firstId, 'approve', { expectedVersion: 2, submissionVersion: 1 }, c)
    await review.act('province', firstId, 'approve', { expectedVersion: 3, submissionVersion: 1 }, p)
    await mockManagementProvider.correct(firstId, { expectedVersion: 4, submissionVersion: 1, reason: '复核', changes: { periodEmploymentCount: 102 } }, p)
    expect((await report.get('REV_B', e)).data.computedBaselineEmploymentCount).toBe(102)
    expect((await report.get('REV_C', e)).data.computedBaselineEmploymentCount).toBe(100)
    expect((await report.history('REV_C', e)).data.snapshots[0]).toMatchObject({ baselineSourceReportId: firstId, baselineEmploymentCount: 100 })
    const retried = (await api.batchSubmit([{ periodCode: 'REV_B', expectedVersion: 1 }], e)).data
    expect(retried.items[0]).toMatchObject({ success: true, baselineEmploymentCount: 102 })
    const group = (await api.breakdown({ periodCode: 'REV_A', groupBy: 'CHANGE_DIRECTION' }, p)).data.items[0]
    expect(group).toMatchObject({ groupCode: 'INCREASE', increaseEnterpriseCount: 1, increaseTotal: 2, reductionTotal: 0, netChange: 2 })
    const detail = (await api.enterprises({ periodCode: 'REV_A', changeDirection: 'INCREASE', enterpriseOrgId: '301', page: 0, size: 20 }, p)).data.items[0]
    expect(detail).toMatchObject({ reportId: firstId, baselineSourcePeriodCode: 'REV_A', periodEmploymentCount: 102 })
  })

  it('真实请求使用独立路径和契约字段，批量请求不发送组织编号', async () => {
    const fetcher = vi.fn(async (_input: string, _options: RequestInit) => new Response(JSON.stringify({ code: 'OK', message: '', traceId: null, data: {} })))
    vi.stubGlobal('fetch', fetcher)
    try {
      const item = { periodCode: 'REV_A', expectedVersion: 3, enterpriseOrgId: 'untrusted' }
      await realRevisionProvider.batchSubmit([item], 'demo-token')
      await realRevisionProvider.progress({ periodCode: 'P 2', filingStatus: 'APPROVED', reportStatus: 'NOT_SUBMITTED', page: 0, size: 20 }, 'demo-token')
      await realRevisionProvider.enterprises({ periodCode: 'P2', regionCode: '530100', enterpriseOrgId: '301', changeDirection: 'DECREASE', page: 0, size: 20 }, 'demo-token')
      await cityNoticeProvider.delete('id/42', 2, 'demo-token')
      expect(fetcher.mock.calls[0]).toEqual(['/api/v1/enterprise/reports/batch-submit', expect.objectContaining({
        method: 'POST', body: '{"items":[{"periodCode":"REV_A","expectedVersion":3}]}',
        headers: expect.objectContaining({ Authorization: 'Bearer demo-token' }),
      })])
      expect(fetcher.mock.calls[1]![0]).toBe('/api/v1/province/enterprise-progress?periodCode=P+2&filingStatus=APPROVED&reportStatus=NOT_SUBMITTED&page=0&size=20')
      expect(fetcher.mock.calls[2]![0]).toContain('enterpriseOrgId=301&changeDirection=DECREASE')
      expect(fetcher.mock.calls[3]).toEqual(['/api/v1/city/notices/id%2F42?expectedVersion=2', expect.objectContaining({ method: 'DELETE' })])
      expect(fetcher.mock.calls[3]![1].body).toBeUndefined()
    } finally { vi.unstubAllGlobals() }
  })
})
