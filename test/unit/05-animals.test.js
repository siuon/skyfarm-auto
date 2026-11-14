'use strict';
// 動物：收產物、動物走離家、肉用動物絕不碰、餵食（只用庫存／補買的條件與底線）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const hen = (o = {}) => Object.assign({ t: 'animal', id: 'egg_hen', stage: 2, timer: 0, cycles: 10, stack: 0 }, o);
const sheep = (o = {}) => Object.assign({ t: 'animal', id: 'wool_sheep', stage: 2, timer: 0, cycles: 10, stack: 0 }, o);
const broiler = (o = {}) => Object.assign({ t: 'animal', id: 'broiler', stage: 99, timer: 0 }, o);
const actsOn = (world, k) => world.acts.filter((a) => a.k === k);

// 監看「剛點了這隻動物」記號被設成什麼
function spyTapMark(world) {
  const sets = [];
  let v = null;
  Object.defineProperty(world.RT, 'lastAnimalTap', { get: () => v, set: (x) => { if (x !== null) sets.push(x); v = x; }, configurable: true });
  return sets;
}

// ───── 收產物 ─────

test('收產物：生產型動物有產物就用收成工具點，產物進倉庫；標籤統計為撿拾', async () => {
  const ctx = boot({ tiles: { '7,6': hen({ stack: 3, timer: 100 }) } });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.egg, 3);
  assert.equal(ctx.world.M.tiles['7,6'].stack, 0);
  assert.equal(actsOn(ctx.world, '7,6')[0].tool, 'hand');
  assert.equal(ctx.t.stats.pick, 1);
});

test('動物走離家：補上「剛點了牠」的記號才點得到（等同玩家點了畫面上的牠）；在家時不補', async () => {
  let ctx = boot({ tiles: { '7,6': hen({ stack: 2, timer: 100 }) }, agents: { '0:7,6': { x: 4.5, y: 8.5 } } });
  let marks = spyTapMark(ctx.world);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.egg, 2, '離家 3.5 格也收到了');
  assert.deepEqual(marks, ['7,6'], '點之前補了記號');
  ctx = boot({ tiles: { '7,6': hen({ stack: 2, timer: 100 }) }, agents: { '0:7,6': { x: 7.2, y: 6.1 } } });
  marks = spyTapMark(ctx.world);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.egg, 2);
  assert.deepEqual(marks, [], '就在家附近（≤ 0.5 格）不用補');
});

test('收產物：倉庫放不下就不收（不跳「倉庫滿了」），標記要賣出；沒有可賣的就只是等', async () => {
  const ctx = boot({ tiles: { '7,6': hen({ stack: 5, timer: 100 }) }, cap: 10, inv: { filler: 7 } });
  ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 };
  await run(ctx, 2);
  assert.equal(ctx.world.M.tiles['7,6'].stack, 5);
  assert.equal(ctx.world.fullPrompts, 0);
  assert.match(ctx.t.status, /倉庫沒空位，暫停收地上的東西、果樹、魚、機器成品/);
});

test('autoCollectAnimalProducts 關掉：有產物的動物完全不點（點了會順便收走）', async () => {
  const ctx = boot({ tiles: { '7,6': hen({ stack: 3, timer: 100 }) }, inv: { corn_cake: 5 } }, { flags: { autoCollectAnimalProducts: false } });
  await run(ctx, 4);
  assert.equal(actsOn(ctx.world, '7,6').length, 0);
  assert.equal(ctx.world.M.tiles['7,6'].stack, 3);
});

test('收產物時遊戲順便餵下一輪：有飼料就餵、沒有就停在餓著', async () => {
  const ctx = boot({ tiles: { '7,6': hen({ stack: 1, timer: 0 }), '8,6': hen({ stack: 1, timer: 0 }) }, inv: { corn_cake: 1 }, autoBuyFeed: false, ckIds: [] });
  await run(ctx, 4);
  const fed = [ctx.world.M.tiles['7,6'], ctx.world.M.tiles['8,6']].filter((T) => T.timer > 0).length;
  assert.equal(fed, 1, '只有 1 份飼料，只餵得了 1 隻');
  assert.equal(ctx.world.S.inv.egg, 2, '兩隻的蛋都收了');
});

// ───── 肉用動物絕不碰 ─────

test('肉用動物長大後：任何情況都不點（點下去就是宰掉出貨）', async () => {
  const ctx = boot({
    tiles: { '0,9': broiler(), '1,9': broiler({ stage: 3 }), '2,9': broiler({ stage: 3, stack: 5 }) },
    inv: { corn_cake: 99 }, coins: 99999,
  }, { flags: { buyFeedWhenShort: true } });
  await run(ctx, 8);
  assert.equal(ctx.world.slaughtered.length, 0, '一隻都沒被宰');
  assert.equal(ctx.world.acts.filter((a) => a.id === 'broiler').length, 0, '連點都沒點');
  assert.equal(Object.keys(ctx.world.M.tiles).length, 3);
});

test('肉用動物長大後：就算資料帶著剩餘輪數（cycles>0）也不算餓、不點', async () => {
  const ctx = boot({ tiles: { '0,9': broiler({ cycles: 5 }), '1,9': broiler({ cycles: 5, stage: 3 }) }, inv: { corn_cake: 99 }, coins: 9999 }, { flags: { buyFeedWhenShort: true } });
  assert.equal(ctx.t.describeGame().animals.hungry, 0, '診斷也不把它們當成餓了');
  await run(ctx, 6);
  assert.equal(ctx.world.acts.length, 0, '連點都不點');
  assert.equal(ctx.world.slaughtered.length, 0);
});

test('肉用動物還沒長大：每個成長階段要餵（照一般動物處理）', async () => {
  const ctx = boot({ tiles: { '0,9': broiler({ stage: 1 }) }, inv: { corn_cake: 5 }, ckIds: [] });
  await run(ctx, 3);
  assert.ok(ctx.world.M.tiles['0,9'].timer > 0, '餵了');
  assert.equal(ctx.world.S.inv.corn_cake, 3, '成長階段每次 2 份');
  assert.equal(ctx.world.slaughtered.length, 0);
});

// ───── 餵食 ─────

test('餵食：餓了的蛋雞（會先跳小選單）→ 腳本按「餵食」、關掉選單；只用庫存，不花錢', async () => {
  const ctx = boot({ tiles: { '7,6': hen() }, inv: { corn_cake: 3 }, coins: 500 });
  await run(ctx, 3);
  const { world, t } = ctx;
  assert.ok(world.M.tiles['7,6'].timer > 0, '餵了');
  assert.equal(world.S.inv.corn_cake, 2);
  assert.equal(world.S.player.coins, 500, '沒花錢');
  assert.equal(world.pop.hidden, true, '不留著小選單卡住自己');
  assert.equal(t.stats.feed, 1);
  assert.equal(actsOn(world, '7,6')[0].tool, 'hand');
});

test('餵食：非雞鴨的動物（羊）直接餵；產物型成年用 cycleFeedQty、幼年用 stageFeedQty', async () => {
  const ctx = boot({ tiles: { '1,1': sheep(), '2,1': sheep({ stage: 0 }) }, inv: { pasture: 10 } });
  await run(ctx, 4);
  assert.ok(ctx.world.M.tiles['1,1'].timer > 0 && ctx.world.M.tiles['2,1'].timer > 0);
  assert.equal(ctx.world.S.inv.pasture, undefined, '成年 5 份 + 幼年 5 份 = 10 份全用完（用完的品項會從倉庫移除）');
  assert.equal(ctx.world.M.tiles['1,1'].cycles, 9, '成年餵一次少一輪壽命');
});

test('餵食：計時中、已經沒有輪數（老了）的動物不點', async () => {
  const ctx = boot({ tiles: { '1,1': sheep({ timer: 500 }), '2,1': sheep({ cycles: 0 }) }, inv: { pasture: 99 } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
});

test('餵食：飼料不夠就不點（不讓遊戲自動去買），標籤寫出缺什麼；一份庫存不會排給兩隻', async () => {
  const ctx = boot({ tiles: { '1,1': sheep(), '2,1': sheep(), '7,6': hen() }, inv: { pasture: 7 }, coins: 1000 }, { flags: { buyFeedWhenShort: false } });
  await run(ctx, 5);
  const fed = [ctx.world.M.tiles['1,1'], ctx.world.M.tiles['2,1']].filter((T) => T.timer > 0).length;
  assert.equal(fed, 1, '7 份牧草只夠 1 隻羊（每隻要 5 份）');
  assert.equal(ctx.world.S.player.coins, 1000, '絕不自動花錢');
  assert.equal(ctx.world.boughtFeed, 0);
  assert.match(ctx.t.status, /2 隻動物餓了但飼料不夠（/);
  assert.match(ctx.t.status, /牧草差 3/);
  assert.match(ctx.t.status, /玉米餅差 1/);
});

test('補買飼料（buyFeedWhenShort）：遊戲開著自動買、補買後金幣仍高於底線才買，花的錢剛好是商店價 × 缺的數量', async () => {
  const ctx = boot({ tiles: { '1,1': sheep(), '7,6': hen() }, inv: { pasture: 1 }, coins: 500 }, { flags: { buyFeedWhenShort: true } });
  await run(ctx, 4);
  assert.ok(ctx.world.M.tiles['1,1'].timer > 0 && ctx.world.M.tiles['7,6'].timer > 0, '都餵了');
  assert.equal(ctx.world.boughtFeed, 4 + 1, '羊缺 4 份牧草、雞缺 1 份玉米餅');
  assert.equal(ctx.world.coinsSpentOnFeed, 4 * 4 + 1 * 6);
  assert.equal(ctx.world.S.player.coins, 500 - 22);
});

test('補買飼料：金幣守住底線（minCoinsAfterBuyFeed）——補買後會低於底線就不買', async () => {
  let ctx = boot({ tiles: { '1,1': sheep(), '7,6': hen() }, inv: {}, coins: 90 }, { flags: { buyFeedWhenShort: true } });
  await run(ctx, 4);
  assert.equal(ctx.world.boughtFeed, 0, '雞 6 + 羊 20 = 26，90 - 26 = 64 < 100');
  assert.equal(ctx.world.S.player.coins, 90);
  assert.match(ctx.t.status, /餓了但飼料不夠/);
  ctx = boot({ tiles: { '1,1': sheep(), '7,6': hen() }, inv: {}, coins: 126 }, { flags: { buyFeedWhenShort: true } });
  await run(ctx, 4);
  assert.equal(ctx.world.boughtFeed, 5 + 1, '126 - 26 = 100，剛好不低於底線');
  ctx = boot({ tiles: { '1,1': sheep(), '7,6': hen() }, inv: {}, coins: 125 }, { flags: { buyFeedWhenShort: true } });
  await run(ctx, 4);
  assert.equal(ctx.world.M.tiles['7,6'].timer > 0 && ctx.world.M.tiles['1,1'].timer > 0, false, '125 - 26 = 99 < 100 → 兩隻都不買');
});

test('補買飼料：遊戲自己的「飼料不夠時自動買」關著，腳本就不買', async () => {
  const ctx = boot({ tiles: { '7,6': hen() }, inv: {}, coins: 9999, autoBuyFeed: false }, { flags: { buyFeedWhenShort: true } });
  await run(ctx, 4);
  assert.equal(ctx.world.boughtFeed, 0);
  assert.equal(ctx.world.S.player.coins, 9999);
  assert.equal(ctx.world.acts.length, 0, '遊戲不會買，腳本也就不去點（不做白工）');
});

test('補買飼料：庫存夠的先用庫存，只補不足的部分', async () => {
  const ctx = boot({ tiles: { '1,1': sheep() }, inv: { pasture: 3 }, coins: 500 }, { flags: { buyFeedWhenShort: true } });
  await run(ctx, 3);
  assert.equal(ctx.world.boughtFeed, 2, '要 5 份、有 3 份 → 補 2 份');
  assert.equal(ctx.world.S.inv.pasture, undefined);
});

test('autoFeedAnimals 關掉：不餵（餓著的動物完全不點）', async () => {
  const ctx = boot({ tiles: { '7,6': hen(), '1,1': sheep() }, inv: { corn_cake: 9, pasture: 9 } }, { flags: { autoFeedAnimals: false } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
});

test('餵食：動物走離家也能餵（補點擊記號）', async () => {
  const ctx = boot({ tiles: { '1,1': sheep() }, inv: { pasture: 9 }, agents: { '0:1,1': { x: 3.5, y: 3.5 } } });
  const marks = spyTapMark(ctx.world);
  await run(ctx, 3);
  assert.ok(ctx.world.M.tiles['1,1'].timer > 0);
  assert.deepEqual(marks, ['1,1']);
});

test('餵食之前再確認一次：排程時看起來餓著、動手前一刻已經不餓了（例如玩家剛餵過），就不點', async () => {
  const ctx = boot({ tiles: { '1,1': sheep() }, inv: { pasture: 9 } });
  const T = ctx.world.M.tiles['1,1'];
  let reads = 0;
  // 第一次讀 timer（排程）是 0＝餓著；之後（動手前的確認）變成計時中
  Object.defineProperty(T, 'timer', { get() { reads += 1; return reads === 1 ? 0 : 500; }, set() {}, configurable: true, enumerable: true });
  await step(ctx);
  assert.ok(reads >= 2, '排程與動手前各確認了一次');
  assert.equal(ctx.world.acts.length, 0, '動手前再確認：已經不餓就不點');
  assert.equal(ctx.world.S.inv.pasture, 9);
});

test('動物診斷：餓了幾隻、長大待出貨的肉用動物、剩幾輪壽命的產物型', () => {
  const ctx = boot({
    tiles: { '1,1': sheep(), '2,1': sheep({ timer: 9 }), '3,1': broiler(), '4,1': broiler({ stage: 0 }), '5,1': hen({ cycles: 2 }) },
    inv: { pasture: 1 },
  }, { enable: false });
  const a = ctx.t.describeGame().animals;
  assert.equal(a.total, 5);
  assert.equal(a.hungry, 3, '羊 1、幼年肉雞 1、蛋雞 1');
  assert.equal(a.meatReadyToShip, 1);
  assert.equal(a.lastCycles, 1, '剩 2 輪的蛋雞');
  assert.deepEqual({ ...a.feedNeed }, { pasture: 5, corn_cake: 3 });
});
