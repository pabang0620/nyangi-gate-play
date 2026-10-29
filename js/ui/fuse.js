'use strict';
// UI - 장비 합성: pick a grade, see how many spare pieces there are and the odds, fuse three once or all of them.
// Rules in FUSE (js/data/rules.js), the work in fuseOnce / bulkFuse (js/save.js). Part of the UI namespace.
(() => {
    const click = (...a) => UI.click(...a);
    const modal = (...a) => UI.modal(...a);

    function fuseModal() {
        const p = Save.p;
        const st = { r: 0, enh: false, skip: new Set() };   // skip: pieces the player took out of the fusing
        const gRow = h('div.row'), info = h('div.tip'), odds = h('div'), enhT = h('div.btn.small');   // odds is kept only as a scratch node
        const formula = h('div.fz-formula'), gridBox = h('div.fz-grid'), legend = h('div.tip.fz-legend');
        const one = h('button.btn'), all = h('button.btn.gold');
        const draw = () => {
            gRow.innerHTML = '';
            FUSE.rate.forEach((_, r) => gRow.appendChild(h('div.btn.small' + (r === st.r ? '.gold' : ''), { onclick: () => { click(); st.r = r; draw(); } },
                h('span', { style: { color: RARITY[r].color, textShadow: 'var(--stroke-s)' } }, RARITY[r].name))));
            const cands = fuseTargets(p, st.r, st.enh), tg = cands.filter(x => !st.skip.has(x.id)), n = tg.length, full = Math.floor(n / FUSE.n) * FUSE.n;
            // what goes in: the three that one fusing takes, the arrow, and what may come out
            formula.innerHTML = '';
            for (let i = 0; i < FUSE.n; i++) formula.appendChild(tg[i] ? UI.itemCell(tg[i], { noNew: true }) : h('div.cell.fz-empty', '+'));
            formula.appendChild(h('div.fz-arrow', h('span.fz-rate', L('성공 {0}%', FUSE.rate[st.r]))));
            formula.appendChild(h('div.cell.fz-out.r' + (st.r + 1), h('span.fz-q', '?'), h('span.fz-nx', { style: { color: RARITY[st.r + 1].color } }, RARITY[st.r + 1].name)));
            // every candidate is shown: the ones that would be used have a check (gold frame = the first fusing), a tap takes a piece out or puts it back
            gridBox.innerHTML = '';
            const used = new Set(tg.slice(0, full).map(x => x.id)), first = new Set(tg.slice(0, FUSE.n).map(x => x.id));
            fuseTargets(p, st.r, st.enh).forEach(it => {
                const off = st.skip.has(it.id);
                const c = UI.itemCell(it, { noNew: true, onclick: () => { click(); if (off) st.skip.delete(it.id); else st.skip.add(it.id); draw(); } });
                if (off) { c.classList.add('fz-off'); c.appendChild(h('span.fz-x', '–')); }
                else if (used.has(it.id)) { c.classList.add('fz-in'); c.appendChild(h('span.fz-ck', '✓')); }
                if (first.has(it.id)) c.classList.add('fz-one');
                gridBox.appendChild(c);
            });
            if (!cands.length) gridBox.appendChild(h('div.tip', L('이 등급에는 합성할 장비가 없어요')));
            legend.textContent = L('✓ 합성에 쓰는 장비 · 금색 테두리는 1회 합성 · 장비를 누르면 빼거나 다시 넣어요');
            odds.innerHTML = '';
            odds.appendChild(h('div', h('span', { style: { color: RARITY[st.r].color } }, RARITY[st.r].name), L(' {0}개 → ', FUSE.n),
                h('span', { style: { color: RARITY[st.r + 1].color } }, RARITY[st.r + 1].name), L(' 1개 · 성공 {0}%', FUSE.rate[st.r])));
            info.textContent = n >= FUSE.n ? L('합성할 수 있는 장비 {0}개 · 실패하면 {1} 1개가 돌아와요', n, RARITY[st.r].name) : L('장비 {0}개 더 필요해요 (지금 {1}개 / 필요 {2}개)', FUSE.n - n, n, FUSE.n);
            info.classList.toggle('fz-short', n < FUSE.n);
            enhT.classList.toggle('gold', st.enh); enhT.textContent = (st.enh ? '✓ ' : '') + L('강화한 장비도 넣기');
            one.classList.toggle('off', n < FUSE.n); all.classList.toggle('off', n < FUSE.n);
        };
        enhT.addEventListener('click', () => { click(); st.enh = !st.enh; draw(); });
        const run = bulk => {
            const list = fuseTargets(p, st.r, st.enh, st.skip);
            if (list.length < FUSE.n) { toast(L('같은 등급 장비가 {0}개 필요해요', FUSE.n)); return; }
            click();
            const go = () => {
                const used = bulk ? null : list.slice(0, FUSE.n);   // shown flying in
                const res = bulk ? bulkFuse(p, st.r, st.enh, st.skip) : [fuseOnce(p, st.r, st.enh, st.skip)];
                if (!bulk) Save.save();
                result(res, st.r, used);
                draw();
            };
            // last check before pieces are used up: how many go, and a warning when enhanced gear is among them
            const n = bulk ? Math.floor(list.length / FUSE.n) * FUSE.n : FUSE.n, taking = list.slice(0, n), hasEnh = taking.some(x => x.enh);
            UI.confirmBox(L('{0} 장비 {1}개를 합성해요.', RARITY[st.r].name, n) + (hasEnh ? '\n' + L('강화한 장비가 들어 있어요. 강화는 사라져요.') : ''), go);
        };
        one.textContent = L('1회 합성'); one.addEventListener('click', () => run(false));
        all.textContent = L('일괄 합성'); all.addEventListener('click', () => run(true));
        // two columns: the recipe and its buttons on the left, every candidate piece on the right (gaps leave room for each piece's grade bar)
        const d = modal([h('div.title-t', L('장비 합성')),
            h('div.fz-cols',
                h('div.fz-left', gRow, formula, info, h('div.row', one, all), enhT),
                h('div.fz-right', gridBox, legend, h('div.tip', L('장착 중·거래 가능 장비는 넣지 않아요. 레벨이 낮은 것부터 들어가요'))))], { dismiss: true, cls: 'fuse-pop' });
        draw();
    }

    // fusing takes a moment like a summon: the pieces circle and glow (a loading bar for a bulk run), then the result opens;
    // a 영웅 or better result gets the big reveal (clip, fanfare, buzz), a failure just drops the grade back
    function result(res, r, used) {
        const ok = res.filter(x => x.ok).length;
        const got = res.filter(x => x.ok).map(x => x.it);
        const single = res.length === 1 && used;
        const best = got.reduce((m, it) => Math.max(m, it.r), -1);
        const WAIT = single ? 1500 : 1100;
        const body = h('div.fz-body');
        const charge = single
            ? h('div.fz-charge', h('div.fz-orbit', used.map(it => UI.itemCell(it, { noNew: true }))), h('div.fz-glow'))
            : h('div.fz-charge.bulk', h('div.tip', L('{0}번 합성하는 중…', res.length)));
        body.append(charge, h('div.fz-wait', L('합성 중…')), h('div.fz-bar', h('i', { style: { animationDuration: WAIT + 'ms' } })));
        const d = modal([h('div.title-t', L('합성')), body], { noClose: true });
        Sfx.play('charge', Math.max(1, Math.min(4, r + 1)));
        setTimeout(() => {
            if (!d.isConnected) return;
            const reveal = () => {
            if (!d.isConnected) return;
            body.innerHTML = '';
            if (single) {
                const cell = UI.itemCell(res[0].it, { noNew: true, onclick: () => { click(); UI.itemInfo(res[0].it); } });
                cell.style.width = '80px'; cell.style.height = '80px';
                cell.classList.add('fz-resc', res[0].ok ? 'win' : 'lose');
                const stage = h('div.fz-resbox', cell);
                body.append(stage, h('div', ok ? L('성공! {0} 장비가 나왔어요', RARITY[r + 1].name) : L('실패 · {0} 장비 1개가 돌아왔어요', RARITY[r].name)));
            } else {
                body.append(h('div', L('{0}번 합성 · 성공 {1}번', res.length, ok)),
                    got.length ? h('div.row', { style: { flexWrap: 'wrap', justifyContent: 'center' } }, got.map(it => UI.itemCell(it, { noNew: true, onclick: () => { click(); UI.itemInfo(it); } })))
                        : h('div.tip', L('이번엔 {0} 장비가 나오지 않았어요', RARITY[r + 1].name)));
            }
            body.appendChild(h('button.btn.gold', { onclick: () => { click(); d.remove(); } }, L('확인')));
            d.firstChild.appendChild(h('button.modal-x', { onclick: () => { click(); d.remove(); } }, '✕'));
            d.addEventListener('click', e => { if (e.target === d) d.remove(); });
            const cellEl = body.querySelector('.fz-resc');
            if (ok && best >= 2 && UI.bigReveal) UI.bigReveal(best, cellEl || null);   // fanfare + the grade clip on the result piece
            else Sfx.play(ok ? 'coin' : 'click');
            if (ok && best >= 2) d.classList.add('fz-win-hi');
            };
            // 영웅 or better: the summon's full-popup grade clip plays first, then the result opens
            if (ok && best >= 2 && UI.rarityBeam) UI.rarityBeam(d, best, reveal); else reveal();
        }, WAIT);
    }

    Object.assign(UI, { fuseModal });
})();
