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
    let afterStory = null;   // runs once the chapter outro closes (skill unlock popup waits for it)
    const playStory = (lines, done) => UI.playStory(lines, (...a) => { if (done) done(...a); const f = afterStory; afterStory = null; if (f) f(); });
    const startStage = (...a) => UI.startStage(...a);


    function showResult(R) {
        closePopup(); cancelAim();
        const p = Save.p;
        const cells = [];
        const dblCells = [];   // what the ad doubles: silver and hero xp
        // the same currency from several sources (battle, weekly milestones, raid cards) is one cell with the total
        const gotCur = new Map();
        for (const g of (R.got || []).concat(...(R.weekly || []).map(w => w.got))) { const ic = g && !g.item ? g.icon || (g.mat ? (g.mat === 'shield' ? 'i_shield' : 'i_guard') : null) : null; if (ic) gotCur.set(ic, (gotCur.get(ic) || 0) + g.n); }
        const take = k => { const v = gotCur.get(k) || 0; gotCur.delete(k); return v; };
        const gotSilver = take('silver'), gotGems = take('gem');
        if (R.silver + gotSilver > 0) { const c = rewardCell('silver', fmt(R.silver + gotSilver)); cells.push(c); if (R.silver > 0) dblCells.push(c); }
        if (R.xp) cells.push(dblCells[dblCells.length] = rewardCell('i_xp', R.xp));
        if (R.gems + gotGems > 0) cells.push(rewardCell('gem', R.gems + gotGems));
        const gearItems = [...R.items];   // second row; one 장비 꾸러미 box when there are two or more (UI.gearCells)
        const content = [];
        if (R.cup) {
            content.push(h('div.ribbon', h('span', L('{0}점', fmt(R.cup.score)))));
            content.push(h('div', L('주간 공방전 · {0} · {1}웨이브 · ', R.cup.ruleName, R.wave), R.cup.best ? h('span.gold-t', L('이번 주 최고 점수!')) : L('이번 주 최고 {0}점', fmt(R.cup.weekBest))));
            content.push(h('div.tip.cup-online', Online.on && Online.profile ? (R.cup.best ? L('주간 순위에 등록하는 중…') : '') : Online.on ? L('닉네임을 만들면 주간 순위에 등록됩니다') : ''));
        } else if (R.endless) {
            content.push(h('div.ribbon', h('span', L('{0} 웨이브', R.wave))));
            content.push(h('div', R.newBest ? h('span.gold-t', L('최고 기록 갱신!')) : L('최고 기록 {0} 웨이브', p.endlessBest)));
            if (R.league) content.push(h('div', { style: { fontSize: '16px' } }, L('시즌 리그 '), h('span.gold-t', L('{0}위', R.league.after)), R.league.after < R.league.before ? ` (▲${R.league.before - R.league.after})` : ''));
            if (R.weekly && R.weekly.length) {
                content.push(h('div.gold-t', L('이번 주 구간 보상: {0}', R.weekly.map(w => L('{0}웨이브', w.wave)).join(', '))));
            }
        } else if (R.raidOn) {
            content.push(h('div.ribbon', h('span', R.raidOn.mode === 'party' ? L('파티 레이드') : L('월드 보스'))));
            content.push(h('div', { style: { fontSize: '20px' } }, L('피해량 '), h('span.gold-t.res-num', fmt(R.raidOn.dmg)), L(' · {0}점', fmt(R.raidOn.pts))));
            content.push(h('div.rd-result', L('기록을 보내는 중…')));
        } else if (R.praid) {
            content.push(h('div.ribbon' + (R.win ? '' : '.lose'), h('span', R.win ? L('레이드 승리!') : L('레이드 실패'))));
            content.push(h('div', R.win ? L('{0}초 만에 {1}을(를) 쓰러뜨렸어요', R.praid.time, ENEMIES[R.praid.kind].name) : L('{0} 체력이 {1}% 남았어요', ENEMIES[R.praid.kind].name, Math.ceil(R.praid.left * 100))));
            content.push(h('div.rd-result', L('결과를 보내는 중…')));
        } else if (R.coop) {
            content.push(h('div.ribbon' + (R.win ? '' : '.lose'), h('span', R.win ? L('협동 승리!') : L('협동 실패'))));
            content.push(h('div', L('{0}웨이브까지 막았어요', R.coop.wave)));
            content.push(h('div.rd-result', L('결과를 보내는 중…')));
        } else if (R.tower) {
            content.push(...UI.towerResult(R));
        } else if (R.raid) {
            content.push(h('div.ribbon', h('span', L('토벌 종료'))));
            content.push(h('div', { style: { fontSize: '20px' } }, L('피해량 '), h('span.gold-t', fmt(R.raid.dmg)), L(' · 이번 주 최고 {0} · {1}단계', fmt(R.raid.best), R.raid.tier)));
        } else {
            content.push(h('div.ribbon' + (R.win ? '' : '.lose'), h('span', R.win ? L('승리!') : L('패배...'))));
            if (R.win) content.push(h('div.bigstars', [0, 1, 2].map(i => { const s = img(i < R.stars ? 'i_star' : 'i_star_off'); s.style.animationDelay = (0.3 + i * 0.25) + 's'; return s; })));
            else content.push(h('div.muted', L('탑 배치와 업그레이드, 장비를 바꿔 다시 도전해 보세요.')));
            // who got through the gate, and what beats them
            if (!R.win && R.leaks && R.leaks.length) content.push(h('div.leaks', h('b', L('성문을 넘은 적')),
                R.leaks.slice(0, 3).map(([k, n]) => h('div.leak', Art.domCanvas(Art.enemy(k, 0), 1), h('div', h('span.gn', `${ENEMIES[k].name} ×${n}`), UI.foeTip(k))))));
            if (!R.win && R.leaks && R.leaks.some(([k]) => ENEMIES[k] && (ENEMIES[k].boss || ENEMIES[k].elite))) content.push(h('div.tip', { style: { color: '#a8401a' } }, L('보스·정예가 성문을 넘으면 바로 패배! 5초 안에 잡으세요')));
            if (R.cond) content.push(h('div', { style: { fontSize: '16px', color: R.cond.ok ? '#3a7a2a' : '#a8401a' } }, L('3성 조건 · {0}: {1}', R.cond.name, R.cond.ok ? L('달성') : L('실패'))));
        }
        for (const g of (R.got || [])) if (g.item) gearItems.push(g.item);
        const gear = UI.gearCells(gearItems);
        for (const [icon, n] of gotCur) cells.push(rewardCell(icon, icon === 'silver' ? fmt(n) : n));
        // hero level up: a small badge that pops in under the stars
        const heroCls = Game.lastHero || p.hero;
        const lvPop = h('div.lvup-pop', L('레벨 업! Lv.{0}', R.heroLv));
        if (!R.levelUp) lvPop.style.display = 'none';
        content.push(lvPop);
        content.push(h('div', { style: { fontSize: '15px', color: '#5a3a1c' } }, L('처치 {0} · 잃은 목숨 {1}', R.kills, R.lost)));
        if (R.xpLost) content.push(h('div.tip', { style: { color: '#a8401a' } }, L('영웅이 쓰러진 채 끝나서 경험치를 받지 못했어요')));
        if (R.xpShare) content.push(h('div.tip', L('다른 영웅도 경험치 +{0}', fmt(R.xpShare))));
        // one row: silver, xp and gems first, then the gear (one 장비 꾸러미 box when two or more)
        if (cells.length || gear.length) content.push(h('div.row.res-row', cells, gear));
        // skills unlocked by this level up (SKILL_UNLOCK): a popup once the result is up (after the chapter outro when one plays)
        const hd = p.heroes[heroCls];
        let shownLv = hd ? hd.lv - (R.heroUps || 0) : 0;
        let resultUp = false;
        function lvUpdate() {
            if (!hd || hd.lv <= R.heroLv) return;   // the ad x2 can add another level
            lvPop.textContent = L('레벨 업! Lv.{0}', hd.lv);
            lvPop.style.display = '';
            R.heroLv = hd.lv;
            if (resultUp) skillPop();
        }
        function skillPop() {
            if (!hd || !SKILLS[heroCls]) return;
            const fresh = SKILLS[heroCls].filter((sk, i) => SKILL_UNLOCK[i] > shownLv && SKILL_UNLOCK[i] <= hd.lv);
            shownLv = hd.lv;
            if (!fresh.length) return;
            stopAuto();
            UI.infoModal(L('스킬 해금!'), h('div.skill-list', fresh.map(sk => h('div.skrow',
                h('div.skill' + (SKILLS[heroCls].indexOf(sk) === 3 ? '.ult' : ''), Art.domCanvas(Art.icon(sk.id), 2.3)),
                h('div', h('b', sk.name), h('div', sk.desc))))));
        }
        const btns = h('div.row');
        const toChallenge = R.endless || R.dungeon || R.raid || R.raidOn || R.coop || R.praid || R.tower;
        const exitBtn = h('button.btn.ghost', { onclick: () => { click(); if (R.dungeon) S.ctab = 'dungeon'; if (R.raid) S.ctab = 'raid'; if (R.raidOn || R.coop || R.praid) S.ctab = 'online'; if (R.cup) S.ctab = 'cup'; if (R.tower) S.ctab = 'tower'; showHub(toChallenge ? 'endless' : 'map'); } }, L('나가기'));
        const again = R.cup ? { cup: true } : R.endless ? { endless: true } : R.dungeon ? { dungeon: R.dungeon.kind, tier: R.dungeon.tier } : R.raid ? { raid: true } : { stageIdx: R.stageIdx, hard: R.hard };
        const canAgain = R.raidOn || R.coop || R.praid || R.tower ? false : R.cup ? Meta.cupLeft(p) > 0 : R.dungeon ? Meta.dungeonLeft(p) > 0 : R.raid ? p.raid.runs < RAID.tries : true;   // online raids start from the 레이드 tab
        if (canAgain) btns.appendChild(h('button.btn', { onclick: () => { click(); Game.startBattle(again); } }, L('다시 하기')));
        if (R.tower && R.tower.win) btns.appendChild(h('button.btn.gold', { onclick: () => { click(); d.remove(); UI.towerNext(); } }, L('다음 층으로')));
        if (!R.win && !toChallenge && !R.cup) { btns.appendChild(h('button.btn', { onclick: () => { click(); showHub('hero'); } }, L('영웅'))); btns.appendChild(h('button.btn', { onclick: () => { click(); showHub('research'); } }, L('연구'))); }   // where to get stronger
        if ((R.win || R.endless) && R.silver > 0) {
            const doubleNow = () => {
                Save.p.silver += R.silver; grantBattleXp(Save.p, heroCls, R.xp); Save.save();
                UI.markDouble(dblCells[0], fmt(R.silver * 2 + gotSilver)); if (R.xp) UI.markDouble(dblCells[dblCells.length - 1], R.xp * 2);
                lvUpdate();
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
        if (hasNext) btns.appendChild(h('button.btn.gold', { onclick: () => { stopAuto(); click(); d.remove(); startStage(nextIdx, R.hard); } }, L('다음 스테이지')));
        // 자동 진행 (stages only, after a win): off -> next stage -> repeat this one. Locked until AUTO_NEXT.unlock is cleared
        // (the button says which stage); any tap on the result stops the count, a loss never auto-starts.
        const autoMode = () => p.set.autoNext === true ? 'next' : p.set.autoNext || 'off';
        const autoName = m => m === 'next' ? '\u2713 ' + L('자동: 다음 판') : m === 'repeat' ? '\u2713 ' + L('자동: 반복') : L('자동 진행');
        const can = (p.stars[AUTO_NEXT.unlock] || 0) > 0, at = stageLabel(AUTO_NEXT.unlock);
        const autoLine = h('div.tip'), autoTog = h('div.btn.small');
        let autoTimer = 0;
        function stopAuto() { clearInterval(autoTimer); autoTimer = 0; autoLine.textContent = ''; }
        function startAuto() {
            stopAuto();
            const m = autoMode();
            if (!R.win || m === 'off' || (m === 'next' && !hasNext)) return;
            let left = AUTO_NEXT.wait;
            const say = () => { autoLine.textContent = m === 'next' ? L('{0}초 뒤 다음 스테이지 · 화면을 누르면 멈춰요', left) : L('{0}초 뒤 다시 시작 · 화면을 누르면 멈춰요', left); };
            say();
            autoTimer = setInterval(() => {
                if (!d.isConnected) { stopAuto(); return; }
                if (--left <= 0) { stopAuto(); d.remove(); if (m === 'next') startStage(nextIdx, R.hard); else Game.startBattle({ stageIdx: R.stageIdx, hard: R.hard }); return; }
                say();
            }, 1000);
        }
        const stageWin = !toChallenge && !R.cup && R.win;
        if (stageWin) {
            const paint = () => { autoTog.className = 'btn small' + (can && autoMode() !== 'off' ? ' gold' : '') + (can ? '' : ' off'); autoTog.textContent = can ? autoName(autoMode()) : L('{0} 클리어 시 자동 진행', at); };
            paint();
            autoTog.addEventListener('click', e => {
                e.stopPropagation(); click();
                if (!can) { toast(L('{0}을(를) 클리어하면 자동 진행·반복을 쓸 수 있어요', at)); return; }
                const m = autoMode(); p.set.autoNext = m === 'off' ? 'next' : m === 'next' ? 'repeat' : false; Save.save();
                paint(); startAuto();
            });
            btns.appendChild(autoTog);
        }
        btns.appendChild(exitBtn);   // 나가기 is always the right-most button
        content.push(btns);
        if (stageWin) content.push(autoLine);
        const d = modal(content, { noClose: true });
        // the first clear of a chapter boss plays its outro, so no auto start then
        if (stageWin && can && R.chapterClear === undefined) {
            startAuto();
            d.addEventListener('pointerdown', e => { if (!autoTog.contains(e.target)) stopAuto(); }, true);
        }
        // fireworks only when this run dropped gear of 영웅 grade (r 2) or better, played short and soft
        if (gearItems.some(it => it && it.r >= 2)) UI.vfx('vfx/victory.mp4', d, { rate: 1.5, opacity: 0.7 });
        d.id = 'resultbox';
        resultUp = true;
        if (R.chapterClear !== undefined && Meta.storyFor(p, R.chapterClear, 'outro')) afterStory = skillPop;
        else setTimeout(() => { if (d.isConnected) skillPop(); }, 700);
        // first clear of a chapter boss: outro scene on top of the result
        if (R.chapterClear !== undefined) {
            const lines = Meta.storyFor(p, R.chapterClear, 'outro');
            if (lines) { Meta.markStory(p, R.chapterClear, 'outro'); setTimeout(() => playStory(lines, () => toast(R.chapterClear + 1 < CHAPTERS.length ? L('{0}장이 열렸습니다!', R.chapterClear + 2) : L('어려움 난이도가 열렸습니다'))), 600); }
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
