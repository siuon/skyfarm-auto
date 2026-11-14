'use strict';
// 常用的測試起手式：載入腳本 + 掛上假遊戲 + 設定作物 +（選擇性）開啟自動功能。
const { load } = require('./harness');
const { attachWorld } = require('./fake-game');

/**
 * @param {object} o  假遊戲的參數（tiles、inv、coins、water、cap、sel、agents、edgeFence…）
 * @param {object} [cfg]  { crop: 設定作物（預設小麥）, enable: 是否開啟（預設 true）, flags: 覆寫 CONFIG, loadOpts }
 */
function boot(o = {}, cfg = {}) {
  const env = load(cfg.loadOpts || {});
  const world = attachWorld(env, o);
  const t = env.t;
  if (cfg.crop !== null) {
    const id = cfg.crop || 'wheat';
    t.targetCrop = { id, name: world.CFG.crops[id].name };
  }
  if (cfg.flags) Object.assign(t.CONFIG, cfg.flags);
  if (cfg.enable !== false) {
    t.setEnabled(true);
    // 預設只手動跑週期（await t.tick()），讓每個測試精準控制「第幾個週期發生什麼」；
    // 要測計時器本身時傳 { timer: true }。
    if (!cfg.timer) env.clock.clear(t.timer);
  }
  return { env, world, t, doc: env.doc, clock: env.clock };
}

// 一個田格的簡寫
const soil = (extra = {}) => Object.assign({ t: 'soil', m: 3, dry: 0, crop: null }, extra);
const crop = (id = 'wheat', prog = 0, extra = {}) => Object.assign({ id, prog, pest: false }, extra);
const ripe = (id = 'wheat', cfg) => crop(id, (cfg || require('./fixture-config').makeCfg()).crops[id].growSeconds);

// 跑一個週期，然後讓時鐘走過成功冷卻（300 毫秒）。
// 賣出流程裡有 await sleep()／waitFor()，要靠假時鐘往前走才會繼續，所以週期進行中每 100 毫秒推一次時鐘。
async function step(ctx, ms = 500) {
  let done = false;
  const p = ctx.t.tick().finally(() => { done = true; });
  for (let i = 0; i < 400 && !done; i++) await ctx.clock.advance(100);
  if (!done) throw new Error('一個週期跑超過 40 秒（假時間）還沒結束：腳本可能卡住了');
  await p;
  await ctx.clock.advance(ms);
}

module.exports = { boot, soil, crop, ripe, step };
