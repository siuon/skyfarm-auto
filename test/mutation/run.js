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
  ['確認視窗開著時不再暫停', "if (document.getElementById('ask47')) {", 'if (false) {'],
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
  ['雜草不再保留空位', 'room - n >= CONFIG.weedKeepFree && weedStock + n <= CONFIG.weedMaxStock', 'weedStock + n <= CONFIG.weedMaxStock'],
  ['雜草庫存不再設上限', 'room - n >= CONFIG.weedKeepFree && weedStock + n <= CONFIG.weedMaxStock', 'room - n >= CONFIG.weedKeepFree'],
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
