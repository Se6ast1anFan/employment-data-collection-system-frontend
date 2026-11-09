import { describe, expect, it } from 'vitest'
import { mockAuthProvider } from '@/mock/auth'
import { olapDemoPage, olapDemoPeriods } from '@/mock/olap'
import { cubeFactLimit, readCubeFacts } from '@/services/olap'
import { buildCube, cubeValue, filterCube, matchesHeader } from '@/utils/olap'

const periods = new Map(olapDemoPeriods.map(period => [period.code, period.label]))
const [june, july] = periods.keys()

async function demo(role = 'province') {
  return (await mockAuthProvider.login({ username: `demo_${role}`, password: 'Demo@123456' })).data.accessToken
}

describe('省级多维分析', () => {
  it('跨期去重企业，净增减分别累计，变化占比由合计重新计算', async () => {
    const token = await demo()
    const facts = await readCubeFacts([...periods.keys()], (code, page) => Promise.resolve(olapDemoPage(code, page, 2, token)))
    expect(facts).toHaveLength(17)
    const cube = buildCube(facts, { dimension: 'city' }, { dimension: 'period' }, periods)
    expect(cube.rows).toHaveLength(3)
    expect(cube.columns).toHaveLength(4)
    const total = cube.cell()
    expect(cubeValue(total, 'enterpriseCount')).toBe(6)
    expect(cubeValue(total, 'baseline')).toBe(1225)
    expect(cubeValue(total, 'current')).toBe(1257)
    expect(cubeValue(total, 'net')).toBe(32)
    expect(cubeValue(total, 'increase')).toBe(74)
    expect(cubeValue(total, 'reduction')).toBe(42)
    expect(cubeValue(total, 'rate')).toBe(2.61)
    expect(cubeValue(cube.cell(undefined, cube.columns.at(-1)!.key), 'net')).toBeNull()
  })

  it('联合筛选后按市下钻企业，换轴保持值，区分有效零值和零分母', async () => {
    const token = await demo()
    const facts = await readCubeFacts([june!, july!], (code, page, size) => Promise.resolve(olapDemoPage(code, page, size, token)))
    const sliced = filterCube(facts, { period: [june!], city: ['530100', '532900'], direction: ['INCREASE'] }, periods)
    const city = { dimension: 'city', expandedCities: new Set(['532900']) } as const
    const direction = { dimension: 'direction' } as const
    const cube = buildCube(sliced, city, direction, periods)
    const company = cube.rows.find(row => row.city === '532900')!
    const increase = cube.columns.find(col => col.value === 'INCREASE')!
    expect(cubeValue(cube.cell(company.key, increase.key), 'net')).toBe(5)
    expect(cubeValue(cube.cell(company.key, increase.key), 'rate')).toBeNull()
    expect(cubeValue(cube.cell(), 'net')).toBe(17)
    expect(sliced.filter(fact => matchesHeader(fact, 'city', company, periods)).map(fact => fact.enterpriseOrgId)).toEqual(['OLAP-E06'])
    const swapped = buildCube(sliced, direction, city, periods)
    expect(cubeValue(swapped.cell(increase.key, company.key), 'net')).toBe(5)
    const unchanged = filterCube(facts, { period: [june!], direction: ['UNCHANGED'] }, periods)
    expect(cubeValue(buildCube(unchanged, city, direction, periods).cell(), 'net')).toBe(0)
  })

  it('分页重复或超过容量时拒绝整批，避免用部分数据计算', async () => {
    const token = await demo()
    const first = olapDemoPage(june!, 0, 2, token)
    await expect(readCubeFacts([june!], async (_, page) => ({ ...first, page }))).rejects.toThrow('重复')
    await expect(readCubeFacts([june!], async () => ({ ...first, total: cubeFactLimit + 1 }))).rejects.toThrow('超过')
    await expect(readCubeFacts([june!], async (_, page) => ({ ...first, page, total: page ? 7 : 6 }))).rejects.toThrow('分页不一致')
  })

  it('Mock 分析明细只允许省级读取', async () => {
    const token = await demo('city')
    expect(() => olapDemoPage(june!, 0, 100, token)).toThrow('无权访问')
  })
})
