'use strict';
// 2026-11-20 使用者在天敵功能之後說「好，做」：狐狸得手時咬傷 1 隻家禽（T.hurt＝好起來的時間，停產停長 1 小時），自動救護。
// 官方 2.68.2 真引擎實測（隔離副本，act 直接呼叫）：
//   用「照顧」或「收成」工具點受傷的動物，一律只做「救護」（T.hurt＝0、免費）——不收蛋、不餵、不出貨；
//   「照顧」工具點沒受傷的動物只跳一句提示（連成年肉雞都不會被宰），「收成」工具點沒受傷的動物才會收蛋、宰肉雞。
// 所以腳本用「照顧」工具（捉蟲選項）救護，而且受傷的動物不排收產物、餵食、出貨（點下去都只是救護）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, crop, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const hen = (o = {}) => Object.assign({ t: 'animal', id: 'egg_hen', stage: 2, timer: 100, cycles: 10, stack: 2 }, o);
const broiler = (o = {}) => Object.assign({ t: 'animal', id: 'broiler', stage: 99, timer: 0 }, o);
const HOUR = 3600e3;
// 把那格弄成「受傷、還要 ms 毫秒才好」（時間要用假時鐘的現在）
const hurt = (ctx, k, ms = HOUR) => { ctx.world.M.tiles[k].hurt = ctx.clock.now + ms; };
const growing = () => soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: false } });

test('預設：救護受傷的家禽（開）', () => {
  assert.equal(boot({}, { enable: false }).t.CONFIG.autoRescueAnimals, true);
});

// ───── 基本：用照顧工具點一下 ─────

test('受傷的母雞：用「照顧」工具（捉蟲選項）點一下救護好；不收蛋、不動金幣與倉庫', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, coins: 321, inv: { wheat: 4 }, cap: 5000 });
  hurt(ctx, '2,2');
  await run(ctx, 4, 200);
  const { world } = ctx;
  assert.deepEqual(world.rescued, ['2,2']);
  assert.deepEqual(world.rescueTools, ['care'], '一定是照顧工具，不是收成工具');
  assert.equal(world.M.tiles['2,2'].hurt, 0);
  assert.equal(world.M.tiles['2,2'].stack, 2, '沒有順便收蛋（救護就是救護）');
  assert.equal(world.S.inv.egg, undefined);
  assert.equal(world.S.player.coins, 321);
  assert.equal(world.S.sel.care, 'catch', '選項是捉蟲，不是有機肥／化肥／農藥');
  assert.equal(world.chemUsed, 0);
  assert.equal(ctx.t.stats.rescue, 1);
  assert.ok(ctx.t.lastActionAt > 0);
});

test('受傷的成年肉雞：救護好、不會出貨（用收成工具點才會出貨）', async () => {
  const ctx = boot({ tiles: { '2,2': broiler() }, cap: 5000 });
  hurt(ctx, '2,2');
  await run(ctx, 4, 200);
  assert.deepEqual(ctx.world.rescued, ['2,2']);
  assert.deepEqual(ctx.world.shipped, [], '沒出貨');
  assert.ok(ctx.world.M.tiles['2,2'], '肉雞還在');
  assert.ok(ctx.world.acts.every((a) => a.tool === 'care'), '全程只用照顧工具點：' + JSON.stringify(ctx.world.acts.map((a) => a.tool)));
});

test('救好之後那隻照常：下個週期收蛋（用收成工具）', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000 });
  hurt(ctx, '2,2');
  await run(ctx, 10, 200);
  assert.equal(ctx.world.S.inv.egg, 2);
  assert.equal(ctx.world.rescued.length, 1);
});

test('好幾隻受傷：全部救護，一隻一下', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': hen(), '4,2': broiler() }, cap: 5000 });
  for (const k of ['2,2', '3,2', '4,2']) hurt(ctx, k);
  await run(ctx, 6, 200);
  assert.deepEqual(ctx.world.rescued.sort(), ['2,2', '3,2', '4,2']);
  assert.equal(ctx.t.stats.rescue, 3);
});

// ───── 受傷的動物不排別的動物動作 ─────

test('autoRescueAnimals 關掉：受傷的動物完全不點（不排收蛋、餵食、出貨——點了遊戲也只會救護，等於偷偷救護還被記成失敗）', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': broiler(), '4,2': hen({ stack: 0, timer: 0, cycles: 5 }) }, cap: 5000, inv: { chicken_feed: 50 } }, { flags: { autoRescueAnimals: false } });
  for (const k of ['2,2', '3,2', '4,2']) hurt(ctx, k);
  await run(ctx, 6, 200);
  assert.equal(ctx.world.acts.length, 0, '一下都沒點');
  assert.deepEqual(ctx.world.rescued, []);
  assert.deepEqual(ctx.world.shipped, []);
});

test('受傷的動物就算有蛋、餓著：不用「收成」工具去點（那只會變成救護）', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000 });
  hurt(ctx, '2,2');
  await run(ctx, 6, 200);
  const mine = ctx.world.acts.filter((a) => a.k === '2,2');
  assert.equal(mine[0].tool, 'care', '第一下是救護（照顧工具），收蛋是救好之後的事：' + JSON.stringify(mine.map((a) => a.tool)));
  assert.equal(ctx.world.S.inv.egg, 2, '救好之後才收蛋');
});

test('救護一直不成功（遊戲沒反應）時，對受傷的動物也只會用照顧工具點，不會改用收成工具亂點', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': broiler() }, cap: 5000, rescueBroken: true });
  hurt(ctx, '2,2');
  hurt(ctx, '3,2');
  await run(ctx, 80, 200);
  const acts = ctx.world.acts.filter((a) => a.k === '2,2' || a.k === '3,2');
  assert.ok(acts.length >= 2);
  assert.ok(acts.every((a) => a.tool === 'care'), JSON.stringify(acts.map((a) => a.tool)));
  assert.deepEqual(ctx.world.shipped, []);
});

test('再過不到 1.5 秒就自己好了：不點', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000 });
  hurt(ctx, '2,2', 1000);
  await step(ctx, 100);
  assert.equal(ctx.world.acts.filter((a) => a.k === '2,2').length, 0);
});

test('hurt 是壞資料（不是數字、NaN、0、過期）：當成沒受傷，照常收蛋', async () => {
  for (const bad of ['abc', NaN, 0, -5, null]) {
    const ctx = boot({ tiles: { '2,2': hen({ hurt: bad }) }, cap: 5000 });
    await run(ctx, 4, 200);
    assert.deepEqual(ctx.world.rescued, [], String(bad));
    assert.equal(ctx.world.S.inv.egg, 2, '照常收蛋：' + String(bad));
  }
});

test('沒受傷的動物：絕不用照顧工具去點（那只會跳提示），救護的程式不會亂點', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': broiler({ stage: 1, timer: 100 }) }, cap: 5000 });
  await run(ctx, 6, 200);
  assert.equal(ctx.world.careOnAnimal, 0);
  assert.deepEqual(ctx.world.rescued, []);
});

// ───── 失敗、離開原位、工具 ─────

test('救護沒成功（遊戲沒反應）：不狂點，退避；標籤不亂寫', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000, rescueBroken: true });
  hurt(ctx, '2,2');
  await run(ctx, 20, 100); // 2 秒
  const n = ctx.world.acts.filter((a) => a.k === '2,2').length;
  assert.ok(n >= 1 && n <= 3, '退避後不狂點，實際 ' + n);
  assert.equal(ctx.t.stats.rescue, 0);
  assert.equal(ctx.world.shipped.length, 0);
});

test('受傷的動物走離了牠的家：照遊戲的規則先記「點了牠」的記號再點家（和收蛋一樣）', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000, agents: { '0:2,2': { x: 3.5, y: 2, cx: 3, cy: 2 } } });
  hurt(ctx, '2,2');
  await run(ctx, 4, 200);
  assert.deepEqual(ctx.world.rescued, ['2,2']);
});

test('照顧工具用不了（捉蟲選項鎖著）：不去點受傷的動物，也不退而求其次用收成工具', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000, lockedTray: ['catch'] });
  hurt(ctx, '2,2');
  await run(ctx, 6, 200);
  assert.equal(ctx.world.acts.filter((a) => a.k === '2,2').length, 0);
  assert.deepEqual(ctx.world.rescued, []);
});

test('玩家的工具是「建造」：先切到照顧工具（捉蟲）再點，不在別的工具下點', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000, sel: { tool: 'build' } });
  hurt(ctx, '2,2');
  await run(ctx, 6, 200);
  assert.deepEqual(ctx.world.rescued, ['2,2']);
  assert.deepEqual(ctx.world.rescueTools, ['care']);
});

test('照顧工具選項被玩家改成「有機肥」：先改回捉蟲再點，不在有機肥選項下點', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000, sel: { tool: 'care', care: 'org' } });
  hurt(ctx, '2,2');
  await run(ctx, 6, 200);
  assert.deepEqual(ctx.world.rescued, ['2,2']);
  assert.equal(ctx.world.S.sel.care, 'catch');
  assert.equal(ctx.world.chemUsed, 0);
});

// ───── 和別的照顧工作、多座島 ─────

test('有蟲又有傷：同一個工具、同一個選項，兩件都做完（先捉蟲）', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('wheat', 5, { pest: true }) }), '2,2': hen() }, cap: 5000 });
  hurt(ctx, '2,2');
  await run(ctx, 12, 200);
  assert.equal(ctx.world.M.tiles['0,0'].crop.pest, false, '蟲抓光了');
  assert.deepEqual(ctx.world.rescued, ['2,2']);
  const careActs = ctx.world.acts.filter((a) => a.tool === 'care');
  assert.equal(careActs[0].k, '0,0', '先捉蟲');
});

test('有傷又要施有機肥：救護只占一個週期，施肥不會被餓死', async () => {
  const cfg = require('../helpers/fixture-config').makeCfg();
  void cfg;
  const ctx = boot({ tiles: { '0,0': soil({ crop: crop('rice', 100) }), '2,2': hen() }, inv: { organic_fert: 3 }, cap: 5000 }, { crop: 'rice' });
  hurt(ctx, '2,2');
  await run(ctx, 12, 200);
  assert.deepEqual(ctx.world.rescued, ['2,2']);
  assert.deepEqual(ctx.world.fertApplied, ['0,0'], '救護之後照樣施肥');
});

test('別座島有受傷的動物：全島輪流切過去救護，再回家島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], cap: 5000 });
  ctx.world.S.maps[1].tiles['2,2'].hurt = ctx.clock.now + HOUR;
  await run(ctx, 14, 500);
  assert.deepEqual(ctx.world.rescued, ['2,2']);
  assert.ok(ctx.world.switches.includes(1), '切到第 2 座');
  assert.equal(ctx.world.S.cur, 0, '救完回家島');
});

test('別座島的動物再過不到 1.5 秒就好了：不為牠切島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen({ stack: 0, timer: 100, cycles: 0 }) } }], cap: 5000 });
  ctx.world.S.maps[1].tiles['2,2'].hurt = ctx.clock.now + 800;
  await run(ctx, 4, 100);
  assert.deepEqual(ctx.world.switches, []);
});

test('標籤的統計：救護幾次寫在「救護」', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': hen() }, cap: 5000 });
  hurt(ctx, '2,2');
  hurt(ctx, '3,2');
  await run(ctx, 6, 200);
  ctx.t.renderBadge(true);
  const text = ctx.doc.getElementById('skyfarm-auto-badge').textContent;
  assert.match(text, /救護 2/);
});

test('分頁在背景（document.hidden）：救護照樣做——它走 act（點格子），不靠畫面上的 RT.critHit', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, cap: 5000 });
  ctx.doc.hidden = true;
  hurt(ctx, '2,2');
  await run(ctx, 4, 200);
  assert.deepEqual(ctx.world.rescued, ['2,2']);
});

// ───── 點的當中遊戲狀態變了：安全閘每一下都重新確認 ─────

test('點完第一隻的當下玩家把工具換成「收成」：第二隻這個週期不點（工具不對就停手），下個週期切回照顧工具再救護——從頭到尾沒用收成工具救護', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': hen() }, cap: 5000 });
  hurt(ctx, '2,2');
  hurt(ctx, '3,2');
  let switched = false;
  ctx.world.afterAct = () => { if (!switched) { switched = true; ctx.world.S.sel.tool = 'hand'; } };
  await run(ctx, 8, 200);
  assert.deepEqual(ctx.world.rescued.sort(), ['2,2', '3,2']);
  assert.deepEqual(ctx.world.rescueTools, ['care', 'care'], '兩隻都是用照顧工具救的：' + JSON.stringify(ctx.world.rescueTools));
});

test('點完第一隻的當下第二隻自己好了：不再去點牠（用照顧工具點沒受傷的動物只會跳提示，但也不該白點）', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': hen({ stack: 0, timer: 100 }) }, cap: 5000 });
  hurt(ctx, '2,2');
  hurt(ctx, '3,2');
  ctx.world.afterAct = () => { ctx.world.M.tiles['3,2'].hurt = 0; };
  await run(ctx, 4, 200);
  assert.equal(ctx.world.careOnAnimal, 0, '沒有對已經好了的動物點照顧工具');
});

test('點的當下選項被換成「有機肥」：不在有機肥選項下點（救護的閘和捉蟲同一個）', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': hen() }, cap: 5000 });
  hurt(ctx, '2,2');
  hurt(ctx, '3,2');
  let n = 0;
  ctx.world.afterAct = () => { if (n++ === 0) ctx.world.S.sel.care = 'org'; };
  await run(ctx, 8, 200);
  assert.ok(ctx.world.acts.filter((a) => a.k === '3,2' && a.tool === 'care').every((a) => a.care === 'catch'), JSON.stringify(ctx.world.acts.map((a) => a.care)));
  assert.deepEqual(ctx.world.rescued.sort(), ['2,2', '3,2']);
});
