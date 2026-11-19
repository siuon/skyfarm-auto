/*
 * SkyFarm Auto — 浮島農場 SkyFarm 遊戲輔助
 *
 * 由 Tampermonkey 透過 @require 載入（設定見 skyfarm-auto.loader.user.js）。
 *
 * 功能（0.21.0）：
 *   - Alt+Shift+S：跳出輸入框，輸入「這次要自動種植的作物」（中文名稱或代號皆可）
 *   - Alt+Shift+A：開啟／關閉自動功能（每次載入頁面一律預設 OFF，不會記住 ON）；
 *                  還沒設定作物就按開啟時，會先跳出輸入框，確認後才開始
 *   - Alt+Shift+D：唯讀診斷，輸出頁面與遊戲狀態摘要並複製到剪貼簿
 *   - Alt+Shift+G：開關「設定視窗」——CONFIG 裡可以調的參數都在裡面，有說明與預設值，改了立刻生效；
 *                  改過的值存在這個網站的 localStorage 的一個鍵（skyfarm-auto-settings），下次載入自動套用
 *                  （開關、作物、Alt+Shift+F 的暫時切換不存）。右下角的「⚙」按鈕也能開，不靠快速鍵；
 *                  快速鍵可以在視窗最下面的「快速鍵」那組改（要有 Alt、不含 Ctrl、彼此不重複）。新增 CONFIG 參數要同時加進 SCHEMA。
 *   - 設定的作物不會被記住（重新整理頁面就要重設），目前作物顯示在右下角標籤
 *   - 自動功能開啟後，只處理「設定的作物」，每個週期依序處理：
 *       1. 遊戲跳出「農產倉庫滿了」視窗 → 按「先不收成」，並標記要賣出
 *       2. 倉庫剩餘空位 ≤ 門檻 → 開啟倉庫視窗、賣掉設定的作物（含有機版）、關閉倉庫視窗
 *       3. 成熟的設定作物 → 收成；空的田 → 種下設定的作物。
 *          有空田但金幣不夠買種子 → 直接賣掉倉庫裡設定的作物換錢，不等倉庫快滿（CONFIG.sellWhenCantPlant）
 *          選種子像真人一樣一步一步切：播種工具 →「作物」分頁 → 作物分類（例如玉米在「穀物」）→ 點看得見的種子；
 *          玩家停在設施、蝴蝶園、花苗、果樹分頁或別的作物分類時也會切回來，絕不去點「藏起來的」品項
 *          （那樣種子雖然選到了，分頁卻還停在設施，點地圖會變成蓋設施）；分頁不在「作物」就不播種、不收成。
 *       4. 還在長（或已枯萎）的設定作物，濕度低於門檻 → 切到澆水工具澆到滿（只用雨水）
 *       5. 作物長蟲 → 切到「照顧」工具選「捉蟲」，每格點 3 下抓光（免費）；蟲沒抓光前該格不收成、不澆水。
 *          不噴農藥、不用化肥（會花錢，也會讓有機作物變一般作物）。其他種類作物長蟲也會抓。
 *          （同一個「照顧」工具也用來施有機肥，見第 13 項。）
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
 *          只有拔完倉庫還剩 CONFIG.weedKeepFree 個空位以上才拔（雜草不值錢，不能擠掉作物的位置；空位不夠就留在地上）。
 *          倉庫裡的雜草沒有數量上限；賣出設定作物時會一併把倉庫裡的雜草賣掉（1 金幣一個，CONFIG.sellWeedsWithCrops）。
 *          雜草沒拔時，右下角標籤會寫剩幾格空位、要保留幾格。
 *          遊戲在「擴地模式」時所有點擊都被當成擴地，所以腳本偵測到就暫停（結束擴地模式才繼續）。
 *          有多座島時：預設「全島輪流」（CONFIG.islandMode = 'all'，Alt+Shift+F 切換成只做畫面上這座）。遊戲裡所有島一直在運作，
 *          但點擊只作用在畫面上那座；腳本先乾跑規劃每座島（不動任何東西）判斷有沒有事做，只切去有事做的島（點右側「農場 N」，和你點的一樣），
 *          做完回「家島」（按開始時看的那座、或你最後手動切到的那座）。你手動切島時，那座就是家島，30 秒內不自己切走。
 *          切島會讓畫面跟著換、鏡頭重新對焦（你自己調的縮放會被重設）。細節見下方「多座島」一節。
 *       8. 果樹結果了 → 採收；有蟲 → 抓蟲。魚池有魚長成了 → 收成；機器做好了 → 收成品；
 *          蜂箱裡存了蜂蜜 → 收進倉庫（點到沒蜂蜜的蜂箱會跳蜂箱面板，所以只點有蜂蜜的）。
 *          （都只在倉庫放得下時才收。補魚苗、升級機器一律不碰。）
 *       9. 田裡不是設定作物的作物：成熟了也收成（CONFIG.harvestOtherCrops；只收、不澆水、不賣，
 *          倉庫要放得下、收完還剩 CONFIG.otherCropsKeepFree 個空位才收，免得擠掉設定作物的位置）。
 *      10. 機器人耗材磨完（鋸鏈、鑽頭、鏟刃、輪子、螺旋槳、滾筒、清潔刷）→ 到那種機器人的充電樁面板替它換上
 *          （CONFIG.autoSwapParts）。伐木／採礦／整地機器人遊戲規定要手動換，倉庫有備品也不會自動換，這裡替你按「換耗材」；
 *          倉庫沒備品時，CONFIG.buyPartsWhenShort 開著、買完金幣還有 CONFIG.minCoinsAfterBuyParts 以上，就買 1 個再換
 *          （照商店單價，會花金幣；面板標的價格和遊戲設定不一致就不買）。花金幣的按鈕按下去，遊戲會先跳「確定要買嗎？」
 *          確認視窗，腳本核對買的東西、數量、價格都和預期一樣、買完金幣還夠，才按「確定購買」，對不上就按「取消」；
 *          絕不勾「以後不再詢問」（那會改你的遊戲設定）。一次最多買 4 個。面板是用「收成」工具點充電樁開的，做完一定關掉，
 *          只能換有充電樁的這座島的畫面；絕不碰「買機器人」「升級」等其他按鈕。
 *      11. 貓、狗餓了（CONFIG.autoBuyPetFood）：貓、狗不能點牠餵食，牠們自己從倉庫扣狗飼料／貓飼料，沒有就餓著。
 *          所以腳本保持庫存：庫存低於「隻數 × petFoodLowPerPet」或有寵物餓著，就開倉庫 → 飼料商店 → 買 10 份
 *          （補到每隻 petFoodTargetPerPet 份，一次最多買 5 次；會花金幣，買完要剩 minCoinsAfterBuyPetFood 以上、倉庫放得下）。
 *          遊戲先跳「確定要買嗎？」，核對標題、價格、金幣才按「確定購買」，絕不勾「以後不再詢問」。
 *      12. 堆肥桶（CONFIG.autoCompost，預設開，可以有很多個、每座島都行）：桶有空位、倉庫的便便（4）與雜草（2）夠一批就投料，
 *          一次投到放滿（Lv5 一桶 5 批）；做好的有機肥由 autoCollectMachines 收。便便和雜草都是免費原料，不花金幣。
 *          堆肥桶只看 autoCompost，和下面的 autoLoadMachines 無關。有機肥在倉庫的庫存到 machineMaxStock 就先不投
 *          （腳本不賣有機肥）。賣出時雜草會保留一部分給堆肥桶（CONFIG.compostKeepRounds，見「倉庫賣出」）；
 *          便便本來就不賣（賣價 0）。
 *      13. 施有機肥（CONFIG.autoFertilize，預設開）：田裡還在長、沒枯萎、這一季還沒施過肥、生長時間 ≥ fertilizeMinMinutes（預設 180 分鐘＝3 小時，
 *          水稻起）的作物，用「照顧」工具的「有機肥」選項點一下（每次種植最多 1 個，產量與生長速度各 +10%，作物仍是有機作物）。
 *          只用倉庫現有的有機肥（來自堆肥桶）：沒有就不施、不會買；肥料不夠分時先給單次收成價值高的。
 *          其他種類的作物也施（fertilizeOtherCrops）。有蟲先抓蟲再施肥。絕不使用化肥、農藥（會花錢、會讓有機作物變一般作物）。
 *      14. 老鼠與髒了的貓狗（CONFIG.autoCatchRats、autoGroomPets，預設開）：這兩樣遊戲都只能「點畫面上的牠」。
 *          老鼠（9 級起，農產倉庫、垃圾站會跑進來；每隻每小時偷吃 1 個作物和 1 個飼料／咬破垃圾袋）：同一處點 3 下抓 1 隻。
 *          貓、狗頭上出現「髒了」：點牠，在跳出的小選單按「梳毛」（貓）／「洗澡」（狗），好感度 +3。免費、不動倉庫。
 *          做法：讀遊戲每個畫面記下的 RT.critHit（目前這座島上可以點的東西），用遊戲的 worldToScreen 換成螢幕座標，呼叫遊戲的 meteorTap
 *          （只判斷點到哪隻動物，點空了不會當成點地圖）。多用兩個除錯入口：window.__farm.worldToScreen、window.__farm222.meteorTap。
 *          全島輪流時，別座島有老鼠、髒了的貓狗也算「有事做」，會切過去。絕不點垃圾站的格子（垃圾車在時那一下會變成「倒垃圾」）。
 *      15. 天敵（CONFIG.autoChasePredators，預設開）：晚上（野狼也會在雨天）黃鼠狼（偷蛋）、狐狸（咬傷家禽）、野狼（嚇到家畜）會走向某隻動物，
 *          出現後只給 60 秒（有「警報」專長的狗在場是 3 分鐘）就動手，玩家要在那之前「點牠 3 下」趕走。柵欄擋不住牠們。
 *          腳本照老鼠的做法點牠 3 下（RT.critHit 裡 kind='pred' 的那一筆，同樣用 worldToScreen＋meteorTap）。比賣出、收成都急，所以排在最前面。
 *          只處理「還沒有狗在趕」的天敵（狗在趕的話牠幾秒內自己會走，腳本不搶功，狗的「趕走天敵」戰績和警犬效果才不會被蓋掉）。
 *          全島輪流時，別座島出現天敵（還剩 8 秒以上）會立刻切過去趕，不等輪到；每隻天敵最多為牠切一次島，仍遵守「玩家剛切島」的保留時間與略過的島。
 *          限制：遊戲畫面要有在更新才點得到（RT.critHit 是畫面每一幀重建的）。這個分頁在背景、被最小化、螢幕鎖住時瀏覽器不畫畫面，
 *          腳本就不去點（也不為天敵切島），所以「人不在、分頁沒顯示」時不能靠它防天敵；要靠遊戲裡的狗（見 README）。
 *       以下三項會用到你的資源，預設關閉，要用請改 CONFIG：
 *          autoWaterTrees（果樹也澆雨水）、autoFeedFish（用倉庫現有的飼料餵魚，不會自動買）、
 *          autoLoadMachines（其他機器自動投料，只投 loadMachineIds 裡的機器，成品庫存有上限；不含堆肥桶）
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
 *   要保留雜草給堆肥桶時，確認視窗裡雜草那一列（.r259[data-id="weed"]）用它的「−」把數量減到「庫存 − 保留量」，
 *   按「確定賣出」前逐列回讀數量（雜草＝庫存 − 保留量、其他列＝全數），對不上就按取消、雜草這次不賣。
 *   不用視窗上方的全域「保留 N」（它會套到所有勾選的列，連設定作物都會留下）。
 *
 * 資安原則：
 *   - 不使用 GM_* 權限（@grant none），不對外發送任何網路請求。
 *   - 只用 textContent 寫入畫面，不使用 innerHTML / eval / new Function。
 *   - 不在 window 上暴露任何物件；只接受使用者真實按鍵（isTrusted）。
 *   - 儲存空間：唯一會碰的是設定視窗存取「自己的一個鍵」skyfarm-auto-settings（2026-11-17 使用者決定存在瀏覽器）；
 *     不讀、不寫遊戲自己的存檔，不枚舉、不清空；讀回來只認設定表（SCHEMA）列出的參數，逐項驗型別與範圍，壞掉就用預設。
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
  const VERSION = '0.21.0';
  const BADGE_ID = 'skyfarm-auto-badge';
  const PANEL_ID = 'skyfarm-auto-panel';
  const SETTINGS_PANEL_ID = 'skyfarm-auto-settings-panel';
  const GEAR_ID = 'skyfarm-auto-gear';

  // ───────────────────────── 設定（想改行為只需要改這裡）─────────────────────────
  const CONFIG = {
    // 組合鍵（code 是實體按鍵，例如 KeyA、KeyD、F8）
    toggleKey: { code: 'KeyA', alt: true, shift: true, ctrl: false },
    cropKey: { code: 'KeyS', alt: true, shift: true, ctrl: false },
    probeKey: { code: 'KeyD', alt: true, shift: true, ctrl: false },
    islandKey: { code: 'KeyF', alt: true, shift: true, ctrl: false }, // 切換「全島輪流／只做畫面上這座」
    configKey: { code: 'KeyG', alt: true, shift: true, ctrl: false }, // 開關「設定視窗」（Alt+Shift+C 會和其他套件衝突）

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
    sellWeedsWithCrops: true, // 賣出設定的作物時，倉庫裡的雜草（1 金幣一個）也一併賣掉；雜草在倉庫裡沒有數量上限
    autoHarvestTrees: true, // 果樹結果了自動採收（倉庫放得下才收）
    autoHarvestFish: true, // 魚池裡長成的魚自動收成（倉庫放得下才收；不會補魚苗）
    autoCollectMachines: true, // 機器做好的成品自動收進倉庫（倉庫放得下才收）
    autoWaterTrees: false, // 果樹也澆水（用雨水，會和作物搶水；預設關閉）
    autoFeedFish: false, // 魚餓了就餵（只用倉庫現有的飼料，不夠就不餵、不自動買；預設關閉）
    autoCompost: true, // 堆肥桶有空位、倉庫的便便與雜草夠一批就自動投料（原料是免費的；和 autoLoadMachines 無關）
    compostKeepRounds: 2, // 賣雜草時，保留「把所有堆肥桶各放滿這麼多輪」要用的雜草（每批 2 株；Lv5 一桶放滿一輪 10 株）；0＝不保留。便便不會被賣
    autoLoadMachines: false, // 其他機器（不含堆肥桶）空了自動投料（會消耗倉庫的材料；預設關閉）
    loadMachineIds: ['fish_feed_machine'], // 開啟 autoLoadMachines 時，只對這些機器投（玉米餅機會把很值錢的玉米變成便宜的飼料，所以不在內；堆肥桶看 autoCompost）
    machineMaxStock: 100, // 投料前，成品在倉庫的庫存已經 ≥ 此值就不再投（避免成品把倉庫塞滿；有機肥也一樣：腳本只拿它施肥（autoFertilize）、不賣，用不完庫存到這個數堆肥桶就先停）
    autoCatchPests: true, // 作物、果樹長蟲時，用「照顧」工具的「捉蟲」（免費）點到抓光；不噴農藥、不用化肥
    catchPestsOnOtherCrops: true, // 其他種類作物與果樹長蟲也抓（蟲會往旁邊擴散；抓蟲免費，不影響收成與庫存）
    autoCatchRats: true, // 農場（倉庫、垃圾站）有老鼠時，點畫面上的老鼠抓掉（免費；同一處點 3 下抓 1 隻）。老鼠每隻每小時偷吃 1 個作物和 1 個飼料／咬破垃圾袋
    autoGroomPets: true, // 貓、狗髒了（下雨後、偶爾自己弄髒，頭上有「髒了」）就點牠、按小選單的「梳毛」（貓）／「洗澡」（狗）：免費、好感度 +3
    autoChasePredators: true, // 黃鼠狼、狐狸、野狼出現（只給 60 秒）時，點牠 3 下趕走（免費）。已經有狗在趕的不搶；遊戲畫面要有在更新（分頁在背景時點不到）
    autoFertilize: true, // 還在長、生長時間 ≥ fertilizeMinMinutes 的作物，用倉庫現有的有機肥施肥（「照顧」工具的有機肥：免費、每次種植 1 個、作物仍是有機）。不用化肥、不買肥料
    fertilizeMinMinutes: 180, // 生長時間至少幾分鐘的作物才施肥。有機肥來自堆肥桶、數量有限（Lv5 一台每小時約 3 個），留給長時間、高單價的作物；預設 3 小時（水稻起）
    fertilizeOtherCrops: true, // 其他種類（不是設定作物）的作物，只要夠長也施肥
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

    autoSwapParts: true, // 機器人的耗材磨完時，到充電樁面板替它換上（伐木／採礦／整地機器人遊戲規定要手動換；有備品才換，免費）
    buyPartsWhenShort: true, // 倉庫沒備品時，花金幣買 1 個再換上（照遊戲商店單價；買完金幣要 ≥ minCoinsAfterBuyParts）
    minCoinsAfterBuyParts: 100, // 買耗材後至少要剩多少金幣（只有開了 buyPartsWhenShort 才用到）
    partsRetryMs: 60000, // 換耗材沒成功（沒備品、金幣不夠、這座島沒有充電樁…）時，隔多久才再試一次

    autoBuyPetFood: true, // 貓、狗吃倉庫裡的狗飼料／貓飼料（遊戲自己扣），沒庫存就餓著；庫存不夠時到倉庫的「飼料商店」分頁買（會花金幣）
    petFoodLowPerPet: 4, // 狗（貓）飼料的庫存低於「狗（貓）的隻數 × 這個數」，或有狗（貓）餓著，就補貨
    petFoodTargetPerPet: 10, // 補貨補到每隻這麼多份（一次買 10 份，一次最多買 5 次）
    minCoinsAfterBuyPetFood: 100, // 買飼料後至少要剩多少金幣
    petFoodRetryMs: 60000, // 補貨沒成功（金幣不夠、倉庫沒空位…）時，隔多久才再試一次

    // 多座島：遊戲裡所有島一直在運作，但點擊只作用在畫面上那座；全島輪流時腳本自己點「農場 N」切島
    islandMode: 'all', // 'all'＝腳本自己切島、輪流處理有事做的島；'current'＝只處理畫面上這座（Alt+Shift+F 切換）
    returnHome: true, // 其他島做完後切回「家島」（按開始時看的那座、或你最後手動切到的那座）
    maxStayMs: 60000, // 一座島連續占用超過這麼久、而別座島也有事做，就讓出去輪下一座
    stuckMs: 15000, // 這座島有事做、但這麼久都沒做成任何事（卡住了），就先去別座
    islandRetryMs: 30000, // 切過去卻沒做成事的島，隔多久才再考慮（連續失敗會加倍，最久 5 分鐘）
    islandHopMinMs: 2000, // 兩次切島之間至少隔多久
    userSwitchHoldMs: 30000, // 你手動切島後，這段時間內腳本不自己切走
    skipIslands: [], // 不自動切過去的島（編號從 1 起算）；你自己看著那座時照常處理
  };

  // 預設值快照（設定視窗的「預設」「恢復預設」用；一定要在任何人改 CONFIG 之前拍）
  const DEFAULTS = JSON.parse(JSON.stringify(CONFIG));

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
  let collapsed = false; // 右下角標籤縮成小方格（只存在記憶體，不寫入任何儲存空間；重新整理頁面就恢復完整資訊）

  let targetCrop = null; // { id, name }：這次要自動種植並賣出的作物；不寫入任何儲存空間
  let panel = null; // 設定作物的輸入面板
  let startAfterSet = false; // 面板是由「開啟自動」叫出來的：確認後直接開始

  const newStats = () => ({
    harvest: 0, plant: 0, water: 0, pest: 0, pick: 0, sellRuns: 0,
    clean: 0, fruit: 0, fish: 0, machine: 0, feed: 0, honey: 0, meat: 0, parts: 0, hops: 0, petFood: 0, fert: 0, rat: 0, groom: 0, chase: 0,
  });
  let stats = newStats();
  const wetting = new Set(); // 正在澆到目標濕度的格子（避免在門檻附近來回澆）
  let lastRenderAt = 0; // 右下角標籤上次重畫的時間（「上次動作」要每秒更新一次）
  let lastActionAt = 0; // 上一次真的做成一件事（收成、播種、賣出…）的時間，顯示在右下角方便看出有沒有停住
  let needSell = false; // 曾被「倉庫滿了」視窗擋住，或金幣不夠買種子，下個週期優先賣出
  let sellBlockedUntil = 0; // 賣不出東西時的暫停時間
  let weedSellOffUntil = 0; // 賣出確認視窗裡沒辦法把雜草數量調到「留下保留量」時，這段時間內賣出就不帶雜草（設定作物照賣）
  const cooldown = new Map(); // 格子座標 → { kind, until, fails }，避免對同一格狂點
  const partsBlocked = new Map(); // 充電樁種類 → 換耗材沒成功時，暫停到什麼時候再試
  const partsWhy = new Map(); // 充電樁種類 → 還沒換成的原因（寫在右下角標籤上）
  let partsHint = '';
  let petFoodBlockedUntil = 0; // 補寵物飼料沒成功時，暫停到什麼時候再試
  let petFoodHint = ''; // 寫在狀態列的原因
  let critterHint = ''; // 抓老鼠、替寵物梳毛沒成功時，寫在狀態列的原因
  // 多座島（編號都從 0 起算）
  let islandSave = null; // 目前看到的存檔物件；換存檔就重設所有島嶼狀態
  let islandCount = 0;
  let homeIsland = null; // 家島
  let expectedCur = null; // 腳本認為目前顯示的島；和遊戲不一樣就是玩家手動切了
  let holdUntil = 0; // 玩家手動切島後，到這個時間之前不自己切走
  let stayStart = 0; // 這次在這座島開始的時間
  let progressAt = 0; // 最近一次做成事的時間（判斷卡住）
  let seenAction = 0;
  let arrivalAction = 0; // 到達這座島時的 lastActionAt（離開時看有沒有做成事）
  let lastHopAt = 0;
  let lastTrackAt = 0; // 上一次整理島嶼狀態（沒被暫停閘門擋掉的週期）的時間
  let stuckMarked = false; // 這次卡住是否已經記過一次失敗
  const islandState = new Map(); // 島編號 → { fails, until }：切過去沒做成事的島，暫停到什麼時候
  let islandHint = ''; // 寫在狀態列的島嶼說明
  let islandLine = ''; // 完整標籤的島嶼那一行
  let islandShort = ''; // 小方格的第三行
  let gearBtn = null; // 標籤旁邊的「⚙」按鈕（用滑鼠開設定視窗，不靠快速鍵）
  let hotkeyCapture = null; // 正在錄快速鍵時：{ key, timer }

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

  // 遊戲的「擴地模式」（按了「擴地」、還沒結束）：左上狀態列會有「擴地模式：點虛線區塊購買」。
  // 這時點地圖一律被遊戲當成擴地點擊，點已經有的格子只會跳提示、什麼都不會做，所以腳本要暫停。
  const isExpandMode = () => {
    const el = $('status');
    return !!el && String(el.textContent || '').includes('擴地模式');
  };

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

  // 這格作物要不要施有機肥。條件和遊戲的「照顧／有機肥」一致（田裡的作物、還沒成熟、沒枯萎、這一季還沒施過肥；
  // 否則點下去只會跳提示）。有機肥來自堆肥桶、數量有限，所以只給生長時間夠長的作物（fertilizeMinMinutes）；
  // 不是設定作物的其他作物看 fertilizeOtherCrops。只用有機肥：不花金幣、作物不會變成一般作物。
  function fertWanted(T, CFG) {
    if (!CONFIG.autoFertilize || !T || T.t !== 'soil' || !T.crop) return false;
    const H = T.crop;
    const C = CFG.crops[H.id];
    if (!C || H.wither || H.fert || !(H.prog < C.growSeconds)) return false;
    if (!(C.growSeconds >= CONFIG.fertilizeMinMinutes * 60)) return false;
    return !!CONFIG.fertilizeOtherCrops || (!!targetCrop && H.id === targetCrop.id);
  }
  // 一次收成的價值（售價 × 產量）：有機肥的增產（+10%）和它成正比，肥料不夠分時先給值錢的作物
  const fertValue = (H, CFG) => {
    const C = (CFG.crops && CFG.crops[H.id]) || {};
    return (C.sellPrice || 0) * (C.yield || 1);
  };

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
  // 機器一次最多放幾批：和遊戲一樣，Lv1 一批、每升一級多 batchesPerLevel 批；沒有升級功能的機器一批
  function machineCap(T, CFG) {
    const MU = CFG.machineUpgrade || {};
    if (!(MU.appliesTo || []).includes(T.id)) return 1;
    const lvl = Math.max(1, Math.min(MU.maxLevel || 5, T.lvl || 1));
    return 1 + (lvl - 1) * (MU.batchesPerLevel || 1);
  }

  // 這種機器要不要自動投料：堆肥桶只看 autoCompost；其他機器看 autoLoadMachines 加上白名單
  const loadWanted = (id) =>
    id === 'compost_bin' ? !!CONFIG.autoCompost : !!CONFIG.autoLoadMachines && CONFIG.loadMachineIds.includes(id);

  // 賣雜草時要留給堆肥桶的數量：每座島所有堆肥桶各放滿 compostKeepRounds 輪需要的雜草（沒有堆肥桶、沒開堆肥、設 0 都是不保留）
  function weedReserve(g) {
    if (!CONFIG.autoCompost || !(CONFIG.compostKeepRounds > 0)) return 0;
    const D = g.CFG.machines && g.CFG.machines.compost_bin;
    const per = D && D.input ? Number(D.input.weed) : 0;
    if (!(per > 0) || !Array.isArray(g.S.maps)) return 0;
    let batches = 0;
    for (const M of g.S.maps) {
      for (const k in M.tiles) {
        const T = M.tiles[k];
        if (T && T.t === 'machine' && T.id === 'compost_bin') batches += machineCap(T, g.CFG);
      }
    }
    return Math.ceil(batches * per * CONFIG.compostKeepRounds);
  }

  function machineState(T, g) {
    const { S, CFG } = g;
    const D = CFG.machines && CFG.machines[T.id];
    if (!D) return null;
    const MU = CFG.machineUpgrade || {};
    const up = (MU.appliesTo || []).includes(T.id);
    const out = T.out > 0 ? T.out : T.state === 'done' ? 1 : 0;
    const outQty = out * Object.values(D.output).reduce((a, b) => a + b, 0);
    const cap = machineCap(T, CFG);
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
  // 雜草（物品代號 weed）：賣設定作物時一併賣掉。只認這一個代號，其他東西（蛋、奶、糞便…）一律不賣
  const isSellWeed = (id) => CONFIG.sellWeedsWithCrops && id === 'weed';

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

  // 賣出確認視窗（#ask47 .bs259）裡，把雜草那一列的數量調成 want，並逐列回讀驗證：
  // 雜草列＝want、其他每一列＝倉庫庫存（全數），而且每一列都是勾選的、都是我們勾的物品。任何一處對不上就回報失敗（呼叫端會取消）。
  // 只用那一列自己的「−」按鈕，不碰視窗上方的全域「保留 N」（它會套到所有勾選的列，連設定作物都會留下）。
  function adjustWeedQty(g, want) {
    const rows = [...document.querySelectorAll('#ask47 .bs259 .r259')];
    const weedRow = rows.find((r) => r.dataset && r.dataset.id === 'weed');
    const minus = weedRow && weedRow.querySelector('button[data-d="-1"]');
    const qty = weedRow && weedRow.querySelector('input[type=number]');
    if (!weedRow || !minus || !qty) return { ok: false, why: '賣出確認視窗裡找不到雜草的數量欄' };
    let guard = 0;
    while (Number(qty.value) > want && guard < 5000) {
      minus.click();
      guard += 1;
    }
    for (const r of rows) {
      const id = r.dataset && r.dataset.id;
      const input = r.querySelector('input[type=number]');
      const box = r.querySelector('input.rc259');
      const expect = id === 'weed' ? want : (g.S.inv && g.S.inv[id]) || 0;
      if (id !== 'weed' && !isSellTarget(id)) return { ok: false, why: '賣出確認視窗裡有預期以外的物品：' + id };
      if (!input || Number(input.value) !== expect || !box || !box.checked) {
        return { ok: false, why: '賣出確認視窗的數量和預期不一致（' + id + '）' };
      }
    }
    return { ok: true };
  }

  // 倉庫：開啟 → 勾選要賣的物品 → 「賣出所選」→「確定賣出」→ 關閉。
  // 這是遊戲目前的批次賣出介面（每列有勾選框，下方出現結帳列，確認視窗預設全數賣出）。
  // 雜草只賣超過「堆肥保留量」（weedReserve）的部分：庫存沒超過就不勾；超過就在確認視窗裡把雜草數量調成「庫存 − 保留量」。
  // 無論中途如何結束，只要是我們開的視窗就一定關掉。
  async function sellFlow(g) {
    let opened = false;
    let result = '';
    const before = storageInfo(g).used;
    const weedStock = (g.S.inv && g.S.inv.weed) || 0;
    const weedKeep = weedReserve(g);
    const sellWeeds = Date.now() >= weedSellOffUntil && weedStock > weedKeep;
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
        if (!isSellTarget(tr.dataset.bs259) && !(sellWeeds && isSellWeed(tr.dataset.bs259))) continue;
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
      // 要留雜草給堆肥桶：先把雜草數量調成「庫存 − 保留量」並回讀驗證；失敗就不賣（finally 會按取消），之後一段時間賣出不帶雜草
      if (weedKeep > 0 && sellWeeds && isSellWeed('weed')) {
        const adj = adjustWeedQty(g, weedStock - weedKeep);
        if (!adj.ok) {
          result = adj.why + '，這次不賣；之後 10 分鐘賣出不帶雜草';
          weedSellOffUntil = Date.now() + 600000;
          return;
        }
      }
      ok.click(); // 確認視窗預設是每項全數賣出（雜草的保留量上面已經調好）
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

  // ───────────────────────── 機器人耗材 ─────────────────────────
  //
  // 機器人的耗材（鋸鏈、鑽頭、鏟刃、輪子、螺旋槳、滾筒、清潔刷）磨完就停工，頭上顯示「換耗材」：
  //   - 伐木／採礦／整地機器人（重型充電樁）：遊戲規定要在充電樁面板按「換耗材」才換，倉庫有備品也不自動換、不自動買
  //     （面板按鈕：倉庫有備品寫「換耗材」；沒備品寫「買 1 個並換上（價格）」，會花金幣）；
  //   - 其他機器人：倉庫有備品遊戲會自己換；沒備品就停工，要在面板「耗材」卡片按「買 1」，買了遊戲會自動換上。
  // 這裡替玩家按那些按鈕：有備品就直接換（免費）；沒備品且 CONFIG.buyPartsWhenShort 開著、買完金幣還有
  // CONFIG.minCoinsAfterBuyParts 以上，才買 1 個（只買 1 個，不買折扣組）。面板是用「收成」工具點充電樁開的，
  // 做完一定關掉；絕不碰「買機器人」「升級」等其他按鈕。
  const partsOf = (CFG) => (CFG && CFG.consumables && CFG.consumables.parts) || {};
  const partItemId = (id) => 'part_' + id;

  // 第 mi 座島上有沒有那種充電樁（建築 T.t === 'building' 且 T.id 是基座種類）
  function baseOnIsland(g, mi, base) {
    const M = g.S.maps[mi];
    for (const k in (M && M.tiles) || {}) {
      const T = M.tiles[k];
      if (T && T.t === 'building' && T.id === base) return true;
    }
    return false;
  }

  // 現在有哪些機器人在等耗材：{ kind, base（它的充電樁種類）, part, unit, manual（遊戲要求手動換） }
  function partNeeds(g) {
    const { S, CFG } = g;
    const parts = partsOf(CFG);
    const kinds = (CFG.robots && CFG.robots.kinds) || {};
    const out = [];
    for (const kind of Object.keys(S.fleet || {})) {
      const K = kinds[kind];
      if (!K || !K.base || !Array.isArray(S.fleet[kind])) continue;
      for (const u of S.fleet[kind]) {
        if (!u || !(u.tier >= 0) || !u.needPart || u.on === false) continue;
        const P = parts[u.needPart];
        if (!P) continue;
        out.push({ kind, base: K.base, part: u.needPart, unit: u, manual: !!P.manualSwap });
      }
    }
    return out;
  }

  // 重型機器人面板上「換耗材」按鈕的順序＝遊戲的需求清單順序（按鈕的 data-sw84 是它在清單裡的位置）。
  // 這裡照同樣的規則排一次，才知道每顆按鈕是哪一台、哪種耗材（對不上就不點）。
  function swapOrder(g, base) {
    const { S, CFG } = g;
    const heavy = Object.keys((CFG.terrain243 && CFG.terrain243.robots && CFG.terrain243.robots.kinds) || {});
    const kinds = (CFG.robots && CFG.robots.kinds) || {};
    return heavy
      .filter((k) => kinds[k] && kinds[k].base === base)
      .flatMap((k) =>
        (Array.isArray(S.fleet && S.fleet[k]) ? S.fleet[k] : [])
          .filter((u) => u && u.tier >= 0 && u.needPart)
          .map((u) => ({ kind: k, unit: u, part: u.needPart }))
      );
  }

  // 下一個要按的按鈕：{ el } 或（沒有可按的）{ why }
  function nextPartStep(g, base) {
    const { S, CFG } = g;
    const parts = partsOf(CFG);
    const coins = S.player.coins;
    let why = '';
    const afford = (id) => {
      const need = parts[id].price + CONFIG.minCoinsAfterBuyParts;
      if (CONFIG.buyPartsWhenShort && coins >= need) return true;
      why = '缺' + parts[id].name + '（倉庫 0 個' + (CONFIG.buyPartsWhenShort ? '，金幣要 ' + need + ' 以上才買' : '，不自動買') + '）';
      return false;
    };
    // 重型機器人：面板上的「換耗材」按鈕
    const btns = Array.from(document.querySelectorAll('#modalBody .sw84 button[data-sw84]'));
    const order = swapOrder(g, base);
    if (btns.length && order.length === btns.length) {
      for (const b of btns) {
        const e = order[Number(b.dataset.sw84)];
        if (!e || e.unit.on === false || !parts[e.part]) continue;
        const label = String(b.textContent || '').trim();
        const have = S.inv[partItemId(e.part)] || 0;
        if (label === '換耗材' && have > 0) return { el: b };
        if (label.startsWith('買 1 個並換上') && have === 0) {
          // 會花錢的按鈕：標示的價格要和遊戲設定的單價一致、買完還有足夠金幣，才按
          const m = /（([\d,]+)）/.exec(label);
          if (!m || Number(m[1].replace(/,/g, '')) !== parts[e.part].price) {
            why = parts[e.part].name + '的價格和預期不同，不自動買';
            continue;
          }
          if (afford(e.part)) return { el: b, buy: { part: e.part, price: parts[e.part].price, label } };
        }
      }
    } else if (btns.length) {
      why = '耗材面板的按鈕和機器人對不上，不自動換';
    }
    // 其他機器人：倉庫有備品遊戲自己會換；沒有備品才在「耗材」卡片買 1 個
    for (const n of partNeeds(g)) {
      if (n.base !== base || n.manual || (S.inv[partItemId(n.part)] || 0) > 0) continue;
      if (!afford(n.part)) continue;
      const b = document.querySelector('#modalBody .partcard button[data-part="' + n.part + '"][data-q="1"]');
      if (b) return { el: b, buy: { part: n.part, price: parts[n.part].price, label: '' } };
      why = '面板上找不到「買 1」按鈕：' + parts[n.part].name;
    }
    return { why };
  }

  // 遊戲在任何會花金幣的按鈕按下去之後，會先跳「確定要買嗎？」確認視窗（#ask47），按了「確定購買」才真的買；
  // 玩家若勾過「以後不再詢問」就不會跳。這裡只在核對過「買的東西、數量、價格」都和預期一樣、金幣也夠時才按「確定購買」，
  // 對不上就按「取消」；絕不碰「以後不再詢問」的勾選框（那會改玩家的遊戲設定）。
  // 回傳 { ok, why }；沒有跳視窗（玩家設了不再詢問）時 ok = true，由呼叫端看結果有沒有變。
  // expect = { titles: 視窗標題可以是哪幾種, price: 價格, floor: 買完金幣至少要剩多少 }
  async function confirmPurchase(g, expect) {
    const ask = await waitFor(() => document.getElementById('ask47'), 800);
    if (!ask) return { ok: true };
    const yes = document.querySelector('#ask47 #ask47y');
    const no = document.querySelector('#ask47 #ask47c');
    const clean = (t) => String(t || '').trim().replace(/\s+/g, ' ');
    const title = clean((document.querySelector('#ask47 h3') || {}).textContent);
    const m = /價格\s*([\d,]+)/.exec(clean((document.querySelector('#ask47 .tot47') || {}).textContent));
    const price = m ? Number(m[1].replace(/,/g, '')) : NaN;
    const noAsk = document.querySelector('#ask47 #ask47no');
    let why = '';
    if (document.querySelector('#ask47 .bs259')) why = '跳出的是賣出確認視窗，不按';
    else if (!yes || yes.disabled || !no) why = '購買確認視窗的按鈕不對（金幣不夠？）';
    else if (!expect.titles.filter(Boolean).includes(title)) why = '購買確認視窗買的東西和預期不同（' + title + '），不按';
    else if (price !== expect.price) why = '購買確認視窗的價格和預期不同（' + (m ? m[1] : '看不出') + '），不按';
    else if (g.S.player.coins - price < expect.floor) why = '買完金幣會低於 ' + expect.floor + '，不按';
    else if (noAsk && noAsk.checked) why = '「以後不再詢問」被勾起來了，不按';
    if (why) {
      if (no) no.click();
      return { ok: false, why };
    }
    yes.click();
    await sleep(300); // 遊戲關掉視窗後才真的買（並重畫面板）
    return { ok: true };
  }

  // 買耗材：確認視窗的標題是「名稱 ×1」（耗材卡片），或按鈕文字（重型機器人面板的「買 1 個並換上（價格）」）
  function confirmPartPurchase(g, buy) {
    const name = (partsOf(g.CFG)[buy.part] || {}).name || '';
    const label = String(buy.label || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return confirmPurchase(g, { titles: [name + ' ×1', label], price: buy.price, floor: CONFIG.minCoinsAfterBuyParts });
  }

  // ───────────────────────── 老鼠、髒了的寵物（點畫面上的牠）─────────────────────────
  //
  // 遊戲裡的老鼠（農產倉庫、垃圾站各自會跑進老鼠：每隻每小時偷吃倉庫 1 個作物和 1 個飼料／咬破垃圾袋）和寵物（貓、狗）都畫在 canvas 上、
  // 一直在動，玩家是「點畫面上看得到的牠」：點老鼠，同一處點 3 下抓 1 隻；點寵物，跳出小選單，髒了（下雨後、偶爾自己弄髒）就有
  // 「梳毛」（貓）／「洗澡」（狗）可以按，按了好感度 +3（髒的泡泡也會消失）。
  // 倉庫視窗裡本來也有一張「抓老鼠」卡片，但 2.68.1 實測它一畫出來就被後面的程式清掉（按不到），所以不能靠它。
  //
  // 做法：遊戲每個畫面把目前這座島上可以點的東西記在 RT.critHit（世界座標 { x, y, r, kind, … }），玩家點擊時由 meteorTap(螢幕座標) 判斷點到誰。
  // 腳本讀 RT.critHit → 用遊戲的 worldToScreen 換成螢幕座標 → 呼叫遊戲的 meteorTap。meteorTap 只做「點到動物」的判斷，
  // 點空了不會當成點地圖（不像真的滑鼠點擊會接著點格子），所以不會動到田、機器、建築。
  // 這裡多用到遊戲的兩個除錯入口：window.__farm.worldToScreen、window.__farm222.meteorTap（原本只用 __farm18、__farm218）；
  // 找不到就什麼都不做。只對目前顯示的那座島有效（RT.critHit 只有這座島）；全島輪流時，別座島有老鼠、髒寵物也算「有事做」，會切過去。
  //
  // 垃圾站只當成「有老鼠的地方」讓牠們被點到；腳本絕不點垃圾站的格子（用收成工具點垃圾站，垃圾車在時會變成「倒垃圾」，會動到金幣）。
  const CRITTER_RETRY_MS = 15000;
  const critterCd = new Map(); // 工作代號（rat:地點／groom:寵物 id）→ { until, fails }：失敗後退避
  const critterApi = () => {
    const a = window.__farm;
    const b = window.__farm222;
    if (!a || typeof a.worldToScreen !== 'function' || !b || typeof b.meteorTap !== 'function') return null;
    return { toScreen: (x, y) => a.worldToScreen(x, y), tap: (x, y) => b.meteorTap(x, y) };
  };
  const critterFree = (id) => !((critterCd.get(id) || {}).until > Date.now());

  // 第 mi 座島上有老鼠的地方（只看狀態，不看畫面）。key 和遊戲的 ratSpots 相同：'barn'＝農產倉庫（S.rats.barn 隻，整個農場只有一座倉庫），
  // 'mi:格子'＝那座垃圾站（站自己的 T.rats）
  function ratSpotsOn(g, mi) {
    const M = g.S.maps[mi];
    const out = [];
    if (!M || !M.tiles) return out;
    let barn = false;
    for (const k in M.tiles) {
      const T = M.tiles[k];
      if (!T || T.t !== 'building') continue;
      if (T.id === 'barn') barn = true;
      else if (T.id === 'trash_station' && Number.isFinite(T.rats) && T.rats > 0) out.push({ key: mi + ':' + k, n: Math.floor(T.rats) });
    }
    const nb = g.S.rats && g.S.rats.barn;
    if (barn && Number.isFinite(nb) && nb > 0) out.unshift({ key: 'barn', n: Math.floor(nb) });
    return out;
  }
  function ratCountOf(g, mi, key) {
    if (key === 'barn') return (g.S.rats && Number(g.S.rats.barn)) || 0;
    const k = String(key).slice(String(mi).length + 1);
    const T = g.S.maps[mi] && g.S.maps[mi].tiles[k];
    return (T && Number(T.rats)) || 0;
  }

  // 第 mi 座島上髒了的貓、狗（只看狀態）：牠的窩（den）在那座島。睡著的（晚上）點了沒反應，不算
  function dirtyPetsOn(g, mi) {
    const M = g.S.maps[mi];
    const pets = Array.isArray(g.S.pets) ? g.S.pets : [];
    const out = [];
    if (!M || !M.tiles) return out;
    for (const P of pets) {
      if (!P || (P.kind !== 'cat' && P.kind !== 'dog') || P.den == null) continue;
      if (!(P.aff2672 && P.aff2672.dirty === true)) continue;
      const ag = g.RT && g.RT.petAg && g.RT.petAg[P.id];
      if (ag && ag.sleep) continue;
      if (Object.values(M.tiles).some((T) => T && T.uid === P.den)) out.push(P);
    }
    return out;
  }

  // ── 天敵（黃鼠狼、狐狸、野狼）──
  // 遊戲的天敵在 S.preds（{ id, kind, mi, k（牠要打的那隻動物的格子）, until（動手的時間，毫秒）, taps, fleeAt, by, done }），
  // 出現後走向那隻動物，until 到了還沒被趕走就得手。點牠 3 下（chaseTaps）→ 遊戲設 fleeAt、by='player'。
  // 柵欄擋不住牠們，所以不用管圍欄。已經有狗在趕的（Pd.fleeAt／Pd.by 已設）不點：點了會把「by」蓋成玩家，狗的戰績和警犬效果就沒了。
  const PRED_NAMES = { weasel: '黃鼠狼', fox: '狐狸', wolf: '野狼' };
  const PRED_RETRY_MS = 1500; // 天敵只給 60 秒：失敗後很快再試（老鼠那種 15 秒起跳的退避會錯過）
  const PRED_RETRY_MAX_MS = 15000;
  const PRED_HOP_MIN_LEFT_MS = 8000; // 別座島的天敵剩下不到這麼久，切過去也來不及（切島＋等畫面更新＋點 3 下），不去
  const predHopped = new Set(); // 已經為了牠切過島的天敵 id：每隻最多切一次（切過去點不到也不再為牠來回跳）
  // 畫面沒在更新（分頁在背景、最小化、螢幕鎖住）：RT.critHit 是上一幀留下的舊資料，點了可能點歪、新出現的天敵根本不在裡面
  const tabHidden = () => document.hidden === true;

  // 第 mi 座島上「現在可以去點」的天敵（只看狀態）：還沒被趕走／得手、沒有狗在趕、還有 minLeftMs 以上、牠要打的動物還在
  function predsOn(g, mi, minLeftMs) {
    const list = Array.isArray(g.S.preds) ? g.S.preds : [];
    const M = g.S.maps[mi];
    const now = Date.now();
    const out = [];
    if (!M || !M.tiles) return out;
    for (const Pd of list) {
      if (!Pd || typeof Pd !== 'object' || Pd.id == null || !PRED_NAMES[Pd.kind]) continue;
      if (Pd.done || Pd.fleeAt || Pd.by || Pd.mi !== mi) continue;
      if (!Number.isFinite(Pd.until) || !(Pd.until - now > (minLeftMs || 0))) continue;
      const T = M.tiles[Pd.k];
      if (!T || T.t !== 'animal') continue;
      out.push(Pd);
    }
    return out.sort((a, b) => a.until - b.until); // 最快動手的先
  }
  const predFree = (Pd) => critterFree('pred:' + Pd.id);

  // 別座島有天敵、要立刻切過去趕的（最快動手的那隻）：{ mi, Pd } 或 null
  function urgentPred(g) {
    if (!CONFIG.autoChasePredators || tabHidden()) return null;
    let best = null;
    for (let mi = 0; mi < g.S.maps.length; mi++) {
      if (mi === g.S.cur || CONFIG.skipIslands.includes(mi + 1) || !islandReady(mi)) continue;
      for (const Pd of predsOn(g, mi, PRED_HOP_MIN_LEFT_MS)) {
        if (predHopped.has(Pd.id) || !predFree(Pd)) continue;
        if (!best || Pd.until < best.Pd.until) best = { mi, Pd };
      }
    }
    return best;
  }

  // 已經不在 S.preds 裡的天敵（被趕走、得手、過期）：清掉牠的退避記錄和「切過島」記錄
  function prunePreds(g) {
    const live = new Set((Array.isArray(g.S.preds) ? g.S.preds : []).map((p) => p && p.id));
    for (const id of [...predHopped]) if (!live.has(id)) predHopped.delete(id);
    for (const key of [...critterCd.keys()]) if (key.startsWith('pred:') && !live.has(key.slice(5))) critterCd.delete(key);
  }

  // 點天敵 chaseTaps（3）下。不像老鼠有 3 秒的連點限制（Pd.taps 記在天敵身上），所以一次讀位置、連點完；天敵一秒才走幾個像素。
  // meteorTap 對任何「點到的東西」都回 true，所以每一下都看 Pd.taps 有沒有真的增加（先點到彩虹只領金幣、不算趕天敵）
  async function tapPred(g, api, job) {
    const Pd = job.pred;
    const name = PRED_NAMES[Pd.kind];
    const cfg = g.CFG && g.CFG.predators;
    const need = Math.min(10, Math.max(1, Math.floor(Number(cfg && cfg.chaseTaps)) || 3));
    try {
      const h = ((g.RT && g.RT.critHit) || []).find((x) => x.kind === 'pred' && x.Pd === Pd);
      if (!h) return { ok: false, why: '畫面上找不到' + name };
      const p = hitScreen(api, h);
      if (!p) return { ok: false, why: '算不出' + name + '在畫面上的位置' };
      let misses = 0;
      for (let i = 0; i < need + 3 && !Pd.fleeAt && !Pd.done && misses < 2; i++) {
        const before = Number(Pd.taps) || 0;
        api.tap(p.x, p.y);
        if ((Number(Pd.taps) || 0) > before || Pd.fleeAt) misses = 0;
        else misses += 1;
      }
    } finally {
      closeCritterPopup(g); // 萬一點到的是旁邊的寵物，遊戲會跳寵物小選單：收乾淨
    }
    if (!(Pd.fleeAt && Pd.by === 'player')) return { ok: false, why: '點了' + name + '但沒趕走' };
    stats.chase += 1;
    lastActionAt = Date.now();
    log('趕走了' + name);
    return { ok: true };
  }

  // 這座島「畫面上看得到」的工作（有狀態，而且 RT.critHit 裡真的有牠）。天敵最急，排最前面
  function critterJobs(g) {
    const hits = Array.isArray(g.RT && g.RT.critHit) ? g.RT.critHit : [];
    const jobs = [];
    prunePreds(g);
    if (CONFIG.autoChasePredators && !tabHidden()) {
      for (const Pd of predsOn(g, g.S.cur, 0)) {
        if (predFree(Pd) && hits.some((h) => h.kind === 'pred' && h.Pd === Pd)) jobs.push({ id: 'pred:' + Pd.id, type: 'pred', pred: Pd });
      }
    }
    if (CONFIG.autoCatchRats) {
      for (const sp of ratSpotsOn(g, g.S.cur)) {
        if (critterFree('rat:' + sp.key) && hits.some((h) => h.kind === 'rat' && h.key === sp.key)) jobs.push({ id: 'rat:' + sp.key, type: 'rat', key: sp.key });
      }
    }
    if (CONFIG.autoGroomPets) {
      for (const P of dirtyPetsOn(g, g.S.cur)) {
        if (critterFree('groom:' + P.id) && hits.some((h) => h.kind === 'pet' && h.P === P)) jobs.push({ id: 'groom:' + P.id, type: 'groom', pet: P });
      }
    }
    return jobs;
  }

  // 別座島有沒有這類事做（那座島沒畫出來，只看狀態）：全島輪流時用來決定要不要切過去
  function critterWork(g, mi) {
    if (CONFIG.autoChasePredators && !tabHidden() && predsOn(g, mi, PRED_HOP_MIN_LEFT_MS).some(predFree)) return true;
    if (CONFIG.autoCatchRats && ratSpotsOn(g, mi).some((sp) => critterFree('rat:' + sp.key))) return true;
    if (CONFIG.autoGroomPets && dirtyPetsOn(g, mi).some((P) => critterFree('groom:' + P.id))) return true;
    return false;
  }

  // 收掉我們點寵物叫出來的小選單（遊戲按鈕按下去會自己收；沒按成時要收乾淨，否則每個週期都以為是玩家開的而暫停）
  function closeCritterPopup(g) {
    const pop = $('pick53');
    if (pop && !pop.hidden) {
      pop.hidden = true;
      pop.textContent = '';
    }
    if (g.RT) g.RT.pick53 = null;
  }

  const hitScreen = (api, h) => {
    const p = api.toScreen(h.x, h.y);
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  };

  // 點老鼠：同一處的老鼠 3 下抓 1 隻。老鼠一直在跑，所以每一下都重新讀它現在的位置（中間等一下讓畫面更新）
  async function tapRats(g, api, job) {
    const mi = g.S.cur;
    const before = ratCountOf(g, mi, job.key);
    for (let i = 0; i < 3; i++) {
      const h = ((g.RT && g.RT.critHit) || []).find((x) => x.kind === 'rat' && x.key === job.key);
      if (!h) break;
      const p = hitScreen(api, h);
      if (!p) return { ok: false, why: '算不出老鼠在畫面上的位置' };
      api.tap(p.x, p.y);
      if (ratCountOf(g, mi, job.key) < before) break;
      await sleep(90);
    }
    const caught = before - ratCountOf(g, mi, job.key);
    if (caught > 0) {
      stats.rat += caught;
      lastActionAt = Date.now();
      log('抓了 ' + caught + ' 隻老鼠');
      return { ok: true };
    }
    return { ok: false, why: '點了老鼠但沒抓到' };
  }

  // 點寵物 → 小選單（#pick53）裡的「梳毛」（貓）／「洗澡」（狗）：button[data-af2672="bath"]（髒了才有）
  async function groomPet(g, api, job) {
    const P = job.pet;
    const word = P.kind === 'cat' ? '梳毛' : '洗澡';
    const h = ((g.RT && g.RT.critHit) || []).find((x) => x.kind === 'pet' && x.P === P);
    if (!h) return { ok: false, why: '畫面上找不到' + P.name };
    const p = hitScreen(api, h);
    if (!p) return { ok: false, why: '算不出' + P.name + '在畫面上的位置' };
    try {
      if (!api.tap(p.x, p.y)) return { ok: false, why: '點了' + P.name + '但沒有反應（睡著了？）' };
      const btn = await waitFor(() => {
        const pop = $('pick53');
        return pop && !pop.hidden ? pop.querySelector('button[data-af2672="bath"]') : null;
      }, 800);
      if (!btn) return { ok: false, why: P.name + '的小選單裡沒有「' + word + '」按鈕' };
      btn.click();
      await sleep(100);
    } finally {
      closeCritterPopup(g);
    }
    if (P.aff2672 && P.aff2672.dirty === true) return { ok: false, why: '按了「' + word + '」但' + P.name + '還是髒的' };
    stats.groom += 1;
    lastActionAt = Date.now();
    log('替' + P.name + word);
    return { ok: true };
  }

  async function critterFlow(g, job) {
    let r = { ok: false, why: '' };
    try {
      const api = critterApi();
      const work = job.type === 'pred' ? tapPred : job.type === 'rat' ? tapRats : groomPet;
      r = api ? await work(g, api, job) : { ok: false, why: '找不到遊戲的點擊介面（__farm222）' };
    } finally {
      if (r.ok) {
        critterCd.delete(job.id);
        critterHint = '';
      } else {
        const c = critterCd.get(job.id) || { fails: 0, until: 0 };
        c.fails += 1;
        // 天敵只給 60 秒：很快再試、上限也低；老鼠、梳毛不趕時間，退避得久一點
        c.until = Date.now() + (job.type === 'pred'
          ? Math.min(PRED_RETRY_MAX_MS, PRED_RETRY_MS * Math.pow(2, c.fails - 1))
          : Math.min(300000, CRITTER_RETRY_MS * Math.pow(2, c.fails - 1)));
        critterCd.set(job.id, c);
        critterHint = r.why || '沒成功';
      }
    }
  }

  // 這個週期有沒有「點動物」的事要做：有就做並回傳 true（這個週期用掉了）。predOnly＝只看天敵（比賣出、收成都急，tick 一開始先問一次）
  async function critterStep(g, predOnly) {
    const cj = critterJobs(g).find((j) => !predOnly || j.type === 'pred');
    if (!cj) return false;
    // 玩家的工具不是我們用的四種（例如「移除」「搬移」「建造」）時，遊戲可能不把點擊當成點動物：先切到「收成」工具
    if (!SCRIPT_TOOLS.includes(g.S.sel.tool) && !ensureToolIs(g, 'hand')) {
      setStatus('切換工具中（點動物）…');
      return true;
    }
    setStatus(cj.type === 'pred' ? '趕' + PRED_NAMES[cj.pred.kind] + '中…' : cj.type === 'rat' ? '抓老鼠中…' : '替' + cj.pet.name + (cj.pet.kind === 'cat' ? '梳毛' : '洗澡') + '中…');
    await critterFlow(g, cj);
    return true;
  }

  // ───────────────────────── 寵物飼料（貓、狗）─────────────────────────
  //
  // 貓、狗沒有「點牠餵食」這回事：時間到了（狗每 6 小時、貓每 8 小時，貪吃的貓 6 小時，幼犬幼貓加倍快），
  // 遊戲自己從倉庫扣 1 份狗飼料／貓飼料；倉庫沒有就餓著（幼犬幼貓不長大、成犬成貓不工作）。
  // 狗飼料、貓飼料只能在倉庫的「飼料商店」分頁買，所以要自動「餵」就是保持庫存：庫存不夠（或有寵物餓著）時，
  // 開倉庫 → 飼料商店 → 買 10 份（遊戲會先跳「確定要買嗎？」，核對標題、價格、金幣才按「確定購買」）→ 關掉。
  // 遊戲下一步就會自己把飼料餵給餓著的寵物。
  const PET_FOOD = [
    ['dog', 'dog_food'],
    ['cat', 'cat_food'],
  ];

  // 哪些飼料要補貨：{ kind, item, name, pets, hungry, stock, target, lots, price（一次買 10 份的價格）}
  function petFoodJobs(g) {
    const { S, CFG } = g;
    const pets = Array.isArray(S.pets) ? S.pets : [];
    const shop = CFG.feedShop || {};
    const out = [];
    for (const [kind, item] of PET_FOOD) {
      if (!(shop[item] > 0)) continue;
      const mine = pets.filter((P) => P && P.kind === kind);
      if (!mine.length) continue;
      const hungry = mine.filter((P) => P.hungry).length;
      const stock = (S.inv && S.inv[item]) || 0;
      const low = mine.length * CONFIG.petFoodLowPerPet;
      if (stock >= low && !(hungry > 0 && stock === 0)) continue;
      const target = mine.length * CONFIG.petFoodTargetPerPet;
      const lots = Math.min(5, Math.max(1, Math.ceil((target - stock) / 10)));
      out.push({ kind, item, name: (CFG.items[item] || {}).name || item, pets: mine.length, hungry, stock, target, lots, price: shop[item] * 10 });
    }
    return out;
  }

  // 開倉庫 → 飼料商店 → 買 10 份（可能多次）→ 關掉。無論如何結束，只要是我們開的視窗就一定關掉。
  async function petFoodFlow(g, jobs) {
    const { S } = g;
    let opened = false;
    let clicked = false;
    let why = '';
    let bought = 0;
    try {
      const btn = $('storageBtn');
      if (!btn) {
        why = '找不到倉庫按鈕';
        return;
      }
      btn.click();
      if (!(await waitFor(() => isModalOpen() && modalTitle() === '倉庫', 1500))) {
        why = '開不起倉庫視窗';
        return;
      }
      opened = true;
      const tab = document.querySelector('#modalTabs button[data-k="shop"]');
      if (!tab) {
        why = '找不到倉庫的「飼料商店」分頁';
        return;
      }
      if (!tab.classList.contains('on')) tab.click();
      outer: for (const j of jobs) {
        for (let lot = 0; lot < j.lots; lot++) {
          if ((S.inv[j.item] || 0) >= j.target) break;
          const info = storageInfo(g);
          if (info.free !== null && info.free < 10) {
            why = '倉庫只剩 ' + info.free + ' 格空位，買不下 10 份' + j.name;
            break outer;
          }
          if (S.player.coins < j.price + CONFIG.minCoinsAfterBuyPetFood) {
            why = '缺' + j.name + '（庫存 ' + (S.inv[j.item] || 0) + '），金幣要 ' + (j.price + CONFIG.minCoinsAfterBuyPetFood) + ' 以上才買';
            continue outer;
          }
          const b = await waitFor(() => document.querySelector('#modalBody button[data-buy="' + j.item + '"][data-q="10"]'), 1500);
          if (!b) {
            why = '飼料商店找不到「買 10 個」按鈕：' + j.name;
            continue outer;
          }
          clicked = true;
          const coinsBefore = S.player.coins;
          b.click();
          const r = await confirmPurchase(g, { titles: [j.name + ' ×10'], price: j.price, floor: CONFIG.minCoinsAfterBuyPetFood });
          if (!r.ok) {
            why = r.why;
            break outer;
          }
          await sleep(250); // 買完遊戲會重畫商店頁，下一輪重新找按鈕
          // 「沒跳確認視窗」有兩種可能：玩家勾過「以後不再詢問」（直接買了），或遊戲拒絕了這次點擊（例如它算的倉庫空位不夠 10 格，
          // 只跳一個提示）。所以不能把「沒跳視窗」當成買成功：金幣真的少了才算買到，沒買到就停下來、當作沒進展（暫停後再試）。
          if (S.player.coins >= coinsBefore) {
            why = '點了「買 10 個」但沒有買成（遊戲拒絕了？倉庫放不下？）：' + j.name;
            break outer;
          }
          bought += 1;
        }
      }
    } finally {
      if (clicked && document.getElementById('ask47')) {
        const no = document.querySelector('#ask47 #ask47c');
        if (no) no.click();
      }
      const close = $('modalClose');
      if (opened && isModalOpen() && close) {
        close.click();
        await sleep(150);
      }
      if (bought > 0) {
        stats.petFood += bought;
        lastActionAt = Date.now();
        log('買了 ' + bought + ' 份（每份 10 個）寵物飼料');
      }
      const left = petFoodJobs(g);
      if (!left.length) {
        petFoodBlockedUntil = 0;
        petFoodHint = '';
      } else if (bought > 0) {
        // 這次有買成，只是還沒補夠（一次最多買 5 次、或中途被擋）：不用等，下個週期接著補；沒進展才會暫停
        petFoodBlockedUntil = 0;
        petFoodHint = why;
      } else {
        petFoodBlockedUntil = Date.now() + CONFIG.petFoodRetryMs;
        petFoodHint = why || '寵物飼料還沒補成';
      }
    }
  }

  // 找出下一個要處理的充電樁種類（略過暫停重試中的）；順便整理要寫在標籤上的原因
  function nextPartsJob(g) {
    const needs = partNeeds(g);
    const bases = [...new Set(needs.map((n) => n.base))];
    for (const b of Array.from(partsWhy.keys())) if (!bases.includes(b)) partsWhy.delete(b);
    const now = Date.now();
    // 這座島沒有的充電樁：全島輪流時腳本會自己切到有的島（見 islandPlan）；只做這座時要你切過去
    const here = bases.filter((b) => baseOnIsland(g, g.S.cur, b));
    for (const b of bases) {
      if (here.includes(b)) {
        if (String(partsWhy.get(b) || '').startsWith('這座島沒有')) partsWhy.delete(b);
        continue;
      }
      const nm = ((g.CFG.buildings || {})[b] || {}).name || b;
      partsWhy.set(b, '這座島沒有' + nm + '，換不了耗材' + (CONFIG.islandMode === 'all' ? '（全島輪流時會自己切到有的島）' : '（切到有的島才換得了）'));
    }
    partsHint = bases.map((b) => partsWhy.get(b)).filter(Boolean).join('、');
    const base = here.find((b) => !(partsBlocked.get(b) > now));
    return base ? { base, needs: needs.filter((n) => n.base === base) } : null;
  }

  // 開充電樁面板 → 一個一個按「換耗材」／「買 1」→ 關面板。無論如何結束，只要是我們開的視窗就一定關掉。
  async function partsFlow(g, job) {
    const { S, CFG } = g;
    const { base } = job;
    const M = S.maps[S.cur];
    const baseName = ((CFG.buildings || {})[base] || {}).name || base;
    const before = partNeeds(g).filter((n) => n.base === base).length;
    let opened = false;
    let clicked = false; // 這次是否按過面板上的按鈕
    let buys = 0; // 這次按過幾次會花錢的按鈕
    let why = '';
    try {
      let tile = null;
      for (const k in (M && M.tiles) || {}) {
        const T = M.tiles[k];
        if (T && T.t === 'building' && T.id === base) {
          tile = k;
          break;
        }
      }
      if (!tile) {
        why = '這座島沒有' + baseName + '，換不了耗材（其他島的機器人要切到有' + baseName + '的島）';
        return;
      }
      const [x, y] = tile.split(',').map(Number);
      g.act(x, y); // 收成工具點充電樁：遊戲開出機器人面板
      const ready = await waitFor(
        () => isModalOpen() && (document.querySelector('#modalBody .sw84') || document.querySelector('#modalBody .partcard')),
        1500
      );
      opened = isModalOpen(); // 這個週期開頭沒有任何視窗，現在有的就是我們開的
      if (!ready) {
        why = '開不起' + baseName + '面板';
        return;
      }
      for (let round = 0; round < 8; round++) {
        if (!partNeeds(g).some((n) => n.base === base)) break;
        const step = nextPartStep(g, base);
        if (!step.el) {
          why = step.why;
          break;
        }
        if (step.buy && buys >= 4) {
          why = '這次已經買了 4 個，先停';
          break;
        }
        clicked = true;
        step.el.click();
        if (step.buy) {
          buys += 1;
          const r = await confirmPartPurchase(g, step.buy);
          if (!r.ok) {
            why = r.why;
            break;
          }
        } else if (document.getElementById('ask47')) {
          // 免費換耗材不該跳確認視窗；跳了就是狀況不對，按取消、不再繼續
          const no = document.querySelector('#ask47 #ask47c');
          if (no) no.click();
          why = '換耗材跳出了沒預期的確認視窗，已取消';
          break;
        }
        await sleep(250); // 遊戲會重畫面板，下一輪重新找按鈕
      }
    } finally {
      // 我們按了按鈕之後，不能留下沒處理的購買確認視窗（它會讓腳本以為是玩家開的而一直暫停）
      if (clicked && document.getElementById('ask47')) {
        const no = document.querySelector('#ask47 #ask47c');
        if (no) no.click();
      }
      const close = $('modalClose');
      if (opened && isModalOpen() && close) {
        close.click();
        await sleep(150);
      }
      const left = partNeeds(g).filter((n) => n.base === base).length;
      if (before > left) {
        stats.parts += before - left;
        lastActionAt = Date.now();
        log('換了 ' + (before - left) + ' 個機器人耗材');
      }
      if (left === 0) {
        partsBlocked.delete(base);
        partsWhy.delete(base);
      } else {
        // 還有沒換成的（沒備品、金幣不夠、找不到按鈕…）：隔一陣子再試，原因寫在標籤上
        partsBlocked.set(base, Date.now() + CONFIG.partsRetryMs);
        partsWhy.set(base, why || '耗材還沒換成');
      }
    }
  }

  // 準備好播種工具與種子。回傳 true 才能收成／播種；回傳 false 代表這個週期只做了準備動作。
  //
  // 播種必須用「播種」工具（seed）；「收成」工具點空田只會顯示提示、不會播種。
  // 遊戲還有一道防誤觸：切到播種工具後，必須先在下方種子列點選一個種子（S.sel.none49），
  // 否則點空田會被擋下並跳出「先從下面選一個」。所以這裡會：
  //   1. 切到播種工具  2.「作物」分頁  3. 作物分類（例如玉米在「穀物」）  4. 點一下種子列裡設定的作物
  //
  // 種子列的結構（官方 2.68.1）：上方分頁 #trayTabs（設施／作物／果樹／花苗／蝴蝶園）；「作物」分頁裡再分 9 類 #cgrp62
  // （穀物、豆類…）；下方 #tray 裡每個品項是 .item[data-id]。所有分頁、分類的品項都一直在畫面結構裡，沒顯示的只是 hidden。
  // 所以直接去點一個「看不見的」玉米是個陷阱：S.sel.seed 雖然會變成玉米，畫面上的分頁卻還停在別處——
  // 停在「設施」「蝴蝶園」時，之後點地圖會被遊戲當成蓋設施／種寄主植物（會花錢，也種不出玉米）；停在「花苗」時品項列根本沒有作物。
  // 所以要像真人一樣一步一步切，每個週期做一步，每一步之後都重新檢查；而且只點「看得見的」品項。
  const seedTabOk = (sel) => !sel.seedTab || sel.seedTab === 'crops';
  function cropGroupOf(CFG, id) {
    const groups = (CFG.ui && CFG.ui.cropGroups && CFG.ui.cropGroups.groups) || [];
    const hit = groups.find((x) => Array.isArray(x.ids) && x.ids.includes(id));
    return hit ? { id: hit.id, label: hit.label || hit.id } : { id: 'other', label: '其他' }; // 遊戲把沒歸類的作物放進「其他」
  }
  function prepareTool(g) {
    const sel = g.S.sel;
    if (!ensureToolIs(g, 'seed')) {
      setStatus('切換工具中（播種）…');
      return false;
    }
    const want = targetCrop.id;
    // 第 2 步：分頁一定要在「作物」（果樹、花苗、設施、蝴蝶園的分頁裡，種子列放的不是作物，點地圖也不是播種）
    if (!seedTabOk(sel)) {
      const tab = document.querySelector('#trayTabs button[data-tab="crops"]');
      if (!tab) {
        setStatus('無法切到「作物」分頁（找不到分頁按鈕）');
        return false;
      }
      tab.click();
      setStatus('切換工具中（播種 → 作物分頁）…');
      return false;
    }
    if (sel.none49 || sel.seed !== want) {
      const item = document.querySelector('#tray .item[data-id="' + want + '"]');
      if (!item || item.classList.contains('locked')) {
        setStatus('無法選用種子：' + want + '（不存在或未解鎖）');
        return false;
      }
      // 第 3 步：品項被藏起來了（在別的作物分類裡）→ 先切到它的分類，不去點看不見的品項
      if (item.hidden) {
        const grp = cropGroupOf(g.CFG, want);
        const btn = document.querySelector('#cgrp62 button[data-cg62="' + grp.id + '"]');
        if (!btn) {
          setStatus('無法選用種子：' + want + '（找不到「' + grp.label + '」分類按鈕）');
          return false;
        }
        btn.click();
        setStatus('切換工具中（播種 → ' + grp.label + '）…');
        return false;
      }
      item.click();
      setStatus('切換工具中（選種子）…');
      return false;
    }
    return true;
  }

  // 準備好「照顧」工具並選用指定的選項。只允許兩種：「捉蟲」（免費）、「有機肥」（用倉庫現有的有機肥，免費、作物仍是有機）。
  // 絕不使用化肥、噴農藥：會花錢，而且會讓有機作物變成一般作物。
  // 照顧也是需要先在下方選項列點一下才會生效的工具（S.sel.none49），所以選項一定要點。
  // 回傳 true＝可以點了；false＝這個週期只做了準備動作；null＝這個工具或選項用不了（例如還沒解鎖）。
  function prepareCareTool(g, opt) {
    if (opt !== 'catch' && opt !== 'org') return null;
    const sel = g.S.sel;
    if (!ensureToolIs(g, 'care')) return false;
    if (sel.none49 || sel.care !== opt) {
      const item = document.querySelector('#tray .item[data-id="' + opt + '"]');
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

  // 規劃並執行「第 mi 座島」（預設是畫面上這座）的工作。dry＝true 是乾跑：只規劃、不動任何東西
  // （不點、不寫標籤、不改澆水記錄、不設「要賣出」旗標），用來判斷別座島有沒有事做。
  // 回傳 { work, needSell }：work＝這座島有事做（乾跑）或這個週期有在做／準備（真跑）；false＝沒事做。
  function doFields(g, mi = g.S.cur, dry = false) {
    const { S, CFG } = g;
    const M = S.maps[mi];
    if (!M || !M.tiles) return { work: false };
    const ck = (k) => mi + '|' + k; // 冷卻與澆水記錄的鍵要帶島編號，兩座島的同一個座標不能互相干擾

    if (!targetCrop) {
      if (!dry) setStatus('尚未設定作物（' + keyLabel(CONFIG.cropKey) + '）');
      return { work: false };
    }
    const R = CFG.rules || {};
    const seed = CFG.crops[targetCrop.id];
    if (!seed) {
      if (!dry) setStatus('找不到作物設定：' + targetCrop.id);
      return { work: false };
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
    const fertCand = []; // 想施有機肥的作物格：[格子, 單次收成的價值]；排完才依倉庫的有機肥庫存取前幾格
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
    let wantSell = false; // 規劃時發現要先賣出（倉庫放不下、金幣不夠買種子）；乾跑時只回報、不設旗標
    let others = 0; // 田裡其他種類的作物（還在長，不澆水也不處理）
    const otherRipe = []; // 田裡其他種類、已經成熟的作物：[格子, 產量]（等其他東西都排好、算過剩餘空位再決定收不收）
    let otherBlocked = 0; // 其中因為倉庫空位不夠而先不收的格數
    let ripeBlocked = 0; // 成熟了、但倉庫放不下所以還沒收的作物格數
    let unaffordable = 0; // 空田、但金幣不夠買種子所以還沒種的格數
    let growing = 0; // 還在長的設定作物格數
    let minLeft = Infinity; // 其中最快還要幾秒成熟（照濕潤時的速度算，乾的會更久）

    // 長蟲的格子要抓蟲；連續抓不掉就不再卡住這格。回傳 true＝這格交給抓蟲處理，其他動作先跳過
    const wantPestCatch = (k) => {
      const cdp = cooldown.get(ck(k));
      if (cdp && cdp.kind === 'pest' && cdp.fails >= 3) return false;
      if (!(cdp && cdp.until > now)) pests.push(k);
      return true;
    };
    // 澆水：濕度低於門檻就開始澆，澆到 upTo 級才停（避免在門檻附近來回澆）。枯萎的澆水可以救活，一律要澆。
    const wetDel = (k) => {
      if (!dry) wetting.delete(ck(k));
    };
    const wantWater = (k, T, wither) => {
      const m = T.m || 0;
      if (wither || (wetting.has(ck(k)) ? m < upTo - 0.001 : m < CONFIG.waterBelow)) {
        if (!dry) wetting.add(ck(k));
        waters.push(k);
      } else {
        wetDel(k);
      }
    };

    for (const k in M.tiles) {
      const T = M.tiles[k];
      if (!T) continue;

      // 被風吹歪的裝飾、倒下的柵欄：點一下就扶正（免費）。歪掉的裝飾會失去功能（例如儲水、防風），所以值得扶。
      // 用「澆水」工具點：遊戲在處理澆水之前就先扶正了，不會用到水；而「收成」工具點裝飾時，
      // 遊戲會先判斷蝴蝶棲地、野生植物（點了會被拔掉），不適合拿來點裝飾。
      if (T.t === 'deco' && (T.tilt || (T.id === 'fence' && T.fallen))) {
        const cdd = cooldown.get(ck(k));
        if (CONFIG.autoStraighten && !(cdd && cdd.until > now)) tilts.push([k, T.tilt ? 'tilt' : 'fence']);
        continue;
      }

      // 雜物：碎石點一下就撿掉（不佔倉庫）；雜草、草球會收進倉庫，先記下來，最後才決定要不要拔
      if (T.t === 'debris' || T.t === 'weed' || T.t === 'weedball') {
        const cdw = cooldown.get(ck(k));
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
        const cdt = cooldown.get(ck(k));
        if (cdt && cdt.until > now) continue;
        if (treeReady(T, CFG)) {
          wetDel(k);
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
        const cdm = cooldown.get(ck(k));
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
        } else if (loadWanted(T.id) && ms.canLoad) {
          loads.push([k, 'mload']);
        }
        continue;
      }

      // 蜂箱：存了蜂蜜就收（整箱一次收進倉庫，所以要放得下整箱）；其他設備（水井、灑水器…）不碰
      if (T.t === 'device') {
        if (!isHive(T, CFG)) continue;
        const cdh = cooldown.get(ck(k));
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
        const cdk = cooldown.get(ck(k));
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
          wetDel(k);
          const cdo = cooldown.get(ck(k));
          if (!(cdo && cdo.until > now)) otherRipe.push([k, (CFG.crops[T.crop.id] || {}).yield || 1]);
        } else {
          others += 1;
          if (fertWanted(T, CFG)) {
            const cdf = cooldown.get(ck(k));
            if (!(cdf && cdf.until > now)) fertCand.push([k, fertValue(T.crop, CFG)]);
          }
        }
        continue;
      }
      const cd = cooldown.get(ck(k));
      if (cd && cd.until > now) continue;
      if (T.crop) {
        if (isRipe(T, CFG)) {
          wetDel(k);
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
            if (CONFIG.autoSell) wantSell = true; // 倉庫還有空位但放不下這次收成：也要賣出騰空間，否則會一直卡住
          }
        } else {
          if (!T.crop.wither) {
            growing += 1;
            minLeft = Math.min(minLeft, CFG.crops[T.crop.id].growSeconds - T.crop.prog);
          }
          if (fertWanted(T, CFG)) fertCand.push([k, fertValue(T.crop, CFG)]);
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
    // 施有機肥：肥料有限（倉庫有幾個就最多施幾格），單次收成價值高的先施；一格一個，不夠就留到有肥料再說
    fertCand.sort((a, b) => b[1] - a[1]);
    const fertStock = Math.max(0, Math.floor(Number(S.inv.organic_fert) || 0));
    const ferts = fertCand.slice(0, fertStock).map((c) => c[0]);
    if (fertCand.length > ferts.length) {
      hints.push('倉庫的有機肥不夠，' + (fertCand.length - ferts.length) + ' 格長時間作物先不施肥');
    }
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
        wantSell = true; // 金幣不夠買種子：先把倉庫裡的設定作物賣掉換錢，不等倉庫快滿
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
        const cdp = cooldown.get(ck(k));
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
    // 空位不夠只是暫停，不會因此觸發賣出；倉庫裡的雜草沒有數量上限，等下次賣出設定作物時會一併賣掉（sellWeedsWithCrops）。
    let weedNoRoom = 0; // 空位不夠（拔完要保留 weedKeepFree 格）而先不拔的格數
    const roomForWeeds = room; // 排完其他東西之後、還沒拔雜草之前剩的空位（標籤用）
    for (const [k, kind, n] of weedCand) {
      if (room - n >= CONFIG.weedKeepFree) {
        cleanups.push([k, kind]);
        room -= n;
      } else {
        weedNoRoom += 1;
      }
    }
    if (weedNoRoom > 0) {
      hints.push(
        '倉庫剩 ' + roomForWeeds + ' 格空位（拔雜草要保留 ' + CONFIG.weedKeepFree + ' 格），' + weedNoRoom + ' 格雜草先不拔'
      );
    }
    if (islandHint && !dry) hints.push(islandHint); // 有多座島：說明現在在哪座、是全島輪流還是只做這座
    if (partsHint) hints.push('機器人耗材：' + partsHint);
    if (petFoodHint && !dry) hints.push('寵物飼料：' + petFoodHint);
    if (critterHint && !dry) hints.push('老鼠／寵物／天敵：' + critterHint);

    // 一次只用一種工具：抓蟲要「照顧」工具、播種／收成／魚池要「播種」工具、撿東西要「收成」工具、澆水要「澆水」工具。
    // 目前的工具還有事做就繼續用，做完才換，避免每個週期都來回切換；
    // 要換時優先順序是抓蟲 > 播種收成魚池 > 撿東西雜物 > 澆水。
    if (blockedPick) {
      hints.push('倉庫沒空位，暫停收地上的東西、果樹、魚、機器成品、蜂蜜、肉用動物');
      if (CONFIG.autoSell) wantSell = true; // 賣掉設定的作物騰出空間
    }
    // 撿糞便、收動物產物、採果樹、收機器、撿雜物都用「收成」工具（hand）：實測用「播種」工具點動物格子不會收；
    // 機器則一定會跳小選單（要再按「收成」）。魚池用「播種」工具直接收，用收成工具會跳小選單。
    const handQueue = pickups.concat(feeds, loads, cleanups);
    const work = {
      care: pests.length + ferts.length > 0, // 捉蟲與施有機肥都用「照顧」工具（選項不同；有蟲先抓）
      seed: harvests.length + plants.length + pools.length > 0,
      hand: handQueue.length > 0,
      water: waters.length + tilts.length > 0, // 扶正也用澆水工具
    };
    if (dry) return { work: Object.values(work).some(Boolean), needSell: wantSell };
    if (wantSell) needSell = true;
    const tool = S.sel.tool;
    const pickMode = () => (work[tool] ? tool : ['care', 'seed', 'hand', 'water'].find((m) => work[m]));
    let mode = pickMode();
    // 「照顧」工具這個週期用哪個選項：有蟲先抓（捉蟲），沒有蟲才施有機肥
    const careOpt = pests.length > 0 ? 'catch' : 'org';
    if (mode === 'care') {
      const r = prepareCareTool(g, careOpt);
      if (r === null) {
        // 照顧工具或這個選項用不了（還沒解鎖或找不到按鈕）：不要卡住，改做別的事
        hints.push(careOpt === 'catch' ? '捉蟲工具無法使用（未解鎖？）' : '施肥工具無法使用（未解鎖？）');
        work.care = false;
        mode = pickMode();
      } else if (!r) {
        switching(careOpt === 'catch' ? '照顧／捉蟲' : '照顧／有機肥');
        return { work: true };
      }
    }
    if (!mode) {
      // 沒有事做：說明是在等作物長大，還是被什麼擋住
      if (growing > 0) {
        hints.push(growing + ' 格' + targetCrop.name + '還在長，最快約 ' + fmtSec(minLeft) + ' 後成熟');
      }
      setStatus('運作中（暫時沒有事做）' + (hints.length ? '｜' + hints.join('｜') : ''));
      return { work: false, needSell: wantSell };
    }

    let queue;
    if (mode === 'care') {
      queue = careOpt === 'catch' ? pests.map((k) => [k, 'pest']) : ferts.map((k) => [k, 'fert']);
    } else if (mode === 'water') {
      if (!ensureToolIs(g, 'water')) {
        switching('澆水');
        return { work: true };
      }
      queue = waters.map((k) => [k, 'water']).concat(tilts);
    } else if (mode === 'hand') {
      if (!ensureToolIs(g, 'hand')) {
        switching('收成');
        return { work: true };
      }
      queue = handQueue;
    } else {
      if (!prepareTool(g)) return { work: true }; // prepareTool 自己會寫明是在切工具、還是種子用不了
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
      // 播種工具的點擊（收成、播種、魚池）：分頁一定要在「作物」——停在設施、蝴蝶園分頁時，點地圖會被遊戲當成蓋設施、種寄主植物（會花錢）；
      // 播種時，選著的種子一定是設定的作物
      if ((kind === 'harvest' || kind === 'plant' || kind === 'pool') && (S.sel.tool !== 'seed' || !seedTabOk(S.sel))) break;
      if (kind === 'plant' && (S.sel.none49 || S.sel.seed !== targetCrop.id)) break;
      // 施肥：一定是「照顧」工具的「有機肥」選項（不是化肥、農藥），倉庫真的有有機肥，而且那格現在確實還適合施肥
      if (kind === 'fert') {
        if (S.sel.tool !== 'care' || S.sel.care !== 'org' || S.sel.none49) break;
        if (!((S.inv.organic_fert || 0) >= 1)) break;
        if (!fertWanted(T0, CFG)) continue;
      }
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
        if (kind === 'mload' && !(loadWanted(T0.id) && ms.out === 0 && ms.canLoad)) {
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
      else if (kind === 'fert') ok = !!H && H.fert === 'org';
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
        } else if (kind === 'fert') {
          stats.fert += 1;
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
      const prev = cooldown.get(ck(k));
      const fails = ok ? 0 : prev && prev.kind === kind ? prev.fails + 1 : 0;
      cooldown.set(ck(k), {
        kind,
        fails,
        until: Date.now() + (ok ? 300 : Math.min(60000, 1500 * Math.pow(2, fails))),
      });

      // 播種會花金幣、澆水會花雨水：每次都重新檢查，避免超出預算
      if (kind === 'plant' && S.player.coins < seed.seedCost + CONFIG.minCoinsAfterPlant) break;
      if (kind === 'water' && S.player.water < tapCost) break;
    }

    setStatus('運作中' + (hints.length ? '｜' + hints.join('｜') : ''));
    return { work: true };
  }

  // ───────────────────────── 多座島 ─────────────────────────
  //
  // 遊戲裡所有島都一直在運作（作物照長、動物照生產、雜草照長），但「點擊」只作用在畫面上顯示的那座；
  // 換島的方式是點右側的「農場 N」按鈕（和玩家點的一樣：只換顯示的島、重新對焦鏡頭）。
  // islandMode = 'all' 時腳本自己切島：
  //   - 先「乾跑」規劃每座島（不動任何東西）判斷有沒有事做，只切去真的有事做的島；
  //   - 目前這座沒事做才離開；一座島占用太久（maxStayMs）、或有事做卻卡住沒進展（stuckMs）也讓出去；
  //   - 切過去之後這個週期不動手，下個週期重新規劃（不拿舊計畫去點新的島）；
  //   - 切過去卻什麼都沒做成的島，隔越來越久才再考慮（islandRetryMs 起算、加倍、最久 5 分鐘）；
  //   - 都沒事做了就回「家島」（按開始時看的那座、或你最後手動切到的那座）；
  //   - 你手動切島時，那座就是家島，userSwitchHoldMs 內不自己切走；
  //   - 目前選的工具不是腳本用的四種（可能是你的建造、移除…）時，先切到收成工具才切島，
  //     不讓你的下一次點擊落在別座島上。
  const SCRIPT_TOOLS = ['hand', 'seed', 'water', 'care'];
  const TRACK_GAP_MS = 8000; // 兩次整理島嶼狀態相隔超過這麼久，就當作中間被暫停過（賣出、換耗材最久約幾秒）

  function resetIslands(S) {
    islandSave = S;
    homeIsland = null;
    expectedCur = null;
    holdUntil = 0;
    stayStart = 0;
    progressAt = 0;
    seenAction = lastActionAt;
    arrivalAction = lastActionAt;
    lastHopAt = 0;
    lastTrackAt = 0;
    stuckMarked = false;
    islandState.clear();
    cooldown.clear(); // 冷卻、澆水記錄的鍵是「島編號|座標」，換存檔後就對不上了
    wetting.clear();
    partsBlocked.clear();
    partsWhy.clear();
  }

  const islandReady = (mi) => {
    const st = islandState.get(mi);
    return !(st && st.until > Date.now());
  };

  function backoffIsland(mi) {
    const st = islandState.get(mi) || { fails: 0, until: 0 };
    st.fails += 1;
    st.until = Date.now() + Math.min(300000, CONFIG.islandRetryMs * Math.pow(2, st.fails - 1));
    islandState.set(mi, st);
  }

  // 整理島嶼狀態（每個週期一次）。回傳 true＝由腳本輪流切島（全島模式且有 2 座以上）
  function islandTrack(g) {
    const { S } = g;
    const n = S.maps.length;
    const now = Date.now();
    if (islandSave !== S || n < islandCount) resetIslands(S);
    islandCount = n;
    // 腳本被暫停（玩家開了視窗、擴地模式、搬移物件…）或這個週期被賣出、換耗材占用很久：那段時間不能算成「沒進展」或「占用」，
    // 不然玩家一關視窗，腳本就以為這座島卡住了、馬上切走。
    if (lastTrackAt && now - lastTrackAt > TRACK_GAP_MS) {
      stayStart = now;
      progressAt = now;
      stuckMarked = false;
    }
    lastTrackAt = now;
    const arrive = () => {
      stayStart = now;
      progressAt = now;
      stuckMarked = false;
      arrivalAction = lastActionAt;
      seenAction = lastActionAt;
    };
    if (expectedCur === null || expectedCur >= n) {
      expectedCur = S.cur;
      homeIsland = S.cur;
      arrive();
    }
    if (S.cur !== expectedCur) {
      // 目前顯示的島不是腳本切過去的：玩家手動切了。那座就是家島，一陣子內不自己切走
      expectedCur = S.cur;
      homeIsland = S.cur;
      holdUntil = now + CONFIG.userSwitchHoldMs;
      arrive();
    }
    const multi = CONFIG.islandMode === 'all' && n > 1;
    if (!multi) {
      homeIsland = S.cur; // 只做這座：玩家看哪座就處理哪座；之後切回全島輪流時，就以那座當家島
      expectedCur = S.cur;
    }
    if (n < 2) {
      islandHint = '';
      islandLine = '';
      islandShort = '';
    } else if (!multi) {
      islandHint = '共 ' + n + ' 座島，只處理畫面上的第 ' + (S.cur + 1) + ' 座（' + keyLabel(CONFIG.islandKey) + ' 切到全島輪流）';
      islandLine = '島 ' + (S.cur + 1) + '/' + n + '｜只做這座（' + keyLabel(CONFIG.islandKey) + ' 切換）';
      islandShort = '島' + (S.cur + 1) + '/' + n;
    } else {
      const away = homeIsland !== S.cur ? '（家島 ' + (homeIsland + 1) + '）' : '';
      const held = now < holdUntil ? '，你剛切島，先不自己切走' : '';
      islandHint = '島 ' + (S.cur + 1) + '/' + n + away + held;
      islandLine = '島 ' + (S.cur + 1) + '/' + n + '｜全島輪流（家 ' + (homeIsland + 1) + '）｜切島 ' + stats.hops + ' 次';
      islandShort = '島' + (S.cur + 1) + '/' + n;
    }
    return multi;
  }

  // 這座島現在有沒有事做（乾跑規劃，不動任何東西），以及規劃時看到的「要先賣出」
  function islandPlan(g, mi) {
    const r = doFields(g, mi, true) || {};
    let work = !!r.work;
    if (!work && CONFIG.autoSwapParts) {
      // 有機器人在等耗材，而且那種充電樁在這座島上（沒在暫停重試）：也是有事做
      const now = Date.now();
      work = partNeeds(g).some((nd) => !(partsBlocked.get(nd.base) > now) && baseOnIsland(g, mi, nd.base));
    }
    if (!work && critterWork(g, mi)) work = true; // 別座島有老鼠、髒了的貓狗：也是有事做（切過去才點得到）
    return { work, needSell: !!r.needSell };
  }

  // 乾跑其他島，並把「要先賣出」套用到全域（倉庫、金幣是全島共用的）
  function planOthers(g) {
    const plans = {};
    for (let mi = 0; mi < g.S.maps.length; mi++) {
      if (mi === g.S.cur) continue;
      plans[mi] = islandPlan(g, mi);
      if (plans[mi].needSell && CONFIG.autoSell) needSell = true;
    }
    return plans;
  }

  // 下一座要去的島：從目前這座的下一座往後找，第一個「沒被略過、沒在暫停、有事做」的
  function nextIsland(g, plans) {
    const n = g.S.maps.length;
    for (let i = 1; i < n; i++) {
      const mi = (g.S.cur + i) % n;
      if (CONFIG.skipIslands.includes(mi + 1) || !islandReady(mi)) continue;
      if (plans[mi] && plans[mi].work) return mi;
    }
    return null;
  }

  // 切到第 mi 座島。回傳 'busy'（這個週期用在切工具上）、'hopped'（切過去了）、'failed'（切不過去，那座島先暫停）
  function hopTo(g, mi, why) {
    const { S } = g;
    if (!SCRIPT_TOOLS.includes(S.sel.tool) && !ensureToolIs(g, 'hand')) {
      setStatus('切換工具中（切島前）…');
      return 'busy';
    }
    const btn = document.querySelector('#maps button[data-map="' + mi + '"]');
    if (btn) btn.click();
    if (S.cur !== mi) {
      backoffIsland(mi);
      setStatus('切不到第 ' + (mi + 1) + ' 座島，先暫停去那座');
      return 'failed';
    }
    const now = Date.now();
    expectedCur = mi;
    stayStart = now;
    progressAt = now;
    stuckMarked = false;
    arrivalAction = lastActionAt;
    seenAction = lastActionAt;
    lastHopAt = now;
    stats.hops += 1;
    setStatus('切到第 ' + (mi + 1) + ' 座島（' + why + '）');
    return 'hopped';
  }

  // 這個週期在目前這座島做完（或沒事做）之後：決定要不要切島。回傳 true＝這個週期已經用掉了（切了島或在切工具）
  function islandAfter(g, r, plans) {
    const { S } = g;
    const now = Date.now();
    const cur = S.cur;
    if (lastActionAt !== seenAction) {
      seenAction = lastActionAt;
      progressAt = now;
      stuckMarked = false;
    }
    if (now < holdUntil || now - lastHopAt < CONFIG.islandHopMinMs) return false;
    // 別座島出現天敵（只給 60 秒）：不等輪到、也不管這座島有沒有事做，立刻切過去趕。每隻天敵最多為牠切一次島
    const urgent = urgentPred(g);
    if (urgent) {
      const res = hopTo(g, urgent.mi, PRED_NAMES[urgent.Pd.kind] + '出現了');
      if (res === 'hopped') predHopped.add(urgent.Pd.id);
      return res !== 'failed';
    }
    let target = null;
    let why = '';
    if (r.work) {
      // 有事做就留著；占用太久、或有事做卻一直沒做成（卡住）才讓出去
      const overstay = now - stayStart >= CONFIG.maxStayMs;
      const stuck = now - progressAt >= CONFIG.stuckMs;
      if (!overstay && !stuck) return false;
      if (stuck && !stuckMarked) {
        stuckMarked = true; // 同一次卡住只記一次失敗（不然沒地方可去時每個週期都加一次，退避時間會無限拉長）
        backoffIsland(cur);
      }
      target = nextIsland(g, plans);
      why = stuck ? '這座卡住了' : '輪到下一座';
      if (target === null && stuck && CONFIG.returnHome && homeIsland !== null && cur !== homeIsland && homeIsland < S.maps.length) {
        target = homeIsland; // 卡住的不是家島、又沒有別座有事做：回家島，不要停在卡住的島上
        why = '這座卡住了，回家島';
      }
      if (target === null) {
        if (overstay) stayStart = now; // 沒有別座島有事做：留著，過一陣子再看
        return false;
      }
    } else {
      // 沒事做：不是家島的話，看這趟有沒有做成事（沒有就暫停這座島一陣子，有就清掉失敗記錄）
      if (cur !== homeIsland) {
        if (lastActionAt <= arrivalAction) backoffIsland(cur);
        else islandState.delete(cur);
      }
      target = nextIsland(g, plans);
      why = '那座有事做';
      if (target === null && CONFIG.returnHome && homeIsland !== null && cur !== homeIsland && homeIsland < S.maps.length) {
        target = homeIsland;
        why = '回家島';
      }
    }
    if (target === null) return false;
    return hopTo(g, target, why) !== 'failed';
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
    if (isExpandMode()) {
      // 玩家按了「擴地」還沒結束：遊戲把每一次點地圖都當成擴地點擊，腳本點什麼都沒用；先暫停，不去搶玩家的操作
      setStatus('遊戲在「擴地模式」，暫停中（再按一次「擴地」或按 Esc 結束）');
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

    // 多座島：整理狀態，並乾跑其他島（判斷有沒有事做、順便套用「要先賣出」）
    const multi = islandTrack(g);
    const plans = multi ? planOthers(g) : null;

    // 天敵（黃鼠狼、狐狸、野狼）出現後只給 60 秒：比賣出、收成都急，先點牠（只在這座島畫面上看得到時；別座島的見 islandAfter）
    if (CONFIG.autoChasePredators && (await critterStep(g, true))) return;

    const info = storageInfo(g);
    const nearlyFull =
      (info.free !== null && info.free <= CONFIG.sellWhenFreeAtMost) ||
      (info.free === null && info.fullFlag);
    if (CONFIG.autoSell && (needSell || nearlyFull) && Date.now() >= sellBlockedUntil) {
      setStatus(nearlyFull ? '倉庫快滿，賣出中…' : '賣出中…');
      await sellFlow(g);
      return;
    }

    // 這座島上有老鼠、髒了的貓狗：點畫面上的牠（抓老鼠＝同一處點 3 下；梳毛／洗澡＝點寵物再按小選單的按鈕）。免費、不動倉庫
    if (CONFIG.autoCatchRats || CONFIG.autoGroomPets || CONFIG.autoChasePredators) {
      if (await critterStep(g, false)) return;
    } else {
      critterHint = '';
    }

    // 機器人耗材磨完了：到充電樁面板換上（有備品免費換；沒備品才在設定允許、金幣夠時買 1 個）
    if (CONFIG.autoSwapParts) {
      const job = nextPartsJob(g);
      if (job) {
        if (!ensureToolIs(g, 'hand')) {
          setStatus('切換工具中（換耗材）…');
          return;
        }
        setStatus('機器人換耗材中…');
        await partsFlow(g, job);
        return;
      }
    } else {
      partsHint = '';
    }

    // 寵物（貓、狗）的飼料庫存不夠、或有寵物餓著：到倉庫的飼料商店買（會花金幣，有開關與金幣底線）
    if (CONFIG.autoBuyPetFood) {
      const petJobs = petFoodJobs(g);
      if (!petJobs.length) petFoodHint = '';
      else if (Date.now() >= petFoodBlockedUntil) {
        setStatus('補寵物飼料中…');
        await petFoodFlow(g, petJobs);
        return;
      }
    } else {
      petFoodHint = '';
    }

    const r = doFields(g, g.S.cur) || { work: false };
    if (multi && islandAfter(g, r, plans)) return;
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
      partsBlocked.clear();
      partsWhy.clear();
      partsHint = '';
      islandSave = null; // 下個週期重新整理島嶼狀態：開始時看的那座就是家島
      petFoodBlockedUntil = 0;
      petFoodHint = '';
      critterCd.clear();
      predHopped.clear();
      critterHint = '';
      status = '啟動中';
      timer = setInterval(onTick, CONFIG.tickMs);
    } else {
      clearInterval(timer);
      timer = null;
      status = '';
    }
    log('自動功能', on ? 'ON' : 'OFF');
    renderBadge(false); // 縮成小方格時也看得到 ON／OFF，不必為了開關特地展開
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
    Object.assign(el.style, {
      position: 'fixed',
      right: '42px', // 右下角最角落留給「⚙」按鈕（它的位置固定，不會跟著標籤的寬度跑）
      bottom: '8px',
      zIndex: '2147483647',
      color: '#fff',
      borderRadius: '6px',
      cursor: 'pointer',
      userSelect: 'none',
      whiteSpace: 'pre-line',
      boxSizing: 'border-box',
    });
    // 點一下在「完整資訊」與「小方格」之間切換（不會消失，狀態一直看得到）
    el.addEventListener('click', () => {
      collapsed = !collapsed;
      renderBadge(false);
    });
    document.body.appendChild(el);
    return el;
  }

  // 右下角最角落的「⚙」按鈕：用滑鼠開關設定視窗，不靠快速鍵（快速鍵可能被別的套件占用）；標籤在它左邊
  function createGear() {
    const b = document.createElement('button');
    b.id = GEAR_ID;
    b.type = 'button';
    b.textContent = '⚙';
    Object.assign(b.style, {
      position: 'fixed',
      right: '8px', // 固定位置：標籤的寬度一直在變（狀態文字長短不一），齒輪不能跟著跑，不然會跳到別的按鈕上
      bottom: '8px',
      zIndex: '2147483647',
      width: '28px',
      height: '28px',
      padding: '0',
      font: '16px/1 sans-serif',
      color: '#fff',
      background: 'rgba(0, 0, 0, 0.7)',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    });
    b.addEventListener('click', (e) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      toggleSettingsPanel();
    });
    document.body.appendChild(b);
    return b;
  }

  // 齒輪的提示文字帶著目前的快速鍵（快速鍵可以在設定視窗裡改）
  function placeGear() {
    if (!gearBtn) return;
    gearBtn.title = '設定視窗（' + keyLabel(CONFIG.configKey) + '）';
  }

  // 快速鍵說明；三個鍵的修飾鍵相同時合併顯示，例如「Alt+Shift＋A 開關／S 作物／D 診斷」
  function hotkeyLine() {
    const keys = [
      [CONFIG.toggleKey, '開關'],
      [CONFIG.cropKey, '作物'],
      [CONFIG.probeKey, '診斷'],
      [CONFIG.islandKey, '島嶼'],
      [CONFIG.configKey, '設定'],
    ];
    const mod = (k) => [k.ctrl && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift'].filter(Boolean).join('+');
    const letter = (k) => k.code.replace(/^Key/, '');
    if (keys.every(([k]) => mod(k) === mod(keys[0][0]))) {
      return mod(keys[0][0]) + '＋' + keys.map(([k, label]) => letter(k) + ' ' + label).join('／');
    }
    return keys.map(([k, label]) => keyLabel(k) + ' ' + label).join('｜');
  }

  // 小方格只放最重要的兩件事：ON／OFF（開著但暫停中就寫「暫停」）、開啟後累計做成幾件事；
  // 底色同樣表示狀態：灰＝關、綠＝運作中、琥珀＝開著但暫停中。滑鼠移上去會顯示完整的狀態文字。
  const totalActions = () => Object.values(stats).reduce((a, b) => a + b, 0);
  const isPausedStatus = () => /暫停中|尚未設定|等待遊戲|設定作物中/.test(status);

  // show＝true：要讓玩家看到訊息（診斷結果、錯誤、開機）時，一律展開成完整資訊
  function renderBadge(show) {
    if (!badge) return;
    if (show) collapsed = false;
    const paused = enabled && isPausedStatus();
    badge.style.background = !enabled
      ? 'rgba(0, 0, 0, 0.7)'
      : paused
        ? 'rgba(150, 95, 0, 0.9)'
        : 'rgba(0, 110, 0, 0.85)';
    if (collapsed) {
      Object.assign(badge.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '52px',
        height: '52px',
        padding: '0',
        font: '700 11px/1.25 sans-serif',
        textAlign: 'center',
      });
      badge.title =
        (enabled ? status || '運作中' : '自動：OFF（' + keyLabel(CONFIG.toggleKey) + ' 開啟）') + '\n點一下展開';
      badge.textContent = enabled ? (paused ? '暫停' : 'ON') + '\n✓' + totalActions() + (islandShort ? '\n' + islandShort : '') : 'OFF';
      lastRenderAt = Date.now();
      placeGear();
      return;
    }
    Object.assign(badge.style, {
      display: 'block',
      flexDirection: '',
      alignItems: '',
      justifyContent: '',
      width: 'auto',
      height: 'auto',
      padding: '4px 8px',
      font: '12px/1.4 sans-serif',
      textAlign: 'right',
    });
    badge.title = '點一下縮成小方格';
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
      lines.push('蜂蜜 ' + stats.honey + '｜出貨 ' + stats.meat + '｜換耗材 ' + stats.parts + '｜寵物飼料 ' + stats.petFood + '｜施肥 ' + stats.fert + '｜抓老鼠 ' + stats.rat + '｜梳毛 ' + stats.groom + '｜趕天敵 ' + stats.chase);
      if (islandLine) lines.push(islandLine);
      // 上一次真的做成事的時間：數字不動、又一直很久以前，就是停住了，看下一行的原因
      lines.push(lastActionAt ? '上次動作：' + fmtSec((Date.now() - lastActionAt) / 1000) + '前' : '開啟後還沒做成任何事');
      if (status) lines.push(status);
    }
    if (note) lines.push(note);
    badge.textContent = lines.join('\n');
    lastRenderAt = Date.now();
    placeGear();
  }

  function initBadge() {
    if (document.getElementById(BADGE_ID)) return;
    badge = createBadge();
    gearBtn = createGear();
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

  // 診斷用：每座島的雜草、糞便、成熟作物、有產物的動物數，以及乾跑規劃的結果（有沒有事做）
  function islandsInfo(g) {
    const { S, CFG } = g;
    return S.maps.map((M, mi) => {
      const o = { island: mi + 1, weeds: 0, poop: 0, ripe: 0, animalsWithProduct: 0 };
      for (const k in (M && M.tiles) || {}) {
        const T = M.tiles[k];
        if (!T) continue;
        if (T.t === 'weed' || T.t === 'weedball') o.weeds += 1;
        else if (T.t === 'poop') o.poop += 1;
        else if (T.t === 'soil' && isRipe(T, CFG)) o.ripe += 1;
        else if (T.t === 'animal' && T.stack > 0) o.animalsWithProduct += 1;
      }
      o.hasWork = islandPlan(g, mi).work;
      return o;
    });
  }

  // 診斷用：貓、狗各幾隻、餓著幾隻、倉庫裡有幾份飼料
  function petsInfo(g) {
    const pets = Array.isArray(g.S.pets) ? g.S.pets : [];
    const o = { total: pets.length, hungry: 0, dogs: 0, cats: 0, dogFood: (g.S.inv && g.S.inv.dog_food) || 0, catFood: (g.S.inv && g.S.inv.cat_food) || 0 };
    for (const P of pets) {
      if (!P) continue;
      if (P.kind === 'dog') o.dogs += 1;
      else if (P.kind === 'cat') o.cats += 1;
      if (P.hungry) o.hungry += 1;
    }
    return o;
  }

  // 診斷用：幾台機器人在等耗材（依耗材分）、倉庫裡對應的備品數
  function robotPartsInfo(g) {
    const waiting = {};
    const stock = {};
    let total = 0;
    for (const n of partNeeds(g)) {
      waiting[n.part] = (waiting[n.part] || 0) + 1;
      stock[n.part] = (g.S.inv && g.S.inv[partItemId(n.part)]) || 0;
      total += 1;
    }
    return { total, waiting, stock };
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
      weedStock: (S.inv && S.inv.weed) || 0, // 倉庫裡的雜草（賣出設定作物時一併賣掉）
      maps: { total: S.maps.length, current: S.cur + 1, mode: CONFIG.islandMode, home: homeIsland === null ? null : homeIsland + 1 },
      islands: islandsInfo(g), // 每座島的概況與「現在有沒有事做」
      expandMode: isExpandMode(), // 遊戲的擴地模式開著時腳本會暫停
      customSettings: Object.keys(overrides), // 在設定視窗改過的參數名（值不輸出）
      robotParts: robotPartsInfo(g), // 等耗材的機器人台數（依耗材分）與倉庫備品
      pets: petsInfo(g), // 貓狗隻數、餓著幾隻、飼料庫存
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
        '｜蜂蜜 ' + G.hives.jars + ' 罐' +
        '\n雜草：地上 ' + G.ground.weed + '（草球 ' + G.ground.weedball + '）｜倉庫 ' + G.weedStock + ' 個｜空位 ' + G.storage.free + '（拔雜草要留 ' + CONFIG.weedKeepFree + '）' +
        '\n島 ' + G.maps.current + '/' + G.maps.total + (G.expandMode ? '｜擴地模式中（腳本暫停）' : '') +
        '｜等耗材的機器人 ' + G.robotParts.total + ' 台' +
        '\n寵物：' + G.pets.dogs + ' 狗 ' + G.pets.cats + ' 貓｜餓著 ' + G.pets.hungry + '｜狗飼料 ' + G.pets.dogFood + '／貓飼料 ' + G.pets.catFood +
        (G.maps.total > 1
          ? '\n島嶼：' + (G.maps.mode === 'all' ? '全島輪流' : '只做這座') + '｜有事做：' +
            (G.islands.filter((i) => i.hasWork).map((i) => i.island).join('、') || '沒有')
          : '')
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

  // 全島輪流 ⇄ 只做畫面上這座（只存在記憶體，重新整理頁面就恢復預設）
  function toggleIslandMode() {
    CONFIG.islandMode = CONFIG.islandMode === 'all' ? 'current' : 'all'; // 暫時的：不存進 overrides
    holdUntil = 0;
    syncSettingsPanel();
    setNote(
      CONFIG.islandMode === 'all' ? '島嶼模式：全島輪流（腳本會自己切島）' : '島嶼模式：只做畫面上這座',
      4000
    );
  }

  // 開啟自動功能前一定要先有設定作物
  function requestToggle() {
    if (enabled) setEnabled(false);
    else if (!targetCrop) openCropPanel(true);
    else setEnabled(true);
  }

  // ───────────────────────── 設定視窗與保存 ─────────────────────────
  //
  // Alt+Shift+G 開關「設定視窗」：列出 CONFIG 裡可以調的參數、每個的說明與預設值，改了立刻生效。
  // 改過的值（只有「和預設不同」的）存在這個網站的 localStorage 的一個鍵（SETTINGS_KEY）裡，下次載入時讀回來；
  // 「開關（ON／OFF）」「設定的作物」「Alt+Shift+F 的全島輪流⇄只做這座」不存。快速鍵可以在視窗最下面改（按「改」再按新組合鍵）；
  // 就算改到沒辦法用，標籤旁的「⚙」按鈕一定開得了視窗，所以不會把自己鎖在外面。
  // 資安：
  //   - 讀回來時只看 SCHEMA 列出的參數（不是照存下來的 JSON 的鍵去套，所以 __proto__ 之類的鍵進不來），
  //     每一項都驗型別與範圍，不合的整項忽略；JSON 壞掉、超過 4 KB、瀏覽器不讓用儲存空間，都不會丟錯。
  //   - 只碰自己的這一個鍵，不讀、不寫遊戲自己的存檔；視窗內容只用 textContent 寫入。
  const SETTINGS_KEY = 'skyfarm-auto-settings';
  const SETTINGS_MAX_CHARS = 4096;
  const SECS = '毫秒';

  const bool = (key, label, desc) => ({ key, type: 'bool', label, desc });
  const num = (key, label, desc, min, max, unit, type) => ({ key, type: type || 'int', label, desc, min, max, unit: unit || '' });

  // 快速鍵（也是設定表的一組；要有 Alt，不能含 Ctrl／Win，兩兩不能重複）
  const HOTKEY_NAMES = [
    ['toggleKey', '開關（ON／OFF）', '開啟或關閉自動功能。'],
    ['cropKey', '設定作物', '開啟「設定作物」輸入框。'],
    ['probeKey', '診斷', '輸出唯讀診斷（摘要顯示在標籤上，完整內容複製到剪貼簿與 Console）。'],
    ['islandKey', '全島輪流⇄只做畫面上這座', '暫時切換島嶼模式（只在這次載入有效，不存）。'],
    ['configKey', '設定視窗', '開關這個設定視窗。'],
  ];

  // 參數表：[群組名, [參數…]]。每個參數的 label 是畫面上的名稱，desc 是說明；min／max 是允許的範圍
  const SCHEMA = [
    ['節奏', [
      num('tickMs', '週期間隔', '腳本每隔多久檢查並動作一次。越小反應越快，但遊戲每次操作都會存檔，太快會增加負擔。', 200, 5000, SECS),
      num('maxActionsPerTick', '每週期最多動作格數', '一個週期最多收成、播種、澆水幾格。遊戲每次操作都會存檔，不宜一次太多。', 1, 10, '格'),
    ]],
    ['收成與播種（設定的作物）', [
      bool('autoHarvest', '自動收成', '成熟的作物自動收成（倉庫放得下才收；放不下會先賣出騰空間）。'),
      bool('autoPlant', '自動播種', '空的田自動種下你設定的作物（會花金幣買種子）。'),
      num('minCoinsAfterPlant', '播種後至少保留金幣', '播種後金幣要還有這麼多才播，避免把錢花光。0＝不保留。', 0, 10000000, '金幣'),
      bool('harvestOtherCrops', '也收其他作物', '田裡「不是設定作物」的作物，成熟了也收成（只收、不澆水、不賣）。空出來的田照常補種設定作物。'),
      num('otherCropsKeepFree', '收其他作物要保留的倉庫空位', '其他作物不會自動賣，所以收完倉庫至少要還剩這麼多空位才收，免得擠掉設定作物的位置。', 0, 1000, '格'),
      bool('handleOtherCrops', '其他作物也澆水', '關閉＝其他作物不澆水（成熟了仍會收）；開啟＝也替它們澆水，收成不受上一項限制（但仍不會賣）。'),
    ]],
    ['賣出', [
      bool('autoSell', '自動賣出', '倉庫快滿時，開倉庫賣掉設定的作物（含有機版）。關閉＝完全不自動賣。'),
      num('sellWhenFreeAtMost', '剩幾格空位就賣', '倉庫剩餘空位 ≤ 這個數就開始賣出（只賣設定的作物與它的有機版）。', 0, 1000, '格'),
      bool('sellWhenCantPlant', '沒錢買種子時先賣', '有空田、但金幣不夠買種子時，直接賣掉倉庫裡設定的作物換錢，不等倉庫快滿。'),
      num('sellRetryMs', '賣不出去的重試間隔', '賣不出東西（倉庫裡沒有設定的作物…）時，隔多久才再試一次。', 1000, 3600000, SECS),
      bool('sellWeedsWithCrops', '賣作物時一併賣雜草', '賣出設定的作物時，倉庫裡的雜草（1 金幣一個）也一起賣掉。雜草在倉庫裡沒有數量上限。'),
    ]],
    ['澆水與抓蟲', [
      bool('autoWater', '自動澆水', '還在長的作物（含枯萎的）自動澆水。只用雨水，雨水不夠就暫停，不會動用要花錢的自來水。'),
      num('waterBelow', '濕度低於幾級開始澆', '濕度 0～4 級（每澆一下 +1 級）。低於這個值就開始澆。', 0, 4, '級', 'num'),
      num('waterUpTo', '澆到幾級為止', '澆到這個濕度就停。留空＝澆到滿。不能小於「開始澆的濕度」。', 1, 4, '級', 'numOrNull'),
      bool('autoWaterTrees', '果樹也澆水', '果樹也澆雨水（會和作物搶水，預設關閉）。'),
      bool('autoCatchPests', '自動捉蟲', '作物、果樹長蟲時，用「照顧」工具的「捉蟲」（免費）點到抓光。絕不噴農藥、不用化肥（那會花錢，還會讓有機作物變一般作物）。'),
      bool('catchPestsOnOtherCrops', '其他作物與果樹長蟲也抓', '蟲會往旁邊擴散，所以其他種類的作物、果樹長蟲也一起抓（抓蟲免費，不影響收成與庫存）。'),
      bool('autoCatchRats', '點老鼠抓掉', '農場的倉庫、垃圾站跑進老鼠時（9 級起），點畫面上的老鼠抓掉（同一處點 3 下抓 1 隻，免費）。老鼠每隻每小時偷吃 1 個作物和 1 個飼料、或咬破垃圾袋；養貓、貓頭鷹也會自動抓。只能點目前顯示的島（全島輪流會切過去）。'),
      bool('autoChasePredators', '點天敵趕走', '黃鼠狼（偷蛋）、狐狸（咬傷家禽）、野狼（嚇到家畜）出現後只給 60 秒（有「警報」專長的狗在場 3 分鐘）就動手，腳本點牠 3 下趕走，免費。已經有狗在趕的不搶。全島輪流時，別座島出現天敵會立刻切過去。注意：遊戲畫面要有在更新才點得到，分頁在背景、最小化時不會動作。'),
      bool('autoGroomPets', '貓狗髒了就梳毛／洗澡', '貓、狗頭上出現「髒了」時，點牠、按小選單的「梳毛」（貓）／「洗澡」（狗），免費、好感度 +3，髒的標記就消失。同一天第一次點到牠也會順便打招呼（好感度 +2）。睡著的（晚上）點了沒反應，會等醒了再點。'),
      bool('autoFertilize', '長時間作物自動施有機肥', '還在長、生長時間夠長（見下一項）的作物，用「照顧」工具的「有機肥」施肥：每次種植 1 個、產量與生長速度各 +10%，作物仍是有機作物。只用倉庫現有的有機肥（來自堆肥桶），沒有就不施、不會去買；絕不用化肥。'),
      num('fertilizeMinMinutes', '生長時間至少幾分鐘才施肥', '有機肥數量有限（一台 Lv5 堆肥桶每小時約 3 個），留給生長時間長、單價高的作物。預設 180 分鐘（3 小時，水稻起）。肥料不夠分時，先給單次收成價值高的。', 1, 1440, '分鐘'),
      bool('fertilizeOtherCrops', '其他作物也施肥', '不是設定作物的其他作物，只要夠長也施有機肥。關閉＝只替設定的作物施肥。'),
    ]],
    ['動物與寵物', [
      bool('autoPickPoop', '撿糞便', '地上的動物糞便自動點掉，收進倉庫（倉庫沒空位就暫停）。'),
      bool('autoCollectAnimalProducts', '收動物產物', '蛋、奶、羊毛…自動收（點動物，倉庫放得下才收；遊戲會順便餵食）。'),
      bool('autoHarvestMeatAnimals', '肉用動物長大後出貨', '長大了的肉用動物自動出貨（點一下，肉進倉庫、動物就沒了）。遊戲規定長大後放 2 天牠會自己死掉；不會補買小動物。'),
      bool('autoFeedAnimals', '餓了的動物自動餵', '點一下餵食（成長階段、產物型成年後都要餵）。先用倉庫現有的飼料，不夠就不餵。'),
      bool('buyFeedWhenShort', '飼料不夠時補買', '倉庫飼料不夠時，在遊戲自己開著「飼料不夠時自動買」的前提下，用金幣照商店價補買。會花金幣。'),
      num('minCoinsAfterBuyFeed', '補買飼料後至少保留金幣', '補買飼料後金幣要還有這麼多，才會補買。', 0, 10000000, '金幣'),
      bool('autoBuyPetFood', '貓狗飼料自動補貨', '貓、狗自己從倉庫扣狗飼料／貓飼料，沒有就餓著。庫存不夠時到倉庫的「飼料商店」買 10 份。會花金幣；遊戲的確認視窗會核對後才按。'),
      num('petFoodLowPerPet', '補貨低水位（每隻幾份）', '狗（貓）飼料庫存低於「隻數 × 這個數」，或有餓著的就補貨。不能大於補貨目標。', 1, 100, '份/隻'),
      num('petFoodTargetPerPet', '補貨目標（每隻幾份）', '補貨補到每隻這麼多份（一次買 10 份、一次最多買 5 次）。不能小於低水位。', 1, 100, '份/隻'),
      num('minCoinsAfterBuyPetFood', '買寵物飼料後至少保留金幣', '買完金幣要還有這麼多才買。', 0, 10000000, '金幣'),
      num('petFoodRetryMs', '補貨失敗的重試間隔', '補貨沒成功（金幣不夠、倉庫沒空位…）時，隔多久才再試。', 1000, 3600000, SECS),
    ]],
    ['果樹、魚池、蜂箱、機器', [
      bool('autoHarvestTrees', '採果樹', '果樹結果了自動採收（倉庫放得下才收）。'),
      bool('autoHarvestFish', '收魚', '魚池裡長成的魚自動收成（倉庫放得下才收；不會補魚苗）。'),
      bool('autoFeedFish', '餵魚', '魚餓了就餵，只用倉庫現有的飼料，不夠就不餵、不自動買（預設關閉）。'),
      bool('autoCollectHoney', '收蜂蜜', '蜂箱裡存的蜂蜜自動收進倉庫（倉庫放得下才收；只點有蜂蜜的蜂箱）。'),
      bool('autoCollectMachines', '收機器成品', '機器做好的成品自動收進倉庫（倉庫放得下才收）。'),
      bool('autoCompost', '堆肥桶自動投料', '堆肥桶有空位、倉庫的便便（每批 4）與雜草（每批 2）夠一批就自動投料，一次投到放滿；可以有很多個堆肥桶、每座島都行。原料是免費的，做好的有機肥由上面的「收機器成品」收。和下面的「機器自動投料」無關。'),
      num('compostKeepRounds', '賣雜草時為堆肥保留幾輪', '倉庫賣雜草時，留下「把所有堆肥桶各放滿這麼多輪」要用的雜草（每批 2 株；一台 Lv5 堆肥桶放滿一輪要 10 株、三台就是 30 株）。0＝不保留、雜草全賣。便便本來就不賣（賣價 0），不需要保留。沒開堆肥或沒有堆肥桶時不保留。', 0, 10, '輪'),
      bool('autoLoadMachines', '其他機器自動投料', '其他機器空了自動投料，會消耗倉庫的材料（預設關閉）。只對下一項勾選的機器投；堆肥桶不在這裡，看上面的「堆肥桶自動投料」。'),
      { key: 'loadMachineIds', type: 'machines', label: '要自動投料的機器', desc: '只有勾選的機器才會被自動投料（堆肥桶另有開關，不在這裡）。玉米餅機會把很值錢的玉米變成便宜的飼料，所以預設沒勾。' },
      num('machineMaxStock', '成品庫存上限', '投料前，這種成品在倉庫的庫存已經 ≥ 這個數就不再投，避免成品把倉庫塞滿。有機肥也一樣：腳本只拿它施肥（見「長時間作物自動施有機肥」）、不賣，用不完庫存到這個數堆肥桶就先停。', 0, 10000, '個'),
    ]],
    ['地上雜物', [
      bool('autoStraighten', '扶正歪掉的裝飾', '被風吹歪的裝飾、倒下的柵欄自動扶正（免費、不佔倉庫）。'),
      bool('autoClearDebris', '撿碎石', '地上的碎石等垃圾自動撿掉（免費、不佔倉庫）。'),
      bool('autoClearWeeds', '拔雜草', '地上的雜草、草球自動拔掉，會收進倉庫。'),
      num('weedKeepFree', '拔雜草要保留的倉庫空位', '拔完倉庫至少要還剩這麼多空位才拔。雜草不值錢，不能擠掉作物、蛋、奶的位置。', 0, 1000, '格'),
    ]],
    ['機器人', [
      bool('autoSwapParts', '機器人自動換耗材', '耗材磨完的機器人，到它的充電樁面板替它換上（伐木、採礦、整地機器人遊戲規定要手動換）。有備品就免費換。'),
      bool('buyPartsWhenShort', '沒備品時自動買', '倉庫沒備品時，花金幣買 1 個再換上（照商店單價：鋸鏈 150、鑽頭 250、鏟刃 100、輪子 50…）。會花金幣。'),
      num('minCoinsAfterBuyParts', '買耗材後至少保留金幣', '買完金幣要還有這麼多才買。', 0, 10000000, '金幣'),
      num('partsRetryMs', '換耗材失敗的重試間隔', '沒換成（沒備品、金幣不夠、這座島沒有充電樁…）時，隔多久才再試。', 1000, 3600000, SECS),
    ]],
    ['多座島', [
      { key: 'islandMode', type: 'enum', options: [['all', '全島輪流'], ['current', '只做畫面上這座']], label: '島嶼模式', desc: '全島輪流＝腳本自己切島，處理有事做的島；只做畫面上這座＝不切島。Alt+Shift+F 可以暫時切換（不會存）。' },
      bool('returnHome', '做完回家島', '其他島做完後切回「家島」（按開始時看的那座，或你最後手動切到的那座）。'),
      num('maxStayMs', '一座島最長占用時間', '一座島連續占用超過這麼久、而別座也有事做，就讓出去輪下一座。', 5000, 3600000, SECS),
      num('stuckMs', '判定卡住的時間', '這座島有事做、卻這麼久都沒做成任何事，就先去別座。', 3000, 3600000, SECS),
      num('islandRetryMs', '白跑的島暫停時間', '切過去卻沒做成事的島，隔多久才再考慮（連續失敗會加倍，最久 5 分鐘）。', 1000, 3600000, SECS),
      num('islandHopMinMs', '兩次切島的最短間隔', '兩次切島之間至少隔多久，避免畫面來回跳。', 0, 600000, SECS),
      num('userSwitchHoldMs', '你手動切島後的暫停時間', '你自己點「農場 N」切島後，這段時間內腳本不會自己切走。', 0, 3600000, SECS),
      { key: 'skipIslands', type: 'islands', label: '不自動切過去的島', desc: '填島的編號（從 1 起算，用逗號隔開，例如 2, 3）。這些島不會被自動切過去；你自己看著那座時照常處理。' },
    ]],
    ['快速鍵', HOTKEY_NAMES.map(([key, name, what]) => ({ key, type: 'hotkey', label: name, desc: what })),
      '按該列的「改」，再按下新的組合鍵就套用並存起來（Esc 取消，10 秒沒按自動取消）。要有 Alt（可加 Shift），不能含 Ctrl 或 Win／Cmd，五個快速鍵不能重複。' +
      '如果某個組合鍵被別的瀏覽器套件占用，網頁收不到那個按鍵，就換一個。就算快速鍵失效，標籤旁的「⚙」按鈕也一定開得了這個視窗。'],
  ];
  const SETTING_DEFS = SCHEMA.flatMap(([group, items]) => items.map((d) => Object.assign({ group }, d)));
  const defOf = new Map(SETTING_DEFS.map((d) => [d.key, d]));
  const overrides = {}; // 參數名 → 值：只放「和預設不同」的（也是存進 localStorage 的內容）
  const cloneVal = (v) => JSON.parse(JSON.stringify(v));
  const sameVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // 驗證一個值：{ ok: true, value } 或 { ok: false, why }。不合就整項不收
  function coerceSetting(def, v) {
    const bad = (why) => ({ ok: false, why });
    const good = (value) => ({ ok: true, value });
    switch (def.type) {
      case 'bool':
        return typeof v === 'boolean' ? good(v) : bad('要是「開」或「關」');
      case 'int':
      case 'num':
      case 'numOrNull': {
        if (v === null && def.type === 'numOrNull') return good(null);
        if (typeof v !== 'number' || !Number.isFinite(v)) return bad('要是' + (def.type === 'int' ? '整數' : '數字'));
        if (def.type === 'int' && !Number.isInteger(v)) return bad('要是整數');
        if (v < def.min || v > def.max) return bad('要在 ' + def.min + ' ～ ' + def.max + ' 之間');
        return good(v);
      }
      case 'enum':
        return def.options.some((o) => o[0] === v) ? good(v) : bad('不是可選的項目');
      case 'islands': {
        if (!Array.isArray(v) || v.length > 20) return bad('要是島的編號清單（最多 20 個）');
        if (!v.every((n) => Number.isInteger(n) && n >= 1 && n <= 99)) return bad('島的編號要是 1 ～ 99 的整數');
        return good(Array.from(new Set(v)).sort((a, b) => a - b));
      }
      case 'machines': {
        if (!Array.isArray(v) || v.length > 40) return bad('要是機器代號的清單');
        if (!v.every((id) => typeof id === 'string' && /^[a-z0-9_]{1,40}$/.test(id))) return bad('機器代號只能是小寫英文、數字、底線');
        return good(Array.from(new Set(v)));
      }
      case 'hotkey': {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return bad('要是按鍵組合');
        const shapeOk =
          typeof v.code === 'string' &&
          /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/.test(v.code) &&
          typeof v.alt === 'boolean' &&
          typeof v.shift === 'boolean' &&
          typeof v.ctrl === 'boolean';
        if (!shapeOk) return bad('只能是字母、數字或 F1～F12 配上修飾鍵');
        if (!v.alt) return bad('要同時按住 Alt（單獨的字母或 Ctrl 組合會干擾打字與瀏覽器）');
        if (v.ctrl) return bad('不能含 Ctrl（Ctrl+Alt 在有些鍵盤上等於 AltGr，會打出字元）');
        return good({ code: v.code, alt: true, shift: v.shift, ctrl: false });
      }
      default:
        return bad('未知的參數型別');
    }
  }

  // 兩個參數之間的關係（單看一個值驗不出來的）。回傳不合的原因，合就回傳 ''
  function crossCheck(key, value) {
    if (HOTKEY_NAMES.some(([k]) => k === key)) {
      const other = HOTKEY_NAMES.find(([k]) => k !== key && sameVal(CONFIG[k], value));
      if (other) return '和「' + other[1] + '」的快速鍵重複';
    }
    if (key === 'petFoodTargetPerPet' && value < CONFIG.petFoodLowPerPet) return '補貨目標不能小於低水位（' + CONFIG.petFoodLowPerPet + '）';
    if (key === 'petFoodLowPerPet' && value > CONFIG.petFoodTargetPerPet) return '低水位不能大於補貨目標（' + CONFIG.petFoodTargetPerPet + '）';
    if (key === 'waterUpTo' && value !== null && value < CONFIG.waterBelow) return '不能小於「開始澆的濕度」（' + CONFIG.waterBelow + '）';
    if (key === 'waterBelow' && CONFIG.waterUpTo !== null && value > CONFIG.waterUpTo) return '不能大於「澆到幾級」（' + CONFIG.waterUpTo + '）';
    return '';
  }

  function readStored() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (typeof raw !== 'string' || !raw || raw.length > SETTINGS_MAX_CHARS) return null;
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
    } catch (_) {
      return null;
    }
  }

  // 回傳 true＝存成功；沒有任何要存的就把鍵清掉
  function writeStored() {
    try {
      if (Object.keys(overrides).length === 0) window.localStorage.removeItem(SETTINGS_KEY);
      else window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(overrides));
      return true;
    } catch (_) {
      return false;
    }
  }

  // 載入時把存下來的值套回 CONFIG；回傳套用了幾項
  function loadSettings() {
    const obj = readStored();
    if (!obj) return 0;
    let n = 0;
    for (const def of SETTING_DEFS) {
      if (!Object.prototype.hasOwnProperty.call(obj, def.key)) continue;
      const r = coerceSetting(def, obj[def.key]);
      if (!r.ok || sameVal(r.value, DEFAULTS[def.key])) continue;
      CONFIG[def.key] = cloneVal(r.value);
      overrides[def.key] = cloneVal(r.value);
      n += 1;
    }
    // 兩個參數之間的關係不合（例如被手動改壞的）：那一組都回到預設
    const resetKeys = (keys) => keys.forEach((k) => {
      CONFIG[k] = cloneVal(DEFAULTS[k]);
      delete overrides[k];
    });
    if (CONFIG.petFoodTargetPerPet < CONFIG.petFoodLowPerPet) resetKeys(['petFoodTargetPerPet', 'petFoodLowPerPet']);
    if (CONFIG.waterUpTo !== null && CONFIG.waterUpTo < CONFIG.waterBelow) resetKeys(['waterUpTo', 'waterBelow']);
    const dupKeys = HOTKEY_NAMES.some(([a], i) => HOTKEY_NAMES.some(([b], j) => j > i && sameVal(CONFIG[a], CONFIG[b])));
    if (dupKeys) resetKeys(HOTKEY_NAMES.map(([k]) => k)); // 存下來的快速鍵彼此重複：全部回預設
    return n;
  }

  function onSettingApplied(key) {
    if (key === 'tickMs' && enabled) {
      clearInterval(timer);
      timer = setInterval(onTick, CONFIG.tickMs); // 週期間隔改了：重新排計時器
    }
    if (key === 'islandMode') holdUntil = 0;
    syncSettingsPanel();
    renderBadge(false);
  }

  // 改一項設定：驗證 → 套用到 CONFIG（立刻生效）→ 存起來。回傳 { ok, why, saved }
  function applySetting(key, raw) {
    const def = defOf.get(key);
    if (!def) return { ok: false, why: '沒有這個參數' };
    const r = coerceSetting(def, raw);
    if (!r.ok) return r;
    const why = crossCheck(key, r.value);
    if (why) return { ok: false, why };
    CONFIG[key] = cloneVal(r.value);
    if (sameVal(r.value, DEFAULTS[key])) delete overrides[key];
    else overrides[key] = cloneVal(r.value);
    const saved = writeStored();
    onSettingApplied(key);
    return { ok: true, value: r.value, saved };
  }

  function resetSetting(key) {
    if (!defOf.has(key)) return { ok: false, why: '沒有這個參數' };
    // 恢復預設也不能造出「補貨目標 < 低水位」這種矛盾（要先把另一個也調好，或用「全部恢復預設」）
    const why = crossCheck(key, DEFAULTS[key]);
    if (why) return { ok: false, why };
    CONFIG[key] = cloneVal(DEFAULTS[key]);
    delete overrides[key];
    const saved = writeStored();
    onSettingApplied(key);
    return { ok: true, saved };
  }

  function resetAllSettings() {
    // 不只改過的：連 Alt+Shift+F 暫時切換的島嶼模式也一起回預設
    for (const def of SETTING_DEFS) CONFIG[def.key] = cloneVal(DEFAULTS[def.key]);
    for (const key of Object.keys(overrides)) delete overrides[key];
    const saved = writeStored();
    onSettingApplied('tickMs'); // 週期間隔回預設：執行中的計時器要重排
    onSettingApplied('islandMode');
    return { ok: true, saved };
  }

  // 畫面上怎麼顯示一個值（預設值提示、清單用）
  function fmtSetting(def, v) {
    if (def.type === 'bool') return v ? '開' : '關';
    if (def.type === 'enum') return (def.options.find((o) => o[0] === v) || [v, String(v)])[1];
    if (def.type === 'numOrNull') return v === null ? '澆到滿' : v + ' ' + def.unit;
    if (def.type === 'islands') return v.length ? v.join('、') : '（無）';
    if (def.type === 'machines') return v.length ? v.join('、') : '（無）';
    if (def.type === 'hotkey') return keyLabel(v);
    return v + (def.unit ? ' ' + def.unit : '');
  }

  // 設定視窗（腳本自己建的元素，只用 textContent 寫內容）
  let settingsPanel = null;
  const settingsRows = new Map(); // 參數名 → { def, row, input(s), msg, mark }
  let settingsNote = null; // 視窗上方的狀態文字

  function styleBtn(b, primary) {
    Object.assign(b.style, {
      padding: '3px 10px',
      font: 'inherit',
      cursor: 'pointer',
      border: 'none',
      borderRadius: '4px',
      color: '#fff',
      background: primary ? '#2e8b3d' : '#555',
    });
  }

  // 讓視窗上每個控制項、「已改過」標記都和 CONFIG 現在的值一致
  function syncSettingsPanel() {
    if (!settingsPanel) return;
    for (const [key, r] of settingsRows) {
      const v = CONFIG[key];
      const def = r.def;
      if (def.type === 'bool') r.input.checked = !!v;
      else if (def.type === 'hotkey') r.input.textContent = hotkeyCapture && hotkeyCapture.key === key ? '請按新的組合鍵（Esc 取消）…' : keyLabel(v);
      else if (def.type === 'enum') r.input.value = v;
      else if (def.type === 'islands') r.input.value = v.join(', ');
      else if (def.type === 'machines') for (const [id, cb] of r.boxes) cb.checked = v.includes(id);
      else r.input.value = v === null ? '' : String(v);
      const changed = Object.prototype.hasOwnProperty.call(overrides, key);
      r.mark.textContent = changed ? '已改過' : '';
      r.row.style.background = changed ? 'rgba(46, 139, 61, 0.18)' : 'transparent';
    }
  }

  function closeSettingsPanel() {
    if (!settingsPanel) return;
    cancelHotkeyCapture();
    settingsPanel.remove();
    settingsPanel = null;
    settingsRows.clear();
  }

  // ───── 錄快速鍵：按「改」之後，下一個真實的、不是單獨修飾鍵的按鍵組合就是新的快速鍵 ─────
  const MOD_CODES = new Set(['AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'CapsLock', 'NumLock']);

  function cancelHotkeyCapture() {
    if (!hotkeyCapture) return;
    clearTimeout(hotkeyCapture.timer);
    hotkeyCapture = null;
    syncSettingsPanel();
  }

  function startHotkeyCapture(key) {
    cancelHotkeyCapture();
    hotkeyCapture = { key, timer: setTimeout(cancelHotkeyCapture, 10000) }; // 10 秒沒按就自動取消
    const r = settingsRows.get(key);
    if (r) r.msg.textContent = '';
    syncSettingsPanel();
  }

  // 錄快速鍵期間，按鍵一律被這裡吃掉（不會觸發其他快速鍵）
  function captureHotkey(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (MOD_CODES.has(e.code)) return; // 只按了 Alt、Shift…：繼續等
    const key = hotkeyCapture.key;
    const row0 = settingsRows.get(key);
    cancelHotkeyCapture();
    if (e.code === 'Escape') return;
    if (e.metaKey) {
      if (row0) row0.msg.textContent = '不能含 Win／Cmd 鍵';
      return;
    }
    const r = applySetting(key, { code: e.code, alt: !!e.altKey, shift: !!e.shiftKey, ctrl: !!e.ctrlKey });
    if (row0) row0.msg.textContent = r.ok ? '' : r.why;
  }

  function toggleSettingsPanel() {
    if (settingsPanel) closeSettingsPanel();
    else openSettingsPanel();
  }

  function openSettingsPanel() {
    if (settingsPanel) return;
    const g = game();
    const box = document.createElement('div');
    box.id = SETTINGS_PANEL_ID;
    Object.assign(box.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      bottom: '8px',
      width: '460px',
      maxWidth: 'calc(100vw - 16px)',
      zIndex: '2147483647',
      display: 'flex',
      flexDirection: 'column',
      font: '13px/1.5 sans-serif',
      color: '#fff',
      background: 'rgba(20, 24, 32, 0.97)',
      borderRadius: '8px',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.6)',
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // 不讓遊戲也把它當成「關視窗」
        closeSettingsPanel();
      }
    });

    const head = document.createElement('div');
    Object.assign(head.style, { padding: '10px 12px 6px', borderBottom: '1px solid #444' });
    const title = document.createElement('div');
    title.textContent = 'SkyFarm 輔助設定　v' + VERSION;
    Object.assign(title.style, { fontWeight: '700', fontSize: '15px' });
    const intro = document.createElement('div');
    intro.textContent =
      '改了立刻生效，並存在這個瀏覽器（只存和預設不同的值，兩台電腦各自設定）。「開關」和「作物」不會記住。' +
      '標示「會花金幣」的項目都有金幣底線。按 Esc 或再按一次 ' + keyLabel(CONFIG.configKey) + ' 關閉；快速鍵可以在最下面「快速鍵」那組改。';
    Object.assign(intro.style, { fontSize: '12px', opacity: '0.8', margin: '2px 0' });
    settingsNote = document.createElement('div');
    Object.assign(settingsNote.style, { fontSize: '12px', color: '#ffd27a', minHeight: '16px' });
    head.append(title, intro, settingsNote);

    const body = document.createElement('div');
    Object.assign(body.style, { flex: '1', overflowY: 'auto', padding: '4px 12px' });

    for (const [group, items, note] of SCHEMA) {
      const h = document.createElement('div');
      h.textContent = group;
      Object.assign(h.style, { fontWeight: '700', margin: '12px 0 4px', paddingBottom: '2px', borderBottom: '1px solid #555', color: '#9fd3ff' });
      body.appendChild(h);
      if (note) {
        const n = document.createElement('div');
        n.textContent = note;
        Object.assign(n.style, { fontSize: '12px', opacity: '0.8', padding: '2px 4px 4px' });
        body.appendChild(n);
      }
      for (const def0 of items) body.appendChild(buildSettingRow(Object.assign({ group }, def0), g));
    }

    const foot = document.createElement('div');
    Object.assign(foot.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '8px 12px', borderTop: '1px solid #444' });
    const resetAll = document.createElement('button');
    resetAll.type = 'button';
    resetAll.textContent = '全部恢復預設';
    styleBtn(resetAll, false);
    let armed = false;
    resetAll.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        resetAll.textContent = '再按一次確認';
        return;
      }
      armed = false;
      resetAll.textContent = '全部恢復預設';
      const r = resetAllSettings();
      settingsNote.textContent = r.saved ? '已全部恢復預設' : '已恢復預設，但寫不進瀏覽器儲存空間（只在這次載入有效）';
    });
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '關閉';
    styleBtn(closeBtn, true);
    closeBtn.addEventListener('click', closeSettingsPanel);
    foot.append(resetAll, closeBtn);

    box.append(head, body, foot);
    document.body.appendChild(box);
    settingsPanel = box;
    syncSettingsPanel();
  }

  // 一個參數一列：名稱＋控制項＋「已改過」標記＋恢復預設，下面是說明、預設值與錯誤訊息
  function buildSettingRow(def, g) {
    const row = document.createElement('div');
    Object.assign(row.style, { padding: '5px 4px', borderRadius: '4px' });
    const top = document.createElement('div');
    Object.assign(top.style, { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' });
    const label = document.createElement('span');
    label.textContent = def.label;
    Object.assign(label.style, { fontWeight: '600', flex: '1 1 140px' });
    top.appendChild(label);

    const entry = { def, row, input: null, boxes: null, msg: null, mark: null };
    const msg = document.createElement('div');
    Object.assign(msg.style, { color: '#ff9a9a', fontSize: '12px', minHeight: '0' });
    entry.msg = msg;

    // 套用一個控制項的值：成功清掉錯誤訊息；失敗顯示原因並把控制項放回目前的值
    const commit = (raw) => {
      const r = applySetting(def.key, raw);
      msg.textContent = r.ok ? '' : r.why;
      if (!r.ok) syncSettingsPanel();
      if (settingsNote) settingsNote.textContent = r.ok && !r.saved ? '寫不進瀏覽器儲存空間，這項設定只在這次載入有效' : '';
    };
    const inputStyle = { font: 'inherit', color: '#000', background: '#fff', border: '1px solid #888', borderRadius: '4px', padding: '2px 6px' };

    if (def.type === 'bool') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', () => commit(!!cb.checked));
      entry.input = cb;
      top.appendChild(cb);
    } else if (def.type === 'enum') {
      const sel = document.createElement('select');
      Object.assign(sel.style, inputStyle);
      for (const [value, text] of def.options) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = text;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => commit(sel.value));
      entry.input = sel;
      top.appendChild(sel);
    } else if (def.type === 'islands') {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = 60;
      inp.placeholder = '例如 2, 3';
      Object.assign(inp.style, inputStyle, { width: '110px' });
      inp.addEventListener('change', () => {
        const parts = String(inp.value).split(/[,，、\s]+/).filter(Boolean);
        commit(parts.map((x) => Number(x)));
      });
      entry.input = inp;
      top.appendChild(inp);
    } else if (def.type === 'hotkey') {
      const txt = document.createElement('span');
      Object.assign(txt.style, { background: '#333', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' });
      const chg = document.createElement('button');
      chg.type = 'button';
      chg.textContent = '改';
      styleBtn(chg, false);
      chg.addEventListener('click', () => startHotkeyCapture(def.key));
      entry.input = txt;
      entry.change = chg;
      top.append(txt, chg);
    } else if (def.type === 'machines') {
      entry.boxes = new Map();
      const ids = new Set(CONFIG.loadMachineIds.concat(DEFAULTS.loadMachineIds));
      if (g && g.CFG && g.CFG.machines) for (const id of Object.keys(g.CFG.machines)) ids.add(id);
      const list = document.createElement('div');
      Object.assign(list.style, { width: '100%', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' });
      for (const id of ids) {
        if (!/^[a-z0-9_]{1,40}$/.test(id)) continue;
        if (id === 'compost_bin') continue; // 堆肥桶有自己的開關（autoCompost），不在這份名單裡
        const lab = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        const nm = g && g.CFG && g.CFG.machines && g.CFG.machines[id] && g.CFG.machines[id].name;
        const text = document.createElement('span');
        text.textContent = (nm ? nm + '（' + id + '）' : id);
        cb.addEventListener('change', () => {
          const picked = [];
          for (const [mid, box] of entry.boxes) if (box.checked) picked.push(mid);
          commit(picked);
        });
        lab.append(cb, text);
        entry.boxes.set(id, cb);
        list.appendChild(lab);
      }
      entry.input = list;
      top.appendChild(list);
    } else {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = String(def.min);
      inp.max = String(def.max);
      inp.step = def.type === 'int' ? '1' : '0.5';
      Object.assign(inp.style, inputStyle, { width: '92px' });
      inp.addEventListener('change', () => {
        const txt = String(inp.value).trim();
        if (txt === '') commit(def.type === 'numOrNull' ? null : NaN);
        else commit(Number(txt));
      });
      // 滑鼠移到數字欄位上、用滾輪捲動清單時，瀏覽器會在欄位有焦點時改數字；這裡的改動會立刻套用並存檔，所以滾輪一動就讓欄位失去焦點
      inp.addEventListener('wheel', () => {
        if (typeof inp.blur === 'function') inp.blur();
      });
      entry.input = inp;
      top.appendChild(inp);
      if (def.unit) {
        const u = document.createElement('span');
        u.textContent = def.unit;
        Object.assign(u.style, { fontSize: '12px', opacity: '0.7' });
        top.appendChild(u);
      }
    }

    const mark = document.createElement('span');
    Object.assign(mark.style, { fontSize: '11px', color: '#7be08d', minWidth: '40px' });
    entry.mark = mark;
    top.appendChild(mark);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = '↺';
    reset.title = '恢復預設（' + fmtSetting(def, DEFAULTS[def.key]) + '）';
    styleBtn(reset, false);
    reset.addEventListener('click', () => {
      const r = resetSetting(def.key);
      msg.textContent = r.ok ? '' : r.why;
    });
    top.appendChild(reset);
    entry.reset = reset;

    const desc = document.createElement('div');
    desc.textContent = def.desc + '　預設：' + fmtSetting(def, DEFAULTS[def.key]) + '。';
    Object.assign(desc.style, { fontSize: '12px', opacity: '0.72' });
    row.append(top, desc, msg);
    settingsRows.set(def.key, entry);
    return row;
  }

  // ───────────────────────── 組合鍵 ─────────────────────────

  // 在 window 的捕獲階段最先處理；只接受使用者真實按鍵，不接受頁面程式合成的事件
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted || e.repeat) return;
      if (hotkeyCapture) {
        captureHotkey(e); // 正在錄新的快速鍵：這個按鍵只給它
        return;
      }
      const isToggle = matchKey(e, CONFIG.toggleKey);
      const isCrop = matchKey(e, CONFIG.cropKey);
      const isProbe = matchKey(e, CONFIG.probeKey);
      const isIsland = matchKey(e, CONFIG.islandKey);
      const isConfig = matchKey(e, CONFIG.configKey);
      if (!isToggle && !isCrop && !isProbe && !isIsland && !isConfig) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isProbe) runProbe();
      else if (isConfig) toggleSettingsPanel();
      else if (panel) closePanel(); // 輸入框開著時，開關鍵與設定鍵都當作「取消」
      else if (isIsland) toggleIslandMode();
      else if (isCrop) openCropPanel(false);
      else requestToggle();
    },
    true
  );

  // ───────────────────────── 啟動 ─────────────────────────

  const restored = loadSettings(); // 讀回你在設定視窗改過的值（沒有就用預設）
  log('v' + VERSION + ' 已載入（預設 OFF）' + (restored ? '，套用了 ' + restored + ' 項自訂設定' : ''), stripUrl(location.href));

  if (document.body) initBadge();
  else document.addEventListener('DOMContentLoaded', initBadge, { once: true });
})();
