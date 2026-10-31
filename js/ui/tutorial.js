'use strict';
// UI - step-by-step lessons at the start of 1-1, 1-2 and 1-3 (towers, gate, hero, skills, items, auto toggles, speed).
// The battle is frozen while a card is up; each card is one short line and points at the button it talks about.
// Seen flags live in Save.p.seenTips (les_0, les_1, les_2); "튜토리얼 다시 보기" in settings clears them.
(() => {
    const S = UI.S;
    const root = (...a) => UI.root(...a);
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);

    const towerPic = type => Art.domCanvas(Art.tower(type, 0, null), 1.15);
    const q = sel => root().querySelector(sel);

    // one entry per stage index: [picture, title, line, element to point at]
    function steps(B) {
        const hud = S.hud, horn = hud.waveBtns[0] && hud.waveBtns[0].el;
        const sp = B.spells, sk = B.hero.skills[0];
        if (B.stageIdx === 0) return [
            [img('i_heart'), L('성문을 지켜요'), L('적이 성문을 넘으면 목숨이 줄어요. 0이면 패배!'), hud.lives.parentElement],
            [img('d_pad'), L('탑 짓기'), L('길가 돌 발판을 누르면 탑을 지어요.'), null],
            [towerPic('archer'), L('궁수탑'), L('빠르게 쏴요. 하늘의 적도 맞혀요.'), null],
            [towerPic('barracks'), L('병영'), L('병사가 길을 막고 싸워요.'), null],
            [img('i_upgrade'), L('업그레이드'), L('지은 탑을 다시 누르면 더 강해져요.'), null],
            [img('i_horn'), L('뿔피리'), L('누르면 적이 와요. 일찍 부르면 금화 보너스!'), horn],
        ];
        if (B.stageIdx === 1) return [
            [towerPic('mage'), L('마법탑'), L('갑옷 입은 적에게 강해요. 하늘도 공격.'), null],
            [towerPic('cannon'), L('대포탑'), L('여러 명을 한 번에! 하늘의 적은 못 쳐요.'), null],
            [img(heroPortraitImg(B)), L('영웅'), L('땅을 누르면 영웅이 그곳으로 달려가요.'), q('.hud-hero .portrait')],
            [Art.domCanvas(Art.icon(sk.id), 2.4), L('영웅 스킬'), L('버튼을 누르고 쓸 곳을 골라요. 레벨이 오르면 더 열려요.'), hud.skills[0] && hud.skills[0].el],
            [Art.domCanvas(Art.icon(sp[0].id), 2.4), L('아이템'), L('{0}: 큰 폭발 · {1}: 병사 2명 소환', sp[0].name, sp[1].name), q('.hud-spells')],
            sp[2] ? [Art.domCanvas(Art.icon(sp[2].icon), 2.4), sp[2].name, L('쉬는 영웅 둘이 25초 동안 함께 싸워요.'), q('.hud-spells .skill:nth-child(3)')] : null,
            [null, L('길게 누르기'), L('버튼을 길게 누르면 설명이 나와요.'), null],
        ];
        if (B.stageIdx === 2) return [
            [null, L('영웅 자동'), L('켜면 영웅이 알아서 싸워요.'), hud.autoHero],
            [null, L('자동 웨이브'), L('켜면 다음 웨이브를 알아서 불러요.'), hud.autoWave],
            [img('i_speed'), L('배속'), L('누를 때마다 게임이 빨라져요.'), hud.speed],
        ];
        return null;
    }
    function heroPortraitImg(B) { const sk = Save.p.shop && Save.p.shop.skin[B.hero.cls]; return heroPortrait(B.hero.cls, sk); }

    // shared card runner: one card at a time, tap anywhere for the next. opts.alive() false = stop early (screen changed),
    // opts.pause freezes the battle while the cards are up, opts.last = label of the final button
    function runCards(list, opts = {}) {
        let i = 0, lit = null;
        if (opts.pause) Game.paused = true;
        const dim = h('div.lesson-dim');
        const card = h('div.lesson');
        const end = () => {
            if (lit) lit.classList.remove('tut-hl');
            dim.remove(); card.remove();
            if (opts.pause) Game.paused = !!S.paused;
            if (opts.onEnd) opts.onEnd();
        };
        const show = () => {
            if (lit) lit.classList.remove('tut-hl');
            if (opts.alive && !opts.alive()) { end(); return; }
            const [pic, title, line, el] = list[i];
            lit = el || null;
            if (lit) lit.classList.add('tut-hl');
            card.innerHTML = '';
            card.append(
                pic ? h('div.lesson-pic', pic) : '',
                h('div.lesson-txt', h('b', title), h('div', line)),
                h('div.lesson-foot',
                    h('span.lesson-n', `${i + 1} / ${list.length}`),
                    h('button.btn.small' + (i === list.length - 1 ? '.gold' : ''), { onclick: e => { e.stopPropagation(); next(); } }, i === list.length - 1 ? (opts.last || L('시작!')) : L('다음'))));
        };
        const next = () => { click(); i++; if (i >= list.length) end(); else show(); };
        dim.addEventListener('click', next);
        card.addEventListener('click', next);
        root().append(dim, card);
        show();
    }

    function start(B) {
        const p = Save.p; p.seenTips = p.seenTips || {};
        if (!B || B.mode !== 'stage' || B.hard || B.endless || B.stageIdx > 2) return;
        const key = 'les_' + B.stageIdx;
        if (p.seenTips[key]) return;
        const list = (steps(B) || []).filter(Boolean);
        if (!list || !list.length) return;
        p.seenTips[key] = true; Save.save();
        runCards(list, { pause: true, alive: () => Game.battle === B && S.screen === 'battle' });
    }

    // hub cards (challenge contents opening for the first time): shown once per key
    function once(key, list, onEnd) {
        const p = Save.p; p.seenTips = p.seenTips || {};
        if (p.seenTips[key]) return false;
        p.seenTips[key] = true; Save.save();
        runCards(list, { last: L('확인'), onEnd });
        return true;
    }

    // hub guide: first time on the map after clearing 1-1, one card per real nav button (and the mail button).
    // Seen flag p.seenTips.hub_0; the settings replay clears seenTips, so it shows again on the next map visit.
    function hubGuide() {
        const p = Save.p; p.seenTips = p.seenTips || {};
        if (p.seenTips.hub_0 || highestCleared(p) < 0) return;
        setTimeout(() => {
            if (S.screen !== 'hub' || S.tab !== 'map' || p.seenTips.hub_0 || q('.dim') || q('.lesson')) return;
            const nav = id => { const im = q(`.navbar img[src*="nav_${id}."]`); return im ? im.closest('.navbtn') : null; };
            const rows = [
                ['map', L('지도'), L('스테이지를 골라 싸워요. 별을 모아 다음 장을 열어요.')],
                ['hero', L('영웅'), L('장비를 끼우고 스킨을 바꿔요. 영웅도 바꿀 수 있어요.')],
                ['research', L('연구'), L('별로 탑을 영구히 강하게 만들어요.')],
                ['summon', L('소환'), L('보석으로 장비를 뽑아요.')],
                ['challenge', L('도전'), L('무한의 성벽, 요일 도전, 보스 토벌전 같은 도전 콘텐츠예요.')],
                ['rewards', L('보상'), L('임무, 출석, 업적 보상을 여기서 받아요.')],
                ['shop', L('상점'), L('보석과 패키지를 사요.')],
            ];
            const list = rows.map(([id, t, line]) => { const el = nav(id); return el ? [img('nav_' + id), t, line, el] : null; }).filter(Boolean);
            const mail = q('.topbar .mailbtn');
            if (mail) list.push([null, L('우편함'), L('선물과 공지가 오면 여기에 와요.'), mail]);
            if (!list.length) return;
            p.seenTips.hub_0 = true; Save.save();
            runCards(list, { last: L('확인'), skip: true, alive: () => S.screen === 'hub' && list.every(x => x[3].isConnected) });
        }, 450);
    }

    UI.lesson = start;
    UI.cardsOnce = once;
    UI.hubGuide = hubGuide;
})();
