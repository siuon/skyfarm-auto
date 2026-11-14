'use strict';
// 組合鍵、設定作物的輸入面板、開關狀態、診斷輸出。
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/harness');
const { attachWorld } = require('../helpers/fake-game');
const { boot, soil, ripe, step } = require('../helpers/boot');

const panelOf = (env) => env.doc.body.findAll((e) => e.id === env.t.PANEL_ID && !e.removed)[0] || null;
const parts = (box) => ({
  input: box.findAll((e) => e.tagName === 'INPUT')[0],
  ok: box.findAll((e) => e.tagName === 'BUTTON' && e.textContent === '確認')[0],
  cancel: box.findAll((e) => e.tagName === 'BUTTON' && e.textContent === '取消')[0],
  error: box.findAll((e) => e.style && e.style.color === '#ff9a9a')[0],
  options: box.findAll((e) => e.tagName === 'OPTION'),
});
const typeAndEnter = (box, text, extra = {}) => {
  const p = parts(box);
  p.input.value = text;
  box.dispatch('keydown', Object.assign({ key: 'Enter', target: p.input }, extra));
  return p;
};

test('預設是 OFF；載入時只建立標籤，不開始做事', () => {
  const e = load();
  assert.equal(e.t.enabled, false);
  assert.equal(e.t.timer, null);
  assert.equal(e.clock.pending, 0, '沒有任何計時器在跑');
  assert.match(e.t.badge.textContent, /自動：OFF/);
  assert.match(e.t.badge.textContent, /作物：未設定/);
});

test('組合鍵：只接受使用者真實按鍵（isTrusted），合成事件、長按重複、其他按鍵一律不理', () => {
  const e = load();
  const forged = e.key('KeyA', { isTrusted: false });
  assert.equal(forged.defaultPrevented, false, '合成事件不攔截');
  assert.equal(panelOf(e), null, '合成事件不會開面板');
  assert.equal(e.key('KeyA', { repeat: true }).defaultPrevented, false, '長按重複不理');
  assert.equal(e.press({ code: 'KeyA', key: 'a' }).defaultPrevented, false, '沒按 Alt+Shift 不理');
  assert.equal(e.press({ code: 'KeyA', altKey: true }).defaultPrevented, false, '只有 Alt 不理');
  assert.equal(e.key('KeyA', { ctrlKey: true }).defaultPrevented, false, '多按 Ctrl 不理');
  assert.equal(e.key('KeyQ').defaultPrevented, false, '其他按鍵不理');
  assert.equal(panelOf(e), null);
  assert.equal(e.t.enabled, false);
});

test('Alt+Shift+A：還沒設定作物就先跳輸入面板，確認作物後才開始', () => {
  const e = load();
  attachWorld(e, {});
  const ev = e.key('KeyA');
  assert.equal(ev.defaultPrevented, true);
  assert.equal(ev.stopped, true, '要阻止遊戲自己的快速鍵也收到');
  const box = panelOf(e);
  assert.ok(box, '要跳出面板');
  assert.equal(e.t.enabled, false, '還沒確認作物，不開始');
  typeAndEnter(box, '小麥');
  assert.equal(panelOf(e), null, '確認後面板關掉');
  assert.deepEqual({ ...e.t.targetCrop }, { id: 'wheat', name: '小麥' });
  assert.equal(e.t.enabled, true, '由開關鍵叫出的面板，確認後直接開始');
  assert.match(e.t.note, /已設定作物：小麥/);
  assert.match(e.t.badge.textContent, /作物：小麥（wheat）/);
});

test('Alt+Shift+S：只設定作物，不自動開始；已有作物時輸入框預填作物名', () => {
  const e = load();
  attachWorld(e, {});
  e.key('KeyS');
  typeAndEnter(panelOf(e), 'wheat');
  assert.equal(e.t.enabled, false, '設定鍵叫出的面板不會開始');
  assert.equal(e.t.targetCrop.id, 'wheat');
  e.key('KeyS');
  assert.equal(parts(panelOf(e)).input.value, '小麥');
});

test('輸入面板：錯誤訊息（找不到／符合多種／等級不足／空白），修正後再確認；輸入時清掉錯誤', () => {
  const e = load();
  const world = attachWorld(e, { level: 3 });
  world.CFG.crops.sweet_corn = { name: '甜玉米', seedCost: 40, growSeconds: 100, yield: 1, sellPrice: 1 };
  e.key('KeyS');
  const box = panelOf(e);
  let p = typeAndEnter(box, '龍果');
  assert.match(p.error.textContent, /找不到作物「龍果」/);
  assert.ok(panelOf(e), '出錯時面板還在');
  p = typeAndEnter(box, '米');
  assert.match(p.error.textContent, /符合多種/);
  p = typeAndEnter(box, '馬鈴薯');
  assert.match(p.error.textContent, /Lv 5 才解鎖/);
  p = typeAndEnter(box, '   ');
  assert.match(p.error.textContent, /請輸入作物名稱/);
  p.input.dispatch('input');
  assert.equal(p.error.textContent, '', '重新輸入時清掉錯誤');
  assert.equal(e.t.targetCrop, null, '出錯時不會設定作物');
  typeAndEnter(box, '番茄');
  assert.equal(e.t.targetCrop.id, 'tomato');
});

test('輸入面板：輸入法組字中的 Enter（選字）不算確認；Esc 取消；按鍵不會漏給遊戲', () => {
  const e = load();
  attachWorld(e, {});
  e.key('KeyS');
  const box = panelOf(e);
  const p = parts(box);
  p.input.value = '小麥';
  box.dispatch('keydown', { key: 'Enter', target: p.input, isComposing: true });
  assert.equal(e.t.targetCrop, null, 'isComposing 時略過');
  box.dispatch('keydown', { key: 'Enter', target: p.input, keyCode: 229 });
  assert.equal(e.t.targetCrop, null, 'keyCode 229 時略過');
  let stopped = 0;
  for (const type of ['keydown', 'keyup', 'keypress']) box.dispatch(type, { key: 'x', stopPropagation() { stopped += 1; } });
  assert.equal(stopped, 3, '面板會攔下 keydown/keyup/keypress，遊戲的數字鍵快速鍵不會被觸發');
  box.dispatch('keydown', { key: 'Escape', target: p.input });
  assert.equal(panelOf(e), null, 'Esc 關閉面板');
  assert.equal(e.t.targetCrop, null);
  // 按鈕
  e.key('KeyS');
  const b = parts(panelOf(e));
  b.cancel.click();
  assert.equal(panelOf(e), null, '取消鈕');
  e.key('KeyS');
  const c = parts(panelOf(e));
  c.input.value = '小麥';
  c.ok.click();
  assert.equal(e.t.targetCrop.id, 'wheat', '確認鈕');
});

test('輸入面板：面板開著時，開關鍵與設定鍵都當作取消；輸入建議只列已解鎖的作物', () => {
  const e = load();
  attachWorld(e, { level: 3 });
  e.key('KeyS');
  const names = parts(panelOf(e)).options.map((o) => o.value);
  assert.ok(names.includes('小麥') && names.includes('番茄'));
  assert.ok(!names.includes('馬鈴薯'), 'Lv 5 才解鎖的不列');
  e.key('KeyA');
  assert.equal(panelOf(e), null, '面板開著按開關鍵 = 取消');
  assert.equal(e.t.enabled, false, '而且不會因此開始');
  e.key('KeyS');
  e.key('KeyS');
  assert.equal(panelOf(e), null, '面板開著再按設定鍵 = 取消');
});

test('輸入面板：遊戲還沒載入時確認，只顯示錯誤、不設定作物', () => {
  const e = load();
  e.key('KeyS');
  const p = typeAndEnter(panelOf(e), '小麥');
  assert.match(p.error.textContent, /遊戲還沒載入完成/);
  assert.equal(e.t.targetCrop, null);
});

test('換作物會清掉冷卻與賣出旗標；設成同一個作物則不動', () => {
  const e = load();
  attachWorld(e, {});
  e.t.targetCrop = { id: 'wheat', name: '小麥' };
  e.t.cooldown.set('1,1', { kind: 'plant', fails: 2, until: 1e15 });
  e.t.needSell = true;
  e.t.sellBlockedUntil = 1e15;
  e.key('KeyS');
  typeAndEnter(panelOf(e), '小麥');
  assert.equal(e.t.cooldown.size, 1, '同一個作物：保留');
  assert.equal(e.t.needSell, true);
  e.key('KeyS');
  typeAndEnter(panelOf(e), '玉米');
  assert.equal(e.t.cooldown.size, 0, '換作物：清掉');
  assert.equal(e.t.needSell, false);
  assert.equal(e.t.sellBlockedUntil, 0);
});

test('開關：已有作物時 Alt+Shift+A 直接開／關；開啟會歸零統計並啟動計時器、關閉會停掉', () => {
  const { env, t, clock } = boot({}, { enable: false });
  env.key('KeyA');
  assert.equal(t.enabled, true);
  assert.equal(clock.pending >= 1, true, '有計時器');
  assert.match(t.badge.textContent, /自動：ON/);
  t.stats.harvest = 5;
  env.key('KeyA');
  assert.equal(t.enabled, false);
  assert.equal(t.timer, null);
  assert.equal(clock.pending, 0, '關閉後計時器被清掉');
  env.key('KeyA');
  assert.equal(t.stats.harvest, 0, '重新開啟時統計歸零');
  assert.equal(t.lastActionAt, 0);
  t.setEnabled(true);
  assert.equal(clock.pending, 1, '重複開啟不會多出計時器');
});

test('標籤：點一下隱藏、再按開關鍵會重新顯示；開啟時顯示統計與狀態', () => {
  const { env, t } = boot({}, { enable: false });
  t.badge.click();
  assert.equal(t.badge.style.display, 'none');
  env.key('KeyA');
  assert.equal(t.badge.style.display, '', '按開關鍵會重新顯示');
  const text = t.badge.textContent;
  assert.match(text, /收成 0｜播種 0｜澆水 0｜捉蟲 0｜撿拾 0｜賣出 0 次/);
  assert.match(text, /果樹 0｜魚池 0｜機器 0｜雜物 0｜餵食 0/);
  assert.match(text, /開啟後還沒做成任何事/);
});

test('計時器驅動：開啟後每個 tickMs 自動跑一次週期（不必手動呼叫 tick）', async () => {
  const cfg = require('../helpers/fixture-config').makeCfg();
  const { world, clock } = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }) } }, { timer: true });
  world.S.sel.tool = 'seed';
  world.S.sel.none49 = false;
  await clock.advance(400);
  assert.equal(world.M.tiles['0,0'].crop, null, '一個 tickMs 後已經收成');
  assert.equal(world.S.inv.wheat, 1);
});

test('診斷（Alt+Shift+D）：結果進剪貼簿與 console，標籤顯示摘要；不含網址參數', async () => {
  const e = load();
  attachWorld(e, { tiles: { '0,0': soil(), '1,0': soil({ crop: { id: 'wheat', prog: 0 } }) }, inv: { wheat: 2 } });
  e.t.targetCrop = { id: 'wheat', name: '小麥' };
  e.key('KeyD');
  await e.clock.advance(0);
  assert.ok(e.clip.text, '有寫進剪貼簿');
  const report = JSON.parse(e.clip.text);
  assert.equal(report.probeVersion, e.t.VERSION);
  assert.equal(report.page.url, 'https://phoenixruby.github.io/skyfarm/', '網址的 ?token 與 #frag 要被移除');
  assert.ok(!e.clip.text.includes('SECRET'));
  assert.equal(report.game.api, true);
  assert.equal(report.game.targetCrop, 'wheat');
  assert.equal(report.game.tiles.empty, 1);
  assert.equal(report.game.tiles.growing, 1);
  assert.match(e.t.note, /診斷：成熟 0｜空田 1｜生長中 1｜倉庫 2\/100/);
  assert.match(e.t.note, /動物：0 隻｜餓了 0｜長大待出貨 0/);
  assert.match(e.t.note, /完整結果已複製到剪貼簿/);
  assert.ok(e.logs.some((l) => l.includes('診斷結果')), '也輸出到 console');
});

test('診斷：剪貼簿被擋或不存在時，仍顯示摘要並提示改看 Console；遊戲沒載入時也不會出錯', async () => {
  let e = load();
  attachWorld(e, {});
  e.clip.fail = true;
  e.key('KeyD');
  await e.clock.advance(0);
  assert.match(e.t.note, /複製失敗，完整結果請從 Console 複製/);
  assert.match(e.t.note, /診斷：成熟/);
  e = load({ noClipboard: true });
  attachWorld(e, {});
  e.key('KeyD');
  assert.match(e.t.note, /無法存取剪貼簿/);
  e = load();
  e.key('KeyD');
  await e.clock.advance(0);
  assert.match(e.t.note, /診斷：遊戲介面還沒載入/);
});

test('診斷內容：只有數量與設定，沒有存檔名稱、座標等個人資訊', async () => {
  const e = load();
  attachWorld(e, { tiles: { '3,4': { t: 'animal', id: 'egg_hen', stage: 2, timer: 0, cycles: 5, stack: 1 } } });
  e.t.targetCrop = { id: 'wheat', name: '小麥' };
  const text = JSON.stringify(e.t.describeGame());
  assert.ok(!text.includes('3,4'), '不輸出格子座標');
  const g = e.t.describeGame();
  assert.equal(g.animals.total, 1);
  assert.equal(g.animals.producersWithProduct, 1);
  assert.equal(g.animals.hungry, 1, '成年蛋雞、計時 0、還有輪數 → 餓了');
  assert.deepEqual({ ...g.animals.feedNeed }, { corn_cake: 1 });
  assert.equal(g.animals.meatReadyToShip, 0);
  assert.equal(g.ground.animalsWithProduct, 1);
});
