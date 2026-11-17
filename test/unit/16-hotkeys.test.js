'use strict';
// 設定視窗的齒輪按鈕與「快速鍵可以在視窗裡改」（使用者 2026-11-17：Alt+Shift+C 被其他套件占用，
// 設定視窗開不起來——所以加一個不靠快速鍵的「⚙」按鈕，並讓快速鍵可以自己改，預設改成 Alt+Shift+G）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, step } = require('../helpers/boot');
const { makeStorage } = require('../helpers/harness');

const KEY = 'skyfarm-auto-settings';
const farm = (o = {}, cfg = {}) => boot(o, Object.assign({ enable: false }, cfg));
const withStorage = (initial, o = {}, cfg = {}) => {
  const storage = makeStorage(initial);
  const ctx = farm(o, Object.assign({ loadOpts: { storage } }, cfg));
  return { ctx, storage };
};
const stored = (storage) => (storage.m.has(KEY) ? JSON.parse(storage.m.get(KEY)) : null);
const row = (ctx, key) => ctx.t.settingsRows.get(key);
const openPanel = (ctx) => { ctx.env.key('KeyG'); return ctx.t.settingsPanel; };
const gear = (ctx) => ctx.doc.getElementById('skyfarm-auto-gear');
// 按下一個真實按鍵（預設 Alt+Shift）；code 是實體按鍵
const press = (ctx, code, extra = {}) => ctx.env.press(Object.assign({ code, altKey: true, shiftKey: true }, extra));
const asObj = (k) => ({ code: k.code, alt: k.alt, shift: k.shift, ctrl: k.ctrl });

// ───── 預設與驗證 ─────

test('設定視窗的預設快速鍵是 Alt+Shift+G（Alt+Shift+C 會和使用者的其他套件衝突）', () => {
  const { t } = farm({});
  assert.deepEqual({ ...t.CONFIG.configKey }, { code: 'KeyG', alt: true, shift: true, ctrl: false });
  assert.equal(t.hotkeyLine(), 'Alt+Shift＋A 開關／S 作物／D 診斷／F 島嶼／G 設定');
});

test('驗證快速鍵：字母、數字、F1～F12 配 Alt（可加 Shift）；不收單獨按鍵、Ctrl、其他按鍵、格式不對的', () => {
  const { t } = farm({});
  const def = t.SETTING_DEFS.find((d) => d.key === 'configKey');
  const k = (code, alt = true, shift = true, ctrl = false) => ({ code, alt, shift, ctrl });
  for (const v of [k('KeyH'), k('Digit5'), k('F9'), k('KeyA', true, false)]) assert.equal(t.coerceSetting(def, v).ok, true, JSON.stringify(v));
  assert.deepEqual({ ...t.coerceSetting(def, { code: 'KeyH', alt: true, shift: false, ctrl: false, extra: 1 }).value }, k('KeyH', true, false), '多餘的欄位被丟掉');
  for (const v of [
    k('KeyH', false, true), k('KeyH', false, false), k('KeyH', true, true, true), k('Escape'), k('Space'), k('Enter'),
    k('F13'), k('KeyAA'), k('ArrowUp'), k('Tab'), null, 'Alt+H', [], { code: 'KeyH' }, { code: 'KeyH', alt: 1, shift: true, ctrl: false },
  ]) assert.equal(t.coerceSetting(def, v).ok, false, JSON.stringify(v));
});

test('兩個快速鍵不能重複；恢復預設也不能造成重複', () => {
  const { ctx } = withStorage({});
  const t = ctx.t;
  const r = t.applySetting('configKey', { code: 'KeyA', alt: true, shift: true, ctrl: false });
  assert.equal(r.ok, false);
  assert.match(r.why, /和「開關（ON／OFF）」的快速鍵重複/);
  assert.equal(t.CONFIG.configKey.code, 'KeyG');
  assert.equal(t.applySetting('islandKey', { code: 'KeyG', alt: true, shift: true, ctrl: false }).ok, false, '預設的設定視窗鍵也不能被占走');
  // 把設定視窗改成 H，再把「診斷」改成 G：可以（G 空出來了）；然後 ↺ 設定視窗 → 預設 G 已被占用，要擋
  assert.equal(t.applySetting('configKey', { code: 'KeyH', alt: true, shift: true, ctrl: false }).ok, true);
  assert.equal(t.applySetting('probeKey', { code: 'KeyG', alt: true, shift: true, ctrl: false }).ok, true);
  const back = t.resetSetting('configKey');
  assert.equal(back.ok, false);
  assert.match(back.why, /重複/);
  assert.equal(t.CONFIG.configKey.code, 'KeyH');
});

// ───── 保存與載入 ─────

test('改快速鍵：立刻生效、存起來；舊的鍵不再有反應，新的鍵有；標籤上的快速鍵說明跟著變', () => {
  const { ctx, storage } = withStorage({});
  const r = ctx.t.applySetting('configKey', { code: 'KeyH', alt: true, shift: true, ctrl: false });
  assert.equal(r.ok, true);
  assert.deepEqual(stored(storage), { configKey: { code: 'KeyH', alt: true, shift: true, ctrl: false } });
  press(ctx, 'KeyG');
  assert.equal(ctx.t.settingsPanel, null, '舊的鍵沒反應了');
  press(ctx, 'KeyH');
  assert.ok(ctx.t.settingsPanel, '新的鍵開得了視窗');
  assert.match(ctx.t.badge.textContent, /D 診斷／F 島嶼／H 設定/);
  assert.match(gear(ctx).title, /Alt\+Shift\+H/);
});

test('載入：存下來的快速鍵合法就套用；格式不對的忽略；彼此重複的全部回預設', () => {
  let { ctx } = withStorage({ [KEY]: JSON.stringify({ configKey: { code: 'KeyH', alt: true, shift: false, ctrl: false } }) });
  assert.deepEqual(asObj(ctx.t.CONFIG.configKey), { code: 'KeyH', alt: true, shift: false, ctrl: false });
  ({ ctx } = withStorage({ [KEY]: JSON.stringify({ configKey: { code: 'KeyH', alt: false, shift: true, ctrl: false }, probeKey: 'Alt+X' }) }));
  assert.equal(ctx.t.CONFIG.configKey.code, 'KeyG');
  assert.equal(ctx.t.CONFIG.probeKey.code, 'KeyD');
  const same = { code: 'KeyH', alt: true, shift: true, ctrl: false };
  ({ ctx } = withStorage({ [KEY]: JSON.stringify({ configKey: same, islandKey: same, toggleKey: { code: 'KeyZ', alt: true, shift: true, ctrl: false } }) }));
  assert.equal(ctx.t.CONFIG.configKey.code, 'KeyG', '重複：全部快速鍵回預設');
  assert.equal(ctx.t.CONFIG.islandKey.code, 'KeyF');
  assert.equal(ctx.t.CONFIG.toggleKey.code, 'KeyA');
  assert.deepEqual({ ...ctx.t.overrides }, {});
});

// ───── 視窗裡錄快速鍵 ─────

test('視窗的「快速鍵」一組：每個快速鍵一列，顯示目前的組合鍵與「改」鈕', () => {
  const { ctx } = withStorage({});
  openPanel(ctx);
  for (const [key] of ctx.t.HOTKEY_NAMES) {
    assert.ok(row(ctx, key), key);
    assert.equal(row(ctx, key).input.textContent, ctx.t.keyLabel(ctx.t.CONFIG[key]));
    assert.ok(row(ctx, key).change);
  }
  assert.equal(row(ctx, 'toggleKey').input.textContent, 'Alt+Shift+A');
  assert.equal(row(ctx, 'configKey').input.textContent, 'Alt+Shift+G');
});

test('按「改」→ 按下新的組合鍵：套用、存起來、視窗顯示新的組合；錄的那一下不會觸發別的快速鍵', () => {
  const { ctx, storage } = withStorage({});
  openPanel(ctx);
  row(ctx, 'probeKey').change.click();
  assert.match(row(ctx, 'probeKey').input.textContent, /請按新的組合鍵/);
  const ev = press(ctx, 'KeyX'); // Alt+Shift+X
  assert.equal(ev.defaultPrevented, true);
  assert.equal(ev.stopped, true);
  assert.deepEqual(asObj(ctx.t.CONFIG.probeKey), { code: 'KeyX', alt: true, shift: true, ctrl: false });
  assert.equal(row(ctx, 'probeKey').input.textContent, 'Alt+Shift+X');
  assert.equal(row(ctx, 'probeKey').mark.textContent, '已改過');
  assert.deepEqual(stored(storage), { probeKey: { code: 'KeyX', alt: true, shift: true, ctrl: false } });
  assert.equal(ctx.t.hotkeyLine().includes('X 診斷'), true);
  ctx.env.key('KeyD');
  assert.equal(ctx.t.note, '', '舊的診斷鍵沒反應了');
});

test('錄快速鍵時按到現有的快速鍵（例如 Alt+Shift+A）：只當成「要設的組合」，不會觸發開關；重複的被擋並顯示原因', () => {
  const { ctx } = withStorage({});
  openPanel(ctx);
  row(ctx, 'probeKey').change.click();
  press(ctx, 'KeyA');
  assert.equal(ctx.t.enabled, false, '沒有被當成開關鍵');
  assert.match(row(ctx, 'probeKey').msg.textContent, /和「開關（ON／OFF）」的快速鍵重複/);
  assert.equal(ctx.t.CONFIG.probeKey.code, 'KeyD');
  assert.equal(row(ctx, 'probeKey').input.textContent, 'Alt+Shift+D', '錄製結束，顯示原本的');
});

test('錄快速鍵：單獨按 Alt／Shift／Ctrl 不結束（繼續等）；Esc 取消；沒有 Alt、含 Ctrl、含 Win 的組合被擋', () => {
  const { ctx } = withStorage({});
  openPanel(ctx);
  const start = () => row(ctx, 'probeKey').change.click();
  start();
  press(ctx, 'AltLeft');
  press(ctx, 'ShiftLeft');
  press(ctx, 'ControlLeft', { ctrlKey: true });
  assert.match(row(ctx, 'probeKey').input.textContent, /請按新的組合鍵/, '只按修飾鍵：還在等');
  press(ctx, 'Escape', { altKey: false, shiftKey: false });
  assert.equal(row(ctx, 'probeKey').input.textContent, 'Alt+Shift+D', 'Esc 取消');
  assert.equal(row(ctx, 'probeKey').msg.textContent, '', 'Esc 只是取消，不會顯示「格式不對」之類的錯誤');
  assert.equal(ctx.t.CONFIG.probeKey.code, 'KeyD');
  start();
  press(ctx, 'KeyX', { altKey: false });
  assert.match(row(ctx, 'probeKey').msg.textContent, /要同時按住 Alt/);
  start();
  press(ctx, 'KeyX', { ctrlKey: true });
  assert.match(row(ctx, 'probeKey').msg.textContent, /不能含 Ctrl/);
  start();
  press(ctx, 'KeyX', { metaKey: true });
  assert.match(row(ctx, 'probeKey').msg.textContent, /不能含 Win／Cmd/);
  start();
  press(ctx, 'Space');
  assert.match(row(ctx, 'probeKey').msg.textContent, /只能是字母、數字或 F1～F12/);
  assert.equal(ctx.t.CONFIG.probeKey.code, 'KeyD', '都沒改成');
  assert.equal(ctx.t.hotkeyCapture, null, '錄製已結束');
});

test('錄快速鍵 10 秒沒按就自動取消；關掉視窗也會取消（之後按鍵恢復正常）', async () => {
  const { ctx } = withStorage({});
  openPanel(ctx);
  row(ctx, 'probeKey').change.click();
  await ctx.clock.advance(10100);
  assert.equal(row(ctx, 'probeKey').input.textContent, 'Alt+Shift+D', '逾時取消');
  row(ctx, 'probeKey').change.click();
  ctx.t.closeSettingsPanel();
  press(ctx, 'KeyA'); // 如果還在錄，這一下會被吃掉；取消了就會正常開關
  assert.equal(ctx.t.enabled, true, '關視窗後快速鍵恢復正常');
});

test('錄到一半又按另一列的「改」：改成錄那一列；↺ 把快速鍵恢復預設', () => {
  const { ctx, storage } = withStorage({});
  openPanel(ctx);
  row(ctx, 'probeKey').change.click();
  row(ctx, 'cropKey').change.click();
  assert.equal(row(ctx, 'probeKey').input.textContent, 'Alt+Shift+D', '上一列不再等');
  assert.match(row(ctx, 'cropKey').input.textContent, /請按新的組合鍵/);
  press(ctx, 'KeyX');
  assert.equal(ctx.t.CONFIG.cropKey.code, 'KeyX');
  row(ctx, 'cropKey').reset.click();
  assert.equal(ctx.t.CONFIG.cropKey.code, 'KeyS');
  assert.equal(storage.m.has(KEY), false);
});

test('「全部恢復預設」也把快速鍵恢復預設', () => {
  const { ctx } = withStorage({});
  ctx.t.applySetting('configKey', { code: 'KeyH', alt: true, shift: true, ctrl: false });
  ctx.t.applySetting('toggleKey', { code: 'KeyX', alt: true, shift: false, ctrl: false });
  ctx.t.resetAllSettings();
  assert.equal(ctx.t.CONFIG.configKey.code, 'KeyG');
  assert.equal(ctx.t.CONFIG.toggleKey.code, 'KeyA');
  assert.equal(ctx.t.CONFIG.toggleKey.shift, true);
});

test('只接受使用者真實按鍵：合成的按鍵事件（isTrusted = false）不會被錄成快速鍵，也不會結束錄製', () => {
  const { ctx } = withStorage({});
  openPanel(ctx);
  row(ctx, 'probeKey').change.click();
  const ev = press(ctx, 'KeyX', { isTrusted: false });
  assert.equal(ev.defaultPrevented, false);
  assert.equal(ctx.t.CONFIG.probeKey.code, 'KeyD');
  assert.match(row(ctx, 'probeKey').input.textContent, /請按新的組合鍵/, '還在等真人按');
});

// ───── 齒輪按鈕 ─────

test('標籤旁有「⚙」按鈕：沒有快速鍵也能用滑鼠開關設定視窗；腳本 OFF 時也在', () => {
  const ctx = farm({});
  const g = gear(ctx);
  assert.ok(g, '載入後就有齒輪');
  assert.equal(g.textContent, '⚙');
  assert.match(g.title, /設定視窗（Alt\+Shift\+G）/);
  assert.equal(ctx.t.enabled, false);
  g.click();
  assert.ok(ctx.t.settingsPanel, '點齒輪開視窗');
  g.click();
  assert.equal(ctx.t.settingsPanel, null, '再點一次關閉');
});

test('齒輪跟著標籤走（標籤寬度變了就換位置），縮成小方格時也還在', () => {
  const ctx = farm({});
  ctx.t.badge.offsetWidth = 300;
  ctx.t.renderBadge(false);
  assert.equal(gear(ctx).style.right, '314px');
  ctx.t.badge.click(); // 縮成小方格
  ctx.t.badge.offsetWidth = 52;
  ctx.t.renderBadge(false);
  assert.equal(gear(ctx).style.right, '66px');
  assert.ok(gear(ctx));
});

test('就算快速鍵設成了被占用的組合（網頁收不到），齒輪仍然開得了視窗，並能改回來', () => {
  const { ctx } = withStorage({});
  ctx.t.applySetting('configKey', { code: 'KeyC', alt: true, shift: true, ctrl: false });
  gear(ctx).click();
  assert.ok(ctx.t.settingsPanel);
  row(ctx, 'configKey').change.click();
  press(ctx, 'KeyJ');
  assert.equal(ctx.t.CONFIG.configKey.code, 'KeyJ');
  assert.equal(ctx.t.settingsPanel !== null, true);
});

test('齒輪只用 textContent、不新增 window 屬性；設定視窗開著時腳本照常工作', async () => {
  const ctx = boot({ tiles: { '0,0': { t: 'weed', v: 0 } }, cap: 100 });
  gear(ctx).click();
  for (let i = 0; i < 4; i++) await step(ctx);
  assert.equal(ctx.world.S.inv.weed, 1);
  const { load } = require('../helpers/harness');
  const e = load({ shim: false });
  const added = Object.getOwnPropertyNames(e.win).filter((k) => !e.keysBefore.has(k));
  assert.deepEqual(added, ['__SkyFarmAuto_loaded__']);
});
