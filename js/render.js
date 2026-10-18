'use strict';
// Canvas renderer for a Battle. Reads state only.

const Render = (() => {
    let cv, x, bg = null, bgFor = null;
    const view = { hoverSlot: null, selSlot: null, aim: null, rallyFor: null, mouse: { x: 0, y: 0 }, textMul: 1, goldPos: { x: 150, y: 30 } };

    function init(canvas) {
        cv = canvas; x = cv.getContext('2d');
        x.imageSmoothingEnabled = false;
    }

    function shade(hex) {
        const n = parseInt(hex.slice(1), 16);
        const f = c => Math.max(0, Math.round(c * 0.62)).toString(16).padStart(2, '0');
        return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
    }
    function spr(s, px, py, scale, flip, flash, alpha = 1, sx = 1, sy = 1) {
        // anchor: bottom center
        const w = s.w * scale, hh = s.h * scale;
        x.save();
        x.globalAlpha = alpha;
        x.translate(Math.round(px), Math.round(py));
        x.imageSmoothingEnabled = !!s.hi;
        if (sx !== 1 || sy !== 1) x.scale(sx, sy);
        if (flip) x.scale(-1, 1);
        x.drawImage(s.img, -Math.round(w / 2), -hh, w, hh);
        if (flash > 0) { x.globalAlpha = Math.min(1, flash * 10) * alpha; x.drawImage(s.white, -Math.round(w / 2), -hh, w, hh); }
        x.restore();
    }
    // ---- skin trails (rare/hidden skins): paw prints + afterimages. Visual-only state, never read by the battle.
    const PAW_STEP = 22, PAW_LIFE = 1.2, PAW_MAX = 28, GHOST_EVERY = 0.08, GHOST_GAP = 14, GHOST_LIFE = 0.6, GHOST_MAX = 5;
    const trail = { B: null, skin: undefined, cfg: null, lx: 0, ly: 0, acc: 0, side: 1, lastT: 0, gAcc: 0, gDist: 0, paws: [], pawN: 0, ghosts: [], ghostN: 0 };
    for (let i = 0; i < PAW_MAX; i++) trail.paws.push({ x: 0, y: 0, a: 0, t: -99 });
    for (let i = 0; i < GHOST_MAX; i++) trail.ghosts.push({ x: 0, y: 0, s: null, flip: false, t: -99 });
    function updateTrail(B, now) {
        const h = B.hero, tr = trail;
        if (tr.B !== B || tr.skin !== h.skin) {
            if (tr.B !== B) { for (const p of tr.paws) p.t = -99; for (const g of tr.ghosts) g.t = -99; }
            tr.B = B; tr.skin = h.skin; tr.cfg = h.skin && typeof skinTrail === 'function' ? skinTrail(h.skin) : null;
            tr.lx = h.x; tr.ly = h.y; tr.acc = 0; tr.lastT = now;
        }
        const dtr = Math.min(0.1, now - tr.lastT); tr.lastT = now;
        const dx = h.x - tr.lx, dy = h.y - tr.ly, d = Math.hypot(dx, dy);
        tr.lx = h.x; tr.ly = h.y;
        if (!tr.cfg || !B.heroAlive || d > 60) { tr.acc = 0; return; }   // big jumps (respawn/teleport) leave no trail
        if (d < 0.01) { tr.gAcc = GHOST_EVERY; tr.gDist = GHOST_GAP; return; }   // standing still: next step spawns a ghost at once
        if (tr.cfg.paw) {
            tr.acc += d;
            if (tr.acc >= PAW_STEP) {
                tr.acc -= PAW_STEP; tr.side = -tr.side;
                const a = Math.atan2(dy, dx), p = tr.paws[tr.pawN++ % PAW_MAX];
                p.x = h.x - Math.sin(a) * 6 * tr.side; p.y = h.y + Math.cos(a) * 4 * tr.side; p.a = a; p.t = now;
            }
        }
        if (tr.cfg.ghost) {
            tr.gAcc += dtr; tr.gDist += d;
            // every ~0.08s, but spaced out enough that a slow walk still fans the ghosts behind the hero
            if (tr.gAcc >= GHOST_EVERY && tr.gDist >= GHOST_GAP) {
                tr.gAcc = 0; tr.gDist = 0;
                const g = tr.ghosts[tr.ghostN++ % GHOST_MAX];
                g.x = h.x; g.y = h.y; g.s = heroSprite(h.cls, h.skin); g.flip = h.dir < 0; g.t = now;
            }
        }
    }
    function drawPaws(now) {
        const tr = trail; if (!tr.cfg || !tr.cfg.paw) return;
        for (const p of tr.paws) {
            const k = (now - p.t) / PAW_LIFE; if (k < 0 || k >= 1) continue;
            x.save();
            x.globalAlpha = 0.85 * (1 - k * k);
            x.translate(p.x, p.y); x.scale(1.5, 0.95); x.rotate(p.a);
            // dark rim first so pale tints still read on light ground
            x.fillStyle = 'rgba(30,15,5,.35)'; pawShape(1.35);
            x.fillStyle = tr.cfg.col; pawShape(1);
            x.restore();
        }
    }
    function pawShape(m) {
        x.beginPath(); x.ellipse(-1.5, 0, 3.6 * m, 4.2 * m, 0, 0, TAU); x.fill();          // main pad
        for (let i = 0; i < 4; i++) {
            const ang = (i - 1.5) * 0.46;
            x.beginPath(); x.ellipse(Math.cos(ang) * 5.8, Math.sin(ang) * 5.8, 1.7 * m, 1.45 * m, ang, 0, TAU); x.fill();
        }
    }
    // tinted silhouette of a sprite, cached on the sprite object
    function ghostSprite(s, col) {
        if (s._ghost && s._ghostCol === col) return s._ghost;
        const c = document.createElement('canvas'); c.width = s.img.width; c.height = s.img.height;
        const g = c.getContext('2d');
        g.drawImage(s.img, 0, 0);
        g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.7; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
        s._ghost = c; s._ghostCol = col;
        return c;
    }
    function drawGhosts(now) {
        const tr = trail; if (!tr.cfg || !tr.cfg.ghost) return;
        for (const g of tr.ghosts) {
            const k = (now - g.t) / GHOST_LIFE; if (k < 0 || k >= 1 || !g.s) continue;
            const s = g.s, w = s.w * 2, hh = s.h * 2;
            x.save();
            x.globalAlpha = 0.4 * (1 - k);
            x.translate(Math.round(g.x), Math.round(g.y));
            x.imageSmoothingEnabled = !!s.hi;
            if (g.flip) x.scale(-1, 1);
            x.shadowColor = tr.cfg.col; x.shadowBlur = 8;
            x.drawImage(ghostSprite(s, tr.cfg.col), -Math.round(w / 2), -hh, w, hh);
            x.restore();
        }
    }

    function shadow(px, py, rx) {
        x.fillStyle = 'rgba(0,0,0,.28)';
        x.beginPath(); x.ellipse(px, py, rx, rx * 0.38, 0, 0, TAU); x.fill();
    }
    function bar(px, py, w, ratio, col, hh = 4) {
        x.fillStyle = 'rgba(26,14,6,.9)'; x.fillRect(Math.round(px - w / 2) - 1, Math.round(py) - 1, w + 2, hh + 2);
        x.fillStyle = col; x.fillRect(Math.round(px - w / 2), Math.round(py), Math.round(w * clamp(ratio, 0, 1)), hh);
    }

    function draw(B, dtReal) {
        if (bgFor !== B) { bg = Art.background(B.mapDef, B.theme, B.slots); bgFor = B; }
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.imageSmoothingEnabled = false;
        x.clearRect(0, 0, W, H);
        const sh = B.shake;
        if (B.zoom > 0) { const z = 1 + Math.sin(Math.min(1, B.zoom / 0.18) * Math.PI) * 0.035; x.translate(W / 2, H / 2); x.scale(z, z); x.translate(-W / 2, -H / 2); }
        if (sh > 0) x.translate((Math.random() * 2 - 1) * sh, (Math.random() * 2 - 1) * sh);
        x.drawImage(bg, 0, 0);
        const T = B.t, now = performance.now() / 1000;

        // spawn arrows
        for (const p of B.paths) {
            const a = p.at(18);
            x.save(); x.translate(clamp(a.x, 20, W - 20), clamp(a.y, 70, H - 20)); x.rotate(a.ang);
            x.globalAlpha = 0.5 + 0.3 * Math.sin(now * 4);
            x.fillStyle = '#ff5040'; x.beginPath(); x.moveTo(14, 0); x.lineTo(-6, -10); x.lineTo(-6, 10); x.fill();
            x.restore();
        }

        // build slots
        for (const s of B.slots) {
            if (s.tower) continue;
            const hov = view.hoverSlot === s || view.selSlot === s;
            const pad = Art.gen('d_pad');
            if (pad) {
                const pulse = 0.5 + 0.5 * Math.sin(now * 3 + s.i);
                x.imageSmoothingEnabled = true;
                x.globalAlpha = 1;
                if (hov) x.filter = 'brightness(1.25)';
                x.drawImage(pad.img, s.x - pad.w, s.y + 16 - pad.h * 2, pad.w * 2, pad.h * 2);
                x.filter = 'none';
                x.strokeStyle = hov ? '#ffe08a' : `rgba(255,224,138,${0.25 + pulse * 0.35})`; x.lineWidth = 2;
                x.beginPath(); x.ellipse(s.x, s.y + 8, 40, 17, 0, 0, TAU); x.stroke();
                continue;
            }
            // stone build pad: dark base, light rim, pulsing gold when hovered/selected
            const pulse = 0.5 + 0.5 * Math.sin(now * 3 + s.i);
            x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(s.x, s.y + 9, 34, 15, 0, 0, TAU); x.fill();
            x.fillStyle = hov ? '#8a7a5a' : '#6e6450'; x.beginPath(); x.ellipse(s.x, s.y + 6, 32, 14, 0, 0, TAU); x.fill();
            x.fillStyle = hov ? '#a8966c' : '#857a62'; x.beginPath(); x.ellipse(s.x, s.y + 4, 26, 10, 0, 0, TAU); x.fill();
            x.strokeStyle = hov ? '#ffe08a' : `rgba(255,236,190,${0.45 + pulse * 0.35})`; x.lineWidth = hov ? 3 : 2;
            x.setLineDash([6, 4]); x.beginPath(); x.ellipse(s.x, s.y + 6, 32, 14, 0, 0, TAU); x.stroke(); x.setLineDash([]);
            x.fillStyle = '#5a3a20'; x.fillRect(s.x - 1, s.y - 18, 3, 22);
            x.fillStyle = hov ? '#ffd04a' : '#f2c14e'; x.beginPath(); x.moveTo(s.x + 2, s.y - 18); x.lineTo(s.x + 14, s.y - 14); x.lineTo(s.x + 2, s.y - 10); x.fill();
        }

        // range preview
        const sel = view.selSlot || view.hoverSlot;
        if (sel && sel.tower) {
            const st = B.towerStats(sel.tower);
            x.fillStyle = 'rgba(127,212,255,.08)'; x.strokeStyle = 'rgba(127,212,255,.6)'; x.lineWidth = 2;
            x.beginPath(); x.ellipse(sel.x, sel.y, st.range, st.range * 0.92, 0, 0, TAU); x.fill(); x.stroke();
            if (sel.tower.rally) { x.fillStyle = '#f2c14e'; x.fillRect(sel.tower.rally.x - 1, sel.tower.rally.y - 18, 2, 18); x.fillRect(sel.tower.rally.x + 1, sel.tower.rally.y - 18, 9, 6); }
        }
        if (view.preview) {
            const pv = view.preview;
            x.fillStyle = 'rgba(255,224,138,.07)'; x.strokeStyle = 'rgba(255,224,138,.5)'; x.lineWidth = 2;
            x.beginPath(); x.ellipse(pv.x, pv.y, pv.r, pv.r * 0.92, 0, 0, TAU); x.fill(); x.stroke();
        }

        // burning ground
        for (const z of B.zones) {
            const a = clamp((z.until - T) / 1.0, 0, 1) * 0.28;
            x.fillStyle = `rgba(255,90,20,${a})`;
            x.beginPath(); x.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU); x.fill();
        }

        // telegraphs (ground warnings): fill grows until it fires
        for (const tl of B.teles) {
            if (tl.shape === 'none') continue;
            const k = clamp((T - tl.t0) / tl.dur, 0, 1);
            const col = tl.color;
            x.save();
            if (tl.shape === 'circle') {
                x.globalAlpha = 0.18; x.fillStyle = col;
                x.beginPath(); x.ellipse(tl.x, tl.y, tl.r, tl.r * 0.6, 0, 0, TAU); x.fill();
                x.globalAlpha = 0.35; x.beginPath(); x.ellipse(tl.x, tl.y, tl.r * k, tl.r * 0.6 * k, 0, 0, TAU); x.fill();
                x.globalAlpha = 0.9; x.strokeStyle = col; x.lineWidth = 2;
                x.beginPath(); x.ellipse(tl.x, tl.y, tl.r, tl.r * 0.6, 0, 0, TAU); x.stroke();
            } else if (tl.shape === 'line') {
                const ang = Math.atan2(tl.y2 - tl.y1, tl.x2 - tl.x1), L = dist(tl.x1, tl.y1, tl.x2, tl.y2);
                x.translate(tl.x1, tl.y1); x.rotate(ang);
                x.globalAlpha = 0.18; x.fillStyle = col; x.fillRect(0, -tl.wid / 2, L, tl.wid);
                x.globalAlpha = 0.35; x.fillRect(0, -tl.wid / 2, L * k, tl.wid);
                x.globalAlpha = 0.9; x.strokeStyle = col; x.lineWidth = 2; x.strokeRect(0, -tl.wid / 2, L, tl.wid);
            }
            x.restore();
        }

        // skin trails: paw prints sit on the ground under everything that stands
        updateTrail(B, now);
        drawPaws(now);

        // entities sorted by y
        const ents = [];
        for (const s of B.slots) if (s.tower) ents.push({ y: s.y + 14, k: 't', o: s });
        for (const s of B.soldiers) ents.push({ y: s.y, k: 's', o: s });
        for (const e of B.enemies) ents.push({ y: e.y, k: 'e', o: e });
        if (B.heroAlive) ents.push({ y: B.hero.y, k: 'h', o: B.hero });
        if (B.coop && B.hero2.deadUntil <= B.t) ents.push({ y: B.hero2.y, k: 'h2', o: B.hero2 });   // 협동 디펜스: the partner's hero
        for (const a of B.allies || []) ents.push({ y: a.y, k: 'a', o: a });
        for (const d of B.drops) ents.push({ y: d.y, k: 'd', o: d });
        ents.sort((a, b) => a.y - b.y);
        for (const it of ents) {
            if (it.k === 't') drawTower(B, it.o, T, now);
            else if (it.k === 's') drawSoldier(B, it.o, T);
            else if (it.k === 'e') drawEnemy(B, it.o, T, now);
            else if (it.k === 'h') drawHero(B, it.o, T, now);
            else if (it.k === 'h2') drawMate(B, it.o, T, now);
            else if (it.k === 'a') drawAlly(B, it.o, T, now);
            else drawDrop(it.o, now);
        }
        if (!B.heroAlive) {
            const h = B.hero;
            const lbl = L('부활 ') + Math.ceil(h.deadUntil - T) + L('초');
            x.font = `${Math.round(20 * view.textMul)}px BlackHan`; x.textAlign = 'center'; x.lineWidth = 5; x.lineJoin = 'round'; x.strokeStyle = '#2a1206';
            x.strokeText(lbl, h.guard.x, h.guard.y - 10); x.fillStyle = '#ff9a7a'; x.fillText(lbl, h.guard.x, h.guard.y - 10);
        }

        // projectiles
        for (const p of B.projs) {
            const fxName = { arrow: 'fx_arrow', bolt: 'fx_arrow', orb: 'fx_orb', heroorb: 'fx_orb', frostorb: 'fx_frost', fireball: 'fx_fireball', shell: 'fx_cannonball', fireshell: 'fx_fireball' }[p.kind];
            const fx = fxName && Art.gen(fxName);
            if (fx) {
                if (p.dur) shadow(lerp(p.fx, p.tx, p.t / p.dur), lerp(p.fy, p.ty, p.t / p.dur), 7);
                const sz = { arrow: 30, bolt: 40, orb: 22, heroorb: 24, frostorb: 22, fireball: 46, shell: p.big ? 22 : 16, fireshell: 30 }[p.kind];
                const ang = p.dur ? Math.atan2(p.ty - p.fy, p.tx - p.fx) : (p.ang || 0);
                const rot = p.kind === 'arrow' || p.kind === 'bolt' || p.kind === 'fireball' || p.kind === 'fireshell';
                x.save(); x.translate(p.x, p.y); if (rot) x.rotate(ang);
                x.imageSmoothingEnabled = true;
                if (p.kind === 'bolt') x.filter = 'brightness(1.4) sepia(1) saturate(4)';
                const ar = fx.img.height / fx.img.width;
                x.drawImage(fx.img, -sz / 2, -sz * ar / 2, sz, sz * ar);
                x.restore();
                continue;
            }
            if (p.kind === 'arrow' || p.kind === 'bolt') {
                const a = p.ang || 0, L = p.kind === 'bolt' ? 16 : 11;
                x.strokeStyle = p.kind === 'bolt' ? '#ffe080' : '#e8dcc0'; x.lineWidth = p.kind === 'bolt' ? 3 : 2;
                x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - Math.cos(a) * L, p.y - Math.sin(a) * L); x.stroke();
            } else if (p.kind === 'shell' || p.kind === 'fireshell') {
                shadow(lerp(p.fx, p.tx, p.t / p.dur), lerp(p.fy, p.ty, p.t / p.dur), 6);
                x.fillStyle = p.kind === 'fireshell' ? '#ff7030' : '#2a2e38';
                x.beginPath(); x.arc(p.x, p.y, p.big ? 8 : 5, 0, TAU); x.fill();
                if (p.kind === 'fireshell') { x.fillStyle = '#ffd040'; x.beginPath(); x.arc(p.x, p.y, 3, 0, TAU); x.fill(); }
            } else {
                const col = { orb: '#c080ff', frostorb: '#a0f0ff', heroorb: '#f2c14e', fireball: '#ff7030' }[p.kind] || '#fff';
                const r = p.kind === 'fireball' ? 10 : 6;
                x.fillStyle = col; x.globalAlpha = 0.35; x.beginPath(); x.arc(p.x, p.y, r * 1.8, 0, TAU); x.fill();
                x.globalAlpha = 1; x.beginPath(); x.arc(p.x, p.y, r, 0, TAU); x.fill();
                x.fillStyle = '#fff'; x.beginPath(); x.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.35, 0, TAU); x.fill();
            }
        }

        // beams & slashes
        for (const b of B.beams) {
            const k = b.life / b.max;
            x.globalAlpha = k; x.strokeStyle = b.color; x.lineWidth = b.w; x.lineCap = 'round';
            const slashImg = b.arc && Art.gen('fx_slash');
            if (slashImg) {
                const sz = b.w > 4 ? 70 : 54;
                x.save(); x.translate(b.x, b.y); if (b.dir < 0) x.scale(-1, 1); x.imageSmoothingEnabled = true;
                x.globalAlpha = k; x.drawImage(slashImg.img, -sz * 0.35, -sz / 2, sz, sz); x.restore();
            } else if (b.arc) {
                x.beginPath(); x.arc(b.x - b.dir * 10, b.y, 20, b.dir > 0 ? -1.2 : Math.PI - 1.2 + 0.4, b.dir > 0 ? 1.0 : Math.PI + 1.2 + 0.4); x.stroke();
            } else {
                x.beginPath();
                for (let i = 0; i < b.pts.length; i++) {
                    const p = b.pts[i];
                    if (i === 0) x.moveTo(p[0], p[1]);
                    else if (b.zig) {
                        const q = b.pts[i - 1], n = 4;
                        for (let j = 1; j <= n; j++) {
                            const t = j / n;
                            x.lineTo(lerp(q[0], p[0], t) + (j < n ? (Math.random() * 2 - 1) * 9 : 0), lerp(q[1], p[1], t) + (j < n ? (Math.random() * 2 - 1) * 9 : 0));
                        }
                    } else x.lineTo(p[0], p[1]);
                }
                x.stroke();
                if (b.w > 6) { x.strokeStyle = '#fff'; x.lineWidth = b.w * 0.35; x.stroke(); }
            }
            x.globalAlpha = 1;
        }

        // particles
        for (const p of B.parts) {
            x.globalAlpha = clamp(p.life / p.max, 0, 1);
            x.fillStyle = p.color;
            if (p.streak) x.fillRect(Math.round(p.x), Math.round(p.y), 2, 10);
            else { const s = Math.max(1, Math.round(p.size)); x.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); }
        }
        x.globalAlpha = 1;
        // rings
        for (const r of B.rings) {
            const k = 1 - r.life / r.max, rad = lerp(r.r0, r.r1, k);
            x.globalAlpha = (1 - k) * (r.fill ? 0.5 : 0.9);
            const boom = r.fill && Art.gen('fx_boom');
            if (boom) {
                const s = r.r1 * 2 * (0.55 + k * 0.6);
                x.globalAlpha = k < 0.2 ? 1 : (1 - k) / 0.8; x.imageSmoothingEnabled = true;
                x.drawImage(boom.img, r.x - s / 2, r.y - s * 0.7, s, s);
                continue;
            }
            if (r.fill) { x.fillStyle = r.color; x.beginPath(); x.ellipse(r.x, r.y, rad, rad * 0.6, 0, 0, TAU); x.fill(); }
            x.strokeStyle = r.color; x.lineWidth = 3; x.beginPath(); x.ellipse(r.x, r.y, rad, rad * 0.6, 0, 0, TAU); x.stroke();
        }
        x.globalAlpha = 1;

        // death pops: swell, flash white, fade
        for (const c of B.corpses) {
            const dur = c.boss ? 0.8 : 0.32, k = c.t / dur;
            const s = Art.enemy(c.kind, 0);
            const sw = 1 + k * 0.35;
            spr(s, c.x, c.y - (c.fly ? 26 : 0) - k * 10, 2, c.dir < 0, 1 - k, 1 - k, sw, sw * (1 - k * 0.2));
        }
        // hit sparks
        const sparkImg = Art.gen('fx_hit'), critImg = Art.gen('fx_crit');
        for (const sp of B.sparks) {
            const k = 1 - sp.life / sp.max, im = sp.crit ? critImg : sparkImg;
            const sz = (sp.crit ? 70 : 38) * sp.s * (0.6 + k * 0.6);
            x.save(); x.globalAlpha = 1 - k * k; x.translate(sp.x, sp.y); x.rotate(sp.ang); x.imageSmoothingEnabled = true;
            if (im) x.drawImage(im.img, -sz / 2, -sz / 2, sz, sz);
            else { x.fillStyle = sp.crit ? '#ffb22a' : '#fff4dc'; x.beginPath(); x.arc(0, 0, sz * 0.25, 0, TAU); x.fill(); }
            x.restore();
        }
        // coins flying to the gold counter (top-left HUD)
        const coinImg = Art.gen('fx_coin') || Art.gen('i_gold');
        for (const c of B.coins) {
            const k = Math.min(1, c.t / c.dur), e2 = k * k * (3 - 2 * k);
            const tx = view.goldPos.x, ty = view.goldPos.y;
            const px = lerp(c.x, tx, e2), py = lerp(c.y, ty, e2) - Math.sin(k * Math.PI) * 70;
            const sz = 22 * (1 - k * 0.35);
            x.globalAlpha = 1; x.imageSmoothingEnabled = true;
            if (coinImg) x.drawImage(coinImg.img, px - sz / 2, py - sz / 2, sz, sz);
        }
        // kill combo counter
        if (B.combo.n >= 3 && B.t - B.combo.t < 2.2) {
            const fade = clamp((2.2 - (B.t - B.combo.t)) / 0.4, 0, 1);
            const pulse = 1 + Math.max(0, 0.25 - (B.t - B.combo.t)) * 1.6;
            x.globalAlpha = fade; x.textAlign = 'right'; x.lineJoin = 'round';
            const sz = Math.round(34 * pulse * view.textMul);
            x.font = `${sz}px Lilita, BlackHan`; x.lineWidth = sz * 0.22; x.strokeStyle = '#2a1206';
            const cy = view.textMul > 1 ? 196 : 120;
            x.strokeText(B.combo.n + '', W - 24, cy); x.fillStyle = B.combo.n >= 25 ? '#ff7a3a' : '#ffd04a'; x.fillText(B.combo.n + '', W - 24, cy);
            x.font = `${Math.round(17 * view.textMul)}px BlackHan`; x.lineWidth = 4;
            x.strokeText(L('연속 처치'), W - 24, cy + 24 * view.textMul); x.fillStyle = '#fff3d6'; x.fillText(L('연속 처치'), W - 24, cy + 24 * view.textMul);
            x.globalAlpha = 1;
        }

        // damage numbers
        x.textAlign = 'center'; x.lineJoin = 'round';
        for (const t of B.texts) {
            const k = t.life / t.max, age = t.max - t.life;
            const pop = age < 0.08 ? 0.6 + age / 0.08 * 0.7 : age < 0.16 ? 1.3 - (age - 0.08) / 0.08 * 0.3 : 1;
            const size = Math.round(t.size * (t.big ? 1.15 : 1) * pop * view.textMul * 1.15);
            x.globalAlpha = clamp(k * 2.5, 0, 1);
            x.font = `${size}px Lilita, BlackHan`;
            x.lineWidth = Math.max(4, size * 0.24); x.strokeStyle = '#2a1206'; x.strokeText(t.str, t.x, t.y);
            const g = x.createLinearGradient(0, t.y - size * 0.8, 0, t.y);
            g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, t.color); g.addColorStop(1, shade(t.color));
            x.fillStyle = g; x.fillText(t.str, t.x, t.y);
        }
        x.globalAlpha = 1;

        // aiming reticle for armed skill/spell
        if (view.aim) {
            const a = view.aim, m = view.mouse;
            x.strokeStyle = a.color; x.lineWidth = 2; x.setLineDash([6, 5]);
            if (a.line) {
                const h = B.hero, ang = Math.atan2(m.y - h.y, m.x - h.x);
                x.save(); x.translate(h.x, h.y); x.rotate(ang); x.globalAlpha = 0.85;
                x.strokeRect(0, -a.wid / 2, a.len, a.wid); x.fillStyle = a.color; x.globalAlpha = 0.12; x.fillRect(0, -a.wid / 2, a.len, a.wid); x.restore();
            } else {
                x.beginPath(); x.ellipse(m.x, m.y, a.r, a.r * 0.6, 0, 0, TAU); x.stroke();
                x.fillStyle = a.color; x.globalAlpha = 0.12; x.fill(); x.globalAlpha = 1;
            }
            x.setLineDash([]);
        }

        // boss HP bar
        if (B.bossRef && !B.bossRef.dead) {
            const e = B.bossRef, bw = 520, bx = W / 2 - bw / 2, by = view.textMul > 1 ? 112 : 84;   // label sits below the HUD chips (raid chip is wide)
            x.fillStyle = 'rgba(26,14,6,.9)'; x.fillRect(bx - 4, by - 4, bw + 8, 22);
            x.fillStyle = '#5a1420'; x.fillRect(bx, by, bw, 14);
            x.fillStyle = e.invulnUntil > T ? '#c8d2f0' : '#e8505c'; x.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 14);
            x.fillStyle = '#fff'; x.globalAlpha = 0.25; x.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 4); x.globalAlpha = 1;
            x.font = '18px BlackHan'; x.textAlign = 'left'; x.lineWidth = 4; x.strokeStyle = '#2a1206';
            const label = `${e.def.title} ${e.def.name}`;
            x.strokeText(label, bx, by - 8); x.fillStyle = '#ffd36b'; x.fillText(label, bx, by - 8);
            x.textAlign = 'right'; const pc = Math.ceil(e.hp / e.maxHp * 100) + '%';
            x.strokeText(pc, bx + bw, by - 8); x.fillStyle = '#fff'; x.fillText(pc, bx + bw, by - 8);
        }
        x.setTransform(1, 0, 0, 1, 0, 0);
        if (B.cutin) drawCutin(B.cutin);
        if (B.flash > 0) {
            // white edge flash: bright rim, clear centre
            const a = Math.min(1, B.flash / 0.12) * 0.55;
            const g = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
            g.addColorStop(0, 'rgba(255,248,230,0)'); g.addColorStop(1, `rgba(255,248,230,${a})`);
            x.fillStyle = g; x.fillRect(0, 0, W, H);
        }
    }

    // ultimate cut-in: dim -> diagonal band with speed lines -> hero art slides in and holds -> skill name stamp -> out
    const CUT_COL = { knight: ['#2e5fb8', '#8fc0ff'], mage: ['#7a3fc0', '#e0b0ff'], ranger: ['#2f7a3a', '#b8f080'] };
    function drawCutin(c) {
        const k = c.t / c.dur;
        const ein = Math.min(1, c.t / 0.18), eout = k > 0.82 ? (k - 0.82) / 0.18 : 0;
        const ease = t => 1 - Math.pow(1 - t, 3);
        x.save();
        // dim
        x.fillStyle = `rgba(10,5,2,${0.55 * ein * (1 - eout)})`; x.fillRect(0, 0, W, H);
        // diagonal band
        const [c1, c2] = CUT_COL[c.cls] || CUT_COL.knight;
        const bandH = 300, cy = H / 2, slant = 120;
        const off = (1 - ease(ein)) * W + eout * -W;
        x.translate(off, 0);
        const g = x.createLinearGradient(0, cy - bandH / 2, 0, cy + bandH / 2);
        g.addColorStop(0, c2); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
        x.fillStyle = g;
        x.beginPath(); x.moveTo(-50, cy - bandH / 2 + slant); x.lineTo(W + 50, cy - bandH / 2 - slant); x.lineTo(W + 50, cy + bandH / 2 - slant); x.lineTo(-50, cy + bandH / 2 + slant); x.closePath(); x.fill();
        x.strokeStyle = '#fff3d6'; x.lineWidth = 8; x.stroke();
        // speed lines across the band
        x.save(); x.clip();
        const tnow = performance.now() / 1000;
        x.strokeStyle = 'rgba(255,255,255,.55)';
        for (let i = 0; i < 26; i++) {
            const yy = ((i * 53) % bandH) - bandH / 2 + cy, len = 120 + (i * 37) % 220;
            const xx = ((tnow * 2400 + i * 310) % (W + 600)) - 300;
            x.lineWidth = 2 + (i % 3) * 2;
            x.beginPath(); x.moveTo(W - xx, yy - (W - xx - W / 2) * slant / (W / 2) * 0); x.lineTo(W - xx - len, yy); x.stroke();
        }
        // hero art: slides from the left, holds, then flies off
        const art = Art.gen('ct_' + c.cls) && !c.skin ? Art.gen('ct_' + c.cls) : Art.gen(c.skin ? 'ps_' + c.skin : 'p_' + c.cls);
        if (art) {
            const ax = W * 0.3 + (1 - ease(Math.min(1, c.t / 0.3))) * -300 + eout * 400;
            const sz = 420, ar = art.img.height / art.img.width;
            x.imageSmoothingEnabled = true;
            x.drawImage(art.img, ax - sz / 2, cy - sz * ar / 2 - 10, sz, sz * ar);
        }
        x.restore();
        // skill name stamp
        const st = Math.max(0, c.t - 0.22), sk = st < 0.12 ? 1.8 - st / 0.12 * 0.8 : 1;
        if (c.t > 0.22) {
            x.save(); x.translate(W * 0.68, cy + 10); x.rotate(-0.12); x.scale(sk, sk);
            x.font = `${Math.round(70 * (view.textMul > 1 ? 1.1 : 1))}px BlackHan`; x.textAlign = 'center'; x.lineJoin = 'round';
            x.lineWidth = 14; x.strokeStyle = '#2a1206'; x.strokeText(c.name, 0, 0);
            x.fillStyle = '#fff3d6'; x.fillText(c.name, 0, 0);
            x.font = '28px BlackHan'; x.lineWidth = 8; x.strokeText(L('필살기!'), -120, -64); x.fillStyle = '#ffd04a'; x.fillText(L('필살기!'), -120, -64);
            x.restore();
        }
        x.restore();
    }

    function drawTower(B, s, T, now) {
        const t = s.tower;
        const pop = Math.max(0, 1 - (T - t.built) / 0.25);
        const sc = 2 * (1 + pop * 0.25);
        shadow(s.x, s.y + 12, 30);
        const stunned = t.stunUntil > T;
        const rc = t.recoil > 0 ? t.recoil / 0.12 : 0;
        spr(Art.tower(t.type, t.lv, t.spec != null ? TOWERS[t.type].specs[t.spec].id : null), s.x, s.y + 14, sc, false, 0, 1, 1 + rc * 0.05, 1 - rc * 0.07);
        if (B.coop && (t.owner || 0) !== B.actor) { x.fillStyle = 'rgba(120,200,255,.9)'; x.strokeStyle = '#1a2a40'; x.lineWidth = 2; x.beginPath(); x.arc(s.x + 22, s.y + 8, 6, 0, TAU); x.fill(); x.stroke(); }   // the partner's tower
        if (stunned) {
            x.globalAlpha = 0.45; x.fillStyle = '#2a1708'; x.fillRect(s.x - 30, s.y - 66, 60, 80); x.globalAlpha = 1;
            for (let i = 0; i < 3; i++) {
                const a = now * 4 + i * TAU / 3;
                x.fillStyle = '#ffe060'; x.fillRect(s.x + Math.cos(a) * 16 - 2, s.y - 70 + Math.sin(a) * 5, 4, 4);
            }
        }
        if (t.type === 'archer') {
            // tiny archer turning toward target
            x.fillStyle = '#ffe0c8';
        }
        // level pips
        const lvN = t.spec !== null ? 4 : t.lv + 1;
        for (let i = 0; i < lvN; i++) {
            x.fillStyle = t.spec !== null ? '#ffd04a' : '#f3e3c3';
            x.fillRect(s.x - lvN * 4 + i * 8, s.y + 18, 6, 4);
        }
    }

    function drawSoldier(B, s, T) {
        if (s.deadUntil > T) return;
        shadow(s.x, s.y, 9);
        const f = Math.floor(s.walk) % 2;
        const ss = Art.soldier(s.kind, f);
        // soft "bun" breathing: chubby cats squish a little while standing
        const br = 1 + Math.sin(performance.now() / 300 + s.hx) * 0.035;
        spr(ss, s.x, s.y - (ss.hi ? Math.abs(Math.sin(s.walk * Math.PI / 2)) * 2 : 0), 2, s.dir < 0, s.flash, 1, 2 - br, br);
        if (s.hp < s.maxHp) bar(s.x, s.y - ss.h * 2 - 6, 22, s.hp / s.maxHp, '#7fe08a', 3);
    }

    function drawEnemy(B, e, T, now) {
        const fly = e.def.fly;
        const sc = e.def.boss ? 2 : 2;
        const lift = fly ? 26 + Math.sin(now * 6 + e.id) * 3 : 0;
        shadow(e.x, e.y, e.def.size * 0.7);
        const f = Math.floor(e.walk) % 2;
        const s = Art.enemy(e.kind, f);
        const casting = e.cast ? Math.sin(now * 30) * 2 : 0;
        const bob = s.hi && !fly ? Math.abs(Math.sin(e.walk * Math.PI / 2)) * 3 : 0;
        const q = e.squash > 0 ? e.squash / 0.14 : 0;
        spr(s, e.x + casting, e.y - lift - bob, sc, e.dir < 0, e.flash, 1, 1 + q * 0.18, 1 - q * 0.16);
        if (e.slowUntil > T) { x.fillStyle = 'rgba(160,240,255,.35)'; x.fillRect(e.x - s.w, e.y - lift - 6, s.w * 2, 6); }
        if (e.stunUntil > T) {
            for (let i = 0; i < 3; i++) { const a = now * 5 + i * 2.1; x.fillStyle = '#ffe060'; x.fillRect(e.x + Math.cos(a) * 10 - 2, e.y - lift - s.h * sc - 6 + Math.sin(a) * 3, 3, 3); }
        }
        if (e.hasteUntil > T) { x.fillStyle = 'rgba(255,60,60,.5)'; x.fillRect(e.x - 8, e.y - lift - s.h * sc - 10, 16, 3); }
        if (!e.def.boss && (e.hp < e.maxHp || e.def.elite)) bar(e.x, e.y - lift - s.h * sc - 8, e.def.elite ? 36 : 24, e.hp / e.maxHp, e.def.elite ? '#ff9a4a' : '#e8505c', e.def.elite ? 4 : 3);
    }

    function drawHero(B, h, T, now) {
        const blink = h.dash ? 0.6 : 1;
        drawGhosts(now);
        shadow(h.x, h.y, 12);
        if (h.oathUntil > T) { x.strokeStyle = 'rgba(242,193,78,.8)'; x.lineWidth = 2; x.beginPath(); x.ellipse(h.x, h.y - 20, 22, 26, 0, 0, TAU); x.stroke(); }
        if (h.galeUntil > T) { x.strokeStyle = 'rgba(127,255,176,.7)'; x.lineWidth = 2; x.beginPath(); x.ellipse(h.x, h.y, 18 + Math.sin(now * 10) * 2, 7, 0, 0, TAU); x.stroke(); }
        const f = h.moveTo ? Math.floor(h.walk) % 2 : 0;
        // gold ring marks the player's hero
        x.strokeStyle = B.heroManual() ? '#7fd4ff' : '#f2c14e'; x.lineWidth = 2;
        x.beginPath(); x.ellipse(h.x, h.y, 15, 6, 0, 0, TAU); x.stroke();
        const hs = h.skin ? heroSprite(h.cls, h.skin) : Art.hero(h.cls, f);
        const lg = h.lunge > 0 ? Math.sin((h.lunge / 0.14) * Math.PI) * 9 * h.dir : 0;
        const hb = 1 + Math.sin(now * 3.2) * 0.04;
        spr(hs, h.x + lg, h.y - (hs.hi && h.moveTo ? Math.abs(Math.sin(h.walk * Math.PI / 2)) * 3 : 0), 2, h.dir < 0, h.flash, blink, 2 - hb, hb);
        bar(h.x, h.y - hs.h * 2 - 8, 34, h.hp / h.maxHp, '#7fe08a', 4);
        if (h.moveTo && B.heroManual()) {
            x.strokeStyle = 'rgba(127,212,255,.6)'; x.lineWidth = 1; x.setLineDash([3, 4]);
            x.beginPath(); x.moveTo(h.x, h.y); x.lineTo(h.moveTo.x, h.moveTo.y); x.stroke(); x.setLineDash([]);
        }
    }

    // the co-op partner's hero: no ring of mine, a blue name tag instead
    function drawMate(B, h, T, now) {
        shadow(h.x, h.y, 12);
        x.strokeStyle = 'rgba(120,200,255,.85)'; x.lineWidth = 2;
        x.beginPath(); x.ellipse(h.x, h.y, 15, 6, 0, 0, TAU); x.stroke();
        const f = h.moveTo ? Math.floor(h.walk) % 2 : 0;
        const hs = h.skin ? heroSprite(h.cls, h.skin) : Art.hero(h.cls, f);
        const lg = h.lunge > 0 ? Math.sin((h.lunge / 0.14) * Math.PI) * 9 * h.dir : 0;
        spr(hs, h.x + lg, h.y, 2, h.dir < 0, h.flash, h.dash ? 0.6 : 1);
        bar(h.x, h.y - hs.h * 2 - 8, 34, h.hp / h.maxHp, '#7fc8ff', 4);
        x.font = `bold ${Math.round(13 * view.textMul)}px Jua, sans-serif`; x.textAlign = 'center'; x.lineWidth = 3; x.strokeStyle = 'rgba(20,30,50,.85)'; x.fillStyle = '#bfe4ff';
        const nm = typeof Coop !== 'undefined' ? Coop.partnerName() : '';
        x.strokeText(nm, h.x, h.y - hs.h * 2 - 14); x.fillText(nm, h.x, h.y - hs.h * 2 - 14);
    }

    // 냥이 총출동 ally: the hero's own look, a little see-through, with a golden ring that fades in its last second
    function drawAlly(B, a, T, now) {
        const fade = Math.min(1, (a.until - T) / 1);
        shadow(a.x, a.y, 12);
        x.strokeStyle = `rgba(255,224,138,${0.8 * fade})`; x.lineWidth = 2;
        x.beginPath(); x.ellipse(a.x, a.y, 16 + Math.sin(now * 8) * 2, 6, 0, 0, TAU); x.stroke();
        const hs = a.skin ? heroSprite(a.cls, a.skin) : Art.hero(a.cls, 0);
        const lg = a.lunge > 0 ? Math.sin((a.lunge / 0.14) * Math.PI) * 9 * a.dir : 0;
        spr(hs, a.x + lg, a.y, 2, a.dir < 0, 0, 0.85 * fade);
    }

    function drawDrop(d, now) {
        const col = RARITY[d.r].color;
        const k = d.t / d.life;
        const a = k < 0.8 ? 1 : (1 - k) / 0.2;
        const hgt = d.r === 0 ? 50 : 90 + d.r * 30;
        const grad = x.createLinearGradient(0, d.y - hgt, 0, d.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, col);
        x.globalAlpha = a * (d.r === 0 ? 0.35 : 0.75);
        x.fillStyle = grad;
        const wdt = 10 + d.r * 3 + Math.sin(now * 8) * 2;
        x.fillRect(d.x - wdt / 2, d.y - hgt, wdt, hgt);
        x.globalAlpha = a * 0.5; x.fillStyle = col;
        x.beginPath(); x.ellipse(d.x, d.y, 18 + d.r * 4, 7, 0, 0, TAU); x.fill();
        x.globalAlpha = a;
        const bob = Math.sin(now * 5) * 3 - Math.min(1, d.t * 4) * 10;
        const ic = Art.icon(d.slot);
        x.drawImage(ic.img, d.x - 12, d.y - 24 + bob, 24, 24);
        if (d.r >= 2) {
            x.font = '14px Jua'; x.textAlign = 'center'; x.lineWidth = 3; x.strokeStyle = '#000';
            x.strokeText(RARITY[d.r].name, d.x, d.y - 34 + bob); x.fillStyle = col; x.fillText(RARITY[d.r].name, d.x, d.y - 34 + bob);
        }
        x.globalAlpha = 1;
    }

    // map-screen backdrop painter (reuses battle background art)
    function drawBackdrop(mapKey, theme, dim = 0.55) {
        const sc = Art.gen(mapKey);
        if (sc) {
            x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = true;
            // slow drift so the scene feels alive
            const t = performance.now() / 1000, z = 1.04 + Math.sin(t * 0.1) * 0.02;
            x.drawImage(sc.img, -(W * z - W) / 2 + Math.sin(t * 0.07) * 10, -(H * z - H) / 2, W * z, H * z);
            x.fillStyle = `rgba(20,10,4,${dim})`; x.fillRect(0, 0, W, H);
            return;
        }
        if (!MAPS[mapKey]) mapKey = 'm1';
        const key = mapKey + theme;
        if (bgFor !== key) { bg = Art.background(MAPS[mapKey], theme, []); bgFor = key; }
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.drawImage(bg, 0, 0);
        x.fillStyle = 'rgba(20,10,4,.55)'; x.fillRect(0, 0, W, H);
    }

    return { init, draw, view, drawBackdrop };
})();
