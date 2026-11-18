'use strict';
// 果樹、魚池、機器：什麼時候收、用哪種工具、小選單怎麼處理、哪些東西預設關閉、絕不碰的東西。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const tree = (o = {}) => Object.assign({ t: 'tree', id: 'orange', m: 4, prog: 0, first: false }, o);
const readyTree = (o = {}) => tree({ prog: 10800, ...o });
const cell = (o = {}) => Object.assign({ t: 'pool', fish: 'tilapia', stage: 0, timer: 100 }, o);
const readyCell = (o = {}) => cell({ stage: 2, timer: 0, ...o });
const machine = (id, o = {}) => Object.assign({ t: 'machine', id, state: 'idle', until: 0 }, o);
const poolOf = (keys) => ({ A: { tiles: keys, n: keys.length } });

// ───── 果樹 ─────

test('果樹：結果了用收成工具採收，進倉庫；還沒結果的不碰', async () => {
  const ctx = boot({ tiles: { '0,0': readyTree(), '1,0': tree({ prog: 100 }) } });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.orange, 1);
  assert.equal(ctx.world.M.tiles['0,0'].prog, 0);
  assert.equal(ctx.world.acts.filter((a) => a.k === '1,0').length, 0);
  assert.equal(ctx.world.acts[0].tool, 'hand');
  assert.equal(ctx.t.stats.fruit, 1);
});

test('果樹：第一次結果要等 firstFruitSeconds；autoHarvestTrees 關掉就不採', async () => {
  let ctx = boot({ tiles: { '0,0': tree({ first: true, prog: 10800 }) } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0, '第一次結果要 36000 秒，10800 還不夠');
  ctx = boot({ tiles: { '0,0': readyTree() } }, { flags: { autoHarvestTrees: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
});

test('果樹：倉庫沒空位就不採（不跳「倉庫滿了」），標籤說明', async () => {
  const ctx = boot({ tiles: { '0,0': readyTree() }, cap: 5, inv: { filler: 5 } }, { flags: { autoSell: false } });
  ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 };
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.world.fullPrompts, 0);
  assert.match(ctx.t.status, /倉庫沒空位，暫停收地上的東西、果樹、魚、機器成品/);
});

test('果樹長蟲：先用捉蟲抓光再採收', async () => {
  const ctx = boot({ tiles: { '0,0': readyTree({ pest: true }) } });
  await run(ctx, 9);
  assert.equal(ctx.world.acts.filter((a) => a.tool === 'care').length, 3);
  assert.ok(ctx.world.acts.filter((a) => a.tool === 'care').every((a) => a.care === 'catch'));
  assert.equal(ctx.world.chemUsed, 0);
  assert.equal(ctx.world.S.inv.orange, 1, '抓光後採收');
});

test('果樹澆水：預設關閉；autoWaterTrees 開了才澆，而且結果了的樹不澆', async () => {
  let ctx = boot({ tiles: { '0,0': tree({ m: 0 }) } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0, '預設不澆果樹（會和作物搶雨水）');
  ctx = boot({ tiles: { '0,0': tree({ m: 0 }), '1,0': readyTree({ m: 0 }) } }, { flags: { autoWaterTrees: true } });
  await run(ctx, 12);
  assert.equal(ctx.world.M.tiles['0,0'].m, 4, '澆到滿');
  assert.equal(ctx.world.acts.filter((a) => a.k === '1,0')[0].tool, 'hand', '結果了的樹先採收，不是先澆水（採完重新計時才輪到澆水）');
});

// ───── 魚池 ─────

test('魚池：有長成的魚 → 用「播種」工具點（不是收成工具，那會跳小選單），整池收成', async () => {
  const ctx = boot({ tiles: { '0,0': readyCell(), '1,0': readyCell() }, pools: poolOf(['0,0', '1,0']) });
  await run(ctx, 4);
  const { world } = ctx;
  assert.equal(world.S.inv.tilapia, 2);
  assert.equal(world.acts.filter((a) => a.type === 'pool').length, 1, '一個池只點一下');
  assert.equal(world.acts.find((a) => a.type === 'pool').tool, 'seed');
  assert.equal(world.M.tiles['0,0'].fish, null);
  assert.equal(world.pop.hidden, true);
  assert.equal(ctx.t.stats.fish, 1);
});

test('魚池：絕不用收成工具點（會跳小選單）、也不補魚苗', async () => {
  const ctx = boot({ tiles: { '0,0': readyCell(), '1,0': cell({ fish: null }) }, pools: poolOf(['0,0', '1,0']), coins: 9999 });
  await run(ctx, 6);
  assert.equal(ctx.world.acts.filter((a) => a.type === 'pool' && a.tool !== 'seed').length, 0);
  assert.equal(ctx.world.S.player.coins, 9999, '沒花錢補魚苗');
  assert.equal(ctx.world.M.tiles['1,0'].fish, null, '空格維持空的');
});

test('魚池：收成數量放不下（含連通加成）就不點；autoHarvestFish 可關', async () => {
  const tiles = {};
  const keys = [];
  for (let i = 0; i < 4; i++) { tiles[i + ',0'] = readyCell(); keys.push(i + ',0'); } // 4 格：加成 10%，4 條 → round(4.4)=4
  let ctx = boot({ tiles, pools: poolOf(keys), cap: 10, inv: { filler: 7 } }, { flags: { autoSell: false } });
  ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 };
  await run(ctx, 4);
  assert.equal(ctx.world.fullPrompts, 0);
  assert.equal(ctx.world.acts.filter((a) => a.type === 'pool').length, 0, '空位 3 < 4');
  ctx = boot({ tiles: { '0,0': readyCell() }, pools: poolOf(['0,0']) }, { flags: { autoHarvestFish: false } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
});

test('魚池餵食：預設關閉；開了只用倉庫現有飼料，不夠就不餵、也不讓遊戲買', async () => {
  let ctx = boot({ tiles: { '0,0': cell({ timer: 0 }) }, pools: poolOf(['0,0']), inv: { fish_feed: 9 } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0, '預設不餵魚');
  ctx = boot({ tiles: { '0,0': cell({ timer: 0 }) }, pools: poolOf(['0,0']), inv: { fish_feed: 9 } }, { flags: { autoFeedFish: true } });
  await run(ctx, 4);
  assert.ok(ctx.world.M.tiles['0,0'].timer > 0, '餵了');
  assert.equal(ctx.world.S.inv.fish_feed, 7, '每格 2 份');
  ctx = boot({ tiles: { '0,0': cell({ timer: 0 }) }, pools: poolOf(['0,0']), inv: { fish_feed: 1 }, coins: 999 }, { flags: { autoFeedFish: true } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0, '1 份 < 2 份');
  assert.equal(ctx.world.S.player.coins, 999, '就算遊戲開著自動買，腳本也不去點');
  assert.match(ctx.t.status, /魚飼料不夠，暫停餵魚/);
});

test('魚池：同一池有長成的又有餓的 → 先收成（餵食留到下次）', async () => {
  const ctx = boot({ tiles: { '0,0': readyCell(), '1,0': cell({ timer: 0 }) }, pools: poolOf(['0,0', '1,0']), inv: { fish_feed: 9 } }, { flags: { autoFeedFish: true } });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.tilapia, 2 * 1 / 2 * 1 + 0 || ctx.world.S.inv.tilapia, '收成了長成的');
  assert.equal(ctx.world.S.inv.fish_feed, 9, '這一輪沒有餵');
});

// ───── 機器 ─────

test('機器：有成品用收成工具點、只按小選單的「收成」，成品進倉庫；不碰「升級」', async () => {
  const ctx = boot({ tiles: { '5,2': machine('compost_bin', { out: 2, state: 'done' }) } });
  await run(ctx, 3);
  const { world } = ctx;
  assert.equal(world.S.inv.organic_fert, 4, '每批 2 個，2 批');
  assert.equal(world.M.tiles['5,2'].out, 0);
  assert.equal(world.upgrades, 0, '升級要花錢，絕不按');
  assert.equal(world.pop.hidden, true, '選單用完收掉');
  assert.equal(ctx.t.stats.machine, 1);
  assert.equal(world.acts[0].tool, 'hand');
});

test('機器：「還在做、同時已有做好的成品」也收（state 是 working 不能當成沒成品）', async () => {
  const ctx = boot({ tiles: { '5,2': machine('fish_feed_machine', { out: 1, state: 'working', run: true }) } });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.fish_feed, 8);
});

test('機器：舊存檔只有 state=done（沒有 out）也當作有 1 批', async () => {
  const ctx = boot({ tiles: { '5,2': machine('corn_cake_machine', { state: 'done' }) } });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.corn_cake, 20);
});

test('機器：倉庫放不下成品就不收（不跳「倉庫滿了」）；autoCollectMachines 可關', async () => {
  let ctx = boot({ tiles: { '5,2': machine('corn_cake_machine', { out: 1 }) }, cap: 30, inv: { filler: 20 } }, { flags: { autoSell: false } });
  ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 };
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0, '成品 20 個，只剩 10 格');
  assert.equal(ctx.world.fullPrompts, 0);
  ctx = boot({ tiles: { '5,2': machine('compost_bin', { out: 1 }) } }, { flags: { autoCollectMachines: false } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
});

test('機器投料：預設只有堆肥桶會投（autoCompost 預設開、原料免費）；魚飼料機、玉米餅機要開 autoLoadMachines——材料再多都不動', async () => {
  const ctx = boot({ tiles: { '5,2': machine('compost_bin'), '6,2': machine('fish_feed_machine'), '7,2': machine('corn_cake_machine') }, inv: { poop: 99, weed: 99, wheat: 99, corn: 99 }, cap: 5000 });
  await run(ctx, 5);
  assert.equal(ctx.world.S.inv.poop, 95, '堆肥桶（等級 1）放了 1 批：糞便 4、雜草 2');
  assert.equal(ctx.world.S.inv.weed, 97);
  assert.equal(ctx.world.S.inv.wheat, 99, '魚飼料機的原料不碰');
  assert.equal(ctx.world.S.inv.corn, 99, '玉米餅機不碰');
  assert.equal(ctx.world.M.tiles['6,2'].state, 'idle');
  assert.equal(ctx.world.M.tiles['7,2'].state, 'idle');
});

test('機器投料：堆肥桶只看 autoCompost——關掉就不投，即使 autoLoadMachines 開著、白名單裡也沒有它', async () => {
  const tiles = { '5,2': machine('compost_bin'), '6,2': machine('fish_feed_machine') };
  const inv = { poop: 99, weed: 99, wheat: 99 };
  const cap = 5000; // 倉庫夠大，不會因為快滿而先去賣東西
  let ctx = boot({ tiles, cap, inv: { ...inv } }, { flags: { autoCompost: false } });
  await run(ctx, 5);
  assert.equal(ctx.world.acts.length, 0, '兩個開關都沒開：什麼都不投');
  ctx = boot({ tiles, cap, inv: { ...inv } }, { flags: { autoCompost: false, autoLoadMachines: true } });
  await run(ctx, 6);
  assert.equal(ctx.world.S.inv.poop, 99, 'autoCompost 關著：堆肥桶不投');
  assert.equal(ctx.world.S.inv.wheat, 98, '魚飼料機照 autoLoadMachines 投了 1 批（每批小麥 1 個，等級 1 一次一批）');
  ctx = boot({ tiles, cap, inv: { ...inv } }, { flags: { autoCompost: true } });
  await run(ctx, 5);
  assert.equal(ctx.world.S.inv.poop, 95, '只開 autoCompost：堆肥桶投了');
  assert.equal(ctx.world.S.inv.wheat, 99, 'autoLoadMachines 關著：魚飼料機不投');
});

test('機器投料：開啟 autoLoadMachines 後只投白名單內的機器（魚飼料機，加上堆肥桶）；玉米餅機不在內', async () => {
  const ctx = boot({ tiles: { '5,2': machine('compost_bin'), '6,2': machine('fish_feed_machine'), '7,2': machine('corn_cake_machine') }, inv: { poop: 8, weed: 4, wheat: 5, corn: 9 } }, { flags: { autoLoadMachines: true } });
  await run(ctx, 6);
  assert.equal(ctx.world.S.inv.poop, 4, '堆肥桶放了 1 批（糞便 4、雜草 2）');
  assert.equal(ctx.world.S.inv.weed, 2);
  assert.equal(ctx.world.S.inv.wheat, 4);
  assert.equal(ctx.world.S.inv.corn, 9, '玉米餅機不碰：玉米比玉米餅值錢');
  assert.equal(ctx.world.upgrades, 0);
  assert.equal(ctx.world.M.tiles['7,2'].state, 'idle');
});

test('機器投料：材料不夠、成品庫存已達上限、已經在做（等級 1）、有成品還沒收 → 都不投', async () => {
  const base = { poop: 4, weed: 2 };
  const flags = {}; // 堆肥桶看 autoCompost（預設開）
  let ctx = boot({ tiles: { '5,2': machine('compost_bin') }, inv: { poop: 3, weed: 2 } }, { flags });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0, '糞便 3 < 4');
  ctx = boot({ tiles: { '5,2': machine('compost_bin') }, inv: { ...base, organic_fert: 100 } }, { flags });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.filter((a) => a.tool === 'hand').length, 0, '成品庫存 100 ≥ machineMaxStock');
  ctx = boot({ tiles: { '5,2': machine('compost_bin', { state: 'working', run: true }) }, inv: base }, { flags });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0, '等級 1 已經在做');
  ctx = boot({ tiles: { '5,2': machine('compost_bin', { out: 1, state: 'done' }) }, inv: base }, { flags });
  await run(ctx, 1);
  assert.equal(ctx.world.S.inv.poop, 4, '先收成品，同一輪不投料');
  assert.equal(ctx.world.S.inv.organic_fert, 2, '成品收了');
  await run(ctx, 1);
  assert.equal(ctx.world.S.inv.poop, undefined, '收完下一輪才投料');
});

test('機器小選單：要的按鈕不能按（灰掉）時，把選單收起來，不亂按別顆', async () => {
  const ctx = boot({ tiles: { '5,2': machine('compost_bin', { out: 1 }) } });
  // 讓 collect 按鈕被遊戲標成不可用
  const real = ctx.env.win.__farm18.act;
  ctx.env.win.__farm18.act = (x, y) => { real(x, y); const b = ctx.world.pop.querySelector('button[data-m61="collect"]'); if (b) b.classList.add('off61'); };
  await run(ctx, 3);
  assert.equal(ctx.world.pop.hidden, true, '選單被收起來');
  assert.equal(ctx.world.upgrades, 0);
  assert.equal(ctx.world.S.inv.organic_fert, undefined, '沒收到');
});

test('沿邊柵欄：收成工具點有東西的格子會先問「這一格有：」→ 腳本選那格的東西，動作照常完成，選單不殘留', async () => {
  const ctx = boot({
    tiles: { '0,0': readyTree(), '5,2': machine('compost_bin', { out: 1 }), '7,6': { t: 'animal', id: 'egg_hen', stage: 2, timer: 100, cycles: 5, stack: 2 } },
    edgeFence: ['0,0', '5,2', '7,6'],
  });
  await run(ctx, 6);
  assert.equal(ctx.world.S.inv.orange, 1, '果樹採到了');
  assert.equal(ctx.world.S.inv.organic_fert, 2, '機器收到了');
  assert.equal(ctx.world.S.inv.egg, 2, '蛋收到了');
  assert.equal(ctx.world.pop.hidden, true, '沒有任何選單殘留');
  assert.equal(ctx.world.upgrades, 0);
});

test('settlePopup：選單裡沒有我們要的按鈕 → 收起來並回傳 false；沒有選單 → true', () => {
  const ctx = boot({}, { enable: false });
  const g = ctx.t.game();
  assert.equal(ctx.t.settlePopup(g, '1,1', 'collect'), true);
  const { FakeEl } = require('../helpers/fake-dom');
  const pop = ctx.world.pop;
  const btn = new FakeEl(ctx.doc, 'button');
  btn.dataset.m61 = 'upgrade';
  pop.hidden = false;
  pop.q1('button[data-m61="upgrade"]', btn);
  ctx.world.RT.pick53 = { k: '1,1' };
  assert.equal(ctx.t.settlePopup(g, '1,1', 'collect'), false);
  assert.equal(pop.hidden, true);
  assert.equal(ctx.world.RT.pick53, null);
  assert.equal(btn.clicks, 0, '升級鈕沒被按');
});
