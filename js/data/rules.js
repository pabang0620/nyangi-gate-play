'use strict';
// Core rules: rarity/drops/summon, towers, heroes & skills, research, items & enhance, lives, endless, offline (docs/DESIGN.md part 3).

const RARITY = [
    // mul: base stat multiplier, subs: number of extra options, subMul: extra option value multiplier
    // (2026-10-29: summon rates 영웅 5% / 전설 1% / 신화 0.05%, so the top grades are stronger to make up for it)
    { name: L('일반'), color: '#b8c0cc', mul: 1.00, subs: 0, subMul: 1.00 },
    { name: L('희귀'), color: '#5ec8ff', mul: 1.35, subs: 1, subMul: 1.20 },
    { name: L('영웅##등급'), color: '#b77bff', mul: 2.10, subs: 2, subMul: 1.45 },
    { name: L('전설'), color: '#ffc94a', mul: 3.00, subs: 3, subMul: 1.90 },
    { name: L('신화'), color: '#ff7a3d', mul: 8.00, subs: 5, subMul: 3.00 },
];
// per-kill gear roll (haru DESIGN 6.2 table), percent
const DROP = {
    chance: { normal: 0.012, elite: 0.30, boss: 1.0 },
    rolls: { normal: 1, elite: 1, boss: 2 },
    table: { normal: [65, 28, 6, 0.9, 0.1], elite: [40, 42, 15, 2.7, 0.3], boss: [0, 78, 17, 4.5, 0.5] },
};
// bonus10: a 10-pull actually draws 11 (the extra one is free) - shown as +1 on the button
const SUMMON = { cost1: 30, cost10: 270, bonus10: 1, table: [61, 32.95, 5, 1, 0.05], pity: 100, pityEpic: 20 };
// skin banner: grades 일반..전설 (RARITY 0..3), own pity; a skin you already own turns into gems (expected value
// ~14.5 gems per 30-gem pull, so duplicates soften bad luck without making the banner a gem source)
const SKIN_SUMMON = { cost1: 30, cost10: 270, bonus10: 1, table: [60, 30, 8, 1.98, 0.02], pity: 50, dupGems: [5, 15, 50, 150, 500] };   // 신화 0.02%: banner-only, two options
// 연속 소환: budget steps of one 10-pull; stop when a pull reaches this grade (null = never)
// bosses and elites that reach the gate lose the stage (js/battle/enemies.js), so they are a bit easier to bring down
const MUST_KILL = { bossHp: 0.8, eliteHp: 0.7, gateTime: 5, gateDps: 0.05, eliteGateDps: 0.12 };   // gateTime: seconds a boss/elite smashes the gate before the stage is lost; gateDps / eliteGateDps: share of max HP the gate guards deal per second to a boss / an elite
// gear bag size; past it the weakest spare gear is salvaged automatically (js/save.js bagOverflow)
const BAG_MAX = 600;
// 장비 합성: n of one grade -> one of the next grade at rate[r] %, else one of the same grade (js/save.js fuseOnce).
// Worse than summoning on purpose (net 2 legends per try at 10% vs a 0.3% mythic summon): it clears spare gear, not a shortcut.
const FUSE = { n: 3, rate: [80, 50, 25, 10] };
// 다음 스테이지 자동 진행 · 반복 (result screen): opens once this stage is cleared (index 3 = 1-4, the chapter 1 boss), counts down `wait` seconds
const AUTO_NEXT = { unlock: 3, wait: 5 };
const SUMMON_STOPS = [null, 3, 2];

// ---------------------------------------------------------------- towers
// lv 0..2 normal levels, specs[0|1] = level 4 branch
const TOWERS = {
    archer: {
        name: L('궁수탑'), desc: L('빠른 물리 공격. 공중 공격 가능.'), dmgType: 'phys', air: true,
        lv: [
            { cost: 70,  dmg: 8,  rate: 0.80, range: 150 },
            { cost: 110, dmg: 17, rate: 0.75, range: 165 },
            { cost: 160, dmg: 30, rate: 0.70, range: 180 },
        ],
        specs: [
            { id: 'sniper', name: L('저격수'), cost: 240, dmg: 85, rate: 1.6, range: 270, crit: 0.25, critMul: 2.5, desc: L('아주 먼 거리, 강한 한 발. 치명 25%.') },
            { id: 'rapid',  name: L('연사 궁수'), cost: 230, dmg: 22, rate: 0.42, range: 190, shots: 3, desc: L('한 번에 3명을 쏜다.') },
        ],
    },
    mage: {
        name: L('마법탑'), desc: L('마법 피해. 물리 방어 무시.'), dmgType: 'magic', air: true,
        lv: [
            { cost: 100, dmg: 22, rate: 1.5, range: 140 },
            { cost: 160, dmg: 46, rate: 1.5, range: 150 },
            { cost: 240, dmg: 80, rate: 1.4, range: 160 },
        ],
        specs: [
            { id: 'storm', name: L('번개 첨탑'), cost: 260, dmg: 95, rate: 1.6, range: 175, chain: 5, desc: L('번개가 5명까지 튄다.') },
            { id: 'frost', name: L('서리 첨탑'), cost: 240, dmg: 60, rate: 1.4, range: 170, splash: 70, slow: 0.5, slowT: 2, freezeEvery: 4, desc: L('범위 둔화 50%. 4번째마다 빙결.') },
        ],
    },
    cannon: {
        name: L('대포탑'), desc: L('범위 물리 피해. 지상만 공격.'), dmgType: 'phys', air: false,
        lv: [
            { cost: 120, dmg: 24, rate: 2.8, range: 150, splash: 55 },
            { cost: 180, dmg: 46, rate: 2.8, range: 160, splash: 60 },
            { cost: 260, dmg: 76, rate: 2.7, range: 170, splash: 66 },
        ],
        specs: [
            { id: 'mortar', name: L('공성 박격포'), cost: 330, dmg: 190, rate: 3.4, range: 250, splash: 95, desc: L('먼 곳에 거대한 폭발.') },
            { id: 'flame',  name: L('화염 포탑'), cost: 310, dmg: 36, rate: 1.5, range: 165, splash: 60, burn: 26, burnT: 3, desc: L('불바다를 남긴다. 초당 화상.') },
        ],
    },
    barracks: {
        name: L('병영'), desc: L('병사 3명이 길을 막는다.'), dmgType: 'phys', air: false,
        lv: [
            { cost: 70,  hp: 55,  atk: 4,  armor: 0,    count: 3, range: 150 },
            { cost: 110, hp: 95,  atk: 7,  armor: 0.15, count: 3, range: 155 },
            { cost: 160, hp: 155, atk: 11, armor: 0.3,  count: 3, range: 160 },
        ],
        specs: [
            { id: 'paladin', name: L('성기사'), cost: 240, hp: 300, atk: 17, armor: 0.5, count: 3, range: 165, regen: 0.04, desc: L('단단하고 스스로 치유.') },
            { id: 'berserk', name: L('광전사'), cost: 230, hp: 190, atk: 20, armor: 0.2, count: 3, range: 165, desc: L('공격력이 매우 높다.') },
        ],
        respawn: 10,
    },
};
const TOWER_ORDER = ['archer', 'mage', 'cannon', 'barracks'];
const SELL_RATIO = 0.6;

// ---------------------------------------------------------------- heroes
const HEROES = {
    knight: { name: L('기사'), desc: L('앞에서 막는 탱커 · 스킬로 적 기절'), hp: 470, atk: 32, rate: 0.9, range: 60, spd: 100, block: true, air: true, dmgType: 'phys' },
    mage:   { name: L('마법사'), desc: L('범위 마법 · 아군 회복 · 물리 방어 적에 강함'), hp: 270, atk: 30, rate: 1.1, range: 165, spd: 88, block: false, air: true, dmgType: 'magic' },
    ranger: { name: L('궁수'), desc: L('긴 사거리 · 기절·빙결 대상에게 피해 +100%'), hp: 310, atk: 17, rate: 0.6, range: 195, spd: 105, block: false, air: true, dmgType: 'phys' },
};
// 영웅 시너지: 기사·마법사가 기절·빙결시킨 적은 영웅 공격에 약해지고 궁수는 그 적에게 폭딜, 마법사는 아군을 회복
// (협동·냥이 총출동처럼 영웅이 둘 이상일 때 서로 맞물린다)
const SYNERGY = { exposed: 1.3, burst: 2.0, allyHeal: 0.03, allyStunEvery: 3, allyStun: 0.8 };
// the hero tab states these in words (SYNERGY_TEXT): keep the numbers in step with exposed (+30%) and burst (+100%)
// who to pick, in words that follow the numbers above (hp 470 / 270 / 310, range 60 / 165 / 195, only the knight blocks): [role, strengths, weakness]
const HERO_GUIDE = { knight: [L('탱커'), L('체력이 높고 길을 막아 줘요'), L('사거리가 짧아요')], mage: [L('마법 딜러'), L('범위 마법과 아군 회복'), L('체력이 낮고 길을 못 막아요')], ranger: [L('원거리 딜러'), L('가장 긴 사거리와 빠른 공격'), L('체력이 낮고 길을 못 막아요')] };
const SYNERGY_TEXT = { knight: L('기절시킨 적: 영웅 피해 +30%'), mage: L('빙결시킨 적: 영웅 피해 +30% · 아군 회복'), ranger: L('기절·빙결된 적: 피해 +100%') };
const HERO_GROWTH = 1.07;
const HERO_MAX_LV = 60;
const HERO_RESPAWN = 12;
const HERO_LEASH = 260;      // AUTO hero only chases enemies this close to its guard post, so towers matter
const SKILL_UNLOCK = [1, 2, 4, 7];
// coef x hero atk. target: 'point' needs a click (AUTO picks the best cluster), 'self' casts instantly
const SKILLS = {
    knight: [
        { id: 'dash',   name: L('돌진 베기'),   cd: 8,  target: 'point', coef: 3.0, range: 230, stun: 1, desc: L('지정 방향으로 돌진하며 경로의 적에게 300% 피해와 기절 1초. 돌진 중 무적.') },
        { id: 'quake',  name: L('대지 가르기'), cd: 12, target: 'self',  coef: 3.5, r: 95, stun: 1.5, desc: L('주변 적에게 350% 피해와 기절 1.5초.') },
        { id: 'oath',   name: L('수호의 맹세'), cd: 20, target: 'self',  dur: 6, reduce: 0.5, heal: 0.25, r: 130, desc: L('6초간 받는 피해 -50%, 체력 25% 회복, 주변 적 도발.') },
        { id: 'judge',  name: L('왕발 대심판'), cd: 45, target: 'point', coef: 9.0, r: 135, stun: 2, desc: L('빛의 대검 낙하. 범위 900% 피해, 기절 2초.') },
    ],
    mage: [
        { id: 'fireball', name: L('화염구'),   cd: 6,  target: 'point', coef: 3.0, r: 70, desc: L('폭발하는 화염구. 범위 300% 피해.') },
        { id: 'frost',    name: L('치유의 서리'), cd: 12, target: 'self',  coef: 2.0, r: 115, stun: 2, heal: 0.2, healR: 190, desc: L('주변 적 200% 피해와 빙결 2초, 가까운 아군 영웅·병사 체력 20% 회복.') },
        { id: 'chain',    name: L('연쇄 번개'), cd: 9,  target: 'self',  coef: 2.6, chain: 6, range: 220, desc: L('6명까지 튀는 번개 260% 피해.') },
        { id: 'meteor',   name: L('별똥별 냥냥'), cd: 45, target: 'point', coef: 10, r: 145, burn: 0.4, desc: L('거대한 유성. 범위 1000% 피해와 화상.') },
    ],
    ranger: [
        { id: 'pierce', name: L('관통 사격'), cd: 6,  target: 'point', coef: 3.2, len: 420, wid: 34, desc: L('일직선 관통 화살 320% 피해.') },
        { id: 'rain',   name: L('화살비'),   cd: 11, target: 'point', coef: 0.8, r: 100, ticks: 8, desc: L('2초간 화살비 8회, 회당 80% 피해.') },
        { id: 'gale',   name: L('질풍'),     cd: 16, target: 'self',  dur: 6, haste: 0.8, desc: L('6초간 공격 속도 +80%.') },
        { id: 'storm',  name: L('폭풍 냥화살'), cd: 40, target: 'point', coef: 10, len: 900, wid: 64, desc: L('전장을 가르는 화살 1000% 피해, 밀쳐냄.') },
    ],
};
const SPELLS = [
    { id: 'beacon', name: L('유성 냥펀치'), cd: 50, r: 100, desc: L('불타는 발바닥 유성을 떨어뜨려 범위 피해와 불바다.') },
    { id: 'militia', name: L('증원'), cd: 25, desc: L('민병 2명을 20초간 부른다.') },
    // 냥이 총출동: the two heroes not deployed join for a few seconds (battle cfg.party; the balance bot never passes it)
    { id: 'party', name: L('냥이 총출동'), cd: 60, r: 90, dur: 25, atkMul: 1.5, icon: 'rally', desc: L('쉬는 영웅 둘이 25초 동안 함께 싸워요.') },
];

// ---------------------------------------------------------------- research (stars)
const RESEARCH = [
    // 4~6번째 노드(v2)는 별이 많이 필요하다: 영웅 난이도 별까지 모아야 다 찍을 수 있다
    { col: L('궁수탑'), nodes: [
        { id: 'a1', cost: 1, name: L('매의 눈'), desc: L('궁수탑 사거리 +12%') },
        { id: 'a2', cost: 2, name: L('강철 화살촉'), desc: L('궁수탑 피해 +15%') },
        { id: 'a3', cost: 5, name: L('급소 사격'), desc: L('궁수탑 치명타 12% (250%)') },
        { id: 'a4', cost: 8, name: L('바람 깃'), desc: L('궁수탑 공격 속도 +15%') },
        { id: 'a5', cost: 12, name: L('정밀 사격'), desc: L('궁수탑 피해 +20%') },
        { id: 'a6', cost: 20, name: L('천공의 눈'), desc: L('궁수탑 사거리 +15%, 치명타 +8%') } ] },
    { col: L('마법탑'), nodes: [
        { id: 'm1', cost: 1, name: L('마력 증폭'), desc: L('마법탑 피해 +12%') },
        { id: 'm2', cost: 2, name: L('저항 붕괴'), desc: L('적 마법 저항 절반 무시') },
        { id: 'm3', cost: 5, name: L('시간 가속'), desc: L('마법탑 공격 속도 +15%') },
        { id: 'm4', cost: 8, name: L('마력 결정'), desc: L('마법탑 피해 +15%') },
        { id: 'm5', cost: 12, name: L('공명'), desc: L('마법탑 공격 속도 +15%') },
        { id: 'm6', cost: 20, name: L('대마법사의 탑'), desc: L('마법탑 피해 +25%') } ] },
    { col: L('대포탑'), nodes: [
        { id: 'c1', cost: 1, name: L('고폭 화약'), desc: L('대포탑 폭발 범위 +15%') },
        { id: 'c2', cost: 2, name: L('무거운 포탄'), desc: L('대포탑 피해 +15%') },
        { id: 'c3', cost: 5, name: L('충격파'), desc: L('대포 명중 시 15% 확률 기절 0.6초') },
        { id: 'c4', cost: 8, name: L('철갑탄'), desc: L('대포탑 피해 +15%') },
        { id: 'c5', cost: 12, name: L('대형 화약통'), desc: L('대포탑 폭발 범위 +15%') },
        { id: 'c6', cost: 20, name: L('공성 명장'), desc: L('대포탑 피해 +25%') } ] },
    { col: L('병영'), nodes: [
        { id: 'b1', cost: 1, name: L('두꺼운 갑옷'), desc: L('병사 체력 +25%') },
        { id: 'b2', cost: 2, name: L('날 선 창'), desc: L('병사 공격력 +25%') },
        { id: 'b3', cost: 5, name: L('정예 분대'), desc: L('병사 +1명, 부활 시간 -40%') },
        { id: 'b4', cost: 8, name: L('강철 방패'), desc: L('병사 체력 +30%') },
        { id: 'b5', cost: 12, name: L('전투 함성'), desc: L('병사 공격력 +30%') },
        { id: 'b6', cost: 20, name: L('불굴'), desc: L('병사 방어 +15%, 부활 시간 -30%') } ] },
    { col: L('전역'), nodes: [
        { id: 'w1', cost: 1, name: L('군자금'), desc: L('시작 금화 +60') },
        { id: 'w2', cost: 2, name: L('왕발 유성'), desc: L('냥펀치 피해 +30%, 대기 -25%') },
        { id: 'w3', cost: 5, name: L('굳건한 성문'), desc: L('목숨 +5, 건설 비용 -8%') },
        { id: 'w4', cost: 8, name: L('전쟁 자금'), desc: L('시작 금화 +100') },
        { id: 'w5', cost: 12, name: L('현상금'), desc: L('처치 금화 +10%') },
        { id: 'w6', cost: 20, name: L('봉화의 가호'), desc: L('모든 탑 피해 +10%, 목숨 +5') } ] },
];

// ---------------------------------------------------------------- items
const SLOTS = ['weapon', 'armor', 'charm'];
const SLOT_NAME = { weapon: L('무기'), armor: L('갑옷'), charm: L('부적') };
const ITEM_NAMES = {
    weapon: [L('낡은 발톱'), L('강철 발톱'), L('기사단 발톱'), L('황금 발톱'), L('태초의 발톱')],
    armor:  [L('가죽 갑옷'), L('사슬 갑옷'), L('기사단 판금'), L('황금 발바닥 갑주'), L('태초의 갑주')],
    charm:  [L('나무 부적'), L('은 부적'), L('수호 부적'), L('수호냥 인장'), L('태초의 인장')],
};
// 영웅·전설·신화 gear has 4 pictures per slot (img/it_{slot}_{r}_{art}.png); the name follows the picture.
// art 0 keeps the ITEM_NAMES name above
const ITEM_ART_NAMES = {
    weapon: [null, null,
        [L('기사단 발톱'), L('기사단 발톱'), L('기사단 발톱'), L('기사단 발톱')],
        [L('황금 발톱'), L('황금 발톱'), L('황금 발톱'), L('황금 발톱')],
        [L('태초의 발톱'), L('태초의 발톱'), L('태초의 발톱'), L('태초의 발톱')]],
    armor: [null, null,
        [L('기사단 판금'), L('기사단 로브'), L('기사단 망토'), L('기사단 흉갑')],
        [L('황금 발바닥 갑주'), L('황금 발바닥 로브'), L('황금 발바닥 망토'), L('황금 발바닥 흉갑')],
        [L('태초의 갑주'), L('태초의 로브'), L('태초의 망토'), L('태초의 흉갑')]],
    charm: [null, null,
        [L('수호 방울'), L('수호 방울'), L('수호 방울'), L('수호 방울')],
        [L('수호냥 방울'), L('수호냥 방울'), L('수호냥 방울'), L('수호냥 방울')],
        [L('태초의 방울'), L('태초의 방울'), L('태초의 방울'), L('태초의 방울')]],
};
const SUB_OPTS = {
    heroAtkPct: { name: L('영웅 공격력'), min: 0.04, max: 0.08, pct: true },
    heroHpPct:  { name: L('영웅 체력'),   min: 0.05, max: 0.10, pct: true },
    archerDmg:  { name: L('궁수탑 피해'), min: 0.05, max: 0.10, pct: true },
    mageDmg:    { name: L('마법탑 피해'), min: 0.05, max: 0.10, pct: true },
    cannonDmg:  { name: L('대포탑 피해'), min: 0.05, max: 0.10, pct: true },
    soldierHp:  { name: L('병사 체력'),   min: 0.08, max: 0.15, pct: true },
    skillCdr:   { name: L('스킬 대기 감소'), min: 0.03, max: 0.06, pct: true },
    startGold:  { name: L('시작 금화'),   min: 10, max: 25, pct: false },
    bountyPct:  { name: L('처치 금화'),   min: 0.03, max: 0.06, pct: true },
    critRate:   { name: L('영웅 치명타'), min: 0.03, max: 0.06, pct: true },
};
// +11~+20은 은화 + 강화석(요일 도전 화·금). +10부터 실패하면 1단계 하락, 실패 중 일부는 파괴(2026-10-17 사용자 결정)
// +15~+20 (2026-10-17 사용자 요청 "20강까지, 확률은 극악"): 하락·파괴방지권 없이는 사실상 불가(기대 2만 회 이상),
// 방지권을 쓰면 약 57회 시도 + 하락방지권 50여 장 + 파괴방지권 15장 안팎
// destroy[i]: chance that a FAILED try at +(destroyFrom + i) destroys the item (so the real destroy chance is (1 - rate) * destroy)
const ENHANCE = { max: 20, rate: [1, 0.95, 0.9, 0.85, 0.75, 0.65, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.28, 0.25, 0.22, 0.18, 0.14, 0.1, 0.07, 0.05], dropFrom: 10, perLv: 0.12, stoneFrom: 10, destroyFrom: 10, destroy: [0.1, 0.1, 0.15, 0.15, 0.2, 0.25, 0.3, 0.3, 0.35, 0.4] };
function destroyPct(enh) { return +(destroyChance(enh) * 100).toFixed(2) + '%'; }   // 6.5% / 7% / 10.8% / 11.25% / 15.6% / 20.5% / 25.8% / 27% / 32.55% / 38% (exact, same as docs/site-probability.md)
function destroyChance(enh) { return enh >= ENHANCE.destroyFrom ? (1 - ENHANCE.rate[enh]) * (ENHANCE.destroy[enh - ENHANCE.destroyFrom] || 0) : 0; }   // 2026-10-16: +13 and up were unreachable (expected 46,000 tries / 3.8억 silver to +15); now about 900 tries / 1,640만 silver / 770 stones
// 하락방지권 (gems, shop): a failed try at +10 or more keeps its level; used up only when it actually saves a drop.
// One saved drop is worth about 1/rate tries again at that level (3~4 tries = ~10만 silver + stones at +12), so 50 gems each, 450 for 10.
// 파괴방지권 (p.mats.shield): a destroying failure becomes a normal failure; used only when it actually saves the item.
// Losing a +12 item costs the whole climb again (hundreds of thousands of silver + stones), so twice the 하락방지권.
const GUARD_SHOP = [{ n: 1, gems: 50 }, { n: 10, gems: 450 }];
const SHIELD_SHOP = [{ n: 1, gems: 100 }, { n: 10, gems: 900 }];
function enhanceStones(enh) { return enh >= ENHANCE.stoneFrom ? 1 + (enh - ENHANCE.stoneFrom) : 0; }

const LIVES = 20;
const WAVE_GAP = 15;          // seconds between waves
const EARLY_GOLD_PER_SEC = 2.5;

const ENDLESS = {
    map: 'm4', startGold: 420, unlockStage: 3, gemsPer10: 25, silverPerWave: 30,
    // 주간 구간 보상: 매주 월요일 05:00에 초기화, 그 주 한 판에서 도달한 웨이브 기준으로 한 번씩 지급
    weekly: [
        { wave: 5, reward: { silver: 500 } },
        { wave: 10, reward: { gems: 30 } },
        { wave: 15, reward: { silver: 1500, tickets: 1 } },
        { wave: 20, reward: { gems: 50 } },
        { wave: 25, reward: { tickets: 2 } },
        { wave: 30, reward: { gems: 80 } },
        { wave: 40, reward: { gems: 120, tickets: 2 } },
    ],
};
const OFFLINE = { capH: 12, minMin: 5, basePerH: 40, perStage: 28 };
// Lv30까지 기존 곡선, 이후 완만하게 (Lv60 확장)
function heroXpNeed(lv) { return Math.round(lv <= 30 ? 60 * Math.pow(1.15, lv - 1) : 60 * Math.pow(1.15, 29) * Math.pow(1.08, lv - 30)); }
