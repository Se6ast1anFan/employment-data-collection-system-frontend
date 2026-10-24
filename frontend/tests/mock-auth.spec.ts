import { describe, expect, it } from 'vitest'

import { MockAuthError, mockAuthProvider } from '@/mock/auth'

describe('Mock 登录', () => {
  it.each([
    ['demo_enterprise', 'ENTERPRISE'],
    ['demo_city', 'CITY'],
    ['demo_province', 'PROVINCE'],
  ] as const)('%s 登录后返回正确角色', async (username, role) => {
    const result = await mockAuthProvider.login({ username, password: 'Demo@123456' })
    expect(result.code).toBe('OK')
    expect(result.data.user.roleCode).toBe(role)
    const current = await mockAuthProvider.me(result.data.accessToken)
    expect(current.data.user.roleCode).toBe(role)
  })

  it('错误密码返回 401', async () => {
    await expect(mockAuthProvider.login({ username: 'demo_city', password: 'wrong' })).rejects.toEqual(
      expect.objectContaining<Partial<MockAuthError>>({ status: 401, message: '账号或密码错误' }),
    )
  })
})
