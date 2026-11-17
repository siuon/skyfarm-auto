'use strict';
/*
 * 極簡假 DOM。腳本對遊戲畫面的依賴只有固定的幾個 id 與選擇器，
 * 所以這裡不實作通用選擇器引擎，而是讓測試「登記」某個選擇器字串對應到哪個元素：
 *   doc.q('#modalBody tr[data-bs259]', [...])    // querySelectorAll
 *   doc.q1('#bsbar259 [data-bsgo259]', el)       // querySelector
 * 腳本用到的選擇器字串一旦改變，登記不到、測試就會失敗，等於把「對遊戲介面的依賴」釘死在測試裡
 * （契約測試再確認這些字串在官方遊戲裡真的存在）。
 */
class ClassList {
  constructor(el) {
    this.el = el;
    this.set = new Set();
  }
  contains(c) {
    return this.set.has(c);
  }
  add(...c) {
    c.forEach((x) => this.set.add(x));
  }
  remove(...c) {
    c.forEach((x) => this.set.delete(x));
  }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c);
    else this.set.delete(c);
    return on;
  }
}

class FakeEl {
  constructor(doc, tag = 'div', id = '') {
    this.ownerDocument = doc;
    this.tagName = String(tag).toUpperCase();
    this.id = id;
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.textContent = '';
    this.value = '';
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.classList = new ClassList(this);
    this.listeners = {};
    this.attrs = {};
    this.offsetHeight = 40;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.onclick = null;
    this.clicks = 0;
    this.removed = false;
    this._q1 = new Map();
    this._qa = new Map();
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatch(type, ev = {}) {
    const e = Object.assign({ type, target: this, stopPropagation() {}, preventDefault() {}, stopImmediatePropagation() {} }, ev);
    for (const fn of this.listeners[type] || []) fn(e);
    return e;
  }
  click() {
    if (this.disabled) return;
    this.clicks += 1;
    const e = { type: 'click', target: this, stopPropagation() {}, preventDefault() {} };
    for (const fn of this.listeners.click || []) fn(e);
    if (this.onclick) this.onclick(e);
  }
  appendChild(c) {
    this.children.push(c);
    c.parentNode = this;
    return c;
  }
  append(...cs) {
    cs.forEach((c) => this.appendChild(c));
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
    this.parentNode = null;
    this.removed = true;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  focus() {
    this.focused = true;
  }
  blur() {
    this.focused = false;
    this.blurs = (this.blurs || 0) + 1;
  }
  select() {}
  getBoundingClientRect() {
    return { x: 1, y: 2, width: this.clientWidth, height: this.clientHeight };
  }
  // 登記用
  q1(sel, el) {
    this._q1.set(sel, el);
    return el;
  }
  q(sel, els) {
    this._qa.set(sel, els);
    return els;
  }
  querySelector(sel) {
    this.ownerDocument.queried.add(sel);
    return this._q1.has(sel) ? this._q1.get(sel) : null;
  }
  querySelectorAll(sel) {
    this.ownerDocument.queried.add(sel);
    return this._qa.has(sel) ? this._qa.get(sel) : [];
  }
  // 測試用：找出所有符合條件的子孫
  findAll(pred, out = []) {
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      c.findAll(pred, out);
    }
    return out;
  }
}

class FakeDocument {
  constructor() {
    this.title = '浮島農場 SkyFarm';
    this.byId = new Map();
    this.body = new FakeEl(this, 'body');
    this.listeners = {};
    this.queried = new Set(); // 腳本實際用過的選擇器（供「選擇器清單」測試用）
    this._q1 = new Map();
    this._qa = new Map();
  }
  createElement(tag) {
    return new FakeEl(this, tag);
  }
  register(id, el) {
    el.id = id;
    this.byId.set(id, el);
    return el;
  }
  getElementById(id) {
    if (this.byId.has(id)) return this.byId.get(id);
    const hit = this.body.findAll((e) => e.id === id && !e.removed)[0];
    return hit || null;
  }
  q1(sel, el) {
    this._q1.set(sel, el);
    return el;
  }
  q(sel, els) {
    this._qa.set(sel, els);
    return els;
  }
  querySelector(sel) {
    this.queried.add(sel);
    return this._q1.has(sel) ? this._q1.get(sel) : null;
  }
  querySelectorAll(sel) {
    this.queried.add(sel);
    return this._qa.has(sel) ? this._qa.get(sel) : [];
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatch(type, ev = {}) {
    for (const fn of this.listeners[type] || []) fn(Object.assign({ type }, ev));
  }
}

module.exports = { FakeEl, FakeDocument };
