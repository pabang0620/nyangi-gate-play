'use strict';
// UI - 장비 합성: pick a grade, see how many spare pieces there are and the odds, fuse three once or all of them.
// Rules in FUSE (js/data/rules.js), the work in fuseOnce / bulkFuse (js/save.js). Part of the UI namespace.
(() => {
    const click = (...a) => UI.click(...a);
    const modal = (...a) => UI.modal(...a);

    function fuseModal() {
        const p = Save.p;
        const st = { r: 0, enh: false };
        const gRow = h('div.row'), info = h('div.tip'), odds = h('div'), enhT = h('div.btn.small');
        const one = h('button.btn'), all = h('button.btn.gold');
        const draw = () => {
            gRow.innerHTML = '';
            FUSE.rate.forEach((_, r) => gRow.appendChild(h('div.btn.small' + (r === st.r ? '.gold' : ''), { onclick: () => { click(); st.r = r; draw(); } },
                h('span', { style: { color: RARITY[r].color, textShadow: 'var(--stroke-s)' } }, RARITY[r].name))));
            const n = fuseTargets(p, st.r, st.enh).length;
            odds.innerHTML = '';
            odds.appendChild(h('div', h('span', { style: { color: RARITY[st.r].color } }, RARITY[st.r].name), L(' {0}개 → ', FUSE.n),
                h('span', { style: { color: RARITY[st.r + 1].color } }, RARITY[st.r + 1].name), L(' 1개 · 성공 {0}%', FUSE.rate[st.r])));
            info.textContent = L('합성할 수 있는 장비 {0}개 · 실패하면 {1} 1개가 돌아와요', n, RARITY[st.r].name);
            enhT.classList.toggle('gold', st.enh); enhT.textContent = (st.enh ? '✓ ' : '') + L('강화한 장비도 넣기');
            one.classList.toggle('off', n < FUSE.n); all.classList.toggle('off', n < FUSE.n);
        };
        enhT.addEventListener('click', () => { click(); st.enh = !st.enh; draw(); });
        const run = bulk => {
            if (fuseTargets(p, st.r, st.enh).length < FUSE.n) { toast(L('같은 등급 장비가 {0}개 필요해요', FUSE.n)); return; }
            click();
            const res = bulk ? bulkFuse(p, st.r, st.enh) : [fuseOnce(p, st.r, st.enh)];
            if (!bulk) Save.save();
            result(res, st.r);
            draw();
        };
        one.textContent = L('1회 합성'); one.addEventListener('click', () => run(false));
        all.textContent = L('일괄 합성'); all.addEventListener('click', () => run(true));
        const d = modal([h('div.title-t', L('장비 합성')), gRow, odds, info, enhT,
            h('div.tip', L('장착 중·거래 가능 장비는 넣지 않아요. 레벨이 낮은 것부터 들어가요')),
            h('div.row', one, all, h('button.btn.ghost', { onclick: () => { click(); d.remove(); UI.S.selItem = null; UI.showHub('hero'); } }, L('닫기')))], { dismiss: true });
        draw();
    }

    // what came out: successes first, tap any for its options
    function result(res, r) {
        const ok = res.filter(x => x.ok).length;
        if (ok) Sfx.play('coin');
        const got = res.filter(x => x.ok).map(x => x.it);
        const d = modal([h('div.title-t', L('합성 결과')),
            h('div', L('{0}번 합성 · 성공 {1}번', res.length, ok)),
            got.length ? h('div.row', { style: { flexWrap: 'wrap', justifyContent: 'center' } }, got.map(it => UI.itemCell(it, { noNew: true, onclick: () => { click(); UI.itemInfo(it); } })))
                : h('div.tip', L('이번엔 {0} 장비가 나오지 않았어요', RARITY[r + 1].name)),
            h('button.btn.gold', { onclick: () => { click(); d.remove(); } }, L('확인'))], { dismiss: true });
    }

    Object.assign(UI, { fuseModal });
})();
