'use strict';
// UI - online pieces: profile & account (nickname, Google link, cloud save), cloud-save conflict choice,
// league tier badges, ranking lists. Data comes from Online (js/online/online.js).
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const modal = (...a) => UI.modal(...a);
    const showHub = (...a) => UI.showHub(...a);
    const confirmBox = (...a) => UI.confirmBox(...a);

    const TIER_COLOR = ['#c08050', '#c8d0e0', '#f2c14e', '#7fe0d0', '#9ad0ff', '#ff8ad8'];
    function tierName(t) { const n = (Online.cfg && Online.cfg.league && Online.cfg.league.tiers) || [L('브론즈'), L('실버'), L('골드'), L('플래티넘'), L('다이아'), L('마스터')]; return L(n[t] || n[0]); }   // server config sends Korean names
    function tierBadge(t) { return h('span.tierbadge', { style: { borderColor: TIER_COLOR[t] || TIER_COLOR[0], color: TIER_COLOR[t] || TIER_COLOR[0] } }, tierName(t)); }
    function onlineStatusText() {
        if (!Online.enabled) return L('오프라인 모드 (서버 미설정)');
        return { connecting: L('연결 중…'), online: L('연결됨'), error: L('인터넷에 연결하지 못했어요 (인터넷 없이 계속해요)') }[Online.status] || L('연결 안 됨');
    }

    // nickname needed before rankings/league: run then() once a profile exists
    function ensureProfile(then) {
        if (!Online.on) { toast(Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 기능이 아직 설정되지 않았습니다')); return; }
        if (Online.profile) { then && then(); return; }
        profileModal(then);
    }

    // which logins open this account on another device, for the account lines
    function accountText() {
        if (!Online.on) return '-';
        const names = { google: 'Google', kakao: L('카카오'), id: L('아이디 {0}', Online.loginId()) };
        const ls = Online.logins();
        return ls.length ? ls.map(k => names[k]).join(' · ') : L('게스트');
    }
    // sign-in brand marks (title buttons, the account line): inline SVG, no image asset, no OS emoji
    const SIGNIN_ICON = {
        guest: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.5 21c0-4.4 3.8-7.5 8.5-7.5s8.5 3.1 8.5 7.5z" fill="currentColor"/></svg>',
        kakao: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.7 6.6l-1 3.6c-.1.3.3.6.6.4l4.3-2.8c.5.1.9.1 1.4.1 5.5 0 10-3.5 10-7.9S17.5 3 12 3z" fill="#191919"/></svg>',
        google: '<svg viewBox="0 0 48 48" width="22" height="22"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>',
    };
    // "name#tag [kakao mark]" for the account lines; the brand mark says how this account signs in (id: "아이디 x", guest: "게스트")
    function accountLine() {
        const pr = Online.on && Online.profile, ls = Online.on ? Online.logins() : [];
        const marks = ls.map(k => k === 'id' ? h('span.acct-id', L('아이디 {0}', Online.loginId())) : h('span.acct-mark.' + k, { title: k === 'kakao' ? L('카카오') : 'Google', html: SIGNIN_ICON[k] }));
        return h('span.acct-line', pr ? h('b', `${pr.name}#${pr.tag}`) : null, ...marks,
            Online.on && !ls.length ? h('span.acct-id', L('게스트')) : null,
            !Online.on ? h('span.tip', onlineStatusText()) : null);
    }
    // what this account owns from the shop (월간 보급권 days left, 가호, 패스, 3배속). None of them renew by themselves
    function perksBox(p) {
        const sh = p.shop || {}, has = v => v ? h('b.perk-on', L('보유 중')) : h('span.tip', L('없음'));
        const row = (k, v) => h('div.perk-row', h('span', PRODUCTS[k].name), v);
        return h('div.inset', { style: { padding: '10px', marginTop: '8px', lineHeight: 1.7 } },
            h('b', L('내 구독·혜택')),
            row('monthly', sh.monthlyLeft > 0 ? h('b.perk-on', L('남은 {0}일', sh.monthlyLeft)) : h('span.tip', L('없음'))),
            row('premium', has(sh.premium)),
            row('pass', has(sh.pass)),
            row('speed3', sh.speed3 ? has(true) : sh.premium ? h('b.perk-on', L('냥이의 가호에 포함')) : has(false)),
            h('div.tip', L('모두 한 번 결제하는 상품이에요. 자동으로 다시 결제되지 않아요')));
    }

    // linked accounts: sign out here (the next start asks for a login like a fresh install)
    function logoutButton() {
        return h('button.btn.small.ghost', { style: { marginTop: '6px' }, onclick: () => {
            click();
            confirmBox(L('로그아웃할까요?\n진행은 계정에 저장되어 있어서 다시 로그인하면 이어서 할 수 있어요.'), async () => {
                try { await UI.waitCat(Online.logout()); } catch (e) { toast((e && e.message) || L('잠시 후 다시 해 주세요')); }
            });
        } }, L('로그아웃'));
    }
    const field = (ph, type, value) => h('input.nick', { type: type || 'text', value: value || '', placeholder: ph, maxLength: type === 'password' ? 64 : 16,
        autocapitalize: 'off', autocomplete: 'off', spellcheck: false, style: { width: '100%', boxSizing: 'border-box' } });
    const errLine = () => h('div.tip', { style: { color: '#a8401a', minHeight: '20px' } });
    async function run(err, fn) { try { await fn(); } catch (e) { err.textContent = (e && e.message) || L('잠시 후 다시 해 주세요'); } }

    // buttons to attach a login to this account (Google, Kakao when set up, game id). after(): redraw the caller
    function linkButtons(err, after) {
        if (!Online.on || Online.isLinked()) return null;   // one login per account: a linked account only signs out
        const ls = Online.logins(), row = h('div.row', { style: { gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '6px' } });
        if (Online.googleOn() && !ls.includes('google')) row.appendChild(h('button.btn.small', { onclick: () => { click(); run(err, async () => {
            await Online.linkGoogle(); if (Online.logins().includes('google')) { toast(L('Google 계정을 연동했습니다')); after && after(); } }); } }, L('Google 계정 연동')));
        if (Online.kakaoOn() && !ls.includes('kakao')) row.appendChild(h('button.btn.small', { onclick: () => { click(); run(err, () => Online.linkKakao()); } }, L('카카오 계정 연동')));
        row.appendChild(h('button.btn.small', { onclick: () => { click(); idModal(after); } }, ls.includes('id') ? L('비밀번호 바꾸기') : L('아이디·비밀번호 만들기')));
        return row;
    }

    // make (or change) the game id + password of this account
    function idModal(after) {
        const has = Online.loginId();
        const id = field(L('아이디 (영어 소문자·숫자 4~16자)'), 'text', has), pw = field(L('비밀번호 (8자 이상)'), 'password'), pw2 = field(L('비밀번호 확인'), 'password');
        const err = errLine();
        const d = modal([h('h2', has ? L('비밀번호 바꾸기') : L('아이디·비밀번호 만들기')),
            h('div.tip', L('다른 기기나 웹에서 이 아이디로 로그인하면 지금 진행을 그대로 이어서 할 수 있어요.')),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0', minWidth: '260px' } }, id, pw, pw2),
            h('div.tip', L('비밀번호를 잊으면 찾을 수 없어요. 꼭 기억해 두세요. 이메일은 받지 않아요.')),
            err,
            h('div.row', { style: { gap: '10px', justifyContent: 'center' } },
                h('button.btn.gold', { onclick: () => { click(); run(err, async () => {
                    if (pw.value !== pw2.value) throw new Error(L('비밀번호가 서로 달라요'));
                    const v = await UI.waitCat(Online.setLogin(id.value, pw.value));
                    d.remove(); toast(has ? L('저장했어요. 아이디 {0}', v) : L('아이디 {0}를 만들었어요. 다른 기기에서 이 아이디로 로그인할 수 있어요', v)); after && after();
                }); } }, L('저장')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true });
    }

    // title: sign in with a game id (another device's progress)
    function idLoginModal() {
        const id = field(L('아이디')), pw = field(L('비밀번호'), 'password'), err = errLine();
        const d = modal([h('h2', L('아이디로 로그인')),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0', minWidth: '260px' } }, id, pw),
            err,
            h('div.row', { style: { gap: '10px', justifyContent: 'center' } },
                h('button.btn.gold', { onclick: () => { click(); if (!id.value.trim() || !pw.value) { err.textContent = L('아이디와 비밀번호를 넣어 주세요'); return; } run(err, () => Online.loginWithId(id.value, pw.value)); } }, L('로그인')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true });
    }
    // title: a new account with a game id + password
    function signUpModal(after) {
        const id = field(L('아이디 (영어 소문자·숫자 4~16자)')), pw = field(L('비밀번호 (8자 이상)'), 'password'), pw2 = field(L('비밀번호 확인'), 'password');
        const err = errLine();
        const d = modal([h('h2', L('회원가입')),
            h('div.tip', L('이 아이디로 다른 기기나 웹에서도 이어서 할 수 있어요.')),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0', minWidth: '260px' } }, id, pw, pw2),
            h('div.tip', L('비밀번호를 잊으면 찾을 수 없어요. 꼭 기억해 두세요. 이메일은 받지 않아요.')),
            err,
            h('div.row', { style: { gap: '10px', justifyContent: 'center' } },
                h('button.btn.gold', { onclick: () => { click(); run(err, async () => {
                    if (pw.value !== pw2.value) throw new Error(L('비밀번호가 서로 달라요'));
                    const v = await UI.waitCat(Online.signUp(id.value, pw.value));
                    d.remove(); toast(L('아이디 {0}를 만들었어요. 다른 기기에서 이 아이디로 로그인할 수 있어요', v)); after && after();
                }); } }, L('가입하기')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true });
    }

    // sign in to a different account (another device's progress). A guest that is not linked anywhere is lost, so ask first
    function switchModal() {
        const id = field(L('아이디')), pw = field(L('비밀번호'), 'password'), err = errLine();
        const guard = go => {
            if (Online.on && !Online.isLinked()) confirmBox(L('지금 진행은 아직 어디에도 연결되지 않은 게스트 계정이에요.\n다른 계정으로 로그인하면 이 게스트 계정으로는 다시 들어올 수 없어요.\n계속할까요?'), () => run(err, go));
            else run(err, go);
        };
        const d = modal([h('h2', L('다른 계정으로 로그인')),
            h('div.tip', L('다른 기기에서 하던 진행을 불러와요. 두 진행이 다르면 어느 쪽을 쓸지 고를 수 있어요.')),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0', minWidth: '260px' } }, id, pw,
                h('button.btn.gold', { onclick: () => { click(); if (!id.value.trim() || !pw.value) { err.textContent = L('아이디와 비밀번호를 넣어 주세요'); return; } guard(() => Online.loginWithId(id.value, pw.value)); } }, L('아이디로 로그인'))),
            h('div.row', { style: { gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
                Online.googleOn() ? h('button.btn.small', { onclick: () => { click(); guard(() => Online.loginGoogle()); } }, L('Google로 로그인')) : null,
                Online.kakaoOn() ? h('button.btn.small', { onclick: () => { click(); guard(() => Online.loginKakao()); } }, L('카카오로 로그인')) : null),
            err,
            h('button.btn.ghost', { style: { marginTop: '8px' }, onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    function profileModal(then) {
        const p = Save.p, pr = Online.profile;
        const input = h('input.nick', { value: pr ? pr.name : (p.profileName || ''), maxLength: 12, placeholder: L('닉네임 (2~12자)') });
        const err = errLine();
        const linked = Online.isLinked();
        const reopen = () => { d.remove(); profileModal(then); };
        const d = modal([h('h2', L('프로필 · 계정')),
            h('div.prof-row', (() => { const a = img(heroFace(p.hero, p.shop && p.shop.skin[p.hero]), '.prof-pic'); a.style.background = avatarBg(); return a; })(),
                h('div', { style: { flex: 1 } },
                    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, input, pr ? h('span.tip', '#' + pr.tag) : null),
                    h('div.tip', L('랭킹과 리그에서 다른 냥이에게 보이는 이름과 대표 영웅(현재 영웅·스킨)입니다.')),
                    pr ? h('div', { style: { marginTop: '6px' } }, L('리그 등급 '), tierBadge(pr.tier || 0)) : null)),
            err,
            h('div.row', { style: { gap: '10px', justifyContent: 'center' } },
                h('button.btn.gold', { onclick: async () => {
                    click();
                    if (!Online.on) { err.textContent = L('인터넷에 연결되지 않았어요'); return; }
                    try {
                        const sk = p.shop && p.shop.skin ? p.shop.skin[p.hero] : null;
                        await UI.waitCat(Online.setProfile(input.value.trim(), p.hero, sk)); Save.save();
                        d.remove(); toast(L('프로필을 저장했습니다')); if (then) then(); else showHub(UI.S.tab);
                    } catch (e) { err.textContent = e.message; }
                } }, L('저장'))),
            h('div.inset', { style: { padding: '10px', marginTop: '8px', lineHeight: 1.7 } },
                h('b', L('내 계정')),
                h('div', accountLine()),
                h('div.tip', linked ? L('진행은 자동으로 저장돼요. 다른 기기에서도 이어서 할 수 있어요') : L('진행은 이 기기에 자동으로 저장돼요')),
                Online.on && !linked ? h('div.tip', L('게스트 계정은 앱을 지우거나 기기를 바꾸면 진행을 잃을 수 있습니다. 계정을 연동하면 어느 기기에서든 이어서 할 수 있습니다.')) : null,
                linkButtons(err, reopen),
                Online.on && linked ? logoutButton() : null,
                Online.sb && !linked ? h('button.btn.small.ghost', { style: { marginTop: '6px' }, onclick: () => { click(); switchModal(); } }, L('다른 계정으로 로그인')) : null),
            perksBox(p),
            Online.on ? h('button.btn.small.red', { style: { marginTop: '8px' }, onclick: () => {
                click();
                UI.confirmBox(L('계정과 모든 기록(프로필, 저장된 진행, 랭킹 기록)을 지우고\n이 기기의 진행도 처음부터 다시 시작합니다.\n되돌릴 수 없습니다. 결제 내역은 Google Play에 남습니다.'), async () => {
                    try { await UI.waitCat(Online.deleteAccount()); } catch (e) { toast(e.message); }
                });
            } }, L('계정 및 데이터 삭제')) : null,
            h('button.btn.ghost', { style: { marginTop: '8px' }, onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    // guests: why and how to link (title line, settings, the one-time nudge)
    function linkModal(nudge) {
        const err = errLine();
        const buy = nudge === 'buy';
        const d = modal([h('h2', buy ? L('구매하려면 계정 연동이 필요해요') : nudge ? L('진행을 지켜 주세요') : L('계정 연동')),
            buy ? h('div', { style: { margin: '4px 0 8px', textAlign: 'center', lineHeight: 1.6 } }, L('게스트 계정은 구매할 수 없어요.'), h('br'),
                L('구매 기록이 계정에 남아야 환불하거나 다른 기기에서 이어서 받을 수 있어요.'))
            : h('div', { style: { margin: '4px 0 8px', textAlign: 'center', lineHeight: 1.6 } }, L('지금은 게스트 계정이라 앱을 지우거나 기기를 바꾸면 진행을 잃을 수 있어요.'), h('br'),
                L('연동해 두면 다른 기기와 웹에서도 그대로 이어서 할 수 있어요.')),
            linkButtons(err, () => { d.remove(); toast(L('이제 다른 기기에서도 이어서 할 수 있어요')); }),
            err,
            h('button.btn.ghost', { style: { marginTop: '8px' }, onclick: () => { click(); d.remove(); } }, nudge && !buy ? L('나중에') : L('닫기'))], { dismiss: true });
    }

    // first nickname: once, on the hub after the first stage clear (the tutorial is in 1-1 ~ 1-3 battles, never over it)
    function nickModal() {
        const p = Save.p, input = h('input.nick', { value: p.profileName || '', maxLength: 12, placeholder: L('닉네임 (2~12자)') }), err = errLine();
        const d = modal([h('h2', L('닉네임 정하기')),
            h('div', { style: { margin: '4px 0 8px', textAlign: 'center' } }, L('랭킹, 레이드, 친구에게 보이는 이름이에요. 나중에 프로필에서 바꿀 수 있어요.')),
            input, err,
            h('div.row', { style: { gap: '10px', justifyContent: 'center' } },
                h('button.btn.gold', { onclick: () => { click(); run(err, async () => {
                    const sk = p.shop && p.shop.skin ? p.shop.skin[p.hero] : null;
                    const pr = await UI.waitCat(Online.setProfile(input.value.trim(), p.hero, sk)); Save.save();
                    d.remove(); toast(L('반가워요, {0}님!', pr.name)); UI.showHub(UI.S.tab);
                }); } }, L('저장')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('나중에')))]);
    }
    // the one-time account prompts on the hub map: nickname first, then (much later) the guest link nudge. One per visit
    function accountPrompts() {
        const p = Save.p, S = UI.S;
        if (!Online.on || S.screen !== 'hub' || document.querySelector('.modal')) return;
        const cleared = i => (p.stars && p.stars[i] > 0);
        if (!Online.profile && !p.set.nickAsked && cleared(0)) { p.set.nickAsked = 1; Save.save(); nickModal(); return; }
        const paid = !!(p.shop && p.shop.purchases && p.shop.purchases.length);
        if (!Online.isLinked() && !p.set.linkNudged && (cleared(4) || paid)) { p.set.linkNudged = 1; Save.save(); linkModal(true); }
    }
    // the server answers after the hub is drawn on a cold start: try again once it is online
    let wasOn = false;
    Online.onChange(() => { if (Online.on && !wasOn) { wasOn = true; setTimeout(accountPrompts, 800); } });

    // policy pages bundled with the game (policy/*.html, also hosted publicly for the store listing)
    // policy pages: Korean originals in policy/, English translations in policy/en/ for every other language
    const POLICY_EN = ['privacy.html', 'terms.html', 'operation.html', 'refund.html', 'opensource.html'];
    function policyModal(file, title) {
        const src = 'policy/' + (LANG !== 'ko' && POLICY_EN.includes(file) ? 'en/' : '') + file;
        const d = modal([h('h2', title), h('iframe.policy-frame', { src }), h('button.btn', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }
    // 확률 정보 (게임산업법 확률형 아이템 표시): every random reward with its exact odds (docs/site-probability.md is the same text for the public site; keep both in step)
    function probModal() {
        const pct = v => (Math.round(v * 1000) / 10) + '%';
        const pc2 = v => (v < 1 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100) + '%';   // v already in percent; under 1% keeps 3 decimals
        const row = (k, v) => h('tr', h('td', k), h('td', v));
        const tbl = (head, rows) => h('table.prob', h('tr', ...head.map(x => h('th', x))), ...rows);
        const names = RARITY.map(r => r.name);
        // raid reward cards: the server's live table (game_config 'raid'), else the same values shipped with the game
        const rc = (Online.cfg && Online.cfg.raid && Online.cfg.raid.cards) ? Online.cfg.raid : {
            mul: [1, 1.6, 2.4, 3.5], pity: RAID_ON.pity,
            cards: [{ k: 'gems', n: 60, w: 30 }, { k: 'stones', n: 4, w: 20 }, { k: 'tickets', n: 1, w: 15, ceil: true }, { k: 'guards', n: 0.5, w: 12, ceil: true },
                { k: 'shields', n: 1, w: 8, fixed: true }, { k: 'medals', n: 30, w: 10 }, { k: 'item', w: 4, grade: 2 }, { k: 'item', w: 2, wm: true, grade: 3 },
                { k: 'item', w: 0.15, wm: true, grade: 4 }, { k: 'gold', n: 20, w: 12 }] };
        const cardName = { gems: L('보석'), stones: L('강화석'), tickets: L('소환권'), guards: L('하락방지권'), shields: L('파괴방지권'), medals: L('토벌 훈장'), gold: L('거래 금화') };
        const cardRows = rc.cards.map(c => h('tr', h('td', c.k === 'item' ? names[c.grade] + ' ' + L('장비') : cardName[c.k] || c.k),
            ...RAID_ON.diffs.map((_, d) => { const m = rc.mul[d], tot = rc.cards.reduce((s, x) => s + x.w * (x.wm ? m : 1), 0);
                const n = c.k === 'item' ? 1 : c.fixed ? c.n : c.ceil ? Math.ceil(c.n * m) : Math.round(c.n * m);
                return h('td', pc2(c.w * (c.wm ? m : 1) / tot * 100) + ' · ' + fmt(n)); })));
        const d = modal([h('h2', L('확률 정보')),
            h('div.prob-wrap',
                h('b', L('장비 소환 (1회 보석 ') + SUMMON.cost1 + L(', 10회 ') + SUMMON.cost10 + ')'),
                tbl([L('등급'), L('확률')], names.map((n, i) => row(n, SUMMON.table[i] + '%'))),
                h('div.tip', L('{0}번째 소환까지 전설 등급 이상이 나오지 않으면 전설 확정', SUMMON.pity)),
                h('div.tip', L('장비 종류: 전체(무작위) 소환은 무기·갑옷·부적 각 33.3%, 종류를 고르면 그 종류 100%. 등급 확률과 가격은 같습니다.')),
                h('div.tip', L('소환권 소환과 하루 1번 광고 무료 소환도 같은 확률입니다.')),
                h('b', L('스킨 소환 (1회 보석 {0}, 10회 {1})', SKIN_SUMMON.cost1, SKIN_SUMMON.cost10)),
                tbl([L('등급'), L('확률'), L('스킨 1종당'), L('중복 시')], SKIN_SUMMON.table.map((v, r) => { const pool = skinPool(r);
                    return h('tr', h('td', names[r]), h('td', v + '%'), h('td', (Math.round(v / pool.length * 10000) / 10000) + '%'), h('td', L('보석 {0}', SKIN_SUMMON.dupGems[r]))); })),
                h('div.tip', L('{0}번째 소환까지 전설 등급 이상이 나오지 않으면 전설 확정', SKIN_SUMMON.pity) + ' ' + L('신화 등급은 확정 획득이 없습니다.')),
                h('div.tip', L('같은 등급 안의 스킨은 모두 같은 확률입니다. 성장 패스 스킨은 나오지 않습니다.')),
                h('div.prob-skins', SKIN_SUMMON.table.map((_, r) => h('div', h('b', { style: { color: RARITY[r].color, textShadow: 'var(--stroke-s)' } }, names[r] + ': '), skinPool(r).map(id => skinById(id).name).join(', ')))),
                h('div.tip', L('연속 소환은 10회 소환을 반복하는 것으로, 확률과 확정 횟수는 같습니다.')),
                h('b', L('장비 옵션 (모든 장비 공통)')),
                tbl([L('등급'), L('옵션 수'), L('옵션 값 배율')], names.map((n, r) => h('tr', h('td', n), h('td', String(r >= 4 ? r + 1 : r)), h('td', 'x' + (r >= 4 ? 2 : Math.round((1 + 0.15 * r) * 100) / 100))))),
                tbl([L('옵션'), L('기본 범위')], Object.values(SUB_OPTS).map(o => row(o.name, o.pct ? pct(o.min) + ' ~ ' + pct(o.max) : o.min + ' ~ ' + o.max))),
                h('div.tip', L('옵션 종류는 10가지 중 겹치지 않게 같은 확률로 고르고, 값은 기본 범위 안에서 같은 확률로 정한 뒤 등급 배율을 곱합니다. 소환·합성·상자·카드·처치 등 얻는 방법과 상관없이 같습니다.')),
                h('b', L('장비 합성 (같은 등급 3개)')),
                tbl([L('등급'), L('성공')], FUSE.rate.map((v, r) => row(names[r] + ' → ' + names[r + 1], v + '%'))),
                h('div.tip', L('실패하면 같은 등급 장비 1개가 나옵니다. 종류는 넣은 3개 중 하나(각 33.3%)를 따릅니다.')),
                h('b', L('적 처치 시 장비 등급 (장비가 떨어졌을 때)')),
                tbl([L('등급'), L('일반 적'), L('정예'), L('보스')], names.map((n, i) => h('tr', h('td', n), h('td', DROP.table.normal[i] + '%'), h('td', DROP.table.elite[i] + '%'), h('td', DROP.table.boss[i] + '%')))),
                h('div.tip', L('장비가 떨어질 확률: 일반 적 {0}, 정예 {1}, 보스 {2} ({3}번)', pct(DROP.chance.normal), pct(DROP.chance.elite), pct(DROP.chance.boss), DROP.rolls.boss)),
                h('div.tip', L('영웅 난이도에서는 정예·보스가 1번씩 더 굴립니다. 소탕도 같은 표를 씁니다.')),
                h('b', L('장비 강화 성공 확률')),
                tbl([L('단계'), L('성공')], ENHANCE.rate.map((r, i) => row(`+${i} → +${i + 1}`, pct(r) + (i >= ENHANCE.dropFrom ? L(' (실패 시 1단계 하락)') : '') + (i >= ENHANCE.destroyFrom ? L(' · 파괴 {0}', destroyPct(i)) : '')))),
                h('div.tip', L('하락방지권·파괴방지권은 성공 확률을 바꾸지 않고, 실제로 막았을 때만 줄어듭니다.')),
                h('b', L('레이드 보상 카드 (확률 · 수량)')),
                tbl([L('보상'), ...RAID_ON.diffs.map(x => x.name)], cardRows),
                h('div.tip', L('카드 4장은 따로 정해지고, 1장을 골라 받습니다. 받은 장비의 종류는 각 33.3%입니다.')),
                h('div.tip', L('{0}번째 카드까지 전설 이상이 없으면 전설, {1}번째 카드까지 신화가 없으면 신화 장비로 바뀝니다.', rc.pity.leg, rc.pity.myth)),
                h('b', L('등급이 정해진 장비 상자')),
                h('div.tip', L('상점 꾸러미, 성장 패스, 훈장 상점, 탑 상점의 장비는 등급이 정해져 있습니다. 종류를 고르지 않으면 각 33.3%, 옵션은 위 표와 같습니다.')),
                h('div.tip', L('거래소 장비는 판매자가 올린 그대로라 확률이 없습니다.')),
                h('div.tip', L('확률이 바뀌면 적용 전에 게임 안 공지와 확률 정보 페이지로 미리 알려요.'))),
            h('button.btn', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    // another device saved later: keep which?
    function cloudChoice(remote, local, cb) {
        const sum = s => { let st = 0, hs = 0; for (const k in s.stars || {}) st += s.stars[k]; for (const k in s.hstars || {}) hs += s.hstars[k];
            const lv = Math.max(...Object.values(s.heroes || { a: { lv: 1 } }).map(x => x.lv)); return L('별 {0}{1} · 영웅 Lv.{2} · 보석 {3}', st, hs ? L(' · 영웅 별 ') + hs : '', lv, fmt(s.gems || 0)); };
        const when = ms => ms ? new Date(ms).toLocaleString('ko-KR') : '-';
        const d = modal([h('h2', L('저장된 진행 고르기')),
            h('div', { style: { margin: '6px 0 10px', textAlign: 'center' } }, L('다른 기기에서 더 최근에 저장한 진행이 있습니다. 어느 쪽으로 할까요?')),
            h('div.row', { style: { gap: '12px' } },
                h('div.inset.cloudopt', h('b', L('다른 기기')), h('div', sum(remote)), h('div.tip', when(remote.savedMs)),
                    h('button.btn.gold', { onclick: () => { click(); d.remove(); cb(true); } }, L('다른 기기 진행 불러오기'))),
                h('div.inset.cloudopt', h('b', L('이 기기')), h('div', sum(local)), h('div.tip', when(local.savedMs)),
                    h('button.btn', { onclick: () => {
                        click();
                        // keeping this device overwrites the saved progress for good: two confirmations, the second one names what is lost
                        confirmBox(L('서버에 저장된 진행이 모두 사라지고 이 기기의 진행으로 바뀝니다.') + '\n' + L('사라지는 진행: {0}', sum(remote)), () =>
                            confirmBox(L('정말 삭제하시겠습니까? 되돌릴 수 없어요.'), () => { d.remove(); cb(false); }));
                    } }, L('이 기기 유지')))),
            h('div.tip', L('선택하지 않은 쪽의 진행은 덮어쓰여 사라집니다.'))]);
    }

    // a ranking list from Online.board(): rank, tier, name#tag, value
    function rankList(view, unit, fmtValue = v => fmt(v)) {
        if (!view) return h('div.muted', { style: { margin: '20px' } }, Online.enabled ? L('랭킹을 불러오지 못했습니다') : L('온라인 기능이 아직 설정되지 않았습니다'));
        if (!view.top.length) return h('div.muted', { style: { margin: '20px' } }, L('아직 기록이 없습니다. 첫 기록의 주인공이 되어 보세요!'));
        return h('div.lg-list.rank-list', view.top.map(r => h('div.lg-row' + (r.me ? '.me' : ''),
            h('span.lg-rank', `${r.rank}`), img(heroFace(r.hero, r.skin), '.rk-pic'), tierBadge(r.tier || 0),
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

    Object.assign(UI, { tierName, tierBadge, ensureProfile, profileModal, accountText, accountLine, logoutButton, SIGNIN_ICON, linkButtons, idModal, idLoginModal, signUpModal, switchModal, linkModal, accountPrompts, cloudChoice, rankList, myRankLine, leagueRows, cupRankLine, onlineStatusText, policyModal, probModal });
})();
