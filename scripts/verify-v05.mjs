// Run after npm run build: node scripts/verify-v05.mjs
// Local fixtures only; no model/API credentials or real accounts are used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { expect } from "playwright/test";
import { transform } from "esbuild";
import { executePlan, businessReport, reportVerdict } from "../apps/api/dist/business.js";
import { generateBusinessTest } from "../apps/api/dist/business-test.js";
import { reproPlanSchema } from "../apps/api/dist/repro-plan.js";

const target = { by: "label", value: "Phone" };
const scene = { title: "Registration scene", action: "assert", phase: "setup", assertion: "visible", target: { by: "text", value: "Register" }, allowSideEffect: false };
const inputStep = { title: "Phone accepts keyboard input", action: "input", phase: "check", target, value: "12345", allowSideEffect: false };
const check = (assertion, target, value) => ({ title: assertion + " check", action: "assert", phase: "check", assertion, target, ...(value === undefined ? {} : { value }), allowSideEffect: false });
const click = { title: "Activate control", action: "click", phase: "setup", target: { by: "role", role: "button", value: "Go" }, allowSideEffect: false };
const fixtures = {
  normal: '<h1>Register</h1><label>Phone<input></label>',
  readonly: '<h1>Register</h1><label>Phone<input readonly></label>',
  disabled: '<h1>Register</h1><label>Phone<input disabled></label>',
  clears: '<h1>Register</h1><label>Phone<input onblur="this.value=\'\'"></label>',
  wrongScene: '<h1>Login</h1><label>Phone<input></label>',
  duplicate: '<h1>Register</h1><label>Phone<input></label><label>Phone<input></label>',
  noise: '<h1>Register</h1><label>Phone<input></label><script>console.error("unrelated");fetch("/missing")</script>',
  cart: '<h1>Register</h1><button type="button">Go</button><span id="count">0</span>',
  hidden: '<h1>Register</h1><span id="message" hidden>Hidden</span>',
  missingMessage: '<h1>Register</h1>',
  hiddenMessage: '<h1>Register</h1><span id="saved" hidden>Saved</span>',
  delayedMessage: '<h1>Register</h1><span id="saved" hidden>Saved</span><script>setTimeout(()=>document.querySelector("#saved").hidden=false,1200)</script>',
  duplicateMessage: '<h1>Register</h1><span>Saved</span><span>Saved</span>',
  save: '<h1>Register</h1><label>Phone<input></label><button type="button">Go</button>',
  response: '<h1>Register</h1><button type="button" onclick="fetch(\'/api/cart\',{method:\'POST\'})">Go</button>',
  submit: '<h1>Register</h1><form onsubmit="event.preventDefault()"><button>Go</button></form>',
  richtext: '<h1>Register</h1><div contenteditable="true" aria-label="Phone"></div>',
  switch: '<h1>Login</h1><button type="button" onclick="document.querySelector(\'main\').hidden=false;this.remove()">Register tab</button><main hidden><h1>Register</h1><label>Phone<input></label></main>'
};
const scenarios = [
  ["normal", [scene, inputStep], "not_reproduced", true],
  ["readonly", [scene, inputStep], "reproduced", false],
  ["disabled", [scene, inputStep], "reproduced", false],
  ["clears", [scene, inputStep], "reproduced", false],
  ["wrongScene", [scene, inputStep], "inconclusive", false],
  ["duplicate", [scene, inputStep], "inconclusive", false],
  ["noise", [scene, inputStep], "not_reproduced", true],
  ["cart", [scene, click, check("text", { by: "css", value: "#count" }, "1")], "reproduced", false],
  ["hidden", [scene, check("hidden", { by: "css", value: "#message" })], "not_reproduced", true],
  ["missingMessage", [scene, check("visible", { by: "text", value: "Saved" })], "reproduced", false],
  ["hiddenMessage", [scene, check("visible", { by: "text", value: "Saved" })], "reproduced", false],
  ["delayedMessage", [scene, check("visible", { by: "text", value: "Saved" })], "not_reproduced", true],
  ["duplicateMessage", [scene, check("visible", { by: "text", value: "Saved" })], "inconclusive", false],
  ["save", [scene, { ...inputStep, phase: "setup" }, { ...click, allowSideEffect: true }, { title: "Reload", action: "reload", phase: "setup", allowSideEffect: false }, check("value", target, "12345")], "reproduced", false],
  ["response", [scene, click, { title: "Cart response", action: "assert", phase: "check", assertion: "response", requestPath: "/api/cart", method: "POST", statusCode: 200, responseField: "count", value: "1", allowSideEffect: false }], "not_reproduced", true],
  ["submit", [scene, click, inputStep], "inconclusive", false],
  ["richtext", [scene, inputStep], "inconclusive", false],
  ["switch", [{ ...click, target: { by: "role", role: "button", value: "Register tab" } }, scene, inputStep], "not_reproduced", true]
];
const server = createServer((req, res) => {
  const name = new URL(req.url, "http://localhost").pathname.slice(1);
  if (name === "api/cart") { const body = JSON.stringify({ count: 1 }); res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }); res.end(body); return; }
  if (!fixtures[name]) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><html><body>" + fixtures[name] + "</body></html>");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
const artifacts = await mkdtemp(path.join(tmpdir(), "reprolens-v05-"));
let browser;
const rows = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const [name, steps, expectedVerdict, expectedGeneratedPass] of scenarios) {
    if (process.argv[2] && name !== process.argv[2]) continue;
    const plan = { version: 1, objective: name, scope: "fixture behavior", warnings: [], steps };
    reproPlanSchema.parse(plan);
    const input = { url: base + "/" + name, issue: name, expected: "fixture behavior", devices: ["desktop"], plan, planConfirmed: true };
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    try {
      await page.goto(input.url);
      const evidence = await executePlan(page, plan, "desktop", artifacts, name, async () => {});
      const report = businessReport(input, evidence);
      const verdict = reportVerdict(report);
      await page.goto(input.url);
      const callbacks = [];
      const test = (_name, fn) => callbacks.push(fn);
      test.setTimeout = () => {};
      // Execute exported test bodies with real Playwright assertions on the same fixture.
      // This is not a full Playwright test-runner / CI validation.
      const source = generateBusinessTest(input).replace(/^import .*;\s*$/gm, "");
      const compiled = await transform(source, { loader: "ts", format: "cjs" });
      new Function("test", "expect", compiled.code)(test, expect);
      let generatedPass = true;
      try { for (const fn of callbacks) await fn({ page }); } catch { generatedPass = false; }
      const passed = verdict === expectedVerdict && generatedPass === expectedGeneratedPass;
      rows.push({ name, passed, expectedVerdict, verdict, expectedGeneratedPass, generatedPass, steps: evidence.map(s => s.status),
        failures: evidence.filter(s => ["failed", "blocked"].includes(s.status)).map(s => ({ title: s.title, detail: s.detail, actual: s.actual })) });
      console.log(JSON.stringify(rows.at(-1)));
    } finally { await context.close(); }
  }
  // Schema rejects plans with no scene, no core assertion, or sensitive response fields.
  assert.equal(reproPlanSchema.safeParse({ version: 1, objective: "x", scope: "x", warnings: [], steps: [inputStep] }).success, false);
  console.log("Schema negative check: PASS");
  console.log("SUMMARY " + rows.filter(row => row.passed).length + "/" + rows.length + " scenarios matched expectations");
  if (rows.some(row => !row.passed)) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  // Only remove this run's uniquely allocated temporary screenshot directory.
  if (path.dirname(artifacts) === path.resolve(tmpdir()) && path.basename(artifacts).startsWith("reprolens-v05-"))
    await rm(artifacts, { recursive: true, force: true });
}
