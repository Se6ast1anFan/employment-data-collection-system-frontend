# 云南省企业就业失业数据采集系统前端

本目录是成员 B 的第一、二周前端交付。第一周公共接口以 `../docs/w1-api-contract.openapi.json` 为依据，第二周备案接口以 `../docs/w2-api-contract.openapi.json` 0.2.0 为唯一依据。

第一周公共接口：

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/meta/regions`

第二周新增接口：

- 省级创建企业账号：`POST /api/v1/province/enterprise-accounts`
- 企业选项、资料、备案状态、历史版本和提交接口
- 省级备案期次、待审/已备案列表、详情、历史版本、通过、退回和 Excel 导出接口

调查期维护、就业数据填报、报表审核、统计、通知和系统管理仍按后续周次保持占位。

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

## 连接成员 A 的真实后端

成员 A 提供的第一周联调服务器是 `http://47.93.90.158:8080/api/v1`。项目的 Vite 开发代理已指向该服务器。在前端目录执行：

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

### 第二周 Mock 演示顺序

1. 使用省级账号登录，打开“创建企业账号”，输入匿名演示账号、口令、企业名和地区。
2. 退出后使用刚创建的企业账号登录，填写“企业基本信息”，保存并提交。
3. 切回省级账号，在“企业备案”的待审核视图查看详情并退回。
4. 企业查看退回理由和版本 1 快照，修改后重新提交，生成版本 2。
5. 省级通过版本 2，在已备案视图按地区或调查期查询并导出 Excel。

Mock 数据仅保存在当前页面运行内存中；刷新页面会重置数据并要求重新登录。建号成功后不会回显或持久化初始口令。真实服务器仍使用 HTTP 时，只能录入匿名演示口令和资料；接入真实信息前必须配置 HTTPS。

## 构建和检查

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

## 当前范围

已实现登录、退出、当前用户、三角色首页、菜单过滤、未登录跳转、403、404，以及健康检查、地区列表和第二周企业备案闭环。企业可保存草稿、提交、查看退回理由和历史版本；省级可创建企业账号、审核、查询及导出已备案企业。所有响应统一按 `code`、`message`、`data`、`traceId` 解析；ID 使用字符串；角色代码为 `ENTERPRISE`、`CITY`、`PROVINCE`。

Token 仅保存在运行内存，刷新页面后需要重新登录。第二周接口已于 2026 年 10 月 24 日完成真实后端完整闭环验证；后端临时不可用时仍可使用 `npm run dev:mock` 演示，但 Mock 结果不得替代真实联调记录。就业填报、报表审核、统计、通知等后续业务仍只展示占位信息。
