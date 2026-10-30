'use strict';
// UI - friends: the friend list popup (add by 닉네임#태그, requests, remove), the invite banner, the friend picker for raid invites.
// Data from Friends (js/online/friends.js). Part of the UI namespace (js/ui/core.js loads first).
(() => {
    const S = UI.S;
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const modal = (...a) => UI.modal(...a);
    const root = (...a) => UI.root(...a);
    const busy = (b, fn) => UI.busyBtn(b, fn);
    const say = r => { if (r && r.error) { toast(Friends.errText(r.error)); return false; } return true; };
    const KIND = { party: () => L('파티 레이드'), coop: () => L('협동 디펜스') };
    const BANNER_SEC = 20;

    function seenText(ms) {
        if (!ms) return L('기록 없음');
        const m = Math.max(0, (Date.now() - ms) / 60000);
        if (m < 5) return L('방금');
        if (m < 60) return L('{0}분 전', Math.floor(m));
        if (m < 60 * 24) return L('{0}시간 전', Math.floor(m / 60));
        return L('{0}일 전', Math.floor(m / 1440));
    }
    const nameTag = f => h('span.lg-name', f.name, h('span.tip', ` #${f.tag}`));
    const row = (f, ...right) => h('div.lg-row', UI.avatar(f.hero, f.skin, f.name, f.tag), UI.tierBadge(f.tier || 0), nameTag(f), ...right);

    function friendBadge() { return Friends.badge; }

    function friendsModal() {
        if (!Online.on) { toast(Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 기능이 아직 설정되지 않았습니다')); return; }
        if (!Online.profile) {
            const d0 = modal([h('h2', L('친구')), h('div', L('친구를 맺으려면 닉네임이 필요해요')),
                h('button.btn.gold', { onclick: () => { click(); d0.remove(); UI.ensureProfile(() => friendsModal()); } }, L('닉네임 정하기')),
                h('button.btn.ghost', { onclick: () => { click(); d0.remove(); } }, L('닫기'))], { dismiss: true });
            return;
        }
        const me = Online.profile, myTag = `${me.name}#${me.tag}`;
        const copy = h('button.btn.small', { onclick: () => { click(); try { navigator.clipboard.writeText(myTag); toast(L('내 친구 코드를 복사했어요')); } catch (e) { toast(myTag); } } }, L('복사'));
        const reqBtn = h('button.btn.gold', { onclick: () => { click(); requestModal(); } }, L('친구 신청'));
        const listBtn = h('button.btn.gold', { onclick: () => { click(); listModal(); } }, L('친구 목록'));
        const invites = h('div', { style: { width: '100%' } });
        live(modal([h('h2', L('친구')),
            h('div.lg-row.fr-code', h('span.lg-name', L('내 친구 코드 '), h('b.res-num', myTag)), copy),
            h('div.tip', L('친구에게 이 코드를 알려 주거나, 친구 신청에서 친구의 코드를 입력하세요')),
            h('div.row.fr-btns', reqBtn, listBtn),
            invites,
            closeBtn()], { dismiss: true, cls: 'fr-modal' }), st => {
            // counts on the two buttons: requests waiting for me, friends
            const n = st ? st.incoming.length : 0;
            reqBtn.replaceChildren(L('친구 신청'), n ? h('span.badge', String(n)) : '');
            listBtn.replaceChildren(L('친구 목록'), st ? h('span.fr-cnt', ` ${st.friends.length}/${st.max}`) : '');
            invites.replaceChildren();
            if (!st || !st.invites.length) return;
            invites.appendChild(sec(L('받은 초대')));
            invites.appendChild(h('div.lg-list', st.invites.map(inv => h('div.lg-row', h('span.lg-name', L('{0}님의 {1}', inv.name, KIND[inv.kind]())), h('span.tip', RAID_ON.diffs[inv.diff] ? RAID_ON.diffs[inv.diff].name : ''),
                h('button.btn.small.gold', { onclick: () => { click(); closeAll(); joinInvite(inv); } }, L('참가')),
                h('button.btn.small.ghost', { onclick: () => { click(); Friends.dismiss(inv.id); } }, L('닫기'))))));
        });
    }

    const sec = t => h('b', { style: { display: 'block', margin: '10px 0 4px', textAlign: 'left' } }, t);
    const listBox = () => h('div.fr-list', { style: { maxHeight: '52vh', overflowY: 'auto', width: '100%' } }, UI.catLoad(null, 'sm'));
    const opened = [];
    function closeTop(el) { const d = opened.find(x => x.contains(el)); if (d) d.remove(); }
    function closeAll() { opened.splice(0).forEach(d => d.remove()); }
    // keep a friends popup in step with Friends until it closes; draw(st) gets null when the list failed to load
    function live(d, draw) {
        opened.push(d);
        let off = false;
        const run = st => { if (off || !document.body.contains(d)) { off = true; return; } draw(st); };
        Friends.onChange(run);
        new MutationObserver((_, ob) => { if (!document.body.contains(d)) { off = true; Friends.offChange(run); ob.disconnect(); const i = opened.indexOf(d); if (i >= 0) opened.splice(i, 1); } }).observe(d.parentNode || document.body, { childList: true });
        if (Friends.st) run(Friends.st);
        Friends.refresh().then(run);
        return d;
    }
    const closeBtn = () => h('button.btn.ghost', { onclick: e => { click(); closeTop(e.target); } }, L('닫기'));

    // 친구 신청: send one by code, answer the ones I got, cancel the ones I sent
    function requestModal() {
        const input = h('input.nick', { maxLength: 17, placeholder: L('닉네임#태그 (예: 치즈냥#1234)') });
        const add = h('button.btn.gold', L('신청'));
        add.onclick = busy(add, async () => {
            const r = await Friends.request(input.value);
            if (!say(r)) return;
            input.value = '';
            toast(r.accepted ? L('친구가 되었어요') : L('친구 신청을 보냈어요'));
        });
        const body = listBox();
        live(modal([h('h2', L('친구 신청')),
            h('div.tip', L('친구의 코드(닉네임#태그)를 입력하세요')),
            h('div.row.fr-add', input, add),
            body, closeBtn()], { dismiss: true, cls: 'fr-modal' }), st => {
            body.innerHTML = '';
            if (!st) { body.appendChild(h('div.tip', L('친구 목록을 불러오지 못했어요'))); return; }
            body.appendChild(sec(L('받은 신청 {0}', st.incoming.length)));
            if (!st.incoming.length) body.appendChild(h('div.tip', L('받은 신청이 없어요')));
            else body.appendChild(h('div.lg-list', st.incoming.map(f => {
                const yes = h('button.btn.small.gold', L('수락')), no = h('button.btn.small.ghost', L('거절'));
                yes.onclick = busy(yes, async () => { if (say(await Friends.respond(f.uid, true))) toast(L('친구가 되었어요')); });
                no.onclick = busy(no, async () => { say(await Friends.respond(f.uid, false)); });
                return row(f, yes, no);
            })));
            if (st.outgoing.length) {
                body.appendChild(sec(L('보낸 신청')));
                body.appendChild(h('div.lg-list', st.outgoing.map(f => {
                    const x = h('button.btn.small.ghost', L('취소'));
                    x.onclick = busy(x, async () => { say(await Friends.remove(f.uid)); });
                    return row(f, h('span.tip', L('기다리는 중')), x);
                })));
            }
        });
    }

    // 친구 목록: my friends, latest seen first
    function listModal() {
        const body = listBox();
        live(modal([h('h2', L('친구 목록')), body, closeBtn()], { dismiss: true, cls: 'fr-modal' }), st => {
            body.innerHTML = '';
            if (!st) { body.appendChild(h('div.tip', L('친구 목록을 불러오지 못했어요'))); return; }
            body.appendChild(sec(L('친구 {0} / {1}', st.friends.length, st.max)));
            if (!st.friends.length) body.appendChild(h('div.tip', L('아직 친구가 없어요. 친구 코드로 신청해 보세요')));
            else body.appendChild(h('div.lg-list', st.friends.slice().sort((a, b) => (b.seen || 0) - (a.seen || 0)).map(f => row(f,
                h('span.tip.lg-meta', f.highest >= 0 ? L('최고 {0}', stageLabel(f.highest)) : L('기록 없음'), h('br'), seenText(f.seen)),
                h('button.btn.small.ghost', { onclick: () => { click(); UI.confirmBox(L('{0}#{1} 님을 친구에서 삭제할까요?', f.name, f.tag), async () => { say(await Friends.remove(f.uid)); }); } }, L('삭제'))))));
        });
    }

    // join a friend's room with the code it carries (the server checks everything as for a typed code)
    function joinInvite(inv) {
        Friends.dismiss(inv.id);
        if (UI.raidJoinInvite) UI.raidJoinInvite(inv);
    }

    // a new invite: banner at the top on the title / hub screens (in battle it waits in the friend list)
    function friendInvite(inv) {
        if (S.screen !== 'hub' && S.screen !== 'title') return;
        document.querySelectorAll('.fr-banner').forEach(e => e.remove());
        const accept = h('button.btn.small.gold', { onclick: () => { click(); end(); b.remove(); joinInvite(inv); } }, L('수락'));
        const b = h('div.paper.fr-banner', { style: { position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '10px 16px',
            display: 'flex', gap: '10px', alignItems: 'center', maxWidth: 'calc(100% - 32px)', flexWrap: 'wrap', justifyContent: 'center' } },
            h('span', L('{0}님이 {1}에 초대했어요', inv.name, KIND[inv.kind]())),
            accept,
            h('button.btn.small.ghost', { onclick: () => { click(); end(); b.remove(); Friends.dismiss(inv.id); } }, L('거절')));
        root().appendChild(b);
        Sfx.play && Sfx.play('coin');
        // the banner counts its 20 seconds down on the accept button, then leaves (the invite stays in the friend list)
        let left = BANNER_SEC;
        const tick = () => { accept.textContent = L('수락') + ` (${left})`; };
        const timer = setInterval(() => { left--; if (left <= 0 || !b.isConnected) { end(); b.remove(); } else tick(); }, 1000);
        function end() { clearInterval(timer); }
        tick();
    }

    // pick friends to invite to a party raid / co-op room
    function friendPick(kind, code, diff) {
        const need = RAID_ON.diffs[diff] ? RAID_ON.diffs[diff].eq : 0;   // the friend must have cleared this stage to enter the difficulty
        const list = h('div.lg-list', { style: { maxHeight: '48vh', overflowY: 'auto' } }, UI.catLoad(null, 'sm'));
        const d = modal([h('h2', L('친구 초대')), h('div.tip', L('{0} 코드 {1}로 초대해요 · 10분 동안 유효', KIND[kind](), code)), list,
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'fr-modal' });
        Friends.refresh().then(st => {
            list.innerHTML = '';
            if (!st || !st.friends.length) { list.appendChild(h('div.tip', L('아직 친구가 없어요. 메뉴의 친구에서 신청해 보세요'))); return; }
            st.friends.slice().sort((a, b) => (b.seen || 0) - (a.seen || 0)).forEach(f => {
                const short = f.highest != null && f.highest < need;   // (-1 = no progress yet)
                const go = h('button.btn.small.gold' + (short ? '.off' : ''), short ? L('진행도 부족') : L('초대'));
                let sent = false;
                go.onclick = busy(go, async () => {
                    if (sent) return;
                    if (short) { toast(L('{0} 클리어해야 초대할 수 있어요', stageLabel(need))); return; }
                    if (!say(await Friends.invite(f.uid, kind, code))) return;
                    sent = true; go.textContent = L('보냄'); go.classList.remove('gold'); go.classList.add('off');
                    const ok = modal([h('div.title-t', L('초대를 보냈어요')), h('div', L('{0}님에게 초대를 보냈어요', f.name)),
                        h('div.tip', L('10분 동안 유효해요')), h('button.btn.gold', { onclick: () => { click(); ok.remove(); } }, L('확인'))], { dismiss: true });
                });
                list.appendChild(row(f, h('span.tip', seenText(f.seen)), go));
            });
        });
    }

    Object.assign(UI, { friendsModal, friendBadge, friendInvite, friendPick });
})();
