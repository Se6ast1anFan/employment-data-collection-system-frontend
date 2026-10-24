import { describe, expect, it } from 'vitest'

import { getMenusForRole } from '@/config/navigation'
import { canAccess } from '@/router/access'

describe('角色权限与菜单', () => {
  it('三种角色只能通过各自允许的路由', () => {
    expect(canAccess(['ENTERPRISE'], 'ENTERPRISE')).toBe(true)
    expect(canAccess(['ENTERPRISE'], 'CITY')).toBe(false)
    expect(canAccess(['PROVINCE'], 'PROVINCE')).toBe(true)
    expect(canAccess(['PROVINCE'], undefined)).toBe(false)
  })

  it('企业历史页面不存在导出入口', () => {
    const enterprisePaths = getMenusForRole('ENTERPRISE').map((item) => item.path)
    expect(enterprisePaths).toContain('/enterprise/report/history')
    expect(enterprisePaths).not.toContain('/province/accounts')
  })

  it('市级菜单包含审核与通知浏览，不包含通知发布', () => {
    const cityPaths = getMenusForRole('CITY').map((item) => item.path)
    expect(cityPaths).toEqual(['/city/home', '/city/reports', '/city/notices'])
    expect(cityPaths).not.toContain('/province/notices')
  })

  it('第二周备案入口只分配给对应角色', () => {
    const enterprisePaths = getMenusForRole('ENTERPRISE').map((item) => item.path)
    const provincePaths = getMenusForRole('PROVINCE').map((item) => item.path)
    const cityPaths = getMenusForRole('CITY').map((item) => item.path)
    expect(enterprisePaths).toContain('/enterprise/filing')
    expect(provincePaths).toContain('/province/enterprise-accounts/new')
    expect(provincePaths).toContain('/province/filings')
    expect(cityPaths).not.toContain('/province/filings')
  })
})
