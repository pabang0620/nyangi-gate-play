'use strict';
// 협동 디펜스 networking (docs/PLAN_ONLINE_RAID.md 4). Supabase Realtime broadcast on a channel named after the room key
// (only the two players get the key from coop_create / coop_join).
// Lockstep with the host as the clock: both devices run the same battle (same seed, fixed 1/30 s ticks). Every command,
// the host's own and the guest's, is given a tick by the host and sent in a frame every FRAME ticks with a checksum.
// The guest runs only the ticks it has frames for and asks for the host's state when its checksum differs.
// Messages: hi {me, info} · go {infos, seed} · c {c} (guest command) · f {to, c, s, sp} · rs · snap {at, snap} · hb · bye
const Coop = {
    TICK: 1 / 30, FRAME: 8, LOST_MS: 8000, HOST_LOST_MS: 20000,
    room: null, ch: null, me: 0, infos: [null, null], B: null, onLobby: null,
    tick: 0, acc: 0, pend: [], sent: [], sums: {}, availTo: 0, speed: 1, lastHeard: 0, partnerGone: false, ended: false, wantSnap: false,
    get active() { return !!(this.B && Game.battle === this.B); },

    // what the partner needs to build my side of the battle
    myInfo() {
        const p = Save.p; Rewards.ensure(p); metaEnsure(p);
        const b = computeBonuses(p), sg = skinBonus(p, p.hero).gold;
        if (sg) b.bountyPct += sg;
        return { name: Online.profile ? Online.profile.name : '', cls: p.hero, stats: heroStats(p, p.hero), skin: (p.shop.skin && p.shop.skin[p.hero]) || null,
            bonuses: b, dmgMul: codexDmgMul(p), auto: !!p.set.autoHero };
    },
    // join the room's channel; onLobby(state) is called whenever the partner shows up or leaves
    open(room, onLobby) {
        this.close();
        this.room = room; this.me = room.me; this.onLobby = onLobby; this.infos = [null, null]; this.infos[this.me] = this.myInfo();
        this.ended = false; this.partnerGone = false; this.lastHeard = Date.now();
        const ch = this.ch = Online.sb.channel('bonghwa-coop-' + room.key, { config: { broadcast: { self: false, ack: false } } });
        for (const ev of ['hi', 'go', 'c', 'f', 'rs', 'snap', 'hb', 'bye']) ch.on('broadcast', { event: ev }, msg => this.onMsg(ev, msg.payload || {}));
        ch.subscribe(st => { if (st === 'SUBSCRIBED') this.hello(); });
        clearInterval(this.hiTimer);
        this.hiTimer = setInterval(() => { if (!this.B) this.hello(); }, 2000);   // until the partner answers (a message can be missed)
    },
    hello() { this.send('hi', { me: this.me, info: this.infos[this.me], room: this.room.id }); },
    send(ev, payload) { if (this.ch) this.ch.send({ type: 'broadcast', event: ev, payload }).catch(() => { }); },
    close(delay) {
        const ch = this.ch;
        clearInterval(this.hiTimer); this.hiTimer = null;
        this.ch = null; this.B = null; this.pend = []; this.sent = []; this.sums = {};
        if (ch) setTimeout(() => { try { Online.sb.removeChannel(ch); } catch (e) { } }, delay || 0);
    },
    partnerName() { const i = this.infos[1 - this.me]; return (i && i.name) || L('친구'); },

    onMsg(ev, m) {
        this.lastHeard = Date.now();
        if (this.me === 0 && this.B && ev !== 'bye' && ev !== 'hi') {   // 'hi' still comes from a guest that has not started
            this.guestSeen = true;
            // the guest came back after a drop (app in the background): its hero leaves AUTO-by-force
            if (this.partnerGone && !this.partnerBye && !this.ended) { this.partnerGone = false; this.pend.push([this.tick + 1, 1, ['auto', !!(this.infos[1] && this.infos[1].auto)]]); }
        }
        if (ev === 'hi') {
            if (m.me === this.me || m.room !== this.room.id) return;
            const fresh = !this.infos[1 - this.me];
            this.infos[1 - this.me] = m.info;
            if (fresh) this.hello();
            if (this.onLobby) this.onLobby('partner');
        } else if (ev === 'bye') {
            this.partnerBye = true;
            if (!this.B) { this.infos[1 - this.me] = null; if (this.onLobby) this.onLobby('left'); return; }
            this.partnerLeft();
        } else if (ev === 'go' && this.me === 1 && !this.B) {
            this.infos = m.infos;
            this.begin(m.seed);
        } else if (ev === 'c' && this.me === 0 && this.B) {
            this.pend.push([this.tick + 1, 1, m.c]);
        } else if (ev === 'hb') {
            // heartbeat only
        } else if (ev === 'rs' && this.me === 0) {
            this.wantSnap = true;
        } else if (ev === 'f' && this.me === 1 && this.B) {
            for (const x of m.c) if (x[0] > this.tick) this.pend.push(x);
            this.sums[m.to] = m.s;
            this.availTo = Math.max(this.availTo, m.to);
            this.speed = m.sp || 1;
            if (m.end) this.hostEnd = m.end;          // 'win' | 'lose': the host's outcome is the one both screens show
        } else if (ev === 'snap' && this.me === 1 && this.B) {
            const B = this.B;
            B.swapActor(); B.applySnapshot(m.snap); B.swapActor();
            this.tick = m.at; this.pend = this.pend.filter(x => x[0] > m.at);
            for (const k in this.sums) if (+k <= m.at) delete this.sums[k];
            this.availTo = Math.max(this.availTo, m.at); this.resyncing = false;
        }
    },

    // host: both are in, start. Guest: starts on 'go'
    async hostStart() {
        if (this.me !== 0 || !this.infos[1]) return false;
        const r = await RaidOn.coopSet(this.room.id, 'start');
        if (r.error) { toast(RaidOn.errText(r.error)); return false; }
        this.send('go', { infos: this.infos, seed: this.room.seed });
        this.begin(this.room.seed);
        return true;
    },
    begin(seed) {
        clearInterval(this.hiTimer); this.hiTimer = null;
        this.tick = 0; this.acc = 0; this.pend = []; this.sent = []; this.sums = {}; this.availTo = 0; this.speed = 1;
        this.lastHeard = Date.now(); this.lastBeat = 0; this.hostEnd = null; this.resyncing = false; this.resyncAt = 0;
        this.partnerGone = false; this.partnerBye = false; this.guestSeen = false; this.lastGo = Date.now(); this.lastFrameAt = 0;
        if (this.onLobby) this.onLobby('start');
        Game.startBattle({ coop: { room: this.room.id, diff: this.room.diff, seed, infos: this.infos, me: this.me, week: weekIndex() } });
    },
    attach(B) {
        this.B = B;
        if (this.me === 1) B.swapActor();      // the guest's resting view: its own hero, gold and spells in the usual places
        this.installUI(B);
    },
    // UI calls (B.build, B.castSkill, ...) become commands; inside a tick the real methods run
    installUI(B) {
        const P = Battle.prototype, self = this;
        const wrap = (name, check, cmd) => {
            B[name] = function (...a) {
                if (B.inSim) return P[name].apply(B, a);
                if (B.state === 'win' || B.state === 'lose') return false;
                const r = check(...a);
                if (r === false || r === 0 || r === null) return r;
                self.cmd(cmd(...a));
                return r;
            };
        };
        const upCost = (t, spec) => spec !== undefined && spec !== null ? (t.lv === 2 && t.spec === null ? B.towerCost(t.type, 0, spec) : null) : (t.lv < 2 ? B.towerCost(t.type, t.lv + 1) : null);
        wrap('build', (slot, type) => !slot.tower && B.gold >= B.towerCost(type, 0) && B.ban !== type, (slot, type) => ['build', slot.i, type]);
        wrap('upgrade', (slot, spec) => { const t = slot.tower; if (!t || !B.ownsTower(t)) return false; const c = upCost(t, spec); return c !== null && B.gold >= c; }, (slot, spec) => ['up', slot.i, spec === undefined ? null : spec]);
        wrap('sell', slot => slot.tower && B.ownsTower(slot.tower) ? Math.round(slot.tower.spent * SELL_RATIO) : 0, slot => ['sell', slot.i]);
        wrap('setRally', (slot, x, y) => { const t = slot.tower; return !!t && t.type === 'barracks' && B.ownsTower(t) && dist(slot.x, slot.y, x, y) <= B.towerStats(t).range; }, (slot, x, y) => ['rally', slot.i, x, y]);
        wrap('castSkill', i => { const s = B.hero.skills[i]; return !!s && !s.locked && s.left <= 0 && B.hero.deadUntil <= B.t && !B.hero.dash; }, (i, x, y) => ['skill', i, x, y]);
        wrap('castSpell', id => { const sp = B.spells.find(s => s.id === id); return !!sp && sp.left <= 0; }, (id, x, y) => ['spell', id, x, y]);
        wrap('commandHeroMove', () => B.hero.deadUntil <= B.t, (x, y) => ['move', x, y]);
        wrap('callWave', () => B.state === 'prep' || B.countdown > 0, () => ['wave']);
    },
    cmd(c) {
        if (this.me === 0) this.pend.push([this.tick + 1, 0, c]);
        else this.send('c', { c });
    },

    // one fixed tick of the shared battle (canonical orientation while it runs)
    step() {
        const B = this.B;
        this.tick++;
        if (this.me === 1) B.swapActor();
        B.inSim = true;
        try {
            const due = this.pend.filter(x => x[0] <= this.tick);
            if (due.length) {
                this.pend = this.pend.filter(x => x[0] > this.tick);
                for (const [t, k, c] of due) { try { B.runCmd(k, c); } catch (e) { } if (this.me === 0) this.sent.push([this.tick, k, c]); }   // a bad command fails the same way on both
            }
            B.update(this.TICK);
            if (this.me === 1 && this.sums[this.tick] !== undefined) {
                if (this.sums[this.tick] !== B.checksum() && (!this.resyncing || Date.now() - this.resyncAt > 3000)) { this.resyncing = true; this.resyncAt = Date.now(); this.send('rs', {}); }   // ask again if the state never came
                delete this.sums[this.tick];
            }
        } finally { B.inSim = false; if (this.me === 1) B.swapActor(); }
        if (this.me === 0) {
            const done = B.state === 'win' || B.state === 'lose';
            if (this.tick % this.FRAME === 0 || done) {
                this.send('f', { to: this.tick, c: this.sent, s: B.checksum(), sp: this.speed, end: done ? B.state : undefined });
                this.sent = [];
                if (this.wantSnap) { this.wantSnap = false; this.send('snap', { at: this.tick, snap: B.snapshot() }); }
            }
        }
    },
    // main loop (js/main.js frame): real time -> ticks
    frame(dt) {
        if (!this.active) return;
        const B = this.B, now = Date.now();
        const over = B.state === 'win' || B.state === 'lose';
        // this device was asleep (app in the background): messages that queued up meanwhile come in now, not a lost partner
        if (this.lastFrameAt && now - this.lastFrameAt > 1000) this.lastHeard = now;
        this.lastFrameAt = now;
        if (this.me === 0) {
            this.acc += dt * this.speed;
            let n = 0;
            while (this.acc >= this.TICK && n < 8 && !over) { this.acc -= this.TICK; this.step(); n++; }
            if (!this.partnerGone && now - this.lastHeard > this.LOST_MS && !over) this.partnerLeft();
            // 'go' can be missed: repeat it until the guest answers (it starts late and catches up from the frames)
            if (!this.guestSeen && !over && now - this.lastGo > 1000 && this.tick < 30 * 20) { this.lastGo = now; this.send('go', { infos: this.infos, seed: this.room.seed }); }
        } else {
            this.acc = Math.min(this.acc + dt * this.speed, this.TICK * 4);
            const behind = this.availTo - this.tick;
            let n = 0, cap = behind > 24 ? 12 : 3;                  // far behind: catch up quickly
            while ((this.acc >= this.TICK || behind > 24) && this.tick < this.availTo && n < cap && !(B.state === 'win' || B.state === 'lose')) { this.acc = Math.max(0, this.acc - this.TICK); this.step(); n++; }
            if (now - (this.lastBeat || 0) > 1500) { this.lastBeat = now; this.send('hb', { t: this.tick }); }
            // the host finished and this device has run every tick it was sent: end the same way even if this copy split off
            if (this.hostEnd && this.tick >= this.availTo && !(B.state === 'win' || B.state === 'lose')) { B.state = this.hostEnd; B.on('end', this.hostEnd === 'win'); }
            if (!this.partnerGone && now - this.lastHeard > this.HOST_LOST_MS && !over) this.partnerLeft();   // ends the run: wait longer
        }
    },
    // host: the guest's hero fights on AUTO. Guest: the game ends (the host keeps the clock)
    partnerLeft() {
        if (this.partnerGone || this.ended) return;
        this.partnerGone = true;
        if (this.me === 0) {
            this.pend.push([this.tick + 1, 1, ['auto', true]]);
            toast(L('{0}의 연결이 끊겼어요. 친구 영웅은 자동으로 싸워요', this.partnerName()));
        } else {
            toast(L('방장의 연결이 끊겨 협동 디펜스가 끝났어요'));
            const B = this.B;
            if (B && B.state !== 'win' && B.state !== 'lose') { B.state = 'lose'; Game.ended = true; setTimeout(() => { if (Game.battle === B) Game.onBattleEnd(false); }, 800); }
        }
    },
    toggleSpeed() {
        if (this.me !== 0) { toast(L('속도는 방장이 정해요')); return; }
        this.speed = this.speed === 1 ? 2 : 1;
        toast(L('{0}배속', this.speed));
    },
    leave() {
        this.send('bye', {});
        this.ended = true;
        const B = this.B;
        if (B && B.state !== 'win' && B.state !== 'lose') { B.state = 'lose'; Game.ended = true; Game.onBattleEnd(false); }
    },
    finished() { this.ended = true; this.close(3000); },
};
