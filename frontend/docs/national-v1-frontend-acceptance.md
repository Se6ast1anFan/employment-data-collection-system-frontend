# 国家上报 V1 前端交接

2026 年 11 月 8 日 · 成员 B

省级菜单“国家上报”已接入 V1 项目内部模拟接口。页面明确标记 MOCK。原 `/integration` 入口会转到 `/province/national`。市级和企业没有入口，直接访问受路由权限保护。真实国家平台未接入。

## 页面与契约

| 页面 | 数据和操作 |
| --- | --- |
| 省级工作概览 | 从 `GET /province/work-overview` 读取 `nationalReportCard`。按返回期次、状态及批次跳转。 |
| 调查期与预览 | 沿用 `GET /province/periods`，逐期读取 `GET /province/national/periods/{periodCode}/readiness`。显示截止时间、待处理、缺报和阻止原因。预览展示全省合计、按市展开的企业明细、缺报名单和原报表只读追溯。 |
| 确认上报 | 缺报时必须勾选知晓。只提交 `periodCode` 和 `acknowledgeMissing` 到 `POST /province/national/batches`。同一期已有批次的 409 响应会打开既有批次。 |
| 批次历史 | `GET /province/national/batches` 按期次、状态筛选，页码从 0 开始。 |
| 批次详情 | `GET /province/national/batches/{batchId}` 显示冻结报文、SHA-256、发送尝试、错误及模拟回执。排队或发送中每 2 秒读一次详情，最多自动刷新 24 次。关闭详情会停止，亦可手动刷新。JSON 预览是对响应的格式化展示，哈希来自服务端冻结的原始报文。 |
| 继续发送 | 只在 `QUEUED` 或 `SEND_FAILED` 提供入口。`POST /province/national/batches/{batchId}/retry` 无请求体。 |
| 报表追溯 | 普通追溯页通过冻结批次识别入批报表，禁用修订与作废。若并发导致写入时才发现锁定，按 409 的 `LOCKED_BY_NATIONAL_BATCH` 显示明确提示并锁定页面。 |

项目内 [V1 OpenAPI](../../docs/国家接口前后端接口约定_V1.openapi.json) 与用户提供的文件逐字节一致。真实模式以服务端返回的门槛、批次、数据范围和锁定结果为准。

## 本地演示与验证

在前端目录运行 `npm run dev:mock`，使用演示省级用户进入“国家上报”，选择“Mock 国家上报已截止期”。预览有 2 个城市、2 份有效报表、1 家缺报企业。建档 150 人、调查 145 人、净变化 −5 人。勾选后确认，详情自动刷新为“模拟已接收”。从冻结报文和普通汇总均可进入报表追溯。浏览器 Mock 数据只保留在当前页面进程中。

- 浏览器验证了未勾选知晓时确认按钮禁用、两市两企上报后收到模拟回执、同一期出现既有批次、原报表只读及普通追溯页显示锁定。
- 自动测试覆盖四类待处理阻止、缺报、角色及跨省隔离、重复确认、发送失败锁定、原批次重试、SHA-256 与回执一致，以及真实请求路径、请求体和冲突响应的解析。
- 本地全套 50 项测试通过，真实接口和 Mock 两种构建通过。
- 共享服务器健康检查为 `200 / UP`。联调说明中的企业、市级和省级账号均返回 `401`。本轮尚未取得带身份的 V1 业务响应，数据库冻结、服务端重试及共享环境锁定仍待成员 A 提供可登录环境后联调。

[缺报确认截图](screenshots/national-v1-confirm.png) · [模拟批次截图](screenshots/national-v1-receipt.png) · [报表锁定截图](screenshots/national-v1-lock.png)
