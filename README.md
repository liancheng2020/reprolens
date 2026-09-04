# ReproFlow AI

> Turn vague bug reports into reproducible visual evidence and regression tests.

ReproFlow AI 是一个面向前端开发者、测试工程师和开源维护者的可视化 Bug 复现 Agent。输入目标页面、问题描述和期望结果，它会操作真实 Chromium，在多种设备尺寸下采集截图、DOM 指标、Console 与 Network 证据，最后交付结构化报告和 Playwright 回归测试。

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-5FA04E)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-visual_dashboard-61DAFB)](https://react.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-browser_worker-2EAD33)](https://playwright.dev/)
[![License](https://img.shields.io/badge/license-MIT-8CF7C7)](LICENSE)

## 第一版已经实现

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
   Screenshot DOM   Console/Network
      └───────┼────────┘
              ▼
        确定性证据分析
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
cd E:\ReproFlow-AI
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
cd /path/to/ReproFlow-AI
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
ReproFlow-AI/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ server.ts         HTTP、SSE、Demo 页面
│  │  │  ├─ run-manager.ts    任务状态机与实时事件
│  │  │  ├─ scanner.ts        Playwright 浏览器 Worker
│  │  │  ├─ provider.ts       DeepSeek 规划、总结与降级
│  │  │  ├─ analyzer.ts       确定性证据分析和评分
│  │  │  ├─ store.ts          JSON 持久化
│  │  │  └─ demo-page.ts      自带故障演示商城
│  │  └─ tests/
│  └─ web/
│     └─ src/
│        ├─ App.tsx            工作台、运行详情和证据面板
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
| POST | `/api/runs` | 创建复现任务 |
| GET | `/api/runs/:id` | 查询单次运行 |
| GET | `/api/runs/:id/events` | SSE 实时事件流 |
| GET | `/artifacts/:run/:file` | 截图证据 |
| GET | `/demo/shop` | 内置故障页面 |

创建任务示例：

```json
{
  "url": "http://127.0.0.1:8787/demo/shop",
  "issue": "移动端点击加入购物车后，数量没有更新并出现横向滚动。",
  "expected": "购物车数量更新为 1，页面无横向滚动。",
  "devices": ["desktop", "iphone13", "pixel7"]
}
```

## 设计原则

1. Evidence before opinion：确定性浏览器证据优先于模型猜测。
2. Bounded autonomy：模型只能调用白名单浏览器动作。
3. Human readable：每个结论都要能在 UI 中看到来源。
4. Graceful fallback：模型故障不能让基础检测失效。
5. Deliver artifacts：最终交付截图、报告和可执行测试，而不是聊天文字。

更多实现说明见 [架构文档](docs/ARCHITECTURE.md)。

## 验证

```powershell
npm run check
```

该命令执行单元测试、API TypeScript 构建和 React 生产构建。

## V1 安全边界

当前版本面向本机和可信内网开发环境。它允许访问用户输入的 HTTP/HTTPS 地址，方便验证 localhost 项目。不要在没有身份认证、URL allowlist、私网地址限制和任务配额的情况下直接暴露到公网。

`.env`、运行数据和截图均已加入 `.gitignore`，真实 API Key 不会进入 Git 提交。

## Roadmap

- [x] 可视化工作台与实时 Agent 时间线
- [x] 多设备 Playwright 复现
- [x] DeepSeek + 确定性降级
- [x] Evidence-based Playwright 测试
- [ ] GitHub App 与 Issue 标签触发
- [ ] GitHub Checks 证据报告
- [ ] 自动创建测试 PR
- [ ] Before / After 修复验证
- [ ] 截图基线和像素 Diff
- [ ] axe-core 完整可访问性扫描
- [ ] Docker Worker 与并发任务队列

## License

[MIT](LICENSE)
