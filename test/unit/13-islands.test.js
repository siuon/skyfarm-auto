'use strict';
// 多座島（使用者 2026-11-16 起有了第 2 座島以上）：遊戲裡所有島都一直在運作，但點擊只作用在畫面上那座；
// 全島輪流（預設）時腳本自己點「農場 N」切島。規則見 skyfarm-auto.js「多座島」一節。
// 慣例：每座島的格子座標都不同，這樣從 acts 的 { k, cur } 就能看出「有沒有點錯島」。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, ripe, step } = require('../helpers/boot');
const { makeCfg } = require('../helpers/fixture-config');

const cfg = makeCfg();
const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const weed = () => ({ t: 'weed', v: 0 });
const growing = () => soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: false } }); // 還在長：沒事做
const ripeCrop = () => soil({ crop: ripe('wheat', cfg) });
const unit = (part, extra = {}) => Object.assign({ id: 'u', tier: 0, on: true, state: 'idle', needPart: part, wear: {} }, extra);
const press = (ctx, i) => ctx.doc._q1.get('#maps button[data-map="' + i + '"]').click(); // 玩家手動點「農場 N」
const wrongIsland = (ctx) => ctx.world.acts.filter((a) => (a.k.startsWith('1,') && a.cur !== 1) || (a.k.startsWith('2,') && a.cur !== 2) || (a.k.startsWith('0,') && a.cur !== 0));

// ───── 基本輪流：只去有事做的島、做完回家 ─────

test('家島沒事做、第 2 座有成熟作物：切過去收成，做完回家島；每一下點擊都在對的島上', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': ripeCrop() } }] });
  await run(ctx, 10);
  assert.deepEqual(ctx.world.switches, [1, 0], '去第 2 座、再回第 1 座');
  assert.equal(ctx.world.S.cur, 0);
  assert.equal(ctx.world.S.inv.wheat, 1, '第 2 座的作物收到了');
  assert.equal(ctx.world.S.maps[1].tiles['1,0'].crop.id, 'wheat', '收完補種（和所有空田一樣）');
  assert.deepEqual(wrongIsland(ctx), [], '沒有點錯島');
  assert.ok(ctx.world.acts.every((a) => a.k !== '1,0' || a.cur === 1));
  assert.equal(ctx.t.stats.hops, 2);
});

test('沒事做的島永遠不會被切過去：兩座島都只有還在長的作物，一次都不按「農場 N」', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': growing() } }, { tiles: { '2,0': growing() } }] });
  await run(ctx, 12);
  assert.deepEqual(ctx.world.switches, []);
});

test('三座島：從目前這座的下一座往後找有事做的，做完一座再去下一座，最後回家島', async () => {
  const ctx = boot({
    tiles: { '0,0': growing() },
    maps: [{ tiles: { '1,0': weed() } }, { tiles: { '2,0': weed() } }],
  });
  await run(ctx, 16);
  assert.deepEqual(ctx.world.switches, [1, 2, 0]);
  assert.equal(ctx.world.S.inv.weed, 2, '兩座島的雜草都拔了');
  assert.deepEqual(wrongIsland(ctx), []);
});

test('切島的那個週期不動手（不拿舊計畫去點新的島）；下個週期才在新的島上重新規劃', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }] });
  await step(ctx); // 乾跑發現第 2 座有事做 → 切過去
  assert.deepEqual(ctx.world.switches, [1]);
  assert.equal(ctx.world.acts.length, 0, '切島那個週期沒有任何點擊');
  assert.equal(ctx.world.S.cur, 1);
  await step(ctx);
  assert.equal(ctx.world.acts.length > 0, true);
  assert.equal(ctx.world.acts[0].cur, 1);
});

test('家島有事做時不切走：家島有雜草在拔，第 2 座也有事做，要等家島做完', async () => {
  const ctx = boot({ tiles: { '0,0': weed(), '0,1': weed(), '0,2': weed() }, maps: [{ tiles: { '1,0': weed() } }] });
  await step(ctx);
  assert.deepEqual(ctx.world.switches, [], '家島還有事做');
  await run(ctx, 12);
  assert.deepEqual(ctx.world.switches, [1, 0]);
  assert.equal(ctx.world.S.inv.weed, 4);
});

test('returnHome 關掉：做完不回家島，停在最後處理的那座', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }] }, { flags: { returnHome: false } });
  await run(ctx, 10);
  assert.deepEqual(ctx.world.switches, [1]);
  assert.equal(ctx.world.S.cur, 1);
});

// ───── 公平：占用太久、卡住 ─────

test('一座島占用太久（maxStayMs）、別座也有事做：讓出去輪下一座', async () => {
  const ctx = boot(
    { tiles: { '0,0': weed(), '0,1': weed(), '0,2': weed(), '0,3': weed() }, maps: [{ tiles: { '1,0': weed() } }] },
    { flags: { maxStayMs: 0, islandHopMinMs: 0 } }
  );
  await step(ctx);
  assert.deepEqual(ctx.world.switches, [1], '家島還有事做，但已經占用超過上限，別座有事做就切過去');
});

test('卡住（有事做但一直做不成，例如種子選不到）：stuckMs 之後讓出去，去別座做事', async () => {
  const ctx = boot(
    { tiles: { '0,0': soil() }, maps: [{ tiles: { '1,0': weed() } }], lockedTray: ['wheat'], coins: 1000 },
    { flags: { stuckMs: 3000, islandHopMinMs: 0 } }
  );
  await run(ctx, 4, 400);
  assert.deepEqual(ctx.world.switches, [], '還沒到卡住的時間，先留著');
  assert.match(ctx.t.status, /無法選用種子/);
  await run(ctx, 6, 1000);
  assert.deepEqual(ctx.world.switches.slice(0, 1), [1], '卡住了，去第 2 座');
  assert.equal(ctx.world.S.inv.weed, 1, '第 2 座的雜草拔了');
});

test('卡住的島會暫停一陣子再考慮：不會在兩座島之間來回彈', async () => {
  const ctx = boot(
    { tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': soil() } }], lockedTray: ['wheat'], coins: 1000 },
    { flags: { stuckMs: 2000, islandHopMinMs: 0, islandRetryMs: 30000 } }
  );
  await run(ctx, 24, 1000); // 24 秒
  assert.ok(ctx.world.switches.length <= 3, '切島次數有限：' + JSON.stringify(ctx.world.switches));
  assert.equal(ctx.world.S.cur, 0, '最後回到家島');
});

test('切過去什麼都沒做成的島（乾跑說有事、實際沒進展）：回家後暫停一陣子，不會一直切過去', async () => {
  const ctx = boot(
    { tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': soil() } }], lockedTray: ['wheat'], coins: 1000 },
    { flags: { stuckMs: 2000, islandHopMinMs: 0, islandRetryMs: 600000 } }
  );
  await run(ctx, 40, 1000);
  assert.equal(ctx.world.switches.filter((i) => i === 1).length, 1, '只去過一次');
});

// ───── 切不過去、玩家手動切島、工具 ─────

test('切島按鈕點了沒切成：這個週期不動手、那座島先暫停（islandRetryMs），不會每個週期狂按', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }], noSwitch: true });
  await step(ctx);
  assert.match(ctx.t.status, /切不到第 2 座島/);
  await run(ctx, 19, 1000);
  assert.equal(ctx.world.switches.length, 1, '30 秒內只試了一次');
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.t.enabled, true, '不是未知錯誤，不會關掉自動功能');
});

test('玩家手動切島：那座就是家島，userSwitchHoldMs 內腳本不自己切走；時間到了才去別座、做完回玩家看的那座', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': growing() } }, { tiles: { '2,0': growing() } }] });
  await run(ctx, 2);
  press(ctx, 1); // 玩家切到第 2 座
  ctx.world.S.maps[0].tiles['0,0'] = weed(); // 第 1 座有事做了
  await run(ctx, 8, 1000); // 8 秒，還在 30 秒的暫停內
  assert.deepEqual(ctx.world.switches, [1], '只有玩家按的那一下，腳本沒有自己切走');
  assert.equal(ctx.t.homeIsland, 1);
  await ctx.clock.advance(30000);
  await run(ctx, 12, 1000);
  assert.deepEqual(ctx.world.switches, [1, 0, 1], '時間到：去第 1 座做事，再回玩家看的第 2 座');
  assert.equal(ctx.world.S.cur, 1);
});

test('玩家手動切島後，腳本在玩家看的那座照常工作', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }] });
  await run(ctx, 1);
  press(ctx, 1);
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.weed, 1);
  assert.deepEqual(wrongIsland(ctx), []);
});

test('玩家的工具不是腳本用的四種（例如建造）：先切到收成工具才切島，不讓玩家下一次點擊落在別座島上', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }], sel: { tool: 'build' } });
  await step(ctx);
  assert.deepEqual(ctx.world.switches, [], '工具還沒切好，這個週期不切島');
  assert.match(ctx.t.status, /切換工具中（切島前）/);
  assert.equal(ctx.world.S.sel.tool, 'hand');
  await run(ctx, 3);
  assert.deepEqual(ctx.world.switches.slice(0, 1), [1]);
});

test('擴地模式中、有視窗開著時不切島（腳本整個暫停）', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }], expand: true });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.switches, []);
  ctx.world.setExpand(false);
  ctx.world.modal.hidden = false;
  ctx.world.modalTitle.textContent = '每日簽到';
  await run(ctx, 4);
  assert.deepEqual(ctx.world.switches, []);
});

// ───── 模式、略過、換存檔 ─────

test('Alt+Shift+M：全島輪流 ⇄ 只做這座；切到只做這座就不再切島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }] }, { enable: true });
  ctx.env.key('KeyM');
  assert.equal(ctx.t.CONFIG.islandMode, 'current');
  assert.match(ctx.t.note, /島嶼模式：只做畫面上這座/);
  await run(ctx, 8);
  assert.deepEqual(ctx.world.switches, []);
  ctx.env.key('KeyM');
  assert.equal(ctx.t.CONFIG.islandMode, 'all');
  assert.match(ctx.t.note, /島嶼模式：全島輪流/);
  await run(ctx, 8);
  assert.deepEqual(ctx.world.switches, [1, 0]);
});

test('skipIslands：列在裡面的島不會被自動切過去（編號從 1 起算）；你自己看著那座時照常處理', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }] }, { flags: { skipIslands: [2] } });
  await run(ctx, 8);
  assert.deepEqual(ctx.world.switches, []);
  press(ctx, 1);
  await run(ctx, 4);
  assert.equal(ctx.world.S.inv.weed, 1, '玩家自己切過去看著，照常處理');
});

test('存檔換了（島變少）：島嶼狀態全部重設，不丟錯、不用舊的家島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }, { tiles: { '2,0': growing() } }] });
  await run(ctx, 12);
  ctx.world.S.maps.pop();
  ctx.world.S.maps.pop();
  ctx.world.S.cur = 0;
  await run(ctx, 3);
  assert.equal(ctx.t.enabled, true);
  assert.equal(ctx.t.islandHint, '', '只剩一座島：沒有島嶼提示');
  assert.equal(ctx.t.islandState.size, 0);
});

// ───── 乾跑不能有副作用 ─────

test('乾跑規劃別座島：不點、不寫標籤、不動澆水記錄、不設「要賣出」旗標', async () => {
  const ctx = boot(
    { tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': soil({ m: 0, crop: { id: 'wheat', prog: 1, pest: false } }), '1,1': ripeCrop(), '1,2': weed() } }], cap: 8, inv: { wheat: 5, egg: 2 } },
    { enable: false }
  );
  ctx.t.setStatus('原本的狀態');
  const g = ctx.t.game();
  const wetBefore = ctx.t.wetting.size;
  const r = ctx.t.doFields(g, 1, true);
  assert.equal(r.work, true);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(ctx.t.wetting.size, wetBefore, '澆水記錄沒動');
  assert.equal(ctx.t.status, '原本的狀態', '狀態沒被改寫');
  assert.equal(ctx.t.needSell, false, '「要賣出」旗標沒被設；只在回傳值裡告訴呼叫端');
  assert.equal(ctx.world.toolBtn.hand.clicks + ctx.world.toolBtn.water.clicks + ctx.world.toolBtn.seed.clicks + ctx.world.toolBtn.care.clicks, 0, '沒有切工具');
});

test('別座島的「要先賣出」會套用到全域（倉庫、金幣共用）：第 2 座有空田但金幣不夠，在家島就賣掉倉庫的小麥換種子（還沒切過去）', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': soil() } }], coins: 0, cap: 1000, inv: { wheat: 5 } });
  await step(ctx); // 第一個週期：乾跑發現第 2 座缺種子錢 → 賣出流程（這個週期就用在賣出上）
  assert.deepEqual(ctx.world.storageUI.sold.map(([id]) => id), ['wheat']);
  assert.deepEqual(ctx.world.switches, [], '賣出是在家島觸發的，還沒切到第 2 座');
  assert.equal(ctx.world.S.player.coins, 5 * 15);
});

test('冷卻的鍵帶島編號：第 1 座某格在冷卻中，第 2 座同座標的格子不受影響', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: {} }] }, { flags: { islandHopMinMs: 0 } });
  await step(ctx); // 先跑一個週期，島嶼狀態整理好（第一個週期會重設冷卻記錄）
  ctx.world.S.maps[0].tiles['5,5'] = weed();
  ctx.world.S.maps[1].tiles['5,5'] = weed();
  ctx.t.cooldown.set('0|5,5', { kind: 'weed', fails: 3, until: 1e15 });
  await run(ctx, 10);
  assert.ok(ctx.world.S.maps[0].tiles['5,5'], '第 1 座的那格還在冷卻，沒被點');
  assert.equal(ctx.world.S.maps[1].tiles['5,5'], undefined, '第 2 座同座標的雜草拔掉了');
});

// ───── 換耗材：去有那種充電樁的島 ─────

test('機器人在等耗材、充電樁在第 2 座島：切過去換好，再回家島', async () => {
  const ctx = boot({
    tiles: { '0,0': growing() },
    maps: [{ tiles: { '1,0': { t: 'building', id: 'heavy_charger' } } }],
    fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 }, coins: 1000,
  });
  await run(ctx, 10);
  assert.equal(ctx.world.S.fleet.lumber[0].needPart, null, '換好了');
  assert.equal(ctx.world.unitPanels, 1);
  assert.deepEqual(ctx.world.switches, [1, 0]);
  assert.deepEqual(wrongIsland(ctx), []);
  assert.equal(ctx.world.modal.hidden, true);
});

test('只做這座模式：充電樁在別座島，標籤說明要切過去；不切島', async () => {
  const ctx = boot(
    { tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': { t: 'building', id: 'heavy_charger' } } }], fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 } },
    { flags: { islandMode: 'current' } }
  );
  await run(ctx, 6);
  assert.deepEqual(ctx.world.switches, []);
  assert.match(ctx.t.status, /這座島沒有重型充電樁，換不了耗材（切到有的島才換得了）/);
});

// ───── 標籤與診斷 ─────

test('標籤：有多座島時多一行「島 K/N（家 H）｜全島輪流｜切島 N 次」；小方格第三行是「島K/N」', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed() } }] });
  await run(ctx, 8);
  assert.match(ctx.t.badge.textContent, /島 1\/2｜全島輪流（家 1）｜切島 2 次/);
  ctx.t.badge.click();
  assert.match(ctx.t.badge.textContent, /^ON\n✓\d+\n島1\/2$/);
});

test('標籤：只有一座島時沒有島嶼那行；狀態列也沒有島嶼提示', async () => {
  const ctx = boot({ tiles: { '0,0': growing() } });
  await run(ctx, 3);
  assert.ok(!/全島輪流/.test(ctx.t.badge.textContent));
  assert.ok(!/座島|島 \d/.test(ctx.t.status), ctx.t.status);
});

test('標籤：你剛手動切島的暫停期間，狀態列寫「先不自己切走」', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': growing() } }] });
  await run(ctx, 2);
  press(ctx, 1);
  await run(ctx, 2);
  assert.match(ctx.t.status, /島 2\/2.*你剛切島，先不自己切走/);
});

test('診斷：每座島的概況與有沒有事做；摘要多一行島嶼模式與有事做的島', async () => {
  const ctx = boot({ tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': weed(), '1,1': ripeCrop() } }] }, { enable: false });
  const g = ctx.t.describeGame();
  assert.equal(g.islands.length, 2);
  assert.deepEqual({ ...g.islands[0] }, { island: 1, weeds: 0, poop: 0, ripe: 0, animalsWithProduct: 0, hasWork: false });
  assert.deepEqual({ ...g.islands[1] }, { island: 2, weeds: 1, poop: 0, ripe: 1, animalsWithProduct: 0, hasWork: true });
  assert.equal(g.maps.mode, 'all');
  ctx.env.key('KeyD');
  await ctx.clock.advance(0);
  assert.match(ctx.t.note, /島嶼：全島輪流｜有事做：2/);
});

test('預設值釘住（使用者 2026-11-16 決定：全島輪流、做完回家島）', () => {
  const { t } = boot({}, { enable: false });
  const C = t.CONFIG;
  assert.equal(C.islandMode, 'all');
  assert.deepEqual({ ...C.islandKey }, { code: 'KeyM', alt: true, shift: true, ctrl: false });
  assert.equal(C.returnHome, true);
  assert.equal(C.maxStayMs, 60000);
  assert.equal(C.stuckMs, 15000);
  assert.equal(C.islandRetryMs, 30000);
  assert.equal(C.islandHopMinMs, 2000);
  assert.equal(C.userSwitchHoldMs, 30000);
  assert.deepEqual([...C.skipIslands], []);
});

test('切過去發現其實沒事做（乾跑說有蟲要抓，但捉蟲工具用不了）：沒做成事就回家，並暫停那座島，不會一直來回彈', async () => {
  const pest = soil({ m: 3, crop: { id: 'wheat', prog: 1, pest: true } });
  const ctx = boot(
    { tiles: { '0,0': growing() }, maps: [{ tiles: { '1,0': pest } }], lockedTray: ['catch'] },
    { flags: { islandHopMinMs: 0, islandRetryMs: 30000 } }
  );
  await run(ctx, 20, 1000);
  assert.deepEqual(ctx.world.switches, [1, 0], '去了一次、回來一次，之後不再切過去');
  assert.equal(ctx.world.S.cur, 0);
  assert.match(ctx.t.status, /(捉蟲工具無法使用|島 1\/2)/);
});

// ───── 暫停時間不能算成「沒進展」（顧問審查提出的缺口）─────

test('玩家開視窗很久（超過 stuckMs）：關掉視窗後，腳本不會誤以為這座島卡住了而馬上切走', async () => {
  // 家島有事做但要先切工具（這種週期做不成任何事）；第 2 座也有事做
  const ctx = boot(
    { tiles: { '0,0': soil() }, maps: [{ tiles: { '1,0': weed() } }], coins: 1000, lockedTray: [] },
    { flags: { stuckMs: 3000, maxStayMs: 3000, islandHopMinMs: 0 } }
  );
  await step(ctx); // 整理好島嶼狀態（家島有播種的事做）
  const hops0 = ctx.world.switches.length;
  ctx.world.modal.hidden = false;
  ctx.world.modalTitle.textContent = '每日簽到';
  await run(ctx, 10, 2000); // 玩家開著視窗 20 秒：整個週期暫停
  ctx.world.modal.hidden = true;
  ctx.world.S.sel.tool = 'water'; // 關掉後工具不對，第一個週期只是切工具（沒有做成事）
  ctx.world.S.maps[0].tiles['0,0'] = soil();
  await step(ctx);
  assert.equal(ctx.world.switches.length, hops0, '關掉視窗的第一個週期不切島');
  assert.equal(ctx.t.islandState.size, 0, '沒有把家島記成卡住');
});

test('沒地方可去的卡住：同一次卡住只記一次失敗，退避時間不會被每個週期加倍拉長', async () => {
  const ctx = boot(
    { tiles: { '0,0': soil() }, maps: [{ tiles: { '1,0': growing() } }], lockedTray: ['wheat'], coins: 1000 },
    { flags: { stuckMs: 2000, islandHopMinMs: 0 } }
  );
  await run(ctx, 20, 1000);
  assert.equal(ctx.world.switches.length, 0, '第 2 座沒事做、家島卡住：沒有地方可去');
  assert.equal(ctx.t.islandState.get(0).fails, 1, '只記了一次');
});
