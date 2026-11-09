import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AnalysisChart from '@/components/AnalysisChart.vue'
import CityShareChart from '@/components/CityShareChart.vue'
import type { CitiesAnalysis } from '@/types/week6'

describe('第六周实际图表渲染', () => {
  it('柱图和折线的图例与提示保留完整调查期名称', async () => {
    const label = '重点企业就业监测一月份第一轮调查'
    const wrapper = mount(AnalysisChart, { props: { title: '岗位人数', unit: '人', mode: 'bar',
      points: [{ label, value: 100 }, { label: '二月份补充调查', value: 120 }] } })
    expect(wrapper.get('.chart-legend').text()).toContain(label)
    expect(wrapper.get('rect title').text()).toContain(label)
    expect(wrapper.get('rect').attributes('fill')).toBe('#176781')
    await wrapper.setProps({ mode: 'line' })
    expect(wrapper.get('circle title').text()).toContain(label)
    const line = wrapper.get('polyline')
    expect(line.attributes('stroke')).toBe('#176781')
    expect(line.attributes('fill')).toBe('none')
    expect(line.attributes('points')?.split(' ')).toHaveLength(2)
  })

  it('折线遇 null 断开，负数柱位于零线下方，切换方式保持原值', async () => {
    const wrapper = mount(AnalysisChart, {
      props: {
        title: '变化占比', unit: '%', mode: 'line',
        points: [{ label: '一期', value: -15 }, { label: '二期', value: null }, { label: '三期', value: 10 }],
      },
    })
    expect(wrapper.findAll('polyline')).toHaveLength(0)
    expect(wrapper.findAll('circle')).toHaveLength(2)
    expect(wrapper.text()).toContain('没有相邻的有效数据，只显示数据点')
    expect(wrapper.text()).toContain('-15%')
    expect(wrapper.text()).toContain('—')
    await wrapper.setProps({ mode: 'bar' })
    expect(wrapper.findAll('polyline')).toHaveLength(0)
    const bars = wrapper.findAll('rect')
    expect(bars).toHaveLength(2)
    expect(bars.map(bar => bar.attributes('fill'))).toEqual(['#a13837', '#176781'])
    const zero = Number(wrapper.findAll('svg > line')[0]!.attributes('y1'))
    expect(Number(bars[0]!.attributes('y'))).toBe(zero)
    expect(Number(bars[0]!.attributes('height'))).toBeGreaterThan(0)
    expect(Number(bars[1]!.attributes('y'))).toBeLessThan(zero)
    expect(wrapper.text()).toContain('-15%')
    wrapper.unmount()
  })

  it('饼图使用响应里的城市数量和占比，零样本不绘制', async () => {
    const data: CitiesAnalysis = {
      periodCode: 'A', periodLabel: '一期', regionCode: null,
      sampleRule: 'APPROVED_PROVINCE_NOT_VOIDED_LATEST_SUBMISSION_EFFECTIVE_VALUES',
      totalEnterpriseCount: 2, empty: false,
      cities: [
        { cityOrgId: '1', cityName: '甲市', cityRegionCode: 'C1', enterpriseCount: 1, sharePercent: 50 },
        { cityOrgId: '2', cityName: '乙市', cityRegionCode: 'C2', enterpriseCount: 1, sharePercent: 50 },
      ],
    }
    const wrapper = mount(CityShareChart, { props: { data } })
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.text()).toContain('甲市：1 家 · 50.00%')
    expect(wrapper.text()).toContain('分母 2 家')
    expect(wrapper.find('[role="img"]').attributes('style')).toContain('50%')
    await wrapper.setProps({ data: { ...data, totalEnterpriseCount: 0, empty: true, cities: [] } })
    expect(wrapper.find('figure').exists()).toBe(false)
    wrapper.unmount()
  })
})
