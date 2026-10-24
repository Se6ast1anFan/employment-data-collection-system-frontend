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
  page('/enterprise/report/new', 'ENTERPRISE', '就业数据填报', '填写建档期、调查期就业人数及减少原因。', [
    { label: '保存草稿', week: 3 },
    { label: '提交报表', week: 3 },
  ]),
  page('/enterprise/report/history', 'ENTERPRISE', '历史数据查询', '仅浏览本企业以往调查期的数据状态，不提供导出。', [
    { label: '查询', week: 3 },
    { label: '查看详情', week: 3 },
  ]),
  page('/enterprise/notices', 'ENTERPRISE', '通知浏览', '查看有权限浏览的上级通知。', [
    { label: '查看通知', week: 6 },
  ]),
  page('/city/reports', 'CITY', '辖区报表审核', '查看辖区企业报表并完成市级审核。', [
    { label: '查看', week: 4 },
    { label: '通过', week: 4 },
    { label: '退回', week: 4 },
  ]),
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
  page('/province/periods', 'PROVINCE', '调查期管理', '维护调查期及开放时间。', [
    { label: '新增', week: 3 },
    { label: '修改', week: 3 },
    { label: '开放', week: 3 },
    { label: '关闭', week: 3 },
  ]),
  page('/province/reports', 'PROVINCE', '报表管理', '处理省级报表审核、修订和历史数据。', [
    { label: '查看', week: 4 },
    { label: '确认', week: 4 },
    { label: '退回', week: 4 },
    { label: '修订', week: 5 },
    { label: '删除历史记录', week: 5 },
  ]),
  page('/province/summary', 'PROVINCE', '数据汇总', '按调查期查看汇总指标和导出结果。', [
    { label: '统计', week: 5 },
    { label: '导出', week: 5 },
  ]),
  page('/province/analysis', 'PROVINCE', '图表分析', '展示取样、两期对比和连续趋势分析。', [
    { label: '取样分析', week: 6 },
    { label: '对比分析', week: 6 },
    { label: '趋势分析', week: 6 },
  ]),
  page('/province/accounts', 'PROVINCE', '全省账号查询', '按原始需求中的查询条件检索并导出账号数据。', [
    { label: '查询', week: 5 },
    { label: '清除条件', week: 5 },
    { label: '导出', week: 5 },
  ]),
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
