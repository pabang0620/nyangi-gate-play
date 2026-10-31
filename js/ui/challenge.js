'use strict';
// UI - 도전 tab: endless wall + season league, daily dungeons, boss raid.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const root = (...a) => UI.root(...a);
    const S = UI.S;
    const ico = (...a) => UI.ico(...a);
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const starsStr = (...a) => UI.starsStr(...a);
    const rewardCell = (...a) => UI.rewardCell(...a);
    const modal = (...a) => UI.modal(...a);
    const showGot = (...a) => UI.showGot(...a);
    const rewardIcons = (...a) => UI.rewardIcons(...a);
    const showHub = (...a) => UI.showHub(...a);
    const ensureProfile = (...a) => UI.ensureProfile(...a);
    const tierBadge = (...a) => UI.tierBadge(...a);
    const tierName = (...a) => UI.tierName(...a);
    const rankList = (...a) => UI.rankList(...a);
    const myRankLine = (...a) => UI.myRankLine(...a);
    const leagueRows = (...a) => UI.leagueRows(...a);
    const profileModal = (...a) => UI.profileModal(...a);


    // what each challenge needs and how it is introduced the first time (need = stage index that must be cleared).
    // 랭킹 opens with the wall (it shows the wall/cup/raid boards).
    const CH_MODES = [
        { id: 'wall', need: ENDLESS.unlockStage, open: p => (p.stars[ENDLESS.unlockStage] || 0) > 0, name: () => L('무한의 성벽'), cards: () => [
            [img('i_skull'), L('무한의 성벽'), L('끝없이 오는 적을 몇 웨이브까지 버티는지 겨뤄요.')],
            [img('i_gem'), L('보상'), L('웨이브마다 은화, 10웨이브 기록마다 보석!')],
            [img('i_league'), L('시즌 리그'), L('2주마다 기록으로 순위를 겨뤄요.')]] },
        { id: 'dungeon', need: DUNGEON.tiers[0].need, open: p => Meta.dungeonUnlocked(p), name: () => L('요일 도전'), cards: () => [
            [img('i_calendar'), L('요일 도전'), L('요일마다 은화·강화석·보석 던전이 열려요.')],
            [img('i_stone'), L('하루 {0}번', DUNGEON.entries), L('별 3개로 깬 단계는 소탕으로 바로 받아요.')]] },
        { id: 'raid', need: RAID.unlockStage, open: p => Meta.raidUnlocked(p), name: () => L('보스 토벌전'), cards: () => [
            [img('i_skull'), L('보스 토벌전'), L('거대 보스에게 피해를 최대한 줘요.')],
            [img('i_gem'), L('주 {0}번', RAID.tries), L('피해량만큼 보상을 받아요. 보스는 매주 월요일 05:00에 갱신돼요.')]] },
        { id: 'online', need: RAID_ON.diffs[0].eq, open: p => (p.stars[RAID_ON.diffs[0].eq] || 0) > 0, name: () => L('레이드'), cards: () => [
            [img('i_raid'), L('레이드'), L('다른 냥이들과 함께 거대 보스를 잡아요.')],
            [img('i_skull'), L('세 가지 레이드'), L('파티 레이드 · 월드 보스 · 실시간 협동 디펜스')],
            [img('i_medal'), L('보상 카드'), L('주 1번 카드 4장 중 1장! 훈장으로 신화 장비를 사요.')]] },
        { id: 'tower', need: TOWER.unlockIdx, open: p => Tower.unlocked(p), name: () => L('심연의 탑'), cards: () => [
            [img('i_max'), L('심연의 탑'), L('끝없이 이어지는 층을 올라가요. 지면 처음부터!')],
            [img('i_star'), L('축복'), L('층을 깰 때마다 축복 3개 중 하나를 골라 점점 강해져요.')],
            [img('i_skull'), L('변이'), L('층마다 변이가 붙어요. 최고 기록을 새로 쓰면 큰 보상!')]] },
        { id: 'cup', need: CUP.unlockStage, open: p => Meta.cupUnlocked(p), name: () => L('주간 공방전'), cards: () => [
            [img('i_league'), L('주간 공방전'), L('모두 같은 지도·같은 제한으로 점수를 겨뤄요.')],
            [img('i_ticket'), L('하루 {0}번', CUP.attempts), L('매주 월요일 순위대로 보상!')]] },
        { id: 'rank', need: ENDLESS.unlockStage, open: p => (p.stars[ENDLESS.unlockStage] || 0) > 0, name: () => L('랭킹'), cards: () => [
            [img('i_league'), L('랭킹'), L('다른 냥이들과 기록을 비교해요.')]] },
    ];

    // 권장 전투력 (Meta.recFor): one line with my power (colored when short) and the recommended one
    function powerLine(rec) {
        const mine = Meta.power(Save.p);
        return h('div.recp', h('span' + (mine >= rec ? '.ok' : '.low'), L('내 전투력 {0}', fmt(mine))), h('span.recp-r', L('권장 전투력 {0}', fmt(rec))));
    }
    // start right away, or ask first when my power is below the recommended one
    function powerGate(rec, go) {
        const mine = Meta.power(Save.p);
        if (mine >= rec) { go(); return; }
        UI.confirmBox(L('전투력이 부족해요. 그래도 도전할까요?') + '\n' + L('내 전투력 {0}', fmt(mine)) + ' / ' + L('권장 전투력 {0}', fmt(rec)), go);
    }

    // endless ---------------------------------------------------
    // 도전 tab: 무한의 성벽 · 요일 도전 · 보스 토벌전 (PLAN_V2 1.3)
    function tabEndless() {
        const p = Save.p; metaEnsure(p);
        S.ctab = S.ctab || 'wall';
        const names = { online: L('레이드'), wall: L('무한의 성벽'), dungeon: L('요일 도전 {0}/{1}', Meta.dungeonLeft(p), DUNGEON.entries), raid: L('보스 토벌전 {0}/{1}', Math.max(0, RAID.tries - p.raid.runs), RAID.tries), cup: L('주간 공방전 {0}/{1}', Meta.cupLeft(p), CUP.attempts), rank: L('랭킹'), tower: L('심연의 탑') };
        const seen = p.seenTips || {};
        const sub = h('div.subtabs', CH_MODES.map(m => {
            const open = m.open(p);
            const b = h('button.btn.small' + (S.ctab === m.id ? '.gold' : '.ghost') + (open ? '' : '.ch-locked'), { onclick: () => { click(); S.ctab = m.id; showHub('endless'); } },
                open ? null : img('i_lock', '.icon'), open ? names[m.id] : m.name());
            if (open && !seen['ch_' + m.id]) b.appendChild(h('span.badge', 'NEW'));   // opened but its intro not seen yet
            return b;
        }));
        root().appendChild(sub);
        // locked: one line saying what opens it. Opened for the first time: a few short cards, then the content
        const mode = CH_MODES.find(m => m.id === S.ctab) || CH_MODES[0];
        if (!mode.open(p)) {
            root().appendChild(h('div.panel.win.ch-lockwin', img('i_lock', '.ch-lockimg'), h('div.title-t', mode.name()),
                h('div.ch-lockline', L('{0} 클리어하면 열려요', stageLabel(mode.need))), h('div.tip', mode.cards()[0][2])));
            return;
        }
        if (!seen['ch_' + mode.id]) setTimeout(() => UI.cardsOnce('ch_' + mode.id, mode.cards(), () => { if (S.screen === 'hub' && S.tab === 'endless') showHub('endless'); }), 60);
        if (S.ctab === 'dungeon') return tabDungeon();
        if (S.ctab === 'raid') return tabRaid();
        if (S.ctab === 'online') return UI.tabRaidOn();
        if (S.ctab === 'cup') return tabCup();
        if (S.ctab === 'tower') return UI.tabTower();
        if (S.ctab === 'rank') return tabRank();
        const un = (p.stars[ENDLESS.unlockStage] || 0) > 0;
        const rule = Meta.endlessRule();
        const win = h('div.panel.win.summonwin');
        win.classList.add('glass');
        win.classList.add('wallwin');   // even spacing between its rows (css/cat-theme.css)
        win.style.paddingTop = '8px'; win.style.paddingBottom = '8px';
        win.appendChild(h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '14px' } }, h('div.title-t', { style: { fontSize: '32px' } }, L('무한의 성벽')),
            h('div', { style: { color: '#f3e3c3', textShadow: 'var(--stroke-s)' } }, rule.id === 'boss' ? L('5웨이브마다 보스') : L('10웨이브마다 보스')),
            h('div.rulecard', h('b', L('이번 주 규칙: {0}', rule.name)), h('span', ` · ${rule.desc}`))));
        const go = un ? h('button.btn.gold', { style: { fontSize: '22px', padding: '10px 40px', marginLeft: '12px' }, onclick: () => { click(); powerGate(Meta.recFor('wall'), () => Game.startBattle({ endless: true })); } }, L('도전하기'))
            : h('div', { style: { color: '#ff9090' } }, L('1장 보스 "{0}"을(를) 물리치면 열립니다', ENEMIES.ironfang.name));
        win.appendChild(h('div.row', { style: { display: 'flex', gap: '14px', alignItems: 'center' } }, h('div', { style: { fontSize: '22px' } }, L('최고 기록 '), h('span.gold-t', L('{0} 웨이브', p.endlessBest))),
            h('div', { style: { textAlign: 'center' } }, rewardCell('silver', ENDLESS.silverPerWave), h('div.tip', L('웨이브마다'))), h('div', { style: { textAlign: 'center' } }, rewardCell('gem', ENDLESS.gemsPer10), h('div.tip', L('10웨이브 기록마다'))), go));
        const wk = Rewards.endlessWeek(p);
        // the wave milestones open in a popup, one line per wave
        const wkRows = () => ENDLESS.weekly.map(m => {
            const done = wk.claimed.includes(m.wave);
            const r = m.reward;
            const icons = [r.gems && rewardCell('gem', r.gems), r.silver && rewardCell('silver', fmt(r.silver)), r.tickets && rewardCell('i_ticket', r.tickets)].filter(Boolean);
            return h('div.wk-row' + (done ? '.done' : ''), h('b', done ? L('{0}웨이브 ✓', m.wave) : L('{0}웨이브', m.wave)), h('div.wk-ic', icons));
        });
        win.appendChild(h('div.wk-line', h('span', { style: { fontSize: '20px' } }, L('이번 주 구간 보상 '), h('span.gold-t', L('최고 {0} 웨이브', wk.best)), h('span.tip', L(' · 매주 월 05:00 초기화'))),
            h('button.btn.small', { onclick: () => { click(); const d = UI.modal([h('div.title-t', L('이번 주 구간 보상')), h('div.wk-list', wkRows()), h('button.btn', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true }); } }, L('구간 보상 보기'))));
        win.appendChild(powerLine(Meta.recFor('wall')));
        win.appendChild(h('div.tip.norevive', L('이어하기 없음 · 공정한 기록')));
        if (un) win.appendChild(leagueCard(p));
        root().appendChild(win);
    }

    // 시즌 리그 카드 + 순위표 (PLAN_V3 A). 경쟁자는 AI임을 표시한다
    // online league: real division from the server (cached per visit), else the offline AI league below
    let leagueCache = null;
    function onlineLeagueCard(p) {
        const card = h('div.leaguecard', img('i_league', '.lg-ico'));
        const pd = p.league && p.league.pending;   // an AI-league reward left from before going online: still claimable here (the hub badge points at it)
        const claim = pd && h('button.btn.small.gold', { onclick: () => { click(); const g = Meta.claimLeague(p); Save.save(); showHub('endless'); if (g) showGot(L('지난 시즌 {0}위 보상', pd.rank), g); } }, L('지난 시즌 {0}위 보상 받기', pd.rank));
        if (!Online.profile) {
            card.appendChild(h('div', { style: { flex: 1 } }, h('b', L('온라인 시즌 리그 ')), h('span', L('· 같은 등급 30명과 2주 동안 무한의 성벽 기록으로 겨룹니다'))));
            card.appendChild(h('button.btn.small.gold', { onclick: () => { click(); ensureProfile(() => showHub('endless')); } }, L('참가하기')));
            if (claim) card.appendChild(claim);
            return card;
        }
        const body = h('div', { style: { flex: 1, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } }, h('b', L('온라인 시즌 리그 ')), tierBadge(Online.profile.tier || 0), UI.catLoad(null, 'mini'));
        card.appendChild(body);
        card.appendChild(h('button.btn.small', { onclick: () => { click(); leagueBoard(p); } }, L('순위표')));
        if (claim) card.appendChild(claim);
        Online.league().then(rows => {
            if (!rows) { body.lastChild.textContent = L('불러오지 못했습니다'); return; }
            leagueCache = leagueRows(rows, p);
            const me = leagueCache.find(r => r.me), cfg = Online.cfg && Online.cfg.league, n = leagueCache.length;
            body.lastChild.remove();
            body.appendChild(h('span', h('span.gold-t', L('{0}위', me ? me.rank : '-')), L(' / {0} · 이번 시즌 {1} 웨이브 · {2}일 남음', n, me ? me.score : 0, Math.max(0, Math.ceil(LEAGUE.days - Meta.leagueDay(Meta.leagueSeason()))))));
            if (cfg) body.appendChild(h('span.tip', L('상위 {0}명 승급 · 하위 {1}명 강등', cfg.promote, cfg.demote)));
        });
        return card;
    }
    function leagueCard(p) {
        if (Online.on) return onlineLeagueCard(p);
        const lg = Meta.leagueEnsure(p), B = Meta.leagueBoard(p), tier = Meta.leagueTier(B.rank);
        const card = h('div.leaguecard',
            img('i_league', '.lg-ico'),
            h('div', { style: { flex: 1, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
                h('div', h('b', L('시즌 리그 ')), h('span.gold-t', L('{0}위', B.rank)), h('span', L(' / {0} · 이번 시즌 {1} 웨이브 · {2}일 남음', LEAGUE.rivals + 1, lg.best, B.daysLeft))),
                h('div.tip', L('예상 보상({0}) ', tier.name), ...rewardIcons(tier.reward))),
            h('button.btn.small', { onclick: () => { click(); leagueBoard(p); } }, L('순위표')));
        if (lg.pending) {
            const pd = lg.pending;
            card.appendChild(h('button.btn.small.gold', { onclick: () => { click(); const g = Meta.claimLeague(p); Save.save(); showHub('endless'); if (g) showGot(L('지난 시즌 {0}위 보상', pd.rank), g); } }, L('지난 시즌 {0}위 보상 받기', pd.rank)));
        }
        return card;
    }

    function leagueBoard(p) {
        const B = Online.on && leagueCache ? { rows: leagueCache, daysLeft: Math.max(0, Math.ceil(LEAGUE.days - Meta.leagueDay(Meta.leagueSeason()))), online: true } : Meta.leagueBoard(p);
        const list = h('div.lg-list', B.rows.map(r => h('div.lg-row' + (r.me ? '.me' : ''),
            h('span.lg-rank', `${r.rank}`), B.online && !r.ai ? tierBadge(r.tier || 0) : null, h('span.lg-name', r.me ? L('나') : `${r.name} `, r.tag && !r.me ? h('span.tip', `#${r.tag} `) : null, r.ai ? h('span.lg-ai', 'AI') : null), h('span.lg-score', L('{0} 웨이브', r.score)))));
        const d = modal([h('h2', L('시즌 리그 순위')),
            h('div.tip', B.online ? L('2주마다 새 시즌. 같은 등급의 플레이어와 무한의 성벽 이번 시즌 최고 웨이브로 겨룹니다. 인원이 모자라면 AI가 자리를 채웁니다(AI 표시). 남은 기간 {0}일.', B.daysLeft) : L('2주마다 새 시즌. 무한의 성벽 이번 시즌 최고 웨이브로 순위를 겨룹니다. 경쟁자는 기록에 맞춰 만들어지는 AI입니다. 남은 기간 {0}일.', B.daysLeft)),
            list,
            h('div.lg-rw', LEAGUE.rewards.map(t => h('div', h('b', t.name), ' ', ...rewardIcons(t.reward)))),
            h('button.btn', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
        requestAnimationFrame(() => { const me = list.querySelector('.me'); if (me) me.scrollIntoView({ block: 'center' }); });
    }

    const DUNGEON_DROPS = { silver: ['silver'], stone: ['i_stone'], gem: ['gem', 'i_ticket'] };
    function tabDungeon() {
        const p = Save.p;
        const win = h('div.panel.win');
        const left = Meta.dungeonLeft(p), today = Meta.dungeonKinds();
        win.appendChild(h('div.tabhead', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } },
            h('h2', { style: { margin: 0 } }, L('요일 도전')), h('div.chip', L('오늘 남은 도전 {0}/{1}', left, DUNGEON.entries))));
        if (!Meta.dungeonUnlocked(p)) { win.appendChild(h('div', { style: { color: '#ff9090', margin: '30px', fontSize: '18px' } }, L('1장 보스를 물리치면 열립니다'))); root().appendChild(win); return; }
        // 한 번에 소탕: 오늘 열린 종류 중 별 3개로 깬 가장 높은 단계를 남은 횟수만큼
        const sweepPick = () => { let best = null; for (const k of today) DUNGEON.tiers.forEach((T, t) => { if (Meta.dungeonBest(p, k, t) >= 3 && (!best || t > best.t)) best = { k, t }; }); return best; };
        const sp = sweepPick();
        const sweepAll = () => {
            const got = []; let n = 0;
            while (Meta.dungeonLeft(p) > 0) { const g = Meta.sweep(p, sp.k, sp.t); if (!g) break; got.push(...g); n++; }
            Save.save(); showHub('endless'); if (got.length) showGot(L('{0} {1} {2}번 소탕', DUNGEON.kinds[sp.k].name, DUNGEON.tiers[sp.t].name, n), got);
        };
        if (left && sp) win.firstChild.appendChild(h('button.btn.small.gold', { style: { marginLeft: 'auto' }, onclick: () => {
            click(); UI.confirmBox(L('{0} {1}을(를) {2}번 소탕합니다.\n오늘 남은 도전 횟수를 모두 씁니다.', DUNGEON.kinds[sp.k].name, DUNGEON.tiers[sp.t].name, left), sweepAll);
        } }, L('남은 {0}번 모두 소탕', left)));
        const cols = h('div.dg-cols');
        for (const kind of Object.keys(DUNGEON.kinds)) {
            const K = DUNGEON.kinds[kind], open = today.includes(kind);
            const col = h('div.inset.dg-col' + (open ? (today.length === 1 ? '.wide' : '') : '.closed'), h('div.dg-head', h('div', h('h3', K.name), h('div.tip', K.desc)),
                h('div.dg-drops', ...DUNGEON_DROPS[kind].map(ic => { const c = rewardCell(ic, ''); c.querySelector('.cnt').remove(); return c; }))));   // what it gives, as boxes like the reward box beside 도전
            if (!open) {                                                     // closed today: what it gives stays readable, with when it opens under it
                const days = Object.keys(DUNGEON.byDay).filter(d => DUNGEON.byDay[d].includes(kind)).map(d => [L('일##요일'), L('월##요일'), L('화##요일'), L('수##요일'), L('목##요일'), L('금##요일'), L('토##요일')][d]).join('·');
                col.appendChild(h('div.dg-shut', h('b', L('오늘은 닫혀 있습니다')), h('div.tip', L('열리는 날: {0}', days))));
                cols.appendChild(col);
                continue;
            }
            const rows = h('div.dg-rows');
            col.appendChild(rows);
            DUNGEON.tiers.forEach((T, t) => {
                const tOpen = Meta.tierOpen(p, t), best = Meta.dungeonBest(p, kind, t);
                if (!tOpen && t > 0 && !Meta.tierOpen(p, t - 1)) return;          // show only the next locked tier as a teaser
                const rw = DUNGEON.reward(kind, t, 3);
                const row = h('div.dg-row' + (tOpen ? '' : '.lock'),
                    tOpen ? null : h('div.lock-over.sm', img('i_lock', '.lock-big'), h('b', L('{0} 클리어 후 열립니다', stageLabel(T.need)))),
                    h('div.dg-nm', h('b', T.name), h('div', starsStr(best)), h('div.recp.sm', h('span' + (Meta.power(p) >= Meta.recFor('dungeon', t) ? '.ok' : '.low'), L('권장 전투력 {0}', fmt(Meta.recFor('dungeon', t)))))),
                    h('div.dg-rw', ...rewardIcons(rw)),
                    h('div.dg-btns',
                        h('button.btn.small' + (open && tOpen && left ? '.gold' : '.off'), { onclick: () => {
                            if (!tOpen) { toast(L('{0} 클리어 후 열립니다', stageLabel(T.need))); return; }
                            if (!open || !left) { toast(open ? L('오늘 도전 횟수를 다 썼습니다') : L('오늘은 닫혀 있습니다')); return; }
                            click(); powerGate(Meta.recFor('dungeon', t), () => Game.startBattle({ dungeon: kind, tier: t }));
                        } }, L('도전')),
                        best >= 3 ? h('button.btn.small' + (open && left ? '' : '.off'), { onclick: () => {
                            if (!open || !left) { toast(open ? L('오늘 도전 횟수를 다 썼습니다') : L('오늘은 닫혀 있습니다')); return; }
                            click(); const g = Meta.sweep(p, kind, t); Save.save(); showHub('endless'); if (g) showGot(L('소탕 완료'), g);
                        } }, L('소탕')) : null));
                rows.appendChild(row);
            });
            cols.appendChild(col);
        }
        win.appendChild(cols);
        root().appendChild(win);
    }

    function tabRaid() {
        const p = Save.p;
        const win = h('div.panel.win');
        win.appendChild(h('div.tabhead', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } },
            h('h2', { style: { margin: 0 } }, L('보스 토벌전')), h('div.chip', L('이번 주 남은 도전 {0}/{1}', Math.max(0, RAID.tries - p.raid.runs), RAID.tries)),
            h('div.tip', L('피해량만큼 보상을 받아요. 보스는 매주 월요일 05:00에 갱신돼요.'))));
        if (!Meta.raidUnlocked(p)) { win.appendChild(h('div', { style: { color: '#ff9090', margin: '30px', fontSize: '18px' } }, L('2장 보스를 물리치면 열립니다'))); root().appendChild(win); return; }
        const kind = Meta.raidBoss(p), si = Meta.raidStage(p, kind), ref = Meta.raidRef(kind, si), tierNow = Meta.raidTierOf(kind, p.raid.best, si);
        const left = h('div.inset.raidleft',
            h('div.title-t', { style: { fontSize: '22px' } }, `${ENEMIES[kind].title} ${ENEMIES[kind].name}`),
            (c => { c.style.maxHeight = '118px'; c.style.maxWidth = '220px'; return c; })(Art.domCanvas(Art.enemy(kind, 0), 3.2)),
            (() => { const mine = Meta.power(p), rec = Meta.recPower(si); return h('div.rd-power', h('span' + (mine >= rec ? '.ok' : '.low'), L('내 전투력 {0}', fmt(mine))), h('span.tip', L('권장 전투력 {0}', fmt(rec)))); })(),
            h('div', L('최고 피해 '), h('span.gold-t', fmt(p.raid.best)), ` · `, h('span.gold-t', `${tierNow} / ${RAID.tiers.length}`), (LANG === 'ko' ? '' : ' ') + L('단계')),
            h('button.btn.gold' + (p.raid.runs < RAID.tries ? '' : '.off'), { style: { fontSize: '20px', minWidth: '200px' }, onclick: () => {
                if (p.raid.runs >= RAID.tries) { toast(L('이번 주 도전 횟수를 다 썼습니다')); return; }
                click(); powerGate(Meta.recPower(si), () => Game.startBattle({ raid: true }));
            } }, L('토벌 시작')));
        const list = h('div.inset.raidtiers', RAID.tiers.map((T, i) => h('div.mrow' + (p.raid.claimed.includes(i) ? '.claimed' : ''),
            h('div.rt-nm', h('b', L('{0}단계', i + 1)), h('div.tip', L('피해 {0}', fmt(Math.round(T.x * ref))))),
            ...rewardIcons(T.reward),
            h('span' + (p.raid.claimed.includes(i) ? '.claimed-t' : '.muted'), p.raid.claimed.includes(i) ? L('받음') : ''))));
        win.appendChild(h('div', { style: { display: 'flex', gap: '14px', flex: '1', minHeight: '0' } }, left, list));
        if (Online.on) {
            const line = UI.catLoad(null, 'mini');
            left.insertBefore(line, left.lastChild);
            Online.board('raid', 1).then(v => { line.replaceWith(v ? myRankLine(v, L('피해')) : h('div.tip', L('랭킹을 불러오지 못했습니다'))); });
        }
        root().appendChild(win);
    }

    // 주간 공방전 ------------------------------------------------
    // what this week's restriction means (banned tower, or the same wave rule the endless wall uses)
    function cupRuleDesc(c) {
        if (c.ban) return L('이번 주에는 {0}을(를) 지을 수 없습니다. 다른 탑으로 막아 보세요', TOWERS[c.ban].name);
        const r = ENDLESS_RULES.find(x => x.id === c.rule);
        return r ? r.desc : '';
    }

    function tabCup() {
        const p = Save.p, c = Meta.cupWeek(), st = Meta.cupState(p), left = Meta.cupLeft(p);
        const win = h('div.panel.win');
        win.appendChild(h('div.tabhead', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' } },
            h('h2', { style: { margin: 0 } }, L('주간 공방전')), h('div.chip', L('오늘 남은 도전 {0}/{1}', left, CUP.attempts)),
            h('div.tip', L('모든 냥이가 같은 지도·같은 웨이브·같은 제한으로 겨룹니다. 매주 월요일 05:00에 바뀌고, 이번 주 최고 점수로 순위가 정해집니다.'))));
        if (!Meta.cupUnlocked(p)) { win.appendChild(h('div', { style: { color: '#ff9090', margin: '30px', fontSize: '18px' } }, L('{0} 클리어 후 열립니다', stageLabel(CUP.unlockStage)))); root().appendChild(win); return; }
        const rw = (Online.cfg && Online.cfg.weekly && Online.cfg.weekly.cup)
            ? Online.cfg.weekly.cup.map(x => [x.top >= 1 ? L('참가') : L('상위 {0}%', Math.round(x.top * 100)), x.reward]) : CUP.rewards;
        const left2 = h('div.inset.cupleft',
            h('div.rulecard', h('b', L('이번 주 제한: {0}', c.name)), h('span', ` · ${cupRuleDesc(c)}`)),
            h('div.cup-meta', h('span', L('지도: {0} · 최대 {1}웨이브', CHAPTERS.find(x => x.theme === c.theme) ? CHAPTERS.find(x => x.theme === c.theme).name : c.theme, CUP.maxWaves)),
                UI.helpBtn(L('점수 계산'), L('점수 = 버틴 웨이브 × 1000 + 처치 × 5 + 남은 목숨 × 100 (+30웨이브 완주 5000)'), '.mob-q')),
            h('div', L('이번 주 내 최고 '), h('span.gold-t', L('{0}점', fmt(st.best))), st.bestWave ? L(' ({0}웨이브)', st.bestWave) : '', h('span.tip.norevive', ' · ' + L('이어하기 없음 · 공정한 기록'))),
            h('button.btn.gold' + (left ? '' : '.off'), { style: { fontSize: '20px' }, onclick: () => {
                if (!left) { toast(L('오늘 도전 횟수를 다 썼습니다')); return; }
                click(); powerGate(Meta.recFor('cup'), () => Game.startBattle({ cup: true }));
            } }, L('도전하기')),
            powerLine(Meta.recFor('cup')),
            h('div.tip', L('주간 순위 보상 (월요일 정산)')),
            h('div.cup-rw', rw.map(([n, r]) => h('div', h('b', n), ...rewardIcons(r)))));
        const right = h('div.inset', { style: { flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('b', L('이번 주 순위')));
        if (!Online.on) right.appendChild(h('div.muted', { style: { margin: '16px' } }, Online.enabled ? L('인터넷에 연결되면 순위가 보여요') : L('온라인 기능이 설정되면 다른 냥이와 순위를 겨룹니다')));
        else if (!Online.profile) right.appendChild(h('button.btn.small.gold', { style: { margin: '16px auto' }, onclick: () => { click(); ensureProfile(() => showHub('endless')); } }, L('닉네임 만들고 순위 보기')));
        else { const ph = UI.catLoad(); right.appendChild(ph); Online.board('cup', 30).then(v => { ph.replaceWith(h('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 } }, myRankLine(v, L('점')), rankList(v, L('점')))); }); }
        win.appendChild(h('div', { style: { display: 'flex', gap: '12px', flex: 1, minHeight: 0 } }, left2, right));
        root().appendChild(win);
    }

    // 랭킹 -------------------------------------------------------
    function tabRank() {
        const win = h('div.panel.win');
        S.rkind = S.rkind || 'overall';
        const kinds = [['overall', L('종합 Top 100'), L('점')], ['wall', L('명예의 전당 (무한의 성벽)'), L('웨이브')], ['cup', L('주간 공방전'), L('점')], ['raid', L('토벌전 피해'), L('피해')], ['tower', L('심연의 탑'), L('층')]];
        win.appendChild(h('div.tabhead.rk-head', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
            h('h2', { style: { margin: 0 } }, L('랭킹')), ...kinds.map(([id, nm]) => h('button.btn.small' + (S.rkind === id ? '.gold' : '.ghost'), { onclick: () => { click(); S.rkind = id; showHub('endless'); } }, nm)),
            Online.on && Online.profile ? h('button.btn.small', { style: { marginLeft: 'auto' }, onclick: () => { click(); profileModal(); } }, L('내 프로필')) : null));
        const box = h('div.inset', { style: { flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', minHeight: 0 } });
        win.appendChild(box);
        root().appendChild(win);
        if (!Online.on) { box.appendChild(h('div.muted', { style: { margin: '20px' } }, Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 랭킹을 준비하고 있습니다'))); return; }
        if (!Online.profile) { box.appendChild(h('button.btn.gold', { style: { margin: '20px auto' }, onclick: () => { click(); ensureProfile(() => showHub('endless')); } }, L('닉네임 만들고 랭킹 보기'))); return; }
        const [id, , unit] = kinds.find(k => k[0] === S.rkind);
        box.appendChild(UI.catLoad());
        (id === 'overall' ? Online.overall(100) : Online.board(id, 50)).then(v => { box.innerHTML = ''; box.appendChild(myRankLine(v, unit)); box.appendChild(rankList(v, unit)); });
    }

    Object.assign(UI, { powerLine, powerGate, tabEndless, leagueCard, leagueBoard, tabDungeon, tabRaid, tabCup, tabRank });
})();
