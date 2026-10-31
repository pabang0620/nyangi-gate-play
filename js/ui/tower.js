'use strict';
// UI - 심연의 탑 (js/tower.js): the 도전 tab panel, floor intro (변이), blessing pick, in-battle blessing row, result lines, 탑 상점.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const root = (...a) => UI.root(...a);
    const S = UI.S;
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const modal = (...a) => UI.modal(...a);
    const showHub = (...a) => UI.showHub(...a);
    const showGot = (...a) => UI.showGot(...a);
    const rewardIcons = (...a) => UI.rewardIcons(...a);
    const confirmBox = (...a) => UI.confirmBox(...a);

    const coinChip = n => h('span.tw-coin', img('i_oath', '.icon'), fmt(n));
    function blessChip(id, n) {
        const b = Tower.blessById(id);
        const c = h('span.tw-chip.t' + b.t, { title: b.name, onclick: e => { e.stopPropagation(); toast(`${b.name} · ${b.desc}`); } }, img(b.icon, '.icon'));
        if (n > 1) c.appendChild(h('i', 'x' + n));
        return c;
    }
    function blessRow(list) {
        const counts = {};
        for (const id of list) counts[id] = (counts[id] || 0) + 1;
        return h('div.tw-blessrow', Object.keys(counts).map(id => blessChip(id, counts[id])));
    }
    function mutLine(m) {
        return h('div.tw-mut' + (m.bad ? '.bad' : '.good'), img(m.icon, '.icon'), h('b', m.name), h('span', m.desc));
    }
    // next first-clear milestone above the best floor (every 5th)
    function nextMilestone(T) { let f = T.best + 1; while (f % 5) f++; return f; }

    // ------------------------------------------------------------ 도전 tab panel
    function tabTower() {
        const p = Save.p, T = Tower.state(p), run = T.run;
        const win = h('div.panel.win.summonwin.glass.tw-win');
        win.appendChild(h('div.tw-head', img('i_max', '.tw-crown'), h('div.title-t', L('심연의 탑')),
            h('div.tw-best', L('최고 '), h('span.gold-t', L('{0}층', T.best)), L(' · 이번 주 {0}층', T.week.best)),
            T.title ? h('span.tw-titlebadge', L('심연의 정복자')) : null, h('div.sp'), coinChip(T.coins)));
        if (run) {
            const f = run.floor, muts = Tower.mutators(run, f), boss = f % 5 === 0 ? Tower.boss(f) : null;
            win.appendChild(h('div.tw-run',
                h('div.tw-runhead', h('b', L('원정 중 · {0}층 도전', f)), boss ? h('span.tw-boss', img('i_skull', '.icon'), L('보스 {0}', ENEMIES[boss].name)) : null,
                    h('span.tip', L('이번 원정 탑 코인 {0} · 이어하기 {1}', run.coins, run.revived ? L('사용함') : L('1회 남음')))),
                UI.powerLine(Meta.recFor('tower', f)),
                run.bless.length ? blessRow(run.bless) : h('div.tip', L('아직 축복이 없어요. 층을 깨면 3개 중 하나를 골라요.')),
                run.offer ? h('div.gold-t', L('고를 축복이 기다리고 있어요!')) : h('div.tw-muts', muts.length ? muts.map(mutLine) : h('div.tip', L('이번 층은 변이가 없어요'))),
                h('div.row', h('button.btn.red.small', { onclick: () => { click(); confirmBox(L('원정을 포기할까요?\n지금까지 오른 층과 축복이 사라져요.'), () => { Tower.giveUp(p); showHub('endless'); }); } }, L('원정 포기')),
                    h('button.btn.gold', { onclick: () => { click(); towerNext(); } }, run.offer ? L('축복 고르기') : L('{0}층 도전', f)))));
        } else {
            win.appendChild(h('div.tw-run',
                h('div', L('층을 깰 때마다 축복을 하나씩 골라 점점 강해져요. 한 번 지면 원정은 끝나고, 다시 1층부터 올라가요.')),
                UI.powerLine(Meta.recFor('tower', 1)),
                T.last ? h('div.tip', L('지난 원정: {0}층까지 · 탑 코인 {1}', T.last.reached, T.last.coins)) : null,
                h('button.btn.gold.tw-start', { onclick: () => { click(); Tower.newRun(p); towerNext(); } }, L('새 원정 시작'))));
        }
        const ms = nextMilestone(T);
        win.appendChild(h('div.tw-reward', h('div', L('처음 오르는 층마다 보상 · 다음 큰 보상 '), h('span.gold-t', L('{0}층', ms))), h('div.row', rewardIcons(TOWER.firstReward(ms))),
            h('div.tip', L('10층마다 전설 장비, 30층부터는 신화 장비 · 50층 심연의 정복자'))));
        win.appendChild(h('div.row', h('button.btn', { onclick: () => { click(); shopModal(); } }, img('i_oath', '.icon'), L('탑 상점')),
            h('button.btn', { onclick: () => { click(); rankModal(); } }, img('i_league', '.icon'), L('주간 순위'))));
        root().appendChild(win);
    }

    // ------------------------------------------------------------ run flow: blessing (if one is waiting) -> floor intro -> battle
    function towerNext() {
        const p = Save.p, run = Tower.state(p).run;
        if (!run) { showHub('endless'); return; }
        if (run.offer) { blessPick(run.offer, () => floorIntro()); return; }
        floorIntro();
    }
    function floorIntro() {
        const p = Save.p, run = Tower.state(p).run, f = run.floor;
        const muts = Tower.mutators(run, f), boss = f % 5 === 0 ? Tower.boss(f) : null;
        const d = modal([
            h('div.tw-floor', h('span', L('심연의 탑')), h('b', L('{0}층', f))),
            boss ? h('div.tw-boss', img('i_skull', '.icon'), L('보스 층 · {0}', ENEMIES[boss].name)) : null,
            h('div.tw-muts', muts.length ? muts.map(mutLine) : h('div.tip', L('이번 층은 변이가 없어요'))),
            run.bless.length ? blessRow(run.bless) : null,
            UI.powerLine(Meta.recFor('tower', f)),
            f > Tower.state(p).best ? h('div.tip.gold-t', L('처음 오르는 층! 깨면 보상을 받아요')) : null,
            h('div.row', h('button.btn.ghost', { onclick: () => { click(); d.remove(); S.ctab = 'tower'; showHub('endless'); } }, L('나중에')),
                h('button.btn.gold', { onclick: () => { click(); UI.powerGate(Meta.recFor('tower', f), () => { d.remove(); Game.startBattle({ tower: true }); }); } }, L('출발'))),
        ], { noClose: true });
        d.querySelector('.modal').classList.add('tw-intro');
    }
    // 3 face-down cards flip one by one; tap one to take it
    function blessPick(offer, done) {
        const p = Save.p;
        let taken = false;
        const cards = offer.map((id, i) => {
            const b = Tower.blessById(id);
            const c = h('div.tw-card.t' + b.t, { style: { animationDelay: (0.15 + i * 0.22) + 's' } },
                h('div.tw-in', h('div.tw-back', img('ui_card_back')),
                    h('div.tw-face', h('div.tw-tier', TOWER_TIER[b.t].name), img(b.icon, '.tw-bico'), h('b', b.name), h('div', b.desc))));
            c.addEventListener('click', () => {
                if (taken) return;
                taken = true; click();
                Tower.pick(p, id);
                c.classList.add('chosen'); cards.forEach(x => { if (x !== c) x.classList.add('dim'); });
                Sfx.play(b.t >= 2 ? 'fanfare' : b.t ? 'epic' : 'upgrade', b.t >= 2 ? 3 : 2);
                setTimeout(() => { d.remove(); done && done(); }, 650);
            });
            return c;
        });
        const d = modal([h('div.title-t', L('축복을 하나 고르세요')), h('div.tw-cards', cards),
            h('div.tip', L('고른 축복은 이번 원정이 끝날 때까지 계속 쌓여요'))], { noClose: true });
        d.querySelector('.modal').classList.add('tw-pickpop');
        const top = Math.max(...offer.map(id => Tower.blessById(id).t));
        Sfx.play(top >= 2 ? 'epic' : 'summon', top);
    }

    // ------------------------------------------------------------ battle: the run's blessings and this floor's 변이 under the top bar
    function towerHud(B) {
        const run = Tower.state(Save.p).run;
        if (!run) return;
        const muts = Tower.mutators(run, run.floor);
        const row = h('div.tw-hud', h('b', L('{0}층', run.floor)),
            muts.map(m => h('span.tw-chip.mut' + (m.bad ? '.bad' : ''), { title: m.name, onclick: e => { e.stopPropagation(); toast(`${m.name} · ${m.desc}`); } }, img(m.icon, '.icon'))),
            run.bless.length ? blessRow(run.bless) : null);
        root().appendChild(row);
    }

    // ------------------------------------------------------------ result screen lines (js/ui/result.js)
    function towerResult(R) {
        const t = R.tower, p = Save.p, T = Tower.state(p), out = [];
        if (!t) return out;
        if (t.win) {
            out.push(h('div.ribbon', h('span', L('{0}층 돌파!', t.floor))));
            out.push(h('div', t.newBest ? h('span.gold-t', L('최고 기록 갱신! 처음 오른 층 보상을 받았어요')) : L('최고 기록 {0}층', T.best)));
            if (t.title) out.push(h('div.tw-titlebadge', L('칭호 획득: 심연의 정복자')));
        } else {
            out.push(h('div.ribbon.lose', h('span', L('원정 종료'))));
            out.push(h('div', L('{0}층까지 올랐어요 · 최고 기록 {1}층', t.run ? t.run.reached : t.floor - 1, T.best)));
            if (t.run && t.run.bless.length) out.push(blessRow(t.run.bless));
        }
        out.push(h('div.tw-coinline', L('탑 코인 '), coinChip(t.win ? t.coins : (t.run ? t.run.coins : 0)), t.win ? L(' (이번 원정 {0})', T.run ? T.run.coins : 0) : L(' (이번 원정 합계)')));
        return out;
    }

    // ------------------------------------------------------------ 탑 상점 (weekly stock)
    const SHOP_NAMES = () => ({ silver: L('은화 꾸러미'), stone: L('강화석 묶음'), guard: L('하락방지권'), ticket: L('소환권'), gem: L('보석 주머니'), shield: L('파괴방지권'), leg: L('전설 장비 상자') });
    function shopModal() {
        const p = Save.p;
        let d = null;
        const draw = () => {
            if (d) d.remove();
            const T = Tower.state(p), names = SHOP_NAMES();
            const rows = TOWER.shop.map(it => {
                const left = Tower.shopLeft(p, it), can = left > 0 && T.coins >= it.cost;
                return h('div.tw-shoprow', h('div.row', rewardIcons(it.reward)), h('div.tw-sn', h('b', names[it.id]), h('span.tip', L('이번 주 {0}/{1}', left, it.stock))),
                    h('button.btn.small' + (can ? '.gold' : '.off'), { onclick: () => {
                        if (!can) { toast(left > 0 ? L('탑 코인이 부족해요') : L('이번 주 물량을 다 샀어요')); return; }
                        click(); const got = Tower.buy(p, it.id); if (got) { Save.save(); draw(); showGot(names[it.id], got); }
                    } }, img('i_oath', '.icon'), fmt(it.cost)));
            });
            d = modal([h('div.title-t', L('탑 상점')), h('div', L('보유 탑 코인 '), coinChip(T.coins)), h('div.tw-shop', rows),
                h('div.tip', L('탑 코인은 원정에서 층을 깰 때마다 쌓여요 · 물량은 매주 월요일에 다시 채워져요')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
        };
        draw();
    }

    // ------------------------------------------------------------ weekly ranking (server board 'tower')
    function rankModal() {
        const box = h('div.inset.tw-rank', UI.catLoad(null, 'sm'));
        const d = modal([h('div.title-t', L('심연의 탑 주간 순위')), box, h('div.tip', L('이번 주 오른 가장 높은 층으로 겨뤄요 · 매주 월요일 순위대로 보상')),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
        if (!Online.on) { box.innerHTML = ''; box.appendChild(h('div.muted', Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 랭킹을 준비하고 있습니다'))); return; }
        if (!Online.profile) { box.innerHTML = ''; box.appendChild(h('button.btn.gold', { onclick: () => { click(); d.remove(); UI.ensureProfile(() => rankModal()); } }, L('닉네임 만들고 랭킹 보기'))); return; }
        Online.board('tower', 50).then(v => { box.innerHTML = ''; box.appendChild(UI.myRankLine(v, L('층'))); box.appendChild(UI.rankList(v, L('층'))); });
    }

    Object.assign(UI, { tabTower, towerNext, towerHud, towerResult });
})();
