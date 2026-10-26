'use strict';
// 협동 디펜스 (2 players) and 파티 레이드 (1~4) networking (docs/PLAN_ONLINE_RAID.md 4). Supabase Realtime broadcast on a
// channel named after the room key (only the room's players get the key from the server).
// Lockstep with one device as the clock (the host): every device runs the same battle (same seed, fixed 1/30 s ticks).
// Every command is given a tick by the host and sent in a frame every FRAME ticks with a checksum. A guest runs only the
// ticks it has frames for and asks the host for its state when its checksum differs.
// Lobby: seats (0 = host) from the server room; at the start the present seats become battle players 0..n-1 in seat order.
// Drops: a guest that goes quiet fights on AUTO. When the host goes quiet the first player still heard takes over the clock
// ('host': everyone loads the new host's state). Two clocks after a network split: the one hearing more players keeps it
// (tie: the lower player number). A player whose app closed comes back with 'rejoin' and gets the host's state ('welcome').
// Messages: hi {seat, info} · go {order, infos, seed} · c {k, c} · f {to, c, s, sp, end, h, e, n} · rs {k} · snap {to, at, snap, h}
// · hb {k} · bye {k, seat} · sig {k, id} · host {k, e, at, snap, sp, n} · rejoin {seat} · welcome {seat, order, infos, seed, at, snap, h, e, sp}
const Coop = {
    TICK: 1 / 30, FRAME: 8, LOST_MS: 8000, HOST_LOST_MS: 6000, ALONE_MS: 45000,
    room: null, ch: null, seat: 0, me: 0, host: 0, epoch: 0, seats: [], infos: [], order: [], B: null, onLobby: null,
    tick: 0, acc: 0, pend: [], sent: [], sums: {}, availTo: 0, speed: 1, ended: false, wantSnap: [],
    heard: [], gone: [], byes: [], seen: [], lastHeard: 0, lostLink: false,
    get active() { return !!(this.B && Game.battle === this.B); },
    get raid() { return !!(this.room && this.room.mode === 'raid'); },
    get size() { return this.raid ? RAID_ON.party.size : 2; },
    get isHost() { return this.me === this.host; },

    // what the others need to build my side of the battle
    myInfo() {
        const p = Save.p; Rewards.ensure(p); metaEnsure(p);
        const b = computeBonuses(p), sg = skinBonus(p, p.hero).gold;
        if (sg) b.bountyPct += sg;
        return { name: Online.profile ? Online.profile.name : '', uid: Online.user ? Online.user.id : null, cls: p.hero, stats: heroStats(p, p.hero), skin: (p.shop.skin && p.shop.skin[p.hero]) || null,
            bonuses: b, dmgMul: codexDmgMul(p), auto: !!p.set.autoHero };
    },
    channel(room) {
        const ch = this.ch = Online.sb.channel('bonghwa-coop-' + room.key, { config: { broadcast: { self: false, ack: false } } });
        for (const ev of ['hi', 'go', 'c', 'f', 'rs', 'snap', 'hb', 'bye', 'sig', 'host', 'rejoin', 'welcome']) ch.on('broadcast', { event: ev }, msg => this.onMsg(ev, msg.payload || {}));
        return ch;
    },
    // join the room's channel; onLobby(event) is called whenever someone shows up or leaves
    open(room, onLobby) {
        this.close();
        this.room = room; this.seat = room.me; this.me = room.me; this.host = 0; this.epoch = 0; this.onLobby = onLobby;
        this.infos = new Array(this.size).fill(null); this.infos[this.seat] = this.myInfo();
        this.ended = false; this.lostLink = false; this.lastHeard = Date.now(); this.gone = []; this.byes = []; this.heard = [];
        this.channel(room).subscribe(st => { if (st === 'SUBSCRIBED') this.hello(); });
        clearInterval(this.hiTimer);
        this.hiTimer = setInterval(() => { if (!this.B) this.hello(); }, 2000);   // until the others answer (a message can be missed)
    },
    hello() { this.send('hi', { seat: this.seat, me: this.seat, info: this.infos[this.seat], room: this.room.id }); },
    send(ev, payload) { if (this.ch) this.ch.send({ type: 'broadcast', event: ev, payload }).catch(() => { }); },
    close(delay) {
        const ch = this.ch;
        clearInterval(this.hiTimer); this.hiTimer = null;
        clearInterval(this.rejoinTimer); this.rejoinTimer = null;
        this.ch = null; this.B = null; this.pend = []; this.sent = []; this.sums = {};
        if (ch) setTimeout(() => { try { Online.sb.removeChannel(ch); } catch (e) { } }, delay || 0);
    },
    // lobby: players present (seat order)
    present() { return this.infos.map((x, i) => x ? i : -1).filter(i => i >= 0); },
    // quick signal to the others (2s cooldown); returns false while cooling down
    signal(id) {
        if (!this.B || Date.now() - (this.lastSig || 0) < 2000) return false;
        this.lastSig = Date.now(); this.send('sig', { id, k: this.me });
        return true;
    },
    // battle player k: name, and whether that player dropped (their hero fights on AUTO)
    nameOf(k) { const i = this.infos[k]; return (i && i.name) || L('친구'); },
    goneOf(k) { return !!this.gone[k]; },
    partnerName() { return this.nameOf(1 - this.me); },
    get partnerGone() { return this.gone.some(Boolean); },
    // players heard from lately (this device counts itself)
    alive() { const now = Date.now(); return this.infos.map((x, k) => k === this.me || (!this.byes[k] && now - (this.heard[k] || 0) < this.LOST_MS)); },
    // the battle state as every device keeps it between ticks: player 0's view
    snapNow() { const B = this.B; B.setActor(0); const s = B.snapshot(); B.setActor(this.me); return s; },
    loadSnap(at, snap) {
        const B = this.B;
        B.setActor(0); B.applySnapshot(snap); B.setActor(this.me);
        this.tick = at; this.pend = this.pend.filter(x => x[0] > at);
        for (const k in this.sums) if (+k <= at) delete this.sums[k];
        this.availTo = Math.max(this.availTo, at); this.resyncing = false;
    },

    onMsg(ev, m) {
        const now = Date.now();
        this.lastHeard = now;
        if (this.B) {
            const k = m.k !== undefined ? m.k : m.h !== undefined ? m.h : ev === 'f' || ev === 'snap' ? 0 : ev === 'hi' || ev === 'rejoin' ? -1 : 1;
            if (k >= 0 && k !== this.me) {
                this.heard[k] = now; this.seen[k] = true;
                // a player came back after a drop (app in the background): its hero leaves AUTO-by-force
                if (this.isHost && this.gone[k] && !this.byes[k] && !this.ended && k !== this.host) { this.gone[k] = false; this.pend.push([this.tick + 1, k, ['auto', !!(this.infos[k] && this.infos[k].auto)]]); }
                else if (!this.isHost && this.gone[k] && !this.byes[k]) this.gone[k] = false;   // the "(자동)" mark next to its name goes away here too
            }
        }
        if (ev === 'hi') {
            if (this.B || m.room !== this.room.id) return;
            const s = m.seat !== undefined ? m.seat : m.me;
            if (s === this.seat || s < 0 || s >= this.size) return;
            const fresh = !this.infos[s];
            this.infos[s] = m.info;
            if (fresh) this.hello();
            if (this.onLobby) this.onLobby('partner');
        } else if (ev === 'bye') {
            if (!this.B) {
                const s = m.seat !== undefined ? m.seat : 1 - this.seat;
                if (s === 0 && this.seat !== 0) { if (this.onLobby) this.onLobby('hostleft'); return; }   // the host closed the room
                this.infos[s] = null; if (this.onLobby) this.onLobby('left'); return;
            }
            const k = m.k !== undefined ? m.k : 1 - this.me;
            this.byes[k] = true;
            this.playerLeft(k);
        } else if (ev === 'go' && this.me !== 0 && !this.B && !this.ended && !this.rejoinTimer) {
            const order = m.order || [0, 1];
            if (!order.includes(this.seat)) return;                  // started without this seat (joined too late)
            this.order = order; this.infos = m.infos; this.me = order.indexOf(this.seat);
            this.begin(m.seed);
        } else if (ev === 'c' && this.isHost && this.B) {
            this.pend.push([this.tick + 1, m.k !== undefined ? m.k : 1, m.c]);
        } else if (ev === 'sig') {
            if (this.B && typeof UI !== 'undefined' && UI.coopSignalShow) UI.coopSignalShow(this.nameOf(m.k !== undefined ? m.k : 1 - this.me), m.id, false);
        } else if (ev === 'rs' && this.isHost && this.B) {
            this.wantSnap.push(m.k !== undefined ? m.k : 1);
        } else if (ev === 'f' && this.B) {
            const h = m.h !== undefined ? m.h : 0, e = m.e || 0;
            if (h !== this.host) {
                // another device runs a clock: keep the newer one (a takeover happened), then the one hearing more players, the other follows it
                if (this.isHost ? this.beats(h, e, m.n || 1) : e > this.epoch) this.follow(h, e);
                else return;
            }
            if (this.isHost) return;
            for (const x of m.c) if (x[0] > this.tick) this.pend.push(x);
            this.sums[m.to] = m.s;
            this.availTo = Math.max(this.availTo, m.to);
            this.speed = m.sp || 1;
            if (m.end) this.hostEnd = m.end;          // 'win' | 'lose': the host's outcome is the one every screen shows
        } else if (ev === 'snap' && !this.isHost && this.B && (m.h === undefined || m.h === this.host) && (m.to === undefined || m.to.includes(this.me) || this.resyncing)) {
            this.loadSnap(m.at, m.snap);
        } else if (ev === 'host' && this.B) {
            // a player took over the clock
            if (this.isHost && m.k !== this.me && !this.beats(m.k, m.e || 0, m.n || 1)) return;
            if (!this.isHost && m.e < this.epoch) return;
            const was = this.host;
            this.host = m.k; this.epoch = Math.max(this.epoch, m.e || 0); this.speed = m.sp || 1;
            if (was !== m.k && was !== this.me) this.gone[was] = true;
            this.pend = []; this.sums = {}; this.availTo = 0; this.hostEnd = null;
            this.loadSnap(m.at, m.snap);
            toast(m.k === this.me ? L('내가 방장을 이어받았어요') : L('{0}이(가) 방장을 이어받았어요', this.nameOf(m.k)));
        } else if (ev === 'rejoin' && this.isHost && this.B && !this.ended) {
            // a player whose app closed is back: send everything it needs to rebuild the battle
            const k = this.order.indexOf(m.seat);
            if (k < 0 || k === this.me) return;
            this.gone[k] = false; this.byes[k] = false; this.heard[k] = now;
            this.pend.push([this.tick + 1, k, ['auto', !!(this.infos[k] && this.infos[k].auto)]]);
            this.send('welcome', { seat: m.seat, order: this.order, infos: this.infos, seed: this.room.seed, at: this.tick, snap: this.snapNow(), h: this.me, e: this.epoch, sp: this.speed });
            toast(L('{0}이(가) 돌아왔어요', this.nameOf(k)));
        } else if (ev === 'welcome' && this.rejoinTimer && m.seat === this.seat) {
            clearInterval(this.rejoinTimer); this.rejoinTimer = null;
            this.order = m.order; this.infos = m.infos; this.me = m.order.indexOf(this.seat);
            this.begin(m.seed, { host: m.h, epoch: m.e || 0, at: m.at, snap: m.snap, speed: m.sp || 1 });
            if (this.onRejoin) this.onRejoin(true);
        }
    },
    // two clocks: does player h (takeover count e, hearing n players) win over this device's clock? A newer takeover wins
    // (this device was away while the others moved on), then more players heard, then the lower number
    beats(h, e, n) { if (e !== this.epoch) return e > this.epoch; const mine = this.alive().filter(Boolean).length; return n > mine || (n === mine && h < this.me); },
    // stop being the clock (or follow a newer one) and ask its state
    follow(h, e) {
        this.host = h; this.epoch = Math.max(this.epoch, e);
        this.pend = []; this.sums = {}; this.sent = []; this.availTo = this.tick; this.hostEnd = null;
        this.resyncing = true; this.resyncAt = Date.now();
        this.send('rs', { k: this.me });
    },

    // host: start with everyone present (a 파티 레이드 host may also start alone). Guests start on 'go'
    async hostStart() {
        const order = this.present();
        if (this.me !== 0 || (!this.raid && order.length < 2)) return false;
        const r = this.raid ? await RaidOn.praidSet(this.room.id, 'start') : await RaidOn.coopSet(this.room.id, 'start');
        if (r.error) { toast(RaidOn.errText(r.error, r)); return false; }
        const seats = r.seats ? r.seats.map(x => x.seat) : null;    // the server's list: someone who left in the meantime is not in
        this.order = seats ? order.filter(s => seats.includes(s)) : order;
        this.infos = this.order.map(s => this.infos[s]);
        this.send('go', { order: this.order, infos: this.infos, seed: this.room.seed });
        this.begin(this.room.seed);
        return true;
    },
    // resume: a rejoining player starts from the host's state (at, snap), with that host's clock
    begin(seed, resume) {
        clearInterval(this.hiTimer); this.hiTimer = null;
        this.tick = 0; this.acc = 0; this.pend = []; this.sent = []; this.sums = {}; this.availTo = 0; this.speed = 1;
        this.lastHeard = Date.now(); this.lastBeat = 0; this.hostEnd = null; this.resyncing = false; this.resyncAt = 0; this.wantSnap = [];
        this.host = resume ? resume.host : 0; this.epoch = resume ? resume.epoch : 0; this.ended = false; this.lostLink = false; this.aloneSince = 0;
        const now = Date.now();
        this.gone = this.infos.map(() => false); this.byes = this.infos.map(() => false); this.heard = this.infos.map(() => now);
        this.seen = this.infos.map((x, k) => k === this.me); this.lastGo = now; this.lastFrameAt = 0;
        if (this.onLobby) this.onLobby('start');
        const r = this.room;
        try { localStorage.setItem('nyangi-live', JSON.stringify({ id: r.id, raid: this.raid, at: Date.now() })); } catch (e) { }
        Game.startBattle({ coop: { room: r.id, diff: r.diff, seed, infos: this.infos, me: this.me, week: weekIndex(), raid: this.raid, kind: r.boss || null } });
        if (resume) { this.speed = resume.speed; this.loadSnap(resume.at, resume.snap); }
    },
    attach(B) {
        this.B = B;
        if (this.me !== 0) B.setActor(this.me);      // a resting view of this device's own hero, gold and spells
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
        if (this.isHost) { this.pend.push([this.tick + 1, this.me, c]); return; }
        // the same command again before the host has run it (double tap): send it once (the project's message budget is shared)
        const key = JSON.stringify(c), now = Date.now();
        if (key === this.lastCmd && now - this.lastCmdAt < 400) return;
        this.lastCmd = key; this.lastCmdAt = now;
        this.send('c', { k: this.me, c });
    },

    // one fixed tick of the shared battle (canonical view, player 0, while it runs)
    step() {
        const B = this.B, host = this.isHost;
        this.tick++;
        B.setActor(0);
        B.inSim = true;
        try {
            const due = this.pend.filter(x => x[0] <= this.tick);
            if (due.length) {
                this.pend = this.pend.filter(x => x[0] > this.tick);
                for (const [t, k, c] of due) { try { B.runCmd(k, c); } catch (e) { } if (host) this.sent.push([this.tick, k, c]); }   // a bad command fails the same way everywhere
            }
            B.update(this.TICK);
            if (!host && this.sums[this.tick] !== undefined) {
                if (this.sums[this.tick] !== B.checksum() && (!this.resyncing || Date.now() - this.resyncAt > 3000)) { this.resyncing = true; this.resyncAt = Date.now(); this.send('rs', { k: this.me }); }   // ask again if the state never came
                delete this.sums[this.tick];
            }
        } finally { B.inSim = false; B.setActor(this.me); }
        if (host) {
            const done = B.state === 'win' || B.state === 'lose';
            if (this.tick % this.FRAME === 0 || done) {
                this.send('f', { to: this.tick, c: this.sent, s: B.checksum(), sp: this.speed, end: done ? B.state : undefined, h: this.me, e: this.epoch, n: this.alive().filter(Boolean).length });
                this.sent = [];
                if (this.wantSnap.length) { this.send('snap', { to: this.wantSnap, at: this.tick, snap: this.snapNow(), h: this.me }); this.wantSnap = []; }
            }
        }
    },
    // main loop (js/main.js frame): real time -> ticks
    frame(dt) {
        if (!this.active) return;
        const B = this.B, now = Date.now();
        const over = B.state === 'win' || B.state === 'lose';
        // this device was asleep (app in the background): messages that queued up meanwhile come in now, not a lost partner
        if (this.lastFrameAt && now - this.lastFrameAt > 1000) { this.lastHeard = now; this.heard = this.heard.map(() => now); }
        this.lastFrameAt = now;
        if (this.isHost) {
            this.acc += dt * this.speed;
            let n = 0;
            while (this.acc >= this.TICK && n < 8 && !over) { this.acc -= this.TICK; this.step(); n++; }
            if (!over) for (let k = 0; k < this.infos.length; k++) if (k !== this.me && !this.gone[k] && now - (this.heard[k] || 0) > this.LOST_MS) this.playerLeft(k);
            // 'go' can be missed: repeat it until every guest answered (a late one catches up from the frames)
            if (this.me === 0 && this.epoch === 0 && !over && now - this.lastGo > 1000 && this.tick < 30 * 20 && this.seen.some(x => !x)) { this.lastGo = now; this.send('go', { order: this.order, infos: this.infos, seed: this.room.seed }); }
            if (now - (this.lastBeat || 0) > 1500) { this.lastBeat = now; this.send('hb', { k: this.me, t: this.tick }); }
        } else {
            this.acc = Math.min(this.acc + dt * this.speed, this.TICK * 4);
            const behind = this.availTo - this.tick;
            let n = 0, cap = behind > 24 ? 12 : 3;                  // far behind: catch up quickly
            while ((this.acc >= this.TICK || behind > 24) && this.tick < this.availTo && n < cap && !(B.state === 'win' || B.state === 'lose')) { this.acc = Math.max(0, this.acc - this.TICK); this.step(); n++; }
            if (now - (this.lastBeat || 0) > 1500) { this.lastBeat = now; this.send('hb', { k: this.me, t: this.tick }); }
            // the host finished and this device has run every tick it was sent: end the same way even if this copy split off
            if (this.hostEnd && this.tick >= this.availTo && !(B.state === 'win' || B.state === 'lose')) { B.state = this.hostEnd; B.on('end', this.hostEnd === 'win'); }
            if (!over && now - (this.heard[this.host] || 0) > this.HOST_LOST_MS) this.hostLost(now);
        }
    },
    // the host went quiet: the first player still heard takes over. Hearing nobody at all in a party of 3+ means this
    // device is the one offline: wait (and give up after ALONE_MS)
    hostLost(now) {
        const live = this.alive(), others = live.filter((x, k) => x && k !== this.me && k !== this.host).length;
        if (!others && this.infos.length > 2) {
            if (!this.aloneSince) { this.aloneSince = now; toast(L('연결이 끊겼어요. 다시 연결하는 중…')); }
            if (now - this.aloneSince > this.ALONE_MS) this.linkLost();
            return;
        }
        this.aloneSince = 0;
        const next = live.findIndex((x, k) => x && k !== this.host);
        if (next !== this.me) { if (!this.gone[this.host]) { this.gone[this.host] = true; } return; }   // the next player takes over
        this.takeOver();
    },
    takeOver() {
        const old = this.host;
        this.gone[old] = true;
        this.host = this.me; this.epoch++; this.acc = 0; this.sent = []; this.hostEnd = null; this.resyncing = false;
        this.availTo = this.tick;
        this.pend.push([this.tick + 1, old, ['auto', true]]);
        this.send('host', { k: this.me, e: this.epoch, at: this.tick, snap: this.snapNow(), sp: this.speed, n: this.alive().filter(Boolean).length });
        toast(L('{0}의 연결이 끊겨 내가 방장을 이어받았어요', this.nameOf(old)));
    },
    // this device lost the connection for good: the run ends here, nothing is reported (the party's result counts for it)
    linkLost() {
        const B = this.B;
        this.lostLink = true;
        toast(this.raid ? L('연결이 끊겨 레이드에서 나왔어요. 파티가 이기면 보상은 받을 수 있어요') : L('연결이 끊겨 협동 디펜스에서 나왔어요'));
        if (B && B.state !== 'win' && B.state !== 'lose') { B.state = 'lose'; Game.ended = true; setTimeout(() => { if (Game.battle === B) Game.onBattleEnd(false); }, 800); }
    },
    // the clock: a quiet player's hero fights on AUTO
    playerLeft(k) {
        if (this.gone[k] || this.ended) return;
        this.gone[k] = true;
        if (this.isHost) {
            this.pend.push([this.tick + 1, k, ['auto', true]]);
            toast(L('{0}의 연결이 끊겼어요. 친구 영웅은 자동으로 싸워요', this.nameOf(k)));
        }
    },
    // a player whose app closed during a run: ask the clock for the battle (onDone(true) when it came, false after ~20 s)
    rejoin(room, onDone) {
        this.close();
        this.room = room; this.seat = room.me; this.ended = false; this.lostLink = false; this.onLobby = null; this.onRejoin = onDone;
        this.infos = []; this.gone = []; this.byes = []; this.heard = [];
        let tries = 0;
        this.channel(room).subscribe(st => { if (st === 'SUBSCRIBED') this.send('rejoin', { seat: this.seat }); });
        this.rejoinTimer = setInterval(() => {
            if (++tries > 13) { clearInterval(this.rejoinTimer); this.rejoinTimer = null; this.close(); if (onDone) onDone(false); return; }
            this.send('rejoin', { seat: this.seat });
        }, 1500);
    },
    toggleSpeed() {
        if (!this.isHost) { toast(L('속도는 방장이 정해요')); return; }
        this.speed = this.speed === 1 ? 2 : 1;
        toast(L('{0}배속', this.speed));
    },
    leave() {
        this.send('bye', { k: this.me, seat: this.seat });
        this.ended = true;
        const B = this.B;
        if (B && B.state !== 'win' && B.state !== 'lose') { B.state = 'lose'; Game.ended = true; Game.onBattleEnd(false); }
    },
    finished() { this.ended = true; try { localStorage.removeItem('nyangi-live'); } catch (e) { } this.close(3000); },
};
