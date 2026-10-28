'use strict';
// Game modes and meta content: 요일 도전, 보스 토벌전, 도감, 주간 임무, 28일 출석, 무한 주간 규칙, 시즌 리그, 업적, 패스 확장. Loaded after rewards.js (PASS_TIERS).

const DUNGEON = {
    entries: 3,
    // getDay() with the 05:00 rollover: 0=일 1=월 ... 6=토. Sunday opens everything.
    byDay: { 0: ['silver', 'stone', 'gem'], 1: ['silver'], 2: ['stone'], 3: ['gem'], 4: ['silver'], 5: ['stone'], 6: ['gem'] },
    kinds: {
        silver: { name: L('은화 광산'), desc: L('도둑 고블린 무리를 막고 은화를 되찾는다'), map: 'm6', theme: 'desert', waves: 6, pool: ['goblin', 'wolf', 'beetlet', 'orc'], icon: 'silver' },
        stone:  { name: L('강화석 채굴장'), desc: L('단단한 골렘 무리. +11 이상 강화에 쓰는 강화석'), map: 'm8', theme: 'ruin', waves: 6, pool: ['orc', 'skeleton', 'beetle', 'golem'], icon: 'i_stone' },
        gem:    { name: L('보석 동굴'), desc: L('하늘을 나는 적 무리. 보석과 소환권'), map: 'm7', theme: 'swamp', waves: 6, pool: ['bat', 'imp', 'harpy', 'icewisp'], icon: 'gem' },
    },
    // need = 먼저 클리어할 스테이지 idx, eq = 적 강도 기준 스테이지 idx
    tiers: [
        { name: L('쉬움'), need: 3, eq: 3 },
        { name: L('보통'), need: 11, eq: 11 },
        { name: L('어려움'), need: 17, eq: 17 },
        { name: L('지옥'), need: 29, eq: 29 },
        { name: L('악몽'), need: 41, eq: 41 },
        { name: L('심연'), need: 53, eq: 53 },
    ],
    reward(kind, tier, stars) {
        const k = [0, 0.6, 0.8, 1][stars];
        if (kind === 'silver') return { silver: Math.round((2500 + tier * 3500) * k) };
        if (kind === 'stone') return { stones: Math.max(1, Math.round((3 + tier * 3) * k)) };
        return { gems: Math.round((25 + tier * 15) * k), tickets: stars === 3 && tier >= 3 ? 1 : 0 };
    },
};

const RAID = {
    tries: 3, time: 180, map: 'm9', unlockStage: 7,
    order: ['ironfang', 'grak', 'vargas', 'frosna', 'setka', 'morga', 'ignis', 'nox', 'aeris', 'chronos'],
    bossStage: { ironfang: 3, grak: 7, vargas: 11, frosna: 17, setka: 23, morga: 29, ignis: 35, nox: 41, aeris: 47, chronos: 53 },
    hpMul: 40,          // effectively unkillable in 3 minutes: score = damage dealt
    escortEvery: 16, escortBudget: 10, escortHp: 0.6,
    startGold: 1400, goldPerStage: 110,
    // per-boss damage reference: chosen with tools/balance.js so an on-level player reaches about tier 4 (x1.5)
    refPerHpMul: 9800,   // tools/balance.js --raid KIND --at IDX: on-level damage ~1.5x at idx 23~41
    refMul: { ironfang: 1.178, grak: 0.707, vargas: 0.433, frosna: 0.715, setka: 0.52, morga: 0.711, ignis: 0.436, nox: 0.891, aeris: 1.001, chronos: 0.698 },
    // damage thresholds as multiples of the boss's campaign HP (def.hp x stageHpMul of its stage)
    tiers: [
        { x: 0.3, reward: { silver: 2000 } }, { x: 0.6, reward: { gems: 30 } }, { x: 1, reward: { stones: 3 } },
        { x: 1.5, reward: { gems: 50 } }, { x: 2, reward: { tickets: 1 } }, { x: 3, reward: { stones: 6, silver: 6000 } },
        { x: 4, reward: { gems: 80 } }, { x: 5.5, reward: { tickets: 2 } }, { x: 7, reward: { gems: 120, stones: 8 } },
        { x: 9, reward: { gems: 200, tickets: 3 } },
    ],
};

// 온라인 레이드 (docs/PLAN_ONLINE_RAID.md, server 20261018000000_raid.sql). The server's game_config 'raid' decides cards, HP and caps;
// these copies are for display and the battle setup. Points = damage / the 보스 토벌전 reference x 100 (an on-level run is about 150).
const RAID_ON = {
    diffs: [{ name: L('일반'), eq: 17, power: 1700 }, { name: L('어려움'), eq: 29, power: 4000 }, { name: L('지옥'), eq: 41, power: 6600 }, { name: L('악몽'), eq: 53, power: 10100 }],   // power: 권장 전투력 = Meta.power of a player at that stage (tools/balance.js profileFor, +10 gear)
    medals: [20, 35, 55, 80],
    // 파티 레이드: 1~4 players fight one boss live (lockstep like 협동 디펜스) on the 보스 토벌전 map, 3 entries a week.
    // Boss health = hp[difficulty][players - 1] x Meta.raidRef(boss, strength); killing it before it reaches the gate wins. walk[players - 1] is the
    // time (seconds) the boss needs for the whole road, so it is the clock; blockers only slow it. time is a hidden cap against runs that never end.
    // Tuned with tools/praidbalance.js: free players who just opened the difficulty fail alone and in any party (up to 4),
    // a paying player helps three fresh ones. Alone gets a longer clock (time[0]) and a much tougher boss so a solo clear
    // takes a paying player 300s+ and a party is always faster; a free player a week on (8 stages) only sometimes clears 일반 alone.
    party: { tries: 3, size: 4, dripShare: 0.4, walk: [220, 120, 120, 120], time: [600, 600, 600, 600], startGold: [1, 0.8, 0.7, 0.6], goldShare: 0.5, enrage: 0.4, enrageSpd: 1.4, enrageCd: 0.7,
        hp: [[5.2, 4.9, 6.1, 9.2], [7.9, 7.2, 8.9, 12.5], [9.7, 8.5, 9.1, 13.5], [4.3, 5.2, 6.6, 10.8]] },
    world: { runCap: 600, tries: 3 },
    pity: { leg: 10, myth: 40 },
    // 토벌 훈장 상점: the 신화 장비 상자 is the sure ceiling (once a week)
    shop: [
        { id: 'guard', cost: 30, reward: { guards: 1 } }, { id: 'shield', cost: 60, reward: { shields: 1 } },
        { id: 'ticket', cost: 40, reward: { tickets: 1 } }, { id: 'stone', cost: 50, reward: { stones: 10 } },
        { id: 'leg', cost: 300, reward: { item: 3 }, slot: true }, { id: 'myth', cost: 1200, reward: { item: 4 }, slot: true, weekly: 1 },
    ],
    // 협동 디펜스: two roads, 15 waves, a boss at 8 and the raid boss at 15; each player keeps 60% of every kill's gold
    // bossHp: the final raid boss per difficulty (each difficulty has its own boss). Tuned with tools/coopbalance.js: two free
    // players who just opened it lose most games, a paying player with a free one wins about half (2026-10-20)
    coop: { waves: 15, midWave: 8, maps: ['m2', 'm8', 'm12', 'm13'], hpMul: 1.7, bossHp: [3.3, 2.0, 2.4, 5.5], goldShare: 0.6, startGold: 0.8, tick: 1 / 30 },
};

// 도감: kills per enemy kind -> points; each point = all damage +0.2%
const CODEX = { tiers: [50, 300, 1000], bossTiers: [3, 10, 30], pts: [1, 1, 2], perPt: 0.002 };   // bossTiers: a boss dies once per stage

const WEEKLY_MISSIONS = [
    { id: 'w_dungeon', name: L('요일 도전 6번'),      goal: 6,  reward: { gems: 60 } },
    { id: 'w_raid',    name: L('보스 토벌전 1번'),     goal: 1,  reward: { stones: 3 } },
    { id: 'w_win',     name: L('스테이지 20번 승리'),  goal: 20, reward: { tickets: 2 } },
    { id: 'w_enhance', name: L('장비 강화 15번'),      goal: 15, reward: { silver: 5000 } },
    { id: 'w_endless', name: L('무한의 성벽 2판'),     goal: 2,  reward: { gems: 40 } },
];
const WEEKLY_BONUS = { gems: 150, tickets: 2 };

// 28일 출석 누적 보상 (7일 순환 출석과 별개, 28일마다 반복)
const ATTEND28 = { 7: { tickets: 2 }, 14: { gems: 150 }, 21: { stones: 5 }, 28: { gems: 300, tickets: 3 } };

const ENDLESS_RULES = [
    { id: 'none',  name: L('기본 규칙'),  desc: L('평소의 무한의 성벽') },
    { id: 'air',   name: L('하늘 습격'),  desc: L('비행 적이 두 배로 나온다') },
    { id: 'elite', name: L('정예 행진'),  desc: L('정예 몬스터가 더 일찍, 더 많이') },
    { id: 'fast',  name: L('질주'),       desc: L('모든 적 이동 속도 +30%') },
    { id: 'poor',  name: L('금화 가뭄'),  desc: L('처치 금화 -30%, 시작 금화 +250') },
    { id: 'boss',  name: L('보스 러시'),  desc: L('5웨이브마다 보스가 나온다') },
];

// 시즌 리그 (PLAN_V3 A): 2주 시즌, 무한의 성벽 이번 시즌 최고 웨이브로 AI 경쟁자 29명과 순위를 겨룬다
const LEAGUE = {
    rivals: 29, days: 14,
    rewards: [
        { upTo: 1, name: L('1위'), reward: { gems: 400, tickets: 4, stones: 10 } },
        { upTo: 3, name: L('2~3위'), reward: { gems: 250, tickets: 3, stones: 6 } },
        { upTo: 10, name: L('4~10위'), reward: { gems: 150, tickets: 2 } },
        { upTo: 20, name: L('11~20위'), reward: { gems: 80, tickets: 1 } },
        { upTo: 30, name: L('21~30위'), reward: { gems: 40 } },
    ],
    names: [L('치즈냥'), L('고등어'), L('삼색이'), L('턱시도'), L('루나'), L('보리'), L('나비'), L('까미'), L('두부'), L('모카'), L('호랑'), L('콩이'), L('레오'), L('밤톨'), L('망고'),
        L('쿠키'), L('라떼'), L('도도'), L('누리'), L('하늘'), L('별이'), L('구름빵'), L('꼬맹'), L('대장냥'), L('솜사탕'), L('단추'), L('감자'), L('초코'), L('아롱')],
};

// 업적: stat(p) -> number, goal. 진행·별·영웅·강화·수집·무한·도전·토벌·도감·처치
function chapterBossIdx(ch) { return CH_START[ch] + CH_LEN[ch] - 1; }
const ACHIEVEMENTS = (() => {
    const A = [];
    const add = (id, group, name, goal, stat, reward) => A.push({ id, group, name, goal, stat, reward });
    for (let c = 0; c < CHAPTERS.length; c++) add('ch' + (c + 1), L('진행'), L('{0}장 {1} 정복', c + 1, CHAPTERS[c].name), 1, p => ((p.stars[chapterBossIdx(c)] || 0) > 0 ? 1 : 0), { gems: 50 + c * 40, tickets: c >= 3 ? 1 : 0 });
    [30, 60, 90, 126, 162].forEach((g, i) => add('star' + g, L('별'), L('별 {0}개', g), g, p => normalStars(p), { gems: 40 + i * 30 }));
    [30, 60, 90, 126, 162].forEach((g, i) => add('hstar' + g, L('별'), L('영웅 별 {0}개', g), g, p => hardStars(p), { gems: 80 + i * 40, stones: 3 + i * 2 }));
    [10, 20, 30, 40, 50, 60].forEach((g, i) => add('lv' + g, L('영웅'), L('영웅 레벨 {0}', g), g, p => Math.max(...Object.values(p.heroes).map(x => x.lv)), { gems: 30 + i * 20 }));
    [5, 10, 13, 15, 20].forEach((g, i) => add('enh' + g, L('강화'), L('장비 +{0} 달성', g), g, p => Math.max(0, ...p.items.map(it => it.enh)), { silver: 3000 * (i + 1), stones: i >= 1 ? 2 + i * 2 : 0 }));
    add('legend', L('수집'), L('전설 장비 얻기'), 1, p => (p.items.some(it => it.r >= 3) ? 1 : 0), { gems: 80 });
    add('mythic', L('수집'), L('신화 장비 얻기'), 1, p => (p.items.some(it => it.r >= 4) ? 1 : 0), { gems: 200 });
    [3, 6].forEach(g => add('skin' + g, L('수집'), L('냥이 옷 {0}벌', g), g, p => (p.shop ? p.shop.skins.length : 0), { gems: 60 * g / 3 }));
    [20, 30, 40, 60].forEach((g, i) => add('wall' + g, L('무한'), L('무한의 성벽 {0}웨이브', g), g, p => p.endlessBest, { gems: 40 + i * 30, tickets: i >= 2 ? 1 : 0 }));
    [10, 50, 150].forEach((g, i) => add('dg' + g, L('도전'), L('요일 도전 {0}번 승리', g), g, p => (p.stats ? p.stats.dungeon || 0 : 0), { stones: 3 + i * 3, gems: 30 + i * 30 }));
    [3, 6, 10].forEach((g, i) => add('raid' + g, L('토벌'), L('토벌전 {0}단계 달성', g), g, p => (p.stats ? p.stats.raidTier || 0 : 0), { gems: 50 + i * 50, tickets: 1 + i }));
    [30, 80, 150].forEach((g, i) => add('codex' + g, L('도감'), L('도감 점수 {0}', g), g, p => codexPoints(p), { gems: 50 + i * 50 }));
    add('league1', L('리그'), L('시즌 리그 1위'), 1, p => (p.stats ? p.stats.league1 || 0 : 0), { gems: 200, tickets: 3 });
    add('league3', L('리그'), L('시즌 리그 3위 이내 3번'), 3, p => (p.stats ? p.stats.league3 || 0 : 0), { gems: 300, stones: 8 });
    [10000, 50000].forEach((g, i) => add('kill' + g, L('처치'), L('적 {0}마리 처치', fmt(g)), g, p => (p.stats ? p.stats.kills || 0 : 0), { gems: 100 + i * 100, tickets: 2 }));
    return A;
})();

// 성장 패스 확장: 별 117~324 (보통 + 영웅 별), 9개마다 (2026-10-17: 3개마다였던 앞 단계가 너무 쉬워 전체를 9개 간격으로)
(function extendPass() {
    const free = [{ silver: 3000 }, { gems: 40 }, { stones: 2 }];
    const paid = [{ gems: 200 }, { tickets: 3 }, { item: 3 }, { stones: 5 }];
    const top = STAGES.length * 6, STEP = 9;
    for (let i = 0; STEP * (PASS_TIERS.length + 1) <= top; i++) {
        const s = STEP * (PASS_TIERS.length + 1);
        PASS_TIERS.push({ stars: s, free: free[i % 3], paid: s === top || s === 252 ? { item: 4 } : paid[i % 4] });
    }
})();

// 주간 공방전 (docs/PLAN_ONLINE_RELEASE.md 3): every player gets the same map, waves (seeded by the week) and restriction.
// The best score of the week goes to the server ranking; percentile rewards come from the server's reward inbox.
const CUP = {
    attempts: 3, maxWaves: 30, unlockStage: 7, silverPerWave: 40,
    maps: [['m2', 'forest'], ['m6', 'desert'], ['m8', 'ruin'], ['m10', 'swamp'], ['m12', 'void'], ['m13', 'sky'], ['m4', 'grass'], ['m9', 'volcano']],
    rules: [
        { name: L('대포탑 금지'), ban: 'cannon' }, { name: L('질주'), rule: 'fast' }, { name: L('궁수탑 금지'), ban: 'archer' },
        { name: L('하늘 습격'), rule: 'air' }, { name: L('병영 금지'), ban: 'barracks' }, { name: L('정예 행진'), rule: 'elite' },
        { name: L('마법탑 금지'), ban: 'mage' }, { name: L('금화 가뭄'), rule: 'poor' },
    ],
    // score: waves survived dominate, kills and lives left break ties, clearing all 30 waves is a big bonus
    score(r) { return r.wave * 1000 + r.kills * 5 + r.livesLeft * 100 + (r.cleared ? 5000 : 0); },
    // shown when offline (the server's game_config 'weekly.cup' is authoritative online)
    rewards: [[L('상위 1%'), { gems: 500, tickets: 5 }], ['5%', { gems: 300, tickets: 3 }], ['10%', { gems: 200, tickets: 2 }], ['25%', { gems: 120, tickets: 1 }], ['50%', { gems: 70 }], [L('참가'), { gems: 30 }]],
};

