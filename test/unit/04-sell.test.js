'use strict';
// 倉庫賣出：什麼時候賣、賣什麼、怎麼點、失敗時怎麼收尾，以及「沒錢買種子就先賣」。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, crop, ripe, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };

// 倉庫快滿的標準情境：容量 20、塞了 17 個 → 剩 3（≤ 5 門檻）
const nearlyFull = (extra = {}) => boot({ cap: 20, inv: { wheat: 3, org_wheat: 2, egg: 5, corn: 4, org_corn: 1, poop: 2 }, coins: 100, ...extra });

test('倉庫快滿：開倉庫、只勾設定的作物與它的有機版、賣出、關閉倉庫；其他東西不動', async () => {
  const ctx = nearlyFull();
  const { world, t } = ctx;
  await step(ctx);
  const ui = world.storageUI;
  assert.equal(ui.opens, 1);
  assert.deepEqual(ui.sold.map(([id]) => id).sort(), ['org_wheat', 'wheat'], '只賣小麥與有機小麥');
  assert.equal(world.S.player.coins, 100 + 3 * 15 + 2 * 21);
  assert.deepEqual({ ...world.S.inv }, { egg: 5, corn: 4, org_corn: 1, poop: 2 }, '蛋、其他作物、糞便原封不動');
  assert.equal(world.modal.hidden, true, '我們開的倉庫視窗一定關掉');
  assert.equal(t.stats.sellRuns, 1);
  assert.ok(t.lastActionAt > 0);
  assert.equal(t.needSell, false);
  assert.equal(t.sellBlockedUntil, 0, '有賣出就不暫停');
});

test('賣出前先清掉玩家之前留下的勾選，不會連帶賣掉別的東西', async () => {
  const ctx = nearlyFull({ preselect: ['egg', 'corn'] });
  await step(ctx);
  const { world } = ctx;
  assert.equal(world.storageUI.clrBtn.clicks, 1, '先按「清除勾選」');
  assert.deepEqual(world.storageUI.sold.map(([id]) => id).sort(), ['org_wheat', 'wheat']);
  assert.equal(world.S.inv.egg, 5);
  assert.equal(world.S.inv.corn, 4);
});

test('只認批次賣出的確認視窗（.bs259）：購買確認用的 #ask47y 一律不碰', async () => {
  const ctx = nearlyFull({ confirmMissing: true });
  await step(ctx);
  const { world, t } = ctx;
  assert.equal(world.storageUI.purchaseYes.clicks, 0, '沒有 .bs259 的 #ask47y 是購買確認，不能按');
  assert.equal(world.S.inv.wheat, 3, '沒賣成');
  assert.match(t.note, /倉庫快滿但沒有賣出：確認視窗異常/);
  assert.equal(world.modal.hidden, true, '失敗也要關掉我們開的倉庫視窗');
  assert.ok(t.sellBlockedUntil > ctx.clock.now - 31000, '賣不出東西 → 暫停一陣子再試');
});

test('倉庫裡沒有設定的作物：關掉視窗、提示原因、30 秒內不再開，之後才再試', async () => {
  const ctx = boot({ cap: 10, inv: { egg: 8, corn: 1 } });
  await step(ctx);
  const { world, t } = ctx;
  assert.equal(world.storageUI.opens, 1);
  assert.equal(world.modal.hidden, true);
  assert.match(t.note, /倉庫快滿但沒有賣出：倉庫裡沒有小麥/);
  await run(ctx, 6, 1000); // 6 個週期、約 6.5 秒
  assert.equal(world.storageUI.opens, 1, '30 秒內不重複開倉庫');
  await ctx.clock.advance(30000);
  await step(ctx);
  assert.equal(world.storageUI.opens, 2, '過了 sellRetryMs 才再試');
});

test('開不起倉庫視窗：不丟錯、不亂點，暫停後再試', async () => {
  const ctx = nearlyFull({ noOpen: true });
  await step(ctx);
  assert.equal(ctx.world.S.inv.wheat, 3);
  assert.match(ctx.t.note, /開不起倉庫視窗/);
  assert.equal(ctx.t.enabled, true, '這不是未知錯誤，不會關掉自動功能');
});

test('找不到「賣出所選」按鈕：不勾了就走，並把視窗關好', async () => {
  const ctx = nearlyFull({ noGoButton: true });
  await step(ctx);
  assert.match(ctx.t.note, /找不到「賣出所選」按鈕/);
  assert.equal(ctx.world.modal.hidden, true);
  assert.equal(ctx.world.S.inv.wheat, 3);
});

test('倉庫是空的（沒有任何列）：視窗照樣關掉', async () => {
  const ctx = nearlyFull({ noRows: true });
  await step(ctx);
  assert.match(ctx.t.note, /倉庫是空的/);
  assert.equal(ctx.world.modal.hidden, true);
});

test('剩餘空位門檻：sellWhenFreeAtMost（預設 5）以上不賣，以下才賣', async () => {
  let ctx = boot({ cap: 20, inv: { wheat: 14 } }); // 剩 6
  await step(ctx);
  assert.equal(ctx.world.storageUI.opens, 0, '剩 6 > 5');
  ctx = boot({ cap: 20, inv: { wheat: 15 } }); // 剩 5
  await step(ctx);
  assert.equal(ctx.world.storageUI.opens, 1, '剩 5 ≤ 5');
  ctx = boot({ cap: 20, inv: { wheat: 15 } }, { flags: { sellWhenFreeAtMost: 2 } });
  await step(ctx);
  assert.equal(ctx.world.storageUI.opens, 0, '門檻可調');
});

test('autoSell 關掉：不管倉庫多滿都不開倉庫', async () => {
  const ctx = nearlyFull();
  ctx.t.CONFIG.autoSell = false;
  await run(ctx, 3);
  assert.equal(ctx.world.storageUI.opens, 0);
});

test('讀不到倉庫容量時改看「已滿」旗標', async () => {
  const ctx = boot({ cap: 1000, inv: { wheat: 3 } });
  Object.defineProperty(ctx.doc.getElementById('storageText'), 'textContent', { get: () => '倉庫', configurable: true });
  await step(ctx);
  assert.equal(ctx.world.storageUI.opens, 0, '沒有旗標、沒有數字 → 不賣');
  ctx.world.storageBtn.classList.add('full');
  await step(ctx);
  assert.equal(ctx.world.storageUI.opens, 1, '旗標亮了 → 賣');
});

test('沒錢買種子：直接賣掉設定的作物，不等倉庫快滿；賣完立刻播種', async () => {
  const ctx = boot({ tiles: { '0,0': soil() }, cap: 1000, inv: { wheat: 10, org_wheat: 2, egg: 3 }, coins: 4 });
  await step(ctx);
  const { world, t } = ctx;
  assert.match(t.status, /金幣不夠播種（要 5，有 4），先賣出小麥/, '第一個週期先發現沒錢、標記要賣');
  assert.equal(world.storageUI.opens, 0);
  await step(ctx);
  assert.equal(world.storageUI.opens, 1, '下一個週期開倉庫賣；倉庫幾乎是空的也賣');
  assert.equal(world.S.player.coins, 4 + 10 * 15 + 2 * 21);
  assert.equal(world.S.inv.egg, 3, '蛋不賣');
  await run(ctx, 4);
  assert.equal(world.M.tiles['0,0'].crop.id, 'wheat', '有錢之後去種');
});

test('沒錢買種子、倉庫也沒有設定的作物：不開倉庫（不做白工），標籤說明', async () => {
  const ctx = boot({ tiles: { '0,0': soil() }, cap: 1000, inv: { egg: 3 }, coins: 4 });
  await run(ctx, 4);
  assert.equal(ctx.world.storageUI.opens, 0);
  assert.match(ctx.t.status, /金幣不夠播種（要 5，有 4），倉庫也沒有可賣的小麥/);
});

test('沒錢買種子：sellWhenCantPlant 或 autoSell 關掉就不賣', async () => {
  let ctx = boot({ tiles: { '0,0': soil() }, cap: 1000, inv: { wheat: 10 }, coins: 4 }, { flags: { sellWhenCantPlant: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.storageUI.opens, 0);
  assert.match(ctx.t.status, /金幣不夠播種（要 5，有 4）/);
  ctx = boot({ tiles: { '0,0': soil() }, cap: 1000, inv: { wheat: 10 }, coins: 4 }, { flags: { autoSell: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.storageUI.opens, 0);
});

test('沒錢買種子的賣出：沒有空田（不需要買種子）時不會觸發', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10) }) }, cap: 1000, inv: { wheat: 10 }, coins: 1 });
  await run(ctx, 4);
  assert.equal(ctx.world.storageUI.opens, 0);
});

test('收成放不下下一格：先賣出騰空間，之後繼續收成', async () => {
  const tiles = {};
  for (let i = 0; i < 4; i++) tiles[i + ',0'] = soil({ crop: ripe('potato', cfg) });
  const ctx = boot({ tiles, cap: 100, inv: { filler: 80, potato: 10 } }, { crop: 'potato' });
  ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 };
  await run(ctx, 12);
  assert.ok(ctx.world.storageUI.opens >= 1, '有賣出');
  assert.equal(ctx.world.fullPrompts, 0, '全程沒跳出「倉庫滿了」');
  assert.equal(Object.values(ctx.world.M.tiles).filter((t) => t.crop && t.crop.prog > 0).length, 0, '4 格都收完了');
});
