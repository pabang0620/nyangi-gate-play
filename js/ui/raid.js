'use strict';
// UI - 도전 > 레이드: 파티 레이드 · 월드 보스 · 협동 디펜스, the weekly reward cards (pick 1 of 4), the 토벌 훈장 shop.
// Server calls in js/online/raid.js (RaidOn), live co-op in js/online/coop.js (Coop). Plan: docs/PLAN_ONLINE_RAID.md
(() => {
    const root = (...a) => UI.root(...a);
    const S = UI.S;
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const modal = (...a) => UI.modal(...a);
    const showGot = (...a) => UI.showGot(...a);
    const rewardIcons = (...a) => UI.rewardIcons(...a);
    const rewardCell = (...a) => UI.rewardCell(...a);
    const showHub = (...a) => UI.showHub(...a);
    const refresh = () => { if (S.screen === 'hub' && S.tab === 'endless' && S.ctab === 'online') showHub('endless'); };
    const medals = () => (Save.p.mats && Save.p.mats.medal) || 0;
    const bar = (v, max, cls = '') => h('div.rd-bar' + cls, h('i', { style: { width: Math.min(100, v / Math.max(1, max) * 100) + '%' } }), h('span', `${fmt(Math.min(v, max))} / ${fmt(max)}`));
    const bossPic = (kind, k = 2.4) => { const c = Art.domCanvas(Art.enemy(kind, 0), k); c.classList.add('rd-boss'); return c; };
    const busy = (b, fn) => async () => { if (b.disabled) return; click(); b.disabled = true; try { await fn(); } finally { b.disabled = false; } };
    const say = r => { if (r && r.error) { toast(RaidOn.errText(r.error)); return false; } return true; };

    // the reward card face: what was rolled (gems, stones, an item grade ...)
    function cardFace(g) {
        if (g.item !== undefined) return [UI.gearAny(g.item), h('div.rn', { style: { color: RARITY[g.item].color } }, RARITY[g.item].name), h('div.nm', L('장비'))];
        if (g.medals) return [rewardCell('i_medal', g.medals)];
        if (g.guards) return [rewardCell('i_guard', g.guards)];
        if (g.shields) return [rewardCell('i_shield', g.shields)];
        return rewardIcons(g);
    }

    // pick 1 of 4: the server rolls them, the rest are shown face up afterwards
    function flipModal(mode, ref, title, done) {
        let busyFlip = false;
        const cards = h('div.cards.rd-cards');
        const tip = h('div.tip', L('카드 한 장을 고르세요. 나머지도 공개돼요'));
        const pity = RaidOn.st && RaidOn.st.pity;
        const d = modal([h('div.ribbon', h('span', title)), tip, cards,
            pity ? h('div.tip', L('천장: 전설 {0}/{1} · 신화 {2}/{3}', pity.leg, RAID_ON.pity.leg, pity.myth, RAID_ON.pity.myth)) : null]);
        const els = [0, 1, 2, 3].map(i => {
            const c = h('div.card', h('div.in', h('div.b'), h('div.f')));
            c.addEventListener('click', async () => {
                if (busyFlip) return;
                busyFlip = true; click();
                c.classList.add('hi');
                const r = await RaidOn.flip(mode, ref, i);
                c.classList.remove('hi');
                if (r.error) { busyFlip = false; toast(RaidOn.errText(r.error)); if (r.error === 'claimed') { d.remove(); done && done(); } return; }
                r.cards.forEach((g, k) => {
                    const e = els[k], f = e.querySelector('.f');
                    f.append(...cardFace(g));
                    if (g.item !== undefined) e.classList.add('r' + g.item);
                    setTimeout(() => e.classList.add('open'), k === i ? 0 : 500 + k * 120);
                    if (k !== i) e.classList.add('rd-other');
                });
                c.classList.add('rd-pick');
                Sfx.play(r.cards[i].item >= 3 ? 'rare' : 'coin');
                tip.textContent = (r.pity ? L('천장 발동! {0} 장비 확정', RARITY[r.pity === 'myth' ? 4 : 3].name) : L('토벌 훈장 +{0}', r.medals)) + (r.friend ? L(' · 친구 보너스 +20%') : '');
                setTimeout(() => {
                    d.querySelector('.modal').appendChild(h('button.btn.gold', { onclick: () => { click(); d.remove(); if (r.got && r.got.length) showGot(title, r.got); done && done(); } }, L('받기')));
                }, 1400);
            });
            return c;
        });
        els.forEach(c => cards.appendChild(c));
    }

    // 토벌 훈장 상점 (the 신화 장비 상자 once a week is the sure ceiling)
    function shopModal() {
        const p = Save.p, wk = weekIndex();
        if (!p.raidShop || p.raidShop.week !== wk) p.raidShop = { week: wk, bought: {} };
        const names = { guard: L('하락방지권'), shield: L('파괴방지권'), ticket: L('소환권'), stone: L('강화석 10개'), leg: L('전설 장비 선택 상자'), myth: L('신화 장비 선택 상자') };
        const list = h('div.rd-shop');
        const draw = () => {
            list.innerHTML = '';
            head.textContent = L('보유 토벌 훈장 {0}', fmt(medals()));
            for (const it of RAID_ON.shop) {
                const left = it.weekly ? it.weekly - (p.raidShop.bought[it.id] || 0) : null;
                const can = medals() >= it.cost && (left === null || left > 0);
                list.appendChild(h('div.rd-srow', h('div.rd-snm', h('b', names[it.id]), it.weekly ? h('div.tip', L('이번 주 {0}번 남음', Math.max(0, left))) : null),
                    h('div.rd-sic', ...(it.reward.item !== undefined ? [UI.gearAny(it.reward.item)] : cardFace(it.reward))),
                    h('button.btn.small' + (can ? '.gold' : '.off'), { onclick: () => {
                        if (!can) { toast(left === 0 ? L('이번 주에는 다 샀어요') : L('토벌 훈장이 부족해요')); return; }
                        click();
                        const buy = slot => {
                            if (medals() < it.cost || (it.weekly && (p.raidShop.bought[it.id] || 0) >= it.weekly)) { draw(); return; }
                            p.mats.medal -= it.cost;
                            if (it.weekly) p.raidShop.bought[it.id] = (p.raidShop.bought[it.id] || 0) + 1;
                            const got = Rewards.grant(p, slot ? { ...it.reward, slot } : it.reward);
                            Save.save(); draw(); showGot(names[it.id], got);
                        };
                        if (it.slot) slotPick(names[it.id], buy); else buy();
                    } }, img('i_medal', '.icon'), ' ' + fmt(it.cost))));
            }
        };
        const head = h('div.chip');
        const d = modal([h('div.title-t', L('토벌 훈장 상점')), head, h('div.tip', L('레이드 보상 카드에서 훈장을 모아요. 신화 장비 상자는 주 1번')), list,
            h('button.btn', { onclick: () => { click(); d.remove(); refresh(); } }, L('닫기'))], { dismiss: true });
        draw();
    }
    function slotPick(title, then) {
        const d = modal([h('div.title-t', title), h('div.tip', L('받을 장비 종류를 고르세요')),
            h('div.row', SLOTS.map(s => h('button.btn', { onclick: () => { click(); d.remove(); then(s); } }, SLOT_NAME[s]))),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('취소'))]);
    }

    // difficulty buttons (locked ones say what opens them)
    function diffRow(sel, onPick) {
        return h('div.rd-diffs', RAID_ON.diffs.map((D, i) => {
            const open = RaidOn.diffOpen(i);
            return h('button.btn.small' + (sel === i ? '.gold' : '.ghost') + (open ? '' : '.ch-locked'), { onclick: () => {
                if (!open) { toast(L('{0} 클리어하면 열려요', stageLabel(D.eq))); return; }
                click(); onPick(i);
            } }, open ? null : img('i_lock', '.icon'), D.name);
        }));
    }
    const claimBtn = (mode, ref, diff, title) => RaidOn.claimed(mode, diff)
        ? h('div.rd-done', L('이번 주 보상 받음'))
        : h('button.btn.gold.rd-claim', { onclick: () => { click(); flipModal(mode, ref, title, refresh); } }, L('보상 카드 뒤집기'));

    // ---------------------------------------------------------------- 파티 레이드
    function partyView(win, head) {
        const d = S.rdiff, pt = RaidOn.party(d);
        head.insertBefore(diffRow(d, i => { S.rdiff = i; refresh(); }), head.querySelector('.sp'));
        if (!pt) {
            const code = h('input.nick.rd-code', { maxLength: 6, placeholder: L('파티 코드 6자리') });
            const mk = h('button.btn.gold'), quick = h('button.btn'), join = h('button.btn');
            mk.onclick = busy(mk, async () => { if (say(await RaidOn.partyCreate(d))) { await RaidOn.state(); refresh(); } });
            quick.onclick = busy(quick, async () => { if (say(await RaidOn.partyQuick(d))) { await RaidOn.state(); refresh(); } });
            join.onclick = busy(join, async () => { if (code.value.trim().length < 6) { toast(L('코드 6자리를 입력해 주세요')); return; } if (say(await RaidOn.partyJoin(code.value))) { await RaidOn.state(); refresh(); } });
            mk.textContent = L('파티 만들기'); quick.textContent = L('빠른 참가'); join.textContent = L('참가');
            win.appendChild(h('div.inset.rd-empty',
                h('div', L('2~4명이 피해를 합쳐 보스를 잡아요 · 하루 {0}번', RAID_ON.party.tries)),
                h('div.row', mk, quick), h('div.row', code, join)));
            win.appendChild(finderBox('party', d));
            return;
        }
        const me = pt.members.find(m => m.me) || { runs: 0, pts: 0 };
        const left = Math.max(0, RAID_ON.party.tries - me.runs);
        const go = h('button.btn.gold' + (left && !pt.cleared ? '' : '.off'));
        go.textContent = pt.cleared ? L('처치 완료') : L('도전 ({0}/{1})', left, RAID_ON.party.tries);
        go.onclick = busy(go, async () => {
            if (pt.cleared) return;
            if (!left) { toast(RaidOn.errText('no_tries')); return; }
            const r = await RaidOn.partyBegin(pt.id);
            if (!say(r)) return;
            Game.startBattle({ raid: true, raidOn: { mode: 'party', id: pt.id, kind: pt.kind, si: RAID_ON.diffs[pt.diff].eq } });
        });
        const leave = me.pts === 0 && !pt.cleared ? h('button.btn.small.ghost') : null;
        if (leave) { leave.textContent = L('나가기'); leave.onclick = busy(leave, async () => { if (say(await RaidOn.partyLeave(pt.id))) { await RaidOn.state(); refresh(); } }); }
        const copy = h('button.btn.small', { onclick: () => { click(); try { navigator.clipboard.writeText(pt.code); toast(L('코드를 복사했어요')); } catch (e) { toast(pt.code); } } }, L('코드 복사'));
        win.appendChild(h('div.rd-main',
            h('div.inset.rd-left', h('div.title-t.rd-title', `${ENEMIES[pt.kind].title} ${ENEMIES[pt.kind].name}`),
                bar(pt.dmg, pt.hp, pt.cleared ? '.done' : ''),
                pt.cleared ? claimBtn('party', pt.id, pt.diff, L('파티 레이드 보상')) : go,
                bossPic(pt.kind), h('div.tip', L('보스 강도: {0} 기준', stageLabel(RAID_ON.diffs[pt.diff].eq)))),
            h('div.inset.rd-right',
                h('div.rd-code-line', L('파티 코드 '), h('b.gold-t', pt.code), ' ', copy, leave),
                pt.members.length < RAID_ON.party.size && !pt.cleared ? h('button.btn.small.gold', { onclick: () => { click(); UI.friendPick('party', pt.code); } }, L('친구 초대')) : null,
                h('div.rd-mems', pt.members.map(m => h('div.rd-mem' + (m.me ? '.me' : ''), img(heroFace(m.hero, m.skin)), h('span.nm', m.me ? L('나') : `${m.name}#${m.tag}`),
                    h('span.tip', L('오늘 {0}/{1}', m.runs, RAID_ON.party.tries)), h('span.gold-t', L('{0}점', fmt(m.pts)))))),
                pt.members.length < RAID_ON.party.size ? h('div.tip', L('빈자리 {0}', RAID_ON.party.size - pt.members.length)) : null,
                pt.members.some(m => !m.me && Friends.isFriend(m.uid)) ? h('div.gold-t', L('친구와 함께: 보상 카드 훈장 +20%')) : null)));
    }

    // ---------------------------------------------------------------- 월드 보스
    function worldView(win) {
        const w = RaidOn.st.world, dead = w.dmg >= w.hp, left = Math.max(0, RAID_ON.world.tries - w.me.runs);
        const go = h('button.btn.gold' + (left ? '' : '.off'));
        go.textContent = L('도전 ({0}/{1})', left, RAID_ON.world.tries);
        go.onclick = busy(go, async () => {
            if (!left) { toast(RaidOn.errText('no_tries')); return; }
            const r = await RaidOn.worldBegin();
            if (!say(r)) return;
            Game.startBattle({ raid: true, raidOn: { mode: 'world', kind: w.kind, si: RaidOn.worldStage(w.kind) } });
        });
        const cfg = RaidOn.st.cfg && RaidOn.st.cfg.world;
        const marks = cfg ? h('div.rd-marks', cfg.milestones.map(m => h('div.rd-mark' + (w.dmg >= m.pct * w.hp ? '.on' : ''), h('b', Math.round(m.pct * 100) + '%'), ...rewardIcons(m.reward), ))) : null;
        win.appendChild(h('div.rd-main',
            h('div.inset.rd-left', h('div.title-t.rd-title', `${ENEMIES[w.kind].title} ${ENEMIES[w.kind].name}`),
                bar(w.dmg, w.hp, dead ? '.done' : ''),
                dead && w.me.pts > 0 ? claimBtn('world', 0, RaidOn.worldDiff(), L('월드 보스 보상')) : go,
                dead ? go : null, bossPic(w.kind),
                h('div.tip', L('참가 {0}명', fmt(w.players)))),
            h('div.inset.rd-right',
                h('div', L('내 기여 '), h('span.gold-t', L('{0}점', fmt(w.me.pts))), w.me.rank ? L(' · {0}위', w.me.rank) : ''),
                h('b', L('전체 달성 보상 (다음 주 우편)')), marks,
                h('button.btn.small', { onclick: () => { click(); worldRank(w); } }, L('기여 순위')))));
    }
    function worldRank(w) {
        const d = modal([h('h2', L('월드 보스 기여 순위')),
            h('div.lg-list', (w.top || []).map((r, i) => h('div.lg-row' + (r.me ? '.me' : ''), h('span.lg-rank', `${i + 1}`), UI.tierBadge(r.tier || 0), h('span.lg-name', r.me ? L('나') : `${r.name} `, r.me ? null : h('span.tip', `#${r.tag}`)), h('span.lg-score', L('{0}점', fmt(r.pts)))))),
            (w.top || []).length ? null : h('div.tip', L('아직 아무도 도전하지 않았어요')),
            h('button.btn', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    // ---------------------------------------------------------------- 협동 디펜스
    function coopView(win, head) {
        const d = S.rdiff;
        head.insertBefore(diffRow(d, i => { S.rdiff = i; refresh(); }), head.querySelector('.sp'));
        const code = h('input.nick.rd-code', { maxLength: 6, placeholder: L('방 코드 6자리') });
        const mk = h('button.btn.gold'), quick = h('button.btn'), join = h('button.btn');
        mk.textContent = L('방 만들기'); quick.textContent = L('빠른 매칭'); join.textContent = L('참가');
        mk.onclick = busy(mk, async () => { const r = await RaidOn.coopCreate(d); if (say(r)) lobby(r); });
        quick.onclick = busy(quick, async () => {
            const r = await RaidOn.coopQuick(d);
            if (!say(r)) return;
            if (r.none) { const c = await RaidOn.coopCreate(d); if (say(c)) lobby(c, true); return; }
            lobby(r);
        });
        join.onclick = busy(join, async () => { if (code.value.trim().length < 6) { toast(L('코드 6자리를 입력해 주세요')); return; } const r = await RaidOn.coopJoin(code.value); if (say(r)) lobby(r); });
        const wins = (RaidOn.st.coopWins || []).filter(x => !RaidOn.claimed('coop', x.diff));
        const seen = new Set();
        win.appendChild(h('div.rd-main',
            h('div.inset.rd-left', h('div.title-t.rd-title', L('협동 디펜스')),
                h('div.row', mk, quick), h('div.row', code, join),
                h('div', L('친구와 둘이서 실시간으로 한 성문을 지켜요')), img('i_coop', '.rd-bigico')),
            h('div.inset.rd-right',
                h('div.tip', L('목숨은 함께, 금화·영웅·탑은 각자')),
                h('div.tip', L('이기면 난이도마다 주 1번 보상 카드')),
                wins.filter(x => !seen.has(x.diff) && seen.add(x.diff)).map(x => h('div.row', h('span', RAID_ON.diffs[x.diff].name), claimBtn('coop', x.id, x.diff, L('협동 디펜스 보상')))))));
        win.appendChild(finderBox('coop', d));
    }

    // ---------------------------------------------------------------- 파티 찾기: open rooms of opened difficulties, friends first
    function finderBox(kind, sel) {
        const list = h('div.lg-list', { style: { maxHeight: '34vh', overflowY: 'auto' } }, h('div.tip', L('불러오는 중…')));
        const again = h('button.btn.small', L('새로고침'));
        const load = async () => {
            const r = await RaidOn.openList(kind);
            list.innerHTML = '';
            if (r.error) { list.appendChild(h('div.tip', RaidOn.errText(r.error))); return; }
            const rows = r.slice().sort((a, b) => (b.diff === sel) - (a.diff === sel) || b.friend - a.friend || b.at - a.at);
            if (!rows.length) { list.appendChild(h('div.tip', kind === 'party' ? L('지금 사람을 찾는 파티가 없어요. 직접 만들어 보세요') : L('지금 기다리는 방이 없어요. 방을 만들거나 빠른 매칭을 눌러 보세요'))); return; }
            for (const x of rows) {
                const go = h('button.btn.small.gold', L('참가'));
                go.onclick = busy(go, async () => {
                    if (kind === 'coop') { const c = await RaidOn.coopJoin(x.code); if (say(c)) lobby(c); else load(); return; }
                    if (say(await RaidOn.partyJoin(x.code))) { S.rdiff = x.diff; await RaidOn.state(); refresh(); } else load();
                });
                list.appendChild(h('div.lg-row', img(heroFace(x.hero, x.skin), '.rk-pic'), UI.tierBadge(x.tier || 0),
                    h('span.lg-name', x.name, h('span.tip', ` #${x.tag}`), x.friend ? h('span.gold-t', ' ' + L('친구')) : null),
                    h('span.tip', RAID_ON.diffs[x.diff].name),
                    kind === 'party' ? h('span.tip', `${x.members}/${RAID_ON.party.size}` + ' · ' + (x.kind && ENEMIES[x.kind] ? ENEMIES[x.kind].name : '')) : null,
                    go));
            }
        };
        again.onclick = busy(again, load);
        load();
        return h('div.inset.rd-finder', { style: { marginTop: '8px', padding: '8px' } },
            h('div.row', { style: { justifyContent: 'space-between' } }, h('b', L('파티 찾기')), h('span.tip', L('친구 방이 먼저 보여요')), again), list);
    }
    // waiting room: shows the partner, the host starts
    function lobby(room, quick) {
        const who = h('div.rd-lobby-who'), start = h('button.btn.gold.off'), status = h('div.tip'), bonus = h('div.gold-t');
        const draw = () => {
            who.innerHTML = '';
            Coop.infos.forEach((inf, i) => who.appendChild(h('div.rd-mem' + (i === Coop.me ? '.me' : ''),
                inf ? img(heroFace(inf.cls, inf.skin)) : h('div.rd-wait', '?'), h('span.nm', inf ? (i === Coop.me ? L('나') : inf.name) : L('기다리는 중…')), h('span.tip', i === 0 ? L('방장') : L('손님')))));
            const ready = !!Coop.infos[1 - Coop.me];
            bonus.textContent = ready && Friends.isFriend(Coop.infos[1 - Coop.me].uid) ? L('친구와 함께: 보상 카드 훈장 +20%') : '';
            start.classList.toggle('off', !(ready && Coop.me === 0));
            status.textContent = Coop.me === 0 ? (ready ? L('준비 완료! 시작을 눌러 주세요') : quick ? L('같이 할 냥이를 찾는 중… 코드를 친구에게 알려 줘도 돼요') : L('친구가 코드로 들어오길 기다리는 중'))
                : L('방장이 시작하길 기다리는 중');
        };
        start.textContent = L('시작');
        start.onclick = async () => { if (start.classList.contains('off')) return; click(); start.classList.add('off'); if (!(await Coop.hostStart())) start.classList.remove('off'); };
        const cancel = h('button.btn.ghost', { onclick: async () => {
            click(); Coop.send('bye', {}); Coop.close(300);
            await RaidOn.coopSet(room.id, Coop.me === 0 ? 'cancel' : 'leave'); d.remove();
        } }, L('나가기'));
        const d = modal([h('div.title-t', L('협동 디펜스 · {0}', RAID_ON.diffs[room.diff].name)),
            h('div', L('방 코드 '), h('b.gold-t', room.code)), who, status, bonus,
            h('div.row', cancel, Coop.me === 0 ? h('button.btn', { onclick: () => { click(); UI.friendPick('coop', room.code); } }, L('친구 초대')) : null, Coop.me === 0 ? start : null)]);
        Coop.open(room, ev => {
            if (ev === 'start') d.remove();
            else if (ev === 'left' && Coop.me === 1 && document.body.contains(d)) { toast(L('방장이 나갔어요')); Coop.close(); RaidOn.coopSet(room.id, 'leave'); d.remove(); }
            else if (document.body.contains(d)) draw();
        });
        draw();
        // quick match: a guest that searched later may have joined the room on the server; the channel 'hi' tells us
    }

    // a friend's invite (js/ui/friends.js): open the raid tab on that mode and join with the code
    async function raidJoinInvite(inv) {
        if (document.querySelector('.rd-lobby-who')) { toast(L('지금은 다른 방에 있어요')); return; }
        S.ctab = 'online'; S.rtab = inv.kind === 'coop' ? 'coop' : 'party'; S.rdiff = inv.diff;
        if (inv.kind === 'coop') {
            const r = await RaidOn.coopJoin(inv.code);
            if (!say(r)) { showHub('endless'); return; }
            if (!RaidOn.st) await RaidOn.state();
            showHub('endless'); lobby(r);
            return;
        }
        const r = await RaidOn.partyJoin(inv.code);
        say(r);
        await RaidOn.state();
        showHub('endless');
    }

    // ---------------------------------------------------------------- the tab
    function tabRaidOn() {
        const p = Save.p;
        const win = h('div.panel.win.rd-win');
        root().appendChild(win);
        if (!Online.on) { win.appendChild(h('div.rd-off', img('i_raid', '.rd-bigico'), h('div.title-t', L('레이드')), h('div', Online.enabled ? L('서버에 연결되지 않았어요. 인터넷을 확인해 주세요') : L('온라인판에서만 열려요')))); return; }
        if (!Online.profile) { win.appendChild(h('div.rd-off', img('i_raid', '.rd-bigico'), h('div.title-t', L('레이드')), h('div', L('다른 냥이들과 함께하려면 닉네임이 필요해요')), h('button.btn.gold', { onclick: () => { click(); UI.ensureProfile(refresh); } }, L('닉네임 정하기')))); return; }
        S.rtab = S.rtab || 'party';
        const head = h('div.tabhead.rd-head',
            h('div.rd-tabs', [['party', L('파티 레이드')], ['world', L('월드 보스')], ['coop', L('협동 디펜스')]].map(([id, nm]) =>
                h('button.btn.small' + (S.rtab === id ? '.gold' : '.ghost'), { onclick: () => { click(); S.rtab = id; refresh(); } }, nm))),
            h('div.sp'),
            h('div.chip', img('i_medal', '.icon'), fmt(medals())),
            h('button.btn.small', { onclick: () => { click(); shopModal(); } }, L('훈장 상점')));
        win.appendChild(head);
        const st = RaidOn.st;
        if (!st && RaidOn.fail) {
            win.appendChild(h('div.rd-off', h('div', RaidOn.errText(RaidOn.fail)), h('button.btn.gold', { onclick: () => { click(); RaidOn.fail = null; refresh(); } }, L('다시 불러오기'))));
            return;
        }
        if (!st || Date.now() - (RaidOn.at || 0) > 20000) {
            win.appendChild(h('div.tip', L('불러오는 중…')));
            RaidOn.at = Date.now();
            RaidOn.state().then(r => { RaidOn.at = Date.now(); RaidOn.fail = r.error && !RaidOn.st ? r.error : null; if (r.error && RaidOn.st) toast(RaidOn.errText(r.error)); refresh(); });
            if (!st) return;
        }
        if (S.rdiff === undefined || !RaidOn.diffOpen(S.rdiff)) { S.rdiff = 0; RAID_ON.diffs.forEach((x, i) => { if (RaidOn.diffOpen(i)) S.rdiff = i; }); }
        if (S.rtab === 'party') partyView(win, head);
        else if (S.rtab === 'world') worldView(win);
        else coopView(win, head);
        win.appendChild(h('div.tip.rd-foot', L('보상 카드는 레이드·난이도마다 주 1번 · 천장 전설 {0}/{1} · 신화 {2}/{3}', st.pity.leg, RAID_ON.pity.leg, st.pity.myth, RAID_ON.pity.myth)));
    }

    // result screen line, filled in when the server answers
    function raidResultLine(R) {
        const el = document.querySelector('.rd-result');
        if (!el) return;
        el.innerHTML = '';
        if (R.raidOn) {
            const x = R.raidOn.res;
            if (!x || x.error) { el.textContent = x ? RaidOn.errText(x.error) : L('기록을 보내는 중…'); return; }
            RaidOn.at = 0;
            if (R.raidOn.mode === 'party') { el.append(h('div', L('파티 합계 '), bar(x.dmg, x.hp, x.cleared ? '.done' : '')), x.cleared ? h('div.gold-t', L('보스 처치! 레이드 탭에서 보상 카드를 뒤집으세요')) : null,
                x.cleared && (x.members || []).some(m => !m.me && m.pts > 0 && Friends.isFriend(m.uid)) ? h('div.gold-t', L('친구 보너스 +20%: 보상 카드 훈장이 늘어나요')) : null); }
            else el.append(h('div', L('월드 보스 '), bar(x.dmg, x.hp, x.dmg >= x.hp ? '.done' : '')), h('div.tip', L('내 기여 {0}점', fmt(x.me.pts)) + (x.me.rank ? L(' · {0}위', x.me.rank) : '')));
        } else if (R.coop) {
            const x = R.coop.res;
            if (!x || x.error) { el.textContent = x ? RaidOn.errText(x.error) : L('결과를 보내는 중…'); return; }
            RaidOn.at = 0;
            const mate = Coop.infos && Coop.infos[1 - Coop.me];
            if (x.win && mate && Friends.isFriend(mate.uid)) el.append(h('div.gold-t', L('친구 보너스 +20%: 보상 카드 훈장이 늘어나요')));
            if (x.win && !RaidOn.claimed('coop', R.coop.diff)) el.append(h('button.btn.gold', { onclick: () => { click(); flipModal('coop', R.coop.room, L('협동 디펜스 보상'), () => { el.innerHTML = ''; el.append(h('div.tip', L('이번 주 이 난이도 보상은 이미 받았어요'))); }); } }, L('보상 카드 뒤집기')));
            else if (x.win) el.append(h('div.tip', L('이번 주 이 난이도 보상은 이미 받았어요')));
        }
    }

    Object.assign(UI, { tabRaidOn, raidResultLine, raidFlip: flipModal, raidShop: shopModal, raidJoinInvite });
})();
