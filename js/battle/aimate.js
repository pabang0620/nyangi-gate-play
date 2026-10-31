'use strict';
// AI 동료 (docs/PLAN_ONLINE_V4.md 7): an AI cat fills an empty seat of 협동 디펜스 / 파티 레이드. Methods of Battle, loaded after coop.js.
// It is meant to be clearly worse than a person: the owner's hero level but a different class at AI_MATE.power, slow and
// hesitant tower play (a decision every 1.5~2.5 s, sometimes nothing, sometimes the wrong tower or spot, keeps gold back),
// hero skills on a longer cooldown, spells only now and then.
// Lockstep: every device runs the AI inside the shared tick (js/online/coop.js step) with the battle's own rand, and its
// schedule comes from the tick number only, so it needs no state of its own outside the battle snapshot.
const AI_MATE = {
    power: 0.7,          // hero hp/atk vs the owner's own hero
    seg: 60, jitter: 16, // decide once per 60 ticks (2 s) at a shifting offset: gaps of 1.5~2.5 s
    idle: 0.25,          // chance a decision does nothing
    offPlan: 0.3,        // chance the tower type is random instead of the plan
    spread: 4,           // picks among the best (spread + towers) open spots, not the best one
    save: 1.3,           // spends only when it holds 130% of the price: some gold always stays unspent
    maxTowers: 6,        // a person fills the map; the AI stops at 6 (8 once those are fully upgraded)
    skillCd: 1.6,        // hero skill cooldowns x1.6
    spell: 0.15,         // chance per decision to try 집결 신호 (needs 8 enemies bunched up)
    bossWeight: 0.75,    // 파티 레이드: an AI seat sizes the boss like this much of a person (tools/aimatetest.js)
};

// 파티 레이드 boss health with AI seats: the row for everyone seated (js/main.js), scaled down for the AI ones
function aiBossScale(infos) { const n = infos.length, ai = infos.filter(x => x && x.ai).length; return n ? (n - ai + ai * AI_MATE.bossWeight) / n : 1; }

// the lobby side: an AI cat from the owner's save (p) for AI slot i: another class at the main hero's level, weaker
function aiMateInfo(p, i) {
    const own = p.hero, others = Object.keys(HEROES).filter(c => c !== own), cls = others[i % others.length];
    const lv = p.heroes[own].lv, q = { ...p, heroes: { ...p.heroes, [cls]: { ...p.heroes[cls], lv } } };
    const s = heroStats(q, cls);
    return {
        name: L('AI 냥이') + (i ? ' ' + (i + 1) : ''), tag: '', uid: null, ai: true, cls, skin: null, auto: true,
        stats: { ...s, hp: Math.round(s.hp * AI_MATE.power), atk: Math.round(s.atk * AI_MATE.power) },
        bonuses: computeBonuses(p), dmgMul: codexDmgMul(p),
    };
}

Object.assign(Battle.prototype, {
    // infos: the battle players in order (js/online/coop.js infos); AI ones get AUTO heroes with slower skills
    aiSetup(infos) {
        this.aiMates = [];
        (infos || []).forEach((x, k) => { if (x && x.ai && this.acts && this.acts[k]) this.aiMates.push(k); });
        if (!this.aiMates.length) { this.aiMates = null; return; }
        for (const k of this.aiMates) {
            const h = this.acts[k].hero;
            h.auto = true;
            for (const s of h.skills) s.cdMax *= AI_MATE.skillCd;
        }
        // open spots by how much road they see (fixed by the map, the same on every device)
        const cov = sl => { let n = 0; for (const P of this.paths) for (let d = 0; d < P.len; d += 20) { const a = P.at(d); if (dist2(a.x, a.y, sl.x, sl.y) < 160 * 160) n += 1 + d / P.len; } return n; };
        this.aiSlots = this.slots.map(sl => ({ sl, c: cov(sl) })).filter(x => x.c > 4).sort((a, b) => b.c - a.c || a.sl.i - b.sl.i).map(x => x.sl);
        const air = ((this.stage && this.stage.pool) || []).some(k => ENEMIES[k] && ENEMIES[k].fly);
        this.aiPlan = air ? ['archer', 'mage', 'barracks', 'archer', 'cannon', 'mage'] : ['archer', 'barracks', 'mage', 'cannon', 'archer', 'mage'];
    },
    // once per shared tick, before the update (canonical view); tick = the lockstep tick number
    aiTick(tick) {
        if (!this.aiMates || this.state === 'win' || this.state === 'lose') return;
        const A = AI_MATE, seg = Math.floor(tick / A.seg);
        for (const k of this.aiMates) {
            if (tick % A.seg !== (seg * 37 + k * 11) % A.jitter) continue;
            this.asActor(k, () => this.aiDecide(k));
        }
    },
    aiDecide(k) {
        const A = AI_MATE, r = () => this.rand();
        if (this.acts[k].hero.auto === false) this.acts[k].hero.auto = true;
        if (r() < A.idle) return;                                      // looked away
        if (r() < A.spell) {
            const sp = this.spells.find(s => s.id === 'beacon');
            const c = sp && sp.left <= 0 ? this.bestCluster(640, 360, 2000, 90, true) : null;
            if (c && c.n >= 8) { this.castSpell('beacon', c.x + (r() - 0.5) * 60, c.y + (r() - 0.5) * 60); return; }
        }
        const mine = this.slots.filter(sl => sl.tower && sl.tower.owner === k), open = this.aiSlots.filter(sl => !sl.tower);
        const up = mine.filter(sl => sl.tower.lv < 2 || sl.tower.spec === null);
        if (mine.length < A.maxTowers + (up.length ? 0 : 2) && open.length && (mine.length < 3 || r() < 0.55)) {
            const types = Object.keys(TOWERS).filter(t => t !== this.ban);
            let type = r() < A.offPlan ? types[Math.floor(r() * types.length)] : this.aiPlan[mine.length % this.aiPlan.length];
            if (type === this.ban) type = 'archer';
            const sl = open[Math.floor(r() * Math.min(open.length, A.spread + mine.length))];
            if (this.gold >= this.towerCost(type, 0) * A.save) this.build(sl, type);
            return;
        }
        if (!up.length) return;
        const sl = up[Math.floor(r() * up.length)], t = sl.tower;
        const spec = t.lv < 2 ? null : (r() < 0.5 ? 0 : 1);
        const cost = spec === null ? this.towerCost(t.type, t.lv + 1) : this.towerCost(t.type, 0, spec);
        if (this.gold >= cost * A.save) this.upgrade(sl, spec);
    },
});
