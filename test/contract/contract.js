'use strict';
/*
 * 「腳本對官方遊戲的依賴清單」。兩個地方會用到：
 *   - 單元測試（test/unit/09-security）：確認腳本實際用到的每個 id、選擇器都在這份清單裡，
 *     而且清單裡沒有腳本已經不用的項目（清單永遠等於腳本的真實依賴）。
 *   - 契約測試（test/contract）：對「官方遊戲目前的網頁與設定」逐項確認這些依賴還在。
 *     官方改版後哪一項消失，就是腳本可能壞掉的地方。
 * game：要在官方 index.html 裡找到的文字（原樣比對）。
 */
module.exports = {
  // 腳本用 document.getElementById / $() 取得的元素
  ids: [
    { id: 'storageText', game: ['id="storageText"'] }, // 倉庫容量文字「倉庫 54/1,000」
    { id: 'storageBtn', game: ['id="storageBtn"'] }, // 開倉庫按鈕（滿了會加 full class）
    { id: 'modal', game: ['id="modal"'] }, // 遊戲的視窗（每日簽到、倉庫…）
    { id: 'modalTitle', game: ['id="modalTitle"'] },
    { id: 'modalClose', game: ['id="modalClose"'] },
    { id: 'pick53', game: ["POP53.id = 'pick53'"] }, // 地圖上的小選單
    { id: 'ask47', game: ["box.id = 'ask47'"] }, // 確認視窗
    { id: 'fullCancel', game: ['id="fullCancel"'] }, // 「農產倉庫滿了」的「先不收成」
    { id: 'status', game: ['id="status"'] }, // 左上狀態列：擴地模式時會放「擴地模式：點虛線區塊購買」
  ],

  // 腳本用的選擇器。prefix＝程式碼裡字面值的開頭（有用變數組字的只列到變數之前）
  selectors: [
    { prefix: '#modalTabs button[data-k="shop"]', game: ['id="modalTabs"', "['shop','飼料商店']"] }, // 倉庫的「飼料商店」分頁（買狗飼料、貓飼料）
    { prefix: '#modalBody button[data-buy="', game: ['data-buy="${id}" data-q="${q}"'] }, // 飼料商店的「買 10／50 個」
    { prefix: '#modalTabs button[data-k="produce"]', game: ['id="modalTabs"', 'data-k='] },
    { prefix: '#modalBody tr[data-bs259] input.cb259', game: ['id="modalBody"', 'data-bs259', 'cb259'] },
    { prefix: '#modalBody tr[data-bs259]', game: ['data-bs259'] },
    { prefix: 'input.cb259', game: ['cb259'] },
    { prefix: '#bsbar259 [data-bsclr259]', game: ['bsbar259', 'data-bsclr259'] },
    { prefix: '#bsbar259 [data-bsgo259]', game: ['bsbar259', 'data-bsgo259'] },
    { prefix: '#ask47 .bs259 #ask47y', game: ['cf47 bs259', 'id="ask47y"'] },
    { prefix: '#ask47 .bs259 #ask47c', game: ['cf47 bs259', 'id="ask47c"'] },
    // 買耗材時遊戲先跳的「確定要買嗎？」購買確認視窗（沒有 .bs259）；腳本核對標題、價格後才按「確定購買」
    { prefix: '#ask47 #ask47y', game: ['id="ask47y"'] },
    { prefix: '#ask47 #ask47c', game: ['id="ask47c"'] },
    { prefix: '#ask47 #ask47no', game: ['id="ask47no"'] }, // 「以後不再詢問」勾選框：只讀，絕不去勾
    { prefix: '#ask47 h3', game: ['<h3>${I.title}</h3>'] },
    { prefix: '#ask47 .tot47', game: ['<div class="tot47"><span>${I.priceLabel || \'價格\'}</span>'] },
    { prefix: '#ask47 .bs259', game: ['cf47 bs259'] }, // 賣出確認視窗：看到它就不能當成購買確認去按
    { prefix: '#dock .tool[data-tool="', game: ['id="dock"', 'data-tool='] },
    { prefix: '#tray .item[data-id="', game: ['id="tray"', 'data-id='] },
    { prefix: '#tray .item[data-id="catch"]', game: ['id="tray"', 'data-id='] },
    { prefix: 'button[data-oe2543="tile"]', game: ['data-oe2543="tile"'] }, // 「這一格有：」選單
    { prefix: 'button[data-ck248="feed"]', game: ['data-ck248'] }, // 餓了的雞鴨小選單
    { prefix: 'button[data-m61="', game: ['data-m61'] }, // 機器小選單
    { prefix: '#maps button[data-map="', game: ['id="maps"', 'data-map='] }, // 右側「農場 N」切島按鈕（多座島）
    { prefix: '#modalBody .sw84 button[data-sw84]', game: ['sw84', 'data-sw84'] }, // 重型機器人「要換耗材」卡片的按鈕
    { prefix: '#modalBody .sw84', game: ["box.className = 'pcard span2 sw84'"] },
    { prefix: '#modalBody .partcard button[data-part="', game: ['data-part="${id}" data-q="${q}"'] }, // 「耗材」卡片的「買 1／5／10」
    { prefix: '#modalBody .partcard', game: ['pcard span2 partcard'] },
    { prefix: 'canvas', game: [] },
  ],

  // 腳本依賴的遊戲行為（官方原始碼裡看得到的特徵）
  behaviors: [
    { name: '除錯入口 window.__farm18（S 是 getter、act 轉呼叫最新版）', game: ['window.__farm18 = {', 'get S(){ return S; }', 'act: (x, y) => act(x, y)'] },
    { name: '除錯入口 window.__farm218（CFG、inMap）', game: ['window.__farm218'] },
    { name: '播種／照顧工具切換後要先選一個（none49）', game: ['none49', 'function noSelBlocks49'] },
    { name: '全部隱藏（ui-hide）時點擊會被忽略', game: ["classList.contains('ui-hide')"] },
    {
      name: '擴地模式（UI.expand）：狀態列有「擴地模式」標籤；此時點地圖一律當成擴地點擊；切換工具或 Esc 才結束',
      game: [
        'if (UI.expand) st.push(`<div class="chip">擴地模式：點虛線區塊購買</div>`);',
        'if (UI.expand){ tryExpandAt(x, y); return; }',
        'S.sel.tool = id; UI.expand = false;',
        "else if (UI.expand){ UI.expand = false; renderHUD(); }",
      ],
    },
    {
      name: '多座島：所有島一直在運作，但點擊只作用在目前顯示的島；點「農場 N」切島（只換 S.cur、結束擴地模式）；動物位置只在顯示的那座更新',
      game: [
        "$('maps').addEventListener('click', e => { const b = e.target.closest('button[data-map]'); if (!b) return; S.cur = +b.dataset.map; UI.expand = false; fitCamera(); renderHUD(); });",
        "const curMap = () => S.maps[S.cur];",
        "const maps = S.maps.map((M,i) => `<button class=\"${i === S.cur ? 'on' : ''}\" data-map=\"${i}\">農場 ${i+1}</button>`).join('');",
        "function animalAwayFrom(k){ const ag = RT.agents && RT.agents[`${S.cur}:${k}`];",
        "const mi = S.cur, reg = regionsFor(mi), dt = Math.min(.1, RT.frameDt || .016);",
        'const bonus = bonusMap(mi), cover = S.snow.cover, G = M.glass || {};',
      ],
    },
    {
      name: '貓、狗（寵物）自己從倉庫扣狗飼料／貓飼料，沒有就餓著（沒有「點牠餵食」）；飼料只能在倉庫的飼料商店買，買 10／50 個先跳確認視窗，標題是「名稱 ×數量」',
      game: [
        "function petEat(P){ const item = P.kind === 'dog' ? 'dog_food' : 'cat_food';",
        'if (invTake(item, 1)) return true;',
        "P.hungry = true;",
        "const petList = () => (S.pets = S.pets || []);",
        "if (d.buy && CFG.feedShop && CFG.feedShop[d.buy]){ const q = +d.q || 1;",
        "return { cat: 'shop', title: `${itemName(d.buy)} ×${q}`,",
        '狗飼料、貓飼料只能在這裡買',
      ],
    },
    { name: '動物走離家時點牠的家無效，要有 lastAnimalTap 記號', game: ['function animalAwayFrom', 'lastAnimalTap', 'lastAnimalTapAt'] },
    { name: '歪掉的裝飾、倒下的柵欄點一下就扶正（任何非移除／收回的工具）', game: ['T.tilt = 0', 'T.fallen = false'] },
    { name: '沿邊柵欄：收成工具先跳「這一格有：」選單', game: ['function objEdgeMenu2543', 'data-oe2543="tile"'] },
    { name: '機器小選單的按鈕（投放材料／收成／產出效能／升級）與灰掉的樣式', game: ['data-m61', 'off61', 'function machineMenu61'] },
    { name: '餓了的雞鴨點下去先跳小選單（要按餵食）', game: ['data-ck248', 'function ckHungry248'] },
    { name: '魚池用播種工具直接 tapPool、收成工具跳小選單', game: ['function tapPool', 'data-p56'] },
    {
      name: '蜂箱：收成工具點有蜂蜜的蜂箱整箱收進倉庫，沒有蜂蜜才開蜂箱面板',
      game: [
        "const isHive = T => T && T.t === 'device' && DEV[T.id] && DEV[T.id].kind === 'hive';",
        'const honeyStored = T => Object.values(T.honey || {}).reduce((a, b) => a + b, 0);',
        "if (tool === 'hand' && isHive(T)){ if (!collectHoney(T, cx, cy)) openHive(M, k, T);",
        'deliver(goods, cx, cy, () => { T.honey = {}; sfx(\'harvest\'); });',
      ],
    },
    {
      name: '長大了的肉用動物：點一下 1 份肉進倉庫、動物消失；長大判斷是 stage >= growStages',
      game: [
        'const isAdult = (T,A) => T.stage >= A.growStages;',
        "if (A.type === 'meat' && isAdult(T,A)){",
        'deliver([{ id: A.productItem, qty: 1 }], cx, cy, () => { if (M.tiles[k] === T) delete M.tiles[k];',
        'R.meatAdultLifespanSeconds',
      ],
    },
    {
      name: '點充電樁（建築）開機器人面板；面板有「耗材」卡片，重型機器人另有「要換耗材」卡片（有備品寫「換耗材」、沒備品寫「買 1 個並換上（價格）」）',
      game: [
        'else if (B.serves) openUnitPanel(B.serves);',
        "have ? '換耗材' : `買 1 個並換上（${fmtN(P.price)}）`",
        'function swapPart84(kind, u){',
        'if ((S.inv[partItem(id)] || 0) > 0) return go();',
        'if (buyParts(id, 1)) return go(); return false; }',
      ],
    },
    {
      name: '重型機器人（伐木／採礦／整地）耗材磨完要手動換：遊戲不自動換；按鈕順序＝需求清單順序',
      game: [
        'const manual84 = id => !!(PARTS[id] && PARTS[id].manualSwap);',
        'if (u && u.needPart && manual84(u.needPart) && !RT.swap84) return;',
        'const need = TK84.filter(k => RK(k).base === baseId).flatMap(k => fleet(k).filter(u => unitTier(k, u) && u.needPart)',
        'const TK84 = Object.keys(RB84.kinds || { lumber: 1, mine: 1, grade: 1 }).filter(k => RB.kinds[k]);',
      ],
    },
    {
      name: '其他機器人耗材：有備品遊戲自己換、買了立刻換上；機器人狀態在 S.fleet[種類][]（tier、on、needPart）',
      game: [
        'function stepPartsAutoFit(){ for (const kind of KINDS) for (const u of fleet(kind)) if (u.needPart) fitPart(kind, u);',
        'function buyParts(id, q){ const cost = partPrice(id, q); if (!spend(cost)) return false; invAdd(partItem(id), q);',
        'function fleet(kind){ S.fleet = S.fleet || {}; return (S.fleet[kind] = S.fleet[kind] || []); }',
        'const unitTier = (kind, u) => u && u.tier >= 0 ? RK(kind).tiers[u.tier] : null;',
        'u.needPart = id;',
      ],
    },
    {
      name: '花金幣的按鈕（買耗材等）先跳「確定要買嗎？」確認視窗；「不再詢問」是玩家設定；耗材的確認標題是「名稱 ×數量」',
      game: [
        'function buyAsk47(I, onOk){',
        "const noAsk47 = cat => !!(window.__noAsk47 || (S && S.settings && S.settings.noAsk && S.settings.noAsk[cat]));",
        "if (d.part && PARTS[d.part]){ const q = +d.q || 1; return { cat: 'shop', title: `${PARTS[d.part].name} ×${q}`, price,",
        "const t = (b.querySelector('b') || b).textContent.trim().replace(/\\s+/g, ' ').slice(0, 40);",
      ],
    },
    { name: '收成放不下時一律走 deliver（跳「農產倉庫滿了」）', game: ['function deliver(goods, x, y, finalize, label)', 'openFullPrompt(goods, free'] },
    { name: '餵食條件 canFeed 與自動買飼料設定', game: ['function canFeed', 'autoBuyFeed'] },
    { name: '倉庫批次賣出介面（勾選框、結帳列、確認視窗預設全數賣出）', game: ['function decorate259', 'function openBatch259', 'bs259'] },
    {
      name: '批次賣出：任何有售價的物品（雜草、糞便也是）每列都有勾選框，確認視窗預設全數賣出',
      game: ['if (!id || !CFG.items[id] || CFG.items[id].sellPrice == null) return;', 'tr.dataset.bs259 = id', 'value="${R[id].max}"'],
    },
    { name: '收成放不下時跳「農產倉庫滿了」視窗', game: ['農產倉庫滿了'] },
    { name: '倉庫視窗的標題是「倉庫」', game: ["openModal('倉庫'", "title === '倉庫'"] },
  ],
};
