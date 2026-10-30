'use strict';
// Battle boss AI: phases, skill choice with telegraphs, skill effects.
// Methods of Battle (js/battle/core.js), split by role; loaded right after core.js.
Object.assign(Battle.prototype, {

    // returns true when the boss is busy (casting) this frame
    updateBoss(e, dt) {
        const hpR = e.hp / e.maxHp;
        if (e.def.phases) {
            const th = e.def.phases;
            if (e.phase < th.length && hpR <= th[e.phase]) {
                e.phase++;
                e.cdMul *= 0.75; e.spdMul *= 1.15; e.invulnUntil = this.t + 1.5;
                this.on('bossPhase', e);
                this.addShake(10);
                this.ringFx(e.x, e.y, 160, '#ff5050');
                this.releaseBlock(e);
            }
        }
        if (e.charge) {
            e.charge.t -= dt;
            for (const s of this.soldiers) if (s.deadUntil <= this.t && dist2(s.x, s.y, e.x, e.y) < 36 * 36 && !e.charge.hit.has(s)) { e.charge.hit.add(s); this.bossHurt(s, e.atk * 1.5); }
            for (const hh of this.heroList()) if (hh.deadUntil <= this.t && dist2(hh.x, hh.y, e.x, e.y) < 40 * 40 && !e.charge.hit.has(hh)) { e.charge.hit.add(hh); this.bossHurt(hh, e.atk * 1.5); }
            if (e.charge.t <= 0) e.charge = null;
            return false;
        }
        if (e.cast) {
            if (this.t >= e.cast.at) { this.bossFire(e, e.cast); e.cast = null; }
            return true;
        }
        if (e.stunUntil > this.t) return false;
        for (const k of e.def.skills) e.sk[k] -= dt;
        const ready = e.def.skills.filter(k => e.sk[k] <= 0 && (!BOSS_SKILL[k].hpBelow || hpR <= BOSS_SKILL[k].hpBelow));
        if (!ready.length) return false;
        const k = ready[Math.floor(this.rand() * ready.length)];
        const S = BOSS_SKILL[k];
        e.sk[k] = S.cd * e.cdMul;
        const cast = { k, at: this.t + S.warn };
        const towers = this.slots.filter(s => s.tower && dist2(s.x, s.y, e.x, e.y) < 330 * 330);
        const pickTower = () => towers.length ? towers[Math.floor(this.rand() * towers.length)] : null;
        if (k === 'charge') {
            const a = e.path.at(e.d), b = e.path.at(e.d + 230);
            cast.tele = { shape: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, wid: 60 };
        } else if (k === 'stomp' || k === 'warcry') {
            cast.tele = { shape: 'circle', x: e.x, y: e.y, r: S.r };
        } else if (k === 'curseField') {
            const alive = this.soldiers.filter(s => s.deadUntil <= this.t);
            const tg = this.heroAlive ? this.hero : alive.length ? alive[Math.floor(this.rand() * alive.length)] : e;
            cast.tele = { shape: 'circle', x: tg.x, y: tg.y, r: S.r };
        } else if (k === 'lavaWave' || k === 'tornado') {
            const tw = pickTower() || (this.heroAlive ? this.hero : { x: e.x + 200 * e.dir, y: e.y });
            const ang = Math.atan2(tw.y - e.y, tw.x - e.x);
            cast.tele = { shape: 'line', x1: e.x, y1: e.y, x2: e.x + Math.cos(ang) * S.len, y2: e.y + Math.sin(ang) * S.len, wid: S.wid };
        } else if (k === 'darkness' || k === 'lightning') {
            cast.multi = [];
            const pool = towers.slice();
            for (let i = 0; i < S.n && pool.length; i++) { const tw = pool.splice(Math.floor(this.rand() * pool.length), 1)[0]; cast.multi.push({ shape: 'circle', x: tw.x, y: tw.y, r: S.r }); }
            if (!cast.multi.length) cast.tele = { shape: 'circle', x: e.x, y: e.y, r: 60 };
        } else if (k === 'slam' || k === 'frostField') {
            const tw = pickTower() || (this.heroAlive ? this.hero : null);
            if (!tw) { e.sk[k] = 1; return false; }
            cast.tele = { shape: 'circle', x: tw.x, y: tw.y, r: S.r };
        } else if (k === 'breath') {
            const tw = pickTower() || (this.heroAlive ? this.hero : { x: e.x + 200 * e.dir, y: e.y });
            const ang = Math.atan2(tw.y - e.y, tw.x - e.x);
            cast.tele = { shape: 'line', x1: e.x, y1: e.y, x2: e.x + Math.cos(ang) * S.len, y2: e.y + Math.sin(ang) * S.len, wid: S.wid };
        } else if (k === 'meteor') {
            cast.multi = [];
            for (let i = 0; i < S.n; i++) {
                const tw = towers.length ? towers[Math.floor(this.rand() * towers.length)] : null;
                const pt = tw ? { x: tw.x + this.rng.range(-20, 20), y: tw.y + this.rng.range(-20, 20) } : { x: e.x + this.rng.range(-200, 200), y: e.y + this.rng.range(-120, 120) };
                cast.multi.push({ shape: 'circle', x: pt.x, y: pt.y, r: S.r });
            }
        } else {
            cast.tele = { shape: 'circle', x: e.x, y: e.y, r: 60 };
        }
        for (const tl of (cast.multi || (cast.tele ? [cast.tele] : []))) this.teles.push({ ...tl, t0: this.t, dur: S.warn, color: '#ff3030', boss: true, done: null });
        this.text(e.x, e.y - e.def.size * 2 - 10, S.name + '!', '#ff8080', 18, true);
        this.on('bossCast', k);
        e.cast = cast;
        return true;
    },

    // 레이드: a hero far below the difficulty's recommended level takes more from every boss hit, and is one-shot ten levels below (carried players must stay out of the danger)
    bossHurt(o, amt) {
        if (o.isHero && this.recLv) {
            const gap = this.recLv - (o.lv || 1);
            if (gap >= LOW_LV.lethal) amt = Math.max(amt, (o.maxHp || 0) * 4);   // survives the knight / oath damage cuts in hurtAlly
            else if (gap > 0) amt *= 1 + LOW_LV.perLv * gap;
        }
        this.hurtAlly(o, amt);
    },

    bossFire(e, c) {
        const S = BOSS_SKILL[c.k];
        const hitArea = (tl, fn) => {
            const inside = (x, y) => tl.shape === 'circle' ? dist2(x, y, tl.x, tl.y) < tl.r * tl.r
                : (() => { const q = closestOnSeg(x, y, tl.x1, tl.y1, tl.x2, tl.y2); return dist(x, y, q.x, q.y) < tl.wid / 2; })();
            for (const s of this.slots) if (s.tower && inside(s.x, s.y)) fn('tower', s);
            for (const s of this.soldiers) if (s.deadUntil <= this.t && inside(s.x, s.y)) fn('ally', s);
            for (const hh of this.heroList()) if (hh.deadUntil <= this.t && inside(hh.x, hh.y)) fn('ally', hh);   // every hero in the party, not only the host's
        };
        if (c.k === 'charge') {
            this.releaseBlock(e);
            e.charge = { t: 0.6, spd: 380, hit: new Set() };
            this.addShake(8);
        } else if (c.k === 'stomp' || c.k === 'slam' || c.k === 'frostField') {
            hitArea(c.tele, (kind, o) => { if (kind === 'tower') this.stunTower(o, S.stun, c.k === 'frostField' ? L('빙결') : undefined); else this.bossHurt(o, e.atk * 1.4); });
            this.bigBoom(c.tele.x, c.tele.y, c.tele.r, S.color || '#c8a070'); this.addShake(12);
        } else if (c.k === 'blizzard' || c.k === 'sandstorm') {
            if (c.k === 'blizzard') { this.chillUntil = this.t + S.dur; this.chill = S.chill; }
            else { this.blindUntil = this.t + S.dur; this.blind = S.blind; }
            this.text(W / 2, 170, c.k === 'blizzard' ? L('눈보라! 탑 공격 속도 감소') : L('모래폭풍! 탑 사거리 감소'), c.k === 'blizzard' ? '#bfefff' : '#ffd890', 26, true);
            this.on('weather', c.k); this.addShake(6);
        } else if (c.k === 'burrowBoss' || c.k === 'blink') {
            this.releaseBlock(e);
            this.burstParts(e.x, e.y - 20, c.k === 'blink' ? '#8a6aff' : '#d8b070', 24, 180);
            e.invulnUntil = this.t + S.invuln;
            e.d = Math.min(e.path.len - 60, e.d + S.dist);
            this.placeEnemy(e);
            this.burstParts(e.x, e.y - 20, c.k === 'blink' ? '#8a6aff' : '#d8b070', 24, 180);
        } else if (c.k === 'curseField') {
            this.zones.push({ x: c.tele.x, y: c.tele.y, r: S.r, dps: e.atk * S.dps, until: this.t + S.dur, color: '#8a40c0', hurtsAllies: true, tick: 0 });
            this.ringFx(c.tele.x, c.tele.y, S.r, '#b060ff');
        } else if (c.k === 'shieldAll') {
            for (const o of this.enemies) if (!o.dead) o.shield = Math.max(o.shield, (o.maxHp / (o.raidMul || 1)) * S.amt * (o.def.boss ? 0.4 : 1));
            this.ringFx(e.x, e.y, 260, '#9fe0ff'); this.text(e.x, e.y - 70, L('보호막!'), '#9fe0ff', 20, true);
        } else if (c.k === 'lavaWave' || c.k === 'tornado') {
            const tor = c.k === 'tornado';
            hitArea(c.tele, (kind, o) => { if (kind === 'tower') this.stunTower(o, S.stun, tor ? L('회오리') : undefined); else this.bossHurt(o, e.atk * (tor ? 1.2 : 1.6)); });
            for (let i = 0; i < 26; i++) { const t = i / 26; this.parts.push({ x: lerp(c.tele.x1, c.tele.x2, t) + this.rng.range(-20, 20), y: lerp(c.tele.y1, c.tele.y2, t) + this.rng.range(-20, 20), vx: tor ? this.rng.range(-60, 60) : 0, vy: -70, life: 0.7, max: 0.7, color: tor ? (i % 2 ? '#e8f8ff' : '#9ad8f0') : (i % 2 ? '#ff7020' : '#ffd040'), size: 6 }); }
            this.addShake(12);
        } else if (c.k === 'darkness' || c.k === 'lightning') {
            const lt = c.k === 'lightning';
            for (const tl of (c.multi && c.multi.length ? c.multi : [c.tele])) {
                hitArea(tl, (kind, o) => { if (kind === 'tower') this.stunTower(o, S.stun, lt ? L('감전') : L('암흑')); else if (lt) this.bossHurt(o, e.atk); });
                this.bigBoom(tl.x, tl.y, tl.r, lt ? '#fff27a' : '#5a3aa0', true);
            }
            this.addShake(8);
        } else if (c.k === 'timeStop') {
            for (const s of this.slots) if (s.tower) s.tower.stunUntil = Math.max(s.tower.stunUntil, this.t + S.dur);
            this.text(W / 2, 170, L('시간 정지! 모든 탑이 멈췄다'), '#ffd890', 26, true);
            this.flash = 0.25; this.addShake(8);
            this.on('weather', 'timeStop');
        } else if (c.k === 'rewindBoss') {
            const v = e.maxHp * S.heal;
            e.hp = Math.min(e.maxHp, e.hp + v);
            this.text(e.x, e.y - 70, L('되감기! +') + Math.round(v), '#ffd890', 20, true);
            this.ringFx(e.x, e.y, 120, '#ffd890');
        } else if (c.k === 'warcry') {
            for (const o of this.enemies) if (dist2(o.x, o.y, e.x, e.y) < S.r * S.r) o.hasteUntil = this.t + 4;
            this.ringFx(e.x, e.y, S.r, '#ff5050'); this.addShake(6);
        } else if (c.k === 'breath') {
            hitArea(c.tele, (kind, o) => { if (kind === 'tower') this.stunTower(o, S.stun); else this.bossHurt(o, e.atk * 1.6); });
            const n = 26;
            for (let i = 0; i < n; i++) {
                const t = i / n;
                this.parts.push({ x: lerp(c.tele.x1, c.tele.x2, t) + this.rng.range(-20, 20), y: lerp(c.tele.y1, c.tele.y2, t) + this.rng.range(-20, 20), vx: this.rng.range(-30, 30), vy: -60, life: 0.7, max: 0.7, color: i % 2 ? '#9a5ae0' : '#40ffe0', size: 6 });
            }
            this.addShake(12);
        } else if (c.k === 'meteor') {
            for (const tl of c.multi) {
                hitArea(tl, (kind, o) => { if (kind === 'tower') this.stunTower(o, S.stun); else this.bossHurt(o, e.atk * 1.4); });
                this.bigBoom(tl.x, tl.y, tl.r, '#c060ff');
            }
            this.addShake(14);
        } else if (S.kind) {
            for (let i = 0; i < S.n; i++) {
                const m = this.spawn(S.kind, this.paths.indexOf(e.path), this.hpMul * (this.endless ? 1 : 1.2), Math.max(0, e.d - 20 - i * 18));
                this.burstParts(m.x, m.y, '#c060ff', 8, 90);
            }
        }
    },

    stunTower(slot, sec, label = L('기절')) {
        slot.tower.stunUntil = Math.max(slot.tower.stunUntil, this.t + sec);
        this.text(slot.x, slot.y - 40, label, label === L('빙결') ? '#a0f0ff' : '#ffa0a0', 15);
    },
});
