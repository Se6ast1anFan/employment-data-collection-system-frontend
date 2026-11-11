# 中期汇报反馈 V2 成员 B 前端交接

2026-11-10。实施基线为项目内 [V2 OpenAPI](../../docs/中期汇报反馈_V2前后端接口约定.openapi.json)，版本为 `midterm-v2-2026-11-10`。前端 HTTP 仍使用 JSON 和 Bearer 登录。XML 是服务端冻结的上报内容，页面按原文只读显示。

| 页面 | 前端交付 | 对接 |
| --- | --- | --- |
| `/province/periods` | 年份、服务端 12 月预览、冲突月份和一次确认。所有边界显示北京时间，保留单期创建。 | `GET /province/periods/year/preview?year=…` 与 `POST /province/periods/year`，后者只传 `year`。 |
| `/province/home`、`/city/home` | 真实已报进度条、应报分母、代填、尚未覆盖、待处理和退回。省级先按市，点击市名进入分页明细。应报为零时显示空态。 | 既有 `/province/work-overview`、`/city/work-overview` 的 V2 新字段，进度不使用旧转报数量。 |
| `/province/enterprise-progress` | 保留备案和真实报表双状态，单列应报资格、代填和来源。按市链接携带调查期和州市代码。 | `GET /province/enterprise-progress`，沿用分页、筛选及双状态，读取 `coverageSummary`、`eligible`、`coverageMode` 和 `proxySource`。 |
| `/enterprise/home` | 本期未保存、已保存草稿、已提交、被退回；退回原因及重提交入口。原填报页仍处理资格、调查期、保存和提交。 | `GET /enterprise/work-overview` 的四项 `home*` 摘要字段。 |
| `/province/national` | 缺报待补、可代填与缺源，生成或撤销未冻结代填，逐企业来源和 REAL／PROXY 摘要。仅可提交时冻结。历史区分 V1 JSON 与 V2 XML，详情分别显示分片、队列确认、组装和模拟回执。 | `readiness`、`POST/DELETE proxy-fill`、批次列表及详情，建批只发 `periodCode` 与 `schemaVersion: "demo-2"`。仅 V2 排队中或发送失败可按批次 ID 无正文重试。 |
| `/province/data/reports/:reportId` | 冻结报文的真实入批记录锁定。代填的来源报表不被当成该批次的入批真实报表。 | 沿用修订、作废接口及 `409 LOCKED_BY_NATIONAL_BATCH`。 |

## 已有分析功能回归清单

| 功能与页面 | 可操作项 | API 与计算位置 |
| --- | --- | --- |
| 各市数量及占比，`/province/analysis` | 期次、地区，饼图与城市表 | `GET /province/periods`，`GET /province/analysis/cities`。图表直接用返回的城市数量和占比。 |
| 两调查期、连续趋势，`/province/analysis` | 调查期、地区、单企业、性质父子级、行业父子级；比较结果可切换柱图与折线。 | `/province/analysis/compare`、`/province/analysis/trend`。`ProvinceAnalysisView.vue` 显示响应指标及期次名称。 |
| 年、季、月对比，`/province/analysis` | 自选、同比、季度及月度环比，样本筛选同上。 | `services/calendarAnalysis.ts` 读取 `/province/analysis/enterprises` 分页明细。`utils/calendarAnalysis.ts` 按期开始时间的北京时间分桶，组内企业按编号去重，建档及调查岗位累计各期人次，净变化取差、减员单独累加。占比取汇总净变化除以汇总建档岗位。同比基期为上年同期，环比为相邻上一月／季度。空基期保留标签，基期非正时增幅留空，比例差以百分点表示。 |
| 多维分析，`/province/olap` | 行列换轴，调查期、城市、企业、人员变动、性质和行业切片及多选；按市展开企业，点击聚合单元查看报表。 | `services/olap.ts` 读调查期与 `/province/analysis/enterprises`。`utils/olap.ts` 负责维度成员、筛选、交叉聚合和合计。单元格明细回溯真实报表 ID，专用演示样本仅显示本地明细。 |

上述路径沿用既有契约。本轮没有新增同比环比专用接口。A 切换数仓数据源后，回归时对照同一匿名样本的明细、六项指标、切片和穿透报表，特别核对代填不会进入真实趋势。数据库事实表、同步任务、RabbitMQ 与正式队列证据由 A 提供，独立验收和 UML 由 C 完成。

## 本地核对与共享环境

本地 21 个测试文件、57 项测试通过，真实和 Mock 两种构建通过。浏览器核对了全年预览与重复创建保护、三端首页、按市下钻、缺源阻止、代填与 XML 冻结、分片模拟回执及 V1 只读历史。图表的月度环比与同比、立方体行列交换及单元格报表明细也已在 Mock 浏览器中复核。

使用 `npm run dev:mock`。省级先访问国家上报加载 V2 匿名样本，再可在省级首页选「V2 可补齐期（演示）」。该期两市四企，真实 2 家、代填 2 家，建档 366 人、调查 364 人，净变化 −2。另有「V2 无来源阻止期（演示）」和 V1 JSON 历史。Mock 分片状态为本地模拟。

2026-11-10 直连共享后端健康检查为 HTTP 200 / UP。现有联调说明的企业、市级、省级演示账号登录均为 HTTP 401，未取得受保护的 V2 或数仓接口响应，也未执行共享环境业务写入。取得同版部署与可用演示账号后再做真实联调。

截图使用本地匿名 Mock 数据。[全年预览](screenshots/midterm-v2-year-preview.png)、[省级首页](screenshots/midterm-v2-province-home.png)、[按市下钻](screenshots/midterm-v2-province-drill.png)、[市级首页](screenshots/midterm-v2-city-home.png)、[企业首页](screenshots/midterm-v2-enterprise-home.png)、[逐企业预览](screenshots/midterm-v2-national-preview.png)、[分片与模拟回执](screenshots/midterm-v2-national-receipt.png)。已有分析截图见 [同比环比示例](screenshots/province-analysis-month-over-month.png) 和 [立方体](screenshots/province-olap-cube.png)。

## 2026-11-11 模拟接收端差量核对

按《国家接口模拟接收端对接补充说明 仅差量》核对代码。真实模式通过业务 API 建批、刷新详情和重试。建批提示已冻结并排队，详情分别显示队列确认数、接收端存储数和服务端回执，定时器用于重新请求批次详情。浏览器本地模拟使用独立的 Mock 模式。

V2 批次详情在 `status === 'MOCK_ACCEPTED'` 且 `receipt` 非空时显示「模拟国家后端已接收」和回执。状态已到但回执未到时，在原有次数限制内继续刷新详情。批次列表提示到详情核对回执。补充文档转述了后端的两片发送及回执验证，本次未复测共享环境。
