# ReproLens

> 把 Web Bug 描述转成可执行的复现步骤，用证据验证问题与修复。

面向前端开发者、测试工程师和开源维护者的 Bug 复现工具。DeepSeek 辅助生成计划，用户确认后由 Playwright 执行，输出步骤证据、修复对比和回归测试。

**描述问题 → 确认计划 → 浏览器执行 → 查看证据 → 验证修复**

## 操作演示

[![观看 ReproLens 操作演示](docs/media/reprolens-demo-poster.png)](docs/media/reprolens-demo.mp4)

[观看 / 下载视频](docs/media/reprolens-demo.mp4)（约 41 秒）。视频为此前的真实执行录屏，使用人工确认的安全模板，不演示模型规划；结果页以当前代码为准。

## 核心能力

- **辅助规划**：结合问题描述与可选的页面结构观察生成检查计划，支持人工编辑和确认。
- **真实复现**：检查输入失焦丢值、按钮遮挡、文本与状态等问题；前置条件失败或定位歧义时报告证据不足。
- **证据可查**：展示桌面与手机视口下的步骤状态、期望、实际值、截图和实时执行事件。
- **修复验证**：沿用相同计划、设备和预期逐项对比；缺步骤或改变标准不会被判为修复成功。
- **回归与协作**：生成 Playwright 测试，支持 GitHub Issue 导入和结果发布。

内置“购物车数量不变”“手机弹窗按钮被遮挡”和“输入失焦后内容丢失”三组缺陷/修复示例，无需模型 Key 即可体验完整执行流程。

## 快速开始

需要 Node.js 20+。在仓库根目录执行：

```sh
npm install
npm run browser:install
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)，载入示例或填写页面、问题与预期，确认计划后执行。

**启用模型（可选）**：将 [`.env.example`](.env.example) 复制为 `.env`，填写 `DEEPSEEK_API_KEY` 后重启服务。不配置时可使用固定示例和待编辑模板。

构建后运行：

```sh
npm run build
npm start
```

打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)，API 同时托管前端。

## 技术与验证

React / TypeScript 工作台 + Node.js / Express API + DeepSeek 规划 + Zod 校验 + Playwright 执行 + SSE 事件流。

```sh
npm run check       # 单元测试与前后端构建
npm run eval:smoke  # 无需 Key 的执行器冒烟验证
npm run demo:check  # 三组固定计划：缺陷复现 -> 同计划修复验证
```

通过缺陷/修复双版本检查执行与导出测试；另有小规模模型观察对照。样本结果与适用范围见 [测试与评测](docs/VALIDATION.md)。

## 使用边界

- 仅用于已授权的本机或可信测试环境，不应直接开放为任意 URL 的公网执行服务。
- 模型辅助规划，用户确认后顺序执行；不自动重规划或修改源代码。
- 结论仅覆盖指定计划和设备；生成测试不代表已自动重跑验证。
- 通用质量扫描默认关闭，像素变化和质量评分不代替业务修复判定。
- 最多 15 步，支持点击、输入、刷新及文本/值/显隐/可编辑性/URL/请求/有限遮挡断言。不支持通用拖拽、文件上传、验证码和任意网站自主探索；手机为 Chromium 视口模拟，不是真机 Safari。
- 购物车示例依赖已知初始值 0，检查结果为 1；不支持通用变量提取和“原值 +1”表达式。
- 模型失败只返回待编辑模板，不代表目标场景已被理解；必须替换占位定位和预期，不能直接拿模板当有效复现计划。
- 工作台检查浏览器能否启动；任务创建前再次检查，失败返回 `BROWSER_UNAVAILABLE`，不保存无效任务。安装后点击“重新检查”。检查通过不代表目标网页可访问或计划正确。

## 文档

[使用说明](docs/USAGE.md) · [架构](docs/ARCHITECTURE.md) · [测试与评测](docs/VALIDATION.md) · [GitHub 配置](.github/reprolens.yml) · [Actions 工作流](.github/workflows/reprolens.yml)

[MIT License](LICENSE)
