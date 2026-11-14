'use strict';
/*
 * 記下「測試對應的官方版號」。流程：
 *   1. 下載最新版官方檔案到 .cache/game/
 *   2. 對它跑契約測試；沒有全部通過就不更新（避免在沒驗證的情況下宣稱對應新版）
 *   3. 通過才寫入 test/GAME_VERSION.json
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fetchGame, CACHE_DIR } = require('./fetch-game');

const ROOT = path.join(__dirname, '..');
const RECORD = path.join(ROOT, 'test', 'GAME_VERSION.json');

async function main() {
  const v = await fetchGame();
  console.log('官方遊戲版號：' + v.version + '，開始跑契約測試…');
  const r = spawnSync(process.execPath, ['--test', 'test/contract/*.test.js'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('契約測試沒有全部通過，不更新 test/GAME_VERSION.json。請先修好測試。');
    return 1;
  }
  const prev = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : null;
  const next = {
    version: v.version,
    configVersion: v.configVersion,
    recordedAt: new Date().toISOString().slice(0, 10),
    note: '契約測試（test/contract）在這個版號的官方檔案上全部通過；單元測試（test/unit）的假遊戲依此版本的行為撰寫。',
    previous: prev ? { version: prev.version, configVersion: prev.configVersion } : null,
  };
  fs.writeFileSync(RECORD, JSON.stringify(next, null, 2) + '\n');
  console.log('已記下對應的官方版號：' + next.version + '（config ' + next.configVersion + '）');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error('失敗：' + e.message + '（快取位置 ' + CACHE_DIR + '）');
    process.exit(1);
  }
);
