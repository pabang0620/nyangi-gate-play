'use strict';
// UI - 보상 tab: daily missions & pass, weekly missions & 28-day attendance, achievements, codex.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {

    // missions: ready to claim on top, then closest to done, claimed ones last
    const byReady = (list, state) => list.map(m => ({ m, st: state(m) }))
        .sort((x, y) => (x.st.claimed - y.st.claimed) || ((y.st.done && !y.st.claimed) - (x.st.done && !x.st.claimed)) || (y.st.v / y.m.goal - x.st.v / x.m.goal));
    const root = (...a) => UI.root(...a);
    const S = UI.S;
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const showGot = (...a) => UI.showGot(...a);
    const rewardIcons = (...a) => UI.rewardIcons(...a);
    const showHub = (...a) => UI.showHub(...a);
    const loginModal = (...a) => UI.loginModal(...a);
    const buyProduct = (...a) => UI.buyProduct(...a);


    // small gold "claim all" for a mission list header; greyed out while nothing is ready
    function claimAllBtn(can, claim) {
        return h('button.btn.small.claimall' + (can ? '.gold.rw-pulse' : '.off'), { onclick: () => { if (!can) { toast(L('받을 보상이 없습니다')); return; } click(); claim(); } }, L('모두 받기'));
    }

    // a 받기 button that is not ready yet says how far along it is
    function notYet(v, goal) { toast(L('아직 완료하지 않았습니다 ({0} / {1})', fmt(v), fmt(goal))); }

    // rewards tab: login · missions · growth pass
    function tabRewards() {
        const p = Save.p; Rewards.ensure(p);
        S.rtab = S.rtab || 'day';
        const badge = id => {
            if (id === 'week') return WEEKLY_MISSIONS.some(m => { const s = Meta.weeklyState(p, m); return s.done && !s.claimed; }) || !!Meta.att28Due(p);
            if (id === 'ach') return ACHIEVEMENTS.some(a => { const s = Meta.achState(p, a); return s.done && !s.claimed; });
            return false;
        };
        root().appendChild(h('div.subtabs', [['day', L('일일 · 패스')], ['week', L('주간 · 출석')], ['ach', L('업적')], ['codex', L('도감')]].map(([id, nm]) =>
            h('button.btn.small' + (S.rtab === id ? '.gold' : '.ghost'), { onclick: () => { click(); S.rtab = id; showHub('rewards'); } }, nm, badge(id) ? h('span.badge', '!') : null))));
        if (S.rtab === 'week') return tabWeekly();
        if (S.rtab === 'ach') return tabAch();
        if (S.rtab === 'codex') return tabCodex();
        const win = h('div.panel.win');
        const cols = h('div.rw');
        // missions
        const dayCan = MISSIONS.some(m => { const st = Rewards.missionState(p, m); return st.done && !st.claimed; }) || (!p.daily.bonus && MISSIONS.every(m => p.daily.claimed[m.id]));
        const ms = h('div.inset.rw-col', h('h3', img('i_mission', '.icon'), L('오늘의 임무'),
            claimAllBtn(dayCan, () => { const g = Rewards.claimAllMissions(p); Save.save(); showHub('rewards'); showGot(L('임무 보상'), g); })));
        byReady(MISSIONS, m => Rewards.missionState(p, m)).forEach(({ m, st }) => {
            ms.appendChild(h('div.mrow' + (st.claimed ? '.claimed' : st.done ? '.ready' : ''),
                h('div', { style: { flex: 1 } }, h('div', m.name), h('div.bar', h('i', { style: { width: (st.v / m.goal * 100) + '%' } })), h('div.num.tip', `${st.v} / ${m.goal}`)),
                ...rewardIcons(m.reward),
                st.claimed ? h('span.claimed-t', L('완료')) : h('button.btn.small' + (st.done ? '.gold' : '.off'), { onclick: () => { if (!st.done) { notYet(st.v, m.goal); return; } click(); const g = Rewards.claimMission(p, m.id); showHub('rewards'); showGot(L('임무 보상'), g); } }, L('받기'))));
        });
        const allDone = MISSIONS.every(m => p.daily.claimed[m.id]);
        ms.appendChild(h('div.mrow.bonus', h('div', { style: { flex: 1 } }, L('모든 임무 완료 보너스')), ...rewardIcons(MISSION_BONUS),
            p.daily.bonus ? h('span.claimed-t', L('완료')) : h('button.btn.small' + (allDone ? '.gold' : '.off'), { onclick: () => { if (!allDone) { toast(L('임무를 모두 완료하고 보상을 받으면 받을 수 있습니다')); return; } click(); const g = Rewards.claimAllMissions(p); showHub('rewards'); showGot(L('임무 보상'), g); } }, L('받기'))));
        // side: login + free gems by ad
        const side = h('div.inset.rw-col.rw-side', h('h3', img('i_calendar', '.icon'), L('출석')),
            h('div.tip', L('누적 {0}일 · {1}', p.login.count, Rewards.loginAvailable(p) ? L('오늘 보상 대기 중') : L('오늘 받음'))),
            h('button.btn' + (Rewards.loginAvailable(p) ? '.gold.rw-pulse' : ''), { onclick: () => { click(); loginModal(); } }, Rewards.loginAvailable(p) ? L('출석 보상 받기') : L('출석부 보기')),
            h('h3', img('i_ad', '.icon'), L('무료 보석')),
            h('div.tip', L('광고를 보고 보석 {0}개 (오늘 {1}번 남음)', AD_FREE_GEMS, Rewards.adLeft(p, 'freeGems'))),
            h('button.btn' + (Rewards.adLeft(p, 'freeGems') ? '.gold' : '.off'), { onclick: async () => {
                if (!Rewards.adLeft(p, 'freeGems')) { toast(L('오늘 무료 보석을 모두 받았습니다. 내일 다시 받을 수 있습니다')); return; } click();
                if (await Rewards.watchAd('freeGems')) { const g = Rewards.grant(p, { gems: AD_FREE_GEMS }); showHub('rewards'); showGot(L('무료 보석'), g); }
            } }, p.shop.premium ? L('바로 받기 (가호)') : L('광고 보기')));
        // growth pass
        // how many pass rewards can be taken right now (free row, and the paid row when the pass is owned)
        const passCan = PASS_TIERS.reduce((n, t, i) => n + (Rewards.passTierOpen(p, i) ? (!p.passClaimed.free.includes(i) ? 1 : 0) + (p.shop.pass && !p.passClaimed.paid.includes(i) ? 1 : 0) : 0), 0);
        const ps = h('div.inset.rw-col.rw-pass', h('h3', img('shop_pass', '.icon'), L('성장 패스'), h('span.tip', { style: { marginLeft: '8px' } }, L('별 {0}개', totalStars(p))),
            passCan ? h('span.rw-count', L('받을 보상 {0}', passCan)) : null));
        const nextTier = PASS_TIERS.findIndex(t => totalStars(p) < t.stars);
        const track = h('div.ptrack');
        PASS_TIERS.forEach((t, i) => {
            const open = Rewards.passTierOpen(p, i);
            const cell = (paid) => {
                const got = (paid ? p.passClaimed.paid : p.passClaimed.free).includes(i);
                const can = open && !got && (!paid || p.shop.pass);
                const c = h('div.pcell' + (got ? '.got' : '') + (can ? '.can' : '') + (paid && !p.shop.pass ? '.lockp' : ''), ...rewardIcons(paid ? t.paid : t.free));
                c.addEventListener('click', () => {
                    if (!can) { toast(got ? L('이미 받은 보상입니다') : !open ? L('별 {0}개를 모으면 열립니다 (지금 {1}개)', t.stars, totalStars(p)) : L('유료 패스 전용 보상입니다')); return; }
                    click(); const g = Rewards.claimPass(p, i, paid); showHub('rewards'); showGot(L('성장 패스'), g); });
                return c;
            };
            // the next tier to open shows how far along it is
            const star = i === nextTier ? h('span.num', `${totalStars(p)}/${t.stars}`) : h('span.num', t.stars);
            track.appendChild(h('div.ptier' + (open ? '.open' : '') + (i === nextTier ? '.nexttier' : ''), h('div.pstar', img('i_star', '.star'), star), cell(false), cell(true)));
        });
        const lab = h('div.plabels', h('span', ''), h('span', L('무료')), h('span.paid', L('유료')));
        ps.appendChild(h('div.pwrap', lab, track));
        // the track scrolls sideways when the tiers do not fit (phones): start at the first tier worth looking at, and fade the edge that has more
        const edge = () => { track.classList.toggle('more-l', track.scrollLeft > 4); track.classList.toggle('more-r', track.scrollLeft + track.clientWidth < track.scrollWidth - 4); };
        track.addEventListener('scroll', edge, { passive: true });
        requestAnimationFrame(() => {
            const tiers = [...track.children], i = tiers.findIndex(e => e.querySelector('.pcell.can') || !e.classList.contains('open'));
            if (i > 0) track.scrollLeft = tiers[i].offsetLeft - track.offsetLeft - tiers[i].offsetWidth;
            edge();
        });
        const next = PASS_TIERS.find(t => totalStars(p) < t.stars);
        ps.appendChild(h('div.tip', next ? L('다음 보상까지 별 {0}개', next.stars - totalStars(p)) : L('모든 단계를 열었습니다')));
        ps.appendChild(h('div.row.pbtns', { style: { display: 'flex', gap: '8px' } },
            h('button.btn' + (passCan ? '.gold.rw-pulse' : '.off'), { onclick: () => { click(); const g = Rewards.claimAllPass(p); showHub('rewards'); if (g.length) showGot(L('성장 패스'), g); else toast(L('받을 보상이 없습니다')); } }, passCan ? L('모두 받기 ({0})', passCan) : L('모두 받기')),
            p.shop.pass ? h('span.claimed-t', L('유료 패스 보유')) : h('button.btn', { onclick: () => { click(); buyProduct('pass'); } }, L('유료 패스 {0}', priceLabel('pass')))));
        cols.appendChild(ms); cols.appendChild(ps); cols.appendChild(side);
        win.appendChild(cols);
        root().appendChild(win);
    }


    function tabWeekly() {
        const p = Save.p;
        const win = h('div.panel.win');
        const weekCan = WEEKLY_MISSIONS.some(m => { const st = Meta.weeklyState(p, m); return st.done && !st.claimed; }) || (!p.weeklyM.bonus && WEEKLY_MISSIONS.every(m => p.weeklyM.claimed[m.id]));
        const ms = h('div.inset.rw-col', h('h3', img('i_mission', '.icon'), L('이번 주 임무'), h('span.tip', { style: { marginLeft: '8px' } }, L('매주 월요일 05:00 초기화')),
            claimAllBtn(weekCan, () => {
                const got = [];
                for (const m of WEEKLY_MISSIONS) { const g = Meta.claimWeekly(p, m.id); if (g) got.push(...g); }
                const b = Meta.claimWeeklyBonus(p); if (b) got.push(...b);
                Save.save(); showHub('rewards'); showGot(L('주간 임무'), got);
            })));
        byReady(WEEKLY_MISSIONS, m => Meta.weeklyState(p, m)).forEach(({ m, st }) => {
            ms.appendChild(h('div.mrow' + (st.claimed ? '.claimed' : st.done ? '.ready' : ''),
                h('div', { style: { flex: 1 } }, h('div', m.name), h('div.bar', h('i', { style: { width: (st.v / m.goal * 100) + '%' } })), h('div.num.tip', `${st.v} / ${m.goal}`)),
                ...rewardIcons(m.reward),
                st.claimed ? h('span.claimed-t', L('완료')) : h('button.btn.small' + (st.done ? '.gold' : '.off'), { onclick: () => { if (!st.done) { notYet(st.v, m.goal); return; } click(); const g = Meta.claimWeekly(p, m.id); Save.save(); showHub('rewards'); showGot(L('주간 임무'), g); } }, L('받기'))));
        });
        const all = WEEKLY_MISSIONS.every(m => p.weeklyM.claimed[m.id]);
        ms.appendChild(h('div.mrow.bonus', h('div', { style: { flex: 1 } }, L('주간 임무 모두 완료')), ...rewardIcons(WEEKLY_BONUS),
            p.weeklyM.bonus ? h('span.claimed-t', L('완료')) : h('button.btn.small' + (all ? '.gold' : '.off'), { onclick: () => { if (!all) { toast(L('임무를 모두 완료하고 보상을 받으면 받을 수 있습니다')); return; } click(); const g = Meta.claimWeeklyBonus(p); Save.save(); showHub('rewards'); showGot(L('주간 보너스'), g); } }, L('받기'))));
        const c = ((Math.max(1, p.login.count) - 1) % 28) + 1;
        const att = h('div.inset.rw-col', h('h3', img('i_calendar', '.icon'), L('28일 출석'), h('span.tip', { style: { marginLeft: '8px' } }, L('이번 주기 {0}일째', p.login.count ? c : 0))),
            h('div.tip', L('출석할 때마다 7일 순환 보상과 함께, 7·14·21·28일째에 큰 보상을 받습니다.')),
            ...Object.entries(ATTEND28).map(([day, rw]) => h('div.mrow' + (+day <= c && p.login.count ? '.claimed' : ''), h('div', { style: { flex: 1 } }, L('{0}일째', day)), ...rewardIcons(rw),
                h('span' + (+day <= c && p.login.count ? '.claimed-t' : '.muted'), +day <= c && p.login.count ? L('받음') : L('{0}일 남음', day - c)))));
        win.appendChild(h('div.rw', ms, att));
        root().appendChild(win);
    }

    function tabAch() {
        const p = Save.p;
        const win = h('div.panel.win');
        const done = ACHIEVEMENTS.filter(a => p.ach[a.id]).length;
        win.appendChild(h('div.tabhead', { style: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '6px' } }, h('h2', { style: { margin: 0 } }, L('업적')), h('div.chip', `${done} / ${ACHIEVEMENTS.length}`),
            h('button.btn.small.gold', { onclick: () => { click(); const got = []; for (const a of ACHIEVEMENTS) { const g = Meta.claimAch(p, a.id); if (g) got.push(...g); } Save.save(); showHub('rewards'); if (got.length) showGot(L('업적 보상'), got); else toast(L('받을 업적 보상이 없습니다')); } }, L('모두 받기'))));
        // unclaimed-done first, then in progress, then claimed
        const order = ACHIEVEMENTS.map(a => ({ a, st: Meta.achState(p, a) })).sort((x, y) => (y.st.done && !y.st.claimed) - (x.st.done && !x.st.claimed) || x.st.claimed - y.st.claimed);
        win.appendChild(h('div.achgrid', order.map(({ a, st }) => h('div.mrow' + (st.claimed ? '.claimed' : st.done ? '.ready' : ''),
            h('div', { style: { flex: 1 } }, h('div', h('span.muted', `[${a.group}] `), a.name), h('div.bar', h('i', { style: { width: (st.v / a.goal * 100) + '%' } })), h('div.num.tip', `${fmt(st.v)} / ${fmt(a.goal)}`)),
            ...rewardIcons(a.reward),
            st.claimed ? h('span.claimed-t', L('완료')) : h('button.btn.small' + (st.done ? '.gold' : '.off'), { onclick: () => { if (!st.done) { notYet(st.v, a.goal); return; } click(); const g = Meta.claimAch(p, a.id); Save.save(); showHub('rewards'); showGot(L('업적 보상'), g); } }, L('받기'))))));
        root().appendChild(win);
    }

    function tabCodex() {
        const p = Save.p;
        const win = h('div.panel.win');
        const pts = codexPoints(p);
        win.appendChild(h('div.tabhead', { style: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '6px' } }, h('h2', { style: { margin: 0 } }, L('몬스터 도감')),
            h('div.chip', L('도감 점수 {0}', pts)), h('div.chip', L('모든 피해 +{0}%', (pts * CODEX.perPt * 100).toFixed(1))),
            h('div.tip', L('적을 {0}마리 처치할 때마다 점수가 오릅니다.', CODEX.tiers.join(' / ')) + ' · ' + L('보스는 {0}마리', CODEX.bossTiers.join(' / ')))));
        const kinds = Object.keys(ENEMIES).filter(k => k !== 'beetlet' && k !== 'ember');
        win.appendChild(h('div.codexgrid', kinds.map(k => {
            const n = (p.codex || {})[k] || 0, lv = Meta.codexLevel(p, k), seen = n > 0;
            const nextT = Meta.codexTiers(k)[lv];
            return h('div.cx' + (seen ? '' : '.unseen') + (ENEMIES[k].boss ? '.boss' : ''), { onclick: () => { click(); if (seen) UI.enemyInfo(k); else toast(L('아직 만나지 못한 적입니다')); } },
                Art.domCanvas(Art.enemy(k, 0), ENEMIES[k].boss ? 1.1 : 1.8),
                h('div.cxn', seen ? ENEMIES[k].name : '???'),
                h('div.cxs', '★'.repeat(lv) + '☆'.repeat(3 - lv)),
                h('div.tip', nextT ? `${fmt(n)} / ${fmt(nextT)}` : L('{0} 처치', fmt(n))));
        })));
        root().appendChild(win);
    }

    Object.assign(UI, { tabRewards, tabWeekly, tabAch, tabCodex });
})();
