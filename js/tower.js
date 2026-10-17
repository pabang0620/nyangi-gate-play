'use strict';
// 심연의 탑: the endless roguelite climb after the campaign (the long-term goal). Logic and data only, no DOM
// (UI: js/ui/tower.js, battle hook: Game.startBattle opt.tower / onBattleEnd mode 'tower').
// A run = floors in a row on rotating maps. Before a floor: its 변이 (mutators, from the run seed). After a clear:
// pick 1 of 3 축복 (run-only buffs that stack). A loss ends the run (one continue per run).
// Rewards: first-time floors only (personal best), plus 탑 코인 for every floor of every run (탑 상점, weekly stock).
// Weekly ranking of the best floor this week: server board 'tower' (20261023000000_tower.sql).

const TOWER = {
    unlockIdx: 23,             // 5장 보스 (5-6) on normal
    waves: 10,
    maps: [['m2', 'forest'], ['m6', 'desert'], ['m8', 'ruin'], ['m10', 'swamp'], ['m12', 'void'], ['m13', 'sky'], ['m4', 'grass'], ['m9', 'volcano'], ['m14', 'clock'], ['m11', 'snow']],
    // strength: floor f fights like campaign stage eq(f); past the campaign's end the HP keeps growing.
    // Calibrated with tools/towersim.js (2026-10-18, bot takes the best-tier blessing, no continue):
    // 5장 player floors 4~16 (median 9), 8장 player 24~27, campaign-end Lv55 +10 29~37 (median 30)
    eq(f) { return Math.min(53, Math.round(16 + 1.2 * f)); },
    hpMul(f) { return 1.35 * Math.pow(1.035, f - 1) * Math.pow(1.02, Math.max(0, f - 19)); },
    coins(f) { return 3 + Math.floor(f / 5); },
    // first time a floor is cleared (personal best): every floor silver + stones, every 5th gems + tickets,
    // every 10th a 전설 (10, 20) or 신화 (30 and on) gear, 50: the 심연의 정복자 title + gems
    firstReward(f) {
        const g = { silver: 1500 + 250 * f };
        if (f % 2 === 0) g.stones = 1 + Math.floor(f / 10);
        if (f % 5 === 0) { g.gems = 40 + 4 * f; g.tickets = 1 + Math.floor(f / 20); }
        if (f % 10 === 0) g.item = f >= 30 ? 4 : 3;
        if (f === 50) g.gems = (g.gems || 0) + 1000;
        return g;
    },
    // 탑 상점: 탑 코인, stock refills every Monday
    shop: [
        { id: 'silver', cost: 20, stock: 5, reward: { silver: 15000 } },
        { id: 'stone', cost: 35, stock: 5, reward: { stones: 4 } },
        { id: 'guard', cost: 45, stock: 3, reward: { guards: 1 } },
        { id: 'ticket', cost: 60, stock: 3, reward: { tickets: 1 } },
        { id: 'gem', cost: 70, stock: 2, reward: { gems: 60 } },
        { id: 'shield', cost: 90, stock: 2, reward: { shields: 1 } },
        { id: 'leg', cost: 400, stock: 1, reward: { item: 3 } },
    ],
};

// 변이: bad ones from floor 3, a second one from floor 10; good ones sometimes. At most one 'rule' (fast / poor).
const TOWER_MUTS = [
    { id: 'air', bad: true, icon: 'i_gale', name: L('하늘 습격'), desc: L('비행 적이 섞여 나온다') },
    { id: 'elite', bad: true, icon: 'i_skull', name: L('정예 행진'), desc: L('정예 몬스터가 더 나온다') },
    { id: 'fast', bad: true, rule: true, icon: 'i_dash', name: L('질주'), desc: L('모든 적 이동 속도 +30%') },
    { id: 'poor', bad: true, rule: true, icon: 'i_sell', name: L('금화 가뭄'), desc: L('처치 금화 -30%, 시작 금화 +250') },
    { id: 'ban', bad: true, icon: 'i_lock', name: L('탑 봉인'), desc: L('{0}을(를) 지을 수 없다') },
    { id: 'thick', bad: true, icon: 'i_armor', name: L('강철 피부'), desc: L('적 체력 +25%') },
    { id: 'fragile', bad: true, icon: 'i_heart', name: L('금 간 성문'), desc: L('성문 체력이 절반') },
    { id: 'rich', icon: 'i_gold', name: L('보물 층'), desc: L('이 층의 탑 코인 2배') },
    { id: 'chest', icon: 'i_silver', name: L('군자금'), desc: L('시작 금화 +300') },
    { id: 'rage', icon: 'i_fireball', name: L('냥이 분노'), desc: L('영웅 공격력 +30%') },
];
const TOWER_BAN = ['archer', 'mage', 'cannon', 'barracks'];

// 축복: t 0 일반 / 1 희귀 / 2 전설. b = battle bonuses (computeBonuses copy), hs = hero stats copy
const TOWER_BLESS = [
    { id: 'tdmg', t: 0, icon: 'i_upgrade', name: L('날카로운 발톱'), desc: L('모든 탑 피해 +12%'), fx: (b) => { b.towerDmg += 0.12; } },
    { id: 'archer', t: 0, icon: 'i_pierce', name: L('명사수 훈련'), desc: L('궁수탑 피해 +25%, 공격 속도 +10%'), fx: (b) => { b.archerDmg += 0.25; b.archerRate = (b.archerRate || 0) + 0.1; } },
    { id: 'mage', t: 0, icon: 'i_storm', name: L('마력 증폭'), desc: L('마법탑 피해 +25%'), fx: (b) => { b.mageDmg += 0.25; } },
    { id: 'cannon', t: 0, icon: 'i_meteor', name: L('화약 개량'), desc: L('대포탑 피해 +25%'), fx: (b) => { b.cannonDmg += 0.25; } },
    { id: 'barracks', t: 0, icon: 'i_militia', name: L('든든한 병사'), desc: L('병사 체력·공격 +30%'), fx: (b) => { b.soldierHp += 0.3; b.soldierAtk += 0.3; } },
    { id: 'gold', t: 0, icon: 'i_gold', name: L('두둑한 지갑'), desc: L('시작 금화 +120'), fx: (b) => { b.startGold += 120; } },
    { id: 'bounty', t: 0, icon: 'i_silver', name: L('현상금'), desc: L('처치 금화 +12%'), fx: (b) => { b.bountyPct += 0.12; } },
    { id: 'lives', t: 0, icon: 'i_heart', name: L('성문 보강'), desc: L('성문 체력 +3'), fx: (b) => { b.lives += 3; } },
    { id: 'hatk', t: 0, icon: 'i_weapon', name: L('발톱 손질'), desc: L('영웅 공격력 +15%'), fx: (b, hs) => { hs.atk = Math.round(hs.atk * 1.15); } },
    { id: 'hhp', t: 0, icon: 'i_armor', name: L('두꺼운 털'), desc: L('영웅 체력 +25%'), fx: (b, hs) => { hs.hp = Math.round(hs.hp * 1.25); } },
    { id: 'cdr', t: 1, icon: 'i_speed', name: L('집중'), desc: L('영웅 스킬 재사용 시간 -12%'), fx: (b, hs) => { hs.cdr = Math.min(0.6, (hs.cdr || 0) + 0.12); } },
    { id: 'crit', t: 1, icon: 'i_judge', name: L('급소 노리기'), desc: L('영웅 치명타 확률 +8%'), fx: (b, hs) => { hs.crit = (hs.crit || 0) + 0.08; } },
    { id: 'discount', t: 1, icon: 'i_sell', name: L('건축 장인'), desc: L('탑 건설 비용 -8%'), fx: (b) => { b.buildDiscount = Math.min(0.4, b.buildDiscount + 0.08); } },
    { id: 'beacon', t: 1, icon: 'i_beacon', name: L('불꽃 발바닥'), desc: L('유성 냥펀치 위력 +25%, 재사용 -15%'), fx: (b) => { b.beaconMul *= 1.25; b.beaconCdMul *= 0.85; } },
    { id: 'range', t: 1, icon: 'i_star', name: L('매의 눈'), desc: L('궁수탑 사거리 +10%, 치명타 +6%'), fx: (b) => { b.archerRange += 0.1; b.archerCrit += 0.06; } },
    { id: 'king', t: 2, icon: 'i_max', name: L('고양이 왕의 축복'), desc: L('모든 탑 피해 +25%, 영웅 공격력 +25%'), fx: (b, hs) => { b.towerDmg += 0.25; hs.atk = Math.round(hs.atk * 1.25); } },
    { id: 'phoenix', t: 2, icon: 'i_oath', name: L('불사조 깃털'), desc: L('성문 체력 +8, 시작 금화 +200'), fx: (b) => { b.lives += 8; b.startGold += 200; } },
    { id: 'eye', t: 2, icon: 'i_rain', name: L('폭풍의 눈'), desc: L('모든 탑 피해 +15%, 처치 금화 +20%, 스킬 재사용 -10%'), fx: (b, hs) => { b.towerDmg += 0.15; b.bountyPct += 0.2; hs.cdr = Math.min(0.6, (hs.cdr || 0) + 0.1); } },
];
const TOWER_TIER = [{ name: L('일반'), color: '#e8dcc8' }, { name: L('희귀'), color: '#6fc3ff' }, { name: L('전설'), color: '#ffb340' }];

const Tower = {
    unlocked(p) { return (p.stars[TOWER.unlockIdx] || 0) > 0; },
    state(p) {
        if (!p.tower) p.tower = { best: 0, coins: 0, run: null, runs: 0, last: null, title: false };
        const T = p.tower, wk = weekKey();
        if (!T.week || T.week.key !== wk) T.week = { key: wk, best: 0, bought: {} };
        return T;
    },
    newRun(p) {
        const T = this.state(p);
        T.run = { seed: (Math.floor(Math.random() * 1e9) >>> 0) || 7, floor: 1, bless: [], offer: null, revived: false, coins: 0, inFloor: false };
        T.runs++;
        Save.save();
        return T.run;
    },
    // ---- a floor
    floorRng(run, f, salt) { return makeRng((run.seed ^ (f * 2654435761)) + salt); },
    boss(f) { const eq = TOWER.eq(f), list = RAID.order.filter(k => RAID.bossStage[k] <= eq); return list[(f / 5 + list.length - 1) % list.length]; },
    map(run, f) { return TOWER.maps[(Math.floor(this.floorRng(run, 0, 3)() * TOWER.maps.length) + f) % TOWER.maps.length]; },
    mutators(run, f) {
        const rng = this.floorRng(run, f, 11), out = [];
        const bad = TOWER_MUTS.filter(m => m.bad), good = TOWER_MUTS.filter(m => !m.bad);
        const nBad = f < 3 ? 0 : f < 10 ? 1 : (rng() < 0.5 ? 2 : 1);
        for (let i = 0; i < nBad; i++) {
            const pool = bad.filter(m => !out.some(o => o.id === m.id || (o.rule && m.rule)));
            out.push({ ...pool[Math.floor(rng() * pool.length)] });
        }
        if (rng() < (f < 3 ? 0.6 : 0.3)) out.push({ ...good[Math.floor(rng() * good.length)] });
        for (const m of out) if (m.id === 'ban') { m.ban = TOWER_BAN[Math.floor(rng() * TOWER_BAN.length)]; m.desc = L('{0}을(를) 지을 수 없다', TOWERS[m.ban].name); }
        return out;
    },
    // 3 different blessings offered after clearing floor f (deterministic per run and floor: no reroll by reopening)
    rollOffer(run, f) {
        const rng = this.floorRng(run, f, 29), out = [];
        while (out.length < 3) {
            const x = rng(), t = x < 0.08 ? 2 : x < 0.33 ? 1 : 0;
            const pool = TOWER_BLESS.filter(b => b.t === t && !out.includes(b.id));
            if (!pool.length) continue;
            out.push(pool[Math.floor(rng() * pool.length)].id);
        }
        return out;
    },
    blessById(id) { return TOWER_BLESS.find(b => b.id === id); },
    // battle cfg for the run's current floor (mutates cfg made by Game.startBattle). Returns the banner text.
    setup(p, cfg) {
        const run = this.state(p).run, f = run.floor, eq = TOWER.eq(f);
        const [map, theme] = this.map(run, f), muts = this.mutators(run, f), st = STAGES[eq];
        let pool = st.pool.slice(), hp = TOWER.hpMul(f);
        const b = { ...cfg.bonuses }, hs = { ...cfg.heroStats };
        for (const m of muts) {
            if (m.id === 'air') pool = pool.concat(['bat', 'harpy', eq >= 42 ? 'griffin' : 'imp'].filter(k => ENEMIES[k]));
            if (m.id === 'elite') pool = pool.concat(eq >= 36 ? ['lavagolem', 'voidknight'] : eq >= 20 ? ['golem', 'yeti'] : ['golem']);
            if (m.rule) cfg.rule = m.id;
            if (m.id === 'ban') cfg.ban = m.ban;
            if (m.id === 'thick') hp *= 1.25;
            if (m.id === 'fragile') b.lives -= Math.floor((LIVES + b.lives) / 2);
            if (m.id === 'chest') b.startGold += 300;
            if (m.id === 'rage') hs.atk = Math.round(hs.atk * 1.3);
        }
        for (const id of run.bless) { const x = this.blessById(id); if (x) x.fx(b, hs); }
        const boss = f % 5 === 0 ? this.boss(f) : null;
        Object.assign(cfg, { mode: 'tower', stageIdx: eq, map, theme, hpMulExtra: hp, bonuses: b, heroStats: hs,
            stageDef: { name: L('심연의 탑 {0}층', f), seedName: 'tower' + (run.seed % 997) + 'f' + f, map, waves: TOWER.waves, pool, ch: st.ch, boss } });
        run.inFloor = true; run.muts = muts.map(m => m.id);
        Save.save();
        return L('심연의 탑 {0}층', f) + (boss ? L(' · 보스') : '');
    },
    canRevive(p) { const r = this.state(p).run; return !!r && !r.revived; },
    onRevive(p) { const r = this.state(p).run; if (r) { r.revived = true; Save.save(); } },
    // result of a floor. Returns R.tower for the result screen.
    finish(p, win, B) {
        const T = this.state(p), run = T.run;
        if (!run) return null;
        const f = run.floor;
        run.inFloor = false;
        const out = { floor: f, win, got: [], coins: 0, newBest: false, run: null };
        if (win) {
            const rich = (run.muts || []).includes('rich');
            out.coins = TOWER.coins(f) * (rich ? 2 : 1);
            run.coins += out.coins; T.coins += out.coins;
            if (f > T.best) {
                T.best = f; out.newBest = true;
                const g = TOWER.firstReward(f);
                out.got = Rewards.grant(p, g);
                if (f === 50 && !T.title) { T.title = true; out.title = true; }
            }
            if (f > T.week.best) { T.week.best = f; out.weekBest = true; }
            run.floor = f + 1;
            run.offer = this.rollOffer(run, f);
            out.offer = run.offer;
        } else {
            out.run = { reached: f - 1, coins: run.coins, bless: run.bless.slice() };
            T.last = { reached: f - 1, coins: run.coins, at: Date.now() };
            T.run = null;
        }
        Save.save();
        if (out.weekBest && typeof Online !== 'undefined') Online.submit('tower', T.week.best);
        return out;
    },
    pick(p, id) {
        const run = this.state(p).run;
        if (!run || !run.offer || !run.offer.includes(id)) return false;
        run.bless.push(id); run.offer = null;
        Save.save();
        return true;
    },
    giveUp(p) {
        const T = this.state(p);
        if (!T.run) return;
        T.last = { reached: T.run.floor - 1, coins: T.run.coins, at: Date.now() };
        T.run = null;
        Save.save();
    },
    // app closed in the middle of a floor: that floor counts as lost (a floor can't be retried by restarting)
    settle(p) {
        const T = p.tower;
        if (!T || !T.run || !T.run.inFloor) return;
        this.finish(p, false, null);
    },
    // ---- 탑 상점
    shopLeft(p, it) { const T = this.state(p); return it.stock - (T.week.bought[it.id] || 0); },
    buy(p, id, slot) {
        const T = this.state(p), it = TOWER.shop.find(x => x.id === id);
        if (!it || T.coins < it.cost || this.shopLeft(p, it) <= 0) return null;
        T.coins -= it.cost; T.week.bought[id] = (T.week.bought[id] || 0) + 1;
        return Rewards.grant(p, slot ? { ...it.reward, slot } : it.reward);
    },
};
