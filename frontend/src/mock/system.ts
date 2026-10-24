import type { ApiResponse, HealthData, RegionItem } from '@/types/api'
import type { RegionInfo } from '@/types/filing'

import { MockAuthError } from '@/mock/auth'

const wait = () => new Promise((resolve) => window.setTimeout(resolve, 150))
const traceId = () => `mock-${crypto.randomUUID()}`

const regions: RegionItem[] = [
  { code: 'DEMO_P', name: '演示省', level: 1 },
  { code: 'DEMO_C', name: '演示市', level: 2 },
  { code: 'DEMO_D', name: '演示区县', level: 3 },
]

const children: Record<string, RegionItem[]> = {
  DEMO_P: [regions[1]],
  DEMO_C: [regions[2]],
  DEMO_D: [],
}

export function getMockRegionInfo(code: string): RegionInfo | undefined {
  const index = regions.findIndex((item) => item.code === code)
  if (index < 0) return undefined
  const item = regions[index]
  return { code: item.code, name: item.name, path: regions.slice(0, index + 1) }
}

export const mockSystemProvider = {
  async health(): Promise<ApiResponse<HealthData>> {
    await wait()
    return {
      code: 'OK',
      message: '',
      data: { status: 'UP', version: 'mock-w1' },
      traceId: traceId(),
    }
  },

  async regions(parentCode: string | undefined, token: string): Promise<ApiResponse<RegionItem[]>> {
    await wait()
    if (!token.startsWith('mock-token-')) {
      throw new MockAuthError(401, '登录状态已失效，请重新登录')
    }

    const data = parentCode ? (children[parentCode] ?? []) : [regions[0]]
    return { code: 'OK', message: '', data, traceId: traceId() }
  },
}
