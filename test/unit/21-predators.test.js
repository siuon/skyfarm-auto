'use strict';
// 2026-11-19 使用者問「遊戲裡有哪些有害動物、都能點嗎」之後說「好，做」：腳本也自動趕天敵（黃鼠狼、狐狸、野狼）。
// 官方 2.68.2：天敵（晚上，野狼也在雨天）出現後走向某隻動物，只給 60 秒（approachSeconds；有「警報」狗在場 180 秒）才動手，
// 玩家在那之前「點牠 3 下」（chaseTaps）趕走；柵欄擋不住（fencesStop:false）。點的方式和老鼠一樣：RT.critHit 裡 kind 'pred' 的那一筆
// → worldToScreen → meteorTap；成功＝遊戲設 Pd.fleeAt 且 Pd.by='player'。已經有狗在趕（Pd.by／Pd.fleeAt 已設）的不碰。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, ripe, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const hen = (o = {}) => Object.assign({ t: 'animal', id: 'egg_hen', stage: 2, timer: 100, cycles: 10, stack: 0 }, o);
const sheep = (o = {}) => Object.assign({ t: 'animal', id: 'wool_sheep', stage: 2, timer: 100, cycles: 10, stack: 0 }, o);
const growing = () => soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: false } }); // 還在長：沒事做
const ripeCrop = () => soil({ crop: ripe('wheat', cfg) });
const press = (ctx, i) => ctx.doc._q1.get('#maps button[data-map="' + i + '"]').click();

test('預設：點天敵趕走（開）', () => {
  assert.equal(boot({}, { enable: false }).t.CONFIG.autoChasePredators, true);
});

// ───── 基本：點 3 下趕走 ─────

test('狐狸出現：第一個週期就點牠 3 下（全中）、牠被趕走（by＝玩家）；不點任何地圖格子、不動金幣與倉庫', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], coins: 500, inv: { wheat: 7 }, cap: 5000 });
  const { world } = ctx;
  await step(ctx, 100);
  const Pd = world.S.preds[0];
  assert.equal(Pd.taps, 3);
  assert.ok(Pd.fleeAt > 0, '遊戲收到 3 下：牠開始逃了');
  assert.equal(Pd.by, 'player');
  assert.deepEqual(world.predTaps, [Pd.id, Pd.id, Pd.id]);
  assert.equal(world.taps.length, 3, '只點了 3 下');
  assert.equal(world.acts.length, 0, '沒有點任何格子（meteorTap 只判斷點到哪隻動物）');
  assert.equal(world.S.player.coins, 500);
  assert.deepEqual(world.S.inv, { wheat: 7 });
  assert.equal(ctx.t.stats.chase, 1);
  assert.ok(ctx.t.lastActionAt > 0);
});

test('三種天敵都趕：黃鼠狼、狐狸、野狼（各自一隻、各自的動物）', async () => {
  const ctx = boot({
    tiles: { '2,2': hen({ stack: 2 }), '3,2': hen(), '4,2': sheep() },
    preds: [{ kind: 'weasel', k: '2,2' }, { kind: 'fox', k: '3,2' }, { kind: 'wolf', k: '4,2' }],
    cap: 5000,
  });
  await run(ctx, 6, 100);
  assert.equal(ctx.t.stats.chase, 3);
  assert.ok(ctx.world.S.preds.every((p) => p.by === 'player' && p.fleeAt > 0));
  assert.deepEqual(ctx.world.predHits, [], '沒有一隻得手');
});

test('點的位置是「螢幕座標」：腳本用遊戲的 worldToScreen 換算（假遊戲故意平移了一個固定量）', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000 });
  await step(ctx, 100);
  assert.equal(ctx.world.taps.length, 3);
  for (const [sx, sy] of ctx.world.taps) {
    assert.ok(sx >= 13 + 200 && sx <= 13 + 205, '螢幕 x＝世界 x ＋ 平移量：' + sx);
    assert.equal(sy, 29 + 150);
  }
});

test('不趕的話牠就得手（對照組）：autoChasePredators 關掉，時間到被偷', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox', untilIn: 60000 }], cap: 5000 }, { flags: { autoChasePredators: false } });
  await run(ctx, 4, 100);
  assert.equal(ctx.world.taps.length, 0);
  await ctx.clock.advance(61000);
  await step(ctx, 100);
  assert.deepEqual(ctx.world.predHits, [ctx.world.S.preds[0].id]);
  assert.equal(ctx.t.stats.chase, 0);
});

// ───── 優先順序：比賣出、收成都急 ─────

test('倉庫快滿要賣出、田裡也有成熟作物：天敵先處理（第一個週期就點，賣出和收成排後面）', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '0,0': ripeCrop() }, preds: [{ kind: 'fox' }], cap: 100, inv: { wheat: 100 } });
  await step(ctx, 100);
  const Pd = ctx.world.S.preds[0];
  assert.equal(Pd.by, 'player', '第一個週期就趕走了');
  assert.equal(ctx.world.S.inv.wheat, 100, '還沒開始賣');
  assert.equal(ctx.world.acts.length, 0, '田也還沒碰');
});

test('多隻天敵：最快動手的先點', async () => {
  const ctx = boot({
    tiles: { '2,2': hen(), '3,2': hen() },
    preds: [{ kind: 'fox', k: '2,2', untilIn: 50000 }, { kind: 'weasel', k: '3,2', untilIn: 20000 }],
    cap: 5000,
  });
  await step(ctx, 100);
  assert.equal(ctx.world.predTaps[0], ctx.world.S.preds[1].id, '先點 20 秒後動手的黃鼠狼');
  await run(ctx, 3, 100);
  assert.equal(ctx.t.stats.chase, 2);
});

// ───── 不碰的天敵 ─────

test('狗已經在趕牠（Pd.by 與 fleeAt 已設）：不點——點了會把「by」蓋成玩家，狗的戰績與警犬效果就沒了', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox', by: '小白', fleeAtIn: 5000 }], cap: 5000 });
  await run(ctx, 6, 500);
  assert.equal(ctx.world.taps.length, 0);
  const Pd = ctx.world.S.preds[0];
  assert.equal(Pd.by, '小白');
  assert.equal(Pd.taps, 0);
  assert.equal(ctx.t.stats.chase, 0);
});

test('只設了 by（沒有 fleeAt）或只設了 fleeAt：也都不點（任何一個代表「有人處理了」）', async () => {
  for (const p of [{ kind: 'fox', by: '小白' }, { kind: 'fox', fleeAtIn: 4000 }]) {
    const ctx = boot({ tiles: { '2,2': hen() }, preds: [p], cap: 5000 });
    await run(ctx, 3, 200);
    assert.equal(ctx.world.taps.length, 0, JSON.stringify(p));
    assert.doesNotMatch(ctx.t.status, /趕狐狸|沒趕走/, '連「去趕」這個動作都不該開始（也不該留下失敗的標籤）：' + JSON.stringify(p));
  }
});

test('時間已經到（過期）、牠要打的動物不見了、壞資料：不點', async () => {
  const bad = [
    [{ tiles: { '2,2': hen() }, preds: [{ kind: 'fox', untilIn: -1000 }] }, '過期'],
    [{ tiles: {}, preds: [{ kind: 'fox' }] }, '動物不見了'],
    [{ tiles: { '2,2': soil() }, preds: [{ kind: 'fox' }] }, '那格不是動物'],
    [{ tiles: { '2,2': hen() }, preds: [{ kind: 'dragon' }] }, '不認得的種類'],
  ];
  for (const [o, why] of bad) {
    const ctx = boot(Object.assign({ cap: 5000 }, o));
    await run(ctx, 3, 100);
    assert.equal(ctx.world.taps.length, 0, why);
  }
});

test('壞資料（沒有 id、until 不是數字、已經 done）：不點、不出錯', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }, { kind: 'fox' }, { kind: 'fox' }], cap: 5000 });
  const [a, b, c] = ctx.world.S.preds;
  delete a.id;
  b.until = NaN;
  c.done = 123;
  await run(ctx, 4, 100);
  assert.equal(ctx.world.taps.length, 0);
  assert.equal(ctx.t.enabled, true);
});

// ───── 點了沒用：退避要快（只給 60 秒）、標籤說明 ─────

test('點了但遊戲沒記（壞掉）：不狂點——2 下沒增加就停；1.5 秒後再試一輪；標籤說明', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000, predBroken: true });
  await step(ctx, 100);
  assert.equal(ctx.world.taps.length, 2, '連兩下 Pd.taps 都沒增加就停手，不點滿');
  await step(ctx, 100); // 失敗的原因在下一個週期的標籤上
  assert.match(ctx.t.status, /老鼠／寵物／天敵：點了狐狸但沒趕走/);
  await run(ctx, 3, 400); // 1.2 秒：還在退避
  assert.equal(ctx.world.taps.length, 2);
  await run(ctx, 2, 400); // 超過 1.5 秒
  assert.equal(ctx.world.taps.length, 4, '很快就再試一輪（老鼠那種 15 秒起跳的退避會錯過 60 秒的期限）');
  assert.equal(ctx.t.stats.chase, 0);
});

test('退避加倍但有上限（15 秒）：一直失敗也不會太久才試一次', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox', untilIn: 600000 }], cap: 5000, predBroken: true });
  const times = [];
  for (let i = 0; i < 400; i++) {
    const n = ctx.world.taps.length;
    await step(ctx, 500);
    if (ctx.world.taps.length > n) times.push(ctx.clock.now);
  }
  assert.ok(times.length >= 6, '200 秒內至少試了 6 輪，實際 ' + times.length);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] <= 16500, '兩輪間隔不超過 15 秒（＋一個週期）：' + (times[i] - times[i - 1]));
});

test('天敵剛好蓋在彩虹上、第一下被彩虹吃掉（只領金幣、meteorTap 仍回 true）：不算趕天敵，多點一下補上，仍然趕走', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000, rainbowFirst: true, coins: 100 });
  await step(ctx, 100);
  assert.equal(ctx.world.S.preds[0].by, 'player');
  assert.equal(ctx.world.taps.length, 4, '4 下：彩虹 1 ＋ 天敵 3');
  assert.equal(ctx.world.S.preds[0].taps, 3);
  assert.equal(ctx.world.S.player.coins, 110, '彩虹的金幣是遊戲給的，不是腳本動的');
});

test('找不到遊戲的點擊介面（遊戲改版了）：什麼都不點，標籤說明', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000, noCritterApi: true });
  await run(ctx, 3, 100);
  assert.equal(ctx.world.taps.length, 0);
  assert.match(ctx.t.status, /找不到遊戲的點擊介面/);
});

// ───── 畫面沒在更新（分頁在背景）：不點 ─────

test('分頁在背景（document.hidden）：RT.critHit 是舊資料、新出現的天敵根本不在裡面——不點；回到前景馬上點', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox', untilIn: 60000 }], cap: 5000 });
  ctx.doc.hidden = true;
  await run(ctx, 4, 100);
  assert.equal(ctx.world.taps.length, 0);
  ctx.doc.hidden = false;
  await step(ctx, 100);
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

// ───── 工具 ─────

test('玩家的工具不是我們用的（例如建造）：先切到「收成」工具再點，不在別的工具下點', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000, sel: { tool: 'build' } });
  await step(ctx, 100);
  assert.equal(ctx.world.taps.length, 0, '工具還沒切好，這個週期不點');
  await run(ctx, 3, 100);
  assert.equal(ctx.world.S.sel.tool, 'hand');
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

test('玩家自己開著小選單／視窗：不去搶（整個週期暫停，天敵也一樣——玩家在操作）', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000 });
  ctx.world.pop.hidden = false;
  await run(ctx, 3, 100);
  assert.equal(ctx.world.taps.length, 0);
  assert.match(ctx.t.status, /有選單開啟/);
});

// ───── 多座島 ─────

test('別座島出現天敵：立刻切過去趕（不等輪到、不管這座島有沒有田要收），趕完回家島', async () => {
  const ctx = boot({
    tiles: { '0,0': ripeCrop() }, // 家島有成熟作物（有事做）
    maps: [{ tiles: { '2,2': hen() } }],
    preds: [{ kind: 'fox', mi: 1, untilIn: 60000 }],
    cap: 5000,
  });
  await run(ctx, 12, 200);
  assert.equal(ctx.world.switches[0], 1, '第一件事就是切到第 2 座');
  assert.equal(ctx.world.S.preds[0].by, 'player');
  assert.equal(ctx.t.stats.chase, 1);
  assert.equal(ctx.world.predTaps.length, 3);
  assert.ok(ctx.world.acts.every((a) => !(a.k === '2,2')), '沒點動物那一格');
});

test('別座島的天敵剩不到 8 秒：來不及，不切過去（也不算有事做）', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], preds: [{ kind: 'fox', mi: 1, untilIn: 7000 }], cap: 5000 });
  await run(ctx, 8, 300);
  assert.deepEqual(ctx.world.switches, []);
});

test('別座島的天敵已經有狗在趕：不切過去', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], preds: [{ kind: 'fox', mi: 1, by: '小白', fleeAtIn: 5000 }], cap: 5000 });
  await run(ctx, 8, 300);
  assert.deepEqual(ctx.world.switches, []);
});

test('每隻天敵最多為牠「搶著」切一次島：切過去點不中（遊戲壞了）也不會一直來回追；之後只剩一般輪流（有退避、隔很久才一次）', async () => {
  const ctx = boot({
    tiles: { '0,0': growing() },
    maps: [{ tiles: { '2,2': hen() } }],
    preds: [{ kind: 'fox', mi: 1, untilIn: 600000 }],
    cap: 5000,
    predBroken: true,
  });
  let urgent = 0;
  const hopAt = [];
  let prev = 0;
  for (let i = 0; i < 400; i++) { // 200 秒
    await step(ctx, 500);
    if (/^切到第 2 座島（狐狸出現了）/.test(ctx.t.status)) urgent += 1;
    const n = ctx.world.switches.filter((x) => x === 1).length;
    if (n > prev) { hopAt.push(ctx.clock.now); prev = n; }
  }
  assert.equal(urgent, 1, '搶著切（立刻、不等輪到）只有一次');
  assert.ok(hopAt.length >= 2, '一般輪流還是會回去看（那座島在 critterWork 裡算有事做、退避過了就再試），實際 ' + hopAt.length);
  for (let i = 1; i < hopAt.length; i++) assert.ok(hopAt[i] - hopAt[i - 1] >= 25000, '之後的是一般輪流：隔至少 25 秒（島的退避），實際 ' + (hopAt[i] - hopAt[i - 1]));
  assert.ok(hopAt.length <= 4, '200 秒內最多去 4 次，實際 ' + hopAt.length);
});

test('玩家剛手動切島：userSwitchHoldMs 內不為天敵切走（先尊重玩家）；時間到才去', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': growing(), '2,2': hen() } }, { tiles: { '3,0': growing() } }], cap: 5000 });
  await run(ctx, 2, 200);
  press(ctx, 2); // 玩家切到第 3 座
  ctx.world.S.preds = [{ id: 'pdX', kind: 'fox', mi: 1, k: '2,2', t0: ctx.clock.now, until: ctx.clock.now + 600000, taps: 0 }];
  await run(ctx, 20, 1000); // 20 秒：還在 30 秒的暫停內
  assert.deepEqual(ctx.world.switches, [2], '只有玩家按的那一下');
  await ctx.clock.advance(15000);
  await run(ctx, 6, 500);
  assert.ok(ctx.world.switches.includes(1), '暫停結束後去趕');
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

test('略過的島（skipIslands）上的天敵：不切過去', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], preds: [{ kind: 'fox', mi: 1 }], cap: 5000 }, { flags: { skipIslands: [2] } });
  await run(ctx, 8, 300);
  assert.deepEqual(ctx.world.switches, []);
});

test('「只做畫面上這座」模式：別座島的天敵不切過去；你自己看著那座時照常趕', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], preds: [{ kind: 'fox', mi: 1 }], cap: 5000 }, { flags: { islandMode: 'current' } });
  await run(ctx, 6, 300);
  assert.deepEqual(ctx.world.switches, []);
  press(ctx, 1);
  await run(ctx, 4, 200);
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

test('天敵在家島、人在別座島（全島輪流）：切回家島趕', async () => {
  const ctx = boot({ tiles: { '0,0': growing(), '2,2': hen() }, maps: [{ tiles: { '1,0': ripeCrop() } }], cap: 5000 });
  await run(ctx, 2, 200); // 先確定家島是第 1 座
  ctx.world.S.preds = [{ id: 'pdY', kind: 'fox', mi: 0, k: '2,2', t0: ctx.clock.now, until: ctx.clock.now + 60000, taps: 0 }];
  await run(ctx, 10, 300);
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

// ───── 讀設定、收小選單、和老鼠同時 ─────

test('點幾下讀遊戲設定的 chaseTaps（不是寫死 3）：設成 5 就點 5 下；壞設定（99）夾在 10 下內，最多再補 3 下', async () => {
  const c5 = makeCfg();
  c5.predators.chaseTaps = 5;
  const ctx = boot({ cfg: c5, tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000 });
  await step(ctx, 100);
  assert.equal(ctx.world.S.preds[0].taps, 5);
  assert.equal(ctx.world.S.preds[0].by, 'player');
  assert.equal(ctx.world.taps.length, 5);
  const c9 = makeCfg();
  c9.predators.chaseTaps = 99; // 壞設定：夾在 10 以內
  const ctx2 = boot({ cfg: c9, tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000 });
  await step(ctx2, 100);
  assert.ok(ctx2.world.taps.length <= 13, '最多 10（夾住的 chaseTaps）＋3，實際點了 ' + ctx2.world.taps.length);
});

test('點的當下遊戲跳出別的小選單（例如旁邊的寵物）：腳本把它收乾淨，不留著卡住下個週期', async () => {
  const ctx = boot({ tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000, predOpensPopup: true });
  await step(ctx, 100);
  assert.equal(ctx.world.S.preds[0].by, 'player');
  assert.equal(ctx.world.pop.hidden, true, '小選單收乾淨');
  assert.equal(ctx.world.petStrokes, 0, '沒有按任何按鈕');
});

test('老鼠和天敵同時有：先趕天敵（老鼠不趕時間），再抓老鼠', async () => {
  const barn = { t: 'building', id: 'barn', rx: 6, ry: 3 };
  const ctx = boot({ tiles: { '2,2': hen(), '6,3': barn }, rats: { barn: 2 }, preds: [{ kind: 'fox' }], cap: 5000 });
  await step(ctx, 100);
  assert.equal(ctx.world.S.preds[0].by, 'player', '第一個週期先處理天敵');
  assert.equal(ctx.world.S.rats.barn, 2, '老鼠還沒動');
  await run(ctx, 6, 100);
  assert.equal(ctx.world.S.rats.barn, 0);
});

test('天敵與別的事並存：趕完天敵，田裡的收成照常', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '0,0': ripeCrop() }, preds: [{ kind: 'fox' }], cap: 5000 });
  await run(ctx, 8, 300);
  assert.equal(ctx.world.S.preds[0].by, 'player');
  assert.equal(ctx.world.S.inv.wheat, 1);
});

test('標籤的統計與診斷：趕走幾次天敵寫在「趕天敵」', async () => {
  const ctx = boot({ tiles: { '2,2': hen(), '3,2': hen() }, preds: [{ kind: 'fox', k: '2,2' }, { kind: 'weasel', k: '3,2' }], cap: 5000 });
  await run(ctx, 5, 100);
  ctx.t.renderBadge(true);
  assert.match(ctx.doc.getElementById('skyfarm-auto-badge') ? ctx.doc.getElementById('skyfarm-auto-badge').textContent : JSON.stringify([...ctx.doc.byId.keys()]), /趕天敵 2/);
});

// ───── 補洞：背景分頁＋別座島、工具還沒切好、切島失敗、設定缺欄位 ─────

test('分頁在背景：別座島的天敵也不切過去（畫面沒更新，切過去也點不到）；回到前景才去', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], preds: [{ kind: 'fox', mi: 1, untilIn: 60000 }], cap: 5000 });
  ctx.doc.hidden = true;
  await run(ctx, 8, 300);
  assert.deepEqual(ctx.world.switches, []);
  ctx.doc.hidden = false;
  await run(ctx, 6, 300);
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

test('別座島的天敵、玩家工具是「建造」：先切到收成工具，下一個週期就切島，不等一般輪流（家島一直有田要做）', async () => {
  const ctx = boot({
    tiles: { '0,0': ripeCrop(), '1,0': ripeCrop(), '0,1': ripeCrop() },
    maps: [{ tiles: { '2,2': hen() } }],
    preds: [{ kind: 'fox', mi: 1, untilIn: 60000 }],
    cap: 5000,
    sel: { tool: 'build' },
  });
  await run(ctx, 12, 300);
  assert.equal(ctx.world.S.preds[0].by, 'player', '3.6 秒內就趕走了');
  assert.equal(ctx.world.switches[0], 1, '第一次切島就是為了天敵');
});

test('切島按鈕點了沒切成：那座島先暫停，天敵不會讓腳本每個週期狂按切島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], preds: [{ kind: 'fox', mi: 1, untilIn: 600000 }], cap: 5000, noSwitch: true });
  await run(ctx, 40, 500); // 20 秒
  assert.ok(ctx.world.switches.length <= 2, '20 秒內最多試 2 次，實際 ' + ctx.world.switches.length);
});

test('設定裡沒有 predators（遊戲改版了）：點 3 下（預設值），不出錯', async () => {
  const c0 = makeCfg();
  delete c0.predators;
  const ctx = boot({ cfg: c0, tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000 });
  await step(ctx, 100);
  assert.equal(ctx.world.S.preds[0].taps, 3);
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

// ───── 補洞（突變檢查揪出來的）：只看狀態的別座島判斷、切島記錄、點擊次數的設定 ─────

test('別座島的天敵已經結束（done：得手或被趕走了，官方還會在 S.preds 留 6 秒）：不為牠切島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], preds: [{ kind: 'fox', mi: 1, done: true }], cap: 5000 });
  await run(ctx, 8, 300);
  assert.deepEqual(ctx.world.switches, []);
});

test('別座島的天敵要打的動物已經不在（官方 stepPreds 還沒結算的那一瞬間）：不為牠切島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: {} }], preds: [{ kind: 'fox', mi: 1 }], cap: 5000, noSettle: true });
  await run(ctx, 8, 300);
  assert.deepEqual(ctx.world.switches, []);
});

test('三座島：天敵在第 3 座，第 2 座同一格剛好也有動物——只切去第 3 座（天敵屬於哪座島要看 Pd.mi，不能只看格子）', async () => {
  const ctx = boot({
    tiles: { '0,0': growing() },
    maps: [{ tiles: { '2,2': hen() } }, { tiles: { '2,2': hen() } }],
    preds: [{ kind: 'fox', mi: 2 }],
    cap: 5000,
  });
  await run(ctx, 12, 300);
  assert.equal(ctx.world.switches[0], 2, '第一次切島就去第 3 座');
  assert.equal(ctx.world.switches.includes(1), false, '沒有白跑第 2 座');
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

test('切島前工具還沒切好（玩家用「建造」、家島沒事做）：這個週期先切工具、不算「為牠切過島」，下個週期照樣搶著切（標籤寫「狐狸出現了」，不是一般輪流的「那座有事做」）', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '2,2': hen() } }], preds: [{ kind: 'fox', mi: 1, untilIn: 60000 }], cap: 5000, sel: { tool: 'build' } });
  const seen = [];
  for (let i = 0; i < 6; i++) { await step(ctx, 300); seen.push(ctx.t.status); }
  assert.ok(seen.some((s) => /切換工具中（切島前）/.test(s)), '先切工具：' + JSON.stringify(seen));
  assert.ok(seen.some((s) => /^切到第 2 座島（狐狸出現了）/.test(s)), '搶著切島，不是一般輪流：' + JSON.stringify(seen));
});

test('點幾下讀遊戲設定的 chaseTaps：設成 8，腳本最多補到 8＋3 下，8 下就趕走（寫死 3 的話不夠）', async () => {
  const c8 = makeCfg();
  c8.predators.chaseTaps = 8;
  const ctx = boot({ cfg: c8, tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000 });
  await step(ctx, 100);
  assert.equal(ctx.world.S.preds[0].taps, 8);
  assert.equal(ctx.world.S.preds[0].by, 'player');
});

test('設定缺 predators、而遊戲其實要點 6 下：預設 3＋最多補 3 下，剛好夠（預設值被改小就不夠）', async () => {
  const c0 = makeCfg();
  delete c0.predators;
  const ctx = boot({ cfg: c0, tiles: { '2,2': hen() }, preds: [{ kind: 'fox' }], cap: 5000, chaseTaps: 6 });
  await step(ctx, 100);
  assert.equal(ctx.world.S.preds[0].taps, 6);
  assert.equal(ctx.world.S.preds[0].by, 'player');
});
