'use strict';
// UI - 냥냥단 (guild): find / make a guild, then five tabs: 냥단 (check-in, donation, level, missions, log), 단원 (roles, applications),
// 보스 (weekly guild boss: the 토벌전 3-minute battle, 2 tries a day), 상점 (냥단 코인), 채팅 (last 100 lines + live lines).
// Server calls in js/online/guild.js (GuildOn). Entry: UI.guildScreen(); UI.guildBadge() counts what waits there (hub badge).
// Layout reuses the 거래소 window (.mk-*), guild-only bits are .gd-* in css/guild.css. Phone first: nothing scrolls sideways.
(() => {
    const click = (...a) => UI.click(...a);
    const modal = (...a) => UI.modal(...a);
    const busy = (b, fn) => UI.busyBtn(b, fn);
    const say = r => { if (r && r.error) { toast(GuildOn.errText(r.error, r)); return false; } return true; };
    const EMBLEMS = ['i_raid', 'i_league', 'i_medal', 'i_horn', 'i_beacon', 'i_heart', 'i_skull', 'i_star', 'i_rally', 'i_militia', 'i_coop', 'i_gem'];
    const emblem = (i, cls = '') => UI.img(EMBLEMS[i] || EMBLEMS[0], '.gd-emb' + cls);
    const coin = () => h('span.gd-coin');
    const coinText = n => h('span.gd-ctxt', coin(), fmt(n));
    const ROLE = () => ({ leader: L('단장'), vice: L('부단장'), member: L('단원') });
    const roleTag = r => h('span.gd-role.' + r, ROLE()[r] || '');
    const bar = (v, max, cls = '') => h('div.rd-bar' + cls, h('i', { style: { width: Math.min(100, v / Math.max(1, max) * 100) + '%' } }), h('span', `${fmt(Math.min(v, max))} / ${fmt(max)}`));
    const ago = ms => { const d = Math.floor((Date.now() - ms) / 86400000); return d <= 0 ? L('오늘') : L('{0}일 전', d); };
    const face = m => UI.img(heroFace(m.hero || 'knight', m.skin), '.gd-face');
    const MISSION = k => ({ attend: L('단원 출석 합계'), donate: L('단원 기부 합계'), boss_runs: L('냥단 보스 도전 합계'), boss_pts: L('냥단 보스 점수 합계'), siege_win: L('냥이 공성전 승리 합계'), pvp_wins: L('냥냥 대전 승리 합계') }[k] || k);
    const SHOP_NAME = () => ({ ticket: L('소환권'), stone: L('강화석 5개'), guard: L('하락방지권'), shield: L('파괴방지권'), title1: L('칭호: 냥단의 기둥'), title2: L('칭호: 냥단의 수호자'), title3: L('칭호: 전설의 냥단원') });
    const DONATE_NAME = () => ({ silver: L('은화 기부'), gems50: L('보석 기부'), gems150: L('큰 보석 기부') });

    let win = null;      // the open guild window
    let tab = null;

    function guildScreen() {
        if (!Online.on) { toast(Online.enabled ? L('인터넷에 연결되지 않았어요') : L('온라인 기능이 아직 설정되지 않았습니다')); return; }
        if (!Online.profile) { UI.ensureProfile(() => guildScreen()); return; }
        if (win && win.isConnected) win.remove();
        const wallet = h('div.gd-wallet');
        const tabs = h('div.mk-tabs.gd-tabs');
        const body = h('div.mk-body.gd-body');
        const d = win = modal([h('h2', L('냥냥단')), wallet, tabs, body,
            h('button.btn.ghost', { onclick: () => { click(); close(); } }, L('닫기'))], { dismiss: true, cls: 'mk-modal.gd-modal' });
        const close = () => { GuildOn.closeChat(); d.remove(); win = null; };
        d.draw = () => draw(d, wallet, tabs, body);
        body.appendChild(UI.catLoad());
        GuildOn.state().then(r => {
            if (!d.isConnected) return;
            if (r.error) { body.innerHTML = ''; body.appendChild(h('div.mk-empty', h('div', GuildOn.errText(r.error)), h('button.btn.gold', { onclick: () => { click(); guildScreen(); } }, L('다시 불러오기')))); return; }
            d.draw();
        });
    }
    const redraw = () => { if (win && win.isConnected) win.draw(); };

    function draw(d, wallet, tabs, body) {
        const st = GuildOn.st, g = st.guild;
        wallet.innerHTML = '';
        wallet.append(h('span', L('보유 ')), coinText(st.coins), h('span.tip', L('냥단 코인은 냥단 상점에서 써요')));
        const list = g ? [['home', L('냥단'), `Lv.${g.lv}`], ['members', L('단원'), `${g.members}/${g.cap}`], ['boss', L('보스'), L('오늘 {0}번', GuildOn.bossLeft())],
            ['shop', L('상점'), L('코인 사용')], ['chat', L('채팅'), L('단원 대화')]]
            : [['find', L('찾기'), L('추천 냥냥단')], ['make', L('만들기'), L('보석 {0}', fmt(st.cfg.createGems))]];
        if (!list.some(t => t[0] === tab)) tab = list[0][0];
        if (tab !== 'chat') GuildOn.closeChat();
        tabs.innerHTML = '';
        tabs.classList.toggle('gd-five', list.length > 2);
        for (const [id, nm, sub] of list) tabs.appendChild(h('button.mk-tab' + (tab === id ? '.on' : ''), { onclick: () => { click(); tab = id; redraw(); } },
            h('b', nm), h('span', sub), id === 'home' && g && (!g.today.attended || !g.today.donated) ? h('i.gd-dot') : null,
            id === 'members' && g && (g.apps || []).length ? h('i.gd-dot') : null));
        body.innerHTML = '';
        ({ find: findTab, make: makeTab, home: homeTab, members: membersTab, boss: bossTab, shop: shopTab, chat: chatTab })[tab](body);
    }

    // ---------------------------------------------------------------- no guild: find
    function card(c, btn) {
        return h('div.mk-row.gd-card', emblem(c.emblem),
            h('div.mk-info', h('b.mk-nm', c.name, h('span.gd-lv', ` Lv.${c.lv}`)),
                h('div.mk-meta', L('단원 {0}/{1}', c.members, c.cap), ' · ', c.mode === 'approve' ? L('승인 후 가입') : L('바로 가입'), c.leader ? ' · ' + L('단장 {0}', c.leader) : ''),
                c.intro ? h('div.mk-stat', c.intro) : null), btn);
    }
    function findTab(body) {
        const st = GuildOn.st;
        if (st.cooldown) body.appendChild(h('div.mk-lock', L('냥냥단을 나온 뒤 24시간이 지나야 들어갈 수 있어요 ({0})', new Date(Number(st.cooldown)).toLocaleString())));
        body.appendChild(h('div.mk-hint', L('냥냥단에 들어가면 매일 출석·기부로 냥단 코인을 모으고, 단원과 함께 주간 보스와 임무를 깨요')));
        const input = h('input.nick.mk-q', { type: 'search', placeholder: L('냥냥단 이름 검색'), enterkeyhint: 'search', maxlength: 10 });
        const go = h('button.btn.small', L('검색'));
        const listEl = h('div.mk-list');
        body.append(h('div.mk-search', input, go), listEl);
        const load = async () => {
            listEl.innerHTML = ''; listEl.appendChild(UI.catLoad(null, 'sm'));
            const r = await GuildOn.list(input.value.trim());
            listEl.innerHTML = '';
            if (r.error) { listEl.appendChild(h('div.mk-empty', GuildOn.errText(r.error))); return; }
            if (!r.length) { listEl.appendChild(h('div.mk-empty', input.value.trim() ? L('찾는 냥냥단이 없어요') : L('아직 빈자리가 있는 냥냥단이 없어요. 직접 만들어 보세요'))); return; }
            for (const c of r) {
                const applied = (st.apps || []).includes(c.id);
                const b = h('button.btn.small' + (applied ? '.ghost' : '.gold'), applied ? L('신청 취소') : c.mode === 'approve' ? L('가입 신청') : L('가입'));
                b.onclick = busy(b, async () => {
                    const x = applied ? await GuildOn.cancelApp(c.id) : await GuildOn.join(c.id);
                    if (!say(x)) return;
                    toast(x.joined ? L('{0}에 들어왔어요!', c.name) : x.applied ? L('가입 신청을 보냈어요. 단장이 받아 주면 들어가요') : L('신청을 취소했어요'));
                    tab = null; redraw();
                });
                listEl.appendChild(card(c, b));
            }
        };
        go.onclick = () => { click(); load(); };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
        load();
    }

    // ---------------------------------------------------------------- no guild: make
    function emblemPick(sel, onPick) {
        const grid = h('div.gd-embs');
        const drawPick = () => { grid.innerHTML = ''; EMBLEMS.forEach((_, i) => grid.appendChild(h('button.gd-embbtn' + (i === sel ? '.on' : ''), { onclick: () => { click(); sel = i; onPick(i); drawPick(); } }, emblem(i)))); };
        drawPick();
        return grid;
    }
    function makeTab(body) {
        const st = GuildOn.st, cost = st.cfg.createGems;
        let em = 0, mode = 'auto';
        const name = h('input.nick.gd-in', { maxlength: 10, placeholder: L('이름 (2~10자)') });
        const intro = h('input.nick.gd-in', { maxlength: 60, placeholder: L('소개 (60자까지, 비워도 돼요)') });
        const modeSel = h('select.mk-sel', h('option', { value: 'auto' }, L('누구나 바로 가입')), h('option', { value: 'approve' }, L('단장·부단장 승인 후 가입')));
        modeSel.onchange = () => { mode = modeSel.value; };
        const mk = h('button.btn.gold', L('보석 {0}개로 만들기', fmt(cost)));
        mk.onclick = () => {
            click();
            const n = name.value.trim();
            if (n.length < 2 || n.length > 10) { toast(GuildOn.errText('name_len')); return; }
            if (Save.p.gems < cost) { toast(GuildOn.errText('gems', { need: cost })); return; }
            UI.confirmBox(L('보석 {0}개로 "{1}" 냥냥단을 만들까요?', fmt(cost), n), async () => {
                const r = await UI.waitCat(GuildOn.create(n, em, intro.value.trim(), mode));
                if (!say(r)) return;
                toast(L('냥냥단을 만들었어요!')); tab = 'home'; redraw();
            });
        };
        if (st.cooldown) body.appendChild(h('div.mk-lock', L('냥냥단을 나온 뒤 24시간이 지나야 만들 수 있어요')));
        body.append(h('div.mk-sec', h('b', L('이름')), name), h('div.mk-sec', h('b', L('문양')), emblemPick(em, i => { em = i; })),
            h('div.mk-sec', h('b', L('소개')), intro), h('div.mk-sec', h('b', L('가입 방식')), modeSel),
            h('div.mk-hint', L('처음에는 10명까지, 냥단 레벨이 오르면 최대 20명까지 들어와요')), mk);
    }

    // ---------------------------------------------------------------- 냥단 (home)
    function homeTab(body) {
        const st = GuildOn.st, g = st.guild, cfg = st.cfg;
        const nextExp = cfg.exp[g.lv] !== undefined ? cfg.exp[g.lv] : null, baseExp = cfg.exp[g.lv - 1] || 0;
        const silver = cfg.silverPct[g.lv - 1] || 0;
        body.appendChild(h('div.mk-row.gd-card.gd-head', emblem(g.emblem, '.big'),
            h('div.mk-info', h('b.mk-nm', g.name, h('span.gd-lv', ` Lv.${g.lv}`)), h('div.mk-meta', L('단원 {0}/{1}', g.members, g.cap), ' · ', L('나: '), roleTag(g.role)),
                g.intro ? h('div.mk-stat', g.intro) : null)));
        body.appendChild(h('div.mk-sec', h('b', L('냥단 경험치')), nextExp !== null ? bar(g.exp - baseExp, nextExp - baseExp) : h('div.gold-t', L('최고 레벨이에요')),
            h('div.tip', L('레벨이 오르면 인원·출석 보상·상점 물건이 늘어요')), silver ? h('div.tip', L('냥단 버프: 스테이지 은화 +{0}%', silver)) : null));
        // check-in
        const attC = cfg.attend.coins + cfg.attend.lvCoins * (g.lv - 1);
        const att = h('button.btn' + (g.today.attended ? '.off' : '.gold'), g.today.attended ? L('출석 완료') : L('출석하기'));
        att.onclick = busy(att, async () => {
            if (g.today.attended) { toast(GuildOn.errText('done')); return; }
            const r = await GuildOn.attend();
            if (!say(r)) return;
            toast(L('냥단 코인 {0}개, 냥단 경험치 {1}', r.coins, r.exp)); redraw();
        });
        body.appendChild(h('div.mk-sec', h('b', L('매일 출석')), h('div.gd-line', h('span', L('코인 {0} · 경험치 {1}', attC, cfg.attend.exp)), att)));
        // donation: one a day, any of three
        const dn = h('div.gd-donate');
        for (const t of cfg.donate) {
            const price = t.gems ? L('보석 {0}', fmt(t.gems)) : L('은화 {0}', fmt(t.silver));
            const b = h('button.btn.small' + (g.today.donated ? '.off' : ''), h('b', DONATE_NAME()[t.id] || t.id), h('span', price), h('span', L('코인 {0}', t.coins)));
            b.onclick = busy(b, async () => {
                if (g.today.donated) { toast(GuildOn.errText('done')); return; }
                if (t.gems && Save.p.gems < t.gems) { toast(GuildOn.errText('gems', { need: t.gems })); return; }
                if (t.silver && Save.p.silver < t.silver) { toast(GuildOn.errText('silver', { need: t.silver })); return; }
                const r = await GuildOn.donate(t.id);
                if (!say(r)) return;
                toast(L('기부 고마워요! 냥단 코인 {0}개, 냥단 경험치 {1}', r.coins, r.exp)); redraw();
            });
            dn.appendChild(b);
        }
        body.appendChild(h('div.mk-sec', h('b', L('하루 한 번 기부')), g.today.donated ? h('div.tip', L('오늘은 기부했어요. 내일 또 해 주세요')) : null, dn));
        // weekly missions
        body.appendChild(h('div.mk-sec', h('b', L('이번 주 냥단 임무 (달성하면 단원 모두 코인)')),
            ...(g.missions || []).map(m => h('div.gd-mis' + (m.done ? '.done' : ''), h('div.gd-line', h('span', MISSION(m.kind)), h('span.gd-ctxt', coin(), m.coins)),
                bar(Number(m.progress), Number(m.target), m.done ? '.done' : '')))));
        // recent log
        const LOG = l => {
            const n = l.name || '';
            return { join: L('{0} 들어옴', n), leave: L('{0} 나감', n), kick: L('{0} 내보냄', n), level: L('냥단 레벨 {0}!', l.data.lv), donate: L('{0} 기부', n),
                create: L('{0} 냥냥단을 만듦', n), handover: L('{0} 단장이 됨', n), mission: L('임무 달성: {0}', MISSION(l.data.kind)),
                role: L('{0} {1}', n, ROLE()[l.data.role] || '') }[l.kind] || '';
        };
        const logs = (g.logs || []).filter(l => LOG(l));
        if (logs.length) body.appendChild(h('div.mk-sec', h('b', L('최근 소식')), ...logs.slice(0, 8).map(l => h('div.gd-log', h('span', LOG(l)), h('i', ago(l.at))))));
        const row = h('div.row.gd-btns');
        if (g.role === 'leader') row.appendChild(h('button.btn.small', { onclick: () => { click(); settings(); } }, L('냥단 설정')));
        const out = h('button.btn.small.red', L('나가기'));
        out.onclick = () => {
            click();
            UI.confirmBox(g.role === 'leader' && g.members > 1 ? L('단장 자리는 다른 단원에게 넘어가요. 나가면 24시간 동안 다른 냥냥단에 못 들어가요. 나갈까요?')
                : g.members <= 1 ? L('혼자 남은 냥냥단이라 나가면 없어져요. 나갈까요?') : L('나가면 24시간 동안 다른 냥냥단에 못 들어가요. 나갈까요?'), async () => {
                const r = await UI.waitCat(GuildOn.leave());
                if (!say(r)) return;
                toast(L('냥냥단을 나왔어요')); tab = null; redraw();
            });
        };
        row.appendChild(out);
        body.appendChild(row);
    }

    function settings() {
        const g = GuildOn.g;
        let em = g.emblem;
        const intro = h('input.nick.gd-in', { maxlength: 60, value: g.intro || '' });
        const modeSel = h('select.mk-sel', h('option', { value: 'auto' }, L('누구나 바로 가입')), h('option', { value: 'approve' }, L('단장·부단장 승인 후 가입')));
        modeSel.value = g.mode;
        const save = h('button.btn.gold', L('저장'));
        const d = modal([h('h2', L('냥단 설정')), h('div.mk-sec', h('b', L('문양')), emblemPick(em, i => { em = i; })), h('div.mk-sec', h('b', L('소개')), intro),
            h('div.mk-sec', h('b', L('가입 방식')), modeSel), save, h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { cls: 'gd-pop' });
        save.onclick = busy(save, async () => {
            const r = await GuildOn.update(intro.value.trim(), modeSel.value, em);
            if (!say(r)) return;
            d.remove(); redraw();
        });
    }

    // ---------------------------------------------------------------- 단원
    function membersTab(body) {
        const g = GuildOn.g, officer = g.role === 'leader' || g.role === 'vice';
        if (officer && (g.apps || []).length) {
            body.appendChild(h('div.mk-sec', h('b', L('가입 신청 {0}', g.apps.length)), ...g.apps.map(a => {
                const ok = h('button.btn.small.gold', L('받기')), no = h('button.btn.small.ghost', L('거절'));
                ok.onclick = busy(ok, async () => { const r = await GuildOn.decide(a.uid, true); if (say(r)) toast(L('{0} 님이 들어왔어요', a.name)); redraw(); });
                no.onclick = busy(no, async () => { await GuildOn.decide(a.uid, false); redraw(); });
                return h('div.mk-row', face(a), h('div.mk-info', h('b.mk-nm', a.name, h('span.tip', ` #${a.tag}`)), h('div.mk-meta', a.highest >= 0 ? L('진행 {0}', stageLabel(a.highest)) : '')), ok, no);
            })));
        }
        body.appendChild(h('div.mk-hint', L('기여도는 출석·기부·보스로 쌓여요. 단장이 7일 동안 안 들어오면 기여도가 높은 부단장(없으면 단원)이 단장이 돼요')));
        const listEl = h('div.mk-list');
        for (const m of g.members_list || []) {
            const acts = !m.me && (g.role === 'leader' || (g.role === 'vice' && m.role === 'member'));
            listEl.appendChild(h('div.mk-row.gd-mem' + (m.me ? '.me' : ''), { onclick: acts ? () => { click(); memberMenu(m); } : null }, face(m),
                h('div.mk-info', h('b.mk-nm', m.me ? L('나') : m.name, m.me ? null : h('span.tip', ` #${m.tag}`), ' ', roleTag(m.role)),
                    m.title ? h('div.gd-title', L(m.title)) : null,
                    h('div.mk-meta', L('이번 주 {0} · 누적 {1}', fmt(m.week), fmt(m.contrib)), ' · ', ago(m.seen))),
                acts ? h('span.gd-more', '...') : null));
        }
        body.appendChild(listEl);
    }
    function memberMenu(m) {
        const g = GuildOn.g, btns = [];
        const act = (label, cls, msg, fn) => btns.push(h('button.btn' + cls, { onclick: () => { click(); d.remove(); UI.confirmBox(msg, async () => { const r = await UI.waitCat(fn()); if (say(r)) redraw(); }); } }, label));
        if (g.role === 'leader') {
            if (m.role === 'vice') act(L('부단장 해제'), '', L('{0} 님을 단원으로 바꿀까요?', m.name), () => GuildOn.setRole(m.uid, 'member'));
            else act(L('부단장 임명'), '.gold', L('{0} 님을 부단장으로 정할까요?', m.name), () => GuildOn.setRole(m.uid, 'vice'));
            act(L('단장 넘기기'), '', L('{0} 님에게 단장을 넘길까요? 나는 부단장(자리가 없으면 단원)이 돼요', m.name), () => GuildOn.setRole(m.uid, 'leader'));
        }
        act(L('내보내기'), '.red', L('{0} 님을 냥냥단에서 내보낼까요?', m.name), () => GuildOn.kick(m.uid));
        const d = modal([h('h2', m.name), h('div.tip', `#${m.tag} · ${ROLE()[m.role]}`), ...btns, h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { cls: 'gd-pop' });
    }

    // ---------------------------------------------------------------- 보스
    function bossTab(body) {
        const g = GuildOn.g, cfg = GuildOn.cfg, b = g.boss, left = GuildOn.bossLeft(), E = ENEMIES[b.kind];
        const pic = Art.domCanvas(Art.enemy(b.kind, 0), 2.4); pic.classList.add('gd-boss');
        const go = h('button.btn' + (left ? '.gold' : '.off'), L('도전 ({0}/{1})', left, cfg.boss.tries));
        go.onclick = busy(go, async () => {
            if (!left) { toast(GuildOn.errText('no_tries')); return; }
            const r = await GuildOn.bossBegin();
            if (!say(r)) return;
            GuildOn.closeChat();
            if (win) { win.remove(); win = null; }
            Game.startBattle({ raid: true, raidOn: { mode: 'guild', kind: r.kind, si: GuildOn.bossStage(r.kind) } });
        });
        body.appendChild(h('div.mk-row.gd-bosshead', pic, h('div.mk-info', h('b.mk-nm', E ? `${E.title} ${E.name}` : b.kind),
            h('div.mk-meta', L('하루 {0}번 · 3분 토벌전 · 단원 피해를 합쳐요', cfg.boss.tries)),
            h('div.mk-meta', L('내 점수 {0} · 참가 {1}명', fmt(b.pts), b.players))), go));
        body.appendChild(h('div.mk-sec', h('b', L('합계 피해')), bar(Number(b.dmg), Number(b.hp), b.tier >= cfg.boss.tiers.length ? '.done' : '')));
        body.appendChild(h('div.mk-sec', h('b', L('단계 보상 (그 주에 도전한 단원 모두, 우편)')),
            ...cfg.boss.tiers.map((t, i) => h('div.gd-tier' + (b.tier > i ? '.on' : ''), h('b', L('{0}단계', i + 1)), h('span.tip', `${fmt(Math.ceil(b.hp * t))}`),
                h('div.gd-ric', h('span.gd-ctxt', coin(), cfg.boss.rewards[i].coins), ...UI.rewardIcons(cfg.boss.rewards[i].reward))))));
        if ((b.top || []).length) body.appendChild(h('div.mk-sec', h('b', L('이번 주 기여')),
            ...b.top.map((x, i) => h('div.gd-log' + (x.me ? '.me' : ''), h('span', `${i + 1}. ${x.me ? L('나') : x.name}`), h('i', L('{0}점', fmt(x.pts)))))));
    }
    // result screen line for a 냥단 보스 run (called from Game.onBattleEnd through main.js)
    function guildResultLine(R) {
        const el = document.querySelector('.rd-result');
        if (!el || !R.raidOn) return;
        el.innerHTML = '';
        const x = R.raidOn.res;
        if (!x || x.error) { el.textContent = x ? GuildOn.errText(x.error) : L('기록을 보내는 중…'); return; }
        el.append(...[h('div', L('냥단 보스 '), bar(Number(x.dmg), Number(x.hp), x.dmg >= x.hp ? '.done' : '')),
            x.added < R.raidOn.pts ? h('div.tip', L('한 판에 {0}점까지 반영돼요', fmt(x.added))) : null,
            h('div.tip', L('이번 주 내 점수 {0}', fmt(x.pts))),
            x.newTier ? h('div.gold-t', L('{0}단계 달성! 보상이 우편함으로 왔어요', x.tier)) : null].filter(Boolean));
    }

    // ---------------------------------------------------------------- 상점
    function shopTab(body) {
        const st = GuildOn.st, g = st.guild, cfg = st.cfg;
        body.appendChild(h('div.mk-hint', L('냥단 코인으로 사요. 물건은 우편으로 바로 받아요. 냥단 레벨이 오르면 물건이 늘어요')));
        const listEl = h('div.mk-list');
        for (const it of cfg.shop) {
            const nm = SHOP_NAME()[it.id] || it.id, bought = st.buys[it.id] || 0, locked = g.lv < it.lv;
            const left = it.weekly ? it.weekly - bought : null, owned = it.title && (st.titles || []).includes(it.title);
            let btn;
            if (owned) {
                const wearing = g.title === it.title;
                btn = h('button.btn.small' + (wearing ? '.ghost' : ''), wearing ? L('벗기') : L('달기'));
                btn.onclick = busy(btn, async () => { const r = await GuildOn.setTitle(wearing ? null : it.title); if (say(r)) redraw(); });
            } else {
                const can = !locked && st.coins >= it.cost && (left === null || left > 0);
                btn = h('button.btn.small' + (can ? '.gold' : '.off'), h('span.gd-ctxt', coin(), fmt(it.cost)));
                btn.onclick = busy(btn, async () => {
                    if (locked) { toast(GuildOn.errText('guild_lv', { lv: it.lv })); return; }
                    if (left === 0) { toast(GuildOn.errText('weekly')); return; }
                    if (st.coins < it.cost) { toast(GuildOn.errText('coins')); return; }
                    const r = await GuildOn.buy(it.id);
                    if (!say(r)) return;
                    if (r.got && r.got.length) UI.showGot(nm, r.got); else toast(L('{0}을(를) 샀어요', nm));
                    redraw();
                });
            }
            const icons = it.reward ? UI.rewardIcons(it.reward) : [h('div.cell.gd-tcell', h('span', L('칭호')))];
            listEl.appendChild(h('div.mk-row' + (locked ? '.off' : ''), ...icons,
                h('div.mk-info', h('b.mk-nm', nm), h('div.mk-meta', locked ? L('냥단 레벨 {0}부터', it.lv) : it.weekly ? L('이번 주 {0}번 남음', Math.max(0, left)) : owned ? (g.title === it.title ? L('달고 있어요') : L('가지고 있어요')) : L('단원 이름 옆에 보여요'))),
                btn));
        }
        body.appendChild(listEl);
    }

    // ---------------------------------------------------------------- 채팅
    function chatTab(body) {
        const g = GuildOn.g, me = Online.user && Online.user.id;
        const box = h('div.gd-chat');
        const input = h('input.nick.gd-cin', { maxlength: GuildOn.cfg.chat.max, placeholder: L('메시지 (욕설은 가려져요)'), enterkeyhint: 'send' });
        const send = h('button.btn.small.gold', L('보내기'));
        const line = r => {
            const mine = r.uid === me;
            const el = h('div.gd-msg' + (mine ? '.me' : ''), h('div.gd-who', r.name, r.title ? h('span.gd-title', ' ' + L(r.title)) : null, h('i', new Date(Number(r.at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))),
                h('div.gd-txt', r.body));
            if (!mine) el.addEventListener('click', () => { click(); msgMenu(r); });
            return el;
        };
        const paint = () => { box.innerHTML = ''; if (!GuildOn.chat.length) box.appendChild(h('div.mk-empty', L('첫 인사를 남겨 보세요'))); GuildOn.chat.forEach(r => box.appendChild(line(r))); box.scrollTop = box.scrollHeight; };
        const doSend = async () => {
            const t = input.value.trim();
            if (!t) return;
            send.disabled = true;
            const r = await GuildOn.send(t);
            send.disabled = false;
            if (!say(r)) return;
            input.value = '';
        };
        send.onclick = () => { click(); doSend(); };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
        body.append(box, h('div.mk-search.gd-send', input, send));
        box.appendChild(UI.catLoad(null, 'sm'));
        GuildOn.openChat(row => { if (!box.isConnected) return; const em = box.querySelector('.mk-empty'); if (em) em.remove(); box.appendChild(line(row)); box.scrollTop = box.scrollHeight; });
        GuildOn.loadChat().then(r => { if (!box.isConnected) return; if (r.error) { box.innerHTML = ''; box.appendChild(h('div.mk-empty', GuildOn.errText(r.error))); return; } paint(); });
        GuildOn.unread = 0;
        void g;
    }
    function msgMenu(r) {
        const g = GuildOn.g, btns = [];
        btns.push(h('button.btn', { onclick: () => { click(); d.remove(); UI.confirmBox(L('이 메시지를 신고할까요? 운영자가 확인해요'), async () => { const x = await GuildOn.report(r.id); if (say(x)) toast(L('신고했어요')); }); } }, L('신고')));
        const target = (g.members_list || []).find(m => m.uid === r.uid);
        if (target && (g.role === 'leader' || (g.role === 'vice' && target.role === 'member'))) {
            btns.push(h('button.btn.red', { onclick: () => { click(); d.remove(); UI.confirmBox(L('{0} 님을 냥냥단에서 내보낼까요?', r.name), async () => { const x = await UI.waitCat(GuildOn.kick(r.uid)); if (say(x)) toast(L('내보냈어요')); }); } }, L('내보내기')));
        }
        const d = modal([h('h2', r.name), h('div.gd-txt', r.body), ...btns, h('button.btn.ghost', { onclick: () => { click(); d.remove(); } }, L('닫기'))], { cls: 'gd-pop' });
    }

    // hub badge: number of things waiting (0 when offline or not in a guild). refresh() reloads the state first
    function guildBadge() { return GuildOn.badge(); }
    async function guildRefresh() { if (Online.on && Date.now() - GuildOn.at > 60000) await GuildOn.state(); return GuildOn.badge(); }

    Object.assign(UI, { guildScreen, guildBadge, guildRefresh, guildResultLine });
})();
