/* A small stand-in for the browser's document, enough for the page scripts that build their screen with
   createElement, setAttribute, appendChild and textContent. No DOM library: the tests walk the tree themselves. */
class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.childNodes = []; this.parentNode = null;
    this.listeners = {}; this.hidden = false; this.value = ""; this.checked = false; this.disabled = false; this.text = null;
    this.style = {};
    const list = () => (this.attrs["class"] || "").split(/\s+/).filter(Boolean);
    const set = (names) => { this.attrs["class"] = names.join(" "); };
    this.classList = {
      contains: (c) => list().includes(c),
      add: (c) => { if (!list().includes(c)) set([...list(), c]); },
      remove: (c) => { set(list().filter((x) => x !== c)); },
      toggle: (c, on) => { if (on === undefined ? !list().includes(c) : on) set([...new Set([...list(), c])]); else set(list().filter((x) => x !== c)); },
    };
  }
  get children() { return this.childNodes.filter((n) => n.text === null); }
  get firstChild() { return this.childNodes[0] || null; }
  get id() { return this.attrs.id || ""; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "value") this.value = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(n) { if (n.parentNode) n.remove(); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    if (n.parentNode) n.remove();
    n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n);
    return n;
  }
  removeChild(n) { this.childNodes = this.childNodes.filter((c) => c !== n); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get textContent() { return this.text !== null ? this.text : this.childNodes.map((n) => n.textContent).join(""); }
  set textContent(v) {
    this.childNodes.forEach((n) => { n.parentNode = null; });
    this.childNodes = [];
    if (v !== "" && v != null) { const t = new Node("#text"); t.text = String(v); t.parentNode = this; this.childNodes.push(t); }
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  fire(type, extra = {}) {
    const e = { type, target: this, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    (this.listeners[type] || []).slice().forEach((fn) => fn(e));
    return e;
  }
  focus() { this.doc.activeElement = this; }
  all(test = () => true, out = []) {
    for (const n of this.children) { if (test(n)) out.push(n); n.all(test, out); }
    return out;
  }
  /* One ".class" or "#id" only, which is all dashboard.js asks of these two. */
  matches(sel) { if (/^\[[a-z-]+\]$/i.test(sel)) return this.hasAttribute(sel.slice(1, -1)); return sel.charAt(0) === "." ? this.classList.contains(sel.slice(1)) : sel.charAt(0) === "#" && this.id === sel.slice(1); }
  querySelector(sel) { return this.all((n) => n.matches(sel))[0] || null; }
  closest(sel) { return this.matches(sel) ? this : this.parentNode ? this.parentNode.closest(sel) : null; }
  /* Only the form of selector the scripts use: a comma list of tag names, with an optional [attribute]. */
  querySelectorAll(sel) {
    const parts = sel.split(",").map((s) => /^\s*([a-z0-9]+)(?:\[([a-z-]+)\])?\s*$/i.exec(s)).filter(Boolean);
    return this.all((n) => parts.some((m) => n.tagName === m[1].toUpperCase() && (!m[2] || n.hasAttribute(m[2]))));
  }
}

export function makeDocument() {
  const doc = { activeElement: null, listeners: {}, cookie: "" };
  doc.createElement = (tag) => { const n = new Node(tag); n.doc = doc; return n; };
  doc.createElementNS = (ns, tag) => doc.createElement(tag);
  doc.body = doc.createElement("body");
  doc.getElementById = (id) => doc.body.all((n) => n.attrs.id === id)[0] || null;
  doc.querySelectorAll = () => [];
  doc.addEventListener = (type, fn) => { (doc.listeners[type] = doc.listeners[type] || []).push(fn); };
  doc.removeEventListener = (type, fn) => { doc.listeners[type] = (doc.listeners[type] || []).filter((f) => f !== fn); };
  doc.fire = (type, extra = {}) => {
    const e = { type, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    (doc.listeners[type] || []).slice().forEach((fn) => fn(e));
    return e;
  };
  return doc;
}
