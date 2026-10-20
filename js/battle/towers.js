'use strict';
// Battle towers and barracks soldiers: build/upgrade/sell, stats, targeting, soldier combat, damage to allies.
// Methods of Battle (js/battle/core.js), split by role; loaded right after core.js.
Object.assign(Battle.prototype, {

    // ------------------------------------------------------------ towers
    // 협동 디펜스: only the player who built a tower upgrades, sells or moves its rally point
    ownsTower(t) { return !this.coop || (t.owner || 0) === (this.actor || 0); },

    towerCost(type, lv, spec) {
        const d = TOWERS[type];
        const c = spec !== undefined && spec !== null ? d.specs[spec].cost : d.lv[lv].cost;
        return Math.round(c * (1 - this.b.buildDiscount));
    },

    build(slot, type) {
        const cost = this.towerCost(type, 0);
        if (slot.tower || this.gold < cost || this.ban === type) return false;
        this.gold -= cost;
        const t = { type, lv: 0, spec: null, spent: cost, cd: 0.3, stunUntil: 0, aim: 0, shots: 0, built: this.t, soldiers: [], owner: this.actor || 0 };
        slot.tower = t;
        if (type === 'barracks') { t.rally = this.defaultRally(slot); this.syncSoldiers(slot); }
        this.debris(slot.x, slot.y + 10, '#c8a070', 10);
        if (this.cond && (this.cond.tower === type || (this.cond.id === 'max8' && this.slots.filter(s => s.tower).length > 8))) this.breakCond();
        this.on('build', type);
        return true;
    },

    upgrade(slot, spec) {
        const t = slot.tower;
        if (!t || !this.ownsTower(t)) return false;
        let cost;
        if (spec !== undefined && spec !== null) { if (t.lv !== 2 || t.spec !== null) return false; cost = this.towerCost(t.type, 0, spec); }
        else { if (t.lv >= 2) return false; cost = this.towerCost(t.type, t.lv + 1); }
        if (this.gold < cost) return false;
        this.gold -= cost; t.spent += cost;
        if (spec !== undefined && spec !== null) t.spec = spec; else t.lv++;
        t.built = this.t;
        if (t.type === 'barracks') this.syncSoldiers(slot, true);
        this.burstParts(slot.x, slot.y - 10, '#ffe08a', 16, 120);
        this.on('upgrade', t.type);
        return true;
    },

    sell(slot) {
        const t = slot.tower;
        if (!t || !this.ownsTower(t)) return 0;
        const v = Math.round(t.spent * SELL_RATIO);
        this.gold += v;
        for (const s of t.soldiers) { this.releaseBlock(s); s.gone = true; }
        this.soldiers = this.soldiers.filter(s => !s.gone);
        slot.tower = null;
        this.debris(slot.x, slot.y, '#8a8fa0', 12);
        this.on('sell', v);
        return v;
    },

    setRally(slot, x, y) {
        const t = slot.tower;
        if (!t || t.type !== 'barracks' || !this.ownsTower(t)) return false;
        const st = this.towerStats(t);
        if (dist(slot.x, slot.y, x, y) > st.range) return false;
        let best = null;
        for (const p of this.paths) { const pr = p.project(x, y); if (!best || pr.dist < best.dist) best = { ...pr, p }; }
        if (best.dist > 40) return false;
        const a = best.p.at(best.d);
        t.rally = { x: a.x, y: a.y };
        t.soldiers.forEach((s, i) => { const o = this.formation(i, t.soldiers.length); s.hx = a.x + o.x; s.hy = a.y + o.y; this.releaseBlock(s); s.target = null; });
        this.ringFx(a.x, a.y, 26, '#f2c14e');
        return true;
    },

    defaultRally(slot) {
        let best = null;
        for (const p of this.paths) { const pr = p.project(slot.x, slot.y); if (!best || pr.dist < best.dist) best = { ...pr, p }; }
        const a = best.p.at(best.d);
        return { x: a.x, y: a.y };
    },

    formation(i, n) {
        const ang = (i / n) * TAU + 0.6;
        return { x: Math.cos(ang) * 16, y: Math.sin(ang) * 9 };
    },

    syncSoldiers(slot, refresh) {
        const t = slot.tower, st = this.towerStats(t);
        const kind = t.spec === 0 ? 'paladin' : t.spec === 1 ? 'berserk' : 'soldier';
        while (t.soldiers.length < st.count) {
            const o = this.formation(t.soldiers.length, st.count);
            const s = { kind, x: slot.x, y: slot.y + 12, hx: t.rally.x + o.x, hy: t.rally.y + o.y, hp: st.hp, maxHp: st.hp, atk: st.atk, armor: st.armor,
                cd: 0, target: null, deadUntil: 0, tower: t, dir: 1, walk: 0, flash: 0, regen: st.regen || 0 };
            t.soldiers.push(s); this.soldiers.push(s);
        }
        t.soldiers.forEach((s, i) => {
            const o = this.formation(i, t.soldiers.length);
            s.hx = t.rally.x + o.x; s.hy = t.rally.y + o.y;
            if (refresh) { s.kind = kind; s.maxHp = st.hp; s.hp = st.hp; s.atk = st.atk; s.armor = st.armor; s.regen = st.regen || 0; }
        });
    },

    towerStats(t) {
        const d = TOWERS[t.type], b = this.coop ? this.acts[t.owner || 0].b : this.b;   // co-op: the builder's research
        const base = t.spec !== null ? d.specs[t.spec] : d.lv[t.lv];
        const s = { ...base };
        if (t.type === 'barracks') {
            s.hp = base.hp * (1 + b.soldierHp) * (1 + 0.1 * Math.max(0, this.stageIdx) * 0.5);
            s.atk = base.atk * (1 + b.soldierAtk + b.towerDmg);
            s.count = base.count + b.extraSoldier;
            s.armor = Math.min(0.75, base.armor + (b.soldierArmor || 0));
            return s;
        }
        s.dmg = base.dmg * (1 + b.towerDmg + (b[t.type + 'Dmg'] || 0));
        if (t.type === 'archer') { s.range = base.range * (1 + b.archerRange); s.crit = (base.crit || 0) + b.archerCrit; s.critMul = base.critMul || 2.5; s.rate = base.rate / (1 + (b.archerRate || 0)); }
        if (t.type === 'mage') s.rate = base.rate / (1 + b.mageRate);
        if (t.type === 'cannon') s.splash = base.splash * (1 + b.cannonSplash);
        return s;
    },

    hurtAlly(a, amt) {
        if (a.isHero) {
            const h = a;
            if (h.dash || h.deadUntil > this.t) return;
            let v = amt * (h.oathUntil > this.t ? 0.5 : 1) * (h.cls === 'knight' ? 0.75 : 1);
            h.hp -= v; h.flash = 0.1;
            this.text(h.x, h.y - 44, Math.round(v), '#ff7070', 14);
            if (h.hp <= 0) {
                h.hp = 0; h.deadUntil = this.t + HERO_RESPAWN; this.releaseBlock(h); h.moveTo = null;
                this.burstParts(h.x, h.y - 10, '#c8d0e0', 20, 150);
                this.on('heroDown', h);
            }
            return;
        }
        const v = amt * (1 - (a.armor || 0));
        a.hp -= v; a.flash = 0.1;
        if (a.hp <= 0) {
            this.releaseBlock(a);
            a.target = null;
            if (a.kind === 'militia') { a.gone = true; }
            else { a.deadUntil = this.t + TOWERS.barracks.respawn * this.b.respawnMul; a.hp = a.maxHp; }
            this.burstParts(a.x, a.y - 8, '#c8b090', 8, 90);
        }
    },


    updateTowers(dt) {
        const warp = this.enemies.filter(e => !e.dead && e.def.timewarp);   // 시간 술사: 주변 탑 느리게
        for (const s of this.slots) {
            const t = s.tower;
            if (!t || t.type === 'barracks') continue;
            if (t.stunUntil > this.t) continue;
            let tdt = dt;
            for (const e of warp) if (dist2(s.x, s.y, e.x, e.y) < e.def.timewarp.r ** 2) { tdt = dt * (1 - e.def.timewarp.slow); t.warped = this.t + 0.2; break; }
            t.cd -= tdt;
            if (t.cd > 0) continue;
            const st = this.towerStats(t);
            const air = TOWERS[t.type].air;
            const targets = this.targetsInRange(s.x, s.y, st.range * (this.blindUntil > this.t ? this.blind : 1), air);
            if (!targets.length) { t.cd = 0.1; continue; }
            t.cd = st.rate / (this.chillUntil > this.t ? 1 - this.chill : 1);
            t.shots++;
            t.recoil = 0.12;
            const e = targets[0];
            t.aim = Math.atan2(e.y - s.y, e.x - s.x);
            const sx = s.x, sy = s.y - 34;
            if (t.type === 'archer') {
                const n = st.shots || 1;
                for (let i = 0; i < Math.min(n, targets.length); i++) {
                    this.projs.push({ kind: t.spec === 0 ? 'bolt' : 'arrow', x: sx, y: sy, target: targets[i], tx: targets[i].x, ty: targets[i].y, speed: t.spec === 0 ? 900 : 620,
                        dmg: st.dmg, type: 'phys', critChance: st.crit, critMul: st.critMul, tower: true });
                }
                this.on('shoot', 'arrow');
            } else if (t.type === 'mage') {
                if (t.spec === 0) {
                    this.chainLightning(sx, sy - 6, st.dmg, st.chain, 130, 'magic', false, 0.85, e);
                } else {
                    this.projs.push({ kind: t.spec === 1 ? 'frostorb' : 'orb', x: sx, y: sy - 4, target: e, tx: e.x, ty: e.y, speed: 400, dmg: st.dmg, type: 'magic', tower: true,
                        splash: st.splash || 0, slow: st.slow, slowT: st.slowT, freeze: t.spec === 1 && t.shots % st.freezeEvery === 0 });
                    this.on('shoot', 'magic');
                }
            } else if (t.type === 'cannon') {
                const lead = t.spec === 0 ? 0.9 : 0.6;
                const fut = e.path.at(e.d + (e.blockedBy || e.stunUntil > this.t ? 0 : e.def.spd * lead));
                this.projs.push({ kind: t.spec === 1 ? 'fireshell' : 'shell', x: sx, y: sy, fx: sx, fy: sy, tx: fut.x, ty: fut.y, t: 0, dur: lead, arc: t.spec === 0 ? 160 : 70,
                    dmg: st.dmg, type: 'phys', splash: st.splash, tower: true, burn: st.burn, burnT: st.burnT, big: t.spec === 0 });
                this.parts.push({ x: sx + Math.cos(t.aim) * 14, y: sy, vx: 0, vy: -30, life: 0.3, max: 0.3, color: '#d0d0d0', size: 6 });
            }
        }
    },

    // ground or air targets in range, sorted by progress (closest to gate first)
    targetsInRange(x, y, r, air) {
        const r2 = r * r, out = [];
        for (const e of this.enemies) {
            if (e.dead || (e.def.fly && !air) || e.burrowUntil > this.t) continue;
            if (dist2(x, y, e.x, e.y) <= r2) out.push(e);
        }
        out.sort((a, b) => this.progress(b) - this.progress(a));
        return out;
    },

    chainLightning(x, y, dmg, n, hop, type, hero, falloff, first) {
        const hit = new Set();
        let cur = first || null, px = x, py = y, d = dmg;
        if (!cur) {
            const c = this.targetsInRange(x, y + 20, hero ? 230 : 180, true);
            cur = c[0];
        }
        const pts = [[px, py]];
        for (let i = 0; i < n && cur; i++) {
            hit.add(cur);
            this.damage(cur, d, type, { hero, tower: !hero, quiet: i > 0 && !hero });
            pts.push([cur.x, cur.y - cur.def.size * 0.6]);
            d *= falloff;
            let next = null, nd = hop * hop;
            for (const e of this.enemies) if (!e.dead && !hit.has(e)) { const dd = dist2(e.x, e.y, cur.x, cur.y); if (dd < nd) { nd = dd; next = e; } }
            cur = next;
        }
        if (pts.length > 1) { this.beams.push({ pts, life: 0.22, max: 0.22, color: '#fff27a', w: 3, zig: true }); this.on('shoot', 'zap'); }
    },


    updateSoldiers(dt) {
        for (const s of this.soldiers) {
            if (s.gone) continue;
            s.flash = Math.max(0, s.flash - dt);
            if (s.expire && this.t > s.expire) { this.releaseBlock(s); s.gone = true; continue; }
            if (s.deadUntil > this.t) { s.x = s.hx; s.y = s.hy; continue; }
            if (s.regen && !s.engaged) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * s.regen * dt);
            if (!s.engaged && s.hp < s.maxHp && !s.target) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.03 * dt);
            // pick a target near home
            if (!s.target || s.target.dead || dist2(s.target.x, s.target.y, s.hx, s.hy) > 95 * 95) {
                if (s.engaged) this.releaseBlock(s);
                s.target = null;
                let best = null, bd = 75 * 75, bestBlocked = null, bbd = 75 * 75;
                for (const e of this.enemies) {
                    if (e.dead || e.def.fly || e.burrowUntil > this.t || e.d < 120) continue;   // not yet on the field
                    const dd = dist2(e.x, e.y, s.hx, s.hy);
                    if (!e.blockedBy && dd < bd) { bd = dd; best = e; }
                    else if (e.blockedBy && dd < bbd) { bbd = dd; bestBlocked = e; }
                }
                s.target = best || bestBlocked;
            }
            const e = s.target;
            let gx = s.hx, gy = s.hy;
            if (e) { gx = e.x + (e.dir > 0 ? 14 : -14); gy = e.y + 2; }
            const dd = dist(s.x, s.y, gx, gy);
            if (dd > 2) {
                const sp = 90 * dt, k = Math.min(1, sp / dd);
                s.x += (gx - s.x) * k; s.y += (gy - s.y) * k; s.walk += dt * 8;
                if (Math.abs(gx - s.x) > 1) s.dir = gx > s.x ? 1 : -1;
            }
            if (e && dist(s.x, s.y, e.x, e.y) < 22) {
                if (!e.blockedBy && !s.engaged) { e.blockedBy = s; s.engaged = e; }
                s.dir = e.x > s.x ? 1 : -1;
                s.cd -= dt;
                if (s.cd <= 0) {
                    s.cd = s.kind === 'berserk' ? 0.7 : 1.0;
                    this.damage(e, s.atk, 'phys', { quiet: true });
                    this.on('hit');
                }
            }
        }
        this.soldiers = this.soldiers.filter(s => !s.gone);
    },
});
