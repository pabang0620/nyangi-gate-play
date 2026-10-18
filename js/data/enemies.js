'use strict';
// Enemies and boss skills. A new enemy needs an e_<kind> image (art/prompts.json); bosses also need a BOSS_SKILL entry per skill.

// ---------------------------------------------------------------- enemies
// spd px/s, armor = physical reduction, mres = magic reduction, cost = wave budget points
const ENEMIES = {
    slime:    { name: L('젤리 슬라임'), hp: 42,  spd: 36, armor: 0,   mres: 0,   gold: 4,  lives: 1, atk: 4,  cost: 1.0, size: 15 },
    goblin:   { name: L('고블린'),      hp: 75,  spd: 46, armor: 0,   mres: 0,   gold: 6,  lives: 1, atk: 6,  cost: 1.6, size: 16 },
    wolf:     { name: L('그림자 늑대'), hp: 62,  spd: 82, armor: 0,   mres: 0,   gold: 7,  lives: 1, atk: 5,  cost: 1.7, size: 16, tag: L('빠름') },
    orc:      { name: L('오크 방패병'), hp: 230, spd: 30, armor: 0.5, mres: 0,   gold: 14, lives: 1, atk: 12, cost: 4.5, size: 20, tag: L('물리 방어') },
    bat:      { name: L('흡혈 박쥐'),   hp: 58,  spd: 62, armor: 0,   mres: 0,   gold: 8,  lives: 1, atk: 0,  cost: 1.7, size: 15, fly: true, tag: L('비행') },
    shaman:   { name: L('고블린 주술사'), hp: 130, spd: 36, armor: 0, mres: 0.5, gold: 14, lives: 1, atk: 5,  cost: 4, size: 17, heal: 18, tag: L('마법 저항·치유') },
    skeleton: { name: L('해골 병사'),   hp: 95,  spd: 40, armor: 0.15, mres: 0,  gold: 8,  lives: 1, atk: 8,  cost: 2.1, size: 17, revive: true, tag: L('부활') },
    imp:      { name: L('화염 임프'),   hp: 115, spd: 56, armor: 0,   mres: 0.4, gold: 12, lives: 1, atk: 0,  cost: 2.7, size: 15, fly: true, tag: L('비행·마법 저항') },
    golem:    { name: L('바위 골렘'),   hp: 760, spd: 22, armor: 0.3, mres: 0.3, gold: 40, lives: 2, atk: 22, cost: 13,  size: 26, elite: true, tag: L('정예') },
    cursed:   { name: L('저주받은 갑옷'), hp: 950, spd: 25, armor: 0.7, mres: 0.1, gold: 46, lives: 2, atk: 26, cost: 16, size: 24, elite: true, tag: L('정예·물리 방어') },
    // ---- chapters 4~8 (docs/PLAN_V2_EXPANSION.md 1.1)
    frostwolf: { name: L('서리 늑대'),   hp: 120, spd: 84, armor: 0.1, mres: 0.2, gold: 9,  lives: 1, atk: 9,  cost: 2.4, size: 16, tag: L('빠름') },
    icewisp:  { name: L('얼음 정령'),   hp: 130, spd: 56, armor: 0,   mres: 0.5, gold: 12, lives: 1, atk: 0,  cost: 2.8, size: 15, fly: true, deathFreeze: { r: 95, t: 1.6 }, tag: L('비행·죽을 때 탑 빙결') },
    yeti:     { name: L('설인'),        hp: 950, spd: 24, armor: 0.2, mres: 0.25, gold: 44, lives: 2, atk: 30, cost: 14, size: 26, elite: true, cleave: 40, tag: L('정예·범위 공격') },
    scorpion: { name: L('모래 전갈'),   hp: 270, spd: 40, armor: 0.4, mres: 0,  gold: 16, lives: 1, atk: 14, cost: 5,  size: 19, burrow: { every: 5, dur: 1.6 }, tag: L('물리 방어·잠행') },
    beetle:   { name: L('갑옷 풍뎅이'), hp: 430, spd: 30, armor: 0.5, mres: 0.3, gold: 18, lives: 1, atk: 12, cost: 6.5, size: 20, split: { kind: 'beetlet', n: 2 }, tag: L('단단함·분열') },
    beetlet:  { name: L('새끼 풍뎅이'), hp: 110, spd: 50, armor: 0.3, mres: 0,   gold: 3,  lives: 1, atk: 5,  cost: 1.5, size: 13 },
    toad:     { name: L('독두꺼비'),    hp: 310, spd: 34, armor: 0.1, mres: 0.2, gold: 14, lives: 1, atk: 10, cost: 4.5, size: 19, poison: { r: 62, dps: 14, t: 4 }, tag: L('죽으면 독 웅덩이') },
    swampwitch: { name: L('늪 마녀'),   hp: 250, spd: 32, armor: 0,   mres: 0.6, gold: 20, lives: 1, atk: 6,  cost: 6,  size: 18, shield: { r: 115, amt: 0.25, cd: 5 }, tag: L('마법 저항·보호막') },
    harpy:    { name: L('하피'),        hp: 150, spd: 76, armor: 0.1, mres: 0.1, gold: 10, lives: 1, atk: 0,  cost: 2.6, size: 16, fly: true, tag: L('비행·빠름') },
    salamander: { name: L('불도롱뇽'),  hp: 290, spd: 70, armor: 0.1, mres: 0.6, gold: 15, lives: 1, atk: 12, cost: 5,  size: 17, fireImmune: true, tag: L('빠름·마법 저항·화상 면역') },
    lavagolem: { name: L('용암 골렘'),  hp: 1650, spd: 20, armor: 0.4, mres: 0.2, gold: 60, lives: 2, atk: 40, cost: 20, size: 28, elite: true, fireImmune: true, split: { kind: 'ember', n: 3 }, tag: L('정예·분열') },
    ember:    { name: L('불씨 정령'),   hp: 140, spd: 60, armor: 0,   mres: 0.3, gold: 4,  lives: 1, atk: 6,  cost: 1.8, size: 13, fireImmune: true },
    shadow:   { name: L('그림자 냥'),   hp: 350, spd: 52, armor: 0.2, mres: 0.2, gold: 18, lives: 1, atk: 14, cost: 5.5, size: 17, stealth: { on: 2, off: 2.6, dmgMul: 0.45 }, tag: L('은신(피해 -55%)') },
    voidknight: { name: L('공허 기사'), hp: 2000, spd: 24, armor: 0.5, mres: 0.4, gold: 70, lives: 2, atk: 50, cost: 24, size: 27, elite: true, blink: { every: 6, dist: 90 }, tag: L('정예·순간이동') },
    // ---- v3: chapters 9~10 (docs/PLAN_V3.md B)
    windsprite: { name: L('바람 정령'), hp: 150, spd: 64, armor: 0,  mres: 0.3, gold: 11, lives: 1, atk: 0,  cost: 3.4, size: 15, fly: true, haste: { r: 100, every: 4, dur: 2 }, tag: L('비행·주변 지상 적 가속') },
    cloudthief: { name: L('구름 도적'), hp: 420, spd: 58, armor: 0.2, mres: 0.1, gold: 18, lives: 1, atk: 14, cost: 5.5, size: 17, dodge: 0.35, tag: L('화살·포탄 35% 회피') },
    griffin:  { name: L('그리폰'),      hp: 1450, spd: 44, armor: 0.3, mres: 0.3, gold: 65, lives: 2, atk: 0,  cost: 22,  size: 26, fly: true, elite: true, tag: L('정예·비행') },
    clocksoldier: { name: L('태엽 병사'), hp: 720, spd: 34, armor: 0.55, mres: 0.1, gold: 20, lives: 1, atk: 18, cost: 6.5, size: 19, rewind: 0.6, tag: L('물리 방어·한 번 되감기') },
    chronomage: { name: L('시간 술사'), hp: 360, spd: 36, armor: 0,  mres: 0.55, gold: 22, lives: 1, atk: 6,  cost: 6.5, size: 18, timewarp: { r: 130, slow: 0.45 }, tag: L('주변 탑 공격 속도 -45%') },
    gearbeast: { name: L('톱니 야수'),  hp: 3300, spd: 22, armor: 0.5, mres: 0.3, gold: 75, lives: 2, atk: 55, cost: 26,  size: 28, elite: true, split: { kind: 'cog', n: 3 }, tag: L('정예·분열') },
    cog:      { name: L('톱니'),        hp: 230, spd: 58, armor: 0.4, mres: 0,   gold: 4,  lives: 1, atk: 8,  cost: 2,   size: 13 },
    // bosses
    ironfang: { name: L('강철엄니'), title: L('평원의 폭군'), hp: 3000,  spd: 26, armor: 0.3, mres: 0.1, gold: 300, lives: 6, atk: 40, cost: 0, size: 40, boss: true,
                skills: ['charge', 'stomp', 'summonWolf'] },
    grak:     { name: L('그락'), title: L('고블린 대족장'), hp: 5400,  spd: 24, armor: 0.4, mres: 0.2, gold: 450, lives: 8, atk: 55, cost: 0, size: 42, boss: true,
                skills: ['warcry', 'slam', 'summonGoblin'] },
    vargas:   { name: L('바르가스'), title: L('심연룡'), hp: 10000, spd: 22, armor: 0.35, mres: 0.35, gold: 700, lives: 12, atk: 80, cost: 0, size: 52, boss: true,
                skills: ['breath', 'meteor', 'summonImp'] },
    frosna:   { name: L('프로스나'), title: L('빙결 여왕'), hp: 11000, spd: 22, armor: 0.3, mres: 0.4, gold: 900, lives: 12, atk: 90, cost: 0, size: 46, boss: true, phases: [0.5],
                skills: ['frostField', 'blizzard', 'summonWisp'] },
    setka:    { name: L('세트카'), title: L('사막왕'), hp: 13000, spd: 22, armor: 0.5, mres: 0.2, gold: 1100, lives: 14, atk: 110, cost: 0, size: 48, boss: true, phases: [0.5],
                skills: ['sandstorm', 'burrowBoss', 'summonScorp'] },
    morga:    { name: L('모르가'), title: L('늪의 마녀'), hp: 14500, spd: 20, armor: 0.2, mres: 0.6, gold: 1300, lives: 15, atk: 120, cost: 0, size: 46, boss: true, phases: [0.6, 0.3],
                skills: ['curseField', 'shieldAll', 'summonToad'] },
    ignis:    { name: L('이그니스'), title: L('화염 거인'), hp: 17000, spd: 18, armor: 0.45, mres: 0.35, gold: 1600, lives: 18, atk: 150, cost: 0, size: 54, boss: true, phases: [0.6, 0.3],
                skills: ['lavaWave', 'meteor', 'summonSala'] },
    nox:      { name: L('녹스'), title: L('공허의 왕'), hp: 11000, spd: 20, armor: 0.45, mres: 0.45, gold: 2200, lives: 20, atk: 180, cost: 0, size: 54, boss: true, phases: [0.7, 0.4],
                skills: ['blink', 'darkness', 'summonShadow', 'summonVoid', 'breath'] },
    aeris:    { name: L('아에리스'), title: L('폭풍의 로크'), hp: 9000, spd: 24, armor: 0.3, mres: 0.4, gold: 2600, lives: 20, atk: 190, cost: 0, size: 54, boss: true, phases: [0.6, 0.3],
                skills: ['tornado', 'lightning', 'summonSprite', 'summonGriffin'] },
    chronos:  { name: L('크로노스'), title: L('시간의 지배자'), hp: 9000, spd: 20, armor: 0.45, mres: 0.45, gold: 3000, lives: 20, atk: 210, cost: 0, size: 56, boss: true, phases: [0.7, 0.4],
                skills: ['timeStop', 'rewindBoss', 'summonClock', 'meteor'] },
};
ENEMIES.ironfang.phases = [0.5]; ENEMIES.grak.phases = [0.5]; ENEMIES.vargas.phases = [0.6, 0.3];
// tip: [what the enemy does, how to answer it] (battle first-sighting card, wave preview, defeat screen, map info, 도감)
// shown as two aligned lines 특징 / 대처 by UI.foeTip; .tip keeps the joined text
{
    const fast = [L('순식간에 지나가는 빠른 적'), L('병영으로 붙잡기 · 서리 첨탑 둔화')];
    const TIPS = {
        slime: [L('가장 약한 기본 적'), L('어떤 탑으로도 쉽게 처치')],
        goblin: [L('기본 보병'), L('병영으로 막고 궁수탑으로 처치')],
        wolf: fast, frostwolf: fast,
        orc: [L('화살·포탄·병사 피해 50% 감소'), L('마법탑')],
        bat: [L('비행 · 대포탑과 병영이 못 막음'), L('궁수탑 · 마법탑')],
        shaman: [L('3초마다 주변 적 치유 · 마법 피해 50% 감소'), L('궁수탑 · 대포탑으로 먼저 처치')],
        skeleton: [L('쓰러지면 체력 절반으로 한 번 부활'), L('화력을 모아 두 번 처치')],
        imp: [L('비행 · 마법 피해 40% 감소'), L('궁수탑')],
        golem: [L('정예 · 체력이 아주 높음'), L('병영으로 붙잡고 강화한 탑을 모으기')],
        cursed: [L('정예 · 화살·포탄 피해 70% 감소'), L('마법탑 필수')],
        icewisp: [L('비행 · 쓰러진 자리 주변 탑을 1.6초 얼림'), L('궁수탑을 여러 곳에 나눠 짓기')],
        yeti: [L('정예 · 막는 병사와 영웅 주변을 함께 공격'), L('병영 강화 · 원거리 탑')],
        scorpion: [L('물리 피해 40% 감소 · 땅속에 숨어 병사를 지나침'), L('마법탑을 길 따라 넓게')],
        beetle: [L('물리 피해 50% 감소 · 쓰러지면 새끼 2마리'), L('마법탑 · 새끼는 대포탑')],
        beetlet: [L('갑옷 풍뎅이가 쓰러지면 나옴'), L('대포탑 범위 공격')],
        toad: [L('쓰러진 자리에 4초 동안 독 웅덩이'), L('원거리 탑 · 영웅은 웅덩이 피하기')],
        swampwitch: [L('마법 피해 60% 감소 · 5초마다 주변 적에 보호막'), L('궁수탑 · 대포탑으로 마녀 먼저')],
        harpy: [L('비행 · 빠름'), L('궁수탑 여러 개')],
        salamander: [L('빠름 · 마법 피해 60% 감소 · 화상 면역'), L('병영으로 붙잡고 궁수탑 · 대포탑 (화상은 안 통함)')],
        lavagolem: [L('정예 · 화상 면역 · 쓰러지면 불씨 정령 3마리'), L('마법탑 · 불씨는 대포탑')],
        ember: [L('용암 골렘이 쓰러지면 나옴 · 화상 면역'), L('대포탑 · 궁수탑')],
        shadow: [L('가끔 모습을 감춰 받는 피해 55% 감소'), L('모습이 보일 때 스킬 · 주문')],
        voidknight: [L('정예 · 6초마다 앞으로 순간이동 · 물리 피해 50% 감소'), L('성문 가까이에도 마법탑')],
        windsprite: [L('비행 · 4초마다 주변 지상 적을 빠르게'), L('궁수탑으로 먼저 처치')],
        cloudthief: [L('화살·포탄을 35% 회피'), L('마법탑 · 병영 · 영웅')],
        griffin: [L('정예 · 비행'), L('강화한 궁수탑 · 마법탑을 모으기')],
        clocksoldier: [L('물리 피해 55% 감소 · 체력 30% 아래에서 한 번 60%로 회복'), L('마법탑 집중')],
        chronomage: [L('주변 탑 공격 속도 45% 감소 · 마법 피해 55% 감소'), L('사거리 긴 궁수탑 · 영웅 · 주문으로 먼저')],
        gearbeast: [L('정예 · 물리 피해 50% 감소 · 쓰러지면 톱니 3개'), L('마법탑 · 톱니는 대포탑')],
        cog: [L('톱니 야수가 쓰러지면 나옴 · 물리 피해 40% 감소'), L('마법탑 · 대포탑')],
    };
    const BOSS_TIP = [L('보스 · 빨간 경고 범위로 공격'), L('경고가 보이면 영웅을 옮겨 피하기')];
    for (const k in ENEMIES) {
        const t = TIPS[k] || (ENEMIES[k].boss ? BOSS_TIP : null);
        ENEMIES[k].tipT = t ? t[0] : ''; ENEMIES[k].tipC = t ? t[1] : '';
        ENEMIES[k].tip = t ? t[0] + ' → ' + t[1] : '';
    }
}
const BOSS_SKILL = {
    charge:       { cd: 9,  warn: 1.0, name: L('돌진') },
    stomp:        { cd: 11, warn: 1.1, r: 120, stun: 4, name: L('발구르기') },
    summonWolf:   { cd: 16, warn: 0.6, kind: 'wolf', n: 3, hpBelow: 0.6, name: L('늑대 소환') },
    warcry:       { cd: 14, warn: 0.7, r: 170, name: L('함성') },
    slam:         { cd: 8,  warn: 1.2, r: 85, stun: 5, name: L('내려찍기') },
    summonGoblin: { cd: 13, warn: 0.6, kind: 'goblin', n: 4, name: L('부하 소환') },
    breath:       { cd: 10, warn: 1.3, len: 300, wid: 90, stun: 5, name: L('심연의 숨결') },
    meteor:       { cd: 12, warn: 1.2, r: 80, n: 3, stun: 4, hpBelow: 0.6, name: L('유성') },
    summonImp:    { cd: 14, warn: 0.6, kind: 'imp', n: 4, name: L('임프 소환') },
    // v2
    frostField:   { cd: 10, warn: 1.1, r: 110, stun: 4, name: L('얼음 장판'), color: '#a0f0ff' },
    blizzard:     { cd: 16, warn: 1.0, dur: 6, chill: 0.5, name: L('눈보라') },
    summonWisp:   { cd: 14, warn: 0.6, kind: 'icewisp', n: 3, name: L('정령 소환') },
    sandstorm:    { cd: 15, warn: 1.0, dur: 6, blind: 0.65, name: L('모래폭풍') },
    burrowBoss:   { cd: 15, warn: 0.6, dist: 90, invuln: 1.4, name: L('잠행') },
    summonScorp:  { cd: 13, warn: 0.6, kind: 'scorpion', n: 3, name: L('전갈 소환') },
    curseField:   { cd: 11, warn: 1.0, r: 120, dps: 0.5, dur: 5, name: L('저주 장판') },
    shieldAll:    { cd: 16, warn: 0.8, amt: 0.2, name: L('늪의 장막') },
    summonToad:   { cd: 13, warn: 0.6, kind: 'toad', n: 3, name: L('두꺼비 소환') },
    lavaWave:     { cd: 10, warn: 1.2, len: 420, wid: 80, stun: 4, name: L('용암 파도'), color: '#ff7020' },
    summonSala:   { cd: 13, warn: 0.6, kind: 'salamander', n: 4, name: L('도롱뇽 소환') },
    blink:        { cd: 13, warn: 0.6, dist: 100, invuln: 0.8, name: L('공허 도약') },
    darkness:     { cd: 13, warn: 1.2, r: 70, n: 4, stun: 5, name: L('암흑') },
    summonShadow: { cd: 12, warn: 0.6, kind: 'shadow', n: 3, name: L('그림자 소환') },
    summonVoid:   { cd: 22, warn: 0.8, kind: 'voidknight', n: 1, hpBelow: 0.5, name: L('공허 기사 소환') },
    // v3
    tornado:      { cd: 11, warn: 1.1, len: 380, wid: 100, stun: 3, name: L('회오리'), color: '#bfefff' },
    lightning:    { cd: 12, warn: 1.0, r: 65, n: 5, stun: 4, name: L('낙뢰') },
    summonSprite: { cd: 12, warn: 0.6, kind: 'windsprite', n: 3, name: L('정령 소환') },
    summonGriffin: { cd: 26, warn: 0.8, kind: 'griffin', n: 1, hpBelow: 0.5, name: L('그리폰 소환') },
    timeStop:     { cd: 20, warn: 1.4, dur: 2, name: L('시간 정지') },
    rewindBoss:   { cd: 22, warn: 1.0, heal: 0.06, hpBelow: 0.8, name: L('되감기') },
    summonClock:  { cd: 15, warn: 0.6, kind: 'clocksoldier', n: 2, name: L('태엽 병사 소환') },
};
