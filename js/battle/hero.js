'use strict';
// Battle hero: stats, manual move, skills, spells, AUTO hero AI.
// Methods of Battle (js/battle/core.js), split by role; loaded right after core.js.
Object.assign(Battle.prototype, {

    // ------------------------------------------------------------ hero
    initHero(cls, hs) {
        const H0 = HEROES[cls];
        const guard = this.paths[0].at(this.paths[0].len * 0.72);
        this.hero = {
            cls, x: guard.x, y: guard.y - 10, hp: hs.hp, maxHp: hs.hp, atk: hs.atk, crit: hs.crit,
            rate: H0.rate, range: H0.range, spd: H0.spd, dmgType: H0.dmgType, air: H0.air, block: H0.block,
            lv: hs.lv, cd: 0, target: null, moveTo: null, deadUntil: 0, manualUntil: -1, dir: 1, walk: 0, flash: 0,
            skills: SKILLS[cls].map((s, i) => ({ ...s, left: 0, locked: hs.lv < SKILL_UNLOCK[i], cdMax: s.cd * (1 - hs.cdr) })),
            oathUntil: 0, galeUntil: 0, dash: null, guard: { x: guard.x, y: guard.y - 10 }, engaged: null, skin: this.cfg.skin || null,
        };
    },

    heroManual() { return this.t < this.hero.manualUntil || !this.cfg.autoHero(); },

    commandHeroMove(x, y) {
        const h = this.hero;
        if (!this.heroAlive || h.dash) return;
        h.moveTo = { x: clamp(x, 20, W - 20), y: clamp(y, 60, H - 20) };
        // the tapped spot becomes the hero's new post: AUTO fights around it instead of walking back to the old one
        h.guard = { x: h.moveTo.x, y: h.moveTo.y };
        h.manualUntil = this.t + 3;
        if (h.engaged) { this.releaseBlock(h); }
        this.rings.push({ x, y, r0: 4, r1: 18, life: 0.35, max: 0.35, color: '#7fd4ff' });
    },

    // returns true when cast; for point skills x,y required
    castSkill(i, x, y, manual = true) {
        const h = this.hero, s = h.skills[i];
        if (!s || s.locked || s.left > 0 || !this.heroAlive || h.dash) return false;
        if (manual) h.manualUntil = this.t + 3;
        s.left = s.cdMax;
        const A = h.atk;
        if (i === 3 && (!this.cfg.cutinOn || this.cfg.cutinOn())) {
            // anime-style cut-in: the world freezes while the hero's art sweeps across, then the skill lands
            this.cutin = { cls: h.cls, skin: h.skin, name: s.name, t: 0, dur: 1.1 };
            this.on('cutin', this.cutin);
        }
        const crit = () => Math.random() < h.crit;
        this.on('skill', { i, ult: i === 3 });
        switch (s.id) {
            case 'dash': {
                const ang = Math.atan2(y - h.y, x - h.x), L = Math.min(s.range, dist(h.x, h.y, x, y) + 20);
                if (h.engaged) this.releaseBlock(h);
                h.dash = { fx: h.x, fy: h.y, tx: clamp(h.x + Math.cos(ang) * L, 20, W - 20), ty: clamp(h.y + Math.sin(ang) * L, 60, H - 20), t: 0, dur: 0.22, hit: new Set(), dmg: A * s.coef };
                h.dir = Math.cos(ang) >= 0 ? 1 : -1;
                break;
            }
            case 'quake':
                this.aoe(h.x, h.y, s.r, A * s.coef, 'phys', { stun: s.stun, crit: crit(), hero: true });
                this.ringFx(h.x, h.y, s.r, '#ffe080'); this.debris(h.x, h.y, '#c8a070', 18); this.addShake(6); this.hitstop = Math.max(this.hitstop, 0.06);
                break;
            case 'oath':
                h.oathUntil = this.t + s.dur; h.hp = Math.min(h.maxHp, h.hp + h.maxHp * s.heal);
                for (const e of this.enemies) if (!e.def.fly && !e.def.boss && dist2(e.x, e.y, h.x, h.y) < s.r * s.r && !e.blockedBy) { e.blockedBy = h; }
                this.ringFx(h.x, h.y, s.r, '#f2c14e');
                this.text(h.x, h.y - 40, L('수호!'), '#f2c14e', 20);
                break;
            case 'judge':
                this.teles.push({ shape: 'circle', x, y, r: s.r, t0: this.t, dur: 0.5, color: '#fff4c0', ally: true,
                    done: () => { this.aoe(x, y, s.r, A * s.coef, 'phys', { stun: s.stun, crit: crit(), hero: true, kb: 14 }); this.bigBoom(x, y, s.r, '#fff4c0'); this.addShake(14); this.hitstop = 0.12; this.zoom = 0.18; this.flash = 0.16; } });
                break;
            case 'fireball':
                this.projs.push({ kind: 'fireball', x: h.x, y: h.y - 20, tx: x, ty: y, speed: 520, dmg: A * s.coef, type: 'magic', splash: s.r, hero: true, crit: crit() });
                break;
            case 'frost':
                this.aoe(h.x, h.y, s.r, A * s.coef, 'magic', { stun: s.stun, crit: crit(), hero: true, frost: true });
                this.ringFx(h.x, h.y, s.r, '#a0f0ff'); this.burstParts(h.x, h.y, '#c8ffff', 24, 160);
                break;
            case 'chain':
                this.chainLightning(h.x, h.y - 20, A * s.coef, s.chain, s.range, 'magic', true, 0.9);
                break;
            case 'meteor':
                this.teles.push({ shape: 'circle', x, y, r: s.r, t0: this.t, dur: 0.7, color: '#ff9040', ally: true,
                    done: () => {
                        this.aoe(x, y, s.r, A * s.coef, 'magic', { crit: crit(), hero: true });
                        this.zones.push({ x, y, r: s.r * 0.8, dps: A * s.burn, until: this.t + 3, color: '#ff6020', hero: true });
                        this.bigBoom(x, y, s.r, '#ff9040'); this.addShake(14); this.hitstop = 0.12; this.zoom = 0.18; this.flash = 0.16;
                    } });
                break;
            case 'pierce':
            case 'storm': {
                const ang = Math.atan2(y - h.y, x - h.x);
                const ex = h.x + Math.cos(ang) * s.len, ey = h.y + Math.sin(ang) * s.len;
                for (const e of this.enemies) {
                    const q = closestOnSeg(e.x, e.y, h.x, h.y, ex, ey);
                    if (dist(e.x, e.y, q.x, q.y) < s.wid / 2 + e.def.size * 0.5) {
                        this.damage(e, A * s.coef, 'phys', { crit: crit(), hero: true });
                        if (s.id === 'storm' && !e.def.boss) e.d = Math.max(0, e.d - 50);
                    }
                }
                this.beams.push({ pts: [[h.x, h.y - 16], [ex, ey - 16]], life: s.id === 'storm' ? 0.4 : 0.25, max: s.id === 'storm' ? 0.4 : 0.25, color: s.id === 'storm' ? '#c0f8ff' : '#fff0c0', w: s.id === 'storm' ? 14 : 5 });
                if (s.id === 'storm') { this.addShake(10); this.hitstop = 0.1; this.zoom = 0.15; this.flash = 0.12; }
                break;
            }
            case 'rain':
                for (let k = 0; k < s.ticks; k++) {
                    this.teles.push({ shape: 'none', t0: this.t, dur: 0.25 * (k + 1), done: () => {
                        this.aoe(x, y, s.r, A * s.coef, 'phys', { hero: true, quiet: k % 2 === 1 });
                        for (let j = 0; j < 6; j++) this.parts.push({ x: x + (Math.random() * 2 - 1) * s.r, y: y - 80 + Math.random() * 30, vx: 0, vy: 600, life: 0.15, max: 0.15, color: '#f0e0c0', size: 2, streak: true });
                    } });
                }
                this.teles.push({ shape: 'circle', x, y, r: s.r, t0: this.t, dur: 2.0, color: '#7fd4ff', ally: true, done: () => { } });
                break;
            case 'gale':
                h.galeUntil = this.t + s.dur;
                this.ringFx(h.x, h.y, 60, '#7fffb0');
                break;
        }
        return true;
    },

    castSpell(id, x, y) {
        const sp = this.spells.find(s => s.id === id);
        if (!sp || sp.left > 0 || this.state === 'win' || this.state === 'lose') return false;
        sp.left = sp.cdMax;
        if (this.cond && this.cond.id === 'noSpell') this.breakCond();
        if (id === 'beacon') {
            const dmg = (90 + 30 * Math.max(0, this.stageIdx)) * this.b.beaconMul * (this.endless ? this.hpMul : 1);
            this.teles.push({ shape: 'circle', x, y, r: sp.r, t0: this.t, dur: 0.6, color: '#ff7030', ally: true,
                done: () => {
                    this.aoe(x, y, sp.r, dmg, 'magic', {});
                    this.zones.push({ x, y, r: sp.r * 0.85, dps: dmg * 0.15, until: this.t + 4, color: '#ff5010' });
                    this.bigBoom(x, y, sp.r, '#ff8030'); this.addShake(10);
                } });
            this.on('spell', id);
        } else {
            // snap to nearest path point
            let best = null;
            for (const p of this.paths) { const pr = p.project(x, y); if (!best || pr.dist < best.dist) best = { ...pr, p }; }
            const at = best.p.at(best.d);
            const hp = 90 * (1 + 0.12 * Math.max(0, this.stageIdx)) * (this.endless ? Math.sqrt(this.hpMul) : 1);
            for (let k = 0; k < 2; k++) {
                this.soldiers.push({ kind: 'militia', x: at.x + (k ? 14 : -14), y: at.y + 6, hx: at.x + (k ? 14 : -14), hy: at.y + 6,
                    hp, maxHp: hp, atk: 6 * (1 + 0.1 * Math.max(0, this.stageIdx)), armor: 0.1, cd: 0, target: null, deadUntil: 0, expire: this.t + 20, tower: null, dir: 1, walk: 0, flash: 0 });
            }
            this.ringFx(at.x, at.y, 40, '#f2c14e');
            this.on('spell', id);
        }
        return true;
    },


    updateHero(dt) {
        const h = this.hero;
        h.flash = Math.max(0, h.flash - dt);
        for (const s of h.skills) s.left = Math.max(0, s.left - dt);
        if (!this.heroAlive) return;
        if (h.dash) {
            h.dash.t += dt;
            const k = Math.min(1, h.dash.t / h.dash.dur);
            h.x = lerp(h.dash.fx, h.dash.tx, k); h.y = lerp(h.dash.fy, h.dash.ty, k);
            for (const e of this.enemies) if (!e.dead && !h.dash.hit.has(e) && !e.def.fly && dist2(e.x, e.y, h.x, h.y) < 34 * 34) {
                h.dash.hit.add(e); this.damage(e, h.dash.dmg, 'phys', { hero: true, crit: Math.random() < h.crit });
                this.burstParts(e.x, e.y - 10, '#ffffff', 6, 160);
            }
            this.parts.push({ x: h.x, y: h.y - 10, vx: 0, vy: 0, life: 0.2, max: 0.2, color: '#7fd4ff', size: 5 });
            if (k >= 1) { h.dash = null; this.addShake(4); }
            return;
        }
        if (h.hp < h.maxHp && !h.engaged) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.025 * dt);

        const manual = this.heroManual();
        if (!manual && this.cfg.autoHero()) this.heroAI();

        // movement
        if (h.moveTo) {
            const dd = dist(h.x, h.y, h.moveTo.x, h.moveTo.y);
            if (dd < 4) h.moveTo = null;
            else {
                const k = Math.min(1, h.spd * dt / dd);
                h.dir = h.moveTo.x >= h.x ? 1 : -1;
                h.x += (h.moveTo.x - h.x) * k; h.y += (h.moveTo.y - h.y) * k; h.walk += dt * 9;
                if (h.engaged || h.oathUntil > this.t) this.releaseBlock(h);
            }
        }
        // melee heroes block whatever walks into them; everyone blocks when enemies touch them
        if (!h.moveTo && !h.engaged) {
            for (const e of this.enemies) {
                if (e.dead || e.def.fly || e.blockedBy || e.burrowUntil > this.t) continue;
                if (dist2(e.x, e.y, h.x, h.y) < (h.block ? 30 * 30 : 20 * 20)) { e.blockedBy = h; h.engaged = e; break; }
            }
        }
        if (h.engaged && (h.engaged.dead || h.engaged.blockedBy !== h)) h.engaged = null;

        // attack
        h.cd -= dt * (h.galeUntil > this.t ? 1.8 : 1);
        if (h.cd <= 0) {
            let tgt = h.engaged;
            if (!tgt) {
                const c = this.targetsInRange(h.x, h.y, h.range + (h.block ? 8 : 0), h.air);
                tgt = c.length ? c.reduce((a, b) => dist2(a.x, a.y, h.x, h.y) < dist2(b.x, b.y, h.x, h.y) ? a : b) : null;
                if (!h.block && c.length) tgt = c[0];
            }
            if (tgt && !h.moveTo) {
                h.cd = h.rate;
                h.dir = tgt.x >= h.x ? 1 : -1;
                const crit = Math.random() < h.crit;
                h.lunge = 0.14;
                if (h.cls === 'knight') {
                    this.damage(tgt, h.atk, 'phys', { hero: true, crit, critMul: 2, kb: 4 });
                    this.hitstop = Math.max(this.hitstop, crit ? 0.06 : 0.025);
                    this.slash(h.x + h.dir * 14, h.y - 14, h.dir, crit);
                    this.on('hit', 'hero');
                } else if (h.cls === 'mage') {
                    this.projs.push({ kind: 'heroorb', x: h.x, y: h.y - 22, target: tgt, tx: tgt.x, ty: tgt.y, speed: 520, dmg: h.atk, type: 'magic', hero: true, crit, splash: 30 });
                    this.on('shoot', 'magic');
                } else {
                    this.projs.push({ kind: 'arrow', x: h.x, y: h.y - 18, target: tgt, tx: tgt.x, ty: tgt.y, speed: 760, dmg: h.atk, type: 'phys', hero: true, crit });
                    this.on('shoot', 'arrow');
                }
            } else h.cd = 0.05;
        }
    },

    heroAI() {
        const h = this.hero;
        // boss warnings: AUTO dodges each one only half the time (starspire autoBossDodgeChance), hands do better
        for (const tl of this.teles) {
            if (!tl.boss) continue;
            if (tl.dodge === undefined) tl.dodge = Math.random() < 0.5;
            if (!tl.dodge || !this.inTele(tl, h.x, h.y)) continue;
            const cx = tl.shape === 'circle' ? tl.x : (tl.x1 + tl.x2) / 2, cy = tl.shape === 'circle' ? tl.y : (tl.y1 + tl.y2) / 2;
            let ang = Math.atan2(h.y - cy, h.x - cx);
            if (tl.shape === 'line') ang = Math.atan2(tl.y2 - tl.y1, tl.x2 - tl.x1) + Math.PI / 2;
            const r = (tl.r || tl.wid) + 30;
            if (h.engaged) this.releaseBlock(h);
            h.moveTo = { x: clamp(h.x + Math.cos(ang) * r, 24, W - 24), y: clamp(h.y + Math.sin(ang) * r, 70, H - 24) };
            return;
        }
        // skills first
        h.skills.forEach((s, i) => {
            if (s.locked || s.left > 0) return;
            const near = r => this.enemies.filter(e => !e.dead && dist2(e.x, e.y, h.x, h.y) < r * r);
            const boss = this.bossRef && !this.bossRef.dead ? this.bossRef : null;
            if (s.target === 'point') {
                const reach = s.range || 360;
                const pick = this.bestCluster(h.x, h.y, reach, s.r || 80, s.id === 'dash' ? false : true);
                if (!pick) return;
                const need = i === 3 ? 3 : 2;
                if (pick.n >= need || (boss && dist2(boss.x, boss.y, h.x, h.y) < reach * reach)) {
                    const tx = (boss && (i === 3 || pick.n < need)) ? boss.x : pick.x, ty = (boss && (i === 3 || pick.n < need)) ? boss.y : pick.y;
                    this.castSkill(i, tx, ty, false);
                }
            } else if (s.id === 'oath') {
                if (h.hp < h.maxHp * 0.6 && near(120).length >= 1) this.castSkill(i, 0, 0, false);
            } else if (s.id === 'gale' || s.id === 'chain') {
                if (near(h.range + 30).length >= (s.id === 'chain' ? 2 : 1)) this.castSkill(i, 0, 0, false);
            } else if (near((s.r || 100) * 0.9).length >= 2 || (boss && dist2(boss.x, boss.y, h.x, h.y) < 90 * 90)) {
                this.castSkill(i, 0, 0, false);
            }
        });
        // movement: go to the most advanced enemy the hero can hit, else return to guard
        let focus = null;
        for (const e of this.enemies) {
            if (e.dead || (e.def.fly && !h.air)) continue;
            if (dist(e.x, e.y, h.guard.x, h.guard.y) > HERO_LEASH) continue;
            if (e.d < 120) continue;                                 // still entering the field: towers cannot reach it there
            if (!focus || this.progress(e) > this.progress(focus)) focus = e;
        }
        if (focus) {
            if (h.block) {
                if (h.engaged || dist(h.x, h.y, focus.x, focus.y) < 44) { h.moveTo = null; return; }
                // meet the enemy a little ahead of it on its path
                const a = focus.path.at(focus.d + 30);
                h.moveTo = { x: a.x, y: a.y };
            } else {
                const dd = dist(h.x, h.y, focus.x, focus.y);
                if (dd > h.range * 0.85) {
                    const k = (dd - h.range * 0.7) / dd;
                    h.moveTo = { x: h.x + (focus.x - h.x) * k, y: h.y + (focus.y - h.y) * k };
                } else h.moveTo = null;
            }
        } else if (dist(h.x, h.y, h.guard.x, h.guard.y) > 10) h.moveTo = { ...h.guard };
        else h.moveTo = null;
        if (h.moveTo) { h.moveTo.x = clamp(h.moveTo.x, 24, W - 24); h.moveTo.y = clamp(h.moveTo.y, 70, H - 24); }
    },

    inTele(tl, x, y) {
        if (tl.shape === 'circle') return dist2(x, y, tl.x, tl.y) < tl.r * tl.r;
        if (tl.shape === 'line') { const q = closestOnSeg(x, y, tl.x1, tl.y1, tl.x2, tl.y2); return dist(x, y, q.x, q.y) < tl.wid / 2; }
        return false;
    },

    bestCluster(x, y, reach, r, air) {
        let best = null;
        for (const e of this.enemies) {
            if (e.dead || (!air && e.def.fly)) continue;
            if (dist2(e.x, e.y, x, y) > reach * reach) continue;
            let n = 0;
            for (const o of this.enemies) if (!o.dead && dist2(o.x, o.y, e.x, e.y) < r * r) n++;
            if (!best || n > best.n) best = { x: e.x, y: e.y, n };
        }
        return best;
    },
});
