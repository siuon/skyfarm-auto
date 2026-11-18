'use strict';
// 2026-11-18 使用者要求：「預設還有 3 小時以上的作物自動施肥」。
//   - 用「照顧」工具的「有機肥」選項（免費、倉庫現有的有機肥、每次種植 1 個、作物仍是有機）；絕不用化肥、農藥、不買肥料。
//   - 只施「還在長、沒枯萎、這一季沒施過」且生長時間 ≥ fertilizeMinMinutes（預設 180 分鐘）的作物。
//   - 肥料有限：倉庫有幾個最多施幾格，單次收成價值高的先施；有蟲先抓蟲。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, crop, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const careActs = (world) => world.acts.filter((a) => a.tool === 'care');
const growing = (id, prog = 100, extra = {}) => soil({ crop: crop(id, prog, extra) });

test('預設：開、門檻 180 分鐘（3 小時）、其他作物也施', () => {
  const ctx = boot({}, { enable: false });
  const C = ctx.t.CONFIG;
  assert.equal(C.autoFertilize, true);
  assert.equal(C.fertilizeMinMinutes, 180);
  assert.equal(C.fertilizeOtherCrops, true);
});

test('3 小時以上的作物施有機肥：切照顧工具、選「有機肥」、每格點一下；肥料被扣掉、作物仍是有機（沒有任何化肥／農藥）', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice'), '1,0': growing('rice') }, inv: { organic_fert: 5 }, cap: 5000 }, { crop: 'rice' });
  const { world } = ctx;
  await run(ctx, 6);
  assert.deepEqual(world.fertApplied.sort(), ['0,0', '1,0']);
  assert.equal(world.S.inv.organic_fert, 3, '一格一個');
  assert.equal(world.M.tiles['0,0'].crop.fert, 'org');
  assert.equal(world.chemUsed, 0, '一次都沒用到化肥／農藥');
  const acts = careActs(world);
  assert.equal(acts.length, 2);
  assert.ok(acts.every((a) => a.care === 'org' && a.none49 === false), '每一下都確認是有機肥、而且已選好');
  assert.equal(ctx.t.stats.fert, 2);
});

test('施過就不再施（這一季一個）：下一輪不會再點、也不會再扣肥料', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice') }, inv: { organic_fert: 5 }, cap: 5000 }, { crop: 'rice' });
  await run(ctx, 5);
  const n = ctx.world.acts.length;
  await run(ctx, 5);
  assert.equal(ctx.world.acts.length, n, '不再點');
  assert.equal(ctx.world.S.inv.organic_fert, 4);
  assert.equal(ctx.world.fertApplied.length, 1);
});

test('門檻：剛好 3 小時（水稻）要施、2.5 小時（芋頭）、30 分鐘（玉米）、2 分鐘（小麥）不施；調低門檻就跟著變', async () => {
  const tiles = () => ({ '0,0': growing('rice'), '1,0': growing('taro'), '2,0': growing('corn'), '3,0': growing('wheat'), '4,0': growing('pumpkin') });
  let ctx = boot({ tiles: tiles(), inv: { organic_fert: 20 }, cap: 5000 }, { crop: 'wheat' });
  await run(ctx, 10);
  assert.deepEqual(ctx.world.fertApplied.sort(), ['0,0', '4,0'], '只有水稻（剛好 10800 秒）與南瓜');
  ctx = boot({ tiles: tiles(), inv: { organic_fert: 20 }, cap: 5000 }, { crop: 'wheat', flags: { fertilizeMinMinutes: 120 } });
  await run(ctx, 12);
  assert.deepEqual(ctx.world.fertApplied.sort(), ['0,0', '1,0', '4,0'], '門檻 120 分鐘：芋頭（150 分鐘）也施');
  ctx = boot({ tiles: tiles(), inv: { organic_fert: 20 }, cap: 5000 }, { crop: 'wheat', flags: { fertilizeMinMinutes: 25 } });
  await run(ctx, 14);
  assert.deepEqual(ctx.world.fertApplied.sort(), ['0,0', '1,0', '2,0', '4,0'], '門檻 25 分鐘：玉米（30 分鐘）也施；小麥還是不施');
});

test('不該施的：已成熟（要收成）、枯萎、這一季施過、空田——都不點，也不扣肥料', async () => {
  const ctx = boot({
    tiles: {
      '0,0': soil({ crop: crop('rice', cfg.crops.rice.growSeconds) }),
      '1,0': soil({ crop: crop('rice', 100, { wither: true }), m: 3 }),
      '2,0': growing('rice', 100, { fert: 'org' }),
      '3,0': soil({ crop: null }),
    },
    inv: { organic_fert: 9 }, cap: 5000, coins: 0,
  }, { crop: 'rice' });
  await run(ctx, 8);
  assert.equal(ctx.world.fertApplied.length, 0);
  assert.equal(ctx.world.S.inv.organic_fert, 9);
  assert.equal(careActs(ctx.world).length, 0, '連照顧工具都不碰');
});

test('倉庫沒有有機肥：不施、不會去買，標籤說明；有了肥料之後才施', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice'), '1,0': growing('rice') }, cap: 5000, coins: 5000 }, { crop: 'rice' });
  await run(ctx, 4);
  assert.equal(ctx.world.acts.filter((a) => a.tool === 'care').length, 0);
  assert.equal(ctx.world.S.player.coins, 5000, '不花金幣');
  assert.match(ctx.t.status, /倉庫的有機肥不夠，2 格長時間作物先不施肥/);
  ctx.world.S.inv.organic_fert = 1;
  await run(ctx, 6);
  assert.equal(ctx.world.fertApplied.length, 1, '肥料只有 1 個，只施 1 格');
  assert.match(ctx.t.status, /不夠，1 格/);
});

test('肥料不夠分：單次收成價值高的先施（咖啡 > 南瓜 > 水稻）', async () => {
  const ctx = boot({
    tiles: { '0,0': growing('rice'), '1,0': growing('pumpkin'), '2,0': growing('coffee'), '3,0': growing('rice') },
    inv: { organic_fert: 2 }, cap: 5000,
  }, { crop: 'rice' });
  await run(ctx, 8);
  assert.deepEqual(ctx.world.fertApplied.sort(), ['1,0', '2,0']);
  assert.equal(ctx.world.S.inv.organic_fert, undefined, '用完了');
});

test('其他作物：fertilizeOtherCrops 開（預設）也施；關掉只施設定作物；設定作物是別種時其他作物照常看開關', async () => {
  const tiles = () => ({ '0,0': growing('rice'), '1,0': growing('pumpkin') });
  let ctx = boot({ tiles: tiles(), inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'rice' });
  await run(ctx, 8);
  assert.deepEqual(ctx.world.fertApplied.sort(), ['0,0', '1,0']);
  ctx = boot({ tiles: tiles(), inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'rice', flags: { fertilizeOtherCrops: false } });
  await run(ctx, 8);
  assert.deepEqual(ctx.world.fertApplied, ['0,0'], '只施設定的水稻');
  ctx = boot({ tiles: tiles(), inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'wheat' });
  await run(ctx, 8);
  assert.deepEqual(ctx.world.fertApplied.sort(), ['0,0', '1,0'], '設定作物是小麥，田裡別人種的水稻、南瓜也施');
  ctx = boot({ tiles: tiles(), inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'wheat', flags: { fertilizeOtherCrops: false } });
  await run(ctx, 8);
  assert.equal(ctx.world.fertApplied.length, 0);
});

test('autoFertilize 關掉：完全不施肥、不碰照顧工具', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice') }, inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'rice', flags: { autoFertilize: false } });
  await run(ctx, 6);
  assert.equal(ctx.world.fertApplied.length, 0);
  assert.equal(ctx.world.S.sel.tool, 'hand', '沒有事做就不切工具');
  assert.match(ctx.t.status, /暫時沒有事做/);
});

test('有蟲先抓蟲（選「捉蟲」），抓光之後才換成「有機肥」施肥；兩種選項不會混在同一下', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice', 100, { pest: true }), '1,0': growing('rice') }, inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'rice' });
  await run(ctx, 12);
  const acts = careActs(ctx.world);
  const kinds = acts.map((a) => a.care);
  assert.deepEqual(kinds.filter((c) => c !== 'catch' && c !== 'org'), [], '只有捉蟲與有機肥兩種選項');
  const firstOrg = kinds.indexOf('org');
  assert.ok(firstOrg > 0 && kinds.slice(0, firstOrg).every((c) => c === 'catch'), '先全部抓蟲');
  assert.equal(ctx.world.M.tiles['0,0'].crop.pest, false);
  assert.deepEqual(ctx.world.fertApplied.sort(), ['0,0', '1,0'], '蟲抓光後兩格都施了肥（有蟲的那格先不施）');
  assert.equal(ctx.world.chemUsed, 0);
});

test('遊戲目前選著農藥／化肥：腳本一定先改選「有機肥」才點，絕不用它們', async () => {
  for (const bad of ['pesticide', 'chem']) {
    const ctx = boot({ tiles: { '0,0': growing('rice') }, inv: { organic_fert: 3 }, cap: 5000, sel: { tool: 'care', care: bad, none49: false } }, { crop: 'rice' });
    await run(ctx, 6);
    assert.equal(ctx.world.chemUsed, 0, bad + '：一次都沒用到');
    assert.deepEqual(ctx.world.fertApplied, ['0,0']);
    assert.ok(careActs(ctx.world).every((a) => a.care === 'org'));
  }
});

test('施肥工具用不了（有機肥選項還沒解鎖／找不到）：標籤說明，不卡住，其他事照做', async () => {
  const ctx = boot({
    tiles: { '0,0': growing('rice'), '1,0': soil({ crop: crop('rice', cfg.crops.rice.growSeconds) }) },
    inv: { organic_fert: 3 }, cap: 5000, lockedTray: ['org'],
  }, { crop: 'rice' });
  await run(ctx, 8);
  assert.equal(ctx.world.fertApplied.length, 0);
  assert.equal(ctx.world.S.inv.rice, 1, '成熟的照常收（收完又補種）');
  assert.match(ctx.t.status, /施肥工具無法使用/);
  assert.equal(ctx.world.chemUsed, 0);
});

test('收成、補種之後，新的一季又施肥（每次種植各一個）', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('rice', cfg.crops.rice.growSeconds) }) }, inv: { organic_fert: 5 }, cap: 5000, coins: 1000 }, { crop: 'rice' });
  await run(ctx, 14);
  const T = ctx.world.M.tiles['0,0'];
  assert.ok(T.crop && T.crop.id === 'rice', '收完又種了新的水稻');
  assert.equal(T.crop.fert, 'org', '新的一季施了肥');
  assert.equal(ctx.world.S.inv.organic_fert, 4);
  assert.equal(ctx.world.chemUsed, 0);
});

test('多座島：另一座島有長時間作物要施肥，就切過去施（乾跑也算有事做）', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: null }) }, maps: [{ tiles: { '1,0': growing('rice') } }], inv: { organic_fert: 2 }, cap: 5000, coins: 0 }, { crop: 'rice' });
  await run(ctx, 14, 3000);
  assert.deepEqual(ctx.world.fertApplied, ['1,0']);
  assert.equal(ctx.world.S.maps[1].tiles['1,0'].crop.fert, 'org');
  assert.equal(ctx.world.chemUsed, 0);
});

test('fertWanted：只看遊戲的條件與設定（還在長、沒枯萎、沒施過、夠長、是設定作物或開了其他作物）', () => {
  const ctx = boot({}, { crop: 'rice', enable: false });
  const w = (T) => ctx.t.fertWanted(T, cfg);
  assert.equal(w(growing('rice')), true);
  assert.equal(w(growing('rice', 10800 - 1)), true, '差 1 秒成熟也還能施');
  assert.equal(w(growing('rice', 10800)), false, '成熟了');
  assert.equal(w(growing('rice', 100, { wither: true })), false);
  assert.equal(w(growing('rice', 100, { fert: 'org' })), false);
  assert.equal(w(growing('rice', 100, { fert: 'chem' })), false, '施過任何肥都不再施');
  assert.equal(w(growing('wheat')), false, '太短');
  assert.equal(w({ t: 'tree', id: 'orange', prog: 1 }), false, '果樹不能施肥');
  assert.equal(w({ t: 'soil', crop: null }), false);
  assert.equal(w(null), false);
  assert.equal(w(growing('mystery')), false, '遊戲設定裡沒有的作物不碰');
  assert.equal(w(soil({ crop: { id: 'rice' } })), false, '進度讀不到就不碰');
});

// ───── 安全閘：計畫排好之後、點下去之前，狀態又變了（模擬玩家、遊戲在點的當中改了東西）─────

test('安全閘：點的當中玩家改選化肥——後面的格子不點（絕不在選著化肥時點）', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice'), '1,0': growing('rice'), '2,0': growing('rice') }, inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'rice' });
  const { world } = ctx;
  world.afterAct = () => { world.S.sel.care = 'chem'; };
  await run(ctx, 3);
  const acts = careActs(world);
  assert.equal(acts.length, 1, '第一下之後選項被改了，同一輪剩下的格子不點');
  assert.equal(acts[0].care, 'org');
  assert.equal(world.chemUsed, 0);
});

test('安全閘：點的當中肥料被用光了——後面的格子不點，不去點沒肥料的格子', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice'), '1,0': growing('rice'), '2,0': growing('rice') }, inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'rice' });
  const { world } = ctx;
  world.afterAct = () => { delete world.S.inv.organic_fert; };
  await run(ctx, 3);
  assert.equal(careActs(world).length, 1);
  assert.equal(world.fertApplied.length, 1);
});

test('安全閘：點的當中那格狀態變了（枯萎、被施過）——不點', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice'), '1,0': growing('rice'), '2,0': growing('rice') }, inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'rice' });
  const { world } = ctx;
  world.afterAct = () => { world.M.tiles['1,0'].crop.wither = true; world.M.tiles['2,0'].crop.fert = 'org'; };
  await run(ctx, 3);
  assert.deepEqual(world.fertApplied, ['0,0'], '枯萎的與已施過的都不點');
  assert.equal(careActs(world).length, 1);
});

test('點了沒效果（肥料沒套上）：不算成功、不記進統計，而且退避——不會狂點同一格', async () => {
  const ctx = boot({ tiles: { '0,0': growing('rice') }, inv: { organic_fert: 9 }, cap: 5000 }, { crop: 'rice' });
  ctx.world.fertBlocked = true;
  await run(ctx, 20, 500);
  assert.equal(ctx.t.stats.fert, 0, '沒施上就不計');
  assert.equal(ctx.world.S.inv.organic_fert, 9);
  const n = careActs(ctx.world).length;
  assert.ok(n >= 1 && n <= 6, '退避越來越久：20 個週期（約 10 秒假時間）只試了幾次，實際 ' + n);
});
