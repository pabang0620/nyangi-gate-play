'use strict';
// UI - battle result screen and auto-continue.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const cancelAim = (...a) => UI.cancelAim(...a);
    const closePopup = (...a) => UI.closePopup(...a);
    const S = UI.S;
    const clear = (...a) => UI.clear(...a);
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const itemCell = (...a) => UI.itemCell(...a);
    const rewardCell = (...a) => UI.rewardCell(...a);
    const modal = (...a) => UI.modal(...a);
    const showHub = (...a) => UI.showHub(...a);
    const playStory = (...a) => UI.playStory(...a);
    const startStage = (...a) => UI.startStage(...a);


    function showResult(R) {
        closePopup(); cancelAim();
        const p = Save.p;
        const cells = [];
        const dblCells = [];   // what the ad doubles: silver and hero xp
        if (R.silver > 0) cells.push(dblCells[dblCells.length] = rewardCell('silver', fmt(R.silver)));
        if (R.gems) cells.push(rewardCell('gem', R.gems));
        if (R.xp) cells.push(dblCells[dblCells.length] = rewardCell('i_xp', R.xp));
        for (const it of R.items) cells.push(itemCell(it, { noNew: true }));
        const content = [];
        if (R.cup) {
            content.push(h('div.ribbon', h('span', L('{0}점', fmt(R.cup.score)))));
            content.push(h('div', L('주간 공방전 · {0} · {1}웨이브 · ', R.cup.ruleName, R.wave), R.cup.best ? h('span.gold-t', L('이번 주 최고 점수!')) : L('이번 주 최고 {0}점', fmt(R.cup.weekBest))));
            content.push(h('div.tip.cup-online', Online.on && Online.profile ? (R.cup.best ? L('주간 순위에 등록하는 중…') : '') : Online.on ? L('닉네임을 만들면 주간 순위에 등록됩니다') : ''));
        } else if (R.endless) {
            content.push(h('div.ribbon', h('span', L('{0} 웨이브', R.wave))));
            content.push(h('div', R.newBest ? h('span.gold-t', L('최고 기록 갱신!')) : L('최고 기록 {0} 웨이브', p.endlessBest)));
            if (R.league) content.push(h('div', { style: { fontSize: '18px' } }, L('시즌 리그 '), h('span.gold-t', L('{0}위', R.league.after)), R.league.after < R.league.before ? ` (▲${R.league.before - R.league.after})` : ''));
            if (R.weekly && R.weekly.length) {
                for (const w of R.weekly) for (const g of w.got) if (g.icon) cells.push(rewardCell(g.icon, g.icon === 'silver' ? fmt(g.n) : g.n));
                content.push(h('div.gold-t', L('이번 주 구간 보상: {0}', R.weekly.map(w => L('{0}웨이브', w.wave)).join(', '))));
            }
        } else if (R.raidOn) {
            content.push(h('div.ribbon', h('span', R.raidOn.mode === 'party' ? L('파티 레이드') : L('월드 보스'))));
            content.push(h('div', { style: { fontSize: '22px' } }, L('피해량 '), h('span.gold-t', fmt(R.raidOn.dmg)), L(' · {0}점', fmt(R.raidOn.pts))));
            content.push(h('div.rd-result', L('기록을 보내는 중…')));
        } else if (R.coop) {
            content.push(h('div.ribbon' + (R.win ? '' : '.lose'), h('span', R.win ? L('협동 승리!') : L('협동 실패'))));
            content.push(h('div', L('{0}웨이브까지 막았어요', R.coop.wave)));
            content.push(h('div.rd-result', L('결과를 보내는 중…')));
        } else if (R.raid) {
            content.push(h('div.ribbon', h('span', L('토벌 종료'))));
            content.push(h('div', { style: { fontSize: '22px' } }, L('피해량 '), h('span.gold-t', fmt(R.raid.dmg)), L(' · 이번 주 최고 {0} · {1}단계', fmt(R.raid.best), R.raid.tier)));
        } else {
            content.push(h('div.ribbon' + (R.win ? '' : '.lose'), h('span', R.win ? L('승리!') : L('패배...'))));
            if (R.win) content.push(h('div.bigstars', [0, 1, 2].map(i => { const s = img(i < R.stars ? 'i_star' : 'i_star_off'); s.style.animationDelay = (0.3 + i * 0.25) + 's'; return s; })));
            else content.push(h('div.muted', L('탑 배치와 업그레이드, 장비를 바꿔 다시 도전해 보세요.')));
            // who got through the gate, and what beats them
            if (!R.win && R.leaks && R.leaks.length) content.push(h('div.leaks', h('b', L('성문을 넘은 적')),
                R.leaks.slice(0, 3).map(([k, n]) => h('div.leak', Art.domCanvas(Art.enemy(k, 0), 1), h('div', h('span.gn', `${ENEMIES[k].name} ×${n}`), ' ', ENEMIES[k].tip)))));
            if (!R.win && R.leaks && R.leaks.some(([k]) => ENEMIES[k] && (ENEMIES[k].boss || ENEMIES[k].elite))) content.push(h('div.tip', { style: { color: '#a8401a' } }, L('보스·정예가 성문을 넘으면 바로 패배! 5초 안에 잡으세요')));
            if (R.cond) content.push(h('div', { style: { fontSize: '17px', color: R.cond.ok ? '#3a7a2a' : '#a8401a' } }, L('3성 조건 · {0}: {1}', R.cond.name, R.cond.ok ? L('달성') : L('실패'))));
        }
        for (const g of (R.got || [])) cells.push(g.item ? itemCell(g.item, { noNew: true }) : rewardCell(g.icon, g.icon === 'silver' ? fmt(g.n) : g.n));
        content.push(h('div', { style: { fontSize: '16px', color: '#5a3a1c' } }, L('처치 {0} · 잃은 목숨 {1}', R.kills, R.lost) + (R.levelUp ? L(' · 영웅 레벨 업! Lv.{0}', R.heroLv) : '')));
        if (R.xpShare) content.push(h('div.tip', L('다른 영웅도 경험치 +{0}', fmt(R.xpShare))));
        content.push(h('div.row', { style: { maxWidth: '680px', alignItems: 'center' } }, R.win || R.endless ? img('ui_chest', '.result-chest') : null, cells));
        const btns = h('div.row');
        const toChallenge = R.endless || R.dungeon || R.raid || R.raidOn || R.coop;
        btns.appendChild(h('button.btn.ghost', { onclick: () => { click(); if (R.dungeon) S.ctab = 'dungeon'; if (R.raid) S.ctab = 'raid'; if (R.raidOn || R.coop) S.ctab = 'online'; if (R.cup) S.ctab = 'cup'; showHub(toChallenge ? 'endless' : 'map'); } }, toChallenge ? L('돌아가기') : L('지도로')));
        const again = R.cup ? { cup: true } : R.endless ? { endless: true } : R.dungeon ? { dungeon: R.dungeon.kind, tier: R.dungeon.tier } : R.raid ? { raid: true } : { stageIdx: R.stageIdx, hard: R.hard };
        const canAgain = R.raidOn || R.coop ? false : R.cup ? Meta.cupLeft(p) > 0 : R.dungeon ? Meta.dungeonLeft(p) > 0 : R.raid ? p.raid.runs < RAID.tries : true;   // online raids start from the 레이드 tab
        if (canAgain) btns.appendChild(h('button.btn', { onclick: () => { click(); Game.startBattle(again); } }, L('다시 하기')));
        if (R.items.length) btns.appendChild(h('button.btn', { onclick: () => { click(); S.selItem = R.items[R.items.length - 1].id; showHub('hero'); } }, L('장비 보기')));
        if (!R.win && !toChallenge && !R.cup) { btns.appendChild(h('button.btn', { onclick: () => { click(); showHub('hero'); } }, L('영웅'))); btns.appendChild(h('button.btn', { onclick: () => { click(); showHub('research'); } }, L('연구'))); }   // where to get stronger
        if ((R.win || R.endless) && R.silver > 0) {
            const doubleNow = () => {
                Save.p.silver += R.silver; grantBattleXp(Save.p, Game.lastHero || Save.p.hero, R.xp); Save.save();
                UI.markDouble(dblCells[0], fmt(R.silver * 2)); if (R.xp) UI.markDouble(dblCells[dblCells.length - 1], R.xp * 2);
            };
            if (Save.p.shop && Save.p.shop.premium) {
                // 냥이의 가호: no button, the x2 is applied right away while today's count lasts
                if (Rewards.adLeft(Save.p, 'double') > 0) { Save.p.daily.ads.double = (Save.p.daily.ads.double || 0) + 1; Rewards.track('ad'); R.autoDouble = true; doubleNow(); }
            } else {
                const dbl = h('button.btn.gold', { onclick: async () => {
                    if (dbl.used) { toast(L('이번 판은 이미 2배로 받았어요')); return; }
                    if (!Rewards.adLeft(Save.p, 'double')) { toast(L('오늘 2배 횟수를 다 썼어요 (하루 {0}번)', AD_LIMITS.double)); return; } click();
                    if (await Rewards.watchAd('double')) { dbl.used = true; dbl.classList.add('off'); dbl.lastChild.textContent = L('2배 받음'); doubleNow(); }
                } }, img('i_ad', '.icon'), h('span', L('광고 보고 2배') + ' ' + L('(오늘 {0}번 남음)', Rewards.adLeft(Save.p, 'double'))));
                btns.appendChild(dbl);
            }
        }
        const stageMode = !toChallenge;
        const nextIdx = R.stageIdx + 1;
        const hasNext = stageMode && R.win && nextIdx < STAGES.length && (R.hard ? STAGES[nextIdx].ch === STAGES[R.stageIdx].ch && hardUnlocked(p, nextIdx) : true);
        if (hasNext) btns.appendChild(h('button.btn.gold', { onclick: () => { click(); d.remove(); startStage(nextIdx, R.hard); } }, L('다음 스테이지')));
        content.push(btns);
        const d = modal(content);
        // fireworks only for big wins: a chapter boss or a first 3-star clear, played short and soft
        if (R.win && !R.endless && (R.chapterClear !== undefined || R.firstThree)) UI.vfx('vfx/victory.mp4', d, { rate: 1.5, opacity: 0.7 });
        d.id = 'resultbox';
        // first clear of a chapter boss: outro scene on top of the result
        if (R.chapterClear !== undefined) {
            const lines = Meta.storyFor(p, R.chapterClear, 'outro');
            if (lines) { Meta.markStory(p, R.chapterClear, 'outro'); setTimeout(() => playStory(lines, () => toast(R.chapterClear + 1 < CHAPTERS.length ? L('{0}장이 열렸습니다! 영웅 난이도도 열렸습니다', R.chapterClear + 2) : L('영웅 난이도가 열렸습니다'))), 600); }
        }
        // count the silver up so the reward lands
        const sc = d.querySelector('.cell .cnt');
        if (sc && R.silver > 0) {
            const t0 = performance.now(), dur = 700;
            const total = R.silver * (R.autoDouble ? 2 : 1);
            const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); sc.textContent = fmt(total * k); if (k < 1) requestAnimationFrame(step); else Sfx.play('coin'); };
            requestAnimationFrame(step);
        }
    }

    Object.assign(UI, { showResult });
})();
