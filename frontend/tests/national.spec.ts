import { createHash, webcrypto } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { mockAuthProvider, registerMockEnterpriseAccount } from '@/mock/auth'
import { createMockNationalProvider } from '@/mock/national'
import { mockManagementProvider } from '@/mock/management'
import { managementMockState } from '@/mock/report'
import { realNationalProvider } from '@/services/national'
import { getMenusForRole } from '@/config/navigation'

const login = async (username: string) => (await mockAuthProvider.login({ username, password: 'Demo@123456' })).data.accessToken
const code = 'MOCK_NATIONAL_CLOSED'

it('按关闭期、待处理和缺报门槛冻结两市唯一批次，失败后用原报文重试', async () => {
  const api = createMockNationalProvider(attempt => attempt === 1)
  const [province, city, enterprise] = await Promise.all(['demo_province', 'demo_city', 'demo_enterprise'].map(login))
  registerMockEnterpriseAccount({
    username: 'nat_other_province', password: 'Demo@123456',
    user: { id: '9999', orgId: '9999', displayName: '匿名外省', orgName: '匿名外省', roleCode: 'PROVINCE' },
  })
  const otherProvince = await login('nat_other_province')
  vi.stubGlobal('crypto', webcrypto)
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    await api.periods(province)
    for (const token of [city, enterprise]) {
      await expect(api.readiness(code, token)).rejects.toMatchObject({ status: 403 })
      await expect(api.create({ periodCode: code, acknowledgeMissing: true }, token)).rejects.toMatchObject({ status: 403 })
      await expect(api.list({ page: 0, size: 20 }, token)).rejects.toMatchObject({ status: 403 })
    }
    expect(getMenusForRole('PROVINCE').some(menu => menu.path === '/province/national')).toBe(true)
    expect(getMenusForRole('CITY').some(menu => menu.path === '/province/national')).toBe(false)
    expect(getMenusForRole('ENTERPRISE').some(menu => menu.path === '/province/national')).toBe(false)
    await expect(api.create({ periodCode: 'MOCK_OPEN', acknowledgeMissing: true }, province)).rejects.toMatchObject({
      status: 409, data: { reasonCode: 'NOT_READY', blockers: expect.arrayContaining([expect.objectContaining({ code: 'WINDOW_NOT_CLOSED' })]) },
    })
    const approved = managementMockState.reports.get('91301:' + code)!
    for (const [status, blocker] of [['SUBMITTED_CITY', 'PENDING_CITY'], ['SUBMITTED_PROVINCE', 'PENDING_PROVINCE'], ['RETURNED_CITY', 'RETURNED_CITY'], ['RETURNED_PROVINCE', 'RETURNED_PROVINCE']] as const) {
      approved.status = status
      await expect(api.create({ periodCode: code, acknowledgeMissing: true }, province)).rejects.toMatchObject({
        status: 409, data: { reasonCode: 'NOT_READY', blockers: expect.arrayContaining([expect.objectContaining({ code: blocker })]) },
      })
    }
    approved.status = 'APPROVED_PROVINCE'
    const readiness = (await api.readiness(code, province)).data
    expect(readiness).toMatchObject({ canSubmit: true, counts: { approvedCount: 2, missingCount: 1 }, requiresMissingAcknowledgement: true })
    expect(readiness.preview.cities).toHaveLength(2)
    expect(readiness.preview.summary).toEqual({ enterpriseCount: 2, baselineEmploymentTotal: 150, periodEmploymentTotal: 145, netChange: -5 })
    await expect(api.create({ periodCode: code, acknowledgeMissing: false }, province)).rejects.toMatchObject({
      status: 409, data: { reasonCode: 'MISSING_ACKNOWLEDGEMENT' },
    })
    const { data: queued } = await api.create({ periodCode: code, acknowledgeMissing: true }, province)
    expect(queued).toMatchObject({ status: 'QUEUED', mode: 'MOCK', enterpriseCount: 2 })
    const frozen = (await api.detail(queued.batchId, province)).data
    expect(frozen.payloadSha256).toBe(createHash('sha256').update(JSON.stringify(frozen.payload)).digest('hex'))
    expect(frozen.payload.enterprises.map(row => row.reportId)).toEqual(['99101', '99102'])
    await expect(api.detail(queued.batchId, otherProvince)).rejects.toMatchObject({ status: 404 })
    await expect(api.create({ periodCode: code, acknowledgeMissing: true }, province)).rejects.toMatchObject({
      status: 409, data: { reasonCode: 'BATCH_EXISTS', existingBatchId: queued.batchId },
    })
    const mutation = { expectedVersion: 4, submissionVersion: 1, reason: '锁定验收' }
    await expect(mockManagementProvider.void('99101', mutation, province)).rejects.toMatchObject({
      status: 409, data: { reasonCode: 'LOCKED_BY_NATIONAL_BATCH' },
    })
    vi.setSystemTime(Date.now() + 450)
    expect((await api.detail(queued.batchId, province)).data.status).toBe('SENDING')
    await expect(api.retry(queued.batchId, province)).rejects.toMatchObject({ status: 409, data: { reasonCode: 'RETRY_NOT_ALLOWED' } })
    vi.setSystemTime(Date.now() + 1200)
    const failed = (await api.detail(queued.batchId, province)).data
    expect(failed).toMatchObject({ status: 'SEND_FAILED', attempts: [{ attemptNo: 1, result: 'FAILED' }], receipt: null })
    await expect(mockManagementProvider.correct('99101', { ...mutation, changes: { periodEmploymentCount: 92 } }, province))
      .rejects.toMatchObject({ status: 409, data: { reasonCode: 'LOCKED_BY_NATIONAL_BATCH' } })
    await api.retry(queued.batchId, province)
    await api.retry(queued.batchId, province)
    vi.setSystemTime(Date.now() + 1500)
    const accepted = (await api.detail(queued.batchId, province)).data
    expect(accepted).toMatchObject({ status: 'MOCK_ACCEPTED', retryCount: 1, payload: frozen.payload, payloadSha256: frozen.payloadSha256,
      receipt: { batchId: queued.batchId, acceptedEnterpriseCount: 2, payloadSha256: frozen.payloadSha256 },
      attempts: [{ attemptNo: 1, result: 'FAILED' }, { attemptNo: 2, result: 'ACCEPTED' }],
    })
    expect((await api.list({ status: 'MOCK_ACCEPTED', periodCode: code, page: 0, size: 20 }, province)).data.total).toBe(1)
    expect((await api.list({ page: 0, size: 20 }, otherProvince)).data.total).toBe(0)
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})

it('真实请求按 V1 发送，继续发送无正文并保留冲突数据', async () => {
  const fakeFetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ code: 'OK', message: '', data: {}, traceId: null })))
  fakeFetch.mockResolvedValueOnce(new Response(JSON.stringify({
    code: 'CONFLICT', message: '本期已有上报批次', traceId: null,
    data: { reasonCode: 'BATCH_EXISTS', existingBatchId: 'YN-P3-0001', blockers: [] },
  }), { status: 409 }))
  vi.stubGlobal('fetch', fakeFetch)
  try {
    const body = { periodCode: 'P3', acknowledgeMissing: true, enterpriseOrgId: '不发送', provinceOrgId: '不发送' }
    await expect(realNationalProvider.create(body, 'test-token')).rejects.toMatchObject({
      status: 409, data: { reasonCode: 'BATCH_EXISTS', existingBatchId: 'YN-P3-0001' },
    })
    await realNationalProvider.retry('YN-P3-0001', 'test-token')
    await realNationalProvider.list({ periodCode: 'P3', status: 'SEND_FAILED', page: 1, size: 20 }, 'test-token')
    expect(fakeFetch.mock.calls[0]).toEqual(['/api/v1/province/national/batches', expect.objectContaining({
      method: 'POST', body: '{"periodCode":"P3","acknowledgeMissing":true}', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    })])
    expect(fakeFetch.mock.calls[1]).toEqual(['/api/v1/province/national/batches/YN-P3-0001/retry', expect.objectContaining({ method: 'POST' })])
    expect(fakeFetch.mock.calls[1]![1].body).toBeUndefined()
    expect(fakeFetch.mock.calls[2]![0]).toBe('/api/v1/province/national/batches?periodCode=P3&status=SEND_FAILED&page=1&size=20')
  } finally { vi.unstubAllGlobals() }
})
