'use strict';
/*
 * 假遊戲：只模擬「腳本會碰到的那部分遊戲行為」，行為依據我在官方遊戲（隔離副本）上實測與讀原始碼得到的結果：
 *   - act(x, y) 依目前工具做事（收成／播種／澆水／捉蟲／撿東西／餵動物／採果樹／收魚／機器小選單…）
 *   - 播種與照顧工具切換後要先點下方列的項目（none49）；「全部隱藏」時所有點擊都無效
 *   - 動物離家超過 0.55 格時，點牠的家要有 RT.lastAnimalTap 記號才算點到
 *   - 沿邊柵欄：用收成工具點有東西的格子，先跳「這一格有：」選單
 *   - 倉庫放不下時跳「農產倉庫滿了」視窗（測試會斷言這種視窗不該出現）
 * 它記錄「危險動作」計數（升級機器、用了農藥、點到沒蜂蜜的蜂箱而開出面板…）與「出貨了哪些肉用動物」，讓測試可以直接斷言。
 */
const { FakeEl } = require('./fake-dom');
const { makeCfg } = require('./fixture-config');

const ITEM_TOOLS = ['seed', 'care'];
const CLEAN = new Set(['weed', 'debris', 'weedball', 'poop']);

function attachWorld(env, o = {}) {
  const { win, doc } = env;
  const CFG = o.cfg || makeCfg();
  const S = {
    cur: o.cur || 0,
    maps: [{ tiles: Object.assign({}, o.tiles || {}), pools: o.pools || {} }].concat(
      (o.maps || []).map((m) => ({ tiles: Object.assign({}, m.tiles || {}), pools: m.pools || {} }))
    ),
    player: { level: o.level ?? 5, coins: o.coins ?? 1000, water: o.water ?? 100 },
    sel: Object.assign({ tool: 'hand', seed: 'wheat', care: 'catch', none49: false }, o.sel || {}),
    inv: Object.assign({}, o.inv || {}),
    settings: { autoBuyFeed: o.autoBuyFeed ?? true },
    fleet: JSON.parse(JSON.stringify(o.fleet || {})), // 機器人：{ 種類: [{ id, tier, on, needPart, wear… }] }
    pets: JSON.parse(JSON.stringify(o.pets || [])), // 寵物：[{ kind: 'dog'|'cat', hungry… }]
  };
  const RT = { mv: null, agents: Object.assign({}, o.agents || {}), pick53: null, lastAnimalTap: null, lastAnimalTapAt: 0 };
  let M = S.maps[S.cur]; // 目前顯示的那座島（切島時換掉）
  const edgeFence = new Set(o.edgeFence || []);
  const ckIds = new Set(o.ckIds || ['egg_hen']);
  const cap = o.cap ?? 100;

  const world = {
    S, RT, CFG, cap, edgeFence,
    switches: [], // 「農場 N」按鈕被按了幾次、依序切到哪座
    acts: [], // 每次 act 的紀錄
    fullPrompts: 0, // 跳出「農產倉庫滿了」的次數
    // 「絕不做」計數
    shipped: [], hivePanels: 0, upgrades: 0, chemUsed: 0, fertApplied: [], deletedWild: 0, boughtFeed: 0, coinsSpentOnFeed: 0,
    toasts: [],
    // 機器人面板
    unitPanels: 0, swaps: 0, partBuys: [], partCoinsSpent: 0,
    shopBuys: [], // 飼料商店買了什麼 [品項, 數量]
    askShown: 0, askCancelled: 0, askLog: [], // 購買確認視窗：跳出幾次、按了取消幾次、每次的標題與價格
  };

  // ───── 倉庫 ─────
  const used = () => Object.values(S.inv).reduce((a, b) => a + b, 0);
  const free = () => Math.max(0, cap - used());
  world.used = used;
  world.free = free;
  const add = (id, n) => { if (n > 0) S.inv[id] = (S.inv[id] || 0) + n; };
  const take = (id, n) => {
    const h = S.inv[id] || 0, k = Math.min(h, n);
    if (k > 0) { S.inv[id] = h - k; if (!S.inv[id]) delete S.inv[id]; }
    return k;
  };

  // ───── 登記遊戲畫面元素 ─────
  const storageText = doc.register('storageText', new FakeEl(doc, 'span'));
  Object.defineProperty(storageText, 'textContent', { get: () => '倉庫 ' + used() + '/' + cap, set() {}, configurable: true });
  const storageBtn = doc.register('storageBtn', new FakeEl(doc, 'button'));
  const modal = doc.register('modal', new FakeEl(doc, 'div'));
  modal.hidden = true;
  const modalTitle = doc.register('modalTitle', new FakeEl(doc, 'h2'));
  const modalClose = doc.register('modalClose', new FakeEl(doc, 'button'));
  const pop = doc.register('pick53', new FakeEl(doc, 'div'));
  pop.hidden = true;
  world.modal = modal; world.modalTitle = modalTitle; world.pop = pop; world.storageBtn = storageBtn;

  Object.defineProperty(world, 'M', { get: () => M, enumerable: true });
  // 右側的「農場 N」按鈕（#maps）：只有 2 座島以上才有；點了只換顯示的島，並結束擴地模式
  S.maps.forEach((_, i) => {
    const b = new FakeEl(doc, 'button');
    b.dataset.map = String(i);
    b.onclick = () => {
      world.switches.push(i);
      if (o.noSwitch) return; // 模擬「點了沒切成」
      S.cur = i;
      M = S.maps[i];
      world.setExpand(false);
    };
    doc.q1('#maps button[data-map="' + i + '"]', b);
  });
  // 左上的狀態列（#status）：擴地模式開著時，遊戲會在這裡放一個「擴地模式：點虛線區塊購買」的標籤
  const statusBar = doc.register('status', new FakeEl(doc, 'div'));
  world.statusBar = statusBar;
  world.expand = false; // 遊戲的「擴地模式」（UI.expand）
  world.expandTaps = 0; // 擴地模式下被遊戲吞掉（當成擴地點擊）的點擊次數
  world.setExpand = (on) => {
    world.expand = !!on;
    statusBar.textContent = on ? '擴地模式：點虛線區塊購買' : '';
  };
  if (o.expand) world.setExpand(true);

  // 工具列與下方的選項列
  const toolBtn = {};
  for (const id of ['hand', 'seed', 'water', 'care']) {
    const b = new FakeEl(doc, 'button');
    b.dataset.tool = id;
    b.onclick = () => {
      if (ITEM_TOOLS.includes(id) && id !== S.sel.tool) S.sel.none49 = true;
      S.sel.tool = id;
      world.setExpand(false); // 遊戲：切換工具就會結束擴地模式
    };
    doc.q1('#dock .tool[data-tool="' + id + '"]', b);
    toolBtn[id] = b;
  }
  const trayItem = {};
  const addTray = (id, on) => {
    const b = new FakeEl(doc, 'div');
    b.dataset.id = id;
    b.onclick = () => { on(); S.sel.none49 = false; };
    doc.q1('#tray .item[data-id="' + id + '"]', b);
    trayItem[id] = b;
  };
  for (const id of Object.keys(CFG.crops)) addTray(id, () => { S.sel.seed = id; });
  addTray('catch', () => { S.sel.care = 'catch'; });
  addTray('org', () => { S.sel.care = 'org'; });
  addTray('chem', () => { S.sel.care = 'chem'; }); // 腳本絕不該選這兩個：點下去會記成 chemUsed
  addTray('pesticide', () => { S.sel.care = 'pesticide'; });
  world.toolBtn = toolBtn; world.trayItem = trayItem;
  if (o.lockedTray) for (const id of o.lockedTray) trayItem[id].classList.add('locked');

  // ───── 小選單（#pick53）─────
  function showPopup(buttons, k) {
    pop.hidden = false;
    pop.children = [];
    pop._q1.clear();
    for (const [sel, el] of buttons) { pop.q1(sel, el); pop.appendChild(el); }
    RT.pick53 = k === undefined ? null : { k };
    world.popupOpenedFor = k;
  }
  function closePopup() {
    pop.hidden = true;
    pop.children = [];
    pop._q1.clear();
    RT.pick53 = null;
  }
  const mkBtn = (attr, val, fn, off = false) => {
    const b = new FakeEl(doc, 'button');
    b.dataset[attr] = val;
    if (off) b.classList.add('off61');
    b.onclick = () => { closePopup(); fn(); };
    return b;
  };

  // ───── 收進倉庫（放不下就跳「農產倉庫滿了」）─────
  function deliver(goods, finalize) {
    goods = goods.filter((g) => g.qty > 0);
    const total = goods.reduce((a, g) => a + g.qty, 0);
    if (total <= free()) {
      for (const g of goods) add(g.id, g.qty);
      finalize();
      return true;
    }
    world.fullPrompts += 1;
    modal.hidden = false;
    modalTitle.textContent = '農產倉庫滿了';
    const cancel = doc.register('fullCancel', new FakeEl(doc, 'button'));
    cancel.onclick = () => { modal.hidden = true; modalTitle.textContent = ''; doc.byId.delete('fullCancel'); };
    return false;
  }

  // ───── 飼料 ─────
  function payFeed(item, qty) {
    const have = S.inv[item] || 0, use = Math.min(have, qty), miss = qty - use, cost = miss * (CFG.feedShop[item] || 0);
    if (miss > 0 && (!S.settings.autoBuyFeed || S.player.coins < cost)) return { ok: false };
    take(item, use);
    if (miss > 0) { world.boughtFeed += miss; world.coinsSpentOnFeed += cost; S.player.coins -= cost; }
    return { ok: true };
  }
  const isAdult = (T, A) => T.stage >= A.growStages;
  const canFeed = (T, A) => {
    if (T.timer > 0) return false;
    if (!isAdult(T, A)) return true;
    if (A.type === 'meat') return false;
    return T.cycles > 0;
  };
  const feedNeed = (T, A) => (isAdult(T, A) ? A.cycleFeedQty : A.stageFeedQty);
  function feedAnimal(T, A) {
    const r = payFeed(A.feedItem, feedNeed(T, A));
    if (!r.ok) return r;
    if (!isAdult(T, A)) T.timer = A.stageSeconds;
    else { T.timer = A.cycleSeconds; T.cycles -= 1; }
    return r;
  }

  // ───── 各種點擊 ─────
  function tapAnimal(k, T) {
    const A = CFG.animals[T.id];
    if (A.type === 'meat' && isAdult(T, A)) {
      world.shipped.push(k); // 長大了的肉用動物：點下去 1 份肉進倉庫、動物消失（官方 tapAnimal）
      deliver([{ id: A.productItem, qty: 1 }], () => { delete M.tiles[k]; });
      return;
    }
    if (T.stack > 0) {
      deliver([{ id: A.productItem, qty: T.stack }], () => {
        T.stack = 0;
        if (canFeed(T, A)) feedAnimal(T, A);
      });
      return;
    }
    if (canFeed(T, A)) {
      if (ckIds.has(T.id)) {
        // 餓了的雞、鴨：先跳小選單，按「餵食」才餵
        showPopup([['button[data-ck248="feed"]', mkBtn('ck248', 'feed', () => { feedAnimal(T, A); })]], k);
        return;
      }
      feedAnimal(T, A);
    }
  }

  // 蜂箱（官方：收成工具點蜂箱，有蜂蜜就整箱收進倉庫；沒有就開蜂箱面板）
  const honeyStored = (T) => Object.values(T.honey || {}).reduce((a, b) => a + b, 0);
  function tapHive(T) {
    if (!honeyStored(T)) { world.hivePanels += 1; modal.hidden = false; modalTitle.textContent = '蜂箱'; return; }
    const goods = Object.entries(T.honey).filter(([, n]) => n > 0).map(([id, qty]) => ({ id, qty }));
    deliver(goods, () => { T.honey = {}; });
  }

  function poolCells(P) { return P.tiles.map((t) => M.tiles[t]).filter((T) => T && T.t === 'pool' && T.fish); }
  function tapPool(P) {
    const cells = poolCells(P);
    const ready = cells.filter((T) => T.stage >= CFG.fish[T.fish].stages);
    if (ready.length) {
      let bonus = 0;
      for (const s of CFG.fishPool.sizeBonus) if (P.n >= s.minTiles) bonus = s.bonus;
      const by = {};
      for (const T of ready) by[T.fish] = (by[T.fish] || 0) + 1;
      const goods = Object.entries(by).map(([id, n]) => ({ id, qty: Math.round(n * (1 + bonus)) }));
      deliver(goods, () => { for (const T of ready) { T.fish = null; T.stage = 0; T.timer = 0; } });
      return;
    }
    const hungry = cells.filter((T) => !(T.timer > 0) && T.stage < CFG.fish[T.fish].stages);
    if (!hungry.length) return;
    const need = {};
    for (const T of hungry) { const F = CFG.fish[T.fish]; need[F.feedItem] = (need[F.feedItem] || 0) + F.stageFeedQtyPerTile; }
    const canPay = (item, q) => {
      const miss = Math.max(0, q - (S.inv[item] || 0));
      return miss === 0 || (S.settings.autoBuyFeed && S.player.coins >= miss * (CFG.feedShop[item] || 0));
    };
    if (!Object.entries(need).every(([item, q]) => canPay(item, q))) return;
    for (const [item, q] of Object.entries(need)) payFeed(item, q);
    for (const T of hungry) T.timer = CFG.fish[T.fish].stageSeconds;
  }

  function machineOut(T) { return T.out > 0 ? T.out : T.state === 'done' ? 1 : 0; }
  function machineMenu(k, T) {
    const D = CFG.machines[T.id];
    const out = machineOut(T);
    const MU = CFG.machineUpgrade;
    const lvl = Math.max(1, Math.min(MU.maxLevel, T.lvl || 1));
    const capN = 1 + (lvl - 1) * MU.batchesPerLevel;
    const usedN = (T.run ? 1 : 0) + (T.q || 0) + (T.out || 0);
    let canN = capN - usedN;
    for (const [id, q] of Object.entries(D.input)) canN = Math.min(canN, Math.floor((S.inv[id] || 0) / q));
    const buttons = [
      ['button[data-m61="load"]', mkBtn('m61', 'load', () => {
        for (const [id, q] of Object.entries(D.input)) take(id, q * canN);
        // 和官方 loadMachine61 一樣：沒在做就先開第一批，其餘的排隊（T.q）；一次投到放滿或材料用完
        let left = canN;
        if (!T.run) { T.run = true; left -= 1; }
        T.q = (T.q || 0) + left;
        T.state = 'working';
        T.loaded = (T.loaded || 0) + canN;
      }, canN <= 0)],
      ['button[data-m61="collect"]', mkBtn('m61', 'collect', () => {
        const goods = Object.entries(D.output).map(([id, q]) => ({ id, qty: q * out }));
        deliver(goods, () => { T.out = 0; T.state = T.run ? 'working' : 'idle'; });
      }, out <= 0)],
      ['button[data-m61="stats"]', mkBtn('m61', 'stats', () => {})],
      ['button[data-m61="upgrade"]', mkBtn('m61', 'upgrade', () => { world.upgrades += 1; })],
    ];
    showPopup(buttons, k);
  }

  function actCore(x, y) {
    const k = x + ',' + y, T = M.tiles[k], tool = S.sel.tool;
    // 播種／照顧等「要先選一個」的工具：沒選時，只有「既有的東西」點得動，空地與雜草都擋下
    // 官方 noSelBlocks49：沒有東西、或是雜草 → 擋；播種工具 → 只有「空田」擋（播種要有選種子）；照顧工具 → 一律擋
    if (S.sel.none49 && ITEM_TOOLS.includes(tool)) {
      const blocked = !T || T.t === 'weed' || (tool === 'seed' && T.t === 'soil' && !T.crop && !T.flower) || tool === 'care';
      if (blocked) { world.toasts.push('先從下面選一個，再點地圖'); return; }
    }
    // 沿邊柵欄：用收成工具點有東西的格子，先問要動哪一個
    if (tool === 'hand' && T && !CLEAN.has(T.t) && !(T.t === 'deco' && T.id === 'fence') && edgeFence.has(k) && !world.efSkip) {
      showPopup([['button[data-oe2543="tile"]', mkBtn('oe2543', 'tile', () => { world.efSkip = true; try { actCore(x, y); } finally { world.efSkip = false; } })]], k);
      return;
    }
    if (T && T.t === 'building' && !['store', 'remove'].includes(tool)) { openUnitPanel(T.id); return; }
    if (tool === 'care') { // 照顧工具
      if (T && T.t === 'soil' && T.crop) {
        if (S.sel.care === 'catch') {
          if (T.crop.pest) { T.crop.pestTaps = (T.crop.pestTaps || 0) + 1; if (T.crop.pestTaps >= 3) { T.crop.pest = false; T.crop.pestTaps = 0; } }
        } else if (S.sel.care === 'org') { // 有機肥（遊戲 careAt：這一季只能施一次；已成熟、枯萎不能施；倉庫要有有機肥）
          const H = T.crop, C = CFG.crops[H.id];
          if (H.fert) world.toasts.push('這一季已經施過有機肥了');
          else if (H.wither) world.toasts.push('作物枯萎了，先澆水救回來');
          else if (H.prog >= C.growSeconds) world.toasts.push('已經成熟了，收成後下一季再施肥');
          else if (!((S.inv.organic_fert || 0) > 0)) world.toasts.push('倉庫裡沒有有機肥');
          else if (world.fertBlocked) world.toasts.push('（測試：點了沒效果）');
          else { take('organic_fert', 1); H.fert = 'org'; world.fertApplied.push(k); }
        } else { world.chemUsed += 1; }
      } else if (T && T.t === 'tree') {
        if (S.sel.care === 'catch') {
          if (T.pest) { T.pestTaps = (T.pestTaps || 0) + 1; if (T.pestTaps >= 3) { T.pest = false; T.pestTaps = 0; } }
        } else { world.chemUsed += 1; }
      }
      return;
    }
    // 糞便、碎石、草球：除了鏟子，任何工具點下去都撿掉
    if (T && T.t === 'poop') { deliver([{ id: 'poop', qty: 1 }], () => { delete M.tiles[k]; }); return; }
    if (T && T.t === 'debris') { delete M.tiles[k]; return; }
    if (T && T.t === 'weedball') {
      const n = T.n, room = Math.min(n, free());
      add('weed', room); S.player.coins += n - room; delete M.tiles[k]; return;
    }
    if (T && T.t === 'weed') {
      if (['hand', 'seed'].includes(tool)) { if (free() >= 1) add('weed', 1); else S.player.coins += 1; delete M.tiles[k]; }
      return;
    }
    // 被吹歪的裝飾、倒下的柵欄：除了「移除／收回」，任何工具點下去都扶正；但收成工具會先碰到野生植物（拔掉）
    if (T && T.t === 'deco') {
      if (tool === 'hand' && T.wild40) { world.deletedWild += 1; delete M.tiles[k]; return; }
      if (T.id === 'fence' && T.fallen && !['remove', 'store'].includes(tool)) { T.fallen = false; return; }
      if (T.tilt && !['remove', 'store'].includes(tool)) { T.tilt = 0; return; }
      return;
    }
    if (tool === 'water') {
      if (T && (T.t === 'soil' || T.t === 'tree') && S.player.water >= CFG.rules.waterPerTap && T.m < CFG.rules.moistMaxLevel) {
        S.player.water -= CFG.rules.waterPerTap;
        T.m = Math.min(CFG.rules.moistMaxLevel, (T.m || 0) + 1);
        if (T.crop && T.crop.wither) T.crop.wither = false;
      }
      return;
    }
    if (tool === 'hand' && T && T.t === 'device' && CFG.devices[T.id] && CFG.devices[T.id].kind === 'hive') { tapHive(T); return; }
    if (tool !== 'hand' && tool !== 'seed') return;
    if (T && T.t === 'soil') {
      if (T.crop) {
        const C = CFG.crops[T.crop.id];
        if (!T.crop.wither && T.crop.prog >= C.growSeconds) deliver([{ id: T.crop.org ? 'org_' + T.crop.id : T.crop.id, qty: C.yield }], () => { T.crop = null; });
        return;
      }
      if (tool === 'seed' && !T.flower) {
        const C = CFG.crops[S.sel.seed];
        if (S.player.coins >= C.seedCost) { S.player.coins -= C.seedCost; T.crop = { id: S.sel.seed, prog: 0, pest: false }; }
      }
      return;
    }
    if (T && T.t === 'tree') {
      const D = CFG.trees[T.id];
      if (T.prog >= (T.first ? D.firstFruitSeconds : D.fruitIntervalSeconds)) deliver([{ id: T.id, qty: 1 }], () => { T.prog = 0; T.first = false; });
      return;
    }
    if (T && T.t === 'animal') { tapAnimal(k, T); return; }
    if (T && T.t === 'pool') {
      const pk = Object.keys(M.pools).find((p) => M.pools[p].tiles.includes(k));
      if (tool === 'hand') { showPopup([['button[data-p56="pool"]', mkBtn('p56', 'pool', () => tapPool(M.pools[pk]))]], k); return; } // 收成工具：跳小選單
      if (pk) tapPool(M.pools[pk]);
      return;
    }
    if (T && T.t === 'machine') { machineMenu(k, T); }
  }

  // 最外層：「全部隱藏」時所有點擊無效；動物離家要有點擊記號
  function act(x, y) {
    const k = x + ',' + y, T = M.tiles[k];
    world.acts.push({ k, cur: S.cur, tool: S.sel.tool, care: S.sel.care, none49: S.sel.none49, type: T && T.t, id: T && T.id });
    if (doc.body.classList.contains('ui-hide')) return;
    if (world.expand) { world.expandTaps += 1; return; } // 擴地模式：點地圖一律當成「點虛線區塊擴地」，已有的格子什麼都不會發生
    if (T && T.t === 'animal') {
      const ag = RT.agents[S.cur + ':' + k];
      const near = !ag || Math.hypot(ag.x - x, ag.y - y) <= 0.55;
      const marked = RT.lastAnimalTap === k && win.performance.now() - (RT.lastAnimalTapAt || 0) < 400;
      if (!near && !marked && ['hand', 'animal', 'remove', 'store', 'move', 'care'].includes(S.sel.tool)) { RT.lastAnimalTap = null; return; }
    }
    RT.lastAnimalTap = null;
    actCore(x, y);
    if (world.afterAct) world.afterAct(k); // 測試用：每次點完呼叫（模擬「點的當中，遊戲狀態被別的東西改了」）
  }
  world.act = act;

  // ───── 機器人充電樁面板（官方 openUnitPanel：重型機器人的「要換耗材」卡片＋「耗材」卡片）─────
  const PARTS = () => (CFG.consumables && CFG.consumables.parts) || {};
  const heavyKinds = () => Object.keys((CFG.terrain243 && CFG.terrain243.robots && CFG.terrain243.robots.kinds) || {});
  const needOf = (base) => heavyKinds()
    .filter((k) => CFG.robots.kinds[k] && CFG.robots.kinds[k].base === base)
    .flatMap((k) => (S.fleet[k] || []).filter((u) => u.tier >= 0 && u.needPart).map((u) => ({ k, u })));
  // 官方 buyAsk47：任何會花金幣的按鈕按下去，先跳「確定要買嗎？」（#ask47），按「確定購買」才真的買。
  // 玩家勾過「以後不再詢問」（o.noAsk）就不會跳。o.askTitle／o.askPrice 讓測試模擬「視窗內容和預期不同」。
  const ASK_SELS = ['#ask47 h3', '#ask47 .tot47', '#ask47 #ask47y', '#ask47 #ask47c', '#ask47 #ask47no', '#ask47 .bs259'];
  function closeAsk47() { doc.byId.delete('ask47'); for (const sel of ASK_SELS) doc.q1(sel, null); }
  function askBuy(title, price, onOk) {
    if (o.noAsk) { onOk(); return; }
    world.askShown += 1;
    world.askLog.push([title, price]);
    doc.register('ask47', new FakeEl(doc, 'div'));
    const h3 = new FakeEl(doc, 'h3'); h3.textContent = o.askTitle ?? title;
    const tot = new FakeEl(doc, 'div'); tot.textContent = '價格' + (o.askPrice ?? price).toLocaleString('en-US');
    const yes = new FakeEl(doc, 'button'); yes.textContent = '確定購買'; yes.disabled = S.player.coins < price;
    const no = new FakeEl(doc, 'button'); no.textContent = '取消';
    const chk = new FakeEl(doc, 'input'); chk.checked = !!o.askNoAskChecked;
    yes.onclick = () => { closeAsk47(); onOk(); };
    no.onclick = () => { closeAsk47(); world.askCancelled += 1; };
    doc.q1('#ask47 h3', h3); doc.q1('#ask47 .tot47', tot); doc.q1('#ask47 #ask47y', yes); doc.q1('#ask47 #ask47c', no); doc.q1('#ask47 #ask47no', chk);
    if (o.askBs259) doc.q1('#ask47 .bs259', new FakeEl(doc, 'div')); // 模擬：跳出的其實是賣出確認視窗
    world.askYes = yes; world.askNo = no; world.askNoAskBox = chk;
  }
  // 官方 stepPartsAutoFit：倉庫有備品就替「不是手動換」的機器人自動換上（重型機器人不會）
  function fitPartsNow() {
    for (const kind of Object.keys(S.fleet)) {
      for (const u of S.fleet[kind]) {
        if (!u.needPart || (PARTS()[u.needPart] || {}).manualSwap) continue;
        if (take('part_' + u.needPart, 1)) { u.needPart = null; u.wear = {}; }
      }
    }
  }
  world.fitPartsNow = fitPartsNow;
  function clearUnitPanel() {
    for (const m of [doc._q1, doc._qa]) for (const key of Array.from(m.keys())) if (key.startsWith('#modalBody .sw84') || key.startsWith('#modalBody .partcard')) m.delete(key);
  }
  function openUnitPanel(base) {
    world.unitPanels += 1;
    if (o.noUnitPanel) return;
    modal.hidden = false;
    modalTitle.textContent = (CFG.buildings[base] || {}).name || base;
    renderUnitPanel(base);
  }
  function renderUnitPanel(base) {
    clearUnitPanel();
    const need = needOf(base);
    if (need.length) {
      const box = new FakeEl(doc, 'div');
      box.classList.add('sw84');
      const btns = need.map(({ u }, i) => {
        const P = PARTS()[u.needPart];
        const b = new FakeEl(doc, 'button');
        b.dataset.sw84 = String(i);
        b.textContent = (S.inv['part_' + u.needPart] || 0) > 0 ? '換耗材' : '買 1 個並換上（' + P.price.toLocaleString('en-US') + '）';
        const fix = () => { u.needPart = null; u.wear = {}; world.swaps += 1; renderUnitPanel(base); };
        b.onclick = () => { // 官方 swapPart84：有備品就用備品（免費、不問），沒有就買 1 個（先跳確認視窗）再換上
          if ((S.inv['part_' + u.needPart] || 0) > 0) { take('part_' + u.needPart, 1); fix(); return; }
          if (S.player.coins < P.price) { world.toasts.push('金幣不夠'); return; }
          askBuy(b.textContent, P.price, () => {
            S.player.coins -= P.price; world.partCoinsSpent += P.price; world.partBuys.push(u.needPart);
            fix();
          });
        };
        return b;
      });
      doc.q1('#modalBody .sw84', box);
      doc.q('#modalBody .sw84 button[data-sw84]', btns);
    }
    // 「耗材」卡片：這種充電樁的機器人用到的耗材，各有「買 1／5／10」
    const kinds = Object.keys(CFG.robots.kinds).filter((k) => CFG.robots.kinds[k].base === base);
    const ids = Object.keys(PARTS()).filter((id) => PARTS()[id].for.some((k) => kinds.includes(k)));
    if (ids.length) {
      doc.q1('#modalBody .partcard', new FakeEl(doc, 'div'));
      for (const id of ids) {
        for (const q of [1, 5, 10]) {
          const b = new FakeEl(doc, 'button');
          b.dataset.part = id; b.dataset.q = String(q);
          b.onclick = () => { // 官方 buyParts：花金幣（5 個 9 折、10 個 8 折）、進倉庫，並立刻替等耗材的機器人換上
            const d = q >= 10 ? 0.8 : q >= 5 ? 0.9 : 1, cost = Math.round(PARTS()[id].price * q * d);
            if (S.player.coins < cost) { world.toasts.push('金幣不夠'); return; }
            askBuy(PARTS()[id].name + ' ×' + q, cost, () => {
              S.player.coins -= cost; world.partCoinsSpent += cost; world.partBuys.push(id + (q > 1 ? '×' + q : ''));
              add('part_' + id, q); fitPartsNow(); renderUnitPanel(base);
            });
          };
          doc.q1('#modalBody .partcard button[data-part="' + id + '"][data-q="' + q + '"]', b);
        }
      }
    }
  }

  // ───── 倉庫的「飼料商店」分頁（官方 openStorage('shop')）：每種飼料有「買 10 個」「買 50 個」─────
  // 寵物（貓、狗）的飼料由遊戲自己從倉庫扣：官方 stepPets 時間到了 petEat，倉庫有就餵、沒有就餓著
  function feedPetsNow() {
    for (const P of S.pets) {
      if (!P.hungry) continue;
      const item = P.kind === 'dog' ? 'dog_food' : 'cat_food';
      if (take(item, 1)) P.hungry = false;
    }
  }
  world.feedPetsNow = feedPetsNow;
  function clearShop() {
    for (const m of [doc._q1, doc._qa]) for (const key of Array.from(m.keys())) if (key.startsWith('#modalBody button[data-buy="')) m.delete(key);
  }
  function renderShop() {
    clearShop();
    for (const [id, price] of Object.entries(CFG.feedShop || {})) {
      for (const q of [10, 50]) {
        const b = new FakeEl(doc, 'button');
        b.dataset.buy = id; b.dataset.q = String(q);
        b.onclick = () => { // 官方：放不下提示、花金幣（先跳確認視窗）、進倉庫
          const cost = q * price;
          if (q > free()) { world.toasts.push('倉庫只剩 ' + free() + ' 格'); return; }
          if (S.player.coins < cost) { world.toasts.push('金幣不夠'); return; }
          askBuy(CFG.items[id].name + ' ×' + q, cost, () => {
            S.player.coins -= cost; add(id, q); world.shopBuys.push([id, q]);
            feedPetsNow(); renderShop();
          });
        };
        doc.q1('#modalBody button[data-buy="' + id + '"][data-q="' + q + '"]', b);
      }
    }
  }
  const tabShop = new FakeEl(doc, 'button');
  tabShop.dataset.k = 'shop';
  tabShop.onclick = () => { tabShop.classList.add('on'); renderShop(); };
  doc.q1('#modalTabs button[data-k="shop"]', tabShop);

  // ───── 倉庫視窗與批次賣出（腳本用 DOM 操作這一段）─────
  const ui = {
    selected: new Set(), confirmMissing: !!o.confirmMissing, noRows: !!o.noRows, opens: 0, sold: [],
    preselect: o.preselect || [], // 玩家之前留下的勾選
    noGoButton: !!o.noGoButton, noOpen: !!o.noOpen, purchaseYes: null,
    // 賣出確認視窗的故障情境（測試「賣出前逐列回讀驗證、對不上就取消」用）
    noQtyRows: !!o.noQtyRows, // 視窗沒有逐列數量（找不到 .r259）
    minusBroken: !!o.minusBroken, // 按「−」沒反應（數量調不下去）
    extraRows: o.extraRows || [], // 視窗多出我們沒勾的物品列
  };
  world.storageUI = ui;
  const tabProduce = new FakeEl(doc, 'button');
  tabProduce.dataset.k = 'produce';
  doc.q1('#modalTabs button[data-k="produce"]', tabProduce);
  const clrBtn = new FakeEl(doc, 'button');
  const goBtn = new FakeEl(doc, 'button');
  ui.clrBtn = clrBtn; ui.goBtn = goBtn;
  const refreshBar = () => {
    doc.q1('#bsbar259 [data-bsclr259]', ui.selected.size ? clrBtn : null);
    doc.q1('#bsbar259 [data-bsgo259]', ui.selected.size && !ui.noGoButton ? goBtn : null);
  };
  clrBtn.onclick = () => { ui.selected.clear(); for (const r of ui.rows || []) r.cb.checked = false; refreshBar(); };
  goBtn.onclick = () => {
    const ask = doc.register('ask47', new FakeEl(doc, 'div'));
    const yes = new FakeEl(doc, 'button');
    const no = new FakeEl(doc, 'button');
    // 官方 openBatch259 的逐列數量：每種一列，預設全數；「−」減一、減到 0 那列自動取消勾選；按「確定賣出」才照各列數量賣
    const dRows = [];
    const addRow = (id) => {
      const R = { id, q: S.inv[id] || 0, on: true };
      const row = new FakeEl(doc, 'div');
      row.dataset.id = id;
      const minus = new FakeEl(doc, 'button');
      minus.dataset.d = '-1';
      const qty = new FakeEl(doc, 'input');
      qty.value = String(R.q);
      const box = new FakeEl(doc, 'input');
      box.checked = true;
      minus.onclick = () => {
        if (ui.minusBroken) return;
        R.q = Math.max(0, R.q - 1);
        if (R.q <= 0) { R.on = false; box.checked = false; }
        qty.value = String(R.q);
      };
      row.q1('button[data-d="-1"]', minus);
      row.q1('input[type=number]', qty);
      row.q1('input.rc259', box);
      R.row = row;
      dRows.push(R);
    };
    if (!ui.noQtyRows) {
      for (const id of ui.selected) addRow(id);
      for (const id of ui.extraRows) addRow(id);
      doc.q('#ask47 .bs259 .r259', dRows.map((r) => r.row));
    }
    yes.onclick = () => {
      if (dRows.length) {
        for (const R of dRows) {
          if (!R.on || R.q <= 0) continue;
          const n = Math.min(R.q, S.inv[R.id] || 0);
          ui.sold.push([R.id, n]);
          S.player.coins += n * (CFG.items[R.id].sellPrice || 0);
          S.inv[R.id] = (S.inv[R.id] || 0) - n;
          if (S.inv[R.id] <= 0) delete S.inv[R.id];
        }
      } else {
        for (const id of ui.selected) {
          const n = S.inv[id] || 0;
          ui.sold.push([id, n]);
          S.player.coins += n * (CFG.items[id].sellPrice || 0);
          delete S.inv[id];
        }
      }
      ui.selected.clear();
      refreshBar();
      doc.byId.delete('ask47');
      closeAsk();
    };
    no.onclick = () => closeAsk();
    const closeAsk = () => {
      doc.byId.delete('ask47');
      for (const sel of ['#ask47 .bs259 #ask47y', '#ask47 .bs259 #ask47c', '#ask47y']) doc.q1(sel, null);
      doc.q('#ask47 .bs259 .r259', []);
    };
    doc.q1('#ask47y', yes); // 購買確認視窗也有同樣的 #ask47y
    if (!ui.confirmMissing) {
      doc.q1('#ask47 .bs259 #ask47y', yes);
      doc.q1('#ask47 .bs259 #ask47c', no);
    }
    ask.q1('#ask47y', yes);
    // 購買確認視窗也用同樣的 #ask47y（沒有 .bs259）：腳本絕不能按它
    ui.purchaseYes = yes;
  };
  storageBtn.onclick = () => {
    ui.opens += 1;
    if (ui.noOpen) return; // 開不起來（測試用）
    modal.hidden = false;
    modalTitle.textContent = '倉庫';
    ui.selected.clear();
    ui.rows = [];
    if (!ui.noRows) {
      for (const id of Object.keys(S.inv)) {
        const it = CFG.items[id];
        if (!it || it.sellPrice == null || !(S.inv[id] > 0)) continue;
        const tr = new FakeEl(doc, 'tr');
        tr.dataset.bs259 = id;
        const cb = new FakeEl(doc, 'input');
        cb.classList.add('cb259');
        cb.onclick = () => {
          cb.checked = !cb.checked;
          if (cb.checked) ui.selected.add(id); else ui.selected.delete(id);
          refreshBar();
        };
        tr.q1('input.cb259', cb);
        ui.rows.push({ id, tr, cb });
      }
    }
    for (const r of ui.rows) if (ui.preselect.includes(r.id)) { ui.selected.add(r.id); r.cb.checked = true; }
    doc.q('#modalBody tr[data-bs259]', ui.rows.map((r) => r.tr));
    doc.q1('#modalBody tr[data-bs259] input.cb259', ui.rows.length ? ui.rows[0].cb : null);
    refreshBar();
  };
  modalClose.onclick = () => { modal.hidden = true; modalTitle.textContent = ''; clearUnitPanel(); clearShop(); tabShop.classList.remove('on'); };

  // ───── 掛到 window（和官方遊戲公開的除錯介面同名）─────
  win.__farm18 = { get S() { return S; }, RT, act: (x, y) => act(x, y) };
  win.__farm218 = { CFG, inMap: () => true };
  return world;
}

module.exports = { attachWorld, makeCfg };
