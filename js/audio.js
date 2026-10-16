'use strict';
// Synthesized sound effects (no audio files). Calls are throttled per key so 40 arrows don't clip.

const Sfx = (() => {
    let ctx = null, master = null, muted = false;
    const last = {};
    const GAP = { arrow: 0.05, magic: 0.07, boom: 0.08, hit: 0.04, coin: 0.06, die: 0.05, rare: 0.07 };

    function init() {
        if (ctx) return;
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
        } catch (e) { ctx = null; }
    }
    function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
        const t = ctx.currentTime + delay;
        freq *= 1 + (Math.random() - 0.5) * 0.12;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol = 0.3, lp = 1200, delay = 0) {
        const t = ctx.currentTime + delay;
        const n = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const s = ctx.createBufferSource(); s.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
        const g = ctx.createGain(); g.gain.value = vol;
        s.connect(f); f.connect(g); g.connect(master); s.start(t);
    }
    // like tone() but fades in first (risers, sustained chords)
    function swell(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
        const t = ctx.currentTime + delay;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
        g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    const SOUNDS = {
        click()   { tone(660, 0.05, 'square', 0.12); },
        arrow()   { noise(0.06, 0.12, 3000); },
        magic()   { tone(880, 0.12, 'sine', 0.12, 1.8); },
        zap()     { noise(0.12, 0.18, 5000); tone(1200, 0.1, 'sawtooth', 0.06, 0.5); },
        boom()    { noise(0.35, 0.45, 600); tone(90, 0.3, 'sine', 0.3, 0.5); },
        hit()     { tone(220, 0.05, 'square', 0.08, 0.6); },
        heavy()   { noise(0.15, 0.3, 900); tone(140, 0.15, 'square', 0.15, 0.5); },
        die()     { tone(300, 0.1, 'square', 0.06, 0.4); },
        coin()    { tone(1320, 0.06, 'square', 0.07); tone(1760, 0.08, 'square', 0.06, 1, 0.05); },
        build()   { noise(0.08, 0.2, 800); tone(330, 0.08, 'square', 0.1, 1, 0.06); tone(440, 0.1, 'square', 0.1, 1, 0.12); },
        upgrade() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.1, 1, i * 0.06)); },
        sell()    { tone(784, 0.08, 'square', 0.1); tone(523, 0.12, 'square', 0.1, 1, 0.07); },
        leak()    { tone(180, 0.25, 'sawtooth', 0.2, 0.5); },
        wave()    { tone(392, 0.15, 'sawtooth', 0.12); tone(523, 0.25, 'sawtooth', 0.12, 1, 0.15); },
        warn()    { tone(160, 0.4, 'sawtooth', 0.14, 1.4); },
        roar()    { noise(0.8, 0.5, 400); tone(70, 0.8, 'sawtooth', 0.25, 0.6); },
        skill()   { tone(523, 0.08, 'triangle', 0.18, 2); noise(0.1, 0.12, 2500); },
        ult()     { noise(0.6, 0.5, 700); tone(110, 0.6, 'sawtooth', 0.3, 0.4); tone(880, 0.4, 'triangle', 0.15, 0.5, 0.1); },
        drop(r)   { const base = [600, 700, 820, 980, 1100][r || 0]; tone(base, 0.12, 'triangle', 0.15); tone(base * 1.5, 0.2, 'triangle', 0.13, 1, 0.08); if (r >= 3) tone(base * 2, 0.4, 'triangle', 0.12, 1, 0.18); },
        cutin()   { noise(0.35, 0.35, 5000); tone(220, 0.35, 'sawtooth', 0.12, 3); [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'square', 0.1, 1, 0.25 + i * 0.06)); },
        win()     { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 'square', 0.12, 1, i * 0.11)); },
        lose()    { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.2)); },
        enhanceOk() { [784, 988, 1318].forEach((f, i) => tone(f, 0.18, 'square', 0.12, 1, i * 0.08)); },
        enhanceFail() { noise(0.3, 0.3, 500); tone(200, 0.3, 'sawtooth', 0.12, 0.5); },
        anvil()   { noise(0.08, 0.35, 4000); tone(1800, 0.15, 'square', 0.06, 0.8); },
        // summon: riser whose length and height hint the best grade, then grade-specific reveals
        summon(r) { const d = r >= 3 ? 1.4 : r >= 2 ? 1.05 : 0.7; swell(180, d, 'sawtooth', 0.07, r >= 3 ? 5 : 3.5); swell(360, d, 'triangle', 0.08, r >= 3 ? 5 : 3.5); noise(d, 0.12, r >= 2 ? 5000 : 2500); },
        charge(r) { swell(400, 0.7, 'triangle', 0.1, r >= 3 ? 4 : 3); noise(0.7, 0.1, 6000); },
        rare()    { tone(1318, 0.14, 'sine', 0.12); tone(1976, 0.22, 'sine', 0.1, 1, 0.06); },
        epic()    { [659, 831, 988, 1318, 1661].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, 1, i * 0.06)); noise(0.4, 0.12, 7000, 0.15); },
        fanfare(r) {
            [[523, 0], [523, 0.13], [523, 0.26], [784, 0.4]].forEach(([f, t]) => { tone(f, 0.16, 'square', 0.1, 1, t); tone(f / 2, 0.16, 'sawtooth', 0.06, 1, t); });
            const top = r >= 4 ? 1568 : 1046;
            [523, 659, 784, top].forEach(f => swell(f, 1.3, 'sawtooth', 0.05, 1, 0.58));
            [1046, 1318, 1568, 2093, top * 2].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, 1, 0.62 + i * 0.07));
            noise(0.9, 0.18, 7000, 0.58); tone(80, 0.5, 'sine', 0.3, 0.6, 0.58);
        },
        legend()  { [523, 784, 1046, 1568, 2093].forEach((f, i) => tone(f, 0.4, 'triangle', 0.14, 1, i * 0.09)); noise(0.6, 0.2, 6000, 0.3); },
    };
    function play(key, arg) {
        if (muted || !ctx || !SOUNDS[key]) return;
        const now = ctx.currentTime;
        if (GAP[key] && last[key] && now - last[key] < GAP[key]) return;
        last[key] = now;
        try { SOUNDS[key](arg); } catch (e) { /* audio is optional */ }
    }
    return {
        init, play,
        get muted() { return muted; },
        set muted(v) { muted = v; },
    };
})();

// Background music (generated with Flow Music, files in audio/). Crossfades between tracks;
// browsers only allow playback after a user gesture, so start() is called from the first tap.
const Music = (() => {
    const TRACKS = { title: 'audio/bgm_title.m4a', map: 'audio/bgm_map.m4a', battle: 'audio/bgm_battle.m4a', boss: 'audio/bgm_boss.m4a', endless: 'audio/bgm_endless.m4a' };
    const VOL = { title: 0.55, map: 0.5, battle: 0.42, boss: 0.5, endless: 0.42 };
    const els = {};
    let current = null, wanted = null, unlocked = false, volume = 0.8, enabled = true;

    function el(name) {
        if (!els[name]) {
            const a = new Audio(TRACKS[name]);
            a.loop = true; a.preload = 'auto'; a.volume = 0;
            els[name] = a;
        }
        return els[name];
    }
    function fade(a, to, ms, done) {
        const from = a.volume, t0 = performance.now();
        clearInterval(a._fade);
        a._fade = setInterval(() => {
            const k = Math.min(1, (performance.now() - t0) / ms);
            a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
            if (k >= 1) { clearInterval(a._fade); if (done) done(); }
        }, 40);
    }
    function target(name) { return enabled ? VOL[name] * volume : 0; }
    function play(name) {
        wanted = name;
        if (!unlocked || current === name) return;
        const prev = current ? el(current) : null;
        current = name;
        const a = el(name);
        if (a.paused && enabled) { a.currentTime = 0; a.play().catch(() => { }); }
        fade(a, target(name), 1200);
        if (prev && prev !== a) fade(prev, 0, 900, () => prev.pause());
    }
    return {
        play,
        start() { if (unlocked) return; unlocked = true; if (wanted) { const w = wanted; current = null; play(w); } },
        setVolume(v) { volume = v; if (current) el(current).volume = target(current); },
        setEnabled(on) {
            enabled = on;
            if (!current) return;
            const a = el(current);
            if (!on) fade(a, 0, 300, () => a.pause());
            else if (unlocked) { a.play().catch(() => { }); fade(a, target(current), 600); }
        },
        // duck under big moments (legendary drop jingle etc.)
        duck(ms = 1500) {
            if (!current) return;
            const name = current, a = el(name);
            fade(a, target(name) * 0.3, 150, () => setTimeout(() => { if (current === name) fade(a, target(name), 600); }, ms));
        },
        get current() { return current; },
    };
})();
