import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { observePage } from '../apps/api/dist/page-observation.js';

let posts = 0, external = 0;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const outside = createServer((_req, res) => { external++; res.end('outside'); });
const remote = await listen(outside);
const fixture = createServer((req, res) => {
  if (req.method === 'POST') posts++;
  if (req.url === '/redirect') { res.writeHead(302, { Location: remote }); res.end(); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<h1>测试表单</h1><label for="name">公开名称</label><input id="name" value="PRIVATE_VALUE"><label for="pw">密码</label><input id="pw" type="password" value="SECRET_VALUE"><input hidden value="HIDDEN_VALUE"><button disabled>保存</button><script>fetch('/write',{method:'POST'});fetch('${remote}');</script>`);
});
const origin = await listen(fixture);
let browser;
try {
  const snapshot = await observePage(origin, 'desktop', [origin]);
  assert(snapshot.elements.some(e => e.target?.value === '公开名称'));
  assert(snapshot.elements.some(e => e.target?.value === '保存' && e.disabled));
  assert(!/PRIVATE_VALUE|SECRET_VALUE|HIDDEN_VALUE|密码/.test(JSON.stringify(snapshot)));
  assert.equal(posts, 0); assert.equal(external, 0);
  await assert.rejects(observePage(origin + '/redirect', 'desktop', [origin]));
  assert.equal(external, 0);
  const appUrl = process.env.REPROLENS_TEST_URL;
  if (appUrl) {
    const denied = await fetch(new URL('/api/plans', appUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'http://unapproved.invalid/', issue: '输入后内容无法保留', expected: '应当保留输入内容', devices: ['desktop'], observePage: true }) });
    assert.equal(denied.status, 422);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(appUrl);
    const consent = page.getByRole('checkbox', { name: /允许访问已授权站点/ });
    await consent.waitFor(); assert.equal(await consent.isChecked(), false);
    await consent.check();
    const out = new URL('../artifacts/observation-ui/', import.meta.url);
    await fs.mkdir(out, { recursive: true });
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => scrollTo(0, 0));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: new URL(`${name}.png`, out).pathname, fullPage: true });
    }
    assert.deepEqual(errors, []);
  }
  console.log('PASS: bounded metadata, values omitted, POST/cross-origin/redirect blocked, optional UI checks');
} finally {
  await browser?.close();
  for (const server of [fixture, outside]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
