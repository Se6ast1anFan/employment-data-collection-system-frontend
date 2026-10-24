import type { MenuItemConfig, RoleCode } from '@/types/api'

export const roleHomePaths: Record<RoleCode, string> = {
  ENTERPRISE: '/enterprise/home',
  CITY: '/city/home',
  PROVINCE: '/province/home',
}

export const roleNames: Record<RoleCode, string> = {
  ENTERPRISE: '企业用户',
  CITY: '市级用户',
  PROVINCE: '省级用户',
}

export const menusByRole: Record<RoleCode, MenuItemConfig[]> = {
  ENTERPRISE: [
    { label: '工作首页', path: '/enterprise/home' },
    { label: '企业基本信息', path: '/enterprise/profile' },
    { label: '备案状态', path: '/enterprise/filing' },
    { label: '数据填报', path: '/enterprise/report/new' },
    { label: '历史数据查询', path: '/enterprise/report/history' },
    { label: '通知浏览', path: '/enterprise/notices' },
  ],
  CITY: [
    { label: '工作首页', path: '/city/home' },
    { label: '辖区报表审核', path: '/city/reports' },
    { label: '通知浏览', path: '/city/notices' },
  ],
  PROVINCE: [
    { label: '工作首页', path: '/province/home' },
    { label: '创建企业账号', path: '/province/enterprise-accounts/new' },
    { label: '企业备案', path: '/province/filings' },
    { label: '调查期管理', path: '/province/periods' },
    { label: '报表管理', path: '/province/reports' },
    { label: '数据汇总', path: '/province/summary' },
    { label: '图表分析', path: '/province/analysis' },
    { label: '全省账号查询', path: '/province/accounts' },
    { label: '通知管理', path: '/province/notices' },
    { label: '用户管理', path: '/province/users' },
    { label: '角色管理', path: '/province/roles' },
    { label: '系统监控', path: '/province/monitor' },
    { label: '国家接口', path: '/integration' },
  ],
}

export function getMenusForRole(role: RoleCode): MenuItemConfig[] {
  return menusByRole[role]
}
