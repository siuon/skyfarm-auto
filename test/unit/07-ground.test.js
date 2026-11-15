'use strict';
// 地上的東西：糞便、雜草、草球、碎石，以及被吹歪的裝飾、倒下的柵欄。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, crop, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const weed = () => ({ t: 'weed', v: 0 });
const ball = (n) => ({ t: 'weedball', n });
const debris = () => ({ t: 'debris', v: 0 });
const decoCfg = (ctx) => { ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 }; };

// ───── 糞便 ─────

test('糞便：用收成工具點掉，收進倉庫；autoPickPoop 關掉就不撿', async () => {
  let ctx = boot({ tiles: { '0,0': { t: 'poop' }, '1,0': { t: 'poop' } } });
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.poop, 2);
  assert.equal(ctx.world.acts[0].tool, 'hand');
  assert.equal(ctx.t.stats.pick, 2);
  ctx = boot({ tiles: { '0,0': { t: 'poop' } } }, { flags: { autoPickPoop: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
});

test('糞便：倉庫沒空位就不撿（不跳「倉庫滿了」）；空位只夠幾個就只撿幾個', async () => {
  const tiles = { '0,0': { t: 'poop' }, '1,0': { t: 'poop' }, '2,0': { t: 'poop' } };
  const ctx = boot({ tiles, cap: 12, inv: { filler: 10 } }, { flags: { autoSell: false } });
  decoCfg(ctx);
  await run(ctx, 6);
  assert.equal(ctx.world.S.inv.poop, 2, '空位 2 → 撿 2 個');
  assert.equal(ctx.world.fullPrompts, 0);
  assert.match(ctx.t.status, /倉庫沒空位，暫停收地上的東西、果樹、魚、機器成品/);
});

// ───── 雜草、草球 ─────

test('雜草：拔掉收進倉庫（空位夠才拔）；autoClearWeeds 關掉不拔', async () => {
  let ctx = boot({ tiles: { '0,0': weed(), '1,0': weed() }, cap: 100 });
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.weed, 2);
  assert.equal(ctx.t.stats.clean, 2);
  ctx = boot({ tiles: { '0,0': weed() } }, { flags: { autoClearWeeds: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
});

test('雜草：拔完倉庫要還剩 weedKeepFree（30）個空位以上，否則留在地上', async () => {
  let ctx = boot({ tiles: { '0,0': weed() }, cap: 100, inv: { filler: 69 } }); // 空位 31 → 拔完剩 30
  decoCfg(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, 1, '31 - 1 = 30 ≥ 30');
  ctx = boot({ tiles: { '0,0': weed() }, cap: 100, inv: { filler: 70 } }); // 空位 30 → 拔完剩 29
  decoCfg(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, undefined, '30 - 1 = 29 < 30');
  assert.ok(ctx.world.M.tiles['0,0'], '雜草還在地上');
  assert.match(ctx.t.status, /倉庫剩 30 格空位（拔雜草要保留 30 格），1 格雜草先不拔/);
});

test('雜草：倉庫裡的雜草有上限（weedMaxStock 40），草球照數量算', async () => {
  let ctx = boot({ tiles: { '0,0': weed() }, inv: { weed: 39 }, cap: 1000 });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, 40, '39 + 1 ≤ 40');
  ctx = boot({ tiles: { '0,0': weed() }, inv: { weed: 40 }, cap: 1000 });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, 40, '已經 40 個，不再拔');
  ctx = boot({ tiles: { '0,0': ball(3) }, inv: { weed: 38 }, cap: 1000 });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, 38, '38 + 3 > 40');
  ctx = boot({ tiles: { '0,0': ball(2) }, inv: { weed: 38 }, cap: 1000 });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, 40, '38 + 2 ≤ 40');
});

test('草球：一顆草球 = n 個雜草，空位要放得下 n 個又保留 weedKeepFree', async () => {
  let ctx = boot({ tiles: { '0,0': ball(5) }, cap: 100, inv: { filler: 65 } }); // 空位 35 → 35-5 = 30
  decoCfg(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, 5);
  ctx = boot({ tiles: { '0,0': ball(5) }, cap: 100, inv: { filler: 66 } }); // 空位 34 → 29
  decoCfg(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, undefined);
});

test('雜草排在其他東西之後，不搶它們的空位：蛋先收，雜草看剩下的空位', async () => {
  const ctx = boot({
    tiles: { '7,6': { t: 'animal', id: 'egg_hen', stage: 2, timer: 100, cycles: 5, stack: 10 }, '0,0': weed() },
    cap: 100, inv: { filler: 55 }, // 空位 45：蛋 10 → 35 → 雜草 35-1=34 ≥ 30 可以拔
  });
  decoCfg(ctx);
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.egg, 10);
  assert.equal(ctx.world.S.inv.weed, 1);
  const ctx2 = boot({
    tiles: { '7,6': { t: 'animal', id: 'egg_hen', stage: 2, timer: 100, cycles: 5, stack: 20 }, '0,0': weed() },
    cap: 100, inv: { filler: 55 }, // 空位 45：蛋 20 → 25 → 雜草 24 < 30 不拔
  });
  decoCfg(ctx2);
  await run(ctx2, 4);
  assert.equal(ctx2.world.S.inv.egg, 20, '蛋優先');
  assert.ok(ctx2.world.M.tiles['0,0'], '雜草沒有搶走蛋的空位，也沒被拔');
});

test('雜草空位不夠只是暫停：不會觸發賣出，也不會讓工具卡在收成上', async () => {
  const ctx = boot({
    tiles: { '0,0': weed(), '1,0': soil({ crop: crop('wheat', 10), m: 0 }) },
    cap: 100, inv: { wheat: 69 }, // 空位 31 - 雜草 1 = 30 ... 這裡放大一點讓雜草拔不了
  });
  ctx.world.S.inv.wheat = 80; // 空位 20 < 30 → 雜草不拔；空位 20 > 5 → 也不會因為快滿而賣
  await run(ctx, 5);
  assert.equal(ctx.world.storageUI.opens, 0, '雜草不值得賣東西去換空位');
  assert.equal(ctx.world.acts[0].tool, 'water', '沒有要撿的東西時，改去澆水，不會卡在收成工具');
  assert.equal(ctx.world.M.tiles['1,0'].m, 4);
});

// ───── 碎石 ─────

test('碎石：不佔倉庫，倉庫全滿也照撿；autoClearDebris 可關', async () => {
  let ctx = boot({ tiles: { '0,0': debris(), '1,0': debris() }, cap: 5, inv: { filler: 5 } }, { flags: { autoSell: false } });
  decoCfg(ctx);
  await run(ctx, 4);
  assert.equal(ctx.world.M.tiles['0,0'], undefined);
  assert.equal(ctx.world.M.tiles['1,0'], undefined);
  assert.equal(ctx.t.stats.clean, 2);
  ctx = boot({ tiles: { '0,0': debris() } }, { flags: { autoClearDebris: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
});

// ───── 歪掉的裝飾、倒下的柵欄 ─────

const deco = (o = {}) => Object.assign({ t: 'deco', id: 'rain_barrel' }, o);
const fence = (o = {}) => Object.assign({ t: 'deco', id: 'fence' }, o);

test('歪掉的裝飾、倒下的柵欄：用「澆水」工具點就扶正，不耗水', async () => {
  const ctx = boot({ tiles: { '0,0': deco({ tilt: 1 }), '1,0': fence({ fallen: true }), '2,0': deco(), '3,0': fence() }, water: 50 });
  await run(ctx, 5);
  const { world } = ctx;
  assert.equal(world.M.tiles['0,0'].tilt, 0);
  assert.equal(world.M.tiles['1,0'].fallen, false);
  assert.equal(world.S.player.water, 50, '扶正不用水');
  assert.ok(world.acts.every((a) => a.tool === 'water'), '全程只用澆水工具');
  assert.equal(world.acts.filter((a) => a.k === '2,0' || a.k === '3,0').length, 0, '沒歪的不碰');
  assert.equal(ctx.t.stats.clean, 2);
});

test('野生植物（wild40）歪了：用澆水工具扶正，不會像收成工具那樣被拔掉', async () => {
  const ctx = boot({ tiles: { '0,0': deco({ id: 'oxalis', wild40: 1, tilt: -1 }) } });
  await run(ctx, 3);
  assert.equal(ctx.world.deletedWild, 0, '野生植物沒被拔掉');
  assert.equal(ctx.world.M.tiles['0,0'].tilt, 0);
});

test('autoStraighten 關掉：歪的不碰', async () => {
  const ctx = boot({ tiles: { '0,0': deco({ tilt: 1 }) } }, { flags: { autoStraighten: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
});

test('扶正之前確認工具真的是澆水工具；不是就不點', async () => {
  const ctx = boot({ tiles: { '0,0': deco({ tilt: 1 }) }, sel: { tool: 'water' } });
  // 讓切換工具的按鈕失靈，工具停在別的
  const real = ctx.env.win.__farm18;
  ctx.world.S.sel.tool = 'hand';
  ctx.world.toolBtn.water.onclick = () => {}; // 點了沒切過去
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0, '工具不是澆水，一下都不點');
  assert.equal(ctx.world.deletedWild, 0);
  assert.ok(real);
});

test('扶正：排程時是澆水工具、動手前一刻工具卻變了（例如玩家剛好按了別的工具）→ 不點，免得收成工具把野生植物拔掉', async () => {
  const ctx = boot({ tiles: { '0,0': deco({ id: 'oxalis', wild40: 1, tilt: -1 }) }, sel: { tool: 'water' } });
  let reads = 0;
  const sel = ctx.world.S.sel;
  let cur = 'water';
  Object.defineProperty(sel, 'tool', {
    get() { reads += 1; return reads <= 2 ? 'water' : 'hand'; }, // 前兩次讀（挑工具、確認工具）是澆水，之後變成收成
    set(v) { cur = v; },
    configurable: true, enumerable: true,
  });
  await step(ctx);
  assert.ok(reads >= 3, '動手前又讀了一次工具');
  assert.equal(ctx.world.acts.length, 0, '工具不對就不點');
  assert.equal(ctx.world.deletedWild, 0);
  assert.equal(cur, 'water');
});
