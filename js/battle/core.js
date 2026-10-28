'use strict';
// Battle simulation. No DOM access: rendering reads the state, UI calls the public methods.
// fx hooks (sound, banners) go through this.on(event, data) so the sim also runs headless.

class PathRef {
    constructor(pts) {
        this.pts = pts;
        this.cum = [0];
        for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
        this.len = this.cum[this.cum.length - 1];
    }
    at(d) {
        d = clamp(d, 0, this.len);
        let i = 1;
        while (i < this.cum.length - 1 && this.cum[i] < d) i++;
        const a = this.pts[i - 1], b = this.pts[i];
        const seg = this.cum[i] - this.cum[i - 1] || 1;
        const t = (d - this.cum[i - 1]) / seg;
        return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    // distance along the path of the closest point to (x, y)
    project(x, y) {
        let best = 1e9, bd = 0;
        for (let i = 1; i < this.pts.length; i++) {
            const a = this.pts[i - 1], b = this.pts[i];
            const q = closestOnSeg(x, y, a[0], a[1], b[0], b[1]);
            const dd = dist2(x, y, q.x, q.y);
            if (dd < best) { best = dd; bd = this.cum[i - 1] + (this.cum[i] - this.cum[i - 1]) * q.t; }
        }
        return { d: bd, dist: Math.sqrt(best) };
    }
}

function genSlots(map, seed) {
    const rng = makeRng(seed);
    const slots = [];
    const tryAdd = (x, y) => {
        if (x < 40 || x > W - 40 || y < 96 || y > H - 40) return;
        if (x < 490 && y > 555) return;                 // hero HUD corner (enlarged on phones)
        if (x > 1050 && y > 575) return;                // spell HUD corner
        if (Art.nearPath(map, x, y) < 58) return;
        if (Art.nearPath(map, x, y) > 112) return;
        const end = map.paths[0][map.paths[0].length - 1];
        if (dist(x, y, end[0], end[1]) < 90) return;
        if (slots.some(s => dist2(s.x, s.y, x, y) < 122 * 122)) return;
        slots.push({ x: Math.round(x), y: Math.round(y) });
    };
    for (const pts of map.paths) {
        const P = new PathRef(pts);
        for (let d = 70; d < P.len - 40; d += 60) {
            const a = P.at(d);
            const nx = -Math.sin(a.ang), ny = Math.cos(a.ang);
            const side = rng() < 0.5 ? 1 : -1;
            tryAdd(a.x + nx * 78 * side, a.y + ny * 78 * side);
            tryAdd(a.x - nx * 78 * side, a.y - ny * 78 * side);
        }
    }
    return slots;
}

class Battle {
    constructor(cfg) {
        this.cfg = cfg;
        this.endless = !!cfg.endless;
        this.stageIdx = this.endless ? -1 : cfg.stageIdx;
        // dungeon/raid pass their own stage-like definition (js/data/modes.js); stageIdx is then only the strength reference
        const st = cfg.stageDef || (this.endless ? null : STAGES[cfg.stageIdx]);
        this.stage = st;
        this.mapDef = MAPS[cfg.map || (this.endless ? ENDLESS.map : st.map)];
        this.theme = cfg.theme || (this.endless ? 'ruin' : CHAPTERS[st.ch].theme);
        this.rule = cfg.rule || null;          // 무한의 성벽 주간 규칙 id
        this.ban = cfg.ban || null;            // 주간 공방전: tower type that cannot be built
        this.maxWaves = cfg.maxWaves || 0;     // 주간 공방전: endless-style waves with an end (0 = endless)
        this.waveSeed = cfg.waveSeed || 0;     // 주간 공방전: same waves for every player in a week
        this.dmgMul = cfg.dmgMul || 1;         // 도감 보너스
        this.paths = this.mapDef.paths.map(p => new PathRef(p));
        this.slots = genSlots(this.mapDef, (this.endless ? 99 : cfg.stageIdx) * 7919 + 13).map((s, i) => ({ ...s, i, tower: null }));
        this.b = cfg.bonuses;
        this.rng = makeRng((cfg.seed || 1234) + (this.endless ? 5 : cfg.stageIdx * 101));
        // 협동 디펜스: both devices run the same battle, so every roll that changes the fight comes from the seeded rng
        this.coop = !!cfg.coop;
        this.rand = this.coop ? () => this.rng() : Math.random;
        this.on = cfg.on || (() => { });

        this.t = 0;
        // mode: 'stage' (default), 'endless', 'dungeon', 'raid'. hard = 영웅 난이도 (PLAN_V2 1.2)
        this.mode = cfg.mode || (this.endless ? 'endless' : 'stage');
        this.hard = !!cfg.hard;
        this.cond = this.hard && this.mode === 'stage' ? hardCond(cfg.stageIdx) : null;   // 3성 조건
        this.condBroken = false;
        const M = this.hard ? HARD : null;
        this.hpMul = this.endless ? 1 : stageHpMul(cfg.stageIdx) * (M ? hardHpMul(cfg.stageIdx) : 1) * (cfg.hpMulExtra || 1);
        this.atkMul = this.endless ? 1 : (1 + 0.1 * cfg.stageIdx) * (M ? M.atkMul : 1);
        this.bountyMul = this.endless ? 1 : stageBountyMul(cfg.stageIdx);
        this.gold = Math.round(((this.endless ? ENDLESS.startGold : stageStartGold(cfg.stageIdx)) + this.b.startGold) * (M ? M.goldMul : 1));
        this.chillUntil = 0; this.chill = 0; this.blindUntil = 0; this.blind = 1;
        this.maxLives = (M ? M.lives : LIVES) + this.b.lives;
        if (this.rule === 'poor') this.gold += 250;
        this.lives = this.maxLives;
        this.waveIdx = -1;               // index of the wave currently spawning / last spawned
        this.raid = this.mode === 'raid';
        this.totalWaves = this.raid ? Infinity : this.endless ? (this.maxWaves || Infinity) : st.waves;
        this.waves = this.endless || this.raid ? [] : this.genStageWaves(st);
        if (this.coop) this.coopWaves();
        if (this.raid) {
            // 보스 토벌전: one giant boss walks the road, escorts keep coming; the score is damage dealt in RAID.time seconds
            this.raidKind = cfg.raidKind;
            this.raidDamage = 0;
            // 파티 레이드 (cfg.raidLive): the boss has real health; kill it before the time runs out (otherwise a loss)
            this.raidLive = cfg.raidLive || null;
            this.timeLeft = this.raidLive ? this.raidLive.time : RAID.time;
            this.enraged = false;
            this.nextEscort = 8;
            this.gold = RAID.startGold + RAID.goldPerStage * Math.max(0, this.stageIdx) + this.b.startGold;   // build a full defence from the start
        }
        this.queue = [];                 // pending spawns {t, kind, path}
        this.countdown = -1;             // seconds until next wave, -1 = waiting for first call
        this.state = 'prep';             // prep | run | win | lose
        if (this.raid) { this.queue.push({ t: 6, kind: this.raidKind, path: 0, hpMul: this.raidLive ? this.raidLive.hpMul : this.hpMul * RAID.hpMul }); this.countdown = -2; }
        this.enemies = []; this.soldiers = []; this.projs = [];
        this.parts = []; this.texts = []; this.rings = []; this.beams = []; this.zones = []; this.teles = []; this.drops = [];
        this.loot = []; this.kills = 0; this.leaked = 0;
        this.hitstop = 0; this.slowmo = 0; this.shake = 0;
        // game feel: hit sparks, death pops, coins flying to the gold counter, kill combo, screen flash, zoom punch
        this.sparks = []; this.corpses = []; this.coins = []; this.combo = { n: 0, t: 0, best: 0 }; this.flash = 0; this.zoom = 0;
        this.uid = 1;
        this.party = cfg.party || [];    // 냥이 총출동: the other heroes' stats [{cls, skin, atk, crit}]
        this.allies = [];
        this.spells = SPELLS.filter(s => s.id !== 'party' || this.party.length).map(s => ({ ...s, left: 0, cdMax: s.id === 'beacon' ? s.cd * this.b.beaconCdMul : s.cd }));
        this.bossRef = null;
        this.hasBoss = !this.endless && !this.raid && !!st.boss;   // boss stages get no continue (the boss is gone after a gate loss)
        this.initHero(cfg.heroCls, cfg.heroStats);
        if (this.coop) this.initCoop(cfg);
    }

    // ------------------------------------------------------------ waves
    genStageWaves(st) {
        const rng = makeRng((st.seedName || srcOf(st.name)).length * 131 + this.stageIdx * 17);   // Korean name: same waves in every language
        const waves = [];
        const N = st.waves;
        for (let w = 0; w < N; w++) {
            const budget = (10 + 7.5 * w) * (1 + 0.1 * this.stageIdx);
            const avail = st.pool.slice(0, Math.min(st.pool.length, 1 + Math.ceil((w + 1) * st.pool.length / N)));
            const groups = 1 + (w >= 2 ? 1 : 0) + (w >= 5 && rng() < 0.5 ? 1 : 0);
            waves.push(this.makeWave(rng, budget, avail, groups, w));
        }
        if (st.boss) {
            const last = waves[N - 1];
            const delay = last.reduce((m, s) => Math.max(m, s.t), 0) + 5;
            last.push({ t: delay, kind: st.boss, path: 0 });
        }
        return waves;
    }
    makeWave(rng, budget, avail, groups, w) {
        const out = [];
        let t0 = 0;
        for (let g = 0; g < groups; g++) {
            let kind = avail[Math.floor(rng() * avail.length)];
            if (ENEMIES[kind].elite && w < 3) kind = avail.find(k => !ENEMIES[k].elite) || kind;
            const def = ENEMIES[kind];
            let count = Math.max(1, Math.round(budget / groups / def.cost));
            if (def.elite) count = Math.max(1, Math.min(count, 1 + Math.floor(w / 4)));
            count = Math.min(count, 28);
            const gap = def.elite ? 3.0 : def.spd > 70 ? 0.5 : def.spd < 32 ? 1.1 : 0.7;
            const path = Math.floor(rng() * this.paths.length);
            for (let i = 0; i < count; i++) out.push({ t: t0 + i * gap, kind, path });
            t0 += count * gap * 0.45 + 1.5;
        }
        return out;
    }
    genEndlessWave(w) {
        const rng = makeRng(9001 + w * 37 + this.waveSeed);
        const tiers = ['slime', 'goblin', 'wolf', 'orc', 'bat', 'shaman', 'skeleton', 'imp', 'golem', 'cursed',
            'frostwolf', 'scorpion', 'toad', 'harpy', 'salamander', 'beetle', 'swampwitch', 'yeti', 'shadow', 'lavagolem', 'voidknight'];
        let avail = tiers.slice(0, Math.min(tiers.length, 2 + Math.floor(w / 2.5)));
        if (this.rule === 'air') avail = avail.concat(['bat', 'imp', 'harpy', 'bat'].filter((k, i) => w >= i * 3));
        if (this.rule === 'elite' && w >= 2) avail = avail.concat(w >= 6 ? ['golem', 'cursed'] : ['golem']);
        const budget = (12 + 7 * w) * (1 + 0.02 * w);
        const groups = Math.min(4, 1 + Math.floor(w / 4));
        const wave = this.makeWave(rng, budget, avail, groups, Math.max(w, this.rule === 'elite' ? 4 : 0));
        const every = this.rule === 'boss' ? 5 : 10;
        if (w % every === every - 1) {
            const bosses = ['ironfang', 'grak', 'vargas', 'frosna', 'setka', 'morga', 'ignis', 'nox'];
            const n = Math.min(bosses.length, 3 + Math.floor(w / 30));            // later bosses join deeper runs
            wave.push({ t: wave.reduce((m, s) => Math.max(m, s.t), 0) + 4, kind: bosses[Math.floor(w / every) % n], path: 0 });
        }
        return wave;
    }
    endlessHpMul(w) { return 0.8 + 0.12 * w + 0.006 * w * w; }
    updateRaid(dt) {
        if (this.state === 'prep') this.state = 'run';
        this.timeLeft -= dt;
        const L2 = this.raidLive, boss = this.bossRef;
        // 광폭화: below raidLive.enrage of its health the boss walks faster, casts sooner and the escorts come twice as often
        if (L2 && !this.enraged && boss && !boss.dead && boss.hp < boss.maxHp * L2.enrage) {
            this.enraged = true;
            boss.spdMul *= L2.enrageSpd; boss.cdMul *= L2.enrageCd;
            this.text(W / 2, 170, L('광폭화! 보스가 사나워졌다'), '#ff5040', 28, true); this.addShake(10);
            this.on('enrage', boss);
        }
        if (this.t >= this.nextEscort) {
            this.nextEscort = this.t + RAID.escortEvery * (this.enraged ? 0.5 : 1);
            const rng = makeRng(Math.floor(this.t) * 13 + 7);
            const pool = (this.cfg.escortPool || ['goblin', 'wolf']).filter(k => !ENEMIES[k].elite);
            const wave = this.makeWave(rng, RAID.escortBudget * (1 + 0.05 * Math.max(0, this.stageIdx)), pool, 2, 4);
            for (const s of wave) this.queue.push({ t: this.t + s.t, kind: s.kind, path: s.path, hpMul: this.hpMul * RAID.escortHp });
        }
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.state = L2 ? 'lose' : 'win'; this.on('end', !L2); }
    }

    callWave() {
        if (this.state === 'win' || this.state === 'lose') return;
        if (this.waveIdx + 1 >= this.totalWaves) return;
        if (this.countdown > 0 && this.state === 'run') {
            const bonus = Math.ceil(this.countdown * EARLY_GOLD_PER_SEC);
            if (bonus > 0) { this.gold += bonus; this.on('earlyBonus', bonus); }
        }
        this.state = 'run';
        this.waveIdx++;
        const wave = this.endless ? this.genEndlessWave(this.waveIdx) : this.waves[this.waveIdx];
        if (this.endless) this.hpMul = this.endlessHpMul(this.waveIdx);
        for (const s of wave) this.queue.push({ t: this.t + s.t, kind: s.kind, path: s.path, hpMul: this.hpMul * (s.bossMul || 1) });
        this.countdown = -2;            // -2 = spawning in progress
        this.on('wave', this.waveIdx);
    }
    spawnPoints() {
        return this.paths.map(p => { const a = p.at(40); return { x: clamp(a.x, 50, W - 50), y: clamp(a.y, 80, H - 50) }; });
    }
    get heroAlive() { return this.hero.deadUntil <= this.t; }
    progress(e) { return e.d / e.path.len; }

    // ------------------------------------------------------------ main update
    update(dtReal) {
        if (this.state === 'win' || this.state === 'lose') { this.updateFx(dtReal); return; }
        this.updateFx(dtReal);
        if (this.cutin) {
            this.cutin.t += dtReal;
            if (this.cutin.t < this.cutin.dur) return;
            this.cutin = null; this.flash = Math.max(this.flash, 0.18);
        }
        if (this.hitstop > 0) { this.hitstop -= dtReal; return; }
        let dt = dtReal;
        if (this.slowmo > 0) { this.slowmo -= dtReal; dt *= 0.35; }
        this.t += dt;

        // waves
        if (this.raid) this.updateRaid(dt);
        if (this.drip) this.payDrip();
        if (this.queue.length) {
            const due = this.queue.filter(q => q.t <= this.t);
            if (due.length) {
                this.queue = this.queue.filter(q => q.t > this.t);
                for (const q of due) this.spawn(q.kind, q.path, q.hpMul);
            }
            if (!this.raid && !this.queue.length && this.waveIdx + 1 < this.totalWaves) this.countdown = this.endless ? 14 : WAVE_GAP;
        } else if (this.raid) {
            // raid: no wave calls
        } else if (this.countdown > 0) {
            this.countdown -= dt;
            const auto = this.cfg.autoWave() && this.enemies.length <= 3;
            if (this.countdown <= 0 || auto) { if (auto && this.countdown > 0) { /* early call bonus applies */ } this.callWave(); }
        } else if (this.state === 'prep' && this.cfg.autoWave()) {
            this.prepWait = (this.prepWait || 0) + dt;
            if (this.prepWait > 2.5) this.callWave();
        }

        for (const sp of this.spells) sp.left = Math.max(0, sp.left - dt);
        if (this.coop) for (const a of this.acts) if (a.spells !== this.spells) for (const sp of a.spells) sp.left = Math.max(0, sp.left - dt);
        this.updateEnemies(dt);
        this.updateTowers(dt);
        this.updateSoldiers(dt);
        this.updateHero(dt);
        if (this.coop) for (let k = 0; k < this.acts.length; k++) if (k !== this.actor) this.asActor(k, () => this.updateHero(dt));
        if (this.allies.length) this.updateAllies(dt);
        this.updateProjs(dt);
        this.updateZones(dt);
        this.updateTeles();
        this.enemies = this.enemies.filter(e => !e.dead);

        if (this.lives <= 0) { this.lives = 0; this.state = 'lose'; this.on('end', false); return; }
        if ((!this.endless || this.maxWaves) && this.waveIdx >= this.totalWaves - 1 && !this.queue.length && !this.enemies.length && this.state === 'run') {
            this.state = 'win'; this.on('end', true);
        }
    }

    // continue after a defeat: some lives back, the enemies at the gate are pushed back down the road
    revive(lives) {
        this.revived = true;
        this.lives = lives;
        this.state = 'run';
        for (const e of this.enemies) if (this.progress(e) > 0.75 && !e.def.boss) e.d = e.path.len * 0.55;
        if (this.heroAlive === false) this.hero.deadUntil = this.t;
        this.flash = 0.3; this.addShake(8);
    }

    breakCond() {
        if (this.condBroken) return;
        this.condBroken = true;
        this.text(W / 2, 150, L('3성 조건 실패: {0}', this.cond.name), '#ff9a7a', 22, true);
        this.on('condBroken', this.cond);
    }
    stars() {
        const lost = this.maxLives - this.lives;
        const s = lost <= 2 ? 3 : lost <= 10 ? 2 : 1;
        return s === 3 && this.cond && this.condBroken ? 2 : s;
    }
}
