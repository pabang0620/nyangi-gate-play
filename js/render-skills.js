'use strict';
// Hero skill effects, visual only. Draws the entries castSkill (js/battle/hero.js) pushes into Battle.skfx and the
// hero's oath / gale auras. Times are battle time, so each effect lands together with its damage and pauses with the game.
// Shapes come from a position hash, never Math.random (the battle's random stream stays untouched), and nothing is
// allocated per frame.
const SkillFx = (() => {
    const FLAT = 0.6;
    const TOE_X = [-0.46, -0.17, 0.17, 0.46], TOE_Y = [-0.3, -0.52, -0.52, -0.3];
    const DASHED = [7, 6], SOLID = [];
    const hz = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
    const fade = (t, d) => clamp(1 - t / d, 0, 1);

    // a cat paw: one pad and four toes, squashed by flat when it lies on the ground
    function pawPath(c, cx, cy, s, flat) {
        c.beginPath();
        c.moveTo(cx + s * 0.42, cy + s * 0.16 * flat);
        c.ellipse(cx, cy + s * 0.16 * flat, s * 0.42, s * 0.34 * flat, 0, 0, TAU);
        for (let i = 0; i < 4; i++) {
            const tx = cx + TOE_X[i] * s, ty = cy + TOE_Y[i] * s * flat;
            c.moveTo(tx + s * 0.14, ty);
            c.ellipse(tx, ty, s * 0.14, s * 0.18 * flat, 0, 0, TAU);
        }
    }
    function area(c, x, y, r, col, fillA, lineA, lw) {
        c.beginPath(); c.ellipse(x, y, r, r * FLAT, 0, 0, TAU);
        if (fillA > 0) { c.globalAlpha = fillA; c.fillStyle = col; c.fill(); }
        if (lineA > 0) { c.globalAlpha = lineA; c.strokeStyle = col; c.lineWidth = lw || 2; c.stroke(); }
    }
    function ring(c, x, y, r, col, a, lw) {
        if (a <= 0) return;
        c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = lw;
        c.beginPath(); c.ellipse(x, y, r, r * FLAT, 0, 0, TAU); c.stroke();
    }
    // the strip a line skill hits, flat on the ground
    function band(c, x1, y1, x2, y2, w, col, a) {
        if (a <= 0) return;
        c.save();
        c.translate(x1, y1); c.rotate(Math.atan2(y2 - y1, x2 - x1));
        const L = Math.hypot(x2 - x1, y2 - y1);
        c.globalAlpha = a * 0.3; c.fillStyle = col; c.fillRect(0, -w / 2, L, w);
        c.globalAlpha = a * 0.8; c.strokeStyle = col; c.lineWidth = 1.5; c.strokeRect(0, -w / 2, L, w);
        c.restore();
    }
    function arrowHead(c, hx, hy, ang, s) {
        c.beginPath();
        c.moveTo(hx + Math.cos(ang) * s, hy + Math.sin(ang) * s);
        c.lineTo(hx + Math.cos(ang + 2.5) * s, hy + Math.sin(ang + 2.5) * s);
        c.lineTo(hx + Math.cos(ang - 2.5) * s, hy + Math.sin(ang - 2.5) * s);
        c.closePath(); c.fill();
    }
    function star(c, cx, cy, R, rot) {
        c.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? R * 0.45 : R;
            if (i) c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        c.closePath();
    }

    // ------------------------------------------------------------ ground layer (under units)
    function ground(c, B, T) {
        const list = B.skfx;
        if (!list || !list.length) return;
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
        for (const f of list) {
            const t = T - f.t0;
            if (t < 0) continue;
            const a = fade(t, f.dur);
            switch (f.k) {
                case 'dash': band(c, f.x1, f.y1, f.x2, f.y2, 44, '#9adfff', a * 0.8); break;
                case 'quake': {
                    const k = Math.min(1, t / 0.1);
                    area(c, f.x, f.y, f.r, '#c09060', 0.16 * a, 0.7 * a, 2);
                    // one long split along the facing plus short side cracks
                    for (let pass = 0; pass < 2; pass++) {
                        c.globalAlpha = (pass ? 1 : 0.75) * a; c.strokeStyle = pass ? '#1e1008' : '#f0d098'; c.lineWidth = pass ? 3.5 : 7;
                        c.beginPath();
                        for (let i = 0; i < 7; i++) {
                            const ang = i < 2 ? (f.dir > 0 ? 0 : Math.PI) + i * Math.PI + (hz(f.seed, i) - 0.5) * 0.25 : (i - 2) / 5 * TAU + 0.6 + hz(f.seed, i) * 0.7;
                            const len = (i < 2 ? 1 : 0.45 + hz(f.seed, i + 20) * 0.3) * f.r * k, ca = Math.cos(ang), sa = Math.sin(ang);
                            c.moveTo(f.x, f.y);
                            for (let j = 1; j <= 4; j++) {
                                const d = len * j / 4, off = j < 4 ? (hz(f.seed, i * 7 + j) - 0.5) * 16 : 0;
                                c.lineTo(f.x + ca * d - sa * off, f.y + (sa * d + ca * off) * FLAT);
                            }
                        }
                        c.stroke();
                    }
                    break;
                }
                case 'oath': {
                    const g = Math.min(1, t / 0.2);
                    area(c, f.x, f.y, f.r, '#f2c14e', 0.1 * a, 0.85 * a, 2.5);
                    pawPath(c, f.x, f.y + 4, 40 * (0.6 + 0.4 * g), FLAT);
                    c.globalAlpha = 0.35 * a; c.fillStyle = '#ffe08a'; c.fill();
                    c.globalAlpha = 0.9 * a; c.strokeStyle = '#f2c14e'; c.lineWidth = 2; c.stroke();
                    break;
                }
                case 'judge': {
                    const s = f.r * 0.95;
                    if (t < f.fall) {
                        const k = t / f.fall;
                        pawPath(c, f.x, f.y, s * (0.45 + 0.55 * k), FLAT);
                        c.globalAlpha = 0.15 + 0.3 * k; c.fillStyle = '#2a1a08'; c.fill();
                    } else {
                        const q = (t - f.fall) / (f.dur - f.fall), w = clamp((t - f.fall) / 0.45, 0, 1);
                        pawPath(c, f.x, f.y, s, FLAT);
                        c.globalAlpha = 0.45 * (1 - q); c.fillStyle = '#ffe08a'; c.fill();
                        c.globalAlpha = 0.8 * (1 - q); c.strokeStyle = '#c8902a'; c.lineWidth = 3; c.stroke();
                        ring(c, f.x, f.y, f.r * (0.5 + 0.8 * w), '#fff4c0', 1 - w, 5);
                        ring(c, f.x, f.y, f.r * (0.3 + 0.7 * w), '#ffd04a', (1 - w) * 0.7, 3);
                    }
                    break;
                }
                case 'fireball':
                    if (t < f.land) {
                        c.setLineDash(DASHED); area(c, f.x, f.y, f.r, '#ff9040', 0.12, 0.85, 2); c.setLineDash(SOLID);
                    } else {
                        const q = clamp((t - f.land) / 0.35, 0, 1), b = fade(t - f.land, f.dur - f.land);
                        area(c, f.x, f.y, f.r * 0.7, '#3a1a0a', 0.35 * b, 0, 0);
                        ring(c, f.x, f.y, f.r * (0.5 + 0.6 * q), '#ff9040', 1 - q, 4);
                    }
                    break;
                case 'frost':
                    area(c, f.x, f.y, f.healR, '#8dffb0', 0.1 * a, 0.45 * a, 2);
                    area(c, f.x, f.y, f.r, '#a0f0ff', 0.22 * a, 0.9 * a, 2.5);
                    break;
                case 'meteor':
                    if (t < f.fall) {
                        const k = t / f.fall;
                        area(c, f.x, f.y, f.r * 0.6 * k, '#2a1206', 0.35 * k, 0, 0);
                        c.globalAlpha = 0.8; c.strokeStyle = '#ffb060'; c.lineWidth = 2; c.beginPath();
                        c.moveTo(f.x - 14, f.y); c.lineTo(f.x + 14, f.y); c.moveTo(f.x, f.y - 9); c.lineTo(f.x, f.y + 9); c.stroke();
                    } else {
                        const q = clamp((t - f.fall) / 0.5, 0, 1), b = fade(t - f.fall, f.dur - f.fall);
                        area(c, f.x, f.y, f.r * 0.55, '#2a1206', 0.45 * b, 0.5 * b, 2);
                        ring(c, f.x, f.y, f.r * (0.5 + 0.75 * q), '#ffb060', 1 - q, 5);
                    }
                    break;
                case 'pierce': band(c, f.x1, f.y1, f.x2, f.y2, f.wid, '#fff0c0', a); break;
                case 'storm': band(c, f.x1, f.y1, f.x2, f.y2, f.wid, '#c0f8ff', a); break;
                case 'rain':
                    if (t < f.rainT) { c.setLineDash(DASHED); area(c, f.x, f.y, f.r, '#7fd4ff', 0, 0.7, 2); c.setLineDash(SOLID); }
                    break;
            }
        }
        c.restore();
    }

    // ------------------------------------------------------------ top layer (over units)
    function top(c, B, T) {
        const list = B.skfx;
        if (!list || !list.length) return;
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
        for (const f of list) {
            const t = T - f.t0;
            if (t < 0) continue;
            const a = fade(t, f.dur);
            switch (f.k) {
                case 'dash': {
                    const ang = Math.atan2(f.y2 - f.y1, f.x2 - f.x1), k = Math.min(1, t / f.hit);
                    const hx = lerp(f.x1, f.x2, k), hy = lerp(f.y1, f.y2, k) - 14;
                    const tail = Math.max(0, k - 0.6);
                    const sx = lerp(f.x1, f.x2, tail), sy = lerp(f.y1, f.y2, tail) - 14;
                    c.globalAlpha = 0.35 * a; c.strokeStyle = '#7fd4ff'; c.lineWidth = 16; c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hy); c.stroke();
                    c.globalAlpha = 0.85 * a; c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.stroke();
                    if (t >= f.hit) {
                        // the closing cut: a crescent swept across the end point
                        const q = clamp((t - f.hit) / 0.2, 0, 1), cx = f.x2 + Math.cos(ang) * 10, cy = f.y2 - 16;
                        const a0 = ang - 1.4, a1 = a0 + 2.8 * Math.min(1, q * 1.6);
                        c.globalAlpha = 1 - q; c.strokeStyle = '#ffe08a'; c.lineWidth = 9; c.beginPath(); c.arc(cx, cy, 30, a0, a1); c.stroke();
                        c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 30, a0, a1); c.stroke();
                    }
                    break;
                }
                case 'quake': {
                    const p = Math.min(1, t / 0.55);
                    if (p >= 1) break;
                    c.globalAlpha = 1 - p * p; c.fillStyle = '#7a5a38';
                    for (let j = 0; j < 8; j++) {
                        const ang = hz(f.seed, 50 + j) * TAU, d = f.r * (0.3 + 0.6 * hz(f.seed, 60 + j)) * p, s = 3 + hz(f.seed, 70 + j) * 4;
                        c.fillRect(f.x + Math.cos(ang) * d - s / 2, f.y + Math.sin(ang) * d * FLAT - Math.sin(p * Math.PI) * (26 + 24 * hz(f.seed, 80 + j)) - s / 2, s, s);
                    }
                    break;
                }
                case 'judge':
                    if (t < f.fall) {
                        // the giant paw comes down from the sky, landing as the damage lands
                        const k = t / f.fall, s = f.r * 0.95 * (0.7 + 0.3 * k), py = f.y - 380 * (1 - k * k) - 10;
                        c.globalAlpha = 0.18 * k; c.fillStyle = '#fff4c0'; c.fillRect(f.x - s * 0.5, 0, s, Math.max(0, py));
                        pawPath(c, f.x, py, s, 0.85);
                        c.globalAlpha = 0.95; c.fillStyle = '#fff1c4'; c.fill();
                        c.strokeStyle = '#c8902a'; c.lineWidth = 3; c.stroke();
                    }
                    break;
                case 'frost': {
                    const g = Math.min(1, t / 0.12);
                    c.globalAlpha = a; c.fillStyle = '#e4fbff'; c.strokeStyle = '#6cc8ee'; c.lineWidth = 1.2;
                    c.beginPath();
                    for (let j = 0; j < 14; j++) {
                        const inner = j >= 9, ang = (inner ? (j - 9) / 5 : j / 9) * TAU + hz(f.seed, j) * 0.4;
                        const rr = f.r * (inner ? 0.42 : 0.86), bx = f.x + Math.cos(ang) * rr, by = f.y + Math.sin(ang) * rr * FLAT;
                        const hh = (inner ? 10 : 15 + 9 * hz(f.seed, j + 30)) * g, w = inner ? 3 : 4.5;
                        c.moveTo(bx - w, by); c.lineTo(bx + (hz(f.seed, j + 60) - 0.5) * 6, by - hh); c.lineTo(bx + w, by); c.closePath();
                    }
                    c.fill(); c.stroke();
                    break;
                }
                case 'meteor':
                    if (t < f.fall) {
                        // a star falling in from the upper right with a fiery tail
                        const k = t / f.fall, sx = f.x + 220, sy = f.y - 440;
                        const mx = lerp(sx, f.x, k), my = lerp(sy, f.y - 12, k), tx = lerp(sx, f.x, Math.max(0, k - 0.22)), ty = lerp(sy, f.y - 12, Math.max(0, k - 0.22));
                        c.beginPath(); c.moveTo(tx, ty); c.lineTo(mx, my);
                        c.globalAlpha = 0.35; c.strokeStyle = '#ff7030'; c.lineWidth = 22; c.stroke();
                        c.globalAlpha = 0.7; c.strokeStyle = '#ffc040'; c.lineWidth = 10; c.stroke();
                        c.globalAlpha = 0.95; c.strokeStyle = '#fff8d0'; c.lineWidth = 3; c.stroke();
                        c.globalAlpha = 0.35; c.fillStyle = '#ffd060'; c.beginPath(); c.arc(mx, my, 26, 0, TAU); c.fill();
                        star(c, mx, my, 18, t * 9);
                        c.globalAlpha = 1; c.fillStyle = '#ffe680'; c.fill(); c.strokeStyle = '#ff8a20'; c.lineWidth = 2.5; c.stroke();
                    }
                    break;
                case 'pierce':
                case 'storm': {
                    const storm = f.k === 'storm', fly = storm ? 0.24 : 0.12, ang = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
                    const n = storm ? 5 : 1, nx = -Math.sin(ang), ny = Math.cos(ang);
                    for (let j = 0; j < n; j++) {
                        const off = n > 1 ? (j / (n - 1) - 0.5) * f.wid * 0.75 : 0, lag = n > 1 ? Math.abs(j - 2) * 0.03 : 0;
                        const k = clamp((t - lag) / fly, 0, 1);
                        if (k <= 0) continue;
                        const ox = f.x1 + nx * off, oy = f.y1 - 16 + ny * off;
                        const hx = ox + (f.x2 - f.x1) * k, hy = oy + (f.y2 - f.y1) * k;
                        const b = k < 1 ? 1 : a, sx = ox + (f.x2 - f.x1) * Math.max(0, k - 0.45), sy = oy + (f.y2 - f.y1) * Math.max(0, k - 0.45);
                        c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hy);
                        c.globalAlpha = 0.4 * b; c.strokeStyle = storm ? '#7fe0ff' : '#ffd070'; c.lineWidth = storm ? 10 : 7; c.stroke();
                        c.globalAlpha = 0.95 * b; c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.stroke();
                        if (k < 1) { c.fillStyle = storm ? '#e0fbff' : '#fff4d0'; arrowHead(c, hx, hy, ang, storm ? 11 : 8); }
                    }
                    break;
                }
                case 'rain': {
                    if (t >= f.rainT) break;
                    // arrows keep dropping all over the circle while it lasts; each one lands at a new spot
                    c.strokeStyle = '#f4e6c4'; c.fillStyle = '#f4e6c4'; c.lineWidth = 2;
                    for (let j = 0; j < 9; j++) {
                        const P = 0.3, loc = t + hz(f.seed, j) * P, cyc = Math.floor(loc / P), ph = loc / P - cyc;
                        const px = f.x + (hz(f.seed + cyc, j) * 2 - 1) * f.r * 0.8, py = f.y + (hz(f.seed + cyc, j + 40) * 2 - 1) * f.r * 0.8 * FLAT;
                        const hx = px - 22 * (1 - ph), hy = py - 130 * (1 - ph);
                        c.globalAlpha = 0.95;
                        c.beginPath(); c.moveTo(hx - 3, hy - 18); c.lineTo(hx, hy); c.stroke();
                        arrowHead(c, hx, hy, 1.4, 5);
                        if (cyc > 0 && ph < 0.6) {
                            // the last one stuck in the ground for a moment
                            const qx = f.x + (hz(f.seed + cyc - 1, j) * 2 - 1) * f.r * 0.8, qy = f.y + (hz(f.seed + cyc - 1, j + 40) * 2 - 1) * f.r * 0.8 * FLAT;
                            c.globalAlpha = 0.8 * (1 - ph / 0.6); c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx - 2, qy - 9); c.stroke();
                        }
                    }
                    break;
                }
                case 'gale': {
                    const q = clamp(t / f.dur, 0, 1);
                    c.globalAlpha = 1 - q; c.strokeStyle = '#bfffd8'; c.lineWidth = 3;
                    for (let j = 0; j < 5; j++) {
                        const r = 16 + 56 * q, a0 = j / 5 * TAU + q * 3;
                        c.beginPath(); c.ellipse(f.x, f.y - 14, r, r * 0.55, 0, a0, a0 + 0.9); c.stroke();
                    }
                    break;
                }
            }
        }
        c.restore();
    }

    // ------------------------------------------------------------ hero auras (oath shield, gale wind)
    function heroBack(c, h, T) {
        if (h.oathUntil > T) {
            const a = Math.min(1, (h.oathUntil - T) / 0.5);
            pawPath(c, h.x, h.y + 2, 30, FLAT);
            c.globalAlpha = 0.3 * a; c.fillStyle = '#ffe08a'; c.fill();
            c.globalAlpha = 0.75 * a; c.strokeStyle = '#f2c14e'; c.lineWidth = 1.5; c.stroke();
            c.globalAlpha = 1;
        }
    }
    function heroFront(c, h, T, now) {
        if (h.oathUntil > T) {
            // a shield dome over the knight
            const a = Math.min(1, (h.oathUntil - T) / 0.5), p = 0.75 + Math.sin(now * 5) * 0.15;
            c.beginPath(); c.ellipse(h.x, h.y, 40, 80, 0, Math.PI, TAU); c.ellipse(h.x, h.y, 40, 15, 0, 0, Math.PI);
            c.globalAlpha = 0.2 * a; c.fillStyle = '#ffe9a8'; c.fill();
            c.globalAlpha = p * a; c.strokeStyle = '#ffd04a'; c.lineWidth = 3; c.stroke();
            c.globalAlpha = 0.6 * a; c.strokeStyle = '#fff8dc'; c.lineWidth = 2;
            c.beginPath(); c.ellipse(h.x, h.y, 33, 72, 0, Math.PI * 1.15, Math.PI * 1.4); c.stroke();
            c.globalAlpha = 1;
        }
        if (h.galeUntil > T) {
            // wind streaks circling the ranger and speed lines behind her
            const a = Math.min(1, (h.galeUntil - T) / 0.4);
            c.lineCap = 'round'; c.strokeStyle = '#e4fff0'; c.lineWidth = 3;
            for (let i = 0; i < 3; i++) {
                const a0 = now * 7 + i * TAU / 3;
                c.globalAlpha = 0.95 * a; c.beginPath(); c.ellipse(h.x, h.y - 10 - i * 20, 34 - i * 4, 11 - i * 2, 0, a0, a0 + 1.7); c.stroke();
            }
            for (let i = 0; i < 2; i++) {
                const u = (now * 2.2 + i * 0.5) % 1, sx = h.x - h.dir * (24 + u * 26), sy = h.y - 22 - i * 20;
                c.globalAlpha = 0.7 * a * (1 - u); c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - h.dir * 18, sy); c.stroke();
            }
            c.globalAlpha = 1;
        }
    }

    return { ground, top, heroBack, heroFront };
})();
