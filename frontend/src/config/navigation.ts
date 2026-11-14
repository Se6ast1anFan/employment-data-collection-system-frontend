import type { MenuItemConfig, RoleCode } from '@/types/api'

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
    { label: '待上报报表', path: '/enterprise/report/batch' },
    { label: '历史数据查询', path: '/enterprise/report/history' },
    { label: '通知浏览', path: '/enterprise/notices' },
  ],
  CITY: [
    { label: '工作首页', path: '/city/home' },
    { label: '辖区报表审核', path: '/city/reports' },
    { label: '通知管理', path: '/city/notices' },
  ],
  PROVINCE: [
    { label: '工作首页', path: '/province/home' },
    { label: '创建企业账号', path: '/province/enterprise-accounts/new' },
    { label: '企业备案', path: '/province/filings' },
    { label: '调查期管理', path: '/province/periods' },
    { label: '报表管理', path: '/province/reports' },
    { label: '数据汇总', path: '/province/summary' },
    { label: '图表分析', path: '/province/analysis' },
    { label: '多维分析', path: '/province/olap' },
    { label: '全省账号查询', path: '/province/accounts' },
    { label: '企业进度查询', path: '/province/enterprise-progress' },
    { label: '通知管理', path: '/province/notices' },
    { label: '用户管理', path: '/province/users' },
    { label: '角色与权限', path: '/province/roles' },
    { label: '系统监控', path: '/province/monitor' },
    { label: '国家上报', path: '/province/national' },
  ],
}

export function getMenusForRole(role: RoleCode): MenuItemConfig[] {
  return menusByRole[role]
}

export const pagePermissions: Record<string, string> = {
  '/enterprise/home': 'ENTERPRISE.OVERVIEW.READ',
  '/enterprise/profile': 'ENTERPRISE.FILING.READ',
  '/enterprise/filing': 'ENTERPRISE.FILING.READ',
  '/enterprise/report/new': 'ENTERPRISE.REPORT.READ',
  '/enterprise/report/batch': 'ENTERPRISE.REPORT.READ',
  '/enterprise/report/history': 'ENTERPRISE.REPORT.READ',
  '/enterprise/notices': 'ENTERPRISE.NOTICE.READ',
  '/city/home': 'CITY.OVERVIEW.READ',
  '/city/reports': 'CITY.REPORT.READ',
  '/city/notices': 'CITY.NOTICE.READ',
  '/province/home': 'PROVINCE.OVERVIEW.READ',
  '/province/enterprise-accounts/new': 'PROVINCE.ENTERPRISE_ACCOUNT.CREATE',
  '/province/filings': 'PROVINCE.FILING.READ',
  '/province/periods': 'PROVINCE.PERIOD.READ',
  '/province/reports': 'PROVINCE.REPORT.READ',
  '/province/summary': 'PROVINCE.DATA.READ',
  '/province/data/reports/:reportId': 'PROVINCE.DATA.READ',
  '/province/analysis': 'PROVINCE.ANALYSIS.READ',
  '/province/olap': 'PROVINCE.ANALYSIS.READ',
  '/province/accounts': 'PROVINCE.ACCOUNT.READ',
  '/province/enterprise-progress': 'PROVINCE.OVERVIEW.READ',
  '/province/notices': 'PROVINCE.NOTICE.READ',
  '/province/users': 'PROVINCE.USER.READ',
  '/province/roles': 'PROVINCE.ROLE.READ',
  '/province/monitor': 'PROVINCE.MONITOR.READ',
  '/province/national': 'PROVINCE.NATIONAL.READ',
}

export function landingPath(role: RoleCode, can: (permission: string) => boolean) {
  return getMenusForRole(role).find(item => can(pagePermissions[item.path]))?.path ?? '/403'
}
