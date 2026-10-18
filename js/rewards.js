'use strict';
// Rewards, shop, skins, ads (docs/PLAN_CAT_FEEL_SHOP.md section 4).
// Principle: everything needed to finish the game comes from play; money buys time, looks and convenience.
//
// Payments and ads go through window.BonghwaBridge when the game runs inside the Android app (TWA/Capacitor):
//   BonghwaBridge.purchase(productId)        -> Promise<{ ok: boolean, receipt?: string }>
//   BonghwaBridge.showRewardedAd(placement)  -> Promise<boolean>   (true = watched to the end)
// In a plain browser there is no store, so a clearly labelled TEST flow runs instead. Receipts must be verified
// server-side before launch (out of scope here).

// ------------------------------------------------------------ data
const LOGIN_REWARDS = [
    { silver: 300 }, { gems: 30 }, { silver: 600 }, { tickets: 1 }, { gems: 50 }, { silver: 1200 }, { gems: 100, tickets: 1 },
];
const MISSIONS = [
    { id: 'clear',   name: L('스테이지 3번 승리'),     goal: 3,   reward: { gems: 20 } },
    { id: 'kills',   name: L('적 300마리 처치'),       goal: 300, reward: { silver: 400 } },
    { id: 'towers',  name: L('탑 15개 건설'),          goal: 15,  reward: { silver: 300 } },
    { id: 'skills',  name: L('영웅 스킬 20번 사용'),    goal: 20,  reward: { gems: 10 } },
    { id: 'enhance', name: L('장비 강화 1번'),          goal: 1,   reward: { silver: 300 } },
    { id: 'summon',  name: L('소환 1번'),               goal: 1,   reward: { gems: 10 } },
    { id: 'ad',      name: L('광고 보상 1번 받기'),      goal: 1,   reward: { gems: 20 } },
];
const MISSION_BONUS = { gems: 50, tickets: 1 };

// growth pass: tiers unlock by total stars, one tier every 9 stars (js/data/modes.js extends it to 324 = every normal and hero star). Free row for everyone, paid row after buying the pass.
const PASS_TIERS = [
    { stars: 9,   free: { silver: 500 },  paid: { gems: 100 } },
    { stars: 18,  free: { gems: 20 },     paid: { tickets: 2 } },
    { stars: 27,  free: { silver: 800 },  paid: { gems: 150 } },
    { stars: 36,  free: { tickets: 1 },   paid: { item: 3 } },
    { stars: 45,  free: { silver: 1200 }, paid: { gems: 200 } },
    { stars: 54,  free: { gems: 30 },     paid: { skin: 'mage_witch' } },
    { stars: 63,  free: { silver: 1600 }, paid: { tickets: 3 } },
    { stars: 72,  free: { tickets: 1 },   paid: { gems: 250 } },
    { stars: 81,  free: { silver: 2000 }, paid: { item: 3 } },
    { stars: 90,  free: { gems: 50 },     paid: { gems: 300 } },
    { stars: 99,  free: { silver: 3000 }, paid: { tickets: 5 } },
    { stars: 108, free: { tickets: 2 },   paid: { skin: 'ranger_forest' } },
];

// skins: looks + one small option + projectile/slash tint. r = grade (RARITY 0..3: 일반/희귀/영웅/전설).
// opt = [kind, value] (SKIN_OPTS); older skins keep their `atk` field as an attack option.
// tier = trail look (SKIN_TIERS): by default 영웅 skins leave paw prints and 전설 skins also afterimages
// (skinTier); a skin can set its own tier or `trail` list. Trails are render-only.
// pass: growth-pass only. gacha: only from the 스킨 소환 banner (not sold in the shop).
const SKIN_TIERS = {
    normal: { trail: [] },
    rare:   { trail: ['paw'], badge: true, note: L('걸으면 발자국이 남아요'), short: L('발자국') },
    hidden: { trail: ['paw', 'ghost'], badge: true, star: true, note: L('걸으면 발자국과 잔상이 남아요'), short: L('발자국 + 잔상') },
};
const SKIN_OPTS = { atk: L('공격력'), hp: L('체력'), cdr: L('스킬 대기 감소'), gold: L('처치 금화') };
const SKINS = {
    knight: [
        { id: 'knight_red',    name: L('빨간 망토 치즈'), r: 0, opt: ['atk', 0.02], tint: '#ff6a5a', gacha: true },
        { id: 'knight_green',  name: L('초록 망토 치즈'), r: 0, opt: ['hp', 0.02], tint: '#7fd36a', gacha: true },
        { id: 'knight_purple', name: L('보라 망토 치즈'), r: 0, opt: ['cdr', 0.01], tint: '#b88cff', gacha: true },
        { id: 'knight_pink',   name: L('분홍 망토 치즈'), r: 0, opt: ['gold', 0.02], tint: '#ffa8d0', gacha: true },
        { id: 'knight_gold',   name: L('황금 갑옷 치즈'), r: 1, opt: ['atk', 0.03], tint: '#ffd36b', gacha: true },
        { id: 'knight_black',  name: L('흑기사 치즈'),    r: 1, opt: ['hp', 0.03], tint: '#9aa6c8', gacha: true },
        { id: 'knight_rose',   name: L('장밋빛 갑옷 치즈'), r: 1, opt: ['gold', 0.03], tint: '#ffb8a8', gacha: true },
        { id: 'knight_pirate', name: L('해적 선장 치즈'), r: 2, atk: 0.03, gems: 300, tint: '#ffd36b', tier: 'rare' },
        { id: 'knight_hanbok', name: L('한복 무사 치즈'), r: 2, atk: 0.05, gems: 600, tint: '#ff8a6a', tier: 'rare' },
        { id: 'knight_santa',  name: L('산타 기사 치즈'), r: 3, atk: 0.08, gems: 1200, tint: '#fff4dc', tier: 'hidden' },
    ],
    mage: [
        { id: 'mage_red',    name: L('빨간 로브 구름'), r: 0, opt: ['atk', 0.02], tint: '#ff6a5a', gacha: true },
        { id: 'mage_mint',   name: L('민트 로브 구름'), r: 0, opt: ['cdr', 0.01], tint: '#7fe8c8', gacha: true },
        { id: 'mage_purple', name: L('보라 로브 구름'), r: 0, opt: ['hp', 0.02], tint: '#b88cff', gacha: true },
        { id: 'mage_green',  name: L('풀잎 로브 구름'), r: 0, opt: ['gold', 0.02], tint: '#8fe06a', gacha: true },
        { id: 'mage_sunset', name: L('노을 마법사 구름'), r: 1, opt: ['atk', 0.03], tint: '#ffa04a', gacha: true },
        { id: 'mage_night',  name: L('밤하늘 마법사 구름'), r: 1, opt: ['cdr', 0.02], tint: '#8c9cff', gacha: true },
        { id: 'mage_candy',  name: L('솜사탕 마법사 구름'), r: 1, opt: ['hp', 0.03], tint: '#ffb8e0', gacha: true },
        { id: 'mage_witch',  name: L('할로윈 마녀 구름'), r: 2, atk: 0.03, gems: 300, tint: '#c58cff', pass: true, tier: 'hidden' },
        { id: 'mage_sakura', name: L('벚꽃 마법사 구름'), r: 2, atk: 0.05, gems: 600, tint: '#ffa8c8', tier: 'rare' },
        { id: 'mage_star',   name: L('별빛 천문가 구름'), r: 3, atk: 0.08, gems: 1200, tint: '#ffe08a', tier: 'hidden' },
    ],
    ranger: [
        { id: 'ranger_red',    name: L('빨간 후드 까망'), r: 0, opt: ['atk', 0.02], tint: '#ff6a5a', gacha: true },
        { id: 'ranger_blue',   name: L('파란 후드 까망'), r: 0, opt: ['hp', 0.02], tint: '#6aaeff', gacha: true },
        { id: 'ranger_purple', name: L('보라 후드 까망'), r: 0, opt: ['cdr', 0.01], tint: '#b88cff', gacha: true },
        { id: 'ranger_sakura', name: L('벚꽃 후드 까망'), r: 0, opt: ['gold', 0.02], tint: '#ffa8c8', gacha: true },
        { id: 'ranger_snow',   name: L('눈꽃 후드 까망'), r: 1, opt: ['hp', 0.03], tint: '#e8f4ff', gacha: true },
        { id: 'ranger_gold',   name: L('황금 후드 까망'), r: 1, opt: ['gold', 0.03], tint: '#ffd36b', gacha: true },
        { id: 'ranger_night',  name: L('자정 후드 까망'), r: 1, opt: ['atk', 0.03], tint: '#a88cff', gacha: true },
        { id: 'ranger_beach',  name: L('여름 해변 까망'), r: 2, atk: 0.03, gems: 300, tint: '#7fd4ff', tier: 'rare' },
        { id: 'ranger_ninja',  name: L('닌자 까망'),      r: 2, atk: 0.05, gems: 600, tint: '#8c98be', tier: 'rare' },
        { id: 'ranger_forest', name: L('숲의 정령 까망'), r: 3, atk: 0.08, gems: 1200, tint: '#9fd65a', pass: true, tier: 'hidden' },
    ],
};
const HERO_NAMES = { knight: L('치즈'), mage: L('구름'), ranger: L('까망') };

// shop products (KRW display prices). gems products give double gems on the first purchase of each tier.
const PRODUCTS = {
    starter:  { name: L('초보 냥이 꾸러미'), price: 3300,  img: 'shop_starter', once: true, desc: L('보석 300 · 은화 3,000 · 소환권 5 · 영웅 무기'), grant: { gems: 300, silver: 3000, tickets: 5, item: 2, slot: 'weapon', ilvlMin: 11 } },   // slot/ilvlMin: it is sold as a weapon; a day-1 buyer still gets a usable one
    monthly:  { name: L('월간 보급권'), price: 5500,  img: 'shop_monthly', desc: L('즉시 보석 300 + 30일 동안 매일 보석 100'), grant: { gems: 300, monthly: 30 } },
    premium:  { name: L('냥이의 가호'), price: 9900,  img: 'shop_premium', once: true, desc: L('광고 없이 광고 보상 · 3배속 영구 · 방치 보상 1.5배, 최대 24시간 · 스테이지 은화 +10%'), grant: { premium: true } },
    speed3:   { name: L('냥이 3배속'), price: 2500,  img: 'shop_speed3', once: true, desc: L('전투 3배속을 영구히 쓸 수 있습니다'), grant: { speed3: true } },
    pass:     { name: L('성장 패스'), price: 6600,  img: 'shop_pass', once: true, desc: L('성장 패스 유료 보상 줄 열기 (보석·소환권·패스 한정 스킨 2종)'), grant: { pass: true } },
    gem80:    { name: L('보석 한 줌'), price: 1200,  img: 'shop_gem1', gems: 80 },
    gem500:   { name: L('보석 주머니'), price: 5900,  img: 'shop_gem2', gems: 500 },
    gem1150:  { name: L('보석 그릇'), price: 12000, img: 'shop_gem3', gems: 1150 },
    gem2600:  { name: L('보석 상자'), price: 25000, img: 'shop_gem4', gems: 2600 },
    gem7500:  { name: L('보석 산더미'), price: 65000, img: 'shop_gem5', gems: 7500 },
};
const GEM_PRODUCTS = ['gem80', 'gem500', 'gem1150', 'gem2600', 'gem7500'];
// 소탕 (Rewards.sweepStage): stages cleared with 3 stars, this many times a day (냥이의 가호 +10)
const SWEEP = { perDay: 30, premiumBonus: 10 };
const AD_LIMITS = { freeGems: 3, freeSummon: 1, double: 10, offline: 3, speed3: 5 };
const SPEED3_AD_MIN = 30;   // 광고 한 번 = 30분 동안 3배속
const AD_FREE_GEMS = 30;
const REVIVE_GEMS = 50;

// ------------------------------------------------------------ helpers
// day key with a 05:00 rollover so late-night sessions count as the same day
function dayKey(ts = nowMs()) {
    const d = new Date(ts - 5 * 3600 * 1000);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
// week key: the Monday (05:00 rollover) that starts the week
function weekKey(ts = nowMs()) {
    const d = new Date(ts - 5 * 3600 * 1000);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function won(n) { return '₩' + n.toLocaleString('ko-KR'); }
// shop price label: Play's local-currency price once loaded (Rewards.loadPrices), the KRW list price otherwise
const PLAY_PRICES = {};
function priceLabel(id) { return PLAY_PRICES[id] || won(PRODUCTS[id].price); }
// trail look for a skin (id or object): { paw, ghost, col } or null when the skin leaves no trail
function skinTierId(s) { return !s ? 'normal' : s.tier || (s.r >= 3 ? 'hidden' : s.r === 2 ? 'rare' : 'normal'); }
function skinTier(s) { return SKIN_TIERS[skinTierId(s)] || SKIN_TIERS.normal; }
// a skin's option { k, v, text }: opt = [kind, value], or the older atk field
function skinOpt(s) {
    const [k, v] = s.opt || ['atk', s.atk || 0];
    return { k, v, text: SKIN_OPTS[k] + ' +' + Math.round(v * 100) + '%' };
}
// option bonuses of the skin a hero wears (zeros without one): atk/hp/cdr feed heroStats, gold the kill bounty
function skinBonus(p, cls) {
    const b = { atk: 0, hp: 0, cdr: 0, gold: 0 }, s = heroSkin(p, cls);
    if (s) { const o = skinOpt(s); b[o.k] += o.v; }
    return b;
}
// the 스킨 소환 pool of one grade: every skin but the growth-pass ones
function skinPool(r) { const out = []; for (const k in SKINS) for (const s of SKINS[k]) if (s.r === r && !s.pass) out.push(s.id); return out; }
function skinTrail(s) {
    if (typeof s === 'string') s = skinById(s);
    const t = s && (s.trail || skinTier(s).trail);
    return t && t.length ? { paw: t.includes('paw'), ghost: t.includes('ghost'), col: s.tint || '#ffffff' } : null;
}
// small paw tag for skin cards (css/fx-skins.css; the paw is img/ui_paw.png, 전설 adds a star); null for normal skins
function skinBadge(s) { const t = skinTier(s); return t.badge ? h('span.skbadge.t-' + skinTierId(s), h('img.pawico', { src: 'img/ui_paw.png', draggable: 'false' }), t.star ? '\u2726' : '') : null; }
function skinById(id) { for (const k in SKINS) for (const s of SKINS[k]) if (s.id === id) return { ...s, cls: k }; return null; }

const Rewards = {
    ensure(p) {
        p.shop = Object.assign({ starter: false, premium: false, pass: false, monthlyLeft: 0, monthlyLast: '', firstBuy: {}, purchases: [], skins: [], skin: { knight: null, mage: null, ranger: null } }, p.shop || {});
        p.shop.skin = Object.assign({ knight: null, mage: null, ranger: null }, p.shop.skin || {});
        p.login = Object.assign({ last: '', count: 0 }, p.login || {});
        p.passClaimed = Object.assign({ free: [], paid: [] }, p.passClaimed || {});
        if (p.tickets === undefined) p.tickets = 0;
        if (p.skinPity === undefined) p.skinPity = 0;
        const today = dayKey();
        if (!p.daily || p.daily.day !== today) {
            p.daily = { day: today, prog: {}, claimed: {}, bonus: false, ads: {} };
        }
        if (typeof metaEnsure === 'function') metaEnsure(p);
        return p;
    },
    // ---- grants
    grant(p, g, src = '') {
        const got = [];
        if (g.silver) { p.silver += g.silver; got.push({ icon: 'silver', n: g.silver }); }
        if (g.gems) { p.gems += g.gems; got.push({ icon: 'gem', n: g.gems }); }
        if (g.tickets) { p.tickets += g.tickets; got.push({ icon: 'i_ticket', n: g.tickets }); }
        if (g.stones) { p.mats = p.mats || { stone: 0 }; p.mats.stone += g.stones; got.push({ icon: 'i_stone', n: g.stones }); }
        if (g.shields) { p.mats = p.mats || { stone: 0 }; p.mats.shield = (p.mats.shield || 0) + g.shields; got.push({ mat: 'shield', n: g.shields }); }
        if (g.medals) { p.mats = p.mats || { stone: 0 }; p.mats.medal = (p.mats.medal || 0) + g.medals; got.push({ icon: 'i_medal', n: g.medals }); }
        if (g.guards) { p.mats = p.mats || { stone: 0 }; p.mats.guard = (p.mats.guard || 0) + g.guards; got.push({ mat: 'guard', n: g.guards }); }
        // gear minted by the server (mail: raid cards, market deliveries): built from its seed, so the same mid is always
        // the same item, and tagged with mid (거래 가능, js/online/market.js). Never twice in one bag.
        if (g.item !== undefined && g.mid && g.seed) {
            const had = p.items.find(x => x.mid === g.mid);
            if (had) got.push({ item: had });
            else { const it = makeItem(SLOTS.includes(g.slot) ? g.slot : 'weapon', g.item, g.ilvl || 1, makeRng(g.seed)); it.mid = g.mid; it.seed = g.seed; got.push({ item: it }); }
        } else if (g.item !== undefined) {
            const it = makeItem(SLOTS.includes(g.slot) ? g.slot : SLOTS[Math.floor(Math.random() * 3)], g.item, Math.max(summonIlvl(p), g.ilvlMin || 0));
            got.push({ item: it });
        }
        if (g.gold) { got.push({ icon: 'i_gold', n: g.gold }); if (typeof Market !== 'undefined') Market.gold += g.gold; }   // server wallet (거래소); the save never holds it
        if (g.skin) { if (!p.shop.skins.includes(g.skin)) p.shop.skins.push(g.skin); got.push({ skin: g.skin }); }
        if (g.premium) { p.shop.premium = true; got.push({ text: L('냥이의 가호') }); }
        if (g.speed3) { p.shop.speed3 = true; got.push({ text: L('3배속 영구 해금') }); }
        if (g.pass) { p.shop.pass = true; got.push({ text: L('성장 패스') }); }
        if (g.monthly) { p.shop.monthlyLeft += g.monthly; got.push({ text: L('월간 보급 {0}일', g.monthly) }); }
        Save.save();
        return got;
    },
    // ---- endless weekly milestones
    endlessWeek(p) {
        const k = weekKey();
        if (!p.endlessWeek || p.endlessWeek.key !== k) p.endlessWeek = { key: k, best: 0, claimed: [] };
        return p.endlessWeek;
    },
    claimEndlessWeekly(p, wave) {
        const w = this.endlessWeek(p);
        if (wave > w.best) w.best = wave;
        const out = [];
        for (const m of ENDLESS.weekly) {
            if (wave >= m.wave && !w.claimed.includes(m.wave)) { w.claimed.push(m.wave); out.push({ wave: m.wave, got: this.grant(p, m.reward) }); }
        }
        return out;
    },
    // ---- daily login
    loginAvailable(p) { return p.login.last !== dayKey(); },
    claimLogin(p) {
        if (!this.loginAvailable(p)) return null;
        const r = LOGIN_REWARDS[p.login.count % 7];
        p.login.count++; p.login.last = dayKey();
        // monthly pass pays out with the daily login
        let monthly = null;
        if (p.shop.monthlyLeft > 0 && p.shop.monthlyLast !== dayKey()) { p.shop.monthlyLeft--; p.shop.monthlyLast = dayKey(); monthly = 100; }
        const got = this.grant(p, monthly ? { ...r, gems: (r.gems || 0) + monthly } : r);
        return { got, monthly };
    },
    // ---- missions
    track(id, n = 1) {
        const p = Save.p; if (!p) return;
        this.ensure(p);
        p.daily.prog[id] = (p.daily.prog[id] || 0) + n;
        // weekly missions (js/meta.js) share the daily counters
        if (typeof Meta !== 'undefined') {
            if (id === 'clear') { Meta.track('w_win', n); p.stats.wins += n; }
            if (id === 'enhance') Meta.track('w_enhance', n);
        }
    },
    missionState(p, m) {
        const v = Math.min(m.goal, p.daily.prog[m.id] || 0);
        return { v, done: v >= m.goal, claimed: !!p.daily.claimed[m.id] };
    },
    claimMission(p, id) {
        const m = MISSIONS.find(x => x.id === id), st = this.missionState(p, m);
        if (!st.done || st.claimed) return null;
        p.daily.claimed[id] = true;
        return this.grant(p, m.reward);
    },
    claimAllMissions(p) {
        const got = [];
        for (const m of MISSIONS) { const g = this.claimMission(p, m.id); if (g) got.push(...g); }
        if (!p.daily.bonus && MISSIONS.every(m => p.daily.claimed[m.id])) { p.daily.bonus = true; got.push(...this.grant(p, MISSION_BONUS)); }
        return got;
    },
    // ---- pass
    passTierOpen(p, i) { return totalStars(p) >= PASS_TIERS[i].stars; },
    claimPass(p, i, paid) {
        const list = paid ? p.passClaimed.paid : p.passClaimed.free;
        if (list.includes(i) || !this.passTierOpen(p, i) || (paid && !p.shop.pass)) return null;
        list.push(i);
        return this.grant(p, paid ? PASS_TIERS[i].paid : PASS_TIERS[i].free);
    },
    claimAllPass(p) {
        const got = [];
        PASS_TIERS.forEach((t, i) => { for (const paid of [false, true]) { const g = this.claimPass(p, i, paid); if (g) got.push(...g); } });
        return got;
    },
    // ---- badges (something to collect?)
    pending(p) {
        this.ensure(p);
        if (this.loginAvailable(p)) return true;
        if (MISSIONS.some(m => { const s = this.missionState(p, m); return s.done && !s.claimed; })) return true;
        if (typeof Meta !== 'undefined' && (Meta.pending(p) || Meta.att28Due(p))) return true;
        return PASS_TIERS.some((t, i) => this.passTierOpen(p, i) && (!p.passClaimed.free.includes(i) || (p.shop.pass && !p.passClaimed.paid.includes(i))));
    },
    // ---- 소탕: a 3-star stage pays its win rewards without the battle. A daily count keeps it from being an endless farm
    sweepLeft(p) { this.ensure(p); return Math.max(0, SWEEP.perDay + (p.shop && p.shop.premium ? SWEEP.premiumBonus : 0) - (p.daily.sweeps || 0)); },
    sweepStage(p, idx, hard, n) {
        const st = STAGES[idx], have = (hard ? p.hstars : p.stars)[idx] || 0;
        n = Math.min(n, this.sweepLeft(p));
        if (have < 3 || n <= 0) return null;
        const rw = stageRewards(idx, 3, false), prem = p.shop && p.shop.premium ? 1.1 : 1;
        const silver = Math.round(rw.silver * (hard ? HARD.silverMul : 1) * prem) * n, xp = Math.round(rw.xp * (hard ? 1.5 : 1)) * n;
        const ilvl = 1 + idx * 2.5 + (hard ? HARD.ilvlAdd : 0);
        // gear: about what a won battle drops (one elite roll, the boss rolls on boss stages; 영웅 난이도 +1 roll)
        const items = [];
        for (let k = 0; k < n; k++) {
            const rolls = [['elite', DROP.rolls.elite + (hard ? 1 : 0)]].concat(st.boss ? [['boss', DROP.rolls.boss + (hard ? 1 : 0)]] : []);
            for (const [tier, cnt] of rolls) for (let i = 0; i < cnt; i++) if (Math.random() < DROP.chance[tier]) items.push(makeItem(SLOTS[Math.floor(Math.random() * 3)], pickWeighted(DROP.table[tier]), ilvl));
        }
        p.daily.sweeps = (p.daily.sweeps || 0) + n;
        p.silver += silver;
        grantBattleXp(p, p.hero, xp);
        this.track('clear', n);
        Save.save();
        return [{ icon: 'silver', n: silver }, { icon: 'i_xp', n: xp }, ...items.map(item => ({ item }))];
    },
    // ---- ads
    // 3배속: 구매(냥이 3배속·냥이의 가호) 또는 광고 1회 = 30분
    speed3Unlocked(p) { return !!(p.shop && (p.shop.speed3 || p.shop.premium)) || (p.speed3Until || 0) > nowMs(); },
    adLeft(p, placement) { return Math.max(0, (AD_LIMITS[placement] || 99) - (p.daily.ads[placement] || 0)); },
    async watchAd(placement) {
        const p = Save.p; this.ensure(p);
        if (this.adLeft(p, placement) <= 0) return false;
        const ok = await Ads.show(placement);
        if (ok) { p.daily.ads[placement] = (p.daily.ads[placement] || 0) + 1; this.track('ad'); Save.save(); }
        else toast(L('광고를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요'));   // not loaded yet / no fill / closed early: say so instead of a dead button
        return ok;
    },
    // ---- shop
    async buy(productId) {
        const p = Save.p, pr = PRODUCTS[productId];
        if (!pr) return null;
        if (pr.once && p.shop[productId]) return null;
        const res = await Payments.purchase(productId, pr);
        if (!res || !res.ok) return null;
        return this.applyPurchase(productId, res.token || res.receipt || 'test-' + nowMs());
    },
    // store purchase -> server check (online) -> grant once per purchase token -> store finishes the transaction
    async applyPurchase(productId, token) {
        const p = Save.p, pr = PRODUCTS[productId], native = Payments.native();
        if (!pr) return null;
        if (p.shop.purchases.some(x => x.token === token)) { if (native) window.BonghwaBridge.finishPurchase(token, !pr.once); return []; }   // already granted on this save: just acknowledge the store (a missed acknowledge gets auto-refunded by Play)
        if (native && Online.enabled) {
            if (!Online.on) { toast(L('서버에 연결되면 지급됩니다 (구매는 안전하게 보관됩니다)')); return null; }   // not finished: restored later
            const v = await Online.verifyPurchase(productId, token);
            if (!v.ok) { toast(L('구매를 확인하지 못했습니다: ') + (v.reason || '')); return null; }
        }
        const finish = () => { if (native) window.BonghwaBridge.finishPurchase(token, !pr.once); };
        p.shop.purchases.push({ id: productId, t: nowMs(), token });
        let g = pr.grant ? { ...pr.grant } : {};
        if (pr.gems) {
            const first = !p.shop.firstBuy[productId];
            g.gems = pr.gems * (first ? 2 : 1);
            p.shop.firstBuy[productId] = true;
        }
        if (productId === 'starter') p.shop.starter = true;
        const got = this.grant(p, g);
        Save.save();
        finish();
        if (typeof Online !== 'undefined' && Online.on) Online.pushSave(true);   // a paid grant goes to the cloud right away, not on the 15 s timer
        return got;
    },
    // reinstall / new device: one-time items owned by the Play account come back (gems were consumed when granted)
    async loadPrices() {
        if (!Payments.native() || !window.BonghwaBridge.prices) return;
        try { Object.assign(PLAY_PRICES, await window.BonghwaBridge.prices(Object.keys(PRODUCTS))); } catch (e) { return; }
        if (typeof UI !== 'undefined' && UI.S.screen === 'hub' && UI.S.tab === 'shop') UI.showHub('shop');   // redraw with local prices
    },
    async restorePurchases() {
        if (!Payments.native() || !window.BonghwaBridge.restorePurchases) return [];
        const got = [];
        for (const it of await window.BonghwaBridge.restorePurchases()) {
            const pr = PRODUCTS[it.productId];
            if (pr) got.push(...(await this.applyPurchase(it.productId, it.token) || []));   // applyPurchase skips (and acknowledges) tokens already granted
        }
        return got;
    },
    buySkin(id) {
        const p = Save.p, s = skinById(id);
        if (!s || p.shop.skins.includes(id) || p.gems < s.gems) return false;
        p.gems -= s.gems; p.shop.skins.push(id); p.shop.skin[s.cls] = id; Save.save();
        if (typeof Online !== 'undefined') Online.touchProfile();
        return true;
    },
    equipSkin(cls, id) {
        const p = Save.p;
        if (id && !p.shop.skins.includes(id)) return false;
        p.shop.skin[cls] = id; Save.save();
        if (typeof Online !== 'undefined') Online.touchProfile();   // rankings show the equipped skin
        return true;
    },
};

// ------------------------------------------------------------ skin summon & 연속 소환
// n pulls on the skin banner (gems only). A skin already owned (or drawn earlier in the same batch) becomes gems.
function doSkinSummon(n, keepOpen) {
    const p = Save.p, cost = n === 10 ? SKIN_SUMMON.cost10 : SKIN_SUMMON.cost1 * n;
    Rewards.ensure(p);
    if (p.gems < cost) return null;
    p.gems -= cost;
    Rewards.track('summon', n);
    const out = [];
    const pulls = n + (n === 10 ? (SKIN_SUMMON.bonus10 || 0) : 0);   // 10-pull: the 11th draw is free
    for (let i = 0; i < pulls; i++) {
        let r = pickWeighted(SKIN_SUMMON.table);
        p.skinPity++;
        if (p.skinPity >= SKIN_SUMMON.pity && r < 3) r = 3;
        if (r >= 3) p.skinPity = 0;
        const pool = skinPool(r), id = pool[Math.floor(Math.random() * pool.length)];
        if (p.shop.skins.includes(id)) { const g = SKIN_SUMMON.dupGems[r]; p.gems += g; out.push({ id, r, dup: true, gems: g }); }
        else { p.shop.skins.push(id); out.push({ id, r, isNew: true }); }
    }
    if (!keepOpen) Save.save();
    return out;
}
// 10-pulls in a row until the gem budget is used or a pull reaches stopAt (grade index, null = never).
// Never spends more than budget (duplicate gems don't extend it); saves once at the end.
// salvage (gear): grade up to which new gear is broken down into silver right away (-1 = keep everything).
function summonRun(kind, budget, stopAt, slot, salvage = -1) {
    const p = Save.p, cost = kind === 'skin' ? SKIN_SUMMON.cost10 : SUMMON.cost10;
    const run = { kind, got: [], spent: 0, rolls: 0, silver: 0, salvaged: 0, stopped: false };
    while (run.spent + cost <= budget && p.gems >= cost) {
        const res = kind === 'skin' ? doSkinSummon(10, true) : doSummon(10, slot, undefined, true);
        if (!res) break;
        run.spent += cost; run.rolls++;
        if (kind !== 'skin' && salvage >= 0) for (const it of res) if (it.r <= salvage) {
            p.items = p.items.filter(x => x !== it); p.silver += salvageValue(it); run.silver += salvageValue(it); run.salvaged++; it.salvaged = true;
        }
        run.got.push(...res);
        if (stopAt !== null && stopAt !== undefined && res.some(x => x.r >= stopAt)) { run.stopped = true; break; }
    }
    Save.save();
    return run;
}

// skin helpers used by battle/render/ui
function heroSkin(p, cls) { const id = p && p.shop && p.shop.skin[cls]; return id ? skinById(id) : null; }
function heroSprite(cls, skinId) { return (skinId && Art.gen('sk_' + skinId)) || Art.hero(cls, 0); }
function heroPortrait(cls, skinId) { return skinId && Art.gen('ps_' + skinId) ? 'ps_' + skinId : 'p_' + cls; }
// round avatars use a face crop of the portrait (img/pf_*, img/pfs_*) on the background colour the player picked
function heroFace(cls, skinId) { const n = heroPortrait(cls, skinId); return n.startsWith('ps_') ? 'pfs_' + n.slice(3) : 'pf_' + n.slice(2); }
const AVATAR_BG = ['#3a2412', '#e0605a', '#f5a8c8', '#f5d36a', '#6fbf5a', '#8fe0c0', '#7ec8f0', '#2c3a6e', '#a98ce0', '#f4efe6'];
function avatarBg() { return (Save.p && Save.p.set && Save.p.set.avBg) || AVATAR_BG[0]; }

// ------------------------------------------------------------ providers (native bridge or labelled test flow)
const Payments = {
    native() { return typeof window !== 'undefined' && window.BonghwaBridge && window.BonghwaBridge.purchase; },
    purchase(productId, pr) {
        if (this.native()) return window.BonghwaBridge.purchase(productId).catch(() => ({ ok: false }));
        if (ONLINE_CONFIG.release) { toast(L('결제는 앱에서만 할 수 있습니다')); return Promise.resolve({ ok: false }); }
        return UI.testPurchase(pr);                                                    // browser development only
    },
};
const Ads = {
    show(placement) {
        const p = Save.p;
        if (p.shop.premium) return Promise.resolve(true);   // 냥이의 가호: reward without the ad
        if (typeof window !== 'undefined' && window.BonghwaBridge && window.BonghwaBridge.showRewardedAd)
            return window.BonghwaBridge.showRewardedAd(placement).catch(() => false);
        if (ONLINE_CONFIG.release) { toast(L('광고 보상은 앱에서만 받을 수 있습니다')); return Promise.resolve(false); }
        return UI.testAd(placement);                                                   // browser development only
    },
};
