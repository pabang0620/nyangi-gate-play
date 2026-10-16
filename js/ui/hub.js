'use strict';
// UI - title screen, hub frame (top bar + nav), settings, daily login, shop.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const tabEndless = (...a) => UI.tabEndless(...a);
    const root = (...a) => UI.root(...a);
    const S = UI.S;
    const clear = (...a) => UI.clear(...a);
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const currencyBar = (...a) => UI.currencyBar(...a);
    const rewardCell = (...a) => UI.rewardCell(...a);
    const modal = (...a) => UI.modal(...a);
    const confirmBox = (...a) => UI.confirmBox(...a);
    const showGot = (...a) => UI.showGot(...a);
    const rewardIcons = (...a) => UI.rewardIcons(...a);
    const tabHero = (...a) => UI.tabHero(...a);
    const tabResearch = (...a) => UI.tabResearch(...a);
    const tabSummon = (...a) => UI.tabSummon(...a);
    const tabMap = (...a) => UI.tabMap(...a);
    const tabRewards = (...a) => UI.tabRewards(...a);


    const GAME_VERSION = '3.2.6';          // keep in step with versionName in android/app/build.gradle
    const TERMS_VERSION = '2026-10-14';    // bump when the terms/privacy policy change materially: players agree again
    const SUPPORT_MAIL = 'lwh970924@gmail.com';

    // first start (and after a material change): agree to the terms and the privacy policy before playing
    function consentThen(next) {
        const p = Save.p;
        if (p.set.agreed === TERMS_VERSION) { next(); return; }
        const items = [['terms.html', L('이용약관')], ['privacy.html', L('개인정보처리방침')]];
        const on = items.map(() => false);
        const ok = h('button.btn.gold.off', L('동의하고 시작'));
        const all = h('div.tog.consent-all', h('div.sw'), L('모두 동의합니다'));
        const toggles = [];
        const refresh = () => { toggles.forEach((b, i) => b.classList.toggle('on', on[i])); all.classList.toggle('on', on.every(Boolean)); ok.classList.toggle('off', !on.every(Boolean)); };
        const rows = items.map(([file, name], i) => {
            const b = h('div.tog', h('div.sw'), L('[필수] {0}에 동의합니다', name));
            b.addEventListener('click', () => { click(); on[i] = !on[i]; refresh(); });
            toggles.push(b);
            return h('div.consent-row', b, h('button.btn.small.ghost', { onclick: () => { click(); UI.policyModal(file, name); } }, L('보기')));
        });
        all.addEventListener('click', () => { click(); const v = !on.every(Boolean); on.fill(v); refresh(); });
        const d = modal([
            h('div.title-t', L('서비스 이용 동의')),
            h('div.tip', L('게임을 시작하려면 아래 약관에 동의해 주세요.')),
            all, ...rows,
            h('div.tip.consent-note', L('만 14세 미만은 보호자(법정대리인)의 동의를 받아 이용해 주세요. 유료 결제는 보호자의 동의가 필요합니다.')),
            ok,
        ]);
        ok.addEventListener('click', () => {
            if (!on.every(Boolean)) { toast(L('필수 항목에 모두 동의해 주세요')); return; }
            click(); p.set.agreed = TERMS_VERSION; p.set.agreedAt = Date.now(); Save.save(); d.remove(); next();
        });
    }

    // customer support: opens the mail app with the version / language / short account id filled in (no personal data)
    function supportMail() {
        const id = (window.Online && Online.user && Online.user.id) ? String(Online.user.id).slice(0, 8) : '-';
        const body = `\n\n----\nv${GAME_VERSION} · ${LANG} · ${id}`;
        location.href = `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent(L('[냥이 성문 수비대] 문의'))}&body=${encodeURIComponent(body)}`;
    }

    // ------------------------------------------------------------ title
    // account line under the start button: server state + guest / Google, tap for the profile popup.
    // Only once the terms are agreed (a first-time player meets the account in the settings afterwards) and only with a server configured.
    let acctLine = null;
    function titleAccount(p) {
        if (p.set.agreed !== TERMS_VERSION || !Online.enabled) return null;
        const st = h('span.tip');
        acctLine = h('div.title-acct', h('button.btn.small.ghost', { onclick: () => { click(); UI.profileModal(); } }, L('프로필 · 계정')), st);
        acctLine.refresh = () => { st.textContent = UI.onlineStatusText() + (Online.on ? ' · ' + (Online.isLinked() ? L('Google 연동됨') : L('게스트')) : ''); };
        acctLine.refresh();
        return acctLine;
    }
    Online.onChange(() => { if (acctLine && acctLine.isConnected) acctLine.refresh(); });
    UI.resumeSupply = () => { if ((S.screen === 'title' || S.screen === 'hub') && !document.querySelector('.modal')) offlineSupply(Save.p); };

    function showTitle() {
        S.screen = 'title';
        clear();
        Music.play('title');
        Game.backdrop = { map: 'title_bg', theme: 'grass', dim: 0.2 };
        const p = Save.p;
        const box = h('div.title-screen',
            h('div.logo-wrap', img('logo_emblem'), h('div.logo', h('span.l1', L('냥이')), h('span.l2', L('성문 수비대')))),
            h('div.logo-sub', L('성문을 지켜라냥!')),
            h('button.btn.gold', { style: { fontSize: '26px', padding: '14px 60px' }, onclick: () => { click(); Sfx.init(); consentThen(() => showHub('map')); } }, L('시작하기')),
            Game.touch && !/NyangiApp/.test(navigator.userAgent) ? h('button.btn.ghost', { onclick: () => { click(); Game.fullscreen(); } }, L('전체 화면으로 하기')) : null,   // the app is already full screen
            h('div.tip', { style: { marginTop: '18px', color: '#fff4dc', textShadow: '0 2px 4px #000' } }, L('탑을 세우고 냥이 영웅을 움직여, 성문이 뚫리기 전에 몬스터를 막아라냥!')),
            titleAccount(p),
            h('div.title-legal', L('전체이용가'), ' · v' + GAME_VERSION + ' · © 2026 nekolab'),
        );
        root().appendChild(box);
        UI.vfx('vfx/title_ambient.mp4', box, { loop: true, opacity: 0.5, z: 0, back: true });   // drifting fireflies over the title art
        // translated titles are longer: each logo line stays on one line and shrinks to the emblem width
        box.querySelectorAll('.logo > span').forEach(e => UI.fitText(e, () => 460, 28));
        offlineSupply(p);
    }
    // idle supply popup: on the title screen and when the app comes back from the background without restarting
    function offlineSupply(p) {
        const off = offlineReward(p);
        if (off && off.silver > 0) {
            p.silver += off.silver; Save.save();
            const d = modal([
                h('div.title-t', L('수비대 보급')),
                h('div', L('자리를 비운 {0} 동안 병사들이 보급을 모았습니다.', off.hours >= 1 ? off.hours.toFixed(1) + L('시간') : Math.round(off.hours * 60) + L('분'))),
                h('div.row', rewardCell('silver', fmt(off.silver))),
                h('div.tip', L('최고 스테이지가 높을수록 보급이 늘어납니다 (최대 {0}시간)', p.shop && p.shop.premium ? 24 : 12)),
                h('div.row', h('button.btn', { onclick: () => { click(); d.remove(); } }, L('받기')),
                    h('button.btn.gold', { onclick: async () => { if (!Rewards.adLeft(p, 'offline')) { toast(L('오늘 2배 보상 횟수를 다 썼습니다')); return; } click(); if (await Rewards.watchAd('offline')) { p.silver += off.silver; Save.save(); d.remove(); toast(L('보급 2배! 은화 +{0}', fmt(off.silver))); } } }, img('i_ad', '.icon'), L('광고 보고 2배'))),
            ]);
        }
    }


    // ------------------------------------------------------------ hub
    function showHub(tab) {
        S.screen = 'hub';
        S.tab = tab || S.tab;
        clear();
        Music.play('map');
        Game.battle = null;
        const ch = CHAPTERS[S.chapter];
        const bgs = { map: ['map_bg', 0.12], hero: ['hero_bg', 0.35], research: ['map_bg', 0.5], summon: ['summon_bg', 0.15], rewards: ['title_bg', 0.55], shop: ['hero_bg', 0.5], endless: ['endless_bg', 0.2], settings: ['hero_bg', 0.55] };
        Game.backdrop = { map: bgs[S.tab][0], theme: ch.theme, dim: bgs[S.tab][1] };
        const p = Save.p;
        const top = h('div.topbar',
            h('div.title-t', { style: { fontSize: '26px', marginRight: '10px' } }, L('냥이 수비대')),
            ...currencyBar(),
            h('div.sp'),
            h('div.chip.curchip', { onclick: () => { click(); UI.currencyInfo('ticket'); } }, img('i_ticket', '.icon'), fmtShort(p.tickets || 0)),
            h('div.iconbtn', { onclick: () => { click(); showHub('settings'); } }, img('nav_settings')),
            h('div.chip.herochip', { style: { cursor: 'pointer' }, onclick: () => { click(); showHub('hero'); } },
                img(heroPortrait(p.hero, p.shop && p.shop.skin[p.hero]), '.icon'), h('span.hc', h('b', HERO_NAMES[p.hero]), h('i', `Lv.${p.heroes[p.hero].lv}`))),
        );
        Rewards.ensure(p);
        const tabs = [['map', L('지도')], ['hero', L('영웅')], ['research', L('연구')], ['summon', L('소환')], ['rewards', L('보상')], ['shop', L('상점')], ['endless', L('도전')]];
        const nav = h('div.navbar', tabs.map(([id, name]) => {
            const b = h('div.navbtn' + (S.tab === id ? '.cur' : ''), { onclick: () => { click(); showHub(id); } }, img(id === 'endless' ? 'nav_challenge' : 'nav_' + id), h('span', name));
            if (id === 'hero' && p.items.some(i => i.isNew)) b.appendChild(h('span.badge', 'N'));
            if (id === 'research' && researchAffordable(p)) b.appendChild(h('span.badge', '!'));
            if (id === 'rewards' && Rewards.pending(p)) b.appendChild(h('span.badge', '!'));
            if (id === 'endless' && ((p.league && p.league.pending) || (Meta.dungeonUnlocked(p) && Meta.dungeonLeft(p) > 0) || (Meta.raidUnlocked(p) && p.raid.runs < RAID.tries))) b.appendChild(h('span.badge', '!'));
            return b;
        }));
        root().appendChild(top);
        root().appendChild(nav);
        ({ map: tabMap, hero: tabHero, research: tabResearch, summon: tabSummon, rewards: tabRewards, shop: tabShop, endless: tabEndless, settings: tabSettings })[S.tab]();
        if (S.tab === 'map') maybeLogin();
        UI.fitAll();
    }


    // some column's next node can be researched right now (same test as the research tab)
    function researchAffordable(p) {
        const free = totalStars(p) - spentStars(p);
        return RESEARCH.some(c => { const n = c.nodes.find(x => !p.research[x.id]); return n && n.cost <= free; });
    }

    // how to play: one popup covering the basics (settings)
    function howToModal() {
        const sec = (t, ...lines) => h('div.howto-sec', h('b', t), lines.map(x => h('div', x)));
        UI.infoModal(L('게임 방법'), h('div.howto', [
            sec(L('탑'), L('길가의 빈 자리를 눌러 탑을 세웁니다. 궁수탑은 빠르고 하늘의 적도 쏘고, 마법탑은 갑옷을 무시하고, 대포탑은 땅의 적을 광역으로 터뜨리고, 병영은 병사로 길을 막습니다.'), L('탑을 다시 누르면 업그레이드 · 최고 단계에서는 두 가지 전문화 중 하나를 고릅니다.')),
            sec(L('영웅'), L('땅을 누르면 영웅이 그곳으로 갑니다. AUTO가 켜져 있으면 스스로 싸우고, 직접 조작하면 3초 동안 수동이 됩니다(그동안 영웅이 잡은 적은 금화 1.25배).'), L('영웅 탭에서 장비를 끼우고 강화해 더 강해집니다. 레벨이 오르면 새 스킬이 열립니다.')),
            sec(L('스킬'), L('영웅 스킬 4개와 유성 냥펀치·증원 2개를 씁니다. 버튼을 누르고 지도에서 위치를 고르세요. 버튼을 길게 누르면 설명이 나옵니다.')),
            sec(L('별'), L('스테이지를 이기면 별 1~3개. 목숨을 2 이하로 잃고 이기면 별 3개입니다. 처음 얻는 별마다 보석 15개.'), L('별은 연구(영구 강화)에 쓰고, 모은 별 수로 성장 패스 보상이 열립니다.')),
            sec(L('재화'), L('은화: 장비 강화 · 보석: 소환과 스킨 · 소환권: 무료 1회 소환 · 강화석: +11 이상 강화. 위쪽 재화 칸을 누르면 얻는 곳을 볼 수 있습니다.')),
            sec(L('영웅 난이도'), L('장 보스를 물리치면 그 장의 영웅 난이도가 열립니다. 적 체력 {0}% · 별마다 보석 {1}개 · 별 3개는 특별 조건까지 지켜야 합니다.', Math.round(HARD.hpMul * 100), HARD.gemsPerStar)),
        ]));
    }

    // phones: what the keyboard line says, for touch
    function touchHelpModal() {
        UI.infoModal(L('조작 방법'), h('div.howto', [
            h('div', L('땅을 누르기 = 영웅 이동')),
            h('div', L('빈 자리 누르기 = 탑 설명, 한 번 더 = 건설')),
            h('div', L('스킬 버튼 누르기 = 사용할 위치 고르기 · 길게 누르기 = 설명')),
            h('div', L('자동 중에도 직접 조작하면 3초간 수동이 되고, 그동안 영웅이 잡은 적은 금화 1.25배.')),
        ]));
    }

    // settings ---------------------------------------------------
    function tabSettings() {
        const p = Save.p;
        const win = h('div.panel.win.settings');
        win.appendChild(h('h2', L('설정')));
        const colL = h('div.set-col'), colR = h('div.set-col.inset', { style: { padding: '12px' } });
        const tog = (label, key, after) => {
            const t = h('div.tog' + (p.set[key] ? '.on' : ''), h('div.sw'), label);
            t.addEventListener('click', () => { p.set[key] = !p.set[key]; t.classList.toggle('on', p.set[key]); if (after) after(); Save.save(); click(); });
            return t;
        };
        colL.appendChild(tog(L('배경음악 끄기'), 'musicOff', () => { Music.setEnabled(!p.set.musicOff); }));
        colL.appendChild(tog(L('효과음 끄기'), 'muted', () => { Sfx.muted = p.set.muted; }));
        colL.appendChild(tog(L('화면 흔들림 끄기'), 'noShake'));
        colL.appendChild(tog(L('진동 끄기'), 'noVibrate'));
        colL.appendChild(tog(L('필살기 컷신 끄기'), 'noCutin'));
        if (Game.touch && !/NyangiApp/.test(navigator.userAgent)) colL.appendChild(h('button.btn.ghost', { onclick: () => { click(); Game.fullscreen(); } }, L('전체 화면')));
        // language: device language by default, saved per device (js/i18n.js); changing it reloads the game
        const sel = document.createElement('select');
        sel.className = 'lang-sel';
        for (const [code, name] of Object.entries(LANGS)) { const o = document.createElement('option'); o.value = code; o.textContent = name; if (code === LANG) o.selected = true; sel.appendChild(o); }
        sel.addEventListener('change', () => { click(); setLang(sel.value); });
        colL.prepend(h('label.lang-row', h('span', L('언어')), sel));   // first: it was pushed below the panel on phones
        colR.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
            h('button.btn.small.gold', { onclick: () => { click(); UI.profileModal(); } }, L('프로필 · 계정')), h('span.tip', UI.onlineStatusText())));
        colR.appendChild(h('div.set-help',
            h('button.btn.small.gold', { onclick: () => { click(); howToModal(); } }, L('게임 방법')),
            h('button.btn.small', { onclick: () => { click(); confirmBox(L('처음 했을 때 나오던 안내와 설명을 다시 보여 줍니다.'), () => { p.seenTips = {}; Save.save(); toast(L('안내를 다시 볼 수 있습니다. 지도에서 시작하세요')); }); } }, L('튜토리얼 다시 보기')),
            h('button.btn.small.touch-help', { onclick: () => { click(); touchHelpModal(); } }, L('조작 방법'))));
        const pol = (file, name) => h('button.btn.small', { onclick: () => { click(); UI.policyModal(file, name); } }, name);
        const polRow = h('div.policy-row',
            h('button.btn.small', { onclick: () => { click(); UI.probModal(); } }, L('확률 정보')),
            pol('terms.html', L('이용약관')), pol('privacy.html', L('개인정보처리방침')), pol('operation.html', L('운영정책')),
            pol('refund.html', L('결제·환불 안내')), pol('opensource.html', L('오픈소스 라이선스')),
            h('button.btn.small', { onclick: () => { click(); supportMail(); } }, L('고객 문의')));
        colR.appendChild(polRow);
        // ad consent can be changed later where the law requires it (Google UMP decides; app only)
        if (window.BonghwaBridge && BonghwaBridge.adPrivacyRequired) BonghwaBridge.adPrivacyRequired().then(req => {
            if (req) polRow.appendChild(h('button.btn.small', { onclick: () => { click(); BonghwaBridge.adPrivacyOptions(); } }, L('광고 개인정보 설정')));
        });
        colR.appendChild(h('div.tip.legal-line', L('전체이용가'), ` · v${GAME_VERSION} · ${L('운영: 네코랩(nekolab)')} · ${SUPPORT_MAIL}`));
        colR.appendChild(h('div.tip.kbd-help', { style: { lineHeight: 1.8 } },
            L('조작: 땅 클릭 = 영웅 이동 · 1~4 = 영웅 스킬 · Q = 유성 냥펀치 · W = 증원'), h('br'),
            L('Space = 다음 웨이브 · Tab = 영웅 AUTO · F = 배속 · Esc = 취소/일시정지 · 우클릭 = 취소'), h('br'),
            L('자동 중에도 직접 조작하면 3초간 수동이 되고, 그동안 영웅이 잡은 적은 금화 1.25배.')));
        colR.appendChild(h('button.btn.red', { onclick: () => { click(); confirmBox(L('모든 진행 상황을 지우고 처음부터 시작합니다.\n되돌릴 수 없습니다.'), () => { Save.reset(); showTitle(); }); } }, L('데이터 초기화')));
        colR.appendChild(h('div.tip', L('냥이 성문 수비대 v{0} · 글꼴 Jua, Black Han Sans, Lilita One (SIL OFL 1.1) · 그림·음악 Google Flow / Flow Music', GAME_VERSION)));
        win.appendChild(h('div.set-wrap', colL, colR));
        root().appendChild(win);
    }


    // daily login popup on the first hub visit of the day
    function maybeLogin() {
        const p = Save.p; Rewards.ensure(p);
        if (!Rewards.loginAvailable(p) || S.loginShown === dayKey()) return;
        S.loginShown = dayKey();
        loginModal();
    }

    function loginModal() {
        const p = Save.p, idx = p.login.count % 7, can = Rewards.loginAvailable(p);
        const days = LOGIN_REWARDS.map((r, i) => {
            const done = can ? i < idx : i <= (p.login.count - 1) % 7 && p.login.count > 0;
            const today = can && i === idx;
            return h('div.day' + (today ? '.today' : '') + (done ? '.done' : ''), h('div.dn', L('{0}일', i + 1)), ...rewardIcons(r));
        });
        const d = modal([
            h('div.title-t', L('출석 보상')),
            h('div.days', days),
            p.shop.monthlyLeft > 0 ? h('div.tip', L('월간 보급권: 오늘 보석 100 추가 (남은 {0}일)', p.shop.monthlyLeft)) : null,
            can ? h('button.btn.gold', { style: { minWidth: '220px' }, onclick: () => {
                click(); const r = Rewards.claimLogin(p); d.remove();
                const extra = Meta.claimAtt28(p) || [];   // 7·14·21·28일째 누적 보상
                Save.save();
                if (S.screen === 'hub') showHub();
                if (r) showGot(extra.length ? L('출석 보상 + 누적 보상') : L('출석 보상'), r.got.concat(extra));
            } }, L('받기'))
                : h('button.btn', { onclick: () => { click(); d.remove(); } }, L('내일 또 만나요')),
        ]);
    }


    // shop tab
    async function buyProduct(id) {
        const got = await Rewards.buy(id);
        if (S.screen === 'hub') showHub();
        if (got) { Sfx.play('legend'); showGot(L('구매 완료'), got); }
    }

    function tabShop() {
        const p = Save.p; Rewards.ensure(p);
        const win = h('div.panel.win');
        const sec = (title, kids) => h('div.shop-sec', h('h3', title), h('div.shop-row', kids));
        const card = (id) => {
            const pr = PRODUCTS[id], owned = pr.once && p.shop[id];
            const first = pr.gems && !p.shop.firstBuy[id];
            return h('div.pcard' + (owned ? '.owned' : ''),
                first ? h('div.ribbon-s', L('첫 구매 2배')) : null,
                img(pr.img, '.shopimg'),
                h('div.pn', pr.name),
                pr.gems ? h('div.num.pg', img('i_gem', '.icon'), fmt(pr.gems * (first ? 2 : 1))) : h('div.pd', pr.desc),
                owned ? h('div.claimed-t', L('보유 중')) : h('button.btn.gold.small', { onclick: () => { click(); buyProduct(id); } }, priceLabel(id)));
        };
        win.appendChild(h('div.tip', { style: { margin: '0 6px 4px' } }, L('결제는 Google Play로 진행됩니다. 구매 후 7일 이내 사용하지 않은 상품은 청약철회(환불)할 수 있으며, 지급된 재화를 사용했거나 효과가 바로 적용되는 상품은 청약철회가 제한될 수 있습니다. 미성년자는 법정대리인의 동의가 필요합니다.')));
        win.appendChild(sec(L('추천'), ['starter', 'monthly', 'pass', 'premium', 'speed3'].map(card)));   // best value first (월간 보급권 = 3,300 gems)
        win.appendChild(sec(L('보석'), GEM_PRODUCTS.map(card)));
        // skins (bought with gems, some only from the growth pass; the recoloured ones only come from 스킨 소환)
        const skins = [];
        for (const cls in SKINS) for (const s of SKINS[cls]) {
            if (s.gacha) continue;
            const own = p.shop.skins.includes(s.id), on = p.shop.skin[cls] === s.id;
            skins.push(h('div.pcard.skin.r' + s.r,
                (() => { const pic = img(heroPortrait(cls, s.id), '.shopimg.round');
                    pic.style.cursor = 'pointer';
                    pic.addEventListener('click', () => { click(); UI.skinPreview(cls, s.id, () => showHub('shop')); });
                    return pic; })(),
                skinBadge(s), h('div.pn', s.name), h('div.pd', h('span', { style: { color: RARITY[s.r].color, textShadow: 'var(--stroke-s)' } }, RARITY[s.r].name), ' · ', skinOpt(s).text),
                skinTier(s).short ? h('div.pd.sknote.t-' + skinTierId(s), { onclick: () => toast(skinTier(s).note) }, skinTier(s).short, ' ⓘ') : null,
                own ? h('button.btn.small' + (on ? '.off' : ''), { onclick: () => { click(); Rewards.equipSkin(cls, on ? null : s.id); showHub('shop'); } }, on ? L('착용 중') : L('착용'))
                    : s.pass ? h('div.pbtn', L('성장 패스 보상'))
                    : h('button.btn.gold.small' + (p.gems < s.gems ? '.off' : ''), { onclick: () => { click(); UI.gemGate(s.gems, L('보석 {0}개로 "{1}" 스킨을 살까요?', fmt(s.gems), s.name), () => { if (Rewards.buySkin(s.id)) { Sfx.play('legend'); showHub('shop'); showGot(L('스킨 획득'), [{ skin: s.id }]); } }); } }, img('i_gem', '.icon'), fmt(s.gems))));
        }
        win.appendChild(sec(L('냥이 스킨'), skins));
        win.appendChild(h('div.row.shop-skinsum', h('div.tip', L('더 많은 스킨은 스킨 소환에서 모을 수 있습니다')),
            h('button.btn.small', { onclick: () => { click(); S.summonBanner = 'skin'; showHub('summon'); } }, L('스킨 소환'))));
        win.appendChild(h('div.tip', L('모든 스테이지는 결제 없이 깰 수 있습니다. 결제는 시간 단축과 꾸미기용입니다.')));
        win.classList.add('shopwin');
        root().appendChild(win);
    }

    Object.assign(UI, { howToModal, touchHelpModal, researchAffordable, showTitle, showHub, tabSettings, maybeLogin, loginModal, tabShop, buyProduct });
})();
