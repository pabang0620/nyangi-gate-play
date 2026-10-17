'use strict';
// UI - shared state (UI.S) and widgets: element helpers, currency bar, item/reward cells, modals, test payment/ad dialogs.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
const UI = {};
(() => {
    const root = () => document.getElementById('ui');

    const S = { screen: 'title', tab: 'map', chapter: 0, selItem: null, popup: null, hud: null, aim: null, rally: null, paused: false, result: null, autoTimer: null };


    function clear() { root().innerHTML = ''; S.popup = null; S.hud = null; }

    function ico(key, size = 22) { return h('span.ico', { style: { backgroundImage: `url(${Art.iconURL(key)})`, width: size + 'px', height: size + 'px' } }); }

    function click() { Sfx.play('click'); }

    // generated image (img/<name>.png) as a DOM element; falls back to nothing if missing
    function img(name, cls = '') {
        return h('img' + cls, { src: `img/${name}.png`, draggable: 'false' });
    }

    function starsStr(n, max = 3) {
        const out = [];
        for (let i = 0; i < max; i++) out.push(img(i < n ? 'i_star' : 'i_star_off', '.star'));
        return out;
    }

    function currencyBar() {
        const p = Save.p;
        const chip = (k, ...kids) => h('div.chip.curchip', { onclick: () => { click(); currencyInfo(k); } }, ...kids);
        return [
            chip('silver', ico('silver'), fmtShort(p.silver)),
            chip('gem', ico('gem'), fmtShort(p.gems)),
            chip('star', ico('star'), `${totalStars(p) - spentStars(p)} / ${totalStars(p)}`),
            chip('stone', img('i_stone', '.icon'), fmtShort((p.mats && p.mats.stone) || 0)),
        ];
    }

    // tapping a top-bar chip: what the currency is for, where it comes from, and a shortcut
    function currencyInfo(k) {
        const p = Save.p, go = (tab, sub) => () => { Object.assign(S, sub || {}); UI.showHub(tab); };
        const C = {
            silver: [ico('silver', 40), L('은화'), L('장비 강화에 쓰입니다.'), L('얻는 곳: 스테이지 보상, 무한의 성벽, 수비대 보급, 장비 분해, 요일 도전 은화 광산'), [[L('영웅 · 장비'), go('hero')]]],
            gem: [ico('gem', 40), L('보석'), L('장비 소환과 냥이 스킨 구매에 쓰입니다.'), L('얻는 곳: 처음 얻는 별, 출석, 임무, 업적, 성장 패스, 무한의 성벽, 요일 도전 보석 동굴'), [[L('소환'), go('summon')], [L('상점'), go('shop')]]],
            star: [ico('star', 40), L('별'), L('남은 별 {0} / 지금까지 얻은 별 {1}', totalStars(p) - spentStars(p), totalStars(p)) + '\n' + L('별로 영구 강화를 연구하고, 모은 별 수만큼 성장 패스 단계가 열립니다. 연구는 언제든 무료로 초기화할 수 있습니다.'),
                L('얻는 곳: 스테이지마다 최대 3개 (목숨을 2 이하로 잃고 이기면 3개). 영웅 난이도에서도 따로 3개'), [[L('연구'), go('research')]]],
            stone: [img('i_stone', '.icon'), L('강화석'), L('장비를 +{0} 이상으로 강화할 때 필요합니다.', ENHANCE.stoneFrom + 1), L('얻는 곳: 요일 도전 강화석 채굴장 (화·금·일), 28일 출석, 업적, 시즌 리그'), [[L('요일 도전'), go('endless', { ctab: 'dungeon' })]]],
            ticket: [img('i_ticket', '.icon'), L('소환권'), L('보석 없이 장비를 1회 소환합니다.'), L('얻는 곳: 출석, 주간 임무, 무한의 성벽 구간 보상, 성장 패스, 업적'), [[L('소환'), go('summon')]]],
        };
        const [icon, name, what, where, btns] = C[k];
        infoModal(h('span.curtitle', icon, name), [h('div', what), h('div.tip', where)], btns);
    }


    // ------------------------------------------------------------ help popups
    // title + explanation + optional shortcut buttons [label, fn]; tapping outside closes
    function infoModal(title, body, btns = []) {
        const d = modal([h('div.title-t', title),
            h('div.info-body', body),
            h('div.row', ...btns.map(([label, fn]) => h('button.btn.gold', { onclick: () => { click(); d.remove(); fn(); } }, label)),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true });
        d.querySelectorAll('.btn').forEach(e => fitText(e, () => e.clientWidth));
        return d;
    }

    // small round "?" that opens the explanation phones have no room to show inline
    function helpBtn(title, body, cls = '') {
        return h('button.qbtn' + cls, { onclick: e => { e.stopPropagation(); click(); infoModal(title, typeof body === 'function' ? body() : body); } }, '?');
    }

    // not enough gems: say how many are missing and offer the shop; otherwise confirm the spend
    function gemGate(cost, msg, onYes) {
        const p = Save.p;
        if (p.gems < cost) { infoModal(L('보석이 부족합니다'), L('보석 {0}개가 더 필요합니다 (보유 {1} / 필요 {2})', fmt(cost - p.gems), fmt(p.gems), fmt(cost)), [[L('상점으로'), () => UI.showHub('shop')]]); return; }
        confirmBox(msg, onYes);   // the gem bar at the top already shows the balance
    }

    // enemy card: name + what it does and how to beat it (tip), or its short tag
    function enemyInfo(k) {
        const e = ENEMIES[k], c = Art.domCanvas(Art.enemy(k, 0), e.boss ? 1.6 : 2.5);
        c.style.maxHeight = '110px'; c.style.maxWidth = '160px';
        infoModal(e.title ? `${e.title} ${e.name}` : e.name, [c, h('div', e.tip || e.tag || '')]);
    }


    // ------------------------------------------------------------ item cells
    function itemCell(it, opts = {}) {
        const c = h('div.cell.r' + it.r, { title: itemName(it) });
        c.appendChild(Art.domImg(Art.itemIcon(it), 3));   // <img>, not a canvas each: bags can hold thousands
        if (it.enh) c.appendChild(h('span.enh', '+' + it.enh));
        if (it.mid) c.appendChild(h('span.trd', L('거래##배지')));   // server-minted gear: can go on the market (js/ui/market.js)
        if (isEquipped(it)) c.appendChild(h('span.eq', L('장착##배지')));
        else if (it.isNew && !opts.noNew) c.appendChild(h('span.eq', { style: { color: '#ff8a6a' } }, L('새##배지')));
        if (opts.onclick) c.addEventListener('click', opts.onclick);
        if (opts.sel) c.classList.add('sel');
        return c;
    }

    function rewardCell(iconKey, amount, cls = '') {
        const c = h('div.cell' + cls);
        const gen = iconKey.startsWith('i_') && Art.gen(iconKey);
        c.appendChild(gen ? Art.domCanvas(gen, 2) : Art.domCanvas(Art.icon(iconKey.startsWith('i_') ? 'star' : iconKey), 3));
        c.appendChild(h('span.cnt', amount));
        // tap a reward icon to see what it is (not where the tap claims it)
        // tapping a reward icon says in words what it is, what it is for and where it comes from.
        // Inside a claimable cell the tap belongs to the claim, so it stays quiet there.
        const nm = REWARD_NAMES()[iconKey], info = INFO_OF[iconKey];
        if (nm) c.addEventListener('click', () => {
            if (c.closest('.pcell.can')) return;
            info ? currencyInfo(info) : toast(`${nm}: ${amount}`);
        });
        return c;
    }
    // a reward that was just doubled by an ad: new amount + an x2 badge on the icon
    function markDouble(c, amount) {
        if (!c) return;
        const n = c.querySelector('.cnt'); if (n) n.textContent = amount;
        if (!c.querySelector('.x2')) c.appendChild(h('span.x2', 'x2'));
    }
    const INFO_OF = { silver: 'silver', gem: 'gem', i_gem: 'gem', i_ticket: 'ticket', i_stone: 'stone', star: 'star', i_star: 'star' };
    const REWARD_NAMES = () => ({ silver: L('은화'), gem: L('보석'), i_gem: L('보석'), i_ticket: L('소환권'), i_stone: L('강화석'), i_xp: L('경험치'), i_medal: L('토벌 훈장'), i_gold: L('거래 금화'), star: L('별'), i_star: L('별') });


    // ------------------------------------------------------------ modal helpers
    function modal(content, opts = {}) {
        const d = h('div.dim', h('div.paper.modal', content));
        if (opts.dismiss) d.addEventListener('click', e => { if (e.target === d) d.remove(); });
        root().appendChild(d);
        // ribbon titles grow the band up to the popup width, then shrink to fit
        d.querySelectorAll('.ribbon > span').forEach(e => { fitText(e, () => e.clientWidth, 22); if (e.scrollWidth > e.clientWidth + 0.5) e.style.whiteSpace = 'normal'; });
        return d;
    }

    function confirmBox(msg, onYes) {
        const d = modal([h('div', { style: { fontSize: '20px', lineHeight: '1.6', whiteSpace: 'pre-line' } }, msg),
            h('div.row', h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('취소')),
                h('button.btn.red', { onclick: () => { click(); d.remove(); onYes(); } }, L('확인')))]);
    }



    function longPress(el, textFn) {
        let tm = null;
        el.addEventListener('pointerdown', () => { tm = setTimeout(() => { el._lp = true; toast(textFn()); }, 450); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(tm)));
    }


    // ============================================================ rewards · shop · ads
    // reward popup listing what was granted (icons, not text lines)
    function showGot(title, got) {
        if (!got || !got.length) return;
        const cells = got.map(g => {
            if (g.item) return itemCell(g.item, { noNew: true });
            if (g.skin) { const s = skinById(g.skin); const c = h('div.cell.r' + s.r, img(heroPortrait(s.cls, s.id))); c.appendChild(h('span.cnt', L('스킨'))); const bd = skinBadge(s); if (bd) c.appendChild(bd); return c; }
            if (g.text) return h('div.gotext', g.text);
            return rewardCell(g.icon, fmt(g.n));
        });
        Sfx.play('coin');
        const d = modal([h('div.ribbon', h('span', title)), h('div.row', cells), h('button.btn.gold', { onclick: () => { click(); d.remove(); } }, L('확인'))]);
    }

    function rewardIcons(g) {
        const out = [];
        if (g.silver) out.push(rewardCell('silver', fmt(g.silver)));
        if (g.gems) out.push(rewardCell('gem', fmt(g.gems)));
        if (g.tickets) out.push(rewardCell('i_ticket', g.tickets));
        if (g.stones) out.push(rewardCell('i_stone', g.stones));
        if (g.medals) out.push(rewardCell('i_medal', g.medals));
        if (g.gold) out.push(rewardCell('i_gold', fmt(g.gold)));
        if (g.item !== undefined) { const c = h('div.cell.r' + g.item, { onclick: () => toast(L('{0} 장비 1개 (무기·갑옷·부적 중 하나)', RARITY[g.item].name)) }, Art.domCanvas(Art.icon('weapon'), 3)); c.appendChild(h('span.cnt', RARITY[g.item].name)); out.push(c); }
        if (g.skin) { const s = skinById(g.skin); const c = h('div.cell.r' + s.r, img(heroPortrait(s.cls, s.id))); c.appendChild(h('span.cnt', L('스킨'))); const bd = skinBadge(s); if (bd) c.appendChild(bd); out.push(c); }
        return out;
    }


    // test flows for browsers (the Android app answers through window.BonghwaBridge instead)
    function testPurchase(pr) {
        return new Promise(res => {
            const d = modal([
                h('div.title-t', L('결제 확인')),
                h('div.testtag', L('테스트 결제 · 실제 금액이 청구되지 않습니다')),
                h('div.row', { style: { alignItems: 'center' } }, pr.img ? img(pr.img, '.shopimg') : null, h('div', { style: { textAlign: 'left' } }, h('b', { style: { fontFamily: 'BlackHan', fontSize: '20px' } }, pr.name), h('div', won(pr.price)))),
                h('div.row', h('button.btn.ghost', { onclick: () => { click(); d.remove(); res({ ok: false }); } }, L('취소')),
                    h('button.btn.gold', { onclick: () => { click(); d.remove(); res({ ok: true, receipt: 'test-' + Date.now() }); } }, L('결제 (테스트)')))]);
        });
    }

    function testAd(placement) {
        return new Promise(res => {
            let n = 3;
            const cnt = h('div.num', { style: { fontSize: '48px' } }, n);
            const d = h('div.dim', { style: { zIndex: 60, flexDirection: 'column', gap: '14px', background: '#0d0905' } }, img('i_ad', '.shopimg'), h('div.title-t', L('광고 시청 중')), h('div.testtag', L('테스트 광고 · 앱에서는 실제 보상형 광고가 나옵니다')), cnt);
            root().appendChild(d);
            const iv = setInterval(() => { n--; cnt.textContent = n; if (n <= 0) { clearInterval(iv); d.remove(); res(true); } }, 1000);
        });
    }


    // translated labels can be much longer than the Korean ones: shrink a label's font until it fits its box
    // (buttons and tabs measure themselves, nav labels measure the button they sit in)
    function fitText(el, avail, min = 10) {
        const cs = getComputedStyle(el);
        let size = parseFloat(cs.fontSize);
        while (el.scrollWidth > avail() + 0.5 && size > min) { size -= 1; el.style.fontSize = size + 'px'; }
    }
    function fitAll(scope) {
        scope = scope || root();
        if (UI.catDecor) requestAnimationFrame(() => UI.catDecor(scope));
        const inner = e => { const c = getComputedStyle(e); return e.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight); };
        scope.querySelectorAll('.navbtn > span:not(.badge)').forEach(e => fitText(e, () => inner(e.parentElement) + 8));
        // then every nav label uses the smallest size so the row looks even
        const navs = [...scope.querySelectorAll('.navbtn > span:not(.badge)')];
        const minNav = Math.min(...navs.map(e => parseFloat(getComputedStyle(e).fontSize)));
        if (navs.length) navs.forEach(e => { e.style.fontSize = minNav + 'px'; });
        scope.querySelectorAll('.btn, .topbar .title-t, .topbar .chip:not(.herochip), .tcol h3').forEach(e => fitText(e, () => e.clientWidth));
        scope.querySelectorAll('.topbar .herochip > span:not(.hc)').forEach(e => fitText(e, () => e.clientWidth, 12));
        scope.querySelectorAll('.skinpick .sk > span').forEach(e => fitText(e, () => e.clientWidth, 9));
        // clamped descriptions: show only whole lines that fit the box (a long title leaves less room)
        scope.querySelectorAll('.pcard .pd').forEach(e => {
            e.style.maxHeight = ''; e.style.webkitLineClamp = '';
            const lh = parseFloat(getComputedStyle(e).lineHeight) || 16, n = Math.max(1, Math.floor((e.clientHeight + 1) / lh));
            e.style.webkitLineClamp = n; e.style.maxHeight = (n * lh) + 'px';
        });
    }

    // pre-rendered light effect clip (vfx/*.mp4, black background) screen-blended over `parent`; never blocks taps.
    // opt: { loop, opacity, z, back } - back = behind the parent's other children (ambient layers)
    function vfx(src, parent, opt = {}) {
        parent = parent || root();
        if (!parent || (!opt.loop && (Save.p.set.noShake || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)))) return null;
        const v = h('video.vfx-clip', { src, muted: true, playsInline: true, autoplay: true, preload: 'auto', loop: !!opt.loop });
        v.muted = true;
        // hidden until frames actually move: some WebViews paint an empty box or a play button first
        v.style.opacity = '0';
        const show = () => { if (v.currentTime > 0.04) { v.style.opacity = opt.opacity || ''; v.removeEventListener('timeupdate', show); } };
        v.addEventListener('timeupdate', show);
        if (opt.rate) v.addEventListener('loadedmetadata', () => { v.playbackRate = opt.rate; });
        if (opt.z !== undefined) v.style.zIndex = opt.z;
        const done = () => v.remove();
        if (!opt.loop) v.addEventListener('ended', done);
        v.addEventListener('error', done);
        opt.back ? parent.prepend(v) : parent.appendChild(v);
        const pr = v.play(); if (pr && pr.catch) pr.catch(done);
        return v;
    }
    Object.assign(UI, { vfx, currencyInfo, infoModal, helpBtn, gemGate, enemyInfo, fitAll, fitText, root, S, clear, ico, click, img, starsStr, currencyBar, itemCell, rewardCell, markDouble, modal, confirmBox, longPress, showGot, rewardIcons, testPurchase, testAd });
})();
