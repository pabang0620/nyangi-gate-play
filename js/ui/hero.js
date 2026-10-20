'use strict';
// UI - hero & gear (enhance), research, summon.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const root = (...a) => UI.root(...a);
    const S = UI.S;
    const ico = (...a) => UI.ico(...a);
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const itemCell = (...a) => UI.itemCell(...a);
    const modal = (...a) => UI.modal(...a);
    const confirmBox = (...a) => UI.confirmBox(...a);
    const showHub = (...a) => UI.showHub(...a);


    // hero & gear ---------------------------------------------------
    function tabHero() {
        const p = Save.p, cls = p.hero, hs = heroStats(p, cls), hd = p.heroes[cls];
        const win = h('div.panel.win');
        const left = h('div.inset.hero-left');
        left.appendChild(h('div.classpick', Object.keys(HEROES).map(c =>
            h('button.btn.small' + (c === cls ? '.gold' : '.ghost'), { onclick: () => { click(); p.hero = c; Save.save(); showHub('hero'); } }, HEROES[c].name))));
        const port = h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
            h('div.portrait', { style: { width: '100px', height: '100px' }, title: L('배경색 바꾸기'), onclick: () => { click(); avatarBgModal(); } },
                (() => { const a = img(heroFace(cls, Save.p.shop && Save.p.shop.skin[cls])); a.style.background = avatarBg(); return a; })(), h('span.av-edit', L('배경'))),
            h('div.hl-info',
                h('div', { style: { fontSize: '22px', color: '#f5c451', fontFamily: 'BlackHan', textShadow: 'var(--stroke-s)' } }, `${HERO_NAMES[cls]} (${HEROES[cls].name})  Lv.${hd.lv}`),
                h('div.tip', HEROES[cls].desc),
                h('div.bar.xp', { style: { marginTop: '6px' } }, h('i', { style: { width: (hd.lv >= HERO_MAX_LV ? 100 : hd.xp / heroXpNeed(hd.lv) * 100) + '%' } })),
                h('div.tip', hd.lv >= HERO_MAX_LV ? L('최고 레벨') : L('경험치 {0} / {1}', hd.xp, heroXpNeed(hd.lv)))));
        left.appendChild(port);
        // shared-gear and synergy notes under the portrait row, full width (they crowded the narrow column beside it)
        left.appendChild(h('div.hl-notes',
                h('div.tip', { style: { fontSize: '13px' } }, L('장비는 세 영웅이 같이 써요')),
                h('div.tip', { style: { fontSize: '13px' } }, L('시너지: 기사·마법사가 묶은 적에게 영웅이 강해져요 · 마법사는 아군 회복'))));
        Rewards.ensure(p);
        // skins: the collection button, then default + owned ones (best grade first) in a scrolling row
        const owned = SKINS[cls].filter(s => p.shop.skins.includes(s.id)).sort((a, b2) => b2.r - a.r).map(s => s.id);
        left.appendChild(h('div.skinpick', h('div.sk.more', { onclick: () => { click(); skinBook(cls); } }, h('b', '+'), h('span', L('스킨 {0}/{1}', owned.length, SKINS[cls].length))), [null, ...owned].map(id => {
            const s = id && skinById(id), on = (p.shop.skin[cls] || null) === id;
            const c = h('div.sk' + (on ? '.on' : '') + (s ? '.r' + s.r : ''), img(heroFace(cls, id)), h('span', s ? s.name.split(' ')[0] : L('기본')));
            c.addEventListener('click', () => { click(); skinPreview(cls, id); });
            return c;
        })));
        // the worn skin's option and trail
        const eq = p.shop.skin[cls] && skinById(p.shop.skin[cls]), eqT = eq && skinTier(eq);
        if (eq) left.appendChild(h('div.tip.skopt', h('span', { style: { color: RARITY[eq.r].color } }, eq.name), ' · ', skinOpt(eq).text,
            eqT.short ? h('span.sknote.t-' + skinTierId(eq), ' ', eqT.short) : null));
        const b = computeBonuses(p);
        const stat = (k, v) => h('div.statline', h('span.muted', k), h('span', v));
        left.appendChild(h('div', stat(L('체력'), fmt(hs.hp)), stat(L('공격력'), fmt(hs.atk)), stat(L('치명타'), pct(hs.crit)),
            stat(L('스킬 대기 감소'), pct(hs.cdr)), stat(L('모든 탑 피해'), '+' + pct(b.towerDmg, 1))));
        // skills: a compact icon row (the full list did not fit under the stats on phones); tap for the descriptions
        const skillPop = () => UI.infoModal(L('{0}의 스킬', HERO_NAMES[cls]), h('div.skill-list', SKILLS[cls].map((sk, i) => {
            const locked = hd.lv < SKILL_UNLOCK[i];
            return h('div.skrow' + (locked ? '.lock' : ''), h('div.skill' + (i === 3 ? '.ult' : ''), Art.domCanvas(Art.icon(sk.id), 2.3)),
                h('div', h('b', `${sk.name} `), h('span.muted', locked ? L('Lv.{0} 해금', SKILL_UNLOCK[i]) : L('대기 {0}초', sk.cd)), h('div', sk.desc)));
        })));
        left.insertBefore(h('div.skillrow', { onclick: () => { click(); skillPop(); } }, h('span.sr-l', L('스킬')),
            SKILLS[cls].map((sk, i) => h('div.skill' + (i === 3 ? '.ult' : '') + (hd.lv < SKILL_UNLOCK[i] ? '.lock' : ''), Art.domCanvas(Art.icon(sk.id), 1.6))),
            h('span.sr-more', L('설명 ▸'))), left.children[2]);
        const right = h('div.inset.hero-right');
        right.appendChild(h('div.equiprow', h('div.eqlabel', L('장착')),
            SLOTS.map(s => { const it = itemById(p.equip[s]); return it ? itemCell(it, { onclick: () => { S.selItem = it.id; showHub('hero'); }, sel: S.selItem === it.id }) : h('div.cell', { style: { opacity: .5 } }, Art.domCanvas(Art.icon(s), 3)); })));
        right.appendChild(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            h('div', { style: { fontSize: '20px', color: '#f5c451', fontFamily: 'BlackHan' } }, L('가방 {0}/{1}', p.items.length, BAG_MAX)), h('div', { style: { flex: 1 } }),
            h('button.btn.small.gold', { onclick: () => { click(); bestGearPreview(cls); } }, L('최적 장착')),
            h('button.btn.small', { onclick: () => { click(); UI.fuseModal(); } }, L('합성')),
            h('button.btn.small', { onclick: () => { click(); salvageModal(); } }, L('일괄 분해'))));
        const items = p.items.slice().sort((a, b2) => (isEquipped(b2) - isEquipped(a)) || (b2.r - a.r) || (b2.ilvl - a.ilvl) || (b2.enh - a.enh));
        right.appendChild(h('div.grid', items.map(it => itemCell(it, { sel: S.selItem === it.id, onclick: () => { click(); it.isNew = false; S.selItem = it.id; Save.save(); showHub('hero'); } }))));
        // NEW shows this one time: the bag has now been seen
        if (p.items.some(i => i.isNew)) { p.items.forEach(i => { i.isNew = false; }); Save.save(); }
        win.appendChild(h('div.hero-wrap', left, right));
        root().appendChild(win);
        // item details open as a popup over the screen (a fixed panel under the bag hid most of the bag on phones)
        const sel = itemById(S.selItem);
        if (sel) {
            const close = () => { S.selItem = null; d.remove(); };
            const d = h('div.dim', h('div.detail-pop', h('button.x', { onclick: () => { click(); close(); } }, '✕'), itemDetail(sel)));
            d.addEventListener('click', e => { if (e.target === d) close(); });
            root().appendChild(d);
        }
    }

    // 최적 장착 used to swap everything on one tap; now it shows what changes and how much the hero gains
    function bestGearPreview(cls) {
        const p = Save.p, pick = {};
        for (const s of SLOTS) {
            let best = null;
            for (const it of p.items) if (it.slot === s && (!best || itemScore(it) > itemScore(best))) best = it;
            if (best) pick[s] = best.id;
        }
        const changed = SLOTS.filter(s => pick[s] && p.equip[s] !== pick[s]);
        if (!changed.length) { toast(L('가장 좋은 장비를 장착했습니다')); return; }
        const keep = { ...p.equip }, before = heroStats(p, cls);
        Object.assign(p.equip, pick);
        const after = heroStats(p, cls);
        p.equip = keep;
        const line = (k, b2, a, isPct) => {
            const dv = a - b2, f = v => isPct ? pct(v) : fmt(Math.round(v));
            return h('div.statline', h('span.muted', k), h('span', f(b2) + ' \u25B6 ' + f(a)),
                h('span', { style: { color: dv >= 0 ? '#9fd65a' : '#ff7a5c' } }, ' ' + (dv >= 0 ? '+' : '-') + f(Math.abs(dv))));
        };
        const rows = [line(L('체력'), before.hp, after.hp), line(L('공격력'), before.atk, after.atk)];
        if (Math.abs(after.crit - before.crit) > 0.0005) rows.push(line(L('치명타'), before.crit, after.crit, true));
        if (Math.abs(after.cdr - before.cdr) > 0.0005) rows.push(line(L('스킬 대기 감소'), before.cdr, after.cdr, true));
        const d = modal([h('div.title-t', L('최적 장착')),
            h('div.eqprev', changed.map(s => {
                const now = itemById(keep[s]), nxt = itemById(pick[s]);
                return h('div.eqprev-row', h('span.muted.eqprev-s', SLOT_NAME[s]),
                    now ? itemCell(now, { noNew: true }) : h('div.cell', { style: { opacity: .5 } }, Art.domCanvas(Art.icon(s), 3)),
                    h('b.eqprev-a', '\u25B6'), itemCell(nxt, { noNew: true }));
            })),
            h('div.inset.eqprev-st', rows),
            h('div.row', h('button.btn.gold', { onclick: () => { click(); equipBest(); d.remove(); toast(L('가장 좋은 장비를 장착했습니다')); showHub('hero'); } }, L('장착')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('취소')))], { dismiss: true });
    }

    // a skin is shown big first (that is the only way to tell which one it is); equipping needs the button
    function skinPreview(cls, id, after) {
        const p = Save.p, s = id ? skinById(id) : null, on = (p.shop.skin[cls] || null) === (id || null);
        const own = !id || p.shop.skins.includes(id);   // the shop can open this for a skin that is not bought yet
        const t = s ? skinTier(s) : null;
        const d = modal([h('div.title-t', L('{0}의 스킨', HERO_NAMES[cls])),
            h('div.skp',
                h('div.skp-pic', img(heroPortrait(cls, id))),
                h('div.skp-info',
                    h('div.skp-n', { style: { color: s ? RARITY[s.r].color : '#d8c4a0' } }, s ? s.name : L('기본')),
                    s ? h('div.tip', RARITY[s.r].name, ' \u00b7 ', skinOpt(s).text) : null,
                    s && t.short ? h('div.sknote.t-' + skinTierId(s), t.short) : null)),
            h('div.row',
                !own ? null : on ? h('button.btn.off', L('착용 중'))
                    : h('button.btn.gold', { onclick: () => { click(); Rewards.equipSkin(cls, id || null); d.remove(); if (after) after(); else showHub('hero'); } }, L('착용')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true });
        d.querySelector('.modal').classList.add('skp-pop');
    }

    // a skin the player does not own: where it comes from (pass, skin summon, shop)
    function lockedSkin(s) {
        const head = h('div', { style: { color: RARITY[s.r].color } }, RARITY[s.r].name, ' · ', skinOpt(s).text);
        if (s.pass) { UI.infoModal(s.name, [head, h('div', L('성장 패스 보상입니다'))], [[L('보상 탭으로'), () => { S.rtab = 'day'; showHub('rewards'); }]]); return; }
        const toSummon = [L('스킨 소환'), () => { S.summonBanner = 'skin'; showHub('summon'); }];
        if (s.gacha) { UI.infoModal(s.name, [head, h('div', L('스킨 소환에서 나옵니다'))], [toSummon]); return; }
        UI.infoModal(s.name, [head, h('div', img('i_gem', '.icon'), ' ', L('보석 {0}개로 상점에서 살 수 있습니다', fmt(s.gems))), h('div', L('스킨 소환에서도 나옵니다'))],
            [[L('상점으로'), () => showHub('shop')], toSummon]);
    }

    // every skin of one hero: grade frame, option, trail, owned or how to get it; tap to wear
    function skinBook(cls) {
        const p = Save.p;
        const list = SKINS[cls].slice().sort((a, b) => b.r - a.r);
        const card = s => {
            const own = p.shop.skins.includes(s.id), on = p.shop.skin[cls] === s.id, t = skinTier(s);
            return h('div.skc.r' + s.r + (own ? '' : '.lock') + (on ? '.on' : ''), { onclick: () => {
                click();
                if (!own) { lockedSkin(s); return; }
                skinPreview(cls, s.id, () => { d.remove(); showHub('hero'); });
            } },
                img(heroFace(cls, s.id)),
                h('div.skc-g', { style: { color: RARITY[s.r].color } }, RARITY[s.r].name),
                h('div.skc-n', s.name), h('div.skc-o', skinOpt(s).text),
                t.short ? h('div.skc-t.t-' + skinTierId(s), t.short) : null,
                s.set ? h('div.skc-set', L('{0} 세트 {1}/{2}', SKIN_SETS[s.set], ...skinSetCount(p, s.set))) : null,
                h('div.skc-s', on ? L('착용 중') : own ? L('착용') : s.pass ? L('성장 패스') : s.gacha ? L('스킨 소환') : L('상점 · 소환')));
        };
        const n = SKINS[cls].filter(s => p.shop.skins.includes(s.id)).length;
        const d = modal([h('div.title-t', L('{0}의 스킨', HERO_NAMES[cls])),
            h('div.tip', L('보유 {0} / {1} · 스킨 능력치는 입은 스킨 하나만 적용됩니다', n, list.length)),
            h('div.skbook', list.map(card)),
            h('div.row', h('button.btn.gold', { onclick: () => { click(); d.remove(); S.summonBanner = 'skin'; showHub('summon'); } }, L('스킨 소환')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true });
        d.querySelector('.modal').classList.add('skbook-pop');
    }

    // tap the portrait: pick the avatar's background colour (top bar, hero tab, battle)
    function avatarBgModal() {
        const p = Save.p;
        const d = modal([h('h2', L('프로필 배경색')),
            h('div.av-swatches', AVATAR_BG.map(c => h('button.av-sw' + (avatarBg() === c ? '.on' : ''), { style: { background: c }, onclick: () => { click(); p.set.avBg = c; Save.save(); d.remove(); showHub('hero'); } },
                img(heroFace(p.hero, p.shop && p.shop.skin[p.hero]))))),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    function itemDetail(it) {
        const box = h('div.inset.detail');
        const p = Save.p, main = itemMain(it), eq = itemById(p.equip[it.slot]);
        const cost = enhanceCost(it), rate = ENHANCE.rate[it.enh];
        const cmp = eq && eq !== it ? (() => { const em = itemMain(eq); const dv = main.v - em.v; return h('span', { style: { color: dv >= 0 ? '#9fd65a' : '#ff7a5c' } }, ` (${dv >= 0 ? '▲' : '▼'}${main.pct ? pct(Math.abs(dv), 1) : fmt(Math.abs(dv))})`); })() : null;
        box.appendChild(h('div', { style: { display: 'flex', gap: '14px' } },
            itemCell(it, { noNew: true }),
            h('div', { style: { flex: 1 } },
                h('div', { style: { fontSize: '19px', color: RARITY[it.r].color } }, `${itemName(it)}${it.enh ? ' +' + it.enh : ''}`),
                h('div.muted', L('{0} {1} · 아이템 레벨 {2}', RARITY[it.r].name, SLOT_NAME[it.slot], itemLv(it))),
                it.mid ? h('div', { style: { color: '#7fe0d0', fontSize: '13px' } }, it.enh ? L('거래 가능 장비 (강화하지 않은 상태로만 팔 수 있어요)') : L('거래 가능 장비 · 거래소에서 팔 수 있어요')) : null,
                h('div', { style: { color: '#f5c451' } }, fmtOpt(main.name, main.v, main.pct), cmp),
                it.subs.map(sb => h('div', fmtOpt(SUB_OPTS[sb.k].name, sb.v, SUB_OPTS[sb.k].pct))),
            ),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '170px' } },
                isEquipped(it) ? h('button.btn.small.off', L('장착 중')) : h('button.btn.small.gold', { onclick: () => { click(); p.equip[it.slot] = it.id; it.isNew = false; Save.save(); showHub('hero'); } }, L('장착')),
                it.enh >= ENHANCE.max ? h('button.btn.small.off', L('최대 강화')) :
                    h('button.btn.small' + (p.silver < cost || ((p.mats && p.mats.stone) || 0) < enhanceStones(it.enh) ? '.off' : ''), { onclick: e => enhanceAnim(it, e.currentTarget) }, L('강화 {0} · ', pct(rate)), ico('silver', 16), fmt(cost),
                        enhanceStones(it.enh) ? h('span', ' · ', img('i_stone', '.icon'), enhanceStones(it.enh)) : null),
                it.enh >= ENHANCE.dropFrom && it.enh < ENHANCE.max ? h('div', { style: { fontSize: '12px', color: '#ff9090' } }, L('실패 시 하락 · 파괴 {0}', destroyPct(it.enh))) : null,
                it.enh >= ENHANCE.dropFrom && it.enh < ENHANCE.max ? guardToggle() : null,
                it.enh >= ENHANCE.destroyFrom && it.enh < ENHANCE.max ? shieldToggle() : null,
                it.enh < ENHANCE.max ? h('button.btn.small', { onclick: () => { click(); autoEnhanceModal(it); } }, L('자동 강화')) : null,
                isEquipped(it) ? null : h('button.btn.small.red', { onclick: () => { click(); confirmBox(L('{0}을(를) 분해할까요?\n은화 +{1}', itemName(it), fmt(salvageValue(it))), () => { p.items = p.items.filter(i => i !== it); p.silver += salvageValue(it); Save.save(); S.selItem = null; showHub('hero'); }); } },
                    L('분해 '), ico('silver', 16), fmt(salvageValue(it))),
            )));
        return box;
    }

    // hammer hits, then the result. Low levels are quick (1 hit), high levels slow (up to 3 slow hits);
    // from +10 (a failure drops a level) the result waits for a tap
    function enhanceAnim(it, btn) {
        const p = Save.p;
        if (it.enh >= ENHANCE.max) return;
        if (p.silver < enhanceCost(it)) { toast(L('은화가 부족합니다')); Sfx.play('click'); return; }
        if (((p.mats && p.mats.stone) || 0) < enhanceStones(it.enh)) { toast(L('강화석이 {0}개 필요합니다 (요일 도전 강화석 채굴장)', enhanceStones(it.enh))); Sfx.play('click'); return; }
        const risky = it.enh >= ENHANCE.dropFrom;
        const hits = it.enh < 5 ? 1 : it.enh < ENHANCE.dropFrom ? 2 : 3, gap = it.enh < 5 ? 160 : it.enh < ENHANCE.dropFrom ? 260 : 420;
        const d = modal([h('div.title-t', L('강화 중...')), h('div#anvil', { style: { transition: 'transform .08s' } }, itemCell(it, { noNew: true })), h('div#ehit', { style: { fontSize: '30px', height: '36px' } }, '')]);
        const cellBox = d.querySelector('#anvil'), hit = d.querySelector('#ehit');
        let n = 0;
        const iv = setInterval(() => {
            n++;
            Sfx.play('anvil');
            hit.textContent = L('쾅!').repeat(1);
            cellBox.style.transform = `rotate(${n % 2 ? -8 : 8}deg) scale(1.1)`;
            setTimeout(() => { cellBox.style.transform = ''; }, 90);
            if (n >= hits) {
                clearInterval(iv);
                const reveal = () => {
                    const was = it.enh;
                    const r = tryEnhance(it, risky && !!p.set.useGuard, false, risky && !!p.set.useShield);
                    d.remove();
                    if (!r) return;
                    if (r.destroyed) { S.selItem = null; showHub('hero'); Sfx.play('enhanceFail'); Game.buzz([80, 40, 160]); enhanceDestroyed(it, was); return; }
                    // showHub() clears the screen, so it has to run BEFORE the result popup is built
                    showHub('hero');
                    const flash = h('div.burst', { style: { background: r.ok ? 'radial-gradient(circle, rgba(255,224,138,.9), transparent 70%)' : 'radial-gradient(circle, rgba(120,120,140,.7), transparent 70%)' } });
                    root().appendChild(flash); setTimeout(() => flash.remove(), 800);
                    if (r.ok) { Sfx.play('enhanceOk'); enhanceResult(it, true, false, was); }
                    else { Sfx.play('enhanceFail'); enhanceResult(it, false, r.dropped, was, r.guarded, r.shielded); }
                };
                if (!risky) { setTimeout(reveal, gap); return; }
                // the tense part: the item glows and shakes until the player taps
                setTimeout(() => {
                    hit.textContent = L('터치해서 결과 보기');
                    cellBox.classList.add('enh-wait');
                    let done = false;
                    const go = e => { if (e) e.stopPropagation(); if (done) return; done = true; click(); reveal(); };
                    d.addEventListener('click', go);
                }, gap);
            }
        }, gap);
    }

    // 하락방지권 on/off for risky tries (kept in settings), with the count owned
    function guardToggle() {
        const p = Save.p, n = (p.mats && p.mats.guard) || 0;
        const on = !!p.set.useGuard && n > 0;
        return h('div.btn.small' + (on ? '.gold' : ''), { onclick: () => {
            click();
            if (!n) { toast(L('하락방지권이 없어요 (상점)')); return; }
            p.set.useGuard = !p.set.useGuard; Save.save(); showHub('hero');
        } }, (on ? '\u2713 ' : '') + L('하락방지권 {0}개', n));
    }

    function shieldToggle() {
        const p = Save.p, n = (p.mats && p.mats.shield) || 0;
        const on = !!p.set.useShield && n > 0;
        return h('div.btn.small' + (on ? '.gold' : ''), { onclick: () => {
            click();
            if (!n) { toast(L('파괴방지권이 없어요 (상점)')); return; }
            p.set.useShield = !p.set.useShield; Save.save(); showHub('hero');
        } }, (on ? '\u2713 ' : '') + L('파괴방지권 {0}개', n));
    }
    function enhanceDestroyed(it, was) {
        const d = modal([
            h('div.ribbon.lose', h('span', L('장비 파괴'))),
            h('div.enh-stamp.fail', { style: { filter: 'grayscale(1) brightness(.6)' } }, itemCell(it, { noNew: true }), h('div.num', { style: { fontSize: '44px' } }, '+' + was)),
            h('div.bad', L('{0}이(가) 부서졌어요', itemName(it))),
            h('div.tip', L('파괴방지권을 켜면 막을 수 있어요 (상점)')),
            h('button.btn', { onclick: () => { click(); d.remove(); } }, L('확인'))]);
    }

    // 자동 강화: target level + silver / stone caps, then one summary
    function autoEnhanceModal(it) {
        const p = Save.p, A = p.set.autoEnh = p.set.autoEnh || {};
        let target = Math.min(ENHANCE.max, Math.max(it.enh + 1, A.target || it.enh + 1));
        const SILVER = [100000, 500000, 2000000, 10000000, Infinity], STONE = [0, 10, 30, 100, Infinity];
        let si = SILVER.indexOf(A.silver) >= 0 ? SILVER.indexOf(A.silver) : 1, ti = STONE.indexOf(A.stones) >= 0 ? STONE.indexOf(A.stones) : 2;
        const lbl = v => v === Infinity ? L('제한 없음') : fmtShort(v);
        const tgt = h('div.num', { style: { fontSize: '30px', minWidth: '70px', textAlign: 'center' } });
        const sRow = h('div.row'), tRow = h('div.row');
        const draw = () => {
            tgt.textContent = '+' + target;
            sRow.innerHTML = ''; SILVER.forEach((v, i) => sRow.appendChild(h('div.btn.small' + (i === si ? '.gold' : ''), { onclick: () => { click(); si = i; draw(); } }, lbl(v))));
            tRow.innerHTML = ''; STONE.forEach((v, i) => tRow.appendChild(h('div.btn.small' + (i === ti ? '.gold' : ''), { onclick: () => { click(); ti = i; draw(); } }, lbl(v))));
        };
        const step = k => { target = Math.max(it.enh + 1, Math.min(ENHANCE.max, target + k)); draw(); };
        const d = modal([h('div.title-t', L('자동 강화')),
            h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' } }, itemCell(it, { noNew: true }), h('span.muted', L('목표')),
                h('button.btn.small', { onclick: () => { click(); step(-1); } }, '\u2212'), tgt, h('button.btn.small', { onclick: () => { click(); step(1); } }, '+')),
            h('div.muted', L('은화 최대')), sRow,
            h('div.muted', L('강화석 최대')), tRow,
            target > ENHANCE.dropFrom || it.enh >= ENHANCE.dropFrom ? guardToggle() : null,
            target > ENHANCE.destroyFrom || it.enh >= ENHANCE.destroyFrom ? shieldToggle() : null,
            target > ENHANCE.destroyFrom ? h('div.tip', L('+{0}부터는 파괴방지권이 있을 때만 자동으로 해요', ENHANCE.destroyFrom)) : null,
            h('div.row',
                h('button.btn.gold', { onclick: () => {
                    click(); d.remove();
                    Object.assign(A, { target, silver: SILVER[si], stones: STONE[ti] }); Save.save();
                    const run = autoEnhance(it, target, SILVER[si], STONE[ti], !!p.set.useGuard, !!p.set.useShield);
                    showHub('hero');
                    if (!run.tries) { toast(run.why === 'stoneCap' || run.why === 'short' && enhanceStones(it.enh) > ((p.mats && p.mats.stone) || 0) ? L('강화석이 부족해요') : L('은화가 부족해요')); return; }
                    Sfx.play(it.enh > run.start ? 'enhanceOk' : 'enhanceFail');
                    const why = { done: L('목표 달성!'), silverCap: L('은화 한도에서 멈춤'), stoneCap: L('강화석 한도에서 멈춤'), short: L('재화가 부족해 멈춤'), risk: L('파괴 위험 구간에서 멈춤') }[run.why] || '';
                    const m = modal([h('div.ribbon' + (it.enh > run.start ? '' : '.lose'), h('span', why)),
                        h('div.enh-stamp', itemCell(it, { noNew: true }), h('div.num', { style: { fontSize: '44px' } }, '+' + it.enh)),
                        h('div.enh-step' + (it.enh > run.start ? '.up' : '.same'), h('span', '+' + run.start), h('b', ' \u25B6 '), h('span', '+' + it.enh)),
                        h('div', L('{0}번 시도 · 성공 {1} · 하락 {2}', run.tries, run.ok, run.drops) + (run.guards ? L(' · 방지권 {0}개 사용', run.guards) : '') + (run.shields ? L(' · 파괴방지 {0}개 사용', run.shields) : '')),
                        h('div', ico('silver', 18), ' ', fmt(run.silver), run.stones ? h('span', '  ', img('i_stone', '.icon'), ' ', run.stones) : null),
                        h('button.btn.gold', { onclick: () => { click(); m.remove(); } }, L('확인'))]);
                } }, L('시작')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true });
        draw();
    }

    // 일괄 분해 설정: up to which grade, enhanced gear too or not (saved; the summon auto-salvage uses the same grade)
    function salvageModal() {
        const p = Save.p, cfg = salvageSet(p);
        const gRow = h('div.row'), info = h('div.tip'), enhT = h('div.btn.small'), go = h('button.btn.red');
        const draw = () => {
            gRow.innerHTML = '';
            [0, 1, 2].forEach(r => gRow.appendChild(h('div.btn.small' + (r === cfg.max ? '.gold' : ''), { onclick: () => { click(); cfg.max = r; draw(); } },
                h('span', { style: { color: RARITY[r].color, textShadow: 'var(--stroke-s)' } }, RARITY[r].name), L(' 이하'))));
            enhT.classList.toggle('gold', cfg.enh); enhT.textContent = (cfg.enh ? '\u2713 ' : '') + L('강화한 장비도 분해');
            const list = salvageTargets(p, cfg.max, cfg.enh);
            info.textContent = L('장착 중인 장비는 빼고 {0}개 · 은화 +{1}', list.length, fmt(list.reduce((s, it) => s + salvageValue(it), 0)));
            go.classList.toggle('off', !list.length);
        };
        enhT.addEventListener('click', () => { click(); cfg.enh = !cfg.enh; draw(); });
        go.textContent = L('분해');
        go.addEventListener('click', () => {
            p.set.salvage = { max: cfg.max, enh: cfg.enh }; Save.save();
            if (!salvageTargets(p, cfg.max, cfg.enh).length) { toast(L('분해할 장비가 없어요')); return; }
            click(); d.remove();
            const r = bulkSalvage(cfg.max, cfg.enh); toast(L('{0}개 분해 · 은화 +{1}', r.n, fmt(r.gain))); S.selItem = null; showHub('hero');
        });
        const d = modal([h('div.title-t', L('일괄 분해')), gRow, enhT, info,
            h('div.row', go, h('button.btn.ghost', { onclick: () => { click(); p.set.salvage = { max: cfg.max, enh: cfg.enh }; Save.save(); d.remove(); } }, L('설정만 저장')))], { dismiss: true });
        draw();
    }


    // research ---------------------------------------------------
    function tabResearch() {
        const p = Save.p;
        const free = totalStars(p) - spentStars(p);
        const win = h('div.panel.win');
        win.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' } },
            h('h2', { style: { margin: 0 } }, L('별 연구')), h('div.chip', ico('star'), L('남은 별 {0}', free)), h('div', { style: { flex: 1 } }),
            h('div.tip.rs-tip', L('스테이지에서 얻은 별로 영구 강화를 연구합니다. 위에서부터 차례로 엽니다.')),
            UI.helpBtn(L('별 연구'), L('스테이지에서 얻은 별로 영구 강화를 연구합니다. 위에서부터 차례로 엽니다.') + '\n' + L('연구를 모두 초기화하고 별을 돌려받습니다. (무료)'), '.mob-q'),
            h('button.btn.small.gold', { onclick: () => { click(); autoPick(false); } }, L('자동 찍기')),
            h('button.btn.small', { onclick: () => { click(); confirmBox(L('초기화하고 별을 골고루 다시 찍어요. (무료)'), () => autoPick(true)); } }, L('다시 배분')),
            h('button.btn.small.ghost', { onclick: () => { click(); confirmBox(L('연구를 모두 초기화하고 별을 돌려받습니다. (무료)'), () => { p.research = {}; Save.save(); showHub('research'); }); } }, L('초기화'))));
        // 자동 찍기 / 다시 배분 (reset first: research refunds are free)
        function autoPick(reset) {
            if (reset) p.research = {};
            const got = autoResearch(p);
            Save.save();
            if (got.length) { Sfx.play('upgrade'); toast(L('연구 {0}개 완료', got.length)); }
            else toast(reset ? L('연구 {0}개 완료', 0) : L('지금 찍을 수 있는 연구가 없어요'));
            showHub('research');
        }
        win.appendChild(h('div.tree', RESEARCH.map(col => h('div.inset.tcol', h('h3', col.col), col.nodes.map((n, i) => {
            const have = !!p.research[n.id];
            const prevOk = i === 0 || p.research[col.nodes[i - 1].id];
            const can = !have && prevOk && free >= n.cost;
            return h('div.rnode' + (have ? '.have' : can ? '.can' : prevOk ? '' : '.lock'), {
                onclick: () => {
                    if (have) return;
                    if (!prevOk) { toast(L('윗 단계를 먼저 연구하세요')); return; }
                    if (free < n.cost) { toast(L('별이 {0}개 더 필요합니다', n.cost - free)); return; }
                    p.research[n.id] = true; Save.save(); Sfx.play('upgrade'); showHub('research');
                }
            }, h('div.nm', h('span', n.name), have ? null : h('span.c', h('span', img('i_star', '.star'), n.cost))), h('div.rd', n.desc));
        })))));
        root().appendChild(win);
    }


    // summon ---------------------------------------------------
    // two banners (장비 / 스킨): left = what can come out and the rates, right = the buttons
    function tabSummon() {
        const p = Save.p;
        Rewards.ensure(p);
        const skin = S.summonBanner === 'skin';
        const slot = SLOTS.includes(S.summonSlot) ? S.summonSlot : 'any';
        const win = h('div.panel.win.glass.summonwin.sm2');
        const tab = (k, icon, label) => h('div.sm-tab' + ((k === 'skin') === skin ? '.on' : ''), { onclick: () => { if ((k === 'skin') === skin) return; click(); S.summonBanner = k; showHub('summon'); } }, icon, h('span', label));
        win.appendChild(h('div.sm-top',
            tab('gear', Art.domCanvas(Art.icon('weapon'), 1.5), L('장비 소환')),
            tab('skin', img(heroFace('mage', 'mage_star'), '.sm-tabpic'), L('스킨 소환')),
            h('div', { style: { flex: 1 } }),
            h('button.btn.small.ghost', { onclick: () => { click(); UI.probModal(); } }, L('확률 정보'))));
        const left = h('div.inset.sm-left'), right = h('div.sm-right');
        const rate = (r, face, v) => h('div.sm-rate', h('div.cell.r' + r, face), h('div.rn', { style: { color: RARITY[r].color } }, RARITY[r].name), h('div.num', v + '%'));
        const big = (label, cost, fn, bonus) => h('button.btn.gold.sm-big', { onclick: fn }, label,
            bonus ? h('span.sm-bonus', '+' + bonus) : null, ico('gem', 26), h('span.num', cost));
        if (!skin) {
            // gear type: random, or pick weapon / armor / charm (same price, same grade rates)
            left.appendChild(h('div.sm-slots', [['any', L('전체 (무작위)')], ...SLOTS.map(k => [k, SLOT_NAME[k]])].map(([k, nm]) =>
                h('div.btn.small' + (slot === k ? '.gold' : ''), { onclick: () => { if (slot === k) return; click(); S.summonSlot = k; showHub('summon'); } },
                    k === 'any' ? null : Art.domCanvas(Art.icon(k), 1.6), nm))));
            left.appendChild(h('div.sm-rates', RARITY.map((r, i) => rate(i, Art.domCanvas(Art.icon(slot === 'any' ? 'weapon' : slot), 3), SUMMON.table[i]))));
            left.appendChild(h('div.tip', L('{0}번째 소환까지 전설이 없으면 전설 확정 (현재 {1}/{2})', SUMMON.pity, p.pity, SUMMON.pity)));
            left.appendChild(h('div.tip', L('현재 소환 장비 레벨 {0} (최고 클리어 스테이지가 높을수록 올라갑니다)', Math.round(summonIlvl(p)))));
            right.appendChild(h('div.sm-pair',
                big(L('1회 소환'), SUMMON.cost1, () => { if (p.gems < SUMMON.cost1) { click(); UI.gemGate(SUMMON.cost1, '', () => {}); return; } runSummon(1, slot); }),
                big(L('10회 소환'), SUMMON.cost10, () => { click(); UI.gemGate(SUMMON.cost10, L('보석 {0}개로 10+1회 소환할까요?', SUMMON.cost10), () => runSummon(10, slot)); }, SUMMON.bonus10)));
            right.appendChild(h('button.btn.sm-cont', { onclick: () => { click(); contModal('gear', slot); } }, L('연속 소환 ▸')));
            const tk = p.tickets || 0, free = Rewards.adLeft(p, 'freeSummon');
            right.appendChild(h('div.sm-pair.sm-small',
                h('button.btn.small' + (free ? '' : '.off'), { onclick: async () => {
                    if (!Rewards.adLeft(p, 'freeSummon')) { toast(L('오늘 무료 소환을 이미 했습니다')); return; } click();
                    if (await Rewards.watchAd('freeSummon')) runSummon(1, slot, 'free');
                } }, img('i_ad', '.icon'), free ? L('무료 소환 (하루 1번)') : L('무료 소환 (내일 다시)')),
                h('button.btn.small' + (tk > 0 ? '' : '.off'), { onclick: () => {
                    if (!(tk > 0)) { toast(L('소환권이 없습니다')); return; } click(); runSummon(1, slot, 'tickets');
                } }, img('i_ticket', '.icon'), L('소환권 1장 ({0})', tk)),
                h('button.btn.small' + (tk >= 10 ? '' : '.off'), { onclick: () => {
                    if (tk < 10) { toast(L('소환권이 10장 필요합니다 (보유 {0})', tk)); return; } click();
                    UI.confirmBox(L('소환권 10장으로 10+1회 소환할까요?'), () => runSummon(10, slot, 'tickets'));
                } }, img('i_ticket', '.icon'), L('소환권 10장'))));
        } else {
            // one sample portrait per grade
            const sample = ['knight_red', 'mage_sunset', 'ranger_ninja', 'knight_santa', 'mage_kumiho'];
            left.appendChild(h('div.sm-rates', SKIN_SUMMON.table.map((v, r) => { const s = skinById(sample[r]); return rate(r, img(heroFace(s.cls, s.id), '.sm-pic'), v); })));
            left.appendChild(h('div.tip', L('{0}번째 소환까지 전설이 없으면 전설 확정 (현재 {1}/{2})', SKIN_SUMMON.pity, p.skinPity, SKIN_SUMMON.pity)));
            left.appendChild(h('div.tip.sm-dup', L('가진 스킨이 나오면 보석으로: {0}', SKIN_SUMMON.dupGems.map((g, r) => `${RARITY[r].name} ${g}`).join(' · '))));
            const pool = [0, 1, 2, 3, 4].flatMap(skinPool);
            left.appendChild(h('div.tip', L('모은 스킨 {0} / {1} · 영웅은 발자국, 전설은 잔상', pool.filter(id => p.shop.skins.includes(id)).length, pool.length)));
            right.appendChild(h('div.sm-pair',
                big(L('1회 소환'), SKIN_SUMMON.cost1, () => { if (p.gems < SKIN_SUMMON.cost1) { click(); UI.gemGate(SKIN_SUMMON.cost1, '', () => {}); return; } runSkinSummon(1); }),
                big(L('10회 소환'), SKIN_SUMMON.cost10, () => { click(); UI.gemGate(SKIN_SUMMON.cost10, L('보석 {0}개로 스킨 10+1회 소환할까요?', SKIN_SUMMON.cost10), () => runSkinSummon(10)); }, SKIN_SUMMON.bonus10)));
            right.appendChild(h('button.btn.sm-cont', { onclick: () => { click(); contModal('skin'); } }, L('연속 소환 ▸')));
            right.appendChild(h('div.tip', L('스킨마다 작은 능력치가 붙습니다. 소환권은 장비 소환에만 쓸 수 있습니다.')));
        }
        win.appendChild(h('div.sm-body', left, right));
        root().appendChild(win);
    }

    // shared reveal helpers
    const calmFx = () => Save.p.set.noShake || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const tint = (el, r) => { el.style.setProperty('--c', RARITY[r].color); el.style.setProperty('--c2', RARITY[r].color + '66'); return el; };
    // grade clip (black background, so only the light shows): 2 = purple, 3 = gold, 4 = orange
    const VFX = { 2: 'vfx/summon_epic.mp4', 3: 'vfx/summon_legend.mp4', 4: 'vfx/summon_mythic.mp4' };
    // the clip plays on the card/cell that was revealed - never a burst in the middle of the screen
    function playVfx(el, r) {
        const src = VFX[Math.min(4, r)];
        if (!el || !src || calmFx()) return;
        el.querySelectorAll('video.vfx-clip').forEach(v => v.remove());
        const v = UI.vfx(src, el, { z: 6 });
        if (v) v.classList.add('vfx-spot');
    }
    // tapping a high-grade card open: sound, vibration, and the clip on that card
    function bigReveal(r, el) {
        if (r >= 3) { Sfx.play('fanfare', r); Music.duck(2200); Game.buzz([40, 60, 80]); }
        else Sfx.play('epic');
        playVfx(el, r);
    }
    // when the result popup opens, the best grade's clip plays once over it (tap to skip), then the cards are dealt.
    // calls done() once. The old CSS light pillar / flash is gone.
    function beam(d, top, done) {
        Sfx.play('summon', top);
        const src = calmFx() ? null : VFX[Math.min(4, top)];
        const v = src ? UI.vfx(src, d, { z: 50 }) : null;
        if (!v) { done(); return; }
        let fired = false;
        const end = () => { if (fired) return; fired = true; v.remove(); done(); };
        d.addEventListener('click', end, { once: true });
        setTimeout(end, top >= 3 ? 2000 : 1600);
    }
    // skin face for result cards and lists
    const skinFace = (x, big) => { const s = skinById(x.id); return [img(heroFace(s.cls, s.id), big ? '.sm-cardpic' : '')]; };
    function skinCell(x) {
        const s = skinById(x.id), c = h('div.cell.r' + x.r + (x.dup ? '.dup' : ''), { title: s.name }, img(heroFace(s.cls, s.id)));
        c.appendChild(x.dup ? h('span.eq.gemtag', ico('gem', 13), '+' + x.gems) : h('span.eq.new', 'NEW'));
        return c;
    }

    function runSummon(n, slot, pay) {
        const res = doSummon(n, slot, pay);
        if (!res) { toast(L('보석이 부족합니다')); Sfx.play('click'); return false; }
        reveal(res.map(it => ({ r: it.r, face: () => [Art.domCanvas(Art.itemIcon(it), 4)], name: itemName(it), item: it })),
            false, () => runSummon(n, slot, pay));
        return true;
    }
    function runSkinSummon(n) {
        const res = doSkinSummon(n);
        if (!res) { toast(L('보석이 부족합니다')); Sfx.play('click'); return false; }
        reveal(res.map(x => ({ r: x.r, face: () => skinFace(x, true), name: skinById(x.id).name,
            tag: x.dup ? L('중복 → 보석 +{0}', x.gems) : L('새 스킨!'), dup: x.dup, skin: skinById(x.id) })),
            true, () => runSkinSummon(n));
        return true;
    }

    // card reveal: list of { r, face(), name, tag? }; 영웅+ cards wait for a tap and open big in the middle of the screen.
    // 다시 소환 / 확인 stay locked until every card has been seen (no 모두 열기)
    function reveal(res, skin, again) {
        const top = Math.max(...res.map(x => x.r));
        const calm = calmFx();
        const cards = h('div.cards.sm-wait' + (skin ? '.sm-skins' : ''));
        const allSeen = () => els.every(c => c.classList.contains('open')) && !d.querySelector('.sm-spot');
        const notYet = () => { toast(L('카드를 모두 확인해 주세요')); els.filter(c => !c.classList.contains('open')).forEach(c => { c.classList.remove('sm-nudge'); void c.offsetWidth; c.classList.add('sm-nudge'); }); };
        const againBtn = again ? h('button.btn.off', { onclick: () => {
            if (!allSeen()) { notYet(); return; }
            click(); d.remove();
            if (!again()) showHub('summon');   // not enough left: back to the banner, the toast says why
        } }, res.length === 1 ? L('1회 소환') : L('10회 소환'),
            res.length > 1 && SUMMON.bonus10 ? h('span.sm-bonus', '+' + SUMMON.bonus10) : null) : null;
        const okBtn = h('button.btn.gold.off', { onclick: () => {
            if (!allSeen()) { notYet(); return; }
            click(); d.remove(); showHub('summon');
        } }, L('확인'));
        const d = modal([h('div.title-t', L('소환 결과')), cards,
            res.some(x => x.dup) ? h('div.tip', L('이미 가진 스킨은 보석으로 바뀌었습니다')) : null,
            h('div.row', againBtn, okBtn)]);
        if (calm) d.classList.add('calm');
        const els = res.map((x, i) => {
            const hi = x.r >= 2;
            const c = tint(h('div.card.r' + x.r + (hi ? '.hi' : ''), { style: { animationDelay: (i * 60) + 'ms' } },
                h('div.in', h('div.b'), h('div.f', ...x.face(),
                    h('div.rn', { style: { color: RARITY[x.r].color, textShadow: '0 1px 0 #2a170a' } }, RARITY[x.r].name), h('div.nm', x.name),
                    x.tag ? h('div.sm-tag', x.tag) : null))), x.r);
            c.res = x;
            c.addEventListener('click', () => { if (x.item && c.classList.contains('open')) { click(); UI.itemInfo(x.item); return; } flip(c, true); });   // opened gear: tap for the options
            return c;
        });
        els.forEach(c => cards.appendChild(c));
        const best = res.length > 1 ? els.find(c => c.res.r === top) : null;
        let dealt = false, shown = false;
        beam(d, top, () => { if (dealt) return; deal(); });
        function deal() {
            dealt = true;
            cards.classList.remove('sm-wait'); cards.classList.add('sm-deal');
            // normal grades flip by themselves; 영웅+ wait for a click (then a short beat before the flash)
            els.forEach((c, i) => { if (c.res.r < 2) setTimeout(() => flip(c, false), 350 + i * 90); });
        }
        function flip(c, user) {
            if (!dealt || c.classList.contains('open') || c.pending) return;
            const r = c.res.r;
            if (r >= 2 && user) {
                c.pending = true; c.classList.add('charging');
                Sfx.play('charge', r);
                setTimeout(() => open(c, true), 700);
            } else if (r < 2) open(c, false);
        }
        function open(c, loud) {
            if (c.classList.contains('open')) return;
            const r = c.res.r;
            c.classList.add('open'); c.classList.remove('hi', 'charging');
            if (r >= 1 && !calm) sparkle(c, r >= 3 ? 22 : r >= 2 ? 14 : 6);
            const newSkin = skin && loud && r >= 2 && !shown && c.res.skin && !c.res.dup;
            if (loud && r >= 2) { UI.bigReveal(r, null); spotlight(c, r, newSkin ? () => skinPreview(c.res.skin.cls, c.res.skin.id, () => Sfx.play('upgrade')) : null); }
            else if (r === 1) Sfx.play('rare');
            else Sfx.play('drop', r);
            if (newSkin) shown = true;   // a 영웅+ skin: after the spotlight, the skin itself big (the card face does not tell which one)
            if (els.every(e => e.classList.contains('open')) && best) best.classList.add('best');
            unlock();
        }
        function unlock() { const ok = allSeen(); okBtn.classList.toggle('off', !ok); if (againBtn) againBtn.classList.toggle('off', !ok); }
        // a 영웅+ card opens big in the middle of the screen with its clip behind it; tap (or wait) to put it back
        function spotlight(c, r, after) {
            const card = c.cloneNode(true); card.classList.remove('best', 'charging', 'hi', 'sm-nudge'); card.classList.add('sm-spot-card'); card.style.animationDelay = '';
            // cloneNode copies a <canvas> blank: paint the gear picture over again
            const from = c.querySelectorAll('canvas'); card.querySelectorAll('canvas').forEach((cv, i) => { const o = from[i]; if (o) { cv.width = o.width; cv.height = o.height; cv.getContext('2d').drawImage(o, 0, 0); } });
            const stage = h('div.sm-spot-in', card);
            const spot = h('div.sm-spot', stage, h('div.tip.sm-spot-hint', L('탭하여 계속')));
            d.appendChild(spot);
            const src = calm ? null : VFX[Math.min(4, r)];
            if (src) UI.vfx(src, spot, { z: 0, back: true });
            let gone = false;
            const close = () => { if (gone) return; gone = true; spot.remove(); unlock(); if (after) after(); };
            setTimeout(() => spot.addEventListener('click', close), 250);   // the tap that opened the card must not close it
            setTimeout(close, r >= 3 ? 3200 : 2400);
        }
        function sparkle(c, k) {
            for (let i = 0; i < k; i++) {
                const a = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 70;
                const s = h('i.sm-spark', { style: { animationDelay: (Math.random() * 0.12) + 's' } });
                s.style.setProperty('--dx', Math.cos(a) * dist + 'px'); s.style.setProperty('--dy', Math.sin(a) * dist + 'px');
                c.appendChild(s); setTimeout(() => s.remove(), 1000);
            }
        }
    }

    // 연속 소환 settings: gem budget (steps of one 10-pull), stop condition, gear auto-salvage
    function contModal(kind, slot) {
        const p = Save.p, cost = kind === 'skin' ? SKIN_SUMMON.cost10 : SUMMON.cost10, max = Math.floor(p.gems / cost);
        if (max < 1) { UI.gemGate(cost, '', () => {}); return; }
        let k = Math.min(max, Math.max(1, S.contSteps || 1));
        if (!SUMMON_STOPS.includes(S.contStop)) S.contStop = 3;
        const val = h('div.num.sm-budget'), slider = h('input.sm-slider', { type: 'range', min: 1, max, step: 1 });
        const go = h('button.btn.gold'), info = h('div.tip');
        const stops = h('div.sm-stops'), salv = h('div.btn.small.sm-salv');
        const draw = () => {
            slider.value = k;
            val.textContent = ''; val.append(ico('gem', 28), fmt(k * cost));
            info.textContent = L('10회 소환 × {0} (최대 {1}회 소환)', k, k * 10);
            go.textContent = L('보석 {0}개로 시작', fmt(k * cost));
            stops.querySelectorAll('.btn').forEach(b => b.classList.toggle('gold', b.stop === S.contStop));
            salv.classList.toggle('gold', !!S.contSalvage);
            salv.textContent = (S.contSalvage ? '\u2713 ' : '') + L('{0} 이하 자동 분해', RARITY[salvageSet(p).max].name);
        };
        const set = v => { k = Math.max(1, Math.min(max, v)); draw(); };
        slider.addEventListener('input', () => set(+slider.value));
        const stopLabel = s => s === 3 ? L('전설 이상이 나오면 멈춤') : s === 2 ? L('영웅 이상이 나오면 멈춤') : L('끝까지');
        SUMMON_STOPS.forEach(s => { const b = h('div.btn.small', { onclick: () => { click(); S.contStop = s; draw(); } }, stopLabel(s)); b.stop = s; stops.appendChild(b); });
        salv.addEventListener('click', () => { click(); S.contSalvage = !S.contSalvage; draw(); });
        go.addEventListener('click', () => {
            click(); d.remove(); S.contSteps = k;
            const run = summonRun(kind, k * cost, S.contStop, slot, kind !== 'skin' && S.contSalvage ? salvageSet(p).max : -1);   // same grade as 일괄 분해 설정
            if (!run.rolls) { toast(L('보석이 부족합니다')); return; }
            contResult(run);
        });
        const d = modal([h('div.title-t', L('연속 소환')),
            h('div.muted', kind === 'skin' ? L('스킨 소환') : L('장비 소환') + (SLOTS.includes(slot) ? ' · ' + SLOT_NAME[slot] : '')),
            h('div.sm-budrow', h('button.btn.small', { onclick: () => { click(); set(k - 1); } }, '−'), val,
                h('button.btn.small', { onclick: () => { click(); set(k + 1); } }, '+'),
                h('button.btn.small', { onclick: () => { click(); set(max); } }, L('전부'))),
            slider, info, stops,
            kind === 'skin' ? null : salv,
            h('div.tip', L('예산을 다 쓰거나 멈춤 조건이 나오면 끝납니다. 예산보다 더 쓰지 않습니다.')),
            h('div.row', h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('취소')), go)], { dismiss: true });
        d.querySelector('.modal').classList.add('sm-contpop');
        draw();
    }

    // one summary for a whole 연속 소환: counts per grade, the best results up front, everything in a scroll list
    function contResult(run) {
        const skin = run.kind === 'skin', got = run.got;
        const top = Math.max(...got.map(x => x.r));
        const counts = RARITY.map((r, i) => got.filter(x => x.r === i).length);
        const grades = skin ? 4 : 5;
        // best: the top-grade results (new skins first), at most 6
        const bestList = got.filter(x => x.r === top).sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)).slice(0, 6);
        const cellOf = x => skin ? skinCell(x) : (() => { const c = UI.itemCell(x, { noNew: true, onclick: () => { click(); UI.itemInfo(x); } }); if (x.salvaged) { c.classList.add('dup'); c.appendChild(h('span.eq.gemtag', L('분해##배지'))); } return c; })();
        const bestRow = h('div.sm-bestrow', bestList.map(x => tint(h('div.sm-best', cellOf(x), h('div.nm', skin ? skinById(x.id).name : itemName(x))), x.r)));
        const lines = [L('10회 소환 {0}번 · 보석 {1}개 사용', run.rolls, fmt(run.spent)) + (run.stopped ? L(' · 조건이 나와서 멈춤') : '')];
        if (skin) {
            const dup = got.filter(x => x.dup), fresh = got.length - dup.length;
            lines.push(L('새 스킨 {0}개', fresh) + (dup.length ? ' · ' + L('중복 {0}개 → 보석 +{1}', dup.length, fmt(dup.reduce((a, x) => a + x.gems, 0))) : ''));
        } else if (run.salvaged) lines.push(L('자동 분해 {0}개 → 은화 +{1}', run.salvaged, fmt(run.silver)));
        const sorted = got.slice().sort((a, b) => b.r - a.r);
        const d = modal([h('div.title-t', L('연속 소환 결과')),
            h('div.sm-sum', lines.map(t => h('div', t))),
            h('div.sm-counts', counts.slice(0, grades).map((n, i) => h('span.sm-cnt', { style: { color: RARITY[i].color } }, RARITY[i].name, h('b', ' ' + n)))),
            bestRow,
            h('div.sm-list', sorted.map(cellOf)),
            h('button.btn.gold', { onclick: () => { click(); d.remove(); showHub('summon'); } }, L('확인'))]);
        d.querySelector('.modal').classList.add('sm-contres');
        if (calmFx()) d.classList.add('calm');
        bestRow.style.visibility = 'hidden';
        beam(d, top, () => {
            bestRow.style.visibility = '';
            bestRow.classList.add('sm-deal');
            if (top >= 3) { Sfx.play('fanfare', top); Music.duck(2200); Game.buzz([40, 60, 80]); }
            else if (top === 2) Sfx.play('epic');
            else Sfx.play(top >= 1 ? 'rare' : 'drop', top);
        });
    }

    function enhanceResult(it, ok, dropped, was, guarded, shielded) {
        const main = itemMain(it);
        // the step before -> after, so success and failure are never mistaken for each other
        const step = was === undefined ? null : h('div.enh-step' + (ok ? '.up' : dropped ? '.down' : '.same'),
            h('span', '+' + was), h('b', ok ? ' \u25B6 ' : dropped ? ' \u25BC ' : ' = '), h('span', '+' + it.enh));
        const d = modal([
            h('div.ribbon' + (ok ? '' : '.lose'), h('span', ok ? L('강화 성공!') : L('강화 실패'))),
            h('div.enh-stamp' + (ok ? '' : '.fail'), itemCell(it, { noNew: true }), h('div.num', { style: { fontSize: '44px' } }, '+' + it.enh)),
            step,
            h('div', fmtOpt(main.name, main.v, main.pct)),
            dropped ? h('div.bad', L('1단계 하락했습니다')) : null,
            guarded ? h('div', { style: { color: '#3a7a2a' } }, L('하락방지권으로 단계를 지켰어요')) : null,
            shielded ? h('div', { style: { color: '#3a7a2a' } }, L('파괴방지권으로 장비를 지켰어요')) : null,
            h('div.row',
                h('button.btn', { onclick: () => { click(); d.remove(); } }, L('확인')),
                it.enh < ENHANCE.max ? h('button.btn.gold', { onclick: () => { d.remove(); enhanceAnim(it); } }, L('한 번 더 강화')) : null)]);
        // risky levels get the power-up burst over the item. The clip sits in the popup itself, not inside the stamp:
        // the stamp's pop animation (a transform) makes its own compositing group, where the screen blend has nothing
        // to blend with and the clip's black background showed as a dark box
        if (ok && it.enh >= ENHANCE.dropFrom) {
            const box = d.querySelector('.modal'), st = d.querySelector('.enh-stamp');
            const v = box && st && UI.vfx('vfx/enhance.mp4', box, { z: 6, opacity: 0.8 });
            if (v) {
                v.classList.add('vfx-spot', 'enh-clip');
                const place = () => { Object.assign(v.style, { left: st.offsetLeft - st.offsetWidth * 0.18 + 'px', top: st.offsetTop - st.offsetHeight * 0.3 + 'px', width: st.offsetWidth * 1.36 + 'px', height: st.offsetHeight * 1.6 + 'px' }); };
                place(); requestAnimationFrame(place);
            }
        }
    }

    Object.assign(UI, { tabHero, itemDetail, enhanceAnim, enhanceResult, autoEnhanceModal, salvageModal, tabResearch, tabSummon, runSummon, runSkinSummon, bigReveal, skinBook, skinPreview });
})();
