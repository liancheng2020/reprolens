export function demoShopHtml(fixed = false): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ReproLens Demo Shop</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui; color: #eef2ff; background: #070b13; }
    header { height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 6vw; border-bottom: 1px solid #20283a; }
    .brand { font-weight: 800; letter-spacing: -.04em; font-size: 22px; }
    .brand span { color: #85f7c8; }
    .cart { display: flex; align-items: center; gap: 10px; }
    .badge { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: #07120d; background: #85f7c8; font-weight: 800; }
    main { max-width: 1120px; margin: 0 auto; padding: 72px 32px; }
    .eyebrow { color: #85f7c8; text-transform: uppercase; letter-spacing: .16em; font-size: 12px; }
    h1 { max-width: 720px; font-size: clamp(42px, 7vw, 76px); line-height: .98; letter-spacing: -.065em; margin: 18px 0 24px; }
    .sub { max-width: 600px; color: #96a0b5; font-size: 18px; line-height: 1.65; }
    .product { margin-top: 56px; display: grid; grid-template-columns: 1.15fr .85fr; min-width: ${fixed ? "0" : "620px"}; border: 1px solid #263149; background: #0d1422; border-radius: 24px; overflow: hidden; }
    .visual { min-height: 360px; background: radial-gradient(circle at 30% 30%, #3e7e6a, #101a24 60%); display: grid; place-items: center; }
    .visual img { width: 72%; filter: drop-shadow(0 25px 30px #0008); }
    .details { padding: 42px; display: flex; flex-direction: column; justify-content: center; }
    .tag { color: #7f8ba3; font-size: 13px; }
    h2 { font-size: 32px; margin: 10px 0; }
    .price { color: #85f7c8; font-size: 24px; margin: 8px 0 28px; }
    button { border: 0; border-radius: 12px; padding: 15px 20px; background: #85f7c8; color: #06120d; font-weight: 800; cursor: pointer; }
    #status { min-height: 24px; margin-top: 14px; color: ${fixed ? "#85f7c8" : "#ff8f9c"}; font-size: 13px; }
    .help { position: fixed; right: 22px; bottom: 22px; width: 48px; height: 48px; padding: 0; border-radius: 50%; font-size: 20px; }
    @media (max-width: 600px) {
      header { padding: 0 20px; }
      main { padding: 42px 20px; }
      h1 { font-size: 46px; }
      .product { grid-template-columns: ${fixed ? "1fr" : "1fr 1fr"}; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">NORTH<span>/LAB</span></div>
    <div class="cart">购物车 <span class="badge" id="cart-count">0</span></div>
  </header>
  <main>
    <div class="eyebrow">ReproLens 演示页面</div>
    <h1>为每天工作的人设计。</h1>
    <p class="sub">${fixed ? "这是修复后的演示页面：响应式布局、图片文本和购物车反馈均已恢复。" : "这是一个故意包含移动端溢出、可访问性和购物车接口错误的测试页面，用来体验完整复现流程。"}</p>
    <section class="product">
      <div class="visual">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect rx='40' width='400' height='300' fill='%23141d2c'/%3E%3Cpath d='M100 210L150 80h100l50 130z' fill='%2385f7c8'/%3E%3C/svg%3E" ${fixed ? 'alt="Focus Stand 产品图"' : ""} />
      </div>
      <div class="details">
        <div class="tag">LIMITED SERIES / 01</div>
        <h2>Focus Stand</h2>
        <div class="price">¥ 399</div>
        <button id="add-cart" type="button">加入购物车</button>
        <div id="status" aria-live="polite"></div>
      </div>
    </section>
  </main>
  <button class="help" type="button" ${fixed ? 'aria-label="获取帮助"' : ""}>?</button>
  <script>
    document.querySelector('#add-cart').addEventListener('click', async () => {
      document.querySelector('#status').textContent = '';
      try {
        const response = await fetch('/demo/api/cart${fixed ? "?fixed=1" : ""}', { method: 'POST' });
        if (!response.ok) throw new Error('Cart API failed with ' + response.status);
        document.querySelector('#cart-count').textContent = '1';
        document.querySelector('#status').textContent = '已加入购物车';
      } catch (error) {
        console.error('Unable to update cart', error);
      }
    });
  </script>
</body>
</html>`;
}
