'use strict';
// Battle projectiles, area damage, ground zones, telegraphs and visual effects.
// Methods of Battle (js/battle/core.js), split by role; loaded right after core.js.
Object.assign(Battle.prototype, {

    updateProjs(dt) {
        for (const p of this.projs) {
            if (p.dur) {
                // ballistic shell
                p.t += dt;
                const k = Math.min(1, p.t / p.dur);
                p.x = lerp(p.fx, p.tx, k); p.y = lerp(p.fy, p.ty, k) - Math.sin(k * Math.PI) * p.arc;
                if (k >= 1) {
                    p.done = true;
                    this.aoeGround(p.tx, p.ty, p.splash, p.dmg, p.type, p);
                    if (p.burn) this.zones.push({ x: p.tx, y: p.ty, r: p.splash * 0.8, dps: p.burn * (1 + this.b.towerDmg + this.b.cannonDmg), until: this.t + p.burnT, color: '#ff6020' });
                    this.bigBoom(p.tx, p.ty, p.splash, p.burn ? '#ff7030' : '#ffd080', true);
                    this.addShake(p.big ? 7 : 3);
                    this.on('boom');
                }
                continue;
            }
            if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y - p.target.def.size * 0.6; }
            const dd = dist(p.x, p.y, p.tx, p.ty);
            const step = p.speed * dt;
            p.ang = Math.atan2(p.ty - p.y, p.tx - p.x);
            if (dd <= step + 4) {
                p.done = true;
                if (p.splash) {
                    this.aoe(p.tx, p.ty, p.splash, p.dmg, p.type, { hero: p.hero, tower: p.tower, crit: p.crit, slow: p.slow, slowT: p.slowT, stun: p.freeze ? 1 : 0, frost: !!p.slow, quiet: false });
                    if (p.kind === 'fireball') { this.bigBoom(p.tx, p.ty, p.splash, '#ff7030'); this.addShake(5); this.hitstop = Math.max(this.hitstop, 0.05); }
                    else this.ringFx(p.tx, p.ty, p.splash, p.kind === 'frostorb' ? '#a0f0ff' : '#d8a8ff');
                } else if (p.target && !p.target.dead) {
                    this.damage(p.target, p.dmg, p.type, { hero: p.hero, tower: p.tower, crit: p.crit, critChance: p.critChance, critMul: p.critMul });
                    this.burstParts(p.tx, p.ty, p.kind === 'orb' ? '#d8a8ff' : '#fff4dc', 3, 60);
                }
            } else { p.x += Math.cos(p.ang) * step; p.y += Math.sin(p.ang) * step; }
        }
        this.projs = this.projs.filter(p => !p.done);
    },

    aoe(x, y, r, dmg, type, o) {
        let n = 0;
        for (const e of this.enemies) {
            if (e.dead) continue;
            if (dist2(e.x, e.y, x, y) <= (r + e.def.size * 0.4) ** 2) {
                n++;
                this.damage(e, dmg, type, { ...o, quiet: o.quiet || (n > 6 && !o.crit) });
                if (o.slow) { e.slowUntil = this.t + o.slowT; e.slowMul = o.slow; }
                if (o.frost && !e.dead) this.parts.push({ x: e.x, y: e.y - 10, vx: 0, vy: -20, life: 0.4, max: 0.4, color: '#c8ffff', size: 3 });
            }
        }
        return n;
    },

    aoeGround(x, y, r, dmg, type, p) {
        for (const e of this.enemies) {
            if (e.dead || e.def.fly) continue;
            if (dist2(e.x, e.y, x, y) <= (r + e.def.size * 0.4) ** 2) {
                const stun = this.b.cannonStun && this.rand() < this.b.cannonStun ? 0.6 : 0;
                this.damage(e, dmg, type, { tower: true, stun, quiet: false, kb: p && p.big ? 16 : 8 });
            }
        }
    },

    updateZones(dt) {
        for (const z of this.zones) {
            if (z.hurtsAllies) {
                // poison / curse pools hurt the player's side, ticking twice a second
                z.tick -= dt;
                if (z.tick <= 0) {
                    z.tick = 0.5;
                    for (const s of this.soldiers) if (s.deadUntil <= this.t && !s.gone && dist2(s.x, s.y, z.x, z.y) < z.r * z.r) this.hurtAlly(s, z.dps * 0.5);
                    for (const hh of this.heroList()) if (hh.deadUntil <= this.t && dist2(hh.x, hh.y, z.x, z.y) < z.r * z.r) this.hurtAlly(hh, z.dps * 0.5);
                }
                if (Math.random() < 0.4) this.parts.push({ x: z.x + (Math.random() * 2 - 1) * z.r * 0.8, y: z.y + (Math.random() * 2 - 1) * z.r * 0.5, vx: 0, vy: -30, life: 0.6, max: 0.6, color: z.color, size: 4 });
                continue;
            }
            for (const e of this.enemies) if (!e.dead && !e.def.fly && dist2(e.x, e.y, z.x, z.y) < z.r * z.r) this.damage(e, z.dps * dt, 'fire', { quiet: true, hero: z.hero });
            if (Math.random() < 0.5) this.parts.push({ x: z.x + (Math.random() * 2 - 1) * z.r * 0.8, y: z.y + (Math.random() * 2 - 1) * z.r * 0.5, vx: 0, vy: -50, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#ff7030' : '#ffd040', size: 4 });
        }
        this.zones = this.zones.filter(z => z.until > this.t);
    },

    updateTeles() {
        for (const tl of this.teles) {
            if (this.t >= tl.t0 + tl.dur) { tl.dead = true; if (tl.done) tl.done(); }
        }
        this.teles = this.teles.filter(t => !t.dead);
    },


    // ------------------------------------------------------------ visual fx (time is real time so hitstop still animates)
    updateFx(dt) {
        for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.grav) p.vy += p.grav * dt; else { p.vx *= 0.92; p.vy *= 0.92; } }
        this.parts = this.parts.filter(p => p.life > 0);
        if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
        for (const t of this.texts) { t.life -= dt; t.y -= (t.big ? 30 : 40) * dt; }
        this.texts = this.texts.filter(t => t.life > 0);
        if (this.texts.length > 120) this.texts.splice(0, this.texts.length - 120);
        for (const r of this.rings) r.life -= dt;
        this.rings = this.rings.filter(r => r.life > 0);
        for (const b of this.beams) b.life -= dt;
        this.beams = this.beams.filter(b => b.life > 0);
        for (const d of this.drops) { d.t += dt; }
        this.drops = this.drops.filter(d => d.t < d.life);
        this.shake = Math.max(0, this.shake - dt * 40);
        for (const s of this.sparks) s.life -= dt;
        this.sparks = this.sparks.filter(s => s.life > 0);
        for (const c of this.corpses) c.t += dt;
        this.corpses = this.corpses.filter(c => c.t < (c.boss ? 0.8 : 0.32));
        for (const c of this.coins) c.t += dt;
        this.coins = this.coins.filter(c => c.t < c.dur);
        for (const e of this.enemies) if (e.squash > 0) e.squash -= dt;
        for (const s of this.slots) if (s.tower && s.tower.recoil > 0) s.tower.recoil -= dt;
        for (const hh of this.heroList()) if (hh.lunge > 0) hh.lunge -= dt;
        this.flash = Math.max(0, this.flash - dt);
        this.zoom = Math.max(0, this.zoom - dt);
    },

    text(x, y, str, color, size, big) { this.texts.push({ x, y, str: String(str), color, size, life: big ? 1.0 : 0.7, max: big ? 1.0 : 0.7, big }); },

    ringFx(x, y, r, color) { this.rings.push({ x, y, r0: r * 0.3, r1: r, life: 0.4, max: 0.4, color }); },

    burstParts(x, y, color, n, spd) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, s = spd * (0.3 + Math.random() * 0.7);
            this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.35 + Math.random() * 0.3, max: 0.65, color, size: 2 + Math.random() * 3, grav: 300 });
        }
    },

    debris(x, y, color, n) { this.burstParts(x, y, color, n, 120); },

    bigBoom(x, y, r, color, small) {
        this.rings.push({ x, y, r0: r * 0.2, r1: r, life: 0.35, max: 0.35, color, fill: true });
        this.burstParts(x, y, color, small ? 10 : 30, small ? 140 : 260);
        if (!small) this.burstParts(x, y, '#ffffff', 10, 200);
    },

    slash(x, y, dir, crit) { this.beams.push({ arc: true, x, y, dir, life: 0.14, max: 0.14, color: crit ? '#ffd04a' : '#ffffff', w: crit ? 5 : 3 }); },

    addShake(v) { if (this.cfg.shakeOn && !this.cfg.shakeOn()) return; this.shake = Math.max(this.shake, v); },
});
