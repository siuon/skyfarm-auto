'use strict';
// 機器人自動換耗材（使用者 2026-11-16 要求）。
// 遊戲規則（讀原始碼＋隔離副本實測）：
//   - 伐木／採礦／整地機器人（重型充電樁）的耗材磨完就停工，遊戲規定要在充電樁面板按「換耗材」才換，
//     倉庫有備品也不自動換；面板按鈕在有備品時寫「換耗材」，沒備品時寫「買 1 個並換上（價格）」（會花金幣）。
//   - 其他機器人：倉庫有備品遊戲自己會換；沒備品就停工，要在「耗材」卡片按「買 1」，買了遊戲會自動換上。
// 腳本：有備品就換（免費）；沒備品且 buyPartsWhenShort 開著、買完金幣 ≥ minCoinsAfterBuyParts 才買 1 個。
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, soil, step } = require('../helpers/boot');

const run = async (ctx, n, ms = 500) => { for (let i = 0; i < n; i++) await step(ctx, ms); };
const heavy = () => ({ t: 'building', id: 'heavy_charger' });
const charger = () => ({ t: 'building', id: 'robot_charger' });
const unit = (part, extra = {}) => Object.assign({ id: 'u', tier: 0, on: true, state: 'idle', needPart: part, wear: {} }, extra);
const needing = (ctx) => Object.values(ctx.world.S.fleet).flat().filter((u) => u.needPart).length;
const farm = (o = {}, cfg = {}) => boot(Object.assign({ tiles: { '5,5': heavy() }, coins: 1000 }, o), cfg);

// ───── 重型機器人：倉庫有備品 → 按「換耗材」（免費）─────

test('伐木機器人鋸鏈磨完、倉庫有備品：開充電樁面板按「換耗材」，備品用掉 1 個、不花錢、面板關掉', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 2 } });
  await run(ctx, 4);
  const { world, t } = ctx;
  assert.equal(needing(ctx), 0, '換好了');
  assert.equal(world.S.inv.part_saw_chain, 1, '用掉 1 個備品');
  assert.equal(world.S.player.coins, 1000, '免費');
  assert.deepEqual(world.partBuys, []);
  assert.equal(world.unitPanels, 1);
  assert.equal(world.modal.hidden, true, '我們開的面板一定關掉');
  assert.equal(t.stats.parts, 1);
  assert.ok(t.lastActionAt > 0);
  assert.equal(world.acts[0].k, '5,5');
  assert.equal(world.acts[0].tool, 'hand', '用收成工具點充電樁');
  assert.match(t.badge.textContent, /換耗材 1/);
});

test('三種重型機器人同時等耗材、各有備品：一次面板全換完（按鈕順序對得上機器人與耗材）', async () => {
  const ctx = farm({
    fleet: { lumber: [unit('saw_chain')], mine: [unit('drill')], grade: [unit('blade')] },
    inv: { part_saw_chain: 1, part_drill: 1, part_blade: 1 },
  });
  await run(ctx, 4);
  assert.equal(needing(ctx), 0);
  assert.deepEqual({ ...ctx.world.S.inv }, {}, '三個備品都用掉');
  assert.equal(ctx.world.unitPanels, 1, '只開一次面板');
  assert.equal(ctx.world.S.player.coins, 1000);
});

test('同一台機器人沒耗材問題：什麼都不做，不開面板', async () => {
  const ctx = farm({ fleet: { lumber: [unit(null)] }, inv: { part_saw_chain: 2 } });
  await run(ctx, 4);
  assert.equal(ctx.world.unitPanels, 0);
  assert.equal(ctx.world.acts.length, 0);
});

// ───── 重型機器人：沒備品 → 買 1 個並換上（要設定允許、金幣夠）─────

test('沒備品：買 1 個並換上（鋸鏈 150 金幣），只買 1 個，不買折扣組', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, coins: 1000 });
  await run(ctx, 4);
  assert.equal(needing(ctx), 0);
  assert.equal(ctx.world.S.player.coins, 850);
  assert.deepEqual(ctx.world.partBuys, ['saw_chain']);
  assert.equal(ctx.world.S.inv.part_saw_chain, undefined, '買了就直接換上，倉庫不留');
  assert.equal(ctx.world.modal.hidden, true);
});

test('買完金幣要 ≥ minCoinsAfterBuyParts（100）：剛好 250 可以買鋸鏈（150），249 不行', async () => {
  let ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, coins: 250 });
  await run(ctx, 4);
  assert.equal(needing(ctx), 0, '250 - 150 = 100，剛好');
  ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, coins: 249 });
  await run(ctx, 4);
  assert.equal(needing(ctx), 1);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.equal(ctx.world.S.player.coins, 249, '一毛錢都沒花');
  assert.equal(ctx.world.modal.hidden, true, '買不起也要把面板關好');
  assert.match(ctx.t.status, /機器人耗材：缺鋸鏈（倉庫 0 個，金幣要 250 以上才買）/);
});

test('buyPartsWhenShort 關掉：沒備品就不買，標籤寫「不自動買」；有備品照換', async () => {
  let ctx = farm({ fleet: { lumber: [unit('saw_chain')] } }, { flags: { buyPartsWhenShort: false } });
  await run(ctx, 4);
  assert.equal(needing(ctx), 1);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.match(ctx.t.status, /缺鋸鏈（倉庫 0 個，不自動買）/);
  ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 } }, { flags: { buyPartsWhenShort: false } });
  await run(ctx, 4);
  assert.equal(needing(ctx), 0, '有備品照樣換');
});

test('autoSwapParts 關掉：完全不處理（不開面板）', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 } }, { flags: { autoSwapParts: false } });
  await run(ctx, 5);
  assert.equal(ctx.world.unitPanels, 0);
  assert.equal(needing(ctx), 1);
});

test('買不起時不會一直開面板：隔 partsRetryMs（60 秒）才再試，之後有錢就換好', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, coins: 100 });
  await run(ctx, 3);
  assert.equal(ctx.world.unitPanels, 1);
  await run(ctx, 8, 1000);
  assert.equal(ctx.world.unitPanels, 1, '60 秒內不重複開');
  ctx.world.S.player.coins = 500;
  await ctx.clock.advance(60000);
  await run(ctx, 3);
  assert.equal(needing(ctx), 0);
  assert.equal(ctx.world.unitPanels, 2);
});

test('兩台等不同耗材：先用備品換一台、另一台買；金幣只夠買一台就買一台，其餘留著寫原因', async () => {
  const ctx = farm({
    fleet: { lumber: [unit('saw_chain')], mine: [unit('drill')] },
    inv: { part_saw_chain: 1 }, coins: 380, // 鑽頭 250 + 保留 100 = 350 ≤ 380
  });
  await run(ctx, 4);
  assert.equal(needing(ctx), 0);
  assert.deepEqual(ctx.world.partBuys, ['drill']);
  assert.equal(ctx.world.S.player.coins, 130);
  const ctx2 = farm({ fleet: { lumber: [unit('saw_chain')], mine: [unit('drill')] }, coins: 400 });
  await run(ctx2, 4);
  assert.deepEqual(ctx2.world.partBuys, ['saw_chain'], '先買清單前面的鋸鏈（150，剩 250）');
  assert.equal(needing(ctx2), 1, '鑽頭 250 + 保留 100 > 250，買不起');
  assert.match(ctx2.t.status, /缺鑽頭/);
});

// ───── 其他機器人：遊戲自己換；沒備品才買（「耗材」卡片的「買 1」）─────

test('餵食機器人輪子磨完、沒備品：在「耗材」卡片買 1 個（50 金幣），遊戲自動換上', async () => {
  const ctx = boot({ tiles: { '2,2': charger() }, fleet: { feed: [unit('wheel')] }, coins: 1000 });
  await run(ctx, 4);
  assert.equal(needing(ctx), 0);
  assert.deepEqual(ctx.world.partBuys, ['wheel'], '只買 1 個（不是 5 個組）');
  assert.equal(ctx.world.S.player.coins, 950);
  assert.equal(ctx.world.S.inv.part_wheel, undefined);
  assert.equal(ctx.world.modal.hidden, true);
});

test('其他機器人但倉庫已有備品：遊戲會自己換，腳本不花錢（備品在的話，面板按鈕也不點）', async () => {
  const ctx = boot({ tiles: { '2,2': charger() }, fleet: { feed: [unit('wheel')] }, inv: { part_wheel: 1 }, coins: 1000 });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.partBuys, [], '有備品不買');
  assert.equal(ctx.world.S.player.coins, 1000);
});

test('兩台機器人都缺輪子：一個一個買，買一個遊戲就換一台，直到都換好', async () => {
  const ctx = boot({ tiles: { '2,2': charger() }, fleet: { feed: [unit('wheel'), unit('wheel')] }, coins: 1000 });
  await run(ctx, 5);
  assert.equal(needing(ctx), 0);
  assert.deepEqual(ctx.world.partBuys, ['wheel', 'wheel']);
  assert.equal(ctx.world.S.player.coins, 900);
});

test('其他機器人沒備品、金幣不夠（輪子 50 + 保留 100）：不買，標籤寫原因', async () => {
  const ctx = boot({ tiles: { '2,2': charger() }, fleet: { feed: [unit('wheel')] }, coins: 149 });
  await run(ctx, 4);
  assert.equal(needing(ctx), 1);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.match(ctx.t.status, /缺輪子（倉庫 0 個，金幣要 150 以上才買）/);
});

// ───── 該不該動手的各種限制 ─────

test('這座島沒有充電樁：不亂點別的格子，標籤說明；別座島才有的話要切過去', async () => {
  const ctx = boot({ tiles: { '1,1': soil() }, fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 } });
  await run(ctx, 4);
  assert.equal(ctx.world.unitPanels, 0);
  assert.equal(ctx.world.acts.filter((a) => a.k !== '1,1').length, 0);
  assert.match(ctx.t.status, /這座島沒有重型充電樁，換不了耗材/);
  assert.equal(needing(ctx), 1);
});

test('機器人被玩家關掉（on === false）：不替它換、更不買', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain', { on: false })] }, inv: { part_saw_chain: 1 } });
  await run(ctx, 4);
  assert.equal(ctx.world.unitPanels, 0);
  assert.equal(needing(ctx), 1);
});

test('同一個面板上有一台被關掉、一台開著都在等耗材：只替開著的換／買，關掉的那顆按鈕絕不按（它會花錢）', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain', { on: false })], mine: [unit('drill')] }, coins: 2000 });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.partBuys, ['drill'], '只買了採礦機器人的鑽頭');
  assert.equal(ctx.world.S.fleet.lumber[0].needPart, 'saw_chain', '關掉的伐木機器人沒被動');
  assert.equal(ctx.world.S.player.coins, 2000 - 250);
  const ctx2 = farm({ fleet: { lumber: [unit('saw_chain', { on: false })], mine: [unit('drill')] }, inv: { part_saw_chain: 1, part_drill: 1 } });
  await run(ctx2, 4);
  assert.equal(ctx2.world.S.inv.part_saw_chain, 1, '關掉的機器人的備品也沒被用掉');
  assert.equal(ctx2.world.S.inv.part_drill, undefined);
});

test('還沒買（tier < 0）的機器人格子、沒有設定資料的機器人種類：一律忽略', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain', { tier: -1 })], mystery: [unit('saw_chain')], mine: [unit('not_a_part')] }, inv: { part_saw_chain: 3 } });
  await run(ctx, 4);
  assert.equal(ctx.world.unitPanels, 0);
});

test('面板按鈕對不上機器人（遊戲改版、按鈕數量不同）：寧可不點，標籤寫原因', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')], mine: [unit('drill')] }, inv: { part_saw_chain: 1, part_drill: 1 } });
  // 模擬官方面板少畫一顆按鈕
  const orig = ctx.doc.querySelectorAll.bind(ctx.doc);
  ctx.doc.querySelectorAll = (sel) => { const r = orig(sel); return sel === '#modalBody .sw84 button[data-sw84]' ? r.slice(0, 1) : r; };
  await run(ctx, 3);
  assert.equal(needing(ctx), 2, '一顆都沒點');
  assert.match(ctx.t.status, /耗材面板的按鈕和機器人對不上，不自動換/);
  assert.equal(ctx.world.modal.hidden, true);
});

test('會花錢的按鈕標的價格和遊戲設定不一致：不按（防止官方改價或按錯東西）', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, coins: 1000 });
  const orig = ctx.doc.querySelectorAll.bind(ctx.doc);
  ctx.doc.querySelectorAll = (sel) => {
    const r = orig(sel);
    if (sel === '#modalBody .sw84 button[data-sw84]') for (const b of r) b.textContent = '買 1 個並換上（9,999）';
    return r;
  };
  await run(ctx, 3);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.equal(ctx.world.S.player.coins, 1000);
  assert.match(ctx.t.status, /鋸鏈的價格和預期不同，不自動買/);
});

test('面板開不起來（點了充電樁沒有面板）：不丟錯、關掉可能開出來的視窗、暫停後再試', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 }, noUnitPanel: true });
  await run(ctx, 3);
  assert.equal(ctx.t.enabled, true, '不是未知錯誤，不會關掉自動功能');
  assert.equal(ctx.world.modal.hidden, true);
  assert.match(ctx.t.status, /開不起重型充電樁面板/);
});

test('有玩家自己開的視窗時不動手（不搶玩家的面板）', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 } });
  ctx.world.modal.hidden = false;
  ctx.world.modalTitle.textContent = '重型充電樁';
  await run(ctx, 4);
  assert.equal(ctx.world.acts.length, 0);
  assert.equal(needing(ctx), 1);
});

test('擴地模式中不動手（點充電樁會被遊戲當成擴地點擊）', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 }, expand: true });
  await run(ctx, 4);
  assert.equal(ctx.world.expandTaps, 0);
  assert.equal(needing(ctx), 1);
});

test('換耗材優先於田裡的工作（先開面板、換好才回去做田）；工具不是收成時先切到收成', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 }, sel: { tool: 'water' } });
  await run(ctx, 4);
  assert.equal(needing(ctx), 0);
  assert.equal(ctx.world.toolBtn.hand.clicks >= 1, true);
});

test('耗材不在賣出範圍：賣作物時不會把備品賣掉；倉庫快滿的賣出照常', async () => {
  const ctx = boot({ cap: 20, inv: { wheat: 3, part_saw_chain: 2, part_drill: 1, egg: 10 }, coins: 100 });
  await run(ctx, 2);
  assert.deepEqual(ctx.world.storageUI.sold.map(([id]) => id), ['wheat']);
  assert.equal(ctx.world.S.inv.part_saw_chain, 2);
});

test('危險動作計數：整個流程沒有買機器人、沒有升級機器、沒有用農藥', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')], feed: [unit('wheel')] }, tiles: { '5,5': heavy(), '6,5': charger() } });
  await run(ctx, 8);
  assert.equal(needing(ctx), 0);
  assert.equal(ctx.world.upgrades, 0);
  assert.equal(ctx.world.chemUsed, 0);
  for (const id of ctx.world.partBuys) assert.match(id, /^(saw_chain|wheel)$/, '只買了這兩種耗材，各 1 個');
});

// ───── 診斷 ─────

test('診斷：等耗材的機器人台數（依耗材分）與倉庫備品；摘要有一行', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')], mine: [unit('drill'), unit('drill')], feed: [unit(null)] }, inv: { part_drill: 1 } }, { enable: false });
  const g = ctx.t.describeGame();
  assert.equal(g.robotParts.total, 3);
  assert.deepEqual({ ...g.robotParts.waiting }, { saw_chain: 1, drill: 2 });
  assert.deepEqual({ ...g.robotParts.stock }, { saw_chain: 0, drill: 1 });
  ctx.env.key('KeyD');
  await ctx.clock.advance(0);
  assert.match(ctx.t.note, /等耗材的機器人 3 台/);
});

test('預設值釘住（使用者 2026-11-16 決定：自動換、沒備品自動買 1 個、買完金幣要 ≥ 100）', () => {
  const { t } = boot({}, { enable: false });
  assert.equal(t.CONFIG.autoSwapParts, true);
  assert.equal(t.CONFIG.buyPartsWhenShort, true);
  assert.equal(t.CONFIG.minCoinsAfterBuyParts, 100);
  assert.equal(t.CONFIG.partsRetryMs, 60000);
});

// ───── 購買確認視窗（真遊戲：任何會花金幣的按鈕都先跳「確定要買嗎？」，按「確定購買」才買）─────

test('買耗材會先跳確認視窗：腳本核對內容後按「確定購買」，一次購買只按一次，視窗不會留下', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] } });
  await run(ctx, 4);
  const { world } = ctx;
  assert.equal(world.askShown, 1);
  assert.deepEqual(world.askLog, [['買 1 個並換上（150）', 150]]);
  assert.equal(world.askCancelled, 0);
  assert.equal(needing(ctx), 0);
  assert.deepEqual(world.partBuys, ['saw_chain']);
  assert.equal(ctx.doc.getElementById('ask47'), null, '沒有留下購買確認視窗');
  assert.equal(world.askNoAskBox.clicks, 0, '絕不碰「以後不再詢問」');
  assert.equal(world.askNoAskBox.checked, false);
});

test('其他機器人在「耗材」卡片買 1：確認視窗標題是「輪子 ×1」、價格 50，核對後才按', async () => {
  const ctx = boot({ tiles: { '2,2': charger() }, fleet: { feed: [unit('wheel')] } });
  await run(ctx, 4);
  assert.deepEqual(ctx.world.askLog, [['輪子 ×1', 50]]);
  assert.deepEqual(ctx.world.partBuys, ['wheel']);
  assert.equal(ctx.doc.getElementById('ask47'), null);
});

test('玩家勾過「以後不再詢問」（遊戲不跳確認視窗）：按鈕直接買，照樣只買需要的', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, noAsk: true });
  await run(ctx, 4);
  assert.equal(ctx.world.askShown, 0);
  assert.equal(needing(ctx), 0);
  assert.deepEqual(ctx.world.partBuys, ['saw_chain']);
});

test('確認視窗的價格和預期不同：按「取消」、不買、不留下視窗，標籤寫原因', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, askPrice: 999 });
  await run(ctx, 4);
  assert.equal(ctx.world.askShown, 1);
  assert.equal(ctx.world.askCancelled, 1);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.equal(ctx.world.S.player.coins, 1000);
  assert.equal(needing(ctx), 1);
  assert.equal(ctx.doc.getElementById('ask47'), null);
  assert.equal(ctx.world.modal.hidden, true);
  assert.match(ctx.t.status, /購買確認視窗的價格和預期不同（999），不按/);
});

test('確認視窗買的東西和預期不同（標題不是這個耗材）：按「取消」、不買', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, askTitle: '機器人升級' });
  await run(ctx, 4);
  assert.equal(ctx.world.askCancelled, 1);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.match(ctx.t.status, /買的東西和預期不同（機器人升級）/);
  assert.equal(ctx.doc.getElementById('ask47'), null);
});

test('「以後不再詢問」的勾選框被勾起來：不按確定，取消（腳本不改玩家設定，也不替玩家決定）', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, askNoAskChecked: true });
  await run(ctx, 4);
  assert.equal(ctx.world.askCancelled, 1);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.equal(ctx.world.askNoAskBox.clicks, 0);
});

test('確認視窗跳出時金幣在中途變少、買完會低於底線：不按確定，取消', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, coins: 400 });
  const orig = ctx.world.act;
  // 面板開著、按下買之前，玩家（或別的東西）花掉了金幣
  ctx.doc.querySelectorAll = ((f) => (sel) => { const r = f(sel); if (sel === '#modalBody .sw84 button[data-sw84]') ctx.world.S.player.coins = 220; return r; })(ctx.doc.querySelectorAll.bind(ctx.doc));
  await run(ctx, 4);
  assert.ok(orig);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.equal(ctx.doc.getElementById('ask47'), null);
});

test('免費換耗材（有備品）不會跳確認視窗，也不碰任何購買按鈕', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, inv: { part_saw_chain: 1 } });
  await run(ctx, 4);
  assert.equal(ctx.world.askShown, 0);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.equal(needing(ctx), 0);
});

test('一次最多買 4 個：5 台機器人都缺輪子，這次買 4 個、標籤寫原因，過了 partsRetryMs 再買第 5 個', async () => {
  const ctx = boot({ tiles: { '2,2': charger() }, fleet: { feed: [unit('wheel'), unit('wheel'), unit('wheel'), unit('wheel'), unit('wheel')] }, coins: 5000 });
  await run(ctx, 4);
  assert.equal(ctx.world.partBuys.length, 4);
  assert.equal(needing(ctx), 1);
  assert.match(ctx.t.status, /這次已經買了 4 個，先停/);
  assert.equal(ctx.doc.getElementById('ask47'), null);
  await ctx.clock.advance(60000);
  await run(ctx, 4);
  assert.equal(needing(ctx), 0);
  assert.equal(ctx.world.partBuys.length, 5);
});

test('跳出的是賣出確認視窗（有 .bs259）：絕不當成購買確認去按，取消', async () => {
  const ctx = farm({ fleet: { lumber: [unit('saw_chain')] }, askBs259: true });
  await run(ctx, 4);
  assert.equal(ctx.world.askCancelled, 1);
  assert.deepEqual(ctx.world.partBuys, []);
  assert.match(ctx.t.status, /跳出的是賣出確認視窗，不按/);
});
