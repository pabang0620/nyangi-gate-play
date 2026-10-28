'use strict';
// Campaign: maps, chapters, stages, difficulty curve, stage rewards, 영웅 난이도 and its 3★ conditions. See docs/ARCHITECTURE.md "새 장 추가".

// ---------------------------------------------------------------- maps & stages
// Paths run from the spawn edge to the gate (last point). Build spots are generated from them.
const MAPS = {
    m1: { paths: [[[-30,125], [202,125], [260,183], [260,452], [318,510], [462,510], [520,452], [520,183], [578,125], [722,125], [780,183], [780,452], [838,510], [952,510], [1010,452], [1010,418], [1068,360], [1250,360]]], spdMul: 1.3 },
    m2: { paths: [
        [[-30,125], [272,125], [330,183], [330,282], [388,340], [502,340], [618,340], [702,340], [760,282], [760,208], [818,150], [842,150], [900,208], [900,442], [958,500], [982,500], [1040,442], [1040,258], [1095,200], [1105,200], [1160,258], [1160,302], [1201,360], [1250,360]],
        [[-30,510], [272,510], [330,452], [330,398], [388,340], [502,340], [618,340], [702,340], [760,282], [760,208], [818,150], [842,150], [900,208], [900,442], [958,500], [982,500], [1040,442], [1040,258], [1095,200], [1105,200], [1160,258], [1160,302], [1201,360], [1250,360]],
    ], spdMul: 1.3 },
    m3: { paths: [[[180, -30], [180, 250], [240, 300], [480, 300], [540, 350], [540, 500], [600, 550], [860, 550], [920, 500], [920, 220], [980, 150], [1100, 150], [1150, 210], [1160, 360], [1250, 380]]] },
    // v2 maps (chapters 4~8)
    m5: { paths: [[[-30,125], [192,125], [250,183], [250,442], [308,500], [412,500], [470,442], [470,183], [528,125], [632,125], [690,183], [690,442], [748,500], [842,500], [900,442], [900,288], [958,230], [1022,230], [1080,288], [1080,412], [1138,470], [1250,470]]], spdMul: 1.35 },
    m6: { paths: [
        [[-30,110], [242,110], [300,151], [300,159], [345,237], [375,263], [465,300], [475,300], [578,300], [642,300], [700,242], [700,198], [758,140], [802,140], [860,198], [860,442], [918,500], [962,500], [1020,442], [1020,268], [1078,210], [1102,210], [1160,268], [1160,382], [1201,440], [1250,440]],
        [[-30,300], [462,300], [578,300], [642,300], [700,242], [700,198], [758,140], [802,140], [860,198], [860,442], [918,500], [962,500], [1020,442], [1020,268], [1078,210], [1102,210], [1160,268], [1160,382], [1201,440], [1250,440]],
        [[-30,500], [242,500], [300,455], [300,445], [345,363], [375,337], [465,300], [475,300], [578,300], [642,300], [700,242], [700,198], [758,140], [802,140], [860,198], [860,442], [918,500], [962,500], [1020,442], [1020,268], [1078,210], [1102,210], [1160,268], [1160,382], [1201,440], [1250,440]],
    ], spdMul: 1.35 },
    m7: { paths: [[[-30, 450], [200, 450], [260, 390], [260, 180], [320, 120], [520, 120], [580, 180], [580, 450], [640, 500], [840, 500], [900, 440], [900, 180], [960, 130], [1150, 130], [1200, 190], [1210, 330], [1250, 360]]] },
    m8: { paths: [
        [[-30,125], [202,125], [260,183], [260,242], [318,300], [422,300], [480,242], [480,183], [538,125], [642,125], [700,183], [700,242], [758,300], [862,300], [920,242], [920,218], [978,160], [1042,160], [1100,218], [1100,302], [1158,360], [1250,360]],
        [[-30,530], [202,530], [260,472], [260,433], [318,375], [422,375], [480,433], [480,472], [538,530], [642,530], [700,472], [700,433], [758,375], [862,375], [920,433], [920,452], [978,510], [1042,510], [1100,452], [1100,418], [1158,360], [1250,360]],
    ], spdMul: 1.25 },
    m9: { paths: [[[-30, 200], [700, 200], [770, 260], [770, 330], [700, 390], [300, 390], [240, 440], [260, 500], [330, 520], [1000, 520], [1070, 460], [1080, 330], [1250, 300]]] },
    m10: { paths: [
        [[-30,125], [442,125], [534,172], [616,283], [708,330], [742,330], [800,272], [800,208], [858,150], [882,150], [940,208], [940,442], [995,500], [1005,500], [1060,442], [1060,298], [1105,240], [1115,240], [1160,290], [1160,300], [1201,350], [1250,350]],
        [[-30,330], [592,330], [708,330], [742,330], [800,272], [800,208], [858,150], [882,150], [940,208], [940,442], [995,500], [1005,500], [1060,442], [1060,298], [1105,240], [1115,240], [1160,290], [1160,300], [1201,350], [1250,350]],
        [[-30,520], [442,520], [536,474], [614,376], [708,330], [742,330], [800,272], [800,208], [858,150], [882,150], [940,208], [940,442], [995,500], [1005,500], [1060,442], [1060,298], [1105,240], [1115,240], [1160,290], [1160,300], [1201,350], [1250,350]],
    ], spdMul: 1.3 },
    m11: { paths: [[[-30,480], [172,480], [230,422], [230,208], [288,150], [382,150], [440,208], [440,442], [498,500], [592,500], [650,442], [650,208], [708,150], [802,150], [860,208], [860,362], [918,420], [982,420], [1040,362], [1040,188], [1098,130], [1250,130]]], spdMul: 1.3 },
    m12: { paths: [
        [[-30, 110], [900, 110], [960, 170], [960, 260], [900, 310], [400, 310], [340, 360], [340, 450], [400, 500], [1100, 500], [1170, 440], [1180, 360], [1250, 330]],
        [[-30, 420], [270, 420], [340, 450], [400, 500], [1100, 500], [1170, 440], [1180, 360], [1250, 330]],
    ] },
    // v3 maps (chapters 9~10)
    m13: { paths: [
        [[-30,560], [242,560], [300,502], [300,458], [358,400], [422,400], [538,400], [622,400], [680,342], [680,218], [738,160], [802,160], [860,218], [860,442], [918,500], [952,500], [1010,442], [1010,288], [1060,230], [1070,230], [1120,288], [1120,382], [1147,440], [1153,440], [1180,413], [1180,407], [1212,380], [1250,380]],
        [[-30,120], [272,120], [330,178], [330,342], [388,400], [422,400], [538,400], [622,400], [680,342], [680,218], [738,160], [802,160], [860,218], [860,442], [918,500], [952,500], [1010,442], [1010,288], [1060,230], [1070,230], [1120,288], [1120,382], [1147,440], [1153,440], [1180,413], [1180,407], [1212,380], [1250,380]],
    ], spdMul: 1.25 },
    m14: { paths: [[[-30, 300], [140, 300], [190, 130], [1050, 130], [1110, 190], [1110, 470], [1050, 530], [300, 530], [240, 470], [250, 340], [310, 290], [880, 290], [940, 340], [960, 400], [1250, 400]]] },
    m4: { paths: [
        [[-30,125], [322,125], [380,183], [380,272], [438,330], [562,330], [678,330], [742,330], [800,272], [800,208], [858,150], [922,150], [980,208], [980,432], [1038,490], [1072,490], [1130,432], [1130,408], [1185,350], [1250,350]],
        [[-30,510], [322,510], [380,452], [380,388], [438,330], [562,330], [678,330], [742,330], [800,272], [800,208], [858,150], [922,150], [980,208], [980,432], [1038,490], [1072,490], [1130,432], [1130,408], [1185,350], [1250,350]],
    ], spdMul: 1.35 },
};

const CHAPTERS = [
    { name: L('푸른 들판'), theme: 'grass' },
    { name: L('어둠 숲'), theme: 'forest' },
    { name: L('무너진 성채'), theme: 'ruin' },
    { name: L('얼음 협곡'), theme: 'snow' },
    { name: L('타는 사막'), theme: 'desert' },
    { name: L('안개 늪'), theme: 'swamp' },
    { name: L('용암 화산'), theme: 'volcano' },
    { name: L('공허의 성'), theme: 'void' },
    { name: L('하늘 정원'), theme: 'sky' },
    { name: L('시간의 탑'), theme: 'clock' },
];
// stages per chapter: 1~3장 4개(세이브 인덱스 호환), 4~8장 6개
const CH_START = [0, 4, 8, 12, 18, 24, 30, 36, 42, 48];
const CH_LEN = [4, 4, 4, 6, 6, 6, 6, 6, 6, 6];
function stageLabel(idx) { const ch = STAGES[idx].ch; return `${ch + 1}-${idx - CH_START[ch] + 1}`; }
const STAGES = [
    { ch: 0, name: L('고갯길 초소'),   map: 'm1', waves: 6,  pool: ['slime', 'goblin'] },
    { ch: 0, name: L('두 갈래 길'),    map: 'm2', waves: 7,  pool: ['slime', 'goblin', 'wolf'] },
    { ch: 0, name: L('굽이 언덕'),     map: 'm3', waves: 8,  pool: ['goblin', 'wolf', 'orc'] },
    { ch: 0, name: L('폭군의 들녘'),   map: 'm4', waves: 8,  pool: ['slime', 'goblin', 'wolf', 'orc'], boss: 'ironfang' },
    { ch: 1, name: L('숲 어귀'),       map: 'm1', waves: 9,  pool: ['goblin', 'wolf', 'bat', 'shaman'] },
    { ch: 1, name: L('박쥐 동굴'),     map: 'm3', waves: 9,  pool: ['orc', 'bat', 'shaman', 'wolf'] },
    { ch: 1, name: L('골렘 계곡'),     map: 'm2', waves: 10, pool: ['orc', 'shaman', 'golem', 'bat', 'goblin'] },
    { ch: 1, name: L('대족장의 진영'), map: 'm4', waves: 10, pool: ['goblin', 'orc', 'shaman', 'wolf', 'bat'], boss: 'grak' },
    { ch: 2, name: L('무너진 성문'),   map: 'm2', waves: 10, pool: ['skeleton', 'imp', 'orc'] },
    { ch: 2, name: L('망자의 회랑'),   map: 'm3', waves: 11, pool: ['skeleton', 'imp', 'golem', 'shaman'] },
    { ch: 2, name: L('저주의 성벽'),   map: 'm1', waves: 12, pool: ['cursed', 'skeleton', 'imp', 'golem', 'bat'] },
    { ch: 2, name: L('심연의 문'),     map: 'm4', waves: 12, pool: ['skeleton', 'imp', 'cursed', 'orc', 'shaman'], boss: 'vargas' },
    // 4장 얼음 협곡
    { ch: 3, name: L('눈 덮인 초소'), map: 'm5', waves: 10, pool: ['frostwolf', 'goblin', 'orc'] },
    { ch: 3, name: L('얼어붙은 개울'), map: 'm7', waves: 11, pool: ['frostwolf', 'icewisp', 'orc', 'shaman'] },
    { ch: 3, name: L('서리 동굴'),     map: 'm2', waves: 11, pool: ['icewisp', 'skeleton', 'frostwolf', 'yeti'] },
    { ch: 3, name: L('설인의 둥지'),   map: 'm8', waves: 12, pool: ['yeti', 'frostwolf', 'icewisp', 'orc'] },
    { ch: 3, name: L('빙하 다리'),     map: 'm6', waves: 12, pool: ['frostwolf', 'icewisp', 'yeti', 'cursed', 'bat'] },
    { ch: 3, name: L('얼음 궁전'),     map: 'm5', waves: 13, pool: ['frostwolf', 'icewisp', 'yeti', 'skeleton'], boss: 'frosna' },
    // 5장 타는 사막
    { ch: 4, name: L('모래 언덕'),     map: 'm11', waves: 11, pool: ['scorpion', 'goblin', 'wolf'] },
    { ch: 4, name: L('말라붙은 오아시스'), map: 'm6', waves: 12, pool: ['scorpion', 'beetle', 'bat', 'shaman'] },
    { ch: 4, name: L('전갈 골짜기'),   map: 'm9', waves: 12, pool: ['scorpion', 'beetle', 'harpy', 'orc'] },
    { ch: 4, name: L('묻힌 신전'),     map: 'm3', waves: 13, pool: ['beetle', 'skeleton', 'scorpion', 'golem'] },
    { ch: 4, name: L('태양의 계단'),   map: 'm3', waves: 13, pool: ['scorpion', 'beetle', 'harpy', 'golem', 'imp'] },
    { ch: 4, name: L('사막왕의 무덤'), map: 'm11', waves: 14, pool: ['scorpion', 'beetle', 'harpy', 'golem'], boss: 'setka' },
    // 6장 안개 늪
    { ch: 5, name: L('늪 어귀'),       map: 'm7', waves: 12, pool: ['toad', 'goblin', 'harpy'] },
    { ch: 5, name: L('버섯 숲'),       map: 'm10', waves: 12, pool: ['toad', 'swampwitch', 'wolf', 'bat'] },
    { ch: 5, name: L('가라앉은 마을'), map: 'm2', waves: 13, pool: ['toad', 'swampwitch', 'skeleton', 'harpy'] },
    { ch: 5, name: L('마녀의 오두막'), map: 'm9', waves: 13, pool: ['swampwitch', 'toad', 'yeti', 'imp'] },
    { ch: 5, name: L('독안개 습지'),   map: 'm12', waves: 14, pool: ['toad', 'swampwitch', 'harpy', 'golem', 'shaman'] },
    { ch: 5, name: L('늪의 심장'),     map: 'm10', waves: 14, pool: ['toad', 'swampwitch', 'harpy', 'beetle'], boss: 'morga' },
    // 7장 용암 화산
    { ch: 6, name: L('잿빛 기슭'),     map: 'm8', waves: 12, pool: ['salamander', 'imp', 'orc'] },
    { ch: 6, name: L('용암 개울'),     map: 'm5', waves: 13, pool: ['salamander', 'ember', 'harpy', 'shaman'] },
    { ch: 6, name: L('불꽃 대장간'),   map: 'm6', waves: 13, pool: ['salamander', 'lavagolem', 'imp', 'beetle'] },
    { ch: 6, name: L('분화구 길'),     map: 'm11', waves: 14, pool: ['lavagolem', 'salamander', 'harpy', 'scorpion'] },
    { ch: 6, name: L('불의 제단'),     map: 'm9', waves: 14, pool: ['salamander', 'lavagolem', 'imp', 'swampwitch', 'cursed'] },
    { ch: 6, name: L('거인의 화로'),   map: 'm12', waves: 15, pool: ['salamander', 'lavagolem', 'harpy', 'imp'], boss: 'ignis' },
    // 8장 공허의 성
    { ch: 7, name: L('무너진 하늘길'), map: 'm10', waves: 13, pool: ['shadow', 'harpy', 'skeleton'] },
    { ch: 7, name: L('거꾸로 탑'),     map: 'm7', waves: 14, pool: ['shadow', 'voidknight', 'imp', 'toad'] },
    { ch: 7, name: L('별 없는 회랑'),  map: 'm12', waves: 14, pool: ['shadow', 'voidknight', 'swampwitch', 'harpy'] },
    { ch: 7, name: L('공허의 정원'),   map: 'm6', waves: 15, pool: ['shadow', 'lavagolem', 'icewisp', 'beetle'] },
    { ch: 7, name: L('왕좌 앞뜰'),     map: 'm5', waves: 15, pool: ['shadow', 'voidknight', 'salamander', 'yeti', 'harpy'] },
    { ch: 7, name: L('공허의 왕좌'),   map: 'm10', waves: 16, pool: ['shadow', 'voidknight', 'harpy', 'swampwitch'], boss: 'nox' },
    // 9장 하늘 정원 (v3)
    { ch: 8, name: L('구름 계단'),     map: 'm13', waves: 13, pool: ['windsprite', 'cloudthief', 'harpy'] },
    { ch: 8, name: L('떠다니는 섬'),   map: 'm7', waves: 14, pool: ['cloudthief', 'windsprite', 'shadow', 'toad'] },
    { ch: 8, name: L('바람 정원'),     map: 'm10', waves: 14, pool: ['windsprite', 'griffin', 'cloudthief', 'beetle'] },
    { ch: 8, name: L('그리폰 둥지'),   map: 'm13', waves: 15, pool: ['griffin', 'windsprite', 'harpy', 'salamander'] },
    { ch: 8, name: L('천둥 다리'),     map: 'm8', waves: 15, pool: ['cloudthief', 'griffin', 'voidknight', 'windsprite'] },
    { ch: 8, name: L('폭풍의 눈'),     map: 'm13', waves: 16, pool: ['cloudthief', 'griffin', 'windsprite', 'swampwitch'], boss: 'aeris' },
    // 10장 시간의 탑 (v3)
    { ch: 9, name: L('톱니 회랑'),     map: 'm14', waves: 14, pool: ['clocksoldier', 'cog', 'cloudthief'] },
    { ch: 9, name: L('멈춘 시계탑'),   map: 'm12', waves: 14, pool: ['clocksoldier', 'chronomage', 'windsprite', 'shadow'] },
    { ch: 9, name: L('태엽 공장'),     map: 'm6', waves: 15, pool: ['gearbeast', 'clocksoldier', 'chronomage', 'harpy'] },
    { ch: 9, name: L('모래시계 홀'),   map: 'm14', waves: 15, pool: ['chronomage', 'clocksoldier', 'griffin', 'lavagolem'] },
    { ch: 9, name: L('되감긴 길'),     map: 'm9', waves: 16, pool: ['clocksoldier', 'gearbeast', 'chronomage', 'cloudthief', 'voidknight'] },
    { ch: 9, name: L('시간의 정점'),   map: 'm14', waves: 16, pool: ['clocksoldier', 'gearbeast', 'chronomage', 'griffin'], boss: 'chronos' },
];
// 2-1부터 체력 보정을 단계적으로 올려 2장 후반~3장은 x1.3 (2026-10-12, player-sim 튜닝 실험 T_combo30)
const STAGE_HP_RAMP = [1, 1, 1, 1, 1.15, 1.2, 1.25, 1.3, 1.3, 1.3, 1.3, 1.3];
// 4장부터: 각 장 첫 스테이지는 직전 보스 근처에서 시작해 장 안에서 CH_HP_STEP씩 오른다 (헤드리스 밸런스 봇으로 보정)
const CH_HP = { 3: 4.3, 4: 5.3, 5: 7.0, 6: 8.4, 7: 9.4, 8: 11.0, 9: 17.5 };
const CH_HP_STEP = 0.28;
function stageHpMul(idx) {
    if (idx < 12) return (1 + 0.21 * idx) * (STAGE_HP_RAMP[idx] || 1);
    const ch = STAGES[idx].ch;
    return CH_HP[ch] + CH_HP_STEP * (idx - CH_START[ch]);
}
function stageStartGold(idx) {
    if (idx < 12) return 300 + 45 * Math.floor(idx / 4) + 10 * (idx % 4);
    const ch = STAGES[idx].ch;
    return 440 + 30 * (ch - 3) + 10 * (idx - CH_START[ch]);
}
// 처치 금화 배율: 4장부터 적 체력 증가를 일부 따라간다
function stageBountyMul(idx) { return idx < 12 ? 1 : 1 + 0.035 * (idx - 11); }
// 영웅 난이도 (PLAN_V2 1.2): 장 보스를 처음 잡으면 그 장이 열린다
const HARD = { hpMul: 2.0, bossHpMul: 1.6, lateFrom: 9, lateHpMul: 1.4, lateBossHpMul: 1.2, atkMul: 1.5, goldMul: 1.15, lives: 20, silverMul: 2, ilvlAdd: 12, gemsPerStar: 20 };   // lateFrom: chapter index from which the lower late* multipliers apply (chapter 10 enemies are already 17.5x+)   // bossHpMul: chapter-boss stages (tools/balance.js --hard: 220% there costs 10+ lives even for the end-game profile)
// enemy HP multiplier of 영웅 난이도 on one stage
function hardHpMul(idx) {
    const st = STAGES[idx]; if (!st) return HARD.hpMul;
    const late = st.ch >= HARD.lateFrom;
    return st.boss ? (late ? HARD.lateBossHpMul : HARD.bossHpMul) : (late ? HARD.lateHpMul : HARD.hpMul);
}
// 영웅 난이도 3성 조건 (PLAN_V3 C): 1~2성은 목숨, 3성은 목숨 + 이 조건
const HARD_COND = [
    { id: 'noArcher', name: L('궁수탑 없이'), tower: 'archer' },
    { id: 'noMage', name: L('마법탑 없이'), tower: 'mage' },
    { id: 'noCannon', name: L('대포탑 없이'), tower: 'cannon' },
    { id: 'noBarracks', name: L('병영 없이'), tower: 'barracks' },
    { id: 'max8', name: L('탑 8개 이하') },
    { id: 'noSpell', name: L('아이템(냥펀치·증원·총출동) 없이') },
    { id: 'noLeak', name: L('목숨을 하나도 잃지 않기') },
];
function hardCond(idx) {
    const st = STAGES[idx];
    const air = st.pool.some(k => ENEMIES[k].fly);
    const list = HARD_COND.filter(c => !(air && (c.id === 'noArcher' || c.id === 'noMage')));
    return list[(idx * 3 + Math.floor(idx / 4)) % list.length];
}

function stageRewards(idx, stars, firstClear) {
    const base = 90 + 45 * idx;
    return {
        silver: Math.round(base * (0.6 + 0.2 * stars) * (firstClear ? 2 : 1)),
        xp: Math.round(60 + 30 * idx),
    };
}
