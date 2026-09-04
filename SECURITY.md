# Security Policy

ReproLens 当前设计为本机和可信内网环境中的开发工具。

请不要把未经保护的 API 服务直接暴露到公网。当前版本为了扫描本地项目而允许 localhost 和私网地址。多用户部署必须先增加身份认证、网络出口控制、URL allowlist、请求配额和浏览器容器隔离。

不要在 Issue、日志或截图中提交 API Key、Cookie、访问令牌或真实用户数据。如果发现安全问题，请通过仓库的私密安全报告渠道联系维护者。

GitHub 集成遵循以下边界：

- `REPROLENS_GITHUB_TOKEN`、`GITHUB_TOKEN` 和 `REPROLENS_GITHUB_WEBHOOK_SECRET` 仅从运行环境读取，不写入配置文件、运行记录或前端响应。
- Actions 工作流仅申请 `contents: read`、`issues: write`、`checks: write`。
- Webhook 必须携带有效的 `X-Hub-Signature-256`，服务按原始请求体进行 HMAC-SHA256 校验。
- 来自 Fork Pull Request 的工作流不应获取仓库 Secret；不要使用 `pull_request_target` 执行不受信任代码。
- Issue 中的 URL 仍属于不可信输入；公网部署前必须增加出站网络控制、私网地址阻断和域名 allowlist。
