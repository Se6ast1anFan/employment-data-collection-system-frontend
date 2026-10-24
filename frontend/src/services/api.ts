import type { ApiResponse } from '@/types/api'
import type { DownloadedFile, FieldErrorData } from '@/types/filing'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'REQUEST_FAILED',
    public readonly traceId = '',
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message)
  }
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'code' in value &&
      'message' in value &&
      'data' in value &&
      'traceId' in value,
  )
}

function dispatchAuthError(status: number) {
  if (status === 401) window.dispatchEvent(new Event('auth:unauthorized'))
  if (status === 403) window.dispatchEvent(new Event('auth:forbidden'))
}

function toApiError(status: number, payload: ApiResponse<unknown> | null, fallback: string) {
  dispatchAuthError(status)
  const data = payload?.data as FieldErrorData | null | undefined
  return new ApiError(
    status,
    payload?.message || fallback,
    payload?.code,
    payload?.traceId,
    data?.fieldErrors ?? {},
  )
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<ApiResponse<T>> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError(0, '无法连接服务，请确认后端已启动或切换到 Mock 模式')
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!isApiResponse<T>(payload)) {
    throw new ApiError(response.status, '服务返回格式不符合接口约定')
  }

  if (!response.ok || payload.code !== 'OK') throw toApiError(response.status, payload, '请求失败')
  return payload
}

function parseFileName(header: string | null): string {
  if (!header) return '已备案企业.xlsx'
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) {
    try { return decodeURIComponent(utf8) } catch { return utf8 }
  }
  return header.match(/filename="?([^";]+)"?/i)?.[1] || '已备案企业.xlsx'
}

export async function download(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<DownloadedFile> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError(0, '无法连接服务，请确认后端已启动或切换到 Mock 模式')
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    throw toApiError(
      response.status,
      isApiResponse<unknown>(payload) ? payload : null,
      '导出失败',
    )
  }
  return {
    blob: await response.blob(),
    fileName: parseFileName(response.headers.get('Content-Disposition')),
  }
}
