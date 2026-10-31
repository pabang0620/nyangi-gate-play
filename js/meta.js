'use strict';
// Meta progression logic (요일 도전, 토벌전, 도감, 업적, 주간 임무, 28일 출석, 스토리, 리그) on the save p. Data: js/data/modes.js, js/data/story.js.

function metaEnsure(p) {
    p.hstars = p.hstars || {};
    p.mats = Object.assign({ stone: 0 }, p.mats || {});
    p.codex = p.codex || {};
    p.ach = p.ach || {};
    p.stats = Object.assign({ kills: 0, dungeon: 0, raidTier: 0, wins: 0 }, p.stats || {});
    p.story = p.story || {};
    const day = dayKey(), wk = weekKey();
    if (!p.dungeon || p.dungeon.day !== day) p.dungeon = { day, used: 0, best: (p.dungeon && p.dungeon.best) || {} };
    if (!p.raid || p.raid.key !== wk) p.raid = { key: wk, runs: 0, best: 0, claimed: [] };
    if (!p.weeklyM || p.weeklyM.key !== wk) p.weeklyM = { key: wk, prog: {}, claimed: {}, bonus: false };
    p.att28 = p.att28 || { claimed: [] };
    Meta.leagueEnsure(p);
    return p;
}
function normalStars(p) { let s = 0; for (const k in p.stars) s += p.stars[k]; return s; }
function hardStars(p) { let s = 0; for (const k in (p.hstars || {})) s += p.hstars[k]; return s; }
function chapterCleared(p, ch) { return (p.stars[chapterBossIdx(ch)] || 0) > 0; }
// 어려움 (2026-10-31): opens all at once when the last 보통 chapter boss falls; inside 어려움 each stage needs the one before it
// (so a chapter needs the previous chapter's 어려움 boss). Saves from before: a stage already cleared on 어려움 stays playable.
function hardOpenAll(p) { return chapterCleared(p, CHAPTERS.length - 1); }
function hardUnlocked(p, idx) {
    const hs = p.hstars || {};
    if ((hs[idx] || 0) > 0) return true;
    return hardOpenAll(p) && (idx === 0 || (hs[idx - 1] || 0) > 0);
}
// the map's 어려움 button works in a chapter once 어려움 is open (or an older save has 어려움 stars there)
function hardChapterOpen(p, ch) {
    if (hardOpenAll(p)) return true;
    for (let i = CH_START[ch]; i < CH_START[ch] + CH_LEN[ch]; i++) if (((p.hstars || {})[i] || 0) > 0) return true;
    return false;
}
function gameDay() { return new Date(nowMs() - 5 * 3600 * 1000).getDay(); }
function weekIndex() { return Math.floor((nowMs() - 5 * 3600 * 1000 + 3 * 86400000) / (7 * 86400000)); }   // changes on Monday 05:00

const Meta = {
    // ---- 요일 도전
    dungeonKinds() { return DUNGEON.byDay[gameDay()]; },
    dungeonUnlocked(p) { return (p.stars[DUNGEON.tiers[0].need] || 0) > 0; },
    dungeonLeft(p) { metaEnsure(p); return Math.max(0, DUNGEON.entries - p.dungeon.used); },
    tierOpen(p, t) { return (p.stars[DUNGEON.tiers[t].need] || 0) > 0; },
    dungeonBest(p, kind, t) { return (p.dungeon.best[kind + t]) || 0; },
    finishDungeon(p, kind, t, stars) {
        metaEnsure(p);
        p.dungeon.used++;
        if (stars > 0) { p.stats.dungeon++; p.dungeon.best[kind + t] = Math.max(this.dungeonBest(p, kind, t), stars); this.track('w_dungeon'); }
        return stars > 0 ? Rewards.grant(p, DUNGEON.reward(kind, t, stars)) : [];
    },
    sweep(p, kind, t) {
        metaEnsure(p);
        if (this.dungeonLeft(p) <= 0 || this.dungeonBest(p, kind, t) < 3) return null;
        return this.finishDungeon(p, kind, t, 3);
    },
    // ---- 보스 토벌전
    raidUnlocked(p) { return (p.stars[RAID.unlockStage] || 0) > 0; },
    raidBoss(p) {
        const pool = RAID.order.filter(k => (p.stars[RAID.bossStage[k]] || 0) > 0);
        return pool.length ? pool[weekIndex() % pool.length] : 'ironfang';
    },
    // 보스 강도는 이번 주 첫 도전 때의 최고 진행 스테이지에 맞춘다 (초반 보스가 돌아와도 쉬워지지 않게)
    raidStage(p, kind) {
        if (p.raid.si == null) { let hi = 0; for (const k in p.stars) if (p.stars[k] > 0) hi = Math.max(hi, +k); p.raid.si = hi; }
        return Math.max(RAID.bossStage[kind], p.raid.si);
    },
    // 자기 스테이지에서는 보스별 기준(refMul), 진행도에 맞춰 강해진 경우에는 스테이지 공통 기준(refPerHpMul)
    raidRef(kind, si = RAID.bossStage[kind]) { return si > RAID.bossStage[kind] ? RAID.refPerHpMul * stageHpMul(si) : ENEMIES[kind].hp * stageHpMul(si) * (RAID.refMul[kind] || 1); },
    // 파티 레이드 boss health multiplier (spawn hpMul): RAID_ON.party.hp[difficulty][players - 1] x the boss's raid reference
    // 전투력: one number for how strong the account is (hero attack x health, scaled by the tower damage bonus); RAID_ON.diffs[].power is the same number for a player at that stage
    power(p) { const s = heroStats(p, p.hero), b = computeBonuses(p); return Math.round(Math.sqrt(s.atk * s.hp) * (1 + b.towerDmg)); },
    partyWalk(n) { const t = RAID_ON.party.walk; return Array.isArray(t) ? t[Math.max(1, Math.min(4, n)) - 1] : t; },   // seconds the boss walks to the gate
    partyTime(n) { const t = RAID_ON.party.time; return Array.isArray(t) ? t[Math.max(1, Math.min(4, n)) - 1] : t; },
    partyBossMul(kind, d, n) { return RAID_ON.party.hp[d][Math.max(1, Math.min(4, n)) - 1] * this.raidRef(kind, RAID_ON.diffs[d].eq) / ENEMIES[kind].hp; },
    raidTierOf(kind, dmg, si) { const ref = this.raidRef(kind, si); let n = 0; RAID.tiers.forEach((t, i) => { if (dmg >= t.x * ref) n = i + 1; }); return n; },
    finishRaid(p, kind, dmg) {
        metaEnsure(p);
        p.raid.runs++; p.raid.best = Math.max(p.raid.best, dmg);
        this.track('w_raid');
        const tier = this.raidTierOf(kind, p.raid.best, this.raidStage(p, kind));
        p.stats.raidTier = Math.max(p.stats.raidTier, tier);
        const got = [];
        for (let i = 0; i < tier; i++) if (!p.raid.claimed.includes(i)) { p.raid.claimed.push(i); got.push(...Rewards.grant(p, RAID.tiers[i].reward)); }
        return { tier, got };
    },
    // ---- 도감
    addKill(p, kind) {
        if (!p.codex) return;
        p.codex[kind] = (p.codex[kind] || 0) + 1;
        p.stats.kills++;
    },
    codexTiers(kind) { return ENEMIES[kind] && ENEMIES[kind].boss ? CODEX.bossTiers : CODEX.tiers; },
    codexLevel(p, kind) { const n = (p.codex || {})[kind] || 0; return this.codexTiers(kind).filter(t => n >= t).length; },
    // ---- 업적
    achState(p, a) { const v = Math.min(a.goal, a.stat(p)); return { v, done: v >= a.goal, claimed: !!p.ach[a.id] }; },
    claimAch(p, id) {
        const a = ACHIEVEMENTS.find(x => x.id === id), st = this.achState(p, a);
        if (!st.done || st.claimed) return null;
        p.ach[id] = true;
        return Rewards.grant(p, a.reward);
    },
    // ---- 주간 임무
    track(id, n = 1) { const p = Save.p; if (!p) return; metaEnsure(p); p.weeklyM.prog[id] = (p.weeklyM.prog[id] || 0) + n; },
    weeklyState(p, m) { const v = Math.min(m.goal, p.weeklyM.prog[m.id] || 0); return { v, done: v >= m.goal, claimed: !!p.weeklyM.claimed[m.id] }; },
    claimWeekly(p, id) {
        const m = WEEKLY_MISSIONS.find(x => x.id === id), st = this.weeklyState(p, m);
        if (!st.done || st.claimed) return null;
        p.weeklyM.claimed[id] = true;
        return Rewards.grant(p, m.reward);
    },
    claimWeeklyBonus(p) {
        if (p.weeklyM.bonus || !WEEKLY_MISSIONS.every(m => p.weeklyM.claimed[m.id])) return null;
        p.weeklyM.bonus = true;
        return Rewards.grant(p, WEEKLY_BONUS);
    },
    // ---- 28일 출석
    att28Due(p) { const c = ((p.login.count - 1) % 28) + 1; return ATTEND28[c] && !p.att28.claimed.includes(p.login.count) ? c : 0; },
    claimAtt28(p) { const c = this.att28Due(p); if (!c) return null; p.att28.claimed.push(p.login.count); if (p.att28.claimed.length > 8) p.att28.claimed.shift(); return Rewards.grant(p, ATTEND28[c]); },
    // ---- 스토리
    storyFor(p, ch, kind) { const key = ch + kind; if (p.story[key] || !STORY[ch] || !STORY[ch][kind]) return null; return STORY[ch][kind]; },
    markStory(p, ch, kind) { p.story[ch + kind] = true; Save.save(); },
    // ---- 무한의 성벽 주간 규칙
    endlessRule() { return ENDLESS_RULES[weekIndex() % ENDLESS_RULES.length]; },
    // ---- 시즌 리그
    leagueSeason() { return Math.floor(weekIndex() / 2); },
    leagueStart(season) { return (season * 2 * 7 - 3) * 86400000 + 5 * 3600 * 1000; },
    leagueDay(season) { return Math.max(0, (nowMs() - this.leagueStart(season)) / 86400000); },
    leagueEnsure(p) {
        const season = this.leagueSeason();
        const L = p.league;
        if (L && L.season === season) return L;
        let pending = L ? L.pending || null : null;
        // online: the server settles the real league and pays through the reward inbox, so no local AI-league reward
        if (L && L.best > 0 && !(typeof ONLINE_CONFIG !== 'undefined' && ONLINE_CONFIG.url)) {
            const rank = this.leagueRankOf(L, L.best, LEAGUE.days);
            pending = { season: L.season, rank, best: L.best };
        }
        p.league = { season, best: 0, ref: Math.max(10, Math.round(((L && L.best) || p.endlessBest || 0) * 1.1)), pending };
        return p.league;
    },
    leagueRivals(L, day) {
        const rng = makeRng(L.season * 7919 + L.ref * 31 + 7);
        const f = Math.min(1, day / LEAGUE.days);
        const out = [];
        for (let i = 0; i < LEAGUE.rivals; i++) {
            const u = (i + rng()) / LEAGUE.rivals;                          // evenly spread with jitter
            const target = L.ref * (0.7 + 0.9 * u);
            const pace = 0.6 + rng() * 0.8;                                  // some push early, some late
            const score = Math.max(1, Math.round(target * (0.25 + 0.75 * Math.pow(f, pace))));
            out.push({ name: LEAGUE.names[i % LEAGUE.names.length], score, ai: true });
        }
        return out;
    },
    leagueRankOf(L, best, day) { return 1 + this.leagueRivals(L, day).filter(r => r.score > best).length; },
    leagueBoard(p) {
        const lg = this.leagueEnsure(p), day = this.leagueDay(lg.season);
        const rows = this.leagueRivals(lg, day).concat([{ name: L('나'), score: lg.best, me: true }]);
        rows.sort((a, b) => b.score - a.score || (a.me ? -1 : b.me ? 1 : 0));
        rows.forEach((r, i) => { r.rank = i + 1; });
        return { rows, rank: rows.find(r => r.me).rank, daysLeft: Math.max(0, Math.ceil(LEAGUE.days - day)) };
    },
    leagueTier(rank) { return LEAGUE.rewards.find(r => rank <= r.upTo) || LEAGUE.rewards[LEAGUE.rewards.length - 1]; },
    leagueRecord(p, wave) {
        const L = this.leagueEnsure(p);
        const before = this.leagueBoard(p).rank;
        if (wave > L.best) L.best = wave;
        return { before, after: this.leagueBoard(p).rank };
    },
    claimLeague(p) {
        const L = this.leagueEnsure(p);
        if (!L.pending) return null;
        const pd = L.pending; L.pending = null;
        if (pd.rank === 1) p.stats.league1 = (p.stats.league1 || 0) + 1;
        if (pd.rank <= 3) p.stats.league3 = (p.stats.league3 || 0) + 1;
        return Rewards.grant(p, this.leagueTier(pd.rank).reward);
    },
    // ---- 주간 공방전
    cupWeek() { const w = weekIndex(); const [map, theme] = CUP.maps[w % CUP.maps.length]; return { week: w, map, theme, ...CUP.rules[(w * 3) % CUP.rules.length] }; },
    cupState(p) {
        const day = dayKey(), w = weekIndex();
        if (!p.cup || p.cup.week !== w) p.cup = { week: w, day, used: 0, best: 0, bestWave: 0 };
        if (p.cup.day !== day) { p.cup.day = day; p.cup.used = 0; }
        return p.cup;
    },
    cupUnlocked(p) { return (p.stars[CUP.unlockStage] || 0) > 0; },
    cupLeft(p) { return Math.max(0, CUP.attempts - this.cupState(p).used); },
    finishCup(p, r) {
        const c = this.cupState(p), score = CUP.score(r);
        c.used++;
        const best = score > c.best;
        if (best) { c.best = score; c.bestWave = r.wave; }
        return { score, best, weekBest: c.best };
    },
    // a limited-entry run that never reached its result (app closed mid-battle) still uses the entry
    settleRunLock(p) {
        const r = p.runLock;
        if (!r) return;
        delete p.runLock;
        metaEnsure(p);
        if (r.cup) this.cupState(p).used++;
        else if (r.dungeon) p.dungeon.used++;
        else if (r.raid) p.raid.runs++;
        Save.save();
    },
    // ---- 받을 것이 있는가 (보상 탭 배지)
    pending(p) {
        metaEnsure(p);
        if (WEEKLY_MISSIONS.some(m => { const s = this.weeklyState(p, m); return s.done && !s.claimed; })) return true;
        return ACHIEVEMENTS.some(a => { const s = this.achState(p, a); return s.done && !s.claimed; });
    },
};
function codexPoints(p) {
    let n = 0;
    for (const k in (p.codex || {})) { const lv = Meta.codexLevel(p, k); for (let i = 0; i < lv; i++) n += CODEX.pts[i]; }
    return n;
}
function codexDmgMul(p) { return 1 + codexPoints(p) * CODEX.perPt; }
