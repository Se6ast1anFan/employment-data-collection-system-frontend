import {afterEach,describe,it,expect,vi} from 'vitest'
import {managementProvider as api} from '@/services/management'
const response=(data:unknown)=>new Response(JSON.stringify({code:'OK',message:'',data,traceId:null}),{headers:{'Content-Type':'application/json'}})
describe('第五周真实请求契约',()=>{
 afterEach(()=>vi.unstubAllGlobals())
 it('列表0基页码、已应用筛选和导出不带分页/组织参数',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(response({items:[],total:0,page:0,size:20,filters:{}})).mockResolvedValueOnce(new Response('PK',{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}}))
 vi.stubGlobal('fetch',fetch)
 await api.accounts({username:'中文 & 名称',quarter:'2026-Q4',page:0,size:20},'temporary-test-token')
 const url=new URL(fetch.mock.calls[0][0],'http://localhost');expect(url.pathname).toBe('/api/v1/province/accounts');expect(url.searchParams.get('username')).toBe('中文 & 名称');expect(url.searchParams.get('page')).toBe('0')
 await api.export('accounts',{username:'中文 & 名称',quarter:'2026-Q4'},'temporary-test-token')
 const exportUrl=new URL(fetch.mock.calls[1][0],'http://localhost');expect(exportUrl.pathname).toBe('/api/v1/province/accounts/export');expect([...exportUrl.searchParams.keys()]).toEqual(['username','quarter'])
 })
 it('修订仅带差量与双版本，作废保留原因',async()=>{
 const fetch=vi.fn().mockImplementation(()=>Promise.resolve(response({})));vi.stubGlobal('fetch',fetch)
 const b={expectedVersion:8,submissionVersion:2,reason:'核对',changes:{periodEmploymentCount:85,secondaryReasonCode:null}}
 await api.correct('12',b,'temporary-test-token');expect(fetch.mock.calls[0][0]).toBe('/api/v1/province/reports/12/corrections');expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(b)
 await api.void('12',{expectedVersion:9,submissionVersion:2,reason:'重复历史报表'},'temporary-test-token');expect(fetch.mock.calls[1][0]).toBe('/api/v1/province/reports/12/void')
 })
 it('下载收到JSON错误时展示字段错误，不能伪装成成功文件',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'BAD_REQUEST',message:'调查期无效',data:{fieldErrors:{periodCode:'未知期次'}},traceId:'test'}),{status:200,headers:{'Content-Type':'application/json'}})))
 await expect(api.export('reports',{periodCode:'UNKNOWN'},'temporary-test-token')).rejects.toMatchObject({message:'调查期无效',fieldErrors:{periodCode:'未知期次'}})
 })
})
