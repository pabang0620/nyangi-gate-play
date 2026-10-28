'use strict';
// Battle enemies: spawning, damage (armor/resist, shields, dodge), death effects, movement and per-frame traits.
// Methods of Battle (js/battle/core.js), split by role; loaded right after core.js.
Object.assign(Battle.prototype, {

    // ------------------------------------------------------------ spawning & enemies
    spawn(kind, pathIdx, hpMul, d = 0) {
        const def = ENEMIES[kind];
        const p = this.paths[pathIdx % this.paths.length];
        const mul = (def.boss ? hpMul * (this.endless ? 0.55 : 1) : hpMul) * (this.raid ? 1 : def.boss ? MUST_KILL.bossHp : def.elite ? MUST_KILL.eliteHp : 1);
        const e = {
            id: this.uid++, kind, def, hp: def.hp * mul, maxHp: def.hp * mul, path: p, d, off: def.boss ? 0 : this.rng.range(-10, 10),
            x: 0, y: 0, slowUntil: 0, slowMul: 1, stunUntil: 0, hasteUntil: 0, burnUntil: 0, burnDps: 0, blockedBy: null, cd: 1,
            revived: false, flash: 0, dir: 1, walk: this.rng() * 10, healCd: 2, frostHits: 0, dead: false,
            atk: def.atk * this.atkMul * (this.endless ? Math.sqrt(hpMul) : 1),
            hpMul, shield: 0, shieldCd: 1.5,
            burrowAt: def.burrow ? this.t + this.rng.range(1.5, def.burrow.every) : 0, burrowUntil: 0,
            stealthT: def.stealth ? this.rng.range(0, def.stealth.on + def.stealth.off) : 0,
            blinkAt: def.blink ? this.t + def.blink.every : 0,
        };
        if (this.rule === 'fast') e.spdMul = 1.3;
        if (def.boss) {
            e.sk = {}; for (const k of def.skills) e.sk[k] = BOSS_SKILL[k].cd * 0.6;
            e.cast = null; e.phase = 0; e.invulnUntil = 0; e.cdMul = 1;
            // 파티 레이드: the road takes raidLive.walk seconds to walk, so the boss reaches the gate then (no clock on screen)
            e.spdMul = this.raid ? (this.raidLive && this.raidLive.walk ? p.len / (def.spd * this.raidLive.walk) : 0.45) : (e.spdMul || 1) * (this.mapDef.spdMul || 1);   // a longer road (MAPS[m].spdMul) is walked faster, so the trip takes about as long
            if (this.raid) e.raidMul = this.raidLive ? hpMul / this.hpMul : RAID.hpMul;
            this.bossRef = e;
            this.on('boss', e);
        }
        this.placeEnemy(e);
        this.enemies.push(e);
        this.on('spawn', e);
        return e;
    },

    placeEnemy(e) {
        const a = e.path.at(e.d);
        const nx = -Math.sin(a.ang), ny = Math.cos(a.ang);
        e.x = a.x + nx * e.off; e.y = a.y + ny * e.off;
        const c = Math.cos(a.ang);
        if (Math.abs(c) > 0.2) e.dir = c > 0 ? 1 : -1;
    },


    // armor/resist applied here, the one place all damage passes through
    damage(e, amt, type, o = {}) {
        if (e.dead || e.hp <= 0) return 0;
        if (e.def.boss && e.invulnUntil > this.t) { if (!o.quiet) this.text(e.x, e.y - 50, L('무적'), '#c8d2f0', 14); return 0; }
        if (e.burrowUntil > this.t) return 0;                       // underground
        if (type === 'fire' && e.def.fireImmune) return 0;
        if (e.def.dodge && o.tower && type === 'phys' && this.rng() < e.def.dodge) {    // 구름 도적: 화살·포탄 회피
            if (!o.quiet) this.text(e.x, e.y - 34, L('회피'), '#d8f0ff', 13);
            return 0;
        }
        let crit = o.crit;
        if (o.critChance && this.rand() < o.critChance) crit = true;
        let v = amt * (crit ? (o.critMul || 2) : 1);
        if (type === 'phys') v *= 1 - e.def.armor;
        else if (type === 'magic') v *= 1 - e.def.mres * (o.tower ? (1 - this.b.mageResIgnore) : 1);
        if (e.def.stealth && this.stealthed(e)) v *= e.def.stealth.dmgMul;
        v *= this.dmgMul || 1;                                      // codex bonus etc.
        const weak = o.hero && e.stunUntil > this.t;                 // SYNERGY: stunned/frozen enemies take more from heroes, rangers burst them
        if (weak) v *= o.burst ? SYNERGY.burst : SYNERGY.exposed;
        v = Math.max(1, v);
        if (e.shield > 0) {                                         // swamp witch / 늪의 장막 shield absorbs first
            const a = Math.min(e.shield, v); e.shield -= a; v -= a;
            if (this.raidDamage !== undefined && e.def.boss) this.raidDamage += a;   // shield hits still count in the raid
            if (v <= 0) { if (!o.quiet) this.text(e.x, e.y - 34, L('막힘'), '#9fe0ff', 12); e.flash = 0.05; return a; }
        }
        e.hp -= v;
        if (this.raidDamage !== undefined && e.def.boss) this.raidDamage += v;
        if (e.def.rewind && !e.rewound && e.hp > 0 && e.hp < e.maxHp * 0.3) {       // 태엽 병사: 한 번 되감기
            e.rewound = true; e.hp = e.maxHp * e.def.rewind;
            this.text(e.x, e.y - 40, L('되감기!'), '#ffd890', 16);
            this.ringFx(e.x, e.y, 30, '#ffd890');
        }
        e.flash = 0.13;   // a hit must read: the enemy stays white a moment longer
        if (!o.quiet || crit) {
            e.squash = 0.14;
            // knockback scales with the share of health removed; heavy enemies barely move, bosses never
            if (!e.def.boss) {
                const kb = Math.min(22, (v / e.maxHp) * 70 + (o.kb || 0) + (crit ? 6 : 0)) * (e.def.elite ? 0.35 : 1);
                if (kb > 0.5) e.d = Math.max(0, e.d - kb);
            }
            if (this.sparks.length < 40) this.sparks.push({ x: e.x + this.rng.range(-8, 8), y: e.y - e.def.size * 0.9 + this.rng.range(-8, 8), life: crit ? 0.3 : 0.18, max: crit ? 0.3 : 0.18, crit: !!crit, ang: this.rng.range(0, TAU), s: crit ? 2 : 1.1 + Math.min(1, v / e.maxHp * 2.5) });
        }
        if (crit && o.hero) this.flash = Math.max(this.flash, 0.1);
        // hit sound by kind of blow (sound only, throttled so a volley does not stack): crit and hero hits are heavy, tower hits are light
        if ((!o.quiet || crit) && this.t - (this._hitSfxAt || -1) > 0.07) { this._hitSfxAt = this.t; this.on('hit', crit || o.hero ? 'hero' : undefined); }
        if (!o.quiet || crit) {
            const col = crit ? '#ffb22a' : weak && o.burst ? '#ff6a6a' : type === 'magic' ? '#c58cff' : type === 'fire' ? '#ff8a3a' : '#ffe7c0';
            this.text(e.x + this.rng.range(-8, 8), e.y - e.def.size * 1.6 - 6, (crit ? '' : '') + Math.round(v), col, crit || (weak && o.burst) ? 22 : 15, crit);
        }
        if (o.stun) e.stunUntil = Math.max(e.stunUntil, this.t + (e.def.boss ? o.stun * 0.3 : o.stun));
        if (o.hero && crit) this.hitstop = Math.max(this.hitstop, 0.035);
        if (e.hp <= 0) this.kill(e, o);
        return v;
    },

    kill(e, o) {
        if (e.def.revive && !e.revived) {
            e.revived = true; e.hp = e.maxHp * 0.5; e.stunUntil = this.t + 1.2;
            this.text(e.x, e.y - 40, L('부활!'), '#c8d2f0', 16);
            this.burstParts(e.x, e.y - 10, '#e8e4d8', 10, 80);
            return;
        }
        e.dead = true;
        this.releaseBlock(e);
        this.kills++;
        this.corpses.push({ kind: e.kind, x: e.x, y: e.y, dir: e.dir, fly: e.def.fly, t: 0, boss: e.def.boss });
        if (this.coins.length < 30) this.coins.push({ x: e.x, y: e.y - 20, t: 0, dur: 0.55 + Math.random() * 0.2 });
        // kill combo: kills within 2.2 s chain; milestones pay a little gold
        const c = this.combo;
        c.n = this.t - c.t < 2.2 ? c.n + 1 : 1; c.t = this.t; c.best = Math.max(c.best, c.n);
        if ([10, 25, 50, 100].includes(c.n)) {
            const bonus = c.n * 2;
            this.gainGold(bonus);
            this.text(W / 2, 150, L('{0} 연속 처치! +{1}', c.n, bonus), '#ffb22a', 30, true);
            this.on('combo', c.n);
        }
        // v2 on-death effects
        const D = e.def;
        if (D.deathFreeze) {
            for (const s of this.slots) if (s.tower && dist2(s.x, s.y, e.x, e.y) < D.deathFreeze.r ** 2) this.stunTower(s, D.deathFreeze.t, L('빙결'));
            this.ringFx(e.x, e.y, D.deathFreeze.r, '#a0f0ff');
        }
        if (D.split) {
            for (let k = 0; k < D.split.n; k++) {
                const m = this.spawn(D.split.kind, this.paths.indexOf(e.path), e.hpMul || this.hpMul, Math.max(0, e.d - 8 - k * 10));
                m.stunUntil = this.t + 0.4;
            }
            this.burstParts(e.x, e.y - 10, '#ffb070', 12, 120);
        }
        if (D.poison) this.zones.push({ x: e.x, y: e.y, r: D.poison.r, dps: D.poison.dps * this.atkMul, until: this.t + D.poison.t, color: '#7ad040', hurtsAllies: true, tick: 0 });
        const manual = o.hero && this.t < this.hero.manualUntil;
        const bounty = Math.round(e.def.gold * this.bountyMul * (1 + this.b.bountyPct) * (manual ? 1.25 : 1) * (this.endless ? 1 + this.waveIdx * 0.03 : 1) * (this.hard ? HARD.goldMul : 1) * (this.rule === 'poor' ? 0.7 : 1));
        if (this.raid && e.def.boss) {                             // 보스 토벌전: the boss never really dies; 파티 레이드: killing it wins
            if (this.raidLive && this.state !== 'lose') { this.state = 'win'; this.text(W / 2, 200, L('보스 처치!'), '#ffe08a', 34, true); this.on('end', true); }
            return;
        }
        this.gainGold(bounty);
        this.text(e.x, e.y - 20, '+' + bounty + (manual ? L(' 수동') : ''), '#ffe08a', 13);
        const col = { slime: '#3fbf5f', goblin: '#6fbf4a', wolf: '#6a7088', orc: '#5a7a3a', bat: '#7a4a9a', shaman: '#a03050',
            skeleton: '#e8e4d8', imp: '#e04a2a', golem: '#8a8a92', cursed: '#5a5a7a' }[e.kind] || '#c060ff';
        this.burstParts(e.x, e.y - e.def.size * 0.6, col, e.def.boss ? 60 : e.def.elite ? 22 : 9, e.def.boss ? 260 : 140);
        this.on('kill', e);
        if (e.def.boss) {
            this.hitstop = 0.25; this.slowmo = 1.2; this.addShake(18); this.flash = 0.3; this.zoom = 0.25;
            this.bigBoom(e.x, e.y, 120, '#ffe08a');
            if (this.bossRef === e) this.bossRef = null;
        }
        this.rollDrop(e);
    },

    rollDrop(e) {
        const tier = e.def.boss ? 'boss' : e.def.elite ? 'elite' : 'normal';
        const rolls = DROP.rolls[tier] + (this.hard && tier !== 'normal' ? 1 : 0);
        for (let i = 0; i < rolls; i++) {
            if (Math.random() >= DROP.chance[tier]) continue;
            const r = pickWeighted(DROP.table[tier]);
            const ilvl = this.endless ? Math.min(100, 1 + this.waveIdx * 1.5) : 1 + this.stageIdx * 2.5 + (this.hard ? HARD.ilvlAdd : 0);
            const slot = SLOTS[Math.floor(Math.random() * 3)];
            this.loot.push({ slot, r, ilvl });
            this.drops.push({ x: e.x + i * 18, y: e.y, r, slot, t: 0, life: 3.2 });
            this.on('drop', r);
            if (r >= 3 && !this.coop) this.slowmo = Math.max(this.slowmo, 0.8);   // co-op: loot is each player's own roll, so it must not touch the shared fight
        }
    },

    releaseBlock(who) {
        // who can be enemy, soldier or hero
        if (who.def) { if (who.blockedBy && who.blockedBy.engaged === who) who.blockedBy.engaged = null; who.blockedBy = null; return; }
        if (who.engaged) { if (who.engaged.blockedBy === who) who.engaged.blockedBy = null; who.engaged = null; }
        for (const e of this.enemies) if (e.blockedBy === who) e.blockedBy = null;
    },


    updateEnemies(dt) {
        for (const e of this.enemies) {
            if (e.dead) continue;
            e.flash = Math.max(0, e.flash - dt);
            if (e.burnUntil > this.t) this.damage(e, e.burnDps * dt, 'fire', { quiet: true });
            if (e.dead) continue;
            // shaman heal
            if (e.def.heal) {
                e.healCd -= dt;
                if (e.healCd <= 0) {
                    e.healCd = 3;
                    let healed = false;
                    for (const o of this.enemies) if (o !== e && !o.dead && o.hp < o.maxHp && dist2(o.x, o.y, e.x, e.y) < 95 * 95) {
                        o.hp = Math.min(o.maxHp, o.hp + e.def.heal * this.hpMul); healed = true;
                        this.text(o.x, o.y - 30, '+' + Math.round(e.def.heal * this.hpMul), '#7fffa0', 12);
                    }
                    if (healed) this.rings.push({ x: e.x, y: e.y, r0: 10, r1: 95, life: 0.5, max: 0.5, color: '#7fffa0' });
                }
            }
            this.updateEnemyTraits(e, dt);
            if (e.def.boss && this.updateBoss(e, dt)) continue;
            if (e.stunUntil > this.t) continue;
            const blocker = e.blockedBy;
            if (blocker && !blocker.def) {
                const alive = blocker.isHero ? blocker.deadUntil <= this.t : blocker.deadUntil <= this.t && !blocker.gone;
                const taunted = blocker.isHero && blocker.oathUntil > this.t;
                if (!alive || (blocker.engaged !== e && !taunted)) { e.blockedBy = null; }
            }
            if (e.charge && e.blockedBy) this.releaseBlock(e);
            let held = 1;   // 파티 레이드: a blocked boss still creeps on (the walk time stays the clock), the blockers only slow it
            if (e.blockedBy) {
                e.cd -= dt;
                if (e.cd <= 0) {
                    e.cd = 1.0;
                    const tgt = e.blockedBy;
                    this.hurtAlly(tgt, e.atk);
                    if (e.def.cleave) {                              // 설인: hits everyone around the blocker
                        for (const s of this.soldiers) if (s !== tgt && s.deadUntil <= this.t && dist2(s.x, s.y, tgt.x, tgt.y) < e.def.cleave ** 2) this.hurtAlly(s, e.atk * 0.6);
                        for (const hh of this.heroList()) if (tgt !== hh && hh.deadUntil <= this.t && dist2(hh.x, hh.y, tgt.x, tgt.y) < e.def.cleave ** 2) this.hurtAlly(hh, e.atk * 0.6);
                        this.ringFx(tgt.x, tgt.y, e.def.cleave, '#cfe8ff');
                    }
                }
                if (e.def.boss && this.raidLive && this.raidLive.gateLose) held = this.raidLive.blockSlow || 0.3;
                else { e.walk += dt * 2; continue; }
            }
            // a boss or elite at the gate smashes it for a few seconds: last chance to bring it down
            if (e.atGate !== undefined) {
                e.walk += dt * 3;
                // the gate guards fight back (elites take the bigger share: they come mid-wave, several at once on 영웅 난이도)
                this.damage(e, e.maxHp * (e.def.boss ? MUST_KILL.gateDps : MUST_KILL.eliteGateDps) * dt, 'true', { quiet: true });
                if (e.dead || e.hp <= 0) continue;
                if (this.t - e.atGate < MUST_KILL.gateTime) continue;
                e.d = e.path.len + 1;
            }
            let spd = e.def.spd * (e.slowUntil > this.t ? e.slowMul : 1) * (e.hasteUntil > this.t ? 1.5 : 1) * (e.spdMul || 1) * held;
            if (e.charge) spd = e.charge.spd;
            e.d += spd * dt;
            e.walk += dt * spd / 12;
            this.placeEnemy(e);
            if (e.d >= e.path.len && this.raid && e.def.boss && this.raidLive && this.raidLive.gateLose) {
                // 파티 레이드: the boss through the gate ends the run
                e.d = e.path.len; this.placeEnemy(e); this.addShake(16);
                this.text(W / 2, 170, L('보스가 성문을 뚫었다!'), '#ff4040', 30, true);
                this.lives = 0; this.state = 'lose'; this.on('end', false);
                continue;
            }
            if (e.d >= e.path.len && this.raid && e.def.boss) {
                // 토벌 보스는 성문에 닿으면 출발점으로 돌아간다 (목숨 3 감소)
                e.d = 0; this.releaseBlock(e); this.placeEnemy(e);
                this.lives -= 3; this.addShake(12);
                this.text(W / 2, 170, L('보스가 성문을 두드렸다! 목숨 -3'), '#ff6060', 24, true);
                continue;
            }
            if (e.d >= e.path.len && e.atGate === undefined && !this.raid && (e.def.boss || e.def.elite)) {
                e.atGate = this.t; e.d = e.path.len; this.placeEnemy(e); this.addShake(10);
                this.text(W / 2, 200, L('{0}이(가) 성문을 부수고 있다! {1}초 안에 잡으세요!', e.def.name, MUST_KILL.gateTime), '#ff4040', 26, true);
                this.on('gateSmash', e);
                continue;
            }
            if (e.d >= e.path.len) {
                e.dead = true;
                this.releaseBlock(e);
                this.lives -= e.def.lives;
                this.leaked += e.def.lives;
                if (this.cond && this.cond.id === 'noLeak') this.breakCond();
                this.addShake(e.def.boss ? 16 : 5);
                this.text(e.x - 30, e.y - 30, '-' + e.def.lives, '#ff6060', 22, true);
                if (this.bossRef === e) this.bossRef = null;
                // a boss or elite getting through loses the stage outright
                if ((e.def.boss || e.def.elite) && !this.raid) { this.lives = 0; this.mustKillLost = true; this.text(W / 2, 200, e.def.boss ? L('보스를 놓쳤다!') : L('정예를 놓쳤다!'), '#ff4040', 30, true); }
                this.on('leak', e);
            }
        }
    },


    stealthed(e) { const S = e.def.stealth; return S && (e.stealthT % (S.on + S.off)) < S.on; },

    // v2 traits that tick every frame: shield aura, burrow, stealth cycle, blink
    updateEnemyTraits(e, dt) {
        const D = e.def;
        if (D.shield) {
            e.shieldCd -= dt;
            if (e.shieldCd <= 0) {
                e.shieldCd = D.shield.cd;
                let n = 0;
                for (const o of this.enemies) if (!o.dead && o !== e && dist2(o.x, o.y, e.x, e.y) < D.shield.r ** 2) { o.shield = Math.max(o.shield, (o.maxHp / (o.raidMul || 1)) * D.shield.amt * (o.def.boss ? 0.3 : 1)); n++; }
                if (n) this.rings.push({ x: e.x, y: e.y, r0: 10, r1: D.shield.r, life: 0.5, max: 0.5, color: '#9fe0ff' });
            }
        }
        if (D.burrow && this.t >= e.burrowAt && e.burrowUntil <= this.t) {
            e.burrowUntil = this.t + D.burrow.dur; e.burrowAt = this.t + D.burrow.dur + D.burrow.every;
            this.releaseBlock(e);
            this.debris(e.x, e.y, '#d8b070', 8);
        }
        if (D.haste) {                                                   // 바람 정령: 주변 적 가속
            e.hasteCd = (e.hasteCd === undefined ? D.haste.every * 0.5 : e.hasteCd) - dt;
            if (e.hasteCd <= 0) {
                e.hasteCd = D.haste.every;
                let n = 0;
                for (const o of this.enemies) if (!o.dead && !o.def.fly && dist2(o.x, o.y, e.x, e.y) < D.haste.r ** 2) { o.hasteUntil = Math.max(o.hasteUntil, this.t + D.haste.dur); n++; }
                if (n) this.rings.push({ x: e.x, y: e.y, r0: 10, r1: D.haste.r, life: 0.45, max: 0.45, color: '#bfffe0' });
            }
        }
        if (D.stealth) e.stealthT += dt;
        if (D.blink && this.t >= e.blinkAt && e.stunUntil <= this.t) {
            e.blinkAt = this.t + D.blink.every;
            this.burstParts(e.x, e.y - 12, '#8a6aff', 10, 120);
            this.releaseBlock(e);
            e.d = Math.max(e.d, Math.min(e.path.len - 160, e.d + D.blink.dist));   // never blinks into the last stretch before the gate
            this.placeEnemy(e);
            this.burstParts(e.x, e.y - 12, '#8a6aff', 10, 120);
        }
    },
});
