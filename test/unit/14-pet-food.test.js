'use strict';
// 貓、狗餓了自動「餵」（使用者 2026-11-17 要求）。
// 遊戲規則（讀原始碼＋隔離副本實測）：貓、狗不能點牠餵食，牠們時間到了自己從倉庫扣 1 份狗飼料／貓飼料，
// 倉庫沒有就餓著。狗飼料、貓飼料只能在倉庫的「飼料商店」分頁買（買 10／50 個，先跳「確定要買嗎？」）。
// 所以腳本的做法是保持庫存：庫存不夠或有寵物餓著，就到飼料商店買 10 份（要設定允許、買完金幣 ≥ 100、倉庫放得下）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const dog = (extra = {}) => Object.assign({ kind: 'dog', breed: 'shiba', hungry: true, food: 0 }, extra);
const cat = (extra = {}) => Object.assign({ kind: 'cat', breed: 'orange', hungry: true, food: 0 }, extra);
const hungryCount = (ctx) => ctx.world.S.pets.filter((p) => p.hungry).length;
const farm = (o = {}, cfg = {}) => boot(Object.assign({ cap: 1000, coins: 1000 }, o), cfg);

// ───── 基本：餓了就補貨，遊戲下一步自己餵 ─────

test('兩隻狗餓著、倉庫沒有狗飼料：開倉庫 → 飼料商店 → 買到每隻 10 份（買 2 次 10 份）→ 關掉；狗不餓了', async () => {
  const ctx = farm({ pets: [dog(), dog()] });
  await run(ctx, 4);
  const { world, t } = ctx;
  assert.deepEqual(world.shopBuys, [['dog_food', 10], ['dog_food', 10]]);
  assert.equal(world.S.player.coins, 1000 - 160);
  assert.equal(world.S.inv.dog_food, 18, '買了 20 份，兩隻餓著的狗各吃 1 份');
  assert.equal(hungryCount(ctx), 0);
  assert.equal(world.modal.hidden, true, '倉庫視窗一定關掉');
  assert.equal(ctx.doc.getElementById('ask47'), null, '沒有留下確認視窗');
  assert.equal(world.storageUI.opens, 1);
  assert.equal(t.stats.petFood, 2);
  assert.match(t.badge.textContent, /寵物飼料 2/);
  assert.equal(world.askNoAskBox.clicks, 0, '絕不碰「以後不再詢問」');
});

test('貓餓著：買貓飼料（每份 6 金幣）；狗和貓都餓著就兩種都買', async () => {
  let ctx = farm({ pets: [cat()] });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.shopBuys, [['cat_food', 10]]);
  assert.equal(ctx.world.S.player.coins, 1000 - 60);
  ctx = farm({ pets: [dog(), cat()] });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.shopBuys, [['dog_food', 10], ['cat_food', 10]]);
  assert.equal(hungryCount(ctx), 0);
});

test('標籤的確認視窗核對：標題是「狗飼料 ×10」、價格 80；核對後才按「確定購買」', async () => {
  const ctx = farm({ pets: [dog()] });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.askLog, [['狗飼料 ×10', 80]]);
  assert.equal(ctx.world.askCancelled, 0);
});

// ───── 不該動手的情況 ─────

test('庫存夠、沒有寵物餓著：不開倉庫、不花錢', async () => {
  const ctx = farm({ pets: [dog({ hungry: false }), dog({ hungry: false })], inv: { dog_food: 8 } }); // 8 ≥ 2 × 4
  await run(ctx, 6);
  assert.equal(ctx.world.storageUI.opens, 0);
  assert.deepEqual(ctx.world.shopBuys, []);
});

test('沒養任何貓狗：什麼都不做', async () => {
  const ctx = farm({});
  await run(ctx, 6);
  assert.equal(ctx.world.storageUI.opens, 0);
});

test('庫存雖然還有、但低於「隻數 × 4」就先補（不等到餓著）：一隻狗剩 3 份 → 補到 10 份', async () => {
  const ctx = farm({ pets: [dog({ hungry: false })], inv: { dog_food: 3 } });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.shopBuys, [['dog_food', 10]]);
  assert.equal(ctx.world.S.inv.dog_food, 13, '3 + 10 ≥ 10：只買 1 次');
});

test('餓著的是狗、貓飼料很多：只買狗飼料，不碰貓飼料，也不買其他飼料（玉米餅、魚飼料…）', async () => {
  const ctx = farm({ pets: [dog(), cat({ hungry: false })], inv: { cat_food: 50 } });
  await run(ctx, 4);
  assert.ok(ctx.world.shopBuys.every(([id]) => id === 'dog_food'));
  assert.ok(ctx.world.shopBuys.length >= 1);
});

test('autoBuyPetFood 關掉：不補貨，也不寫標籤提示', async () => {
  const ctx = farm({ pets: [dog()] }, { flags: { autoBuyPetFood: false } });
  await run(ctx, 6);
  assert.equal(ctx.world.storageUI.opens, 0);
  assert.equal(hungryCount(ctx), 1);
  assert.ok(!/寵物飼料/.test(ctx.t.status));
});

// ───── 花錢的保護 ─────

test('買完金幣要 ≥ minCoinsAfterBuyPetFood（100）：80 的一份，金幣 180 剛好可以買、179 不行；不行時標籤寫原因、不亂開倉庫', async () => {
  let ctx = farm({ pets: [dog()], coins: 180 });
  await run(ctx, 4);
  assert.equal(ctx.world.shopBuys.length, 1, '180 - 80 = 100，剛好');
  ctx = farm({ pets: [dog()], coins: 179 });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.shopBuys, []);
  assert.equal(ctx.world.S.player.coins, 179, '一毛錢都沒花');
  assert.equal(ctx.world.modal.hidden, true, '開了倉庫也要關好');
  assert.match(ctx.t.status, /寵物飼料：缺狗飼料（庫存 0），金幣要 180 以上才買/);
  const opens = ctx.world.storageUI.opens;
  await run(ctx, 10, 1000);
  assert.equal(ctx.world.storageUI.opens, opens, '60 秒內不再開');
});

test('買不起時有了錢：隔 petFoodRetryMs（60 秒）後再試，就買得到', async () => {
  const ctx = farm({ pets: [dog()], coins: 100 });
  await run(ctx, 3);
  assert.deepEqual(ctx.world.shopBuys, []);
  ctx.world.S.player.coins = 1000;
  await ctx.clock.advance(60000);
  await run(ctx, 4);
  assert.equal(hungryCount(ctx), 0);
});

test('一次最多買 5 次（50 份）：十隻狗餓著要補到 100 份，這次只買 5 次；買完庫存 40（餓著的 10 隻各吃 1 份）剛好是低水位，就不再買', async () => {
  const ctx = farm({ pets: Array.from({ length: 10 }, () => dog()), coins: 100000 });
  await run(ctx, 3);
  assert.equal(ctx.world.shopBuys.length, 5);
  assert.equal(hungryCount(ctx), 0);
  assert.equal(ctx.world.S.inv.dog_food, 40);
  await run(ctx, 4);
  assert.equal(ctx.world.shopBuys.length, 5, '庫存 40 ≥ 10 隻 × 4：不再買');
});

test('一次買 5 次還沒補到低水位時，下個週期立刻接著買（不用等 60 秒）：二十隻狗從 0 庫存開始', async () => {
  const ctx = farm({ pets: Array.from({ length: 20 }, () => dog()), coins: 100000, cap: 5000 });
  await step(ctx);
  assert.equal(ctx.world.shopBuys.length, 5, '第一輪買 5 次（50 份，餓著的 20 隻吃掉 20 份，剩 30 < 低水位 80）');
  await step(ctx);
  assert.equal(ctx.world.shopBuys.length, 10, '下個週期接著買 5 次');
  assert.equal(ctx.world.S.inv.dog_food, 80, '剛好到低水位（20 隻 × 4），不再買');
  await run(ctx, 4);
  assert.equal(ctx.world.shopBuys.length, 10);
});

test('倉庫空位不到 10 格：買不下就不買（遊戲會拒絕），標籤寫原因', async () => {
  const ctx = farm({ pets: [dog()], cap: 20, inv: { corn: 15 } }, { flags: { autoSell: false } });
  ctx.world.CFG.items.corn = ctx.world.CFG.items.corn || { name: '玉米', category: 'crop', sellPrice: 105 };
  await run(ctx, 4);
  assert.deepEqual(ctx.world.shopBuys, []);
  assert.match(ctx.t.status, /倉庫只剩 5 格空位，買不下 10 份狗飼料/);
  assert.equal(ctx.world.modal.hidden, true);
});

// ───── 確認視窗核對 ─────

test('確認視窗價格和預期不同：按「取消」、不買、不留下視窗', async () => {
  const ctx = farm({ pets: [dog()], askPrice: 999 });
  await run(ctx, 4);
  assert.equal(ctx.world.askCancelled, 1);
  assert.deepEqual(ctx.world.shopBuys, []);
  assert.equal(ctx.world.S.player.coins, 1000);
  assert.equal(ctx.doc.getElementById('ask47'), null);
  assert.equal(ctx.world.modal.hidden, true);
  assert.match(ctx.t.status, /購買確認視窗的價格和預期不同（999）/);
});

test('確認視窗買的東西和預期不同：按「取消」、不買', async () => {
  const ctx = farm({ pets: [dog()], askTitle: '玉米餅 ×10' });
  await run(ctx, 4);
  assert.equal(ctx.world.askCancelled, 1);
  assert.deepEqual(ctx.world.shopBuys, []);
  assert.match(ctx.t.status, /買的東西和預期不同（玉米餅 ×10）/);
});

test('玩家勾過「以後不再詢問」（遊戲不跳確認視窗）：按鈕直接買', async () => {
  const ctx = farm({ pets: [dog()], noAsk: true });
  await run(ctx, 4);
  assert.equal(ctx.world.askShown, 0);
  assert.equal(hungryCount(ctx), 0);
  assert.deepEqual(ctx.world.shopBuys, [['dog_food', 10]]);
});

test('找不到「飼料商店」分頁或按鈕（遊戲改版）：不丟錯、關掉倉庫、暫停後再試', async () => {
  const ctx = farm({ pets: [dog()] });
  const orig = ctx.doc.querySelector.bind(ctx.doc);
  ctx.doc.querySelector = (sel) => (sel === '#modalTabs button[data-k="shop"]' ? null : orig(sel));
  await run(ctx, 4);
  assert.equal(ctx.t.enabled, true, '不是未知錯誤，不會關掉自動功能');
  assert.equal(ctx.world.modal.hidden, true);
  assert.match(ctx.t.status, /找不到倉庫的「飼料商店」分頁/);
});

// ───── 和其他流程的關係 ─────

test('玩家自己開著視窗時不動手（不搶玩家的倉庫）', async () => {
  const ctx = farm({ pets: [dog()] });
  ctx.world.modal.hidden = false;
  ctx.world.modalTitle.textContent = '倉庫';
  await run(ctx, 4);
  assert.equal(ctx.world.storageUI.opens, 0);
  assert.deepEqual(ctx.world.shopBuys, []);
});

test('寵物飼料不在賣出範圍：賣作物、賣雜草時不會把飼料賣掉', async () => {
  const ctx = farm({});
  ctx.t.targetCrop = { id: 'wheat', name: '小麥' };
  assert.equal(ctx.t.isSellTarget('dog_food'), false);
  assert.equal(ctx.t.isSellTarget('cat_food'), false);
  assert.equal(ctx.t.isSellWeed('dog_food'), false);
});

test('有多座島：補飼料是全域的（倉庫、金幣共用），在家島就補，不用切島', async () => {
  const ctx = farm({ pets: [dog()], tiles: { '0,0': soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: false } }) }, maps: [{ tiles: { '1,0': soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: false } }) } }] });
  await run(ctx, 4);
  assert.equal(hungryCount(ctx), 0);
  assert.deepEqual(ctx.world.switches, []);
});

test('動物（雞、牛…）的餵食不受影響：寵物補貨和一般動物餵食各管各的', async () => {
  const ctx = farm({
    pets: [dog()],
    tiles: { '7,6': { t: 'animal', id: 'egg_hen', stage: 2, timer: 0, cycles: 5, stack: 0 } },
    inv: { corn_cake: 5 },
  });
  await run(ctx, 8);
  assert.equal(hungryCount(ctx), 0, '狗有飼料了');
  assert.equal(ctx.world.M.tiles['7,6'].timer > 0, true, '雞也照舊被餵了');
});

// ───── 診斷、預設值 ─────

test('診斷：貓狗隻數、餓著幾隻、飼料庫存；摘要有一行', async () => {
  const ctx = farm({ pets: [dog(), dog({ hungry: false }), cat()], inv: { dog_food: 7, cat_food: 2 } }, { enable: false });
  const g = ctx.t.describeGame();
  assert.deepEqual({ ...g.pets }, { total: 3, hungry: 2, dogs: 2, cats: 1, dogFood: 7, catFood: 2 });
  ctx.env.key('KeyD');
  await ctx.clock.advance(0);
  assert.match(ctx.t.note, /寵物：2 狗 1 貓｜餓著 2｜狗飼料 7／貓飼料 2/);
});

test('預設值釘住（使用者 2026-11-17 要求：貓狗餓了自動餵）', () => {
  const { t } = boot({}, { enable: false });
  const C = t.CONFIG;
  assert.equal(C.autoBuyPetFood, true);
  assert.equal(C.petFoodLowPerPet, 4);
  assert.equal(C.petFoodTargetPerPet, 10);
  assert.equal(C.minCoinsAfterBuyPetFood, 100);
  assert.equal(C.petFoodRetryMs, 60000);
});
