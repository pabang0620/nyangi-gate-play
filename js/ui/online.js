'use strict';
// UI - online pieces: profile & account (nickname, Google link, cloud save), cloud-save conflict choice,
// league tier badges, ranking lists. Data comes from Online (js/online/online.js).
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const modal = (...a) => UI.modal(...a);
    const showHub = (...a) => UI.showHub(...a);

    const TIER_COLOR = ['#c08050', '#c8d0e0', '#f2c14e', '#7fe0d0', '#9ad0ff', '#ff8ad8'];
    function tierName(t) { const n = (Online.cfg && Online.cfg.league && Online.cfg.league.tiers) || [L('브론즈'), L('실버'), L('골드'), L('플래티넘'), L('다이아'), L('마스터')]; return L(n[t] || n[0]); }   // server config sends Korean names
    function tierBadge(t) { return h('span.tierbadge', { style: { borderColor: TIER_COLOR[t] || TIER_COLOR[0], color: TIER_COLOR[t] || TIER_COLOR[0] } }, tierName(t)); }
    function onlineStatusText() {
        if (!Online.enabled) return L('오프라인 모드 (서버 미설정)');
        return { connecting: L('연결 중…'), online: L('온라인'), error: L('서버에 연결하지 못했습니다 (오프라인으로 계속)') }[Online.status] || L('오프라인');
    }

    // nickname needed before rankings/league: run then() once a profile exists
    function ensureProfile(then) {
        if (!Online.on) { toast(Online.enabled ? L('서버에 연결되지 않았습니다') : L('온라인 기능이 아직 설정되지 않았습니다')); return; }
        if (Online.profile) { then && then(); return; }
        profileModal(then);
    }

    function profileModal(then) {
        const p = Save.p, pr = Online.profile;
        const input = h('input.nick', { value: pr ? pr.name : (p.profileName || ''), maxLength: 12, placeholder: L('닉네임 (2~12자)') });
        const err = h('div.tip', { style: { color: '#a8401a', minHeight: '20px' } });
        const linked = Online.isLinked();
        const d = modal([h('h2', L('프로필 · 계정')),
            h('div.prof-row', img(heroPortrait(p.hero, p.shop && p.shop.skin[p.hero]), '.prof-pic'),
                h('div', { style: { flex: 1 } },
                    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, input, pr ? h('span.tip', '#' + pr.tag) : null),
                    h('div.tip', L('랭킹과 리그에서 다른 냥이에게 보이는 이름과 대표 영웅(현재 영웅·스킨)입니다.')),
                    pr ? h('div', { style: { marginTop: '6px' } }, L('리그 등급 '), tierBadge(pr.tier || 0)) : null)),
            err,
            h('div.row', { style: { gap: '10px', justifyContent: 'center' } },
                h('button.btn.gold', { onclick: async () => {
                    click();
                    if (!Online.on) { err.textContent = L('서버에 연결되지 않았습니다'); return; }
                    try {
                        const sk = p.shop && p.shop.skin ? p.shop.skin[p.hero] : null;
                        await Online.setProfile(input.value.trim(), p.hero, sk); Save.save();
                        d.remove(); toast(L('프로필을 저장했습니다')); if (then) then(); else showHub(UI.S.tab);
                    } catch (e) { err.textContent = e.message; }
                } }, L('저장'))),
            h('div.inset', { style: { padding: '10px', marginTop: '8px', lineHeight: 1.7 } },
                h('div', L('서버 '), h('b', onlineStatusText())),
                h('div', L('계정 '), h('b', !Online.on ? '-' : linked ? L('Google 연동됨') : L('게스트')), L(' · 진행은 자동으로 클라우드에 저장됩니다')),
                Online.on && !linked ? h('div.tip', L('게스트 계정은 앱을 지우거나 기기를 바꾸면 진행을 잃을 수 있습니다. Google 계정을 연동하면 어느 기기에서든 이어서 할 수 있습니다.')) : null,
                Online.on && !linked ? h('button.btn.small', { style: { marginTop: '6px' }, onclick: async () => {
                    click();
                    try { await Online.linkGoogle(); d.remove(); toast(L('Google 계정을 연동했습니다')); } catch (e) { err.textContent = e.message || String(e); }
                } }, L('Google 계정 연동')) : null),
            Online.on ? h('button.btn.small.red', { style: { marginTop: '8px' }, onclick: () => {
                click();
                UI.confirmBox(L('계정과 서버의 모든 데이터(프로필, 클라우드 저장, 랭킹 기록)를 지우고\n이 기기의 진행도 처음부터 다시 시작합니다.\n되돌릴 수 없습니다. 결제 내역은 Google Play에 남습니다.'), async () => {
                    try { await Online.deleteAccount(); } catch (e) { toast(e.message); }
                });
            } }, L('계정 및 데이터 삭제')) : null,
            h('button.btn.ghost', { style: { marginTop: '8px' }, onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    // policy pages bundled with the game (policy/*.html, also hosted publicly for the store listing)
    // policy pages: Korean originals in policy/, English translations in policy/en/ for every other language
    const POLICY_EN = ['privacy.html', 'terms.html', 'operation.html', 'refund.html', 'opensource.html'];
    function policyModal(file, title) {
        const src = 'policy/' + (LANG !== 'ko' && POLICY_EN.includes(file) ? 'en/' : '') + file;
        const d = modal([h('h2', title), h('iframe.policy-frame', { src }), h('button.btn', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }
    // 확률 정보 (게임산업법 확률형 아이템 표시): summon, gear drops, enhancement
    function probModal() {
        const pct = v => (Math.round(v * 1000) / 10) + '%';
        const row = (k, v) => h('tr', h('td', k), h('td', v));
        const tbl = (head, rows) => h('table.prob', h('tr', ...head.map(x => h('th', x))), ...rows);
        const names = RARITY.map(r => r.name);
        const d = modal([h('h2', L('확률 정보')),
            h('div.prob-wrap',
                h('b', L('장비 소환 (1회 보석 ') + SUMMON.cost1 + L(', 10회 ') + SUMMON.cost10 + ')'),
                tbl([L('등급'), L('확률')], names.map((n, i) => row(n, SUMMON.table[i] + '%'))),
                h('div.tip', L('{0}번째 소환까지 전설 등급 이상이 나오지 않으면 전설 확정', SUMMON.pity)),
                h('div.tip', L('장비 종류: 전체(무작위) 소환은 무기·갑옷·부적 각 33.3%, 종류를 고르면 그 종류 100%. 등급 확률과 가격은 같습니다.')),
                h('b', L('스킨 소환 (1회 보석 {0}, 10회 {1})', SKIN_SUMMON.cost1, SKIN_SUMMON.cost10)),
                tbl([L('등급'), L('확률'), L('스킨 1종당'), L('중복 시')], SKIN_SUMMON.table.map((v, r) => { const pool = skinPool(r);
                    return h('tr', h('td', names[r]), h('td', v + '%'), h('td', (Math.round(v / pool.length * 1000) / 1000) + '%'), h('td', L('보석 {0}', SKIN_SUMMON.dupGems[r]))); })),
                h('div.tip', L('{0}번째 소환까지 전설 등급이 나오지 않으면 전설 확정', SKIN_SUMMON.pity)),
                h('div.tip', L('같은 등급 안의 스킨은 모두 같은 확률입니다. 성장 패스 스킨은 나오지 않습니다.')),
                h('div.prob-skins', [0, 1, 2, 3].map(r => h('div', h('b', { style: { color: RARITY[r].color, textShadow: 'var(--stroke-s)' } }, names[r] + ': '), skinPool(r).map(id => skinById(id).name).join(', ')))),
                h('div.tip', L('연속 소환은 10회 소환을 반복하는 것으로, 확률과 확정 횟수는 같습니다.')),
                h('b', L('적 처치 시 장비 등급 (장비가 떨어졌을 때)')),
                tbl([L('등급'), L('일반 적'), L('정예'), L('보스')], names.map((n, i) => h('tr', h('td', n), h('td', DROP.table.normal[i] + '%'), h('td', DROP.table.elite[i] + '%'), h('td', DROP.table.boss[i] + '%')))),
                h('b', L('장비 강화 성공 확률')),
                tbl([L('단계'), L('성공')], ENHANCE.rate.map((r, i) => row(`+${i} → +${i + 1}`, pct(r) + (i >= ENHANCE.dropFrom ? L(' (실패 시 1단계 하락)') : '') + (i >= ENHANCE.destroyFrom ? L(' · 파괴 {0}', destroyPct(i)) : ''))))),
            h('button.btn', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    // another device saved later: keep which?
    function cloudChoice(remote, local, cb) {
        const sum = s => { let st = 0, hs = 0; for (const k in s.stars || {}) st += s.stars[k]; for (const k in s.hstars || {}) hs += s.hstars[k];
            const lv = Math.max(...Object.values(s.heroes || { a: { lv: 1 } }).map(x => x.lv)); return L('별 {0}{1} · 영웅 Lv.{2} · 보석 {3}', st, hs ? L(' · 영웅 별 ') + hs : '', lv, fmt(s.gems || 0)); };
        const when = ms => ms ? new Date(ms).toLocaleString('ko-KR') : '-';
        const d = modal([h('h2', L('클라우드 저장')),
            h('div', { style: { margin: '6px 0 10px', textAlign: 'center' } }, L('다른 기기에서 더 최근에 저장한 진행이 있습니다. 어느 쪽으로 할까요?')),
            h('div.row', { style: { gap: '12px' } },
                h('div.inset.cloudopt', h('b', L('클라우드')), h('div', sum(remote)), h('div.tip', when(remote.savedMs)),
                    h('button.btn.gold', { onclick: () => { click(); d.remove(); cb(true); } }, L('클라우드 불러오기'))),
                h('div.inset.cloudopt', h('b', L('이 기기')), h('div', sum(local)), h('div.tip', when(local.savedMs)),
                    h('button.btn', { onclick: () => { click(); d.remove(); cb(false); } }, L('이 기기 유지')))),
            h('div.tip', L('선택하지 않은 쪽의 진행은 덮어쓰여 사라집니다.'))]);
    }

    // a ranking list from Online.board(): rank, tier, name#tag, value
    function rankList(view, unit, fmtValue = v => fmt(v)) {
        if (!view) return h('div.muted', { style: { margin: '20px' } }, Online.enabled ? L('랭킹을 불러오지 못했습니다') : L('온라인 기능이 아직 설정되지 않았습니다'));
        if (!view.top.length) return h('div.muted', { style: { margin: '20px' } }, L('아직 기록이 없습니다. 첫 기록의 주인공이 되어 보세요!'));
        return h('div.lg-list.rank-list', view.top.map(r => h('div.lg-row' + (r.me ? '.me' : ''),
            h('span.lg-rank', `${r.rank}`), img(heroPortrait(r.hero, r.skin), '.rk-pic'), tierBadge(r.tier || 0),
            h('span.lg-name', `${r.name}`, h('span.tip', ` #${r.tag}`)), h('span.lg-score', `${fmtValue(Number(r.value))} ${unit}`))));
    }
    function myRankLine(view, unit, fmtValue = v => fmt(v)) {
        if (!view || !view.me) return h('div.tip', L('이번 기간 기록 없음'));
        const pct = view.total ? Math.max(1, Math.round(view.me.rank / view.total * 100)) : 0;
        return h('div', L('내 순위 '), h('span.gold-t', L('{0}위', view.me.rank)), L(' / {0}명 (상위 {1}%) · {2} {3}', view.total, pct, fmtValue(Number(view.me.value)), unit));
    }

    // league board rows: real division members first; small divisions are topped up with labelled AI rivals
    function leagueRows(rows, p) {
        const out = rows.map(r => ({ name: r.me ? L('나') : r.name, tag: r.tag, score: r.best, me: r.me, hero: r.hero, skin: r.skin, tier: r.tier }));
        const need = (Online.cfg && Online.cfg.league ? Online.cfg.league.size : 30) - out.length;
        if (need > 0) {
            const best = out.map(r => r.score).sort((a, b) => a - b), mid = best[Math.floor(best.length / 2)] || p.endlessBest || 10;
            const ai = Meta.leagueRivals({ season: Meta.leagueSeason(), ref: Math.max(10, mid) }, Meta.leagueDay(Meta.leagueSeason()));
            out.push(...ai.slice(0, need));
        }
        out.sort((a, b) => b.score - a.score || (a.me ? -1 : b.me ? 1 : 0));
        out.forEach((r, i) => { r.rank = i + 1; });
        return out;
    }

    function cupRankLine(x) {
        const box = document.querySelector('.modal .cup-online');
        if (box && x) box.textContent = L('주간 순위에 등록했습니다 · 이번 주 최고 {0}점{1}', fmt(x.value), x.flagged ? L(' (검토 중)') : '');
    }

    Object.assign(UI, { tierName, tierBadge, ensureProfile, profileModal, cloudChoice, rankList, myRankLine, leagueRows, cupRankLine, onlineStatusText, policyModal, probModal });
})();
