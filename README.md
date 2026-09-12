# ReproLens

> 复现 Web UI 与交互问题，留下可核查的证据，并验证修复。

面向前端开发者、测试工程师和开源维护者的可视化 Bug 复现工具。输入目标页面、问题与期望结果，确认计划后由 Playwright 执行，并展示每一步的期望、实际结果和截图。

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-5FA04E)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-visual_dashboard-61DAFB)](https://react.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-browser_worker-2EAD33)](https://playwright.dev/)
[![License](https://img.shields.io/badge/license-MIT-8CF7C7)](LICENSE)

## 操作演示

[![点击观看 ReproLens 真实操作演示](docs/media/reprolens-demo-poster.png)](docs/media/reprolens-demo.mp4)

[▶ 观看 / 下载视频（约 41 秒，MP4）](docs/media/reprolens-demo.mp4)

输入框无法输入 → 确认计划 → 真实执行 → 查看失败证据 → 修复后重放 → 核心检查通过。

视频使用本地真实 API 和 Chromium，带中文字幕、无配音；采用无 Key 安全模板并人工确认定位，不演示模型规划。如果无法直接播放，请下载后打开。

## 当前版本：v0.5.0

**业务断言驱动的复现**：围绕用户指定的问题执行检查，页面质量报告只作为补充，不用于判断目标 Bug 是否复现。

- **确认计划**：编辑前置场景、目标控件、动作、测试值和核心检查项；DeepSeek 可辅助规划，无 Key 时提供待编辑的安全模板。
- **真实执行**：支持键盘输入与失焦后值验证，以及文本、状态、URL 和受限响应检查；目标不唯一或前置条件失败时报告证据不足。
- **可视化证据**：多设备截图、实时执行时间线，以及逐步的通过、失败、受阻和跳过状态。
- **修复验证**：重放已确认的计划，检查修复后的业务结果，并提供 Before / After / Pixel Diff 辅助对比。
- **测试与协作**：生成 Playwright 回归测试，支持 GitHub Issue 导入和结果发布；未确认计划的自动任务不能证明目标问题。
- **附加质量报告**：WCAG、Web Vitals、Console / Network 证据、质量门禁与趋势。

当前为用户确认的顺序计划，不支持动态分支重规划。定位建议需人工核对；“此路径未复现”不等于全站无 Bug，“已生成测试”不等于已运行验证。

## 两条复现示例

工作台可直接载入固定示例计划，核对确认后走真实任务链路，无需调用模型：

- **UI：手机弹窗按钮被遮挡**。对比桌面和手机，检查确定按钮是否完整位于视口内、中心是否被工具栏遮挡，再验证点击反馈。
- **交互：输入失焦后内容丢失**。键盘输入后检查值，失焦后再次检查，检出内容回滚。

任务完成后点击 **验证修复**，示例会预填修复版地址，使用同一计划重放。先看目标问题的步骤证据，再按需展开附加页面质量发现；截图 Diff 和质量评分不代替用户描述的问题。

当前不支持仅凭一句“界面不好看”自动判断设计正确性。UI 检查有明确范围：目标边界和中心命中，不保证完整区域无遮挡、所有祖先裁剪或设计稿一致性。

## 开发者自检

评测实验室位于左侧折叠的 **开发者工具** 中，用于检查 ReproLens 自身，不是用户复现 Bug 的必经步骤。保留 20 条固定用例和双版本回归验证。

```sh
npm run eval:smoke
# 按需运行全部 20 条：npm run eval:full
```

无需 API Key；CLI 自动启动隔离演示服务器。这里验证的是执行器与回归测试，不是模型规划能力。设计、指标口径和产物说明见 [评测文档](docs/EVALUATION.md)。

## 快速开始

需要 Node.js 20+（推荐 22）。以下命令在仓库根目录执行，Windows PowerShell、macOS 和 Linux 通用。

```sh
npm install
npm run browser:install
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)，填写问题 → 点击“生成复现计划” → 编辑并确认检查项 → 点击“按确认计划执行”。

**可选模型配置**：将 `.env.example` 复制为 `.env`（已有则跳过），填写 `DEEPSEEK_API_KEY` 后启动或重启服务。不配置也能使用安全模板和浏览器执行。

复制命令：Windows 使用 `Copy-Item .env.example .env`；macOS / Linux 使用 `cp .env.example .env`。

**构建后运行**：

```sh
npm run build
npm start
```

打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)，API 同时托管前端。项目面向本地使用，不提供在线任务提交服务。

## 开发与验证

```sh
npm run check
```

执行单元测试及前后端构建。浏览器专项验证和已知限制见 [测试报告](docs/TEST_REPORTS.md)。

重新录制演示：先安装支持 `libx264` 的 FFmpeg（加入 PATH，或设置 `FFMPEG_PATH` 为可执行文件路径），执行 `npm run build`，再运行 `node scripts/record-demo.mjs`。脚本使用隔离的本地服务与测试页面，不调用模型或覆盖已有任务；更新 `docs/media` 中的 H.264 MP4 视频和封面，原始录像与执行证据保留在终端输出的临时目录。

## 项目与文档

- `apps/web`：React 工作台、计划编辑、运行记录和证据展示。
- `apps/api`：任务管理、Playwright 执行、业务断言、质量分析与 GitHub 集成。
- `scripts`：验证与录制工具；`data/runs`、`artifacts`：本地任务和截图。

[版本说明与当前设计](docs/VERSIONS.md) · [产品说明](docs/PRODUCT_SPEC.md) · [架构文档](docs/ARCHITECTURE.md) · [测试报告](docs/TEST_REPORTS.md)

GitHub 集成配置见 [仓库配置](.github/reprolens.yml) 和 [Actions 工作流](.github/workflows/reprolens.yml)。本地发布结果需要配置 `REPROLENS_GITHUB_TOKEN`；自动任务仍受计划确认限制。

## 安全与许可

仅对已授权的本机或可信测试环境运行。直接开放公网前，需要补齐身份认证、目标地址限制和任务配额。不要提交真实密钥、个人信息或敏感截图；`.env` 和运行数据默认被 Git 忽略。

[MIT License](LICENSE)
