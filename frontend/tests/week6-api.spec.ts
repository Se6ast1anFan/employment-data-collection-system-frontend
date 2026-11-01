import {afterEach,describe,it,expect,vi} from 'vitest'
import {realAnalysisProvider as analysis,realNoticeProvider as notice} from '@/services/week6'
const ok=()=>new Response(JSON.stringify({code:'OK',message:'',data:{},traceId:null}),{headers:{'Content-Type':'application/json'}})
describe('第六周真实请求契约',()=>{
 afterEach(()=>vi.unstubAllGlobals())
 it('趋势数组编码为单个逗号参数，筛选与Bearer精确传输',async()=>{
  const fetch=vi.fn().mockImplementation(()=>Promise.resolve(ok()));vi.stubGlobal('fetch',fetch)
  await analysis.trend({periodCodes:['A','B','C'],natureParentCode:'性质父级',industryCode:'行业子级'},'temporary-test-token')
  const url=new URL(fetch.mock.calls[0][0],'http://localhost')
  expect(url.pathname).toBe('/api/v1/province/analysis/trend');expect(url.searchParams.getAll('periodCodes')).toEqual(['A,B,C'])
  expect(url.searchParams.get('natureParentCode')).toBe('性质父级');expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer temporary-test-token')
  expect(url.searchParams.has('provinceId')).toBe(false)
 })
 it('通知写入仅有约定字段，DELETE版本位于query而非body',async()=>{
  const fetch=vi.fn().mockImplementation(()=>Promise.resolve(ok()));vi.stubGlobal('fetch',fetch)
  await notice.create({title:'边界演示',content:'匿名测试'},'temporary-test-token')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({title:'边界演示',content:'匿名测试'})
  await notice.update('12',{expectedVersion:2,title:'更新',content:'匿名更新'},'temporary-test-token')
  expect(fetch.mock.calls[1][0]).toBe('/api/v1/province/notices/12');expect(fetch.mock.calls[1][1].method).toBe('PUT')
  await notice.delete('12',3,'temporary-test-token')
  expect(fetch.mock.calls[2][0]).toBe('/api/v1/province/notices/12?expectedVersion=3');expect(fetch.mock.calls[2][1]).toMatchObject({method:'DELETE'});expect(fetch.mock.calls[2][1].body).toBeUndefined()
 })
})
