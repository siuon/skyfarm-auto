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
    cur: 0,
    maps: [{ tiles: Object.assign({}, o.tiles || {}), pools: o.pools || {} }],
    player: { level: o.level ?? 5, coins: o.coins ?? 1000, water: o.water ?? 100 },
    sel: Object.assign({ tool: 'hand', seed: 'wheat', care: 'catch', none49: false }, o.sel || {}),
    inv: Object.assign({}, o.inv || {}),
    settings: { autoBuyFeed: o.autoBuyFeed ?? true },
  };
  const RT = { mv: null, agents: Object.assign({}, o.agents || {}), pick53: null, lastAnimalTap: null, lastAnimalTapAt: 0 };
  const M = S.maps[0];
  const edgeFence = new Set(o.edgeFence || []);
  const ckIds = new Set(o.ckIds || ['egg_hen']);
  const cap = o.cap ?? 100;

  const world = {
    S, RT, CFG, M, cap, edgeFence,
    acts: [], // 每次 act 的紀錄
    fullPrompts: 0, // 跳出「農產倉庫滿了」的次數
    // 「絕不做」計數
    shipped: [], hivePanels: 0, upgrades: 0, chemUsed: 0, deletedWild: 0, boughtFeed: 0, coinsSpentOnFeed: 0,
    toasts: [],
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
        T.run = true; T.state = 'working';
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
    if (tool === 'care') { // 照顧工具
      if (T && T.t === 'soil' && T.crop) {
        if (S.sel.care === 'catch') {
          if (T.crop.pest) { T.crop.pestTaps = (T.crop.pestTaps || 0) + 1; if (T.crop.pestTaps >= 3) { T.crop.pest = false; T.crop.pestTaps = 0; } }
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
    world.acts.push({ k, tool: S.sel.tool, care: S.sel.care, none49: S.sel.none49, type: T && T.t, id: T && T.id });
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
  }
  world.act = act;

  // ───── 倉庫視窗與批次賣出（腳本用 DOM 操作這一段）─────
  const ui = {
    selected: new Set(), confirmMissing: !!o.confirmMissing, noRows: !!o.noRows, opens: 0, sold: [],
    preselect: o.preselect || [], // 玩家之前留下的勾選
    noGoButton: !!o.noGoButton, noOpen: !!o.noOpen, purchaseYes: null,
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
    yes.onclick = () => {
      for (const id of ui.selected) {
        const n = S.inv[id] || 0;
        ui.sold.push([id, n]);
        S.player.coins += n * (CFG.items[id].sellPrice || 0);
        delete S.inv[id];
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
  modalClose.onclick = () => { modal.hidden = true; modalTitle.textContent = ''; };

  // ───── 掛到 window（和官方遊戲公開的除錯介面同名）─────
  win.__farm18 = { get S() { return S; }, RT, act: (x, y) => act(x, y) };
  win.__farm218 = { CFG, inMap: () => true };
  return world;
}

module.exports = { attachWorld, makeCfg };
