'use strict';
// 협동 디펜스 (docs/PLAN_ONLINE_RAID.md 4): two players, one battle. Methods of Battle, loaded after hero.js.
// The battle state is "canonical" (player 0 = host in hero/gold/spells/b, player 1 in hero2/gold2/spells2/b2) while it updates.
// asActor(1, fn) swaps the two so commands and the second hero's update run with the usual this.hero / this.gold code.
// The guest device keeps the swapped view between ticks (js/online/coop.js), so its HUD shows its own hero and gold.
Object.assign(Battle.prototype, {
    initCoop(cfg) {
        const C = RAID_ON.coop, m = cfg.mate, h0 = this.hero;
        this.actor = 0;
        this.initHero(m.cls, m.stats);
        const h1 = this.hero; this.hero = h0;
        h1.skin = m.skin || null; h1.owner = 1;
        h0.auto = !!cfg.autos[0]; h1.auto = !!cfg.autos[1];
        if (this.paths[1]) { const g = this.paths[1].at(this.paths[1].len * 0.72); h1.x = g.x; h1.y = g.y - 10; h1.guard = { x: g.x, y: g.y - 10 }; }
        this.hero2 = h1;
        this.b2 = m.bonuses; this.bs = [this.b, this.b2];
        this.gold = Math.round(this.gold * C.startGold); this.gold2 = this.gold;
        this.spells2 = this.spells.map(s => ({ ...s, left: 0, cdMax: s.id === 'beacon' ? s.cd * this.b2.beaconCdMul : s.cd }));
        this.names = cfg.names || ['', ''];
        this.cmdLog = 0;
    },
    // waves on two roads: the stage's own waves get a boss at RAID_ON.coop.midWave and the raid boss at the end
    coopWaves() {
        const C = RAID_ON.coop, st = this.stage;
        const last = (w, kind, mul) => { const t = w.reduce((m, s) => Math.max(m, s.t), 0) + 5; w.push({ t, kind, path: 0, bossMul: mul }); };
        this.waves.forEach((w, i) => { for (const s of w) if (this.paths.length > 1 && i % 2 === 1) s.path = (s.path + 1) % this.paths.length; });
        if (st.midBoss) last(this.waves[C.midWave - 1], st.midBoss, 1);
        for (const w of this.waves) for (const s of w) if (s.kind === st.boss) s.bossMul = C.bossHp;
    },
    heroList() { return this.coop ? [this.hero, this.hero2] : [this.hero]; },
    swapActor() {
        [this.hero, this.hero2] = [this.hero2, this.hero];
        [this.gold, this.gold2] = [this.gold2, this.gold];
        [this.spells, this.spells2] = [this.spells2, this.spells];
        [this.b, this.b2] = [this.b2, this.b];
        this.actor = 1 - this.actor;
    },
    asActor(k, fn) {
        if (!this.coop || k === this.actor) return fn();
        this.swapActor();
        try { return fn(); } finally { this.swapActor(); }
    },
    // kill gold: each player keeps a share (RAID_ON.coop.goldShare) of every kill, whoever made it
    gainGold(v) {
        if (!this.coop) { this.gold += v; return; }
        const s = Math.round(v * RAID_ON.coop.goldShare);
        this.gold += s; this.gold2 += s;
    },
    // one player command, applied at the same tick on both devices. c = [name, ...args]
    runCmd(k, c) {
        return this.asActor(k, () => {
            const [n, a, b, x] = c, slot = typeof a === 'number' ? this.slots[a] : null;
            switch (n) {
                case 'build': return slot && this.build(slot, b);
                case 'up': return slot && this.upgrade(slot, b);
                case 'sell': return slot && this.sell(slot);
                case 'rally': return slot && this.setRally(slot, b, x);
                case 'skill': return this.castSkill(a, b, x, true);
                case 'spell': return this.castSpell(a, b, x);
                case 'move': return this.commandHeroMove(a, b);
                case 'auto': this.hero.auto = !!a; return true;
                case 'wave': if (this.state === 'prep' || this.countdown > 0) this.callWave(); return true;
            }
            return false;
        });
    },
    // a short number both devices compare to notice a split (hp in whole points, so float noise does not count)
    checksum() {
        let s = this.lives * 7919 + Math.round(this.gold) * 31 + Math.round(this.gold2) * 17 + this.waveIdx * 101 + this.enemies.length * 13;
        for (const e of this.enemies) s = (s * 31 + Math.round(e.hp) + Math.round(e.d)) % 1000000007;
        for (const sl of this.slots) if (sl.tower) s = (s * 7 + sl.i * 3 + sl.tower.lv + 1) % 1000000007;
        return s;
    },
    // the host's picture of the fight for a guest that split off: every enemy, tower, soldier, hero, projectile and
    // zone with their timers. References between them become tokens ($e enemy id, $s soldier, $h hero, $t tower, $sl slot,
    // $p road, $d enemy kind) and are rebuilt on the other side. Visual-only lists stay the guest's own; telegraphs with
    // a callback (hero skills about to land) cannot travel and stay as they are.
    snapshot() {
        const tok = new Map();
        this.enemies.forEach(e => tok.set(e, { $e: e.id }));
        this.soldiers.forEach((x, i) => tok.set(x, { $s: i }));
        this.heroList().forEach((x, i) => tok.set(x, { $h: i }));
        this.slots.forEach((sl, i) => { tok.set(sl, { $sl: i }); if (sl.tower) tok.set(sl.tower, { $t: i }); });
        this.paths.forEach((x, i) => tok.set(x, { $p: i }));
        for (const k in ENEMIES) tok.set(ENEMIES[k], { $d: k });
        const pack = (v, top, depth = 0) => {
            if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
            if (!top && tok.has(v)) return tok.get(v);
            if (v instanceof Set) return { $set: [...v].map(x => pack(x, false, depth + 1)) };
            if (depth > 4) return undefined;
            if (Array.isArray(v)) return v.map(x => pack(x, false, depth + 1));
            const o = {};
            for (const k in v) { const x = pack(v[k], false, depth + 1); if (x !== undefined) o[k] = x; }
            return o;
        };
        const plain = arr => arr.filter(x => !Object.values(x).some(v => typeof v === 'function')).map(x => pack(x, true));
        const nums = {};
        for (const k of ['t', 'lives', 'gold', 'gold2', 'waveIdx', 'countdown', 'state', 'uid', 'chillUntil', 'chill', 'blindUntil', 'blind', 'hitstop', 'slowmo', 'prepWait', 'kills', 'leaked', 'nextEscort', 'timeLeft', 'raidDamage', 'condBroken', 'revived', 'mustKillLost']) if (this[k] !== undefined) nums[k] = this[k];
        return {
            nums, rng: this.rng.state(), combo: { ...this.combo }, boss: this.bossRef ? this.bossRef.id : null,
            q: this.queue.map(q => pack(q, true)),
            en: this.enemies.filter(e => !e.dead).map(e => pack(e, true)),
            so: this.soldiers.map(x => pack(x, true)),
            tw: this.slots.map(sl => sl.tower ? pack(sl.tower, true) : 0),
            hs: this.heroList().map(x => pack(x, true)),
            sp: [this.spells.map(x => x.left), this.spells2.map(x => x.left)],
            pr: plain(this.projs), zn: plain(this.zones),
        };
    },
    applySnapshot(S) {
        Object.assign(this, S.nums);
        this.combo = S.combo;
        const ens = new Map(), sos = [], tws = [];
        const old = new Map(this.enemies.map(e => [e.id, e]));
        for (const d of S.en) { const e = old.get(d.id) || {}; for (const k of Object.keys(e)) delete e[k]; ens.set(d.id, e); }
        S.so.forEach(() => sos.push({}));
        S.tw.forEach(d => tws.push(d ? {} : null));
        const heroes = this.heroList();
        const un = v => {
            if (v === null || typeof v !== 'object') return v;
            if (Array.isArray(v)) return v.map(un);
            if ('$e' in v) return ens.get(v.$e) || null;
            if ('$s' in v) return sos[v.$s] || null;
            if ('$h' in v) return heroes[v.$h];
            if ('$t' in v) return tws[v.$t] || null;
            if ('$sl' in v) return this.slots[v.$sl];
            if ('$p' in v) return this.paths[v.$p];
            if ('$d' in v) return ENEMIES[v.$d];
            if ('$set' in v) return new Set(v.$set.map(un));
            const o = {}; for (const k in v) o[k] = un(v[k]); return o;
        };
        const fill = (target, d) => { for (const k in d) target[k] = un(d[k]); return target; };
        this.enemies = S.en.map(d => fill(ens.get(d.id), d));
        this.soldiers = S.so.map((d, i) => fill(sos[i], d));
        this.slots.forEach((sl, i) => { sl.tower = tws[i] ? fill(tws[i], S.tw[i]) : null; });
        heroes.forEach((h, i) => { const skills = h.skills; fill(h, S.hs[i]); if (!h.skills || !h.skills.length) h.skills = skills; });
        this.queue = S.q.map(un);
        S.sp[0].forEach((v, i) => { if (this.spells[i]) this.spells[i].left = v; });
        S.sp[1].forEach((v, i) => { if (this.spells2[i]) this.spells2[i].left = v; });
        this.projs = S.pr.map(un).filter(p => !p.target || p.target.def);
        this.zones = S.zn.map(un);
        this.bossRef = S.boss !== null ? ens.get(S.boss) || null : null;
        this.rng.state(S.rng);
    },
});
