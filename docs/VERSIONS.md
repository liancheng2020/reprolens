# ReproLens 版本说明

本文档用于快速了解 ReproLens 每个版本解决的问题、核心能力和用户能够看到的结果。

## 版本总览

| 版本 | 主题 | 解决的问题 | 直观产物 | 状态 |
|---|---|---|---|---|
| v0.1.0 | Bug 自动复现 | Bug 描述模糊、人工复现耗时 | 浏览器截图、执行时间线、问题报告、Playwright 测试 | 已完成 |
| v0.2.0 | 修复效果验证 | 修改代码后无法快速确认问题是否真正修复 | Before / After / Diff、质量分变化、修复结论 | 已完成 |
| v0.3.0 | GitHub 协作闭环 | 验证结果停留在本地，无法融入研发协作 | Issue 自动任务、GitHub Check、Issue 报告、Actions Artifact | 已完成 |
| v0.4.0 | 页面质量分析 | 现有检查维度有限，难以覆盖完整页面质量 | WCAG、Web Vitals、质量门禁和趋势报告 | 当前版本 |
| v0.5.0 | 工程化执行平台 | 本地单进程不适合并发和团队使用 | Docker Worker、任务队列、隔离执行 | 候选版本 |

## 演进路线

```text
v0.1 自动复现
   │  找到并记录问题
   ▼
v0.2 修复验证
   │  判断修改是否有效
   ▼
v0.3 GitHub 协作
   │  把结果带入 Issue 和 Checks
   ▼
v0.4 质量扩展
   │  增加可访问性与性能维度
   ▼
v0.5 执行平台
      支持隔离、并发和团队化运行
```

## v0.1.0：从 Bug 描述到复现证据

### 版本目标

让用户只需要提供目标页面、问题描述和期望结果，就能获得一次可以查看、保存和复用的自动化复现结果。

### 核心能力

- 使用真实 Chromium 打开并操作目标页面。
- 支持 Desktop、iPhone 13、Pixel 7 三种设备尺寸。
- DeepSeek 根据 Issue 和页面可交互元素规划受限操作。
- 模型只能使用 click、fill、wait 白名单动作，不能执行任意脚本。
- 通过 SSE 实时展示 Agent 执行时间线。
- 采集页面截图、Console Error、Page Error 和 HTTP 错误。
- 检测横向溢出、图片替代文本、无名称控件和内容裁切。
- 输出复现结论、置信度、质量评分、结构化发现和 Playwright 测试。
- 没有 DeepSeek API Key 时自动使用本地确定性规则。

### 用户看到的结果

一次任务结束后，运行详情会展示：

1. 问题是否成功复现。
2. Agent 执行过哪些操作。
3. 不同设备下的页面截图。
4. 每个问题对应的浏览器证据。
5. 可以复制执行的 Playwright 回归测试。

## v0.2.0：从复现结果到修复验证

### 版本目标

让用户在修改代码后，用同一套问题描述、操作路径和设备重新验证，并直观看出修复前后的差异。

### 核心能力

- 将任意已完成任务设为不可变基线。
- 对修复后的 URL 重放相同验证流程。
- 按设备生成 Before、After 和 Pixel Diff。
- 对不同高度的页面截图进行白色画布归一化。
- 统计像素变化率、质量分变化、已解决问题和新引入问题。
- 输出 improved、regressed、changed 或 unchanged 确定性结论。
- 内置 Demo 同时提供故障版与修复版，方便快速演示。

### 用户看到的结果

```text
修复前截图          修复后截图          像素差异图
   Before      →      After       →       Diff
                         │
                         ▼
          评分变化 + 已解决问题 + 新问题
                         │
                         ▼
              修复有效 / 发生回归
```

## v0.3.0：从本地验证到 GitHub 协作

### 版本目标

让开源维护者和研发团队直接从 GitHub Issue 发起验证，并在原有协作位置查看结果。

### 核心能力

- 在工作台粘贴 GitHub Issue URL 创建任务。
- 自动解析 Issue 中的 Target URL、Problem、Expected behavior 和 Device。
- 支持 `needs-reproduction` 标签触发 GitHub Actions。
- 支持在 Actions 页面输入 Issue 编号手动执行。
- 使用 repository、Issue number 和 commit SHA 识别重复任务。
- 创建 GitHub Check Run，并同步进行中和最终状态。
- 在 Issue 中发布结构化报告，重复发布时更新原评论。
- Actions Artifact 包含截图、Pixel Diff、Run JSON、Markdown 报告和 Playwright 测试。
- 运行详情展示仓库、Issue、commit、Check 状态和 GitHub 跳转链接。
- 可选 Webhook 模式支持 HMAC-SHA256 签名验证。

### 用户看到的结果

```text
GitHub Issue / needs-reproduction 标签
                  │
                  ▼
          GitHub Actions 启动
                  │
                  ▼
         ReproLens 浏览器验证
            ┌─────┴─────┐
            ▼           ▼
      GitHub Check   Issue 报告
            │           │
            └─────┬─────┘
                  ▼
       下载截图、Diff 和测试文件
```

## v0.4.0：页面质量分析

### 版本目标

在 Bug 复现之外，增加更完整的页面质量检查，让 ReproLens 可以用于提交前检查和持续质量回归。

### 核心能力

- 集成 axe-core，按 WCAG 2 A/AA 规则输出可访问性问题。
- 按设备采集 LCP、CLS、INP、FCP、TTFB、DOM Ready、资源数量和传输体积。
- 使用确定性阈值生成性能 Finding，不由模型判断指标好坏。
- 在运行详情展示设备评分、指标评级、DOM 选择器、元素坐标和修复建议。
- 在运行记录按页面筛选质量趋势，并汇总设备平均分与问题类型。
- 支持最低评分、高严重度、可访问性和性能问题数四种质量阈值。
- GitHub Check 在质量门禁失败时返回 failure，并在 Issue 报告中列出原因。
- 旧版运行数据继续可读，不要求迁移 JSON Store。

### 用户看到的结果

每次任务除复现结论外，还会交付一份页面质量报告：质量门禁状态、设备级 Web Vitals、WCAG 问题定位、修复建议和历史质量趋势。

## v0.5.0：隔离执行与任务队列

### 规划目标

把当前适合本机使用的单进程工具扩展为可承载并发任务的工程化执行服务。

### 候选需求

- 使用 Docker 隔离每个浏览器任务。
- 引入任务队列、并发限制、超时和重试策略。
- 将 JSON Store 替换为数据库和对象存储。
- 增加 Worker 状态、队列长度和任务资源监控。
- 为团队部署补充身份认证、权限、配额和网络出口控制。

该版本属于候选方向，不代表已经承诺的交付范围。

## 版本边界

ReproLens 按“一个版本解决一个完整用户问题”的方式迭代：

- v0.1 负责复现问题。
- v0.2 负责验证修复。
- v0.3 负责连接 GitHub 协作。
- v0.4 计划扩展质量检测维度。
- v0.5 候选解决规模化执行。

自动修改业务代码、未经确认创建 Pull Request、托管登录态和公网多租户执行不属于当前版本范围。
