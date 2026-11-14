/*
 * SkyFarm Auto — 浮島農場 SkyFarm 遊戲輔助
 *
 * 由 Tampermonkey 透過 @require 載入（設定見 skyfarm-auto.loader.user.js）。
 *
 * 功能（0.12.0）：
 *   - Alt+Shift+S：跳出輸入框，輸入「這次要自動種植的作物」（中文名稱或代號皆可）
 *   - Alt+Shift+A：開啟／關閉自動功能（每次載入頁面一律預設 OFF，不會記住 ON）；
 *                  還沒設定作物就按開啟時，會先跳出輸入框，確認後才開始
 *   - Alt+Shift+D：唯讀診斷，輸出頁面與遊戲狀態摘要並複製到剪貼簿
 *   - 設定的作物不會被記住（重新整理頁面就要重設），目前作物顯示在右下角標籤
 *   - 自動功能開啟後，只處理「設定的作物」，每個週期依序處理：
 *       1. 遊戲跳出「農產倉庫滿了」視窗 → 按「先不收成」，並標記要賣出
 *       2. 倉庫剩餘空位 ≤ 門檻 → 開啟倉庫視窗、賣掉設定的作物（含有機版）、關閉倉庫視窗
 *       3. 成熟的設定作物 → 收成；空的田 → 種下設定的作物。
 *          有空田但金幣不夠買種子 → 直接賣掉倉庫裡設定的作物換錢，不等倉庫快滿（CONFIG.sellWhenCantPlant）
 *       4. 還在長（或已枯萎）的設定作物，濕度低於門檻 → 切到澆水工具澆到滿（只用雨水）
 *       5. 作物長蟲 → 切到「照顧」工具選「捉蟲」，每格點 3 下抓光（免費）；蟲沒抓光前該格不收成、不澆水。
 *          不噴農藥、不施肥（會花錢，也會讓有機作物變一般作物）。其他種類作物長蟲也會抓。
 *       6. 地上的動物糞便 → 點掉（收進倉庫）；生產型動物累積的產物（蛋、奶、羊毛…）→ 點動物收走。
 *          長大了的肉用動物 → 出貨（點一下，肉進倉庫、動物就沒了；遊戲規定長大 2 天沒收牠會自己死掉，
 *          所以收掉才是對的；小動物不會補買，CONFIG.autoHarvestMeatAnimals）。還沒長大的肉用動物絕不點（要餵，不是收）。
 *          撿起來的東西放進倉庫，倉庫沒空位就暫停撿拾。
 *          （點動物收產物時，遊戲會照一般規則順便餵食，跟你手動點一樣。）
 *       6b. 餓了的動物 → 點一下餵食（成長階段、產物型成年後都要餵；肉用型長大後不用餵，直接出貨）。
 *          先用倉庫現有的飼料；不夠時，遊戲開著「飼料不夠時自動買」、且補買後金幣還高於
 *          CONFIG.minCoinsAfterBuyFeed，才會用金幣照商店價補買（CONFIG.buyFeedWhenShort）。
 *       7. 被風吹歪的裝飾、倒下的柵欄 → 扶正（免費；用「澆水」工具點，不會用到水）。
 *          地上的雜物：碎石等垃圾直接撿掉（不佔倉庫）；雜草、草球拔掉會收進倉庫，
 *          只有拔完倉庫還剩 CONFIG.weedKeepFree 個空位以上、而且倉庫裡的雜草不超過 CONFIG.weedMaxStock 個才拔
 *          （雜草不值錢也不會自動賣，不能擠掉作物的位置；超過就留在地上）。
 *       8. 果樹結果了 → 採收；有蟲 → 抓蟲。魚池有魚長成了 → 收成；機器做好了 → 收成品；
 *          蜂箱裡存了蜂蜜 → 收進倉庫（點到沒蜂蜜的蜂箱會跳蜂箱面板，所以只點有蜂蜜的）。
 *          （都只在倉庫放得下時才收。補魚苗、升級機器一律不碰。）
 *       9. 田裡不是設定作物的作物：成熟了也收成（CONFIG.harvestOtherCrops；只收、不澆水、不賣，
 *          倉庫要放得下、收完還剩 CONFIG.otherCropsKeepFree 個空位才收，免得擠掉設定作物的位置）。
 *       以下三項會用到你的資源，預設關閉，要用請改 CONFIG：
 *          autoWaterTrees（果樹也澆雨水）、autoFeedFish（用倉庫現有的飼料餵魚，不會自動買）、
 *          autoLoadMachines（機器自動投料，只投 loadMachineIds 裡的機器，成品庫存有上限）
 *       其他種類的作物預設只收成、不澆水（CONFIG.handleOtherCrops 開了才也澆水）
 *
 * 資料來源（不需要辨識 canvas 畫面）：
 *   遊戲自己在 window 上公開了除錯介面，本腳本只用兩個：
 *     window.__farm18.S    遊戲狀態（唯讀使用：田、作物進度、倉庫、金幣）
 *     window.__farm18.act  與「點一下地圖格子」相同的動作（依目前工具：收成／播種）
 *   成熟判斷：田的 crop.prog >= CFG.crops[crop.id].growSeconds 且沒有枯萎，
 *   即遊戲畫面上顯示成熟圖示的條件。
 *   倉庫賣出：用遊戲自己的 DOM 操作（#storageBtn 開倉庫 → 勾選列 input.cb259 →
 *   #bsbar259 的「賣出所選」→ #ask47y「確定賣出」→ #modalClose 關閉）。
 *
 * 資安原則：
 *   - 不使用 GM_* 權限（@grant none），不對外發送任何網路請求。
 *   - 只用 textContent 寫入畫面，不使用 innerHTML / eval / new Function。
 *   - 不在 window 上暴露任何物件；只接受使用者真實按鍵（isTrusted）。
 *   - 不直接改寫遊戲資料（不改金幣、倉庫、作物），只做玩家本來就能做的操作。
 *     只有兩處碰到遊戲的「介面暫存狀態」（不是存檔資料）：
 *       a. 動物走離家時，點牠前補上遊戲自己的「剛點了這隻動物」記號（RT.lastAnimalTap），
 *          效果等同玩家點了畫面上看得到的那隻動物或蛋窩；
 *       b. 機器的小選單沒有我們要的按鈕時，把我們剛叫出來的選單收起來（和遊戲的 closePop53 相同）。
 *   - 診斷只讀：不對遊戲 canvas 呼叫 getContext、不執行 getter、不輸出 cookie /
 *     storage 內容，網址一律移除 ? 與 # 之後的內容。
 */
(function () {
  'use strict';

  const NAME = 'SkyFarmAuto';
  const VERSION = '0.12.0';
  const BADGE_ID = 'skyfarm-auto-badge';
  const PANEL_ID = 'skyfarm-auto-panel';

  // ───────────────────────── 設定（想改行為只需要改這裡）─────────────────────────
  const CONFIG = {
    // 組合鍵（code 是實體按鍵，例如 KeyA、KeyD、F8）
    toggleKey: { code: 'KeyA', alt: true, shift: true, ctrl: false },
    cropKey: { code: 'KeyS', alt: true, shift: true, ctrl: false },
    probeKey: { code: 'KeyD', alt: true, shift: true, ctrl: false },

    tickMs: 400, // 每個週期的間隔（毫秒）
    maxActionsPerTick: 3, // 每個週期最多收成／播種幾格（遊戲每次操作都會存檔，不宜一次太多）

    autoHarvest: true, // 成熟的作物自動收成
    autoPlant: true, // 空的田自動播種
    autoSell: true, // 倉庫快滿時自動開倉庫賣出
    autoPickPoop: true, // 地上的動物糞便自動點掉（收進倉庫；倉庫沒空位就暫停）
    autoCollectAnimalProducts: true, // 生產型動物累積的產物（蛋、奶、羊毛…）自動收
    autoHarvestMeatAnimals: true, // 長大了的肉用動物自動出貨（點一下，肉進倉庫、動物就沒了；不收的話長大 2 天後牠會自己死掉）。不會補買小動物
    autoCollectHoney: true, // 蜂箱裡存的蜂蜜自動收進倉庫（倉庫放得下才收）
    autoFeedAnimals: true, // 餓了的動物自動餵（點一下）；只用倉庫現有的飼料，不夠就不餵、不自動買。肉用動物長大後不用餵（直接出貨）
    buyFeedWhenShort: true, // 飼料不夠時，在遊戲開著「飼料不夠時自動買」的前提下，用金幣照商店價補買（補買後金幣要高於 minCoinsAfterBuyFeed）
    minCoinsAfterBuyFeed: 100, // 補買飼料後至少要剩多少金幣（只有開了 buyFeedWhenShort 才用到）
    autoStraighten: true, // 被風吹歪的裝飾、倒下的柵欄自動扶正（免費、不佔倉庫；用「澆水」工具點，不會用到水）
    autoClearDebris: true, // 地上的碎石等垃圾自動撿掉（不佔倉庫、免費）
    autoClearWeeds: true, // 地上的雜草、草球自動拔掉（會收進倉庫，空位不夠就暫停）
    weedKeepFree: 30, // 拔雜草後倉庫至少要還剩這麼多空位，雜草不值錢，不能擠掉作物、蛋、奶的位置
    weedMaxStock: 40, // 倉庫裡的雜草最多放這麼多（不會自動賣；堆肥桶會用掉），滿了就不拔，雜草留在地上
    autoHarvestTrees: true, // 果樹結果了自動採收（倉庫放得下才收）
    autoHarvestFish: true, // 魚池裡長成的魚自動收成（倉庫放得下才收；不會補魚苗）
    autoCollectMachines: true, // 機器做好的成品自動收進倉庫（倉庫放得下才收）
    autoWaterTrees: false, // 果樹也澆水（用雨水，會和作物搶水；預設關閉）
    autoFeedFish: false, // 魚餓了就餵（只用倉庫現有的飼料，不夠就不餵、不自動買；預設關閉）
    autoLoadMachines: false, // 機器空了自動投料（會消耗倉庫的材料；預設關閉）
    loadMachineIds: ['compost_bin', 'fish_feed_machine'], // 開啟投料時，只對這些機器投（玉米餅機會把很值錢的玉米變成便宜的飼料，所以不在內）
    machineMaxStock: 100, // 投料前，成品在倉庫的庫存已經 ≥ 此值就不再投（避免成品把倉庫塞滿）
    autoCatchPests: true, // 作物、果樹長蟲時，用「照顧」工具的「捉蟲」（免費）點到抓光；不噴農藥、不施肥
    catchPestsOnOtherCrops: true, // 其他種類作物與果樹長蟲也抓（蟲會往旁邊擴散；抓蟲免費，不影響收成與庫存）
    autoWater: true, // 還在長的作物（含枯萎的）自動澆水；只用雨水，雨水不夠就暫停
    waterBelow: 1, // 濕度（0～4 級，每澆一下 +1 級）低於這個值就開始澆
    waterUpTo: null, // 澆到幾級為止；null＝澆到滿

    harvestOtherCrops: true, // 田裡「不是設定作物」的作物，成熟了也收成（只收、不澆水、不賣；空出來的田照常補種設定作物）
    otherCropsKeepFree: 10, // 收其他作物後倉庫至少要還剩這麼多空位（它們不會自動賣，不能擠掉設定作物的位置）
    handleOtherCrops: false, // false＝其他作物不澆水（成熟了仍照 harvestOtherCrops 收）；true＝也澆水，收成不受 otherCropsKeepFree 限制（但不會賣）
    minCoinsAfterPlant: 0, // 播種後至少要剩多少金幣（避免把錢花光）

    sellWhenCantPlant: true, // 有空田、但金幣不夠買種子時，直接賣掉倉庫裡設定的作物換錢，不等倉庫快滿
    sellWhenFreeAtMost: 5, // 倉庫剩餘空位 ≤ 此值就開始賣出（只賣設定的作物與它的有機版）
    sellRetryMs: 30000, // 賣不出東西時，隔多久才再試一次
  };

  // 避免被重複注入
  if (window['__' + NAME + '_loaded__']) return;
  window['__' + NAME + '_loaded__'] = true;

  const log = (...args) => console.log('[' + NAME + ']', ...args);
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const keyLabel = (k) =>
    [k.ctrl && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift', k.code.replace(/^Key/, '')]
      .filter(Boolean)
      .join('+');

  const matchKey = (e, k) =>
    e.code === k.code &&
    e.altKey === !!k.alt &&
    e.shiftKey === !!k.shift &&
    e.ctrlKey === !!k.ctrl &&
    !e.metaKey;

  // ───────────────────────── 狀態 ─────────────────────────

  let enabled = false; // 一律預設 OFF，且不寫入任何儲存空間
  let timer = null;
  let ticking = false; // 避免上一個週期還沒做完就開始下一個
  let status = '';
  let note = '';
  let noteTimer = null;
  let badge = null;

  let targetCrop = null; // { id, name }：這次要自動種植並賣出的作物；不寫入任何儲存空間
  let panel = null; // 設定作物的輸入面板
  let startAfterSet = false; // 面板是由「開啟自動」叫出來的：確認後直接開始

  const newStats = () => ({
    harvest: 0, plant: 0, water: 0, pest: 0, pick: 0, sellRuns: 0,
    clean: 0, fruit: 0, fish: 0, machine: 0, feed: 0, honey: 0, meat: 0,
  });
  let stats = newStats();
  const wetting = new Set(); // 正在澆到目標濕度的格子（避免在門檻附近來回澆）
  let lastRenderAt = 0; // 右下角標籤上次重畫的時間（「上次動作」要每秒更新一次）
  let lastActionAt = 0; // 上一次真的做成一件事（收成、播種、賣出…）的時間，顯示在右下角方便看出有沒有停住
  let needSell = false; // 曾被「倉庫滿了」視窗擋住，或金幣不夠買種子，下個週期優先賣出
  let sellBlockedUntil = 0; // 賣不出東西時的暫停時間
  const cooldown = new Map(); // 格子座標 → { kind, until, fails }，避免對同一格狂點

  // ───────────────────────── 遊戲介面 ─────────────────────────

  // 取得遊戲公開的介面；遊戲尚未載入（或改版移除了介面）時回傳 null
  function game() {
    const a = window.__farm18;
    const b = window.__farm218;
    if (!a || !b || typeof a.act !== 'function') return null;
    const S = a.S; // getter：每次都重新讀取，換存檔時才不會拿到舊物件
    if (!S || !S.maps || !S.player || !S.sel || !b.CFG || !b.CFG.crops) return null;
    return { S, RT: a.RT, act: a.act, CFG: b.CFG };
  }

  function storageInfo(g) {
    const used = Object.values(g.S.inv || {}).reduce((a, b) => a + b, 0);
    const el = $('storageText');
    const m = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/.exec((el && el.textContent) || '');
    const cap = m ? Number(m[2].replace(/,/g, '')) : null;
    const btn = $('storageBtn');
    return {
      used,
      cap,
      free: cap === null ? null : Math.max(0, cap - used),
      fullFlag: !!(btn && btn.classList.contains('full')),
    };
  }

  const isModalOpen = () => {
    const m = $('modal');
    return !!m && !m.hidden;
  };
  const modalTitle = () => (($('modalTitle') || {}).textContent || '').trim();

  const isRipe = (T, CFG) => {
    if (!T || T.t !== 'soil' || !T.crop || T.crop.wither) return false;
    const C = CFG.crops[T.crop.id];
    return !!C && T.crop.prog >= C.growSeconds;
  };

  // 會長蟲的「宿主」：田裡是作物（T.crop），果樹本身就是宿主
  const hostOf = (T) => (!T ? null : T.t === 'soil' ? T.crop : T.t === 'tree' ? T : null);

  // 果樹結果了（和遊戲畫面上出現果實的條件相同）
  const treeReady = (T, CFG) => {
    const D = CFG.trees && CFG.trees[T.id];
    return !!D && T.prog >= (T.first ? D.firstFruitSeconds : D.fruitIntervalSeconds);
  };

  // 魚池：相連的格子是一個池，點任何一格就是整池一起處理；每格各自有 fish / stage / timer。
  // 遊戲點魚池的順序是：有長成的 → 全部收成；沒有 → 餓了的全部餵食（會扣飼料，飼料不夠且開了「自動買」會花錢）。
  // 這裡先算好：能收成幾條（倉庫要放得下）、餵食需要的飼料倉庫裡夠不夠（夠才餵，絕不讓遊戲去買）。
  function poolState(M, P, g) {
    const { S, CFG } = g;
    const byFish = {};
    const feedNeed = {};
    const sig = [];
    let cells = 0;
    let ready = 0;
    let hungry = 0;
    for (const t of P.tiles || []) {
      const T = M.tiles[t];
      const F = T && T.t === 'pool' && T.fish ? CFG.fish[T.fish] : null;
      if (!F) continue;
      cells += 1;
      sig.push(T.fish + ':' + T.stage + ':' + (T.timer > 0 ? 1 : 0));
      if (T.stage >= F.stages) {
        ready += 1;
        byFish[T.fish] = (byFish[T.fish] || 0) + 1;
      } else if (!(T.timer > 0)) {
        hungry += 1;
        feedNeed[F.feedItem] = (feedNeed[F.feedItem] || 0) + F.stageFeedQtyPerTile;
      }
    }
    let bonus = 0;
    for (const s of (CFG.fishPool && CFG.fishPool.sizeBonus) || []) if (P.n >= s.minTiles) bonus = s.bonus;
    const harvestQty = Object.values(byFish).reduce((a, c) => a + Math.round(c * (1 + bonus)), 0);
    const feedOk = Object.entries(feedNeed).every(([id, q]) => (S.inv[id] || 0) >= q);
    return { cells, ready, hungry, harvestQty, feedOk, sig: sig.join('|') };
  }

  // 機器：成品數（可能「還在做」同時已有做好的成品）、能不能再投一批料
  function machineState(T, g) {
    const { S, CFG } = g;
    const D = CFG.machines && CFG.machines[T.id];
    if (!D) return null;
    const MU = CFG.machineUpgrade || {};
    const up = (MU.appliesTo || []).includes(T.id);
    const out = T.out > 0 ? T.out : T.state === 'done' ? 1 : 0;
    const outQty = out * Object.values(D.output).reduce((a, b) => a + b, 0);
    const lvl = Math.max(1, Math.min(MU.maxLevel || 5, T.lvl || 1));
    const cap = up ? 1 + (lvl - 1) * (MU.batchesPerLevel || 1) : 1;
    let used = up ? (T.run ? 1 : 0) + (T.q || 0) + (T.out || 0) : T.state === 'idle' ? 0 : 1;
    if (T.state === 'working') used = Math.max(used, 1);
    const inputsOk = Object.entries(D.input).every(([id, q]) => (S.inv[id] || 0) >= q);
    const stockOk = Object.keys(D.output).every((id) => (S.inv[id] || 0) < CONFIG.machineMaxStock);
    const firstInput = Object.keys(D.input)[0];
    return {
      out,
      outQty,
      canLoad: used < cap && inputsOk && stockOk,
      inputLeft: S.inv[firstInput] || 0,
    };
  }

  // 動物餓了：和遊戲的 canFeed 同一個條件。
  //   還沒長大 → 每個成長階段都要餵一次（沒餵就停在原地不長）
  //   產物型成年後 → 還有剩餘輪數就要餵（沒餵就不產蛋／奶／毛）
  //   肉用型長大後 → 不用餵，只能出貨（這裡絕不去點，點下去就是宰掉出貨）
  const isAdultAnimal = (T, A) => T.stage >= A.growStages;
  function animalHungry(T, A, CFG) {
    if (T.timer > 0) return false;
    if (!isAdultAnimal(T, A)) return true;
    if (A.type === 'meat') return false;
    const cap = (CFG.rules || {}).animalStackMax;
    return T.cycles > 0 && !(cap > 0 && (T.stack || 0) >= cap);
  }
  const animalFeedNeed = (T, A) => (isAdultAnimal(T, A) ? A.cycleFeedQty : A.stageFeedQty);

  // 蜂箱（device，種類是 hive）裡存了幾罐蜂蜜。用「收成」工具點有蜂蜜的蜂箱，遊戲會把整箱收進倉庫；
  // 點到沒蜂蜜的蜂箱則會改開蜂箱面板（那是玩家自己的視窗），所以沒蜂蜜的蜂箱絕不點。
  const isHive = (T, CFG) =>
    !!T && T.t === 'device' && !!(CFG.devices && CFG.devices[T.id] && CFG.devices[T.id].kind === 'hive');
  const honeyStored = (T) => Object.values(T.honey || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);

  // 倉庫裡設定的作物（含有機版）有幾個
  const targetStock = (S) =>
    targetCrop ? (S.inv[targetCrop.id] || 0) + (S.inv['org_' + targetCrop.id] || 0) : 0;

  // 秒數 → 「3 分 20 秒」「1 小時 5 分」
  function fmtSec(sec) {
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return s + ' 秒';
    if (s < 3600) return Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒';
    return Math.floor(s / 3600) + ' 小時 ' + Math.floor((s % 3600) / 60) + ' 分';
  }

  // 倉庫裡哪些物品要賣：只賣設定的作物與它的有機版（有機作物收成後 id 是 org_<作物 id>）
  const isSellTarget = (id) => !!targetCrop && (id === targetCrop.id || id === 'org_' + targetCrop.id);

  // 作物要到幾級才解鎖（與遊戲相同：升級表裡第一次出現該作物的等級，沒出現就是 1）
  function unlockLevel(CFG, id) {
    for (const L of CFG.levels || []) {
      if ((L.unlocks || []).includes(id)) return L.level;
    }
    return 1;
  }

  // 把使用者輸入的文字對應到作物：先找「名稱或代號完全相同」，沒有再找「包含」，必須剛好一種
  function resolveCrop(text, g) {
    const q = String(text || '').trim().toLowerCase();
    if (!q) return { error: '請輸入作物名稱' };
    const entries = Object.entries(g.CFG.crops);
    const same = (s) => String(s).toLowerCase() === q;
    const has = (s) => String(s).toLowerCase().includes(q);
    let hits = entries.filter(([id, c]) => same(id) || same(c.name));
    if (hits.length === 0) hits = entries.filter(([id, c]) => has(id) || has(c.name));
    if (hits.length === 0) return { error: '找不到作物「' + text.trim() + '」' };
    if (hits.length > 1) {
      return { error: '符合多種：' + hits.slice(0, 6).map(([, c]) => c.name).join('、') + '，請輸入更完整的名稱' };
    }
    const [id, c] = hits[0];
    const lv = unlockLevel(g.CFG, id);
    if (lv > g.S.player.level) {
      return { error: c.name + ' 要到 Lv ' + lv + ' 才解鎖（目前 Lv ' + g.S.player.level + '）' };
    }
    return { id, name: c.name };
  }

  // ───────────────────────── 自動流程 ─────────────────────────

  // 等到條件成立（回傳真值）或逾時（回傳 null）
  async function waitFor(fn, timeoutMs) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(50);
    }
  }

  // 倉庫：開啟 → 勾選要賣的物品 → 「賣出所選」→「確定賣出」→ 關閉。
  // 這是遊戲目前的批次賣出介面（每列有勾選框，下方出現結帳列，確認視窗預設全數賣出）。
  // 無論中途如何結束，只要是我們開的視窗就一定關掉。
  async function sellFlow(g) {
    let opened = false;
    let result = '';
    const before = storageInfo(g).used;
    try {
      const btn = $('storageBtn');
      if (!btn) return;
      btn.click();
      if (!(await waitFor(() => isModalOpen() && modalTitle() === '倉庫', 1500))) {
        result = '開不起倉庫視窗';
        return;
      }
      opened = true;

      // 確保在「農產倉庫」分頁，並等遊戲把勾選框畫好
      const tab = document.querySelector('#modalTabs button[data-k="produce"]');
      if (tab && !tab.classList.contains('on')) tab.click();
      if (!(await waitFor(() => document.querySelector('#modalBody tr[data-bs259] input.cb259'), 1500))) {
        result = '倉庫是空的';
        return;
      }

      // 先清掉玩家之前可能留下的勾選，再只勾我們要賣的
      const clear = document.querySelector('#bsbar259 [data-bsclr259]');
      if (clear) clear.click();
      let picked = 0;
      for (const tr of document.querySelectorAll('#modalBody tr[data-bs259]')) {
        if (!isSellTarget(tr.dataset.bs259)) continue;
        const cb = tr.querySelector('input.cb259');
        if (!cb) continue;
        if (!cb.checked) cb.click();
        picked += 1;
      }
      if (!picked) {
        result = '倉庫裡沒有' + (targetCrop ? targetCrop.name : '設定的作物');
        return;
      }

      const go = await waitFor(() => document.querySelector('#bsbar259 [data-bsgo259]'), 1500);
      if (!go) {
        result = '找不到「賣出所選」按鈕';
        return;
      }
      go.click();
      // 只認「批次賣出」確認視窗（.bs259）：購買確認視窗也用同樣的 #ask47y，不能誤按
      const ok = await waitFor(() => document.querySelector('#ask47 .bs259 #ask47y'), 1500);
      if (!ok || ok.disabled) {
        result = '確認視窗異常';
        return;
      }
      ok.click(); // 確認視窗預設就是每項全數賣出
      await sleep(400);
    } finally {
      // 收尾：確認視窗若還在就取消；倉庫視窗是我們開的就關掉
      const cancel = document.querySelector('#ask47 .bs259 #ask47c');
      if (cancel) cancel.click();
      if (opened) {
        const close = $('modalClose');
        if (close) close.click();
        await sleep(150);
      }
      needSell = false;
      const sold = before - storageInfo(g).used;
      if (sold > 0) {
        stats.sellRuns += 1;
        lastActionAt = Date.now();
        log('賣出 ' + sold + ' 件物品');
      } else {
        sellBlockedUntil = Date.now() + CONFIG.sellRetryMs;
        if (result) setNote('倉庫快滿但沒有賣出：' + result, 5000);
      }
    }
  }

  // 切換遊戲工具（點工具列按鈕）。已經是該工具回傳 true；否則點按鈕並回傳 false，讓切換在下個週期生效。
  function ensureToolIs(g, id) {
    if (g.S.sel.tool === id) return true;
    const btn = document.querySelector('#dock .tool[data-tool="' + id + '"]');
    if (btn) btn.click();
    return false;
  }

  // 準備好播種工具與種子。回傳 true 才能收成／播種；回傳 false 代表這個週期只做了準備動作。
  //
  // 播種必須用「播種」工具（seed）；「收成」工具點空田只會顯示提示、不會播種。
  // 遊戲還有一道防誤觸：切到播種工具後，必須先在下方種子列點選一個種子（S.sel.none49），
  // 否則點空田會被擋下並跳出「先從下面選一個」。所以這裡會：
  //   1. 切到播種工具  2. 點一下種子列裡設定的作物
  function prepareTool(g) {
    const sel = g.S.sel;
    if (!ensureToolIs(g, 'seed')) {
      setStatus('切換工具中（播種）…');
      return false;
    }
    const want = targetCrop.id;
    if (sel.none49 || sel.seed !== want) {
      const item = document.querySelector('#tray .item[data-id="' + want + '"]');
      if (!item || item.classList.contains('locked')) {
        setStatus('無法選用種子：' + want + '（不存在或未解鎖）');
        return false;
      }
      item.click();
      setStatus('切換工具中（選種子）…');
      return false;
    }
    return true;
  }

  // 準備好「照顧」工具並選用「捉蟲」（免費）。
  // 絕不使用施肥、噴農藥：會花錢，而且會讓有機作物變成一般作物。
  // 照顧也是需要先在下方選項列點一下才會生效的工具（S.sel.none49），所以選項一定要點。
  // 回傳 true＝可以抓蟲了；false＝這個週期只做了準備動作；null＝這個工具用不了（例如還沒解鎖）。
  function prepareCareTool(g) {
    const sel = g.S.sel;
    if (!ensureToolIs(g, 'care')) return false;
    if (sel.none49 || sel.care !== 'catch') {
      const item = document.querySelector('#tray .item[data-id="catch"]');
      if (!item || item.classList.contains('locked')) return null;
      item.click();
      return false;
    }
    return true;
  }

  // 動物會在島上走來走去。牠走離家超過約 0.55 格時，遊戲不把「點牠的家那一格」當成點到動物：
  // 真人是直接點畫面上看得到的動物（或蛋窩），遊戲自己會先換算成「點到哪一隻」，再用牠的家的座標呼叫 act，
  // 並在 RT.lastAnimalTap 記下這次點的是誰（400 毫秒內有效）。我們不是用滑鼠點，所以牠不在家時要補上同一個記號，
  // 效果等同玩家點了畫面上看得到的那隻動物或蛋窩。只用在「確認有產物的生產型動物」。
  function animalAway(g, k) {
    const ag = g.RT && g.RT.agents && g.RT.agents[g.S.cur + ':' + k];
    if (!ag) return false;
    const [x, y] = k.split(',').map(Number);
    return Math.hypot(ag.x - x, ag.y - y) > 0.5;
  }
  function markAnimalTap(g, k) {
    if (!g.RT) return;
    g.RT.lastAnimalTap = k;
    g.RT.lastAnimalTapAt = performance.now();
  }

  // 點完之後，地圖上的小選單（#pick53）如果跳出來了，那一定是我們這一下點出來的（每個週期開始時它是關著的，
  // 不然整個週期都暫停）。要處理乾淨，否則它會一直開著，讓之後每個週期都以為是玩家開的而暫停：
  //   1. 「這一格有：」（那格有東西又有沿邊柵欄，用收成工具點會先問要動哪一個）→ 選「那一格的東西」，
  //      等同玩家說「我要動的是那隻雞／那棵樹／那台機器」，遊戲會再跑一次原本的動作
  //   2. 機器的選單（投放材料／收成／產出效能／升級）→ 只按我們要的那一顆（收成或投放材料），絕不碰「升級」（要花錢）
  //   3. 其他沒有我們要的按鈕 → 把選單收起來（和遊戲自己的 closePop53 相同），這次動作算失敗
  // 回傳 true＝選單處理完了而且是順利走完的。
  function settlePopup(g, k, want) {
    for (let i = 0; i < 4; i++) {
      const pop = $('pick53');
      if (!pop || pop.hidden) return true;
      const tile = pop.querySelector('button[data-oe2543="tile"]');
      if (tile) {
        tile.click();
        continue;
      }
      // 餓了的雞、鴨：遊戲點下去會先跳一個小選單（顯示吃蟲紀錄），要按「餵食」才會餵
      const ck = want === 'feed' ? pop.querySelector('button[data-ck248="feed"]') : null;
      if (ck) {
        ck.click();
        continue;
      }
      const mine = !!g.RT && !!g.RT.pick53 && g.RT.pick53.k === k;
      const btn = mine && want && want !== 'feed' ? pop.querySelector('button[data-m61="' + want + '"]') : null;
      if (btn && !btn.classList.contains('off61')) {
        btn.click();
        continue;
      }
      break;
    }
    const pop = $('pick53');
    if (pop && !pop.hidden) {
      pop.hidden = true;
      pop.textContent = '';
      if (g.RT) g.RT.pick53 = null;
      return false;
    }
    return true;
  }

  function doFields(g) {
    const { S, CFG } = g;
    const M = S.maps[S.cur];
    if (!M || !M.tiles) return;

    if (!targetCrop) {
      setStatus('尚未設定作物（' + keyLabel(CONFIG.cropKey) + '）');
      return;
    }
    const R = CFG.rules || {};
    const seed = CFG.crops[targetCrop.id];
    if (!seed) {
      setStatus('找不到作物設定：' + targetCrop.id);
      return;
    }
    const info = storageInfo(g);
    const storageFull = info.free === 0 || (info.free === null && info.fullFlag);

    // 收成需要倉庫放得下；放不下就先不收（避免遊戲跳出「倉庫滿了」詢問，改由賣出流程騰出空間）
    const canHarvest = CONFIG.autoHarvest && !storageFull;
    let room = info.free === null ? Infinity : info.free;
    const canPlant = CONFIG.autoPlant && S.player.coins >= seed.seedCost + CONFIG.minCoinsAfterPlant;

    // 澆水：濕度 T.m 是 0～moistMaxLevel 級，每澆一下 +1 級、花 waterPerTap 滴雨水。
    // 只在雨水夠用時才澆，不會因為水不夠而去動到自來水（要花錢）。
    const maxLevel = R.moistMaxLevel || 4;
    const upTo = Math.min(CONFIG.waterUpTo == null ? maxLevel : CONFIG.waterUpTo, maxLevel);
    const tapCost = R.waterPerTap || 1;
    const canWater = CONFIG.autoWater && S.player.water >= tapCost;

    const now = Date.now();
    // 切換遊戲工具需要一個週期；如果一直卡在這裡，右下角會一直顯示，方便看出是工具切不過去
    const switching = (label) => setStatus('切換工具中（' + label + '）…');
    const harvests = [];
    const plants = [];
    const waters = [];
    const pests = [];
    const pickups = []; // 要用「收成」工具點的有價值東西：糞便、動物產物、果樹、機器成品。[格子, 種類, 附加資料]
    const pools = []; // 魚池（用「播種」工具點才不會跳小選單）：[格子, 'pool', 魚池代號]
    const loads = []; // 機器投料（用「收成」工具點，再按小選單的「投放材料」）
    const cleanups = []; // 雜物：碎石、雜草、草球（排在最後）
    const tilts = []; // 歪掉的裝飾、倒下的柵欄：[格子, 'tilt' | 'fence']（用「澆水」工具點）
    const weedCand = []; // 雜草、草球候選：等其他東西都排好、算過剩餘空位再決定拔不拔
    const feeds = []; // 餓了的動物（用「收成」工具點）：[格子, 'feed', 這次會不會動用金幣補買飼料]
    const feedLeft = {}; // 規劃時各種飼料還剩多少（一邊排一邊扣，避免同一份飼料排給兩隻）
    const feedShort = {}; // 缺的飼料：品項 → 還差幾個
    let coinsLeft = S.player.coins; // 規劃時還剩多少金幣（只有 buyFeedWhenShort 會用到）
    let hungryAnimals = 0; // 餓了的動物隻數
    let hungryUnfed = 0; // 其中因為飼料不夠而沒餵的
    let blockedPick = false; // 有東西可收但倉庫沒空位
    let others = 0; // 田裡其他種類的作物（還在長，不澆水也不處理）
    const otherRipe = []; // 田裡其他種類、已經成熟的作物：[格子, 產量]（等其他東西都排好、算過剩餘空位再決定收不收）
    let otherBlocked = 0; // 其中因為倉庫空位不夠而先不收的格數
    let ripeBlocked = 0; // 成熟了、但倉庫放不下所以還沒收的作物格數
    let unaffordable = 0; // 空田、但金幣不夠買種子所以還沒種的格數
    let growing = 0; // 還在長的設定作物格數
    let minLeft = Infinity; // 其中最快還要幾秒成熟（照濕潤時的速度算，乾的會更久）

    // 長蟲的格子要抓蟲；連續抓不掉就不再卡住這格。回傳 true＝這格交給抓蟲處理，其他動作先跳過
    const wantPestCatch = (k) => {
      const cdp = cooldown.get(k);
      if (cdp && cdp.kind === 'pest' && cdp.fails >= 3) return false;
      if (!(cdp && cdp.until > now)) pests.push(k);
      return true;
    };
    // 澆水：濕度低於門檻就開始澆，澆到 upTo 級才停（避免在門檻附近來回澆）。枯萎的澆水可以救活，一律要澆。
    const wantWater = (k, T, wither) => {
      const m = T.m || 0;
      if (wither || (wetting.has(k) ? m < upTo - 0.001 : m < CONFIG.waterBelow)) {
        wetting.add(k);
        waters.push(k);
      } else {
        wetting.delete(k);
      }
    };

    for (const k in M.tiles) {
      const T = M.tiles[k];
      if (!T) continue;

      // 被風吹歪的裝飾、倒下的柵欄：點一下就扶正（免費）。歪掉的裝飾會失去功能（例如儲水、防風），所以值得扶。
      // 用「澆水」工具點：遊戲在處理澆水之前就先扶正了，不會用到水；而「收成」工具點裝飾時，
      // 遊戲會先判斷蝴蝶棲地、野生植物（點了會被拔掉），不適合拿來點裝飾。
      if (T.t === 'deco' && (T.tilt || (T.id === 'fence' && T.fallen))) {
        const cdd = cooldown.get(k);
        if (CONFIG.autoStraighten && !(cdd && cdd.until > now)) tilts.push([k, T.tilt ? 'tilt' : 'fence']);
        continue;
      }

      // 雜物：碎石點一下就撿掉（不佔倉庫）；雜草、草球會收進倉庫，先記下來，最後才決定要不要拔
      if (T.t === 'debris' || T.t === 'weed' || T.t === 'weedball') {
        const cdw = cooldown.get(k);
        if (cdw && cdw.until > now) continue;
        if (T.t === 'debris') {
          if (CONFIG.autoClearDebris) cleanups.push([k, 'debris']);
        } else if (CONFIG.autoClearWeeds) {
          weedCand.push([k, T.t, T.t === 'weedball' ? Math.max(1, T.n || 1) : 1]);
        }
        continue;
      }

      // 果樹：長蟲先抓蟲；結果了採收（一次產出不會超過 1 個）；沒結果且開了 autoWaterTrees 才澆水
      if (T.t === 'tree') {
        if (CONFIG.autoCatchPests && CONFIG.catchPestsOnOtherCrops && T.pest && wantPestCatch(k)) continue;
        const cdt = cooldown.get(k);
        if (cdt && cdt.until > now) continue;
        if (treeReady(T, CFG)) {
          wetting.delete(k);
          if (!CONFIG.autoHarvestTrees) continue;
          if (room >= 1) {
            pickups.push([k, 'tree']);
            room -= 1;
          } else {
            blockedPick = true;
          }
        } else if (CONFIG.autoWaterTrees && canWater) {
          wantWater(k, T, false);
        }
        continue;
      }

      // 魚池：交給迴圈後面一個池一個池處理
      if (T.t === 'pool') continue;

      // 機器：做好的成品要收；開了 autoLoadMachines 才會投料
      if (T.t === 'machine') {
        const cdm = cooldown.get(k);
        if (cdm && cdm.until > now) continue;
        const ms = machineState(T, g);
        if (!ms) continue;
        if (ms.out > 0) {
          if (!CONFIG.autoCollectMachines) continue;
          if (ms.outQty <= room) {
            pickups.push([k, 'mcollect']);
            room -= ms.outQty;
          } else {
            blockedPick = true;
          }
        } else if (CONFIG.autoLoadMachines && CONFIG.loadMachineIds.includes(T.id) && ms.canLoad) {
          loads.push([k, 'mload']);
        }
        continue;
      }

      // 蜂箱：存了蜂蜜就收（整箱一次收進倉庫，所以要放得下整箱）；其他設備（水井、灑水器…）不碰
      if (T.t === 'device') {
        if (!isHive(T, CFG)) continue;
        const cdh = cooldown.get(k);
        if (cdh && cdh.until > now) continue;
        const jars = honeyStored(T);
        if (jars > 0) {
          if (!CONFIG.autoCollectHoney) continue;
          if (jars <= room) {
            pickups.push([k, 'honey']);
            room -= jars;
          } else {
            blockedPick = true;
          }
        }
        continue;
      }

      // 地上的東西：糞便、動物產出的東西（蛋、奶、羊毛…）。點一下就收進倉庫，所以要倉庫放得下。
      if (T.t === 'poop' || T.t === 'animal') {
        const cdk = cooldown.get(k);
        if (cdk && cdk.until > now) continue;
        if (T.t === 'poop') {
          if (!CONFIG.autoPickPoop) continue;
          if (room >= 1) {
            pickups.push([k, 'poop']);
            room -= 1;
          } else {
            blockedPick = true;
          }
        } else {
          const A = CFG.animals[T.id];
          if (!A) continue;
          // 長大了的肉用動物：出貨（點一下，1 份肉進倉庫、動物消失）。遊戲規定長大後 2 天沒收牠就會死，
          // 所以這是正常的收成；還沒長大的（要餵、不是收）不會進到這裡，由下面的餵食處理。
          if (A.type === 'meat' && isAdultAnimal(T, A)) {
            if (!CONFIG.autoHarvestMeatAnimals) continue;
            if (room >= 1) {
              pickups.push([k, 'meat']);
              room -= 1;
            } else {
              blockedPick = true;
            }
            continue;
          }
          // 生產型動物已經累積的產物：點牠收走。
          // 收產物時遊戲會順便餵食（照遊戲的「飼料不夠時自動買」設定）。
          if (A.type === 'producer' && T.stack > 0) {
            if (!CONFIG.autoCollectAnimalProducts) continue;
            if (T.stack <= room) {
              pickups.push([k, 'product']);
              room -= T.stack;
            } else {
              blockedPick = true;
            }
            continue;
          }
          // 餓了的動物：用倉庫現有的飼料餵（點一下）。飼料不夠就不點，免得被遊戲自動花錢去買
          // （除非你開了 buyFeedWhenShort，而且遊戲本身也開著「飼料不夠時自動買」）。
          if (CONFIG.autoFeedAnimals && animalHungry(T, A, CFG)) {
            hungryAnimals += 1;
            const need = animalFeedNeed(T, A);
            const have = feedLeft[A.feedItem] !== undefined ? feedLeft[A.feedItem] : S.inv[A.feedItem] || 0;
            if (have >= need) {
              feeds.push([k, 'feed', false]);
              feedLeft[A.feedItem] = have - need;
            } else {
              const cost = (need - have) * ((CFG.feedShop || {})[A.feedItem] || 0);
              if (CONFIG.buyFeedWhenShort && S.settings && S.settings.autoBuyFeed && coinsLeft - cost >= CONFIG.minCoinsAfterBuyFeed) {
                feeds.push([k, 'feed', true]); // 第三個值 true＝這次會動用金幣補買不足的飼料
                coinsLeft -= cost;
                feedLeft[A.feedItem] = 0;
              } else {
                feedShort[A.feedItem] = (feedShort[A.feedItem] || 0) + (need - have);
                hungryUnfed += 1;
              }
            }
          }
        }
        continue;
      }

      if (T.t !== 'soil') continue;

      // 作物長蟲：先用「照顧」工具免費抓蟲（有蟲的作物長得慢，收成也只剩 ×0.6）。
      // 蟲還沒抓光之前，這格先不收成、不澆水；如果一直抓不掉（連續失敗），就不再卡住這格，照常處理。
      if (
        CONFIG.autoCatchPests &&
        T.crop &&
        T.crop.pest &&
        (T.crop.id === targetCrop.id || CONFIG.handleOtherCrops || CONFIG.catchPestsOnOtherCrops) &&
        wantPestCatch(k)
      ) {
        continue;
      }

      if (T.crop && !CONFIG.handleOtherCrops && T.crop.id !== targetCrop.id) {
        // 其他種類的作物：不澆水、不賣；成熟了就收（先記下來，等其他東西都排好、算過剩餘空位再決定）
        if (CONFIG.autoHarvest && CONFIG.harvestOtherCrops && isRipe(T, CFG)) {
          wetting.delete(k);
          const cdo = cooldown.get(k);
          if (!(cdo && cdo.until > now)) otherRipe.push([k, (CFG.crops[T.crop.id] || {}).yield || 1]);
        } else {
          others += 1;
        }
        continue;
      }
      const cd = cooldown.get(k);
      if (cd && cd.until > now) continue;
      if (T.crop) {
        if (isRipe(T, CFG)) {
          wetting.delete(k);
          if (!canHarvest) {
            if (CONFIG.autoHarvest) ripeBlocked += 1;
            continue;
          }
          const need = CFG.crops[T.crop.id].yield || 1;
          if (need <= room) {
            harvests.push(k);
            room -= need;
          } else {
            ripeBlocked += 1;
            if (CONFIG.autoSell) needSell = true; // 倉庫還有空位但放不下這次收成：也要賣出騰空間，否則會一直卡住
          }
        } else {
          if (!T.crop.wither) {
            growing += 1;
            minLeft = Math.min(minLeft, CFG.crops[T.crop.id].growSeconds - T.crop.prog);
          }
          if (canWater) wantWater(k, T, T.crop.wither); // 還在長的作物（含枯萎的）：濕度不夠就澆
        }
      } else if (!T.flower) {
        // 有花的田（T.flower）不是空田：對它用播種工具會動到花，所以跳過
        if (canPlant) plants.push(k);
        else if (CONFIG.autoPlant) unaffordable += 1; // 金幣不夠買種子
      }
    }

    const hints = [];
    if (CONFIG.autoWater && !canWater) hints.push('雨水不足，暫停澆水');
    if (others > 0) hints.push('略過其他作物 ' + others + ' 格');
    // 把「為什麼沒做」寫出來，不要讓右下角只說「沒有需要處理的田」
    if (hungryUnfed > 0) {
      const lack = Object.entries(feedShort)
        .map(([id, n]) => ((CFG.items[id] || {}).name || id) + '差 ' + n)
        .join('、');
      hints.push(hungryUnfed + ' 隻動物餓了但飼料不夠（' + lack + '）');
    }
    if (ripeBlocked > 0) hints.push('倉庫放不下，' + ripeBlocked + ' 格成熟作物還沒收');
    if (unaffordable > 0) {
      const need = seed.seedCost + CONFIG.minCoinsAfterPlant;
      const have = Math.floor(S.player.coins);
      const stock = targetStock(S);
      if (CONFIG.autoSell && CONFIG.sellWhenCantPlant && stock > 0) {
        needSell = true; // 金幣不夠買種子：先把倉庫裡的設定作物賣掉換錢，不等倉庫快滿
        hints.push('金幣不夠播種（要 ' + need + '，有 ' + have + '），先賣出' + targetCrop.name);
      } else {
        hints.push(
          '金幣不夠播種（要 ' + need + '，有 ' + have + '）' +
            (stock > 0 ? '' : '，倉庫也沒有可賣的' + targetCrop.name)
        );
      }
    }

    // 魚池：一個池點一下。有長成的魚 → 收成（倉庫要放得下）；沒有、且開了 autoFeedFish → 餵食（只用倉庫現有的飼料）。
    // 絕不補魚苗（要花錢）。
    if (CONFIG.autoHarvestFish || CONFIG.autoFeedFish) {
      for (const pk in M.pools || {}) {
        const P = M.pools[pk];
        if (!P || !P.tiles || !P.tiles.length) continue;
        const k = P.tiles[0];
        const cdp = cooldown.get(k);
        if (cdp && cdp.until > now) continue;
        const ps = poolState(M, P, g);
        if (ps.ready > 0) {
          if (!CONFIG.autoHarvestFish) continue;
          if (ps.harvestQty <= room) {
            pools.push([k, 'pool', pk]);
            room -= ps.harvestQty;
          } else {
            blockedPick = true;
          }
        } else if (ps.hungry > 0 && CONFIG.autoFeedFish) {
          if (ps.feedOk) pools.push([k, 'pool', pk]);
          else hints.push('魚飼料不夠，暫停餵魚');
        }
      }
    }

    // 其他種類的成熟作物：收進倉庫的東西不會自動賣，所以排在設定作物、動物、果樹、魚池、機器之後，
    // 而且收完要還剩 otherCropsKeepFree 個空位以上才收，不能把倉庫塞滿、害設定作物收不了也賣不了。
    for (const [k, need] of otherRipe) {
      if (canHarvest && room - need >= CONFIG.otherCropsKeepFree) {
        harvests.push(k);
        room -= need;
      } else {
        otherBlocked += 1;
      }
    }
    if (otherBlocked > 0) hints.push('倉庫空位不多，' + otherBlocked + ' 格其他作物先不收');

    // 雜草、草球：拔掉要收進倉庫，只有拔完還剩 weedKeepFree 個空位以上才拔，而且排在其他東西之後，不搶它們的空位。
    // 空位不夠只是暫停，不會因此觸發賣出（雜草不值得賣東西去換空位）。
    // 倉庫裡的雜草也有上限（weedMaxStock）：雜草不值錢又不會自動賣掉，不設上限的話整個倉庫會被它佔滿。
    let weedBlocked = false;
    let weedStock = (S.inv && S.inv.weed) || 0;
    for (const [k, kind, n] of weedCand) {
      if (room - n >= CONFIG.weedKeepFree && weedStock + n <= CONFIG.weedMaxStock) {
        cleanups.push([k, kind]);
        room -= n;
        weedStock += n;
      } else {
        weedBlocked = true;
      }
    }
    if (weedBlocked) hints.push('倉庫空位不多或雜草庫存已滿，暫停拔雜草');

    // 一次只用一種工具：抓蟲要「照顧」工具、播種／收成／魚池要「播種」工具、撿東西要「收成」工具、澆水要「澆水」工具。
    // 目前的工具還有事做就繼續用，做完才換，避免每個週期都來回切換；
    // 要換時優先順序是抓蟲 > 播種收成魚池 > 撿東西雜物 > 澆水。
    if (blockedPick) {
      hints.push('倉庫沒空位，暫停收地上的東西、果樹、魚、機器成品、蜂蜜、肉用動物');
      if (CONFIG.autoSell) needSell = true; // 賣掉設定的作物騰出空間
    }
    // 撿糞便、收動物產物、採果樹、收機器、撿雜物都用「收成」工具（hand）：實測用「播種」工具點動物格子不會收；
    // 機器則一定會跳小選單（要再按「收成」）。魚池用「播種」工具直接收，用收成工具會跳小選單。
    const handQueue = pickups.concat(feeds, loads, cleanups);
    const work = {
      care: pests.length > 0,
      seed: harvests.length + plants.length + pools.length > 0,
      hand: handQueue.length > 0,
      water: waters.length + tilts.length > 0, // 扶正也用澆水工具
    };
    const tool = S.sel.tool;
    const pickMode = () => (work[tool] ? tool : ['care', 'seed', 'hand', 'water'].find((m) => work[m]));
    let mode = pickMode();
    if (mode === 'care') {
      const r = prepareCareTool(g);
      if (r === null) {
        // 捉蟲工具用不了（還沒解鎖或找不到按鈕）：不要卡住，改做別的事
        hints.push('捉蟲工具無法使用（未解鎖？）');
        work.care = false;
        mode = pickMode();
      } else if (!r) {
        return switching('照顧／捉蟲');
      }
    }
    if (!mode) {
      // 沒有事做：說明是在等作物長大，還是被什麼擋住
      if (growing > 0) {
        hints.push(growing + ' 格' + targetCrop.name + '還在長，最快約 ' + fmtSec(minLeft) + ' 後成熟');
      }
      setStatus('運作中（暫時沒有事做）' + (hints.length ? '｜' + hints.join('｜') : ''));
      return;
    }

    let queue;
    if (mode === 'care') {
      queue = pests.map((k) => [k, 'pest']);
    } else if (mode === 'water') {
      if (!ensureToolIs(g, 'water')) return switching('澆水');
      queue = waters.map((k) => [k, 'water']).concat(tilts);
    } else if (mode === 'hand') {
      if (!ensureToolIs(g, 'hand')) return switching('收成');
      queue = handQueue;
    } else {
      if (!prepareTool(g)) return; // prepareTool 自己會寫明是在切工具、還是種子用不了
      queue = harvests.map((k) => [k, 'harvest']).concat(plants.map((k) => [k, 'plant']), pools);
    }

    let done = 0;
    for (const [k, kind, extra] of queue) {
      if (done >= CONFIG.maxActionsPerTick) break;
      const [x, y] = k.split(',').map(Number);
      const T0 = M.tiles[k];
      const H0 = hostOf(T0);
      const before = {
        m: (T0 && T0.m) || 0,
        wither: !!(T0 && T0.crop && T0.crop.wither),
        taps: (H0 && H0.pestTaps) || 0,
        stack: (T0 && T0.stack) || 0,
        honey: 0,
        prog: (T0 && T0.prog) || 0,
        poolSig: '',
        machineOut: 0,
        machineInput: 0,
      };

      // 安全閘：每一種動作點下去之前，都重新確認那一格現在確實還是我們要處理的東西
      // 照顧工具一定要是「捉蟲」才點（其他選項會花錢、會讓有機作物變一般作物）
      if (kind === 'pest' && (S.sel.tool !== 'care' || S.sel.care !== 'catch' || S.sel.none49)) break;
      // 只點糞便格，以及「生產型」動物且確實有產物的格（肉用動物一點就會被宰掉）
      if (kind === 'poop' && (!T0 || T0.t !== 'poop')) continue;
      if (kind === 'product') {
        const A = T0 && T0.t === 'animal' ? CFG.animals[T0.id] : null;
        if (!A || A.type !== 'producer' || !(T0.stack > 0)) continue;
      }
      // 餵動物：那隻現在確實餓著；飼料夠（除非排程時就知道這次要補買）；肉用長大的不會進到這裡
      if (kind === 'feed') {
        const A = T0 && T0.t === 'animal' ? CFG.animals[T0.id] : null;
        if (!A || !animalHungry(T0, A, CFG)) continue;
        if (!extra && (S.inv[A.feedItem] || 0) < animalFeedNeed(T0, A)) continue;
        if (A.type === 'producer' && T0.stack > 0 && !CONFIG.autoCollectAnimalProducts) continue; // 點下去會順便收產物
      }
      // 蜂箱：一定要真的存著蜂蜜（沒有的話收成工具會改開蜂箱面板，那是玩家自己的視窗，不能被我們叫出來）
      if (kind === 'honey') {
        if (!CONFIG.autoCollectHoney || !isHive(T0, CFG) || honeyStored(T0) <= 0) continue;
        before.honey = honeyStored(T0);
      }
      // 肉用動物：只有「確實長大了的肉用動物」才出貨；還沒長大的是餵食階段，點下去不是收成
      if (kind === 'meat') {
        const A = T0 && T0.t === 'animal' ? CFG.animals[T0.id] : null;
        if (!CONFIG.autoHarvestMeatAnimals || !A || A.type !== 'meat' || !isAdultAnimal(T0, A)) continue;
      }
      if (kind === 'tree' && !(T0 && T0.t === 'tree' && treeReady(T0, CFG))) continue;
      if ((kind === 'weed' || kind === 'weedball' || kind === 'debris') && (!T0 || T0.t !== kind)) continue;
      // 扶正：一定要是「澆水」工具（收成／移除／收回工具對裝飾的意思都不一樣），而且那格現在確實還歪著、倒著
      if ((kind === 'tilt' || kind === 'fence') && S.sel.tool !== 'water') break;
      if (kind === 'tilt' && !(T0 && T0.t === 'deco' && T0.tilt)) continue;
      if (kind === 'fence' && !(T0 && T0.t === 'deco' && T0.id === 'fence' && T0.fallen)) continue;
      // 魚池：只有「有長成的魚可收」，或（開了 autoFeedFish 且飼料夠）「全部都在等餵」才點；
      // 點魚池時遊戲在沒有可收的魚時會改成餵食，所以餵食的飼料要先確認倉庫夠，絕不讓遊戲去買
      if (kind === 'pool') {
        const P = M.pools && M.pools[extra];
        if (!P) continue;
        const ps = poolState(M, P, g);
        const canHarvestNow = ps.ready > 0 && CONFIG.autoHarvestFish;
        const canFeedNow = ps.ready === 0 && ps.hungry > 0 && CONFIG.autoFeedFish && ps.feedOk;
        if (!canHarvestNow && !canFeedNow) continue;
        before.poolSig = ps.sig;
      }
      // 機器：有成品才收；投料只在開啟、機器在白名單內、材料夠、成品庫存沒爆、而且沒有成品等著收時
      if (kind === 'mcollect' || kind === 'mload') {
        const ms = T0 && T0.t === 'machine' ? machineState(T0, g) : null;
        if (!ms) continue;
        if (kind === 'mcollect' && !(ms.out > 0)) continue;
        if (
          kind === 'mload' &&
          !(CONFIG.autoLoadMachines && CONFIG.loadMachineIds.includes(T0.id) && ms.out === 0 && ms.canLoad)
        ) {
          continue;
        }
        before.machineOut = ms.out;
        before.machineInput = ms.inputLeft;
      }

      if ((kind === 'product' || kind === 'feed' || kind === 'meat') && animalAway(g, k)) markAnimalTap(g, k); // 動物不在家：等同玩家點了畫面上看得到的牠
      g.act(x, y);
      done += 1;
      // 點完如果跳出小選單（機器選單、沿邊柵欄的「這一格有：」、餓了的雞的「餵食」）：處理掉，不留著卡住自己
      settlePopup(g, k, kind === 'mcollect' ? 'collect' : kind === 'mload' ? 'load' : kind === 'feed' ? 'feed' : null);

      // 以動作後的狀態確認是否真的成功（金幣不夠、剛噴農藥、雨水用完、倉庫放不下等情況不會算進去）
      const T = M.tiles[k];
      const H = hostOf(T);
      let ok = false;
      if (kind === 'harvest') ok = !!T && !T.crop;
      else if (kind === 'plant') ok = !!T && !!T.crop;
      else if (kind === 'pest') ok = !!T && (!H || !H.pest || (H.pestTaps || 0) > before.taps);
      else if (kind === 'poop') ok = !T || T.t !== 'poop';
      else if (kind === 'product') ok = !T || (T.stack || 0) < before.stack;
      else if (kind === 'honey') ok = !!T && isHive(T, CFG) && honeyStored(T) < before.honey;
      else if (kind === 'meat') ok = !T || T.t !== 'animal';
      else if (kind === 'tree') ok = !!T && T.t === 'tree' && (T.prog || 0) < before.prog;
      else if (kind === 'feed') ok = !!T && T.t === 'animal' && (T.timer || 0) > 0;
      else if (kind === 'weed' || kind === 'weedball' || kind === 'debris') ok = !T || T.t !== kind;
      else if (kind === 'tilt') ok = !T || T.t !== 'deco' || !T.tilt;
      else if (kind === 'fence') ok = !T || T.t !== 'deco' || !T.fallen;
      else if (kind === 'pool') {
        const P = M.pools && M.pools[extra];
        ok = !!P && poolState(M, P, g).sig !== before.poolSig;
      } else if (kind === 'mcollect' || kind === 'mload') {
        const ms = T && T.t === 'machine' ? machineState(T, g) : null;
        ok = !!ms && (kind === 'mcollect' ? ms.out < before.machineOut : ms.inputLeft < before.machineInput);
      } else ok = !!T && ((T.m || 0) > before.m + 0.01 || (before.wither && !!T.crop && !T.crop.wither));

      if (ok) {
        lastActionAt = Date.now();
        if (kind === 'harvest') {
          stats.harvest += 1;
          sellBlockedUntil = 0; // 倉庫裡有了新作物，之前「沒東西可賣」的暫停就不算數了
        } else if (kind === 'plant') {
          stats.plant += 1;
        } else if (kind === 'pest') {
          if (!H || !H.pest) stats.pest += 1; // 蟲抓光了才算一格（每格要點好幾下）
        } else if (kind === 'feed') {
          stats.feed += 1;
        } else if (kind === 'poop' || kind === 'product') {
          stats.pick += 1;
        } else if (kind === 'honey') {
          stats.honey += 1;
        } else if (kind === 'meat') {
          stats.meat += 1;
        } else if (kind === 'tree') {
          stats.fruit += 1;
        } else if (kind === 'pool') {
          stats.fish += 1;
        } else if (kind === 'mcollect' || kind === 'mload') {
          stats.machine += 1;
        } else if (kind === 'weed' || kind === 'weedball' || kind === 'debris' || kind === 'tilt' || kind === 'fence') {
          stats.clean += 1;
        } else {
          stats.water += 1;
        }
      }

      // 同一格連續做同一種動作都沒成功（例如金幣不夠、剛噴過農藥）：退避越來越久，避免狂點與洗版提示
      const prev = cooldown.get(k);
      const fails = ok ? 0 : prev && prev.kind === kind ? prev.fails + 1 : 0;
      cooldown.set(k, {
        kind,
        fails,
        until: Date.now() + (ok ? 300 : Math.min(60000, 1500 * Math.pow(2, fails))),
      });

      // 播種會花金幣、澆水會花雨水：每次都重新檢查，避免超出預算
      if (kind === 'plant' && S.player.coins < seed.seedCost + CONFIG.minCoinsAfterPlant) break;
      if (kind === 'water' && S.player.water < tapCost) break;
    }

    setStatus('運作中' + (hints.length ? '｜' + hints.join('｜') : ''));
  }

  async function tick() {
    const g = game();
    if (!g) {
      setStatus('等待遊戲載入…');
      return;
    }
    if (g.RT && g.RT.mv) {
      setStatus('你正在搬移物件，暫停中'); // 不打擾；放下或取消搬移後會繼續
      return;
    }
    if (document.body && document.body.classList.contains('ui-hide')) {
      // 遊戲按了「全部隱藏」：介面隱藏時遊戲會忽略所有點擊，腳本做什麼都沒用，先暫停
      setStatus('遊戲介面被隱藏（「全部隱藏」），暫停中');
      return;
    }
    if (panel) {
      setStatus('設定作物中…');
      return; // 玩家正在輸入作物，先暫停
    }

    if (isModalOpen()) {
      // 收成時倉庫放不下，遊戲會跳出這個詢問視窗：按「先不收成」，再去賣
      if (modalTitle() === '農產倉庫滿了') {
        const cancel = $('fullCancel');
        if (cancel) cancel.click();
        needSell = true;
        return;
      }
      setStatus('有視窗開啟（' + modalTitle() + '），暫停中');
      return; // 玩家自己開了別的視窗，不打擾
    }
    if (document.getElementById('ask47')) {
      // 玩家留著一個確認視窗（例如購買確認）：絕對不碰，等玩家處理
      setStatus('有確認視窗開啟，暫停中');
      return;
    }
    const pop = $('pick53');
    if (pop && !pop.hidden) {
      // 地圖上跳出的小選單（機器、魚池、柵欄…）是玩家自己叫出來的：不碰，等玩家處理
      setStatus('有選單開啟，暫停中');
      return;
    }

    const info = storageInfo(g);
    const nearlyFull =
      (info.free !== null && info.free <= CONFIG.sellWhenFreeAtMost) ||
      (info.free === null && info.fullFlag);
    if (CONFIG.autoSell && (needSell || nearlyFull) && Date.now() >= sellBlockedUntil) {
      setStatus(nearlyFull ? '倉庫快滿，賣出中…' : '賣出中…');
      await sellFlow(g);
      return;
    }

    doFields(g);
  }

  function onTick() {
    if (Date.now() - lastRenderAt >= 1000) renderBadge(false); // 讓「上次動作：N 秒前」跟著走
    if (ticking) return;
    ticking = true;
    tick()
      .catch((err) => {
        // 失敗時安全優先：直接關閉自動功能，避免在未知狀態下持續操作
        log('發生錯誤，已自動關閉：', err);
        setEnabled(false);
        setNote('發生錯誤，已自動關閉（看 console）', 8000);
      })
      .finally(() => {
        ticking = false;
      });
  }

  function setEnabled(on) {
    if (enabled === on) return;
    enabled = on;
    if (on) {
      stats = newStats();
      needSell = false;
      sellBlockedUntil = 0;
      lastActionAt = 0;
      cooldown.clear();
      wetting.clear();
      status = '啟動中';
      timer = setInterval(onTick, CONFIG.tickMs);
    } else {
      clearInterval(timer);
      timer = null;
      status = '';
    }
    log('自動功能', on ? 'ON' : 'OFF');
    renderBadge(true);
  }

  // ───────────────────────── 畫面標籤 ─────────────────────────

  function setStatus(s) {
    if (status === s) return;
    status = s;
    renderBadge(false);
  }

  function setNote(msg, ms) {
    note = msg;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      note = '';
      renderBadge(false);
    }, ms);
    renderBadge(true);
  }

  function createBadge() {
    const el = document.createElement('div');
    el.id = BADGE_ID;
    el.title = '點一下可隱藏（按開關鍵會再次顯示）';
    Object.assign(el.style, {
      position: 'fixed',
      right: '8px',
      bottom: '8px',
      zIndex: '2147483647',
      padding: '4px 8px',
      font: '12px/1.4 sans-serif',
      color: '#fff',
      borderRadius: '6px',
      cursor: 'pointer',
      userSelect: 'none',
      whiteSpace: 'pre-line',
      textAlign: 'right',
    });
    el.addEventListener('click', () => {
      el.style.display = 'none';
    });
    document.body.appendChild(el);
    return el;
  }

  // 快速鍵說明；三個鍵的修飾鍵相同時合併顯示，例如「Alt+Shift＋A 開關／S 作物／D 診斷」
  function hotkeyLine() {
    const keys = [
      [CONFIG.toggleKey, '開關'],
      [CONFIG.cropKey, '作物'],
      [CONFIG.probeKey, '診斷'],
    ];
    const mod = (k) => [k.ctrl && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift'].filter(Boolean).join('+');
    const letter = (k) => k.code.replace(/^Key/, '');
    if (keys.every(([k]) => mod(k) === mod(keys[0][0]))) {
      return mod(keys[0][0]) + '＋' + keys.map(([k, label]) => letter(k) + ' ' + label).join('／');
    }
    return keys.map(([k, label]) => keyLabel(k) + ' ' + label).join('｜');
  }

  function renderBadge(show) {
    if (!badge) return;
    if (show) badge.style.display = '';
    badge.style.background = enabled ? 'rgba(0, 110, 0, 0.85)' : 'rgba(0, 0, 0, 0.7)';
    const lines = [
      'SkyFarm 輔助 v' + VERSION + '｜自動：' + (enabled ? 'ON' : 'OFF'),
      '作物：' + (targetCrop ? targetCrop.name + '（' + targetCrop.id + '）' : '未設定'),
      hotkeyLine(),
    ];
    if (enabled) {
      lines.push(
        '收成 ' + stats.harvest + '｜播種 ' + stats.plant + '｜澆水 ' + stats.water +
          '｜捉蟲 ' + stats.pest + '｜撿拾 ' + stats.pick + '｜賣出 ' + stats.sellRuns + ' 次'
      );
      lines.push(
        '果樹 ' + stats.fruit + '｜魚池 ' + stats.fish + '｜機器 ' + stats.machine + '｜雜物 ' + stats.clean +
          '｜餵食 ' + stats.feed
      );
      lines.push('蜂蜜 ' + stats.honey + '｜出貨 ' + stats.meat);
      // 上一次真的做成事的時間：數字不動、又一直很久以前，就是停住了，看下一行的原因
      lines.push(lastActionAt ? '上次動作：' + fmtSec((Date.now() - lastActionAt) / 1000) + '前' : '開啟後還沒做成任何事');
      if (status) lines.push(status);
    }
    if (note) lines.push(note);
    badge.textContent = lines.join('\n');
    lastRenderAt = Date.now();
  }

  function initBadge() {
    if (document.getElementById(BADGE_ID)) return;
    badge = createBadge();
    renderBadge(true);
  }

  // ───────────────────────── 唯讀診斷 ─────────────────────────

  // 移除 ? 與 # 之後的內容，避免 token 等敏感參數被輸出
  function stripUrl(u) {
    const s = String(u);
    if (/^(data|blob):/i.test(s)) return s.split(':')[0] + ':…';
    try {
      const x = new URL(s, location.href);
      return x.origin + x.pathname;
    } catch (_) {
      return s.split(/[?#]/)[0];
    }
  }

  function describeCanvasEl(c) {
    const r = c.getBoundingClientRect();
    return {
      id: c.id || null,
      width: c.width,
      height: c.height,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  }

  // 只輸出數量與設定，不輸出任何玩家識別資訊
  function describeGame() {
    const g = game();
    if (!g) return { api: false, exposed: Object.keys(window).filter((k) => /^__farm/.test(k)).length };
    const { S, CFG } = g;
    const M = S.maps[S.cur];
    const count = { soil: 0, empty: 0, growing: 0, growingDry: 0, ripe: 0, withered: 0, pest: 0 };
    const ground = {
      poop: 0, animalsWithProduct: 0, meatAnimals: 0, weed: 0, weedball: 0, debris: 0, tiltedDeco: 0, fallenFence: 0,
    };
    const trees = { total: 0, ripe: 0, pest: 0 };
    const hives = { total: 0, withHoney: 0, jars: 0 }; // 蜂箱：有幾個、幾個存著蜂蜜、共幾罐
    const machines = {}; // 機器代號 → { total, working, output（有成品等著收的台數）}
    // 動物：餓了幾隻、需要多少飼料、倉庫有多少；長大待出貨的肉用動物；產物型剩幾輪壽命
    const animals = { total: 0, hungry: 0, producersWithProduct: 0, meatReadyToShip: 0, lastCycles: 0, feedNeed: {}, feedStock: {} };
    for (const k in (M && M.tiles) || {}) {
      const T = M.tiles[k];
      if (T && (T.t === 'weed' || T.t === 'weedball' || T.t === 'debris')) ground[T.t] += 1;
      if (T && T.t === 'deco') {
        if (T.tilt) ground.tiltedDeco += 1;
        if (T.id === 'fence' && T.fallen) ground.fallenFence += 1;
      }
      if (T && T.t === 'tree') {
        trees.total += 1;
        if (treeReady(T, CFG)) trees.ripe += 1;
        if (T.pest) trees.pest += 1;
      }
      if (isHive(T, CFG)) {
        const jars = honeyStored(T);
        hives.total += 1;
        if (jars > 0) hives.withHoney += 1;
        hives.jars += jars;
      }
      if (T && T.t === 'machine') {
        const m = machines[T.id] || (machines[T.id] = { total: 0, working: 0, output: 0 });
        const ms = machineState(T, g);
        m.total += 1;
        if (T.state === 'working') m.working += 1;
        if (ms && ms.out > 0) m.output += 1;
      }
      if (T && T.t === 'poop') ground.poop += 1;
      if (T && T.t === 'animal') {
        const A = CFG.animals[T.id];
        if (A && A.type === 'producer' && T.stack > 0) ground.animalsWithProduct += 1;
        if (A && A.type === 'meat') ground.meatAnimals += 1;
        if (A) {
          animals.total += 1;
          if (A.type === 'producer' && T.stack > 0) animals.producersWithProduct += 1;
          if (A.type === 'meat' && isAdultAnimal(T, A)) animals.meatReadyToShip += 1;
          if (A.type === 'producer' && isAdultAnimal(T, A) && T.cycles > 0 && T.cycles <= 3) animals.lastCycles += 1;
          if (animalHungry(T, A, CFG)) {
            animals.hungry += 1;
            animals.feedNeed[A.feedItem] = (animals.feedNeed[A.feedItem] || 0) + animalFeedNeed(T, A);
            animals.feedStock[A.feedItem] = S.inv[A.feedItem] || 0;
          }
        }
      }
      if (!T || T.t !== 'soil') continue;
      count.soil += 1;
      if (T.crop && T.crop.pest) count.pest += 1;
      if (!T.crop) count.empty += 1;
      else if (T.crop.wither) count.withered += 1;
      else if (isRipe(T, CFG)) count.ripe += 1;
      else {
        count.growing += 1;
        if ((T.m || 0) < CONFIG.waterBelow) count.growingDry += 1;
      }
    }
    const pools = { pools: 0, cells: 0, ready: 0, hungry: 0 };
    for (const pk in (M && M.pools) || {}) {
      const P = M.pools[pk];
      if (!P || !P.tiles) continue;
      const ps = poolState(M, P, g);
      pools.pools += 1;
      pools.cells += ps.cells;
      pools.ready += ps.ready;
      pools.hungry += ps.hungry;
    }
    const info = storageInfo(g);
    const inv = {};
    for (const id of Object.keys(S.inv || {})) {
      const cat = (CFG.items[id] || {}).category || '?';
      inv[cat] = (inv[cat] || 0) + S.inv[id];
    }
    return {
      api: true,
      level: S.player.level,
      coins: Math.floor(S.player.coins),
      rainWater: Math.floor(S.player.water),
      tool: S.sel.tool,
      selectedSeed: S.sel.seed,
      targetCrop: targetCrop ? targetCrop.id : null,
      storage: { used: info.used, cap: info.cap, free: info.free },
      inventoryByCategory: inv,
      tiles: count,
      ground,
      trees,
      pools,
      hives,
      machines,
      animals,
      autoBuyFeedSetting: !!(S.settings && S.settings.autoBuyFeed),
    };
  }

  function runProbe() {
    let report;
    try {
      report = {
        probeVersion: VERSION,
        time: new Date().toISOString(),
        page: { url: stripUrl(location.href), title: document.title, isTop: window.top === window },
        canvases: Array.from(document.querySelectorAll('canvas'))
          .filter((c) => c.clientWidth > 0)
          .map(describeCanvasEl),
        game: describeGame(),
        config: CONFIG,
      };
    } catch (err) {
      log('診斷失敗：', err);
      setNote('診斷失敗，請看 console', 4000);
      return;
    }

    const text = JSON.stringify(report, null, 2);
    log('診斷結果（唯讀、已移除網址參數）：\n' + text);

    // 摘要直接顯示在右下角（不必靠剪貼簿，剪貼簿在某些瀏覽器設定下會被擋）
    const G = report.game;
    const summary = G.api
      ? '診斷：成熟 ' + G.tiles.ripe + '｜空田 ' + G.tiles.empty + '｜生長中 ' + G.tiles.growing +
        '｜倉庫 ' + G.storage.used + '/' + G.storage.cap + '｜金幣 ' + G.coins + '｜雨水 ' + G.rainWater +
        '\n動物：' + G.animals.total + ' 隻｜餓了 ' + G.animals.hungry + '｜長大待出貨 ' + G.animals.meatReadyToShip +
        '｜蜂蜜 ' + G.hives.jars + ' 罐'
      : '診斷：遊戲介面還沒載入';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => setNote(summary + '\n完整結果已複製到剪貼簿（也在 Console）', 12000),
        () => setNote(summary + '\n複製失敗，完整結果請從 Console 複製', 12000)
      );
    } else {
      setNote(summary + '\n無法存取剪貼簿，完整結果請從 Console 複製', 12000);
    }
  }

  // ───────────────────────── 設定作物的輸入面板 ─────────────────────────

  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
    startAfterSet = false;
    renderBadge(false);
  }

  // 跳出輸入框讓使用者輸入「這次要自動種植並賣出的作物」。
  // startAfter＝true 表示是按「開啟自動」叫出來的，確認後直接開始。
  function openCropPanel(startAfter) {
    if (panel) return;
    const g = game();
    startAfterSet = !!startAfter;

    const box = document.createElement('div');
    box.id = PANEL_ID;
    Object.assign(box.style, {
      position: 'fixed',
      right: '8px',
      bottom: (badge && badge.style.display !== 'none' ? badge.offsetHeight : 0) + 16 + 'px',
      zIndex: '2147483647',
      width: '270px',
      padding: '10px 12px',
      font: '13px/1.5 sans-serif',
      color: '#fff',
      background: 'rgba(20, 24, 32, 0.96)',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
    });

    const title = document.createElement('div');
    title.textContent = '這次要自動種植並賣出的作物';
    title.style.fontWeight = '700';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 30;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '輸入名稱或代號，例如：小麥、wheat';
    input.value = targetCrop ? targetCrop.name : '';
    Object.assign(input.style, {
      boxSizing: 'border-box',
      width: '100%',
      margin: '6px 0',
      padding: '6px 8px',
      font: 'inherit',
      color: '#000',
      background: '#fff',
      border: '1px solid #888',
      borderRadius: '4px',
    });

    // 已解鎖的作物當作輸入建議
    if (g) {
      const list = document.createElement('datalist');
      list.id = PANEL_ID + '-list';
      for (const [id, c] of Object.entries(g.CFG.crops)) {
        if (unlockLevel(g.CFG, id) > g.S.player.level) continue;
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.label = id;
        list.appendChild(opt);
      }
      input.setAttribute('list', list.id);
      box.appendChild(list);
    }

    const hint = document.createElement('div');
    hint.textContent =
      'Enter 確認、Esc 取消' + (startAfterSet ? '；確認後開始自動作業' : '') + '。只會種、賣這個作物。';
    Object.assign(hint.style, { fontSize: '12px', opacity: '0.75' });

    const error = document.createElement('div');
    Object.assign(error.style, { color: '#ff9a9a', minHeight: '18px', margin: '4px 0' });

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
    const mkBtn = (text, primary) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      Object.assign(b.style, {
        padding: '4px 12px',
        font: 'inherit',
        cursor: 'pointer',
        border: 'none',
        borderRadius: '4px',
        color: '#fff',
        background: primary ? '#2e8b3d' : '#555',
      });
      return b;
    };
    const cancelBtn = mkBtn('取消', false);
    const okBtn = mkBtn('確認', true);
    row.append(cancelBtn, okBtn);

    const confirm = () => {
      const gg = game();
      if (!gg) {
        error.textContent = '遊戲還沒載入完成，請稍後再試';
        return;
      }
      const r = resolveCrop(input.value, gg);
      if (r.error) {
        error.textContent = r.error;
        input.focus();
        return;
      }
      const changed = !targetCrop || targetCrop.id !== r.id;
      targetCrop = { id: r.id, name: r.name };
      if (changed) {
        cooldown.clear();
        wetting.clear();
        needSell = false;
        sellBlockedUntil = 0;
      }
      const start = startAfterSet;
      closePanel();
      log('已設定作物：', r.name, '(' + r.id + ')');
      setNote('已設定作物：' + r.name, 4000);
      if (start) setEnabled(true);
    };

    okBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', closePanel);
    input.addEventListener('input', () => {
      error.textContent = '';
    });

    // 輸入時不讓遊戲收到按鍵（遊戲有數字鍵切工具等快速鍵）。
    // 輸入法組字中的 Enter 是「選字」不是確認，要略過。
    for (const type of ['keydown', 'keyup', 'keypress']) {
      box.addEventListener(type, (e) => e.stopPropagation());
    }
    box.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && e.target === input) {
        e.preventDefault();
        confirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
      }
    });

    box.append(title, input, hint, error, row);
    document.body.appendChild(box);
    panel = box;
    input.focus();
    input.select();
    renderBadge(false);
  }

  // 開啟自動功能前一定要先有設定作物
  function requestToggle() {
    if (enabled) setEnabled(false);
    else if (!targetCrop) openCropPanel(true);
    else setEnabled(true);
  }

  // ───────────────────────── 組合鍵 ─────────────────────────

  // 在 window 的捕獲階段最先處理；只接受使用者真實按鍵，不接受頁面程式合成的事件
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted || e.repeat) return;
      const isToggle = matchKey(e, CONFIG.toggleKey);
      const isCrop = matchKey(e, CONFIG.cropKey);
      const isProbe = matchKey(e, CONFIG.probeKey);
      if (!isToggle && !isCrop && !isProbe) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isProbe) runProbe();
      else if (panel) closePanel(); // 輸入框開著時，開關鍵與設定鍵都當作「取消」
      else if (isCrop) openCropPanel(false);
      else requestToggle();
    },
    true
  );

  // ───────────────────────── 啟動 ─────────────────────────

  log('v' + VERSION + ' 已載入（預設 OFF）', stripUrl(location.href));

  if (document.body) initBadge();
  else document.addEventListener('DOMContentLoaded', initBadge, { once: true });
})();
