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
    const busy = (b, fn) => UI.busyBtn(b, fn);
    const say = r => { if (r && r.error) { toast(RaidOn.errText(r.error, r)); return false; } return true; };

    // the reward card face: what was rolled (gems, stones, an item grade ...)
    function cardFace(g) {
        if (g.item !== undefined) return [UI.gearAny(g.item), h('div.rn', { style: { color: RARITY[g.item].color } }, RARITY[g.item].name), h('div.nm', L('장비'))];
        if (g.medals) return [rewardCell('i_medal', g.medals)];
        if (g.guards) return [rewardCell('i_guard', g.guards)];
        if (g.shields) return [rewardCell('i_shield', g.shields)];
        return rewardIcons(g);
    }

    // 내 전투력 vs 권장 전투력 for a difficulty (green when the player has enough)
    function powerBox(d) {
        const mine = Meta.power(Save.p), rec = Meta.recFor('online', d);
        return h('div.rd-power', h('span' + (mine >= rec ? '.ok' : '.low'), L('내 전투력 {0}', fmt(mine))), h('span.tip', L('권장 전투력 {0}', fmt(rec))));
    }

    // the weekly limit and what a reward card can hold (icons only, no numbers): left panel of 파티 레이드 and 협동 디펜스
    function weeklyBox() {
        const kinds = [{ gems: 1 }, { stones: 1 }, { tickets: 1 }, { medals: 1 }, { guards: 1 }, { shields: 1 }, { gold: 1 }, { item: 3 }];
        return h('div.rd-weekly', h('div.rd-rwgrid', kinds.map(g => rewardIcons(g)[0])), h('div.tip', L('주간 1회 제한')));
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
                const r = await UI.waitCat(RaidOn.flip(mode, ref, i));
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
        const head = h('div.chip.rd-mhead');
        const d = modal([h('div.title-t', L('토벌 훈장 상점')), head, h('div.tip', L('레이드 보상 카드에서 훈장을 모아요. 신화 장비 상자는 주 1번')), list,
            h('button.btn', { onclick: () => { click(); d.remove(); refresh(); } }, L('닫기'))], { dismiss: true });
        draw();
    }
    function slotPick(title, then) {
        const d = modal([h('div.title-t', title), h('div.tip', L('받을 장비 종류를 고르세요')),
            h('div.row', SLOTS.map(s => h('button.btn', { onclick: () => { click(); d.remove(); then(s); } }, SLOT_NAME[s]))),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('취소'))]);
    }

    // difficulties as a list (one row each, like the 보스 토벌전 tiers): name, this week's boss, recommended power
    // bossOf(i): the boss that difficulty fights this week
    function diffList(sel, onPick, bossOf) {
        const mine = Meta.power(Save.p);
        return h('div.rd2-dlist', RAID_ON.diffs.map((D, i) => {
            const open = RaidOn.diffOpen(i), boss = bossOf ? bossOf(i) : null;
            return h('div.rd2-drow' + (sel === i ? '.on' : '') + (open ? '' : '.ch-locked'), { onclick: () => {
                if (!open) { toast(L('{0} 클리어하면 열려요', stageLabel(D.eq))); return; }
                if (sel !== i) { click(); onPick(i); }
            } }, h('b.rd2-dn', open ? null : img('i_lock', '.icon'), D.name),
                boss ? h('span.rd2-db', ENEMIES[boss].name) : null,
                h('span.rd2-dp' + (mine >= Meta.recFor('online', i) ? '.ok' : '.low'), L('권장 전투력 {0}', fmt(Meta.recFor('online', i)))));
        }));
    }
    // world boss card (파티 레이드 / 협동 디펜스 flip on the result screen; one left unflipped is flipped by the server 5 minutes later and mailed)
    const claimBtn = (mode, ref, diff, title) => RaidOn.claimed(mode, diff)
        ? h('div.rd-done', L('이번 주 보상 받음'))
        : h('button.btn.gold.rd-claim', { onclick: () => { click(); flipModal(mode, ref, title, refresh); } }, L('보상 카드 뒤집기'));

    // ---------------------------------------------------------------- 파티 레이드 (live, 1~4 players, 3 entries a week)
    const sayP = r => say(r && r.error === 'no_tries' ? { error: 'week_tries' } : r);
    const weekBoss = d => { const o = RAID.order, wk = (RaidOn.st && RaidOn.st.week) || weekIndex(); return o[(wk + d * 3) % o.length]; };
    function partyView(area, foot) {
        const d = S.rdiff, R = RAID_ON.party, used = RaidOn.praidTries(), left = Math.max(0, R.tries - used), kind = weekBoss(d);
        const mk = h('button.btn.small.gold' + (left ? '' : '.off')), quick = h('button.btn.small' + (left ? '' : '.off'));
        mk.textContent = L('방 만들기'); quick.textContent = L('빠른 매칭');
        const noLeft = () => { if (left) return false; toast(RaidOn.errText('week_tries')); return true; };
        mk.onclick = busy(mk, async () => { if (noLeft()) return; const r = await RaidOn.praidCreate(d); if (sayP(r)) lobby(r); });
        quick.onclick = busy(quick, async () => {
            if (noLeft()) return;
            const r = await RaidOn.praidQuick(d);
            if (!sayP(r)) return;
            if (r.none) { const c = await RaidOn.praidCreate(d); if (sayP(c)) lobby(c, true); return; }
            lobby(r);
        });
        const joinCode = async code => { if (noLeft()) return false; const r = await RaidOn.praidJoin(code); if (sayP(r)) { lobby(r); return true; } return false; };
        // like 보스 토벌전: the boss card with the ways in on the left, the difficulty list on the right
        area.appendChild(h('div.rd2-main',
            h('div.inset.rd2-card', bossPic(kind, 3.4), h('div.title-t.rd-title', `${ENEMIES[kind].title} ${ENEMIES[kind].name}`),
                powerBox(d), h('div.gold-t', L('이번 주 입장 {0}/{1}', left, R.tries)),
                roomBtns('praid', d, mk, quick, joinCode)),
            h('div.inset.rd2-list', diffList(d, i => { S.rdiff = i; refresh(); }, weekBoss), weeklyBox(), foot)));
    }

    // ---------------------------------------------------------------- 월드 보스
    function worldView(area, foot) {
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
        const marks = cfg ? h('div.rd2-wlist', cfg.milestones.map(m => h('div.rd2-wrow' + (w.dmg >= m.pct * w.hp ? '.on' : ''), h('b', L('{0}% 달성', Math.round(m.pct * 100))), h('div.rd2-wic', ...rewardIcons(m.reward))))) : null;
        const ranks = cfg && cfg.rank ? h('div.rd2-wranks', cfg.rank.map(r => h('div.rd2-wrow', h('b', L('상위 {0}%', Math.round(r.top * 100))), h('div.rd2-wic', ...rewardIcons(r.reward))))) : null;
        area.appendChild(h('div.rd2-main',
            h('div.inset.rd2-card', h('div.title-t.rd-title', `${ENEMIES[w.kind].title} ${ENEMIES[w.kind].name}`),
                bar(w.dmg, w.hp, dead ? '.done' : ''),
                dead && w.me.pts > 0 ? claimBtn('world', 0, RaidOn.worldDiff(), L('월드 보스 보상')) : go,
                dead ? go : null, bossPic(w.kind),
                h('div.tip', L('참가 {0}명', fmt(w.players)))),
            h('div.inset.rd2-list',
                h('div.rd2-whead', h('div', L('내 기여 '), h('span.gold-t', L('{0}점', fmt(w.me.pts))), w.me.rank ? L(' · {0}위', w.me.rank) : ''),
                    h('button.btn.small', { onclick: () => { click(); worldRank(w); } }, L('기여 순위'))),
                h('b.rd2-wtitle', L('전체 달성 보상 (다음 주 우편)')), marks,
                ranks ? h('b.rd2-wtitle', L('기여 순위 보상 (다음 주 우편)')) : null, ranks, foot)));
    }
    function worldRank(w) {
        const d = modal([h('h2', L('월드 보스 기여 순위')),
            h('div.lg-list', (w.top || []).map((r, i) => h('div.lg-row' + (r.me ? '.me' : ''), h('span.lg-rank', `${i + 1}`), UI.tierBadge(r.tier || 0), h('span.lg-name', r.me ? L('나') : `${r.name} `, r.me ? null : h('span.tip', `#${r.tag}`)), h('span.lg-score', L('{0}점', fmt(r.pts)))))),
            (w.top || []).length ? null : h('div.tip', L('아직 아무도 도전하지 않았어요')),
            h('button.btn', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }

    // ---------------------------------------------------------------- 협동 디펜스
    function coopView(area, foot) {
        const d = S.rdiff;
        const mk = h('button.btn.small.gold'), quick = h('button.btn.small');
        mk.textContent = L('방 만들기'); quick.textContent = L('빠른 매칭');
        mk.onclick = busy(mk, async () => { const r = await RaidOn.coopCreate(d); if (say(r)) lobby(r); });
        quick.onclick = busy(quick, async () => {
            const r = await RaidOn.coopQuick(d);
            if (!say(r)) return;
            if (r.none) { const c = await RaidOn.coopCreate(d); if (say(c)) lobby(c, true); return; }
            lobby(r);
        });
        const joinCode = async code => { const r = await RaidOn.coopJoin(code); if (say(r)) { lobby(r); return true; } return false; };
        area.appendChild(h('div.rd2-main',
            h('div.inset.rd2-card', img('i_coop', '.rd-bigico'), h('div.title-t.rd-title', L('협동 디펜스')), h('div.tip', L('친구와 둘이서 실시간으로 한 성문을 지켜요')),
                powerBox(d),
                roomBtns('coop', d, mk, quick, joinCode)),
            h('div.inset.rd2-list', diffList(d, i => { S.rdiff = i; refresh(); }), weeklyBox(), foot)));
    }

    // ---------------------------------------------------------------- 파티 찾기: open rooms of opened difficulties, friends first
    // 파티 찾기 opens as a popup (the list needs room); the room panel on the screen only holds the buttons
    function findModal(kind, sel) {
        const list = h('div.lg-list.rd-flist', UI.catLoad(null, 'sm'));
        const again = h('button.btn.small.rd-refresh', { title: L('새로고침'), html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>' });
        const count = h('span.tip', '');
        const load = async () => {
            const r = await RaidOn.openList(kind);
            list.innerHTML = '';
            count.textContent = '';
            if (r.error) { list.appendChild(h('div.tip', RaidOn.errText(r.error))); return; }
            count.textContent = ` (${r.length})`;
            const rows = r.slice().sort((a, b) => (b.diff === sel) - (a.diff === sel) || b.friend - a.friend || b.at - a.at);
            if (!rows.length) { list.appendChild(h('div.rd-emptylist', h('div', L('지금 기다리는 방이 없어요')), h('div.tip', L('방을 만들거나 빠른 매칭을 눌러 보세요')))); return; }
            for (const x of rows) {
                const go = h('button.btn.small.gold', L('참가'));
                go.onclick = busy(go, async () => {
                    const c = kind === 'coop' ? await RaidOn.coopJoin(x.code) : await RaidOn.praidJoin(x.code);
                    if (sayP(c)) { dlg.remove(); lobby(c); } else load();
                });
                list.appendChild(h('div.lg-row', UI.avatar(x.hero, x.skin, x.name, x.tag), UI.tierBadge(x.tier || 0),
                    h('span.lg-name', x.name, h('span.tip', ` #${x.tag}`), x.friend ? h('span.gold-t', ' ' + L('친구')) : null),
                    h('span.tip', RAID_ON.diffs[x.diff].name),
                    kind === 'praid' ? h('span.tip', `${x.members}/${RAID_ON.party.size}` + ' · ' + (x.kind && ENEMIES[x.kind] ? ENEMIES[x.kind].name : '')) : null,
                    go));
            }
        };
        again.onclick = busy(again, load);
        load();
        const dlg = modal([h('div.rd-fhead', h('span.rd-flabel', kind === 'coop' ? L('협동 방 목록') : L('파티 목록'), count), again), list], { dismiss: true, cls: 'rd-find-pop' });
    }
    // the four ways in (파티 레이드 / 협동 디펜스), a 2x2 grid in the left card
    function roomBtns(kind, sel, mk, quick, joinCode) {
        const codeBtn = h('button.btn', { onclick: () => {
            click();
            const input = h('input.nick.rd-code', { maxLength: 6, placeholder: L('방 코드 6자리') });
            const ok = h('button.btn.gold', L('참가'));
            const d = modal([h('h2', L('코드로 참가')), input, ok], { dismiss: true });
            ok.onclick = busy(ok, async () => { if (input.value.trim().length < 6) { toast(L('코드 6자리를 입력해 주세요')); return; } if (await joinCode(input.value)) d.remove(); });
        } }, L('코드로 참가'));
        const findBtn = h('button.btn', { onclick: () => { click(); findModal(kind, sel); } }, L('파티 찾기'));
        [mk, quick].forEach(b => { b.classList.remove('small'); });
        return h('div.rd-roombtns', mk, quick, findBtn, codeBtn);
    }
    // waiting room (협동 디펜스: 2 seats, 파티 레이드: 4): shows who is here, the host starts
    function lobby(room, quick) {
        const raid = room.mode === 'raid';
        const who = h('div.rd-lobby-who'), start = h('button.btn.gold.off'), status = h('div.tip'), bonus = h('div.gold-t');
        const draw = () => {
            who.innerHTML = '';
            Coop.infos.forEach((inf, i) => who.appendChild(h('div.rd-mem' + (i === Coop.seat ? '.me' : '') + (inf ? '' : '.empty'),
                inf ? UI.avatar(inf.cls, inf.skin, inf.name, inf.tag) : h('div.rd-wait', '+'), h('span.nm', inf ? (i === Coop.seat ? L('나') : inf.name) : L('빈자리')), inf ? h('span.tip', i === 0 ? L('방장') : L('손님')) : null)));
            const n = Coop.present().length, ready = raid ? n >= 1 : n >= 2;
            bonus.textContent = Coop.infos.some((x, i) => x && i !== Coop.seat && Friends.isFriend(x.uid)) ? L('친구와 함께: 보상 카드 훈장 +20%') : '';
            start.classList.toggle('off', !(ready && Coop.seat === 0));
            status.textContent = Coop.seat !== 0 ? L('방장이 시작하길 기다리는 중')
                : raid ? (n > 1 ? L('{0}명이 모였어요. 시작을 눌러 주세요', n) : L('혼자 시작하거나 파티원을 기다려요'))
                : ready ? L('준비 완료! 시작을 눌러 주세요') : quick ? L('같이 할 냥이를 찾는 중… 코드를 친구에게 알려 줘도 돼요') : L('친구가 코드로 들어오길 기다리는 중');
        };
        start.textContent = L('시작');
        start.onclick = async () => { if (start.classList.contains('off')) return; click(); start.classList.add('off'); if (!(await Coop.hostStart())) start.classList.remove('off'); };
        const setRoom = a => raid ? RaidOn.praidSet(room.id, a) : RaidOn.coopSet(room.id, a);
        const cancel = h('button.btn.ghost', { onclick: async () => {
            click(); Coop.send('bye', { seat: Coop.seat }); Coop.close(300);
            await setRoom(Coop.seat === 0 ? 'cancel' : 'leave'); d.remove(); refresh();
        } }, L('나가기'));
        const title = raid ? L('파티 레이드 · {0}', RAID_ON.diffs[room.diff].name) + ' · ' + ENEMIES[room.boss].name : L('협동 디펜스 · {0}', RAID_ON.diffs[room.diff].name);
        const d = modal([h('div.title-t', title),
            h('div', L('방 코드 '), h('b.res-num', room.code)), who, status, bonus,
            raid ? h('div.tip', L('시작하면 모두 이번 주 입장 1번을 써요')) : null,
            // room.me, not Coop.seat: Coop.open below sets it (before that it is still the last room's seat)
            h('div.row', cancel, room.me === 0 ? h('button.btn', { onclick: () => { click(); UI.friendPick(raid ? 'party' : 'coop', room.code, room.diff); } }, L('친구 초대')) : null, room.me === 0 ? start : null)]);
        Coop.open(room, ev => {
            if (ev === 'start') d.remove();
            else if (ev === 'hostleft' && document.body.contains(d)) { toast(L('방장이 나갔어요')); Coop.close(); setRoom('leave'); d.remove(); refresh(); }
            else if (document.body.contains(d)) draw();
        });
        draw();
    }

    // a friend's invite (js/ui/friends.js): open the raid tab on that mode and join with the code
    async function raidJoinInvite(inv) {
        if (document.querySelector('.rd-lobby-who')) { toast(L('지금은 다른 방에 있어요')); return; }
        S.ctab = 'online'; S.rtab = inv.kind === 'coop' ? 'coop' : 'party'; S.rdiff = inv.diff;
        const r = await UI.waitCat(inv.kind === 'coop' ? RaidOn.coopJoin(inv.code) : RaidOn.praidJoin(inv.code));   // 'party' invites carry a 파티 레이드 room code
        if (!RaidOn.st) await RaidOn.state();
        showHub('endless');
        if (sayP(r)) lobby(r);
    }

    // ---------------------------------------------------------------- back into a run after the app closed
    // raid_state 'live' = a run this player started and has not reported; the clock (whoever hosts now) sends the battle
    function rejoinLive(room) {
        const raid = room.mode === 'raid';
        const d = modal([h('div.title-t', raid ? L('파티 레이드') : L('협동 디펜스')), UI.catLoad(L('진행 중인 판에 다시 들어가는 중…'))]);
        Coop.rejoin(room, ok => {
            d.remove();
            if (!ok) { toast(L('이미 끝났거나 아무도 남아 있지 않아요')); try { localStorage.removeItem('nyangi-live'); } catch (e) { } RaidOn.at = 0; refresh(); }
        });
    }
    function liveRoom() { const l = RaidOn.st && RaidOn.st.live; return l ? (l.praid && l.praid.key ? l.praid : l.coop && l.coop.key ? l.coop : null) : null; }
    function liveBox() {
        const room = liveRoom();
        if (!room) return null;
        return h('div.inset.row.rd-live', { style: { justifyContent: 'center', gap: '10px', padding: '6px 10px' } },
            h('b', room.mode === 'raid' ? L('진행 중인 파티 레이드가 있어요') : L('진행 중인 협동 디펜스가 있어요')),
            h('button.btn.small.gold', { onclick: () => { click(); rejoinLive(room); } }, L('돌아가기')));
    }
    // on entering the hub (once per app start): the device was in a run when it closed
    let liveChecked = false;
    async function raidLiveCheck() {
        if (liveChecked || !Online.on || Coop.active) return;
        let mark = null; try { mark = JSON.parse(localStorage.getItem('nyangi-live') || 'null'); } catch (e) { }
        if (!mark) return;
        liveChecked = true;
        const r = await RaidOn.state();
        const room = !r.error && liveRoom();
        if (!room) { try { localStorage.removeItem('nyangi-live'); } catch (e) { } return; }
        // after whatever the hub opens first (출석 보상, mail ...): wait until no window is up
        const t0 = Date.now();
        while (document.querySelector('.dim') || S.screen !== 'hub') {
            if (Date.now() - t0 > 120000 || S.screen === 'battle') return;
            await new Promise(r => setTimeout(r, 700));
        }
        const d = modal([h('div.title-t', room.mode === 'raid' ? L('파티 레이드') : L('협동 디펜스')), h('div', L('진행 중인 판이 있어요. 다시 들어갈까요?')),
            h('div.row', h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('나중에')),
                h('button.btn.gold', { onclick: () => { click(); d.remove(); rejoinLive(room); } }, L('돌아가기')))]);
    }

    // ---------------------------------------------------------------- the tab
    function tabRaidOn() {
        const p = Save.p;
        const win = h('div.panel.win.rd-win.rd2');
        root().appendChild(win);
        if (!Online.on) { win.appendChild(h('div.rd-off', img('i_raid', '.rd-bigico'), h('div.title-t', L('레이드')), h('div', Online.enabled ? L('인터넷에 연결되지 않았어요. 연결을 확인해 주세요') : L('온라인판에서만 열려요')))); return; }
        if (!Online.profile) { win.appendChild(h('div.rd-off', img('i_raid', '.rd-bigico'), h('div.title-t', L('레이드')), h('div', L('다른 냥이들과 함께하려면 닉네임이 필요해요')), h('button.btn.gold', { onclick: () => { click(); UI.ensureProfile(refresh); } }, L('닉네임 정하기')))); return; }
        S.rtab = S.rtab || 'party';
        // modes stacked on the left (shop at the bottom), the chosen mode's card and list on the right
        const nav = h('div.rd2-nav', [['party', L('파티 레이드')], ['world', L('월드 보스')], ['coop', L('협동 디펜스')]].map(([id, nm]) =>
                h('button.btn.small' + (S.rtab === id ? '.gold' : '.ghost'), { onclick: () => { click(); S.rtab = id; refresh(); } }, nm)),
            h('div.sp'),
            h('button.btn.small.rd-medalbtn', { title: L('훈장 상점'), onclick: () => { click(); shopModal(); } }, img('i_medal', '.icon'), ` ${fmt(medals())} `, L('상점')));
        const area = h('div.rd2-area');
        win.appendChild(h('div.rd2-wrap', nav, area));
        const st = RaidOn.st;
        if (!st && RaidOn.fail) {
            area.appendChild(h('div.rd-off', h('div', RaidOn.errText(RaidOn.fail)), h('button.btn.gold', { onclick: () => { click(); RaidOn.fail = null; refresh(); } }, L('다시 불러오기'))));
            return;
        }
        if (!st || Date.now() - (RaidOn.at || 0) > 20000) {
            area.appendChild(UI.catLoad());
            RaidOn.at = Date.now();
            RaidOn.state().then(r => { RaidOn.at = Date.now(); RaidOn.fail = r.error && !RaidOn.st ? r.error : null; if (r.error && RaidOn.st) toast(RaidOn.errText(r.error)); refresh(); });
            if (!st) return;
        }
        const lb = liveBox(); if (lb) area.appendChild(lb);
        if (S.rdiff === undefined || !RaidOn.diffOpen(S.rdiff)) S.rdiff = RaidOn.fitDiff();
        const foot = h('div.tip.rd2-foot', L('보상 카드는 레이드·난이도마다 주 1번 · 천장 전설 {0}/{1} · 신화 {2}/{3}', st.pity.leg, RAID_ON.pity.leg, st.pity.myth, RAID_ON.pity.myth));
        if (S.rtab === 'party') partyView(area, foot);
        else if (S.rtab === 'world') worldView(area, foot);
        else coopView(area, foot);
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
            // the server keeps at most runCap points of one run: say so when this run scored more
            const cap = x.added !== undefined && x.added < R.raidOn.pts ? h('div.tip', L('한 판에 {0}점까지 반영돼요', fmt(x.added))) : null;
            if (R.raidOn.mode === 'party') { el.append(...[h('div', L('파티 합계 '), bar(x.dmg, x.hp, x.cleared ? '.done' : '')), cap, x.cleared ? h('div.gold-t', L('보스 처치! 레이드 탭에서 보상 카드를 뒤집으세요')) : null,
                x.cleared && (x.members || []).some(m => !m.me && m.pts > 0 && Friends.isFriend(m.uid)) ? h('div.gold-t', L('친구 보너스 +20%: 보상 카드 훈장이 늘어나요')) : null].filter(Boolean)); }
            else el.append(...[h('div', L('월드 보스 '), bar(x.dmg, x.hp, x.dmg >= x.hp ? '.done' : '')), cap, h('div.tip', L('내 기여 {0}점', fmt(x.me.pts)) + (x.me.rank ? L(' · {0}위', x.me.rank) : ''))].filter(Boolean));
        } else if (R.praid) {
            const x = R.praid.res;
            if (x && x.error === 'link') { el.append(h('div.tip', RaidOn.errText('link')), h('div.tip', L('파티가 이기면 5분 뒤 보상 카드가 우편으로 와요'))); return; }
            if (!x || x.error) { el.textContent = x ? RaidOn.errText(x.error) : L('결과를 보내는 중…'); return; }
            RaidOn.at = 0;
            if (R.win && !x.win) { el.append(h('div.tip', L('이번 판은 보상으로 인정되지 않았어요'))); return; }
            if (!x.win) { el.append(h('div.tip', L('더 강해지거나 파티원과 함께 다시 도전해 보세요'))); return; }
            if ((x.seats || []).some(m => m.uid !== (Online.user && Online.user.id) && Friends.isFriend(m.uid))) el.append(h('div.gold-t', L('친구 보너스 +20%: 보상 카드 훈장이 늘어나요')));
            if (!RaidOn.claimed('praid', R.praid.diff)) el.append(h('button.btn.gold', { onclick: () => { click(); flipModal('praid', R.praid.room, L('파티 레이드 보상'), () => { el.innerHTML = ''; el.append(h('div.tip', L('이번 주 이 난이도 보상은 이미 받았어요'))); }); } }, L('보상 카드 뒤집기')));
            else el.append(h('div.tip', L('이번 주 이 난이도 보상은 이미 받았어요')));
        } else if (R.coop) {
            const x = R.coop.res;
            if (!x || x.error) { el.textContent = x ? RaidOn.errText(x.error) : L('결과를 보내는 중…'); return; }
            RaidOn.at = 0;
            const mate = Coop.infos && Coop.infos[1 - Coop.me];
            if (x.win && mate && Friends.isFriend(mate.uid)) el.append(h('div.gold-t', L('친구 보너스 +20%: 보상 카드 훈장이 늘어나요')));
            if (R.win && !x.win) { el.append(h('div.tip', L('이번 판은 보상으로 인정되지 않았어요'))); return; }   // the server did not count it (partner saw a loss, or too fast)
            if (x.win && !RaidOn.claimed('coop', R.coop.diff)) el.append(h('button.btn.gold', { onclick: () => { click(); flipModal('coop', R.coop.room, L('협동 디펜스 보상'), () => { el.innerHTML = ''; el.append(h('div.tip', L('이번 주 이 난이도 보상은 이미 받았어요'))); }); } }, L('보상 카드 뒤집기')));
            else if (x.win) el.append(h('div.tip', L('이번 주 이 난이도 보상은 이미 받았어요')));
        }
    }

    Object.assign(UI, { tabRaidOn, raidResultLine, raidFlip: flipModal, raidShop: shopModal, raidJoinInvite, raidLiveCheck });
})();
