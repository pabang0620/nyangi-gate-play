'use strict';
// 냥이 공성전 (docs/PLAN_ONLINE_V4.md 2, 단계 0 + 3): one attacker's army against a stored base (tower layout + AI hero).
// The whole fight is a pure function of the setup and the attacker's input log, run on fixed ticks of SIEGE.dt:
//   setup = { v, map, layout: { t: [[slot, type, lv, spec], ...], hero }, def: { cls, lv, hp, atk, crit, cdr, skin, b }, lg, army, sk, seed }
//   log   = [[tick, code], ...]   code 0/1 = attacker skill, 2 = call the next wave now
// so a replay is setup + log (+ the tick a give-up ended it), and tools/siege-replay-check.js checks that it plays back the same.
// Every roll goes through the seeded rng (B.rand = B.rng), drops are off, the hero's ultimate cut-in is off (it would pause the sim).
// Shared battle files only hold two hooks: this.siege in js/battle/enemies.js (leaks cost siegeLeak(e) lives, no instant loss).
const SIEGE = {
    v: 1,
    dt: 1 / 30,
    maxTicks: 30 * 210,             // 3분 30초 of battle time: what is still on the road then does not count (held enemies cannot stall it)
    slotRef: 17,                    // build spots come from this stage seed on every siege map (same spots for everyone)
    lives: 20,
    stars: [4, 10, 20],             // lives taken for 1, 2, 3 stars (3 = the gate falls)
    budget: 2600,                   // tower gold every base gets (same for everyone: placement skill decides)
    maxTowers: 10,
    maps: [
        { map: 'm7', theme: 'grass', name: L('들판 성채') },
        { map: 'm4', theme: 'snow', name: L('얼음 성채') },
        { map: 'm12', theme: 'desert', name: L('사막 성채') },
    ],
    heroPost: [0.45, 0.65, 0.85],   // where on the first road the defending hero stands (layout.hero)
    // leagues by trophies. ref: enemy strength stage of the league, hp: army health on top (tools/siege-balance.js); lv / atkK / hpK / f / towerDmg: the cap on the defender's
    // hero, gear and research (a fair player at ref, tools/balance.js profile), so paying more does not buy a wall
    leagues: [
        { min: 0, name: L('브론즈 냥'), ref: 11, hp: 1.6, lv: 18, atkK: 2.1, hpK: 1.5, f: 0.4, towerDmg: 0.3 },
        { min: 400, name: L('실버 냥'), ref: 17, hp: 1.9, lv: 23, atkK: 2.6, hpK: 1.75, f: 0.55, towerDmg: 0.45 },
        { min: 900, name: L('골드 냥'), ref: 29, hp: 2.6, lv: 30, atkK: 3.4, hpK: 2.1, f: 0.75, towerDmg: 1.15 },
        { min: 1500, name: L('다이아 냥'), ref: 41, hp: 3.1, lv: 35, atkK: 4.2, hpK: 2.5, f: 0.9, towerDmg: 1.8 },
        { min: 2200, name: L('전설 냥'), ref: 53, hp: 1.6, lv: 40, atkK: 4.4, hpK: 2.6, f: 1, towerDmg: 2.45 },
    ],
    bmax: { archerDmg: 0.5, mageDmg: 0.6, cannonDmg: 0.6, soldierHp: 0.7, soldierAtk: 0.6, archerRange: 0.27, archerCrit: 0.2, archerRate: 0.15,
        mageRate: 0.3, cannonSplash: 0.3, cannonStun: 0.15, soldierArmor: 0.15 },
    // army: points for the whole army (3 waves), at most `groups` groups a wave
    army: { points: 240, waves: 3, groups: 4, maxN: 20, eliteN: 3, bossCost: 34, hpMul: 1 },
    noArmy: ['beetlet', 'ember', 'cog'],   // split children only appear from their parent
    // leaks: an elite takes 2 lives, a boss at most 5 (no instant loss like the campaign must-kill rule)
    leak: { boss: 5 },
    skills: [
        { id: 'drum', name: L('진군 북'), desc: L('모든 적이 {0}초 동안 빨라져요'), cd: 18, uses: 3, dur: 5, durLv: 0.5, icon: 'i_horn' },
        { id: 'guard', name: L('냥냥 방패'), desc: L('모든 적에게 체력 {0}% 보호막'), cd: 24, uses: 2, amt: 0.25, amtLv: 0.03, icon: 'i_shield' },
    ],
    skillMax: 5,
};

// ------------------------------------------------------------ helpers shared by the editor, the battle and the server checks
function siegeLeague(trophies) { let i = 0; SIEGE.leagues.forEach((g, k) => { if (trophies >= g.min) i = k; }); return i; }
function siegeStars(taken) { let s = 0; SIEGE.stars.forEach((v, i) => { if (taken >= v) s = i + 1; }); return s; }
function siegeEnemyCost(k) { const d = ENEMIES[k]; return !d ? 0 : d.boss ? SIEGE.army.bossCost : Math.max(1, Math.round(d.cost)); }
function siegeTowerCost(type, lv, spec) {
    const d = TOWERS[type]; if (!d) return Infinity;
    let c = 0; for (let i = 0; i <= Math.min(2, lv); i++) c += d.lv[i].cost;
    if (spec === 0 || spec === 1) c += d.specs[spec].cost;
    return c;
}
function siegeLayoutCost(layout) { return (layout.t || []).reduce((s, x) => s + siegeTowerCost(x[1], x[2], x[3]), 0); }
function siegeArmyCost(army) { let s = 0; for (const w of army || []) for (const g of w) s += siegeEnemyCost(g[0]) * g[1]; return s; }
// can this enemy go in an army? (seen in the codex: what you have fought is what you can send)
function siegeArmyOk(k, codex) { const d = ENEMIES[k]; return !!d && !SIEGE.noArmy.includes(k) && (!codex || (codex[k] || 0) > 0); }
// layout rules: known slots, one tower per slot, budget, tower count. Returns '' or the reason
function siegeCheckLayout(layout, slotCount) {
    const seen = new Set(), t = layout && layout.t;
    if (!Array.isArray(t) || !t.length) return 'empty';
    if (t.length > SIEGE.maxTowers) return 'count';
    for (const x of t) {
        if (!Array.isArray(x) || !(x[0] >= 0 && x[0] < slotCount) || seen.has(x[0])) return 'slot';
        seen.add(x[0]);
        if (!TOWERS[x[1]] || !(x[2] >= 0 && x[2] <= 2) || !(x[3] === null || x[3] === undefined || ((x[3] === 0 || x[3] === 1) && x[2] === 2))) return 'tower';
    }
    if (siegeLayoutCost(layout) > SIEGE.budget) return 'budget';
    if (!(layout.hero >= 0 && layout.hero < SIEGE.heroPost.length)) return 'hero';
    return '';
}
function siegeCheckArmy(army, codex) {
    const A = SIEGE.army;
    if (!Array.isArray(army) || army.length !== A.waves) return 'waves';
    let bosses = 0;
    for (const w of army) {
        if (!Array.isArray(w) || !w.length || w.length > A.groups) return 'groups';
        for (const g of w) {
            if (!Array.isArray(g) || !siegeArmyOk(g[0], codex) || !(g[1] >= 1 && g[1] === Math.floor(g[1]))) return 'enemy';
            const d = ENEMIES[g[0]];
            if (g[1] > (d.boss ? 1 : d.elite ? A.eliteN : A.maxN)) return 'count';
            if (d.boss) bosses += g[1];
        }
    }
    if (bosses > 1) return 'boss';
    if (siegeArmyCost(army) > A.points) return 'points';
    return '';
}
// the defender's hero and bonuses as they fight: capped by the league (gear and research count, up to a fair player's)
function siegeHero(def, lg) {
    const C = SIEGE.leagues[lg] || SIEGE.leagues[0], cls = HEROES[def.cls] ? def.cls : 'knight', H0 = HEROES[cls];
    const lv = Math.max(1, Math.min(def.lv | 0, C.lv, HERO_MAX_LV)), g = Math.pow(HERO_GROWTH, lv - 1);
    const n = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    return { cls, lv, hp: Math.round(Math.min(n(def.hp, H0.hp), H0.hp * g * C.hpK)), atk: Math.round(Math.min(n(def.atk, H0.atk), H0.atk * g * C.atkK)),
        crit: Math.min(n(def.crit, 0.05), 0.05 + 0.2 * C.f), cdr: Math.min(n(def.cdr, 0), 0.4 * C.f) };
}
function siegeBonus(src, lg) {
    const C = SIEGE.leagues[lg] || SIEGE.leagues[0], s = src || {};
    const n = k => (typeof s[k] === 'number' && isFinite(s[k]) ? s[k] : 0);
    const b = { heroAtk: 0, heroHp: 0, heroAtkPct: 0, heroHpPct: 0, critRate: 0, skillCdr: 0, towerDmg: clamp(n('towerDmg'), 0, C.towerDmg),
        startGold: 0, bountyPct: 0, mageResIgnore: n('mageResIgnore') >= 0.5 && C.f >= 0.5 ? 0.5 : 0, extraSoldier: n('extraSoldier') >= 1 && C.f >= 0.5 ? 1 : 0,
        respawnMul: Math.max(typeof s.respawnMul === 'number' ? s.respawnMul : 1, 1 - 0.58 * C.f), beaconMul: 1, beaconCdMul: 1, lives: 0, buildDiscount: 0 };
    for (const k in SIEGE.bmax) b[k] = clamp(n(k), 0, SIEGE.bmax[k] * C.f);
    return b;
}
// what the client sends with its base: the hero it defends with and its bonuses (the server and siegeHero/siegeBonus cap them)
function siegeDefOf(p) {
    const cls = p.hero, hs = heroStats(p, cls), b = computeBonuses(p), keep = {};
    for (const k of ['towerDmg', 'mageResIgnore', 'extraSoldier', 'respawnMul', ...Object.keys(SIEGE.bmax)]) keep[k] = Math.round((b[k] || 0) * 1000) / 1000;
    return { cls, lv: hs.lv, hp: hs.hp, atk: hs.atk, crit: Math.round(hs.crit * 1000) / 1000, cdr: Math.round(hs.cdr * 1000) / 1000, skin: (p.shop && p.shop.skin[cls]) || null, b: keep };
}

// ------------------------------------------------------------ the battle
// waves from the army: groups one after another, spacing by enemy speed (like Battle.makeWave)
function siegeWaves(army, nPaths) {
    return army.map(w => {
        const out = []; let t0 = 0;
        for (const [kind, n, path] of w) {
            const d = ENEMIES[kind], gap = d.boss ? 4 : d.elite ? 3.0 : d.spd > 70 ? 0.5 : d.spd < 32 ? 1.1 : 0.7;
            for (let i = 0; i < n; i++) out.push({ t: t0 + i * gap, kind, path: ((path | 0) % nPaths + nPaths) % nPaths });
            t0 += n * gap * 0.45 + 1.5;
        }
        return out;
    });
}
// the battle for a setup (opt: { on, shakeOn }); without setup.army it is just the base (layout editor, preview)
function siegeBattle(setup, opt) {
    const M = SIEGE.maps[setup.map] || SIEGE.maps[0], lg = clamp(setup.lg | 0, 0, SIEGE.leagues.length - 1), C = SIEGE.leagues[lg];
    const def = setup.def || { cls: 'knight', lv: 1 };
    const B = new Battle({
        mode: 'siege', stageIdx: SIEGE.slotRef, map: M.map, theme: M.theme, seed: setup.seed | 0,
        stageDef: { name: L('냥이 공성전'), seedName: 'siege', map: M.map, waves: SIEGE.army.waves, pool: ['slime'], ch: 0 },
        heroCls: HEROES[def.cls] ? def.cls : 'knight', heroStats: siegeHero(def, lg), skin: def.skin || null, bonuses: siegeBonus(def.b, lg), dmgMul: 1, party: [],
        autoHero: () => true, autoWave: () => true, cutinOn: () => false, shakeOn: opt && opt.shakeOn, on: () => { },
    });
    B.siege = true;
    B.rand = () => B.rng();                         // every roll from the seed (like co-op)
    B.rollDrop = () => { };                         // no loot (and no loot slow-motion)
    B.spells = [];                                  // the defender has no spells: the hero and the towers fight alone
    B.stageIdx = C.ref; B.hpMul = stageHpMul(C.ref) * C.hp * SIEGE.army.hpMul; B.atkMul = 1 + 0.1 * C.ref; B.bountyMul = 1;
    B.maxLives = B.lives = SIEGE.lives;
    // the hero's post on the first road
    const P = B.paths[0], g = P.at(P.len * SIEGE.heroPost[clamp((setup.layout && setup.layout.hero) | 0, 0, SIEGE.heroPost.length - 1)]);
    B.hero.x = g.x; B.hero.y = g.y - 10; B.hero.guard = { x: g.x, y: g.y - 10 };
    // towers: built with free gold, then the purse is emptied (kills still pay, but nobody builds)
    B.gold = 1e9;
    for (const [si, type, lv, spec] of (setup.layout && setup.layout.t) || []) {
        const s = B.slots[si]; if (!s || s.tower || !TOWERS[type]) continue;
        B.build(s, type);
        for (let i = 0; i < Math.min(2, lv | 0); i++) B.upgrade(s, null);
        if ((spec === 0 || spec === 1) && lv >= 2) B.upgrade(s, spec);
    }
    B.gold = 0; B.parts = [];
    B.siegeSetup = setup; B.siegeTick = 0; B.siegeLog = []; B.siegeAt = 0; B.siegeAcc = 0; B.siegeEnd = -1;
    const lvOf = i => clamp(((setup.sk || [])[i]) | 0, 0, SIEGE.skillMax);
    B.siegeSk = SIEGE.skills.map((s, i) => ({ id: s.id, left: 0, uses: s.uses, lv: lvOf(i) }));
    if (setup.army) { B.waves = siegeWaves(setup.army, B.paths.length); B.totalWaves = B.waves.length; }
    B.on = (opt && opt.on) || (() => { });   // set after the towers are built (no build sounds)
    return B;
}
// lives a leak costs in siege (enemies.js hook): elites their own 2, bosses at most SIEGE.leak.boss
Object.assign(Battle.prototype, {
    siegeLeak(e) { return e.def.boss ? Math.min(e.def.lives, SIEGE.leak.boss) : e.def.lives; },
});
function siegeOver(B) { return B.state === 'win' || B.state === 'lose' || B.siegeTick >= SIEGE.maxTicks || (B.siegeEnd >= 0 && B.siegeTick >= B.siegeEnd); }
// one attacker command, at the start of a tick
function siegeApply(B, code) {
    if (code === 2) { if (B.state === 'prep' || B.countdown > 0) B.callWave(); return; }
    const S = SIEGE.skills[code], k = B.siegeSk && B.siegeSk[code];
    if (!S || !k || k.left > 0 || k.uses <= 0 || B.state !== 'run') return;
    const live = B.enemies.filter(e => !e.dead);
    if (!live.length) return;
    k.left = S.cd; k.uses--;
    if (S.id === 'drum') {
        const until = B.t + S.dur + S.durLv * k.lv;
        for (const e of live) e.hasteUntil = Math.max(e.hasteUntil, until);
        B.ringFx(W / 2, H / 2, 520, '#ffcf5a');
    } else {
        const amt = S.amt + S.amtLv * k.lv;
        for (const e of live) e.shield = Math.max(e.shield, (e.maxHp / (e.raidMul || 1)) * amt * (e.def.boss ? 0.3 : 1));
        for (const e of live.slice(0, 12)) B.rings.push({ x: e.x, y: e.y, r0: 6, r1: 34, life: 0.5, max: 0.5, color: '#9fe0ff' });
    }
    B.text(W / 2, 150, S.name + '!', '#ffe08a', 26, true);
    B.on('siegeSkill', S.id);
}
// one fixed tick: the commands logged for it, then the battle
function siegeStep(B) {
    if (siegeOver(B)) { B.updateFx(SIEGE.dt); return; }
    const log = B.siegeLog;
    while (B.siegeAt < log.length && log[B.siegeAt][0] <= B.siegeTick) { siegeApply(B, log[B.siegeAt][1]); B.siegeAt++; }
    Battle.prototype.update.call(B, SIEGE.dt);
    if (B.siegeSk) for (const k of B.siegeSk) k.left = Math.max(0, k.left - SIEGE.dt);
    B.siegeTick++;
}
// live play / replay viewing on a device: real time in, fixed ticks out (main.js calls B.update(dt) once per speed step)
function siegeLive(B, replay) {
    B.update = dt => {
        B.siegeAcc += dt;
        for (let n = 0; B.siegeAcc >= SIEGE.dt && n < 6; n++) { B.siegeAcc -= SIEGE.dt; siegeStep(B); }
    };
    B.siegeInput = code => {
        if (replay || siegeOver(B) || B.siegeLog.length >= 200) return false;
        B.siegeLog.push([B.siegeTick, code]);
        return true;
    };
    return B;
}
function siegeResult(B) {
    const taken = clamp(B.maxLives - Math.max(0, B.lives), 0, B.maxLives);
    return { taken, stars: siegeStars(taken), ticks: B.siegeTick, kills: B.kills, wave: Math.max(0, B.waveIdx + 1) };
}
// a short fingerprint of the whole state: equal fingerprints = the same fight
function siegeDigest(B) {
    const r = v => Math.round(v * 100);
    return [B.siegeTick, B.lives, B.kills, r(B.t), B.rng.state(), r(B.hero.hp), r(B.hero.x), B.waveIdx,
        B.enemies.map(e => e.kind + ':' + r(e.hp) + ':' + r(e.d)).join(','), B.soldiers.map(s => r(s.hp)).join(',')].join('|');
}
// headless: the whole fight from setup + log (end: the tick a give-up stopped it)
function siegeRun(setup, log, end) {
    const B = siegeBattle(setup);
    B.siegeLog = (log || []).slice().sort((a, b) => a[0] - b[0]);
    if (end >= 0) B.siegeEnd = end;
    while (!siegeOver(B)) siegeStep(B);
    return { ...siegeResult(B), digest: siegeDigest(B) };
}

// ------------------------------------------------------------ automatic layouts (editor "자동 배치", training bases, balance bot)
// greedy by road coverage; style weights the tower mix. Spends the budget on towers first, then levels, then specs
function siegeAutoLayout(mapIdx, style = 'mix', budget = SIEGE.budget) {
    const B = siegeBattle({ map: mapIdx, layout: { t: [], hero: 1 }, def: { cls: 'knight', lv: 1 }, lg: 0, seed: 1 });
    const cov = s => { let n = 0; for (const P of B.paths) for (let d = 0; d < P.len; d += 20) { const a = P.at(d); if (dist2(a.x, a.y, s.x, s.y) < 160 * 160) n += 1 + d / P.len; } return n; };
    const order = B.slots.map((s, i) => ({ i, c: cov(s), x: s.x })).sort((a, b) => b.c - a.c);
    const MIX = { mix: ['archer', 'mage', 'barracks', 'cannon', 'archer', 'mage', 'cannon', 'archer'], archer: ['archer', 'archer', 'mage', 'archer', 'barracks', 'archer', 'cannon'],
        mage: ['mage', 'mage', 'archer', 'mage', 'barracks', 'mage', 'cannon'], cannon: ['cannon', 'barracks', 'cannon', 'archer', 'cannon', 'mage', 'barracks'],
        wall: ['barracks', 'archer', 'barracks', 'mage', 'barracks', 'cannon', 'archer'] }[style] || ['archer', 'mage', 'barracks', 'cannon'];
    const SPEC = { archer: 1, mage: 0, cannon: 0, barracks: 0 };
    const n = style === 'tall' ? 5 : 7, picks = order.slice(0, n);
    const t = picks.map((s, k) => [s.i, MIX[k % MIX.length], 0, null]);
    const cost = () => siegeLayoutCost({ t });
    while (cost() > budget && t.length) t.pop();
    for (let lv = 1; lv <= 2; lv++) for (const x of t) { x[2] = lv; if (cost() > budget) x[2] = lv - 1; }
    for (const x of t) if (x[2] === 2) { x[3] = SPEC[x[1]]; if (cost() > budget) x[3] = null; }
    return { t, hero: 1 };
}
