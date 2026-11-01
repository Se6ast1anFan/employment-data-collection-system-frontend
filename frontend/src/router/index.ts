import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { roleHomePaths } from '@/config/navigation'
import { canAccess } from '@/router/access'
import { useAuthStore } from '@/stores/auth'
import type { PlaceholderPageConfig, RoleCode } from '@/types/api'

const page = (
  path: string,
  role: RoleCode,
  title: string,
  description: string,
  actions: PlaceholderPageConfig['actions'],
): RouteRecordRaw => ({
  path,
  component: () => import('@/views/PlaceholderView.vue'),
  meta: {
    title,
    requiresAuth: true,
    roles: [role],
    pageConfig: { title, description, actions },
  },
})

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
  { path: '/home', component: () => import('@/views/EmptyView.vue'), meta: { requiresAuth: true } },
  {
    path: '/enterprise/home',
    component: () => import('@/views/RoleHomeView.vue'),
    meta: { title: '企业工作台', requiresAuth: true, roles: ['ENTERPRISE'] },
  },
  {
    path: '/city/home',
    component: () => import('@/views/RoleHomeView.vue'),
    meta: { title: '市级工作台', requiresAuth: true, roles: ['CITY'] },
  },
  {
    path: '/province/home',
    component: () => import('@/views/RoleHomeView.vue'),
    meta: { title: '省级工作台', requiresAuth: true, roles: ['PROVINCE'] },
  },
  {
    path: '/enterprise/profile',
    component: () => import('@/views/EnterpriseProfileView.vue'),
    meta: { title: '企业基本信息', requiresAuth: true, roles: ['ENTERPRISE'] },
  },
  {
    path: '/enterprise/filing',
    component: () => import('@/views/EnterpriseFilingView.vue'),
    meta: { title: '备案状态', requiresAuth: true, roles: ['ENTERPRISE'] },
  },
  { path: '/enterprise/report/new', component: () => import('@/views/EnterpriseReportsView.vue'), meta: { title: '就业数据填报', requiresAuth: true, roles: ['ENTERPRISE'] } },
  { path: '/enterprise/report/history', component: () => import('@/views/EnterpriseReportsView.vue'), meta: { title: '历史数据查询', requiresAuth: true, roles: ['ENTERPRISE'] } },
  page('/enterprise/notices', 'ENTERPRISE', '通知浏览', '查看有权限浏览的上级通知。', [
    { label: '查看通知', week: 6 },
  ]),
  { path: '/city/reports', component: () => import('@/views/ReviewReportsView.vue'), meta: { title: '辖区报表审核', requiresAuth: true, roles: ['CITY'] } },
  page('/city/notices', 'CITY', '通知浏览', '按组织层级查看有权限浏览的上级通知。', [
    { label: '查看通知', week: 6 },
  ]),
  {
    path: '/province/enterprise-accounts/new',
    component: () => import('@/views/ProvinceAccountCreateView.vue'),
    meta: { title: '创建企业账号', requiresAuth: true, roles: ['PROVINCE'] },
  },
  {
    path: '/province/filings',
    component: () => import('@/views/ProvinceFilingsView.vue'),
    meta: { title: '企业备案', requiresAuth: true, roles: ['PROVINCE'] },
  },
  { path: '/province/periods', component: () => import('@/views/ProvincePeriodsView.vue'), meta: { title: '调查期管理', requiresAuth: true, roles: ['PROVINCE'] } },
  { path: '/province/reports', component: () => import('@/views/ReviewReportsView.vue'), meta: { title: '省级报表审核', requiresAuth: true, roles: ['PROVINCE'] } },
  { path: '/province/summary', component: () => import('@/views/ProvinceSummaryView.vue'), meta: { title: '数据汇总', requiresAuth: true, roles: ['PROVINCE'] } },
  { path: '/province/data/reports/:reportId', component: () => import('@/views/ProvinceCorrectionView.vue'), meta: { title: '修订与追溯', requiresAuth: true, roles: ['PROVINCE'] } },
  page('/province/analysis', 'PROVINCE', '图表分析', '展示取样、两期对比和连续趋势分析。', [
    { label: '取样分析', week: 6 },
    { label: '对比分析', week: 6 },
    { label: '趋势分析', week: 6 },
  ]),
  { path: '/province/accounts', component: () => import('@/views/ProvinceAccountsView.vue'), meta: { title: '全省账号查询', requiresAuth: true, roles: ['PROVINCE'] } },
  page('/province/notices', 'PROVINCE', '通知管理', '由省级用户发布、修改和删除通知。', [
    { label: '新建', week: 6 },
    { label: '发布', week: 6 },
    { label: '修改', week: 6 },
    { label: '删除', week: 6 },
  ]),
  page('/province/users', 'PROVINCE', '用户管理', '管理省级、市级和企业账号及角色分配。', [
    { label: '新增', week: 7 },
    { label: '修改', week: 7 },
    { label: '删除', week: 7 },
  ]),
  page('/province/roles', 'PROVINCE', '角色管理', '定义角色并配置功能权限。', [
    { label: '新增', week: 7 },
    { label: '修改', week: 7 },
    { label: '删除', week: 7 },
    { label: '授权', week: 7 },
  ]),
  page('/province/monitor', 'PROVINCE', '系统监控', '查看 CPU、内存、磁盘及应用运行情况。', [
    { label: '刷新监控', week: 7 },
  ]),
  page('/integration', 'PROVINCE', '国家接口', '查看数据交换批次、回执和失败重试状态。', [
    { label: '生成批次', week: 7 },
    { label: '发送', week: 7 },
    { label: '查询回执', week: 7 },
    { label: '重试', week: 7 },
  ]),
  { path: '/403', component: () => import('@/views/ForbiddenView.vue'), meta: { title: '无权限' } },
  { path: '/404', component: () => import('@/views/NotFoundView.vue'), meta: { title: '页面不存在' } },
  { path: '/:pathMatch(.*)*', redirect: '/404' },
]

export const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to) => {
  const auth = useAuthStore()
  const role = auth.user?.roleCode
  if (to.path === '/login' && auth.isAuthenticated && role) return roleHomePaths[role]
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/home' && role) return roleHomePaths[role]
  if (!canAccess(to.meta.roles, role)) return '/403'
  document.title = `${to.meta.title || '工作台'} - 云南省企业就业失业数据采集系统`
  return true
})
