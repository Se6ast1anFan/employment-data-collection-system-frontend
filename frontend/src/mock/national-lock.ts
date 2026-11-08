// 仅用于同一浏览器 Mock 会话的批次和修订联动。
import { ApiError } from '@/services/api'
import { nationalLockMessage } from '@/utils/national'

export const mockNationalLocks = new Map<string, string>()

export function rejectMockNationalMutation(reportId: string) {
  if (mockNationalLocks.has(reportId)) {
    throw new ApiError(409, nationalLockMessage, 'CONFLICT', 'mock-national', {}, { reasonCode: 'LOCKED_BY_NATIONAL_BATCH' })
  }
}
