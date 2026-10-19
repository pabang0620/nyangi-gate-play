'use strict';
// UI - mailbox (우편함) and coupon input. The mail lives on the server (bonghwa.reward_inbox via Online.refreshMail):
// league / weekly results, operator mail and coupon rewards. Offline builds show that the mailbox needs the online mode.
(() => {
    const click = (...a) => UI.click(...a);
    const modal = (...a) => UI.modal(...a);
    const showGot = (...a) => UI.showGot(...a);

    // envelope drawn inline (no image asset, no OS emoji)
    const ENV = '<svg viewBox="0 0 48 48" width="34" height="34"><rect x="5" y="11" width="38" height="27" rx="4" fill="#f6e2b8" stroke="#6a3c14" stroke-width="3"/><path d="M7 14 L24 27 L41 14" fill="none" stroke="#6a3c14" stroke-width="3" stroke-linejoin="round"/></svg>';
    function mailIcon() { const s = h('span.mail-ico'); s.innerHTML = ENV; return s; }

    // top bar button with the unclaimed count
    function mailButton() {
        const n = Online.mailCount;
        return h('div.iconbtn.mailbtn', { title: L('우편함'), onclick: () => { click(); openMail(); } }, mailIcon(), n ? h('span.badge', String(Math.min(99, n))) : null);
    }

    function openMail() {
        let d = null;
        const close = () => { if (d) d.remove(); };
        const draw = () => {
            close();
            const on = Online.on;
            const list = h('div.mail-list');
            const items = on ? Online.mail : [];
            if (!on) list.appendChild(h('div.tip', L('우편함과 쿠폰은 인터넷 연결이 필요해요')));
            else if (!items.length) list.appendChild(h('div.tip', L('받은 우편이 없어요')));
            for (const r of items) {
                const P = r.payload || {}, done = !!r.claimed_at;
                const btn = done ? h('div.mail-done', L('받음'))
                    : h('button.btn.small.gold', { onclick: async () => {
                        click(); btn.classList.add('off');
                        const got = await Online.claimMail(r.id);
                        if (got) { showGot(Online.mailTitle(r), got); draw(); } else { btn.classList.remove('off'); toast(L('받지 못했어요. 잠시 후 다시 해 주세요')); }
                    } }, L('받기'));
                list.appendChild(h('div.mail-row' + (done ? '.done' : ''),
                    h('div.mail-txt', h('b', Online.mailTitle(r)), P.body ? h('div', P.body) : null),
                    h('div.mail-rw', P.reward ? UI.rewardIcons(P.reward) : null), btn));
            }
            const left = items.filter(m => !m.claimed_at).length;
            d = modal([
                h('div.title-t', L('우편함')),
                list,
                h('div.tip', L('받은 우편은 7일 뒤 목록에서 사라져요')),
                h('div.row',
                    left ? h('button.btn.gold', { onclick: async () => { click(); await Online.claimRewards(); draw(); } }, L('모두 받기 ({0})', left)) : null,
                    on ? h('button.btn', { onclick: () => { click(); couponModal(draw); } }, L('쿠폰 등록')) : null,
                    h('button.btn.ghost', { onclick: () => { click(); close(); if (UI.S.screen === 'hub') UI.showHub(); } }, L('닫기'))),
            ], { dismiss: true });
            d.firstChild.classList.add('mailwin');
        };
        draw();
        if (Online.on) Online.refreshMail().then(() => { if (d && d.isConnected) draw(); }).catch(() => { });
    }

    // coupon input in its own window (the mailbox is too narrow for an input row); after: redraw the mailbox
    function couponModal(after) {
        let d = null;
        const code = h('input.coupon-in', { type: 'text', maxLength: 24, placeholder: L('쿠폰 번호'), autocomplete: 'off', spellcheck: false });
        const use = h('button.btn.gold', { onclick: async () => {
            const v = code.value.trim(); if (!v) { toast(L('쿠폰 번호를 입력해 주세요')); return; }
            click(); use.classList.add('off');
            const err = await Online.redeemCoupon(v);
            use.classList.remove('off');
            if (err) { toast(err); return; }
            toast(L('쿠폰 보상이 우편함에 도착했어요')); d.remove(); after();
        } }, L('사용'));
        code.addEventListener('keydown', e => { if (e.key === 'Enter') use.click(); });
        d = modal([
            h('div.title-t', L('쿠폰 등록')),
            h('div.tip', L('쿠폰 번호를 입력하면 보상이 우편함으로 와요')),
            h('div.coupon-row', code),
            h('div.row', use, h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))),
        ], { dismiss: true });
        setTimeout(() => code.focus(), 50);
    }

    // keep the top bar count in step when the mail list changes
    Online.onChange(() => {
        for (const b of document.querySelectorAll('.mailbtn')) {
            const n = Online.mailCount, old = b.querySelector('.badge');
            if (old) old.remove();
            if (n) b.appendChild(h('span.badge', String(Math.min(99, n))));
        }
    });

    Object.assign(UI, { mailButton, openMail });
})();
