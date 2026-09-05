# ReproLens

> 将模糊的 Web Bug 报告转化为可复现证据、页面质量报告、像素 Diff 和回归测试。

ReproLens 是一个面向前端开发者、测试工程师和开源维护者的可视化 Bug 复现与页面质量分析工具。输入目标页面、问题描述和期望结果，它会操作真实 Chromium，在多种设备尺寸下采集截图、WCAG、Web Vitals、Console 与 Network 证据，最后交付质量门禁、结构化报告、像素 Diff 和 Playwright 回归测试。

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-5FA04E)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-visual_dashboard-61DAFB)](https://react.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-browser_worker-2EAD33)](https://playwright.dev/)
[![License](https://img.shields.io/badge/license-MIT-8CF7C7)](LICENSE)

## 当前版本：v0.4.0

ReproLens 是一个可独立安装、运行和演示的开源项目，完整包含前端工作台、API、浏览器执行器、持久化和内置 Demo。项目采用需求驱动的小步迭代：每个版本聚焦一个可验收的用户闭环，并同步交付代码、测试和文档。

### v0.1.0 — 核心复现闭环

- 可视化任务创建：输入 URL、Bug 描述、期望结果和测试设备。
- 多设备真实复现：Desktop、iPhone 13、Pixel 7。
- Agent 动作规划：DeepSeek 根据问题和可交互元素规划受限操作。
- 安全工具边界：模型只能选择 click、fill、wait，不能生成任意脚本。
- 实时过程展示：SSE 推送浏览器启动、页面加载、Agent 操作、截图和发现。
- 证据采集：全页截图、Console Error、Page Error、HTTP 4xx/5xx。
- 确定性检测：横向溢出、图片替代文本、无名称控件、内容裁切。
- 结构化结论：严重程度、问题类别、设备、证据和修复建议。
- 回归测试生成：根据真实动作和失败证据生成 Playwright 测试。
- 本地持久化：运行记录和证据刷新后仍可查看。
- 无 Key 降级：DeepSeek 不可用时自动使用本地确定性规则。
- 内置故障商城：安装后无需准备其他项目即可体验完整闭环。

### v0.2.0 — 修复验证闭环

- 任意已完成任务都可以一键设为基线，并对修复后的 URL 重放相同操作和设备矩阵。
- 每个设备生成 Before、After、Pixel Diff 三联证据，不依赖模型判断像素变化。
- 自动统计像素变化率、质量分变化、已解决问题和新引入问题。
- 确定性给出 `improved`、`regressed`、`changed` 或 `unchanged` 验证结论。
- 内置 Demo 自动预填修复版地址 `/demo/shop?fixed=1`，无需准备两个外部项目即可演示。

最短体验路径：先运行首页预填的故障 Demo；任务完成后点击“验证修复”，系统会自动重放修复版并展示三联对比。

### v0.3.0 — GitHub 协作闭环

- 在可视化工作台粘贴 GitHub Issue URL，自动读取仓库、标题、正文、目标地址、期望结果和设备。
- 支持通过 `needs-reproduction` 标签或手动执行 GitHub Actions 发起验证，无需部署公网服务。
- 以 repository、issue、commit 作为幂等键，重复事件不会创建重复任务。
- 创建独立 GitHub Check Run，执行时显示进行中，完成后回写 success、failure 或 neutral。
- 在 Issue 中创建结构化证据报告；再次发布会更新同一条评论，不会重复刷屏。
- 运行详情展示 Issue、提交、同步状态、Check 链接和重新发布入口。
- Actions Artifacts 交付截图、Pixel Diff、完整 Run JSON、Markdown 报告和 Playwright 测试。
- 提供 HMAC-SHA256 Webhook 校验，可选接入自托管服务。

最短 GitHub 路径：在仓库 Issue 中填写 Target URL、Problem、Expected behavior 和 Device，添加 `needs-reproduction` 标签，Actions 会执行扫描并把报告同步回 Issue。

### v0.4.0 — 页面质量分析闭环

- 使用 axe-core 执行 WCAG 2 A/AA 审计，输出规则编号、DOM 选择器、元素坐标和修复建议。
- 按 Desktop、iPhone 13、Pixel 7 分别采集 LCP、CLS、INP、FCP、TTFB、DOM Ready 和资源体积。
- 根据稳定阈值生成性能问题和设备质量评分，不依赖模型判断指标是否合格。
- 运行详情展示质量门禁、设备级 Web Vitals 和可执行修复建议。
- 运行记录支持按页面查看评分趋势、问题类型累计和设备平均分。
- GitHub Check 支持最低评分、高严重度、可访问性和性能问题上限，门禁失败自动阻断。
- v0.1-v0.3 的历史 JSON 记录无需迁移，仍可正常查看。

## 一次运行会发生什么

```text
问题描述 + 目标 URL + 设备
              │
              ▼
      DeepSeek 规划安全动作
              │
              ▼
       Playwright 操作页面
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
 Screenshot WCAG/Web Vitals Console/Network
      └──────────┼──────────┘
              ▼
      确定性证据分析 + 质量门禁
              │
              ▼
 可视化报告 + Playwright 回归测试
```

内置 Demo 的实测结果：

```text
状态          completed
结论          reproduced
质量评分      38 / 100
复现置信度    94%
测试设备      3
截图          3
结构化发现    11（跨设备展示，同一根因只扣分一次）
AI Provider   DeepSeek
```

## 快速开始

前置条件：Node.js 20 或更高版本，推荐 Node.js 22。

### Windows PowerShell

```powershell
cd E:\reprolens
npm install
npm run browser:install
Copy-Item .env.example .env
```

编辑 `.env`，填写自己的 DeepSeek API Key：

```dotenv
DEEPSEEK_API_KEY=your-key
```

启动开发环境：

```powershell
npm run dev
```

### macOS / Linux

```bash
cd /path/to/reprolens
npm install
npm run browser:install
cp .env.example .env
```

编辑 `.env`，填写自己的 DeepSeek API Key：

```dotenv
DEEPSEEK_API_KEY=your-key
```

启动开发环境：

```bash
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)，首页已经预填内置 Demo，直接点击“启动可视化复现”。

## GitHub Actions 集成

仓库已包含 [`.github/reprolens.yml`](.github/reprolens.yml) 和 [`.github/workflows/reprolens.yml`](.github/workflows/reprolens.yml)。Fork 后默认可用：

1. 在仓库 Settings → Actions → General 中允许工作流读写仓库。
2. 如果需要 DeepSeek，在 Settings → Secrets and variables → Actions 新建 `DEEPSEEK_API_KEY`；不配置时使用本地确定性规则。
3. 创建 Issue，并按模板填写可访问的 Target URL。
4. 添加 `needs-reproduction` 标签，或在 Actions 页面手动运行工作流并填写 Issue 编号。
5. 在 Issue 评论、Checks 和 Actions Artifacts 中查看结果。

仓库级配置：

```yaml
triggerLabel: needs-reproduction
devices: [desktop, iphone13, pixel7]
publish:
  issueComment: true
  checkRun: true
qualityGate:
  enabled: true
  minScore: 75
  maxHighSeverityFindings: 0
  maxAccessibilityIssues: 3
  maxPerformanceIssues: 2
```

如果页面地址固定，也可在配置中增加 `targetUrl`。工作流仅声明 `contents: read`、`issues: write` 和 `checks: write` 权限；`GITHUB_TOKEN` 只用于当前仓库。

本地工作台导入私有 Issue 或回写结果时，在 `.env` 配置：

```dotenv
REPROLENS_GITHUB_TOKEN=github-token
```

可选 Webhook 模式还需配置 `REPROLENS_GITHUB_WEBHOOK_SECRET`，并把 GitHub Webhook 地址设为 `/api/github/webhook`。公开 Issue 即使不配置 Token 也可手动导入，但不能发布评论或 Check。

## 生产模式

Windows PowerShell：

```powershell
npm run build
npm start
```

macOS / Linux：

```bash
npm run build
npm start
```

打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)。Node API 会同时托管构建后的前端页面。

## 项目结构

```text
reprolens/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ server.ts         HTTP、SSE、Demo 页面
│  │  │  ├─ run-manager.ts    任务状态机与实时事件
│  │  │  ├─ scanner.ts        Playwright 浏览器 Worker
│  │  │  ├─ provider.ts       DeepSeek 规划、总结与降级
│  │  │  ├─ analyzer.ts       确定性证据分析和评分
│  │  │  ├─ quality.ts        质量门禁、设备评分和趋势
│  │  │  ├─ verification.ts   修复效果判定
│  │  │  ├─ visual-diff.ts    PNG 归一化与像素 Diff
│  │  │  ├─ github/           Issue 解析、API 客户端、Webhook 与报告发布
│  │  │  ├─ github-runner.ts  GitHub Actions 任务入口
│  │  │  ├─ store.ts          JSON 持久化
│  │  │  └─ demo-page.ts      自带故障演示商城
│  │  └─ tests/
│  └─ web/
│     └─ src/
│        ├─ App.tsx            工作台、运行详情和证据面板
│        ├─ GitHubImport.tsx   Issue 导入面板
│        ├─ GitHubSourceCard.tsx GitHub 同步状态卡片
│        ├─ api.ts             API 与 SSE 客户端
│        └─ styles.css         响应式视觉系统
├─ artifacts/                  运行截图，Git 忽略
├─ data/runs/                  任务记录，Git 忽略
├─ docs/
├─ .env.example
└─ package.json
```

## API

| Method | Path | 用途 |
|---|---|---|
| GET | `/health` | 服务与 Provider 状态 |
| GET | `/api/config` | 前端运行配置 |
| GET | `/api/runs` | 运行历史 |
| GET | `/api/quality/trends` | 最近 30 次页面质量趋势，可按 URL 过滤 |
| POST | `/api/runs` | 创建复现任务 |
| POST | `/api/runs/:id/verify` | 以历史任务为基线验证修复 |
| GET | `/api/runs/:id` | 查询单次运行 |
| GET | `/api/runs/:id/events` | SSE 实时事件流 |
| GET | `/api/github/status` | GitHub 集成状态，不返回 Token |
| POST | `/api/github/issues/import` | 从 Issue 创建或复用任务 |
| POST | `/api/github/runs/:id/publish` | 发布或更新 Issue 报告与 Check |
| POST | `/api/github/webhook` | 接收带签名的 Issue 标签事件 |
| GET | `/artifacts/:run/:file` | 截图证据 |
| GET | `/demo/shop` | 内置故障页面 |
| GET | `/demo/shop?fixed=1` | 内置修复后页面 |

创建任务示例：

```json
{
  "url": "http://127.0.0.1:8787/demo/shop",
  "issue": "移动端点击加入购物车后，数量没有更新并出现横向滚动。",
  "expected": "购物车数量更新为 1，页面无横向滚动。",
  "devices": ["desktop", "iphone13", "pixel7"],
  "qualityGate": {
    "enabled": true,
    "minScore": 75,
    "maxHighSeverityFindings": 0,
    "maxAccessibilityIssues": 3,
    "maxPerformanceIssues": 2
  }
}
```

## 设计原则

1. Evidence before opinion：确定性浏览器证据优先于模型猜测。
2. Bounded autonomy：模型只能调用白名单浏览器动作。
3. Human readable：每个结论都要能在 UI 中看到来源。
4. Graceful fallback：模型故障不能让基础检测失效。
5. Deliver artifacts：最终交付截图、报告和可执行测试，而不是聊天文字。

更多说明见 [版本说明](docs/VERSIONS.md)、[产品设计](docs/PRODUCT_SPEC.md) 和 [架构文档](docs/ARCHITECTURE.md)。

## 验证

```powershell
npm run check
```

该命令执行单元测试、API TypeScript 构建和 React 生产构建。

## 安全边界

当前版本面向本机和可信内网开发环境。它允许访问用户输入的 HTTP/HTTPS 地址，方便验证 localhost 项目。不要在没有身份认证、URL allowlist、私网地址限制和任务配额的情况下直接暴露到公网。

`.env`、运行数据和截图均已加入 `.gitignore`，真实 API Key 不会进入 Git 提交。

## 迭代路线

| 版本 | 用户闭环 | 状态 |
|---|---|---|
| v0.1.0 | 从 Bug 描述到浏览器证据和回归测试 | 已完成 |
| v0.2.0 | 从故障基线到修复验证和像素 Diff | 已完成 |
| v0.3.0 | 从 GitHub Issue 到 Checks 证据报告 | 已完成 |
| v0.4.0 | 从 Bug 复现到 WCAG、Web Vitals、质量门禁和趋势 | 当前版本 |
| v0.5.0 | Docker Worker 与并发任务队列 | 候选 |

版本范围会根据真实使用需求调整；未进入当前版本的能力不会提前堆入主流程。

## License

[MIT](LICENSE)
