import { afterEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { mockAuthProvider } from '@/mock/auth'
import { createMockNationalV2 } from '@/mock/nationalV2'
import { v2BlockedPeriod, v2ReadyPeriod } from '@/mock/midtermFixtures'
import { mockManagementProvider } from '@/mock/management'
import { mockRevisionProvider } from '@/mock/revision'
import { managementMockState as state } from '@/mock/report'
import { previewYear, createYear } from '@/mock/periodYear'
import { realNationalV2 } from '@/services/nationalV2'
import { hasFrozenRealReport } from '@/utils/national'

const login = async (role: string) => (await mockAuthProvider.login({ username: 'demo_' + role, password: 'Demo@123456' })).data.accessToken
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('全年预览验证闰年、跨年、幂等、冲突全无新增和角色权限', async () => {
  const [province, city] = await Promise.all([login('province'), login('city')])
  const preview = previewYear(2040, province)
  expect(preview.months).toHaveLength(12)
  expect(preview.months[1]).toMatchObject({ periodCode: 'P204002', startAt: '2040-01-31T16:00:00.000Z', endExclusiveAt: '2040-02-29T16:00:00.000Z' })
  expect(preview.months[11]).toMatchObject({ openAt: '2040-12-31T16:00:00.000Z', closeAt: '2041-01-07T16:00:00.000Z' })
  expect(createYear(2040, province).created).toHaveLength(12)
  expect(createYear(2040, province).existing).toHaveLength(12)
  state.periods.push({ ...state.periods.find(row => row.code === 'P204001')!, code: 'P204101' })
  expect(() => createYear(2041, province)).toThrow('未新增任何期次')
  expect(state.periods.filter(row => row.code.startsWith('P2041'))).toHaveLength(1)
  expect(() => previewYear(2040, city)).toThrow('无权')
})

it('V2 无来源不写入，补齐后锁定真实报表，失败后使用原 XML 和哈希重试', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const [province, city] = await Promise.all([login('province'), login('city')])
  const api = createMockNationalV2(attempt => attempt === 1)
  await api.periods(province)
  const blocked = (await api.readiness(v2BlockedPeriod, province)).data
  expect(blocked.noRealSource).toHaveLength(1)
  await expect(api.generate(v2BlockedPeriod, blocked.proxyVersion, province)).rejects.toMatchObject({ status: 409, data: { reasonCode: 'NO_REAL_SOURCE' } })
  expect((await api.readiness(v2BlockedPeriod, province)).data.proxyVersion).toBe(blocked.proxyVersion)
  await expect(api.readiness(v2ReadyPeriod, city)).rejects.toMatchObject({ status: 403 })
  const before = (await api.readiness(v2ReadyPeriod, province)).data
  expect(before.counts).toMatchObject({ eligibleCount: 4, realCount: 2, missingCount: 2 })
  await expect(api.create(v2ReadyPeriod, province)).rejects.toMatchObject({ status: 409 })
  const filled = (await api.generate(v2ReadyPeriod, before.proxyVersion, province)).data
  expect(filled.items).toHaveLength(2)
  expect(filled.items.every(item => item.periodEmploymentCount === item.baselineEmploymentCount && item.netChange === 0)).toBe(true)
  const cover = (await mockRevisionProvider.progress({ periodCode: v2ReadyPeriod, cityCode: '530100', page: 0, size: 20 }, province)).data
  expect(cover.coverageSummary).toMatchObject({ eligibleEnterpriseCount: 2, realSubmittedCount: 1, proxyCount: 1 })
  const overview = (await mockRevisionProvider.provinceOverview(v2ReadyPeriod, province)).data
  expect(overview.cityProgress.items.map(row => row.cityCode).sort()).toEqual(['530100', '530300'])
  await expect(api.revoke(v2ReadyPeriod, before.proxyVersion, province)).rejects.toMatchObject({ status: 409, data: { reasonCode: 'VERSION_CONFLICT' } })
  const revoked = (await api.revoke(v2ReadyPeriod, filled.proxyVersion, province)).data
  expect(revoked.removedCount).toBe(2)
  const regenerated = (await api.generate(v2ReadyPeriod, revoked.proxyVersion, province)).data
  vi.useFakeTimers({ toFake: ['Date'] })
  const queued = (await api.create(v2ReadyPeriod, province)).data
  const frozen = (await api.detail(queued.batchId, province)).data
  const xml = new DOMParser().parseFromString(frozen.payloadXml!, 'application/xml')
  expect(xml.querySelectorAll('Enterprise[reportMode="REAL"]')).toHaveLength(2)
  expect(xml.querySelectorAll('Enterprise[reportMode="PROXY"]')).toHaveLength(2)
  expect(xml.querySelector('Cities')).toBeNull()
  expect(hasFrozenRealReport(frozen, before.realEnterprises[0]!.reportId)).toBe(true)
  expect(hasFrozenRealReport(frozen, filled.items[0]!.sourceReportId)).toBe(false)
  expect(frozen.chunkProgress!.chunkCount).toBeGreaterThan(1)
  await expect(api.revoke(v2ReadyPeriod, regenerated.proxyVersion, province)).rejects.toMatchObject({ status: 409 })
  await expect(mockManagementProvider.void(before.realEnterprises[0]!.reportId, { expectedVersion: 4, submissionVersion: 1, reason: '测试' }, province))
    .rejects.toMatchObject({ status: 409, data: { reasonCode: 'LOCKED_BY_NATIONAL_BATCH' } })
  vi.setSystemTime(Date.now() + 2000)
  expect((await api.detail(queued.batchId, province)).data.status).toBe('SEND_FAILED')
  await api.retry(queued.batchId, province)
  vi.setSystemTime(Date.now() + 4000)
  const done = (await api.detail(queued.batchId, province)).data
  expect(done).toMatchObject({ status: 'MOCK_ACCEPTED', payloadXml: frozen.payloadXml, payloadSha256: frozen.payloadSha256, retryCount: 1,
    receipt: { payloadSha256: frozen.payloadSha256, realCount: 2, proxyCount: 2 } })
  const history = (await api.list({ page: 0, size: 20 }, province)).data
  const v1 = history.items.find(row => row.payloadFormat === 'JSON')!
  expect((await api.detail(v1.batchId, province)).data.payload?.schemaVersion).toBe('demo-1')
  await expect(api.retry(v1.batchId, province)).rejects.toMatchObject({ status: 409, data: { reasonCode: 'V1_READ_ONLY' } })
})

it('真实 V2 请求只提交约定字段，撤销与重试无正文', async () => {
  const fetcher = vi.fn(async (_path: string, _options: RequestInit) => new Response(JSON.stringify({ code: 'OK', message: '', traceId: '', data: {} })))
  vi.stubGlobal('fetch', fetcher)
  await realNationalV2.generate('P204001', 2, 'token')
  await realNationalV2.revoke('P204001', 3, 'token')
  await realNationalV2.create('P204001', 'token')
  await realNationalV2.retry('batch-1', 'token')
  expect(fetcher.mock.calls.map(([path, options]) => [path, options.method, options.body])).toEqual([
    ['/api/v1/province/national/periods/P204001/proxy-fill', 'POST', '{"expectedVersion":2}'],
    ['/api/v1/province/national/periods/P204001/proxy-fill?expectedVersion=3', 'DELETE', undefined],
    ['/api/v1/province/national/batches', 'POST', '{"periodCode":"P204001","schemaVersion":"demo-2"}'],
    ['/api/v1/province/national/batches/batch-1/retry', 'POST', undefined],
  ])
})
