'use strict';
// 2026-11-18 使用者要求：加上製作堆肥（可能有多個堆肥桶）、自動堆肥與收取、賣便便／雜草時保留一定的數量。
//   - 堆肥桶有自己的開關 autoCompost（預設開，原料是免費的便便與雜草）；不動 autoLoadMachines（其他機器維持預設關閉）。
//   - 便便本來就不賣（賣價 0）；雜草賣出時保留「所有堆肥桶各放滿 compostKeepRounds 輪」要用的量：
//     庫存沒超過就不勾雜草；超過就在賣出確認視窗裡用雜草那一列的「−」把數量調成「庫存 − 保留量」，逐列回讀驗證，對不上就取消。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const bin = (o = {}) => Object.assign({ t: 'machine', id: 'compost_bin', state: 'idle', until: 0 }, o);
const fishMachine = () => ({ t: 'machine', id: 'fish_feed_machine', state: 'idle', until: 0 });
const BIG = 5000; // 倉庫夠大：不會因為快滿而先去賣東西
// 倉庫快滿、要賣的標準情境（容量 300，剩 3 格 ≤ 5）：小麥 100、雜草 weeds、便便 3（不夠一批，桶不會搶先投料），其餘用蛋填滿
const full = (weeds, extra = {}, flags = {}) => boot({
  cap: 300, inv: { wheat: 100, weed: weeds, poop: 3, egg: 300 - 3 - 100 - weeds - 3 }, coins: 100, ...extra,
}, { flags });

// ───── 自動堆肥：多個堆肥桶、各種等級 ─────

test('多個堆肥桶：材料不夠分時先到先得、不卡住；補了材料後下一個桶接著投', async () => {
  const ctx = boot({ tiles: { '5,2': bin(), '6,2': bin(), '7,2': bin() }, inv: { poop: 8, weed: 4 }, cap: BIG });
  await run(ctx, 6);
  const T = ctx.world.M.tiles;
  assert.deepEqual(['5,2', '6,2', '7,2'].map((k) => T[k].state), ['working', 'working', 'idle'], '兩批的材料：前兩個桶各放 1 批，第三個沒材料就空著');
  assert.equal(ctx.world.S.inv.poop, undefined);
  assert.equal(ctx.world.S.inv.weed, undefined);
  const hands = ctx.world.acts.filter((a) => a.tool === 'hand').length;
  assert.equal(hands, 2, '沒材料的桶不亂點');
  ctx.world.S.inv.poop = 4;
  ctx.world.S.inv.weed = 2;
  await run(ctx, 3);
  assert.equal(T['7,2'].state, 'working', '補了 1 批的材料，第三個桶接著投');
});

test('高等級堆肥桶：一次投到放滿（Lv5 ＝ 5 批）；放滿後不再點；其他島的桶也算（要切過去）', async () => {
  const ctx = boot({
    tiles: { '5,2': bin({ lvl: 5 }) }, maps: [{ tiles: { '8,2': bin({ lvl: 3 }) } }],
    inv: { poop: 99, weed: 99 }, cap: BIG,
  });
  await run(ctx, 12);
  const [m0, m1] = ctx.world.S.maps;
  assert.equal(m0.tiles['5,2'].q + 1, 5, 'Lv5：第 1 批在做、其餘 4 批排隊');
  assert.equal(m1.tiles['8,2'].q + 1, 3, '第 2 座島的 Lv3 桶：3 批');
  assert.equal(ctx.world.S.inv.poop, 99 - 4 * 8, '共 8 批，每批糞便 4');
  assert.equal(ctx.world.S.inv.weed, 99 - 2 * 8, '每批雜草 2');
  const before = ctx.world.acts.length;
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, before, '放滿了就不再動');
});

test('補投：做好 1 批先收，再把空出來的位置補上（Lv5 一邊做一邊補）', async () => {
  const ctx = boot({ tiles: { '5,2': bin({ lvl: 5, state: 'working', run: true, q: 3, out: 1 }) }, inv: { poop: 20, weed: 10 }, cap: BIG });
  await run(ctx, 1);
  assert.equal(ctx.world.S.inv.organic_fert, 2, '先收成品（每批 2 個有機肥）');
  assert.equal(ctx.world.S.inv.poop, 20, '收成品的同一輪不投料');
  await run(ctx, 2);
  const T = ctx.world.M.tiles['5,2'];
  assert.equal(T.q, 4, '空出 1 個位置，補 1 批（做 1 ＋ 排隊 3 ＋ 新的 1 ＝ 5）');
  assert.equal(ctx.world.S.inv.poop, 16);
  assert.equal(ctx.world.S.inv.weed, 8);
  assert.equal(ctx.t.stats.machine, 2, '收 1 次、投 1 次');
});

test('堆肥桶只看 autoCompost：loadWanted 的判斷（其他機器看 autoLoadMachines 加白名單）', () => {
  const { t } = boot({}, { enable: false });
  const C = t.CONFIG;
  assert.equal(t.loadWanted('compost_bin'), true, '預設開');
  assert.equal(t.loadWanted('fish_feed_machine'), false, 'autoLoadMachines 預設關');
  assert.equal(t.loadWanted('corn_cake_machine'), false);
  C.autoLoadMachines = true;
  assert.equal(t.loadWanted('fish_feed_machine'), true);
  assert.equal(t.loadWanted('corn_cake_machine'), false, '不在白名單');
  C.autoCompost = false;
  assert.equal(t.loadWanted('compost_bin'), false, '關掉 autoCompost：即使 autoLoadMachines 開著也不投');
  C.loadMachineIds = ['compost_bin']; // 就算有人把堆肥桶塞進白名單，也不能繞過 autoCompost
  assert.equal(t.loadWanted('compost_bin'), false);
});

// ───── 賣雜草時的保留量 ─────

test('保留量的算法：每座島所有堆肥桶的批數上限 × 每批雜草 × 輪數；沒開、設 0、沒有堆肥桶都是 0；其他機器不算', () => {
  const ctx = boot({
    tiles: { '1,1': bin(), '2,2': bin({ lvl: 5 }), '3,3': fishMachine() },
    maps: [{ tiles: { '4,4': bin({ lvl: 3 }), '5,5': { t: 'weed', v: 0 } } }],
  }, { enable: false });
  const g = ctx.t.game();
  assert.equal(ctx.t.machineCap(g.S.maps[0].tiles['2,2'], g.CFG), 5);
  assert.equal(ctx.t.machineCap(g.S.maps[1].tiles['4,4'], g.CFG), 3);
  assert.equal(ctx.t.machineCap(g.S.maps[0].tiles['3,3'], g.CFG), 1, '魚飼料機一次一批（沒有升級功能的也是）');
  assert.equal(ctx.t.weedReserve(g), (1 + 5 + 3) * 2 * 2, '9 批 × 每批雜草 2 × 2 輪 ＝ 36');
  ctx.t.CONFIG.compostKeepRounds = 1;
  assert.equal(ctx.t.weedReserve(g), 18);
  ctx.t.CONFIG.compostKeepRounds = 0;
  assert.equal(ctx.t.weedReserve(g), 0, '設 0＝不保留');
  ctx.t.CONFIG.compostKeepRounds = 2;
  ctx.t.CONFIG.autoCompost = false;
  assert.equal(ctx.t.weedReserve(g), 0, '堆肥關掉就不用保留');
  ctx.t.CONFIG.autoCompost = true;
  g.S.maps[0].tiles = {};
  g.S.maps[1].tiles = {};
  assert.equal(ctx.t.weedReserve(g), 0, '沒有堆肥桶就不保留');
});

test('賣出：雜草庫存超過保留量，只賣超過的部分；設定作物全賣；便便與其他東西不動', async () => {
  const ctx = full(50, { tiles: { '1,1': bin({ lvl: 5 }) } }); // 1 台 Lv5：5 批 × 2 × 2 輪 ＝ 保留 20
  await step(ctx);
  const ui = ctx.world.storageUI;
  assert.equal(ui.opens, 1);
  assert.deepEqual(ui.sold.map(([id, n]) => id + ':' + n).sort(), ['weed:30', 'wheat:100'], '雜草賣 50 − 20 ＝ 30，小麥全賣');
  assert.equal(ctx.world.S.inv.weed, 20, '留下的雜草剛好是保留量');
  assert.equal(ctx.world.S.inv.poop, 3, '便便不賣');
  assert.equal(ctx.world.S.player.coins, 100 + 100 * 15 + 30 * 1, '金額：小麥 15、雜草 1');
  assert.equal(ctx.world.modal.hidden, true);
  assert.equal(ctx.t.weedSellOffUntil, 0);
});

test('賣出：雜草庫存沒超過保留量（含剛好等於）就不勾雜草，設定作物照賣', async () => {
  for (const weeds of [20, 7, 0]) {
    const ctx = full(weeds, { tiles: { '1,1': bin({ lvl: 5 }) } });
    await step(ctx);
    assert.deepEqual(ctx.world.storageUI.sold.map(([id]) => id), ['wheat'], '雜草庫存 ' + weeds + ' ≤ 保留 20：不賣雜草');
    assert.equal(ctx.world.S.inv.weed || 0, weeds);
  }
});

test('賣出：多個堆肥桶（跨島）的保留量加總；保留量跟著桶的等級、數量變', async () => {
  const ctx = full(100, { tiles: { '1,1': bin(), '2,2': bin({ lvl: 5 }) }, maps: [{ tiles: { '4,4': bin({ lvl: 3 }) } }] });
  await step(ctx);
  assert.equal(ctx.world.S.inv.weed, 36, '(1 + 5 + 3) 批 × 2 × 2 輪 ＝ 36');
  assert.deepEqual(ctx.world.storageUI.sold.map(([id, n]) => id + ':' + n).sort(), ['weed:64', 'wheat:100']);
});

test('賣出：沒有堆肥桶、關掉 autoCompost、輪數設 0、關掉 sellWeedsWithCrops——各自的行為', async () => {
  let ctx = full(50, {});
  await step(ctx);
  assert.equal(ctx.world.S.inv.weed, undefined, '沒有堆肥桶：和以前一樣，雜草全賣');
  ctx = full(50, { tiles: { '1,1': bin({ lvl: 5 }) } }, { autoCompost: false });
  await step(ctx);
  assert.equal(ctx.world.S.inv.weed, undefined, '堆肥關掉：不用保留，雜草全賣');
  ctx = full(50, { tiles: { '1,1': bin({ lvl: 5 }) } }, { compostKeepRounds: 0 });
  await step(ctx);
  assert.equal(ctx.world.S.inv.weed, undefined, '輪數 0：雜草全賣');
  ctx = full(50, { tiles: { '1,1': bin({ lvl: 5 }) } }, { sellWeedsWithCrops: false });
  await step(ctx);
  assert.equal(ctx.world.S.inv.weed, 50, '本來就不賣雜草：一株都不動');
  assert.deepEqual(ctx.world.storageUI.sold.map(([id]) => id), ['wheat']);
});

test('賣出：不碰視窗上方的全域「保留 N」；小麥列的數量維持全數（逐列只調雜草那一列）', async () => {
  const ctx = full(50, { tiles: { '1,1': bin({ lvl: 5 }) } });
  await step(ctx);
  const wheat = ctx.world.storageUI.sold.find(([id]) => id === 'wheat');
  assert.equal(wheat[1], 100, '小麥不會被保留量影響');
});

// ───── 對不上就取消（資安：寧可不賣，也不能把保留的雜草賣掉）─────

test('「−」按下去沒反應（數量調不下去）：取消、不賣任何東西、視窗收乾淨；之後 10 分鐘賣出不帶雜草，作物照賣', async () => {
  const ctx = full(50, { tiles: { '1,1': bin({ lvl: 5 }) }, minusBroken: true });
  await step(ctx);
  const ui = ctx.world.storageUI;
  assert.deepEqual(ui.sold, [], '這次什麼都沒賣');
  assert.equal(ctx.world.S.inv.weed, 50, '雜草一株都沒少');
  assert.equal(ctx.world.modal.hidden, true, '倉庫視窗關了');
  assert.match(ctx.t.note, /數量和預期不一致（weed）/);
  assert.ok(ctx.t.weedSellOffUntil > ctx.clock.now, '之後一段時間賣出不帶雜草');
  assert.ok(ctx.t.sellBlockedUntil > ctx.clock.now - 1000);
  // 隔一陣子再試：這次不勾雜草，只賣作物
  await ctx.clock.advance(31000);
  ui.minusBroken = false;
  await step(ctx);
  assert.deepEqual(ui.sold.map(([id]) => id), ['wheat'], '作物照賣');
  assert.equal(ctx.world.S.inv.weed, 50, '雜草仍然沒動');
});

test('確認視窗裡找不到逐列數量（遊戲改版了）：取消、不賣雜草', async () => {
  const ctx = full(50, { tiles: { '1,1': bin({ lvl: 5 }) }, noQtyRows: true });
  await step(ctx);
  assert.deepEqual(ctx.world.storageUI.sold, []);
  assert.equal(ctx.world.S.inv.weed, 50);
  assert.match(ctx.t.note, /找不到雜草的數量欄/);
  assert.ok(ctx.t.weedSellOffUntil > ctx.clock.now);
});

test('確認視窗多出我們沒勾的物品：取消，什麼都不賣', async () => {
  const ctx = full(50, { tiles: { '1,1': bin({ lvl: 5 }) }, extraRows: ['corn'] });
  ctx.world.S.inv.corn = 7; // 從蛋挪 7 個過來，倉庫總量不變（還是剩 3 格）
  ctx.world.S.inv.egg -= 7;
  await step(ctx);
  assert.deepEqual(ctx.world.storageUI.sold, []);
  assert.equal(ctx.world.S.inv.corn, 7);
  assert.equal(ctx.world.S.inv.wheat, 100);
  assert.match(ctx.t.note, /預期以外的物品：corn/);
});

test('沒有要留雜草時（保留量 0）不改確認視窗：維持以前的流程（預設全數賣出）', async () => {
  const ctx = full(50, { noQtyRows: true }); // 沒有堆肥桶，連逐列數量都沒有也照賣
  await step(ctx);
  assert.deepEqual(ctx.world.storageUI.sold.map(([id]) => id).sort(), ['weed', 'wheat']);
});

// ───── 預設值與說明 ─────

test('設定：autoCompost 預設開、compostKeepRounds 預設 2；便便不在任何賣出名單裡', () => {
  const { t } = boot({}, { enable: false });
  assert.equal(t.DEFAULTS.autoCompost, true);
  assert.equal(t.DEFAULTS.compostKeepRounds, 2);
  assert.deepEqual([...t.DEFAULTS.loadMachineIds], ['fish_feed_machine']);
  assert.equal(t.DEFAULTS.autoLoadMachines, false, '其他機器維持預設關閉（使用者 2026-11-14 的決定）');
  t.targetCrop = { id: 'wheat', name: '小麥' };
  assert.equal(t.isSellTarget('poop'), false);
  assert.equal(t.isSellWeed('poop'), false);
});
