'use strict';
// Boot, main loop, input wiring, battle lifecycle and reward granting.

const Game = {
    battle: null, speed: 1, paused: false, backdrop: { map: 'title_bg', theme: 'grass' }, ended: false,
    touch: window.matchMedia && matchMedia('(pointer: coarse)').matches,

    buzz(pattern) { try { if (!Save.p.set.noVibrate && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(pattern); } catch (e) { } },
    fullscreen() {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) return;
        Promise.resolve(req.call(el)).then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => { });
    },

    startBattle(opt) {
        const p = Save.p;
        UI.S.result = null;
        const old = document.getElementById('resultbox'); if (old) old.remove();
        this.ended = false;
        this.paused = false;
        this.speed = p.set.speed || 1;
        if (this.speed === 3 && !Rewards.speed3Unlocked(p)) this.speed = 2;
        const b = computeBonuses(p);
        Rewards.ensure(p);
        if (p.shop.premium) b.bountyPct += 0;   // premium bonus applies to stage silver (onBattleEnd)
        const sg = skinBonus(p, p.hero).gold; if (sg) b.bountyPct += sg;   // skin option: 처치 금화
        const cfg = {
            skin: p.shop.skin[p.hero],
            stageIdx: opt.stageIdx, endless: opt.endless, hard: !!opt.hard,
            heroCls: p.hero, heroStats: heroStats(p, p.hero), party: Object.keys(HEROES).filter(c => c !== p.hero).map(c => ({ cls: c, skin: p.shop && p.shop.skin[c], ...heroStats(p, c) })), bonuses: b, dmgMul: codexDmgMul(p),
            autoHero: () => Save.p.set.autoHero, autoWave: () => Save.p.set.autoWave, shakeOn: () => !Save.p.set.noShake, cutinOn: () => !Save.p.set.noCutin,
            seed: (Date.now() & 0xffff),
            on: (ev, data) => this.onEvent(ev, data),
        };
        let banner, music = 'battle';
        if (opt.cup) {
            // 주간 공방전: endless-style waves seeded by the week, fixed map and restriction, 30 waves
            const c = Meta.cupWeek();
            Object.assign(cfg, { endless: true, mode: 'cup', map: c.map, theme: c.theme, rule: c.rule || null, ban: c.ban || null, maxWaves: CUP.maxWaves, waveSeed: c.week * 131 });
            banner = L('주간 공방전 · {0}', c.name); music = 'endless';
        } else if (opt.endless) { cfg.rule = Meta.endlessRule().id; banner = L('무한의 성벽'); music = 'endless'; }
        else if (opt.dungeon) {
            // 요일 도전: a short stage built from DUNGEON data, strength of the tier's reference stage
            const K = DUNGEON.kinds[opt.dungeon], T = DUNGEON.tiers[opt.tier];
            Object.assign(cfg, { mode: 'dungeon', stageIdx: T.eq, map: K.map, theme: K.theme, hpMulExtra: 0.9,
                stageDef: { name: K.name + T.name, seedName: srcOf(K.name) + srcOf(T.name), map: K.map, waves: K.waves, pool: K.pool, ch: STAGES[T.eq].ch } });
            banner = `${K.name} · ${T.name}`;
        } else if (opt.raid) {
            // 보스 토벌전, or an online raid run (opt.raidOn: 파티 레이드 / 월드 보스, boss and strength from the server)
            const on = opt.raidOn, kind = on ? on.kind : Meta.raidBoss(p), si = on ? on.si : Meta.raidStage(p, kind);
            Object.assign(cfg, { mode: 'raid', stageIdx: si, raidKind: kind, map: RAID.map, theme: CHAPTERS[STAGES[si].ch].theme,
                escortPool: STAGES[si].pool, stageDef: { name: L('토벌전'), map: RAID.map, waves: 1, pool: STAGES[si].pool, ch: STAGES[si].ch } });
            banner = on ? (on.mode === 'party' ? L('파티 레이드 · {0}', ENEMIES[kind].name) : L('월드 보스 · {0}', ENEMIES[kind].name)) : L('보스 토벌전 · {0}', ENEMIES[kind].name); music = 'boss';
        } else if (opt.coop && opt.coop.raid) {
            // 파티 레이드: 1~4 players, one boss with real health on the 보스 토벌전 map (js/online/coop.js keeps every device in step)
            const o = opt.coop, R = RAID_ON.party, si = RAID_ON.diffs[o.diff].eq, kind = o.kind, inf = o.infos, n = inf.length, [a] = inf;
            Object.assign(cfg, { mode: 'raid', coop: true, stageIdx: si, raidKind: kind, map: RAID.map, theme: CHAPTERS[STAGES[si].ch].theme, seed: o.seed,
                escortPool: STAGES[si].pool, stageDef: { name: L('파티 레이드'), map: RAID.map, waves: 1, pool: STAGES[si].pool, ch: STAGES[si].ch },
                raidLive: { hpMul: Meta.partyBossMul(kind, o.diff, n), time: Meta.partyTime(n), enrage: R.enrage, enrageSpd: R.enrageSpd, enrageCd: R.enrageCd },
                startGoldMul: R.startGold[n - 1], goldShare: R.goldShare,
                heroCls: a.cls, heroStats: a.stats, skin: a.skin, bonuses: a.bonuses, dmgMul: inf.reduce((t, x) => t + x.dmgMul, 0) / n, party: [],
                mates: inf.slice(1).map(x => ({ cls: x.cls, stats: x.stats, skin: x.skin, bonuses: x.bonuses })), autos: inf.map(x => x.auto), names: inf.map(x => x.name),
                autoWave: () => false, cutinOn: () => false });
            banner = L('파티 레이드 · {0}', ENEMIES[kind].name); music = 'boss';
        } else if (opt.coop) {
            // 협동 디펜스: both devices build the very same battle from the room seed and both players' info (host = player 0)
            const o = opt.coop, C = RAID_ON.coop, D = RAID_ON.diffs[o.diff], si = D.eq, [a, b] = o.infos;
            const bosses = RAID.order.filter(k => RAID.bossStage[k] <= si), boss = bosses[bosses.length - 1], mid = bosses[(o.week + o.diff) % Math.max(1, bosses.length - 1)];
            const map = C.maps[(o.week + o.diff) % C.maps.length];
            Object.assign(cfg, { mode: 'coop', coop: true, coopDiff: o.diff, stageIdx: si, map, theme: CHAPTERS[STAGES[si].ch].theme, hpMulExtra: C.hpMul, seed: o.seed,
                stageDef: { name: L('협동 디펜스'), seedName: 'coop' + o.diff, map, waves: C.waves, pool: STAGES[si].pool, ch: STAGES[si].ch, boss, midBoss: mid !== boss ? mid : null },
                heroCls: a.cls, heroStats: a.stats, skin: a.skin, bonuses: a.bonuses, dmgMul: (a.dmgMul + b.dmgMul) / 2, party: [],
                mate: { cls: b.cls, stats: b.stats, skin: b.skin, bonuses: b.bonuses }, autos: [a.auto, b.auto], names: [a.name, b.name],
                autoWave: () => false, cutinOn: () => false });
            banner = L('협동 디펜스 · {0}', D.name);
        } else if (opt.tower) {
            // 심연의 탑: the run's current floor (js/tower.js builds the stage, its mutators and the run's blessings)
            banner = Tower.setup(p, cfg); music = Tower.state(p).run.floor % 5 === 0 ? 'boss' : 'endless';
        } else banner = `${opt.hard ? L('[영웅] ') : ''}${stageLabel(opt.stageIdx)} ${STAGES[opt.stageIdx].name}`;
        this.lastOpt = opt; this.lastBanner = banner;
        // limited-entry modes: the entry counts from the start, so restarting or killing the app can't reroll a run
        if (opt.cup || opt.dungeon || (opt.raid && !opt.raidOn)) { p.runLock = { cup: !!opt.cup, dungeon: opt.dungeon || null, tier: opt.tier, raid: !!opt.raid }; Save.save(); }
        this.leaks = {};   // enemy kind -> lives lost to it (defeat screen)
        this.battle = new Battle(cfg);
        if (opt.coop) Coop.attach(this.battle);
        UI.showBattleHud(this.battle);
        if (opt.tower && UI.towerHud) UI.towerHud(this.battle);
        Music.play(music);
        UI.banner(banner, true, this.battle.cond ? L('3성 조건: {0}', this.battle.cond.name) : null);
    },

    onEvent(ev, d) {
        const B = this.battle;
        switch (ev) {
            case 'wave': Sfx.play('wave'); if (d > 0) UI.banner(B.endless ? L('웨이브 {0}', d + 1) : (d + 1 === B.totalWaves ? L('마지막 웨이브!') : L('웨이브 {0}', d + 1)), true, null, true); break;
            case 'boss': if (!(this.bossVfxAt > performance.now() - 20000)) { this.bossVfxAt = performance.now(); UI.vfx('vfx/boss_warn.mp4', null, { z: 40, opacity: 0.85 }); }   // endless/cup bosses come often: the clip at most every 20s
                Sfx.play('roar'); if (!B.endless) Music.play('boss'); UI.banner(L('보스 출현 · {0}', d.def.name)); this.buzz([80, 40, 80]); break;
            case 'bossPhase': Sfx.play('roar'); UI.banner(L('{0}이(가) 분노했다!', d.def.name)); break;
            case 'bossCast': Sfx.play('warn'); break;
            case 'shoot': Sfx.play(d); break;
            case 'boom': Sfx.play('boom'); break;
            case 'hit': Sfx.play(d === 'hero' ? 'heavy' : 'hit'); break;
            case 'kill': Sfx.play('die'); Rewards.track('kills'); Meta.addKill(Save.p, d.kind); break;
            case 'weather': Sfx.play('warn'); this.buzz([40, 30, 40]); break;
            case 'condBroken': Sfx.play('warn'); break;
            case 'combo': Sfx.play('coin'); this.buzz(25); break;
            case 'leak': Sfx.play('leak'); this.buzz(35); this.leaks[d.kind] = (this.leaks[d.kind] || 0) + 1; break;
            case 'spawn': UI.foeSpawned(d.kind); break;
            case 'build': Sfx.play('build'); if (!B.coop || B.actor === Coop.me) Rewards.track('towers'); break;
            case 'upgrade': Sfx.play('upgrade'); break;
            case 'sell': Sfx.play('sell'); break;
            case 'skill': Sfx.play(d.ult ? 'ult' : 'skill'); if (!B.coop || B.actor === Coop.me) Rewards.track('skills'); break;
            case 'cutin': Sfx.play('cutin'); this.buzz([30, 40, 60]); break;
            case 'spell': Sfx.play('skill'); break;
            case 'earlyBonus': for (const pt of B.spawnPoints()) B.text(pt.x + 40, pt.y - 40, L('+{0} 금화', d), '#ffe08a', 20, true); Sfx.play('coin'); break;
            case 'heroDown': if (B.coop && d && d.owner !== Coop.me) break; this.buzz(60); toast(L('영웅이 쓰러졌습니다 · {0}초 뒤 부활', HERO_RESPAWN)); break;
            case 'drop':
                Sfx.play('drop', d);
                if (d >= 3) { Music.duck(1800); UI.banner(L('{0} 장비 획득!', RARITY[d].name), true); this.buzz([40, 30, 120]); }
                break;
            case 'end':
                if (this.ended) break;
                this.ended = true;
                {
                    const ended = B;
                    // first defeat: offer a continue (ad or gems) before the result screen; never in ranked modes (fair records),
                    // on boss stages or after a boss/elite got through (the continue would skip the must-kill enemy)
                    if (!d && !B.revived && !B.hasBoss && !B.mustKillLost && B.mode !== 'cup' && B.mode !== 'endless' && B.mode !== 'raid' && B.mode !== 'coop' && (B.mode !== 'tower' || Tower.canRevive(Save.p))) setTimeout(() => { if (this.battle === ended) UI.showRevive(B, () => this.onBattleEnd(false)); }, 900);
                    else setTimeout(() => { if (this.battle === ended) this.onBattleEnd(d); }, 1300);
                }
                break;
        }
    },

    revive() {
        const B = this.battle;
        if (!B) return;
        B.revive(5);
        if (B.mode === 'tower') Tower.onRevive(Save.p);   // one continue per 심연의 탑 run
        this.ended = false;
        Music.play(B.endless ? 'endless' : (B.bossRef ? 'boss' : 'battle'));
        UI.banner(L('다시 일어선다!'), true);
    },

    onBattleEnd(win) {
        const B = this.battle, p = Save.p;
        if (!B || UI.S.result) return;
        delete p.runLock;   // the finish functions below count the entry
        this.lastHero = B.hero.cls;
        if (win && !B.endless && B.mode !== 'dungeon' && B.mode !== 'raid' && B.mode !== 'cup' && B.mode !== 'tower') Rewards.track('clear');   // 'stage wins' missions count campaign stages only
        win ? Sfx.play('win') : Sfx.play('lose');
        const items = B.loot.map(l => makeItem(l.slot, l.r, l.ilvl));
        metaEnsure(p);
        const R = { win, mode: B.mode, endless: B.endless, hard: B.hard, stageIdx: B.stageIdx, kills: B.kills, lost: B.maxLives - B.lives, items, silver: 0, gems: 0, xp: 0, got: [],
            leaks: Object.entries(this.leaks || {}).sort((a, b) => b[1] - a[1]) };
        if (B.mode === 'cup') {
            const wave = Math.max(0, B.state === 'win' ? B.waveIdx + 1 : B.waveIdx);
            const r = Meta.finishCup(p, { wave, kills: B.kills, livesLeft: B.lives, cleared: B.state === 'win' });
            R.cup = { ...r, wave, ruleName: Meta.cupWeek().name };
            R.endless = true; R.wave = wave;
            R.silver = wave * CUP.silverPerWave;
            R.xp = Math.round(wave * 6 * (1 + wave / 25));
            if (r.best) Online.submit('cup', r.weekBest).then(x => { if (x && UI.S.result === R) UI.cupRankLine(x); });
        } else if (B.endless) {
            const wave = Math.max(0, B.waveIdx);   // waves fully survived
            R.wave = wave;
            R.newBest = wave > p.endlessBest;
            if (R.newBest) p.endlessBest = wave;
            const marks = Math.floor(p.endlessBest / 10);
            if (marks > p.endlessGemMark) { R.gems = (marks - p.endlessGemMark) * ENDLESS.gemsPer10; p.endlessGemMark = marks; }
            R.weekly = Rewards.claimEndlessWeekly(p, wave);
            R.league = Meta.leagueRecord(p, wave);
            if (R.newBest || wave > 0) Online.submit('wall', p.league ? p.league.best : wave);
            R.silver = wave * ENDLESS.silverPerWave;
            R.xp = Math.round(wave * 6 * (1 + wave / 25));
            if (wave >= 5) Meta.track('w_endless');   // entering and quitting at once is not a run
        } else if (B.mode === 'dungeon') {
            const o = this.lastOpt;
            R.dungeon = { kind: o.dungeon, tier: o.tier };
            R.stars = win ? B.stars() : 0;
            R.got = Meta.finishDungeon(p, o.dungeon, o.tier, R.stars);
            R.xp = win ? Math.round(stageRewards(B.stageIdx, 1, false).xp * 0.6) : 0;
        } else if (B.mode === 'raid' && this.lastOpt.raidOn) {
            // online raid run: points to the server (the try was counted when it began)
            const on = this.lastOpt.raidOn, dmg = Math.round(B.raidDamage), pts = RaidOn.points(B.raidKind, B.stageIdx, dmg);
            R.win = true; R.raidOn = { mode: on.mode, id: on.id, kind: B.raidKind, dmg, pts, res: null };
            R.xp = Math.round(stageRewards(B.stageIdx, 1, false).xp * 0.8);
            (on.mode === 'party' ? RaidOn.partySubmit(on.id, pts) : RaidOn.worldSubmit(pts)).then(x => { R.raidOn.res = x; if (UI.S.result === R && UI.raidResultLine) UI.raidResultLine(R); });
        } else if (B.mode === 'raid' && this.lastOpt.coop) {
            // 파티 레이드: the boss died (win) or the time / lives ran out; every player reports, the server checks the host's word
            const o = this.lastOpt.coop, boss = B.bossRef, left = boss ? Math.max(0, boss.hp) / boss.maxHp : 1;
            R.win = !!win; R.praid = { diff: o.diff, room: o.room, kind: B.raidKind, left, time: Math.round(B.t), res: null };
            const rw = stageRewards(B.stageIdx, win ? 3 : 1, false);
            R.silver = Math.round(rw.silver * (win ? 1.5 : 0.5 * (1 - left))); R.xp = Math.round(rw.xp * (win ? 1.2 : 0.5 * (1 - left)));
            if (Coop.lostLink) R.praid.res = { error: 'link' };   // this device dropped out: no report, the party's win still counts for it
            else RaidOn.praidFinish(o.room, win).then(x => { R.praid.res = x; if (UI.S.result === R && UI.raidResultLine) UI.raidResultLine(R); });
            Coop.finished();
        } else if (B.mode === 'coop') {
            const o = this.lastOpt.coop, wave = win ? B.totalWaves : Math.max(0, B.waveIdx);
            R.coop = { diff: o.diff, room: o.room, wave, res: null };
            const rw = stageRewards(B.stageIdx, win ? 3 : 1, false);
            R.silver = Math.round(rw.silver * (win ? 1.5 : 0.4 * wave / B.totalWaves)); R.xp = Math.round(rw.xp * (win ? 1.2 : 0.5 * wave / B.totalWaves));
            if (Coop.lostLink) R.coop.res = { error: 'link' };
            else RaidOn.coopFinish(o.room, win, wave).then(x => { R.coop.res = x; if (UI.S.result === R && UI.raidResultLine) UI.raidResultLine(R); });
            Coop.finished();
        } else if (B.mode === 'raid') {
            const kind = B.raidKind, dmg = Math.round(B.raidDamage);
            const r = Meta.finishRaid(p, kind, dmg);
            R.win = true; R.raid = { kind, dmg, tier: r.tier, best: p.raid.best };
            R.got = r.got;
            R.xp = Math.round(stageRewards(B.stageIdx, 1, false).xp * 0.8);
            Online.submit('raid', p.raid.best);
        } else if (B.mode === 'tower') {
            R.tower = Tower.finish(p, win, B);
            R.got = R.tower ? R.tower.got : [];
            const rw = stageRewards(B.stageIdx, 1, false);
            R.silver = win ? Math.round(rw.silver * 0.5) : 0; R.xp = win ? Math.round(rw.xp * 0.6) : 0;
        } else if (B.hard) {
            // 영웅 난이도: separate stars, doubled silver, better drops (battle/enemies.js rollDrop), gems per new star
            const idx = B.stageIdx, prev = p.hstars[idx] || 0;
            if (B.cond) R.cond = { name: B.cond.name, ok: !B.condBroken && !(B.cond.id === 'noLeak' && B.lives < B.maxLives) };
            if (win) {
                R.stars = B.stars();
                const rw = stageRewards(idx, R.stars, prev === 0);
                R.silver = Math.round(rw.silver * HARD.silverMul * (p.shop && p.shop.premium ? 1.1 : 1)); R.xp = Math.round(rw.xp * 1.5);
                if (R.stars > prev) { R.gems = (R.stars - prev) * HARD.gemsPerStar; p.hstars[idx] = R.stars; }
            } else {
                const frac = Math.max(0, B.waveIdx) / B.totalWaves;
                const rw = stageRewards(idx, 1, false);
                R.silver = Math.round(rw.silver * HARD.silverMul * 0.4 * frac); R.xp = Math.round(rw.xp * 0.5 * frac);
            }
        } else {
            const idx = B.stageIdx;
            const prev = p.stars[idx] || 0;
            const first = prev === 0;
            if (win) {
                R.stars = B.stars();
                const rw = stageRewards(idx, R.stars, first && win);
                R.silver = Math.round(rw.silver * (p.shop && p.shop.premium ? 1.1 : 1)); R.xp = rw.xp;
                if (R.stars > prev) { R.gems = (R.stars - prev) * 15; p.stars[idx] = R.stars; }
                R.firstThree = R.stars === 3 && prev < 3;
                if (first && STAGES[idx].boss) R.chapterClear = STAGES[idx].ch;
            } else {
                const frac = Math.max(0, B.waveIdx) / B.totalWaves;
                const rw = stageRewards(idx, 1, false);
                R.silver = Math.round(rw.silver * 0.4 * frac); R.xp = Math.round(rw.xp * 0.5 * frac);
            }
        }
        p.silver += R.silver; p.gems += R.gems;
        const gx = grantBattleXp(p, B.hero.cls, R.xp);
        R.levelUp = gx.ups > 0; R.xpShare = gx.share; R.heroLv = p.heroes[B.hero.cls].lv;
        Save.save();
        UI.S.result = R;
        UI.showResult(R);
    },
};

(function boot() {
    const app = document.getElementById('app');
    // static HTML text (index.html is Korean) follows the language too
    document.documentElement.lang = LANG;
    document.title = L('냥이 성문 수비대');
    const rot = document.querySelector('#rotate > div:last-child'); if (rot) rot.textContent = L('가로로 돌려서 플레이해 주세요');
    const cv = document.getElementById('cv');
    Render.init(cv);
    let scale = 1;
    function fit() {
        scale = Math.min(window.innerWidth / W, window.innerHeight / H);
        const ox = (window.innerWidth - W * scale) / 2, oy = (window.innerHeight - H * scale) / 2;
        app.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
        const mobile = Game.touch || scale < 0.8;
        app.classList.toggle('mobile', mobile);
        Render.view.textMul = mobile ? 1.3 : 1;
    }
    window.addEventListener('resize', fit);
    fit();

    const toLocal = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; };
    document.addEventListener('pointerdown', () => { Sfx.init(); Music.start(); }, { capture: true });
    cv.addEventListener('pointerdown', e => { const q = toLocal(e); UI.canvasMove(q.x, q.y); UI.canvasDown(q.x, q.y, e.button); });
    cv.addEventListener('pointermove', e => { const q = toLocal(e); UI.canvasMove(q.x, q.y); });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    document.getElementById('ui').addEventListener('contextmenu', e => { e.preventDefault(); UI.cancelAim(); });

    window.addEventListener('keydown', e => {
        const B = Game.battle;
        if (UI.S.screen !== 'battle' || !B) return;
        if (e.key === 'Escape') {
            if (UI.S.aim || UI.S.rally) UI.cancelAim();
            else if (UI.S.popup) UI.closePopup();
            else if (!UI.S.result) UI.pause(!UI.S.paused);
            return;
        }
        if (UI.S.paused || UI.S.result) return;
        if (e.key >= '1' && e.key <= '4') UI.pressSkill(+e.key - 1);
        else if (e.key === 'q' || e.key === 'Q' || e.key === 'ㅂ') UI.pressSpell(0);
        else if (e.key === 'w' || e.key === 'W' || e.key === 'ㅈ') UI.pressSpell(1);
        else if ((e.key === 'e' || e.key === 'E' || e.key === 'ㄷ') && Game.battle && Game.battle.spells[2]) UI.pressSpell(2);
        else if (e.key === ' ') { e.preventDefault(); if ((B.state === 'prep' || B.countdown > 0)) { B.callWave(); } }
        else if (e.key === 'Tab') { e.preventDefault(); UI.toggleAuto('autoHero'); }
        else if (e.key === 'f' || e.key === 'F' || e.key === 'ㄹ') UI.cycleSpeed();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && Game.battle && !Game.battle.coop && UI.S.screen === 'battle' && !UI.S.paused && !UI.S.result && Game.battle.state !== 'win' && Game.battle.state !== 'lose') UI.pause(true);
        if (document.hidden) Save.save();
        else Game.onResume();
        if (!Save.p.set.musicOff) Music.setEnabled(!document.hidden);
    });
    window.addEventListener('beforeunload', () => Save.save());
    // back from the background without a restart (Android keeps the WebView alive): idle supply, server clock, inbox, purchases
    Game.onResume = () => {
        if (Online.on) { Online.syncClock().catch(() => {}); Online.refreshMail().catch(() => {}); }
        Rewards.restorePurchases().catch(() => {});
        if (UI.resumeSupply) UI.resumeSupply();
    };

    Save.load();
    Meta.settleRunLock(Save.p);
    Tower.settle(Save.p);   // a 심연의 탑 floor left by closing the app counts as lost
    Sfx.muted = Save.p.set.muted;
    Music.setEnabled(!Save.p.set.musicOff);
    const fontReady = document.fonts ? Promise.all([document.fonts.load('16px Jua'), document.fonts.load('16px BlackHan')]).catch(() => { }) : Promise.resolve();
    // until the art is in, drawBackdrop paints placeholder ground + path that reads as a game map;
    // the canvas stays empty (dark #app background) until the title screen is ready
    let booted = false;
    Promise.all([fontReady, Art.load()]).finally(() => { booted = true; UI.showTitle(); });
    // the big reveal clips go into memory once the title is up, so they start on the first frame later
    setTimeout(() => UI.vfxWarm(['vfx/summon_epic.mp4', 'vfx/summon_legend.mp4', 'vfx/summon_mythic.mp4', 'vfx/enhance.mp4', 'vfx/victory.mp4', 'vfx/boss_warn.mp4']), 2500);
    // online (optional): guest sign-in, server clock, cloud save, reward inbox; store purchases owned but not yet granted
    Online.init().then(() => Rewards.restorePurchases()).catch(() => {});
    Rewards.loadPrices();

    let last = performance.now();
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const B = Game.battle;
        if (B && UI.S.screen === 'battle') {
            if (B.coop) Coop.frame(dt);              // 협동 디펜스: fixed ticks shared with the partner, never paused
            else if (!Game.paused) {
                const steps = Game.speed;
                for (let i = 0; i < steps; i++) B.update(dt);
            }
            Render.draw(B, dt);
            UI.updateHud(B, dt);
        } else if (booted) {
            Render.drawBackdrop(Game.backdrop.map, Game.backdrop.theme, Game.backdrop.dim);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // periodic save for offline supply timing
    setInterval(() => Save.save(), 30000);
    // installable / offline on phones (service workers need http(s))
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/NyangiApp/.test(navigator.userAgent)) navigator.serviceWorker.register('sw.js').catch(() => { });
    // Android back button (MainActivity.back): close the top popup, pause a battle, leave a hub sub screen; false = let the app go to the background
    window.nyangiBack = () => {
        const dims = document.querySelectorAll('.dim'), d = dims[dims.length - 1];
        if (d) {
            const b = [...d.querySelectorAll('button')].find(x => /^(닫기|취소|나중에|돌아가기)$/.test(srcOf(x.textContent.trim())));
            if (b) b.click(); else d.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // modal({ dismiss }) closes on a backdrop click; others stay (a wrong tap must not leave a room)
            return true;
        }
        if (UI.S.screen === 'battle') { if (Game.battle && !Game.paused && UI.pause) UI.pause(true); return true; }
        if (UI.S.screen === 'hub' && UI.S.tab && UI.S.tab !== 'map') { UI.showHub('map'); return true; }
        return false;
    };
})();
