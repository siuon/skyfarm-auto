'use strict';
// 測試基礎設施本身的健全性：載入器、假時鐘、假遊戲的基本行為。基礎壞了，其他測試的結果就不可信。
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, withShim, readSource } = require('../helpers/harness');
const { Clock } = require('../helpers/clock');
const { boot, soil, crop, ripe, step } = require('../helpers/boot');

test('執行器：載入腳本、取得匯出、預設 OFF', () => {
  const env = load();
  assert.equal(env.t.enabled, false);
  assert.match(env.t.VERSION, /^\d+\.\d+\.\d+$/);
  assert.ok(env.t.badge, '載入後要建立右下角標籤');
});

test('執行器：shim 錨點異常時直接失敗，不會默默跑壞的程式', () => {
  assert.throws(() => withShim('(function(){})();\n(function(){})();\n'), /剛好出現一次/);
  assert.throws(() => withShim('console.log(1)'), /剛好出現一次/);
});

test('執行器：磁碟上的腳本沒有被測試改動（shim 只存在記憶體副本）', () => {
  assert.ok(!readSource().includes('__t'), '腳本檔案裡不該有測試用的匯出');
});

test('假時鐘：advance 會依序觸發計時器，interval 會重複', async () => {
  const c = new Clock(1000);
  const hits = [];
  c.setTimeout(() => hits.push('a' + c.now), 100);
  const id = c.setInterval(() => hits.push('i' + c.now), 300);
  await c.advance(700);
  assert.deepEqual(hits, ['a1100', 'i1300', 'i1600']);
  c.clear(id);
  await c.advance(1000);
  assert.equal(hits.length, 3);
});

test('假遊戲：收成、播種、澆水的基本行為（後面的決策測試都靠這個）', async () => {
  const cfg = require('../helpers/fixture-config').makeCfg();
  const ctx = boot({ tiles: { '0,0': soil({ crop: ripe('wheat', cfg) }), '1,0': soil() }, coins: 50, water: 5 });
  const { world } = ctx;
  world.S.sel.tool = 'seed';
  world.S.sel.none49 = false;
  world.act(0, 0);
  assert.equal(world.M.tiles['0,0'].crop, null);
  assert.equal(world.S.inv.wheat, 1);
  world.act(1, 0);
  assert.equal(world.M.tiles['1,0'].crop.id, 'wheat');
  assert.equal(world.S.player.coins, 45);
  world.S.sel.tool = 'water';
  world.M.tiles['1,0'].m = 0;
  world.act(1, 0);
  assert.equal(world.M.tiles['1,0'].m, 1);
  assert.equal(world.S.player.water, 4);
});

test('假遊戲：播種工具沒選種子（none49）時，空田播不下去', () => {
  const { world } = boot({ tiles: { '0,0': soil() } }, { enable: false });
  world.S.sel.tool = 'seed';
  world.S.sel.none49 = true;
  world.act(0, 0);
  assert.equal(world.M.tiles['0,0'].crop, null);
});
