import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ElementPlus, { ElSelect } from 'element-plus'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import RoleHomeView from '@/views/RoleHomeView.vue'
import type { EnterpriseOverview } from '@/types/revision'

const mocks = vi.hoisted(() => ({ overview: vi.fn(), periods: vi.fn() }))
vi.mock('@/services/revision', () => ({ revisionProvider: { enterpriseOverview: mocks.overview } }))
vi.mock('@/services/report', () => ({ reportProvider: { enterprisePeriods: mocks.periods } }))

const period = { periodCode: 'P3', periodLabel: '第三期', deadlineAt: null, windowStatus: 'OPEN' } as const
const response: EnterpriseOverview = {
  selectedPeriod: period,
  filingStatus: 'APPROVED',
  reportStatus: 'SUBMITTED_PROVINCE',
  currentStep: 'WAIT_FOR_REVIEW',
  latestReturnReason: null,
  nextAction: { label: '查看报表', route: '/enterprise/reports/P3', enabled: true },
  visibleNoticeCount: 0,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.periods.mockResolvedValue({ data: { items: [{ code: 'P3', label: '第三期', legacy: false }] } })
})

async function renderOverview() {
  const pinia = createPinia()
  useAuthStore(pinia).$patch({
    token: 'd01-test-token',
    user: { id: '1', orgId: '1', displayName: '测试企业', orgName: '测试企业', roleCode: 'ENTERPRISE' },
  })
  const wrapper = mount(RoleHomeView, { global: { plugins: [pinia, ElementPlus], stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

it('选择 P3 时带期次查询，显示第六步待省审，查看报表只出现在操作链接', async () => {
  mocks.overview.mockResolvedValueOnce({ data: { ...response, selectedPeriod: null, reportStatus: null, currentStep: 'WAIT_FOR_PERIOD' } })
    .mockResolvedValueOnce({ data: response })
  const wrapper = await renderOverview()
  const select = wrapper.getComponent(ElSelect)
  select.vm.$emit('update:modelValue', 'P3')
  select.vm.$emit('change', 'P3')
  await flushPromises()
  expect(mocks.overview).toHaveBeenLastCalledWith('P3', 'd01-test-token')
  expect(wrapper.findAll('.el-step')).toHaveLength(6)
  expect(wrapper.findAll('.el-step__title.is-process').map(node => node.text())).toEqual(['省级审核'])
  expect(wrapper.get('[role="status"]').text()).toContain('第 6 步 · 待省级审核')
  expect(wrapper.findAllComponents(RouterLinkStub).find(link => link.text() === '查看报表')?.props('to'))
    .toEqual({ path: '/enterprise/report/new', query: { periodCode: 'P3' } })
  wrapper.unmount()
})

it.each([
  { patch: { filingStatus: 'PENDING', selectedPeriod: null }, title: '备案', label: '待备案或备案未通过' },
  { patch: { selectedPeriod: null }, title: '选择调查期', label: '待选择调查期' },
  { patch: { reportStatus: null }, title: '保存报表', label: '待保存报表' },
  { patch: { reportStatus: 'DRAFT' }, title: '提交报表', label: '草稿待提交' },
  { patch: { reportStatus: 'RETURNED_CITY', latestReturnReason: '请核对人数' }, title: '提交报表', label: '市级退回，待修改并重新提交' },
  { patch: { reportStatus: 'RETURNED_PROVINCE', latestReturnReason: '请核对人数' }, title: '提交报表', label: '省级退回，待修改并重新提交' },
  { patch: { reportStatus: 'SUBMITTED_CITY' }, title: '市级审核', label: '待市级审核' },
])('以业务字段定位 $label', async ({ patch, title, label }) => {
  mocks.overview.mockResolvedValue({ data: { ...response, ...patch } })
  const wrapper = await renderOverview()
  expect(wrapper.findAll('.el-step')).toHaveLength(6)
  expect(wrapper.findAll('.el-step__title.is-process').map(node => node.text())).toEqual([title])
  expect(wrapper.get('[role="status"]').text()).toContain(label)
  if ('latestReturnReason' in patch) {
    expect(wrapper.text()).toContain(patch.latestReturnReason)
    expect(wrapper.findAllComponents(RouterLinkStub).some(link => link.text() === '查看报表')).toBe(true)
  }
  wrapper.unmount()
})

it('省审通过后六步全部完成，即使摘要仍是 WAIT_FOR_REVIEW', async () => {
  mocks.overview.mockResolvedValue({ data: { ...response, reportStatus: 'APPROVED_PROVINCE' } })
  const wrapper = await renderOverview()
  expect(wrapper.findAll('.el-step__title.is-success')).toHaveLength(6)
  expect(wrapper.get('[role="status"]').text()).toContain('省级审核通过，六步完成')
  wrapper.unmount()
})

it('请求失败或收到未知状态时保留六步图并显示说明', async () => {
  mocks.overview.mockRejectedValueOnce(new Error('概览暂不可用'))
    .mockResolvedValueOnce({ data: { ...response, reportStatus: 'UNRECOGNIZED' } })
  const wrapper = await renderOverview()
  expect(wrapper.text()).toContain('概览暂不可用')
  expect(wrapper.get('[role="status"]').text()).toBe('填报进度读取失败')
  expect(wrapper.findAll('.el-step')).toHaveLength(6)
  await wrapper.findAll('button').find(button => button.text() === '刷新概览')!.trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.el-step__title.is-wait')).toHaveLength(6)
  expect(wrapper.get('[role="status"]').text()).toBe('本期报表状态暂无法识别')
  wrapper.unmount()
})
