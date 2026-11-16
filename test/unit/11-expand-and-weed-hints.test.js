'use strict';
// 2026-11-15「雜草沒有拔，我有擴地」的回歸：
//   - 遊戲的「擴地模式」開著時，點地圖一律被當成擴地點擊（點已有的格子什麼都不會發生），腳本要偵測到並暫停；
//   - 雜草沒拔的兩種原因（倉庫空位不夠／倉庫裡的雜草到上限）要分開寫在標籤上，並帶數字；
//   - 腳本一次只處理畫面上的這一座島，有多座島時標籤要提醒；診斷要能看出這些。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, ripe, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const weed = () => ({ t: 'weed', v: 0 });
const filler = (ctx) => { ctx.world.CFG.items.filler = { name: '雜物', category: 'material', sellPrice: 0 }; };

// ───── 擴地模式 ─────

test('擴地模式開著、工具剛好已經是「收成」：腳本一下都不點（點了會被遊戲吞掉），標籤說明原因', async () => {
  const ctx = boot({ tiles: { '0,0': weed(), '1,0': weed() }, cap: 100, expand: true, sel: { tool: 'hand' } });
  await run(ctx, 5);
  assert.equal(ctx.world.expandTaps, 0, '沒有任何點擊被當成擴地點擊');
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.t.status, '遊戲在「擴地模式」，暫停中（再按一次「擴地」或按 Esc 結束）');
  assert.ok(ctx.world.M.tiles['0,0'], '雜草還在，沒有被亂動');
  assert.equal(ctx.world.storageUI.opens, 0, '也不去開倉庫');
});

test('擴地模式結束（玩家再按一次「擴地」或 Esc）後，腳本立刻恢復，把雜草拔掉', async () => {
  const ctx = boot({ tiles: { '0,0': weed(), '1,0': weed() }, cap: 100, expand: true, sel: { tool: 'hand' } });
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  ctx.world.setExpand(false);
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.weed, 2);
  assert.equal(ctx.world.expandTaps, 0);
});

test('擴地模式：不管要做什麼工作（收成、播種、撿拾、澆水…）、不管現在用哪個工具，一律暫停', async () => {
  for (const tool of ['hand', 'seed', 'water', 'care']) {
    const ctx = boot({
      tiles: {
        '0,0': soil({ crop: ripe('wheat', cfg) }), '1,0': soil(), '2,0': { t: 'poop' }, '3,0': weed(),
        '4,0': soil({ m: 0, crop: { id: 'wheat', prog: 1, pest: false } }),
      },
      cap: 100, expand: true, sel: { tool },
    });
    await run(ctx, 4);
    assert.equal(ctx.world.acts.length, 0, tool + '：一下都沒點');
    assert.equal(ctx.world.expandTaps, 0, tool);
  }
});

test('對照：沒有擴地模式時一切照常（同一個農場）', async () => {
  const ctx = boot({ tiles: { '0,0': weed(), '2,0': { t: 'poop' } }, cap: 100, sel: { tool: 'hand' } });
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.weed, 1);
  assert.equal(ctx.world.S.inv.poop, 1);
});

test('腳本自己切換工具會結束擴地模式（遊戲的規則）：但腳本在擴地模式下根本不會去切換，所以不會替玩家結束它', async () => {
  const ctx = boot({ tiles: { '0,0': weed() }, cap: 100, expand: true, sel: { tool: 'water' } });
  await run(ctx, 4);
  assert.equal(ctx.world.expand, true, '玩家的擴地模式還開著');
  assert.equal(ctx.world.toolBtn.hand.clicks, 0, '沒有去點工具列');
  assert.equal(ctx.world.S.sel.tool, 'water');
});

// ───── 雜草沒拔的原因標籤 ─────

test('標籤：倉庫空位不夠 → 寫出剩幾格、要保留幾格、幾格雜草沒拔（不會說成雜草庫存已滿）', async () => {
  const ctx = boot({ tiles: { '0,0': weed(), '1,0': weed() }, cap: 100, inv: { filler: 70 } }); // 空位 30，要留 30
  filler(ctx);
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, undefined);
  assert.match(ctx.t.status, /倉庫剩 30 格空位（拔雜草要保留 30 格），2 格雜草先不拔/);
  assert.ok(!/雜草（上限|倉庫裡已有/.test(ctx.t.status), '不是庫存上限的原因');
});

test('倉庫裡已經有很多雜草也照拔：雜草在倉庫裡沒有數量上限，只看空位（2026-11-16 使用者要求移除上限）', async () => {
  const ctx = boot({ tiles: { '0,0': weed(), '1,0': weed(), '2,0': weed() }, cap: 1000, inv: { weed: 200 } });
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.weed, 203);
  assert.equal(Object.values(ctx.world.M.tiles).filter((t) => t.t === 'weed').length, 0, '地上的雜草都拔掉了');
  assert.ok(!/雜草/.test(ctx.t.status), ctx.t.status);
  assert.equal(ctx.t.CONFIG.weedMaxStock, undefined, '設定裡已經沒有 weedMaxStock');
});

test('標籤：空位夠、庫存沒滿時，沒有任何雜草暫停提示', async () => {
  const ctx = boot({ tiles: { '0,0': weed() }, cap: 1000 });
  await run(ctx, 3);
  assert.equal(ctx.world.S.inv.weed, 1);
  assert.ok(!/雜草/.test(ctx.t.status), ctx.t.status);
});

test('雜草再多也不會單獨觸發賣出（空位夠就不開倉庫）；保留空位 weedKeepFree 仍是 30', async () => {
  const ctx = boot({ tiles: { '0,0': weed() }, cap: 1000, inv: { weed: 400 } });
  await run(ctx, 6);
  assert.equal(ctx.world.storageUI.opens, 0, '空位 599 遠高於賣出門檻，不去開倉庫');
  assert.equal(ctx.world.S.inv.weed, 401);
  assert.equal(ctx.t.CONFIG.weedKeepFree, 30);
});

// ───── 多座島 ─────

test('只有一座島：標籤沒有島嶼提醒', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: false } }) } });
  await run(ctx, 2);
  assert.ok(!/座島/.test(ctx.t.status), ctx.t.status);
});

test('有兩座島：標籤提醒「共 2 座島，只處理畫面上的第 1 座」；切到第 2 座就寫第 2 座', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: false } }) } });
  ctx.world.S.maps.push({ blocks: [[0, 0]], tiles: { '0,0': weed() }, pools: {} });
  await run(ctx, 2);
  assert.match(ctx.t.status, /共 2 座島，只處理畫面上的第 1 座/);
  ctx.world.S.cur = 1;
  await run(ctx, 2);
  assert.match(ctx.t.status, /共 2 座島，只處理畫面上的第 2 座/);
});

test('只處理畫面上的島：另一座島的雜草不會被點', async () => {
  const ctx = boot({ tiles: { '5,5': soil() }, cap: 100 });
  ctx.world.S.maps.push({ blocks: [[0, 0]], tiles: { '0,0': weed() }, pools: {} });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.acts.map((a) => a.k).filter((k) => k === '0,0'), [], '沒有對另一座島的格子動手');
  assert.ok(ctx.world.S.maps[1].tiles['0,0'], '另一座島的雜草還在');
});

// ───── 診斷 ─────

test('診斷：倉庫雜草數、島嶼、擴地模式；摘要有雜草與島嶼那兩行', async () => {
  const ctx = boot({ tiles: { '0,0': weed(), '1,0': { t: 'weedball', n: 3 } }, cap: 200, inv: { weed: 12 } }, { enable: false });
  let g = ctx.t.describeGame();
  assert.equal(g.weedStock, 12);
  assert.deepEqual({ ...g.maps }, { total: 1, current: 1 });
  assert.equal(g.expandMode, false);
  assert.equal(g.ground.weed, 1);
  assert.equal(g.ground.weedball, 1);
  ctx.world.S.maps.push({ blocks: [[0, 0]], tiles: {}, pools: {} });
  ctx.world.setExpand(true);
  g = ctx.t.describeGame();
  assert.deepEqual({ ...g.maps }, { total: 2, current: 1 });
  assert.equal(g.expandMode, true);
  ctx.env.key('KeyD');
  await ctx.clock.advance(0);
  assert.match(ctx.t.note, /雜草：地上 1（草球 1）｜倉庫 12 個｜空位 188（拔雜草要留 30）/);
  assert.match(ctx.t.note, /島 1\/2｜擴地模式中（腳本暫停）/);
});
