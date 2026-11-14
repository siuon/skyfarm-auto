'use strict';
/*
 * 修改前先跑這支：比對「官方遊戲目前的版號」和「測試對應的版號」（test/GAME_VERSION.json）。
 *   結束碼 0：一致，可以放心修改。
 *   結束碼 1：官方遊戲更新了！請先照 README 的流程調整測試，再做新需求。
 *   結束碼 2：連不上官方網站（只警告，不當成不一致）。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RECORD = path.join(ROOT, 'test', 'GAME_VERSION.json');
const LIVE_URL = 'https://phoenixruby.github.io/skyfarm/version.json';

async function main() {
  const recorded = JSON.parse(fs.readFileSync(RECORD, 'utf8'));
  let live;
  try {
    const res = await fetch(LIVE_URL, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    live = await res.json();
  } catch (e) {
    console.warn('[check-version] 警告：連不上官方網站（' + e.message + '），無法確認遊戲是否更新。');
    console.warn('[check-version] 測試對應的版號是 ' + recorded.version + '。');
    return 2;
  }
  if (live.version === recorded.version) {
    console.log('[check-version] OK：官方遊戲版號 ' + live.version + ' 與測試對應的版號一致。');
    return 0;
  }
  console.error('[check-version] 遊戲已更新：官方 ' + live.version + '（config ' + live.configVersion + '），測試對應 ' + recorded.version + '（config ' + recorded.configVersion + '）。');
  console.error('[check-version] 請先調整測試，再做新需求：');
  console.error('  1. npm run test:contract   （對最新版官方檔案跑契約測試，看哪裡不符）');
  console.error('  2. 依失敗項目修正 test/ 內的假遊戲、假 DOM 與契約清單（必要時再修腳本）');
  console.error('  3. npm run record-version  （契約測試全過後才會更新 test/GAME_VERSION.json）');
  return 1;
}

main().then((code) => process.exit(code));
