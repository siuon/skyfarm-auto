'use strict';
// 2026-11-20 使用者在「救護」之後說「好，做」：寵物鳥髒了也自動洗羽毛。
// 官方 2.68.2（2.67.2 的好感度系統）：寵物鳥 S.birds40 的每隻 B 也有 B.aff2672（p 點數、dirty 髒了）；一天 15% 自己弄髒（下雨只會弄髒狗）；
// 點到鳥（RT.critHit 的 kind 'bird2543'，半徑 13）→ 打招呼 ＋ 小選單（#pick53），髒了才有 button[data-af2672="bath"]「洗羽毛」→ 好感度 +3、髒的標記消失。
// 真引擎實測（隔離副本）：用真遊戲的 meteorTap 點一隻髒的鳥 → 小選單有「洗羽毛 髒了 · ♥+3」→ 按下去 dirty=false、好感度 2→5、金幣與倉庫都沒動。
// 鳥只有白天、沒下雨下雪、不餓時才飛出鳥屋（畫面上才有 bird2543 的 hit）；在鳥屋裡時點不到。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const house = (uid = 'bh1') => ({ t: 'deco', id: 'bird_house', uid, n: 1 });
const bird = (o = {}) => Object.assign({ id: 'b1', sp: 'budgie', name: '小藍', house: 'bh1', aff2672: { p: 0, dirty: true } }, o);
const growing = () => soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: false } });

test('髒的鳥飛在外面：點牠 → 小選單按「洗羽毛」→ 髒的標記消失；小選單收乾淨、沒點地圖格子、不動金幣與倉庫', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], coins: 555, inv: { wheat: 3 }, cap: 5000 });
  const { world } = ctx;
  await run(ctx, 3);
  assert.equal(world.S.birds40[0].aff2672.dirty, false);
  assert.deepEqual(world.groomed, ['b1']);
  assert.equal(ctx.t.stats.groom, 1);
  assert.equal(world.pop.hidden, true, '小選單收乾淨');
  assert.equal(world.petStrokes, 0, '沒有按「輕撫羽毛」');
  assert.equal(world.acts.length, 0, '一次地圖格子都沒點');
  assert.equal(world.taps.length, 1, '只點一下');
  assert.equal(world.S.player.coins, 555);
  assert.deepEqual(world.S.inv, { wheat: 3 });
});

test('標籤寫「洗羽毛」（貓是梳毛、狗是洗澡）', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], cap: 5000 });
  await step(ctx, 100);
  assert.match(ctx.t.status, /小藍洗羽毛中/);
});

test('沒髒的鳥不點', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird({ aff2672: { p: 3, dirty: false } })], cap: 5000 });
  await run(ctx, 4);
  assert.equal(ctx.world.taps.length, 0);
});

test('autoGroomPets 關掉：鳥也不點', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], cap: 5000 }, { flags: { autoGroomPets: false } });
  await run(ctx, 4);
  assert.equal(ctx.world.taps.length, 0);
});

test('貓、狗、鳥同時髒了：全部處理（每個週期一隻）', async () => {
  const catTree = { t: 'deco', id: 'cat_tree', uid: 'ct1' };
  const ctx = boot({
    tiles: { '2,2': house(), '3,2': catTree },
    birds: [bird()],
    pets: [{ id: 1, kind: 'cat', name: '小花', den: 'ct1', aff2672: { p: 0, dirty: true } }],
    cap: 5000,
  });
  await run(ctx, 6);
  assert.deepEqual(ctx.world.groomed.sort(), [1, 'b1'].sort());
  assert.equal(ctx.t.stats.groom, 2);
});

test('好幾隻鳥：全部洗完', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird(), bird({ id: 'b2', name: '小綠' }), bird({ id: 'b3', name: '小黃' })], cap: 5000 });
  await run(ctx, 8);
  assert.deepEqual(ctx.world.groomed.sort(), ['b1', 'b2', 'b3']);
});

// ───── 鳥不在外面（晚上、下雨下雪、餓了）─────

test('鳥還在鳥屋裡（晚上／下雨下雪：畫面上沒有鳥）：不點；2 分鐘內不再看——鳥飛出來了也要等退避過了才洗', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], cap: 5000, birdsIn: true });
  await run(ctx, 6, 300);
  assert.equal(ctx.world.taps.length, 0);
  assert.equal(ctx.world.S.birds40[0].aff2672.dirty, true);
  ctx.world.setBirdsIn(false); // 天亮了、鳥飛出來
  await run(ctx, 3, 300);
  assert.equal(ctx.world.taps.length, 0, '退避中（2 分鐘），先不洗');
  await ctx.clock.advance(125000);
  await run(ctx, 3, 300);
  assert.deepEqual(ctx.world.groomed, ['b1'], '退避過了、鳥在外面：洗');
});

test('餓著的鳥待在鳥屋裡：不算有事做、不點', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird({ hungry: true })], cap: 5000 });
  await run(ctx, 4);
  assert.equal(ctx.world.taps.length, 0);
});

test('鳥屋不在目前這座島、沒有鳥屋（壞資料）、house 對不上：不點', async () => {
  for (const [tiles, b] of [[{}, bird()], [{ '2,2': house('other') }, bird()], [{ '2,2': house() }, bird({ house: undefined })]]) {
    const ctx = boot({ tiles, birds: [b], cap: 5000 });
    await run(ctx, 3);
    assert.equal(ctx.world.taps.length, 0, JSON.stringify([Object.keys(tiles), b.house]));
  }
});

// ───── 失敗與工具 ─────

test('小選單裡沒有「洗羽毛」按鈕：小選單收乾淨、退避、標籤說明', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], cap: 5000, noBathButton: true });
  await run(ctx, 6);
  assert.equal(ctx.world.pop.hidden, true);
  assert.equal(ctx.world.taps.length, 1, '失敗後退避，不再狂點');
  assert.match(ctx.t.status, /小藍的小選單裡沒有「洗羽毛」按鈕/);
});

test('按了「洗羽毛」但還是髒的：算失敗、退避', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], cap: 5000, bathBroken: true });
  await run(ctx, 5);
  assert.equal(ctx.t.stats.groom, 0);
  assert.equal(ctx.world.taps.length, 1);
  assert.match(ctx.t.status, /還是髒的/);
});

test('玩家的工具不是我們用的（例如建造）：先切到「收成」工具再點', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], cap: 5000, sel: { tool: 'build' } });
  await run(ctx, 6);
  assert.equal(ctx.world.S.sel.tool, 'hand');
  assert.deepEqual(ctx.world.groomed, ['b1']);
});

test('玩家自己開著小選單：不去搶', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], cap: 5000 });
  ctx.world.pop.hidden = false;
  await run(ctx, 3);
  assert.equal(ctx.world.taps.length, 0);
});

// ───── 多座島 ─────

test('別座島的鳥髒了：全島輪流切過去洗（鳥在外面時）', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': house() } }], birds: [bird()], cap: 5000 });
  await run(ctx, 14, 500);
  assert.deepEqual(ctx.world.groomed, ['b1']);
  assert.ok(ctx.world.switches.includes(1));
  assert.equal(ctx.world.S.cur, 0, '洗完回家島');
});

test('別座島的鳥髒了、但鳥在鳥屋裡（晚上）：切過去一次看過就退避，不會一直切過來白跑', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': house() } }], birds: [bird()], cap: 5000, birdsIn: true });
  await run(ctx, 160, 500); // 80 秒
  assert.equal(ctx.world.taps.length, 0);
  const hops = ctx.world.switches.filter((i) => i === 1).length;
  assert.ok(hops >= 1 && hops <= 2, '80 秒內最多切過去 2 次，實際 ' + hops);
});

test('三座島、鳥屋在第 3 座：只切去第 3 座，不白跑第 2 座（鳥屋在哪座島要看清楚）', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: {} }, { tiles: { '2,2': house() } }], birds: [bird()], cap: 5000 });
  await run(ctx, 16, 500);
  assert.deepEqual(ctx.world.groomed, ['b1']);
  assert.equal(ctx.world.switches.includes(1), false, '沒有切去第 2 座島');
});

test('分頁在背景（document.hidden）：畫面沒更新、critHit 是舊的，看不到鳥不代表鳥在鳥屋裡——不退避；回到前景、鳥在外面就馬上洗（不用等 2 分鐘）', async () => {
  const ctx = boot({ tiles: { '2,2': house() }, birds: [bird()], cap: 5000, birdsIn: true });
  ctx.doc.hidden = true;
  await run(ctx, 6, 200);
  assert.equal(ctx.world.taps.length, 0);
  ctx.doc.hidden = false;
  ctx.world.setBirdsIn(false);
  await run(ctx, 3, 200);
  assert.deepEqual(ctx.world.groomed, ['b1']);
});

// ───── 補洞（突變檢查揪出來的）─────

test('別座島的鳥餓著（待在鳥屋裡）：不算有事做，不為牠切島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': house() } }], birds: [bird({ hungry: true })], cap: 5000 });
  await run(ctx, 8, 300);
  assert.deepEqual(ctx.world.switches, []);
});

test('兩座島各有一間鳥屋、鳥住第 3 座那間：只切去第 3 座（鳥屋要看 uid，不能只看「有鳥屋」）', async () => {
  const ctx = boot({
    tiles: { '0,0': growing() },
    maps: [{ tiles: { '2,2': house('bhA') } }, { tiles: { '3,3': house('bhB') } }],
    birds: [bird({ house: 'bhB' })],
    cap: 5000,
  });
  await run(ctx, 16, 500);
  assert.deepEqual(ctx.world.groomed, ['b1']);
  assert.equal(ctx.world.switches.includes(1), false, '沒有切去第 2 座島（那間鳥屋不是牠住的）');
});

test('鳥和貓的 id 剛好一樣：互不影響（鳥在鳥屋裡退避時，同 id 的貓照樣梳毛）', async () => {
  const ctx = boot({
    tiles: { '2,2': house(), '3,2': { t: 'deco', id: 'cat_tree', uid: 'ct1' } },
    birds: [bird({ id: 'same' })],
    pets: [{ id: 'same', kind: 'cat', name: '小花', den: 'ct1', aff2672: { p: 0, dirty: true } }],
    cap: 5000,
    birdsIn: true,
  });
  await run(ctx, 6, 300);
  assert.deepEqual(ctx.world.groomed, ['same'], '貓梳了（鳥還在鳥屋裡沒點）');
  assert.equal(ctx.world.S.pets[0].aff2672.dirty, false);
  assert.equal(ctx.world.S.birds40[0].aff2672.dirty, true);
});

test('S.pets 裡不是貓狗的東西（沒見過的種類）、沒有窩的貓：就算髒了、窩在別座島，也不算有事做、不切島（鳥只認 S.birds40）', async () => {
  const catTree = { t: 'deco', id: 'cat_tree', uid: 'ct1' };
  for (const P of [
    { id: 7, kind: 'rabbit', name: '兔兔', den: 'ct1', aff2672: { p: 0, dirty: true } }, // 不認得的種類
    { id: 8, kind: 'cat', name: '無窩', den: undefined, aff2672: { p: 0, dirty: true } }, // 沒有窩
  ]) {
    const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': catTree } }], pets: [P], cap: 5000 });
    await run(ctx, 8, 300);
    assert.deepEqual(ctx.world.switches, [], JSON.stringify(P));
  }
});
