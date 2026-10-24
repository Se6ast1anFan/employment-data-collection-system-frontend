import { describe, expect, it } from 'vitest'

import { mockAuthProvider } from '@/mock/auth'
import { mockSystemProvider } from '@/mock/system'

describe('第一周系统接口 Mock', () => {
  it('健康检查符合契约', async () => {
    const response = await mockSystemProvider.health()
    expect(response.code).toBe('OK')
    expect(response.data.status).toBe('UP')
    expect(response.data.version).toBeTruthy()
  })

  it('地区列表要求 Bearer Token 并返回契约字段', async () => {
    const login = await mockAuthProvider.login({
      username: 'demo_province',
      password: 'Demo@123456',
    })
    const response = await mockSystemProvider.regions(undefined, login.data.accessToken)
    expect(response.data).toEqual([
      expect.objectContaining({ code: 'DEMO_P', name: '演示省', level: 1 }),
    ])

    const cities = await mockSystemProvider.regions('DEMO_P', login.data.accessToken)
    expect(cities.data).toEqual([
      expect.objectContaining({ code: 'DEMO_C', name: '演示市', level: 2 }),
    ])

    const districts = await mockSystemProvider.regions('DEMO_C', login.data.accessToken)
    expect(districts.data).toEqual([
      expect.objectContaining({ code: 'DEMO_D', name: '演示区县', level: 3 }),
    ])
  })
})
