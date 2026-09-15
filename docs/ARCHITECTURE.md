# 架构设计

本文描述当前实现；使用操作见 [使用说明](USAGE.md)，验证证据见 [测试与评测](VALIDATION.md)。

## 定位与主流程

ReproLens 面向前端、测试和开源维护者，将问题描述转成可确认、可执行、可核查的浏览器复现流程。一级入口是工作台和运行记录；评测属于开发者工具，通用质量审计是可选补充。

```text
React 工作台：URL / 问题 / 预期 / 设备
  -> POST /api/plans
  -> 可选初始页面观察 -> DeepSeek 候选计划 -> Zod 校验
  -> 用户编辑与确认
  -> POST /api/runs -> RunManager -> Playwright 顺序执行
  -> 步骤证据 / 截图 / 执行事件 -> JSON Store + SSE -> 结果页
  -> POST /api/runs/:id/verify -> 基线计划重放
  -> 同标准核对 + 步骤前后比较 -> verification.business
  -> 回归测试 / 可选 GitHub 报告
```

## 模块职责

源码根目录为 `apps/api/src`，前端位于 `apps/web/src`。

| 模块 | 职责 |
| --- | --- |
| `repro-plan.ts` | Zod 契约、计划字段与步骤约束、规划提示 |
| `provider.ts` | DeepSeek 调用、JSON/计划校验、错误分类与模板降级 |
| `page-observation.ts` | 授权 origin 下提取有限初始页面元素元数据 |
| `run-manager.ts` / `store.ts` | queued/running/completed/failed 状态、证据落盘与 SSE |
| `scanner.ts` | 各设备隔离浏览器上下文、执行调度、截图和运行错误采集 |
| `business.ts` / `ui-check.ts` | 定位、动作、业务断言、有限 UI 探针 |
| `business-test.ts` | 根据已确认计划确定性生成 Playwright 测试 |
| `business-verification.ts` | 核对检查标准，关联步骤证据，防止误报修复 |
| `verification.ts` / `visual-diff.ts` | 组织验证结果，保留辅助质量比较与像素 Diff |
| `analyzer.ts` / `quality.ts` | 附加发现、质量指标、门禁与趋势，不代替业务结论 |
| `github/` | Issue 导入、Webhook 验签、报告发布及 Check 适配 |
| `evaluation/` | 固定样本执行器评测及独立模型对照 |

模型只提出计划，不直接判断 Bug 或修复成功。它不能返回任意 JavaScript 执行；当前不是多轮原生 Tool Calling 或动态重规划系统。

## 计划与执行契约

- `ReproPlan`：目标、范围、警告和最多 15 个有序步骤。
- `ReproStep`：动作是 click/input/assert/reload，用途为 setup/check。核心检查前必须有场景可见性或 URL 前置断言。
- `ReproTarget`：精确 label、placeholder、text、role 或高级 CSS。执行时逐步重新定位，目标歧义不猜测。
- `StepEvidence`：设备、步骤索引、用途、状态、期望、实际、定位和前后截图。
- `BusinessReport`：各设备结论、核心覆盖、步骤列表与测试生成状态。

输入验证使用键盘输入和失焦后值检查，不用直接修改 DOM 绕过缺陷。UI 遮挡检查使用目标边界与中心命中，不自动滚动来消除待验证问题，不代表设计稿一致性或每个像素无遮挡。

受限响应检查依据操作后的同源路径、方法与唯一匹配；时间关联不是后端因果证明。每步有超时，每设备有 90 秒调度预算；预算耗尽不再调度新步骤，在途步骤仍受各自超时限制。

未确认计划、前置受阻或定位歧义不能冒充 Bug。核心断言失败可判 reproduced，完整核心检查通过才判此路径 not_reproduced；不足以判断时为 inconclusive。执行状态与业务结论分开记录。

## 模型输入与失败处理

模型收到用户描述和可选初始观察，不接收整页 DOM。JSON 输出模式、Zod 与人工确认分别约束格式、契约和业务语义；temperature=0 不保证确定性。

模型调用超时为 25 秒，自动重试关闭。未配置、非法 JSON、非法计划、超时或请求失败返回带原因的待编辑模板，不算模型成功。模型提出的副作用授权统一重置为 false。

详细规划调用包含模型、Prompt 版本、实际 token、耗时和校验错误；缺失用量为 null。合成模型对照可保存原始输出，普通规划不会将原文落盘，也不能宣称每个运行已经完整关联所有模型 Trace。

## 修复验证

业务结论来自 `verification.business`：完整计划对象、排序后的设备列表、问题与预期必须一致，允许目标 URL 变化。按设备和步骤索引关联证据，拒绝重复、越界和阶段不一致的记录。

基线须确有核心失败，本次所有步骤须通过，才给出范围内修复通过。缓存的 covered/total 不代替逐项证据；标准改变、缺步骤、执行受阻或基线未复现不能判修复成功。完整状态表见 [使用说明](USAGE.md#复现与修复)。

旧 `verification.status` 是辅助质量/视觉结果。像素 Diff 失败只产生警告，不覆盖业务判定；旧记录不会被追溯包装为已验证业务修复。完整计划比较偏保守，文案变更也可能导致不可比较。

## 存储与协作

运行 JSON 位于 `data/runs/{id}.json`，截图位于 `artifacts/{id}/`，均默认忽略提交。执行事件持久化后经 SSE 广播，前端可重新获取保存的结果；不等于服务重启后自动恢复执行中的任务。

GitHub 适配层复用 RunManager，处理 Issue、提交和发布状态；评论按隐藏标记更新，Webhook 使用原始请求体 HMAC 验签。未确认计划的自动任务不能证明问题。不可比较与证据不足的业务验证映射为 neutral；用户启用的独立质量门禁仍可阻断 Check。

## 安全与边界

仅用于本机或可信授权测试站点。计划确认不等于完整授权系统；危险动作识别是启发式，输入和页面加载本身也可能触发副作用。

页面观察有 origin 与请求约束，详见 [使用说明](USAGE.md#页面观察)。执行侧不能据此宣称拥有同等的完整网络隔离。密码控件截图遮罩与有限文本脱敏不保证敏感数据全部消除。

尚未实现公网多租户、自动代码修复、托管登录态、动态重规划或完整网络沙箱。开放公网前优先补认证、URL/DNS/IP 限制、隔离 Worker、任务配额和证据保护；队列、数据库等应由实际需求驱动。
