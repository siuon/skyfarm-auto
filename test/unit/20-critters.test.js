'use strict';
// 2026-11-19 使用者要求：①「農場會出現老鼠，幫我加上點擊抓老鼠」②「貓出現髒了，點它梳毛可以解掉」。
// 這兩樣遊戲都只能「點畫面上的牠」（老鼠、寵物都畫在 canvas 上、一直在動）：
//   老鼠：同一處點 3 下抓 1 隻；寵物：點牠 → 小選單（#pick53）→ 髒了才有「梳毛」（貓）／「洗澡」（狗）按鈕。
// 腳本讀 RT.critHit（目前這座島上可以點的東西，世界座標）→ 遊戲的 worldToScreen 換成螢幕座標 → 遊戲的 meteorTap。
// （倉庫視窗裡本來有一張「抓老鼠」卡片，但 2.68.1 實測它一畫出來就被後面的程式清掉，所以不能靠它。）
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, ripe, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const barn = () => ({ t: 'building', id: 'barn', rx: 6, ry: 3 });
const station = (rats) => ({ t: 'building', id: 'trash_station', rats, g: 2, r: 1 });
const catTree = (uid = 'ct1') => ({ t: 'deco', id: 'cat_tree', uid });
const cat = (o = {}) => Object.assign({ id: 1, kind: 'cat', name: '小花', den: 'ct1', aff2672: { p: 0, dirty: true } }, o);
const dog = (o = {}) => Object.assign({ id: 2, kind: 'dog', name: '旺財', den: 'dh1', aff2672: { p: 0, dirty: true } }, o);
const dogHouse = () => ({ t: 'deco', id: 'dog_house', uid: 'dh1' });

test('預設：點老鼠抓掉、貓狗髒了就梳毛／洗澡（都開）', () => {
  const C = boot({}, { enable: false }).t.CONFIG;
  assert.equal(C.autoCatchRats, true);
  assert.equal(C.autoGroomPets, true);
});

// ───── 抓老鼠 ─────

test('倉庫有 3 隻老鼠：每隻同一處點 3 下，共 9 下全都點在老鼠身上；不點任何地圖格子、不動倉庫與金幣', async () => {
  const ctx = boot({ tiles: { '6,3': barn() }, rats: { barn: 3 }, inv: { wheat: 10, egg: 4 }, coins: 777, cap: 5000 });
  const { world } = ctx;
  await run(ctx, 6);
  assert.equal(world.ratsCaught, 3);
  assert.equal(world.S.rats.barn, 0);
  assert.equal(ctx.t.stats.rat, 3);
  assert.equal(world.taps.length, 9, '每隻 3 下');
  assert.equal(world.ratTaps.length, 9, '每一下都點中老鼠（座標有正確換算成螢幕座標）');
  assert.equal(world.acts.length, 0, '一次地圖格子都沒點（meteorTap 只判斷點到哪隻動物）');
  assert.deepEqual(world.S.inv, { wheat: 10, egg: 4 });
  assert.equal(world.S.player.coins, 777);
  assert.ok(ctx.t.lastActionAt > 0);
});

test('點的位置是「螢幕座標」：腳本用遊戲的 worldToScreen 換算（假遊戲故意平移了一個固定量）', async () => {
  const ctx = boot({ tiles: { '6,3': barn() }, rats: { barn: 1 }, cap: 5000 });
  await run(ctx, 3);
  for (const [sx, sy] of ctx.world.taps) {
    assert.ok(sx >= 13 + 90 && sx <= 13 + 120, '螢幕 x＝世界 x ＋ 平移量：' + sx);
    assert.ok(sy >= 29 + 55 && sy <= 29 + 75, '螢幕 y：' + sy);
  }
});

test('垃圾站的老鼠也抓；而且絕不點垃圾站那一格（用收成工具點垃圾站，垃圾車在時會變成倒垃圾）', async () => {
  const ctx = boot({ tiles: { '3,3': station(2) }, cap: 5000 });
  await run(ctx, 5);
  assert.equal(ctx.world.M.tiles['3,3'].rats, 0);
  assert.equal(ctx.world.ratsCaught, 2);
  assert.equal(ctx.world.acts.length, 0, '沒有點任何格子');
});

test('沒有老鼠（0 隻、壞資料）、有隻數卻沒有倉庫建築：不點', async () => {
  for (const [tiles, rats] of [[{ '6,3': barn() }, { barn: 0 }], [{ '6,3': barn() }, undefined], [{ '6,3': barn() }, { barn: -2 }], [{ '6,3': barn() }, { barn: NaN }], [{ '6,3': barn() }, { barn: '3' }], [{}, { barn: 3 }]]) {
    const ctx = boot({ tiles, rats, cap: 5000 });
    await run(ctx, 3);
    assert.equal(ctx.world.taps.length, 0, JSON.stringify([Object.keys(tiles), rats]));
  }
});

test('autoCatchRats 關掉：不點老鼠', async () => {
  const ctx = boot({ tiles: { '6,3': barn() }, rats: { barn: 2 }, cap: 5000 }, { flags: { autoCatchRats: false } });
  await run(ctx, 4);
  assert.equal(ctx.world.taps.length, 0);
  assert.equal(ctx.world.S.rats.barn, 2);
});

test('點了老鼠但沒抓到（遊戲沒反應）：不狂點——退避一陣子，標籤說明；過了再試', async () => {
  const ctx = boot({ tiles: { '6,3': barn() }, rats: { barn: 2 }, cap: 5000, ratBroken: true });
  await run(ctx, 6);
  assert.equal(ctx.world.taps.length, 3, '試了一輪（3 下）就暫停');
  assert.match(ctx.t.status, /老鼠／寵物：點了老鼠但沒抓到/);
  await ctx.clock.advance(16000);
  await run(ctx, 2);
  assert.equal(ctx.world.taps.length, 6, '過了重試間隔再試一輪');
});

test('找不到遊戲的點擊介面（遊戲改版了）：什麼都不點，標籤說明', async () => {
  const ctx = boot({ tiles: { '6,3': barn() }, rats: { barn: 2 }, cap: 5000, noCritterApi: true });
  await run(ctx, 3);
  assert.equal(ctx.world.taps.length, 0);
  assert.match(ctx.t.status, /找不到遊戲的點擊介面/);
});

test('點不中（meteorTap 回 false）：算失敗、退避，不會每個週期一直點', async () => {
  const ctx = boot({ tiles: { '6,3': barn() }, rats: { barn: 1 }, cap: 5000, noMeteor: true });
  await run(ctx, 8);
  assert.ok(ctx.world.taps.length <= 4, '退避後不再狂點，實際 ' + ctx.world.taps.length);
  assert.equal(ctx.world.ratsCaught, 0);
});

test('玩家的工具不是我們用的（例如建造）：先切到「收成」工具再點，不在別的工具下點', async () => {
  const ctx = boot({ tiles: { '6,3': barn() }, rats: { barn: 1 }, cap: 5000, sel: { tool: 'build' } });
  await run(ctx, 6);
  assert.equal(ctx.world.S.sel.tool, 'hand');
  assert.equal(ctx.world.ratsCaught, 1);
});

test('老鼠與田裡的事並存：先抓老鼠，作物照常收成', async () => {
  const ctx = boot({ tiles: { '6,3': barn(), '0,0': soil({ crop: ripe('wheat', cfg) }) }, rats: { barn: 1 }, cap: 5000 });
  await run(ctx, 10);
  assert.equal(ctx.world.ratsCaught, 1);
  assert.equal(ctx.world.S.inv.wheat, 1);
});

test('別座島的倉庫有老鼠：全島輪流切過去抓（一次只在顯示的那座島點）', async () => {
  const ctx = boot({ cap: 5000, maps: [{ tiles: { '6,3': barn() } }], rats: { barn: 2 } });
  await run(ctx, 14, 3000);
  assert.equal(ctx.world.ratsCaught, 2);
  assert.ok(ctx.world.switches.includes(1), '切到第 2 座島');
});

// ───── 貓狗髒了：梳毛／洗澡 ─────

test('貓髒了：點牠 → 小選單按「梳毛」→ 髒的標記消失；小選單收乾淨；沒按別的按鈕、沒點地圖格子', async () => {
  const ctx = boot({ tiles: { '2,2': catTree() }, pets: [cat()], cap: 5000 });
  const { world } = ctx;
  await run(ctx, 3);
  assert.equal(world.S.pets[0].aff2672.dirty, false);
  assert.deepEqual(world.groomed, [1]);
  assert.equal(ctx.t.stats.groom, 1);
  assert.equal(world.pop.hidden, true, '小選單收乾淨');
  assert.equal(world.petStrokes, 0, '沒有按「摸摸」');
  assert.equal(world.acts.length, 0);
  assert.equal(world.taps.length, 1, '只點一下');
});

test('狗髒了：同樣的做法（洗澡）；沒髒的貓不點', async () => {
  const ctx = boot({ tiles: { '2,2': catTree(), '3,2': dogHouse() }, pets: [cat({ aff2672: { p: 0, dirty: false } }), dog()], cap: 5000 });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.groomed, [2]);
  assert.equal(ctx.world.petTaps.includes(1), false, '沒髒的貓一下都沒點');
});

test('多隻髒寵物：每個週期處理一隻，全部梳完', async () => {
  const ctx = boot({ tiles: { '2,2': catTree('ct1'), '3,2': catTree('ct2') }, pets: [cat(), cat({ id: 3, name: '小黑', den: 'ct2' })], cap: 5000 });
  await run(ctx, 6);
  assert.deepEqual(ctx.world.groomed.sort(), [1, 3]);
});

test('睡著的（晚上）髒貓：點了沒反應，所以不點，等醒了再說', async () => {
  const ctx = boot({ tiles: { '2,2': catTree() }, pets: [cat()], cap: 5000, petSleep: [1] });
  await run(ctx, 4);
  assert.equal(ctx.world.taps.length, 0);
  assert.equal(ctx.world.S.pets[0].aff2672.dirty, true);
});

test('autoGroomPets 關掉：不點寵物', async () => {
  const ctx = boot({ tiles: { '2,2': catTree() }, pets: [cat()], cap: 5000 }, { flags: { autoGroomPets: false } });
  await run(ctx, 4);
  assert.equal(ctx.world.taps.length, 0);
});

test('沒有窩（den）的寵物、不是貓狗：不點', async () => {
  const ctx = boot({ tiles: { '2,2': catTree() }, pets: [cat({ den: undefined }), cat({ id: 4, kind: 'bird' })], cap: 5000 });
  await run(ctx, 4);
  assert.equal(ctx.world.taps.length, 0);
});

test('小選單裡沒有「梳毛」按鈕：小選單收乾淨、退避、標籤說明（不會留著卡住每個週期）', async () => {
  const ctx = boot({ tiles: { '2,2': catTree() }, pets: [cat()], cap: 5000, noBathButton: true });
  await run(ctx, 6);
  assert.equal(ctx.world.pop.hidden, true);
  assert.equal(ctx.world.taps.length, 1, '失敗後退避，不再狂點');
  assert.match(ctx.t.status, /小選單裡沒有「梳毛」按鈕/);
  assert.equal(ctx.world.petStrokes, 0);
});

test('按了「梳毛」但還是髒的：算失敗、小選單收乾淨、退避', async () => {
  const ctx = boot({ tiles: { '2,2': catTree() }, pets: [cat()], cap: 5000, bathBroken: true });
  await run(ctx, 5);
  assert.equal(ctx.world.pop.hidden, true);
  assert.equal(ctx.t.stats.groom, 0);
  assert.equal(ctx.world.taps.length, 1);
  assert.match(ctx.t.status, /還是髒的/);
});

test('別座島的貓髒了：全島輪流切過去梳毛', async () => {
  const ctx = boot({ cap: 5000, maps: [{ tiles: { '2,2': catTree() } }], pets: [cat()] });
  await run(ctx, 14, 3000);
  assert.deepEqual(ctx.world.groomed, [1]);
  assert.ok(ctx.world.switches.includes(1));
});

test('玩家自己開著小選單：不去搶（整個週期暫停）', async () => {
  const ctx = boot({ tiles: { '2,2': catTree() }, pets: [cat()], cap: 5000 });
  ctx.world.pop.hidden = false;
  await run(ctx, 3);
  assert.equal(ctx.world.taps.length, 0);
  assert.match(ctx.t.status, /有選單開啟/);
});

test('三座島、貓住在第 3 座：只切去第 3 座，不會白跑沒事的第 2 座（窩在哪座島要看清楚）', async () => {
  const ctx = boot({ cap: 5000, maps: [{ tiles: {} }, { tiles: { '2,2': catTree() } }], pets: [cat()] });
  await run(ctx, 16, 3000);
  assert.deepEqual(ctx.world.groomed, [1]);
  assert.equal(ctx.world.switches.includes(1), false, '沒有切去第 2 座島');
});

test('三座島、倉庫在第 3 座：老鼠只算在倉庫那座島，不會白跑沒倉庫的第 2 座', async () => {
  const ctx = boot({ cap: 5000, maps: [{ tiles: {} }, { tiles: { '6,3': barn() } }], rats: { barn: 2 } });
  await run(ctx, 16, 3000);
  assert.equal(ctx.world.ratsCaught, 2);
  assert.equal(ctx.world.switches.includes(1), false, '沒有切去第 2 座島');
});
