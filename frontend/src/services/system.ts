import { mockSystemProvider } from '@/mock/system'
import { request } from '@/services/api'
import { apiMode } from '@/services/auth'
import type { ApiResponse, HealthData, RegionItem } from '@/types/api'

export interface SystemProvider {
  health(): Promise<ApiResponse<HealthData>>
  regions(parentCode: string | undefined, token: string): Promise<ApiResponse<RegionItem[]>>
}

const realSystemProvider: SystemProvider = {
  health: () => request<HealthData>('/health'),
  regions: (parentCode, token) => {
    const query = parentCode ? `?parentCode=${encodeURIComponent(parentCode)}` : ''
    return request<RegionItem[]>(`/meta/regions${query}`, {}, token)
  },
}

export const systemProvider: SystemProvider =
  apiMode === 'mock' ? mockSystemProvider : realSystemProvider
