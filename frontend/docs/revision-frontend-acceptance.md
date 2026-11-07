# 老师反馈修订前端交接与自测记录

2026 年 11 月 7 日 · 成员 B

前端按 [本轮 OpenAPI](../../docs/老师反馈功能修订前后端接口约定.openapi.json) 的 `revision-draft-2026-11-07` 版实现，原文件逐字节同步。两份 Word 材料用于确认业务边界与分工。接口路径、字段和筛选枚举使用本轮 OpenAPI，未扩展字段仍沿用 W1–W6 契约。

## 交付及接口调用清单

下表路径以 `/api/v1` 为前缀。查询和写入均沿用 Bearer 登录令牌。

| 任务 | 页面与行为 | 调用 |
| --- | --- | --- |
| B1 市级通知 | 市级通知管理沿用标题 50 字、正文 2000 字、纯文本和版本校验。按发布级别、服务端操作标记展示权限。企业列表区分市级与省级，省级保留管理操作。 | `GET /notices`、`GET /notices/{noticeId}`。市级 `POST /city/notices`、`PUT/DELETE /city/notices/{noticeId}`，删除版本在查询参数。省级写入沿用 W6。 |
| B2 三端首页 | 按后端状态显示步骤、期次、范围、待办、退回及下一动作。审核链接带调查期。城市进度区分已上报和未上报，空期与加载失败分开。市级首页可输入期次代码，企业和省级用现有期次列表。 | `GET /enterprise/work-overview`、`GET /city/work-overview`、`GET /province/work-overview`，`periodCode` 可选。 |
| B3 省级双状态 | 企业进度查询按期展示独立两列，支持市、备案与上报条件、计数下钻和分页。无报表为“本期未上报”。 | `GET /province/enterprise-progress`，用 `periodCode`、`cityCode`、`filingStatus`、`reportStatus`、`page`、`size`。原账号查询保持独立。 |
| B4 滚动建档 | 新版表单显示只读建档人数和来源期。首报编辑调查人数时同步预览，保存仍由服务端核算。兼容字段传 `null`，历史快照按返回值展示。旧服务缺少新版字段时沿用旧表单行为。 | `GET/PUT /enterprise/reports/{periodCode}`、`POST /enterprise/reports/{periodCode}/submit`、原历史接口。 |
| B4 分析 | 两期与趋势支持单企业筛选。分组按同一维度分别取两期并按组代码对齐，柱图与表格共用结果。城市、性质、行业、人员变动均可下钻同条件企业明细，支持查看报表追溯。空样本和零分母保持原样。 | `GET /province/analysis/cities`、`/compare`、`/trend`、`/breakdown`、`/enterprises`。分组接口只传契约允许的维度，单企业过滤用于对比、趋势和企业明细。 |
| B5 单份与批量 | 待上报页查询本企业草稿和可重报记录。请求只含期次代码及当前版本，展示成功数、失败数和逐项原因。刷新后可重选失败项，单份入口保留。 | `GET /enterprise/periods`、`GET /enterprise/reports`、`POST /enterprise/reports/batch-submit`。市、省审核接口保持原样。 |
| B5 国家上报原型 | 省级“国家接口”展示按期、按市整理匿名明细、批次、模拟失败重试、回执与对账。模拟发送成功即锁定相关作废按钮，收到模拟回执后继续保持锁定。 | 页面内模拟。真实交换与持久锁定待评审。 |

省级分类条件继续使用契约中的代码。独立的省级字典接口仍待补齐。

## 验证记录

- `npm test` 通过 16 个测试文件、38 项用例。新增用例覆盖市级通知来源和隔离、版本冲突、双状态、批量重复期拒绝及部分成功、跳期基线、旧期修订后的快照保留、图表明细，以及真实请求路径和字段。
- `npm run build` 与 `npm run build:mock` 均通过，Vite 继续提示主包体积较大。
- 本地浏览器使用 `npm run dev:mock`。市级发布后企业可读且无发布按钮。三端概览可加载，省级双状态行显示“已备案／本期未上报”。企业首报 100→100 并走批量提交、市审和省审。两期分组含空组，下钻可见企业明细及追溯入口。原型演练失败、重试、发送即锁定与回执。
- 共享服务器只读探测在健康检查阶段超时。Node 直连为 `UND_ERR_CONNECT_TIMEOUT`，绕过系统代理的 curl 为 HTTP `000`。本次尚未获得新版本的服务器响应。成员 A 提供可达的同版构建后，先核对三角色概览、进度、分析及新版建档字段，再与成员 C 以匿名样本完成写入和跨市复验。
- A 的数据库迁移、备份与服务部署，以及 C 的手算、SQL 证据和独立验收仍待对应成员交付。

## 浏览器截图

下列证据来自本地 Mock 或原型。

- [企业概览](screenshots/revision-enterprise-overview.png) · [市级概览](screenshots/revision-city-overview.png) · [省级概览](screenshots/revision-province-overview.png)
- [市级通知发布](screenshots/revision-city-notice.png) · [省级企业双状态](screenshots/revision-province-progress.png)
- [首报滚动建档](screenshots/revision-rolling-baseline.png) · [批量空列表](screenshots/revision-batch-empty.png) · [批量提交结果](screenshots/revision-batch-result.png)
- [分组分析及企业下钻](screenshots/revision-breakdown.png) · [单企业两期比较](screenshots/revision-enterprise-compare.png)
- [国家上报原型发送后锁定](screenshots/revision-national-lock.png)
