'use strict';
// UI - 냥냥 대전 (docs/PLAN_ONLINE_V4.md 3). Entry: UI.pvpScreen() (the hub / 도전 button is wired by main).
//   main panel: rating, tier, season, today's win chests, record, title -> 대전 찾기 · 친구 대전 · 덱 · 칭호 · 순위 · 기록
//   대전 찾기: the rating queue for PvpOn cfg.botSec (20 s), then the 연습 상대 (labeled as a bot, half rewards)
//   battle: my lane is the normal battle screen (Game.battle, S.screen 'battle', the usual HUD with deck limits),
//   the opponent's lane is a small live view, the clock and 폭주 on top, the six send cards at the bottom
// The match runs in js/battle/pvp.js, the sync in js/online/pvp.js. B.update is replaced so main.js's loop drives PvpNet.frame.
(() => {
    const S = UI.S;
    const root = (...a) => UI.root(...a);
    const click = (...a) => UI.click(...a);
    const modal = (...a) => UI.modal(...a);
    const img = (...a) => UI.img(...a);
    const busy = (b, fn) => UI.busyBtn(b, fn);
    const say = r => { if (r && r.error) { toast(PvpOn.errText(r.error)); return false; } return true; };
    const TIERS = [L('브론즈 냥'), L('실버 냥'), L('골드 냥'), L('다이아 냥'), L('전설 냥')];
    const TITLES = { first: L('첫 승리 냥'), w10: L('대전의 냥'), w50: L('백전 냥'), r1300: L('대전 고수 냥'), r1600: L('대전 달인 냥'), champ: L('대전 챔피언 냥') };
    const TITLE_HOW = { first: L('대전 첫 승리'), w10: L('대전 10승'), w50: L('대전 50승'), r1300: L('레이팅 1300 달성'), r1600: L('레이팅 1600 달성'), champ: L('시즌을 전설 냥으로 마치기') };
    const tierName = i => TIERS[i] || TIERS[0];
    const titleName = t => (t && TITLES[t]) || '';
    const towerName = (type, spec) => (spec === null || spec === undefined ? TOWERS[type].name : TOWERS[type].specs[spec].name);
    const clock = ticks => { const s = Math.max(0, Math.ceil(ticks * PVP.dt)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const left = ms => { const m = Math.max(0, Math.round((ms - nowMs()) / 60000)); return m >= 1440 ? L('{0}일 남음', Math.floor(m / 1440)) : m >= 60 ? L('{0}시간 남음', Math.floor(m / 60)) : L('{0}분 남음', m); };
    const CSS = `.pv-modal{width:min(1100px,96%)}.pv-top{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:6px 0}.pv-chip{background:#0003;border-radius:10px;padding:6px 12px;font-size:17px}
.pv-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}.pv-btns .btn{min-height:56px}
.pv-row{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #0002;flex-wrap:wrap}.pv-row .sp{flex:1}
.pv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:6px 0}.pv-opt{background:#0002;border-radius:10px;padding:6px;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:14px;border:3px solid transparent;cursor:pointer}
.pv-opt.on{border-color:#ffd25a;background:#ffd25a33}.pv-opt canvas,.pv-opt img{max-width:60px;max-height:52px;object-fit:contain}.pv-opt b{font-size:15px}
.pv-heroes{display:flex;gap:8px;justify-content:center}.pv-heroes .pv-opt{width:120px}.pv-code{font-size:44px;letter-spacing:8px;text-align:center;font-weight:bold;margin:8px 0}
.pv-hud{position:absolute;left:50%;top:62px;transform:translateX(-50%);background:#2a1a0ccc;color:#fff;border-radius:10px;padding:4px 14px;font-size:18px;text-align:center;pointer-events:none;z-index:6;white-space:nowrap}
.pv-hud.fz{background:#a02818dd}.pv-hud small{display:block;font-size:13px;opacity:.9}
.pv-opp{position:absolute;left:615px;top:122px;width:250px;z-index:6;pointer-events:none;background:#1a120acc;border-radius:10px;padding:4px;color:#fff;font-size:13px}
.pv-opp canvas{display:block;width:242px;height:136px;border-radius:6px}.pv-opp .nm{display:flex;justify-content:space-between;gap:6px;padding:0 4px 3px}
.pv-bot{background:#5a8a4a;border-radius:6px;padding:0 6px;margin-left:4px;font-size:12px}
.pv-sends{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:6;background:#2a1a0cdd;border-radius:12px;padding:5px 7px}
.pv-send{position:relative;width:72px;height:84px;border-radius:9px;background:#5b3b1c;border:2px solid #8a6030;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;color:#fff;font-size:12px;line-height:1.1;cursor:pointer;padding:2px}
.pv-send canvas{max-width:44px;max-height:38px}.pv-send .c{font-weight:bold;color:#ffe08a;font-size:14px}.pv-send .i{color:#9fe09f}.pv-send .i.s{color:#ff9a8a}
.pv-send.off{filter:grayscale(.9);opacity:.6}.pv-send .cd{position:absolute;left:0;right:0;bottom:0;background:#000a;border-radius:0 0 8px 8px}
.pv-send .t{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;text-shadow:0 1px 2px #000}
.pv-inc{position:absolute;left:12px;top:62px;z-index:6;background:#2a1a0ccc;color:#fff;border-radius:10px;padding:4px 10px;font-size:15px;pointer-events:none}`;
    const style = () => { if (!document.getElementById('pvp-css')) document.head.appendChild(h('style#pvp-css', CSS)); };
    const deckOf = () => pvpDeckOk(Save.p.pvpDeck);

    // ------------------------------------------------------------ main panel
    async function pvpScreen() {
        style();
        if (!Online.on) { toast(Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 기능이 아직 설정되지 않았습니다')); return; }
        if (!Online.profile) { UI.ensureProfile(() => pvpScreen()); return; }
        const st = await UI.waitCat(PvpOn.state());
        if (!say(st)) return;
        const cfg = st.cfg || {}, D = deckOf();
        const d = modal([h('div.ribbon', h('span', L('냥냥 대전'))),
            h('div.pv-top',
                h('span.pv-chip', L('{0} · 레이팅 {1}', tierName(st.tier), fmt(st.rating))),
                h('span.pv-chip', L('시즌 {0}', left(st.seasonEnd))),
                h('span.pv-chip', L('오늘 승리 상자 {0} / {1}', Math.min(st.dayWins, cfg.dailyChests || 3), cfg.dailyChests || 3)),
                h('span.pv-chip', L('{0}승 {1}패 {2}무', st.wins, st.losses, st.draws)),
                st.title ? h('span.pv-chip', L('칭호: {0}', titleName(st.title))) : null),
            st.live ? h('div.pv-row', h('b', L('끝나지 않은 대전이 있어요')), h('span.sp'),
                st.live.kind === 'bot' ? null : h('button.btn.small.gold', { onclick: () => { click(); d.remove(); begin(st.live, true); } }, L('다시 들어가기')),   // a bot match cannot be replayed from the start
                h('button.btn.small.red', { onclick: () => { click(); UI.confirmBox(L('이 대전을 기권할까요?\n패배로 기록돼요.'), async () => { d.remove(); await giveUp(st.live); pvpScreen(); }); } }, L('기권'))) : null,
            h('div.tip', L('내 덱: 영웅 {0} · 탑 {1} · 보내기 {2}', HEROES[D.hero].name, D.towers.map(t => towerName(t[0], t[1])).join(', '), D.sends.map(id => ENEMIES[PVP_SEND[id].kind].name).join(', '))),
            h('div.pv-btns',
                h('button.btn.gold', { onclick: () => { click(); if (st.live) { toast(PvpOn.errText('in_match')); return; } d.remove(); queueModal(); } }, L('대전 찾기')),
                h('button.btn', { onclick: () => { click(); if (st.live) { toast(PvpOn.errText('in_match')); return; } d.remove(); friendModal(); } }, L('친구 대전')),
                h('button.btn', { onclick: () => { click(); deckModal(() => { d.remove(); pvpScreen(); }); } }, L('덱 편성')),
                h('button.btn', { onclick: () => { click(); titleModal(st, () => { d.remove(); pvpScreen(); }); } }, L('칭호')),
                h('button.btn', { onclick: () => { click(); topModal(); } }, L('순위')),
                h('button.btn', { onclick: () => { click(); recentModal(st); } }, L('기록'))),
            h('div.tip', L('둘이 각자 성문을 막으면서, 번 금화로 상대 길에 적을 보내요. 3분 뒤 폭주(웨이브 2배 빠르게), 4분이 지나면 남은 목숨이 많은 쪽이 이겨요')),
            h('div.tip', L('약한 적 보내기는 10초마다 들어오는 수입을 올려 주고, 강한 적은 압박만 해요. 수입은 시간에 따라 상한이 있어요')),
            h('div.tip', L('{0}초 안에 상대가 없으면 연습 상대(봇)와 붙어요. 봇 보상은 절반 · 하루 첫 {1}승은 승리 상자', cfg.botSec || 20, cfg.dailyChests || 3)),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'pv-modal' });
    }
    async function giveUp(v) {
        const r = await UI.waitCat(PvpOn.report(v.id, { w: 1 - v.me, why: 'quit', ticks: 0, lives: [0, 0], h: [] }));
        if (!r.error) toast(L('기권했어요'));
        try { localStorage.removeItem('nyangi-pvp'); } catch (e) { }
    }

    // ------------------------------------------------------------ deck
    function deckModal(done) {
        const D = JSON.parse(JSON.stringify(deckOf()));
        const body = h('div');
        const draw = () => {
            const heroBtn = c => h('div.pv-opt' + (D.hero === c ? '.on' : ''), { onclick: () => { click(); D.hero = c; draw(); } },
                img('h_' + c), h('b', HEROES[c].name));
            const tOn = (type, spec) => D.towers.some(t => t[0] === type && t[1] === spec);
            const tBtn = (type, spec) => h('div.pv-opt' + (tOn(type, spec) ? '.on' : ''), {
                onclick: () => {
                    click();
                    if (tOn(type, spec)) D.towers = D.towers.filter(t => !(t[0] === type && t[1] === spec));
                    else if (D.towers.length < PVP.deck.towers) D.towers.push([type, spec]);
                    else { toast(L('탑은 {0}개까지 고를 수 있어요', PVP.deck.towers)); return; }
                    draw();
                } }, Art.domCanvas(Art.tower(type, spec === null ? 0 : 2, spec === null ? null : TOWERS[type].specs[spec].id), 1), h('b', towerName(type, spec)),
                h('span.tip', spec === null ? L('기본 (특화 없음)') : L('특화')));
            const sOn = id => D.sends.includes(id);
            const sBtn = c => h('div.pv-opt' + (sOn(c.id) ? '.on' : ''), {
                onclick: () => {
                    click();
                    if (sOn(c.id)) D.sends = D.sends.filter(x => x !== c.id);
                    else if (D.sends.length < PVP.deck.sends) D.sends.push(c.id);
                    else { toast(L('보내기는 {0}장까지 고를 수 있어요', PVP.deck.sends)); return; }
                    draw();
                } }, Art.domCanvas(Art.enemy(c.kind, 0), ENEMIES[c.kind].boss ? 0.8 : 1.4), h('b', `${ENEMIES[c.kind].name} x${c.n}`),
                h('span', L('금화 {0}', c.cost)), h('span.tip', c.inc ? L('수입 +{0}', c.inc) : L('강한 적 · 수입 없음')),
                c.after ? h('span.tip', L('{0}부터', clock(c.after))) : null);
            body.replaceChildren(
                h('div.title-t', L('영웅')), h('div.tip', L('대전에서는 모두 같은 세기로 싸워요 (Lv.{0})', PVP.hero.lv)),
                h('div.pv-heroes', Object.keys(HEROES).map(heroBtn)),
                h('div.title-t', L('탑 {0} / {1}', D.towers.length, PVP.deck.towers)), h('div.tip', L('고른 종류만 지을 수 있고, 특화는 덱에 넣은 것만 쓸 수 있어요')),
                h('div.pv-grid', TOWER_ORDER.flatMap(t => [tBtn(t, null), tBtn(t, 0), tBtn(t, 1)])),
                h('div.title-t', L('보내기 카드 {0} / {1}', D.sends.length, PVP.deck.sends)),
                h('div.pv-grid', PVP.sends.map(sBtn)));
        };
        const save = h('button.btn.gold', L('저장'));
        const d = modal([h('div.ribbon', h('span', L('덱 편성'))), body,
            h('div.row', h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')), save)], { cls: 'pv-modal' });
        save.onclick = () => {
            click();
            const bad = pvpDeckCheck(D);
            if (bad) { toast(bad === 'towers' ? L('탑을 {0}개 골라 주세요', PVP.deck.towers) : L('보내기 카드를 {0}장 골라 주세요', PVP.deck.sends)); return; }
            Save.p.pvpDeck = D; Save.save();
            toast(L('덱을 저장했어요'));
            d.remove(); if (done) done();
        };
        draw();
    }

    // ------------------------------------------------------------ matching
    async function queueModal() {
        const r = await UI.waitCat(PvpOn.queue());
        if (r.error === 'in_match') { toast(PvpOn.errText('in_match')); pvpScreen(); return; }
        if (!say(r)) return;
        if (r.status === 'playing') { begin(r); return; }
        const botSec = (PvpOn.cfg && PvpOn.cfg.botSec) || 20, t0 = Date.now() - (r.waited || 0) * 1000;
        const txt = h('div', { style: { fontSize: '20px', textAlign: 'center' } }), cancel = h('button.btn.ghost', L('취소'));
        const d = modal([h('div.ribbon', h('span', L('상대 찾는 중'))), UI.catLoad ? UI.catLoad('') : null, txt,
            h('div.tip', L('{0}초 안에 못 찾으면 연습 상대(봇)와 붙어요. 봇 보상은 절반이에요', botSec)), h('div.row', cancel)], { noClose: true });
        let done = false, busyCall = false;
        const finish = v => { if (done) return; done = true; clearInterval(tm); d.remove(); begin(v); };
        const tm = setInterval(async () => {
            if (done || busyCall) return;
            const sec = Math.floor((Date.now() - t0) / 1000);
            txt.textContent = L('레이팅이 비슷한 냥이를 찾고 있어요 · {0}초', sec);
            busyCall = true;
            try {
                const v = sec >= botSec ? await PvpOn.bot(r.id) : await PvpOn.poll(r.id);
                if (done) return;
                if (v.status === 'playing') finish(v);
                else if (v.error && v.error !== 'too_early' && v.error !== 'net') { done = true; clearInterval(tm); d.remove(); say(v); }
            } finally { busyCall = false; }
        }, 2000);
        txt.textContent = L('레이팅이 비슷한 냥이를 찾고 있어요 · {0}초', 0);
        cancel.onclick = busy(cancel, async () => {
            if (done) return;
            const v = await PvpOn.cancel(r.id);
            if (done) return;
            if (v.status === 'playing') { finish(v); return; }   // someone joined just now
            done = true; clearInterval(tm); d.remove(); pvpScreen();
        });
    }
    function friendModal() {
        const input = h('input.nick', { maxLength: 6, inputmode: 'numeric', placeholder: L('대전 코드 6자리') });
        const make = h('button.btn.gold', L('코드 만들기')), join = h('button.btn', L('코드로 참가'));
        const d = modal([h('div.ribbon', h('span', L('친구 대전'))), h('div.tip', L('친구 대전은 레이팅과 승리 상자에 들어가지 않아요')),
            h('div.row', make), h('div.title-t', L('친구 코드 입력')), input, h('div.row', join),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); pvpScreen(); } }, L('닫기'))], { dismiss: true });
        make.onclick = busy(make, async () => {
            const r = await PvpOn.friendCreate();
            if (r.error === 'in_match') { toast(PvpOn.errText('in_match')); return; }
            if (!say(r)) return;
            d.remove(); waitFriend(r);
        });
        join.onclick = busy(join, async () => {
            if (!/^\d{6}$/.test(input.value.trim())) { toast(L('코드 6자리를 입력해 주세요')); return; }
            const r = await PvpOn.friendJoin(input.value);
            if (!say(r)) return;
            d.remove(); begin(r);
        });
    }
    function waitFriend(r) {
        const cancel = h('button.btn.ghost', L('취소'));
        const d = modal([h('div.ribbon', h('span', L('친구 기다리는 중'))), h('div.tip', L('친구에게 이 코드를 알려 주세요')), h('div.pv-code', r.code),
            UI.catLoad ? UI.catLoad('') : null, h('div.row', cancel)], { noClose: true });
        let done = false;
        const tm = setInterval(async () => {
            if (done) return;
            const v = await PvpOn.poll(r.id);
            if (done || v.error) return;
            if (v.status === 'playing') { done = true; clearInterval(tm); d.remove(); begin(v); }
            else if (v.status === 'closed') { done = true; clearInterval(tm); d.remove(); toast(L('코드 시간이 끝났어요')); pvpScreen(); }
        }, 2000);
        cancel.onclick = busy(cancel, async () => {
            const v = await PvpOn.cancel(r.id);
            if (done) return;
            if (v.status === 'playing') { done = true; clearInterval(tm); d.remove(); begin(v); return; }
            done = true; clearInterval(tm); d.remove(); pvpScreen();
        });
    }

    // ------------------------------------------------------------ the battle
    let tick = null, live = null;
    // UI calls (B.build, B.castSkill, ...) become match commands; inside a tick (B.inSim) the real methods run
    function wrapUI(B, net) {
        const P = Battle.prototype;
        const wrap = (name, check, cmd) => {
            B[name] = function (...a) {
                if (B.inSim) return P[name].apply(B, a);
                if (B.pvp.over) return false;
                const r = check(...a);
                if (r === false || r === 0 || r === null) return r;
                net.cmd(cmd(...a));
                return r;
            };
        };
        const upCost = (t, spec) => spec !== undefined && spec !== null ? (t.lv === 2 && t.spec === null ? B.towerCost(t.type, 0, spec) : null) : (t.lv < 2 ? B.towerCost(t.type, t.lv + 1) : null);
        wrap('build', (slot, type) => !slot.tower && B.gold >= B.towerCost(type, 0) && B.towerOk(type, null), (slot, type) => ['build', slot.i, type]);
        wrap('upgrade', (slot, spec) => { const t = slot.tower; if (!t) return false; const c = upCost(t, spec); return c !== null && B.gold >= c; }, (slot, spec) => ['up', slot.i, spec === undefined ? null : spec]);
        wrap('sell', slot => slot.tower ? Math.round(slot.tower.spent * SELL_RATIO) : 0, slot => ['sell', slot.i]);
        wrap('setRally', (slot, x, y) => { const t = slot.tower; return !!t && t.type === 'barracks' && dist(slot.x, slot.y, x, y) <= B.towerStats(t).range; }, (slot, x, y) => ['rally', slot.i, Math.round(x), Math.round(y)]);
        wrap('castSkill', i => { const s = B.hero.skills[i]; return !!s && !s.locked && s.left <= 0 && B.hero.deadUntil <= B.t && !B.hero.dash; }, (i, x, y) => ['skill', i, Math.round(x || 0), Math.round(y || 0)]);
        wrap('castSpell', id => { const sp = B.spells.find(s => s.id === id); return !!sp && sp.left <= 0; }, (id, x, y) => ['spell', id, Math.round(x || 0), Math.round(y || 0)]);
        wrap('commandHeroMove', () => B.hero.deadUntil <= B.t, (x, y) => ['move', Math.round(x), Math.round(y)]);
        B.callWave = () => false;                                   // waves come on their own
    }
    function begin(v, resume) {
        style();
        const me = v.me, bot = v.kind === 'bot', opp = (v.infos[1 - me] || {});
        const M = PvpOn.open(v, res => onEnd(res), resume), net = PvpOn.net, B = M.bs[me], O = M.bs[1 - me];
        live = { v, M, me, net, B, O, bot, ended: false, auto: !!Save.p.set.autoHero, lastWave: -1, frenzy: false };
        M.shake = [false, false]; M.shake[me] = true;
        M.on[me] = (ev, d) => {
            if (ev === 'end') return;                                // the match decides the end (js/battle/pvp.js)
            if (ev === 'pvpSent') { const c = PVP_SEND[d.id]; UI.banner(L('상대가 {0} x{1}을(를) 보냈어요!', ENEMIES[c.kind].name, c.n), false, null, true); Sfx.play('warn'); return; }
            if (ev === 'pvpSend') { Sfx.play('coin'); return; }
            if (ev === 'pvpIncome') { if (d > 0) B.text(150, 110, L('수입 +{0}', d), '#ffe08a', 20, true); return; }
            if (ev === 'wave') { Sfx.play('wave'); return; }
            Game.onEvent(ev, d);
        };
        wrapUI(B, net);
        B.update = dt => net.frame(dt);                            // main.js calls this once a frame (speed 1)
        if (tick) clearInterval(tick);
        UI.clear(); S.popup = null; S.result = null;
        Game.battle = B; Game.paused = false; Game.speed = 1; Game.ended = false; Game.lastBanner = L('냥냥 대전'); Game.leaks = {};
        Render.view.selSlot = null; Render.view.hoverSlot = null; Render.view.aim = null; Render.view.preview = null;
        UI.showBattleHud(B);
        if (S.hud) { for (const k of ['speed', 'autoWave']) if (S.hud[k]) S.hud[k].style.display = 'none'; }
        hud();
        Music.play('battle');
        UI.banner(L('냥냥 대전'), true, (bot ? L('연습 상대 (봇)') : opp.name || L('상대')) + (opp.title ? ' · ' + titleName(opp.title) : ''));
        if (!resume && live.auto !== true) net.cmd(['auto', live.auto]);
    }
    // the clock, my income, the opponent's lane, the send cards
    function hud() {
        const L0 = live, { M, me, B, O, net } = L0, opp = L0.v.infos[1 - me] || {};
        const top = h('div.pv-hud'), inc = h('div.pv-inc');
        const cv = h('canvas', { width: 242 * 2, height: 136 * 2 }), oLives = h('b');
        const oppName = (L0.bot ? L('연습 상대') : opp.name || L('상대')) + (opp.title ? ' · ' + titleName(opp.title) : '');
        const box = h('div.pv-opp', h('div.nm', h('span', oppName, L0.bot ? h('span.pv-bot', L('봇')) : null), h('span', L('목숨'), ' ', oLives)), cv);
        const cards = M.decks[me].sends.map(id => {
            const c = PVP_SEND[id], cd = h('div.cd'), t = h('div.t');
            const el = h('div.pv-send', { onclick: () => {
                if (el._lp) { el._lp = false; return; }
                click();
                if (M.over) return;
                if (M.tick < (c.after || 0)) { toast(L('{0}부터 보낼 수 있어요', clock(c.after))); return; }
                if (pvpSendLeft(M, me, id) > 0) return;
                if (B.gold < c.cost) { toast(L('금화가 {0} 부족합니다', c.cost - Math.floor(B.gold))); return; }
                net.cmd(['send', id]);
            } }, Art.domCanvas(Art.enemy(c.kind, 0), ENEMIES[c.kind].boss ? 0.6 : 1.1), h('span', 'x' + c.n), h('span.c', c.cost),
                h('span.i' + (c.inc ? '' : '.s'), c.inc ? L('수입+{0}', c.inc) : L('강함')), cd, t);
            UI.longPress(el, () => `${ENEMIES[c.kind].name} x${c.n} · ${L('금화 {0}', c.cost)} · ${c.inc ? L('수입 +{0}', c.inc) : L('강한 적 · 수입 없음')}${ENEMIES[c.kind].tag ? ' · ' + ENEMIES[c.kind].tag : ''}`);
            return { el, cd, t, c, id };
        });
        root().appendChild(top); root().appendChild(inc); root().appendChild(box);
        root().appendChild(h('div.pv-sends', cards.map(x => x.el)));
        const g = cv.getContext('2d'), sx = cv.width / W, sy = cv.height / H, pts = O.paths[0].pts;
        const TC = { archer: '#7fcf5a', mage: '#9a7aff', cannon: '#e0a040', barracks: '#cfcfcf' };
        const drawOpp = () => {
            g.fillStyle = '#2b3a22'; g.fillRect(0, 0, cv.width, cv.height);
            g.strokeStyle = '#a8865a'; g.lineWidth = 14; g.lineJoin = 'round'; g.beginPath();
            pts.forEach((p, i) => (i ? g.lineTo(p[0] * sx, p[1] * sy) : g.moveTo(p[0] * sx, p[1] * sy))); g.stroke();
            for (const s of O.slots) if (s.tower) { g.fillStyle = TC[s.tower.type] || '#fff'; const r = 7 + s.tower.lv * 2; g.fillRect(s.x * sx - r, s.y * sy - r, r * 2, r * 2); }
            for (const e of O.enemies) {
                if (e.dead) continue;
                g.fillStyle = e.sent ? '#ff8a2a' : '#ff3a3a';
                g.beginPath(); g.arc(e.x * sx, e.y * sy, e.def.boss ? 11 : e.def.elite ? 8 : 5, 0, Math.PI * 2); g.fill();
            }
            if (O.hero.deadUntil <= O.t) { g.fillStyle = '#5ac8ff'; g.beginPath(); g.arc(O.hero.x * sx, O.hero.y * sy, 8, 0, Math.PI * 2); g.fill(); }
        };
        let n = 0;
        const upd = () => {
            if (Game.battle !== B) { clearInterval(tick); tick = null; return; }
            const fz = pvpFrenzy(M);
            top.classList.toggle('fz', fz);
            top.replaceChildren(h('b', clock(M.over ? M.result.ticks : M.tick)), h('small', M.over ? L('대전 끝') : fz ? L('폭주! 끝까지 {0}', clock(PVP.endAt - M.tick)) : L('폭주까지 {0}', clock(PVP.frenzyAt - M.tick))));
            if (fz && !L0.frenzy) { L0.frenzy = true; UI.banner(L('폭주! 웨이브가 두 배로 빨라져요'), true); Sfx.play('warn'); }
            inc.textContent = L('수입 {0} / 10초 (상한 {1})', Math.min(M.income[me], pvpIncomeCap(M.tick)), pvpIncomeCap(M.tick));
            oLives.textContent = Math.max(0, O.lives);
            for (const x of cards) {
                const wait = pvpSendLeft(M, me, x.id), lock = M.tick < (x.c.after || 0);
                x.el.classList.toggle('off', M.over || lock || wait > 0 || B.gold < x.c.cost);
                x.cd.style.height = wait > 0 ? Math.round(wait / x.c.cd * 100) + '%' : '0';
                x.t.textContent = lock ? clock(x.c.after - M.tick) : wait > 0 ? Math.ceil(wait * PVP.dt) : '';
            }
            if (n++ % 2 === 0) drawOpp();
            // the AUTO switch is part of the shared match: a change goes out as a command
            const a = !!Save.p.set.autoHero;
            if (a !== L0.auto) { L0.auto = a; net.cmd(['auto', a]); }
            if (!M.over && net.rejoining) top.lastChild.textContent = L('다시 연결하는 중…');
        };
        tick = setInterval(upd, 100);
        upd();
    }
    function pvpPause() {
        if (!live || document.getElementById('pausebox')) return;
        const d = modal([h('div.title-t', L('냥냥 대전')), h('div.tip', L('대전 중에는 멈추지 않아요')),
            h('div.row', { style: { flexDirection: 'column', display: 'flex', gap: '10px', width: '260px' } },
                h('button.btn.gold', { onclick: () => { click(); d.remove(); } }, L('계속하기')),
                h('button.btn.red', { onclick: () => { click(); UI.confirmBox(L('나가면 이번 대전은 패배로 끝나요.\n정말 나갈까요?'), () => { d.remove(); if (live && live.net) live.net.quit(); }); } }, L('항복하고 나가기')))], { noClose: true });
        d.id = 'pausebox';
    }

    // ------------------------------------------------------------ result
    const WHY = { lives: L('성문 함락'), time: L('4분 종료 · 남은 목숨'), drop: L('연결 끊김'), quit: L('항복') };
    function onEnd(res) {
        const L0 = live; if (!L0 || L0.ended) return;
        L0.ended = true;
        const me = L0.me, win = res.w === me, draw = res.w === -1;
        Game.ended = true;
        setTimeout(async () => {
            const pb = document.getElementById('pausebox'); if (pb) pb.remove();
            const line = h('div.tip', L('결과를 보내는 중…')), ok = h('button.btn.gold', { disabled: true }, L('확인'));
            const d = modal([h('div.ribbon', h('span', draw ? L('무승부') : win ? L('승리!') : L('패배'))),
                h('div', L('{0} · 내 목숨 {1} · 상대 목숨 {2}', WHY[res.why] || '', res.lives[me], res.lives[1 - me])),
                L0.bot ? h('div.tip', L('연습 상대(봇)와의 대전이라 보상이 절반이에요')) : null, line, ok], { noClose: true });
            S.result = d;
            Sfx.play(win ? 'win' : 'lose');
            ok.onclick = () => { click(); d.remove(); leave(); };
            const out = await report(L0);
            line.replaceChildren(...outcomeLines(out, L0));
            ok.disabled = false;
        }, 1200);
    }
    // send my report; while the other one is missing ask again (the server settles after it timed out)
    async function report(L0) {
        let r = await PvpOn.report(L0.v.id, L0.net.report());
        for (let i = 0; i < 16 && r && r.waiting; i++) { await new Promise(res => setTimeout(res, 3000)); r = await PvpOn.result(L0.v.id); }
        if (r && r.status === 'done' && r.chest !== null && r.chest !== undefined) {
            // the chest mail is claimed right away
            try {
                await Online.refreshMail();
                const m = Online.mail.find(x => x.kind === 'pvp' && !x.claimed_at && String(x.ref).startsWith('chest:'));
                r.got = m ? (await Online.claimMail(m.id)) || [] : [];
            } catch (e) { r.got = []; }
        }
        PvpOn.finished();
        return r;
    }
    function outcomeLines(r, L0) {
        if (!r || r.error) return [h('div', r && r.error === 'link' ? L('연결이 끊겨 결과를 보내지 못했어요') : PvpOn.errText((r && r.error) || 'net'))];
        if (r.waiting) return [h('div', L('상대 결과를 기다리는 중이에요. 잠시 뒤 기록에서 확인해 주세요'))];
        if (r.status === 'void') return [h('div', L('두 기기의 결과가 맞지 않아 이번 대전은 기록되지 않았어요'))];
        const out = [];
        if (L0.v.kind !== 'friend') out.push(h('div', L('레이팅 {0}{1} → {2} ({3})', r.delta >= 0 ? '+' : '', r.delta, fmt(r.rating), tierName(r.tier))));
        else out.push(h('div', L('친구 대전은 레이팅에 들어가지 않아요')));
        if (r.chest !== null && r.chest !== undefined) out.push(h('div', L('오늘의 승리 상자 {0} / {1}', r.chest + 1, (PvpOn.cfg && PvpOn.cfg.dailyChests) || 3)), r.got && r.got.length ? UI.rewardIcons ? h('div.row', UI.rewardIcons(gotReward(r.got))) : null : null);
        return out;
    }
    const gotReward = got => { const o = {}; for (const g of got) { const k = { silver: 'silver', gem: 'gems', i_ticket: 'tickets', i_stone: 'stones' }[g.icon]; if (k) o[k] = (o[k] || 0) + g.n; } return o; };
    function leave() {
        if (tick) { clearInterval(tick); tick = null; }
        live = null;
        Game.battle = null; Game.speed = Save.p.set.speed || 1; Game.ended = false; S.result = null;
        UI.showHub(S.tab || 'map');
        pvpScreen();
    }

    // ------------------------------------------------------------ titles, ranking, record
    function titleModal(st, done) {
        const owned = st.titles || [];
        const rowOf = id => {
            const has = owned.includes(id), on = st.title === id;
            const b = h('button.btn.small' + (on ? '.gold' : ''), { disabled: !has }, on ? L('착용 중') : has ? L('착용') : L('미획득'));
            b.onclick = busy(b, async () => { const r = await PvpOn.title(on ? null : id); if (!say(r)) return; st.title = r.title; d.remove(); done && done(); });
            return h('div.pv-row', h('b', TITLES[id]), h('span.tip', TITLE_HOW[id]), h('span.sp'), b);
        };
        const d = modal([h('div.ribbon', h('span', L('대전 칭호'))), h('div.tip', L('착용한 칭호는 대전 상대에게 보여요')), Object.keys(TITLES).map(rowOf),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'pv-modal' });
    }
    async function topModal() {
        const r = await UI.waitCat(PvpOn.top());
        if (!say(r)) return;
        const d = modal([h('div.ribbon', h('span', L('대전 순위'))),
            (Array.isArray(r) ? r : []).map((x, i) => h('div.pv-row', h('b', `${i + 1}`), h('span', x.name + (x.me ? L(' (나)') : '')), x.title ? h('span.tip', titleName(x.title)) : null, h('span.sp'),
                h('span.tip', tierName(x.tier)), h('b', fmt(x.rating)))),
            h('div.tip', L('2주마다 시즌이 끝나고 등급 보상이 우편으로 와요. 레이팅은 일부만 남아요')),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'pv-modal' });
    }
    function recentModal(st) {
        const res = x => (x.status === 'void' ? L('무효') : x.score === 1 ? L('승') : x.score === 0.5 ? L('무') : L('패'));
        const d = modal([h('div.ribbon', h('span', L('대전 기록'))),
            (st.recent || []).length ? st.recent.map(x => h('div.pv-row', h('b', res(x)), h('span', x.opp || '?'), x.bot ? h('span.pv-bot', L('봇')) : null, x.kind === 'friend' ? h('span.tip', L('친구')) : null,
                h('span.sp'), h('span.tip', WHY[x.why] || ''), x.delta ? h('b', (x.delta > 0 ? '+' : '') + x.delta) : null)) : h('div.tip', L('아직 대전 기록이 없어요')),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'pv-modal' });
    }

    Object.assign(UI, { pvpScreen, pvpPause });
})();
