'use strict';
/*
 * 測試執行器：把 skyfarm-auto.js 當成「文字」讀進來，在全新的 vm 沙盒裡執行。
 *   - 腳本本身是一個 IIFE，內部函式與狀態都不對外。測試只在「記憶體裡的副本」結尾插入一段匯出（shim），
 *     不改動磁碟上的檔案（它的 SHA-256 被載入器鎖定，連一個註解都不能動）。
 *   - shim 的錨點必須剛好對到一次，否則直接失敗（腳本結構改了，要同步更新這裡）。
 *   - 時間、計時器、performance 都換成假時鐘，退避與重試間隔不必真的等。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { Clock } = require('./clock');
const { FakeDocument } = require('./fake-dom');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'skyfarm-auto.js');

// 要匯出的內部名稱。名稱在腳本裡不存在的話，載入時會丟 ReferenceError，測試立刻失敗。
const FUNCS = [
  'game', 'storageInfo', 'isModalOpen', 'modalTitle', 'isRipe', 'hostOf', 'treeReady', 'poolState', 'machineState',
  'isAdultAnimal', 'animalHungry', 'animalFeedNeed', 'targetStock', 'fmtSec', 'isSellTarget', 'isSellWeed', 'unlockLevel', 'islandsInfo', 'islandPlan', 'toggleIslandMode',
  'coerceSetting', 'crossCheck', 'loadSettings', 'applySetting', 'resetSetting', 'resetAllSettings', 'fmtSetting',
  'openSettingsPanel', 'closeSettingsPanel', 'toggleSettingsPanel', 'syncSettingsPanel',
  'resolveCrop', 'waitFor', 'sellFlow', 'ensureToolIs', 'prepareTool', 'prepareCareTool', 'animalAway',
  'markAnimalTap', 'settlePopup', 'doFields', 'tick', 'onTick', 'setEnabled', 'setStatus', 'setNote',
  'renderBadge', 'hotkeyLine', 'describeGame', 'runProbe', 'openCropPanel', 'closePanel', 'requestToggle',
  'stripUrl', 'keyLabel', 'matchKey',
];
const CONSTS = ['CONFIG', 'VERSION', 'NAME', 'BADGE_ID', 'PANEL_ID', 'cooldown', 'wetting', 'islandState',
  'SCHEMA', 'SETTING_DEFS', 'DEFAULTS', 'overrides', 'SETTINGS_KEY', 'SETTINGS_PANEL_ID', 'HOTKEY_NAMES', 'settingsRows'];
const STATE = [
  ['enabled', false], ['status', false], ['note', false], ['stats', false], ['badge', false], ['collapsed', true], ['panel', false], ['settingsPanel', false], ['hotkeyCapture', false], ['gearBtn', false],
  ['homeIsland', false], ['expectedCur', false], ['holdUntil', true], ['islandHint', false], ['islandLine', false],
  ['targetCrop', true], ['needSell', true], ['sellBlockedUntil', true], ['lastActionAt', true], ['timer', false],
];

function shimCode() {
  const parts = [];
  for (const n of CONSTS) parts.push(n + ': ' + n);
  for (const n of FUNCS) parts.push(n + ': ' + n);
  for (const [n, writable] of STATE) {
    parts.push('get ' + n + '() { return ' + n + '; }');
    if (writable) parts.push('set ' + n + '(v) { ' + n + ' = v; }');
  }
  return '\n;globalThis.__t = {\n' + parts.join(',\n') + '\n};\n';
}

// 突變測試會用環境變數 SKYFARM_SCRIPT 指向「改壞的副本」，確認測試真的抓得到（見 test/mutation/run.js）
function readSource() {
  return fs.readFileSync(process.env.SKYFARM_SCRIPT || SCRIPT_PATH, 'utf8');
}

function withShim(src) {
  const anchor = '\n})();';
  assert.equal(src.split(anchor).length, 2, '腳本結尾的 })(); 必須剛好出現一次（測試執行器的插入點）');
  assert.ok(src.trimEnd().endsWith('})();'), '腳本必須以 })(); 結尾');
  const idx = src.lastIndexOf(anchor);
  return src.slice(0, idx) + shimCode() + src.slice(idx);
}

/**
 * 載入腳本。
 * @param {object} o
 * @param {string} [o.source]  腳本原始碼（預設讀專案裡的檔案；突變測試會傳入改過的副本）
 * @param {boolean} [o.shim=true]  是否插入匯出（關掉時用來檢查「腳本沒有在 window 上留下東西」）
 * @param {Clock} [o.clock]
 * @param {string} [o.url]
 */
function load(o = {}) {
  const clock = o.clock || new Clock();
  const doc = o.doc || new FakeDocument();
  const logs = [];
  const clip = {
    text: null,
    fail: false,
    async writeText(t) {
      if (this.fail) throw new Error('denied');
      this.text = t;
    },
  };
  const listeners = {};
  const sandbox = Object.assign({}, clock.globals(), {
    document: doc,
    navigator: { clipboard: o.noClipboard ? undefined : clip },
    location: { href: o.url || 'https://phoenixruby.github.io/skyfarm/?token=SECRET#frag' },
    console: {
      log: (...a) => logs.push(a.map(String).join(' ')),
      warn: (...a) => logs.push(a.map(String).join(' ')),
      error: (...a) => logs.push(a.map(String).join(' ')),
    },
    URL,
    addEventListener: (type, fn, capture) => {
      (listeners[type] = listeners[type] || []).push({ fn, capture });
    },
  });
  if (o.storage) sandbox.localStorage = o.storage; // 假的 localStorage（makeStorage）
  if (o.storageBlocked) {
    Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true }); // 私密視窗／封鎖儲存空間時，連讀取屬性都會丟錯
  }
  sandbox.window = sandbox;
  sandbox.top = sandbox;
  vm.createContext(sandbox);
  const keysBefore = new Set(Object.getOwnPropertyNames(sandbox));
  const src = o.shim === false ? (o.source || readSource()) : withShim(o.source || readSource());
  vm.runInContext(src, sandbox, { filename: 'skyfarm-auto.js' });
  const env = {
    win: sandbox,
    doc,
    clock,
    logs,
    clip,
    listeners,
    t: sandbox.__t,
    keysBefore,
    // 送出一個按鍵事件給 window 的 keydown 監聽（預設是使用者真實按鍵）
    press(spec = {}) {
      const ev = Object.assign(
        { type: 'keydown', code: '', key: '', altKey: false, shiftKey: false, ctrlKey: false, metaKey: false,
          isTrusted: true, repeat: false, defaultPrevented: false, stopped: false },
        spec
      );
      ev.preventDefault = () => { ev.defaultPrevented = true; };
      ev.stopImmediatePropagation = () => { ev.stopped = true; };
      ev.stopPropagation = () => {};
      for (const l of listeners.keydown || []) l.fn(ev);
      return ev;
    },
    key(code, extra = {}) {
      return env.press(Object.assign({ code, altKey: true, shiftKey: true }, extra));
    },
  };
  return env;
}

// 假的 localStorage：記錄每一次呼叫（log），可以設定讀取或寫入時丟錯
function makeStorage(initial = {}, opts = {}) {
  const m = new Map(Object.entries(initial));
  const log = [];
  return {
    m,
    log,
    getItem(k) {
      log.push(['get', k]);
      if (opts.throwOnGet) throw new Error('denied');
      return m.has(k) ? m.get(k) : null;
    },
    setItem(k, v) {
      log.push(['set', k, String(v)]);
      if (opts.throwOnSet) throw new Error('quota');
      m.set(k, String(v));
    },
    removeItem(k) {
      log.push(['remove', k]);
      if (opts.throwOnSet) throw new Error('denied');
      m.delete(k);
    },
  };
}

module.exports = { load, readSource, withShim, shimCode, SCRIPT_PATH, FUNCS, CONSTS, makeStorage };
