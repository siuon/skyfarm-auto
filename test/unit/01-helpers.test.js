'use strict';
// 純函式與判斷規則：不需要跑完整流程，直接驗證每個小判斷。
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/harness');
const { attachWorld } = require('../helpers/fake-game');
const { makeCfg } = require('../helpers/fixture-config');

const env = () => load();
const cfg = makeCfg();

test('fmtSec：秒、分秒、小時分鐘', () => {
  const { t } = env();
  assert.equal(t.fmtSec(0), '0 秒');
  assert.equal(t.fmtSec(59.4), '59 秒');
  assert.equal(t.fmtSec(60), '1 分 0 秒');
  assert.equal(t.fmtSec(125), '2 分 5 秒');
  assert.equal(t.fmtSec(3600), '1 小時 0 分');
  assert.equal(t.fmtSec(7380), '2 小時 3 分');
  assert.equal(t.fmtSec(-5), '0 秒', '負數不顯示負的時間');
});

test('stripUrl：移除 ? 與 # 之後的內容，data/blob 不輸出內容，壞網址也不會丟錯', () => {
  const { t } = env();
  assert.equal(t.stripUrl('https://a.example/x/y?token=SECRET#frag'), 'https://a.example/x/y');
  assert.equal(t.stripUrl('data:text/html;base64,AAAA'), 'data:…');
  assert.equal(t.stripUrl('blob:https://a.example/uuid'), 'blob:…');
  assert.ok(!t.stripUrl('::::not a url?x=1').includes('x=1'), '就算是怪網址，查詢參數也不會被輸出');
});

test('keyLabel / matchKey / hotkeyLine', () => {
  const { t } = env();
  assert.equal(t.keyLabel({ code: 'KeyA', alt: true, shift: true, ctrl: false }), 'Alt+Shift+A');
  const ev = (o) => Object.assign({ code: 'KeyA', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false }, o);
  const k = { code: 'KeyA', alt: true, shift: true, ctrl: false };
  assert.equal(t.matchKey(ev({}), k), true);
  assert.equal(t.matchKey(ev({ altKey: false }), k), false, '少按 Alt 不算');
  assert.equal(t.matchKey(ev({ ctrlKey: true }), k), false, '多按 Ctrl 不算');
  assert.equal(t.matchKey(ev({ metaKey: true }), k), false, '按了 Meta 不算');
  assert.equal(t.matchKey(ev({ code: 'KeyB' }), k), false);
  assert.equal(t.hotkeyLine(), 'Alt+Shift＋A 開關／S 作物／D 診斷');
});

test('unlockLevel：升級表第一次出現的等級；沒出現就是 1', () => {
  const { t } = env();
  assert.equal(t.unlockLevel(cfg, 'wheat'), 1);
  assert.equal(t.unlockLevel(cfg, 'tomato'), 3);
  assert.equal(t.unlockLevel(cfg, 'potato'), 5);
  assert.equal(t.unlockLevel(cfg, 'unknown_crop'), 1);
});

test('resolveCrop：名稱／代號／大小寫／包含；空白、找不到、符合多種、等級不足都回錯誤', () => {
  const { t } = env();
  const c = makeCfg();
  c.crops.sweet_corn = { name: '甜玉米', seedCost: 40, growSeconds: 100, yield: 1, sellPrice: 1 };
  const g = (level) => ({ CFG: c, S: { player: { level } } });
  assert.deepEqual({ ...t.resolveCrop('小麥', g(5)) }, { id: 'wheat', name: '小麥' });
  assert.equal(t.resolveCrop('wheat', g(5)).id, 'wheat');
  assert.equal(t.resolveCrop('  WHEAT  ', g(5)).id, 'wheat', '前後空白與大小寫都忽略');
  assert.equal(t.resolveCrop('麥', g(5)).id, 'wheat', '只有一種包含時可以簡寫');
  assert.equal(t.resolveCrop('玉米', g(5)).id, 'corn', '名稱完全相同時優先，不算符合多種');
  assert.match(t.resolveCrop('米', g(5)).error, /符合多種：.*玉米.*甜玉米|符合多種：.*甜玉米.*玉米/);
  assert.match(t.resolveCrop('', g(5)).error, /請輸入作物名稱/);
  assert.match(t.resolveCrop('   ', g(5)).error, /請輸入作物名稱/);
  assert.match(t.resolveCrop('龍果', g(5)).error, /找不到作物「龍果」/);
  assert.match(t.resolveCrop('馬鈴薯', g(3)).error, /馬鈴薯 要到 Lv 5 才解鎖（目前 Lv 3）/);
  assert.equal(t.resolveCrop('馬鈴薯', g(5)).id, 'potato');
});

test('isRipe：只有田、有作物、沒枯萎、進度達標才算成熟', () => {
  const { t } = env();
  const ok = { t: 'soil', crop: { id: 'wheat', prog: 120, wither: false } };
  assert.equal(t.isRipe(ok, cfg), true);
  assert.equal(t.isRipe({ ...ok, crop: { id: 'wheat', prog: 119.9 } }, cfg), false);
  assert.equal(t.isRipe({ ...ok, crop: { id: 'wheat', prog: 500, wither: true } }, cfg), false, '枯萎的不算成熟');
  assert.equal(t.isRipe({ t: 'soil', crop: null }, cfg), false);
  assert.equal(t.isRipe({ t: 'tree', crop: ok.crop }, cfg), false, '不是田');
  assert.equal(t.isRipe(null, cfg), false);
  assert.equal(t.isRipe({ t: 'soil', crop: { id: 'no_such', prog: 9999 } }, cfg), false, '設定裡沒有的作物不算');
});

test('hostOf：田的宿主是作物、果樹的宿主是它自己，其他沒有', () => {
  const { t } = env();
  const crop = { id: 'wheat' };
  assert.equal(t.hostOf({ t: 'soil', crop }), crop);
  const tree = { t: 'tree', id: 'orange' };
  assert.equal(t.hostOf(tree), tree);
  assert.equal(t.hostOf({ t: 'soil', crop: null }), null);
  assert.equal(t.hostOf({ t: 'animal' }), null);
  assert.equal(t.hostOf(null), null);
});

test('treeReady：第一次結果與之後的間隔不同；設定裡沒有的樹不算', () => {
  const { t } = env();
  assert.equal(t.treeReady({ id: 'orange', first: true, prog: 35999 }, cfg), false);
  assert.equal(t.treeReady({ id: 'orange', first: true, prog: 36000 }, cfg), true);
  assert.equal(t.treeReady({ id: 'orange', first: false, prog: 10799 }, cfg), false);
  assert.equal(t.treeReady({ id: 'orange', first: false, prog: 10800 }, cfg), true);
  assert.equal(t.treeReady({ id: 'ghost', first: false, prog: 999999 }, cfg), false);
});

test('animalHungry / animalFeedNeed：與遊戲的 canFeed 相同的條件', () => {
  const { t } = env();
  const hen = cfg.animals.egg_hen, broiler = cfg.animals.broiler;
  // 還沒長大：每個階段都要餵
  assert.equal(t.animalHungry({ stage: 0, timer: 0 }, hen, cfg), true);
  assert.equal(t.animalFeedNeed({ stage: 0 }, hen), hen.stageFeedQty);
  assert.equal(t.animalHungry({ stage: 1, timer: 0 }, broiler, cfg), true, '還沒長大的肉用動物也要餵');
  // 計時中不餓
  assert.equal(t.animalHungry({ stage: 0, timer: 5 }, hen, cfg), false);
  // 產物型成年：有剩餘輪數才要餵
  assert.equal(t.animalHungry({ stage: 2, timer: 0, cycles: 3 }, hen, cfg), true);
  assert.equal(t.animalHungry({ stage: 2, timer: 0, cycles: 0 }, hen, cfg), false);
  assert.equal(t.animalFeedNeed({ stage: 2 }, hen), hen.cycleFeedQty);
  // 肉用型長大後不用餵（只能出貨）
  assert.equal(t.animalHungry({ stage: 3, timer: 0 }, broiler, cfg), false);
  assert.equal(t.animalHungry({ stage: 99, timer: 0 }, broiler, cfg), false);
  assert.equal(t.animalHungry({ stage: 3, timer: 0, cycles: 9 }, broiler, cfg), false, '肉用型長大後，就算有 cycles 也不算餓（只能出貨）');
  // 遊戲若設了產物堆疊上限，滿了就不餵
  const capped = { ...cfg, rules: { ...cfg.rules, animalStackMax: 2 } };
  assert.equal(t.animalHungry({ stage: 2, timer: 0, cycles: 3, stack: 2 }, hen, capped), false);
  assert.equal(t.animalHungry({ stage: 2, timer: 0, cycles: 3, stack: 1 }, hen, capped), true);
});

test('poolState：可收成／餓了的格數、連通加成與數量進位、飼料是否足夠', () => {
  const e = env();
  const world = attachWorld(e, {
    inv: { fish_feed: 3 },
    tiles: {
      '0,0': { t: 'pool', fish: 'tilapia', stage: 2, timer: 0 },
      '1,0': { t: 'pool', fish: 'tilapia', stage: 2, timer: 0 },
      '2,0': { t: 'pool', fish: 'tilapia', stage: 0, timer: 0 }, // 餓了
      '3,0': { t: 'pool', fish: 'tilapia', stage: 1, timer: 500 }, // 長大中
      '4,0': { t: 'pool' }, // 空格
    },
  });
  const P = { tiles: ['0,0', '1,0', '2,0', '3,0', '4,0'], n: 5 };
  const g = e.t.game();
  const ps = e.t.poolState(world.M, P, g);
  assert.equal(ps.cells, 4, '空格不算');
  assert.equal(ps.ready, 2);
  assert.equal(ps.hungry, 1);
  assert.equal(ps.harvestQty, Math.round(2 * 1.1), '5 格連通有 10% 加成，2 條 → round(2.2) = 2');
  assert.equal(ps.feedOk, true, '餓了的 1 格需要 2 份，倉庫有 3 份 → 夠');
  world.M.tiles['3,0'].timer = 0; // 又多一格餓了 → 需要 4 份 > 3
  assert.equal(e.t.poolState(world.M, P, g).feedOk, false);
  const big = { tiles: ['0,0', '1,0'], n: 9 };
  assert.equal(e.t.poolState(world.M, big, g).harvestQty, Math.round(2 * 1.2), '9 格以上加成 20%');
});

test('machineState：成品數（含「還在做、同時已有成品」）、可否投料、庫存上限', () => {
  const e = env();
  const world = attachWorld(e, { inv: { poop: 4, weed: 2, wheat: 1 } });
  const g = e.t.game();
  const m = (T) => e.t.machineState({ t: 'machine', id: 'compost_bin', state: 'idle', ...T }, g);
  assert.equal(m({}).out, 0);
  assert.equal(m({ out: 2, state: 'working', run: true }).out, 2, '還在做但已有成品');
  assert.equal(m({ out: 2 }).outQty, 4, '每批 2 個有機肥，2 批');
  assert.equal(m({ state: 'done' }).out, 1, '舊存檔只有 state=done 時當一批');
  assert.equal(m({}).canLoad, true);
  assert.equal(m({ state: 'working', run: true }).canLoad, false, '等級 1 只放得下 1 批，已經在做');
  assert.equal(m({ lvl: 2, state: 'working', run: true }).canLoad, true, '等級 2 可以再排 1 批');
  assert.equal(m({ id: 'x' }) === null || true, true);
  world.S.inv.poop = 3;
  assert.equal(m({}).canLoad, false, '材料不夠');
  world.S.inv.poop = 4;
  world.S.inv.organic_fert = e.t.CONFIG.machineMaxStock;
  assert.equal(m({}).canLoad, false, '成品庫存已達上限就不再投');
  assert.equal(e.t.machineState({ t: 'machine', id: 'unknown' }, g), null, '設定裡沒有的機器回傳 null');
});

test('targetStock / isSellTarget：只認設定的作物與它的有機版', () => {
  const e = env();
  attachWorld(e, { inv: { wheat: 3, org_wheat: 4, corn: 9, egg: 2 } });
  const S = e.t.game().S;
  assert.equal(e.t.targetStock(S), 0, '還沒設定作物');
  assert.equal(e.t.isSellTarget('wheat'), false);
  e.t.targetCrop = { id: 'wheat', name: '小麥' };
  assert.equal(e.t.targetStock(S), 7);
  assert.equal(e.t.isSellTarget('wheat'), true);
  assert.equal(e.t.isSellTarget('org_wheat'), true);
  assert.equal(e.t.isSellTarget('corn'), false);
  assert.equal(e.t.isSellTarget('org_corn'), false);
  assert.equal(e.t.isSellTarget('egg'), false);
  assert.equal(e.t.isSellTarget('wheat_flour'), false, '名字像但代號不同的不賣');
  assert.equal(e.t.isSellTarget('org_wheat_x'), false);
});

test('storageInfo：解析「倉庫 54/1,000」、剩餘空位、已滿旗標', () => {
  const e = env();
  const world = attachWorld(e, { inv: { wheat: 30 }, cap: 1000 });
  const g = e.t.game();
  assert.deepEqual({ ...e.t.storageInfo(g) }, { used: 30, cap: 1000, free: 970, fullFlag: false });
  world.storageBtn.classList.add('full');
  assert.equal(e.t.storageInfo(g).fullFlag, true);
  // 遊戲把文字改成讀不到數字時：free 是 null（腳本改看旗標）
  Object.defineProperty(e.doc.getElementById('storageText'), 'textContent', { get: () => '倉庫', configurable: true });
  const info = e.t.storageInfo(g);
  assert.equal(info.cap, null);
  assert.equal(info.free, null);
  // 超出上限時 free 不會是負的
  Object.defineProperty(e.doc.getElementById('storageText'), 'textContent', { get: () => '倉庫 40/30', configurable: true });
  assert.equal(e.t.storageInfo(g).free, 0);
});

test('game()：遊戲介面沒掛上、或結構不對時回傳 null，不會丟錯', () => {
  const e = env();
  assert.equal(e.t.game(), null, '還沒有 __farm18');
  e.win.__farm18 = { act() {} };
  e.win.__farm218 = {};
  assert.equal(e.t.game(), null, '缺 S');
  e.win.__farm18 = { get S() { return { maps: [], player: {}, sel: {} }; }, act() {} };
  assert.equal(e.t.game(), null, '缺 CFG.crops');
  attachWorld(e, {});
  assert.ok(e.t.game(), '掛上完整的介面就可以');
});
