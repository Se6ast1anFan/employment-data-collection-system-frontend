import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, download, request } from '@/services/api'

const jsonResponse = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('统一 API 错误和文件流', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('保留 400 的字段错误和 traceId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'BAD_REQUEST', message: '请求参数不合法',
      data: { fieldErrors: { postalCode: '邮政编码必须为 6 位数字' } }, traceId: 'trace-400',
    }, 400)))
    await expect(request('/enterprise/profile')).rejects.toEqual(expect.objectContaining<Partial<ApiError>>({
      status: 400, code: 'BAD_REQUEST', traceId: 'trace-400',
      fieldErrors: { postalCode: '邮政编码必须为 6 位数字' },
    }))
  })

  it('401 会广播登录失效事件', async () => {
    const listener = vi.fn()
    window.addEventListener('auth:unauthorized', listener, { once: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'UNAUTHORIZED', message: '登录已过期', data: null, traceId: 'trace-401',
    }, 401)))
    await expect(request('/enterprise/filing')).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('网络失败显示明确提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    await expect(request('/health')).rejects.toEqual(expect.objectContaining<Partial<ApiError>>({
      status: 0, message: expect.stringContaining('无法连接服务'),
    }))
  })

  it('下载接口解析 UTF-8 文件名且不要求 JSON 外壳', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b]), {
      status: 200,
      headers: { 'Content-Disposition': "attachment; filename*=UTF-8''%E5%A4%87%E6%A1%88.xlsx" },
    })))
    const file = await download('/province/filings/export')
    expect(file.fileName).toBe('备案.xlsx')
    expect(file.blob.size).toBe(2)
  })
})
