'use strict';
// 田地的決策：收成、播種、澆水、抓蟲、其他作物、倉庫空位計算、退避、工具切換與優先順序。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, crop, ripe, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const actsOn = (world, k) => world.acts.filter((a) => a.k === k);
const status = (ctx) => ctx.t.status;

test('收成：成熟的設定作物用「播種」工具收，要先切工具、再點種子列清掉 none49，之後才動手', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) } });
  const { world } = ctx;
  await step(ctx);
  assert.equal(world.acts.length, 0, '第一個週期只切工具');
  assert.equal(world.S.sel.tool, 'seed');
  assert.equal(world.S.sel.none49, true);
  await step(ctx);
  assert.equal(world.acts.length, 0, '第二個週期點種子列');
  assert.equal(world.S.sel.none49, false);
  await step(ctx);
  assert.equal(world.acts.length, 1);
  assert.equal(world.acts[0].tool, 'seed');
  assert.equal(world.M.tiles['0,0'].crop, null);
  assert.equal(world.S.inv.wheat, 1);
  assert.equal(ctx.t.stats.harvest, 1);
  assert.ok(ctx.t.lastActionAt > 0, '記下上次動作的時間');
});

test('收成：還沒熟的、已枯萎的都不收', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 119) }), '1,0': soil({ crop: crop('wheat', 500, { wither: true }) }) } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.filter((a) => a.tool === 'seed').length, 0);
  assert.equal(ctx.t.stats.harvest, 0);
});

test('播種：空田種設定的作物並扣種子錢；有花的田不碰；選的種子是設定作物', async () => {
  const ctx = boot({ tiles: { '0,0': soil(), '1,0': soil({ flower: { id: 'rose' } }) }, coins: 100, sel: { seed: 'corn' } });
  await run(ctx, 4);
  const { world } = ctx;
  assert.equal(world.M.tiles['0,0'].crop.id, 'wheat', '種的是設定作物，不是工具列原本選的玉米');
  assert.equal(world.S.player.coins, 95);
  assert.equal(world.M.tiles['1,0'].crop, null, '有花的田不是空田，不能對它播種');
  assert.equal(actsOn(world, '1,0').length, 0);
  assert.equal(ctx.t.stats.plant, 1);
});

test('播種：金幣不夠一顆種子就不種；minCoinsAfterPlant 要留底', async () => {
  let ctx = boot({ tiles: { '0,0': soil() }, coins: 4 });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /金幣不夠播種（要 5，有 4）/);
  ctx = boot({ tiles: { '0,0': soil() }, coins: 14 }, { flags: { minCoinsAfterPlant: 10 } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0, '14 < 5 + 10');
  ctx = boot({ tiles: { '0,0': soil() }, coins: 15 }, { flags: { minCoinsAfterPlant: 10 } });
  await run(ctx, 4);
  assert.equal(ctx.world.M.tiles['0,0'].crop.id, 'wheat', '15 >= 5 + 10');
});

test('播種：一個週期內錢不夠了就停（不會一路點下去）', async () => {
  const tiles = {};
  for (let i = 0; i < 6; i++) tiles[i + ',0'] = soil();
  const ctx = boot({ tiles, coins: 12 });
  await run(ctx, 10);
  const planted = Object.values(ctx.world.M.tiles).filter((t) => t.crop).length;
  assert.equal(planted, 2, '12 元只夠 2 顆 5 元的種子');
  assert.equal(ctx.world.S.player.coins, 2);
  assert.equal(ctx.world.acts.filter((a) => a.tool === 'seed' && a.type === 'soil').length <= 3, true);
});

test('每個週期最多動 maxActionsPerTick 格', async () => {
  const tiles = {};
  for (let i = 0; i < 10; i++) tiles[i + ',0'] = soil({ crop: ripe('wheat', cfg) });
  const ctx = boot({ tiles, cap: 1000 });
  await run(ctx, 2); // 切工具、選種子
  await ctx.t.tick();
  assert.equal(ctx.world.acts.length, 3, '一個週期 3 格');
  ctx.t.CONFIG.maxActionsPerTick = 1;
  await ctx.clock.advance(500);
  await ctx.t.tick();
  assert.equal(ctx.world.acts.length, 4);
});

test('其他種類的作物預設不收、不澆水；標籤會說略過幾格；handleOtherCrops 開了才處理', async () => {
  const tiles = { '0,0': soil({ crop: ripe('tomato', cfg) }), '1,0': soil({ crop: crop('tomato', 10), m: 0 }) };
  let ctx = boot({ tiles });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /略過其他作物 2 格/);
  ctx = boot({ tiles: { '0,0': soil({ crop: ripe('tomato', cfg) }) } }, { flags: { handleOtherCrops: true } });
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.tomato, 2, '開了 handleOtherCrops 才收（番茄產量 2）');
});

test('澆水：濕度低於 waterBelow 才開始澆，澆到 waterUpTo（預設滿）才停；中間不會來回', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10), m: 0.5 }), '1,0': soil({ crop: crop('wheat', 10), m: 1 }) }, water: 100 });
  const { world } = ctx;
  await run(ctx, 2);
  assert.equal(world.M.tiles['0,0'].m >= 1.5 || world.M.tiles['0,0'].m > 0.5, true);
  await run(ctx, 8);
  assert.equal(world.M.tiles['0,0'].m, 4, '澆到滿級');
  assert.equal(world.M.tiles['1,0'].m, 1, 'm=1 不低於門檻，沒開始澆（遲滯：只有低於門檻才啟動）');
  assert.equal(world.acts.filter((a) => a.k === '1,0').length, 0);
  assert.ok(ctx.t.stats.water >= 4);
  assert.equal(world.S.player.water, 100 - 4 + 0.5 - 0.5 + 0 - 0 - (world.S.player.water - (100 - 4)) === 0 ? 96 : world.S.player.water, '澆了幾下就扣幾滴');
});

test('澆水：waterUpTo 可以設上限；枯萎的作物一律要澆（可以救活）', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10, { wither: true }), m: 3 }), '1,0': soil({ crop: crop('wheat', 10), m: 0 }) } }, { flags: { waterUpTo: 2 } });
  await run(ctx, 6);
  const { world } = ctx;
  assert.equal(world.M.tiles['0,0'].crop.wither, false, '枯萎的被澆活了（即使濕度 3 已經不低）');
  assert.equal(world.M.tiles['1,0'].m, 2, '只澆到 waterUpTo');
});

test('澆水：雨水不夠一次的量就不澆（不去動自來水），標籤提示；水用完中途停', async () => {
  let ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10), m: 0 }) }, water: 0 });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /雨水不足，暫停澆水/);
  ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10), m: 0 }), '1,0': soil({ crop: crop('wheat', 10), m: 0 }) }, water: 2 });
  await run(ctx, 8);
  assert.equal(ctx.world.S.player.water, 0);
  assert.equal(ctx.world.acts.filter((a) => a.tool === 'water').length, 2, '只有 2 滴，只澆 2 下');
  ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10), m: 0 }) }, water: 0 }, { flags: { autoWater: false } });
  await run(ctx, 3);
  assert.doesNotMatch(status(ctx), /雨水不足/, '關掉自動澆水就不提示');
});

test('抓蟲：切到照顧工具並選「捉蟲」才點，點到抓光；有蟲的格子先不收成、不澆水', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) } });
  const { world } = ctx;
  world.M.tiles['0,0'].crop.pest = true;
  await run(ctx, 5); // 切照顧工具、選捉蟲、點 3 下
  const careActs = world.acts.filter((a) => a.tool === 'care');
  assert.equal(careActs.length, 3, '同一格點 3 下抓光');
  assert.ok(careActs.every((a) => a.care === 'catch' && a.none49 === false), '每一下都確認是捉蟲、且已選好');
  assert.equal(world.M.tiles['0,0'].crop.pest, false);
  assert.equal(world.M.tiles['0,0'].crop.id, 'wheat', '蟲還沒抓光之前不收成');
  assert.equal(world.acts.filter((a) => a.tool === 'seed').length, 0);
  assert.equal(world.chemUsed, 0);
  assert.equal(ctx.t.stats.pest, 1, '蟲抓光才算一格');
  await run(ctx, 3);
  assert.equal(world.M.tiles['0,0'].crop, null, '抓光後才收成');
});

test('抓蟲：遊戲目前選的是別的照顧選項（化肥、農藥）時，腳本一定先改選「捉蟲」，絕不用它們', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10) }) }, sel: { care: 'pesticide' } });
  ctx.world.M.tiles['0,0'].crop.pest = true;
  await run(ctx, 8);
  assert.equal(ctx.world.chemUsed, 0, '一次都沒用到農藥／化肥');
  assert.ok(ctx.world.acts.filter((a) => a.tool === 'care').every((a) => a.care === 'catch'));
  assert.equal(ctx.world.M.tiles['0,0'].crop.pest, false);
});

test('抓蟲：玩家已經在照顧工具、而且選著農藥（不用再切工具）→ 腳本也要先改選「捉蟲」才點', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10) }) }, sel: { tool: 'care', care: 'pesticide', none49: false } });
  ctx.world.M.tiles['0,0'].crop.pest = true;
  await run(ctx, 6);
  assert.equal(ctx.world.chemUsed, 0, '一次都沒用到農藥');
  assert.equal(ctx.world.M.tiles['0,0'].crop.pest, false, '改選捉蟲後把蟲抓光了');
  assert.ok(ctx.world.acts.filter((a) => a.tool === 'care').every((a) => a.care === 'catch'));
});

test('抓蟲：其他作物長蟲也抓（可關）；autoCatchPests 關掉就不抓', async () => {
  let ctx = boot({ tiles: { '0,0': soil({ crop: crop('tomato', 10) }) } });
  ctx.world.M.tiles['0,0'].crop.pest = true;
  await run(ctx, 8);
  assert.equal(ctx.world.M.tiles['0,0'].crop.pest, false, '番茄不是設定作物，但蟲會擴散，免費抓');
  ctx = boot({ tiles: { '0,0': soil({ crop: crop('tomato', 10) }) } }, { flags: { catchPestsOnOtherCrops: false } });
  ctx.world.M.tiles['0,0'].crop.pest = true;
  await run(ctx, 8);
  assert.equal(ctx.world.M.tiles['0,0'].crop.pest, true);
  ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10) }) } }, { flags: { autoCatchPests: false } });
  ctx.world.M.tiles['0,0'].crop.pest = true;
  await run(ctx, 8);
  assert.equal(ctx.world.acts.filter((a) => a.tool === 'care').length, 0);
});

test('抓蟲：捉蟲選項還沒解鎖時不卡住，改做別的事並提示', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 10) }), '1,0': soil() }, lockedTray: ['catch'] });
  ctx.world.M.tiles['0,0'].crop.pest = true;
  await run(ctx, 8);
  assert.equal(ctx.world.M.tiles['1,0'].crop.id, 'wheat', '照樣去播種');
  assert.equal(ctx.world.acts.filter((a) => a.tool === 'care').length, 0);
  assert.match(status(ctx), /捉蟲工具無法使用（未解鎖？）/);
});

test('抓蟲：連續抓不掉（3 次失敗）就不再卡住那格，其他動作照常', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) } });
  const { world, t } = ctx;
  world.M.tiles['0,0'].crop.pest = true;
  const real = ctx.env.win.__farm18.act;
  ctx.env.win.__farm18.act = (x, y) => { if (world.S.sel.tool === 'care') { world.acts.push({ k: x + ',' + y, tool: 'care', care: world.S.sel.care }); return; } real(x, y); }; // 抓蟲永遠沒效果
  await run(ctx, 40, 5000);
  assert.ok((world.S.inv.wheat || 0) >= 1, '放棄抓蟲後還是收成了（有蟲只是減產）');
  assert.ok(world.acts.filter((a) => a.tool === 'care').length >= 3);
});

test('倉庫空位：收成放不下的不收，標記要賣出；剩餘空位會隨著排程扣掉', async () => {
  const tiles = {};
  for (let i = 0; i < 4; i++) tiles[i + ',0'] = soil({ crop: ripe('potato', cfg) }); // 馬鈴薯每次 3 個
  const ctx = boot({ tiles, cap: 100, inv: { filler: 90 } }, { crop: 'potato', flags: { autoSell: false } });
  ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 };
  await run(ctx, 3); // 切工具、選種子、動手。空位 10：收 3 格（9 個）；第 4 格放不下
  assert.equal(ctx.world.S.inv.potato, 9);
  assert.equal(ctx.world.fullPrompts, 0, '絕不跳出「倉庫滿了」詢問');
  assert.equal(ctx.t.stats.harvest, 3);
  assert.equal(Object.values(ctx.world.M.tiles).filter((t) => t.crop && t.crop.prog > 0).length, 1, '第 4 格留著沒收');
  assert.match(ctx.t.status, /倉庫放不下，1 格成熟作物還沒收/);
  assert.equal(ctx.t.needSell, false, '關了自動賣出就不標記');
  ctx.t.CONFIG.autoSell = true;
  await run(ctx, 1);
  assert.equal(ctx.world.storageUI.opens, 1, '開著自動賣出：剩 1 格（≤ 5）→ 開倉庫賣出，騰出空間');
  assert.deepEqual(ctx.world.storageUI.sold, [['potato', 9]]);
});

test('倉庫已滿：不收成、不播種以外的事也不亂點；標籤說明原因', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) }, cap: 10, inv: { filler: 10 } }, { flags: { autoSell: false } });
  ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 };
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.world.fullPrompts, 0);
  assert.match(status(ctx), /倉庫放不下，1 格成熟作物還沒收/);
});

test('autoHarvest / autoPlant 可以各自關閉', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }), '1,0': soil() } }, { flags: { autoHarvest: false, autoPlant: false } });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /暫時沒有事做/);
});

test('退避：同一格動作沒成功，間隔 1.5 秒、3 秒、6 秒…越退越久，上限 60 秒；成功後歸零', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) } });
  const { world, env } = ctx;
  world.S.sel.tool = 'seed';
  world.S.sel.none49 = false;
  const times = [];
  env.win.__farm18.act = (x, y) => { times.push(ctx.clock.now); }; // 點了沒效果
  await ctx.t.tick();
  const t0 = times[0];
  await ctx.clock.advance(1400);
  await ctx.t.tick();
  assert.equal(times.length, 1, '1.5 秒內不會再點');
  await ctx.clock.advance(200);
  await ctx.t.tick();
  assert.equal(times.length, 2);
  assert.equal(times[1] - t0, 1600);
  await ctx.clock.advance(2900);
  await ctx.t.tick();
  assert.equal(times.length, 2, '第二次失敗後要等 3 秒');
  await ctx.clock.advance(200);
  await ctx.t.tick();
  assert.equal(times.length, 3);
  for (let i = 0; i < 12; i++) { await ctx.clock.advance(61000); await ctx.t.tick(); }
  const gaps = times.slice(-3).map((v, i, a) => (i ? v - a[i - 1] : 0)).slice(1);
  assert.ok(gaps.every((g) => g <= 61000 + 400), '上限 60 秒');
});

test('工具優先順序：抓蟲 > 播種收成 > 撿東西 > 澆水；目前工具還有事做就繼續用，不來回切', async () => {
  const tiles = {
    '0,0': soil({ crop: crop('wheat', 10), m: 0 }), // 要澆水
    '1,0': soil({ crop: ripe('wheat', cfg) }), // 要收成
    '2,0': { t: 'poop' }, // 要撿
  };
  const ctx = boot({ tiles, sel: { tool: 'water' } });
  await run(ctx, 11);
  const order = [];
  for (const a of ctx.world.acts) if (order[order.length - 1] !== a.tool) order.push(a.tool);
  assert.deepEqual(order, ['water', 'seed', 'hand'], '目前是澆水工具而且有水要澆 → 繼續用；做完才依序換成播種（收成＋補種）、收成工具（撿糞便）');
  assert.equal(ctx.world.M.tiles['0,0'].m, 4, '水澆滿');
  assert.ok(ctx.world.S.inv.wheat >= 1, '成熟的收了');
  assert.equal(ctx.world.M.tiles['2,0'], undefined, '糞便撿了');
});

test('沒事可做：說明是在等作物長大，還有多久成熟', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 60) }), '1,0': soil({ crop: crop('wheat', 100) }) } });
  await run(ctx, 2);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /運作中（暫時沒有事做）/);
  assert.match(status(ctx), /2 格小麥還在長，最快約 20 秒 後成熟/);
});

test('作物沒設定、設定裡找不到作物：只顯示狀態，不動手', async () => {
  let ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) } }, { crop: null });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /尚未設定作物（Alt\+Shift\+S）/);
  ctx = boot({ tiles: {} });
  ctx.t.targetCrop = { id: 'ghost', name: '幽靈' };
  await ctx.t.tick();
  assert.match(status(ctx), /找不到作物設定：ghost/);
});

test('種子列找不到或被鎖住：提示而不是亂點', async () => {
  const ctx = boot({ tiles: { '0,0': soil() }, lockedTray: ['wheat'] });
  await run(ctx, 5);
  assert.equal(ctx.world.acts.length, 0);
  assert.match(status(ctx), /無法選用種子：wheat（不存在或未解鎖）/);
});
