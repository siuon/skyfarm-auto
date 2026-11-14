'use strict';
/*
 * 下載官方遊戲的公開檔案（唯讀），供「契約測試」對照用：
 *   version.json、game-config.json、index.html  →  .cache/game/
 *
 * 資安與授權：
 *   - 只允許從官方網址（下面的 BASE）下載，且只當成文字／JSON 讀取，絕不執行。
 *   - 存放在 .cache/（已加入 .gitignore），不進版控：這些檔案不是本專案的。
 *   - 只用 GET，不送出任何本機資料，也不開啟遊戲、不碰任何存檔。
 */
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://phoenixruby.github.io/skyfarm/';
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'game');
const FILES = [
  { url: BASE + 'version.json', name: 'version.json', json: true },
  { url: BASE + 'game-config.json', name: 'game-config.json', json: true },
  { url: BASE, name: 'index.html', json: false },
];

async function get(url) {
  if (!url.startsWith(BASE)) throw new Error('只允許從官方網址下載：' + url);
  const res = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'error' });
  if (!res.ok) throw new Error('下載失敗 ' + res.status + '：' + url);
  return res.text();
}

async function fetchGame(dir = CACHE_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of FILES) {
    const text = await get(f.url);
    if (f.json) JSON.parse(text); // 確認真的是 JSON，才寫進去
    else if (!text.includes('<title>浮島農場')) throw new Error('index.html 看起來不是遊戲頁面');
    fs.writeFileSync(path.join(dir, f.name), text);
  }
  const version = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
  fs.writeFileSync(
    path.join(dir, 'fetched.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), version: version.version, configVersion: version.configVersion }, null, 2)
  );
  return version;
}

module.exports = { fetchGame, CACHE_DIR, BASE };

if (require.main === module) {
  fetchGame().then(
    (v) => console.log('已下載官方遊戲檔案到 .cache/game/，版號 ' + v.version + '（configVersion ' + v.configVersion + '）'),
    (e) => {
      console.error('下載官方遊戲檔案失敗：' + e.message);
      process.exit(1);
    }
  );
}
