'use strict';
// UI - world map (chapters, normal/hard), story dialogue, stage info.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const root = (...a) => UI.root(...a);
    const S = UI.S;
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const starsStr = (...a) => UI.starsStr(...a);
    const rewardCell = (...a) => UI.rewardCell(...a);
    const modal = (...a) => UI.modal(...a);
    const showHub = (...a) => UI.showHub(...a);


    // world map ---------------------------------------------------
    const NODE_POS = { 4: [[200, 420], [430, 300], [700, 380], [980, 250]], 6: [[150, 450], [330, 320], [520, 440], [720, 300], [920, 430], [1110, 270]] };

    function tabMap() {
        const p = Save.p;
        metaEnsure(p);
        // the map opens where the player last played (chapter and 보통/영웅), the first time per session and after each battle
        if (!S.mapInit || S.mapFollow) {
            S.mapInit = true; S.mapFollow = false;
            const lm = p.set.lastMap;
            if (lm && lm.ch >= 0 && lm.ch < CHAPTERS.length && stageUnlocked(p, CH_START[lm.ch])) { S.chapter = lm.ch; S.hard = !!lm.hard; }
            else { let c = 0; while (c + 1 < CHAPTERS.length && stageUnlocked(p, CH_START[c + 1])) c++; S.chapter = c; S.hard = false; }
        }
        const ch = S.chapter, n = CH_LEN[ch], pos = NODE_POS[n], base = CH_START[ch];
        const chOpen = c => stageUnlocked(p, CH_START[c]);
        const hardOpen = chapterCleared(p, ch);
        if (S.hard && !hardOpen) S.hard = false;
        const stars = idx => (S.hard ? p.hstars[idx] : p.stars[idx]) || 0;
        const unlocked = idx => (S.hard ? hardUnlocked(p, idx) : stageUnlocked(p, idx));
        // chapter selector: ◀ n장 이름 ▶ + progress dots (8 chapters do not fit as tabs)
        const go = d => { const c = ch + d; if (c < 0 || c >= CHAPTERS.length) return; if (!chOpen(c)) { toast(L('이전 장의 보스를 물리치면 열립니다')); return; } click(); S.chapter = c; showHub('map'); };
        // centred: ◀ chapter name (n / total under it) ▶; one difficulty button right of the name shows the current one (보통 / 어려움), a tap switches
        const toHard = () => {
            if (!hardOpen) { hardInfo(false); return; }
            if (!p.seenTips.hardMode) { p.seenTips.hardMode = true; Save.save(); hardInfo(true, () => { S.hard = true; showHub('map'); }); return; }
            S.hard = true; showHub('map');
        };
        // still locked: the tap explains how 어려움 opens
        const modeBtn = h('div.modetog',
            h('button.btn.small' + (S.hard ? '.red' : '.gold'), { onclick: () => { click(); if (S.hard) { S.hard = false; showHub('map'); } else toHard(); } }, S.hard ? L('어려움') : L('보통')),
            hardOpen && !p.seenTips.hardMode ? h('span.badge.hard-new', '!') : null);
        root().appendChild(h('div.chnav',
            h('button.btn.small' + (ch > 0 ? '' : '.off'), { onclick: () => go(-1) }, '◀'),
            h('div.chname' + (S.hard ? '.hard' : ''), h('div.chtitle', h('span', L('{0}장 {1}', ch + 1, CHAPTERS[ch].name)), modeBtn), h('div.chnum', `${ch + 1} / ${CHAPTERS.length}`)),
            h('button.btn.small' + (ch < CHAPTERS.length - 1 && chOpen(ch + 1) ? '' : '.off'), { onclick: () => go(1) }, '▶')));
        const layer = h('div.pass', { style: { position: 'absolute', inset: '0' } });
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', W); svg.setAttribute('height', H);
        Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' });
        for (let i = 0; i < n - 1; i++) {
            const l = document.createElementNS(svgNS, 'line');
            const a = pos[i], b = pos[i + 1];
            l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]); l.setAttribute('x2', b[0]); l.setAttribute('y2', b[1]);
            l.setAttribute('stroke', unlocked(base + i + 1) ? (S.hard ? '#ff7a5c' : '#f5c451') : '#5a4a3a');
            l.setAttribute('stroke-width', '6'); l.setAttribute('stroke-dasharray', '4 12'); l.setAttribute('stroke-linecap', 'round');
            svg.appendChild(l);
        }
        layer.appendChild(svg);
        let nextIdx = -1;
        for (let i = base; i < base + n; i++) if (unlocked(i) && !stars(i)) { nextIdx = i; break; }
        for (let i = 0; i < n; i++) {
            const idx = base + i, st = STAGES[idx];
            const un = unlocked(idx);
            const node = h('div.node' + (st.boss ? '.boss' : '') + (un ? '' : '.locked') + (idx === nextIdx ? '.next' : '') + (S.hard ? '.hard' : ''), {
                style: { left: pos[i][0] + 'px', top: pos[i][1] + 'px' },
                onclick: () => { if (!un) { toast(L('이전 스테이지를 먼저 클리어하세요')); return; } click(); stageInfo(idx, S.hard); },
            },
                h('div.nm', st.name),
                st.boss ? Art.domCanvas(Art.enemy(st.boss, 0), 1.4) : h('span', { style: { fontFamily: 'BlackHan', fontSize: '20px' } }, stageLabel(idx)),
                h('div.stars', starsStr(stars(idx))));
            layer.appendChild(node);
        }
        root().appendChild(layer);
        const starRule = [L('별 3개: 목숨을 2 이하로 잃고 승리'), S.hard ? L('어려움 난이도: 별 1개마다 보석 {0}', HARD.gemsPerStar) : L('처음 얻는 별 1개마다 보석 15')];
        root().appendChild(h('div.tip.hubtip', { style: { position: 'absolute', left: '24px', top: '78px', textAlign: 'left' } }, starRule[0], h('br'), starRule[1]));
        root().appendChild(UI.helpBtn(L('별 얻는 법'), () => starGuide(S.hard, ch), '.mob-q.map-q'));
        if (!p.seenTips.map) firstCoach();
    }

    // 별 얻는 법: one row per star count (stars drawn, the condition, the gems for reaching it the first time)
    function starGuide(hard, ch) {
        const g = hard ? HARD.gemsPerStar : 15;
        const row = (n, cond) => h('div.sg-row', h('div.sg-stars', UI.starsStr(n)), h('div.sg-cond', cond), UI.rewardCell('gem', g * n));
        return [
            row(3, hard ? L('목숨을 2개 이하로 잃고 승리 + 스테이지 조건 지키기') : L('목숨을 2개 이하로 잃고 승리')),
            row(2, L('목숨을 10개 이하로 잃고 승리')),
            row(1, L('승리')),
            h('div.tip', { style: { marginTop: '6px' } }, L('보석은 처음 얻는 별에만 줘요. 별 1개를 더 얻을 때마다 보석 {0}개', g)),
        ];
    }

    // brand-new player: a bubble points at the stage to play, after the daily login popup is gone, until it is tapped
    let coachIv = null;
    function firstCoach() {
        clearInterval(coachIv);
        coachIv = setInterval(() => {
            const node = root().querySelector('.node.next');
            if (S.screen !== 'hub' || S.tab !== 'map' || !node) { clearInterval(coachIv); return; }
            if (root().querySelector('.dim') || root().querySelector('.mapcoach')) return;
            clearInterval(coachIv);
            const done = () => { Save.p.seenTips.map = true; Save.save(); b.remove(); };
            const flip = parseFloat(node.style.left) > W * 0.6;   // near the right edge: sit on the node's left side
            const b = h('div.mapcoach' + (flip ? '.flip' : ''), { style: { left: node.style.left, top: node.style.top }, onclick: () => { done(); node.click(); } },
                h('div.mc-arrow', flip ? '▶' : '◀'), h('div.mc-text', L('금빛 고리가 도는 스테이지를 눌러 전투를 시작하세요')));
            node.addEventListener('click', done, { once: true });
            node.parentElement.appendChild(b);
        }, 300);
    }

    // what 영웅 난이도 is (first tap, or while it is still locked)
    function hardInfo(open, then) {
        const text = [L('같은 스테이지를 더 강한 적과 다시 싸우는 어려운 모드입니다 (영웅 탭과는 다릅니다).'),
            L('· 별 1개마다 보석 {0}개 · 은화 {1}배', HARD.gemsPerStar, HARD.silverMul),
            L('· 별 3개: 스테이지마다 정해진 조건 + 잃은 목숨 2 이하'),
        ].filter(Boolean).join('\n');
        // the reward line gets icons you can tap for the full explanation
        const rw = h('div.rwrow', UI.rewardCell('gem', HARD.gemsPerStar), UI.rewardCell('silver', 'x' + HARD.silverMul));
        const lock = open ? null : h('div.locknote', img('i_lock', '.icon'), ' ', L('이 장의 보스를 물리치면 어려움 난이도가 열립니다'));
        UI.infoModal(L('어려움 난이도'), [h('div', text), rw, lock], open && then ? [[L('도전하러 가기'), then]] : []);
    }


    // short dialogue scenes (js/data/story.js): portrait + name + line, tap to continue
    function playStory(lines, done) {
        let i = 0;
        const box = h('div.story');
        const d = h('div.dim.storydim', box);
        const who = k => HEROES[k] ? { name: HERO_NAMES[k], el: img(heroPortrait(k, Save.p.shop && Save.p.shop.skin[k])) } : { name: ENEMIES[k].name, el: Art.domCanvas(Art.enemy(k, 0), 1.6) };
        const show = () => {
            const [k, text] = lines[i], w = who(k);
            box.innerHTML = '';
            box.appendChild(h('div.story-p' + (HEROES[k] ? '' : '.foe'), w.el));
            box.appendChild(h('div.story-t', h('div.story-n', w.name), h('div', text), h('div.tip', i < lines.length - 1 ? L('눌러서 계속') : L('눌러서 시작'))));
        };
        d.addEventListener('click', () => { click(); i++; if (i >= lines.length) { d.remove(); done && done(); } else show(); });
        root().appendChild(d);
        show();
    }

    function startStage(idx, hard) {
        const p = Save.p, st = STAGES[idx], ch = st.ch;
        p.set.lastMap = { ch, hard: !!hard }; S.mapFollow = true; Save.save();
        const run = () => Game.startBattle({ stageIdx: idx, hard });
        if (hard) return run();
        const kind = idx === CH_START[ch] ? 'intro' : st.boss ? 'boss' : null;
        const lines = kind && Meta.storyFor(p, ch, kind);
        if (lines) { Meta.markStory(p, ch, kind); playStory(lines, run); } else run();
    }


    function stageInfo(idx, hard) {
        const p = Save.p, st = STAGES[idx];
        const have = (hard ? p.hstars[idx] : p.stars[idx]) || 0;
        const first = !have;
        const rw0 = stageRewards(idx, 3, first);
        const rw = hard ? { silver: Math.round(rw0.silver * HARD.silverMul), xp: Math.round(rw0.xp * 1.5) } : rw0;
        const kinds = [...new Set(st.pool)];
        const fitC = (c, w, hh) => { c.style.maxWidth = w + 'px'; c.style.maxHeight = hh + 'px'; return c; };
        // landscape layout: left = what you face and what you get, right = who goes
        const heroPick = h('div.heropick', Object.keys(HEROES).map(c =>
            h('div.hp' + (p.hero === c ? '.on' : ''), { onclick: () => { click(); p.hero = c; Save.save(); d.remove(); stageInfo(idx, hard); } },
                img(heroFace(c, p.shop && p.shop.skin[c])), h('div', h('b', `${HERO_NAMES[c]} · ${HEROES[c].name}`), h('span.num', ` Lv.${p.heroes[c].lv}`), h('div.tip', HEROES[c].desc)))));
        const left = h('div.si-left',
            h('div.title-t', { style: hard ? { color: '#ff7a5c' } : {} }, `${hard ? L('[어려움] ') : ''}${stageLabel(idx)} ${st.name}`),
            h('div.row', { style: { alignItems: 'center' } }, starsStr(have), h('span', { style: { marginLeft: '8px' } }, L('웨이브 {0}', st.waves) + (st.boss ? L(' · 보스 {0}', ENEMIES[st.boss].name) : ''))),
            h('div.inset', { style: { padding: '8px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' } },
                kinds.concat(st.boss ? [st.boss] : []).map(k => h('div.si-enemy', { style: { textAlign: 'center', fontSize: '12px', width: '78px' }, onclick: () => { click(); UI.enemyInfo(k); } },
                    fitC(Art.domCanvas(Art.enemy(k, 0), 2.5), 70, 58), h('div', ENEMIES[k].name),
                    ENEMIES[k].tag ? h('div', { style: { color: '#a8401a' } }, ENEMIES[k].tag.replace(/·/g, '·​')) : null))),
            h('div.tip.si-hint', L('적을 누르면 특징과 상대법을 볼 수 있습니다')),
            hard ? h('div', { style: { fontSize: '15px', color: '#a8401a', fontWeight: 'bold' } }, L('3성 조건: {0} (+ 잃은 목숨 2 이하)', hardCond(idx).name)) : null,
            h('div', { style: { fontSize: '14px', color: '#6a4a2a' } }, first ? L('첫 클리어 보상 (별 3개 기준)') : L('보상 (별 3개 기준)')),
            h('div.row', rewardCell('silver', fmt(rw.silver)), rewardCell('i_xp', rw.xp), rewardCell('gem', (3 - have) * (hard ? HARD.gemsPerStar : 15) || '-')));
        const right = h('div.si-right',
            h('div', { style: { fontFamily: 'BlackHan', fontSize: '16px', color: '#5a2a0a' } }, L('출전 영웅')),
            heroPick,
            h('button.btn' + (hard ? '.red' : '.gold'), { style: { fontSize: '22px', minHeight: '64px', width: '100%' }, onclick: () => { click(); d.remove(); startStage(idx, hard); } }, L('전투 시작')),
            have >= 3 ? sweepRow(idx, hard, () => { d.remove(); stageInfo(idx, hard); }) : null,
            h('button.btn.ghost', { style: { width: '100%' }, onclick: () => { click(); d.remove(); } }, L('닫기')));
        const d = modal([h('div.si', left, right)
        ], { dismiss: true });
        // long enemy names / tags (German compounds) shrink to their 78px column instead of breaking mid-word
        d.querySelectorAll('.si-enemy > div:not(:first-child)').forEach(e => UI.fitText(e, () => e.clientWidth, 9));
    }

    // 소탕: 별 3개 스테이지는 전투 없이 승리 보상 (하루 횟수 제한)
    function sweepRow(idx, hard, redraw) {
        const p = Save.p, left = Rewards.sweepLeft(p);
        const go = n => {
            if (!left) { toast(L('오늘 소탕 횟수를 다 썼어요')); return; }
            click();
            const got = Rewards.sweepStage(p, idx, hard, n);
            if (!got) return;
            redraw();
            UI.showGot(L('{0} 소탕 {1}회', stageLabel(idx), Math.min(n, left)), got);
        };
        return h('div.sweep-row',
            h('button.btn.small' + (left ? '' : '.off'), { onclick: () => go(1) }, L('소탕 1회')),
            h('button.btn.small' + (left > 1 ? '' : '.off'), { onclick: () => go(Math.min(10, left)) }, L('소탕 {0}회', Math.max(1, Math.min(10, left)))),
            h('div.tip', L('오늘 남은 소탕 {0}회', left)));
    }

    Object.assign(UI, { tabMap, playStory, startStage, stageInfo });
})();
