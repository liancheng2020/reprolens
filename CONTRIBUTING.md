# Contributing

感谢你关注 ReproFlow AI。

## 本地开发

1. Fork 并克隆仓库。
2. 复制 `.env.example` 为 `.env`。
3. 执行 `npm install` 和 `npm run browser:install`。
4. 执行 `npm run dev`。
5. 提交前运行 `npm run check`。

## Pull Request

- 每个 PR 聚焦一个问题。
- 行为变化需要补充测试。
- UI 变化建议附前后截图。
- 不要提交 `.env`、运行数据、截图证据或真实站点数据。
- Agent 新动作必须经过白名单验证，并说明安全边界。

## Commit

推荐使用简短的 Conventional Commits，例如：

```text
feat: add GitHub issue trigger
fix: deduplicate findings across devices
docs: explain public deployment boundary
```
