'use strict';
// 假時鐘：測試裡的 Date.now()、setTimeout、setInterval 都由它控制，退避、重試間隔、等待逾時不必真的等。
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

class Clock {
  constructor(start = Date.UTC(2026, 10, 14, 12, 0, 0)) {
    this.now = start;
    this.timers = [];
    this.seq = 1;
  }
  setTimeout(fn, ms = 0) {
    const t = { id: this.seq++, due: this.now + Math.max(0, ms), fn, every: 0 };
    this.timers.push(t);
    return t.id;
  }
  setInterval(fn, ms = 0) {
    const t = { id: this.seq++, due: this.now + Math.max(1, ms), fn, every: Math.max(1, ms) };
    this.timers.push(t);
    return t.id;
  }
  clear(id) {
    this.timers = this.timers.filter((t) => t.id !== id);
  }
  // 往前走 ms 毫秒：依序觸發到期的計時器，每次觸發後讓 Promise 都跑完
  async advance(ms) {
    const target = this.now + ms;
    await flush();
    for (let guard = 0; guard < 100000; guard++) {
      const due = this.timers.filter((t) => t.due <= target).sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!due) break;
      this.now = Math.max(this.now, due.due);
      if (due.every) due.due += due.every;
      else this.timers = this.timers.filter((t) => t !== due);
      due.fn();
      await flush();
    }
    this.now = target;
    await flush();
  }
  get pending() {
    return this.timers.length;
  }
  // 提供給 vm 沙盒的全域函式
  globals() {
    const clock = this;
    class FakeDate extends Date {
      constructor(...a) {
        if (a.length === 0) super(clock.now);
        else super(...a);
      }
      static now() {
        return clock.now;
      }
    }
    return {
      Date: FakeDate,
      setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
      clearTimeout: (id) => clock.clear(id),
      setInterval: (fn, ms) => clock.setInterval(fn, ms),
      clearInterval: (id) => clock.clear(id),
      performance: { now: () => clock.now - clock.origin },
    };
  }
}

Clock.prototype.origin = 0;
module.exports = { Clock, flush };
