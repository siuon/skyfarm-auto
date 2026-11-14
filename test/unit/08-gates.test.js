'use strict';
// 週期的閘門：什麼情況下一律不動手；錯誤時自動關閉；標籤與狀態文字。
const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeEl } = require('../helpers/fake-dom');
const { boot, soil, ripe, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
// 有事可做的標準農場：一格成熟作物、一個糞便、一個有蛋的雞
const busyFarm = (extra = {}) => boot({
  tiles: {
    '0,0': soil({ crop: ripe('wheat', cfg) }),
    '1,0': { t: 'poop' },
    '7,6': { t: 'animal', id: 'egg_hen', stage: 2, timer: 100, cycles: 5, stack: 2 },
  },
  inv: { wheat: 2 }, cap: 20, ...extra,
});

test('遊戲介面還沒載入：只顯示狀態，不丟錯', async () => {
  const { env, t } = boot({}, { enable: false });
  delete env.win.__farm18;
  t.setEnabled(true);
  env.clock.clear(t.timer);
  await t.tick();
  assert.equal(t.status, '等待遊戲載入…');
  assert.equal(t.enabled, true);
});

test('玩家自己開了別的視窗（每日簽到、天氣預報…）：整個週期暫停，不點任何東西，也不去開倉庫', async () => {
  const ctx = busyFarm();
  ctx.world.modal.hidden = false;
  ctx.world.modalTitle.textContent = '每日簽到';
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.world.storageUI.opens, 0);
  assert.equal(ctx.t.status, '有視窗開啟（每日簽到），暫停中');
  ctx.world.modal.hidden = true; // 玩家關掉視窗
  await run(ctx, 3);
  assert.ok(ctx.world.acts.length > 0, '關掉後恢復');
});

test('「農產倉庫滿了」視窗：按「先不收成」並標記要賣；這個週期不做別的', async () => {
  const ctx = busyFarm();
  ctx.world.modal.hidden = false;
  ctx.world.modalTitle.textContent = '農產倉庫滿了';
  const cancel = new FakeEl(ctx.doc, 'button');
  cancel.onclick = () => { ctx.world.modal.hidden = true; };
  ctx.doc.register('fullCancel', cancel);
  await ctx.t.tick();
  assert.equal(cancel.clicks, 1, '按了「先不收成」');
  assert.equal(ctx.t.needSell, true);
  assert.equal(ctx.world.acts.length, 0);
});

test('玩家留著確認視窗（#ask47，例如購買確認）：絕對不碰，也不動手', async () => {
  const ctx = busyFarm();
  const ask = ctx.doc.register('ask47', new FakeEl(ctx.doc, 'div'));
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.t.status, '有確認視窗開啟，暫停中');
  assert.ok(ask.clicks === 0);
  assert.equal(ctx.world.storageUI.opens, 0);
});

test('地圖上有小選單（#pick53）開著：當作是玩家叫出來的，暫停；關掉才繼續', async () => {
  const ctx = busyFarm();
  ctx.world.pop.hidden = false;
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.t.status, '有選單開啟，暫停中');
  ctx.world.pop.hidden = true;
  await run(ctx, 3);
  assert.ok(ctx.world.acts.length > 0);
});

test('遊戲按了「全部隱藏」（ui-hide）：點擊會被遊戲忽略，所以暫停並說明', async () => {
  const ctx = busyFarm();
  ctx.doc.body.classList.add('ui-hide');
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.t.status, '遊戲介面被隱藏（「全部隱藏」），暫停中');
  ctx.doc.body.classList.remove('ui-hide');
  await run(ctx, 3);
  assert.ok(ctx.world.acts.length > 0);
});

test('玩家正在搬移物件（RT.mv）：不打擾，並說明', async () => {
  const ctx = busyFarm();
  ctx.world.RT.mv = { what: 'something' };
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.t.status, '你正在搬移物件，暫停中');
  ctx.world.RT.mv = null;
  await run(ctx, 3);
  assert.ok(ctx.world.acts.length > 0);
});

test('作物輸入面板開著：暫停（玩家正在輸入）', async () => {
  const ctx = busyFarm();
  ctx.env.key('KeyS');
  assert.ok(ctx.t.panel);
  await run(ctx, 3);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.t.status, '設定作物中…');
});

test('每個暫停狀態都不會開倉庫、不會按任何確認：倉庫滿了也一樣', async () => {
  const ctx = busyFarm({ inv: { wheat: 18 } }); // 剩 2，本來會去賣
  ctx.world.modal.hidden = false;
  ctx.world.modalTitle.textContent = '設定';
  await run(ctx, 3);
  assert.equal(ctx.world.storageUI.opens, 0);
  assert.equal(ctx.world.acts.length, 0);
});

test('失敗時安全優先：未預期的錯誤 → 自動關閉、停掉計時器、提示看 console', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) } }, { timer: true });
  ctx.world.S.sel.tool = 'seed';
  ctx.world.S.sel.none49 = false;
  ctx.env.win.__farm18.act = () => { throw new Error('遊戲改版了'); };
  await ctx.clock.advance(400);
  assert.equal(ctx.t.enabled, false, '自動功能已關閉');
  assert.equal(ctx.t.timer, null);
  assert.equal(ctx.clock.pending >= 0, true);
  assert.match(ctx.t.note, /發生錯誤，已自動關閉（看 console）/);
  assert.ok(ctx.env.logs.some((l) => l.includes('發生錯誤，已自動關閉') && l.includes('遊戲改版了')), '錯誤內容寫進 console');
  const before = ctx.env.logs.length;
  await ctx.clock.advance(5000);
  assert.equal(ctx.env.logs.length, before, '關閉後不再執行');
});

test('一個週期還沒做完時，下一個計時器觸發不會重複進入（例如賣出到一半）', async () => {
  const ctx = boot({ cap: 20, inv: { wheat: 18 } });
  ctx.t.onTick(); // 開始賣出（要等假時鐘往前走才會繼續）
  ctx.t.onTick();
  ctx.t.onTick();
  for (let i = 0; i < 40; i++) await ctx.clock.advance(100);
  assert.equal(ctx.world.storageUI.opens, 1, '只開了一次倉庫');
});

test('標籤：統計、狀態、「上次動作：N 秒前」會隨時間更新', async () => {
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) } });
  await run(ctx, 3);
  assert.match(ctx.t.badge.textContent, /收成 1｜播種/);
  const text = () => ctx.t.badge.textContent;
  assert.match(text(), /上次動作：\d+ 秒前|上次動作：0 秒前/);
  await ctx.clock.advance(70000);
  ctx.t.onTick();
  assert.match(text(), /上次動作：1 分 \d+ 秒前/, '過了一段時間，數字會走（onTick 會重畫）');
});

test('標籤：開啟時背景變綠、關閉變黑；訊息過一段時間自動消失', async () => {
  const { env, t, clock } = boot({}, { enable: false });
  const off = t.badge.style.background;
  t.setEnabled(true);
  assert.notEqual(t.badge.style.background, off);
  t.setNote('測試訊息', 3000);
  assert.match(t.badge.textContent, /測試訊息/);
  await clock.advance(3100);
  assert.doesNotMatch(t.badge.textContent, /測試訊息/);
  t.setEnabled(false);
  assert.equal(t.badge.style.background, off);
  assert.ok(env);
});

test('沒有事做時的狀態文字', async () => {
  const ctx = boot({ tiles: {} });
  await run(ctx, 2);
  assert.equal(ctx.t.status, '運作中（暫時沒有事做）');
});
