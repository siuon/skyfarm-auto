'use strict';
// 設定視窗（Alt+Shift+C）與保存（使用者 2026-11-17 要求：把可以用 config 設定的參數做成介面、說明每個參數；
// 保存方式選「存在瀏覽器」：localStorage 的一個鍵，只存和預設不同的值，讀回來時嚴格驗證）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, step } = require('../helpers/boot');
const { makeStorage } = require('../helpers/harness');

const KEY = 'skyfarm-auto-settings';
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const farm = (o = {}, cfg = {}) => boot(o, Object.assign({ enable: false }, cfg));
const withStorage = (initial, opts, o = {}, cfg = {}) => {
  const storage = makeStorage(initial, opts);
  const ctx = farm(o, Object.assign({ loadOpts: { storage } }, cfg));
  return { ctx, storage };
};
const stored = (storage) => (storage.m.has(KEY) ? JSON.parse(storage.m.get(KEY)) : null);
const openPanel = (ctx) => { ctx.env.key('KeyC'); return ctx.t.settingsPanel; };
const row = (ctx, key) => ctx.t.settingsRows.get(key);
const setNum = (ctx, key, text) => { const r = row(ctx, key); r.input.value = text; r.input.dispatch('change'); return r; };
const setBox = (ctx, key, on) => { const r = row(ctx, key); r.input.checked = on; r.input.dispatch('change'); return r; };

// ───── 設定表本身 ─────

test('設定表涵蓋 CONFIG 的每一個參數（快速鍵除外），而且沒有多出不存在的參數', () => {
  const { t } = farm({});
  const hotkeys = new Set(t.HOTKEY_NAMES.map(([k]) => k));
  const configKeys = Object.keys(t.DEFAULTS).filter((k) => !hotkeys.has(k));
  const schemaKeys = t.SETTING_DEFS.map((d) => d.key);
  assert.deepEqual([...schemaKeys].sort(), [...configKeys].sort(), '新增 CONFIG 參數時，要同時在設定表加一項（名稱、說明、範圍）');
  assert.equal(new Set(schemaKeys).size, schemaKeys.length, '參數名不重複');
  for (const k of hotkeys) assert.ok(t.CONFIG[k] && t.CONFIG[k].code, k + ' 是快速鍵');
});

test('每個參數都有名稱、說明、群組、合法的型別與範圍，而且預設值通過自己的驗證', () => {
  const { t } = farm({});
  for (const d of t.SETTING_DEFS) {
    assert.ok(d.label && d.label.length >= 2, d.key + ' 要有名稱');
    assert.ok(d.desc && d.desc.length >= 8, d.key + ' 要有說明');
    assert.ok(d.group, d.key + ' 要有群組');
    assert.ok(['bool', 'int', 'num', 'numOrNull', 'enum', 'islands', 'machines'].includes(d.type), d.key + ' 型別');
    if (['int', 'num', 'numOrNull'].includes(d.type)) {
      assert.ok(Number.isFinite(d.min) && Number.isFinite(d.max) && d.min <= d.max, d.key + ' 要有範圍');
    }
    const r = t.coerceSetting(d, JSON.parse(JSON.stringify(t.DEFAULTS[d.key])));
    assert.equal(r.ok, true, d.key + ' 的預設值要能通過驗證：' + (r.why || ''));
  }
});

test('預設值快照 = 載入時的 CONFIG；改了 CONFIG 之後快照不變', () => {
  const { t } = farm({});
  assert.deepEqual(JSON.parse(JSON.stringify(t.DEFAULTS)), JSON.parse(JSON.stringify(t.CONFIG)));
  t.CONFIG.autoSell = false;
  assert.equal(t.DEFAULTS.autoSell, true);
});

test('快速鍵預設值釘住：設定視窗是 Alt+Shift+C（使用者 2026-11-17 要求）', () => {
  const { t } = farm({});
  assert.deepEqual({ ...t.CONFIG.configKey }, { code: 'KeyC', alt: true, shift: true, ctrl: false });
});

// ───── 驗證 ─────

test('驗證：布林只收 true／false；整數、數字有範圍；可空的數字可以是 null；選單只收列出的值', () => {
  const { t } = farm({});
  const d = (k) => t.SETTING_DEFS.find((x) => x.key === k);
  const ok = (k, v) => t.coerceSetting(d(k), v).ok;
  assert.equal(ok('autoSell', true), true);
  for (const v of [1, 0, 'true', null, undefined, {}]) assert.equal(ok('autoSell', v), false, String(v));
  assert.equal(ok('tickMs', 200), true);
  assert.equal(ok('tickMs', 5000), true);
  for (const v of [199, 5001, 400.5, NaN, Infinity, '400', null, -1]) assert.equal(ok('tickMs', v), false, String(v));
  assert.equal(ok('waterBelow', 0.5), true, 'num 允許小數');
  assert.equal(ok('waterBelow', 4.1), false);
  assert.equal(ok('waterUpTo', null), true);
  assert.equal(ok('waterUpTo', 0.5), false, '澆到幾級至少 1');
  assert.equal(ok('waterBelow', null), false, 'waterBelow 不能是 null');
  assert.equal(ok('islandMode', 'all'), true);
  assert.equal(ok('islandMode', 'current'), true);
  assert.equal(ok('islandMode', 'both'), false);
});

test('驗證：島編號清單、機器代號清單', () => {
  const { t } = farm({});
  const d = (k) => t.SETTING_DEFS.find((x) => x.key === k);
  const r = t.coerceSetting(d('skipIslands'), [3, 2, 2]);
  assert.equal(r.ok, true);
  assert.deepEqual([...r.value], [2, 3], '去重、排序');
  for (const v of [[0], [100], [1.5], ['2'], 'abc', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]]) {
    assert.equal(t.coerceSetting(d('skipIslands'), v).ok, false, JSON.stringify(v));
  }
  assert.equal(t.coerceSetting(d('loadMachineIds'), ['compost_bin', 'fish_feed_machine']).ok, true);
  for (const v of [['Compost'], ['a b'], ['x'.repeat(41)], [1], 'compost_bin', ['<img>']]) {
    assert.equal(t.coerceSetting(d('loadMachineIds'), v).ok, false, JSON.stringify(v));
  }
});

test('參數之間的關係：補貨目標不能小於低水位；澆到幾級不能小於開始澆的濕度', () => {
  const { t } = farm({});
  assert.match(t.crossCheck('petFoodTargetPerPet', 3), /不能小於低水位（4）/);
  assert.equal(t.crossCheck('petFoodTargetPerPet', 4), '');
  assert.match(t.crossCheck('petFoodLowPerPet', 11), /不能大於補貨目標（10）/);
  assert.match(t.crossCheck('waterUpTo', 0.5 + 0), /不能小於/);
  assert.equal(t.crossCheck('waterUpTo', null), '');
  assert.equal(t.crossCheck('waterUpTo', 2), '');
});

// ───── 保存：讀回 ─────

test('沒存過任何設定：用預設值，載入時只讀自己的那一個鍵、不寫任何東西', () => {
  const { ctx, storage } = withStorage({});
  assert.deepEqual(storage.log, [['get', KEY]]);
  assert.deepEqual({ ...ctx.t.overrides }, {});
  assert.equal(ctx.t.CONFIG.autoSell, true);
});

test('載入：套用合法的值（型別、範圍都對）；同樣的值只套一次，回到預設值的就不算「改過」', () => {
  const saved = { autoSell: false, tickMs: 800, islandMode: 'current', skipIslands: [3, 2], waterUpTo: 3, autoPlant: true };
  const { ctx } = withStorage({ [KEY]: JSON.stringify(saved) });
  const C = ctx.t.CONFIG;
  assert.equal(C.autoSell, false);
  assert.equal(C.tickMs, 800);
  assert.equal(C.islandMode, 'current');
  assert.deepEqual([...C.skipIslands], [2, 3]);
  assert.equal(C.waterUpTo, 3);
  assert.deepEqual(Object.keys(ctx.t.overrides).sort(), ['autoSell', 'islandMode', 'skipIslands', 'tickMs', 'waterUpTo'], 'autoPlant 和預設一樣，不算改過');
});

test('載入：不合的整項忽略（型別錯、超出範圍、未知參數、機器代號亂寫）；其他合法的照套', () => {
  const saved = {
    tickMs: 5, autoSell: 'yes', maxActionsPerTick: 2.5, islandMode: 'x', skipIslands: ['2'], loadMachineIds: ['<b>'],
    notAKey: 1, autoWater: false, minCoinsAfterPlant: 50,
  };
  const { ctx } = withStorage({ [KEY]: JSON.stringify(saved) });
  const C = ctx.t.CONFIG;
  assert.equal(C.tickMs, 400);
  assert.equal(C.autoSell, true);
  assert.equal(C.maxActionsPerTick, 3);
  assert.equal(C.islandMode, 'all');
  assert.deepEqual([...C.skipIslands], []);
  assert.deepEqual([...C.loadMachineIds], ['compost_bin', 'fish_feed_machine']);
  assert.equal(C.autoWater, false, '合法的照套');
  assert.equal(C.minCoinsAfterPlant, 50);
  assert.equal(C.notAKey, undefined, '未知參數不會被加進 CONFIG');
  assert.deepEqual(Object.keys(ctx.t.overrides).sort(), ['autoWater', 'minCoinsAfterPlant']);
});

test('載入：原型污染的鍵（__proto__、constructor、prototype）進不來；Object.prototype 沒被動到', () => {
  const evil = '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted2":true}},"prototype":1,"autoSell":false}';
  const { ctx } = withStorage({ [KEY]: evil });
  assert.equal(ctx.t.CONFIG.autoSell, false);
  const proto = ctx.t.CONFIG.constructor.prototype; // 腳本所在的那個 realm 的 Object.prototype
  assert.equal(proto.polluted, undefined);
  assert.equal(proto.polluted2, undefined);
  assert.equal(ctx.t.CONFIG.polluted, undefined);
  assert.equal(Object.getPrototypeOf(ctx.t.CONFIG), proto);
});

test('載入：JSON 壞掉、不是物件、太大、空字串、儲存空間丟錯、連讀取 localStorage 都丟錯——一律用預設，不丟錯', () => {
  for (const raw of ['{bad json', '[1,2]', 'null', '"str"', '', '{"autoSell":false,"pad":"' + 'x'.repeat(5000) + '"}']) {
    const { ctx } = withStorage({ [KEY]: raw });
    assert.equal(ctx.t.CONFIG.autoSell, true, raw.slice(0, 20));
    assert.deepEqual({ ...ctx.t.overrides }, {});
  }
  let r = withStorage({}, { throwOnGet: true });
  assert.equal(r.ctx.t.CONFIG.tickMs, 400);
  const ctx = farm({}, { loadOpts: { storageBlocked: true } });
  assert.equal(ctx.t.CONFIG.tickMs, 400, '私密視窗：連讀屬性都丟錯也沒事');
  assert.equal(ctx.t.applySetting('autoSell', false).ok, true, '寫不進去，這次載入仍然生效');
  assert.equal(ctx.t.applySetting('autoSell', false).saved, false);
});

test('載入：存下來的兩個值彼此矛盾（補貨目標 < 低水位）時，那一組回到預設', () => {
  const { ctx } = withStorage({ [KEY]: JSON.stringify({ petFoodTargetPerPet: 2, petFoodLowPerPet: 5, autoSell: false }) });
  assert.equal(ctx.t.CONFIG.petFoodTargetPerPet, 10);
  assert.equal(ctx.t.CONFIG.petFoodLowPerPet, 4);
  assert.equal(ctx.t.CONFIG.autoSell, false);
  assert.ok(!('petFoodTargetPerPet' in ctx.t.overrides));
  const r = withStorage({ [KEY]: JSON.stringify({ waterBelow: 3, waterUpTo: 2 }) });
  assert.equal(r.ctx.t.CONFIG.waterUpTo, null);
  assert.equal(r.ctx.t.CONFIG.waterBelow, 1);
});

// ───── 保存：寫出 ─────

test('改設定：驗證 → 立刻生效 → 只把「和預設不同的」存進那一個鍵；改回預設就從存檔裡拿掉；全部回預設就清掉鍵', () => {
  const { ctx, storage } = withStorage({});
  assert.deepEqual({ ...ctx.t.applySetting('tickMs', 600) }, { ok: true, value: 600, saved: true });
  assert.equal(ctx.t.CONFIG.tickMs, 600);
  assert.deepEqual(stored(storage), { tickMs: 600 });
  ctx.t.applySetting('autoSell', false);
  assert.deepEqual(stored(storage), { tickMs: 600, autoSell: false });
  ctx.t.applySetting('tickMs', 400);
  assert.deepEqual(stored(storage), { autoSell: false }, '改回預設值：不留在存檔裡');
  ctx.t.resetSetting('autoSell');
  assert.equal(storage.m.has(KEY), false, '全部回預設：連鍵都清掉');
  assert.equal(ctx.t.CONFIG.autoSell, true);
  assert.ok(storage.log.every((x) => x[1] === KEY), '從頭到尾只碰自己的那一個鍵');
});

test('不合的值：不改 CONFIG、不寫儲存空間，回傳原因', () => {
  const { ctx, storage } = withStorage({});
  const w0 = storage.log.length;
  for (const [k, v] of [['tickMs', 10], ['autoSell', 'x'], ['islandMode', 'z'], ['nope', 1], ['skipIslands', [0]], ['petFoodTargetPerPet', 2]]) {
    const r = ctx.t.applySetting(k, v);
    assert.equal(r.ok, false, k);
    assert.ok(r.why, k + ' 要有原因');
  }
  assert.equal(ctx.t.CONFIG.tickMs, 400);
  assert.equal(storage.log.length, w0, '沒有任何寫入');
});

test('暫時的、不存的：開關、設定作物、Alt+Shift+F 切島嶼模式都不寫儲存空間（也不進 overrides）', async () => {
  const { ctx, storage } = withStorage({}, {}, { tiles: { '0,0': soil() } });
  const writes = () => storage.log.filter((x) => x[0] !== 'get').length;
  ctx.env.key('KeyA'); // 開
  ctx.env.key('KeyF'); // 島嶼模式
  ctx.env.key('KeyF');
  ctx.env.key('KeyA'); // 關
  ctx.t.targetCrop = { id: 'corn', name: '玉米' };
  assert.equal(writes(), 0);
  assert.deepEqual({ ...ctx.t.overrides }, {});
  ctx.env.key('KeyF');
  assert.equal(ctx.t.CONFIG.islandMode, 'current');
  assert.equal(writes(), 0, '快速鍵切換的島嶼模式只在這次載入有效');
});

test('改週期間隔：自動功能開著時，計時器重新排（用新的間隔）', () => {
  const ctx = boot({}, { timer: true });
  const t0 = ctx.t.timer;
  assert.ok(t0);
  const pending = ctx.clock.pending;
  ctx.t.applySetting('tickMs', 1000);
  assert.notEqual(ctx.t.timer, t0, '換了一個新的計時器');
  assert.equal(ctx.clock.pending, pending, '沒有多出計時器');
  const off = boot({}, { enable: false });
  off.t.applySetting('tickMs', 1000);
  assert.equal(off.t.timer, null, '沒開的時候不會憑空建立計時器');
});

test('設定真的改變行為：關掉 autoSell 後，倉庫快滿也不開倉庫賣；改回來就賣', async () => {
  const ctx = boot({ cap: 20, inv: { wheat: 5, egg: 12 }, coins: 100 });
  ctx.t.applySetting('autoSell', false);
  await run(ctx, 3);
  assert.equal(ctx.world.storageUI.opens, 0);
  ctx.t.applySetting('autoSell', true);
  await run(ctx, 3);
  assert.equal(ctx.world.storageUI.opens > 0, true);
});

// ───── 視窗 ─────

test('Alt+Shift+C 開關視窗；Esc、「關閉」鈕、再按一次也能關；視窗是腳本自己建的元素', () => {
  const ctx = farm({});
  assert.equal(ctx.t.settingsPanel, null);
  const p = openPanel(ctx);
  assert.ok(p);
  assert.equal(p.id, ctx.t.SETTINGS_PANEL_ID);
  assert.equal(ctx.t.settingsPanel, p);
  ctx.env.key('KeyC');
  assert.equal(ctx.t.settingsPanel, null, '再按一次關閉');
  openPanel(ctx);
  ctx.t.settingsPanel.dispatch('keydown', { key: 'Escape' });
  assert.equal(ctx.t.settingsPanel, null, 'Esc 關閉');
  const p2 = openPanel(ctx);
  p2.findAll((e) => e.textContent === '關閉')[0].click();
  assert.equal(ctx.t.settingsPanel, null);
  assert.equal(ctx.t.settingsRows.size, 0, '關掉後不留控制項記錄');
});

test('視窗每個參數一列：名稱、說明、預設值都寫出來；說明裡有「預設：」', () => {
  const ctx = farm({});
  const p = openPanel(ctx);
  assert.equal(ctx.t.settingsRows.size, ctx.t.SETTING_DEFS.length);
  const texts = p.findAll(() => true).map((e) => e.textContent).filter(Boolean);
  for (const d of ctx.t.SETTING_DEFS) {
    assert.ok(texts.includes(d.label), d.key + ' 名稱有顯示');
    const desc = texts.find((x) => x.startsWith(d.desc));
    assert.ok(desc, d.key + ' 說明有顯示');
    assert.ok(desc.includes('預設：' + ctx.t.fmtSetting(d, ctx.t.DEFAULTS[d.key])), d.key + ' 預設值有顯示');
  }
  const all = texts.join('\n');
  assert.match(all, /Alt\+Shift\+A 開關/);
  assert.match(all, /Alt\+Shift\+C 設定視窗/, '快速鍵只顯示、不能改');
  assert.match(all, /改了立刻生效，並存在這個瀏覽器/);
});

test('視窗裡的控制項反映目前的設定：勾選框、數字、選單、島編號、機器勾選', () => {
  const { ctx } = withStorage({ [KEY]: JSON.stringify({ autoSell: false, tickMs: 700, islandMode: 'current', skipIslands: [2, 3] }) });
  openPanel(ctx);
  assert.equal(row(ctx, 'autoSell').input.checked, false);
  assert.equal(row(ctx, 'autoPlant').input.checked, true);
  assert.equal(row(ctx, 'tickMs').input.value, '700');
  assert.equal(row(ctx, 'waterUpTo').input.value, '', 'null 顯示成空白');
  assert.equal(row(ctx, 'islandMode').input.value, 'current');
  assert.equal(row(ctx, 'skipIslands').input.value, '2, 3');
  assert.equal(row(ctx, 'loadMachineIds').boxes.get('compost_bin').checked, true);
  assert.equal(row(ctx, 'loadMachineIds').boxes.get('corn_cake_machine').checked, false, '遊戲裡有的機器也列出來，預設沒勾');
  assert.equal(row(ctx, 'autoSell').mark.textContent, '已改過');
  assert.equal(row(ctx, 'autoPlant').mark.textContent, '');
});

test('在視窗改設定：勾選框、數字、選單、島編號、機器勾選都立刻生效並存起來', () => {
  const { ctx, storage } = withStorage({});
  openPanel(ctx);
  setBox(ctx, 'autoSell', false);
  assert.equal(ctx.t.CONFIG.autoSell, false);
  setNum(ctx, 'tickMs', '900');
  assert.equal(ctx.t.CONFIG.tickMs, 900);
  const sel = row(ctx, 'islandMode');
  sel.input.value = 'current';
  sel.input.dispatch('change');
  assert.equal(ctx.t.CONFIG.islandMode, 'current');
  const isl = row(ctx, 'skipIslands');
  isl.input.value = '3, 2，2';
  isl.input.dispatch('change');
  assert.deepEqual([...ctx.t.CONFIG.skipIslands], [2, 3]);
  const mach = row(ctx, 'loadMachineIds');
  mach.boxes.get('corn_cake_machine').checked = true;
  mach.boxes.get('corn_cake_machine').dispatch('change');
  assert.deepEqual([...ctx.t.CONFIG.loadMachineIds].sort(), ['compost_bin', 'corn_cake_machine', 'fish_feed_machine']);
  assert.deepEqual(stored(storage), {
    autoSell: false, tickMs: 900, islandMode: 'current', skipIslands: [2, 3],
    loadMachineIds: ['compost_bin', 'fish_feed_machine', 'corn_cake_machine'],
  });
  assert.equal(row(ctx, 'tickMs').mark.textContent, '已改過');
});

test('輸入不合的值：顯示原因、控制項放回原本的值、CONFIG 和存檔都不變', () => {
  const { ctx, storage } = withStorage({});
  openPanel(ctx);
  const r = setNum(ctx, 'tickMs', '5');
  assert.match(r.msg.textContent, /要在 200 ～ 5000 之間/);
  assert.equal(r.input.value, '400', '放回目前的值');
  assert.equal(ctx.t.CONFIG.tickMs, 400);
  assert.equal(storage.m.has(KEY), false);
  const r2 = setNum(ctx, 'maxActionsPerTick', '2.5');
  assert.match(r2.msg.textContent, /要是整數/);
  const r3 = setNum(ctx, 'tickMs', '');
  assert.match(r3.msg.textContent, /要是整數/, '空白對一般整數是錯誤');
  setNum(ctx, 'tickMs', '600');
  assert.equal(r.msg.textContent, '', '改成合法的值後錯誤訊息消失');
  const isl = row(ctx, 'skipIslands');
  isl.input.value = '0, a';
  isl.input.dispatch('change');
  assert.match(isl.msg.textContent, /編號要是 1 ～ 99/);
  const pf = setNum(ctx, 'petFoodTargetPerPet', '2');
  assert.match(pf.msg.textContent, /不能小於低水位/);
  assert.equal(ctx.t.CONFIG.petFoodTargetPerPet, 10);
});

test('可空的參數（澆到幾級為止）：空白＝null＝澆到滿；填數字就是那一級', () => {
  const { ctx } = withStorage({});
  openPanel(ctx);
  setNum(ctx, 'waterUpTo', '3');
  assert.equal(ctx.t.CONFIG.waterUpTo, 3);
  setNum(ctx, 'waterUpTo', '');
  assert.equal(ctx.t.CONFIG.waterUpTo, null);
  const bad = setNum(ctx, 'waterUpTo', '0');
  assert.match(bad.msg.textContent, /要在 1 ～ 4 之間/);
});

test('每一列的 ↺ 恢復預設；「全部恢復預設」要按兩次才會真的做', () => {
  const { ctx, storage } = withStorage({});
  const p = openPanel(ctx);
  setBox(ctx, 'autoSell', false);
  setNum(ctx, 'tickMs', '700');
  row(ctx, 'autoSell').reset.click();
  assert.equal(ctx.t.CONFIG.autoSell, true);
  assert.equal(row(ctx, 'autoSell').input.checked, true);
  assert.deepEqual(stored(storage), { tickMs: 700 });
  const all = p.findAll((e) => e.textContent === '全部恢復預設')[0];
  all.click();
  assert.equal(all.textContent, '再按一次確認');
  assert.equal(ctx.t.CONFIG.tickMs, 700, '第一次按只是「準備」，還沒做');
  all.click();
  assert.equal(ctx.t.CONFIG.tickMs, 400);
  assert.equal(storage.m.has(KEY), false);
  assert.equal(all.textContent, '全部恢復預設');
  assert.equal(row(ctx, 'tickMs').mark.textContent, '');
});

test('寫不進儲存空間（私密視窗、額度滿）：視窗提示「只在這次載入有效」，設定仍然生效', () => {
  const { ctx } = withStorage({}, { throwOnSet: true });
  const p = openPanel(ctx);
  setBox(ctx, 'autoSell', false);
  assert.equal(ctx.t.CONFIG.autoSell, false);
  const notes = p.findAll((e) => /寫不進瀏覽器儲存空間/.test(e.textContent));
  assert.equal(notes.length >= 1, true);
});

test('Alt+Shift+F 切島嶼模式時，開著的視窗裡的選單跟著變；視窗只顯示、不把暫時的切換存起來', () => {
  const { ctx, storage } = withStorage({});
  openPanel(ctx);
  ctx.env.key('KeyF');
  assert.equal(row(ctx, 'islandMode').input.value, 'current');
  assert.equal(row(ctx, 'islandMode').mark.textContent, '', '暫時的切換不算「改過」');
  assert.equal(storage.log.filter((x) => x[0] !== 'get').length, 0);
});

test('設定視窗開著時腳本照常工作（不暫停）；沒載入遊戲時也能開（機器清單用預設的）', async () => {
  const ctx = boot({ tiles: { '0,0': { t: 'weed', v: 0 } }, cap: 100 });
  openPanel(ctx);
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.weed, 1, '視窗開著，雜草照拔');
  const { load } = require('../helpers/harness');
  const e = load();
  e.key('KeyC');
  assert.ok(e.t.settingsPanel, '遊戲還沒載入也開得起來');
  assert.ok(e.t.settingsRows.get('loadMachineIds').boxes.get('compost_bin'));
});

test('視窗內容一律用 textContent 寫入：說明文字裡的角括號不會被當成 HTML', () => {
  const ctx = farm({});
  const p = openPanel(ctx);
  assert.equal(p.findAll(() => true).filter((e) => e.children.length === 0 && /<[a-z]/i.test(e.textContent || '')).length, 0);
  assert.ok(!('innerHTML' in p) || p.innerHTML === undefined);
});

// ───── 診斷、標籤 ─────

test('診斷：只列出「改過的參數名」，不輸出值；沒改過就是空的', () => {
  const { ctx } = withStorage({ [KEY]: JSON.stringify({ autoSell: false, minCoinsAfterPlant: 77 }) });
  const g = ctx.t.describeGame();
  assert.deepEqual([...g.customSettings].sort(), ['autoSell', 'minCoinsAfterPlant']);
  assert.ok(!JSON.stringify(g.customSettings).includes('77'));
  assert.deepEqual([...farm({}).t.describeGame().customSettings], []);
});

test('完整標籤的快速鍵說明包含 C 設定', () => {
  const ctx = farm({});
  assert.match(ctx.t.badge.textContent, /D 診斷／F 島嶼／C 設定/);
});
