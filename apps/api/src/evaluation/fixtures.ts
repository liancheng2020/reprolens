import express from "express";
import type { Server } from "node:http";
import { evalCases } from "./cases.js";

// Both versions share markup and actions; only the seeded failure changes.
export function fixtureHtml(fixture: string, fixed: boolean): string {
  const broken = !fixed;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ReproLens 表单验证</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f7f7;color:#182523;font:16px/1.6 system-ui}header{padding:20px 24px;background:#172724;color:#fff;display:flex;justify-content:space-between;gap:16px}main{max-width:640px;margin:48px auto;padding:0 24px}h1{font-size:28px;letter-spacing:0}label{display:block;margin:24px 0 8px}input{width:100%;font:inherit;padding:12px;border:1px solid #879995;border-radius:6px}button{font:inherit;padding:10px 20px;background:#136e59;color:white;border:0;border-radius:6px;margin-top:24px;cursor:pointer}#result{margin-top:24px;color:#12664b}small{color:#52625f}a{color:inherit}@media(max-width:480px){header{flex-wrap:wrap}main{margin-top:24px}}
  </style><header><strong>ReproLens / 测试沙箱</strong><span>${fixed ? "修复版" : "缺陷 / 受阻版"}</span></header>
  <main><h1>${fixture === "setup" && broken ? "页面不可用" : "个人资料"}</h1><small>显示名称</small>
  <label for="name">显示名称</label><input id="name" autocomplete="off" ${fixture === "disabled" && broken ? "disabled" : ""} ${fixture === "readonly" && broken ? "readonly" : ""}>
  ${fixture === "ambiguous" && broken ? '<label for="other">显示名称</label><input id="other">' : ""}
  <button id="action" type="button">${fixture === "danger" && broken ? "删除账户" : "保存草稿"}</button>
  <div id="result" role="status" ${["missing", "delayed"].includes(fixture) || (fixture === "hidden" && fixed) ? "hidden" : ""}>${fixture === "text" && broken ? "保存失败" : "保存成功"}</div>
  <p><a href="?fixed=${fixed ? "0" : "1"}">${fixed ? "查看缺陷版" : "查看修复版"}</a></p></main>
  <script>
  const field=document.querySelector('#name'), result=document.querySelector('#result');
  field.addEventListener('blur',()=>{if(${fixture === "blur" && broken}) field.value='';});
  document.querySelector('#action').addEventListener('click',()=>{document.body.dataset.actionExecuted='true';result.textContent='保存成功';});
  if(${["missing", "delayed"].includes(fixture) && fixed}) setTimeout(()=>{result.hidden=false},${fixture === "delayed" ? 600 : 0});
  </script></html>`;
}

export function fixtureRouter() {
  const router = express.Router();
  router.get("/:fixture", (req, res) => {
    if (!evalCases.some(item => item.fixture === req.params.fixture)) { res.status(404).json({ error: "演示场景不存在" }); return; }
    res.type("html").send(fixtureHtml(req.params.fixture, req.query.fixed === "1"));
  });
  return router;
}

export async function startFixtureServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const app = express();
  app.use("/demo/eval", fixtureRouter());
  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("演示服务器启动失败");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }) };
}
