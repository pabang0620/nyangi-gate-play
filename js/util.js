'use strict';
// Game clock. Online, js/online/online.js sets the offset from the server so day/week rollovers and timers
// cannot be moved by changing the device clock; offline it is the device clock.
let TIME_OFFSET = 0;
function nowMs() { return Date.now() + TIME_OFFSET; }
// Shared helpers: math, seeded RNG, DOM builders, number formatting.

const W = 1280, H = 720;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

// mulberry32 seeded RNG so maps and waves are stable between runs
function makeRng(seed) {
    let a = seed >>> 0;
    const f = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a0, b0) => a0 + f() * (b0 - a0);
    f.int = (a0, b0) => Math.floor(a0 + f() * (b0 - a0 + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    return f;
}

function pickWeighted(weights, r) {
    let sum = 0;
    for (const w of weights) sum += w;
    let x = (r !== undefined ? r : Math.random()) * sum;
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
    return weights.length - 1;
}

function fmt(n) { return Math.floor(n).toLocaleString('ko-KR'); }
// top-bar chips: 100,000+ shortened (1,234만 / 1.2M) so late-game totals don't push the bar off screen
function fmtShort(n) {
    n = Math.floor(n);
    if (n < 100000) return fmt(n);
    const east = { ko: ['만', '억'], ja: ['万', '億'], 'zh-Hans': ['万', '亿'], 'zh-Hant': ['萬', '億'] }[typeof LANG === 'string' ? LANG : 'ko'];
    const cut = (v, d) => (v >= 100 ? Math.floor(v).toLocaleString('en-US') : (Math.floor(v * 10) / 10).toString());
    if (east) return n >= 1e8 ? cut(n / 1e8) + east[1] : cut(n / 1e4) + east[0];
    return n >= 1e9 ? cut(n / 1e9) + 'B' : n >= 1e6 ? cut(n / 1e6) + 'M' : cut(n / 1e3) + 'K';
}
function pct(v, digits = 0) { return (v * 100).toFixed(digits) + '%'; }

// tiny DOM builder: h('div.panel#id', {onclick}, children...)
function h(sel, attrs, ...kids) {
    const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
    const el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) {
        for (const part of m[2].match(/[.#][\w-]+/g)) {
            if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
        }
    }
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) {
        for (const k in attrs) {
            const v = attrs[k];
            if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else if (k === 'html') el.innerHTML = v;
            else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
        }
    }
    for (const k of kids.flat(Infinity)) {
        if (k === null || k === undefined || k === false) continue;
        el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
}

function toast(msg) {
    const box = document.getElementById('toast');
    const d = h('div', msg);
    box.appendChild(d);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), Math.min(6000, 1800 + 60 * String(msg).length));   // longer text stays longer
}

// distance from point to segment, and closest point
function closestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return { x: ax + dx * t, y: ay + dy * t, t };
}
