'use strict';
// 2026-11-18 使用者回報：「我現在是種玉米，可是有時候 tab 不會切換到播種 → 穀物 → 玉米，會在其他功能相同的玉米的位置點選。」
// 真引擎重現：種子列的所有分頁、分類的品項都一直在畫面結構裡，沒顯示的只是 hidden。腳本以前直接點「看不見的」玉米——
// S.sel.seed 變成玉米，但畫面的分頁還停在玩家上次用的那一頁（設施、蝴蝶園…），之後點地圖被遊戲當成蓋設施／種寄主植物，
// 一株玉米都種不出來（設施是要花錢的）。現在改成像真人一樣一步一步切：播種工具 → 「作物」分頁 → 作物分類（穀物）→ 點看得見的玉米，
// 而且播種／收成前，分頁不在「作物」就一律不點。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, crop, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const empties = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + ',0', soil()]));
// 玩家停在播種工具、某個分頁（預設設施）的標準情境；打開「種子列」模型；設定作物玉米
const boot2 = (sel = {}, extra = {}, cfg = {}) => boot({
  seedTray: true, coins: 5000, cap: 5000, tiles: empties(3),
  sel: Object.assign({ tool: 'seed', seed: 'wheat', none49: false, seedTab: 'facility', seedFac: 'grow_lamp' }, sel), ...extra,
}, { crop: 'corn', ...cfg });
// 記下每次點玉米項目時，它看不看得見
const watchCorn = (ctx) => {
  const el = ctx.world.trayItem.corn, orig = el.onclick, seen = [];
  el.onclick = (e) => { seen.push(!el.hidden); orig(e); };
  return seen;
};

test('玩家停在「設施」分頁：先切回「作物」分頁，再點看得見的玉米，然後才種——不會被當成蓋設施', async () => {
  const ctx = boot2();
  const seen = watchCorn(ctx);
  await run(ctx, 8);
  const { world } = ctx;
  assert.deepEqual(world.seedTabClicks, ['crops'], '點了一次「作物」分頁');
  assert.equal(world.S.sel.seedTab, 'crops');
  assert.deepEqual(seen, [true], '玉米項目只點了一次，而且點的時候是看得見的');
  assert.equal(world.facilityActs.length, 0, '一次都沒對地圖點到「設施」分頁');
  assert.equal(Object.values(world.M.tiles).filter((T) => T.crop && T.crop.id === 'corn').length, 3, '三塊空田都種了玉米');
});

test('最危險的情況：設施分頁、而且選著的種子「剛好已經是玉米」——以前會直接開始點地圖（變成蓋設施）；現在先切回作物分頁', async () => {
  const ctx = boot2({ seed: 'corn', seedTab: 'facility', seedFac: 'greenhouse' });
  await run(ctx, 6);
  assert.equal(ctx.world.facilityActs.length, 0, '沒有對地圖點到設施（溫室每格要花錢）');
  assert.deepEqual(ctx.world.seedTabClicks, ['crops']);
  assert.equal(Object.values(ctx.world.M.tiles).filter((T) => T.crop).length, 3);
});

test('蝴蝶園分頁（點地圖會種寄主植物）也一樣：先切回作物分頁才播種', async () => {
  const ctx = boot2({ seed: 'corn', seedTab: 'bfgarden' });
  await run(ctx, 6);
  assert.equal(ctx.world.bfActs.length, 0);
  assert.deepEqual(ctx.world.seedTabClicks, ['crops']);
  assert.equal(Object.values(ctx.world.M.tiles).filter((T) => T.crop).length, 3);
});

test('花苗分頁（品項列只有花苗、沒有玉米項目）與果樹分頁：切回作物分頁就找得到玉米', async () => {
  for (const tab of ['flowers', 'trees']) {
    const ctx = boot2({ seedTab: tab, seedFac: undefined, seed: 'wheat' });
    await run(ctx, 8);
    assert.equal(ctx.world.S.sel.seedTab, 'crops', tab);
    assert.equal(Object.values(ctx.world.M.tiles).filter((T) => T.crop && T.crop.id === 'corn').length, 3, tab + '：種了玉米');
  }
});

test('玉米在別的作物分類（目前顯示「果菜」）：先切到「穀物」分類，再點玉米；不去點看不見的項目', async () => {
  const ctx = boot2({ seedTab: 'crops', seedFac: undefined, seed: 'tomato' });
  const seen = watchCorn(ctx);
  await run(ctx, 8);
  assert.deepEqual(ctx.world.seedTabClicks, [], '已在作物分頁，不用再點分頁');
  assert.deepEqual(ctx.world.groupClicks, ['grain'], '點了「穀物」分類');
  assert.deepEqual(seen, [true], '玉米項目只點了一次、而且看得見');
  assert.equal(Object.values(ctx.world.M.tiles).filter((T) => T.crop && T.crop.id === 'corn').length, 3);
});

test('設施分頁＋別的分類：分頁、分類、項目依序各一步（每個週期做一步）', async () => {
  const ctx = boot2({ seed: 'tomato' });
  const order = [];
  const { world } = ctx;
  const note = (name, el) => { const o = el.onclick; el.onclick = (e) => { order.push(name); o(e); }; };
  // 登記的分頁／分類按鈕在 doc._q1 裡；包起來記順序
  note('作物分頁', ctx.doc._q1.get('#trayTabs button[data-tab="crops"]'));
  note('穀物分類', ctx.doc._q1.get('#cgrp62 button[data-cg62="grain"]'));
  note('玉米', world.trayItem.corn);
  await run(ctx, 8);
  assert.deepEqual(order, ['作物分頁', '穀物分類', '玉米']);
});

test('已經是「作物分頁＋穀物＋選好玉米」：不多點任何分頁、分類按鈕，直接種', async () => {
  const ctx = boot2({ seedTab: 'crops', seedFac: undefined, seed: 'corn' });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.seedTabClicks, []);
  assert.deepEqual(ctx.world.groupClicks, []);
  assert.equal(ctx.world.trayItem.corn.clicks, 0, '連玉米項目都不用再點');
  assert.equal(Object.values(ctx.world.M.tiles).filter((T) => T.crop).length, 3);
});

test('seedTab 還沒設過（新存檔）視為「作物」分頁，不亂點分頁', async () => {
  const ctx = boot2({ seedTab: undefined, seedFac: undefined, seed: 'corn' });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.seedTabClicks, []);
  assert.equal(Object.values(ctx.world.M.tiles).filter((T) => T.crop).length, 3);
});

test('分頁按鈕點了沒反應：一直停在設施分頁，腳本不播種、不點地圖（寧可不做），標籤說明', async () => {
  const ctx = boot2({ seed: 'corn' }, { tabBroken: true });
  await run(ctx, 6);
  assert.equal(ctx.world.facilityActs.length, 0);
  assert.equal(ctx.world.acts.length, 0, '一次地圖都沒點');
  assert.match(ctx.t.status, /作物分頁/);
});

test('找不到分頁列（遊戲改版了）：不播種、不點地圖，標籤說明', async () => {
  const ctx = boot2({ seed: 'corn' }, { noTabBar: true });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(ctx.t.status, /無法切到「作物」分頁/);
});

test('找不到分類按鈕、玉米又被藏起來：不去點看不見的玉米，標籤說明是哪個分類', async () => {
  const ctx = boot2({ seedTab: 'crops', seedFac: undefined, seed: 'tomato' }, { noGroupBar: true });
  await run(ctx, 4);
  assert.equal(ctx.world.trayItem.corn.clicks, 0, '沒有去點看不見的玉米');
  assert.equal(ctx.world.acts.length, 0);
  assert.match(ctx.t.status, /找不到「穀物」分類按鈕/);
});

test('分類按鈕點了沒反應：玉米一直藏著，不去點它，也不播種', async () => {
  const ctx = boot2({ seedTab: 'crops', seedFac: undefined, seed: 'tomato' }, { groupBroken: true });
  await run(ctx, 6);
  assert.equal(ctx.world.trayItem.corn.clicks, 0);
  assert.equal(ctx.world.acts.length, 0);
});

test('安全閘：播種的當中分頁被改成設施——同一輪剩下的格子不點（不會變成蓋設施）', async () => {
  const ctx = boot2({ seedTab: 'crops', seedFac: 'greenhouse', seed: 'corn' }, { tiles: empties(5) });
  const { world } = ctx;
  world.afterAct = () => { world.S.sel.seedTab = 'facility'; };
  await run(ctx, 1);
  const before = world.acts.length;
  await run(ctx, 1);
  assert.equal(world.facilityActs.length, 0, '分頁變成設施之後，沒有再對地圖點下去');
  assert.ok(world.acts.length >= 1 && before <= 3);
  assert.equal(Object.values(world.M.tiles).filter((T) => T.crop).length, 1, '只種了第一格');
});

test('安全閘：播種的當中選著的種子被改掉——不用別的種子播種', async () => {
  const ctx = boot2({ seedTab: 'crops', seedFac: undefined, seed: 'corn' }, { tiles: empties(5) });
  const { world } = ctx;
  world.afterAct = () => { world.S.sel.seed = 'tomato'; };
  await run(ctx, 1);
  const planted = Object.values(world.M.tiles).filter((T) => T.crop);
  assert.equal(planted.length, 1, '第一格種下去之後，種子被改了，後面的格子不點');
  assert.equal(planted[0].crop.id, 'corn');
});

test('收成也一樣：設施分頁時，成熟的作物不用播種工具去點（會被當成蓋設施）', async () => {
  const ctx = boot2({ seed: 'corn', seedTab: 'facility', seedFac: 'greenhouse' }, { tiles: { '0,0': soil({ crop: crop('corn', 1800) }) } });
  await run(ctx, 6);
  assert.equal(ctx.world.facilityActs.length, 0);
  assert.equal(ctx.world.S.inv.corn, 1, '切回作物分頁後照常收成');
});
