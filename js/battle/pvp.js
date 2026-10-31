'use strict';
// 냥냥 대전 (docs/PLAN_ONLINE_V4.md 3, 단계 4): real-time 1:1. Each player defends one lane and sends enemies into the other.
// A match M holds two ordinary Battles (M.bs[0], M.bs[1]) on the same one-road map, stepped together on fixed ticks of PVP.dt.
// Every device runs both lanes (lockstep, js/online/pvp.js): the match is a pure function of the seed, the two decks and the
// command log [tick, player, cmd], so it needs no state outside M (bots decide from the tick and M.rng).
//   commands: ['build', slot, type] ['up', slot, spec] ['sell', slot] ['rally', slot, x, y] ['skill', i, x, y] ['spell', id, x, y]
//             ['move', x, y] ['auto', on] ['send', cardId]
// Shared waves come to both lanes every PVP.waveEvery ticks and get stronger; after PVP.frenzyAt (3 min) they come twice as often (폭주).
// 0 lives loses; at PVP.endAt (4 min) more lives left wins, then more gold spent on sends, else a draw.
// Economy: kill gold builds towers and buys sends. Cheap sends raise my income (paid every PVP.income.every ticks), strong
// sends do not; the income is capped by the clock (pvpIncomeCap) so early 보내기 cannot snowball. Sent enemies pay the
// defender only PVP.sentGold of their bounty. Balance: tools/pvp-balance.js. Lockstep check: tools/pvp-sync-check.js.
// Shared battle files are untouched: everything here works through instance overrides on the two battles.
const PVP = {
    v: 1,
    dt: 1 / 30,
    map: 'm3', theme: 'grass', spd: 1.5,   // enemies walk faster than in the campaign: a 4-minute match on a full road
    hide: [[470, 585, 1070, 720], [615, 58, 865, 222]],   // no build spots under the send bar and the opponent view (js/ui/pvp.js)
    lives: 20,
    startGold: 220,
    hero: { lv: 20, hpK: 1.5, atkK: 1.2, crit: 0.1, cdr: 0.1 },   // everyone fights with the same hero strength (deck skill decides)
    // per class attack on top, so no class wins the lane by itself: in a lane of mixed waves the mage's area spells and healing and the
    // ranger's reach are worth far more than the knight's single blocks (equal attack: the mage won 16 of 16, the knight 0 of 16)
    heroK: { knight: 1.8, mage: 0.32, ranger: 0.6 },
    heroB: {},                                                  // per class battle bonuses on top (none now)
    post: { knight: 0.72, mage: 0.72, ranger: 0.72 },          // where on the road each class guards (share of the road)
    firstWave: 150, waveEvery: 360, frenzyAt: 5400, endAt: 7200,   // ticks: 5 s, 12 s, 3:00, 4:00
    wave: { budget: 12, budgetPer: 4.2, hp: 1, hpPer: 0.07, hpSq: 0.003,
        tiers: ['slime', 'goblin', 'wolf', 'bat', 'skeleton', 'orc', 'shaman', 'imp', 'golem', 'frostwolf', 'harpy', 'scorpion', 'cursed'] },
    income: { every: 300, base: 20, cap: 40, capPerMin: 20 },
    sentGold: 0.2,
    // send cards: n enemies of kind for cost gold, inc = income added, cd = ticks before the same card again, after = first tick it opens
    sends: [
        { id: 'slime', kind: 'slime', n: 8, cost: 40, inc: 4, cd: 60, gap: 0.45 },
        { id: 'goblin', kind: 'goblin', n: 6, cost: 50, inc: 4, cd: 60, gap: 0.5 },
        { id: 'wolf', kind: 'wolf', n: 6, cost: 60, inc: 3, cd: 90, gap: 0.4 },
        { id: 'bat', kind: 'bat', n: 6, cost: 60, inc: 3, cd: 90, gap: 0.45 },
        { id: 'skeleton', kind: 'skeleton', n: 5, cost: 70, inc: 2, cd: 120, gap: 0.6 },
        { id: 'orc', kind: 'orc', n: 3, cost: 80, inc: 2, cd: 120, gap: 0.9 },
        { id: 'imp', kind: 'imp', n: 3, cost: 70, inc: 1, cd: 120, gap: 0.6 },
        { id: 'golem', kind: 'golem', n: 1, cost: 100, inc: 0, cd: 240, gap: 0, after: 900 },
        { id: 'cursed', kind: 'cursed', n: 1, cost: 130, inc: 0, cd: 240, gap: 0, after: 900 },
        { id: 'harpy', kind: 'harpy', n: 4, cost: 110, inc: 0, cd: 180, gap: 0.5, after: 900 },
        { id: 'voidknight', kind: 'voidknight', n: 1, cost: 240, inc: 0, cd: 450, gap: 0, after: 2700 },
        { id: 'ironfang', kind: 'ironfang', n: 1, cost: 520, inc: 0, cd: 1200, gap: 0, after: 3600 },
    ],
    deck: { towers: 4, sends: 6 },
    defDeck: { hero: 'knight', towers: [['archer', null], ['mage', null], ['cannon', null], ['barracks', null]], sends: ['slime', 'goblin', 'wolf', 'orc', 'golem', 'cursed'] },
    hashEvery: 150,                 // both devices keep a state hash every 5 s; the server compares the two reports
    dropMs: 15000,                  // 15 s without a word from the other side = that side loses
};
const PVP_SEND = {}; for (const c of PVP.sends) PVP_SEND[c.id] = c;

// ------------------------------------------------------------ helpers shared by the deck editor, the battle and the server checks
function pvpIncomeCap(tick) { return PVP.income.cap + PVP.income.capPerMin * Math.floor(tick / 1800); }
function pvpHpMul(w) { const V = PVP.wave; return V.hp + V.hpPer * w + V.hpSq * w * w; }
function pvpHero(cls) {
    const H0 = HEROES[cls] || HEROES.knight, P = PVP.hero, g = Math.pow(HERO_GROWTH, P.lv - 1);
    return { lv: P.lv, hp: Math.round(H0.hp * g * P.hpK), atk: Math.round(H0.atk * g * P.atkK * (PVP.heroK[cls] || 1)), crit: P.crit, cdr: P.cdr };
}
// deck = { hero, towers: [[type, spec|null] x4], sends: [id x6] }: '' when it follows the rules, else the reason
function pvpDeckCheck(d) {
    if (!d || typeof d !== 'object') return 'deck';
    if (!HEROES[d.hero]) return 'hero';
    const T = d.towers, S = d.sends, seen = new Set();
    if (!Array.isArray(T) || T.length !== PVP.deck.towers) return 'towers';
    for (const t of T) {
        if (!Array.isArray(t) || !TOWERS[t[0]] || !(t[1] === null || t[1] === 0 || t[1] === 1)) return 'towers';
        const key = t[0] + ':' + t[1];
        if (seen.has(key)) return 'towers';
        seen.add(key);
    }
    if (!Array.isArray(S) || S.length !== PVP.deck.sends || new Set(S).size !== S.length || S.some(id => !PVP_SEND[id])) return 'sends';
    return '';
}
function pvpDeckOk(d) { return pvpDeckCheck(d) === '' ? d : JSON.parse(JSON.stringify(PVP.defDeck)); }
// a tower (spec null = building / plain levels) this deck may use: a type in the deck builds and levels; a spec needs its own entry
function pvpTowerOk(d, type, spec) {
    const T = (d && d.towers) || [];
    return spec === null || spec === undefined ? T.some(t => t[0] === type) : T.some(t => t[0] === type && t[1] === spec);
}
// the outcome by lives, then gold spent on sends (pressure wins a stalemate), else a draw (-1)
function pvpWinner(M) {
    const a = M.bs[0].lives, b = M.bs[1].lives;
    if (a !== b) return a > b ? 0 : 1;
    if (M.sent[0] !== M.sent[1]) return M.sent[0] > M.sent[1] ? 0 : 1;
    return -1;
}

// ------------------------------------------------------------ the match
// o = { seed, decks: [d0, d1], infos: [{ name, skin }, ...], bot: -1 | 0 | 1 (that player is the 연습 상대 bot), botStyle }
function pvpMatch(o) {
    const M = {
        v: PVP.v, seed: o.seed | 0, decks: [pvpDeckOk(o.decks && o.decks[0]), pvpDeckOk(o.decks && o.decks[1])], infos: o.infos || [{}, {}],
        bot: o.bot === 0 || o.bot === 1 ? o.bot : -1, botStyle: o.botStyle || 'practice', styles: o.styles || null,
        tick: 0, nextWave: PVP.firstWave, waveNo: 0, income: [PVP.income.base, PVP.income.base], paid: [0, 0], sent: [0, 0], sends: [0, 0],
        cd: [{}, {}], auto: [true, true], over: false, result: null, hashes: [], on: [null, null],
    };
    M.rng = makeRng((M.seed ^ 0x5bd1e995) >>> 0);
    M.bs = [pvpBattle(M, 0), pvpBattle(M, 1)];
    return M;
}
function pvpBattle(M, k) {
    const D = M.decks[k], cls = D.hero, info = M.infos[k] || {};
    const B = new Battle({
        mode: 'pvp', endless: true, map: PVP.map, theme: PVP.theme, seed: (M.seed + 7919 * (k + 1)) | 0,
        stageDef: { name: L('냥냥 대전'), seedName: 'pvp', map: PVP.map, waves: 0, pool: ['slime'], ch: 0 },
        heroCls: cls, heroStats: pvpHero(cls), skin: info.skin || null, bonuses: Object.assign(siegeBonus(null, 0), PVP.heroB[cls] || {}), dmgMul: 1, party: [],
        autoHero: () => M.auto[k], autoWave: () => false, cutinOn: () => false, shakeOn: () => !!(M.shake && M.shake[k]), on: () => { },
    });
    B.on = (ev, d) => { const f = M.on[k]; if (f) f(ev, d); };
    B.pvp = M; B.pvpK = k;
    { const P0 = B.paths[0], g = P0.at(P0.len * (PVP.post[cls] || 0.72)); B.hero.x = g.x; B.hero.y = g.y - 10; B.hero.guard = { x: g.x, y: g.y - 10 }; }
    B.slots = B.slots.filter(s => !PVP.hide.some(r => s.x > r[0] && s.y > r[1] && s.x < r[2] && s.y < r[3])).map((s, i) => ({ ...s, i }));
    B.state = 'run'; B.totalWaves = 0; B.maxWaves = 0; B.countdown = -2;
    B.gold = PVP.startGold; B.maxLives = B.lives = PVP.lives;
    B.hpMul = 1; B.atkMul = 1; B.bountyMul = 1;
    B.rand = () => B.rng();                        // every roll from the seed (like co-op)
    B.rollDrop = () => { };                        // no loot
    B.siege = true;                                // leaks cost lives without an instant loss (elite 2, boss at most 5: js/battle/siege.js)
    B.acts = [{ hero: B.hero, gold: 0, spells: B.spells, b: B.b }]; B.actor = 0;   // for snapshot() / checksum() (js/battle/coop.js)
    B.towerOk = (type, spec) => pvpTowerOk(D, type, spec);   // the battle HUD greys out what the deck lacks
    const P = Battle.prototype;
    // sent enemies are queued on road index 1 (the map has one road, so it is the same road): they get the sent mark here
    B.spawn = function (kind, pathIdx, hpMul, d) { const e = P.spawn.call(this, kind, pathIdx, hpMul, d); e.spdMul = (e.spdMul || 1) * PVP.spd; if (pathIdx === 1) e.sent = true; return e; };
    // a sent enemy pays its killer only PVP.sentGold of the bounty
    B.kill = function (e, o) { const g0 = this.gold, r = P.kill.call(this, e, o); if (e.sent && e.dead && this.gold > g0) this.gold = g0 + Math.round((this.gold - g0) * PVP.sentGold); return r; };
    return B;
}

// one command of player k (both devices run it at the same tick; a bad one fails the same way everywhere)
function pvpApply(M, k, c) {
    if (M.over || !Array.isArray(c) || (k !== 0 && k !== 1)) return false;
    const B = M.bs[k], D = M.decks[k], n = c[0], num = v => typeof v === 'number' && isFinite(v);
    const slot = num(c[1]) ? B.slots[c[1]] : null;
    switch (n) {
        case 'send': return pvpSend(M, k, c[1]);
        case 'auto': M.auto[k] = !!c[1]; return true;
        case 'build': if (!slot || !TOWERS[c[2]] || !pvpTowerOk(D, c[2], null)) return false; break;
        case 'up': if (!slot || !slot.tower || !(c[2] === null || c[2] === undefined || c[2] === 0 || c[2] === 1) || !pvpTowerOk(D, slot.tower.type, c[2])) return false; break;
        case 'sell': if (!slot) return false; break;
        case 'rally': if (!slot || !num(c[2]) || !num(c[3])) return false; break;
        case 'skill': if (!(c[1] >= 0 && c[1] < 4) || !num(c[2]) || !num(c[3])) return false; break;
        case 'spell': if (!B.spells.some(s => s.id === c[1]) || !num(c[2]) || !num(c[3])) return false; break;
        case 'move': if (!num(c[1]) || !num(c[2])) return false; break;
        default: return false;
    }
    const was = B.inSim; B.inSim = true;
    try { return !!B.runCmd(0, c); } catch (e) { return false; } finally { B.inSim = was; }
}
function pvpSendLeft(M, k, id) { return Math.max(0, (M.cd[k][id] || 0) - M.tick); }
function pvpCanSend(M, k, id) {
    const card = PVP_SEND[id];
    return !!card && !M.over && M.decks[k].sends.includes(id) && M.tick >= (card.after || 0) && pvpSendLeft(M, k, id) <= 0 && M.bs[k].gold >= card.cost;
}
function pvpSend(M, k, id) {
    if (!pvpCanSend(M, k, id)) return false;
    const card = PVP_SEND[id], B = M.bs[k], O = M.bs[1 - k], hp = pvpHpMul(M.waveNo);
    B.gold -= card.cost; M.cd[k][id] = M.tick + card.cd;
    M.income[k] += card.inc; M.sent[k] += card.cost; M.sends[k]++;
    for (let i = 0; i < card.n; i++) O.queue.push({ t: O.t + 0.05 + i * card.gap, kind: card.kind, path: 1, hpMul: hp });
    B.on('pvpSend', { id, to: 1 - k }); O.on('pvpSent', { id, from: k });
    return true;
}
// the shared wave w, the same enemies on both lanes
function pvpWaveList(M, w) {
    const V = PVP.wave, rng = makeRng((M.seed * 31 + w * 977 + 5) >>> 0);
    const avail = V.tiers.slice(0, Math.min(V.tiers.length, 2 + Math.floor(w * 0.6)));
    const groups = 1 + (w >= 3 ? 1 : 0) + (w >= 9 ? 1 : 0);
    return M.bs[0].makeWave(rng, V.budget + V.budgetPer * w, avail, groups, w);
}
function pvpSpawnWave(M) {
    const w = M.waveNo, list = pvpWaveList(M, w), hp = pvpHpMul(w);
    for (const B of M.bs) {
        for (const s of list) B.queue.push({ t: B.t + s.t, kind: s.kind, path: 0, hpMul: hp });
        B.waveIdx = w;
        B.on('wave', w);
    }
    M.waveNo++;
}
function pvpEnd(M, w, why) {
    if (M.over) return;
    M.over = true;
    M.result = { w, why, lives: M.bs.map(B => Math.max(0, B.lives)), ticks: M.tick, sv: M.sent.slice(), waves: M.waveNo };
    M.bs.forEach((B, k) => { B.state = w === k ? 'win' : 'lose'; });
}
// player k left the match (15 s without a word, or 나가기)
function pvpForfeit(M, k, why) { pvpEnd(M, 1 - k, why || 'drop'); }
function pvpFrenzy(M) { return M.tick >= PVP.frenzyAt; }

// one fixed tick: the commands for it (in the clock's order), the bot, waves, income, both lanes, the end
function pvpStep(M, cmds) {
    if (M.over) { for (const B of M.bs) B.updateFx(PVP.dt); return; }
    M.tick++;
    for (const x of cmds || []) pvpApply(M, x[0], x[1]);
    if (M.bot >= 0) for (const c of pvpBotTick(M, M.bot)) pvpApply(M, M.bot, c);
    if (M.styles) for (let k = 0; k < 2; k++) if (M.styles[k]) for (const c of pvpBotTick(M, k, M.styles[k])) pvpApply(M, k, c);   // tools/pvp-balance.js: both seats bots
    if (M.tick >= M.nextWave) { pvpSpawnWave(M); M.nextWave += pvpFrenzy(M) ? PVP.waveEvery / 2 : PVP.waveEvery; }
    if (M.tick % PVP.income.every === 0) {
        const cap = pvpIncomeCap(M.tick);
        M.bs.forEach((B, k) => { const g = Math.min(M.income[k], cap); B.gold += g; M.paid[k] = g; B.on('pvpIncome', g); });
    }
    for (const B of M.bs) {
        B.hitstop = 0; B.slowmo = 0; B.cutin = null;      // a boss kill must not slow one lane against the other
        const was = B.inSim; B.inSim = true;
        try { Battle.prototype.update.call(B, PVP.dt); } finally { B.inSim = was; }
        if (B.state === 'lose' && B.lives > 0) B.state = 'run';
    }
    const dead = M.bs.map(B => B.lives <= 0);
    if (dead[0] || dead[1]) pvpEnd(M, dead[0] && dead[1] ? pvpWinner(M) : dead[0] ? 1 : 0, 'lives');
    else if (M.tick >= PVP.endAt) pvpEnd(M, pvpWinner(M), 'time');
    if (M.tick % PVP.hashEvery === 0) M.hashes.push([M.tick, pvpChecksum(M)]);
}

// ------------------------------------------------------------ sync helpers (js/online/pvp.js)
function pvpChecksum(M) {
    let s = M.tick * 31 + M.waveNo * 7 + M.income[0] * 13 + M.income[1] * 17 + M.sent[0] * 3 + M.sent[1] * 5 + (M.auto[0] ? 1 : 0) + (M.auto[1] ? 2 : 0);
    for (const B of M.bs) s = (s * 131 + B.checksum()) % 1000000007;
    return s;
}
function pvpSnapshot(M) {
    return { tick: M.tick, nextWave: M.nextWave, waveNo: M.waveNo, income: M.income.slice(), paid: M.paid.slice(), sent: M.sent.slice(), sends: M.sends.slice(),
        cd: M.cd.map(x => ({ ...x })), auto: M.auto.slice(), rng: M.rng.state(), over: M.over, result: M.result, hashes: M.hashes.slice(),
        bs: M.bs.map(B => B.snapshot()), sl: M.bs.map(B => B.state) };
}
function pvpLoad(M, S) {
    Object.assign(M, { tick: S.tick, nextWave: S.nextWave, waveNo: S.waveNo, income: S.income.slice(), paid: S.paid.slice(), sent: S.sent.slice(), sends: S.sends.slice(),
        cd: S.cd.map(x => ({ ...x })), auto: S.auto.slice(), over: S.over, result: S.result, hashes: S.hashes.slice() });
    M.rng.state(S.rng);
    M.bs.forEach((B, k) => { B.applySnapshot(S.bs[k]); B.state = S.sl[k]; B.acts[0].hero = B.hero; });
}
// a short fingerprint of the whole match: equal fingerprints = the same fight
function pvpDigest(M) {
    const r = v => Math.round(v * 100);
    return [M.tick, M.waveNo, M.income.join(','), M.sent.join(','), M.rng.state(), ...M.bs.map(B => [B.lives, Math.round(B.gold), B.kills, r(B.t), B.rng.state(), r(B.hero.hp), r(B.hero.x),
        B.enemies.map(e => e.kind + ':' + r(e.hp) + ':' + r(e.d)).join(','), B.slots.filter(s => s.tower).map(s => s.i + s.tower.type + s.tower.lv + (s.tower.spec === null ? '' : s.tower.spec)).join(',')].join('|'))].join('#');
}

// ------------------------------------------------------------ bots (연습 상대 + tools/pvp-balance.js)
// A bot sees only its own lane, gold and cards, decides every `every` ticks (shifted by a jitter from the tick number) and
// returns commands. In a match it runs inside the tick with M.rng (pvpBotTick); a test client can call pvpBotThink with its own rand.
// practice = the 연습 상대: slower, hesitant, sends less well (weaker than a person on purpose, like the AI 동료)
const PVP_BOT = {
    practice: { every: 72, jitter: 24, idle: 0.3, send: 0.4, strong: 0.35, def: 0.9, spell: 0.1, save: 1.3 },
    mix: { every: 30, jitter: 10, idle: 0, send: 0.5, strong: 0.45, def: 1, spell: 0.4, save: 1 },
    turtle: { every: 30, jitter: 10, idle: 0, send: 0, strong: 0, def: 1.4, spell: 0.4, save: 1 },
    spam: { every: 30, jitter: 10, idle: 0, send: 0.9, strong: 0, def: 0.7, spell: 0.4, save: 1 },
    rush: { every: 30, jitter: 10, idle: 0, send: 0.5, strong: 1, def: 0.85, spell: 0.4, save: 1 },
    eco: { every: 30, jitter: 10, idle: 0, send: 0.55, strong: 0.2, def: 1, spell: 0.4, save: 1, ecoFirst: true },
};
function pvpBotTick(M, k, style) {
    const S = PVP_BOT[style || M.botStyle] || PVP_BOT.practice, seg = Math.floor(M.tick / S.every);
    if (M.tick % S.every !== (seg * 37 + k * 11) % S.jitter) return [];
    return pvpBotThink(M, k, () => M.rng(), style || M.botStyle);
}
// build spots by how much road they see (fixed by the map), cached on the battle
function pvpBotSlots(B) {
    if (B.pvpBotSlots) return B.pvpBotSlots;
    const P = B.paths[0], cov = sl => { let n = 0; for (let d = 0; d < P.len; d += 20) { const a = P.at(d); if (dist2(a.x, a.y, sl.x, sl.y) < 160 * 160) n += 1 + d / P.len; } return n; };
    return (B.pvpBotSlots = B.slots.map(sl => ({ sl, c: cov(sl) })).filter(x => x.c > 3).sort((a, b) => b.c - a.c || a.sl.i - b.sl.i).map(x => x.sl));
}
// the next defence step: a deck tower on the best open spot, or a level / spec for the weakest tower. { cmd, cost } or null
function pvpBotDefense(M, k, r) {
    const B = M.bs[k], D = M.decks[k], types = [...new Set(D.towers.map(t => t[0]))];
    const mine = B.slots.filter(s => s.tower), open = pvpBotSlots(B).filter(s => !s.tower);
    const plan = types.includes('barracks') ? ['archer', 'barracks', 'mage', 'cannon'] : ['archer', 'mage', 'cannon', 'archer'];
    const order = plan.filter(t => types.includes(t)).concat(types.filter(t => !plan.includes(t)));
    const ups = mine.map(s => {
        const t = s.tower;
        if (t.lv < 2) return { s, cost: B.towerCost(t.type, t.lv + 1), spec: null };
        if (t.spec !== null) return null;
        const sp = D.towers.filter(x => x[0] === t.type && x[1] !== null).map(x => x[1]);
        if (!sp.length) return null;
        const pick = sp[Math.floor(r() * sp.length)];
        return { s, cost: B.towerCost(t.type, 0, pick), spec: pick };
    }).filter(Boolean).sort((a, b) => a.cost - b.cost);
    const wantNew = open.length && (mine.length < 3 || (mine.length < 14 && (!ups.length || r() < 0.45)));
    if (wantNew) {
        const type = order[mine.length % order.length], sl = open[Math.floor(r() * Math.min(open.length, 3))];
        return { cmd: ['build', sl.i, type], cost: B.towerCost(type, 0) };
    }
    if (!ups.length) return null;
    const u = ups[Math.floor(r() * Math.min(ups.length, 2))];
    return { cmd: ['up', u.s.i, u.spec], cost: u.cost };
}
function pvpBotThink(M, k, r, style) {
    const S = PVP_BOT[style] || PVP_BOT.practice, B = M.bs[k], D = M.decks[k], out = [];
    if (M.over || r() < S.idle) return out;
    // spells on a crowd near the gate
    const near = B.enemies.filter(e => !e.dead && B.progress(e) > 0.45);
    if (near.length >= 5 && r() < S.spell) {
        const sp = B.spells.find(s => s.left <= 0);
        if (sp) { const e = near.reduce((a, b) => (B.progress(a) > B.progress(b) ? a : b)); out.push(['spell', sp.id, Math.round(e.x), Math.round(e.y)]); }
    }
    // how much of what it spent went into towers vs sends; danger near the gate always goes to defence first
    const threat = B.enemies.reduce((s, e) => s + (e.dead ? 0 : (e.def.elite || e.def.boss ? 4 : 1) * Math.max(0, B.progress(e) - 0.35)), 0);
    const towers = B.slots.reduce((s, sl) => s + (sl.tower ? sl.tower.spent : 0), 0);
    const act = pvpBotDefense(M, k, r);
    const share = towers / Math.max(1, towers + M.sent[k]);
    const needDef = threat > 4 * S.def || towers < PVP.startGold * 0.9 || share < 1 - S.send;
    const cards = D.sends.map(id => PVP_SEND[id]).filter(c => M.tick >= (c.after || 0) && pvpSendLeft(M, k, c.id) <= 0);
    const cheap = cards.filter(c => c.inc > 0), strong = cards.filter(c => c.inc <= 0);
    const capped = M.income[k] >= pvpIncomeCap(M.tick) + 6;
    if (act && (needDef || !S.send)) { if (B.gold >= act.cost * S.save) out.push(act.cmd); return out; }
    if (!S.send) return out;
    let pool = S.ecoFirst ? (capped ? strong : cheap) : (r() < S.strong || (capped && S.strong > 0)) ? strong : cheap;
    if (!pool.length) pool = cards;
    const ok = pool.filter(c => B.gold >= c.cost);
    if (ok.length) out.push(['send', ok[Math.floor(r() * ok.length)].id]);
    else if (act && !pool.some(c => c.cost <= B.gold * 2.2) && B.gold >= act.cost * S.save) out.push(act.cmd);   // the card it wants is far away: build meanwhile
    return out;
}
// the 연습 상대's deck: a fixed rotation by seed (the server picks the seed)
function pvpBotDeck(seed) {
    const sets = [['slime', 'goblin', 'wolf', 'orc', 'golem', 'cursed'], ['slime', 'bat', 'skeleton', 'imp', 'golem', 'harpy'], ['goblin', 'wolf', 'bat', 'orc', 'cursed', 'voidknight']];
    const heroes = Object.keys(HEROES), s = Math.abs(seed | 0);
    return { hero: heroes[s % heroes.length], towers: [['archer', s % 2], ['mage', null], ['cannon', null], ['barracks', (s >> 1) % 2]], sends: sets[s % sets.length].slice() };
}
