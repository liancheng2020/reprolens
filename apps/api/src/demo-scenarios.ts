import express from "express";
import type { CreateRunInput } from "./types.js";
import { fixtureHtml } from "./evaluation/fixtures.js";

export interface DemoScenario extends Omit<CreateRunInput, "url"> { id: string; title: string; path: string }
export const demoScenarios: DemoScenario[] = [
  { id: "modal", title: "UI：手机弹窗按钮被遮挡", path: "/demo/modal?fixed=0", devices: ["desktop", "iphone13"],
    issue: "手机上打开编辑资料弹窗后，底部工具栏遮住确定按钮；桌面端正常。", expected: "弹窗确定按钮完整位于视口内，中心无遮挡，点击后显示资料已更新。",
    plan: { version: 1, objective: "检查不同视口下弹窗按钮遮挡与确认反馈", scope: "仅检查确定按钮的视口边界、中心命中与确认反馈；不评价整体视觉设计。", warnings: ["内置固定演示计划，未调用模型生成；请核对步骤后确认执行。"], steps: [
      { title: "确认资料页面", action: "assert", phase: "setup", assertion: "visible", target: { by: "role", role: "heading", value: "账户资料" }, allowSideEffect: false },
      { title: "打开编辑弹窗", action: "click", phase: "setup", target: { by: "role", role: "button", value: "编辑资料" }, allowSideEffect: false },
      { title: "确认弹窗已打开", action: "assert", phase: "setup", assertion: "visible", target: { by: "css", value: "#profile-dialog" }, allowSideEffect: false },
      { title: "检查确定按钮位置与遮挡", action: "assert", phase: "check", assertion: "unobscured", target: { by: "role", role: "button", value: "确定" }, allowSideEffect: false },
      { title: "确认本地演示修改", action: "click", phase: "setup", target: { by: "role", role: "button", value: "确定" }, allowSideEffect: false },
      { title: "核对确认反馈", action: "assert", phase: "check", assertion: "text", value: "资料已更新", target: { by: "css", value: "#feedback" }, allowSideEffect: false }
    ] } },
  { id: "profile", title: "交互：输入失焦后内容丢失", path: "/demo/profile?fixed=0", devices: ["desktop"],
    issue: "个人资料页填写显示名称后，离开输入框，刚输入的内容被清空。", expected: "键盘输入后，失焦仍保留输入内容。",
    plan: { version: 1, objective: "验证显示名称在输入和失焦后保持一致", scope: "仅检查普通文本框的输入与短时间失焦保留，不提交数据。", warnings: ["内置固定演示计划，未调用模型生成；请核对步骤后确认执行。"], steps: [
      { title: "确认个人资料页面", action: "assert", phase: "setup", assertion: "visible", target: { by: "role", role: "heading", value: "个人资料" }, allowSideEffect: false },
      { title: "输入并验证失焦后内容", action: "input", phase: "check", target: { by: "label", value: "显示名称" }, value: "repro-test", allowSideEffect: false }
    ] } }
];

export function modalDemoHtml(fixed: boolean) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>账户资料 · ReproLens</title><style>
  *{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui;color:#192b28;background:#f3f6f5}header{padding:18px 24px;background:#172724;color:#fff;display:flex;justify-content:space-between;gap:12px}main{max-width:680px;padding:40px 24px;margin:auto}h1{font-size:28px}h2{font-size:22px;margin:0 0 12px}button{font:inherit;border:0;border-radius:6px;background:#176b58;color:white;padding:12px 20px;cursor:pointer}.secondary{background:#e2e9e6;color:#192b28}a{color:#176b58}.backdrop{position:fixed;inset:0;background:#0007;z-index:15}.dialog{position:fixed;z-index:20;left:50%;top:50%;transform:translate(-50%,-50%);width:420px;max-width:calc(100% - 32px);background:white;border-radius:8px;padding:24px}.actions{display:flex;justify-content:flex-end;gap:12px;margin-top:32px}.toolbar{display:none}.avatar{width:64px;height:64px;border-radius:50%;background:#c7e8db;display:grid;place-items:center;font-size:24px;margin-bottom:24px}#feedback{min-height:30px;color:#176b58}
  @media(max-width:600px){.dialog{left:16px;right:16px;top:auto;bottom:20px;transform:none;width:auto;max-width:none}.toolbar{display:flex;position:fixed;z-index:${fixed ? 10 : 30};bottom:0;left:0;right:0;height:108px;align-items:center;justify-content:space-around;background:#172724;color:white;border-top:1px solid #526e66}}
  </style><header><strong>ReproLens / 资料中心</strong><span>${fixed ? "修复版" : "缺陷版"}</span></header><main><div class="avatar" aria-hidden="true">LC</div><h1>账户资料</h1><p>显示名称：测试用户</p><button id="edit" type="button">编辑资料</button><p id="feedback" role="status"></p><a href="?fixed=${fixed ? 0 : 1}">${fixed ? "查看缺陷版" : "查看修复版"}</a></main>
  <div class="backdrop" hidden></div><section id="profile-dialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" hidden><h2 id="dialog-title">确认资料修改</h2><p>显示名称将更新为：演示用户</p><div class="actions"><button class="secondary" id="cancel" type="button">取消</button><button id="confirm" type="button">确定</button></div></section>
  <nav id="mobile-toolbar" class="toolbar" aria-label="底部工具栏"><span>首页</span><span>消息</span><span>我的</span></nav>
  <script>const dialog=document.querySelector('#profile-dialog'), backdrop=document.querySelector('.backdrop');function close(){dialog.hidden=true;backdrop.hidden=true;document.querySelector('#edit').focus()}document.querySelector('#edit').onclick=()=>{dialog.hidden=false;backdrop.hidden=false;document.querySelector('#cancel').focus()};document.querySelector('#cancel').onclick=close;document.querySelector('#confirm').onclick=()=>{document.querySelector('#feedback').textContent='资料已更新';close()};document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});</script></html>`;
}

export function demoRouter() {
  const router = express.Router();
  router.get("/modal", (req, res) => res.type("html").send(modalDemoHtml(req.query.fixed === "1")));
  router.get("/profile", (req, res) => res.type("html").send(fixtureHtml("blur", req.query.fixed === "1")));
  return router;
}
