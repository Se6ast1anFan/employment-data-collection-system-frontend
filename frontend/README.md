# 企业就业失业数据采集系统前端

国家上报 V1 提供省级调查期门槛、按市预览、缺报确认、冻结批次、历史及模拟回执。Mock 模式可用“Mock 国家上报已截止期”演示两市两企的上报流程。接口、验证与演示步骤见 [国家上报 V1 前端交接](docs/national-v1-frontend-acceptance.md)。

老师反馈修订版增加市级通知管理、三端工作概览、省级企业双状态查询、滚动建档和批量提交。调用清单及历史验收见 [老师反馈修订前端交接记录](docs/revision-frontend-acceptance.md)。

省级「多维分析」与「图表分析」并列。用 `npm run dev:mock` 启动后，以省级演示账号登录，从侧栏进入「多维分析」即可查看四期匿名样本。可以更换行、列和切片维度，展开城市查看企业，点击单元格核对报表。使用 `npm run dev` 时，前端从现有省级企业分析明细接口分页读取数据，完成透视计算。[多维分析演示截图](docs/screenshots/province-olap-cube.png)

进入省级「图表分析」时，Mock 模式默认显示 2026 年 5 月的三市饼图。切换到「两期六项对比」或「连续多期趋势」后，点击「载入演示样本」即可查看默认结果。切换月度后默认选中 2026 年 1 月，环比基期为 2025 年 12 月，同比基期为 2025 年 1 月。趋势包含无报表的 2026 年 3 月，可观察折线断开。

第六周已新增省级各市企业数量与饼图、两期六项指标对比、连续多期趋势，以及省级通知管理和企业/市级通知浏览。新增接口依据 `../docs/w6-api-contract.openapi.json` 0.6.0。本地 34 项测试通过；真实分析只读及一条经授权的匿名通知发布、修改、逻辑删除闭环已通过。详细证据、未完成的独立验收及演示步骤见 [第六周验收与交接记录](docs/w6-frontend-acceptance.md)。

第四周已新增市级/省级报表审核和企业退回重报，接口依据 `../docs/w4-api-contract.openapi.json` 0.4.0。详情见 `docs/w4-frontend-acceptance.md`。运行命令不变：`npm run dev:mock` 为本地演示，`npm run dev` 为真实接口；第四周真实写入需成员 A 部署对应服务后验收。

市级与省级在各自报表菜单筛选待办并查看提交快照，通过需确认，退回备注选填。任一级退回后企业均重新提交至市级；省级审核通过只表示审核结束，不表示已汇总或已上报部委。

第三周新增省级调查期管理、企业填报与历史查询，契约为 `../docs/w3-api-contract.openapi.json` 0.3.0。运行 `npm ci` 后用 `npm run dev` 连接真实后端，或 `npm run dev:mock` 演示。第三周验收记录见 `docs/w3-frontend-acceptance.md`。

企业备案通过后，可在开放期次保存和提交。其他原因没有内容时填“无”。减员时类型、主要原因和说明必填，次要与第三原因和说明成对填写。修订版首报建档取本期人数，后续以最近一次实际上报期滚动，提交后冻结本表建档来源和人数。历史只读，省级期次时间按北京时间录入并转 UTC。

本目录是第一、二周前端交付。第一周公共接口以 `../docs/w1-api-contract.openapi.json` 为依据，第二周备案接口以 `../docs/w2-api-contract.openapi.json` 0.2.0 为唯一依据。

第一周公共接口：

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/meta/regions`

第二周新增接口：

- 省级创建企业账号：`POST /api/v1/province/enterprise-accounts`
- 企业选项、资料、备案状态、历史版本和提交接口
- 省级备案期次、待审/已备案列表、详情、历史版本、通过、退回和 Excel 导出接口

调查期维护、填报、审核、省级管理及分析通知已按第三至六周增量开放。用户管理、角色管理和监控仍按后续安排保留占位。

## 为什么双击 index.html 打不开

这是 Vue 3 + Vite 工程，不是可以直接双击运行的单文件网页。`index.html` 需要由 Vite 开发服务器处理 TypeScript、Vue 组件、模块路径和页面路由；`dist/index.html` 也应由 HTTP 服务器提供。请按下面的命令启动，再在浏览器打开终端显示的网址。

## 第一次运行：无后端演示模式

适合成员 A 的后端还没有启动时使用。

1. 安装 Node.js 24.x 和 npm 11.x。
2. 打开文件夹 `C:\Users\fanmi\Desktop\卓越工程综合训练\project\frontend`。
3. 在文件夹空白处按住 Shift 并单击鼠标右键，选择“在终端中打开”或“在 PowerShell 中打开”。
4. 依次执行：

```powershell
node -v
npm -v
npm ci
npm run dev:mock
```

5. 看到终端显示 `Local: http://127.0.0.1:5173/` 后，在浏览器地址栏输入 `http://127.0.0.1:5173/`。
6. 不要关闭正在运行的 PowerShell 窗口。要停止项目，在该窗口按 `Ctrl+C`。

如果终端当前不在前端目录，可先执行：

```powershell
cd "C:\Users\fanmi\Desktop\卓越工程综合训练\project\frontend"
```

## 连接真实后端

提供的第一周联调服务器是 `http://47.93.90.158:8080/api/v1`。项目的 Vite 开发代理已指向该服务器。在前端目录执行：

```powershell
npm run dev
```

浏览器仍打开 `http://127.0.0.1:5173/`。开发服务器会把 `/api/v1` 请求代理到成员 A 的服务器。

真实演示账号和密码只保存在成员 A 提供的《第一周前端联调使用说明》中，不写入前端源码、页面默认值或项目文档。若后端地址变化，修改 `vite.config.ts` 中的代理目标。

## Mock 演示账号

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 企业 | `demo_enterprise` | `Demo@123456` |
| 市级 | `demo_city` | `Demo@123456` |
| 省级 | `demo_province` | `Demo@123456` |

Mock 账号、令牌和地区仅用于演示 JSON 形状，不是真实业务数据。

```powershell
npm run type-check
npm test
npm run build
```

构建完成后会生成 `dist` 目录。仍然不要双击 `dist/index.html`，请执行：

```powershell
npm run preview
```

然后打开 `http://127.0.0.1:4173/`。`npm run build` 默认构建真实接口模式；要构建 Mock 演示版，使用 `npm run build:mock`，再执行 `npm run preview`。Vite 的 `preview` 不包含开发代理，因此真实后端联调应使用 `npm run dev`。

## 常见问题

- 显示“无法连接服务”：检查云服务器安全组是否允许当前公网 IP 访问 8080、后端进程是否监听 8080，以及 `vite.config.ts` 的代理地址。临时演示可改用 `npm run dev:mock`。
- 显示 5173 端口被占用：先关闭占用 5173 的旧前端进程，再重新运行。项目固定使用 5173，避免超出后端允许的开发来源。
- PowerShell 提示找不到 `npm`：Node.js 未安装，或安装后尚未重新打开终端。
- 页面刷新后回到登录页：这是接口协议明确要求，Token 只保存在运行内存。
- 401：登录失败或 Token 无效/过期，前端会清除登录状态。
- 403：已登录但没有该页面权限，前端会进入无权限页。
