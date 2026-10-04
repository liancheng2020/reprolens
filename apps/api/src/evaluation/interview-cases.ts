export interface InterviewCase {
  id: string;
  kind: "blur" | "disabled" | "readonly" | "counter" | "obstruction";
  heading: string;
  label: string;
  issue: string;
  expected: string;
  device: "desktop" | "iphone13";
}

export const interviewCases: InterviewCase[] = [
  ...(["blur", "disabled", "readonly"] as const).flatMap((kind, index) => [0, 1].map(variant => ({
    id: `${kind}-${variant + 1}`, kind,
    heading: ["作者设置", "配送资料", "工作空间"][index]! + (variant ? "二" : "一"),
    label: variant ? "公开称呼" : "显示名称",
    issue: kind === "blur" ? "输入名称后按 Tab 离开输入框，内容被清空。"
      : kind === "disabled" ? "名称输入框意外禁用，不能输入。" : "名称输入框意外只读，无法修改。",
    expected: "名称输入框可通过键盘编辑，按 Tab 失焦后仍保留刚才的输入。",
    device: "desktop" as const
  }))),
  ...[0, 1].map(variant => ({ id: `counter-${variant + 1}`, kind: "counter" as const,
    heading: variant ? "收藏清单" : "演示购物车", label: variant ? "收藏数量" : "购物车数量",
    issue: variant ? "点击收藏一次，收藏数量仍为 0。" : "点击加入购物车一次，购物车数量仍为 0。",
    expected: "初始数量为 0，点击一次添加按钮后，数量应该为 1。", device: "desktop" as const })),
  ...[0, 1].map(variant => ({ id: `obstruction-${variant + 1}`, kind: "obstruction" as const,
    heading: variant ? "偏好确认" : "资料确认", label: "确定",
    issue: "手机页面底部工具栏覆盖了确定按钮。",
    expected: "确定按钮完整位于视口内，中心能接收到指针点击，不被底部工具栏遮挡。", device: "iphone13" as const }))
];

export function interviewFixture(item: InterviewCase, fixed: boolean): string {
  const input = ["blur", "disabled", "readonly"].includes(item.kind);
  const button = item.heading === "收藏清单" ? "收藏" : "加入购物车";
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font:16px/1.6 system-ui;margin:24px}input,button{font:inherit;padding:12px}label{display:block}
  #confirm{position:fixed;bottom:24px;left:24px;z-index:2}#toolbar{position:fixed;bottom:0;left:0;right:0;height:100px;background:#243a38;z-index:${fixed ? 1 : 3}}</style>
  <h1>${item.heading}</h1>
  ${input ? `<label for="field">${item.label}</label><input id="field" ${!fixed && item.kind === "disabled" ? "disabled" : ""} ${!fixed && item.kind === "readonly" ? "readonly" : ""}>`
    : item.kind === "counter" ? `<label for="count">${item.label}</label><input id="count" readonly value="0"><button id="add" type="button">${button}</button>`
    : '<button id="confirm" type="button">确定</button><nav id="toolbar" aria-label="底部工具栏">工具栏</nav>'}
  <script>${input ? `document.querySelector('#field').onblur=e=>{if(${!fixed && item.kind === "blur"})e.target.value='';};`
    : item.kind === "counter" ? `document.querySelector('#add').onclick=()=>{if(${fixed})document.querySelector('#count').value='1';};` : ""}</script></html>`;
}
