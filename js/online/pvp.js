'use strict';
// 냥냥 대전 networking (docs/PLAN_ONLINE_V4.md 3): server calls (server/supabase/migrations/20261042000000_pvp.sql) and the
// two-player lockstep that keeps both devices on the same match (js/battle/pvp.js).
// PvpNet is transport-free (send(ev, payload) and now() come from outside), so tools/pvp-sync-check.js runs two of them in Node
// with simulated message passing. PvpOn.open() plugs one into a Supabase Realtime broadcast channel named after the match key.
// Lockstep like 협동 디펜스 (js/online/coop.js), smaller: player 0 is the clock. Every command gets a tick from the clock and goes out
// in a frame every FRAME ticks with the clock's checksum; the other device runs only ticks it has frames for, and asks for
// the clock's state ('rs' -> 'snap') when its checksum differs or a frame went missing. 15 s without a word from the other
// side (PVP.dropMs) = that side loses; a device that slept longer than that knows it is the one that dropped.
// solo: a match against the 연습 상대 (no peer; the bot plays inside the tick).
// Messages: hi {k} · go {} · c {k, c} · f {fr, to, c, s, end} · rs {k} · snap {at, snap} · hb {k, t} · bye {k} · rejoin {k} · welcome {at, snap}
class PvpNet {
    // o = { me: 0 | 1, match: M, send(ev, payload), now() ms, onEnd(result), solo }
    constructor(o) {
        Object.assign(this, { TICK: PVP.dt, FRAME: 6, me: o.me | 0, M: o.match, sendFn: o.send || (() => { }), now: o.now || (() => Date.now()), onEnd: o.onEnd || null, solo: !!o.solo });
        this.acc = 0; this.pend = []; this.sent = []; this.sums = {}; this.availTo = 0; this.lastTo = 0; this.hostEnd = null;
        this.resyncing = false; this.resyncAt = 0; this.wantSnap = false; this.started = false;
        this.lastHeard = this.now(); this.lastBeat = 0; this.lastFrameAt = 0; this.lastHi = 0; this.ended = false; this.endSent = 0;
        this.resyncs = 0; this.lastCmd = ''; this.lastCmdAt = 0; this.early = {}; this.gapAt = 0;
    }
    get isHost() { return this.me === 0; }
    get over() { return this.M.over; }
    send(ev, p) { if (!this.solo) this.sendFn(ev, p); }
    // both say 'hi' when their channel is up; the clock starts on the other's 'hi' and answers 'go' (every 'hi' it hears, so a lost
    // 'go' is repaired by the next 'hi'); the other side starts on 'go' or on the first frame
    start() { this.lastHeard = this.now(); if (this.solo) this.started = true; else { this.lastHi = this.now(); this.send('hi', { k: this.me }); } }
    // a local command (UI or a test bot): the clock queues it for its next tick, the other device sends it to the clock
    cmd(c) {
        if (this.M.over) return;
        if (this.isHost) { this.pend.push([this.M.tick + 1, this.me, c]); return; }
        const key = JSON.stringify(c), t = this.now();
        if (key === this.lastCmd && t - this.lastCmdAt < 300) return;    // a double tap goes out once
        this.lastCmd = key; this.lastCmdAt = t;
        this.send('c', { k: this.me, c });
    }
    // leave on purpose: this side loses
    quit() {
        if (this.M.over) return;
        this.send('bye', { k: this.me });
        pvpForfeit(this.M, this.me, 'quit');
        this.finish();
    }
    finish() {
        if (this.ended || !this.M.over) return;
        this.ended = true;
        if (this.onEnd) this.onEnd(this.M.result);
    }

    onMsg(ev, m) {
        m = m || {};
        const t = this.now(), from = m.k !== undefined ? m.k : 1 - this.me;
        if (from === this.me) return;                                    // never our own echo
        this.lastHeard = t;
        if (this.rejoining && ev !== 'welcome' && ev !== 'bye') return;   // back after an app restart: only the state counts
        if (ev === 'hi') {
            if (this.isHost) { this.started = true; this.send('go', {}); }
            else if (!this.started) this.send('hi', { k: this.me });
        } else if (ev === 'go') {
            if (!this.isHost && !this.started) { this.started = true; this.send('hb', { k: this.me, t: this.M.tick }); }
        } else if (ev === 'c') {
            if (this.isHost && !this.M.over && Array.isArray(m.c)) this.pend.push([this.M.tick + 1, 1 - this.me, m.c]);
        } else if (ev === 'f' && !this.isHost) {
            if (!this.started) this.started = true;
            if (m.end) this.hostEnd = m.end;
            if (m.to <= this.lastTo) return;                             // a repeat (the final frame is sent a few times)
            if (m.fr !== this.lastTo + 1) {                               // came early (out of order) or one went missing
                this.early[m.fr] = m;
                if (!this.gapAt) this.gapAt = t;
                return;
            }
            this.take(m);
            while (this.early[this.lastTo + 1]) { const x = this.early[this.lastTo + 1]; delete this.early[x.fr]; this.take(x); }
            for (const k in this.early) if (+k <= this.lastTo) delete this.early[k];
            if (!Object.keys(this.early).length) this.gapAt = 0;
        } else if (ev === 'rs' && this.isHost) {
            this.wantSnap = true;
            if (this.M.over) this.frameOut(true);                        // no more ticks: answer now
        } else if (ev === 'snap' && !this.isHost) {
            this.load(m.at, m.snap);
        } else if (ev === 'bye') {
            if (!this.M.over) { pvpForfeit(this.M, from, 'quit'); this.finish(); }
        } else if (ev === 'rejoin') {
            // the other device restarted mid-match: give it the state; the clock keeps going, a follower restarts its frames from here
            if (this.isHost) { if (this.sent.length || this.lastTo < this.M.tick) this.frameOut(); }   // frames up to now first: the next one starts after the state
            else { this.pend = []; this.sums = {}; this.early = {}; this.gapAt = 0; this.availTo = this.lastTo = this.M.tick; }
            this.send('welcome', { at: this.M.tick, snap: pvpSnapshot(this.M) });
        } else if (ev === 'welcome' && this.rejoining) {
            this.rejoining = false;
            this.load(m.at, m.snap);
            this.started = true; this.acc = 0; this.lastHeard = t;
        }
    }
    askSnap() {
        const t = this.now();
        if (this.resyncing && t - this.resyncAt < 3000) return;
        this.resyncing = true; this.resyncAt = t; this.resyncs++;
        this.send('rs', { k: this.me });
    }
    load(at, snap) {
        pvpLoad(this.M, snap);
        this.pend = this.pend.filter(x => x[0] > at);
        for (const k in this.sums) if (+k <= at) delete this.sums[k];
        this.availTo = Math.max(this.availTo, at); this.lastTo = Math.max(this.lastTo, at); this.resyncing = false; this.early = {}; this.gapAt = 0;
        if (this.isHost) { this.sent = []; }
        if (this.M.over) this.finish();
    }
    // after an app restart: ask the other device for the match (it answers 'welcome')
    rejoin() { this.rejoining = true; this.started = false; this.lastHeard = this.rejoinAt = this.lastHi = this.now(); this.send('rejoin', { k: this.me }); }

    // one fixed tick of the match
    step() {
        const M = this.M, tick = M.tick + 1;
        const due = this.pend.filter(x => x[0] <= tick);
        if (due.length) this.pend = this.pend.filter(x => x[0] > tick);
        pvpStep(M, due.map(x => [x[1], x[2]]));
        if (this.solo) return;
        if (this.isHost) {
            for (const x of due) this.sent.push([M.tick, x[1], x[2]]);
            if (M.tick % this.FRAME === 0 || M.over) this.frameOut();
        } else if (this.sums[M.tick] !== undefined) {
            if (this.sums[M.tick] !== pvpChecksum(M)) this.askSnap();
            delete this.sums[M.tick];
        }
    }
    take(m) {
        for (const x of m.c || []) this.pend.push(x);
        this.sums[m.to] = m.s;
        this.lastTo = m.to; this.availTo = m.to;
    }
    frameOut(snapOnly) {
        const M = this.M;
        if (!snapOnly) {
            this.lastFrame = { fr: this.lastTo + 1, to: M.tick, c: this.sent, s: pvpChecksum(M), end: M.over ? M.result : undefined };
            this.send('f', this.lastFrame);
            this.lastTo = M.tick; this.sent = [];
        }
        if (this.wantSnap) { this.wantSnap = false; this.send('snap', { at: M.tick, snap: pvpSnapshot(M) }); }
    }
    // the main loop (real time in, fixed ticks out); dt in seconds
    frame(dt) {
        const t = this.now(), M = this.M;
        // this device was asleep (app in the background): longer than the drop time = this side dropped; shorter = nobody did
        if (this.lastFrameAt && t - this.lastFrameAt > 1000 && !this.solo) {
            if (t - this.lastFrameAt > PVP.dropMs && this.started && !M.over) { pvpForfeit(M, this.me, 'drop'); this.finish(); }
            this.lastHeard = t;
        }
        this.lastFrameAt = t;
        if (this.rejoining) {
            if (t - this.lastHi > 1500) { this.lastHi = t; this.send('rejoin', { k: this.me }); }
            if (t - this.rejoinAt > PVP.dropMs && !M.over) { pvpForfeit(M, this.me, 'drop'); this.finish(); }   // nobody answers: this side is the one that dropped
            return;
        }
        if (this.solo || this.isHost) {
            if (this.started && !M.over) {
                this.acc += dt;
                let n = 0;
                while (this.acc >= this.TICK && n < 8 && !M.over) { this.acc -= this.TICK; this.step(); n++; }
            }
            if (!this.solo) {
                if (!this.started && t - this.lastHi > 1000) { this.lastHi = t; this.send('hi', { k: this.me }); }
                if (M.over && this.endSent < 5 && t - this.lastBeat > 1000) { this.endSent++; this.lastBeat = t; this.send('f', this.lastFrame || { fr: this.lastTo + 1, to: this.lastTo, c: [], s: pvpChecksum(M), end: M.result }); }   // the last frame again (it may have been lost)
            }
        } else if (!this.started) {
            if (t - this.lastHi > 1000) { this.lastHi = t; this.send('hi', { k: this.me }); }
        } else {
            if (this.gapAt && t - this.gapAt > 1200) { this.gapAt = 0; this.early = {}; this.askSnap(); }   // the missing frame is not coming: ask the state
            this.acc = Math.min(this.acc + dt, this.TICK * 4);
            const behind = this.availTo - M.tick, cap = behind > 24 ? 12 : 3;
            let n = 0;
            while ((this.acc >= this.TICK || behind > 24) && M.tick < this.availTo && n < cap && !M.over) { this.acc = Math.max(0, this.acc - this.TICK); this.step(); n++; }
            // the clock ended it by a drop or a quit this copy does not see: end the same way once every sent tick has run
            if (this.hostEnd && !M.over && M.tick >= this.availTo && (this.hostEnd.why === 'drop' || this.hostEnd.why === 'quit')) pvpEnd(M, this.hostEnd.w, this.hostEnd.why);
        }
        if (!this.solo && t - this.lastBeat > 1000 && !M.over) { this.lastBeat = t; this.send('hb', { k: this.me, t: M.tick }); }
        // 15 s without a word from the other side: it dropped and loses (before the start too: it never showed up)
        if (!this.solo && !M.over && t - this.lastHeard > PVP.dropMs) pvpForfeit(M, 1 - this.me, 'drop');
        if (M.over) this.finish();
    }
    // my report for the server: the outcome with the state hashes
    report() { const r = this.M.result || {}; return { w: r.w, why: r.why, ticks: r.ticks, lives: r.lives, h: this.M.hashes.slice(-60) }; }
}

const PvpOn = {
    st: null,                       // last pvp_state()
    net: null, ch: null, match: null, view: null,
    get cfg() { return this.st && this.st.cfg; },
    async call(fn, args) { return RaidOn.call(fn, args); },
    async state() { const r = await this.call('pvp_state'); if (!r.error) this.st = r; return r; },
    // what the server takes about me: the deck (checked there) and the AUTO switch
    info() { const p = Save.p, d = pvpDeckOk(p.pvpDeck); return { deck: d, auto: !!p.set.autoHero, skin: (p.shop && p.shop.skin && p.shop.skin[d.hero]) || null }; },
    queue() { return this.call('pvp_queue', { p_info: this.info() }); },
    poll(id) { return this.call('pvp_poll', { p_id: id }); },
    cancel(id) { return this.call('pvp_cancel', { p_id: id }); },
    bot(id) { return this.call('pvp_bot', { p_id: id }); },
    friendCreate() { return this.call('pvp_friend_create', { p_info: this.info() }); },
    friendJoin(code) { return this.call('pvp_friend_join', { p_code: String(code || '').trim(), p_info: this.info() }); },
    // sent again when the connection drops (the server takes each report once)
    report(id, rep) { return RaidOn.report('pvp_report', { p_id: id, p_rep: rep }); },
    result(id) { return this.call('pvp_result', { p_id: id }); },
    title(t) { return this.call('pvp_title', { p_title: t || null }); },
    top() { return this.call('pvp_top', { p_limit: 30 }); },
    // a started match (server view v): build it and, for a person, open the channel. onEnd(result) once it is decided
    open(v, onEnd, resume) {
        this.close();
        const bot = v.kind === 'bot', infos = v.infos.map(x => x || {});
        if (bot) infos[1] = { ...infos[1], deck: pvpBotDeck(v.seed) };
        const M = this.match = pvpMatch({ seed: v.seed, decks: infos.map(x => x.deck), infos, bot: bot ? 1 : -1, botStyle: 'practice' });
        this.view = v;
        try { localStorage.setItem('nyangi-pvp', JSON.stringify({ id: v.id, me: v.me, at: Date.now() })); } catch (e) { }
        const net = this.net = new PvpNet({ me: v.me, match: M, solo: bot, onEnd, send: (ev, p) => this.send(ev, p) });
        if (!bot) {
            const ch = this.ch = Online.sb.channel('bonghwa-pvp-' + v.key, { config: { broadcast: { self: false, ack: false } } });
            for (const ev of ['hi', 'go', 'c', 'f', 'rs', 'snap', 'hb', 'bye', 'rejoin', 'welcome']) ch.on('broadcast', { event: ev }, msg => { if (this.net === net) net.onMsg(ev, msg.payload); });
            ch.subscribe(s => { if (s === 'SUBSCRIBED' && this.net === net) { if (resume) net.rejoin(); else net.start(); } });
        } else net.start();
        return M;
    },
    send(ev, payload) { if (this.ch) this.ch.send({ type: 'broadcast', event: ev, payload }).catch(() => { }); },
    close(delay) {
        const ch = this.ch;
        this.ch = null; this.net = null;
        if (ch) setTimeout(() => { try { Online.sb.removeChannel(ch); } catch (e) { } }, delay || 0);
    },
    finished() { try { localStorage.removeItem('nyangi-pvp'); } catch (e) { } this.close(6000); },
    errText(e) {
        return {
            deck: L('덱을 다시 확인해 주세요'), in_match: L('끝나지 않은 대전이 있어요'), too_early: L('조금 더 기다려 주세요'), result: L('대전 결과가 올바르지 않아요'),
            not_owned: L('가지지 않은 칭호예요'), own_room: L('내가 만든 대전이에요'), invalid: L('코드를 다시 확인해 주세요'), no_profile: L('먼저 닉네임을 정해 주세요'),
        }[e] || RaidOn.errText(e);
    },
};
