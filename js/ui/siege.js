'use strict';
// UI - 냥이 공성전 (docs/PLAN_ONLINE_V4.md 2). Entry: UI.siegeScreen() (the hub / 도전 button is wired by main).
//   main panel: trophies, league, season, attacks left, shield, medals -> 공격 · 내 성채 · 기록 · 상점 · 순위
//   base editor: a siege map on the canvas, tap a build spot to place / change a tower inside the shared budget, hero post, 자동 배치
//   attack: 3 candidates -> look at the base -> army (3 waves from enemies met in the codex, army points) -> battle with 2 skills -> result
//   replays: the defense log and my attacks play back from seed + inputs (js/battle/siege.js)
// Battle screens use UI.S.screen = 'siege' (main.js runs and draws Game.battle for it) and their own small HUD.
(() => {
    const S = UI.S;
    const root = (...a) => UI.root(...a);
    const click = (...a) => UI.click(...a);
    const modal = (...a) => UI.modal(...a);
    const img = (...a) => UI.img(...a);
    const busy = (b, fn) => UI.busyBtn(b, fn);
    const say = r => { if (r && r.error) { toast(SiegeOn.errText(r.error)); return false; } return true; };
    const LG = i => (SIEGE.leagues[i] || SIEGE.leagues[0]).name;
    const TNAME = { archer: L('궁수탑'), mage: L('마법탑'), cannon: L('대포탑'), barracks: L('병영') };
    const FLAG = { red: '#d8443a', blue: '#3a7ad8', gold: '#e8b830' };
    const flag = f => f && FLAG[f] ? h('i.sg-flag', { style: { background: FLAG[f] } }) : null;
    const kindTag = k => k === 'ghost' ? h('span.sg-tag.gh', L('고스트')) : k === 'train' ? h('span.sg-tag.tr', L('훈련')) : k === 'revenge' ? h('span.sg-tag.rv', L('복수')) : null;
    const stars = n => h('span.sg-stars', [0, 1, 2].map(i => img(i < n ? 'i_star' : 'i_star_off', '.star')));
    const left = ms => { const m = Math.max(0, Math.round((ms - nowMs()) / 60000)); return m >= 1440 ? L('{0}일 남음', Math.floor(m / 1440)) : m >= 60 ? L('{0}시간 남음', Math.floor(m / 60)) : L('{0}분 남음', m); };
    const CSS = `.sg-modal{width:min(1100px,96%)}.sg-top{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:6px 0}.sg-chip{background:#0003;border-radius:10px;padding:6px 12px;font-size:17px}
.sg-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}.sg-btns .btn{min-height:56px}
.sg-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.sg-card{background:#0002;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px}
.sg-tag{font-size:13px;border-radius:6px;padding:1px 6px;margin-left:6px;color:#fff}.sg-tag.gh{background:#6a5ab8}.sg-tag.tr{background:#5a8a4a}.sg-tag.rv{background:#b84a3a}
.sg-flag{display:inline-block;width:12px;height:16px;margin-right:5px;clip-path:polygon(0 0,100% 15%,0 55%);vertical-align:middle}
.sg-stars .star{width:22px;height:22px}.sg-row{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #0002;flex-wrap:wrap}.sg-row .sp{flex:1}
.sg-slot{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:3px dashed #ffe08a99;background:#0000;z-index:5}
.sg-slot.on{border:3px solid #ffe08a}.sg-bar{position:absolute;left:12px;right:12px;top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;z-index:8;pointer-events:none}
.sg-bar>*{pointer-events:auto}.sg-box{background:#2a1a0ccc;color:#fff;border-radius:10px;padding:6px 12px;font-size:18px}.sg-side{position:absolute;right:12px;bottom:12px;display:flex;gap:10px;z-index:8;flex-wrap:wrap;justify-content:flex-end}
.sg-sk{min-width:120px;min-height:64px;position:relative}.sg-sk .cdt{display:block;font-size:14px;opacity:.85}.sg-sk.off{filter:grayscale(1);opacity:.6}
.sg-foes{display:flex;flex-wrap:wrap;gap:6px;max-height:190px;overflow:auto}.sg-foe{background:#0002;border-radius:8px;padding:4px;width:76px;text-align:center;font-size:13px}.sg-foe canvas{max-width:56px;max-height:48px}
.sg-waves{display:flex;gap:6px}.sg-waves .btn{flex:1}.sg-g{display:flex;align-items:center;gap:6px;background:#0002;border-radius:8px;padding:4px 8px;margin:4px 0}.sg-g canvas{max-width:40px;max-height:36px}.sg-g .sp{flex:1}
.sg-g .btn{min-width:44px;min-height:40px;padding:0 8px}.sg-pick{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}.sg-pick .btn{min-height:52px;font-size:16px}`;
    const style = () => { if (!document.getElementById('siege-css')) document.head.appendChild(h('style#siege-css', CSS)); };

    // ------------------------------------------------------------ main panel
    async function siegeScreen() {
        style();
        if (!Online.on) { toast(Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 기능이 아직 설정되지 않았습니다')); return; }
        if (!Online.profile) { UI.ensureProfile(() => siegeScreen()); return; }
        const st = await UI.waitCat(SiegeOn.state());
        if (!say(st)) return;
        const lg = st.league, next = SIEGE.leagues[lg + 1];
        const d = modal([h('div.ribbon', h('span', L('냥이 공성전'))),
            h('div.sg-top',
                h('span.sg-chip', flag(st.flag), L('{0} · 트로피 {1}', LG(lg), fmt(st.trophies))),
                next ? h('span.sg-chip', L('다음 리그까지 {0}', fmt(next.min - st.trophies))) : null,
                h('span.sg-chip', L('시즌 {0}', left(st.seasonEnd))),
                h('span.sg-chip', L('공격 {0}회 남음', st.left) + (st.passes ? L(' · 공성권 {0}', st.passes) : '')),
                h('span.sg-chip', L('공성 훈장 {0}', fmt(st.medals))),
                st.shieldUntil ? h('span.sg-chip', L('보호막 {0}', left(st.shieldUntil))) : null),
            st.base ? null : h('div.tip', L('먼저 내 성채를 만들어 저장하면 공격할 수 있어요')),
            h('div.sg-btns',
                h('button.btn.gold', { onclick: () => { click(); if (!st.base) { toast(SiegeOn.errText('no_base')); return; } d.remove(); findModal(); } }, L('공격하기')),
                h('button.btn', { onclick: () => { click(); d.remove(); editor(st); } }, L('내 성채')),
                h('button.btn', { onclick: () => { click(); logModal(st); } }, L('기록 · 복수')),
                h('button.btn', { onclick: () => { click(); shopModal(st, () => { d.remove(); siegeScreen(); }); } }, L('훈장 상점')),
                h('button.btn', { onclick: () => { click(); topModal(); } }, L('순위')),
                st.adUsed ? null : h('button.btn.ghost', { onclick: async () => { click(); if (await Rewards.watchAd('siege')) { const r = await SiegeOn.ad(); if (say(r)) { d.remove(); siegeScreen(); } } } }, L('광고 보고 공격 +1'))),
            h('div.tip', L('별은 깎은 성문 목숨으로 정해져요: {0}개 별 1개 · {1}개 별 2개 · 성문 함락 별 3개', SIEGE.stars[0], SIEGE.stars[1])),
            h('div.tip', L('하루 무료 공격 {0}번 · 하루 3번 털리면 보호막 8시간 · 나를 턴 상대는 12시간 안에 1번 복수', (st.cfg && st.cfg.daily) || 5)),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'sg-modal' });
    }

    // ------------------------------------------------------------ battle screens (editor, preview, attack, replay)
    let tick = null;
    function enter(B, music) {
        if (tick) clearInterval(tick);
        UI.clear(); S.hud = null; S.popup = null; S.result = null;
        S.screen = 'siege'; Game.battle = B; Game.paused = false; Game.speed = 1;
        Render.view.selSlot = null; Render.view.hoverSlot = null; Render.view.aim = null; Render.view.preview = null;
        Music.play(music || 'battle');
    }
    function leave(then) {
        if (tick) { clearInterval(tick); tick = null; }
        Game.battle = null; Game.speed = Save.p.set.speed || 1;
        UI.showHub(S.tab || 'map');
        if (then) then();
    }
    const still = B => { B.update = dt => B.updateFx(dt); return B; };
    const box = (...k) => h('div.sg-box', ...k);

    // the editor: tap a ring (build spot) to choose its tower; the hero post and map switch on the bar
    function editor(st) {
        const p = Save.p, fresh = !st.base;
        let base = st.base ? JSON.parse(JSON.stringify(st.base)) : { map: 0, layout: siegeAutoLayout(0, 'mix') };
        const def = siegeDefOf(p);
        let B;
        const budgetEl = h('span');
        const draw = () => {
            B = still(siegeBattle({ map: base.map, layout: base.layout, def, lg: st.league, seed: 1 }));
            enter(B, 'map');
            const used = siegeLayoutCost(base.layout), save = h('button.btn.small.gold', L('저장'));
            budgetEl.textContent = L('금화 {0} / {1} · 탑 {2} / {3}', fmt(used), fmt(SIEGE.budget), base.layout.t.length, SIEGE.maxTowers);
            root().appendChild(h('div.sg-bar',
                box(budgetEl),
                h('button.btn.small', { onclick: () => { click(); base.map = (base.map + 1) % SIEGE.maps.length; base.layout = siegeAutoLayout(base.map, 'mix'); draw(); } }, L('지도: {0}', SIEGE.maps[base.map].name)),
                h('button.btn.small', { onclick: () => { click(); base.layout.hero = (base.layout.hero + 1) % SIEGE.heroPost.length; draw(); } }, L('영웅 위치 {0}', base.layout.hero + 1)),
                h('button.btn.small', { onclick: () => { click(); const styles = ['mix', 'archer', 'mage', 'cannon', 'wall']; base.auto = styles[(styles.indexOf(base.auto) + 1) % styles.length]; base.layout = siegeAutoLayout(base.map, base.auto); draw(); } }, L('자동 배치')),
                h('div', { style: { flex: 1 } }),
                h('button.btn.small.ghost', { onclick: () => { click(); leave(siegeScreen); } }, L('나가기')),
                save));
            save.onclick = busy(save, async () => {
                const bad = siegeCheckLayout(base.layout, B.slots.length);
                if (bad) { toast(bad === 'budget' ? L('금화 예산을 넘었어요') : L('탑을 하나 이상 지어 주세요')); return; }
                const r = await UI.waitCat(SiegeOn.saveBase({ map: base.map, layout: { t: base.layout.t, hero: base.layout.hero }, def: siegeDefOf(Save.p) }));
                if (say(r)) { toast(L('내 성채를 저장했어요')); leave(siegeScreen); }
            });
            root().appendChild(h('div.tip.sg-box', { style: { position: 'absolute', left: '12px', bottom: '12px', zIndex: 8 } }, L('빈 발판을 눌러 탑을 고르세요 · 영웅 {0} Lv.{1} (리그 상한 적용)', HEROES[def.cls].name, Math.min(def.lv, SIEGE.leagues[st.league].lv))));
            B.slots.forEach((s, i) => {
                const has = base.layout.t.find(x => x[0] === i);
                const el = h('div.sg-slot' + (has ? '.on' : ''), { style: { left: s.x + 'px', top: s.y + 'px' }, onclick: () => { click(); pickTower(i); } });
                root().appendChild(el);
            });
        };
        function pickTower(si) {
            const cur = base.layout.t.find(x => x[0] === si);
            const without = base.layout.t.filter(x => x[0] !== si);
            const room = SIEGE.budget - siegeLayoutCost({ t: without });
            const opt = (type, lv, spec) => {
                const c = siegeTowerCost(type, lv, spec), ok = c <= room && (cur || without.length < SIEGE.maxTowers);
                const nm = spec === null ? `${TNAME[type]} ${lv + 1}${L('단계')}` : TOWERS[type].specs[spec].name;
                return h('button.btn' + (ok ? '' : '.ghost'), { disabled: !ok, onclick: () => { click(); d.remove(); base.layout.t = [...without, [si, type, lv, spec]]; draw(); } }, h('div', nm), h('div.tip', fmt(c)));
            };
            const d = modal([h('div.title-t', L('탑 고르기')), h('div.tip', L('남은 금화 {0}', fmt(room))),
                ...TOWER_ORDER.map(t => h('div.sg-pick', opt(t, 0, null), opt(t, 1, null), opt(t, 2, null), opt(t, 2, 0), opt(t, 2, 1))),
                h('div.row', cur ? h('button.btn.red', { onclick: () => { click(); d.remove(); base.layout.t = without; draw(); } }, L('비우기')) : null,
                    h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')))], { dismiss: true, cls: 'sg-modal' });
        }
        draw();
        if (fresh) toast(L('추천 배치로 시작해요. 바꾼 뒤 저장하세요'));
    }

    // ------------------------------------------------------------ attack: candidates -> preview -> army -> battle
    async function findModal(refresh) {
        const r = await UI.waitCat(SiegeOn.find(refresh));
        if (!say(r)) { if (r.error !== 'too_fast') return; }
        const cands = (r.cands || (SiegeOn.st && SiegeOn.st.cands) || []);
        const d = modal([h('div.ribbon', h('span', L('공격할 성채 고르기'))),
            h('div.sg-cards', cands.map((c, i) => h('div.sg-card',
                h('b', flag(c.flag), c.kind === 'train' ? L('훈련 성채 {0}', (c.train | 0) + 1) : c.name, kindTag(c.kind)),
                h('div', L('{0} · 트로피 {1}', LG(c.lg), fmt(c.trophies))),
                h('div.tip', L('{0} · 탑 {1}개 · 영웅 {2}', SIEGE.maps[c.base.map].name, c.base.layout.t.length, HEROES[c.base.def.cls].name)),
                h('button.btn.gold', { onclick: () => { click(); d.remove(); preview(c, i, null); } }, L('성채 보기'))))),
            h('div.tip', L('고스트: 다른 냥이의 지난 배치 복사본 · 훈련: 미리 만든 성채 (트로피 절반)')),
            h('div.row', h('button.btn', { onclick: () => { click(); d.remove(); findModal(true); } }, L('다른 상대 찾기')),
                h('button.btn.ghost', { onclick: () => { click(); d.remove(); siegeScreen(); } }, L('닫기')))], { cls: 'sg-modal' });
    }
    // look at the base on the canvas, then build the army
    // opened: a revenge attack already begun (its target is fixed), so 출격 starts the fight with it
    function preview(c, pick, opened) {
        const B = still(siegeBattle({ map: c.base.map, layout: c.base.layout, def: c.base.def, lg: c.lg, seed: 1 }));
        enter(B, 'map');
        const hs = siegeHero(c.base.def, c.lg);
        root().appendChild(h('div.sg-bar',
            box(c.kind === 'train' ? L('훈련 성채 {0}', (c.train | 0) + 1) : c.name, kindTag(c.kind)),
            box(L('수비 영웅 {0} Lv.{1}', HEROES[hs.cls].name, hs.lv)),
            h('div', { style: { flex: 1 } }),
            h('button.btn.small.ghost', { onclick: () => { click(); leave(() => (opened ? siegeScreen() : findModal())); } }, L('돌아가기')),
            h('button.btn.small.gold', { onclick: () => { click(); armyModal(pick, opened, B.paths.length); } }, L('군단 짜기'))));
    }
    function armyModal(pick, opened, nPaths) {
        const p = Save.p, A = SIEGE.army;
        let army = (p.siegeArmy && !siegeCheckArmy(p.siegeArmy, p.codex) && JSON.parse(JSON.stringify(p.siegeArmy))) || [[], [], []];
        army.forEach(w => w.forEach(g => { g[2] = (g[2] | 0) % nPaths; }));
        let w = 0;
        const foes = Object.keys(ENEMIES).filter(k => siegeArmyOk(k, p.codex)).sort((a, b) => siegeEnemyCost(a) - siegeEnemyCost(b));
        const body = h('div'), ptsEl = h('b'), go = h('button.btn.gold', L('출격'));
        const d = modal([h('div.ribbon', h('span', L('군단 짜기'))), h('div.tip', L('도감에서 만난 적만 보낼 수 있어요 · 웨이브 3개 · 웨이브마다 무리 {0}개까지', A.groups)), ptsEl, body,
            h('div.row', h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기')),
                go)], { cls: 'sg-modal' });
        go.onclick = busy(go, async () => {
            const bad = siegeCheckArmy(army, p.codex);
            if (bad) { toast(bad === 'points' ? L('군단 포인트를 넘었어요') : bad === 'boss' ? L('보스는 군단에 하나만') : L('웨이브마다 적을 한 무리 이상 넣어 주세요')); return; }
            p.siegeArmy = army; Save.save();
            const b = opened || await UI.waitCat(SiegeOn.begin(pick, null));
            if (!say(b)) return;
            d.remove(); fight(b, army);
        });
        const draw = () => {
            const used = siegeArmyCost(army);
            ptsEl.textContent = L('군단 포인트 {0} / {1}', used, A.points);
            ptsEl.style.color = used > A.points ? '#ff6a5a' : '';
            const grp = army[w].map((g, gi) => {
                const max = ENEMIES[g[0]].boss ? 1 : ENEMIES[g[0]].elite ? A.eliteN : A.maxN;
                return h('div.sg-g', Art.domCanvas(Art.enemy(g[0], 0), 1.2), h('span', ENEMIES[g[0]].name), h('span.sp'),
                    h('button.btn.small', { onclick: () => { click(); g[1] = Math.max(1, g[1] - 1); draw(); } }, '-'), h('b', ' ' + g[1] + ' '),
                    h('button.btn.small', { onclick: () => { click(); g[1] = Math.min(max, g[1] + 1); draw(); } }, '+'),
                    nPaths > 1 ? h('button.btn.small', { onclick: () => { click(); g[2] = (g[2] + 1) % nPaths; draw(); } }, L('길 {0}', g[2] + 1)) : null,
                    h('button.btn.small.ghost', { onclick: () => { click(); army[w].splice(gi, 1); draw(); } }, L('빼기')));
            });
            body.replaceChildren(
                h('div.sg-waves', [0, 1, 2].map(i => h('button.btn.small' + (i === w ? '.gold' : ''), { onclick: () => { click(); w = i; draw(); } }, L('웨이브 {0} ({1})', i + 1, siegeArmyCost([army[i]]))))),
                ...grp,
                army[w].length < A.groups ? h('div.sg-foes', foes.map(k => {
                    const el = h('div.sg-foe', { onclick: () => {
                        if (el._lp) { el._lp = false; return; }
                        click();
                        const free = A.points - siegeArmyCost(army), cost = siegeEnemyCost(k), cap = ENEMIES[k].boss ? 1 : ENEMIES[k].elite ? A.eliteN : A.maxN;
                        const n = Math.max(1, Math.min(cap, Math.floor(free / cost), ENEMIES[k].boss || ENEMIES[k].elite ? 1 : 8));
                        army[w].push([k, n, 0]); draw();
                    } }, Art.domCanvas(Art.enemy(k, 0), ENEMIES[k].boss ? 0.8 : 1.5), h('div', ENEMIES[k].name), h('div.tip', L('{0}점', siegeEnemyCost(k))));
                    UI.longPress(el, () => `${ENEMIES[k].name}: ${ENEMIES[k].tip || ENEMIES[k].tag || ''}`);
                    return el;
                })) : h('div.tip', L('이 웨이브는 무리가 가득 찼어요')));
        };
        draw();
    }

    // the fight: fixed ticks, inputs logged by tick, the result goes to the server with the army and the log (the replay)
    function fight(b, army) {
        const setup = { v: SIEGE.v, map: b.base.map, layout: b.base.layout, def: b.base.def, lg: b.lg, army, sk: b.sk || [0, 0], seed: b.seed };
        const on = (ev, d) => { if (['shoot', 'boom', 'hit', 'leak', 'wave', 'siegeSkill'].includes(ev)) Sfx.play(ev === 'shoot' ? d : ev === 'siegeSkill' ? 'skill' : ev); };
        const B = siegeLive(siegeBattle(setup, { on, shakeOn: () => !Save.p.set.noShake }), false);
        enter(B, 'battle');
        hud(B, { title: b.kind === 'train' ? L('훈련 성채') : b.name, live: true, onEnd: async () => {
            const res = siegeResult(B);
            const r = await UI.waitCat(SiegeOn.finish(b.id, army, B.siegeLog, B.siegeEnd, res.taken, res.ticks));
            const silver = r.error ? 0 : SiegeOn.paySilver(r);
            const d = modal([h('div.ribbon', h('span', res.stars ? L('공성 성공!') : L('공성 실패'))), stars(res.stars),
                h('div', L('깎은 성문 목숨 {0} / {1}', res.taken, SIEGE.lives)),
                r.error ? h('div.tip', SiegeOn.errText(r.error)) : h('div',
                    h('div', L('트로피 {0}{1} → {2} ({3})', r.delta >= 0 ? '+' : '', r.delta, fmt(r.trophies), LG(r.league))),
                    h('div', L('공성 훈장 +{0} · 은화 +{1}', r.medals, fmt(silver))),
                    r.flagged ? h('div.tip', L('결과를 확인하는 중이라 이번 보상은 없어요')) : null),
                h('button.btn.gold', { onclick: () => { click(); d.remove(); leave(siegeScreen); } }, L('확인'))], { noClose: true });
        } });
    }
    // battle HUD: lives taken + stars, wave, time, the two attacker skills, call the next wave, speed, give up / close
    function hud(B, o) {
        const lives = h('span'), wave = h('span'), time = h('span'), st = h('span.sg-stars'), spd = h('span');
        root().appendChild(h('div.sg-bar', box(o.title), box(L('목숨'), ' ', lives), st, box(wave), box(time), h('div', { style: { flex: 1 } }),
            h('button.btn.small', { onclick: () => { click(); Game.speed = Game.speed >= 2 ? 1 : 2; } }, spd),
            h('button.btn.small.ghost', { onclick: () => { click(); if (!o.live) { leave(o.back); return; } UI.confirmBox(L('공격을 멈출까요?\n지금까지 깎은 목숨으로 결과가 정해져요.'), () => { B.siegeEnd = B.siegeTick; }); } }, o.live ? L('그만하기') : L('닫기'))));
        const sks = o.live ? SIEGE.skills.map((s, i) => {
            const cdt = h('span.cdt');
            const el = h('button.btn.sg-sk', { onclick: () => { click(); B.siegeInput(i); } }, h('b', s.name), cdt);
            UI.longPress(el, () => i === 0 ? s.desc.replace('{0}', s.dur + s.durLv * B.siegeSk[0].lv) : s.desc.replace('{0}', Math.round((s.amt + s.amtLv * B.siegeSk[1].lv) * 100)));
            return { el, cdt };
        }) : [];
        const call = o.live ? h('button.btn.sg-sk', { onclick: () => { click(); B.siegeInput(2); } }, h('b', L('다음 웨이브')), h('span.cdt', L('바로 보내기'))) : null;
        root().appendChild(h('div.sg-side', call, ...sks.map(s => s.el)));
        let ended = false;
        const upd = () => {
            if (Game.battle !== B) { clearInterval(tick); return; }
            const r = siegeResult(B);
            lives.textContent = `${r.taken} / ${SIEGE.lives}`;
            if (st._n !== r.stars) { st._n = r.stars; st.replaceChildren(...stars(r.stars).childNodes); }
            wave.textContent = L('웨이브 {0} / {1}', Math.max(0, B.waveIdx + 1), B.totalWaves);
            time.textContent = L('남은 {0}초', Math.max(0, Math.ceil((SIEGE.maxTicks - B.siegeTick) * SIEGE.dt)));
            spd.textContent = Game.speed + L('배');
            sks.forEach((s, i) => { const k = B.siegeSk[i]; s.el.classList.toggle('off', k.left > 0 || k.uses <= 0); s.cdt.textContent = k.uses <= 0 ? L('다 씀') : k.left > 0 ? Math.ceil(k.left) + L('초') : L('{0}번 남음', k.uses); });
            if (call) call.style.display = (B.state === 'prep' || B.countdown > 0) && B.waveIdx + 1 < B.totalWaves && !siegeOver(B) ? '' : 'none';
            if (!ended && siegeOver(B)) { ended = true; setTimeout(() => o.onEnd && o.onEnd(), 900); }
        };
        tick = setInterval(upd, 100);
        upd();
    }

    // ------------------------------------------------------------ records, replays, revenge
    function logModal(st) {
        const rowOf = (x, mine) => h('div.sg-row', stars(x.stars), h('b', x.name || '?'), mine ? kindTag(x.kind) : null,
            h('span.tip', L('목숨 {0} · 트로피 {1}{2}', x.taken, x.delta >= 0 ? '+' : '', x.delta)), h('span.sp'),
            x.replay ? h('button.btn.small', { onclick: () => { click(); d.remove(); watch(x.id); } }, L('다시 보기')) : null,
            !mine && x.revenge ? h('button.btn.small.red', { onclick: () => { click(); d.remove(); revenge(x); } }, L('복수')) : null);
        const d = modal([h('div.ribbon', h('span', L('공성전 기록'))),
            h('div.title-t', L('내 성채를 친 냥이')), st.log.length ? st.log.map(x => rowOf(x, false)) : h('div.tip', L('아직 공격받은 기록이 없어요')),
            h('div.title-t', L('내가 친 성채')), st.mine.length ? st.mine.map(x => rowOf(x, true)) : h('div.tip', L('아직 공격한 기록이 없어요')),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'sg-modal' });
    }
    function revenge(x) {
        UI.confirmBox(L('{0}에게 복수할까요?\n공격 1회를 써요. 상대의 지금 성채로 싸워요.', x.name), async () => {
            const b = await UI.waitCat(SiegeOn.begin(null, x.id));
            if (!say(b)) return;
            preview({ kind: 'revenge', name: b.name, base: b.base, lg: b.lg, trophies: b.trophies }, null, b);
        });
    }
    async function watch(id) {
        const r = await UI.waitCat(SiegeOn.replay(id));
        if (!say(r)) return;
        const setup = { v: r.v, map: r.base.map, layout: r.base.layout, def: r.base.def, lg: r.lg, army: r.army, sk: r.sk, seed: r.seed };
        const B = siegeLive(siegeBattle(setup, { shakeOn: () => !Save.p.set.noShake }), true);   // replays play quietly except shots
        B.siegeLog = (r.log || []).slice(); if (r.end >= 0) B.siegeEnd = r.end;
        B.on = (ev, d) => { if (['shoot', 'boom', 'leak'].includes(ev)) Sfx.play(ev === 'shoot' ? d : ev); };
        enter(B, 'battle');
        hud(B, { title: L('다시 보기 · {0} → {1}', r.attacker || '?', r.defender || '?'), live: false, back: siegeScreen, onEnd: () => {
            const d = modal([h('div.ribbon', h('span', L('다시 보기 끝'))), stars(r.stars), h('button.btn.gold', { onclick: () => { click(); d.remove(); leave(siegeScreen); } }, L('확인'))], { noClose: true });
        } });
    }

    // ------------------------------------------------------------ shop and ranking
    function shopModal(st, done) {
        const cfg = st.cfg || {}, NAMES = { pass: L('공성권 (공격 +1)'), ticket: L('소환권 1장'), stones: L('강화석 2개'), guard: L('하락방지권 1장'),
            sk_drum: L('진군 북 강화'), sk_guard: L('냥냥 방패 강화'), flag_red: L('붉은 깃발'), flag_blue: L('푸른 깃발'), flag_gold: L('황금 깃발') };
        const med = h('b');
        const list = h('div');
        const draw = () => {
            med.textContent = L('공성 훈장 {0}', fmt(st.medals));
            list.replaceChildren(...(cfg.shop || []).map(it => {
                const lv = it.skill !== undefined ? (st.sk || [])[it.skill] | 0 : 0;
                const cost = it.skill !== undefined ? (it.costs || [])[lv] : it.cost;
                const owned = it.deco && (st.deco || []).includes(it.deco);
                const b = h('button.btn.small.gold', { disabled: cost === undefined || owned }, cost === undefined ? L('최고 단계') : owned ? L('보유') : L('{0} 훈장', cost));
                b.onclick = busy(b, async () => {
                    const r = await SiegeOn.buy(it.id);
                    if (!say(r)) return;
                    Object.assign(st, { medals: r.medals, sk: r.sk, passes: r.passes, deco: r.deco, flag: r.flag });
                    if (r.got && r.got.length) UI.showGot(NAMES[it.id] || it.id, r.got); else toast(L('구매했어요'));
                    draw();
                });
                return h('div.sg-row', flag(it.deco), h('b', NAMES[it.id] || it.id), it.skill !== undefined ? h('span.tip', L('{0}단계', lv)) : null,
                    it.week ? h('span.tip', L('주 {0}회', it.week)) : null, h('span.sp'), b);
            }));
        };
        const d = modal([h('div.ribbon', h('span', L('훈장 상점'))), med, h('div.tip', L('공성 훈장은 공격 별과 수비 성공으로 모여요')), list,
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); done && done(); } }, L('닫기'))], { dismiss: true, cls: 'sg-modal' });
        draw();
    }
    async function topModal() {
        const r = await UI.waitCat(SiegeOn.top());
        if (!say(r)) return;
        const d = modal([h('div.ribbon', h('span', L('공성전 순위'))),
            (Array.isArray(r) ? r : []).map((x, i) => h('div.sg-row', h('b', `${i + 1}`), flag(x.flag), h('span', x.name + (x.me ? L(' (나)') : '')), h('span.sp'), h('span.tip', LG(x.lg)), h('b', fmt(x.trophies)))),
            h('div.tip', L('2주마다 시즌이 끝나고 리그 보상이 우편으로 와요. 트로피는 일부만 남아요')),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true, cls: 'sg-modal' });
    }

    Object.assign(UI, { siegeScreen });
})();
