import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authProvider } from '@/services/auth'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/services/auth', () => ({
  authProvider: {
    login: vi.fn(),
    me: vi.fn(),
  },
}))

describe('登录状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('直接使用登录响应中的令牌和用户，不重复调用当前用户接口', async () => {
    vi.mocked(authProvider.login).mockResolvedValue({
      code: 'OK',
      message: '',
      data: {
        accessToken: 'test-token',
        expiresInSeconds: 7200,
        user: {
          id: '101',
          displayName: '演示企业用户',
          roleCode: 'ENTERPRISE',
          orgId: '301',
          orgName: '演示企业',
        },
      },
      traceId: 'test-trace-id',
    })

    const store = useAuthStore()
    await store.login({ username: 'demo_enterprise', password: 'test-password' })

    expect(store.token).toBe('test-token')
    expect(store.user?.roleCode).toBe('ENTERPRISE')
    expect(authProvider.me).not.toHaveBeenCalled()
  })
})
