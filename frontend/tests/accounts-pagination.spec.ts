import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { expect, it, vi } from 'vitest'
import ProvinceAccountsView from '@/views/ProvinceAccountsView.vue'

const mocks = vi.hoisted(() => ({ accounts: vi.fn(), periods: vi.fn() }))
vi.mock('@/services/management', () => ({ managementProvider: { accounts: mocks.accounts }, saveDownload: vi.fn() }))
vi.mock('@/services/report', () => ({ reportProvider: { periods: mocks.periods } }))

it('账号翻页等待响应期间保持总数和页码，第二页可返回第一页', async () => {
  setActivePinia(createPinia())
  mocks.periods.mockResolvedValue({ data: { items: [] } })
  mocks.accounts.mockResolvedValueOnce({ data: { items: [], total: 26 } })
  let finish!: (result: unknown) => void
  mocks.accounts.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  mocks.accounts.mockResolvedValueOnce({ data: { items: [], total: 26 } })
  const wrapper = mount(ProvinceAccountsView, {
    global: { plugins: [ElementPlus], stubs: { RegionPicker: true, ElTable: true, ElForm: true } },
  })
  await flushPromises()
  await wrapper.find('.btn-next').trigger('click')
  await flushPromises()
  expect(mocks.accounts.mock.calls[1]![0].page).toBe(1)
  expect(wrapper.find('.el-pager .is-active').text()).toBe('2')
  finish({ data: { items: [], total: 26 } })
  await flushPromises()
  expect(wrapper.find('.el-pager .is-active').text()).toBe('2')
  expect(wrapper.find('.btn-prev').attributes('disabled')).toBeUndefined()
  await wrapper.find('.btn-prev').trigger('click')
  await flushPromises()
  expect(mocks.accounts.mock.calls[2]![0].page).toBe(0)
  expect(wrapper.find('.el-pager .is-active').text()).toBe('1')
  wrapper.unmount()
})
