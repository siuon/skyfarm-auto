'use strict';
/*
 * 突變檢查：假遊戲與斷言都是我寫的，測試全綠不代表測得夠好。
 * 這裡把腳本的「關鍵安全判斷」逐一改壞（突變），每一個突變都必須讓單元測試變紅；
 * 沒有變紅的突變＝測試有漏洞（存活者），整個檢查會失敗。
 * 用法：npm run mutation        （約需 1～2 分鐘）
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'skyfarm-auto.js');
const src = fs.readFileSync(SCRIPT, 'utf8');

// [名稱, 要找的原文（必須剛好出現一次）, 改成什麼]
const MUTATIONS = [
  ['只接受真實按鍵（isTrusted）被拿掉', "if (!e.isTrusted || e.repeat) return;", 'if (e.repeat) return;'],
  ['只按批次賣出確認（.bs259）被放寬成任何 #ask47y', "'#ask47 .bs259 #ask47y'", "'#ask47y'"],
  ['地圖小選單開著時不再暫停', "setStatus('有選單開啟，暫停中');\n      return;", "setStatus('有選單開啟，暫停中');"],
  ['確認視窗開著時不再暫停', "\n    if (document.getElementById('ask47')) {", '\n    if (false) {'],
  ['其他視窗開著時不再暫停', 'if (isModalOpen()) {', 'if (false) {'],
  ['「農產倉庫滿了」視窗不再處理', "if (modalTitle() === '農產倉庫滿了') {", 'if (false) {'],
  ['全部隱藏（ui-hide）時不再暫停', "if (document.body && document.body.classList.contains('ui-hide')) {", 'if (false) {'],
  ['搬移物件（RT.mv）時不再暫停', 'if (g.RT && g.RT.mv) {', 'if (false) {'],
  ['錯誤時不再自動關閉', "log('發生錯誤，已自動關閉：', err);\n        setEnabled(false);", "log('發生錯誤，已自動關閉：', err);"],
  ['動物離家時不再補點擊記號', "if ((kind === 'product' || kind === 'feed' || kind === 'meat') && animalAway(g, k)) markAnimalTap(g, k);", '/* mutated */'],
  ['動物離家判斷永遠不成立', 'Math.hypot(ag.x - x, ag.y - y) > 0.5', 'Math.hypot(ag.x - x, ag.y - y) > 99'],
  ['補買飼料不再守金幣底線', 'coinsLeft - cost >= CONFIG.minCoinsAfterBuyFeed', 'true'],
  ['補買飼料不再看遊戲的自動買設定', 'S.settings && S.settings.autoBuyFeed && coinsLeft', 'coinsLeft'],
  ['肉用動物長大後也被當成餓了（會被點、被宰）', "if (A.type === 'meat') return false;", '/* mutated */'],
  ['賣出範圍放寬成全部（連蛋都賣）', "(id === targetCrop.id || id === 'org_' + targetCrop.id)", 'true'],
  ['每個週期的動作數上限被拿掉', 'if (done >= CONFIG.maxActionsPerTick) break;', ''],
  ['機器小選單改按「升級」', "'button[data-m61=\"' + want + '\"]'", "'button[data-m61=\"upgrade\"]'"],
  ['照顧工具不再確認是「捉蟲」', "if (sel.none49 || sel.care !== 'catch') {", 'if (sel.none49) {'],
  ['沒錢買種子時不再先賣作物', 'if (CONFIG.autoSell && CONFIG.sellWhenCantPlant && stock > 0) {', 'if (false) {'],
  ['收產物不再算倉庫空位', 'if (T.stack <= room) {', 'if (true) {'],
  ['收成不再算倉庫空位', 'if (need <= room) {', 'if (true) {'],
  ['果樹第一次結果與間隔對調', 'T.prog >= (T.first ? D.firstFruitSeconds : D.fruitIntervalSeconds)', 'T.prog >= (T.first ? D.fruitIntervalSeconds : D.firstFruitSeconds)'],
  ['餵食量成年與幼年對調', 'isAdultAnimal(T, A) ? A.cycleFeedQty : A.stageFeedQty', 'isAdultAnimal(T, A) ? A.stageFeedQty : A.cycleFeedQty'],
  ['輸入法組字中的 Enter 也當確認', 'if (e.isComposing || e.keyCode === 229) return;', ''],
  ['診斷的網址不再移除參數', 'return x.origin + x.pathname;', 'return x.href;'],
  ['退避不再變長', '1500 * Math.pow(2, fails)', '0'],
  ['扶正時不再確認工具是澆水', "if ((kind === 'tilt' || kind === 'fence') && S.sel.tool !== 'water') break;", ''],
  ['枯萎的作物也被當成成熟', 'if (!T || T.t !== \'soil\' || !T.crop || T.crop.wither) return false;', "if (!T || T.t !== 'soil' || !T.crop) return false;"],
  ['播種不再先選種子（none49 不清）', 'if (sel.none49 || sel.seed !== want) {', 'if (sel.seed !== want) {'],
  ['賣不出東西時不再暫停重試', 'sellBlockedUntil = Date.now() + CONFIG.sellRetryMs;', 'sellBlockedUntil = 0;'],
  ['關掉自動賣出後仍會賣', 'if (CONFIG.autoSell && (needSell || nearlyFull) && Date.now() >= sellBlockedUntil) {', 'if ((needSell || nearlyFull) && Date.now() >= sellBlockedUntil) {'],
  ['賣出前不再清掉玩家的勾選', 'if (clear) clear.click();', ''],
  ['賣出後不再關閉倉庫視窗', 'if (close) close.click();', ''],
  ['抓不掉的蟲會一直卡住那格', 'cdp.fails >= 3', 'cdp.fails >= 9999'],
  ['蜂箱：點之前不再確認有蜂蜜（點到空蜂箱會開出面板）', 'if (!CONFIG.autoCollectHoney || !isHive(T0, CFG) || honeyStored(T0) <= 0) continue;', 'if (!CONFIG.autoCollectHoney) continue;'],
  ['蜂蜜不再算倉庫空位', 'if (jars <= room) {', 'if (true) {'],
  ['任何設備都被當成蜂箱', "CFG.devices[T.id].kind === 'hive'", 'true'],
  ['肉用動物出貨：點之前不再確認真的長大了', "|| !A || A.type !== 'meat' || !isAdultAnimal(T0, A)) continue;", '|| !A) continue;'],
  ['肉用動物出貨不再算倉庫空位', "if (room >= 1) {\n              pickups.push([k, 'meat']);", "if (true) {\n              pickups.push([k, 'meat']);"],
  ['還沒長大的肉用動物也被當成出貨', "if (A.type === 'meat' && isAdultAnimal(T, A)) {", "if (A.type === 'meat') {"],
  ['其他作物收成不再保留空位', 'room - need >= CONFIG.otherCropsKeepFree', 'room - need >= 0'],
  ['其他作物不再看倉庫是不是滿了', 'canHarvest && room - need', 'room - need'],
  ['harvestOtherCrops 開關不再看', 'CONFIG.autoHarvest && CONFIG.harvestOtherCrops && isRipe(T, CFG)', 'CONFIG.autoHarvest && isRipe(T, CFG)'],
  ['魚池不再收成', 'pools.push([k, \'pool\', pk]);\n            room -= ps.harvestQty;', 'room -= ps.harvestQty;'],
  ['擴地模式時不再暫停（點擊會被遊戲吞掉）', 'if (isExpandMode()) {', 'if (false) {'],
  ["快速鍵：可以不含 Alt","if (!v.alt) return bad('要同時按住 Alt（單獨的字母或 Ctrl 組合會干擾打字與瀏覽器）');",""],
  ["快速鍵：可以含 Ctrl","if (v.ctrl) return bad('不能含 Ctrl（Ctrl+Alt 在有些鍵盤上等於 AltGr，會打出字元）');",""],
  ["快速鍵：按鍵代碼不再驗格式","/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/.test(v.code) &&","true &&"],
  ["快速鍵：兩個快速鍵可以重複","if (other) return '和「' + other[1] + '」的快速鍵重複';",""],
  ["快速鍵：載入時重複的不重設","if (dupKeys) resetKeys(HOTKEY_NAMES.map(([k]) => k));",""],
  ["快速鍵：錄快速鍵時單獨按修飾鍵就結束","if (MOD_CODES.has(e.code)) return; // 只按了 Alt、Shift…：繼續等",""],
  ["快速鍵：錄快速鍵時 Esc 不取消","if (e.code === 'Escape') return;",""],
  ["快速鍵：錄快速鍵時按鍵還是會觸發其他快速鍵","if (hotkeyCapture) {\n        captureHotkey(e); // 正在錄新的快速鍵：這個按鍵只給它\n        return;\n      }",""],
  ["快速鍵：錄快速鍵不會逾時取消","hotkeyCapture = { key, timer: setTimeout(cancelHotkeyCapture, 10000) };","hotkeyCapture = { key, timer: 0 };"],
  ["快速鍵：關視窗不取消錄快速鍵","    cancelHotkeyCapture();\n    settingsPanel.remove();","    settingsPanel.remove();"],
  ["快速鍵：Win／Cmd 組合不擋","if (e.metaKey) {","if (false) {"],
  ["齒輪：點了不開設定視窗","      toggleSettingsPanel();\n    });\n    document.body.appendChild(b);","    });\n    document.body.appendChild(b);"],
  ["齒輪：不跟著標籤的寬度","gearBtn.style.right = 8 + (badge.offsetWidth || 52) + 6 + 'px';","gearBtn.style.right = '68px';"],
  ["設定：恢復預設不檢查兩個參數的關係","    const why = crossCheck(key, DEFAULTS[key]);\n    if (why) return { ok: false, why };",""],
  ["設定：全部恢復預設不重排計時器","    onSettingApplied('tickMs'); // 週期間隔回預設：執行中的計時器要重排\n",""],
  ["設定：全部恢復預設只回復「改過的」（暫時切換的島嶼模式沒回去）","for (const def of SETTING_DEFS) CONFIG[def.key] = cloneVal(DEFAULTS[def.key]);","for (const key of Object.keys(overrides)) CONFIG[key] = cloneVal(DEFAULTS[key]);"],
  ["設定：滾輪不再讓數字欄位失去焦點","if (typeof inp.blur === 'function') inp.blur();",""],
  ["設定：數值不再驗範圍","if (v < def.min || v > def.max) return bad('要在 ' + def.min + ' ～ ' + def.max + ' 之間');",""],
  ["設定：整數欄位收小數","if (def.type === 'int' && !Number.isInteger(v)) return bad('要是整數');",""],
  ["設定：布林欄位不再驗型別","return typeof v === 'boolean' ? good(v) : bad('要是「開」或「關」');","return good(v);"],
  ["設定：可空的數字不收 null","if (v === null && def.type === 'numOrNull') return good(null);",""],
  ["設定：機器代號不再驗格式","typeof id === 'string' && /^[a-z0-9_]{1,40}$/.test(id)","true"],
  ["設定：載入時驗證不過也照套","if (!r.ok || sameVal(r.value, DEFAULTS[def.key])) continue;","if (sameVal(r.value, DEFAULTS[def.key])) continue;"],
  ["設定：存下來的內容大小不設限","raw.length > SETTINGS_MAX_CHARS","false"],
  ["設定：矛盾的兩個值載入時不重設","if (CONFIG.petFoodTargetPerPet < CONFIG.petFoodLowPerPet) resetKeys(","if (false) resetKeys("],
  ["設定：改回預設值還留在存檔裡","if (sameVal(r.value, DEFAULTS[key])) delete overrides[key];","if (false) delete overrides[key];"],
  ["設定：兩個參數的關係不再檢查","const why = crossCheck(key, r.value);\n    if (why) return { ok: false, why };",""],
  ["設定：全部回預設時不清掉存檔的鍵","if (Object.keys(overrides).length === 0) window.localStorage.removeItem(SETTINGS_KEY);","if (false) window.localStorage.removeItem(SETTINGS_KEY);"],
  ["設定：改週期間隔不重排計時器","if (key === 'tickMs' && enabled) {","if (false) {"],
  ["設定：設定視窗的快速鍵失效","else if (isConfig) toggleSettingsPanel();",""],
  ["設定：Esc 不再關視窗","if (e.key === 'Escape') {\n        e.stopPropagation(); // 不讓遊戲也把它當成「關視窗」","if (false) {\n        e.stopPropagation(); // 不讓遊戲也把它當成「關視窗」"],
  ["設定：全部恢復預設一按就做","if (!armed) {","if (false) {"],
  ["設定：切島嶼模式時視窗不同步","holdUntil = 0;\n    syncSettingsPanel();\n    setNote(","holdUntil = 0;\n    setNote("],
  ["寵物飼料：沒買成（金幣沒少）也算買成功","if (S.player.coins >= coinsBefore) {","if (false) {"],
  ["寵物飼料：不再守金幣底線","if (S.player.coins < j.price + CONFIG.minCoinsAfterBuyPetFood) {","if (false) {"],
  ["寵物飼料：autoBuyPetFood 開關不再看","if (CONFIG.autoBuyPetFood) {","if (true) {"],
  ["寵物飼料：一次買的次數上限被拿掉","const lots = Math.min(5, Math.max(1, Math.ceil((target - stock) / 10)));","const lots = Math.min(99, Math.max(1, Math.ceil((target - stock) / 10)));"],
  ["寵物飼料：不再看倉庫放不放得下","if (info.free !== null && info.free < 10) {","if (false) {"],
  ["寵物飼料：庫存夠、沒餓著也照買","if (stock >= low && !(hungry > 0 && stock === 0)) continue;","if (false) continue;"],
  ["寵物飼料：貓買成別的飼料","    ['cat', 'cat_food'],","    ['cat', 'corn_cake'],"],
  ["寵物飼料：補貨目標不乘隻數","const target = mine.length * CONFIG.petFoodTargetPerPet;","const target = CONFIG.petFoodTargetPerPet;"],
  ["寵物飼料：有買成還沒補夠也要等 60 秒","} else if (bought > 0) {","} else if (false) {"],
  ["寵物飼料：沒進展也不暫停重試","petFoodBlockedUntil = Date.now() + CONFIG.petFoodRetryMs;","petFoodBlockedUntil = 0;"],
  ["多座島：暫停過的時間也算成沒進展","if (lastTrackAt && now - lastTrackAt > TRACK_GAP_MS) {","if (false) {"],
  ["多座島：同一次卡住每個週期都記一次失敗","if (stuck && !stuckMarked) {","if (stuck) {"],
  ["多座島：標籤不再說明目前在哪座島", "if (islandHint && !dry) hints.push(islandHint);", "if (false) hints.push(islandHint);"],
  ["多座島：切島前不再確認工具是腳本用的", "if (!SCRIPT_TOOLS.includes(S.sel.tool) && !ensureToolIs(g, 'hand')) {", "if (false) {"],
  ["多座島：玩家手動切島後不再暫停自動切島", "if (now < holdUntil || now - lastHopAt < CONFIG.islandHopMinMs) return false;", "if (now - lastHopAt < CONFIG.islandHopMinMs) return false;"],
  ["多座島：偵測不到玩家手動切島", "if (S.cur !== expectedCur) {", "if (false) {"],
  ["多座島：卡住了也不讓出去", "if (!overstay && !stuck) return false;", "if (!overstay) return false;"],
  ["多座島：切過去沒做成事的島不暫停", "if (lastActionAt <= arrivalAction) backoffIsland(cur);", "if (false) backoffIsland(cur);"],
  ["多座島：卡住的島不暫停","        stuckMarked = true; // 同一次卡住只記一次失敗（不然沒地方可去時每個週期都加一次，退避時間會無限拉長）\n        backoffIsland(cur);","        stuckMarked = true; // 同一次卡住只記一次失敗（不然沒地方可去時每個週期都加一次，退避時間會無限拉長）"],
  ["多座島：冷卻與澆水記錄的鍵不帶島編號", "const ck = (k) => mi + '|' + k;", "const ck = (k) => k;"],
  ["多座島：乾跑會改澆水記錄", "if (!dry) wetting.add(ck(k));", "wetting.add(ck(k));"],
  ["多座島：乾跑變成真跑（會去點別座島的格子）", "if (dry) return { work: Object.values(work).some(Boolean), needSell: wantSell };", "if (false) return { work: true };"],
  ["多座島：別座島的「要先賣出」不套用到全域", "if (plans[mi].needSell && CONFIG.autoSell) needSell = true;", "if (false) needSell = true;"],
  ["多座島：skipIslands 不再略過", "if (CONFIG.skipIslands.includes(mi + 1) || !islandReady(mi)) continue;", "if (!islandReady(mi)) continue;"],
  ["多座島：做完不回家島", "if (target === null && CONFIG.returnHome && homeIsland !== null && cur !== homeIsland && homeIsland < S.maps.length) {", "if (false) {"],
  ["多座島：切不過去不暫停那座島", "if (S.cur !== mi) {\n      backoffIsland(mi);", "if (S.cur !== mi) {\n      /* mutated */"],
  ["多座島：islandMode 不再看", "const multi = CONFIG.islandMode === 'all' && n > 1;", "const multi = n > 1;"],
  ["多座島：換耗材不看這座島有沒有那種充電樁", "const here = bases.filter((b) => baseOnIsland(g, g.S.cur, b));", "const here = bases;"],
  ["多座島：別座島要換耗材不算有事做", "work = partNeeds(g).some((nd) => !(partsBlocked.get(nd.base) > now) && baseOnIsland(g, mi, nd.base));", "work = false;"],
  ['擴地模式偵測壞掉（認不出狀態列的標籤）', "String(el.textContent || '').includes('擴地模式')", "String(el.textContent || '').includes('不存在的字')"],
  ["購買確認視窗：不再核對買的東西","else if (!expect.titles.filter(Boolean).includes(title)) why =","else if (false) why ="],
  ["購買確認視窗：不再核對價格","else if (price !== expect.price) why =","else if (false) why ="],
  ["購買確認視窗：不再守金幣底線","else if (g.S.player.coins - price < expect.floor) why =","else if (false) why ="],
  ['購買確認視窗：「以後不再詢問」被勾也照按', 'else if (noAsk && noAsk.checked) why =', 'else if (false) why ='],
  ['購買確認視窗：賣出確認視窗也當成購買確認去按', "if (document.querySelector('#ask47 .bs259')) why =", 'if (false) why ='],
  ['一次買耗材的數量上限被拿掉', 'if (step.buy && buys >= 4) {', 'if (step.buy && buys >= 99) {'],
  ['換耗材：不再核對面板標的價格', 'if (!m || Number(m[1].replace(/,/g, \'\')) !== parts[e.part].price) {', 'if (!m) {'],
  ['買耗材不再守金幣底線', 'const need = parts[id].price + CONFIG.minCoinsAfterBuyParts;', 'const need = parts[id].price;'],
  ['buyPartsWhenShort 開關不再看', 'if (CONFIG.buyPartsWhenShort && coins >= need) return true;', 'if (coins >= need) return true;'],
  ['面板按鈕和機器人對不上也照點', 'if (btns.length && order.length === btns.length) {', 'if (btns.length) {'],
  ['關掉的機器人也被換（面板按鈕）', 'if (!e || e.unit.on === false || !parts[e.part]) continue;', 'if (!e || !parts[e.part]) continue;'],
  ['關掉的機器人也被當成等耗材', 'if (!u || !(u.tier >= 0) || !u.needPart || u.on === false) continue;', 'if (!u || !(u.tier >= 0) || !u.needPart) continue;'],
  ['換耗材前不再切到收成工具', "if (!ensureToolIs(g, 'hand')) {\n          setStatus('切換工具中（換耗材）…');", "if (false) {\n          setStatus('切換工具中（換耗材）…');"],
  ["換完耗材不再關掉面板","if (opened && isModalOpen() && close) {\n        close.click();\n        await sleep(150);\n      }\n      const left = partNeeds(g)","if (false) {\n        close.click();\n        await sleep(150);\n      }\n      const left = partNeeds(g)"],
  ["補完寵物飼料不再關掉倉庫視窗","if (opened && isModalOpen() && close) {\n        close.click();\n        await sleep(150);\n      }\n      if (bought > 0) {","if (false) {\n        close.click();\n        await sleep(150);\n      }\n      if (bought > 0) {"],
  ['換不成功不再暫停重試', 'partsBlocked.set(base, Date.now() + CONFIG.partsRetryMs);', 'partsBlocked.set(base, 0);'],
  ['倉庫已有備品還去買（其他機器人）', 'if (n.base !== base || n.manual || (S.inv[partItemId(n.part)] || 0) > 0) continue;', 'if (n.base !== base || n.manual) continue;'],
  ['autoSwapParts 開關不再看', 'if (CONFIG.autoSwapParts) {\n      const job = nextPartsJob(g);', 'if (true) {\n      const job = nextPartsJob(g);'],
  ['雜草不再保留空位', 'if (room - n >= CONFIG.weedKeepFree) {\n        cleanups.push([k, kind]);', 'if (true) {\n        cleanups.push([k, kind]);'],
  ['賣出時不再一併賣雜草', 'if (!isSellTarget(tr.dataset.bs259) && !isSellWeed(tr.dataset.bs259)) continue;', 'if (!isSellTarget(tr.dataset.bs259)) continue;'],
  ['賣雜草的範圍放寬成任何物品（連蛋都賣）', "CONFIG.sellWeedsWithCrops && id === 'weed'", 'CONFIG.sellWeedsWithCrops && true'],
  ['sellWeedsWithCrops 開關不再看', "CONFIG.sellWeedsWithCrops && id === 'weed'", "id === 'weed'"],
  ['標籤點一下又變成整個消失', 'collapsed = !collapsed;\n      renderBadge(false);', "el.style.display = 'none';"],
  ['有訊息時不再自動展開小方格', 'if (show) collapsed = false;', ''],
  ['暫停時小方格不再變琥珀色、也不寫暫停', 'const paused = enabled && isPausedStatus();', 'const paused = false;'],
  ['開關會把小方格展開', "log('自動功能', on ? 'ON' : 'OFF');\n    renderBadge(false);", "log('自動功能', on ? 'ON' : 'OFF');\n    renderBadge(true);"],
];

const countOf = (text, find) => text.split(find).length - 1;
const survivors = [];
const errors = [];
const t0 = Date.now();

for (const [i, [name, find, replace]] of MUTATIONS.entries()) {
  const n = countOf(src, find);
  if (n !== 1) {
    errors.push(name + '：要找的原文出現 ' + n + ' 次（必須剛好 1 次），腳本改過的話請更新這份清單');
    continue;
  }
  const file = path.join(os.tmpdir(), 'skyfarm-mutant-' + process.pid + '-' + i + '.js');
  fs.writeFileSync(file, src.replace(find, () => replace));
  const r = spawnSync(process.execPath, ['--test', '--test-timeout=20000', 'test/unit/*.test.js'], {
    cwd: ROOT,
    env: { ...process.env, SKYFARM_SCRIPT: file },
    encoding: 'utf8',
    timeout: 120000,
  });
  fs.rmSync(file, { force: true });
  const killed = r.status !== 0;
  console.log((killed ? '  已抓到  ' : '  存活！  ') + String(i + 1).padStart(2) + '. ' + name);
  if (!killed) survivors.push(name);
}

console.log('\n突變 ' + MUTATIONS.length + ' 個，抓到 ' + (MUTATIONS.length - survivors.length - errors.length) + ' 個，存活 ' + survivors.length + ' 個，原文對不上 ' + errors.length + ' 個（' + Math.round((Date.now() - t0) / 1000) + ' 秒）');
if (errors.length) console.error('原文對不上：\n  ' + errors.join('\n  '));
if (survivors.length) console.error('測試有漏洞（這些突變沒有讓任何測試變紅）：\n  ' + survivors.join('\n  '));
process.exit(survivors.length || errors.length ? 1 : 0);
