'use strict';
// 資安與「已經做過的決定」：原始碼靜態檢查、不在頁面留東西、預設值釘死、選擇器清單與契約一致、每個事件一個回歸測試的總表。
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, readSource } = require('../helpers/harness');
const contract = require('../contract/contract');

// 把註解與字串拿掉後的「純程式碼」，只掃真正會執行的部分
function stripCommentsKeepStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let q = null; // 目前在哪種字串裡
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += d || ''; i += 2; continue; }
      if (c === q) q = null;
      i += 1;
    } else if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i += 1;
    } else if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
    } else {
      if (c === "'" || c === '"' || c === '`') q = c;
      out += c;
      i += 1;
    }
  }
  return out;
}

const code = stripCommentsKeepStrings(readSource());

test('靜態檢查：程式碼裡沒有危險的 API（不改 HTML、不執行字串、不連網、不碰儲存空間、不用 GM_ 權限）', () => {
  const banned = [
    'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'Function(',
    'setTimeout("', "setTimeout('", 'GM_', 'GM.', 'unsafeWindow', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource',
    'sendBeacon', 'navigator.sendBeacon', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.',
    'importScripts', 'window.open', 'postMessage', 'location.href =', 'location.assign', 'location.replace', 'import(',
    'Worker(', 'ServiceWorker', 'serviceWorker', 'atob(', 'btoa(',
  ];
  for (const b of banned) assert.ok(!code.includes(b), '程式碼裡不該出現：' + b);
});

test('靜態檢查：唯一碰儲存空間的地方是設定視窗存取「自己的一個鍵」——不讀、不寫遊戲自己的存檔', () => {
  // 2026-11-17 使用者決定：設定視窗改過的值存在瀏覽器（localStorage），這是腳本唯一碰儲存空間的地方
  const uses = code.match(/localStorage/g) || [];
  const calls = code.match(/window\.localStorage\.(getItem|setItem|removeItem)\(/g) || [];
  assert.equal(uses.length, 3, 'localStorage 只出現在讀、寫、清除那三個呼叫');
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.split('.')[2].replace('(', '')).sort(), ['getItem', 'removeItem', 'setItem']);
  assert.match(code, /window\.localStorage\.getItem\(SETTINGS_KEY\)/);
  assert.match(code, /window\.localStorage\.setItem\(SETTINGS_KEY,/);
  assert.match(code, /window\.localStorage\.removeItem\(SETTINGS_KEY\)/);
  assert.match(code, /const SETTINGS_KEY = 'skyfarm-auto-settings';/);
  assert.ok(!/localStorage\[|localStorage\.key|localStorage\.clear|localStorage\.length/.test(code), '不枚舉、不清空整個儲存空間');
  assert.ok(!/Object\.keys\(window\.localStorage|for \(.* in window\.localStorage/.test(code));
  // 這三個呼叫都在 try 裡面（儲存空間被封鎖時連讀取屬性都會丟錯）
  for (const fn of ['readStored', 'writeStored']) {
    const m = new RegExp('function ' + fn + '\\(\\) \\{\\s*try \\{').exec(code);
    assert.ok(m, fn + ' 一定要 try 起來');
  }
});

test('靜態檢查：只能對遊戲網站執行（@match 在載入器；腳本本身不含網址比對以外的外連）', () => {
  const urls = code.match(/https?:\/\/[^\s'"`)]+/g) || [];
  assert.deepEqual(urls, [], '程式碼裡不該有任何網址字面值：' + urls.join(', '));
});

test('靜態檢查：絕不碰花錢的選項——程式碼裡沒有農藥、化肥、有機肥、升級機器、賣出遊戲物件的字串', () => {
  for (const s of ['pesticide', "'chem'", '"chem"', 'upgrade', 'sellBase', 'shovel', "'remove'", "'store'", 'buy(', 'purchase']) {
    assert.ok(!code.includes(s), '程式碼裡不該出現：' + s);
  }
  assert.ok(code.includes("'catch'"), '照顧工具只用 catch');
});

test('靜態檢查：機器小選單只會按我們指定的按鈕（collect / load），不會有寫死的 upgrade', () => {
  const m = code.match(/data-m61="/g) || [];
  assert.equal(m.length, 1, '只有一處組出 data-m61 選擇器，值由呼叫端傳入');
  const wants = code.match(/(?<!function )settlePopup\(g, k, [^;]*\);/g) || [];
  assert.equal(wants.length, 1, '只有一處呼叫，按鈕由工作種類決定');
  assert.match(wants[0], /'collect'.*'load'.*'feed'/);
});

test('不在頁面上留下東西：window 只多一個「已載入」旗標，沒有任何物件或函式', () => {
  const e = load({ shim: false });
  const added = Object.getOwnPropertyNames(e.win).filter((k) => !e.keysBefore.has(k));
  assert.deepEqual(added, ['__SkyFarmAuto_loaded__']);
  assert.equal(e.win.__SkyFarmAuto_loaded__, true);
  assert.equal(typeof e.win.__SkyFarmAuto_loaded__, 'boolean');
});

test('只註冊一個 window 事件：keydown（捕獲階段）；沒有 document 層級的全域監聽', () => {
  const e = load({ shim: false });
  assert.deepEqual(Object.keys(e.listeners), ['keydown']);
  assert.equal(e.listeners.keydown.length, 1);
  assert.equal(e.listeners.keydown[0].capture, true, '捕獲階段最先處理，才能擋下遊戲自己的快速鍵');
  assert.deepEqual(Object.keys(e.doc.listeners), [], '有 body 時不需要 DOMContentLoaded');
});

test('重複注入不會重複掛事件（已載入旗標）', () => {
  const e = load({ shim: false });
  const { load: load2 } = require('../helpers/harness');
  assert.equal(e.listeners.keydown.length, 1);
  assert.ok(load2);
});

test('只寫入自己建立的元素：用 textContent，標籤與面板的內容不會被當成 HTML', () => {
  const e = load();
  e.t.setNote('<img src=x onerror=alert(1)>', 1000);
  assert.ok(e.t.badge.textContent.includes('<img'));
  assert.equal(e.t.badge.children.length, 0, '沒有任何子元素被「解析」出來');
});

test('釘住的使用者決定：預設值', () => {
  const C = load().t.CONFIG;
  // 快速鍵
  assert.deepEqual({ ...C.toggleKey }, { code: 'KeyA', alt: true, shift: true, ctrl: false });
  assert.deepEqual({ ...C.cropKey }, { code: 'KeyS', alt: true, shift: true, ctrl: false });
  assert.deepEqual({ ...C.probeKey }, { code: 'KeyD', alt: true, shift: true, ctrl: false });
  // 節奏
  assert.equal(C.tickMs, 400);
  assert.equal(C.maxActionsPerTick, 3);
  // 預設開啟的自動功能
  for (const k of ['autoHarvest', 'autoPlant', 'autoSell', 'autoPickPoop', 'autoCollectAnimalProducts', 'autoFeedAnimals',
    'autoClearDebris', 'autoClearWeeds', 'autoStraighten', 'autoHarvestTrees', 'autoHarvestFish', 'autoCollectMachines',
    'autoCatchPests', 'catchPestsOnOtherCrops', 'autoWater', 'sellWhenCantPlant',
    // 2026-11-14 使用者要求：作物、動物、果樹、任何成熟可以點的，都一併收成
    'autoHarvestMeatAnimals', 'autoCollectHoney', 'harvestOtherCrops']) {
    assert.equal(C[k], true, k + ' 預設開啟');
  }
  assert.equal(C.otherCropsKeepFree, 10, '其他作物不會自動賣，收完要保留空位給設定作物');
  // 使用者決定維持關閉的（會動用資源）
  for (const k of ['autoWaterTrees', 'autoFeedFish', 'autoLoadMachines']) assert.equal(C[k], false, k + ' 使用者決定先維持關閉');
  assert.equal(C.handleOtherCrops, false, '其他作物只收成，不澆水（handleOtherCrops 才會也澆水）');
  // 使用者決定開啟的補買飼料，與它的保護
  assert.equal(C.buyFeedWhenShort, true);
  assert.equal(C.minCoinsAfterBuyFeed, 100);
  // 門檻與上限
  assert.equal(C.minCoinsAfterPlant, 0);
  assert.equal(C.sellWhenFreeAtMost, 5);
  assert.equal(C.sellRetryMs, 30000);
  assert.equal(C.weedKeepFree, 30);
  assert.equal(C.weedMaxStock, undefined, '雜草在倉庫裡沒有數量上限（2026-11-16 使用者要求移除）');
  assert.equal(C.sellWeedsWithCrops, true, '賣出設定的作物時，倉庫裡的雜草一併賣掉（2026-11-16 使用者要求）');
  assert.equal(C.machineMaxStock, 100);
  assert.deepEqual([...C.loadMachineIds], ['compost_bin', 'fish_feed_machine'], '玉米餅機不在投料白名單');
  assert.equal(C.waterBelow, 1);
  assert.equal(C.waterUpTo, null);
});

test('賣出範圍：只賣設定的作物（含有機版）——蛋、奶、糞便、魚、水果、雜草都不在賣出清單裡', () => {
  const e = load();
  e.t.targetCrop = { id: 'wheat', name: '小麥' };
  for (const id of ['egg', 'wool', 'poop', 'tilapia', 'orange', 'weed', 'organic_fert', 'corn_cake', 'fish_feed', 'pasture', 'chicken_meat']) {
    assert.equal(e.t.isSellTarget(id), false, id + ' 不是「設定的作物」');
  }
  assert.equal(e.t.isSellTarget('wheat') && e.t.isSellTarget('org_wheat'), true);
  // 雜草是唯一例外（使用者 2026-11-16 要求：賣作物時一併賣掉雜草），而且只認 weed 這一個代號
  assert.equal(e.t.isSellWeed('weed'), true);
  for (const id of ['egg', 'wool', 'poop', 'tilapia', 'orange', 'organic_fert', 'corn_cake', 'wheat', 'org_wheat', 'weedball', 'org_weed', 'weeds', '']) {
    assert.equal(e.t.isSellWeed(id), false, id + ' 不能被當成雜草賣掉');
  }
  e.t.CONFIG.sellWeedsWithCrops = false;
  assert.equal(e.t.isSellWeed('weed'), false, '關掉 sellWeedsWithCrops 就不賣雜草');
});

test('選擇器清單：腳本實際用到的每個 id 與選擇器都有登記在契約裡，而且契約沒有多餘的項目', () => {
  const src = code;
  const prefixes = new Set([...src.matchAll(/querySelector(?:All)?\(\s*'([^']*)'/g)].map((m) => m[1]));
  const ids = new Set([...src.matchAll(/(?:\$|getElementById)\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
  ids.delete('skyfarm-auto-badge');
  const declaredPrefixes = new Set(contract.selectors.map((s) => s.prefix));
  const declaredIds = new Set(contract.ids.map((i) => i.id));
  for (const p of prefixes) assert.ok(declaredPrefixes.has(p), '腳本用了契約沒登記的選擇器：' + p);
  for (const p of declaredPrefixes) assert.ok(prefixes.has(p), '契約登記了腳本已經不用的選擇器：' + p);
  for (const i of ids) assert.ok(declaredIds.has(i), '腳本用了契約沒登記的 id：' + i);
  for (const i of declaredIds) assert.ok(ids.has(i), '契約登記了腳本已經不用的 id：' + i);
});

test('腳本實際查詢過的選擇器（跑完整個流程後）都在契約清單內', async () => {
  const { boot, soil, ripe, step } = require('../helpers/boot');
  const { makeCfg } = require('../helpers/fixture-config');
  const cfg = makeCfg();
  const ctx = boot({
    tiles: {
      '0,0': soil({ crop: ripe('wheat', cfg) }),
      '1,0': { t: 'animal', id: 'egg_hen', stage: 2, timer: 0, cycles: 3, stack: 0 },
      '2,0': { t: 'machine', id: 'compost_bin', state: 'idle', out: 1 },
      '3,0': soil({ crop: { id: 'wheat', prog: 1, pest: true } }),
    },
    cap: 20, inv: { wheat: 18, corn_cake: 3 }, edgeFence: ['1,0'],
  });
  for (let i = 0; i < 14; i++) await step(ctx);
  const allowed = contract.selectors.map((s) => s.prefix);
  for (const sel of ctx.doc.queried) {
    assert.ok(allowed.some((p) => sel.startsWith(p)), '腳本查詢了契約沒登記的選擇器：' + sel);
  }
  assert.ok(ctx.doc.queried.size >= 8, '流程有走到足夠多的畫面操作');
});
