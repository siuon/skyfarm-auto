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
    { prefix: '#modalTabs button[data-k="produce"]', game: ['id="modalTabs"', 'data-k='] },
    { prefix: '#modalBody tr[data-bs259] input.cb259', game: ['id="modalBody"', 'data-bs259', 'cb259'] },
    { prefix: '#modalBody tr[data-bs259]', game: ['data-bs259'] },
    { prefix: 'input.cb259', game: ['cb259'] },
    { prefix: '#bsbar259 [data-bsclr259]', game: ['bsbar259', 'data-bsclr259'] },
    { prefix: '#bsbar259 [data-bsgo259]', game: ['bsbar259', 'data-bsgo259'] },
    { prefix: '#ask47 .bs259 #ask47y', game: ['cf47 bs259', 'id="ask47y"'] },
    { prefix: '#ask47 .bs259 #ask47c', game: ['cf47 bs259', 'id="ask47c"'] },
    { prefix: '#dock .tool[data-tool="', game: ['id="dock"', 'data-tool='] },
    { prefix: '#tray .item[data-id="', game: ['id="tray"', 'data-id='] },
    { prefix: '#tray .item[data-id="catch"]', game: ['id="tray"', 'data-id='] },
    { prefix: 'button[data-oe2543="tile"]', game: ['data-oe2543="tile"'] }, // 「這一格有：」選單
    { prefix: 'button[data-ck248="feed"]', game: ['data-ck248'] }, // 餓了的雞鴨小選單
    { prefix: 'button[data-m61="', game: ['data-m61'] }, // 機器小選單
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
    { name: '收成放不下時一律走 deliver（跳「農產倉庫滿了」）', game: ['function deliver(goods, x, y, finalize, label)', 'openFullPrompt(goods, free'] },
    { name: '餵食條件 canFeed 與自動買飼料設定', game: ['function canFeed', 'autoBuyFeed'] },
    { name: '倉庫批次賣出介面（勾選框、結帳列、確認視窗預設全數賣出）', game: ['function decorate259', 'function openBatch259', 'bs259'] },
    { name: '收成放不下時跳「農產倉庫滿了」視窗', game: ['農產倉庫滿了'] },
    { name: '倉庫視窗的標題是「倉庫」', game: ["openModal('倉庫'", "title === '倉庫'"] },
  ],
};
