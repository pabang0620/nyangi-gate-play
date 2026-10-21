'use strict';
// UI - battle HUD, speed (3x gate), aiming skills/spells, tower popup, pause, banners, revive.
// Part of the UI namespace (js/ui/core.js loads first); functions from other UI files are reached through UI.
(() => {
    const root = (...a) => UI.root(...a);
    const S = UI.S;
    const clear = (...a) => UI.clear(...a);
    const ico = (...a) => UI.ico(...a);
    const click = (...a) => UI.click(...a);
    const img = (...a) => UI.img(...a);
    const modal = (...a) => UI.modal(...a);
    const showGot = (...a) => UI.showGot(...a);
    const showHub = (...a) => UI.showHub(...a);


    // ------------------------------------------------------------ battle HUD
    function showBattleHud(B) {
        S.screen = 'battle';
        clear();
        S.aim = null; S.rally = null; S.paused = false;
        Render.view.aim = null; Render.view.selSlot = null; Render.view.hoverSlot = null; Render.view.preview = null;
        const p = Save.p;
        const hud = {};
        const tog = (label, key) => {
            const t = h('div.tog' + (p.set[key] ? '.on' : ''), h('div.sw'), label);
            t.addEventListener('click', () => { click(); toggleAuto(key); });
            return t;
        };
        hud.lives = h('span'); hud.gold = h('span'); hud.wave = h('span');
        hud.speedLbl = h('span.lbl', 'x1');
        hud.speed = h('div.iconbtn', { onclick: () => { cycleSpeed(); } }, img('i_speed'), hud.speedLbl);
        hud.autoHero = tog(L('영웅 자동'), 'autoHero');
        hud.autoWave = tog(L('자동 웨이브'), 'autoWave');
        const top = h('div.hud-top',
            h('div.hud-box', ico('heart'), hud.lives),
            h('div.hud-box', ico('gold'), hud.gold),
            h('div.hud-box.wv', ico('skull'), hud.wave),
            B.coop ? (hud.mate = h('div.hud-box.mate', '')) : null,
            B.coop && UI.coopSignalBtn ? UI.coopSignalBtn() : null,
            h('div.sp'),
            hud.autoHero, B.coop ? null : hud.autoWave, hud.speed,
            h('div.iconbtn', { onclick: () => { click(); pause(true); } }, img('i_pause')));
        root().appendChild(top);
        if (B.cond) root().appendChild(hud.cond = h('div.hud-cond.top', { title: L('영웅 난이도 3성 조건') }));
        // hero panel
        const cls = B.hero.cls;
        hud.hpBar = h('i'); hud.dead = h('div.dead');
        const skinId = Save.p.shop && Save.p.shop.skin[cls];
        hud.manual = h('div.manual-tag');
        hud.skills = B.hero.skills.map((sk, i) => {
            const cd = h('div.cd'), cdt = h('div.cdt');
            const el = h('div.skill' + (i === 3 ? '.ult' : ''), { title: `${sk.name}: ${sk.desc}`, onclick: () => { if (el._lp) { el._lp = false; return; } pressSkill(i); } },
                Art.domCanvas(Art.icon(sk.id), 3.4), cd, cdt, h('span.key', String(i + 1)));
            holdInfo(el, () => skillCard(sk, sk.locked ? SKILL_UNLOCK[i] : 0));
            return { el, cd, cdt };
        });
        const heroPanel = h('div.hud-hero',
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                h('div.portrait', { onclick: () => { click(); if (B.heroAlive) { Render.view.selSlot = null; closePopup(); } } }, (() => { const a = img(heroFace(cls, skinId)); a.style.background = avatarBg(); return a; })(), hud.dead),
                h('div.bar', { style: { width: '70px' } }, hud.hpBar)),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                h('div.hero-name', `${HERO_NAMES[cls]} `, h('span.num', `Lv.${B.hero.lv}`), ' ', hud.manual),
                h('div', { style: { display: 'flex', gap: '6px' } }, hud.skills.map(s => s.el))));
        root().appendChild(heroPanel);
        hud.spells = B.spells.map((sp, i) => {
            const cd = h('div.cd'), cdt = h('div.cdt');
            const el = h('div.skill', { title: `${sp.name}: ${sp.desc}`, onclick: () => { if (el._lp) { el._lp = false; return; } pressSpell(i); } }, Art.domCanvas(Art.icon(sp.icon || sp.id), 3.4), cd, cdt, h('span.key', 'QWE'[i]));
            holdInfo(el, () => skillCard(sp));
            return { el, cd, cdt };
        });
        root().appendChild(h('div.hud-spells', hud.spells.map(s => s.el)));
        // wave call buttons
        hud.waveBtns = B.spawnPoints().map(pt => {
            const t = h('span.t');
            const prev = h('div.wave-prev', { onclick: e => { e.stopPropagation(); click(); foeCard(L('다음 웨이브'), prev._kinds || [], L('뿔피리를 누르면 바로 시작해요')); } });
            const el = h('div.wave-btn', { style: { left: clamp(pt.x + 30, 60, W - 60) + 'px', top: clamp(pt.y, 130, pt.x < 560 ? H - 300 : H - 170) + 'px' }, onclick: () => { Game.battle.callWave(); Sfx.play('wave'); } }, img('i_horn'), t, prev);
            root().appendChild(el);
            return { el, t, prev, shownFor: -9 };
        });
        // spawn points close together: slide a horn sideways so it doesn't cover the other one's label
        hud.waveBtns.forEach((w, i) => {
            for (let j = 0; j < i; j++) {
                const o = hud.waveBtns[j].el.style, s = w.el.style;
                if (Math.abs(parseFloat(o.left) - parseFloat(s.left)) < 100 && Math.abs(parseFloat(o.top) - parseFloat(s.top)) < 130) s.left = parseFloat(o.left) + 110 + 'px';
            }
        });
        hud.tip = h('div.paper.guide', { style: { position: 'absolute', left: '50%', bottom: '22px', transform: 'translateX(-50%)', padding: '8px 16px', fontSize: '16px', display: 'none', pointerEvents: 'none' } });
        root().appendChild(hud.tip);
        S.hud = hud; S.coach = null; S.foeQ = []; S.speed3Asked = false;
        S.lastHud = {};
        // where flying coins should land: the gold plate's icon, in canvas coordinates
        requestAnimationFrame(() => {
            const app = document.getElementById('app'), r = hud.gold.parentElement.getBoundingClientRect(), a = app.getBoundingClientRect();
            const k = a.width / W;
            Render.view.goldPos = { x: (r.left - a.left + 20) / k, y: (r.top - a.top + r.height / 2) / k };
            const hl = heroPanel.getBoundingClientRect(), sr = root().querySelector('.hud-spells').getBoundingClientRect();
            hud.gap = { l: (hl.right - a.left) / k, r: (sr.left - a.left) / k };
            // 3-star chip centred under the top row; wave horns never sit on it
            if (hud.cond) {
                hud.cond.style.top = (top.getBoundingClientRect().bottom - a.top) / k + 4 + 'px';
                const c = hud.cond.getBoundingClientRect(), cb = (c.bottom - a.top) / k, cl = (c.left - a.left) / k - 50, cr = (c.right - a.left) / k + 50;
                for (const w of hud.waveBtns) { const x = parseFloat(w.el.style.left), y = parseFloat(w.el.style.top); if (x > cl && x < cr && y - 46 < cb) w.el.style.top = cb + 48 + 'px'; }
            }
            UI.lesson(B);   // 1-1 ~ 1-3: step-by-step cards (js/ui/tutorial.js)
        });
        // first-battle guide
        if (!B.endless && B.stageIdx === 0 && !p.seenTips.battle) {
            p.seenTips.battle = true; Save.save();
            S.guide = [L('돌 발판을 눌러 탑을 지어요'), L('뿔피리를 눌러 적을 불러요'), L('땅을 누르면 영웅이 달려가요'), L('스킬 버튼도 눌러 보세요')];
            S.guideT = 0;
        } else S.guide = null;
    }


    function updateHud(B, dt) {
        const hud = S.hud;
        if (!hud) return;
        const set = (k, v, el) => { if (S.lastHud[k] !== v) { S.lastHud[k] = v; el.textContent = v; } };
        set('lives', `${B.lives}`, hud.lives);
        set('gold', fmt(B.gold), hud.gold);
        set('wave', B.raidLive ? L('남은 {0}초 · 보스 체력 {1}%', Math.ceil(B.timeLeft), B.bossRef ? Math.ceil(Math.max(0, B.bossRef.hp) / B.bossRef.maxHp * 100) : 100) : B.raid ? L('남은 {0}초 · 피해 {1}', Math.ceil(B.timeLeft), fmt(Math.round(B.raidDamage))) : B.endless ? L('웨이브 {0}', Math.max(0, B.waveIdx + 1)) : L('웨이브 {0} / {1}', Math.max(0, B.waveIdx + 1), B.totalWaves), hud.wave);
        if (Game.speed === 3 && !Rewards.speed3Unlocked(Save.p)) { Game.speed = 2; Save.p.set.speed = 2; toast(L('3배속 시간이 끝났습니다')); }
        set('speed', (B.coop ? Coop.speed : Game.speed) + L('배'), hud.speedLbl);
        if (hud.mate) set('mate', B.acts.map((a, k) => k === B.actor ? null : L('{0} · 금화 {1}', Coop.nameOf(k), fmt(B.goldOf(k))) + (Coop.goneOf(k) ? L(' (자동)') : '')).filter(Boolean).join('   '), hud.mate);
        if (hud.cond) { set('cond', L('3성: {0} {1}', B.cond.name, B.condBroken ? '✗' : '✓'), hud.cond); hud.cond.classList.toggle('broken', B.condBroken); }
        const hero = B.hero;
        hud.hpBar.style.width = (hero.hp / hero.maxHp * 100) + '%';
        if (!B.heroAlive) { hud.dead.style.display = 'flex'; hud.dead.textContent = Math.ceil(hero.deadUntil - B.t); } else hud.dead.style.display = 'none';
        const man = B.t < hero.manualUntil && Save.p.set.autoHero;
        set('manual', !Save.p.set.autoHero ? L('수동') : man ? L('수동 {0}초', (hero.manualUntil - B.t).toFixed(1)) : L('자동'), hud.manual);
        hero.skills.forEach((sk, i) => {
            const u = hud.skills[i];
            u.el.classList.toggle('locked', sk.locked);
            u.el.classList.toggle('armed', S.aim && S.aim.kind === 'skill' && S.aim.i === i);
            const k = sk.locked ? 1 : sk.left / sk.cdMax;
            u.cd.style.setProperty('--cd', (k * 100) + '%');
            u.cdt.textContent = sk.locked ? `Lv${SKILL_UNLOCK[i]}` : sk.left > 0 ? Math.ceil(sk.left) : '';
        });
        B.spells.forEach((sp, i) => {
            const u = hud.spells[i];
            u.el.classList.toggle('armed', S.aim && S.aim.kind === 'spell' && S.aim.i === i);
            u.cd.style.setProperty('--cd', (sp.left / sp.cdMax * 100) + '%');
            u.cdt.textContent = sp.left > 0 ? Math.ceil(sp.left) : '';
        });
        const showWave = !B.raid && (B.state === 'prep' || B.countdown > 0) && B.waveIdx + 1 < B.totalWaves;   // raids have no waves to call
        hud.waveBtns.forEach(w => {
            w.el.style.display = showWave && !S.popup && !(w.shownFor === B.waveIdx && w.empty) ? 'flex' : 'none';   // tower popup would cover it; paths with nothing coming stay hidden
            if (showWave) w.t.textContent = B.state === 'prep' ? (Save.p.set.autoWave ? L('자동 시작 {0}초', Math.max(1, Math.ceil(2.5 - (B.prepWait || 0)))) : L('시작')) : L('+{0} 금화 · {1}초', Math.ceil(B.countdown * EARLY_GOLD_PER_SEC), Math.ceil(B.countdown));
            if (showWave && w.shownFor !== B.waveIdx) {
                // which enemies come next on this path (boss gets a red frame)
                w.shownFor = B.waveIdx;
                const wave = B.endless ? B.genEndlessWave(B.waveIdx + 1) : B.waves[B.waveIdx + 1];
                const pi = hud.waveBtns.indexOf(w);
                const kinds = [...new Set(wave.filter(s => s.path % B.paths.length === pi).map(s => s.kind))].slice(0, 4);
                w.prev.innerHTML = '';
                kinds.forEach(k => { const cv = Art.domCanvas(Art.enemy(k, 0), 1); cv.title = ENEMIES[k].name; if (ENEMIES[k].boss) cv.classList.add('boss'); w.prev.appendChild(cv); });
                w.prev._kinds = kinds;
                w.prev.style.display = kinds.length ? 'flex' : 'none';
                w.empty = !kinds.length;
                if (w.empty) w.el.style.display = 'none';
            }
        });
        // guide
        if (S.guide) {
            let step = 0;
            if (B.slots.some(s => s.tower)) step = 1;
            if (step === 1 && B.waveIdx >= 0) step = 2;
            if (step === 2 && B.hero.manualUntil > 0) step = 3;
            if (step === 3 && (B.spells[0].left > 0 || B.hero.skills.some(s => s.left > 0 && B.t < B.hero.manualUntil + 1))) { S.guide = null; hud.tip.style.display = 'none'; return; }
            hud.tip.style.display = S.coach && S.coach.isConnected ? 'none' : 'block';
            hud.tip.textContent = S.guide[step];
        }
        if (S.foeQ.length && !(S.coach && S.coach.isConnected) && !S.paused) showFoe(S.foeQ.shift());
        if (S.popup) refreshPopup(B);
    }


    function cycleSpeed() {
        if (Game.battle && Game.battle.coop) { Coop.toggleSpeed(); return; }
        click();
        const p = Save.p;
        const speeds = window.DEV_SPEEDS || [1, 2, 3];   // the test APK (android/dev/dev.js) adds 5x and 10x
        let next = speeds[(speeds.indexOf(Game.speed) + 1) % speeds.length];
        if (next === 3 && !Rewards.speed3Unlocked(p)) {
            // offer once, keeping the current speed; the next tap goes on to 1x
            if (!S.speed3Asked) { S.speed3Asked = true; speed3Offer(); return; }
            next = 1;
        }
        S.speed3Asked = false;
        Game.speed = next; p.set.speed = next; Save.save();
    }

    // 3배속 잠금: 광고 1회 = 30분, 또는 상점에서 영구 해금
    function speed3Offer() {
        const p = Save.p; Rewards.ensure(p);
        const left = Rewards.adLeft(p, 'speed3');
        const setSpeed3 = () => { Game.speed = 3; p.set.speed = 3; Save.save(); };
        const d = modal([h('h2', L('3배속')),
            h('div', { style: { fontSize: '18px', margin: '6px 0 12px', textAlign: 'center', lineHeight: 1.5 } }, L('전투를 3배 빠르게 진행합니다.'), h('br'), L('광고를 보면 30분 동안 쓸 수 있고, 상점에서 영구히 해금할 수 있습니다.')),
            h('div.row', { style: { gap: '10px' } },
                h('button.btn.gold' + (left ? '' : '.off'), { onclick: async () => {
                    if (!left) { toast(L('오늘 광고 횟수를 다 썼습니다')); return; }
                    click();
                    if (await Rewards.watchAd('speed3')) { p.speed3Until = Math.max(nowMs(), p.speed3Until || 0) + SPEED3_AD_MIN * 60000; setSpeed3(); d.remove(); toast(L('30분 동안 3배속!')); }
                } }, h('span', img('i_ad', '.icon'), L(' 광고 보고 30분 ({0}/{1})', left, AD_LIMITS.speed3))),
                h('button.btn', { onclick: async () => {
                    click(); const g = await Rewards.buy('speed3');
                    if (g) { setSpeed3(); d.remove(); showGot(L('3배속 영구 해금'), g); }
                } }, L('영구 해금 ₩{0}', fmt(PRODUCTS.speed3.price)))),
            h('div.tip', { style: { marginTop: '8px' } }, L('냥이의 가호에도 3배속 영구가 포함되어 있습니다.'), h('br'), L('배속 버튼을 한 번 더 누르면 1배속으로 돌아가요')),
            h('button.btn.ghost', { style: { marginTop: '8px' }, onclick: () => { click(); d.remove(); } }, L('닫기'))], { dismiss: true });
    }


    // ------------------------------------------------------------ aiming (skills & spells)
    function pressSkill(i) {
        const B = Game.battle; if (!B || S.paused) return;
        const sk = B.hero.skills[i];
        if (sk.locked) { toast(L('영웅 Lv.{0}에 해금됩니다', SKILL_UNLOCK[i])); return; }
        if (sk.left > 0) return;
        if (!B.heroAlive) { toast(L('영웅이 쓰러져 있습니다')); return; }
        closePopup();
        if (!tipSeen('sk_' + sk.id)) skillCard(sk, 0, true);
        if (sk.target === 'self') { B.castSkill(i, 0, 0, true); return; }
        if (S.aim && S.aim.kind === 'skill' && S.aim.i === i) { cancelAim(); return; }
        cancelAim();
        S.aim = { kind: 'skill', i }; showAimCancel(`${sk.name} · ` + (sk.len ? L('지도를 눌러 쏠 방향을 고르세요') : L('지도를 눌러 사용할 위치를 고르세요')));
        Render.view.aim = sk.len ? { line: true, len: sk.len, wid: sk.wid, color: '#7fd4ff' } : { r: sk.r || 40, color: i === 3 ? '#ffb040' : '#7fd4ff' };
    }

    function pressSpell(i) {
        const B = Game.battle; if (!B || S.paused) return;
        const sp = B.spells[i];
        if (sp.left > 0) return;
        closePopup();
        if (!tipSeen('sk_' + sp.id)) skillCard(sp, 0, true);
        if (S.aim && S.aim.kind === 'spell' && S.aim.i === i) { cancelAim(); return; }
        cancelAim();
        S.aim = { kind: 'spell', i }; showAimCancel(`${sp.name} · ` + L('지도를 눌러 사용할 위치를 고르세요'));
        Render.view.aim = { r: sp.r || 36, color: ['#ff7030', '#f2c14e', '#ffe08a'][i] };
    }

    function cancelAim() { S.aim = null; Render.view.aim = null; S.rally = null; root().querySelectorAll('.aim-cancel, .aim-hint').forEach(c => c.remove()); }

    // touch has no right click or Esc, so aiming shows an explicit cancel button (and what to tap)
    function showAimCancel(hint) {
        if (!root().querySelector('.aim-cancel')) root().appendChild(h('button.btn.red.aim-cancel', { onclick: e => { e.stopPropagation(); click(); cancelAim(); } }, L('취소')));
        root().querySelectorAll('.aim-hint').forEach(c => c.remove());
        if (hint) root().appendChild(h('div.aim-hint', hint));
    }

    // first-time / long-press explanations (seen flags live in Save.p.seenTips)
    function tipSeen(k) {
        const p = Save.p; p.seenTips = p.seenTips || {};
        if (p.seenTips[k]) return true;
        p.seenTips[k] = true; Save.save();
        return false;
    }

    function coach(title, lines, ms = 5500) {
        if (S.coach) S.coach.remove();
        const c = S.coach = h('div.coach', { onclick: () => c.remove() }, h('b', title), lines.filter(Boolean).map(t => h('div', t)));
        const g = S.hud && S.hud.gap;   // sit in the strip between the hero and spell panels
        if (g && g.r - g.l > 300) { c.style.left = (g.l + g.r) / 2 + 'px'; c.style.maxWidth = (g.r - g.l - 16) + 'px'; }
        root().appendChild(c);
        clearTimeout(S.coachT); S.coachT = setTimeout(() => c.remove(), ms);
    }

    function skillCard(sk, lockLv, first) {
        coach(sk.name, [sk.desc,
            (lockLv ? L('영웅 Lv.{0}에 해금됩니다', lockLv) + ' · ' : '') + L('대기 {0}초', Math.round(sk.cdMax || sk.cd)) + ' · ' + (sk.target === 'self' ? L('누르면 바로 발동') : L('누른 뒤 지도에서 위치 선택')),
            first ? L('버튼을 길게 누르면 언제든 설명을 볼 수 있어요') : null], first ? 6500 : 4000);
    }

    function holdInfo(el, fn) {
        let tm = null;
        el.addEventListener('pointerdown', () => { el._lp = false; clearTimeout(tm); tm = setTimeout(() => { el._lp = true; fn(); }, 400); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(tm)));
    }

    // HUD auto toggles (also the Tab key): toast every time, a coach card the first time
    function toggleAuto(key) {
        const p = Save.p, on = p.set[key] = !p.set[key]; Save.save();
        if (key === 'autoHero' && Game.battle && Game.battle.coop) Coop.cmd(['auto', on]);   // co-op: the switch is part of the shared fight
        const hud = S.hud; if (hud && hud[key]) hud[key].classList.toggle('on', on);
        if (key === 'autoHero') {
            toast(on ? L('영웅 자동 켜짐') : L('영웅 자동 꺼짐 (직접 조작)'));
            if (!tipSeen('tog_autoHero')) coach(L('영웅 자동'), [L('켜면 알아서 싸우고, 끄면 누른 곳을 지켜요.')], 6000);
        } else {
            toast(on ? L('자동 웨이브 켜짐') : L('자동 웨이브 꺼짐 (뿔피리로 직접 시작)'));
            if (!tipSeen('tog_autoWave')) coach(L('자동 웨이브'), [L('켜면 적이 3마리 이하일 때 다음 웨이브를 불러요.'), L('일찍 부를수록 금화 보너스')], 6000);
        }
    }

    // first sighting of an enemy with a trait (battle 'spawn' event): one card per kind, ever, queued
    function foeSpawned(kind) {
        const d = ENEMIES[kind], p = Save.p;
        if (!S.foeQ || !(d.tag || d.boss) || (p.seenTips && p.seenTips['foe_' + kind]) || S.foeQ.includes(kind)) return;
        S.foeQ.push(kind);
    }
    function showFoe(kind) {
        if (tipSeen('foe_' + kind)) return;
        const d = ENEMIES[kind];
        coach(d.boss ? d.name + ' · ' + d.title : d.name, [UI.foeTip(kind), (d.boss || d.elite) && !(Game.battle && Game.battle.raid) ? L('놓치면 즉시 패배! 꼭 잡으세요') : null, L('웨이브 예고의 적 아이콘을 누르면 다시 볼 수 있어요')].filter(Boolean), 7000);
    }
    function foeCard(title, kinds, foot) {
        if (!kinds.length) return;
        coach(title, [...kinds.map(k => { const d = ENEMIES[k]; return h('div.foe', h('span.gn', d.name), UI.foeTip(k)); }), foot], 8000);
        S.coach.classList.add('foes');
    }

    const TOWER_ROLE = { archer: L('빠른 연사 · 하늘의 적도 공격'), mage: L('마법 피해 · 갑옷을 무시'), cannon: L('광역 폭발 · 땅 위의 적만'), barracks: L('병사가 길을 막아 줘요') };


    // ------------------------------------------------------------ canvas input
    function slotAt(B, px, py) {
        for (const s of B.slots) {
            const k = Game.touch ? 1.35 : 1;   // fingers are bigger than cursors
            const dx = (px - s.x) / (34 * k), dy = (py - (s.y - (s.tower ? 22 : 0))) / ((s.tower ? 44 : 22) * k);
            if (dx * dx + dy * dy <= 1) return s;
        }
        return null;
    }

    function canvasDown(px, py, button) {
        const B = Game.battle;
        if (!B || S.screen !== 'battle' || S.paused) return;
        if (button === 2) { cancelAim(); closePopup(); return; }
        if (S.aim) {
            const a = S.aim;
            const ok = a.kind === 'skill' ? B.castSkill(a.i, px, py, true) : B.castSpell(B.spells[a.i].id, px, py);
            if (ok && a.kind === 'skill' && a.i === 3) Sfx.play('ult');
            cancelAim();
            return;
        }
        if (S.rally) {
            const ok = B.setRally(S.rally, px, py);
            if (!ok) toast(L('사거리 안의 길을 눌러 주세요'));
            cancelAim();
            return;
        }
        const s = slotAt(B, px, py);
        if (s) { click(); openPopup(B, s); return; }
        if (S.popup) { closePopup(); return; }
        B.commandHeroMove(px, py);
    }

    function canvasMove(px, py) {
        const B = Game.battle;
        Render.view.mouse.x = px; Render.view.mouse.y = py;
        if (!B) return;
        Render.view.hoverSlot = S.aim ? null : slotAt(B, px, py);
        document.getElementById('cv').style.cursor = Render.view.hoverSlot || S.aim ? 'pointer' : 'default';
    }


    // ------------------------------------------------------------ tower popup
    function openPopup(B, slot) {
        closePopup();
        Render.view.selSlot = slot;
        const m = document.getElementById('app').classList.contains('mobile') ? 1.35 : 1;
        const cx = clamp(slot.x, 110 * m, W - 110 * m), cy = clamp(slot.y - (slot.tower ? 20 : 0), 90 + 110 * m, H - 120 * m);   // top: leave room for the name labels above the upper buttons (they hit the HUD)
        const box = h('div.tpop', { style: { left: cx + 'px', top: cy + 'px' } }, h('div.ring'));
        const info = h('div.paper.tinfo', { style: { display: 'none' } });
        const btns = [];
        const add = (dx, dy, content, cost, onclick, infoFn, cls = '') => {
            const pEl = h('span');
            const b = h('div.tbtn' + cls, { style: { left: dx + 'px', top: dy + 'px' } }, content, cost != null || cls === '.sell' ? h('span.p', ico('gold', 16), pEl) : null);
            const showInfo = () => {
                if (b.range) Render.view.preview = { x: slot.x, y: slot.y, r: b.range };
                if (!infoFn) return; info.innerHTML = ''; info.append(...infoFn()); info.style.display = 'block'; placeInfo(info, cx, cy);
            };
            b.addEventListener('click', e => {
                e.stopPropagation();
                if (Game.touch && !b.classList.contains('confirm')) {
                    btns.forEach(x => x.b.classList.remove('confirm'));
                    b.classList.add('confirm'); showInfo(); click();
                    return;
                }
                onclick();
            });
            b.addEventListener('mouseenter', () => { if (!Game.touch) showInfo(); });
            b.addEventListener('mouseleave', () => { if (Game.touch) return; info.style.display = 'none'; Render.view.preview = null; });
            box.appendChild(b);
            btns.push({ b, cost, pEl });
            return b;
        };
        const t = slot.tower;
        if (!t) {
            const pos = [[-62, -52], [62, -52], [-62, 52], [62, 52]];
            TOWER_ORDER.forEach((type, i) => {
                const d = TOWERS[type], c = B.towerCost(type, 0);
                const bb = add(pos[i][0], pos[i][1], Art.domCanvas(Art.tower(type, 0, null), 1.15), c,
                    () => { if (B.ban === type) { toast(B.mode === 'tower' ? L('이번 층에서는 {0}을(를) 지을 수 없습니다', d.name) : L('이번 주 공방전에서는 {0}을(를) 지을 수 없습니다', d.name)); return; } if (B.build(slot, type)) { closePopup(); if (!tipSeen('t_' + type)) coach(L('{0} 완성!', d.name), [d.desc, type === 'barracks' ? L('탑을 다시 누르면 업그레이드, 깃발 버튼으로 집결지를 옮겨요') : L('탑을 다시 누르면 업그레이드할 수 있어요')]); } else toast(L('금화가 {0} 부족합니다', c - Math.floor(B.gold))); },
                    () => [h('b', d.name), h('div', d.desc), statLines(B, { type, lv: 0, spec: null })]);
                bb.appendChild(h('span.nm', d.name)); bb.range = B.towerStats({ type, lv: 0, spec: null }).range;
                if (B.ban === type) bb.classList.add('banned');
            });
        } else {
            const d = TOWERS[t.type];
            if (t.spec === null && t.lv < 2) {
                const c = B.towerCost(t.type, t.lv + 1);
                add(0, -78, img('i_upgrade', '.tico'), c,
                    () => { if (!B.upgrade(slot)) toast(B.coop && !B.ownsTower(slot.tower) ? L('친구가 지은 탑이에요') : L('금화가 부족합니다')); else if (B.coop) closePopup(); else openPopup(B, slot); },
                    () => [h('b', L('{0} {1}단계', d.name, t.lv + 2)), statLines(B, { type: t.type, lv: t.lv + 1, spec: null }, t)], '.ok').range = B.towerStats({ type: t.type, lv: t.lv + 1, spec: null }).range;
            } else if (t.spec === null) {
                d.specs.forEach((sp, i) => {
                    const sb2 = add(i ? 64 : -64, -66, Art.domCanvas(Art.tower(t.type, 2, sp.id), 1.15), B.towerCost(t.type, 0, i),
                        () => { if (!B.upgrade(slot, i)) toast(B.coop && !B.ownsTower(slot.tower) ? L('친구가 지은 탑이에요') : L('금화가 부족합니다')); else if (B.coop) closePopup(); else openPopup(B, slot); },
                        () => [h('b', sp.name), h('div', sp.desc), statLines(B, { type: t.type, lv: 2, spec: i }, t)]);
                    sb2.appendChild(h('span.nm', sp.name)); sb2.range = B.towerStats({ type: t.type, lv: 2, spec: i }).range;
                });
            } else {
                add(0, -78, [img('i_max', '.tico'), h('span.nm', L('최고'))], null, () => { }, () => [h('b', d.specs[t.spec].name), h('div', d.specs[t.spec].desc), statLines(B, t)]);
            }
            const sellV = Math.round(t.spent * SELL_RATIO);
            const sb = add(0, 76, [img('i_sell', '.tico'), h('span.nm', L('판매'))], null, () => { confirmSell(B, slot); }, () => [h('b', L('판매')), h('div', L('금화 {0} 돌려받기 (투입액의 60%)', sellV))], '.sell');
            sb.querySelector('.p').lastChild.textContent = '+' + sellV;
            if (t.type === 'barracks') {
                add(62, 50, img('i_rally', '.tico'), null, () => { cancelAim(); S.rally = slot; closePopup(true); showAimCancel(L('병사가 모일 길을 누르세요')); },
                    () => [h('b', L('집결지 변경')), h('div', L('사거리 안의 길을 눌러 병사 위치를 정합니다.'))]);
            }
        }
        root().appendChild(box);
        // translated tower names are longer than the Korean ones: keep each label about one button wide
        box.querySelectorAll('.tbtn .nm').forEach(e => UI.fitText(e, () => 96, 9));
        root().appendChild(info);
        let guide = null;
        if (!t && !tipSeen('build')) guide = [h('b', L('탑 세우기')), h('div', Game.touch ? L('한 번 누르면 설명, 한 번 더 누르면 건설!') : L('올려 보면 설명, 누르면 건설!')),
            h('div.st', TOWER_ORDER.map(type => h('div', h('span.gn', TOWERS[type].name), ' ', TOWER_ROLE[type] || TOWERS[type].desc)))];
        else if (t && t.spec === null && t.lv >= 2 && !tipSeen('spec')) guide = [h('b', L('전문화 고르기')), h('div', L('둘 중 하나로 탑을 강화해요. 고른 뒤엔 바꿀 수 없어요!')),
            h('div.st', TOWERS[t.type].specs.map(sp => h('div', h('span.gn', sp.name), ' ', sp.desc)))];
        if (guide) { info.append(...guide); info.style.display = 'block'; placeInfo(info, cx, cy); }
        S.popup = { box, info, btns, slot };
        refreshPopup(B);
    }

    function placeInfo(info, cx, cy) {
        const k = document.getElementById('app').classList.contains('mobile') ? 1.3 : 1;
        let lx = cx + 120 * k, ly = cy - 70 * k;
        if (lx + 290 * k > W) lx = cx - 120 * k - 290 * k;
        ly = clamp(ly, 60, H - 210 * k);
        info.style.left = lx + 'px'; info.style.top = ly + 'px';
    }

    function statLines(B, t, cur) {
        const st = B.towerStats(t);
        const c = cur && cur !== t ? B.towerStats(cur) : null;
        const d = TOWERS[t.type];
        // "old → new" with the new value highlighted when it changes
        const v = (now, was, f = x => Math.round(x)) => (c && was !== undefined && f(was) !== f(now)) ? [f(was) + ' → ', h('span.up', f(now))] : [String(f(now))];
        const rows = [];
        if (t.type === 'barracks') {
            rows.push([L('병사 '), ...v(st.count, c && c.count), L('명 · 체력 '), ...v(st.hp, c && c.hp), L(' · 공격 '), ...v(st.atk, c && c.atk)]);
            rows.push([L('방어 '), ...v(st.armor, c && c.armor, x => pct(x)), st.regen ? L(' · 재생') : '']);
        } else {
            const dps = st.dmg / st.rate * (st.shots || 1), cdps = c ? c.dmg / c.rate * (c.shots || 1) : undefined;
            rows.push([L('피해 '), ...v(st.dmg, c && c.dmg), st.shots ? ' x' + st.shots : '', st.chain ? L(' (연쇄 ') + st.chain + ')' : '', L(' · 초당 '), ...v(dps, cdps)]);
            rows.push([L('사거리 '), ...v(st.range, c && c.range), st.splash ? L(' · 범위 ') + Math.round(st.splash) : '']);
            rows.push([(d.dmgType === 'magic' ? L('마법 피해') : L('물리 피해')) + (d.air ? L(' · 공중 가능') : L(' · 지상만'))]);
        }
        return h('div.st', rows.map(r => h('div', r)));
    }

    function refreshPopup(B) {
        for (const x of S.popup.btns) {
            if (x.cost === null || x.cost === undefined) continue;
            x.pEl.textContent = x.cost;
            x.b.classList.toggle('no', B.gold < x.cost);
        }
    }

    function confirmSell(B, slot) {
        const v = B.sell(slot);
        if (v) toast(L('판매 +{0} 금화', v));
        closePopup();
    }

    function closePopup(keepSel) {
        Render.view.preview = null;
        if (Game.touch) Render.view.hoverSlot = null;
        if (S.popup) { S.popup.box.remove(); S.popup.info.remove(); S.popup = null; }
        if (!keepSel) Render.view.selSlot = null;
    }


    // ------------------------------------------------------------ pause / banners / result
    function pause(on) {
        const Bp = Game.battle;
        if (on && (!Bp || Bp.state === 'win' || Bp.state === 'lose' || S.result)) return;   // outcome already decided
        S.paused = on;
        Game.paused = on && !(Bp && Bp.coop);   // co-op never stops (the partner keeps playing)
        if (!on) { const d = document.getElementById('pausebox'); if (d) d.remove(); return; }
        const B = Game.battle;
        if (B.coop) {
            const d = modal([h('div.title-t', L('협동 디펜스')), h('div.tip', L('친구와 함께하는 중이라 멈추지 않아요')),
                h('div.row', { style: { flexDirection: 'column', display: 'flex', gap: '10px', width: '260px' } },
                    h('button.btn.gold', { onclick: () => { click(); pause(false); } }, L('계속하기')),
                    h('button.btn.red', { onclick: () => { click(); UI.confirmBox(L('나가면 이번 판은 패배로 끝나요.\n정말 나갈까요?'), () => { pause(false); Coop.leave(); }); } }, L('나가기')))]);
            d.id = 'pausebox';
            return;
        }
        // endless / cup / raid keep what was earned so far; stages and 요일 도전 just leave
        const endNow = B.endless || B.raid;
        const limited = B.mode === 'cup' || B.mode === 'dungeon' || B.mode === 'raid' || B.mode === 'tower';   // entry already used: no reroll
        const sure = (msg, fn) => UI.confirmBox(msg, () => { if (Game.battle !== B) return; pause(false); fn(); });
        const d = modal([h('div.title-t', L('일시정지')),
            h('div.tip', Game.lastBanner || ''),
            B.cond ? h('div.tip', L('3성 조건: {0}', B.cond.name)) : null,
            h('div.row', { style: { flexDirection: 'column', display: 'flex', gap: '10px', width: '260px' } },
                h('button.btn.gold', { onclick: () => { click(); pause(false); } }, L('계속하기')),
                limited ? h('div.tip', { style: { wordBreak: 'keep-all' } }, L('도전 횟수를 쓰는 모드라 다시 시작할 수 없어요')) :
                h('button.btn', { onclick: () => { click(); sure(L('처음부터 다시 시작할까요?\n지금 전투의 진행은 사라집니다.'), () => Game.startBattle(Game.lastOpt)); } }, L('다시 시작')),
                h('button.btn.red', { onclick: () => {
                    click();
                    if (endNow) sure(L('여기서 전투를 끝낼까요?\n지금까지의 기록으로 결과를 받습니다.'), () => { B.state = 'lose'; Game.onBattleEnd(false); });
                    else if (B.mode === 'tower') sure(L('원정을 포기할까요?\n이번 층은 패배로 끝나고 원정이 끝나요.'), () => { B.state = 'lose'; Game.onBattleEnd(false); });
                    else if (B.mode === 'dungeon') sure(L('전투를 포기할까요?\n오늘 도전 횟수 1회가 사용됩니다.'), () => { B.state = 'lose'; Game.onBattleEnd(false); });
                    else sure(L('전투를 포기하고 나갈까요?\n이번 전투의 보상은 받을 수 없습니다.'), () => showHub('map'));
                } }, endNow ? L('여기서 끝내기') : L('포기하고 나가기')))]);
        d.id = 'pausebox';
    }

    // quick = plain, short wave call-out (the gold ribbon is kept for big moments)
    function banner(text, gold, sub, quick) {
        root().querySelectorAll('.banner').forEach(x => x.remove());
        const b = h('div.banner' + (quick ? '.wave' : gold ? '.gold' : ''), h('span', text), sub ? h('div.bsub', sub) : null);
        if (sub) b.style.animationDuration = '3.4s';   // longer read for the 3-star condition line
        root().appendChild(b);
        setTimeout(() => b.remove(), sub ? 3500 : quick ? 1250 : 2300);
    }


    // defeat: offer a continue before the result screen
    function showRevive(B, onGiveUp) {
        const p = Save.p; Rewards.ensure(p);
        const d = modal([
            h('div.ribbon.lose', h('span', L('성문이 뚫렸다!'))),
            h('div', { style: { marginTop: '22px', fontSize: '18px' } }, L('목숨 5개로 이어서 싸울까요?')),
            h('div.tip', B.mode === 'tower' ? L('원정마다 한 번만 이어할 수 있어요') : L('이어하면 이번 판은 별 1개로 기록됩니다')),
            h('div.row',
                h('button.btn.gold', { onclick: async () => { click(); if (await Ads.show('revive')) { Rewards.track('ad'); d.remove(); Game.revive(); } } }, img('i_ad', '.icon'), p.shop.premium ? L('이어하기 (가호)') : L('광고 보고 이어하기')),
                h('button.btn' + (p.gems < REVIVE_GEMS ? '.off' : ''), { onclick: () => { if (p.gems < REVIVE_GEMS) { toast(L('보석이 부족합니다')); return; } click(); p.gems -= REVIVE_GEMS; Save.save(); d.remove(); Game.revive(); } }, img('i_gem', '.icon'), L('{0}개로 이어하기', REVIVE_GEMS))),
            h('button.btn.ghost', { onclick: () => { click(); d.remove(); onGiveUp(); } }, L('포기하기')),
        ]);
    }

    Object.assign(UI, { toggleAuto, foeSpawned, foeCard, showBattleHud, updateHud, cycleSpeed, speed3Offer, pressSkill, pressSpell, cancelAim, showAimCancel, slotAt, canvasDown, canvasMove, openPopup, placeInfo, statLines, refreshPopup, confirmSell, closePopup, pause, banner, showRevive });
})();
