import type { EnterpriseAnalysisRow } from '@/types/revision'
import { directionLabels } from '@/utils/revision'
import { roundedPercent } from '@/utils/week6'

export const cubeDimensions = {
  city: '所属市', enterprise: '企业', direction: '人员变动',
  period: '调查期', industry: '所属行业', nature: '企业性质',
} as const
export type CubeDimension = keyof typeof cubeDimensions
export const dimensionKeys = Object.keys(cubeDimensions) as CubeDimension[]

export const cubeMetrics = {
  enterpriseCount: ['企业数（去重）', '家'],
  baseline: ['建档期岗位', '人'], current: ['调查期岗位', '人'],
  net: ['岗位净变化', '人'], increase: ['增员人数', '人'], reduction: ['减员人数', '人'],
  rate: ['岗位变化占比', '%'],
} as const
export type CubeMetric = keyof typeof cubeMetrics
export const metricKeys = Object.keys(cubeMetrics) as CubeMetric[]

export interface CubeFact extends EnterpriseAnalysisRow { periodCode: string }
export interface CubeMember { value: string; label: string }
export type CubeFilters = Partial<Record<CubeDimension, string[]>>
export interface CubeAxis { dimension: CubeDimension; expandedCities?: ReadonlySet<string> }
export interface CubeHeader extends CubeMember { key: string; city?: string; subtotal?: boolean }

const unclassified = { value: '', label: '分类未记录' }
const member = (code?: string | null, label?: string | null) => code ? { value: code, label: label || code } : unclassified

export function cubeMember(fact: CubeFact, dimension: CubeDimension, periods: ReadonlyMap<string, string>): CubeMember {
  switch (dimension) {
    case 'period': return member(fact.periodCode, periods.get(fact.periodCode))
    case 'city': return member(fact.cityCode, fact.cityName)
    case 'enterprise': return member(fact.enterpriseOrgId, `${fact.enterpriseName}（${fact.enterpriseOrgId}）`)
    case 'direction': return member(fact.changeDirection, directionLabels[fact.changeDirection])
    case 'industry': return member(fact.industryCode, fact.industryName)
    case 'nature': return member(fact.natureCode, fact.natureName)
  }
}

export function cubeMembers(facts: readonly CubeFact[], dimension: CubeDimension, periods: ReadonlyMap<string, string>) {
  if (dimension === 'period') return [...periods].map(([value, label]) => ({ value, label }))
  if (dimension === 'direction') return Object.entries(directionLabels).map(([value, label]) => ({ value, label }))
  const members = new Map<string, CubeMember>()
  for (const fact of facts) {
    const item = cubeMember(fact, dimension, periods)
    members.set(item.value, item)
  }
  return [...members.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN') || a.value.localeCompare(b.value))
}

export function filterCube(facts: readonly CubeFact[], filters: CubeFilters, periods: ReadonlyMap<string, string>) {
  const active = dimensionKeys.flatMap(key => filters[key]?.length ? [{ key, values: new Set(filters[key]) }] : [])
  return facts.filter(fact => active.every(({ key, values }) => values.has(cubeMember(fact, key, periods).value)))
}

interface Accumulator {
  companies: Set<string>
  count: number
  baseline: number
  current: number
  increase: number
  reduction: number
}
const accumulator = (): Accumulator => ({ companies: new Set(), count: 0, baseline: 0, current: 0, increase: 0, reduction: 0 })

function add(total: Accumulator, fact: CubeFact) {
  const change = fact.periodEmploymentCount - fact.baselineEmploymentCount
  total.companies.add(fact.enterpriseOrgId)
  total.count++
  total.baseline += fact.baselineEmploymentCount
  total.current += fact.periodEmploymentCount
  total.increase += Math.max(0, change)
  total.reduction += Math.max(0, -change)
}

export function cubeValue(total: Accumulator | undefined, metric: CubeMetric): number | null {
  if (!total?.count) return null
  if (metric === 'enterpriseCount') return total.companies.size
  if (metric === 'net') return total.current - total.baseline
  if (metric === 'rate') return roundedPercent(total.current - total.baseline, total.baseline)
  return total[metric]
}

export function aggregateCube(facts: readonly CubeFact[]) {
  const total = accumulator()
  for (const fact of facts) add(total, fact)
  return total
}

function axisHeaders(facts: readonly CubeFact[], axis: CubeAxis, periods: ReadonlyMap<string, string>): CubeHeader[] {
  const members = cubeMembers(facts, axis.dimension, periods)
  if (axis.dimension !== 'city') return members.map(item => ({ ...item, key: JSON.stringify([item.value]) }))

  const children = new Map<string, CubeFact[]>()
  for (const fact of facts) {
    const list = children.get(fact.cityCode) ?? []
    list.push(fact)
    children.set(fact.cityCode, list)
  }
  return members.flatMap(city => {
    const expanded = axis.expandedCities?.has(city.value) ?? false
    const header = { ...city, key: JSON.stringify([city.value]), subtotal: expanded }
    if (!expanded) return [header]
    return [header, ...cubeMembers(children.get(city.value) ?? [], 'enterprise', periods).map(company => ({
      ...company, city: city.value, key: JSON.stringify([city.value, company.value]),
    }))]
  })
}

function keysFor(fact: CubeFact, axis: CubeAxis, periods: ReadonlyMap<string, string>) {
  const value = cubeMember(fact, axis.dimension, periods).value
  const keys = [JSON.stringify([value])]
  if (axis.dimension === 'city' && axis.expandedCities?.has(value)) keys.push(JSON.stringify([value, fact.enterpriseOrgId]))
  return keys
}

export function matchesHeader(fact: CubeFact, dimension: CubeDimension, header: CubeHeader | undefined, periods: ReadonlyMap<string, string>) {
  if (!header) return true
  if (header.city !== undefined) return fact.cityCode === header.city && fact.enterpriseOrgId === header.value
  return cubeMember(fact, dimension, periods).value === header.value
}

export function buildCube(facts: readonly CubeFact[], rowAxis: CubeAxis, columnAxis: CubeAxis, periods: ReadonlyMap<string, string>) {
  const rows = axisHeaders(facts, rowAxis, periods)
  const columns = axisHeaders(facts, columnAxis, periods)
  const totals = new Map<string, Accumulator>()
  const key = (row?: string, col?: string) => JSON.stringify([row, col])
  for (const fact of facts) {
    const rowKeys = [...keysFor(fact, rowAxis, periods), undefined]
    const columnKeys = [...keysFor(fact, columnAxis, periods), undefined]
    for (const row of rowKeys) for (const col of columnKeys) {
      const id = key(row, col)
      const total = totals.get(id) ?? accumulator()
      add(total, fact)
      totals.set(id, total)
    }
  }
  return { rows, columns, cell: (row?: string, col?: string) => totals.get(key(row, col)) }
}

export function cubeLayerTotals(facts: readonly CubeFact[], dimension: CubeDimension, periods: ReadonlyMap<string, string>) {
  const groups = new Map<string, Accumulator>()
  for (const fact of facts) {
    const value = cubeMember(fact, dimension, periods).value
    const total = groups.get(value) ?? accumulator()
    add(total, fact)
    groups.set(value, total)
  }
  return groups
}
