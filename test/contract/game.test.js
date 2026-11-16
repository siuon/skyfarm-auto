'use strict';
/*
 * 契約測試：對「官方遊戲目前的網頁與設定」確認腳本依賴的東西都還在。
 * 資料來源是 tools/fetch-game.js 下載到 .cache/game/ 的唯讀快取（只當文字／JSON 讀取，不執行）。
 * 這些測試失敗＝官方改版動到了腳本依賴的地方：先看是哪一項，再調整假遊戲、測試與（必要時）腳本。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const contract = require('./contract');

const DIR = path.join(__dirname, '..', '..', '.cache', 'game');
const need = (f) => {
  const p = path.join(DIR, f);
  assert.ok(fs.existsSync(p), '找不到 .cache/game/' + f + '，請先跑 npm run fetch-game');
  return fs.readFileSync(p, 'utf8');
};
const html = need('index.html');
const version = JSON.parse(need('version.json'));
const CFG = JSON.parse(need('game-config.json'));

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

test('官方版號資訊完整，設定檔版本與 version.json 一致', () => {
  assert.match(version.version, /^\d+\.\d+(-[0-9a-f]+)?$/);
  assert.match(version.configVersion, /^\d+\.\d+$/);
  assert.equal(CFG.meta.configVersion, version.configVersion, 'game-config.json 的 meta.configVersion 要等於 version.json');
  assert.ok(isNum(CFG.meta.saveFormatVersion));
  console.log('  官方遊戲版號 ' + version.version + '（config ' + version.configVersion + '，存檔格式 ' + CFG.meta.saveFormatVersion + '）');
});

test('網頁是遊戲本體', () => {
  assert.ok(html.includes('<title>浮島農場 SkyFarm</title>'));
});

for (const { id, game } of contract.ids) {
  test('介面 id「' + id + '」在官方網頁裡', () => {
    for (const g of game) assert.ok(html.includes(g), '官方網頁找不到：' + g);
  });
}

for (const { prefix, game } of contract.selectors) {
  test('選擇器「' + prefix + '」依賴的標記都在', () => {
    for (const g of game) assert.ok(html.includes(g), '官方網頁找不到：' + g);
  });
}

for (const { name, game } of contract.behaviors) {
  test('行為：' + name, () => {
    for (const g of game) assert.ok(html.includes(g), '官方網頁找不到：' + g);
  });
}

test('設定 rules：澆水與動物堆疊上限', () => {
  const R = CFG.rules;
  assert.ok(isNum(R.moistMaxLevel) && R.moistMaxLevel > 0);
  assert.ok(isNum(R.waterPerTap) && R.waterPerTap > 0);
  assert.ok(isNum(R.animalStackMax) && R.animalStackMax >= 0);
});

test('設定 levels：每一級有 level 與 unlocks 陣列（解鎖判斷用）', () => {
  assert.ok(Array.isArray(CFG.levels) && CFG.levels.length > 3);
  for (const L of CFG.levels) {
    assert.ok(isNum(L.level));
    assert.ok(Array.isArray(L.unlocks));
  }
});

test('設定 crops：名稱、種子價、成長秒數、產量、售價', () => {
  const ids = Object.keys(CFG.crops);
  assert.ok(ids.length > 5);
  for (const id of ids) {
    const c = CFG.crops[id];
    assert.equal(typeof c.name, 'string', id);
    assert.ok(isNum(c.seedCost) && c.seedCost >= 0, id + '.seedCost');
    assert.ok(isNum(c.growSeconds) && c.growSeconds > 0, id + '.growSeconds');
    assert.ok(c.yield === undefined || isNum(c.yield), id + '.yield');
    assert.ok(isNum(c.sellPrice), id + '.sellPrice');
    assert.ok(CFG.items[id], '每種作物在 items 裡都要有同名物品：' + id);
    assert.ok(isNum(CFG.items[id].sellPrice), id + ' 物品要有售價');
  }
});

test('設定 items：有機版物品命名是 org_<作物代號>，並用 organicOf 指回作物（賣出判斷靠這個命名）', () => {
  const organic = Object.entries(CFG.items).filter(([, v]) => v.organicOf);
  assert.ok(organic.length > 0, '至少要有一種有機物品');
  for (const [id, v] of organic) {
    assert.equal(id, 'org_' + v.organicOf, id);
    assert.ok(CFG.crops[v.organicOf] || CFG.trees[v.organicOf], id + ' 對應的作物或果樹要存在');
  }
  assert.ok(CFG.items.org_wheat && CFG.items.org_wheat.organicOf === 'wheat');
});

test('設定 trees：第一次結果與之後的結果間隔', () => {
  for (const [id, t] of Object.entries(CFG.trees)) {
    assert.ok(isNum(t.firstFruitSeconds) && t.firstFruitSeconds > 0, id + '.firstFruitSeconds');
    assert.ok(isNum(t.fruitIntervalSeconds) && t.fruitIntervalSeconds > 0, id + '.fruitIntervalSeconds');
    assert.ok(CFG.items[id], '果樹的果實物品要存在：' + id);
  }
});

test('設定 animals：類型只有 producer／meat；餵食與產物欄位齊全', () => {
  for (const [id, a] of Object.entries(CFG.animals)) {
    assert.ok(a.type === 'producer' || a.type === 'meat', id + '.type 只能是 producer 或 meat（腳本靠它決定能不能點）：' + a.type);
    assert.ok(isNum(a.growStages), id + '.growStages');
    assert.ok(isNum(a.stageFeedQty), id + '.stageFeedQty');
    assert.equal(typeof a.feedItem, 'string', id + '.feedItem');
    assert.ok(isNum(CFG.feedShop[a.feedItem]), id + ' 的飼料要有商店價：' + a.feedItem);
    assert.ok(CFG.items[a.productItem], id + ' 的產物物品要存在：' + a.productItem);
    if (a.type === 'producer') {
      assert.ok(isNum(a.cycleFeedQty), id + '.cycleFeedQty');
      assert.ok(isNum(a.cycleSeconds), id + '.cycleSeconds');
      assert.ok(isNum(a.lifespanCycles), id + '.lifespanCycles');
    }
  }
  assert.ok(Object.values(CFG.animals).some((a) => a.type === 'meat'), '遊戲裡有肉用動物（出貨的測試才有意義）');
  for (const [id, a] of Object.entries(CFG.animals)) {
    if (a.type === 'meat') assert.ok(CFG.items[a.productItem], id + ' 出貨的肉要是倉庫物品：' + a.productItem);
  }
});

test('設定 rules：長大的肉用動物放著 2 天會死（所以不收就是損失）', () => {
  assert.ok(isNum(CFG.rules.meatAdultLifespanSeconds) && CFG.rules.meatAdultLifespanSeconds > 0);
});

test('設定 devices 與 bees：蜂箱是 kind=hive 的設備，蜂蜜品項存在於物品表', () => {
  const hives = Object.entries(CFG.devices).filter(([, d]) => d.kind === 'hive');
  assert.ok(hives.length >= 1, '至少有一種蜂箱（腳本靠 kind === hive 認蜂箱）');
  assert.ok(CFG.devices.beehive && CFG.devices.beehive.kind === 'hive');
  assert.equal(CFG.bees.collectTool, 'hand', '蜂蜜用收成（hand）工具收');
  assert.ok(isNum(CFG.bees.storeMax) && CFG.bees.storeMax > 0);
  assert.ok(CFG.items[CFG.bees.wildHoney], '野蜂蜜要是倉庫物品：' + CFG.bees.wildHoney);
  assert.ok(CFG.items.honey_rose, '花蜜品項（honey_*）存在');
});

test('設定 fish 與 fishPool：長大階段、餵食量、連通加成', () => {
  for (const [id, f] of Object.entries(CFG.fish)) {
    assert.ok(isNum(f.stages), id + '.stages');
    assert.ok(isNum(f.stageSeconds), id + '.stageSeconds');
    assert.ok(isNum(f.stageFeedQtyPerTile), id + '.stageFeedQtyPerTile');
    assert.ok(isNum(CFG.feedShop[f.feedItem]), id + ' 的飼料要有商店價');
    assert.ok(CFG.items[id], '魚的物品要存在：' + id);
  }
  assert.ok(Array.isArray(CFG.fishPool.sizeBonus));
  for (const s of CFG.fishPool.sizeBonus) {
    assert.ok(isNum(s.minTiles) && isNum(s.bonus));
  }
});

test('設定 machines 與 machineUpgrade：投入／產出、升級規則', () => {
  for (const [id, m] of Object.entries(CFG.machines)) {
    assert.ok(isObj(m.input) && isObj(m.output), id);
    for (const q of [...Object.values(m.input), ...Object.values(m.output)]) assert.ok(isNum(q) && q > 0, id);
    for (const item of [...Object.keys(m.input), ...Object.keys(m.output)]) assert.ok(CFG.items[item], id + ' 用到的物品要存在：' + item);
  }
  const U = CFG.machineUpgrade;
  assert.ok(isNum(U.maxLevel) && isNum(U.batchesPerLevel));
  assert.ok(Array.isArray(U.appliesTo));
  for (const id of ['compost_bin', 'fish_feed_machine', 'corn_cake_machine']) assert.ok(CFG.machines[id], '機器要存在：' + id);
});

test('設定：糞便與雜草的物品代號、捉蟲的選項與次數', () => {
  assert.equal(CFG.weeds.item, 'weed', '腳本直接用 S.inv.weed 算雜草庫存');
  assert.ok(CFG.items.poop && CFG.items.weed);
  assert.ok(isNum(CFG.items.weed.sellPrice), '雜草有售價，倉庫批次賣出才會給它勾選框（賣作物時一併賣雜草）');
  assert.equal(CFG.items.weed.category, 'material', '雜草在倉庫的「肥料」分類（農產倉庫分頁內）');
  assert.ok(CFG.care.options.catch, '照顧工具要有「捉蟲」選項（id=catch）');
  assert.ok(CFG.care.options.pesticide && CFG.care.options.chem, '農藥與化肥選項還在（腳本用「只選 catch」來避開它們）');
  assert.ok(isNum(CFG.pests.catchTaps) && CFG.pests.catchTaps >= 1);
});

test('設定 consumables 與 robots：耗材欄位、重型機器人手動換、機器人種類的充電樁都存在', () => {
  const parts = CFG.consumables.parts;
  assert.ok(Array.isArray(CFG.consumables.bulkDiscount), '買 5 個 9 折、10 個 8 折（腳本只買 1 個，用不到折扣）');
  for (const [id, P] of Object.entries(parts)) {
    assert.equal(typeof P.name, 'string', id);
    assert.ok(Array.isArray(P.for) && P.for.length > 0, id + '.for');
    assert.ok(isNum(P.price) && P.price > 0, id + '.price（腳本用它核對面板標的價格）');
    for (const k of P.for) assert.ok(CFG.robots.kinds[k] || k === 'sweeper_dock', id + ' 的機器人種類要存在：' + k);
  }
  for (const id of ['saw_chain', 'drill', 'blade']) assert.equal(parts[id].manualSwap, true, id + ' 遊戲要求手動換（腳本替玩家按「換耗材」）');
  for (const id of ['wheel', 'propeller', 'roller', 'brush']) assert.ok(!parts[id].manualSwap, id + ' 倉庫有備品遊戲自己換');
  for (const [k, K] of Object.entries(CFG.robots.kinds)) {
    assert.equal(typeof K.base, 'string', k + '.base（腳本用它找充電樁）');
    assert.ok(CFG.buildings[K.base], k + ' 的充電樁要存在：' + K.base);
  }
  const heavy = Object.keys(CFG.terrain243.robots.kinds);
  assert.deepEqual(heavy.sort(), ['grade', 'lumber', 'mine'], '重型機器人種類（面板的「要換耗材」卡片只列這幾種）');
  for (const k of heavy) assert.equal(CFG.robots.kinds[k].base, 'heavy_charger', k);
  for (const [id, P] of Object.entries(parts)) {
    if (P.manualSwap) for (const k of P.for) assert.ok(heavy.includes(k), id + ' 的手動換機器人都要在重型清單裡：' + k);
  }
  for (const id of Object.keys(parts)) assert.ok(CFG.items['part_' + id], '耗材的倉庫物品存在：part_' + id);
  assert.ok(!CFG.items.part_saw_chain.sellPrice, '耗材沒有售價（不會被賣出）');
});

test('設定：預設白名單與腳本的假設對得上（loadMachineIds、飼料品項）', () => {
  const { load } = require('../helpers/harness');
  const { t } = load();
  for (const id of t.CONFIG.loadMachineIds) assert.ok(CFG.machines[id], '投料白名單的機器要存在：' + id);
  assert.ok(CFG.machines.corn_cake_machine, '玉米餅機存在，且刻意不在白名單內');
  assert.ok(!t.CONFIG.loadMachineIds.includes('corn_cake_machine'));
});
