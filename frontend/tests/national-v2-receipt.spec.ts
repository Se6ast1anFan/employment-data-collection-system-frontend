import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import NationalReportView from '@/views/NationalReportView.vue'

const detail = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { batchId: 'batch-1' } }) }))
vi.mock('@/services/nationalV2', () => ({ getNationalV2: async () => ({
  detail,
  periods: async () => ({ data: { items: [] } }),
  list: async () => ({ data: { items: [], page: 0, total: 0 } }),
}) }))

it('V2 批次只有在接收状态和回执同时存在时才显示接收成功', async () => {
  const batch = { batchId: 'batch-1', payloadFormat: 'XML', attempts: [{ result: 'ACCEPTED' }] }
  const receipt = { mockReceiptId: 'receipt-1', acceptedEnterpriseCount: 1 }
  detail.mockResolvedValueOnce({ data: { ...batch, status: 'MOCK_ACCEPTED', receipt: null } })
    .mockResolvedValueOnce({ data: { ...batch, status: 'ASSEMBLING', receipt } })
    .mockResolvedValueOnce({ data: { ...batch, status: 'MOCK_ACCEPTED', receipt } })
  const wrapper = mount(NationalReportView, { global: { plugins: [createPinia(), ElementPlus], stubs: {
    ElDrawer: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
  } } })
  try {
    await flushPromises()
    const panel = wrapper.get('.batch-detail')
    const refresh = wrapper.findAll('button').find(button => button.text() === '刷新批次')!
    expect(panel.text()).toContain('回执待核对')
    expect(panel.text()).not.toContain('模拟国家后端已接收')

    await refresh.trigger('click')
    await flushPromises()
    expect(panel.text()).toContain('模拟端组装中')
    expect(panel.text()).not.toContain('receipt-1')

    await refresh.trigger('click')
    await flushPromises()
    expect(panel.text()).toContain('模拟国家后端已接收')
    expect(panel.text()).toContain('receipt-1')
  } finally {
    wrapper.unmount()
  }
})
