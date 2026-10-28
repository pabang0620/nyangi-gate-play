'use strict';
// UI - 거래소: buy (filters, sort, pages), sell (my 거래 가능 gear, price with the allowed range and what comes back),
// my listings (cancel), the 거래 금화 balance. Data and rules from Market (js/online/market.js), checked again on the server.
// Part of the UI namespace (js/ui/core.js loads first).
(() => {
    const click = (...a) => UI.click(...a);
    const modal = (...a) => UI.modal(...a);
    const busy = (b, fn) => UI.busyBtn(b, fn);
    const say = r => { if (r && r.error) { toast(Market.errText(r.error)); return false; } return true; };
    const SLOT_NAME = () => ({ weapon: L('무기'), armor: L('갑옷'), charm: L('부적') });
    const left = ms => { const hrs = Math.max(0, (ms - Date.now()) / 3600000); return hrs >= 1 ? L('{0}시간 남음', Math.floor(hrs)) : L('{0}분 남음', Math.max(1, Math.floor(hrs * 60))); };

    // the exact item a listing holds, built from its seed like the delivery will be (not added to the bag)
    function preview(row) {
        const p = Save.p, bag = p.items, n = p.nextId;
        p.items = [];
        let it;
        try { it = makeItem(row.slot, row.grade, row.lv, makeRng(row.seed)); } finally { p.items = bag; p.nextId = n; }
        it.isNew = false; it.mid = row.mid; it.id = -row.mid;
        return it;
    }
    function statLines(it) {
        const m = itemMain(it);
        return h('div.tip', { style: { textAlign: 'left', lineHeight: 1.4 } },
            h('div', fmtOpt(m.name, m.v, m.pct)),
            ...it.subs.map(sb => h('div', fmtOpt(SUB_OPTS[sb.k].name, sb.v, SUB_OPTS[sb.k].pct))));
    }
    const nameLine = it => h('b', { style: { color: RARITY[it.r].color, textShadow: 'var(--stroke-s)' } }, `${RARITY[it.r].name} ${itemName(it)}`);
    const goldText = n => L('거래 금화 {0}', fmt(n));

    function marketModal() {
        if (!Online.on) { toast(Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 기능이 아직 설정되지 않았습니다')); return; }
        if (!Online.profile) {
            const d0 = modal([h('h2', L('거래소')), h('div', L('거래소는 닉네임이 있어야 쓸 수 있어요')),
                h('button.btn.gold', { onclick: () => { click(); d0.remove(); UI.ensureProfile(() => marketModal()); } }, L('닉네임 정하기')),
                h('button.btn.ghost', { onclick: () => { click(); d0.remove(); } }, L('닫기'))], { dismiss: true });
            return;
        }
        let tab = 'buy', f = { slot: null, grade: null, sort: 'new', page: 0 };
        const wallet = h('div', { style: { fontWeight: 'bold' } });
        const showGold = () => { wallet.textContent = goldText(Market.gold); };
        const tabs = h('div.row', { style: { gap: '6px', flexWrap: 'wrap', justifyContent: 'center' } });
        const body = h('div', { style: { maxHeight: '50vh', overflowY: 'auto', width: '100%' } });
        const d = modal([h('h2', L('거래소')), wallet, tabs, body,
            h('div.row', { style: { gap: '8px', justifyContent: 'center' } },
                h('button.btn.small.ghost', { onclick: () => { click(); help(); } }, L('거래 규칙')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true });
        const loading = () => { body.innerHTML = ''; body.appendChild(UI.catLoad()); };
        const drawTabs = () => {
            tabs.innerHTML = '';
            [['buy', L('구매')], ['sell', L('판매')], ['mine', L('내 판매')]].forEach(([k, t]) =>
                tabs.appendChild(h('button.btn.small' + (tab === k ? '.gold' : '.ghost'), { onclick: () => { click(); tab = k; draw(); } }, t)));
        };

        async function drawBuy() {
            const sel = (vals, cur, set) => h('div.row', { style: { gap: '4px', flexWrap: 'wrap', justifyContent: 'center' } },
                vals.map(([v, t]) => h('button.btn.small' + (cur === v ? '.gold' : '.ghost'), { onclick: () => { click(); set(v); f.page = 0; draw(); } }, t)));
            body.innerHTML = '';
            body.appendChild(sel([[null, L('전체')], ...Object.entries(SLOT_NAME())], f.slot, v => { f.slot = v; }));
            body.appendChild(sel([[null, L('전체')], ...[2, 3, 4].map(g => [g, RARITY[g].name]), [0, RARITY[0].name], [1, RARITY[1].name]], f.grade, v => { f.grade = v; }));
            body.appendChild(sel([['new', L('최신순')], ['price', L('낮은 가격')], ['price_desc', L('높은 가격')]], f.sort, v => { f.sort = v; }));
            const list = h('div.lg-list', UI.catLoad(null, 'sm'));
            body.appendChild(list);
            const r = await Market.search(f.slot, f.grade, f.sort, f.page);
            list.innerHTML = '';
            if (r.error) { list.appendChild(h('div.tip', Market.errText(r.error))); return; }
            if (!r.rows.length) list.appendChild(h('div.tip', f.page ? L('더 이상 물건이 없어요') : L('조건에 맞는 물건이 없어요')));
            for (const row of r.rows) {
                const it = preview(row);
                const buy = h('button.btn.small.gold', fmt(row.price));
                buy.onclick = () => {
                    click();
                    UI.confirmBox(L('{0}을(를) 거래 금화 {1}에 살까요?\n산 장비는 다시 팔 수 없어요.', `${RARITY[it.r].name} ${itemName(it)}`, fmt(row.price)), async () => {
                        const res = await Market.buy(row);
                        if (!say(res)) return;
                        showGold();
                        if (res.got && res.got.length) UI.showGot(L('거래소 구매'), res.got); else toast(L('우편함으로 보냈어요'));
                        draw();
                    });
                };
                list.appendChild(h('div.lg-row', { style: { alignItems: 'flex-start' } }, UI.itemCell(it, { noNew: true }),
                    h('div', { style: { flex: 1, textAlign: 'left' } }, nameLine(it), statLines(it),
                        h('div.tip', `${row.name || '?'}#${row.tag || '----'} · ${left(row.expires)}`)), buy));
            }
            body.appendChild(h('div.row', { style: { gap: '8px', justifyContent: 'center' } },
                f.page > 0 ? h('button.btn.small.ghost', { onclick: () => { click(); f.page--; draw(); } }, L('이전')) : null,
                r.rows.length >= ((Market.cfg && Market.cfg.pageSize) || 20) ? h('button.btn.small.ghost', { onclick: () => { click(); f.page++; draw(); } }, L('다음')) : null));
        }

        async function drawSell() {
            const r = await Market.sync();
            body.innerHTML = '';
            if (r.error) { body.appendChild(h('div.tip', Market.errText(r.error))); return; }
            showGold();
            const items = Save.p.items.filter(it => Market.tradeable(it)).sort((a, b) => b.r - a.r);
            if (!items.length) { body.appendChild(h('div.tip', L('팔 수 있는 장비가 없어요. 레이드 보상 카드처럼 우편으로 받은 장비에 "거래 가능" 표시가 붙어요'))); return; }
            const list = h('div.lg-list');
            for (const it of items) {
                const why = it.enh ? L('강화한 장비') : isEquipped(it) ? L('장착 중') : Market.bound(it) ? L('구매한 장비 (재판매 불가)') : '';
                list.appendChild(h('div.lg-row', UI.itemCell(it, { noNew: true, onclick: () => UI.itemInfo(it) }),
                    h('div', { style: { flex: 1, textAlign: 'left' } }, nameLine(it), h('div.tip', why || L('거래 가능'))),
                    why ? null : h('button.btn.small.gold', { onclick: () => { click(); sellModal(it); } }, L('팔기'))));
            }
            body.appendChild(list);
        }

        function sellModal(it) {
            const rg = Market.range(it.r);
            if (!rg) { toast(L('잠시 후 다시 해 주세요')); return; }
            const input = h('input.nick', { type: 'number', min: rg.min, max: rg.max, value: rg.min, inputMode: 'numeric' });
            const info = h('div.tip', { style: { lineHeight: 1.4 } });
            const upd = () => {
                const v = Math.round(Number(input.value) || 0), ok = v >= rg.min && v <= rg.max;
                info.textContent = ok ? L('보증금 {0} (팔리면 돌려받음, 취소나 기간 만료 시 사라짐) · 수수료 {1} · 팔리면 {2} 받음', fmt(Market.deposit(v)), fmt(Market.fee(v)), fmt(v - Market.fee(v) + Market.deposit(v)))
                    : L('{0} ~ {1} 사이로 정해 주세요', fmt(rg.min), fmt(rg.max));
            };
            input.addEventListener('input', upd); upd();
            const go = h('button.btn.gold', L('판매 등록'));
            const sd = modal([h('h2', L('판매 등록')), h('div.row', UI.itemCell(it, { noNew: true }), h('div', { style: { textAlign: 'left' } }, nameLine(it), statLines(it))),
                h('div', L('가격 (거래 금화, {0} ~ {1})', fmt(rg.min), fmt(rg.max))), input, info,
                h('div.tip', L('{0}시간 동안 올라가요. 올리는 동안 장비는 가방에서 빠져요', (Market.cfg && Market.cfg.hours) || 48)),
                h('div.row', { style: { gap: '8px' } }, h('button.btn.ghost', { onclick: () => { click(); sd.remove(); } }, L('취소')), go)], { dismiss: true });
            go.onclick = busy(go, async () => {
                const v = Math.round(Number(input.value) || 0);
                if (v < rg.min || v > rg.max) { upd(); return; }
                if (!say(await Market.list(it, v))) return;
                sd.remove(); showGold(); toast(L('판매를 등록했어요')); tab = 'mine'; draw();
            });
        }

        async function drawMine() {
            const r = await Market.sync();
            body.innerHTML = '';
            if (r.error) { body.appendChild(h('div.tip', Market.errText(r.error))); return; }
            showGold();
            if (!r.listings.length) body.appendChild(h('div.tip', L('올린 물건이 없어요')));
            const list = h('div.lg-list');
            for (const row of r.listings) {
                const it = preview(row), x = h('button.btn.small.ghost', L('취소'));
                x.onclick = () => { click(); UI.confirmBox(L('판매를 취소할까요?\n장비는 돌아오고 보증금 {0}은(는) 돌려받지 못해요.', fmt(row.deposit)), async () => {
                    if (!say(await Market.cancel(row.id))) return;
                    toast(L('판매를 취소했어요')); draw();
                }); };
                list.appendChild(h('div.lg-row', UI.itemCell(it, { noNew: true, onclick: () => UI.itemInfo(it) }),
                    h('div', { style: { flex: 1, textAlign: 'left' } }, nameLine(it), h('div.tip', `${goldText(row.price)} · ${left(row.expires)}`)), x));
            }
            body.appendChild(list);
            if (r.history.length) {
                body.appendChild(h('b', { style: { display: 'block', margin: '10px 0 4px' } }, L('최근 거래')));
                body.appendChild(h('div.lg-list', r.history.map(t => h('div.lg-row', h('span', t.sold ? L('판매') : L('구매')),
                    h('span.tip', new Date(t.at).toLocaleString()), h('span.lg-score', t.sold ? '+' + fmt(t.price - t.fee) : '-' + fmt(t.price))))));
            }
        }

        function draw() {
            if (!document.body.contains(d)) return;
            drawTabs(); loading(); showGold();
            (tab === 'buy' ? drawBuy() : tab === 'sell' ? drawSell() : drawMine()).catch(e => { console.warn('market', e); body.innerHTML = ''; body.appendChild(h('div.tip', L('불러오지 못했어요'))); });
        }
        Market.wallet().then(showGold);
        draw();
    }

    function help() {
        const c = Market.cfg || {};
        const d = modal([h('h2', L('거래 규칙')),
            h('div', { style: { textAlign: 'left', lineHeight: 1.4 } },
                h('div', L('우편으로 받은 장비(레이드 보상 카드 등)만 "거래 가능"이에요. 강화하지 않고 장착하지 않은 것만 팔 수 있어요')),
                h('div', L('값은 거래 금화로 치러요. 거래 금화는 레이드 보상과 판매 대금으로 모이고 계정에 보관돼요')),
                h('div', L('올릴 때 보증금 {0}%를 내고, 팔리면 돌려받아요. 취소하거나 {1}시간이 지나면 보증금은 사라지고 장비는 우편으로 돌아와요', Math.round((c.deposit || 0.02) * 100), c.hours || 48)),
                h('div', L('팔리면 수수료 {0}%를 빼고 받아요', Math.round((c.fee || 0.05) * 100))),
                h('div', L('거래소에서 산 장비는 다시 팔 수 없어요')),
                h('div', L('가입 {0}일 이후, 스테이지 {1}을(를) 깬 뒤부터 거래할 수 있어요. 같은 냥이와는 하루 {2}번까지예요', c.minAgeDays || 3, (c.minHighest || 9) + 1, c.pairPerDay || 3))),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    Object.assign(UI, { marketModal });
})();
