import { afterEach, expect, it, vi } from 'vitest'
import { mockAuthProvider } from '@/mock/auth'
import { mockAdmin } from '@/mock/admin'
import { realAdmin } from '@/services/admin'

const password = 'TestAccount123!'

afterEach(() => vi.unstubAllGlobals())

it('保留最后管理员，限制同级角色，替代删除更新权限并使重置前令牌失效', async () => {
  const { data: admin } = await mockAuthProvider.login({ username: 'demo_province', password: 'Demo@123456' })
  const token = admin.accessToken
  const { data: original } = await mockAdmin.user(admin.user.id, token)
  await expect(mockAdmin.status(original.id, false, original.version, token)).rejects.toMatchObject({ data: { reasonCode: 'LAST_ADMIN' } })
  const { data: role } = await mockAdmin.createRole({ name: '监控测试', level: 'PROVINCE', permissionCodes: ['PROVINCE.MONITOR.READ'] }, token)
  const { data: originalRoles } = await mockAdmin.roles({ level: 'PROVINCE' }, token)
  const replacement = originalRoles.items.find(item => item.systemProtected)!
  await expect(mockAdmin.deleteRole(replacement.id, replacement.version, undefined, token)).rejects.toMatchObject({ data: { reasonCode: 'PROTECTED_ROLE' } })
  const account = { orgId: original.org.id, username: 'admin_test_operator', displayName: '演示账号', initialPassword: password }
  await expect(mockAdmin.createUser({ ...account, functionalRoleIds: ['9001'] }, token)).rejects.toMatchObject({ data: { reasonCode: 'ROLE_LEVEL_MISMATCH' } })
  const { data: user } = await mockAdmin.createUser({ ...account, functionalRoleIds: [role.id] }, token)
  const { data: limited } = await mockAuthProvider.login({ username: account.username, password })
  expect((await mockAuthProvider.me(limited.accessToken)).data.user.permissions).toEqual(['PROVINCE.MONITOR.READ'])
  await expect(mockAdmin.users({}, limited.accessToken)).rejects.toMatchObject({ status: 403 })
  expect((await mockAdmin.monitor(limited.accessToken)).data.nationalReceiver.status).toBe('UNKNOWN')
  await expect(mockAdmin.deleteRole(role.id, role.version, undefined, token)).rejects.toMatchObject({ data: { reasonCode: 'ROLE_REPLACEMENT_REQUIRED' } })
  expect((await mockAdmin.deleteRole(role.id, role.version, replacement.id, token)).data.affectedUserCount).toBe(1)
  const { data: updated } = await mockAdmin.user(user.id, token)
  expect(updated.functionalRoles.map(item => item.id)).toEqual([replacement.id])
  expect(updated.version).toBe(user.version + 1)
  await expect(mockAdmin.reset(user.id, password, user.version, token)).rejects.toMatchObject({ data: { reasonCode: 'VERSION_CONFLICT' } })
  await mockAdmin.reset(user.id, 'NewPassword123!', updated.version, token)
  await expect(mockAuthProvider.me(limited.accessToken)).rejects.toMatchObject({ status: 401 })
  await expect(mockAuthProvider.login({ username: account.username, password })).rejects.toMatchObject({ status: 401 })
})

it('真实管理接口保留布尔筛选、预期版本与无替代角色的请求形状', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ code: 'OK', message: '', data: {}, traceId: 'test' })))
  vi.stubGlobal('fetch', fetch)
  await realAdmin.users({ enabled: false, page: 0 }, 'token')
  await realAdmin.deleteUser('123', 4, 'token')
  await realAdmin.deleteRole('234', 7, undefined, 'token')
  expect(fetch.mock.calls).toEqual([
    ['/api/v1/province/admin/users?enabled=false&page=0', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) })],
    ['/api/v1/province/admin/users/123', expect.objectContaining({ method: 'DELETE', body: '{"expectedVersion":4}' })],
    ['/api/v1/province/admin/roles/234/replace-and-delete', expect.objectContaining({ method: 'POST', body: '{"expectedVersion":7}' })],
  ])
})
