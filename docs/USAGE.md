# 使用说明

## 复现与修复

填写 URL、问题、预期和设备，生成或载入计划，核对前置条件、目标定位和核心检查，再确认执行。固定示例使用预置计划，不调用模型；无 Key 时生成的是待编辑模板，不是模型规划结果。

任务完成后点击“验证修复”，示例会预填修复版地址。验证沿用基线计划，结果页显示失败/受阻证据与步骤前后对比。

| 结果 | 含义 |
| --- | --- |
| 范围内修复通过 | 基线确有核心失败；计划、设备、问题与预期一致；本次所有步骤通过 |
| 仍可复现 | 原失败检查再次失败 |
| 其他检查失败 | 其他核心项失败，需核查是否新增回归，不能直接归因于修复 |
| 证据不足 | 执行失败、受阻、跳过、缺步骤或证据不一致 |
| 不可比较 | 标准改变或缺少已确认计划 |
| 基线未复现 | 本次通过，但基线没有核心失败，不能据此证明修复 |

业务结果位于 `verification.business`；旧 `verification.status` 仅表示辅助质量/视觉指标。旧任务不追溯生成业务修复结论。再次验证以所选任务为基线；继续验证原 Bug 时，从原缺陷任务发起。

UI 检查中的“无遮挡”指目标边界在视口内、中心命中目标或其后代，不保证完整区域无遮挡、所有祖先裁剪或设计稿一致性。

## 可选配置

- **模型**：复制 `.env.example` 为 `.env`，填写 `DEEPSEEK_API_KEY` 后重启。已有 `.env` 不要覆盖。macOS / Linux 可用 `cp .env.example .env`，PowerShell 可用 `Copy-Item .env.example .env`。
- **页面观察**：生成计划前单独授权。origin 白名单包含端口；配置及限制见 [页面观察说明](#页面观察)。
- **质量扫描**：API 省略 `qualityScan` 或传 `false` 时不执行，传 `true` 才启用。`qualityGate.enabled` 只控制已开启扫描的门禁，不会自动开启扫描。未扫描不等于质量满分或零问题。
- **GitHub**：本地回写需要 `REPROLENS_GITHUB_TOKEN`；配置见 [仓库配置](../.github/reprolens.yml) 和 [工作流](../.github/workflows/reprolens.yml)。未确认计划的任务不能证明目标问题。

Console / Network 错误始终作为辅助线索保留，不直接决定目标 Bug 是否复现。

## 页面观察

默认不访问所填 URL。生成计划前勾选观察授权，先观察首个所选设备，再调用模型；观察失败会报错，不偷偷改成无观察规划。固定示例使用预置计划，不走模型观察。

服务端 .env 可配置完整 origin（含端口，多个用逗号分隔），修改后重启：

```dotenv
REPROLENS_BROWSER_CHANNEL=chrome
REPROLENS_OBSERVATION_ORIGINS=http://127.0.0.1:8787,https://your-authorized-test.example
```

不设置白名单时仅允许当前 API 的 localhost / 127.0.0.1 origin；更换端口需同步显式白名单。POST /api/plans 可传 `observePage: true`，计划 warnings 显示观察摘要，执行前仍需确认。

观察使用独立无头上下文，不复用个人登录态，不点击、填写或主动滚动。最多扫描 500 个节点、返回 50 个可见元素，每个名称最多 100 字符；仅收集标题、名称、候选定位、禁用/只读状态，不收集输入值、密码、整页 HTML、截图或响应体。

同 origin GET/HEAD 之外的请求、POST、跨域、WebSocket、Service Worker 和 HTTP 重定向被阻止。加载本身仍可能有副作用，不能保证只读；第三方资源被阻止也可能影响页面。

浏览器启动最多 10 秒、观察阶段最多 12 秒；初始等待窗口不保证 SPA 已就绪。未打开弹窗、延迟内容、iframe、Shadow DOM 或登录页面可能缺少目标，需人工核对。

有限脱敏与请求限制不是完整 Prompt Injection 防护或网络沙箱，不保证名称不含个人信息，也不解决 DNS 重绑定、浏览器漏洞及多租户隔离。不要观察敏感或未授权页面。

## 开发者验证

评测实验室位于折叠的“开发者工具”中，不是复现 Bug 的必经步骤。

```sh
npm run check
npm run eval:smoke
npm run eval:full
```

执行器评测无需 Key，CLI 启动隔离演示服务；完整用例、指标口径见 [评测说明](VALIDATION.md)。真实模型对照使用 `npm run eval:model`，需要有效 Key 并产生 API 调用费用，见 [模型对照说明](VALIDATION.md#model-evaluation)。

## 演示录制

安装支持 `libx264` 的 FFmpeg，加入 PATH 或设置 `FFMPEG_PATH`，执行 `npm run build` 后运行 `node scripts/record-demo.mjs`。

脚本使用隔离本地服务与测试页面，不调用模型；更新 `docs/media` 中的 MP4 和封面，原始录像和证据保留在终端输出的临时目录。录制后核对画面是否包含计划展示的最新功能，不把历史录像作为新增能力的证明。

## 安全

项目面向本地使用。开放公网前需补齐身份认证、目标地址与网络限制、任务配额和证据保护。不要提交真实密钥、个人信息或敏感截图；`.env` 和运行数据默认被 Git 忽略。
