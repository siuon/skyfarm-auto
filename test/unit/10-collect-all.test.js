'use strict';
// 「成熟可以點的都收」：蜂箱蜂蜜、其他種類的成熟作物（肉用動物出貨在 05-animals）。
// 重點：只點確實有東西可收的（蜂箱沒蜂蜜一點就會開出玩家的面板）、倉庫放得下才收、其他作物不能擠掉設定作物的空位。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, crop, ripe, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const hive = (honey = {}, o = {}) => Object.assign({ t: 'device', id: 'beehive', queen: true, frames: 3, honey }, o);
const status = (ctx) => ctx.t.status;
const filler = (ctx) => { ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 }; };

// ───── 蜂箱蜂蜜 ─────

test('蜂箱：存著蜂蜜就用收成工具點，整箱（含不同花種的蜜）收進倉庫；標籤統計蜂蜜', async () => {
  const ctx = boot({ tiles: { '4,4': hive({ honey_wild: 2, honey_rose: 3 }) } });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.honey_wild, 2);
  assert.equal(ctx.world.S.inv.honey_rose, 3);
  assert.deepEqual(ctx.world.M.tiles['4,4'].honey, {});
  assert.equal(ctx.t.stats.honey, 1);
  assert.equal(ctx.world.acts.filter((a) => a.k === '4,4')[0].tool, 'hand');
  assert.equal(ctx.world.hivePanels, 0);
  assert.match(ctx.t.badge.textContent, /蜂蜜 1｜出貨 0/);
});

test('蜂箱：沒有蜂蜜（空的、沒有蜂王、蜂蜜欄位缺失、全是 0）一律不點——點下去會開出蜂箱面板', async () => {
  const ctx = boot({
    tiles: {
      '0,0': hive({}), '1,0': hive({ honey_wild: 0 }), '2,0': hive(undefined, { honey: undefined, queen: false }),
      '3,0': { t: 'device', id: 'beehive' },
    },
  });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0, '一下都沒點');
  assert.equal(ctx.world.hivePanels, 0);
  assert.equal(ctx.world.modal.hidden, true);
});

test('蜂箱：不是蜂箱的設備（水井、灑水器…）不碰，就算帶著蜂蜜欄位', async () => {
  const ctx = boot({ tiles: { '0,0': { t: 'device', id: 'well', water: 80 }, '1,0': { t: 'device', id: 'well', honey: { honey_wild: 5 } } } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
});

test('autoCollectHoney 關掉：有蜂蜜的蜂箱也不點', async () => {
  const ctx = boot({ tiles: { '0,0': hive({ honey_wild: 5 }) } }, { flags: { autoCollectHoney: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.deepEqual(ctx.world.M.tiles['0,0'].honey, { honey_wild: 5 });
});

test('蜂箱：整箱的量倉庫放不下就不點（不跳「倉庫滿了」）；放得下的那個照收', async () => {
  const ctx = boot({
    tiles: { '0,0': hive({ honey_wild: 6 }), '1,0': hive({ honey_wild: 6 }) },
    cap: 20, inv: { filler: 10 },
  });
  filler(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.fullPrompts, 0);
  const left = [ctx.world.M.tiles['0,0'], ctx.world.M.tiles['1,0']].filter((T) => Object.keys(T.honey).length > 0);
  assert.equal(left.length, 1, '空位 10，兩箱各 6 罐：只收得了其中一箱，第二箱等有空位再收');
  assert.equal(ctx.world.S.inv.honey_wild, 6);
});

test('蜂箱：倉庫沒空位時標籤說明，不是靜靜地不動', async () => {
  const ctx = boot({ tiles: { '0,0': hive({ honey_wild: 5 }) }, cap: 10, inv: { filler: 7 } });
  filler(ctx);
  await run(ctx, 2);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /倉庫沒空位，暫停收地上的東西、果樹、魚、機器成品、蜂蜜、肉用動物/);
});

test('蜂箱在沿邊柵欄上：先跳「這一格有：」選單，腳本選「那一格的東西」後照樣收到蜂蜜、不留選單', async () => {
  const ctx = boot({ tiles: { '4,4': hive({ honey_wild: 4 }) }, edgeFence: ['4,4'] });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.honey_wild, 4);
  assert.equal(ctx.world.pop.hidden, true);
});

test('蜂箱：排好之後、點下去之前蜂蜜已經被收走 → 不點（否則會開出玩家的蜂箱面板）', async () => {
  let reads = 0;
  const T = { t: 'device', id: 'beehive', queen: true };
  Object.defineProperty(T, 'honey', { get() { reads += 1; return reads <= 1 ? { honey_wild: 2 } : {}; }, configurable: true });
  const ctx = boot({ tiles: { '0,0': T } });
  await ctx.t.tick();
  assert.equal(ctx.world.acts.length, 0, '點之前重新確認，發現沒蜂蜜就不點');
  assert.equal(ctx.world.hivePanels, 0);
});

test('肉用動物：排好之後、點下去之前牠不是長大的肉用動物了 → 不點（點下去會變成餵食、可能花錢）', async () => {
  let reads = 0;
  const T = { t: 'animal', id: 'broiler', timer: 0 };
  Object.defineProperty(T, 'stage', { get() { reads += 1; return reads <= 1 ? 3 : 0; }, configurable: true });
  const ctx = boot({ tiles: { '0,9': T }, coins: 1000, autoBuyFeed: true });
  await ctx.t.tick();
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.world.boughtFeed, 0);
});

test('倉庫容量讀不到、又標示「滿了」：其他作物也不收（不能讓遊戲跳「倉庫滿了」）', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) } });
  Object.defineProperty(ctx.doc.byId.get('storageText'), 'textContent', { get: () => '', configurable: true });
  ctx.world.storageBtn.classList.add('full');
  await run(ctx, 10); // 先試賣（沒東西可賣）、再切工具選種子，才輪得到收成
  assert.equal(ctx.world.acts.filter((a) => a.k === '0,0').length, 0);
  assert.equal(ctx.world.fullPrompts, 0);
  assert.equal(ctx.world.S.inv.tomato, undefined);
});

test('蜂蜜不會被自動賣掉（賣出範圍只有設定作物）', () => {
  const ctx = boot({});
  for (const id of ['honey_wild', 'honey_rose', 'honey']) assert.equal(ctx.t.isSellTarget(id), false, id);
});

test('診斷：蜂箱數、有蜜的蜂箱數、罐數', () => {
  const ctx = boot({ tiles: { '0,0': hive({ honey_wild: 2, honey_rose: 1 }), '1,0': hive({}), '2,0': { t: 'device', id: 'well' } } });
  assert.deepEqual({ ...ctx.t.describeGame().hives }, { total: 2, withHoney: 1, jars: 3 });
});

// ───── 其他種類的成熟作物 ─────

test('其他種類的成熟作物：用播種工具收，進倉庫，不賣；空出來的田照常補種設定作物', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) } });
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.tomato, 2);
  assert.equal(ctx.world.M.tiles['0,0'].crop.id, 'wheat', '收完空田補種設定作物（和所有空田一樣）');
  assert.equal(ctx.t.stats.harvest, 1);
  assert.equal(ctx.world.acts.filter((a) => a.k === '0,0')[0].tool, 'seed');
  assert.equal(ctx.world.storageUI.sold.length, 0);
});

test('其他作物排在設定作物之後：空位吃緊時，先給設定作物，其他作物等有空位（收完要還剩 otherCropsKeepFree）', async () => {
  const ctx = boot({
    tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }), '1,0': soil({ crop: ripe('wheat', cfg) }) },
    cap: 100, inv: { filler: 88 },
  });
  filler(ctx);
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.wheat, 1, '設定作物照收');
  assert.equal(ctx.world.S.inv.tomato, undefined, '番茄排後面：收完還剩 12 - 1 - 2 = 9 < 10，先不收');
  assert.equal(ctx.world.M.tiles['0,0'].crop.id, 'tomato');
  assert.match(status(ctx), /倉庫空位不多，1 格其他作物先不收/);
  assert.equal(ctx.world.storageUI.opens, 0, '空位還夠，沒有為了其他作物去賣東西');
});

test('其他作物：收完剛好剩 otherCropsKeepFree 個空位還是收；少一個就不收', async () => {
  let ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) }, cap: 100, inv: { filler: 88 } });
  filler(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.tomato, 2, '空位 12，收 2 個剩 10：收');
  ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) }, cap: 100, inv: { filler: 89 } });
  filler(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.tomato, undefined, '空位 11，收 2 個剩 9：不收');
});

test('otherCropsKeepFree 可調：設成 0 就收到只剩 0 個空位為止（預設值同樣的情況不收）', async () => {
  let ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) }, cap: 100, inv: { filler: 94 } });
  filler(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.tomato, undefined, '預設：空位 6，收 2 個剩 4 < 10，不收');
  ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) }, cap: 100, inv: { filler: 94 } }, { flags: { otherCropsKeepFree: 0 } });
  filler(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.tomato, 2, '設成 0：空位 6，收 2 個剩 4 ≥ 0，收');
});

test('其他作物：倉庫滿了（沒有空位）就不收，也不跳「倉庫滿了」視窗', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) }, cap: 10, inv: { filler: 10 } });
  filler(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.world.fullPrompts, 0);
});

test('收其他作物不會觸發賣出：倉庫裡的其他作物不在賣出範圍；快滿時只賣設定作物', async () => {
  const ctx = boot({ tiles: {}, cap: 20, inv: { wheat: 10, tomato: 10 } });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.storageUI.sold.map(([id]) => id), ['wheat'], '只賣小麥，番茄留著');
  assert.equal(ctx.world.S.inv.tomato, 10);
});

test('其他作物：成熟的有蟲 → 先抓蟲（照顧工具、免費），抓光再收；絕不用農藥', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('tomato', cfg.crops.tomato.growSeconds, { pest: true }) }) } });
  await run(ctx, 12);
  assert.equal(ctx.world.chemUsed, 0);
  assert.equal(ctx.world.S.inv.tomato, 2, '蟲抓光後收了');
  assert.ok(ctx.world.acts.some((a) => a.tool === 'care' && a.k === '0,0'), '用過照顧工具抓蟲');
});

test('其他作物：枯萎的不算成熟、不收（也不澆水）；還沒熟的不動', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('tomato', 9999, { wither: true }) }), '1,0': soil({ crop: crop('tomato', 10) }) } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /略過其他作物 2 格/);
});

test('autoHarvest 關掉：連其他作物也不收', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) } }, { flags: { autoHarvest: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
});

test('其他作物的收成與設定作物一起排：同一個週期內不超過 maxActionsPerTick', async () => {
  const tiles = {};
  for (let i = 0; i < 6; i++) tiles[i + ',0'] = soil({ crop: ripe('tomato', cfg) });
  const ctx = boot({ tiles });
  await run(ctx, 2); // 切工具、選種子
  const before = ctx.world.acts.length;
  await ctx.t.tick();
  assert.equal(ctx.world.acts.length - before, 3);
});

// ───── 全部一起 ─────

test('綜合：作物、其他作物、動物產物、長大的肉用動物、果樹、蜂蜜在同一個農場裡都被收到，沒有任何危險動作', async () => {
  const ctx = boot({
    tiles: {
      '0,0': soil({ crop: ripe('wheat', cfg) }),
      '1,0': soil({ crop: ripe('tomato', cfg) }),
      '2,0': { t: 'animal', id: 'egg_hen', stage: 2, timer: 100, cycles: 10, stack: 3 },
      '3,0': { t: 'animal', id: 'broiler', stage: 3, timer: 0 },
      '4,0': { t: 'tree', id: 'orange', prog: 36000, first: true, m: 3 },
      '5,0': hive({ honey_wild: 4 }),
    },
  });
  await run(ctx, 12);
  const inv = ctx.world.S.inv;
  assert.equal(inv.wheat, 1);
  assert.equal(inv.tomato, 2);
  assert.equal(inv.egg, 3);
  assert.equal(inv.chicken_meat, 1);
  assert.equal(inv.orange, 1);
  assert.equal(inv.honey_wild, 4);
  assert.equal(ctx.world.upgrades + ctx.world.chemUsed + ctx.world.deletedWild + ctx.world.hivePanels, 0);
  assert.equal(ctx.world.fullPrompts, 0);
});
