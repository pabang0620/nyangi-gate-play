'use strict';
// Persistent profile (localStorage), gear generation, enhancement, summon, offline supply.

const SAVE_KEY = 'bonghwa_save_v1';

function newProfile() {
    return {
        v: 1,
        hero: 'knight',
        heroes: { knight: { lv: 1, xp: 0 }, mage: { lv: 1, xp: 0 }, ranger: { lv: 1, xp: 0 } },
        silver: 300, gems: 60,
        stars: {}, research: {},
        items: [], equip: { weapon: null, armor: null, charm: null }, nextId: 1,
        endlessBest: 0, endlessGemMark: 0, pity: 0,
        lastSeen: nowMs(), offlineCarry: 0,
        set: { autoHero: true, autoWave: false, autoNext: false, speed: 1, muted: false },
        seenTips: {},
    };
}

const Save = {
    p: null,
    load() {
        let data = null;
        try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { data = null; }
        const base = newProfile();
        if (data && data.v === 1) {
            this.p = Object.assign(base, data);
            this.p.set = Object.assign(newProfile().set, data.set || {});
            this.p.heroes = Object.assign(newProfile().heroes, data.heroes || {});
        } else {
            this.p = base;
            // starter gear so the hero screen isn't empty
            const w = makeItem('weapon', 0, 1), a = makeItem('armor', 0, 1);
            this.p.equip.weapon = w.id; this.p.equip.armor = a.id;
        }
        return this.p;
    },
    save() {
        try {
            this.p.lastSeen = this.p.savedMs = nowMs(); this.p.rev = (this.p.rev || 0) + 1;     // rev/savedMs: cloud save conflict check
            localStorage.setItem(SAVE_KEY, JSON.stringify(this.p));
        } catch (e) { /* storage may be blocked */ }
        if (typeof Online !== 'undefined') Online.saved();
    },
    reset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } this.p = null; this.load(); },
};

// research & pass count normal + 영웅 난이도 stars
function totalStars(p) { let s = 0; for (const k in p.stars) s += p.stars[k]; for (const k in (p.hstars || {})) s += p.hstars[k]; return s; }
function spentStars(p) {
    let s = 0;
    for (const col of RESEARCH) for (const n of col.nodes) if (p.research[n.id]) s += n.cost;
    return s;
}
// 자동 찍기: keep buying the cheapest node that is next in its column; ties go to 전역 (helps every tower), then the
// towers that also hit flyers (archer, mage), then barracks, cannon. Cheapest-first opens the most nodes for the stars.
const RESEARCH_PREF = ['w', 'a', 'm', 'b', 'c'];
function autoResearch(p) {
    const opened = [];
    for (;;) {
        const free = totalStars(p) - spentStars(p);
        let best = null;
        for (const col of RESEARCH) {
            const n = col.nodes.find(x => !p.research[x.id]);
            if (!n || n.cost > free) continue;
            if (!best || n.cost < best.cost || (n.cost === best.cost && RESEARCH_PREF.indexOf(n.id[0]) < RESEARCH_PREF.indexOf(best.id[0]))) best = n;
        }
        if (!best) return opened;
        p.research[best.id] = true;
        opened.push(best);
    }
}
function highestCleared(p) { let hi = -1; for (const k in p.stars) if (p.stars[k] > 0) hi = Math.max(hi, +k); return hi; }
function stageUnlocked(p, idx) { return idx === 0 || (p.stars[idx - 1] || 0) > 0; }

// ------------------------------------------------------------ items
function makeItem(slot, rarity, ilvl, rng = Math.random) {
    const p = Save.p;
    const subKeys = Object.keys(SUB_OPTS);
    const subs = [];
    const pool = subKeys.slice();
    // mythic: one extra option and stronger rolls (2026-10-17, "신화가 압도적으로")
    const nSubs = rarity >= 4 ? rarity + 1 : rarity, subMul = rarity >= 4 ? 2.0 : 1 + 0.15 * rarity;
    for (let i = 0; i < nSubs; i++) {
        const k = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        const o = SUB_OPTS[k];
        let v = (o.min + (o.max - o.min) * rng()) * subMul;
        v = o.pct ? Math.round(v * 1000) / 1000 : Math.round(v);
        subs.push({ k, v });
    }
    const it = { id: p.nextId++, slot, r: rarity, ilvl: Math.max(1, Math.round(ilvl)), enh: 0, subs, art: Math.floor(rng() * ITEM_ARTS), isNew: true, t: Date.now() };
    p.items.push(it);
    while (p.items.length > BAG_MAX && bagOverflow(p)) { }
    return it;
}
// bag full: the weakest unequipped, unenhanced gear turns into silver (keeps saves small enough for the cloud)
let overflowGain = 0, overflowN = 0, overflowTimer = 0;
function bagOverflow(p) {
    let worst = null;
    for (const x of p.items) {
        if (isEquipped(x) || x.enh > 0 || x.mid) continue;   // tradeable (server-minted) gear is never auto-salvaged
        if (!worst || x.r < worst.r || (x.r === worst.r && x.ilvl < worst.ilvl)) worst = x;
    }
    if (!worst) return false;
    p.items.splice(p.items.indexOf(worst), 1);
    const g = salvageValue(worst);
    p.silver += g; overflowGain += g; overflowN++;
    if (typeof toast === 'function' && !overflowTimer) overflowTimer = setTimeout(() => {
        toast(L('가방이 가득 차서 약한 장비 {0}개를 은화 {1}로 바꿨습니다 (최대 {2}칸)', overflowN, fmt(overflowGain), BAG_MAX));
        overflowGain = 0; overflowN = 0; overflowTimer = 0;
    }, 600);
    return true;
}
function itemName(it) { const a = it.r >= 2 && ITEM_ART_NAMES[it.slot] && ITEM_ART_NAMES[it.slot][it.r]; return a ? a[itemArt(it)] : ITEM_NAMES[it.slot][it.r]; }
// gear grows with progress: the level used for stats is the item's own level or what a summon gives right now, whichever is higher.
// So gear bought or summoned early (a day-1 purchase) never falls behind new drops of the same grade.
function itemLv(it) { const p = Save.p; return Math.max(it.ilvl, p && p.stars ? Math.round(summonIlvl(p)) : 0); }
// picture variant for the high-grade item images (img/it_{slot}_{r}_{n}.png); older items get one from their id
const ITEM_ARTS = 4;
function itemArt(it) { return it.art !== undefined ? it.art : it.id % ITEM_ARTS; }
function itemMain(it) {
    const m = RARITY[it.r].mul * (1 + ENHANCE.perLv * it.enh), lv = itemLv(it);
    if (it.slot === 'weapon') return { k: 'atk', name: L('영웅 공격력'), v: Math.round((4 + lv * 1.2) * m) };
    if (it.slot === 'armor') return { k: 'hp', name: L('영웅 체력'), v: Math.round((30 + lv * 8) * m) };
    return { k: 'towerDmg', name: L('모든 탑 피해'), v: Math.round((0.03 + lv * 0.002) * m * 1000) / 1000, pct: true };
}
function itemScore(it) {
    // rough comparable value used by "최적 장착"
    const main = itemMain(it);
    let s = it.slot === 'weapon' ? main.v * 10 : it.slot === 'armor' ? main.v * 1.2 : main.v * 3000;
    for (const sb of it.subs) s += (SUB_OPTS[sb.k].pct ? sb.v * 1000 : sb.v * 4);
    return s;
}
function fmtOpt(name, v, isPct) { return name + ' +' + (isPct ? (v * 100).toFixed(1).replace(/\.0$/, '') + '%' : fmt(v)); }
function itemById(id) { return Save.p.items.find(i => i.id === id) || null; }
function isEquipped(it) { return Save.p.equip[it.slot] === it.id; }
// salvage keeps the item's own level (old gear grown by progress is not a silver mine); enhance cost follows the level it fights at
function salvageValue(it) { return Math.round(30 * [1, 3, 10, 40, 150][it.r] * (1 + it.ilvl / 15) + it.enh * 40); }
function enhanceCost(it) { return Math.round(60 * Math.pow(1.35, it.enh) * (1 + 0.5 * it.r) * (1 + itemLv(it) / 20)); }

// useGuard: spend one 하락방지권 (p.mats.guard) when a failure would drop the level.
// useShield: spend one 파괴방지권 (p.mats.shield) when a failure would destroy the item. noSave: auto enhance saves once at the end
function tryEnhance(it, useGuard, noSave, useShield) {
    const p = Save.p, cost = enhanceCost(it), stones = enhanceStones(it.enh);
    p.mats = p.mats || { stone: 0 };
    if (it.enh >= ENHANCE.max || p.silver < cost || (p.mats.stone || 0) < stones) return null;
    p.silver -= cost; p.mats.stone -= stones;
    const ok = Math.random() < ENHANCE.rate[it.enh];
    if (typeof Rewards !== 'undefined') Rewards.track('enhance');
    let dropped = false, guarded = false, destroyed = false, shielded = false;
    if (ok) it.enh++;
    else if (it.enh >= ENHANCE.destroyFrom && Math.random() < (ENHANCE.destroy[it.enh - ENHANCE.destroyFrom] || 0) && !(useShield && (p.mats.shield || 0) > 0 && (p.mats.shield--, shielded = true))) {
        destroyed = true;
        p.items = p.items.filter(x => x !== it);
        for (const k in p.equip) if (p.equip[k] === it.id) p.equip[k] = null;
    }
    else if (it.enh >= ENHANCE.dropFrom) {
        if (useGuard && (p.mats.guard || 0) > 0) { p.mats.guard--; guarded = true; }
        else { it.enh--; dropped = true; }
    }
    if (!noSave) Save.save();
    return { ok, dropped, guarded, destroyed, shielded, cost, stones };
}
// 자동 강화: try until the target level or a spending cap (silver / stones) is reached
// in the destroy zone it only goes on while a 파괴방지권 is switched on and owned (never destroys an item unattended)
function autoEnhance(it, target, silverCap, stoneCap, useGuard, useShield) {
    const p = Save.p, start = it.enh, run = { tries: 0, ok: 0, drops: 0, guards: 0, shields: 0, silver: 0, stones: 0, start, why: '' };
    while (it.enh < Math.min(target, ENHANCE.max)) {
        if (it.enh >= ENHANCE.destroyFrom && !(useShield && ((p.mats && p.mats.shield) || 0) > 0)) { run.why = 'risk'; break; }
        const cost = enhanceCost(it), st = enhanceStones(it.enh);
        if (run.silver + cost > silverCap) { run.why = 'silverCap'; break; }
        if (run.stones + st > stoneCap) { run.why = 'stoneCap'; break; }
        const r = tryEnhance(it, useGuard, true);
        if (!r) { run.why = 'short'; break; }
        run.tries++; run.silver += r.cost; run.stones += r.stones;
        if (r.ok) run.ok++; if (r.dropped) run.drops++; if (r.guarded) run.guards++; if (r.shielded) run.shields++;
        if (run.tries >= 5000) break;
    }
    if (!run.why && it.enh >= target) run.why = 'done';
    Save.save();
    return run;
}
function buyGuards(i, shield) {
    const p = Save.p, g = (shield ? SHIELD_SHOP : GUARD_SHOP)[i], k = shield ? 'shield' : 'guard';
    if (!g || p.gems < g.gems) return false;
    p.gems -= g.gems; p.mats = p.mats || { stone: 0 }; p.mats[k] = (p.mats[k] || 0) + g.n;
    Save.save();
    return true;
}

function equipBest() {
    const p = Save.p;
    for (const s of SLOTS) {
        let best = null;
        for (const it of p.items) if (it.slot === s && (!best || itemScore(it) > itemScore(best))) best = it;
        if (best) p.equip[s] = best.id;
    }
    // equipped items never show the NEW tag
    for (const s of SLOTS) { const it = itemById(p.equip[s]); if (it) it.isNew = false; }
    Save.save();
}
// 일괄 분해 설정 (p.set.salvage): up to which grade (0 일반, 1 희귀, 2 영웅) and whether enhanced gear goes too
function salvageSet(p) { const s = (p.set && p.set.salvage) || {}; return { max: s.max === undefined ? 1 : s.max, enh: !!s.enh }; }
function salvageTargets(p, maxRarity, withEnh) { return p.items.filter(it => !isEquipped(it) && !it.mid && it.r <= maxRarity && (withEnh || it.enh === 0)); }   // 거래 가능 gear only by hand
function bulkSalvage(maxRarity, withEnh) {
    const p = Save.p;
    let gain = 0, n = 0;
    p.items = p.items.filter(it => {
        if (isEquipped(it) || it.mid || it.r > maxRarity || (it.enh > 0 && !withEnh)) return true;
        gain += salvageValue(it); n++; return false;
    });
    p.silver += gain;
    Save.save();
    return { gain, n };
}

// ------------------------------------------------------------ summon
function summonIlvl(p) { return 1 + Math.max(0, highestCleared(p)) * 2.5; }
// slot: 'weapon' | 'armor' | 'charm' picks the gear type (same price and grade rates), anything else = random type.
// pay 'tickets' spends n summon tickets instead of gems, 'free' costs nothing (the daily ad summon; the ad is counted by Rewards.watchAd). keepOpen: no save (연속 소환 saves once at the end).
function doSummon(n, slot, pay, keepOpen) {
    const p = Save.p, cost = n === 10 ? SUMMON.cost10 : SUMMON.cost1 * n;
    if (pay === 'tickets') { if ((p.tickets || 0) < n) return null; p.tickets -= n; }
    else if (pay !== 'free') { if (p.gems < cost) return null; p.gems -= cost; }
    if (typeof Rewards !== 'undefined') Rewards.track('summon', n);
    const out = [];
    const pulls = n + (n === 10 ? (SUMMON.bonus10 || 0) : 0);   // 10-pull: the 11th draw is free
    for (let i = 0; i < pulls; i++) {
        let r = pickWeighted(SUMMON.table);
        p.pity++;
        if (p.pity >= SUMMON.pity && r < 3) r = 3;
        if (r >= 3) p.pity = 0;
        out.push(makeItem(SLOTS.includes(slot) ? slot : SLOTS[Math.floor(Math.random() * 3)], r, summonIlvl(p)));
    }
    if (!keepOpen) Save.save();
    return out;
}

// ------------------------------------------------------------ bonuses fed into battle
function computeBonuses(p) {
    const b = {
        heroAtk: 0, heroHp: 0, heroAtkPct: 0, heroHpPct: 0, critRate: 0, skillCdr: 0,
        towerDmg: 0, archerDmg: 0, mageDmg: 0, cannonDmg: 0, soldierHp: 0, soldierAtk: 0,
        startGold: 0, bountyPct: 0,
        archerRange: 0, archerCrit: 0, mageResIgnore: 0, mageRate: 0, cannonSplash: 0, cannonStun: 0,
        extraSoldier: 0, respawnMul: 1, beaconMul: 1, beaconCdMul: 1, lives: 0, buildDiscount: 0,
    };
    for (const s of SLOTS) {
        const it = itemById(p.equip[s]);
        if (!it) continue;
        const m = itemMain(it);
        if (m.k === 'atk') b.heroAtk += m.v; else if (m.k === 'hp') b.heroHp += m.v; else b.towerDmg += m.v;
        for (const sb of it.subs) b[sb.k] = (b[sb.k] || 0) + sb.v;
    }
    const R = p.research;
    if (R.a1) b.archerRange += 0.12;
    if (R.a2) b.archerDmg += 0.15;
    if (R.a3) b.archerCrit += 0.12;
    if (R.m1) b.mageDmg += 0.12;
    if (R.m2) b.mageResIgnore = 0.5;
    if (R.m3) b.mageRate += 0.15;
    if (R.c1) b.cannonSplash += 0.15;
    if (R.c2) b.cannonDmg += 0.15;
    if (R.c3) b.cannonStun = 0.15;
    if (R.b1) b.soldierHp += 0.25;
    if (R.b2) b.soldierAtk += 0.25;
    if (R.b3) { b.extraSoldier = 1; b.respawnMul = 0.6; }
    if (R.w1) b.startGold += 60;
    if (R.w2) { b.beaconMul = 1.3; b.beaconCdMul = 0.75; }
    if (R.w3) { b.lives += 5; b.buildDiscount = 0.08; }
    // v2 research tier 2
    if (R.a4) b.archerRate = (b.archerRate || 0) + 0.15;
    if (R.a5) b.archerDmg += 0.2;
    if (R.a6) { b.archerRange += 0.15; b.archerCrit += 0.08; }
    if (R.m4) b.mageDmg += 0.15;
    if (R.m5) b.mageRate += 0.15;
    if (R.m6) b.mageDmg += 0.25;
    if (R.c4) b.cannonDmg += 0.15;
    if (R.c5) b.cannonSplash += 0.15;
    if (R.c6) b.cannonDmg += 0.25;
    if (R.b4) b.soldierHp += 0.3;
    if (R.b5) b.soldierAtk += 0.3;
    if (R.b6) { b.soldierArmor = 0.15; b.respawnMul *= 0.7; }
    if (R.w4) b.startGold += 100;
    if (R.w5) b.bountyPct += 0.1;
    if (R.w6) { b.towerDmg += 0.1; b.lives += 5; }
    b.skillCdr = Math.min(b.skillCdr, 0.4);
    return b;
}

function heroStats(p, cls) {
    const H0 = HEROES[cls], lv = p.heroes[cls].lv, b = computeBonuses(p);
    const g = Math.pow(HERO_GROWTH, lv - 1);
    const sk = typeof skinBonus === 'function' ? skinBonus(p, cls) : { atk: 0, hp: 0, cdr: 0 };   // worn skin's option
    return {
        lv,
        hp: Math.round((H0.hp * g + b.heroHp) * (1 + b.heroHpPct + sk.hp)),
        atk: Math.round((H0.atk * g + b.heroAtk * H0.rate / 0.9) * (1 + b.heroAtkPct + sk.atk)),
        crit: 0.05 + b.critRate,
        cdr: sk.cdr ? Math.min(0.4, b.skillCdr + sk.cdr) : b.skillCdr,
    };
}
function grantHeroXp(p, cls, xp) {
    const h = p.heroes[cls];
    let ups = 0;
    h.xp += xp;
    while (h.lv < HERO_MAX_LV && h.xp >= heroXpNeed(h.lv)) { h.xp -= heroXpNeed(h.lv); h.lv++; ups++; }
    if (h.lv >= HERO_MAX_LV) h.xp = 0;
    return ups;
}
// battle XP: the deployed hero gets it all, every other hero also gets 1% (min 1) - silent level-ups
const HERO_XP_SHARE = 0.1;   // other heroes get 10% of battle xp (1% made switching heroes a restart)
function heroXpShare(xp) { return xp > 0 ? Math.max(1, Math.round(xp * HERO_XP_SHARE)) : 0; }
function grantBattleXp(p, cls, xp) {
    const ups = grantHeroXp(p, cls, xp), share = heroXpShare(xp);
    let got = 0;   // maxed heroes simply don't take it
    if (share) for (const c of Object.keys(p.heroes)) if (c !== cls && p.heroes[c].lv < HERO_MAX_LV) { grantHeroXp(p, c, share); got = share; }
    return { ups, share: got };
}

// ------------------------------------------------------------ offline supply
function offlineReward(p) {
    const away = (nowMs() - (p.lastSeen || nowMs())) / 60000 + (p.offlineCarry || 0);
    if (away < OFFLINE.minMin) { p.offlineCarry = Math.max(0, away); return null; }
    p.offlineCarry = 0;
    const prem = p.shop && p.shop.premium;
    const hours = Math.min(prem ? 24 : OFFLINE.capH, away / 60);
    const perH = (OFFLINE.basePerH + OFFLINE.perStage * (highestCleared(p) + 1)) * (prem ? 1.5 : 1);
    return { hours, silver: Math.round(perH * hours) };
}
