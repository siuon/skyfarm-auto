'use strict';
/*
 * 發佈一致性：載入器釘住的「commit＋SHA-256」必須真的對得上，版本號要一致。
 * 注意：不要求釘住的 commit 就是最新的（發佈是兩個 commit：先推主程式、再更新載入器，中間一定有落差）；
 * 只要求「釘住的那個 commit 裡的檔案」與載入器宣稱的雜湊、版本完全相符。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const hasGit = fs.existsSync(path.join(ROOT, '.git')) && git('--version').status === 0;

const header = (text) => {
  const m = /==UserScript==([\s\S]*?)==\/UserScript==/.exec(text);
  assert.ok(m, '載入器缺少 ==UserScript== 標頭');
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = /^\/\/\s*@(\S+)\s+(.*)$/.exec(line.trim());
    if (mm) (out[mm[1]] = out[mm[1]] || []).push(mm[2].trim());
    else if (/^\/\/\s*@(\S+)\s*$/.test(line.trim())) (out[/@(\S+)/.exec(line)[1]] = out[/@(\S+)/.exec(line)[1]] || []).push('');
  }
  return out;
};
const scriptVersion = (text) => /const VERSION = '([^']+)'/.exec(text)[1];
const GAME_MATCH = 'https://phoenixruby.github.io/skyfarm/*';

const gh = header(read('skyfarm-auto.loader.github.user.js'));

test('GitHub 版載入器：標頭欄位正確（只在遊戲網站、不用 GM 權限、文件開始時執行）', () => {
  assert.deepEqual(gh.match, [GAME_MATCH]);
  assert.deepEqual(gh.grant, ['none']);
  assert.deepEqual(gh['run-at'], ['document-start']);
  assert.ok('noframes' in gh);
  assert.equal(gh.require.length, 1, '只載入一支腳本');
  assert.ok(!/[<>]/.test(gh.require[0]), '範本的 <占位符> 都要填好');
});

test('GitHub 版載入器：@require 是「固定 commit 的 raw 網址＋SHA-256」，不是會變動的分支', () => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/siuon\/skyfarm-auto\/([0-9a-f]{40})\/skyfarm-auto\.js#sha256=([0-9a-f]{64})$/.exec(gh.require[0]);
  assert.ok(m, '@require 格式不對（必須鎖完整 40 字元 commit，並附 64 字元 sha256）：' + gh.require[0]);
});

test('釘住的 commit 存在、裡面的 skyfarm-auto.js 雜湊與載入器宣稱的完全一致', { skip: !hasGit && '沒有 git 倉庫' }, () => {
  const [, commit, want] = /\/([0-9a-f]{40})\/skyfarm-auto\.js#sha256=([0-9a-f]{64})/.exec(gh.require[0]);
  assert.equal(git('cat-file', '-e', commit + '^{commit}').status, 0, '釘住的 commit 不存在：' + commit);
  const blob = spawnSync('git', ['show', commit + ':skyfarm-auto.js'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(blob.status, 0);
  const got = crypto.createHash('sha256').update(blob.stdout).digest('hex');
  assert.equal(got, want, '雜湊對不上：載入器宣稱 ' + want + '，commit 裡的檔案是 ' + got);
  assert.ok(!blob.stdout.includes(0x0d), '檔案不能有 CRLF（SHA-256 校驗是對 GitHub 上的原始檔算的，要一律 LF）');
});

test('載入器版本號 = 釘住的 commit 裡的腳本版本號', { skip: !hasGit && '沒有 git 倉庫' }, () => {
  const [, commit] = /\/([0-9a-f]{40})\/skyfarm-auto\.js/.exec(gh.require[0]);
  const pinned = git('show', commit + ':skyfarm-auto.js').stdout;
  assert.deepEqual(gh.version, [scriptVersion(pinned)], '載入器 @version 要等於它釘住的腳本版本');
});

test('釘住的 commit 是目前 HEAD 的祖先（不會指到被丟掉的分支）', { skip: !hasGit && '沒有 git 倉庫' }, () => {
  const [, commit] = /\/([0-9a-f]{40})\/skyfarm-auto\.js/.exec(gh.require[0]);
  const head = git('rev-parse', 'HEAD');
  if (head.status !== 0) return; // 還沒有任何 commit
  assert.equal(git('merge-base', '--is-ancestor', commit, 'HEAD').status, 0);
});

test('目前工作目錄的腳本版本號不低於載入器釘住的版本', () => {
  const cur = scriptVersion(read('skyfarm-auto.js')).split('.').map(Number);
  const pin = gh.version[0].split('.').map(Number);
  const cmp = cur[0] - pin[0] || cur[1] - pin[1] || cur[2] - pin[2];
  assert.ok(cmp >= 0, '腳本版本 ' + cur.join('.') + ' < 載入器 ' + pin.join('.'));
});

test('腳本檔頭說明的版本與 VERSION 常數一致', () => {
  const text = read('skyfarm-auto.js');
  const v = scriptVersion(text);
  assert.match(text, new RegExp('功能（' + v.replace(/\./g, '\\.') + '）'));
});

test('本機載入器（若存在）：只在遊戲網站、用 file:/// 載入同一支腳本、版本與腳本一致', () => {
  const p = path.join(ROOT, 'skyfarm-auto.loader.user.js');
  if (!fs.existsSync(p)) return; // 本機專用檔案，沒有就算了（它不進版控）
  const h = header(fs.readFileSync(p, 'utf8'));
  assert.deepEqual(h.match, [GAME_MATCH]);
  assert.deepEqual(h.grant, ['none']);
  assert.equal(h.require.length, 1);
  assert.match(h.require[0], /^file:\/\/\/.*skyfarm-auto\.js$/);
  assert.deepEqual(h.version, [scriptVersion(read('skyfarm-auto.js'))], '本機載入器的版本要等於目前腳本版本');
});

test('換行：*.js 一律 LF（雜湊穩定）、hook 也是 LF（CRLF 會讓 shebang 失效）', () => {
  const ga = read('.gitattributes');
  assert.match(ga, /^\*\.js\s+text\s+eol=lf/m);
  assert.match(ga, /^tools\/hooks\/\*\s+text\s+eol=lf/m);
  assert.ok(!fs.readFileSync(path.join(ROOT, 'skyfarm-auto.js')).includes(0x0d), 'skyfarm-auto.js 不能有 CRLF');
  assert.ok(!fs.readFileSync(path.join(ROOT, 'tools', 'hooks', 'pre-commit')).includes(0x0d), 'pre-commit 不能有 CRLF');
});

test('對應的官方版號有記錄，格式正確，且有說明是在什麼條件下記下的', () => {
  const g = JSON.parse(read('test/GAME_VERSION.json'));
  assert.match(g.version, /^\d+\.\d+(-[0-9a-f]+)?$/);
  assert.match(g.configVersion, /^\d+\.\d+$/);
  assert.ok(g.version.startsWith(g.configVersion), 'version 以 configVersion 開頭：' + g.version);
  assert.match(g.recordedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(g.note && g.note.length > 10);
});

test('不可進版控的東西沒有被追蹤：官方遊戲快取、本機載入器', { skip: !hasGit && '沒有 git 倉庫' }, () => {
  const tracked = git('ls-files').stdout.split('\n');
  assert.ok(!tracked.some((f) => f.startsWith('.cache/')), '官方遊戲檔案不是本專案的，不能進版控');
  assert.ok(!tracked.includes('skyfarm-auto.loader.user.js'), '本機載入器不進版控');
  assert.ok(!tracked.some((f) => f.startsWith('node_modules/')));
});

test('commit 前驗證的 hook 存在，且會跑單元測試與版號檢查', () => {
  const hook = read('tools/hooks/pre-commit');
  assert.match(hook, /^#!\/bin\/sh/);
  assert.match(hook, /node --test/);
  assert.match(hook, /check-game-version/);
});
