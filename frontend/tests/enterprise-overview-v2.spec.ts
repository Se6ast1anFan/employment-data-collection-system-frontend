import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import RoleHomeView from '@/views/RoleHomeView.vue'
import CoverageMeter from '@/components/CoverageMeter.vue'
import type { EnterpriseOverview, ProvinceOverview } from '@/types/revision'

const { mock, provinceMock } = vi.hoisted(() => ({ mock: vi.fn(), provinceMock: vi.fn() }))
vi.mock('@/services/revision', () => ({ revisionProvider: { enterpriseOverview: mock, provinceOverview: provinceMock } }))
vi.mock('@/services/report', () => ({ reportProvider: { periods: async () => ({ data: { items: [] } }) } }))

const period = { periodCode: 'P3', periodLabel: '第三期', deadlineAt: null, windowStatus: 'OPEN' } as const
const action = { label: '打开报表', route: '/enterprise/reports/P3', enabled: true }
const base: EnterpriseOverview = {
  selectedPeriod: null, filingStatus: 'PENDING', reportStatus: 'SUBMITTED_PROVINCE', currentStep: 'WAIT_FOR_REVIEW',
  latestReturnReason: '旧字段不驱动首页', nextAction: action, visibleNoticeCount: 0,
  homePeriod: period, homeReturnReason: null, homeNextAction: action, homeState: 'NOT_SAVED',
}

async function render(patch: Partial<EnterpriseOverview>) {
  mock.mockResolvedValue({ data: { ...base, ...patch } })
  const pinia = createPinia()
  useAuthStore(pinia).$patch({ token: 'v2-test', user: { id: '1', orgId: '1', displayName: '测试企业', orgName: '测试企业', roleCode: 'ENTERPRISE' } })
  const wrapper = mount(RoleHomeView, { global: { plugins: [pinia, ElementPlus], stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

it.each([
  ['NOT_SAVED', '未保存', '填写并保存草稿'],
  ['DRAFT_SAVED', '已保存草稿', '打开草稿并提交'],
  ['SUBMITTED', '已提交', '查看报表'],
  ['RETURNED', '被退回', '修改并重新提交'],
] as const)('企业首页只根据 V2 摘要显示 %s', async (state, text, label) => {
  const wrapper = await render({ homeState: state, homeReturnReason: '核对就业人数' })
  expect(wrapper.get('[role="status"]').text()).toBe(text)
  expect(wrapper.text()).not.toContain('待省级审核')
  expect(wrapper.text()).not.toContain('旧字段不驱动首页')
  expect(wrapper.text().includes('核对就业人数')).toBe(state === 'RETURNED')
  expect(wrapper.find('.filing-steps').exists()).toBe(false)
  expect(wrapper.findAllComponents(RouterLinkStub).find(link => link.text() === label)?.props('to'))
    .toEqual({ path: '/enterprise/report/new', query: { periodCode: 'P3' } })
  expect(mock).toHaveBeenLastCalledWith('', 'v2-test')
  wrapper.unmount()
})

it('无当前调查期时保留业务导航，隐藏禁用的本期操作', async () => {
  const wrapper = await render({ homePeriod: null, homeNextAction: { ...action, enabled: false } })
  expect(wrapper.text()).toContain('暂无当前调查期')
  expect(wrapper.find('.overview-primary').exists()).toBe(false)
  expect(wrapper.text()).toContain('数据填报与期次选择')
  wrapper.unmount()
})

it('真实已报进度排除代填，且零分母时不绘制进度条', async () => {
  const wrapper = mount(CoverageMeter, { props: { counts: { eligibleEnterpriseCount: 4, realSubmittedCount: 2,
    proxyCount: 1, notCoveredCount: 1, pendingCount: 1, returnedCount: 1 } } })
  expect(wrapper.get('progress').attributes('value')).toBe('2')
  expect(wrapper.get('progress').attributes('max')).toBe('4')
  expect(wrapper.text()).toContain('代填 1 / 4')
  await wrapper.setProps({ counts: { eligibleEnterpriseCount: 0, realSubmittedCount: 0, proxyCount: 0, notCoveredCount: 0, pendingCount: 0, returnedCount: 0 } })
  expect(wrapper.find('progress').exists()).toBe(false)
  expect(wrapper.text()).toBe('暂无应报企业')
})

it('省级首页可隐藏和恢复已报齐城市，代填、零应报和旧版数据仍显示', async () => {
  const city = { cityCode: '1', cityName: '已报齐市', eligibleEnterpriseCount: 2, realSubmittedCount: 2,
    submittedEnterpriseCount: 0, notSubmittedEnterpriseCount: 0, proxyCount: 0, notCoveredCount: 0, pendingCount: 2, returnedCount: 0 }
  const overview: ProvinceOverview = {
    selectedPeriod: period, pendingFilingCount: 0, pendingReportCount: 2, approvedReportCount: 0, entries: [],
    provinceTotals: { eligibleEnterpriseCount: 6, realSubmittedCount: 3, proxyCount: 1, notCoveredCount: 2, pendingCount: 2, returnedCount: 0 },
    cityProgress: { submittedCityCount: 1, notSubmittedCityCount: 3, items: [
      city,
      { ...city, cityCode: '2', cityName: '有代填市', realSubmittedCount: 1, proxyCount: 1 },
      { ...city, cityCode: '3', cityName: '零应报市', eligibleEnterpriseCount: 0, realSubmittedCount: 0 },
      { ...city, cityCode: '4', cityName: '旧口径市', realSubmittedCount: undefined, submittedEnterpriseCount: 2 },
    ] },
  }
  provinceMock.mockResolvedValue({ data: overview })
  const pinia = createPinia()
  useAuthStore(pinia).$patch({ token: 'v2-test', user: { id: '1', orgId: '1', displayName: '测试省级', orgName: '测试省级', roleCode: 'PROVINCE' } })
  const wrapper = mount(RoleHomeView, { global: { plugins: [pinia, ElementPlus], stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()

  const expand = wrapper.get('.city-progress-heading button')
  const details = wrapper.get('#province-city-progress')
  expect(expand.attributes('aria-expanded')).toBe('false')
  expect((details.element as HTMLElement).style.display).toBe('none')
  expect(wrapper.text()).toContain('真实已报 3 / 6')
  await expand.trigger('click')
  expect(expand.attributes('aria-expanded')).toBe('true')
  expect((details.element as HTMLElement).style.display).toBe('')

  const toggle = details.get('.city-progress-filter')
  expect(toggle.text()).toBe('隐藏已报齐城市（1）')
  expect(wrapper.text()).toContain('已报齐市')
  await toggle.trigger('click')
  expect(toggle.text()).toBe('显示已报齐城市（1）')
  expect(wrapper.text()).not.toContain('已报齐市')
  for (const name of ['有代填市', '零应报市', '旧口径市']) expect(wrapper.text()).toContain(name)
  expect(wrapper.text()).toContain('真实已报 3 / 6')
  await toggle.trigger('click')
  expect(wrapper.text()).toContain('已报齐市')
  await expand.trigger('click')
  expect((details.element as HTMLElement).style.display).toBe('none')
  wrapper.unmount()
})
