# ReproLens 架构

## 总览

```text
React Dashboard
  │ POST /api/runs
  │ GET  /api/runs/:id/events
  ▼
Run Manager ───────────────► JSON Run Store
  │                              │
  │ invokes                      └─ data/runs
  ▼
Browser Scanner
  ├─ DeepSeek Planner
  ├─ Playwright Chromium
  ├─ Screenshot Collector
  ├─ Console/Network Collector
  └─ Deterministic Analyzer
          │
          ▼
  Evidence + Regression Test
```

## 模块职责

### React Dashboard

负责任务输入、运行历史、实时状态、设备截图、结构化发现和测试代码展示。前端通过 EventSource 订阅 SSE，不需要高频轮询。

### Run Manager

维护 queued、running、completed、failed 四种状态。每一步都会先写入本地 Run Store，再广播给浏览器，刷新页面后不会丢失结果。

### DeepSeek Provider

当前承担两类判断：

1. 根据 Bug 描述和可交互元素选择复现动作。
2. 根据确定性发现总结证据是否支持 Bug。

模型不能返回任意 JavaScript。动作会被收敛为 click、fill、wait，并再次校验目标元素 ID 和最大步数。API 故障时自动切换本地规则。

### Browser Scanner

为每个设备创建隔离 BrowserContext，收集 Console、Page Error、HTTP 失败请求、DOM 尺寸和截图。第一版顺序执行设备，方便控制资源占用和保持时间线可读。

### Deterministic Analyzer

模型不负责像素尺寸、HTTP 状态和 DOM 属性判断。分析器从浏览器原始数据生成结构化 Finding，并按根因去重计算评分。

### Regression Test Generator

测试代码在本地确定性生成，只使用本轮真实操作过的控件，以及捕获到的 Network、Console 和布局证据。DeepSeek 不接收完整 DOM，也不决定最终选择器。

### Fix Verification

`verification.ts` 是无副作用的规则模块：按 `category + title` 对问题根因去重，对比基线与当前运行的质量分和问题集合，输出稳定的验证状态。它不读取文件，也不调用模型，因此可以独立测试和复用到 GitHub Checks。

`visual-diff.ts` 只负责图片 I/O：读取同设备的两张 PNG，在页面高度不同的情况下归一化到白色画布，调用 Pixelmatch 生成差异图并返回变化像素数。运行编排仍由 Run Manager 负责，模块之间不共享可变状态。

## 数据结构

每个 Run 包含：

- 输入 URL、Issue、Expected、Devices
- 状态、当前步骤、创建与结束时间
- Provider、模型和执行指标
- TimelineItem 数组
- Finding 数组
- ScreenshotArtifact 数组
- 可选的 baselineRunId 和 VerificationResult
- verdict、confidence、score、summary
- generatedTest

持久化位置为 `data/runs/{runId}.json`，截图位于 `artifacts/{runId}`。两个目录都不会进入 Git。

## 安全模型

- URL 只接受 HTTP 和 HTTPS。
- 请求体限制为 256 KB。
- 模型动作使用白名单和步数上限。
- 模型不能执行 evaluate、shell、文件系统或任意导航。
- API Key 只从被忽略的 `.env` 读取。
- 完整 DOM 不会发送给外部模型。
- 错误响应不会输出 API Key。

V1 允许访问 localhost，方便测试本地项目。因此它是本地开发工具，不是可直接暴露公网的多租户服务。公网部署前必须补充身份认证、DNS/IP 重绑定防护、私网地址阻断、URL allowlist、任务配额和容器级隔离。

## 扩展点

- Provider 接口：增加 OpenAI、Ollama 或其他 OpenAI-compatible Provider。
- Analyzer：增加 axe-core 和 Web Vitals。
- Store：从 JSON 切换 PostgreSQL 和对象存储。
- Queue：从进程内任务切换 Redis/BullMQ。
- Trigger：增加 GitHub App、Issue label、PR check_suite。
- Worker：把 Browser Scanner 放入一次性 Docker 容器。
