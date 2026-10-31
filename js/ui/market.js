'use strict';
// UI - 거래소 (2026-11-01 개편): four tabs a first-time player can read at a glance.
//   사기: name search + filters (부위, 등급, 착용 레벨 단계, 정렬), other cats' gear with the price button.
//   팔기: my 거래 gear from the bag; the sell window shows the lowest listed price and recent trades of the same gear and fills a price.
//   내 판매: my open listings (cancel), what each one pays when it sells.
//   금화·정산: what 거래 금화 is, how it comes in, how sale money is settled, my recent trades.
// Data and rules from Market (js/online/market.js), all checked again on the server (migrations 20261022000000_market, 20261038000000_market_price).
// Part of the UI namespace (js/ui/core.js loads first). Styles: css/cat-theme.css "거래소" block (.mk-*).
(() => {
    const click = (...a) => UI.click(...a);
    const modal = (...a) => UI.modal(...a);
    const busy = (b, fn) => UI.busyBtn(b, fn);
    const say = r => { if (r && r.error) { toast(Market.errText(r.error)); return false; } return true; };
    const left = ms => { const hrs = Math.max(0, (ms - Date.now()) / 3600000); return hrs >= 1 ? L('{0}시간 남음', Math.floor(hrs)) : L('{0}분 남음', Math.max(1, Math.floor(hrs * 60))); };
    const goldIco = () => UI.img('i_gold', '.mk-gico');
    const goldText = n => L('거래 금화 {0}', fmt(n));
    const pageSize = () => (Market.cfg && Market.cfg.pageSize) || 20;
    const GRADES = [0, 1, 2, 3, 4];

    // the exact item a listing holds, built from its seed like the delivery will be (not added to the bag)
    function preview(row) {
        const p = Save.p, bag = p.items, n = p.nextId;
        p.items = [];
        let it;
        try { it = makeItem(row.slot, row.grade, row.lv, makeRng(row.seed)); } finally { p.items = bag; p.nextId = n; }
        it.isNew = false; it.mid = row.mid; it.id = -row.mid;
        return it;
    }
    const statText = it => { const m = itemMain(it); return [h('span', fmtOpt(m.name, m.v, m.pct)), ...it.subs.map(sb => [' · ', h('span.subq.' + subQ(it, sb), fmtOpt(SUB_OPTS[sb.k].name, sb.v, SUB_OPTS[sb.k].pct))])]; };   // options colored by roll quality (subQ)
    const nameLine = it => h('b.mk-nm', { style: { color: RARITY[it.r].color } }, `${RARITY[it.r].name} ${itemName(it)}`);
    const metaText = it => `${L('착용 Lv.{0}', itemReq(it))} · ${SLOT_NAME[it.slot]}`;
    const tierLabel = t => L('착용 Lv.{0}', GEAR_TIERS[t].req);

    // ------------------------------------------------------------ text search
    // "황금 발톱", "전설 갑옷", "lv20 부적": words match the grade + item name + slot of a slot/grade pair, a number picks the 착용 레벨 단계.
    function parseQuery(q) {
        const words = [], low = String(q || '').trim().toLowerCase();
        let tier = null;
        for (const t of low.split(/\s+/).filter(Boolean)) {
            const m = t.match(/^(?:lv\.?)?(\d{1,3})$/);
            if (m) { const n = +m[1]; tier = 0; GEAR_TIERS.forEach((g, i) => { if (g.req <= n) tier = i; }); }
            else if (!/^lv\.?$/.test(t)) words.push(t);
        }
        return { words, tier };
    }
    const pairText = (slot, g) => `${RARITY[g].name} ${itemName({ slot, r: g })} ${SLOT_NAME[slot]}`.toLowerCase();

    function marketModal() {
        if (!Online.on) { toast(Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 기능이 아직 설정되지 않았습니다')); return; }
        if (!Online.profile) {
            const d0 = modal([h('h2', L('거래소')), h('div', L('거래소는 닉네임이 있어야 쓸 수 있어요')),
                h('button.btn.gold', { onclick: () => { click(); d0.remove(); UI.ensureProfile(() => marketModal()); } }, L('닉네임 정하기')),
                h('button.btn.ghost', { onclick: () => { click(); d0.remove(); } }, L('닫기'))], { dismiss: true });
            return;
        }
        let tab = 'buy';
        const f = { q: '', slot: null, grade: null, tier: null, sort: 'new' };
        const res = { rows: [], page: 0, done: true, busy: false, started: false, token: 0 };

        const walletAmt = h('b');
        const wallet = h('button.mk-wallet', { onclick: () => { click(); tab = 'gold'; draw(); } }, goldIco(), h('span', L('거래 금화')), walletAmt);
        const showGold = () => { walletAmt.textContent = fmt(Market.gold); };
        const tabs = h('div.mk-tabs');
        const lock = h('div.mk-lock');
        const hint = h('div.mk-hint');
        const body = h('div.mk-body');
        const d = modal([h('h2', L('거래소')),
            h('div.mk-top', wallet, h('button.btn.small.ghost.mk-rules', { onclick: () => { click(); help(); } }, L('거래 규칙'))),
            tabs, lock, hint, body,
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'mk-modal' });
        const loading = () => { body.innerHTML = ''; body.appendChild(UI.catLoad()); };
        const TABS = () => [['buy', L('사기'), L('다른 냥이 장비')], ['sell', L('팔기'), L('내 장비 올리기')],
            ['mine', L('내 판매'), Market.mine ? L('{0}개 올림', Market.mine.listings.length) : L('올린 물건')], ['gold', L('금화·정산'), L('판매 대금')]];
        const HINTS = () => ({
            buy: L('다른 냥이가 올린 장비를 거래 금화로 사요. 산 장비는 우편으로 바로 와요'),
            sell: L('"거래" 표시가 붙은 장비만 팔 수 있어요. 팔기를 누르면 시세를 보고 값을 정해요'),
            mine: L('올려 둔 장비예요. 팔리면 거래 금화가 바로 들어와요'),
            gold: L('거래 금화는 거래소에서만 쓰는 돈이에요'),
        });
        const drawTabs = () => {
            tabs.innerHTML = '';
            for (const [k, t, s] of TABS()) tabs.appendChild(h('button.mk-tab' + (tab === k ? '.on' : ''), { onclick: () => { if (tab === k) return; click(); tab = k; draw(); } },
                h('b', t), h('span', s)));
            hint.textContent = HINTS()[tab];
        };
        // trading needs some progress (the server checks it too); browsing is open to everyone
        const drawLock = () => {
            const c = Market.cfg, hi = highestCleared(Save.p);
            lock.textContent = c && hi < c.minHighest ? L('스테이지 {0}을(를) 깨면 사고팔 수 있어요. 지금은 둘러보기만 돼요', c.minHighest + 1) : '';
            lock.style.display = lock.textContent ? '' : 'none';
        };

        // ------------------------------------------------------------ 사기
        function drawBuy() {
            body.innerHTML = '';
            const input = h('input.nick.mk-q', { type: 'search', value: f.q, placeholder: L('이름 검색 (예: 황금 발톱, 전설 갑옷, Lv20)'), enterkeyhint: 'search' });
            const go = () => { f.q = input.value; search(true); };
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { input.blur(); go(); } });
            const sel = (label, opts, cur, set) => {
                const s = h('select.mk-sel', { 'aria-label': label }, opts.map(([v, t]) => h('option', { value: v === null ? '' : String(v) }, t)));
                s.value = cur === null ? '' : String(cur);
                s.addEventListener('change', () => { click(); set(s.value === '' ? null : s.value); search(true); });
                return h('label.mk-f', h('span', label), s);
            };
            body.appendChild(h('div.mk-search', input, h('button.btn.small.gold', { onclick: () => { click(); go(); } }, L('검색'))));
            body.appendChild(h('div.mk-filters',
                sel(L('부위'), [[null, L('전체')], ...SLOTS.map(s => [s, SLOT_NAME[s]])], f.slot, v => { f.slot = v; }),
                sel(L('등급'), [[null, L('전체')], ...GRADES.map(g => [g, RARITY[g].name])], f.grade, v => { f.grade = v === null ? null : +v; }),
                sel(L('착용 레벨'), [[null, L('전체')], ...GEAR_TIERS.map((t, i) => [i, 'Lv.' + t.req])], f.tier, v => { f.tier = v === null ? null : +v; }),
                sel(L('정렬'), [['new', L('최신순')], ['price', L('낮은 가격')], ['price_desc', L('높은 가격')]], f.sort, v => { f.sort = v || 'new'; })));
            const list = h('div.mk-list');
            body.appendChild(list);
            fillBuy(list);
            if (!res.started) search(true);
        }

        // fetch server pages (slot / grade / sort on the server) and keep the rows that match the words and level tier
        async function search(reset) {
            if (res.busy && !reset) return;
            const q = parseQuery(f.q), tier = q.tier !== null ? q.tier : f.tier;
            const pairs = [];
            for (const s of SLOTS) for (const g of GRADES) {
                if ((f.slot && f.slot !== s) || (f.grade !== null && f.grade !== g)) continue;
                const t = pairText(s, g);
                if (q.words.every(w => t.includes(w))) pairs.push(s + g);
            }
            const slots = [...new Set(pairs.map(x => x.slice(0, -1)))], grades = [...new Set(pairs.map(x => +x.slice(-1)))];
            const sSlot = f.slot || (slots.length === 1 ? slots[0] : null), sGrade = f.grade !== null ? f.grade : grades.length === 1 ? grades[0] : null;
            // a new search (filter change) wins over one still loading: the old one's pages are dropped
            if (reset) Object.assign(res, { rows: [], page: 0, done: false, err: null, none: !pairs.length, started: true, token: res.token + 1 });
            const tok = res.token, list = body.querySelector('.mk-list');
            if (res.none) { res.done = true; res.busy = false; if (list) fillBuy(list); return; }
            res.busy = true;
            if (list) fillBuy(list);
            try {
                let got = 0;
                for (let n = 0; n < 4 && got < 8 && !res.done; n++) {
                    const r = await Market.search(sSlot, sGrade, f.sort, res.page);
                    if (tok !== res.token) return;
                    if (r.error) { res.err = r.error; res.done = true; break; }
                    res.page++;
                    if (r.rows.length < pageSize() || res.page > 50) res.done = true;
                    for (const row of r.rows) {
                        if (!pairs.includes(row.slot + row.grade)) continue;
                        if (tier !== null && Market.tierOf(row.lv) !== tier) continue;
                        res.rows.push(row); got++;
                    }
                }
            } finally { if (tok === res.token) res.busy = false; }
            if (tok !== res.token) return;
            if (tab === 'buy' && document.body.contains(d)) { const l = body.querySelector('.mk-list'); if (l) fillBuy(l); }
        }

        function fillBuy(list) {
            list.innerHTML = '';
            if (res.err) { list.appendChild(h('div.mk-empty', Market.errText(res.err))); return; }
            const filtered = f.q.trim() || f.slot || f.grade !== null || f.tier !== null;
            if (!res.rows.length && res.done) {
                list.appendChild(h('div.mk-empty',
                    h('div', res.none ? L('"{0}"에 맞는 장비 이름이 없어요', f.q.trim()) : filtered ? L('조건에 맞는 물건이 없어요') : L('아직 올라온 물건이 없어요')),
                    h('div.tip', filtered ? L('검색어나 필터를 바꿔 보세요') : L('조금 뒤에 다시 와 보세요. 내 장비를 먼저 올려 봐도 좋아요')),
                    filtered ? h('button.btn.small.ghost', { onclick: () => { click(); Object.assign(f, { q: '', slot: null, grade: null, tier: null }); drawBuy(); search(true); } }, L('필터 초기화')) : null));
                return;
            }
            for (const row of res.rows) {
                const it = preview(row), price = Number(row.price);
                const buy = h('button.btn.small.mk-price' + (price > Market.gold ? '.ghost' : '.gold'), goldIco(), h('b', fmt(price)));
                buy.onclick = () => {
                    click();
                    if (price > Market.gold) { toast(L('거래 금화가 부족해요') + ` (${fmt(Market.gold)} / ${fmt(price)})`); return; }
                    UI.confirmBox(L('{0}을(를) 거래 금화 {1}에 살까요?\n산 장비는 다시 팔 수 없어요.', `${RARITY[it.r].name} ${itemName(it)}`, fmt(price)), async () => {
                        const r = await Market.buy(row);
                        if (!say(r)) return;
                        showGold();
                        if (r.got && r.got.length) UI.showGot(L('거래소 구매'), r.got); else toast(L('우편함으로 보냈어요'));
                        res.rows = res.rows.filter(x => x !== row); fillBuy(list);
                    });
                };
                list.appendChild(h('div.mk-row', UI.itemCell(it, { noNew: true }),
                    h('div.mk-info', nameLine(it), h('div.mk-meta', metaText(it)), h('div.mk-stat', statText(it)),
                        h('div.mk-meta', `${row.name || '?'}#${row.tag || '----'} · ${left(row.expires)}`)), buy));
            }
            if (res.busy) list.appendChild(UI.catLoad(null, 'sm'));
            else if (!res.done) list.appendChild(h('button.btn.small.ghost.mk-more', { onclick: () => { click(); search(false); } }, L('더 보기')));
        }

        // ------------------------------------------------------------ 팔기
        async function drawSell() {
            const r = await Market.sync();
            body.innerHTML = '';
            if (r.error) { body.appendChild(h('div.mk-empty', Market.errText(r.error))); return; }
            showGold(); drawTabs(); drawLock();
            const c = Market.cfg || {};
            const items = Save.p.items.filter(it => Market.tradeable(it))
                .sort((a, b) => (Market.sellable(b) - Market.sellable(a)) || (b.r - a.r) || (b.ilvl - a.ilvl));
            body.appendChild(h('div.mk-count', L('올린 물건 {0} / {1}', r.listings.length, c.maxListings || 10)));
            if (!items.length) {
                body.appendChild(h('div.mk-empty', h('div', L('팔 수 있는 장비가 없어요')),
                    h('div.tip', L('레이드 보상 카드나 월드 보스 보상처럼 우편으로 받은 장비에 "거래" 표시가 붙어요. 그런 장비만 팔 수 있어요'))));
                return;
            }
            const list = h('div.mk-list');
            for (const it of items) {
                const why = it.enh ? L('강화한 장비는 팔 수 없어요') : isEquipped(it) ? L('장착 중이라 팔 수 없어요. 먼저 빼 주세요') : Market.bound(it) ? L('거래소에서 산 장비는 다시 팔 수 없어요') : '';
                list.appendChild(h('div.mk-row' + (why ? '.off' : ''), UI.itemCell(it, { noNew: true, onclick: () => { click(); UI.itemInfo(it); } }),
                    h('div.mk-info', nameLine(it), h('div.mk-meta', metaText(it)), why ? h('div.mk-why', why) : h('div.mk-stat', statText(it))),
                    why ? null : h('button.btn.small.gold', { onclick: () => { click(); sellModal(it); } }, L('팔기'))));
            }
            body.appendChild(list);
        }

        function sellModal(it) {
            const rg = Market.range(it.r);
            if (!rg) { toast(L('잠시 후 다시 해 주세요')); return; }
            const tier = Market.tierOf(it.ilvl);
            const clamp = v => Math.min(rg.max, Math.max(rg.min, Math.round(v)));
            let edited = false;
            const input = h('input.nick.mk-pin', { type: 'number', min: rg.min, max: rg.max, value: rg.min, inputMode: 'numeric' });
            const quick = h('div.mk-quick');
            const market = h('div.mk-mkt', UI.catLoad(null, 'mini'));
            const suggest = h('div.mk-sug');
            const calc = h('div.mk-calc');
            const setPrice = v => { input.value = clamp(v); upd(); };
            const upd = () => {
                const v = Math.round(Number(input.value) || 0), ok = v >= rg.min && v <= rg.max;
                calc.innerHTML = '';
                if (!ok) { calc.appendChild(h('div.mk-warn', L('{0} ~ {1} 사이로 정해 주세요', fmt(rg.min), fmt(rg.max)))); return; }
                const dep = Market.deposit(v), fee = Market.fee(v);
                const line = (k, val, cls = '') => h('div.mk-cl' + cls, h('span', k), h('b', val));
                calc.appendChild(line(L('지금 내는 보증금 (팔리면 돌려받음)'), '-' + fmt(dep)));
                calc.appendChild(line(L('팔리면 떼는 수수료 {0}%', Math.round(((Market.cfg && Market.cfg.fee) || 0.05) * 100)), '-' + fmt(fee)));
                calc.appendChild(line(L('팔리면 받는 거래 금화'), fmt(Market.payout(v, dep)), '.sum'));
                if (Market.gold < dep) calc.appendChild(h('div.mk-warn', L('보증금을 낼 거래 금화가 부족해요 (가진 금화 {0})', fmt(Market.gold))));
            };
            input.addEventListener('input', () => { edited = true; upd(); });
            upd();
            const go = h('button.btn.gold', L('판매 등록'));
            const sd = modal([h('h2', L('판매 등록')),
                h('div.mk-row.mk-head', UI.itemCell(it, { noNew: true }), h('div.mk-info', nameLine(it), h('div.mk-meta', metaText(it)), h('div.mk-stat', statText(it)))),
                market, suggest,
                h('label.mk-plabel', h('span', L('판매 가격 (거래 금화)')), input), h('div.mk-meta', L('정할 수 있는 값: {0} ~ {1}', fmt(rg.min), fmt(rg.max))),
                quick, calc,
                h('div.mk-meta', L('{0}시간 동안 올라가요. 그동안 장비는 가방에서 빠지고, 취소하거나 안 팔리면 우편으로 돌아와요(보증금은 사라져요)', (Market.cfg && Market.cfg.hours) || 48)),
                h('div.row', h('button.btn.ghost', { onclick: () => { click(); sd.remove(); } }, L('취소')), go)], { dismiss: true, cls: 'mk-sell' });
            go.onclick = busy(go, async () => {
                const v = Math.round(Number(input.value) || 0);
                if (v < rg.min || v > rg.max) { upd(); return; }
                if (!say(await Market.list(it, v))) return;
                sd.remove(); showGold(); toast(L('판매를 등록했어요')); tab = 'mine'; draw();
            });

            // price help: lowest listed now (same 착용 레벨 단계, then any), recent trades, a suggested price
            Promise.all([Market.lowest(it.slot, it.r, tier), Market.prices(it.slot, it.r)]).then(([low, trades]) => {
                if (!sd.isConnected) return;
                market.innerHTML = '';
                const row = (k, v, sub) => h('div.mk-cl', h('span', k), h('b', v), sub ? h('i', sub) : null);
                const none = L('없음');
                const lowOk = low && !low.error;
                market.appendChild(h('div.mk-mt', L('같은 장비 시세 ({0} {1}, {2})', RARITY[it.r].name, SLOT_NAME[it.slot], tierLabel(tier))));
                market.appendChild(row(L('지금 최저가'), lowOk && low.tier !== null ? fmt(low.tier) : none, lowOk && low.n ? L('올라온 {0}개 중', low.n) : ''));
                if (lowOk && low.any !== null && low.any !== low.tier) market.appendChild(row(L('다른 착용 레벨 포함 최저가'), fmt(low.any)));
                let recent = null;
                if (trades) {
                    const same = trades.filter(t => Market.tierOf(t.lv) === tier).slice(0, 5).map(t => Number(t.price)).sort((a, b) => a - b);
                    recent = same.length ? same[Math.floor((same.length - 1) / 2)] : null;
                    market.appendChild(row(L('최근 거래가'), recent !== null ? fmt(recent) : none, recent !== null ? L('최근 {0}건 가운데값', same.length) : L('14일 동안 거래 없음')));
                }
                if (!lowOk) market.appendChild(h('div.mk-meta', L('시세를 불러오지 못했어요')));
                // suggestion: 1 under the tier's lowest listing, else the recent trade price, else the lowest allowed
                const lowTier = lowOk ? low.tier : null;
                const sug = lowTier !== null ? clamp(lowTier - 1) : recent !== null ? clamp(recent) : rg.min;
                suggest.textContent = lowTier !== null ? L('추천 가격 {0}: 지금 최저가보다 1 싸게', fmt(sug))
                    : recent !== null ? L('추천 가격 {0}: 최근 거래가', fmt(sug)) : L('비교할 시세가 없어 가장 낮은 값을 넣었어요. 직접 바꿔도 돼요');
                if (!edited) setPrice(sug);
                quick.innerHTML = '';
                const chip = (t, v) => h('button.btn.small.ghost', { onclick: () => { click(); edited = true; setPrice(v); } }, t);
                if (lowTier !== null) quick.appendChild(chip(L('최저가와 같게'), lowTier));
                if (lowTier !== null) quick.appendChild(chip(L('최저가 -1'), lowTier - 1));
                if (recent !== null) quick.appendChild(chip(L('최근 거래가'), recent));
                quick.appendChild(chip(L('최소'), rg.min));
            }).catch(e => { console.warn('market price', e); if (sd.isConnected) market.textContent = L('시세를 불러오지 못했어요'); });
        }

        // ------------------------------------------------------------ 내 판매
        async function drawMine() {
            const r = await Market.sync();
            body.innerHTML = '';
            if (r.error) { body.appendChild(h('div.mk-empty', Market.errText(r.error))); return; }
            showGold(); drawTabs(); drawLock();
            const c = Market.cfg || {};
            body.appendChild(h('div.mk-count', L('올린 물건 {0} / {1}', r.listings.length, c.maxListings || 10)));
            if (!r.listings.length) {
                body.appendChild(h('div.mk-empty', h('div', L('올린 물건이 없어요')), h('div.tip', L('팔기 탭에서 "거래" 표시가 붙은 장비를 올려 보세요')),
                    h('button.btn.small.gold', { onclick: () => { click(); tab = 'sell'; draw(); } }, L('팔기로 가기'))));
                return;
            }
            const list = h('div.mk-list');
            for (const row of r.listings) {
                const it = preview(row), price = Number(row.price), x = h('button.btn.small.ghost', L('취소'));
                x.onclick = () => { click(); UI.confirmBox(L('판매를 취소할까요?\n장비는 돌아오고 보증금 {0}은(는) 돌려받지 못해요.', fmt(row.deposit)), async () => {
                    if (!say(await Market.cancel(row.id))) return;
                    toast(L('판매를 취소했어요')); draw();
                }); };
                list.appendChild(h('div.mk-row', UI.itemCell(it, { noNew: true, onclick: () => { click(); UI.itemInfo(it); } }),
                    h('div.mk-info', nameLine(it), h('div.mk-meta', metaText(it)),
                        h('div.mk-meta', h('span.mk-gtxt', goldIco(), fmt(price)), ` · ${L('팔리면 {0} 받음', fmt(Market.payout(price, Number(row.deposit))))} · ${left(row.expires)}`)), x));
            }
            body.appendChild(list);
        }

        // ------------------------------------------------------------ 금화·정산
        async function drawGold() {
            const r = await Market.sync();
            body.innerHTML = '';
            if (r.error) { body.appendChild(h('div.mk-empty', Market.errText(r.error))); return; }
            showGold(); drawTabs(); drawLock();
            const c = Market.cfg || {}, feePct = Math.round((c.fee || 0.05) * 100);
            const waiting = r.listings.reduce((s, l) => s + Market.payout(Number(l.price), Number(l.deposit)), 0);
            const sec = (title, ...kids) => h('div.mk-sec', h('b', title), ...kids);
            body.appendChild(h('div.mk-bal', goldIco(), h('div', h('b', fmt(Market.gold)), h('span', L('지금 가진 거래 금화')))));
            body.appendChild(sec(L('거래 금화란?'), h('div', L('거래소에서 장비를 사고팔 때만 쓰는 돈이에요. 은화·보석과는 따로이고, 서버 계정에 보관돼서 기기를 바꿔도 그대로예요'))));
            body.appendChild(sec(L('모으는 법'), h('div', L('레이드 보상 카드, 월드 보스 순위 보상, 그리고 내가 올린 장비가 팔렸을 때 들어와요'))));
            body.appendChild(sec(L('정산 (판매 대금 받기)'),
                h('div', L('장비가 팔리면 가격에서 수수료 {0}%를 빼고, 올릴 때 낸 보증금까지 더해서 바로 들어와요. 따로 받을 필요가 없고 우편함에 "판매 완료" 알림이 와요', feePct)),
                r.listings.length ? h('div.mk-wait', L('지금 올린 {0}개가 모두 팔리면 {1} 더 받아요', r.listings.length, fmt(waiting))) : null));
            body.appendChild(sec(L('쓰는 곳'), h('div', L('사기 탭에서 다른 냥이의 장비를 살 때 써요. 다른 재화로 바꿀 수는 없어요'))));
            const hist = h('div.mk-sec', h('b', L('내 최근 거래')));
            if (!r.history.length) hist.appendChild(h('div.tip', L('아직 거래한 적이 없어요')));
            for (const t of r.history) hist.appendChild(h('div.mk-cl', h('span', t.sold ? L('판매') : L('구매')), h('i', new Date(t.at).toLocaleString()),
                h('b', { style: { color: t.sold ? '#2f7a1a' : '#a0401a' } }, t.sold ? '+' + fmt(t.price - t.fee) : '-' + fmt(t.price))));
            if (r.history.some(t => t.sold)) hist.appendChild(h('div.mk-meta', L('판매 금액은 수수료를 뺀 값이에요 (돌려받은 보증금 제외)')));
            body.appendChild(hist);
        }

        function draw() {
            if (!document.body.contains(d)) return;
            drawTabs(); drawLock(); showGold();
            if (tab === 'buy') { drawBuy(); return; }
            loading();
            (tab === 'sell' ? drawSell() : tab === 'mine' ? drawMine() : drawGold())
                .catch(e => { console.warn('market', e); body.innerHTML = ''; body.appendChild(h('div.mk-empty', L('불러오지 못했어요'))); });
        }
        Market.wallet().then(() => { showGold(); drawLock(); });
        if (!Market.mine) Market.sync().then(() => { if (document.body.contains(d)) drawTabs(); });
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
